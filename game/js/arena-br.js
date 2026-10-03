/**
 * NEXARA — ARENA PRINCIPAL (Battle Royale PvE: 1 herói contra o mapa; SEM jogadores falsos).
 *
 * Corrida = cópia do personagem permanente (como o Campo). Tudo que é ganho (XP, MCB, itens da BOLSA,
 * equipamento) vai ao save NA HORA (main.syncCampoProgress aceita brMode). Morrer nunca apaga nada:
 * mostra o resumo DERROTADO. EXTRAÇÃO encerra com bônus de MCB.
 *
 * Este módulo: estado da corrida, diretor de spawn (anel ao redor do herói, por região/risco, teto por preset,
 * some quem fica longe e fora de combate), guardiões de POI, mutante (troca de comportamento), baús/caixas,
 * drops no chão (ímã + coleta), zona segura com aviso antes de qualquer dano, eventos (CAÇADA / DROP ESPECIAL),
 * extração, território do dragão (aviso; enfrentar é escolha) e o resumo final.
 */
import { createArenaState } from './arena.js?v=20261003arena';
import { pushLog } from './state.js?v=20261003arena';
import { buildBrZone, BR_ZONE_ID, brRegionAt } from './br-map.js?v=20261003arena';
import { resetMonsterRuntime, getAiView, AI_STATES } from './enemy-ai.js?v=20261003arena';
import { rollLootFor } from './br-items.js?v=20261003arena';

export { BR_ZONE_ID };
const UID_BASE = 15000;
let zoneCache = null;
function brZone(cfg) {
  const key = `${cfg.zona.seed}|${cfg.zona.width}|${cfg.zona.height}`;
  if (!zoneCache || zoneCache.key !== key) zoneCache = { key, zone: buildBrZone(cfg) };
  // cópia rasa: o mapa (imutável) é compartilhado; flags da zona por corrida
  return { ...zoneCache.zone, closed: {} };
}

export function brEnabled(data) { return !!data?.arena_br?.enabled; }

/** Estado da corrida a partir do permanente. */
export function createBrState(data, { from = null, boss = null } = {}) {
  const cfg = data.arena_br;
  const st = createArenaState(data, { name: 'Testador', raceId: 'humano', from, boss: null });
  const zone = brZone(cfg);
  st._data = { ...st._data, zones: { ...st._data.zones, zones: [...st._data.zones.zones.filter((z) => z.id !== BR_ZONE_ID), zone] } };
  st.zoneId = BR_ZONE_ID;
  st.brMode = true;
  st.flags.br = true;
  st.player.x = cfg.spawnHeroi.x;
  st.player.y = cfg.spawnHeroi.y;
  st.monstersAlive = [];
  const bossDef = boss && data.monsters.monsters.find((m) => m.id === boss.monsterId);
  if (bossDef) {
    const d = cfg.dragao;
    st.monstersAlive.push({
      uid: boss.uid, id: bossDef.id, zone: BR_ZONE_ID, x: d.x, y: d.y, homeX: d.x, homeY: d.y,
      hp: bossDef.hp, hpMax: bossDef.hp, alive: true, boss: true, arenaLabel: 'GIGANTE VERDE',
      territoryMinX: d.territorio.x0, territoryMaxY: d.territorio.y1 + 8
    });
  }
  if (from?.passives?.pending > 0) st.passives.pending = from.passives.pending;
  st.log = [];
  pushLog(st, 'ARENA PRINCIPAL — explore, lute, junte loot. Zona segura fecha com aviso. EXTRAÇÃO garante bônus.', 'sys');
  return st;
}

/**
 * @param {{ getData:()=>object, getPos:()=>{x:number,y:number}, presetName:()=>string, onEvent:(kind:string, info:object)=>void,
 *   onPickup:(drop:object)=>boolean, credit:(n:number, why:string)=>void, damageHero:(n:number, why:string)=>void, armBoss:()=>void, now?:()=>number }} deps
 */
