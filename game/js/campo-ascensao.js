/**
 * NEXARA — EVO: CAMPO DE ASCENSÃO (modo de TESTE, id novo zone_campo_ascensao).
 *
 * COMBATE → XP → NÍVEL → ESCOLHAS → INIMIGOS MAIS FORTES → ELITES → PREPARAÇÃO → DRAGÃO.
 *  - Estado EFÊMERO (cópia do personagem permanente, como a Arena de Teste): nada aqui vai para
 *    o save; só a vitória sobre o GIGANTE VERDE grava XP/loot no permanente (arena-run.onBossKilled).
 *  - 10 ondas (data/campo_ascensao.json) com teto de ativos (preset do aparelho), distância de
 *    ativação, fila de entrada e pool de entradas de monstro (sem crescer monstersAlive).
 *  - Poderes TEMPORÁRIOS = a mesma camada da Arena (instância própria de createArenaRun): pilhas
 *    exatas, removidas matematicamente no fim; ponto de controle por onda.
 *  - Morte: volta ao início da ONDA atual (ou ao PORTÃO, se for no chefe) com o herói/poderes do
 *    ponto de controle. Save permanente intocado.
 *  - PORTÃO DO DRAGÃO: área de preparação, nível recomendado, revisão da build, ENTRAR → covil
 *    fecha atrás, chefe com HP = HP máx. do herói × multiplicador (≥101, arena-run.armBoss).
 */
import { getConfig } from './gameplay-config.js?v=20261003vil';
import { createArenaState } from './arena.js?v=20261003vil';
import { addXp, pushLog } from './state.js?v=20261003vil';
import { rollLoot, addToInventory } from '../../rules/loot.js?v=20261003vil';
import { resetMonsterRuntime, alertMonster, clearEnemyHazards, resetBossRuntime } from './enemy-ai.js?v=20261003vil';

export const CAMPO_ZONE_ID = 'zone_campo_ascensao';
const UID_BASE = 12000;

/** Zona injetada em runtime (zones.json intacto). closed = portões fechados (map.isWalkable). */
export function buildCampoZone(def) {
  const z = def.zona;
  return {
    id: CAMPO_ZONE_ID,
    code: z.code || 'CA',
    name: z.name || 'Campo de Ascensão',
    risk: 0,
    playable: true,
    campo: true,
    description: 'Modo de teste: 10 ondas, vilões novos por onda, elites, mini-chefe e o Portão do Dragão.',
    blocked_message: null,
    prep: { ...z.prep },
    lair: { ...z.lair },
    spawnPoints: (def.spawnPoints || []).map((q) => ({ x: q.x, y: q.y })), // EVO gráficos: selos no chão
    closed: { gate1: true, gate2: true },
    map: {
      width: z.tiles[0].length,
      height: z.tiles.length,
      tile_size: 48,
      spawn: { ...z.spawn },
      tiles: z.tiles.slice(),
      legend: { ...z.legend },
      poi: [
        { id: 'poi_campo_centro', x: 10, y: 7, label: 'CA · CAMPO DE ASCENSÃO' },
        { id: 'poi_campo_portao', x: 25, y: 7, label: 'PORTÃO DO DRAGÃO' },
        { id: 'poi_campo_covil', x: z.lair.boss.x, y: z.lair.boss.y, label: 'COVIL · GIGANTE VERDE' }
      ],
      exits: []
    }
  };
}

