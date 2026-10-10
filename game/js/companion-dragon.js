/**
 * NEXARA — MINI DRAGÃO companheiro (Bloco 3 · gp3). Só LÓGICA (sem Three.js):
 * voo com colisão de paredes, IA de alvo, ataques por estágio e projéteis em
 * pool. O visual fica em fps/dragon-view.js (lê getView()).
 *
 * Estados: FOLLOW → IDLE (pairando) → SEARCH_TARGET → COMBAT → ATTACK → RETURN.
 * Prioridade de alvo: 1) inimigo atacando o herói (telegraph/golpe),
 * 2) alvo do herói (lock-on se houver, senão último atingido), 3) mais próximo.
 * Coleira: nunca passa de leashDistance do herói; alvo além de
 * leashTargetRange do herói é abandonado → RETURN.
 * Relógio próprio (dt de jogo): congela com passivas/modal/hit-stop/evento.
 * Dano sempre por deps.damage (main.damageMonsterFrom → applyDamageToMonster),
 * então XP/loot/quests contam como os do herói.
 */
import { getConfig, DEG } from './gameplay-config.js?v=20261010ajustes';
import { moveAxisX, moveAxisY, hasLineOfSight, wrapAngle } from './collision.js?v=20261010ajustes';
import { isWalkable } from './map.js?v=20261010ajustes';
import { getStat, STATS } from './modifiers.js?v=20261010ajustes';

export const DRAGON_STATES = Object.freeze({
  FOLLOW: 'FOLLOW', IDLE: 'IDLE', SEARCH_TARGET: 'SEARCH_TARGET', COMBAT: 'COMBAT', ATTACK: 'ATTACK', RETURN: 'RETURN'
});
const S = DRAGON_STATES;

/**
 * @param {{ getZone:(s)=>object, getMonsterPos:(m)=>{x,y}, isAttackingPlayer:(m)=>boolean,
 *   getPlayerTargetUid:()=>number|null, damage:(mon, amount, opts)=>object|null,
 *   onFire?:(attackId, info)=>void, onCharge?:(attackId, durMs)=>void, onImpact?:(kind, x, y, big)=>void,
 *   onEvolve?:(stage)=>void }} deps
 */