export function createArenaBr(deps) {
  let st = null;
  let br = null;
  const cfg = () => deps.getData().arena_br;
  const map = () => st?._data.zones.zones.find((z) => z.id === BR_ZONE_ID)?.brMap || null;
  const R = () => br.rng();
  const stats = { spawned: 0, despawned: 0, maxAlive: 0, ticks: 0, opened: 0, picked: 0, zoneDamage: 0, events: [] };

  function rng32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function note(kind, info = {}) { const e = { kind, at: Math.round(br?.clock || 0), ...info }; stats.events.push(e); if (stats.events.length > 60) stats.events.shift(); deps.onEvent?.(kind, info); }

  function start(state) {
    st = state;
    const c = cfg();
    br = st.br = {
      clock: 0, startedAt: Date.now(), kills: 0, killsBy: {}, mcbRun: 0, mcbStart: st.player.mcb || 0, itemsFound: [], best: null,
      lootOpened: [], lootOpenedDirty: [], drops: [], dropSeq: 1, region: null, visited: [],
      zone: { phase: 'wait', stage: -1, r: 80, fromR: 80, toR: 80, cx: c.zonaSegura.centro.x + 0.5, cy: c.zonaSegura.centro.y + 0.5, phaseAt: 0, warned: false, outside: false },
      event: null, nextEventAt: c.eventos?.primeiroMs ?? 60000, eventSeq: 0,
      extractionOpen: false, extract: { id: null, ms: 0 }, ended: null, dragonWarned: false, inDragon: false, bossEngaged: false, bossKilled: false,
      nextUid: UID_BASE, nextSpawnAt: 1500, secretFound: false, lastMutateAt: 0
    };
    br.rng = rng32((Date.now() & 0x7fffffff) ^ 0x5bd1e995);
    spawnGuardians();
    note('run_start', {});
  }
  function stop() { st = null; br = null; }
  const isActive = () => !!(st && br && !br.ended);

  /* ── monstros ── */
  function applyType(m, mdef, extra = {}) {
    const b = mdef.br || {};
    m.arch = mdef.arquetipo || null;
    m.tier = mdef.tier || 'comum';
    m.aggroR = b.aggroR; m.leash = b.leash; m.loseR = b.loseR;
    m.sizeMult = b.sizeMult || 1;
    m.brType = mdef.id;
    m.elite = !!b.elite;
    m.guard = !!extra.guard;
    m.hunted = !!extra.hunted;
    m.arenaLabel = extra.hunted ? `ALVO DA CAÇADA · ${mdef.name}` : b.elite ? `ELITE · ${mdef.name}` : mdef.name;
  }
  function spawnAt(monId, x, y, extra = {}) {
    const mdef = st._monsters[monId]; if (!mdef) return null;
    let m = st.monstersAlive.find((q) => q.br && !q.boss && !q.alive && q.id === monId);
    if (!m) { m = { uid: br.nextUid++, id: monId, zone: BR_ZONE_ID, br: true }; st.monstersAlive.push(m); }
    resetMonsterRuntime(m);
    m.x = x; m.y = y; m.homeX = x; m.homeY = y;
    m.hp = m.hpMax = Math.round(mdef.hp * (extra.hpMult || 1));
    m.alive = true; m.alerted = false; m._wasAlive = true;
    m.region = brRegionAt(map(), cfg(), x, y)?.id || null;
    applyType(m, mdef, extra);
    stats.spawned++;
    return m;
  }
  function aliveCount() { let n = 0; for (const m of st.monstersAlive) if (m.br && m.alive && !m.guard) n++; return n; }
  function maxAlive() { const t = cfg().diretor.maxVivos; const p = deps.presetName?.() || 'medium'; return t[p] ?? t.medium ?? 16; }

  /** Guardiões fixos nos POIs (coleira curta) — contam fora do teto do diretor; LOD os congela longe. */
  function spawnGuardians() {
    const m = map(); if (!m) return;
    for (const id of ['poi_br_torre', 'poi_br_complexo', 'poi_br_caverna', 'poi_br_elite']) {
      const p = m.pois.find((q) => q.id === id); if (!p) continue;
      const pt = nearestFree(p.x + 2, p.y + 1); if (!pt) continue;
      spawnAt('mon_br_guardiao', pt.x, pt.y, { guard: true });
    }
  }
  function walk(x, y) { const m = map(); return x >= 0 && y >= 0 && x < m.W && y < m.H && m.reachable[x + y * m.W] === 1; }
  function nearestFree(x, y) { for (let r = 0; r < 5; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (walk(x + dx, y + dy)) return { x: x + dx, y: y + dy }; return null; }

  function pickType(region) {
    const w = region?.monstros || { mon_br_rastreador: 1 };
    const ent = Object.entries(w); const tot = ent.reduce((a, [, v]) => a + v, 0); let x = R() * tot;
    for (const [k, v] of ent) { x -= v; if (x <= 0) return k; } return ent[0][0];
  }
  function director(p) {
    const c = cfg(); const D = c.diretor; const m = map();
    // some quem ficou longe e fora de combate (libera o teto para perto do herói)
    for (const mon of st.monstersAlive) {
      if (!mon.br || !mon.alive || mon.guard || mon.hunted) continue;
      const d = Math.hypot(mon.x - p.x, mon.y - p.y);
      if (d < D.despawnDist) continue;
      const v = getAiView(mon); const s = v?.state;
      if (s === AI_STATES.CHASE || s === AI_STATES.ATTACK || s === AI_STATES.ATTACK_PREPARE) continue;
      mon.alive = false; mon.hp = 0; resetMonsterRuntime(mon); stats.despawned++;
    }
    if (br.clock < br.nextSpawnAt) return;
    br.nextSpawnAt = br.clock + D.intervaloMs;
    const cap = maxAlive();
    if (aliveCount() >= cap) return;
    // ponto do anel (densidade da região), sem repetir posição ocupada
    const used = new Set(st.monstersAlive.filter((q) => q.alive).map((q) => q.y * 1000 + q.x));
    const cands = m.spawnPoints.filter((q) => { const d = Math.hypot(q.x - p.x, q.y - p.y); return d >= D.anelMin && d <= D.anelMax && !used.has(q.y * 1000 + q.x); });
    if (!cands.length) return;
    const q = cands[Math.floor(R() * cands.length)];
    const region = c.regioes.find((r) => r.id === q.region);
    if (R() > (region?.densidade ?? 0.6)) return; // espaço vazio proposital
    const type = pickType(region);
    const isGroup = !!st._monsters[type]?.br?.grupo;
    const n = isGroup ? D.gruposEnxame[0] + Math.floor(R() * (D.gruposEnxame[1] - D.gruposEnxame[0] + 1)) : 1;
    for (let i = 0; i < n && aliveCount() < cap + (isGroup ? 3 : 0); i++) {
      const pt = i === 0 ? q : nearestFree(q.x + (i % 2 ? 1 : -1), q.y + (i > 1 ? 1 : 0));
      if (pt) spawnAt(type, pt.x, pt.y);
    }
    stats.maxAlive = Math.max(stats.maxAlive, aliveCount());
  }
  /** Mutante: alterna o arquétipo (controle ↔ corpo a corpo) fora do golpe. */
  function mutate() {
    if (br.clock - br.lastMutateAt < 6500) return;
    br.lastMutateAt = br.clock;
    for (const mon of st.monstersAlive) {
      if (!mon.alive || mon.brType !== 'mon_br_mutante') continue;
      const v = getAiView(mon); if (!v || v.state === AI_STATES.ATTACK || v.state === AI_STATES.ATTACK_PREPARE) continue;
      const opts = st._monsters[mon.id]?.br?.muta || ['E', 'A'];
      const next = opts[(opts.indexOf(mon.arch) + 1) % opts.length];
      mon.arch = next; v.arch = next; mon.mutated = (mon.mutated || 0) + 1;
    }
  }

  /* ── loot ── */
  function spawnDrops(x, y, loots, src) {
    for (let i = 0; i < loots.length; i++) {
      const a = (i / Math.max(1, loots.length)) * Math.PI * 2 + R();
      const rr = 0.55 + R() * 0.35;
      br.drops.push({ id: br.dropSeq++, x: x + 0.5 + Math.cos(a) * rr, y: y + 0.5 + Math.sin(a) * rr, loot: loots[i], src, at: br.clock, rar: loots[i].kind === 'equip' ? loots[i].r : 'material' });
    }
    if (br.drops.length > 60) br.drops.splice(0, br.drops.length - 60);
  }
  function openLoot(spot) {
    if (br.lootOpened.includes(spot.id)) return;
    br.lootOpened.push(spot.id); br.lootOpenedDirty.push(spot.id); stats.opened++;
    const chest = spot.kind === 'bau';
    const big = spot.loot === 'alto' || spot.loot === 'lendario';
    const loots = rollLootFor(st, spot.loot, { equip: chest ? (big ? 2 : 1) : (R() < 0.4 ? 1 : 0), mats: chest ? [1, 2] : [1, 2], rnd: R });
    spawnDrops(spot.x, spot.y, loots, spot.id);
    if (spot.secret && !br.secretFound && spot.id === 'bau_secreto') { br.secretFound = true; note('secret', { id: spot.id }); }
    note('loot_open', { id: spot.id, kind: spot.kind, loot: spot.loot, n: loots.length, secret: !!spot.secret });
  }
  function updateLoot(p, dtMs) {
    const m = map();
    // baú abre ao ficar ao lado (0,45 s) — feedback de "abrindo" no HUD
    let near = null; let nd = 9;
    for (const s of [...m.chests, ...m.crates]) {
      if (br.lootOpened.includes(s.id)) continue;
      const d = Math.hypot(s.x + 0.5 - p.x, s.y + 0.5 - p.y);
      if (d < 1.25 && d < nd) { near = s; nd = d; }
    }
    if (near) {
      if (br.opening?.id !== near.id) br.opening = { id: near.id, ms: 0 };
      br.opening.ms += dtMs;
      if (br.opening.ms >= 450) { openLoot(near); br.opening = null; }
    } else br.opening = null;
    // drops: ímã (≤ 2,2 tiles) e coleta (≤ 0,6) — bolsa cheia: o item fica no chão
    for (let i = br.drops.length - 1; i >= 0; i--) {
      const d = br.drops[i];
      if (br.clock - d.at < 350) continue; // pulo do baú
      const dx = p.x - d.x, dy = p.y - d.y; const dist = Math.hypot(dx, dy);
      if (dist < 2.2 && !d.refused) { const k = Math.min(1, dtMs / 1000 * 7); d.x += dx * k; d.y += dy * k; }
      if (dist < 0.6 && !d.refused) {
        const ok = deps.onPickup?.(d);
        if (ok) { br.drops.splice(i, 1); stats.picked++; }
        else { d.refused = true; d.refusedAt = br.clock; }
      }
      if (d.refused && dist > 1.6) d.refused = false;
    }
  }
  /** Registro do resumo: itens encontrados e melhor equipamento (por raridade). */
  function recordItem(def) {
    if (!br || !def) return;
    br.itemsFound.push({ id: def.id, name: def.name, rar: def.rarity || 'comum' });
    const order = ['material', 'comum', 'incomum', 'raro', 'epico', 'lendario'];
    if (def.brItem && (!br.best || order.indexOf(def.rarity) > order.indexOf(br.best.rar))) br.best = { id: def.id, name: def.name, rar: def.rarity };
  }

  /* ── zona segura ── */
  function updateZone(p, dtMs) {
    const c = cfg().zonaSegura; const z = br.zone; if (!c?.ativa) return;
    const stages = c.estagios;
    if (z.phase === 'wait' && br.clock >= c.inicioMs - c.avisoMs) {
      z.phase = 'warn'; z.stage = 0; z.phaseAt = br.clock; z.toR = stages[0].raio; z.warned = true;
      note('zone_warn', { stage: 1, inMs: c.avisoMs, r: z.toR });
    } else if (z.phase === 'warn' && br.clock - z.phaseAt >= c.avisoMs) {
      z.phase = 'shrink'; z.phaseAt = br.clock; z.fromR = z.r;
      note('zone_shrink', { stage: z.stage + 1, r: z.toR });
    } else if (z.phase === 'shrink') {
      const s = stages[z.stage]; const k = Math.min(1, (br.clock - z.phaseAt) / s.duracaoMs);
      z.r = z.fromR + (z.toR - z.fromR) * k;
      if (k >= 1) {
        if (z.stage + 1 < stages.length) { z.stage++; z.phase = 'warn'; z.phaseAt = br.clock; z.toR = stages[z.stage].raio; note('zone_warn', { stage: z.stage + 1, inMs: c.avisoMs, r: z.toR }); }
        else { z.phase = 'final'; note('zone_final', { r: z.r }); }
      }
    }
    const d = Math.hypot(p.x - z.cx, p.y - z.cy);
    const outside = d > z.r;
    if (outside !== z.outside) { z.outside = outside; if (outside && z.warned) note('zone_outside', {}); }
    // dano SÓ depois do primeiro aviso, e só fora do círculo
    if (outside && z.warned && z.phase !== 'wait' && (z.phase !== 'warn' || z.stage > 0)) {
      z.acc = (z.acc || 0) + dtMs;
      if (z.acc >= 1000) { z.acc -= 1000; stats.zoneDamage += c.danoPorSeg; deps.damageHero?.(c.danoPorSeg, 'zona'); }
    } else z.acc = 0;
  }

  /* ── eventos ── */
  function updateEvents(p) {
    const E = cfg().eventos; if (!E) return;
    const ev = br.event;
    if (ev && br.clock >= ev.until) {
      if (ev.kind === 'cacada') { const t = st.monstersAlive.find((m) => m.uid === ev.uid); if (t?.alive) { t.hunted = false; t.arenaLabel = st._monsters[t.id]?.name; } }
      if (ev.kind === 'drop') br.drops = br.drops.filter((d) => d.src !== `evt_${ev.n}` || d.taken);
      note('event_end', { kind: ev.kind, ok: !!ev.done });
      br.event = null;
    }
    if (br.event || br.clock < br.nextEventAt) return;
    br.nextEventAt = br.clock + E.intervaloMs;
    const kinds = Object.entries(E.tipos).filter(([, t]) => t.ativo).map(([k]) => k);
    if (!kinds.length) return;
    const kind = kinds[br.eventSeq++ % kinds.length];
    const m = map();
    const pts = m.spawnPoints.filter((q) => { const d = Math.hypot(q.x - p.x, q.y - p.y); return d >= 12 && d <= 26 && q.region !== 'dragao'; });
    const q = pts[Math.floor(R() * pts.length)];
    if (!q) return;
    const T = E.tipos[kind];
    if (kind === 'cacada') {
      const mon = spawnAt('mon_br_elite', q.x, q.y, { hunted: true });
      if (!mon) return;
      br.event = { kind, n: br.eventSeq, uid: mon.uid, x: q.x, y: q.y, until: br.clock + T.duracaoMs, bonus: T.bonusMcb, nome: T.nome };
    } else if (kind === 'drop') {
      const loots = rollLootFor(st, T.loot || 'alto', { equip: 2, mats: [2, 3], rnd: R });
      spawnDrops(q.x, q.y, loots, `evt_${br.eventSeq}`);
      br.event = { kind, n: br.eventSeq, x: q.x, y: q.y, until: br.clock + T.duracaoMs, nome: T.nome };
    }
    note('event_start', { kind, nome: T.nome, x: q.x, y: q.y, region: q.region, ms: T.duracaoMs });
  }

  /* ── extração / dragão / região ── */
  function updateExtraction(p, dtMs) {
    const X = cfg().extracao;
    if (!br.extractionOpen && br.clock >= X.liberaAposMs) { br.extractionOpen = true; note('extract_open', {}); }
    if (!br.extractionOpen) return;
    const pt = X.pontos.find((q) => Math.hypot(q.x + 0.5 - p.x, q.y + 0.5 - p.y) < 1.7);
    if (!pt) { if (br.extract.ms > 0) note('extract_cancel', {}); br.extract = { id: null, ms: 0 }; return; }
    if (br.extract.id !== pt.id) br.extract = { id: pt.id, ms: 0 };
    br.extract.ms += dtMs;
    if (br.extract.ms >= X.segundos * 1000) finish('extraido', { point: pt.id });
  }
  function updateRegion(p) {
    const reg = brRegionAt(map(), cfg(), p.x, p.y);
    if (reg && reg.id !== br.region) {
      br.region = reg.id;
      const first = !br.visited.includes(reg.id); if (first) br.visited.push(reg.id);
      note('region', { id: reg.id, nome: reg.nome, risco: reg.risco, first });
    }
    const t = cfg().dragao.territorio;
    const inD = p.x >= t.x0 - 6 && p.y <= t.y1 + 11 && p.x >= 67;
    if (inD && !br.inDragon) { br.inDragon = true; note('dragon_territory', { first: !br.dragonWarned }); br.dragonWarned = true; if (!br.bossArmed) { br.bossArmed = true; deps.armBoss?.(); } }
    else if (!inD && br.inDragon) { br.inDragon = false; note('dragon_leave', {}); }
  }

  function update(dtMs, p) {
    if (!isActive()) return;
    br.clock += dtMs; stats.ticks++;
    director(p);
    mutate();
    updateLoot(p, dtMs);
    updateZone(p, dtMs);
    updateEvents(p);
    updateExtraction(p, dtMs);
    updateRegion(p);
  }

  /** actions.setMonsterKillHook (BR): contagem, drop por tier, alvo da caçada. */
  function onKill(mon, def) {
    if (!isActive() || !mon) return;
    br.kills++; br.killsBy[mon.id] = (br.killsBy[mon.id] || 0) + 1;
    if (mon.boss) return;
    const reg = brRegionAt(map(), cfg(), mon.x, mon.y);
    const tier = mon.elite || mon.hunted ? 'elite' : (def?.tier || 'comum');
    const ch = cfg().dropMonstro?.[tier] ?? 0.1;
    if (R() < ch) spawnDrops(mon.x, mon.y, rollLootFor(st, mon.elite || mon.hunted ? 'alto' : reg?.loot || 'basico', { equip: mon.elite || mon.hunted ? 1 : (R() < 0.5 ? 1 : 0), mats: [0, 1], rnd: R }), `mon_${mon.uid}`);
    if (br.event?.kind === 'cacada' && br.event.uid === mon.uid && !br.event.done) {
      br.event.done = true; br.event.until = br.clock + 1500;
      deps.credit?.(br.event.bonus || 0, 'cacada');
      note('hunt_done', { bonus: br.event.bonus || 0 });
    }
  }
  function onBossKilled() { if (br) { br.bossKilled = true; note('boss_down', {}); } }
  function addMcb(n) { if (br) br.mcbRun += n; }

  /** Morte → DERROTADO (nada permanente perdido; o save já tem tudo). */
  function onPlayerDeath(state) {
    if (!br || state !== st) return false;
    state.player.hp = 1;
    if (!br.ended) finish('derrotado', {});
    return true;
  }
  function finish(kind, info) {
    if (br.ended) return;
    let bonus = 0;
    if (kind === 'extraido') { bonus = Math.floor(Math.max(0, br.mcbRun) * (cfg().extracao.bonusMcbFrac || 0)); if (bonus > 0) deps.credit?.(bonus, 'extracao'); }
    br.ended = { kind, at: br.clock, bonus, ...info };
    note(kind === 'extraido' ? 'extracted' : 'defeated', { ...summary() });
  }
  function summary() {
    if (!br) return null;
    return {
      kind: br.ended?.kind || null, timeMs: Math.round(br.clock), kills: br.kills, killsBy: { ...br.killsBy }, mcb: br.mcbRun, bonus: br.ended?.bonus || 0,
      items: br.itemsFound.length, itemsList: br.itemsFound.slice(-12), best: br.best, regions: br.visited.slice(), boss: br.bossKilled, secret: br.secretFound
    };
  }
  function view() {
    if (!br) return null;
    const c = cfg(); const z = br.zone;
    const zoneMsLeft = z.phase === 'wait' ? Math.max(0, c.zonaSegura.inicioMs - c.zonaSegura.avisoMs - br.clock) : z.phase === 'warn' ? Math.max(0, c.zonaSegura.avisoMs - (br.clock - z.phaseAt)) : z.phase === 'shrink' ? Math.max(0, c.zonaSegura.estagios[z.stage].duracaoMs - (br.clock - z.phaseAt)) : 0;
    return {
      active: isActive(), clock: Math.round(br.clock), region: br.region, regionNome: c.regioes.find((r) => r.id === br.region)?.nome || '', risco: c.regioes.find((r) => r.id === br.region)?.risco || 0,
      kills: br.kills, mcbRun: br.mcbRun, alive: aliveCount(), cap: maxAlive(),
      zone: { phase: z.phase, stage: z.stage + 1, stages: c.zonaSegura.estagios.length, r: +z.r.toFixed(2), toR: z.toR, cx: z.cx, cy: z.cy, msLeft: Math.round(zoneMsLeft), outside: z.outside },
      event: br.event ? { kind: br.event.kind, nome: br.event.nome, x: br.event.x, y: br.event.y, msLeft: Math.max(0, Math.round(br.event.until - br.clock)), uid: br.event.uid || null, done: !!br.event.done } : null,
      extractionOpen: br.extractionOpen, extractInMs: Math.max(0, c.extracao.liberaAposMs - br.clock), extract: { ...br.extract, need: c.extracao.segundos * 1000 },
      opening: br.opening ? { ...br.opening, need: 450 } : null, drops: br.drops.length, inDragon: br.inDragon, ended: br.ended ? { ...br.ended } : null, bossKilled: br.bossKilled
    };
  }
  return {
    start, stop, update, isActive, onKill, onBossKilled, onPlayerDeath, addMcb, recordItem, summary, view, finish,
    getStateRef: () => st, stats: () => JSON.parse(JSON.stringify({ ...stats, alive: st ? aliveCount() : 0 })),
    /** testes: força eventos/tempo/abertura */
    debug: {
      advance(ms, p) { if (br) { br.clock += ms; br.nextSpawnAt = Math.min(br.nextSpawnAt, br.clock); } if (p) update(16, p); },
      openNearest(p) { const m = map(); let best = null; let bd = 1e9; for (const s of [...m.chests, ...m.crates]) { if (br.lootOpened.includes(s.id)) continue; const d = Math.hypot(s.x - p.x, s.y - p.y); if (d < bd) { bd = d; best = s; } } if (best) openLoot(best); return best; },
      forceEvent(kind) { if (!br) return; br.event = null; br.eventSeq = Object.keys(cfg().eventos.tipos).filter((k) => cfg().eventos.tipos[k].ativo).indexOf(kind); br.nextEventAt = br.clock; },
      spawn(id, x, y, extra) { return spawnAt(id, x, y, extra || {}); },
      drops: () => br?.drops || []
    }
  };
}
