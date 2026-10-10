/**
 * ARENA PRINCIPAL — RIVAIS (BOTS offline).
 *
 * Heróis rivais controlados pela IA LOCAL (sem rede, sem backend, não são jogadores online — o rótulo
 * sempre diz "RIVAL (BOT)"). Reaproveitam o monstro/arquétipo 'H' da IA de inimigos para lutar com o
 * herói (golpe em cone, GOLPE GIRATÓRIO, esquiva com i-frames) e uma simulação grossa aqui para:
 *   · explorar (meta = monstro próximo · baú não aberto · ponto dentro da zona) — a "casa" da IA anda;
 *   · lutar com monstros e com outros rivais (dano direto; não dá XP ao jogador);
 *   · saquear baús (o baú fica aberto para todos; o loot vai para a bolsa do rival e cai quando ele cai);
 *   · andar grosso pelo mapa quando longe (IA congelada pelo LOD).
 * No último estágio da zona (ou com 1 rival restante após a zona começar) o mais forte vira
 * CAMPEÃO RIVAL (cartão de entrada + barra de HP). Derrotar todos os rivais → VITÓRIA.
 */
import { getAiView, AI_STATES, placeMonster, resetMonsterRuntime, onMonsterHit, rivalDodge, getMonsterPos, setAttackerBonus } from './enemy-ai.js?v=20261009leve';
import { xpForLevel } from './state.js?v=20261009leve';

const ENGAGED = new Set([AI_STATES.DETECT, AI_STATES.CHASE, AI_STATES.ATTACK_PREPARE, AI_STATES.ATTACK, AI_STATES.RECOVERY]);