export function createDragon(deps) {
  const pos = { x: 0, y: 0 };
  const vel = { x: 0, y: 0 };
  let h = 1.9;
  let facing = 0; // mesma convenção do yaw do herói: atan2(dx, -dy)
  let st = S.FOLLOW;
  let stT = 0;
  let clock = 0;
  let placed = false;
  let targetUid = null;
  let targetReason = '';
  let searchAcc = 0;
  let reactT = 0;
  let recoverT = 0;
  let farT = 0;
  let enabled = true;
  let zoneRef = null;
  let stateRef = null;
  const stats = { level: 1, hp: 100, hpMax: 100, speedMult: 1 };
  const cooldowns = Object.create(null); // attackId → ms restantes
  /** Ataque em andamento: carga (windup) → disparos (count × interval). */
  const atk = { id: null, def: null, phase: '', t: 0, fired: 0, nextIn: 0, dmgMult: 1 };
  const events = []; // log p/ testes (limitado)
  const tmp = { x: 0, y: 0 };
  const anchorOut = { x: 0, y: 0 };
  const CAND_F = [1, 0.7, -0.72, -0.64]; // × followForward
  const CAND_S = [1, 0.6, 1, 0];         // × lado

  // —— pool de projéteis (sem alocação por frame) ——
  const projectiles = [];
  function ensurePool() {
    const n = getConfig().dragon.maxProjectiles;
    while (projectiles.length < n) {
      projectiles.push({ active: false, kind: '', x: 0, y: 0, h: 0, vx: 0, vy: 0, vh: 0, dist: 0, maxRange: 0,
        radius: 0, dmg: 0, id: 0, age: 0, hitUid: null });
    }
  }
  let projSeq = 0;
  /** Impactos recentes (anel) para o visual: {x,y,h,kind,big,t,seq}. */
  const impacts = [];
  for (let i = 0; i < 16; i++) impacts.push({ x: 0, y: 0, h: 0, kind: '', big: false, t: -1, seq: 0 });
  let impactNext = 0;
  let impactSeq = 0;

  function blocked(tx, ty) { return !zoneRef || !isWalkable(zoneRef, tx, ty); }

  function log(type, extra) {
    events.push(Object.assign({ type, t: Math.round(clock), state: st, stage: stateRef?.dragon?.stage || 1 }, extra || null));
    if (events.length > 200) events.shift();
  }
  function setState(next) {
    if (st === next) return;
    log('state', { from: st, to: next });
    st = next;
    stT = 0;
  }

  function cfg() { return getConfig().dragon; }
  function stage() { return Math.max(1, stateRef?.dragon?.stage || 1); }
  function stageAttacks() {
    const c = cfg();
    const list = c.stages[stage()] || c.stages[1] || [];
    return list;
  }

  function findMon(uid) {
    if (uid == null || !stateRef) return null;
    const arr = stateRef.monstersAlive;
    for (let i = 0; i < arr.length; i++) {
      const m = arr[i];
      if (m.uid === uid) return m.alive && m.zone === stateRef.zoneId ? m : null;
    }
    return null;
  }
  function monXY(m, out) {
    const p = deps.getMonsterPos(m);
    out.x = p.x;
    out.y = p.y;
    return out;
  }

  /** Alvo válido: vivo, na zona, perto do herói (coleira) e visível pelo dragão. */
  function validTarget(m, px, py, range) {
    if (!m || !m.alive || m.zone !== stateRef.zoneId) return false;
    monXY(m, tmp);
    if (Math.hypot(tmp.x - px, tmp.y - py) > range) return false;
    return hasLineOfSight(zoneRef, pos.x, pos.y, tmp.x, tmp.y) || hasLineOfSight(zoneRef, px, py, tmp.x, tmp.y);
  }

  const REASON_RANK = { atacando_heroi: 0, perseguindo_heroi: 1, alvo_do_heroi: 2, mais_proximo: 3 };
  /** Bloco 4: o inimigo está atacando/preparando golpe no herói (ou atacou há pouco)? */
  function threatOf(m) {
    return deps.isAttackingPlayer(m) || !!(deps.recentlyAttackedPlayer && deps.recentlyAttackedPlayer(m));
  }
  /** Bloco 4: o alvo atual ainda justifica o engajamento? */
  function stillQualifies(m, reason) {
    const c = cfg();
    if (threatOf(m)) return true;
    if (m.uid === deps.getPlayerTargetUid?.()) return true;
    if (reason === 'perseguindo_heroi') return !!c.engageChasing && !!deps.isEngagingPlayer?.(m);
    if (reason === 'mais_proximo') return !!c.engageNearest;
    return false;
  }
  /** Reavaliação: só troca de alvo por prioridade MAIOR (sem ficar alternando). */
  function pickTarget(px, py) {
    const cur = findMon(targetUid);
    const curOk = !!cur && validTarget(cur, px, py, cfg().leashTargetRange) && stillQualifies(cur, targetReason);
    const curRank = curOk ? (REASON_RANK[targetReason] ?? 3) : 9;
    const saveUid = targetUid;
    const m = pickBest(px, py);
    if (!m) {
      if (curOk) return cur;
      if (cur) dropTarget('sem_motivo');
      return null;
    }
    const newRank = REASON_RANK[candReason] ?? 3;
    if (curRank === 9) return setPick(m, candReason);
    if (m.uid === saveUid) { if (newRank < curRank) targetReason = candReason; return cur; }
    // mesma prioridade "atacando": troca só se o novo está golpeando AGORA e o atual
    // é apenas memória (atacou há pouco) — não fica alternando entre dois atacantes.
    if (newRank === curRank && candReason === 'atacando_heroi' && targetReason === 'atacando_heroi' &&
        deps.isAttackingPlayer(m) && !deps.isAttackingPlayer(cur)) return setPick(m, candReason);
    if (newRank >= curRank) return cur;
    return setPick(m, candReason);
  }

  function pickBest(px, py) {
    const c = cfg();
    const arr = stateRef.monstersAlive;
    // 1) atacando / preparando golpe no herói (ou atacou há pouco) — o mais próximo do herói
    let best = null;
    let bestD = Infinity;
    // 1a) preparando/golpeando AGORA tem precedência sobre "atacou há pouco" (memória)
    for (let i = 0; i < arr.length; i++) {
      const m = arr[i];
      if (!deps.isAttackingPlayer(m) || !validTarget(m, px, py, c.leashTargetRange)) continue;
      const d = Math.hypot(tmp.x - px, tmp.y - py);
      if (d < bestD) { bestD = d; best = m; }
    }
    if (best) return candidate(best, 'atacando_heroi');
    for (let i = 0; i < arr.length; i++) {
      const m = arr[i];
      if (!threatOf(m) || !validTarget(m, px, py, c.leashTargetRange)) continue;
      const d = Math.hypot(tmp.x - px, tmp.y - py);
      if (d < bestD) { bestD = d; best = m; }
    }
    if (best) return candidate(best, 'atacando_heroi');
    // 1b) só perseguindo (desligado por padrão — Bloco 4: engageChasing)
    if (c.engageChasing && deps.isEngagingPlayer) {
      for (let i = 0; i < arr.length; i++) {
        const m = arr[i];
        if (!deps.isEngagingPlayer(m) || !validTarget(m, px, py, c.leashTargetRange)) continue;
        const d = Math.hypot(tmp.x - px, tmp.y - py);
        if (d < bestD) { bestD = d; best = m; }
      }
      if (best) return candidate(best, 'perseguindo_heroi');
    }
    // 2) alvo do herói (lock-on / atingido nos últimos heroTargetMemoryMs)
    const pt = findMon(deps.getPlayerTargetUid?.());
    if (pt && validTarget(pt, px, py, c.leashTargetRange)) return candidate(pt, 'alvo_do_heroi');
    // 3) mais próximo (desligado por padrão — Bloco 4: engageNearest)
    if (!c.engageNearest) return null;
    for (let i = 0; i < arr.length; i++) {
      const m = arr[i];
      if (!validTarget(m, px, py, c.aggroRange)) continue;
      const d = Math.hypot(tmp.x - pos.x, tmp.y - pos.y);
      if (d < bestD) { bestD = d; best = m; }
    }
    if (best) return candidate(best, 'mais_proximo');
    return null;
  }
  let candReason = '';
  function candidate(m, reason) { candReason = reason; return m; }
  function setPick(m, reason) {
    if (targetUid !== m.uid) log('target', { uid: m.uid, reason });
    targetUid = m.uid;
    targetReason = reason;
    return m;
  }
  function dropTarget(why) {
    if (targetUid != null) log('drop', { uid: targetUid, why });
    targetUid = null;
    targetReason = '';
  }

  let bossChk = 0; let bossNearV = false;
  /** Há chefe vivo a ≤ bossFollowRange tiles? (checado no máx. 4×/s) */
  function bossNear(px, py) {
    const now = clock;
    if (bossChk && now - bossChk < 250) return bossNearV;
    bossChk = now || 0.0001;
    const R = cfg().bossFollowRange ?? 14;
    bossNearV = !!stateRef?.monstersAlive?.some((m) => m.alive && m.boss && Math.hypot(m.x - px, m.y - py) <= R);
    return bossNearV;
  }
  const bossFollowActive = () => bossNearV;
  /** Ponto de voo: frente-esquerda do herói (visível em 1ª pessoa); recua se houver parede. */
  function anchor(px, py, yaw, aspect, out) {
    const c = cfg();
    const portrait = aspect && aspect < 0.9;
    // VEST/covil: com o CHEFE perto, o mini-dragão voa ATRÁS do ombro (e não entre a câmera e o chefe) —
    // na 3ª pessoa ele ficava na frente da silhueta do Gigante Verde e parecia "dois dragões fundidos".
    const bossK = bossNear(px, py);
    let side = portrait ? c.followSidePortrait : c.followSide;
    let fwd = portrait ? c.followForwardPortrait : c.followForward;
    if (bossK) { side = portrait ? (c.followSideBossPortrait ?? 0.55) : (c.followSideBoss ?? 0.95); fwd = c.followForwardBoss ?? -0.55; }
    const fx = Math.sin(yaw);
    const fy = -Math.cos(yaw);
    // esquerda = rotaciona frente -90°
    const lx = fy;
    const ly = -fx;
    for (let i = 0; i < CAND_F.length; i++) {
      const f = CAND_F[i] * fwd;
      const sd = CAND_S[i] * side;
      const ax = px + fx * f + lx * sd;
      const ay = py + fy * f + ly * sd;
      if (!blocked(Math.floor(ax), Math.floor(ay)) && hasLineOfSight(zoneRef, px, py, ax, ay)) {
        out.x = ax;
        out.y = ay;
        return out;
      }
    }
    out.x = px;
    out.y = py;
    return out;
  }

  function steer(tx, ty, maxSpeed, dt) {
    const c = cfg();
    const dx = tx - pos.x;
    const dy = ty - pos.y;
    const d = Math.hypot(dx, dy);
    // chegada suave (desacelera perto do ponto)
    const want = d > 1e-4 ? Math.min(maxSpeed, d * 4) : 0;
    const wx = d > 1e-4 ? (dx / d) * want : 0;
    const wy = d > 1e-4 ? (dy / d) * want : 0;
    const k = Math.min(1, c.acceleration * dt / Math.max(0.001, maxSpeed));
    vel.x += (wx - vel.x) * k;
    vel.y += (wy - vel.y) * k;
    const r = c.bodyRadius;
    moveAxisX(pos, vel.x * dt, r, blocked);
    moveAxisY(pos, vel.y * dt, r, blocked);
    return d;
  }

  function turnTo(yaw, dt) {
    const c = cfg();
    const diff = wrapAngle(yaw - facing);
    const maxStep = c.turnSpeedDeg * DEG * dt;
    facing = wrapAngle(facing + Math.max(-maxStep, Math.min(maxStep, diff)));
    return Math.abs(diff);
  }

  function readyAttack() {
    const c = cfg();
    let best = null;
    for (const id of stageAttacks()) {
      const def = c.attacks[id];
      if (!def) continue;
      if ((cooldowns[id] || 0) > 0) continue;
      if (!best || (def.priority || 0) > (best.def.priority || 0)) best = { id, def };
    }
    return best;
  }

  function startAttack(a) {
    atk.id = a.id;
    atk.def = a.def;
    atk.phase = 'WINDUP';
    atk.t = 0;
    atk.fired = 0;
    atk.nextIn = 0;
    setState(S.ATTACK);
    log('windup', { attack: a.id, uid: targetUid });
    deps.onCharge?.(a.id, a.def.windupMs);
  }

  function endAttack() {
    const c = cfg();
    if (atk.id) {
      // Bloco 6: MODO DIVINO (Núcleo Divino) acelera a recarga dos ataques
      cooldowns[atk.id] = atk.def.cooldownMs * (deps.getCooldownMult?.() ?? 1);
      log('attack_end', { attack: atk.id, fired: atk.fired });
    }
    atk.id = null;
    atk.def = null;
    atk.phase = '';
    recoverT = c.globalRecoveryMs;
    setState(targetUid != null ? S.COMBAT : S.RETURN);
  }

  function mouthPos(out) {
    // boca ~0.35 tile à frente do corpo
    out.x = pos.x + Math.sin(facing) * 0.3;
    out.y = pos.y - Math.cos(facing) * 0.3;
    return out;
  }

  const mouth = { x: 0, y: 0 };
  function fireOne(target) {
    const def = atk.def;
    ensurePool();
    let p = null;
    for (let i = 0; i < projectiles.length; i++) if (!projectiles[i].active) { p = projectiles[i]; break; }
    if (!p) return false;
    mouthPos(mouth);
    let aimX;
    let aimY;
    if (target) { monXY(target, tmp); aimX = tmp.x; aimY = tmp.y; } else { aimX = mouth.x + Math.sin(facing); aimY = mouth.y - Math.cos(facing); }
    let ang = Math.atan2(aimX - mouth.x, -(aimY - mouth.y));
    if (def.count > 1 && def.spreadDeg > 0) {
      // leque simétrico com leve jitter: -2,-1,0,1,2 × spread (ordem embaralhada simples)
      const slot = [0, -1, 1, -2, 2][atk.fired % 5];
      ang += (slot * def.spreadDeg + (Math.random() - 0.5) * def.spreadDeg * 0.5) * DEG;
    }
    const dist = Math.max(0.3, Math.hypot(aimX - mouth.x, aimY - mouth.y));
    const c = cfg();
    p.active = true;
    p.kind = atk.id;
    p.id = ++projSeq;
    p.x = mouth.x;
    p.y = mouth.y;
    p.h = h - 0.05;
    p.vx = Math.sin(ang) * def.speed;
    p.vy = -Math.cos(ang) * def.speed;
    // desce da boca até a altura do alvo ao longo da distância
    p.vh = ((c.targetHeight - p.h) / dist) * def.speed;
    p.dist = 0;
    p.maxRange = def.maxRange;
    p.radius = def.radius;
    // Dano: base do ataque × habilidades (passivas) × multiplicador do estágio
    p.dmg = getStat(STATS.ABILITY_DAMAGE, def.damage);
    p.age = 0;
    p.hitUid = null;
    atk.fired++;
    log('fire', { attack: atk.id, n: atk.fired, uid: target ? target.uid : null, pid: p.id });
    deps.onFire?.(atk.id, { n: atk.fired, x: p.x, y: p.y });
    return true;
  }

  function pushImpact(x, y, hh, kind, big) {
    const im = impacts[impactNext];
    impactNext = (impactNext + 1) % impacts.length;
    im.x = x; im.y = y; im.h = hh; im.kind = kind; im.big = big; im.t = clock; im.seq = ++impactSeq;
    deps.onImpact?.(kind, x, y, big);
  }

  function effectiveDamage(p, mon) {
    const c = cfg();
    let dmg = p.dmg;
    if (c.applyDefense) {
      const def = stateRef._monsters?.[mon.id];
      dmg -= Math.floor((def?.defesa || 0) / 2);
    }
    return Math.max(1, Math.round(dmg));
  }

  function updateProjectiles(dt) {
    const arr = stateRef.monstersAlive;
    const bodyR = getConfig().enemyAi.bodyRadius;
    for (let i = 0; i < projectiles.length; i++) {
      const p = projectiles[i];
      if (!p.active) continue;
      p.age += dt;
      // sub-passos: nunca atravessa parede nem inimigo
      const speed = Math.hypot(p.vx, p.vy);
      const steps = Math.max(1, Math.ceil((speed * dt) / 0.12));
      const sdt = dt / steps;
      for (let s = 0; s < steps && p.active; s++) {
        p.x += p.vx * sdt;
        p.y += p.vy * sdt;
        p.h += p.vh * sdt;
        p.dist += speed * sdt;
        if (p.h < 0.25) p.vh = 0;
        if (blocked(Math.floor(p.x), Math.floor(p.y))) {
          p.active = false;
          log('wall', { attack: p.kind, pid: p.id });
          pushImpact(p.x - p.vx * sdt, p.y - p.vy * sdt, p.h, p.kind, p.kind === 'chama_concentrada');
          break;
        }
        for (let j = 0; j < arr.length; j++) {
          const m = arr[j];
          if (!m.alive || m.zone !== stateRef.zoneId) continue;
          monXY(m, tmp);
          const mr = m.boss ? getConfig().arenaBoss.bodyRadius : bodyR; // Bloco 7: chefe colossal
          if (Math.hypot(tmp.x - p.x, tmp.y - p.y) <= mr + p.radius) {
            p.active = false;
            const amount = effectiveDamage(p, m);
            const big = p.kind === 'chama_concentrada';
            const adef = getConfig().dragon.attacks[p.kind] || {};
            const res = deps.damage(m, amount, { fromX: pos.x, fromY: pos.y, heavy: big, attack: p.kind,
              knockbackScale: adef.knockback ?? 1, noStun: !adef.canStun });
            log('hit', { attack: p.kind, uid: m.uid, dmg: amount, killed: !!res?.killed, pid: p.id });
            pushImpact(tmp.x, tmp.y, getConfig().dragon.targetHeight, p.kind, big);
            break;
          }
        }
        if (p.active && p.dist >= p.maxRange) {
          p.active = false;
          pushImpact(p.x, p.y, p.h, p.kind, false);
        }
      }
    }
  }

  /**
   * @param {number} dt segundos de JOGO (0 = congelado)
   * @param {{ state, px, py, yaw, aspect }} ctx
   */
  function update(dt, ctx) {
    stateRef = ctx.state;
    if (!stateRef) return;
    zoneRef = deps.getZone(stateRef);
    if (!zoneRef) return;
    const c = cfg();
    const { px, py } = ctx;
    if (!placed) teleportToPlayer(px, py, ctx.yaw, ctx.aspect);
    if (!enabled || !c.enabled || dt <= 0) return;
    const ms = dt * 1000;
    clock += ms;
    stT += ms;
    for (const id in cooldowns) if (cooldowns[id] > 0) cooldowns[id] = Math.max(0, cooldowns[id] - ms);
    if (recoverT > 0) recoverT = Math.max(0, recoverT - ms);
    stats.level = stateRef.dragon?.level || 1;

    // pairar
    h += ((c.hoverHeight + Math.sin(clock / 380) * c.hoverBobAmp) - h) * Math.min(1, dt * 6);

    // teleporte de segurança (preso atrás de paredes / muito longe)
    const dPlayer = Math.hypot(pos.x - px, pos.y - py);
    if (dPlayer > c.teleportDistance || (dPlayer > c.leashDistance + 1 && !hasLineOfSight(zoneRef, pos.x, pos.y, px, py))) {
      farT += ms;
      if (farT > c.teleportAfterMs || dPlayer > c.teleportDistance) { teleportToPlayer(px, py, ctx.yaw, ctx.aspect); log('teleport'); }
    } else farT = 0;

    // alvo atual ainda válido?
    let target = findMon(targetUid);
    if (targetUid != null && (!target || !validTarget(target, px, py, c.leashTargetRange))) {
      dropTarget(target ? 'fora_da_area' : 'morto');
      target = null;
      if (st === S.COMBAT) setState(S.RETURN);
    }

    // busca / reavaliação periódica (atacante do herói tem prioridade)
    searchAcc += ms;
    if (searchAcc >= c.searchIntervalMs && st !== S.ATTACK) {
      searchAcc = 0;
      const prev = targetUid;
      const m = pickTarget(px, py);
      if (m && prev == null) {
        reactT = c.reactionMs;
        setState(S.SEARCH_TARGET);
      }
      target = findMon(targetUid);
    }

    const ax = anchor(px, py, ctx.yaw, ctx.aspect, anchorOut);
    switch (st) {
      case S.FOLLOW:
      case S.IDLE:
      case S.RETURN: {
        const d = steer(ax.x, ax.y, c.speed * stats.speedMult, dt);
        turnTo(Math.hypot(vel.x, vel.y) > 0.4 ? Math.atan2(vel.x, -vel.y) : ctx.yaw, dt);
        if (st === S.RETURN && d < c.followArriveDist * 2) setState(S.FOLLOW);
        else if (st === S.FOLLOW && d < c.followArriveDist) setState(S.IDLE);
        else if (st === S.IDLE && d > c.followArriveDist * 3) setState(S.FOLLOW);
        break;
      }
      case S.SEARCH_TARGET: {
        steer(ax.x, ax.y, c.speed, dt);
        if (target) { monXY(target, tmp); turnTo(Math.atan2(tmp.x - pos.x, -(tmp.y - pos.y)), dt); }
        reactT -= ms;
        if (!target) setState(S.RETURN);
        else if (reactT <= 0) setState(S.COMBAT);
        break;
      }
      case S.COMBAT: {
        if (!target) { setState(S.RETURN); break; }
        monXY(target, tmp);
        const tx = tmp.x;
        const ty = tmp.y;
        const dT = Math.hypot(tx - pos.x, ty - pos.y);
        // posição: ponto de voo; se fora de alcance/visão, avança até a coleira
        let gx = ax.x;
        let gy = ax.y;
        const los = hasLineOfSight(zoneRef, pos.x, pos.y, tx, ty);
        if (dT > c.attackRange * 0.9 || !los) {
          const vx = tx - px;
          const vy = ty - py;
          const vl = Math.hypot(vx, vy) || 1;
          const reach = Math.min(c.leashDistance, vl);
          gx = px + (vx / vl) * reach;
          gy = py + (vy / vl) * reach;
          if (blocked(Math.floor(gx), Math.floor(gy))) { gx = ax.x; gy = ax.y; }
        }
        steer(gx, gy, c.combatSpeed, dt);
        const off = turnTo(Math.atan2(tx - pos.x, -(ty - pos.y)), dt);
        if (recoverT <= 0 && los && dT <= c.attackRange && off < 25 * DEG) {
          const a = readyAttack();
          if (a) startAttack(a);
        }
        break;
      }
      case S.ATTACK: {
        steer(ax.x, ax.y, c.combatSpeed * 0.5, dt);
        if (target) { monXY(target, tmp); turnTo(Math.atan2(tmp.x - pos.x, -(tmp.y - pos.y)), dt); }
        atk.t += ms;
        if (atk.phase === 'WINDUP') {
          if (atk.t >= atk.def.windupMs) {
            atk.phase = 'FIRE';
            atk.nextIn = 0;
          }
        }
        if (atk.phase === 'FIRE') {
          atk.nextIn -= ms;
          while (atk.nextIn <= 0 && atk.fired < atk.def.count) {
            fireOne(target);
            atk.nextIn += Math.max(1, atk.def.intervalMs);
          }
          if (atk.fired >= atk.def.count) endAttack();
        }
        break;
      }
      default:
        setState(S.FOLLOW);
    }
    // coleira dura: nunca além de leashDistance (+folga) do herói
    const lim = c.leashDistance + 0.6;
    const dd = Math.hypot(pos.x - px, pos.y - py);
    if (dd > lim && st !== S.RETURN && st !== S.FOLLOW && st !== S.IDLE) {
      steer(px, py, c.speed, dt);
    }
    updateProjectiles(dt);
  }

  function teleportToPlayer(px, py, yaw = 0, aspect = 1.6) {
    if (!zoneRef && stateRef) zoneRef = deps.getZone(stateRef);
    const a = zoneRef ? anchor(px, py, yaw, aspect, { x: 0, y: 0 }) : { x: px, y: py };
    pos.x = a.x;
    pos.y = a.y;
    vel.x = 0;
    vel.y = 0;
    facing = yaw;
    placed = true;
    farT = 0;
  }

  /** Troca de zona / início: reposiciona, zera ataque e projéteis. */
  function reset(px, py, yaw, aspect) {
    for (const p of projectiles) p.active = false;
    atk.id = null;
    atk.def = null;
    atk.phase = '';
    dropTarget('reset');
    st = S.FOLLOW;
    stT = 0;
    placed = false;
    if (Number.isFinite(px)) teleportToPlayer(px, py, yaw, aspect);
  }

  /** Aplica a regra de evolução (nível do herói). Retorna true se evoluiu agora. */
  function checkEvolution(state) {
    if (!state) return false;
    if (!state.dragon) state.dragon = { stage: 1, level: 1 };
    const need = cfg().evolveAtHeroLevel;
    if (state.dragon.stage < 2 && (state.player?.nivel || 1) >= need) {
      state.dragon.stage = 2;
      state.dragon.level = Math.max(state.dragon.level || 1, 2);
      cooldowns.chama_concentrada = 0;
      log('evolve', { stage: 2 });
      deps.onEvolve?.(2);
      return true;
    }
    return false;
  }

  const view = {
    x: 0, y: 0, h: 0, facing: 0, state: S.FOLLOW, stage: 1, speed: 0,
    chargeKind: '', charge: 0, firing: false, projectiles, impacts, clock: 0, visible: true, divine: 0
  };
  function getView() {
    view.x = pos.x; view.y = pos.y; view.h = h; view.facing = facing; view.state = st;
    view.stage = stage(); view.speed = Math.hypot(vel.x, vel.y); view.clock = clock;
    view.chargeKind = atk.phase === 'WINDUP' ? atk.id : '';
    view.charge = atk.phase === 'WINDUP' && atk.def ? Math.min(1, atk.t / atk.def.windupMs) : 0;
    view.firing = atk.phase === 'FIRE';
    view.visible = enabled && cfg().enabled && placed;
    view.divine = deps.getDivine?.() || 0;
    return view;
  }

  function getDebug() {
    let active = 0;
    for (const p of projectiles) if (p.active) active++;
    return {
      x: +pos.x.toFixed(3), y: +pos.y.toFixed(3), h: +h.toFixed(2), facing: +facing.toFixed(3), state: st,
      stage: stage(), target: targetUid, targetReason, attack: atk.id, phase: atk.phase,
      cooldowns: { ...cooldowns }, recoverMs: recoverT, activeProjectiles: active, clock: Math.round(clock),
      stats: { ...stats }, enabled, bossFollow: bossFollowActive(),
      divine: deps.getDivine?.() || 0, cooldownMult: deps.getCooldownMult?.() ?? 1
    };
  }

  return {
    update,
    reset,
    teleportToPlayer,
    checkEvolution,
    getView,
    getDebug,
    getEvents: () => events.slice(),
    clearEvents: () => { events.length = 0; },
    /** Desligar interrompe tudo (projéteis, ataque em preparo, alvo): religar nunca retoma uma rajada antiga. */
    setEnabled: (v) => {
      enabled = !!v;
      if (enabled) return;
      for (const p of projectiles) p.active = false;
      atk.id = null; atk.def = null; atk.phase = '';
      dropTarget('desligado');
      st = S.FOLLOW; stT = 0;
    },
    isEnabled: () => enabled,
    /** Debug/teste: posiciona o dragão. */
    place: (x, y) => { pos.x = x; pos.y = y; vel.x = 0; vel.y = 0; placed = true; },
    resetCooldowns: () => { for (const id in cooldowns) cooldowns[id] = 0; recoverT = 0; },
    /** Teste: dispara 1 projétil do ataque `id` a partir de (x,y) no ângulo yaw (colisão com parede). */
    debugFire: (id, x, y, yaw) => {
      const def = cfg().attacks[id];
      if (!def) return false;
      const save = { px: pos.x, py: pos.y, f: facing, id: atk.id, d: atk.def, n: atk.fired };
      pos.x = x; pos.y = y; facing = yaw;
      atk.id = id; atk.def = { ...def, count: 1, spreadDeg: 0 }; atk.fired = 0;
      const ok = fireOne(null);
      pos.x = save.px; pos.y = save.py; facing = save.f; atk.id = save.id; atk.def = save.d; atk.fired = save.n;
      return ok;
    },
    stats
  };
}