/** Estado da corrida: cópia do permanente (createArenaState) trocada para o mapa do Campo. */
export function createCampoState(data, { from = null, boss = null } = {}) {
  const def = data.campo_ascensao;
  const st = createArenaState(data, { name: 'Testador', raceId: 'humano', from, boss: null });
  const zone = buildCampoZone(def);
  st._data = { ...st._data, zones: { ...st._data.zones, zones: [...st._data.zones.zones.filter((zz) => zz.id !== CAMPO_ZONE_ID), zone] } };
  st.zoneId = CAMPO_ZONE_ID;
  st.campoMode = true;
  st.flags.campo = true;
  st.player.x = zone.map.spawn.x;
  st.player.y = zone.map.spawn.y;
  st.monstersAlive = [];
  const bossDef = boss && data.monsters.monsters.find((m) => m.id === boss.monsterId);
  if (bossDef) {
    const b = def.zona.lair.boss;
    st.monstersAlive.push({
      uid: boss.uid, id: bossDef.id, zone: CAMPO_ZONE_ID, x: b.x, y: b.y, homeX: b.x, homeY: b.y,
      hp: bossDef.hp, hpMax: bossDef.hp, alive: true, boss: true, arenaLabel: 'GIGANTE VERDE',
      territoryMinX: def.zona.lair.territoryMinX
    });
  }
  // SAVE: escolhas de passiva pendentes do permanente continuam valendo no Campo
  if (from?.passives?.pending > 0) st.passives.pending = from.passives.pending;
  st.log = [];
  pushLog(st, 'CAMPO DE ASCENSÃO — 10 ondas. Suba de nível, monte sua build e chegue ao PORTÃO DO DRAGÃO.', 'sys');
  return st;
}

/**
 * @param {{
 *   getData: () => object,
 *   run: ReturnType<import('./arena-run.js?v=20261003vil').createArenaRun>,
 *   getPos: () => {x:number,y:number},
 *   applyDerived: (s: object) => void,
 *   presetCap: () => number,
 *   onEvent: (kind: string, info: object) => void,
 *   teleport: (s: object, x: number, y: number) => void
 * }} deps
 */