export function createRivals(ctx) {
  // ctx: st(), br(), cfg(), map(), R(), walk(x,y), nearestFree(x,y), spawnAt(id,x,y,extra), note(kind,info), finish(kind,info),
  //      spawnDrops(x,y,loots,src), rollLootFor(st,tier,opts), credit(n,why), regionAt(x,y)
  // ?rivais=0 desliga os rivais (comparação de desempenho / depuração)
  const URL_OFF = typeof location !== 'undefined' && new URLSearchParams(location.search).get('rivais') === '0';
  // ?rivaisAlvo=0 → comparação A/B: sem a escolha de alvo entre todos os heróis (comportamento anterior: o herói atrai a atenção de todos)
  const URL_NOALVO = typeof location !== 'undefined' && new URLSearchParams(location.search).get('rivaisAlvo') === '0';
  const RC = () => (URL_OFF ? { ativo: false } : URL_NOALVO ? { ...(ctx.cfg().rivais || {}), alvo: null } : ctx.cfg().rivais || {});
  const list = () => ctx.br()?.rivals || [];
  const monOf = (rv) => ctx.st()?.monstersAlive.find((m) => m.uid === rv.uid) || null;
  const pos = (m) => { const p = getMonsterPos(m); return p ? { x: p.x, y: p.y } : { x: m.x + 0.5, y: m.y + 0.5 }; };
  const lvl = () => Math.max(1, ctx.st()?.player?.nivel || 1);

  function inZone(x, y, k = 0.9) {
    const z = ctx.br().zone; if (z.phase === 'wait') return true;
    const r = Math.min(z.r, z.toR ?? z.r);
    return Math.hypot(x + 0.5 - z.cx, y + 0.5 - z.cy) <= r * k;
  }
  // NEXARA FAST: nível PRÓPRIO do rival (começa no NV1; sobe com XP de monstros e de rivais derrotados). Mapa completo: nível do herói.
  const fastRules = () => !!RC().nivelProprio;
  const lvlFor = (rv) => (fastRules() ? (rv.ownL || 1) : lvl());
  function gainXp(rv, n) {
    if (!fastRules() || !(n > 0)) return;
    rv.xp = (rv.xp || 0) + n * (RC().xpMult ?? 1); rv.xpTotal = (rv.xpTotal || 0) + n;
    while (rv.xp >= xpForLevel(rv.ownL || 1)) { rv.xp -= xpForLevel(rv.ownL || 1); rv.ownL = (rv.ownL || 1) + 1; ctx.note('rival_levelup', { name: rv.name, level: rv.ownL }); }
  }
  const rivalXp = (rv) => Math.round((ctx.st()._monsters[RC().monstro || 'mon_br_rival']?.xp || 60) * (1 + 0.25 * ((rv.level || 1) - 1)));
  function spawn(p) {
    const c = RC(); const br = ctx.br(); if (!c.ativo || br.rivals) return;
    br.rivals = []; br.rivalFinal = false; br.championUid = null; br.rivalsDown = 0;
    const m = ctx.map(); const n = Math.max(3, Math.min(c.nMax || 5, c.n || 4)); // NEXARA FAST: nMax 10
    const pts = m.spawnPoints.filter((q) => !ctx.inCovil(q.x, q.y, q.region) && Math.hypot(q.x - p.x, q.y - p.y) >= (c.distInicialMin || 30));
    const chosen = [];
    for (let k = 0; k < 200 && chosen.length < n && pts.length; k++) {
      const q = pts[Math.floor(ctx.R() * pts.length)];
      const minSep = k < 120 ? 22 : 10;
      if (chosen.every((o) => Math.hypot(o.x - q.x, o.y - q.y) >= minSep)) chosen.push(q);
    }
    chosen.forEach((q, i) => { const h = c.herois[i % c.herois.length]; spawnOne(h, q.x, q.y, i); });
    ctx.note('rivals_spawn', { n: br.rivals.length, names: br.rivals.map((r) => r.name) });
  }
  function spawnOne(h, x, y, idx) {
    const c = RC(); const br = ctx.br(); const st = ctx.st();
    const def = st._monsters[c.monstro || 'mon_br_rival']; if (!def) return null;
    const mon = ctx.spawnAt(def.id, x, y, { enc: 'rival', dbg: true, fresh: true });
    if (!mon) return null;
    const rv = { uid: mon.uid, idx, style: h.style, name: h.nome, primary: h.primary, glow: h.glow, bag: [], mcb: 0, kills: 0, chests: 0,
      goal: null, goalAt: -1e9, nextSwing: 0, nextHurt: 0, swingAt: -1e9, seenAt: -1e9, champion: false, out: false, by: null, path: null, pathI: 0, dodgeReady: 0,
      ownL: 1, xp: 0, xpTotal: 0, rivalKills: 0, killedBy: null };
    mon.rival = { name: h.nome, style: h.style, primary: h.primary, glow: h.glow, champion: false };
    if (fastRules()) rv.ownL = ctx.st()?.fastZero ? 1 : lvl(); // FAST do zero: todos no NV1 · sem 'do zero': começam no nível do herói e sobem por conta própria
    applyLevel(rv, mon, lvlFor(rv), true);
    mon.walkMult = c.velocidade || 1.2;
    mon.route = { pts: [], i: 0, rival: true };
    br.rivals.push(rv);
    return rv;
  }
  /**
   * RIVAIS FORTES: nível do rival = nível do herói (CAMPEÃO = +2). HP/ataque = base × força (×1,5 / ×1,3) × nível
   * (× multiplicador do campeão). Ao subir de nível no meio da corrida, os rivais acompanham (mantém a % de HP).
   */
  function rivalStats(L, champ, playerL = L) {
    const c = RC(); const F = c.forca || {}; const CP = c.campeao || {}; const def = ctx.st()._monsters[c.monstro || 'mon_br_rival'];
    // M10 passo 4 (medido em e2e-m10-balanco): no NV1 o CAMPEÃO (NV3 ×1,6 HP) tirava 123% do HP mesmo esquivando → o bônus do campeão
    // entra em rampa até o herói chegar ao NV "rampaNivel" (o +2 de nível continua valendo sempre)
    const ramp = Math.min(1, Math.max(0.2, playerL / (CP.rampaNivel ?? 5)));
    const cH = champ ? 1 + ((CP.hpMult ?? 1.6) - 1) * ramp : 1; const cA = champ ? 1 + ((CP.atkMult ?? 1.3) - 1) * ramp : 1;
    const hp = Math.round(def.hp * (F.hpMult ?? 1.5) * (1 + (c.hpPorNivel ?? 0.12) * (L - 1)) * cH);
    const atk = (F.atkMult ?? 1.3) * (1 + (c.atkPorNivel ?? 0.06) * (L - 1)) * cA;
    return { hp, atk };
  }
  function applyLevel(rv, mon, playerL, full) {
    const champ = !!rv.champion; const L = Math.max(1, playerL + (champ ? (RC().campeao?.nivelExtra ?? 2) : 0));
    const S = rivalStats(L, champ, playerL); const frac = full || !(mon.hpMax > 0) ? 1 : Math.max(0, Math.min(1, mon.hp / mon.hpMax));
    mon.hpMax = S.hp; mon.hp = Math.max(1, Math.round(S.hp * frac)); mon.atkScale = S.atk;
    const T = RC().tatica; if (T) { mon.cdMult = T.cdMult ?? 1; mon.tacSpeed = T.velMult ?? 1; if (T.aggro) mon.aggroR = T.aggro; } // FAST: reação mais rápida, mais agressivos
    rv.level = L; rv.forPlayerL = playerL; mon.rival.level = L;
    mon.arenaLabel = `${champ ? 'CAMPEÃO RIVAL' : 'RIVAL'} (BOT) NV ${L} · ${rv.name}`;
  }
  function aliveRivals() { return list().filter((rv) => { const m = monOf(rv); return m && m.alive && !rv.out; }); }

  /** meta do rival: monstro perto → baú não aberto → ponto dentro da zona (final: o herói) */
  function pickGoal(rv, mon, mp, p) {
    const br = ctx.br(); const st = ctx.st(); const m = ctx.map();
    if (br.rivalFinal) return { kind: 'heroi', x: Math.floor(p.x), y: Math.floor(p.y) };
    // outro rival por perto (≤ 16 tiles) → caça o rival (a zona aproxima todos; eles se eliminam no caminho)
    if (rv.tgt?.kind === 'rival' && rivalsCanKill()) { const om = monOf(list().find((q) => q.uid === rv.tgt.uid)); if (om && om.alive) return { kind: 'rival', uid: om.uid, x: om.x, y: om.y }; } // 20261009leve: alvo escolhido por proximidade/fraqueza/ameaça (herói = 1 alvo a mais)
    let rb = null, rd = rivalsCanKill() ? (br.spectate ? 90 : (RC().cacaRivalDist || 16)) : 0; // só quando podem se eliminar (zona fechando)
    for (const o of list()) { if (o === rv || o.out) continue; const om = monOf(o); if (!om || !om.alive) continue; const d = Math.hypot(om.x + 0.5 - mp.x, om.y + 0.5 - mp.y); if (d < rd) { rd = d; rb = om; } }
    if (rb) return { kind: 'rival', uid: rb.uid, x: rb.x, y: rb.y };
    let best = null, bd = 13;
    for (const o of st.monstersAlive) {
      if (!o.alive || o === mon || !o.br || o.boss || o.rival) continue;
      const d = Math.hypot(o.x + 0.5 - mp.x, o.y + 0.5 - mp.y);
      if (d < bd && inZone(o.x, o.y)) { bd = d; best = o; }
    }
    if (best) return { kind: 'monstro', uid: best.uid, x: best.x, y: best.y };
    // saque com moderação: no máximo saque.maxBaus por rival e uma pausa entre baús (sobra loot para o herói)
    const SQ = RC().saque || {};
    let cb = null; bd = rv.chests >= (SQ.maxBaus ?? 6) || br.clock < (rv.lootPauseUntil || 0) || br.clock < (SQ.inicioMs ?? 20000) ? 0 : 60;
    for (const s of [...m.chests, ...m.crates]) {
      if (s.secret || br.lootOpened.includes(s.id) || ctx.inCovil(s.x, s.y, s.region) || !inZone(s.x, s.y)) continue;
      const d = Math.hypot(s.x - mp.x, s.y - mp.y); if (d < bd) { bd = d; cb = s; }
    }
    if (cb) return { kind: 'bau', id: cb.id, x: cb.x, y: cb.y };
    const z = br.zone;
    for (let k = 0; k < 20; k++) {
      const a = ctx.R() * Math.PI * 2; const rr = ctx.R() * Math.max(4, Math.min(z.r, z.toR ?? z.r) * 0.7);
      const x = Math.round(z.cx + Math.cos(a) * rr), y = Math.round(z.cy + Math.sin(a) * rr);
      if (ctx.walk(x, y) && !ctx.inCovil(x, y, ctx.regionAt(x, y)?.id)) return { kind: 'zona', x, y };
    }
    return { kind: 'zona', x: Math.floor(z.cx), y: Math.floor(z.cy) };
  }
  /** caminho grosso (BFS de tiles alcançáveis) para rival longe do herói (IA congelada pelo LOD) */
  function bfsPath(sx, sy, gx, gy) {
    const m = ctx.map(); const W = m.W, H = m.H; const N = W * H;
    const prev = new Int32Array(N).fill(-1); const q = new Int32Array(N); let h = 0, t = 0;
    if (!(sx >= 0 && sy >= 0 && sx < W && sy < H && gx >= 0 && gy >= 0 && gx < W && gy < H)) return null; // meta/posição fora do mapa → sem caminho (nunca laço infinito)
    const s = sx + sy * W, g = gx + gy * W; if (s === g) return [];
    prev[s] = s; q[t++] = s;
    while (h < t) {
      const c = q[h++]; if (c === g) break;
      const cx = c % W, cy = (c / W) | 0;
      for (let k = 0; k < 4; k++) {
        const nx = cx + (k === 0 ? 1 : k === 1 ? -1 : 0), ny = cy + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const ni = nx + ny * W;
        if (prev[ni] !== -1 || m.reachable[ni] !== 1) continue; prev[ni] = c; q[t++] = ni;
      }
    }
    if (prev[g] === -1) return null;
    const out = []; for (let c = g, n = 0; c !== s; c = prev[c]) { out.push(c); if (++n > N) return null; } out.reverse(); return out;
  }
  /** FAST: ritmo das eliminações ENTRE rivais (a partida não pode esvaziar antes do herói chegar): a 1ª só após 'elimPrimeiraMs', depois 1 a cada 'elimIntervaloMs' (espectador: 'elimEspectadorMs') */
  function elimAllowed(br) {
    const R0 = RC(); if (!R0.elimIntervaloMs) return true;
    return br.clock >= Math.max(R0.elimPrimeiraMs || 0, br.nextElimAt || 0);
  }
  function damageRival(rv, mon, n, byName, lethal, killer = null) {
    const c = RC().combate || {};
    if (lethal && killer && !elimAllowed(ctx.br())) lethal = false; // ainda não pode cair: fica no piso de HP (hpMinFrac)
    const floor = lethal ? 0 : Math.ceil((mon.hpMax || 1) * (c.hpMinFrac ?? 0.3));
    if (mon.hp <= floor) return false;
    mon.hp = Math.max(floor, mon.hp - n);
    if (mon.hp <= 0) { eliminate(rv, mon, byName, killer); return true; }
    return false;
  }
  /** rival caiu SEM ser pelo herói (outro rival): sai da corrida, a bolsa cai no chão (o herói pode pegar) */
  function eliminate(rv, mon, byName, killer = null) {
    const br = ctx.br(); const mp = pos(mon);
    mon.alive = false; mon.hp = 0; resetMonsterRuntime(mon);
    if (killer) { const R0 = RC(); br.nextElimAt = br.clock + (br.spectate ? (R0.elimEspectadorMs ?? 8000) : (R0.elimIntervaloMs || 0)); }
    rv.out = true; rv.by = byName || 'arena'; rv.killedBy = killer ? killer.name : null; br.rivalsDown++;
    if (killer && fastRules()) {
      // NEXARA FAST: o vencedor SAQUEIA o derrotado (bolsa + metade do MCB) e ganha XP do abate
      const n = rv.bag.length; killer.bag.push(...rv.bag.splice(0)); const m2 = Math.floor((rv.mcb || 0) * 0.5); killer.mcb += m2; rv.mcb -= m2;
      killer.rivalKills = (killer.rivalKills || 0) + 1; gainXp(killer, rivalXp(rv));
      ctx.note('rival_looted', { name: killer.name, from: rv.name, items: n, mcb: m2 });
    } else if (rv.bag.length) ctx.spawnDrops(Math.floor(mp.x), Math.floor(mp.y), rv.bag.splice(0), `rival_${rv.idx}`);
    ctx.note('rival_out', { name: rv.name, by: rv.by, left: aliveRivals().length });
  }
  /** rivais podem se eliminar? só com a zona fechando, fora do final, e sobrando mais que minVivosFinal (ou estágio ≥ 3) */
  function rivalsCanKill() {
    const br = ctx.br(); const n = aliveRivals().length;
    if (br.spectate) return n > 1; // espectador: a briga vai até sobrar 1 (campeão também pode cair)
    return !br.rivalFinal && (br.zone.phase !== 'wait' || !!RC().lutamSempre) && n > 1 && (n > (RC().minVivosFinal ?? 2) || br.zone.stage >= 2); // FAST: lutam a partida toda
  }
  function nearestFoe(rv, mon, mp, maxD) {
    const st = ctx.st(); let best = null, bd = maxD; const rk = rivalsCanKill();
    for (const o of st.monstersAlive) {
      if (!o.alive || o === mon || !o.br || o.boss) continue;
      if (o.rival && !rk) continue;
      const op = pos(o); const d = Math.hypot(op.x - mp.x, op.y - mp.y);
      if (d < bd) { bd = d; best = o; }
    }
    return best ? { o: best, d: bd } : null;
  }

  /**
   * 20261009leve — ALVO DO RIVAL entre TODOS os heróis (rivais + herói do jogador): pontuação = distância × fator de fraqueza
   * × ameaça × fidelidade (quanto MENOR, melhor). O herói NÃO tem preferência: é só mais um alvo (jogadorMult = 1 = neutro).
   * Sem `rivais.alvo` (mapa completo) tudo segue como antes.
   */
  function pickTarget(rv, mon, mp, p, dP, clock) {
    const A = RC().alvo; if (!A) return null;
    const st = ctx.st(); const pl = st.player; const cur = rv.tgt;
    const wk = A.fracoPeso ?? 0.4, th = A.ameacaMult ?? 0.65, stick = A.fidelidade ?? 0.8;
    let best = null, bs = 1e9;
    const consider = (kind, uid, d, hpFrac, threat) => {
      const s = d * (1 - wk * (1 - Math.max(0, Math.min(1, hpFrac)))) * (threat ? th : 1) * (cur && cur.kind === kind && cur.uid === uid ? stick : 1) * (kind === 'jogador' ? (A.jogadorMult ?? 1) : 1);
      if (s < bs) { bs = s; best = { kind, uid, d }; }
    };
    if (dP <= (A.jogadorAlcance ?? 18) && !(st.player.hp <= 0)) consider('jogador', 0, dP, pl.hpMax > 0 ? pl.hp / pl.hpMax : 1, clock < (rv.threatPlayerUntil || 0));
    if (rivalsCanKill()) {
      for (const o of list()) {
        if (o === rv || o.out) continue; const om = monOf(o); if (!om || !om.alive) continue;
        const op = pos(om); const d = Math.hypot(op.x - mp.x, op.y - mp.y); if (d > (A.rivalAlcance ?? 28)) continue;
        consider('rival', om.uid, d, om.hpMax > 0 ? om.hp / om.hpMax : 1, rv.lastAttacker === om.uid && clock - (rv.lastAttackedAt || -1e9) < 5000);
      }
    }
    return best;
  }
  const countAtk = (k) => { const b = ctx.br(); if (!b) return; const a = (b.atk = b.atk || { jogador: 0, rival: 0, monstro: 0 }); a[k]++; };

  function update(dtMs, p) {
    const c = RC(); const br = ctx.br(); if (!c.ativo || !br) return;
    if (!br.rivals) { spawn(p); return; }
    const st = ctx.st(); const clock = br.clock; const C = c.combate || {}; const dtS = dtMs / 1000;
    const lodMed = (ctx.cfg().lodIa?.medio || 24) - 1;
    const alive = aliveRivals();
    for (const rv of alive) {
      const mon = monOf(rv); const mp = pos(mon);
      const TL = lvlFor(rv); if (rv.forPlayerL !== TL) applyLevel(rv, mon, TL, false); // mapa completo: herói subiu → rivais acompanham · FAST: nível próprio do rival
      const dP = Math.hypot(mp.x - p.x, mp.y - p.y);
      if (dP <= (c.visaoMinimapa || 18)) rv.seenAt = clock;
      const v = getAiView(mon); const engaged = v && ENGAGED.has(v.state) && dP < 14;
      if (v && v.state === AI_STATES.ATTACK_PREPARE && rv.lastSt !== AI_STATES.ATTACK_PREPARE && dP < 9) countAtk('jogador'); // golpe do rival NO HERÓI (métrica 'ataques ao jogador')
      if (v) rv.lastSt = v.state;
      if (c.alvo && !br.rivalFinal && (!rv.tgtAt || clock - rv.tgtAt >= (c.alvo.reavaliaMs ?? 700))) {
        const prev = rv.tgt; rv.tgt = pickTarget(rv, mon, mp, p, dP, clock); rv.tgtAt = clock;
        if (rv.tgt?.kind === 'rival') { mon.aggroR = c.alvo.defesaR ?? 3.2; if (!prev || prev.kind !== 'rival' || prev.uid !== rv.tgt.uid) rv.goalAt = -1e9; } // alvo é outro rival: só se defende do herói (perto); caminha até o rival
        else if (c.tatica?.aggro) { mon.aggroR = c.tatica.aggro; if (prev?.kind === 'rival') rv.goalAt = -1e9; }
      }
      // meta
      const reached = rv.goal && Math.hypot(rv.goal.x + 0.5 - mp.x, rv.goal.y + 0.5 - mp.y) < 1.8;
      const goalDead = (rv.goal?.kind === 'monstro' || rv.goal?.kind === 'rival') && !st.monstersAlive.find((o) => o.uid === rv.goal.uid && o.alive);
      const goalOpened = rv.goal?.kind === 'bau' && br.lootOpened.includes(rv.goal.id);
      if (!rv.goal || goalDead || goalOpened || (reached && rv.goal.kind !== 'bau') || clock - rv.goalAt > (br.rivalFinal ? 1500 : 7000) || (rv.goal && rv.goal.kind !== 'rival' && !inZone(rv.goal.x, rv.goal.y, 1)) /* meta 'rival' fora da zona não invalida a cada quadro (travava o caminho) */) {
        rv.goal = pickGoal(rv, mon, mp, p); rv.goalAt = clock; rv.path = null;
      }
      if (rv.goal.kind === 'monstro' || rv.goal.kind === 'rival') { const o = st.monstersAlive.find((q) => q.uid === rv.goal.uid); if (o) { rv.goal.x = o.x; rv.goal.y = o.y; } }
      const hp = ctx.nearestFree(rv.goal.x, rv.goal.y) || rv.goal;
      if (!engaged) { mon.homeX = hp.x; mon.homeY = hp.y; }
      // longe do herói: IA congelada pelo LOD → anda grosso pelo caminho
      if (dP > lodMed && !engaged) {
        if (!rv.path || rv.pathGoal !== hp.x + hp.y * 10000) { rv.path = bfsPath(mon.x, mon.y, hp.x, hp.y) || []; rv.pathI = 0; rv.pathGoal = hp.x + hp.y * 10000; rv.pathAcc = 0; }
        rv.pathAcc = (rv.pathAcc || 0) + dtS * 2.6 * (mon.walkMult || 1);
        while (rv.pathAcc >= 1 && rv.pathI < rv.path.length) { rv.pathAcc -= 1; rv.pathI++; }
        if (rv.pathI > 0 && rv.path.length) { const W = ctx.map().W; const ci = rv.path[Math.min(rv.pathI, rv.path.length) - 1]; const nx = ci % W, ny = (ci / W) | 0; if (nx !== mon.x || ny !== mon.y) { placeMonster(st, mon.uid, nx + 0.5, ny + 0.5); rv.moved = (rv.moved || 0) + 1; } }
      } else rv.path = null;
      // saque: baú ao lado → aberto (para todos); loot na bolsa do rival
      if (rv.goal.kind === 'bau' && Math.hypot(rv.goal.x + 0.5 - mp.x, rv.goal.y + 0.5 - mp.y) <= (c.saque?.raioBau || 1.4) + 0.6) {
        const sp = [...ctx.map().chests, ...ctx.map().crates].find((q) => q.id === rv.goal.id);
        if (sp && !br.lootOpened.includes(sp.id)) {
          br.lootOpened.push(sp.id); br.lootOpenedDirty.push(sp.id);
          const loots = ctx.rollLootFor(st, sp.loot, { equip: sp.kind === 'bau' ? 1 : 0, mats: [1, 1], rnd: ctx.R });
          rv.bag.push(...loots); rv.chests++; rv.lootPauseUntil = br.clock + (c.saque?.pausaMs ?? 15000); rv.mcb += c.saque?.mcbPorBau || 0;
          ctx.note('rival_loot', { name: rv.name, id: sp.id, n: loots.length });
        }
        rv.goal = null;
      }
      // combate grosso com monstros/rivais (fora do duelo com o herói)
      if (!engaged && clock >= rv.nextSwing) {
        const f = nearestFoe(rv, mon, mp, C.alcance || 1.7);
        if (f) {
          rv.nextSwing = clock + (C.cadenciaMs || 900) * (0.85 + ctx.R() * 0.3); rv.swingAt = clock; mon.rivalSwingAt = performance.now(); mon.rivalSwingN = (mon.rivalSwingN || 0) + 1;
          const def = st._monsters[mon.id]; const dmg = Math.max(1, Math.round((def.ataque || 10) * 1.6 * (mon.atkScale || 1) * (C.danoMult || 1) * (0.8 + ctx.R() * 0.4)));
          try { onMonsterHit(f.o, { fromX: mp.x, fromY: mp.y, noStun: true, knockbackScale: 0.4 }); } catch {}
          if (f.o.rival) {
            const orv = list().find((q) => q.uid === f.o.uid);
            // eliminação entre rivais só enquanto sobram mais que "minVivosFinal" (o confronto final sempre tem rival)
            if (orv) { countAtk('rival'); orv.lastAttacker = rv.uid; orv.lastAttackedAt = clock; damageRival(orv, f.o, Math.round(dmg * (C.danoEntreRivais ?? 0.6)), rv.name, !orv.champion || !!br.spectate, rv); }
          } else {
            countAtk('monstro');
            f.o.hp -= dmg;
            if (f.o.hp <= 0) {
              f.o.hp = 0; f.o.alive = false; resetMonsterRuntime(f.o); rv.kills++; br.rivalMonKills = (br.rivalMonKills || 0) + 1; gainXp(rv, st._monsters[f.o.id]?.xp || 0);
              const tier = st._monsters[f.o.id]?.tier || 'comum';
              rv.mcb += tier === 'elite' ? 40 : 6;
              if (ctx.R() < (ctx.cfg().dropMonstro?.[tier] ?? 0.1)) rv.bag.push(...ctx.rollLootFor(st, ctx.regionAt(f.o.x, f.o.y)?.loot || 'basico', { equip: 0, mats: [1, 1], rnd: ctx.R }));
              if (br.event?.kind === 'cacada' && br.event.uid === f.o.uid && !br.event.done) { br.event.done = true; br.event.until = br.clock + 1500; ctx.note('hunt_lost', { by: rv.name }); }
              ctx.note('rival_kill', { name: rv.name, mon: f.o.id });
            }
          }
        }
      }
      // monstros colados batem no rival (não mata: no máximo até hpMinFrac)
      if (clock >= rv.nextHurt) {
        rv.nextHurt = clock + (C.danoRecebidoMs || 1300);
        let took = 0;
        for (const o of st.monstersAlive) {
          if (!o.alive || o === mon || !o.br || o.rival || o.boss) continue;
          const op = pos(o); if (Math.hypot(op.x - mp.x, op.y - mp.y) > 1.8) continue;
          took += Math.max(1, Math.round((st._monsters[o.id]?.ataque || 8) * 0.6));
        }
        if (took) { damageRival(rv, mon, took, 'monstros', false); rv.lastHurtAt = clock; }
      }
      // fora da zona (depois do aviso): dano da zona (sem matar)
      const z = br.zone;
      if (z.warned && z.phase !== 'wait' && Math.hypot(mp.x - z.cx, mp.y - z.cy) > z.r) { rv.zoneAcc = (rv.zoneAcc || 0) + dtMs; if (rv.zoneAcc >= 1000) { rv.zoneAcc -= 1000; damageRival(rv, mon, ctx.cfg().zonaSegura.danoPorSeg || 4, 'zona', false); } }
      // regeneração fora de combate
      if (!engaged && clock - (rv.lastHurtAt || -1e9) > 5000 && mon.hp < mon.hpMax) mon.hp = Math.min(mon.hpMax, mon.hp + (C.regenPorSeg || 2) * dtS * (mon.hpMax / 260));
    }
    // FAST: pressão em grupo — com ≥ 2 rivais colados no herói eles se espalham em vagas (cerco) e 1 atacante extra é liberado
    const T = c.tatica;
    if (T?.pressaoGrupo && !br.spectate) {
      const near = alive.filter((rv) => { const m = monOf(rv); return m && Math.hypot(pos(m).x - p.x, pos(m).y - p.y) <= (T.pressaoDist || 13); });
      const on = near.length >= 2;
      for (const rv of alive) { const m = monOf(rv); if (!m) continue; if (on && near.includes(rv)) m.tac = 'swarm'; else if (m.tac === 'swarm') m.tac = null; }
      setAttackerBonus(on ? 1 : 0); br.pressure = on ? near.length : 0;
    } else if (T?.pressaoGrupo) setAttackerBonus(0);
    checkFinal(p);
  }
  function checkFinal(p) {
    const c = RC(); const br = ctx.br(); const z = br.zone; const alive = aliveRivals();
    if (br.spectate) { // jogador caído: a partida só termina quando sobra no máximo 1 rival
      if (alive.length <= 1 && !br.ended) { ctx.note('spectate_end', { winner: alive[0]?.name || null }); ctx.finish('derrotado', { placement: br.playerPlace || null, winner: alive[0]?.name || null, spectated: true }); }
      return;
    }
    if (!br.rivalFinal) {
      const stageHit = z.stage >= (c.campeao?.gatilhoEstagio ?? 3);
      const lastOne = alive.length === 1 && z.stage >= 2;
      if (alive.length && (stageHit || lastOne)) startFinal(alive);
    }
    if (!alive.length && !br.ended && (br.rivalFinal || c.fimUltimoHeroi)) { // todos os rivais mortos = VITÓRIA (FAST: mesmo sem o confronto final ter começado)
      ctx.note('victory', { champion: br.championName });
      ctx.finish('vitoria', { champion: br.championName || null });
    }
  }
  function startFinal(alive) {
    const c = RC(); const br = ctx.br(); const CP = c.campeao || {};
    br.rivalFinal = true;
    let champ = null, best = -1;
    for (const rv of alive) { const m = monOf(rv); const s = m.hp + rv.kills * 20 + rv.chests * 30; if (s > best) { best = s; champ = rv; } }
    const m = monOf(champ);
    champ.champion = true; m.rival.champion = true;
    applyLevel(champ, m, lvlFor(champ), true); // CAMPEÃO: nível (do herói · FAST: o próprio) +2, HP cheio
    m.sizeMult = (m.sizeMult || 1) * (CP.sizeMult || 1.15);
    for (const rv of alive) { const mm = monOf(rv); mm.aggroR = 60; mm.loseR = 999; rv.goal = null; }
    br.championUid = m.uid; br.championName = champ.name;
    ctx.note('rival_final', { name: champ.name, style: champ.style, level: champ.level, hp: m.hpMax, others: alive.length - 1, introMs: CP.introMs || 3200 });
  }
  /** o herói derrubou um rival: bolsa + drop elite + bônus MCB (XP/MCB base vêm do kill hook normal) */
  function onKill(mon) {
    const br = ctx.br(); const rv = list().find((q) => q.uid === mon.uid); if (!rv || rv.out) return;
    const c = RC(); const st = ctx.st();
    rv.out = true; rv.by = 'heroi'; br.rivalsDown++; br.rivalsByHero = (br.rivalsByHero || 0) + 1;
    const loots = rv.bag.splice(0).concat(ctx.rollLootFor(st, 'elite', { equip: 1, mats: [1, 2], rnd: ctx.R }));
    ctx.spawnDrops(mon.x, mon.y, loots, `rival_${rv.idx}`);
    const bonus = (rv.champion ? (c.campeao?.bonusMcb || 200) : (c.bonusMcb || 60)) + (c.bonusMcbPorNivel ?? 8) * (rv.level || 1) + Math.floor(rv.mcb * 0.5);
    ctx.credit(bonus, rv.champion ? 'campeao' : 'rival');
    ctx.note(rv.champion ? 'champion_down' : 'rival_down', { name: rv.name, level: rv.level, bonus, drops: loots.length, left: aliveRivals().length });
  }
  /** o herói acertou um rival vivo → chance de esquiva (passo + i-frames curtos) */
  function onHit(mon, from) {
    const br = ctx.br(); const rv = list().find((q) => q.uid === mon.uid); if (!rv || !br) return;
    const E = RC().esquiva || {}; const T = RC().tatica || null; rv.lastHurtAt = br.clock; rv.threatPlayerUntil = br.clock + (RC().alvo?.ameacaMs ?? 5000); // o herói bateu: vira ameaça (alvo mais provável por um tempo)
    const chance = T?.esquivaChance ?? E.chance ?? 0.45, cd = T?.esquivaCooldownMs ?? E.cooldownMs ?? 2600;
    if (br.clock >= rv.dodgeReady && ctx.R() < chance) {
      if (rivalDodge(mon, from.x, from.y, { vel: E.vel || 7, ms: E.duracaoMs || 280 })) {
        rv.dodgeReady = br.clock + cd; rv.dodges = (rv.dodges || 0) + 1;
        mon.rivalIframeUntil = performance.now() + (E.iframesMs || 420);
        mon.rivalDodgeAt = performance.now();
        return;
      }
    }
    // FAST: BLOQUEIO — com a esquiva em recarga, às vezes ergue a guarda (golpes seguintes causam bem menos dano por um instante)
    if (T && br.clock >= (rv.guardReady || 0) && ctx.R() < (T.bloqueioChance ?? 0)) {
      rv.guardReady = br.clock + (T.bloqueioCooldownMs ?? 2200); rv.blocks = (rv.blocks || 0) + 1;
      mon.rivalGuardUntil = performance.now() + (T.bloqueioMs ?? 650); mon.rivalGuardMult = 1 - (T.bloqueioReduz ?? 0.5);
    }
  }
  function view(p) {
    const br = ctx.br(); if (!br?.rivals) return null; const c = RC();
    return {
      atk: { ...(br.atk || { jogador: 0, rival: 0, monstro: 0 }) }, final: !!br.rivalFinal, championUid: br.championUid, championName: br.championName || null, down: br.rivalsDown, byHero: br.rivalsByHero || 0, monKills: br.rivalMonKills || 0,
      list: br.rivals.map((rv) => { const m = monOf(rv); const mp = m ? pos(m) : { x: 0, y: 0 };
        return { uid: rv.uid, name: rv.name, level: rv.level || 1, atk: m ? +(m.atkScale || 1).toFixed(2) : 0, style: rv.style, color: rv.primary, alive: !!(m && m.alive && !rv.out), out: rv.out, by: rv.by, hp: m ? Math.round(m.hp) : 0, hpMax: m?.hpMax || 0,
          x: +mp.x.toFixed(2), y: +mp.y.toFixed(2), dist: p ? +Math.hypot(mp.x - p.x, mp.y - p.y).toFixed(1) : null, goal: rv.goal ? rv.goal.kind : null, kills: rv.kills, chests: rv.chests, bag: rv.bag.length, mcb: rv.mcb,
          champion: rv.champion, ownL: rv.ownL || 1, xpTotal: rv.xpTotal || 0, rivalKills: rv.rivalKills || 0, killedBy: rv.killedBy || null, seen: br.clock - rv.seenAt <= (c.lembraMs || 6000), dodges: rv.dodges || 0, blocks: rv.blocks || 0, tac: m?.tac || null, plen: rv.path ? rv.path.length : null, pi: rv.pathI ?? null, pg: rv.pathGoal ?? null, moved: rv.moved || 0, swingAt: rv.swingAt, state: m ? getAiView(m)?.state || null : null }; })
    };
  }
  return { update, onKill, onHit, view, spawn, spawnOne, byUid: (uid) => list().find((q) => q.uid === uid) || null, startFinal: () => { const a = aliveRivals(); if (a.length && !ctx.br().rivalFinal) startFinal(a); }, aliveRivals, list };
}
