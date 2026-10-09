/**
 * NEXARA — EVO: comportamento por ARQUÉTIPO (A lâmina · B vespa · C atirador · D couraça ·
 * E tecelão · F elite · G guardião) + projéteis e zonas de perigo de inimigos.
 *
 * Roda DENTRO dos estados da IA genérica (CHASE / ATTACK_PREPARE / ATTACK / RECOVERY / STUN),
 * então fichas de ataque, colisão, separação, lock-on, dragão e testes antigos continuam valendo.
 * Rótulos extras para HUD/testes:
 *   r.behavior ∈ chase · keep_distance · attack · retreat · reposition · group · flank · protect · special · recover
 *   r.atkPhase ∈ TELEGRAPH → WINDUP → ATTACK → RECOVERY   (todo ataque importante passa pelos 4)
 * Dano sempre por actions.monsterAttackPlayer (esquiva/i-frames, defesa, escudo, morte).
 * Números em gameplay-config.js → archetypes / enemyHazards.
 */
import { getConfig, DEG } from './gameplay-config.js?v=20261009fast2';
import { hasLineOfSight, wrapAngle } from './collision.js?v=20261009fast2';
import { isWalkable } from './map.js?v=20261009fast2';

export const ARCH_IDS = Object.freeze(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
const RANGED = new Set(['C', 'E']);
let rangedBusy = 0;

/** Projéteis e zonas de perigo vivos (arrays reaproveitados — sem alocação por frame no caminho quente). */
export const projectiles = [];
export const hazards = [];
const evStats = { shots: 0, projHits: 0, hazardsSpawned: 0, hazardTicks: 0, lunges: 0, slams: 0, novas: 0, charges: 0, phaseChanges: 0 };
let playerSlow = 1;

export function archCfg(arch) { return getConfig().archetypes?.[arch] || null; }
export function getHazardStats() { return { ...evStats, projectiles: projectiles.filter((p) => p.alive).length, hazards: hazards.filter((h) => h.alive).length }; }
export function getPlayerSlow() { return playerSlow; }
export function clearEnemyHazards() {
  for (const p of projectiles) p.alive = false;
  for (const h of hazards) h.alive = false;
  rangedBusy = 0;
  playerSlow = 1;
}

function caps() {
  const g = getConfig().enemyHazards;
  return { proj: g.maxProjectiles, haz: g.maxHazards };
}

function spawnProjectile(owner, x, y, dx, dy, a, now) {
  let p = projectiles.find((q) => !q.alive);
  if (!p) {
    if (projectiles.length >= caps().proj) return null;
    p = {};
    projectiles.push(p);
  }
  p.alive = true; p.owner = owner; p.x = x; p.y = y;
  p.vx = dx * a.projSpeed; p.vy = dy * a.projSpeed; p.r = a.projRadius; p.until = now + a.projLifeMs;
  p.atkMult = a.atkMult; p.born = now;
  evStats.shots++;
  return p;
}

export function spawnHazard(owner, x, y, a, now, kind = 'tecelao') {
  let h = hazards.find((q) => !q.alive);
  if (!h) {
    if (hazards.length >= caps().haz) {
      // substitui a mais antiga (limite do preset)
      h = hazards.reduce((o, q) => (q.born < o.born ? q : o), hazards[0]);
    } else { h = {}; hazards.push(h); }
  }
  h.alive = true; h.owner = owner; h.x = x; h.y = y; h.r = a.radius; h.kind = kind;
  h.armAt = now + a.armMs; h.until = now + a.armMs + a.durationMs; h.nextTick = now + a.armMs;
  h.tickMs = a.tickMs; h.atkMult = a.atkMult; h.slow = a.slow; h.born = now;
  evStats.hazardsSpawned++;
  return h;
}

/** Atualiza projéteis e zonas (chamado 1× por tick da IA). */
export function tickHazards(K, state, zone, P, now, dtSec) {
  const pr = P.playerRadius || 0.3;
  for (const p of projectiles) {
    if (!p.alive) continue;
    const owner = state.monstersAlive.find((m) => m.uid === p.owner && m.alive);
    if (!owner || now >= p.until) { p.alive = false; continue; }
    p.x += p.vx * dtSec;
    p.y += p.vy * dtSec;
    if (!isWalkable(zone, Math.floor(p.x), Math.floor(p.y))) { p.alive = false; continue; }
    if (Math.hypot(p.x - P.px, p.y - P.py) <= p.r + pr) {
      p.alive = false;
      const res = K.attack(state, p.owner, { rangeChecked: true, atkMult: p.atkMult, projectile: true });
      if (res) { K.result.attacks.push(res); evStats.projHits++; }
      K.logEvent('PROJ_HIT', owner, { hit: !!res, dodged: !!(res && res.dodged) });
    }
  }
  let slow = 1;
  for (const h of hazards) {
    if (!h.alive) continue;
    if (now >= h.until) { h.alive = false; continue; }
    const owner = state.monstersAlive.find((m) => m.uid === h.owner && m.alive);
    if (!owner && h.kind !== 'boss') { h.alive = false; continue; }
    if (now < h.armAt) continue;
    const inside = Math.hypot(h.x - P.px, h.y - P.py) <= h.r + pr * 0.5;
    if (inside) {
      slow = Math.min(slow, 1 - (h.slow || 0));
      if (now >= h.nextTick && owner) {
        h.nextTick = now + h.tickMs;
        const res = K.attack(state, h.owner, { rangeChecked: true, atkMult: h.atkMult, hazard: true });
        if (res) { K.result.attacks.push(res); evStats.hazardTicks++; }
      }
    }
  }
  playerSlow = slow;
}

/** HP% → fase do guardião (G). */
function guardianPhase(mon, A) {
  const pct = mon.hpMax ? mon.hp / mon.hpMax : 1;
  let idx = 0;
  for (let i = 0; i < A.phases.length; i++) if (pct <= A.phases[i].at + 1e-9) idx = i;
  return idx;
}

function moveCfg(r, A) {
  if (r.move === 'special') return A.special;
  if (r.move === 'charge') return A.charge;
  if (r.move === 'nova') return A.nova;
  if (r.move === 'roar') return { kind: 'roar', telegraphMs: 900, windupMs: 200, activeMs: 200, recoveryMs: 400, radius: 2.2, atkMult: 0 };
  return A.attack;
}

/** Vista de telegraph para o renderer (sem alocação: objeto do runtime). */
function setTele(r, a, P, lockAim) {
  const t = r.tele || (r.tele = { kind: '', x: 0, y: 0, dirX: 0, dirY: 1, len: 0, radius: 0, half: 0, range: 0, progress: 0, phase: '' });
  t.kind = a.kind;
  if (!lockAim) {
    const dx = P.px - r.fx;
    const dy = P.py - r.fy;
    const d = Math.hypot(dx, dy) || 1;
    t.dirX = dx / d; t.dirY = dy / d;
    t.x = P.px; t.y = P.py;
    t.len = d;
  }
  t.radius = a.radius || 0;
  t.half = (a.halfAngleDeg || 0) * DEG;
  t.range = a.range || a.lungeDist || a.maxDist || 0;
}

function startAttack(K, mon, r, move, P, result) {
  const A = archCfg(r.arch);
  r.move = move;
  const a = moveCfg(r, A);
  r.didImpact = false;
  r.lungeDone = 0;
  r.lungeHit = false;
  setTele(r, a, P, false);
  r.atkPhase = 'TELEGRAPH';
  r.behavior = move === 'attack' ? 'attack' : 'special';
  if (RANGED.has(r.arch)) { r.rangedSlot = true; rangedBusy++; }
  K.setState(mon, r, K.S.ATTACK_PREPARE, { arch: r.arch, move, kind: a.kind });
  K.logEvent('TELEGRAPH', mon, { arch: r.arch, move, kind: a.kind });
  result.prepares++;
  // M10 passo 2: som de aviso por tipo de golpe (corpo a corpo / à distância / área / rival BOT)
  result.prepKind = mon.rival ? 'rival' : RANGED.has(r.arch) ? 'ranged' : (a.kind === 'nova' || a.kind === 'roar' || a.kind === 'slam' || a.kind === 'hazard' || (a.radius && !a.halfAngleDeg && a.radius >= 2)) ? 'area' : 'melee';
}

/**
 * BUG "vilões param de atacar": rangedBusy era só um contador. Atirador/Tecelã que MORRIA (ou era
 * reciclado pelo pool / reinício de onda) no meio do disparo nunca devolvia a vaga → com 2 vagas
 * perdidas NENHUM inimigo à distância (C, C2, E) atacava de novo até trocar de zona.
 * Agora a IA recalcula as vagas a cada quadro a partir de quem está VIVO e atacando de verdade.
 */
export function recountRanged(bodies, n, S) {
  let c = 0, fixed = 0;
  for (let k = 0; k < n; k++) {
    const r = bodies[k].rt;
    if (!r || !r.rangedSlot) continue;
    if (r.state === S.ATTACK_PREPARE || r.state === S.ATTACK || r.state === S.RECOVERY) c++;
    else { r.rangedSlot = false; fixed++; }
  }
  if (c !== rangedBusy) fixed += Math.abs(rangedBusy - c);
  rangedBusy = c;
  return fixed;
}
export function rangedBusyCount() { return rangedBusy; }
function releaseRanged(r) {
  if (r.rangedSlot) { r.rangedSlot = false; rangedBusy = Math.max(0, rangedBusy - 1); }
}

function impact(K, state, zone, mon, r, a, P, result, dist, toPlayer) {
  const pr = P.playerRadius || 0.3;
  const bodyR = K.bodyR(mon);
  let hit = false;
  const t = r.tele;
  switch (a.kind) {
    case 'cone': {
      const ang = Math.abs(wrapAngle(toPlayer - r.facing));
      hit = dist - bodyR - pr <= a.range - 0.3 && (ang <= a.halfAngleDeg * DEG || dist < bodyR + pr + 0.25) && hasLineOfSight(zone, r.fx, r.fy, P.px, P.py);
      break;
    }
    case 'slam': case 'nova': case 'roar':
      hit = a.atkMult > 0 && dist - pr <= a.radius;
      if (a.kind === 'slam') evStats.slams++; else if (a.kind === 'nova') evStats.novas++;
      break;
    case 'shot': {
      spawnProjectile(mon.uid, r.fx + t.dirX * 0.45, r.fy + t.dirY * 0.45, t.dirX, t.dirY, a, K.clock());
      K.logEvent('SHOT', mon, {});
      return null;
    }
    case 'hazard': {
      spawnHazard(mon.uid, t.x, t.y, a, K.clock());
      K.logEvent('HAZARD', mon, { x: +t.x.toFixed(2), y: +t.y.toFixed(2) });
      return null;
    }
    default: return null;
  }
  let res = null;
  if (hit) {
    res = K.attack(state, mon.uid, { rangeChecked: true, atkMult: a.atkMult, archetype: r.arch });
    if (res) result.attacks.push(res);
  }
  if (!res) result.whiffs++;
  r.lastImpactHit = !!res && !res.dodged;
  K.logEvent('IMPACT', mon, { arch: r.arch, kind: a.kind, hit: !!res, dodged: !!(res && res.dodged), dist: +dist.toFixed(2) });
  return res;
}

/**
 * Decisão de um inimigo com arquétipo. Retorna true se tratou o estado (senão a IA genérica segue).
 * Só assume os estados de combate; IDLE/PATROL/DETECT/ALERT/RETURN ficam com a IA genérica.
 */
/** M10: vagas do cerco do enxame (recalculadas 1x por quadro): membros vivos a ≤ 12 tiles, ordenados por uid. */
let swarmCache = { at: -1, ids: [], base: 0 };
export const swarmTicks = { n: 0 };
function swarmSlots(state, clock, P) {
  if (swarmCache.at === clock) return swarmCache;
  const ids = [];
  for (const m of state.monstersAlive) if (m.alive && m.tac === 'swarm' && Math.hypot(m.x + 0.5 - P.px, m.y + 0.5 - P.py) <= 12) ids.push(m.uid);
  ids.sort((a, b) => a - b);
  swarmCache = { at: clock, ids, base: ((P.yaw ?? 0) - Math.PI / 2) };
  return swarmCache;
}
export function thinkArchetype(K, state, zone, mon, r, P, dtSec, cfg, result) {
  const A = archCfg(r.arch);
  if (!A) return false;
  const S = K.S;
  const clock = K.clock();
  const dpx = P.px - r.fx;
  const dpy = P.py - r.fy;
  const dist = Math.hypot(dpx, dpy) || 1e-6;
  const toPlayer = Math.atan2(dpx, -dpy);
  const t = clock - r.stateAt;
  const speed = cfg.chaseSpeed * (A.speedMult || 1) * (r.phaseSpeed || 1) * (mon.tacSpeed || 1);
  const bodyR = K.bodyR(mon);
  const reach = cfg.combatRange + Math.max(0, bodyR - cfg.bodyRadius);

  // G: troca de fase por HP → rugido + anúncio
  if (r.arch === 'G' && A.phases) {
    const ph = guardianPhase(mon, A);
    if (r.phaseIdx == null) r.phaseIdx = ph;
    if (ph > r.phaseIdx && (r.state === S.CHASE || r.state === S.RECOVERY)) {
      r.phaseIdx = ph;
      const P2 = A.phases[ph];
      r.phaseSpeed = P2.speedMult || 1;
      r.cdScale = P2.cooldownScale || 1;
      evStats.phaseChanges++;
      K.logEvent('MINIBOSS_PHASE', mon, { phase: ph + 1 });
      K.releaseToken(r, 0);
      startAttack(K, mon, r, 'roar', P, result);
      return true;
    }
  }

  switch (r.state) {
    case S.CHASE: {
      r.atkPhase = '';
      if (dist > (A.aggro || cfg.loseAggroRange) + 4) return false; // genérico decide RETURN
      const cdOk = clock >= r.nextAttackAt && clock >= K.grace();
      const los = hasLineOfSight(zone, r.fx, r.fy, P.px, P.py);
      K.turnToward(r, toPlayer, cfg.turnSpeedDeg * (r.arch === 'B' ? 1.6 : 1), dtSec);
      // RIVAIS: esquiva em curso (passo rápido com i-frames)
      if (r.arch === 'H' && clock < (r.dodgeUntil || 0)) { r.behavior = 'dodge'; r.wantVx = r.dodgeVx || 0; r.wantVy = r.dodgeVy || 0; return true; }
      if (clock < r.hitReactUntil && !A.hyperArmor) { r.behavior = 'recover'; return true; }
      // ——— à distância (C / E) ———
      if (RANGED.has(r.arch)) {
        const a = A.attack;
        if (cdOk && los && dist <= A.maxDist && dist >= A.minDist * 0.75 && rangedBusy < 2) {
          startAttack(K, mon, r, 'attack', P, result);
          return true;
        }
        if (dist < A.minDist) {
          // recua (mantém distância); se travado na parede, gira
          r.behavior = 'retreat';
          r.wantVx = (-dpx / dist) * speed;
          r.wantVy = (-dpy / dist) * speed;
          if (r.wallHit) { r.wantVx = (-dpy / dist) * speed * r.circleDir; r.wantVy = (dpx / dist) * speed * r.circleDir; }
        } else if (dist > A.maxDist || !los) {
          r.behavior = 'reposition';
          const dir = K.steerToward(zone, K.flow(), r.fx, r.fy, P.px, P.py);
          r.wantVx = dir.x * speed; r.wantVy = dir.y * speed;
        } else {
          r.behavior = 'keep_distance';
          if (clock >= r.circleFlipAt) { r.circleDir = -r.circleDir; r.circleFlipAt = clock + K.rand(1600, 2800); }
          const radial = (dist - A.preferredDist) * 0.6;
          r.wantVx = ((-dpy / dist) * r.circleDir * 0.55 + (dpx / dist) * radial) * speed;
          r.wantVy = ((dpx / dist) * r.circleDir * 0.55 + (dpy / dist) * radial) * speed;
        }
        void a;
        return true;
      }
      // ——— elite: habilidade própria por tempo ———
      if ((r.arch === 'F' || r.arch === 'H') && A.special && clock >= (r.specialAt || 0) && dist <= A.special.radius + 0.4 && clock >= K.grace() && K.tokenAvailable(cfg)) {
        K.acquire(r);
        r.specialAt = clock + A.special.everyMs;
        startAttack(K, mon, r, 'special', P, result);
        return true;
      }
      // ——— guardião: investida/onda conforme a fase ———
      if (r.arch === 'G' && cdOk && K.tokenAvailable(cfg)) {
        const moves = A.phases[r.phaseIdx || 0].moves;
        if (moves.includes('nova') && dist <= A.nova.radius && Math.random() < 0.35) { K.acquire(r); startAttack(K, mon, r, 'nova', P, result); return true; }
        if (moves.includes('charge') && dist >= 2.6 && dist <= A.charge.maxDist && los) {
          K.acquire(r);
          startAttack(K, mon, r, 'charge', P, result);
          return true;
        }
      }
      // ——— corpo a corpo (A, B, D, F, G) ———
      const a = A.attack;
      const atkReach = a.kind === 'lunge' ? a.lungeDist + 0.3 : a.kind === 'slam' ? a.radius * 0.85 : reach + (a.range - cfg.attackHitRange) * 0.5;
      // M10: enxame só ataca depois de chegar perto da sua vaga no cerco (ou após 2,5 s)
      let swarmOk = true;
      if (mon.tac === 'swarm' && r.slotAng != null) {
        const my = Math.atan2(r.fy - P.py, r.fx - P.px); let da = Math.abs(my - r.slotAng) % (Math.PI * 2); if (da > Math.PI) da = Math.PI * 2 - da;
        if (r.swarmSince == null) r.swarmSince = clock;
        swarmOk = da < 0.9 || clock - r.swarmSince > 2500;
      }
      if (cdOk && swarmOk && dist <= atkReach && los && K.tokenAvailable(cfg)) {
        K.acquire(r);
        startAttack(K, mon, r, 'attack', P, result);
        return true;
      }
      const waiting = K.attackersSize() > 0 && !r.hasToken;
      if (r.arch === 'B') {
        // flanqueia: vai para o lado/costas do herói; depois de atacar, recua um pouco
        if (clock < (r.retreatUntil || 0)) {
          r.behavior = 'retreat';
          r.wantVx = (-dpx / dist) * speed * 0.8; r.wantVy = (-dpy / dist) * speed * 0.8;
          return true;
        }
        // M10: BOTE do predador que estava à espreita — dispara reto até o herói (o golpe sai ao entrar no alcance)
        if (clock < (r.pounceUntil || 0)) {
          r.behavior = 'pounce';
          const dir = K.steerToward(zone, K.flow(), r.fx, r.fy, P.px, P.py);
          r.wantVx = dir.x * speed * 1.45; r.wantVy = dir.y * speed * 1.45;
          return true;
        }
        // M10: ENXAME cerca — cada membro ocupa um ângulo ao redor do herói (não vêm em fila)
        if (mon.tac === 'swarm') {
          const sw = swarmSlots(state, clock, P);
          const idx = sw.ids.indexOf(mon.uid);
          if (idx >= 0 && sw.ids.length >= 2) {
            const ang = sw.base + (idx / sw.ids.length) * Math.PI * 2;
            const R0 = (state._data?.arena_br?.taticas?.enxame?.raio || 1.6);
            const tx = P.px + Math.cos(ang) * R0, ty = P.py + Math.sin(ang) * R0;
            const okT = isWalkable(zone, Math.floor(tx), Math.floor(ty));
            r.behavior = 'surround'; r.slotAng = ang; swarmTicks.n++;
            const dir = K.steerToward(zone, K.flow(), r.fx, r.fy, okT ? tx : P.px, okT ? ty : P.py);
            r.wantVx = dir.x * speed; r.wantVy = dir.y * speed;
            return true;
          }
        }
        r.behavior = 'flank';
        if (clock >= (r.flankFlipAt || 0)) { r.flankSide = Math.random() < 0.5 ? -1 : 1; r.flankFlipAt = clock + A.flankMs; }
        const side = r.flankSide || 1;
        const pyaw = P.yaw ?? 0;
        // ponto de flanco: perpendicular à frente do herói (ou atrás dele)
        const fx = Math.sin(pyaw);
        const fy = -Math.cos(pyaw);
        const tx = P.px + (-fy * side - fx * 0.6) * A.flankRadius;
        const ty = P.py + (fx * side - fy * 0.6) * A.flankRadius;
        const okT = isWalkable(zone, Math.floor(tx), Math.floor(ty));
        const dir = K.steerToward(zone, K.flow(), r.fx, r.fy, okT ? tx : P.px, okT ? ty : P.py);
        r.wantVx = dir.x * speed; r.wantVy = dir.y * speed;
        return true;
      }
      if (r.arch === 'D' && !waiting) {
        // protege atiradores/tecelões próximos: fica entre eles e o herói
        const ally = K.nearestAlly(mon, r, (o) => o.rt && RANGED.has(o.rt.arch), 4.5);
        if (ally && dist > atkReach) {
          r.behavior = 'protect';
          const mx = (ally.x + P.px) / 2;
          const my = (ally.y + P.py) / 2;
          const dir = K.steerToward(zone, K.flow(), r.fx, r.fy, mx, my);
          r.wantVx = dir.x * speed; r.wantVy = dir.y * speed;
          return true;
        }
      }
      const holdR = waiting ? reach + cfg.holdRangeExtra : reach * 0.95;
      if (dist > holdR) {
        r.behavior = 'chase';
        const dir = K.steerToward(zone, K.flow(), r.fx, r.fy, P.px, P.py);
        r.wantVx = dir.x * speed; r.wantVy = dir.y * speed;
      } else if (waiting) {
        r.behavior = 'group';
        if (clock >= r.circleFlipAt) { r.circleDir = -r.circleDir; r.circleFlipAt = clock + K.rand(1400, 2600); }
        const back = dist < holdR - 0.25 ? -0.6 : 0;
        r.wantVx = ((-dpy / dist) * r.circleDir + (dpx / dist) * back) * cfg.circleSpeed;
        r.wantVy = ((dpx / dist) * r.circleDir + (dpy / dist) * back) * cfg.circleSpeed;
      } else r.behavior = 'chase';
      return true;
    }
    case S.ATTACK_PREPARE: {
      const a = moveCfg(r, A);
      const lock = t >= a.telegraphMs; // fim do TELEGRAPH: mira travada (dá para sair)
      r.atkPhase = lock ? 'WINDUP' : 'TELEGRAPH';
      if (!lock) {
        K.turnToward(r, toPlayer, cfg.prepareTurnSpeedDeg * (a.kind === 'shot' || a.kind === 'hazard' ? 2.5 : 1), dtSec);
        setTele(r, a, P, false);
      }
      r.tele.progress = Math.min(1, t / (a.telegraphMs + a.windupMs));
      r.tele.phase = r.atkPhase;
      if (a.kind === 'lunge' || a.kind === 'charge') {
        if (!lock) r.facing = Math.atan2(r.tele.dirX, -r.tele.dirY);
        r.tele.len = Math.min(a.kind === 'lunge' ? a.lungeDist + 0.6 : a.maxDist, (r.tele.len || 0) + 0.8);
        r.chargeFromX = r.fx; r.chargeFromY = r.fy;
      }
      if (t >= a.telegraphMs + a.windupMs) {
        r.atkPhase = 'ATTACK';
        r.tele.phase = 'ATTACK';
        K.setState(mon, r, S.ATTACK, { arch: r.arch, kind: a.kind });
        if (a.kind === 'lunge' || a.kind === 'charge') {
          if (a.kind === 'lunge') evStats.lunges++; else evStats.charges++;
          K.logEvent(a.kind === 'lunge' ? 'LUNGE' : 'CHARGE_START', mon, {});
        } else {
          r.didImpact = true;
          impact(K, state, zone, mon, r, a, P, result, dist, toPlayer);
        }
      }
      return true;
    }
    case S.ATTACK: {
      const a = moveCfg(r, A);
      r.atkPhase = 'ATTACK';
      if (a.kind === 'lunge' || a.kind === 'charge') {
        const spd = a.kind === 'lunge' ? a.lungeSpeed : a.speed;
        const maxD = a.kind === 'lunge' ? a.lungeDist : a.maxDist;
        r.lungeDone = Math.hypot(r.fx - r.chargeFromX, r.fy - r.chargeFromY);
        if (!r.lungeHit && dist - bodyR - (P.playerRadius || 0.3) <= a.hitRadius) {
          r.lungeHit = true;
          r.didImpact = true;
          const res = K.attack(state, mon.uid, { rangeChecked: true, atkMult: a.atkMult, archetype: r.arch });
          if (res) result.attacks.push(res); else result.whiffs++;
          K.logEvent('IMPACT', mon, { arch: r.arch, kind: a.kind, hit: !!res, dodged: !!(res && res.dodged) });
        }
        const wall = r.wallHit && t > 60;
        if (r.lungeDone >= maxD - 0.05 || wall || r.lungeHit || t > a.activeMs + 1200) {
          r.recMs = a.recoveryMs + (wall && a.wallStunMs ? a.wallStunMs : 0);
          r.vx = r.vy = 0;
          r.atkPhase = 'RECOVERY';
          K.setState(mon, r, S.RECOVERY, { arch: r.arch, wall });
          return true;
        }
        r.wantVx = r.tele.dirX * spd; r.wantVy = r.tele.dirY * spd;
        r.vx = r.wantVx; r.vy = r.wantVy;
        return true;
      }
      if (t >= a.activeMs) {
        r.recMs = a.recoveryMs;
        r.atkPhase = 'RECOVERY';
        K.setState(mon, r, S.RECOVERY, { arch: r.arch });
      }
      return true;
    }
    case S.RECOVERY: {
      r.atkPhase = 'RECOVERY';
      r.behavior = 'recover';
      if (t >= (r.recMs || A.attack.recoveryMs)) {
        K.releaseToken(r, cfg.tokenGapMs);
        releaseRanged(r);
        const cd = (r.move === 'attack' ? A.attack.cooldownMs : [700, 1100]) || [cfg.attackCooldownMinMs, cfg.attackCooldownMaxMs];
        r.nextAttackAt = clock + K.rand(cd[0], cd[1]) * (r.cdScale || 1) * (mon.cdMult || 1);
        if (r.arch === 'B') r.retreatUntil = clock + A.retreatMs;
        r.swarmSince = null;
        r.atkPhase = '';
        r.move = null;
        K.setState(mon, r, S.CHASE);
      }
      return true;
    }
    case S.STUN: {
      r.atkPhase = '';
      r.behavior = 'recover';
      releaseRanged(r);
      return false; // genérico volta a CHASE quando acabar
    }
    default: return false;
  }
}

/** O ataque em curso tem super-armadura (D/G no preparo: golpes básicos não interrompem)? */
export function hasHyperArmor(r) {
  const A = r && r.arch ? archCfg(r.arch) : null;
  return !!(A && A.hyperArmor);
}
export { RANGED as RANGED_ARCHETYPES };