export function createCampo(deps) {
  const cs = {
    active: false, phase: 'off', wave: 0, waveName: '', queue: [], nextSpawnAt: 0, phaseAt: 0,
    spawned: 0, killed: 0, waveKilled: 0, deaths: 0, checkpoint: null, checkpointKind: '',
    nextUid: UID_BASE, maxActiveSeen: 0, gateWarned: false, inPrep: false, bossEntered: false,
    rewards: [], log: [], spawnLog: {}, waveNovos: [], startedAt: 0, waveStartedAt: 0, waveTimes: [], bossStartedAt: 0, bossTimeMs: 0
  };
  let st = null;
  let clockMs = 0;
  const def = () => deps.getData().campo_ascensao;
  const rewardsData = () => deps.getData().recompensas || { tabelas: {} };
  const zone = () => st?._data.zones.zones.find((z) => z.id === CAMPO_ZONE_ID) || null;
  const regra = () => def().regras || {};

  function note(kind, info = {}) {
    cs.log.push({ kind, wave: cs.wave, at: Math.round(clockMs), ...info });
    if (cs.log.length > 80) cs.log.shift();
    deps.onEvent?.(kind, { wave: cs.wave, ...info });
  }

  function maxActive() {
    const r = Number(regra().maxActive) || 10;
    const p = Number(deps.presetCap?.()) || r;
    return Math.max(1, Math.min(r, p));
  }

  function waveMons() { return st ? st.monstersAlive.filter((m) => m.campo && !m.boss) : []; }
  function aliveWave() { let n = 0; for (const m of st.monstersAlive) if (m.campo && !m.boss && m.alive) n++; return n; }
  function bossMon() { return st ? st.monstersAlive.find((m) => m.boss) || null : null; }

  /** Ponto de controle: herói + passivas + dragão + pilhas de poder no começo da onda / do chefe. */
  function saveCheckpoint(kind) {
    cs.checkpointKind = kind;
    cs.checkpoint = {
      kind,
      wave: cs.wave,
      hero: JSON.parse(JSON.stringify({ player: st.player, inventory: st.inventory, equipment: st.equipment, passives: st.passives, dragon: st.dragon })),
      powers: deps.run.getPowers()
    };
  }
  function restoreCheckpoint() {
    const c = cs.checkpoint;
    if (!c) return;
    const h = JSON.parse(JSON.stringify(c.hero));
    st.player = h.player;
    st.inventory = h.inventory;
    st.equipment = h.equipment;
    st.passives = h.passives;
    st.passives.pending = 0;
    st.passives.offer = null;
    st.dragon = h.dragon;
    deps.run.restorePowers(c.powers);
    deps.applyDerived(st);
    st.player.hp = st.player.hpMax;
    st.player.nexa = st.player.nexaMax;
  }

  function despawnWave() {
    for (const m of waveMons()) { if (m.alive) { m.alive = false; m.hp = 0; } resetMonsterRuntime(m); }
    clearEnemyHazards();
  }

  function start(state) {
    st = state;
    clockMs = 0;
    cs.active = true;
    cs.phase = 'intro';
    cs.wave = 1;
    cs.queue = [];
    cs.phaseAt = 0;
    cs.spawned = 0; cs.killed = 0; cs.waveKilled = 0;
    cs.nextUid = UID_BASE;
    cs.gateWarned = false; cs.inPrep = false; cs.bossEntered = false;
    cs.rewards = []; cs.spawnLog = {}; cs.waveTimes = []; cs.bossTimeMs = 0;
    cs.startedAt = 0;
    saveCheckpoint('wave');
    note('run_start', {});
  }
  function stop() { cs.active = false; cs.phase = 'off'; st = null; }

  function pickSpawnPoint(p) {
    const pts = def().spawnPoints || [];
    const minD = getConfig().spawning?.spawnMinDistFromHero || 4.5;
    let best = null;
    let bestD = -1;
    const used = new Set(st.monstersAlive.filter((m) => m.alive).map((m) => m.y * 1000 + m.x));
    for (const q of pts) {
      if (used.has(q.y * 1000 + q.x)) continue;
      const d = Math.hypot(q.x + 0.5 - p.x, q.y + 0.5 - p.y);
      // preferir o ponto mais perto que ainda respeita a distância mínima (entram no combate rápido)
      if (d >= minD && (best == null || d < bestD)) { best = q; bestD = d; }
    }
    if (!best) {
      for (const q of pts) { const d = Math.hypot(q.x - p.x, q.y - p.y); if (d > bestD) { best = q; bestD = d; } }
    }
    return best || def().zona.spawn;
  }

  /** Entrada reaproveitada (mesmo id → mesmo visual no pool do renderer) ou nova. */
  function spawnOne(monId, p) {
    const mdef = st._monsters[monId];
    if (!mdef) return null;
    const pt = pickSpawnPoint(p);
    let m = st.monstersAlive.find((q) => q.campo && !q.boss && !q.alive && q.id === monId);
    if (!m) {
      m = { uid: cs.nextUid++, id: monId, zone: CAMPO_ZONE_ID, campo: true };
      st.monstersAlive.push(m);
    }
    resetMonsterRuntime(m);
    m.x = pt.x; m.y = pt.y; m.homeX = pt.x; m.homeY = pt.y;
    m.hp = m.hpMax = mdef.hp;
    m.alive = true;
    m.arch = mdef.arquetipo || null;
    m.tier = mdef.tier || 'comum';
    m.wave = cs.wave;
    m.alerted = false;
    m.arenaLabel = mdef.tier === 'elite' ? `ELITE · ${mdef.name}` : mdef.tier === 'mini_chefe' ? `MINI-CHEFE · ${mdef.name}` : mdef.name;
    m._wasAlive = true;
    cs.spawned++;
    (cs.spawnLog[cs.wave] || (cs.spawnLog[cs.wave] = [])).push(monId); // EVO: composição real por onda
    if (mdef.tier === 'elite') note('elite_spawn', { uid: m.uid, id: monId, name: mdef.name });
    if (mdef.tier === 'mini_chefe') note('miniboss_spawn', { uid: m.uid, id: monId, name: mdef.name });
    return m;
  }

  function beginWave(n) {
    const w = (def().ondas || [])[n - 1];
    if (!w) return;
    cs.wave = n;
    cs.waveName = w.nome;
    cs.spawnLog[n] = []; // recomeço da onda (morte/ponto de controle) não duplica a composição
    cs.queue = [];
    // intercala os grupos (entrada mista e legível)
    const groups = w.grupos.map((g) => ({ id: g.monster, left: g.qty }));
    let any = true;
    while (any) { any = false; for (const g of groups) if (g.left > 0) { cs.queue.push(g.id); g.left--; any = true; } }
    // elite / mini-chefe entram primeiro (anúncio claro)
    cs.queue.sort((a, b) => tierRank(st._monsters[b]) - tierRank(st._monsters[a]));
    cs.waveKilled = 0;
    cs.phase = 'wave';
    cs.phaseAt = clockMs;
    cs.waveStartedAt = clockMs;
    cs.nextSpawnAt = clockMs;
    // EVO: vilões que aparecem PELA PRIMEIRA VEZ nesta onda (carta de apresentação no anúncio)
    const before = new Set();
    for (const pw of (def().ondas || []).slice(0, n - 1)) for (const g of pw.grupos) before.add(g.monster);
    const novos = [];
    for (const g of w.grupos) {
      if (before.has(g.monster) || novos.some((q) => q.id === g.monster)) continue;
      const md = st._monsters[g.monster];
      if (md) novos.push({ id: md.id, name: md.name, icone: md.icone || '✦', cor: md.cor || '#8ffcff', arch: md.arquetipo || null, tier: md.tier || 'comum', lore: md.lore || md.description || '' });
    }
    const tipos = w.grupos.map((g) => ({ id: g.monster, qty: g.qty, name: st._monsters[g.monster]?.name || g.monster }));
    cs.waveNovos = novos.map((q) => q.id);
    note('wave_start', { n, total: cs.queue.length, waves: (def().ondas || []).length, name: w.nome, elite: !!w.elite, miniBoss: !!w.miniBoss, final: !!w.final, novos, tipos, maxActive: maxActive() });
  }
  const tierRank = (d) => (d?.tier === 'mini_chefe' ? 2 : d?.tier === 'elite' ? 1 : 0);

  /** Recompensa extra (data/recompensas.json) para elite / mini-chefe no estado da corrida. */
  function grantTierReward(m) {
    const mdef = st._monsters[m.id];
    const tab = rewardsData().tabelas?.[mdef?.tier];
    if (!tab) return;
    const drops = rollLoot(tab.drops || []);
    for (const d of drops) {
      addToInventory(st.inventory, st._items[d.item_id], d.qty);
      pushLog(st, `RECOMPENSA ${mdef.tier === 'elite' ? 'ELITE' : 'MINI-CHEFE'}: ${st._items[d.item_id]?.name || d.item_id} x${d.qty}`, 'sys');
    }
    if (tab.xpBonus) addXp(st, tab.xpBonus);
    if (tab.healFrac) st.player.hp = Math.min(st.player.hpMax, st.player.hp + Math.round(st.player.hpMax * tab.healFrac));
    const rar = rewardsData().itemRaridade || {};
    const info = { uid: m.uid, id: m.id, tier: mdef.tier, xpBonus: tab.xpBonus || 0, drops: drops.map((d) => ({ ...d, raridade: rar[d.item_id] || 'comum' })) };
    cs.rewards.push(info);
    note('tier_reward', info);
  }

  function waveCleared() {
    const n = cs.wave;
    cs.waveTimes.push({ wave: n, ms: Math.round(clockMs - cs.waveStartedAt) });
    const r = regra();
    st.player.hp = Math.min(st.player.hpMax, st.player.hp + Math.round(st.player.hpMax * (r.healBetweenWavesFrac || 0)));
    st.player.nexa = Math.min(st.player.nexaMax, st.player.nexa + Math.round(st.player.nexaMax * (r.nexaBetweenWavesFrac || 0)));
    if ((r.powerAfterWaves || []).includes(n)) deps.run.queueOffer(1);
    note('wave_clear', { name: cs.waveName, nivel: st.player.nivel });
    if (n >= (def().ondas || []).length) {
      cs.phase = 'gate_open';
      cs.phaseAt = clockMs;
      const z = zone();
      if (z) z.closed.gate1 = false;
      note('gate_open', { recommended: r.recommendedLevel, nivel: st.player.nivel });
    } else {
      cs.phase = 'intro';
      cs.phaseAt = clockMs;
      cs.wave = n + 1;
      saveCheckpointNext = true;
    }
  }
  let saveCheckpointNext = false;

  /** Herói confirmou ENTRAR no Portão: HP do chefe com o HP máx. atual, covil abre. */
  function enterBoss() {
    if (!st || !(cs.phase === 'portao' || cs.phase === 'gate_open')) return false;
    saveCheckpoint('boss');
    const armed = deps.run.armBoss();
    const boss = bossMon();
    if (boss) { resetBossRuntime(boss); boss.x = boss.homeX; boss.y = boss.homeY; }
    const z = zone();
    if (z) z.closed.gate2 = false;
    st.player.hp = st.player.hpMax;
    st.player.nexa = st.player.nexaMax;
    cs.phase = 'boss_enter';
    cs.phaseAt = clockMs;
    cs.bossEntered = false;
    note('gate_enter', { ...(armed || {}) });
    return true;
  }

  /** actions.setPlayerDeathHook (Campo): trata a morte → ponto de controle no próximo update. */
  function onPlayerDeath(state) {
    if (!cs.active || state !== st) return false;
    state.player.hp = 1;
    if (!cs.pendingDeath) { cs.pendingDeath = true; cs.deaths++; }
    return true;
  }

  /** SAVE: evolução do herói (nível/XP/passivas/itens/dragão) — a morte NUNCA a desfaz. */
  function progressSnapshot() {
    const pl = { ...st.player };
    delete pl.x; delete pl.y; delete pl.hp; delete pl.nexa;
    return JSON.parse(JSON.stringify({ player: pl, inventory: st.inventory, equipment: st.equipment, owned: st.passives?.owned || [], pending: st.passives?.pending || 0, dragon: st.dragon }));
  }
  function applyProgress(pg) {
    Object.assign(st.player, pg.player);
    st.inventory = pg.inventory;
    st.equipment = pg.equipment;
    st.passives.owned = pg.owned;
    st.passives.pending = pg.pending;
    st.passives.offer = null;
    st.dragon = pg.dragon;
    deps.applyDerived(st);
    st.player.hp = st.player.hpMax;
    st.player.nexa = st.player.nexaMax;
  }

  function handleDeath() {
    cs.pendingDeath = false;
    const kind = cs.checkpointKind;
    despawnWave();
    // morte: só os PODERES temporários voltam ao ponto de controle; a evolução permanente fica
    const prog = progressSnapshot();
    restoreCheckpoint();
    applyProgress(prog);
    const z = zone();
    const boss = bossMon();
    if (kind === 'boss') {
      // volta ao Portão; chefe restaurado (HP da fórmula de novo), covil fechado
      if (z) { z.closed.gate1 = false; z.closed.gate2 = true; }
      if (boss) { resetBossRuntime(boss); boss.x = boss.homeX; boss.y = boss.homeY; boss.alive = true; }
      deps.run.armBoss();
      const sp = def().zona.prep.spawn;
      deps.teleport(st, sp.x, sp.y);
      cs.phase = 'portao';
      cs.inPrep = true;
      // de volta ao Portão: painel (nível, revisão da build, ENTRAR) aparece de novo para a nova tentativa
      note('prep_enter', { nivel: st.player.nivel, recommended: regra().recommendedLevel, afterDeath: true });
    } else {
      if (z) { z.closed.gate1 = true; z.closed.gate2 = true; }
      const sp = def().zona.spawn;
      deps.teleport(st, sp.x, sp.y);
      cs.phase = 'intro';
    }
    cs.phaseAt = clockMs;
    note('death', { checkpoint: kind });
  }

  /** Vitória sobre o dragão: arena-run grava no permanente e recria o estado; aqui só registramos. */
  function onBossVictory() {
    cs.bossTimeMs = Math.round(clockMs - cs.bossStartedAt);
    note('boss_victory', { ms: cs.bossTimeMs });
  }

  function update(dtMs, p) {
    if (!cs.active || !st) return;
    clockMs += dtMs;
    if (cs.pendingDeath) { handleDeath(); return; }
    // abates (transição vivo → morto) → contagem + recompensa por tier
    for (const m of st.monstersAlive) {
      if (!m.campo || m.boss) continue;
      if (m._wasAlive && !m.alive) {
        m._wasAlive = false;
        cs.killed++; cs.waveKilled++;
        if (m.tier === 'elite' || m.tier === 'mini_chefe') grantTierReward(m);
      }
    }
    const r = regra();
    const actDist = Number(r.activationDistance) || getConfig().spawning?.activationDistance || 13;
    switch (cs.phase) {
      case 'intro': {
        if (saveCheckpointNext) { saveCheckpointNext = false; saveCheckpoint('wave'); }
        if (clockMs - cs.phaseAt >= (r.betweenWavesMs ?? getConfig().campo.betweenWavesMs)) beginWave(cs.wave);
        break;
      }
      case 'wave': {
        const alive = aliveWave();
        if (cs.queue.length && alive < maxActive() && clockMs >= cs.nextSpawnAt) {
          spawnOne(cs.queue.shift(), p);
          cs.nextSpawnAt = clockMs + (getConfig().spawning?.spawnIntervalMs || 650);
        }
        // ativação por distância (quem nasce longe só caça quando o herói chega perto)
        for (const m of st.monstersAlive) {
          if (!m.campo || m.boss || !m.alive || m.alerted) continue;
          if (Math.hypot(m.x + 0.5 - p.x, m.y + 0.5 - p.y) <= actDist) { m.alerted = true; alertMonster(m); }
        }
        const nowAlive = aliveWave();
        cs.maxActiveSeen = Math.max(cs.maxActiveSeen, nowAlive);
        if (!cs.queue.length && nowAlive === 0) waveCleared();
        break;
      }
      case 'gate_open':
      case 'portao': {
        const pr = def().zona.prep;
        const inside = p.x >= pr.x0 && p.x <= pr.x1 + 1;
        if (inside && !cs.inPrep) { cs.inPrep = true; cs.phase = 'portao'; note('prep_enter', { nivel: st.player.nivel, recommended: r.recommendedLevel }); }
        else if (!inside && cs.inPrep) { cs.inPrep = false; note('prep_leave', {}); }
        break;
      }
      case 'boss_enter': {
        const lair = def().zona.lair;
        if (p.x >= lair.x0 + 1.2) {
          const z = zone();
          if (z) z.closed.gate2 = true; // o covil fecha atrás do herói
          cs.phase = 'boss';
          cs.phaseAt = clockMs;
          cs.bossStartedAt = clockMs;
          cs.inPrep = false;
          const boss = bossMon();
          if (boss && boss.alive) alertMonster(boss); // o dragão desperta na entrada (sem esperar linha de visão)
          note('boss_intro', {});
        }
        break;
      }
      default: break;
    }
  }

  function view() {
    const b = bossMon();
    return {
      active: cs.active, phase: cs.phase, wave: cs.wave, waveName: cs.waveName, waves: (def()?.ondas || []).length,
      queue: cs.queue.length, alive: st ? aliveWave() : 0, maxActive: maxActive(), maxActiveSeen: cs.maxActiveSeen,
      spawnLog: JSON.parse(JSON.stringify(cs.spawnLog || {})), waveNovos: (cs.waveNovos || []).slice(),
      spawned: cs.spawned, killed: cs.killed, waveKilled: cs.waveKilled, deaths: cs.deaths,
      checkpoint: cs.checkpointKind, inPrep: cs.inPrep, recommendedLevel: regra().recommendedLevel,
      gates: zone() ? { ...zone().closed } : null, rewards: cs.rewards.slice(), log: cs.log.slice(-40),
      waveTimes: cs.waveTimes.slice(), bossTimeMs: cs.bossTimeMs, bossAlive: !!b?.alive,
      bossFightMs: cs.phase === 'boss' ? Math.round(clockMs - cs.bossStartedAt) : 0,
      clockMs: Math.round(clockMs), entries: st ? waveMons().length : 0
    };
  }

  /** e2e: pula direto para uma onda (limpa a atual) / abre o portão. */
  function debugSkipTo(n) {
    if (!cs.active) return null;
    despawnWave();
    if (n > (def().ondas || []).length) {
      cs.wave = (def().ondas || []).length;
      cs.queue = [];
      waveCleared();
    } else {
      cs.wave = n; cs.phase = 'intro'; cs.phaseAt = clockMs - 1e6; saveCheckpoint('wave');
    }
    return view();
  }

  return {
    start, stop, update, view, enterBoss, onPlayerDeath, onBossVictory, debugSkipTo,
    isActive: () => cs.active, getStateRef: () => st, phase: () => cs.phase, maxActive
  };
}
