/**
 * NEXARA — IA inimiga em TEMPO REAL CONTÍNUO (Bloco 2 · gp2).
 *
 * Estados: IDLE, PATROL, DETECT, ALERT, CHASE, ATTACK_PREPARE, ATTACK,
 *          RECOVERY, STUN, RETURN (coleira), DEAD.
 *
 * - Posição float (coords de tile) + giro suave; mesma colisão de parede do
 *   herói (collision.js). mon.x/mon.y inteiros continuam sincronizados (tile
 *   do corpo) para minimapa, save e buscas por tile.
 * - Runtime pesado fica num WeakMap (não vai para o save). No monstro só
 *   ficam homeX/homeY (inteiros, ponto de origem da coleira).
 * - Relógio próprio (ms) avançado por tick(dt): pausa com modal/drawer e
 *   congela no hit-stop sem depender de performance.now().
 * - Telegraph: ATTACK_PREPARE dura attackStartupMs; o golpe só acerta se o
 *   herói ainda estiver no alcance/ângulo no frame de impacto (senão erra).
 * - Fichas de ataque: no máx. maxSimultaneousAttackers preparando/atacando;
 *   os outros cercam/aguardam em combatRange + holdRangeExtra.
 * - Dano no herói continua em actions.monsterAttackPlayer (HP, morte,
 *   respawn, log). A IA não depende do herói atacar primeiro.
 * - Todos os números em gameplay-config.enemyAi.
 */
import { getConfig, DEG } from './gameplay-config.js?v=20261009forte';
import { isWalkable, getTileType } from './map.js?v=20261009forte';
import { monsterAttackPlayer } from './actions.js?v=20261009forte';
import { moveAxisX, moveAxisY, hasLineOfSight, wrapAngle } from './collision.js?v=20261009forte';
import { thinkArchetype, tickHazards, spawnHazard, clearEnemyHazards, archCfg, hazards as enemyHazards, recountRanged, rangedBusyCount } from './enemy-behaviors.js?v=20261009forte';

export const AI_STATES = Object.freeze({
  IDLE: 'IDLE', PATROL: 'PATROL', DETECT: 'DETECT', ALERT: 'ALERT', CHASE: 'CHASE',
  ATTACK_PREPARE: 'ATTACK_PREPARE', ATTACK: 'ATTACK', RECOVERY: 'RECOVERY',
  STUN: 'STUN', RETURN: 'RETURN', DEAD: 'DEAD'
});
const S = AI_STATES;
const ARENA_ZONE = 'zone_arena';
const MAX_SUBSTEP = 0.2;
const MAX_DT = 0.1;
const ARRIVE_EPS = 0.12;
const EVENT_CAP = 200;

let aiEnabled = true;
let clock = 0;          // ms (relógio da IA)
let graceUntil = 0;     // ms no relógio da IA
let tokenFreeAt = 0;
let tokenTick = 0;
/** e2e: ?tokfix=0 reproduz o bug antigo (sem liberar a ficha do chefe e sem a rede de segurança). */
const TOKFIX = !/[?&]tokfix=0/.test(globalThis.location?.search || '');
const tokenStats = { leaksFixed: 0, rangedFixed: 0 };
export function getTokenStats() { return { ...tokenStats, rangedBusy: rangedBusyCount(), attackers: attackers.size, freeInMs: Math.max(0, Math.round(tokenFreeAt - clock)) }; }
let lastZoneId = null;
const attackers = new Set();
const runtimes = new WeakMap();
const events = [];

/** Corpos inimigos da zona atual (reutilizados) — herói usa para não sobrepor. */
const bodies = [];
const tickResult = { attacks: [], moved: false, prepares: 0, whiffs: 0, bossTele: null, bossHit: null, bossPhase: 0 };

// —— campo de fluxo (BFS a partir do tile do herói) ——
let flow = null;
let flowW = 0;
let flowH = 0;
let flowZoneId = null;
let flowTx = -1;
let flowTy = -1;
let bfsQueue = null;

// —— contexto de colisão (função estável, sem closures por frame) ——
let colState = null;
let colZone = null;
function blockedForEnemy(tx, ty) {
  const zone = colZone;
  if (!isWalkable(zone, tx, ty)) return true;
  const t = getTileType(zone, tx, ty);
  if (t === 'exit_e4' || t === 'exit_g6') return true; // não fica em cima da saída
  const npcs = colState._data.npcs.npcs;
  for (let i = 0; i < npcs.length; i++) {
    const n = npcs[i];
    if (n.zone === zone.id && n.x === tx && n.y === ty) return true;
  }
  return false;
}

/** Bloco 7: o chefe nunca sai do covil — colunas a oeste de arenaBoss.territoryMinX contam como parede. */
let curBossMinX = null;
let curBossMaxY = null; // ARENA PRINCIPAL: território do dragão também limitado ao sul (Zona de Elite fica fora)
function blockedForBoss(tx, ty) {
  const minX = curBossMinX != null ? curBossMinX : getConfig().arenaBoss.territoryMinX;
  if (tx < Math.floor(minX) + 1) return true;
  if (curBossMaxY != null && ty > curBossMaxY) return true;
  return blockedForEnemy(tx, ty);
}

/** Bloco 7: raio do corpo por monstro (o chefe é colossal). */
export function monBodyRadius(mon) {
  const cfg = getConfig();
  if (mon && mon.boss) return cfg.arenaBoss.bodyRadius;
  const ar = mon && mon.arch ? cfg.archetypes?.[mon.arch] : null;
  return ar && ar.bodyRadius ? ar.bodyRadius : cfg.enemyAi.bodyRadius;
}

export function setAiEnabled(v) { aiEnabled = !!v; }
export function isAiEnabled() { return aiEnabled; }
/** Janela sem ataques (zona nova / início). Padrão: enemyAi.spawnGraceMs. */
export function grantAiGrace(ms) {
  const cfg = getConfig().enemyAi;
  const dur = Number.isFinite(ms) ? Math.max(0, ms) : cfg.spawnGraceMs;
  graceUntil = Math.max(graceUntil, clock + dur);
}
export function clearAiGrace() { graceUntil = 0; }
export function getAiClock() { return clock; }
export function isGraceActive() { return clock < graceUntil; }
export function graceRemainingMs() { return Math.max(0, graceUntil - clock); }

function logEvent(type, mon, extra) {
  if (events.length >= EVENT_CAP) events.shift();
  events.push({ t: clock, real: performance.now(), type, uid: mon ? mon.uid : 0, ...(extra || {}) });
}
/** Linha do tempo de eventos da IA (e2e / debug). */
export function getAiEvents() { return events.slice(); }
export function clearAiEvents() { events.length = 0; }

function rand(a, b) { return a + Math.random() * (b - a); }

// —— EVO: kit de funções para o comportamento por arquétipo (enemy-behaviors.js) ——
const K = {
  S: AI_STATES,
  clock: () => clock,
  grace: () => graceUntil,
  setState: (mon, r, st, extra) => setState(mon, r, st, extra),
  releaseToken: (r, gap) => releaseToken(r, gap),
  tokenAvailable: (cfg) => tokenAvailable(cfg),
  acquire: (r) => { r.hasToken = true; attackers.add(r); },
  attackersSize: () => attackers.size,
  steerToward: (zone, buf, fx, fy, tx, ty) => steerToward(zone, buf, fx, fy, tx, ty),
  turnToward: (r, target, sp, dt) => turnToward(r, target, sp, dt),
  flow: () => flow,
  logEvent: (type, mon, extra) => logEvent(type, mon, extra),
  attack: (state, uid, opts) => monsterAttackPlayer(state, uid, opts),
  rand: (a, b) => rand(a, b),
  bodyR: (mon) => monBodyRadius(mon),
  result: null,
  nearestAlly(mon, r, pred, maxD) {
    let best = null; let bd = maxD;
    for (const b of bodies) {
      if (!b.active || b.uid === mon.uid || !pred(b)) continue;
      const d = Math.hypot(b.x - r.fx, b.y - r.fy);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }
};

// —— EVO: POSTURA / QUEBRA (stagger) ——
function postureMaxFor(mon, def) {
  const c = getConfig().posture;
  if (Number.isFinite(def?.postura)) return def.postura;
  const tier = mon.boss ? 'chefe' : def?.tier || 'comum';
  return c.maxByTier[tier] || c.maxByTier.comum;
}
/**
 * Soma postura (golpes do herói/dragão). Cheia → QUEBRA: atordoado por breakMs, recebe dano extra.
 * @returns {{ broke:boolean, posture:number, max:number }}
 */
const postureOut = { broke: false, posture: 0, max: 0 };
/** e2e: isola a postura em testes que medem números exatos de dano/Nexa (config é congelado). */
let postureForcedOff = false;
export function setPostureEnabled(v) { postureForcedOff = !v; return !postureForcedOff; }
export function addPosture(state, mon, amount) {
  const c = getConfig().posture;
  postureOut.broke = false;
  if (!c || !c.enabled || postureForcedOff || !mon || !mon.alive || !(amount > 0)) return postureOut;
  const r = rtFor(mon);
  const def = state?._monsters?.[mon.id];
  r.postureMax = postureMaxFor(mon, def);
  postureOut.max = r.postureMax;
  if (clock < r.brokenUntil) { postureOut.posture = r.postureMax; return postureOut; }
  r.posture = Math.min(r.postureMax, (r.posture || 0) + amount);
  r.postureHitAt = clock;
  postureOut.posture = r.posture;
  if (r.posture >= r.postureMax) {
    const ms = mon.boss ? c.breakMsBoss : c.breakMs;
    r.brokenUntil = clock + ms;
    r.breaks = (r.breaks || 0) + 1;
    releaseToken(r, getConfig().enemyAi.tokenGapMs);
    r.stunUntil = clock + ms;
    r.nextAttackAt = Math.max(r.nextAttackAt, clock + ms + 400);
    if (r.isBoss) { r.bossAtk = null; r.comboNext = null; }
    r.move = null; r.atkPhase = '';
    r.vx = r.vy = 0;
    setState(mon, r, S.STUN, { postureBreak: true });
    logEvent('POSTURE_BREAK', mon, { ms });
    postureOut.broke = true;
  }
  return postureOut;
}
export function isPostureBroken(mon) {
  const r = mon ? runtimes.get(mon) : null;
  return !!(r && clock < r.brokenUntil);
}
export function getPosture(mon) {
  const r = mon ? runtimes.get(mon) : null;
  if (!r) return { posture: 0, max: 0, broken: false, breaks: 0 };
  return { posture: r.posture || 0, max: r.postureMax || 0, broken: clock < r.brokenUntil, brokenLeftMs: Math.max(0, Math.round(r.brokenUntil - clock)), breaks: r.breaks || 0 };
}
function decayPosture(r, dtSec) {
  if (!r.posture) return;
  const c = getConfig().posture;
  if (clock < r.brokenUntil) return;
  if (r.brokenUntil && clock >= r.brokenUntil && r.posture >= (r.postureMax || 1)) { r.posture = 0; return; }
  if (clock - (r.postureHitAt || 0) > c.decayDelayMs) r.posture = Math.max(0, r.posture - c.decayPerSec * dtSec);
}

/** EVO: alerta imediato (ondas do Campo de Ascensão entram já caçando o herói). */
/** M10 fase 7: contadores das táticas da Arena (e2e). */
export const tacStats = { pounces: 0, guardWarns: 0, eliteCalls: 0, eliteAllies: 0, surroundTicks: 0 };
export function resetTacStats() { for (const k in tacStats) tacStats[k] = 0; }
export function getTacStats() { return { ...tacStats }; }
function brTac(state) { return state?._data?.arena_br?.taticas || {}; }
export function alertMonster(mon) {
  const r = rtFor(mon);
  r.state = S.ALERT;
  r.stateAt = clock;
  return true;
}
/** EVO: zera o runtime de um monstro reaproveitado (pool de ondas). */
export function resetMonsterRuntime(mon) {
  const r = runtimes.get(mon);
  if (r) { if (TOKFIX) releaseToken(r, 0); runtimes.delete(mon); }
}
export { clearEnemyHazards };

function newRuntime(mon) {
  if (!Number.isInteger(mon.homeX) || !Number.isInteger(mon.homeY)) {
    mon.homeX = mon.x;
    mon.homeY = mon.y;
  }
  return {
    uid: mon.uid,
    fx: mon.x + 0.5, fy: mon.y + 0.5, vx: 0, vy: 0,
    wantVx: 0, wantVy: 0,
    facing: Math.random() * Math.PI * 2 - Math.PI,
    state: mon.alive ? S.IDLE : S.DEAD, stateAt: clock,
    syncX: mon.x, syncY: mon.y, wasAlive: !!mon.alive,
    nextAttackAt: 0, stunUntil: 0, hitReactUntil: 0, flashUntil: 0,
    kbVx: 0, kbVy: 0, kbUntil: 0,
    patrolX: 0, patrolY: 0, patrolWaitUntil: clock + rand(300, 1500),
    circleDir: Math.random() < 0.5 ? -1 : 1, circleFlipAt: 0,
    hasToken: false, didImpact: false, lastImpactHit: false,
    homeFlow: null, homeFlowFor: -1,
    speed: 0,
    // EVO
    arch: mon.arch || null, behavior: '', atkPhase: '', move: null, tele: null,
    posture: 0, postureMax: 0, postureHitAt: 0, brokenUntil: 0, breaks: 0
  };
}

function rtFor(mon) {
  let r = runtimes.get(mon);
  if (!r) { r = newRuntime(mon); runtimes.set(mon, r); }
  return r;
}

/** Runtime (somente leitura) para o renderer / testes. */
export function getAiView(mon) { return runtimes.get(mon) || null; }

/** Posição float do corpo (fallback: centro do tile). Objeto reutilizado. */
const posOut = { x: 0, y: 0 };
export function getMonsterPos(mon) {
  const r = runtimes.get(mon);
  if (r && r.syncX === mon.x && r.syncY === mon.y) { posOut.x = r.fx; posOut.y = r.fy; }
  else { posOut.x = mon.x + 0.5; posOut.y = mon.y + 0.5; }
  return posOut;
}

/** Array reutilizado de corpos {x,y,r,active,uid} da zona atual. */
export function getBodies() { return bodies; }
/**
 * RIVAIS: esquiva do herói rival (BOT) — passo lateral/para trás, curto, com i-frames (definidos em actions).
 * Interrompe a preparação do golpe (não o impacto já ativo). Retorna true se esquivou.
 */
export function rivalDodge(mon, fromX, fromY, opt = {}) {
  const r = runtimes.get(mon); if (!r || !mon.alive) return false;
  if (r.state === S.ATTACK || r.state === S.STUN) return false;
  let dx = r.fx - fromX, dy = r.fy - fromY; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
  const side = Math.random() < 0.5 ? -1 : 1; const vel = opt.vel || 7;
  // 60% para trás + 80% para o lado → diagonal (sai do cone do golpe seguinte)
  let vx = dx * 0.6 + (-dy) * side * 0.8, vy = dy * 0.6 + dx * side * 0.8; const n = Math.hypot(vx, vy) || 1;
  r.dodgeVx = (vx / n) * vel; r.dodgeVy = (vy / n) * vel;
  r.dodgeUntil = clock + (opt.ms || 280); r.dodgeAt = clock; r.hitReactUntil = 0;
  if (r.state === S.ATTACK_PREPARE || r.state === S.RECOVERY) { releaseToken(r, 0); setState(mon, r, S.CHASE); }
  logEvent('RIVAL_DODGE', mon, {});
  return true;
}

function setState(mon, r, st, extra) {
  if (r.state === st) return;
  r.state = st;
  r.stateAt = clock;
  if (st === S.ATTACK_PREPARE || st === S.DETECT || st === S.STUN || st === S.RETURN ||
      st === S.ATTACK || st === S.RECOVERY || st === S.CHASE) logEvent(st, mon, extra);
}

function releaseToken(r, gap) {
  if (!r.hasToken) return;
  r.hasToken = false;
  attackers.delete(r);
  tokenFreeAt = Math.max(tokenFreeAt, clock + gap);
}

function tokenAvailable(cfg) {
  return attackers.size < cfg.maxSimultaneousAttackers && clock >= tokenFreeAt;
}

function snapRuntime(mon, r) {
  r.fx = mon.x + 0.5;
  r.fy = mon.y + 0.5;
  r.vx = r.vy = 0;
  r.kbUntil = 0;
  r.syncX = mon.x;
  r.syncY = mon.y;
}

function resetForZoneEntry(mon, r) {
  releaseToken(r, 0);
  r.stunUntil = 0;
  r.kbUntil = 0;
  r.vx = r.vy = 0;
  r.didImpact = false;
  r.state = mon.alive ? S.IDLE : S.DEAD;
  r.stateAt = clock;
  r.patrolWaitUntil = clock + rand(300, 1200);
}

// —— BFS / fluxo ——
function ensureFlowBuffers(zone) {
  const w = zone.map.width || zone.map.tiles[0].length;
  const h = zone.map.height || zone.map.tiles.length;
  if (!flow || flowW !== w || flowH !== h) {
    flow = new Int16Array(w * h);
    bfsQueue = new Int32Array(w * h);
    flowW = w;
    flowH = h;
    flowZoneId = null;
  }
}

function bfsInto(buf, zone, sx, sy) {
  buf.fill(-1);
  if (sx < 0 || sy < 0 || sx >= flowW || sy >= flowH) return;
  let head = 0;
  let tail = 0;
  buf[sy * flowW + sx] = 0;
  bfsQueue[tail++] = sy * flowW + sx;
  while (head < tail) {
    const idx = bfsQueue[head++];
    const x = idx % flowW;
    const y = (idx - x) / flowW;
    const d = buf[idx] + 1;
    for (let k = 0; k < 4; k++) {
      const nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0);
      const ny = y + (k === 2 ? 1 : k === 3 ? -1 : 0);
      if (nx < 0 || ny < 0 || nx >= flowW || ny >= flowH) continue;
      const ni = ny * flowW + nx;
      if (buf[ni] !== -1) continue;
      if (!isWalkable(zone, nx, ny)) continue;
      buf[ni] = d;
      bfsQueue[tail++] = ni;
    }
  }
}

function updatePlayerFlow(zone, ptx, pty) {
  ensureFlowBuffers(zone);
  if (flowZoneId === zone.id && flowTx === ptx && flowTy === pty) return;
  bfsInto(flow, zone, ptx, pty);
  flowZoneId = zone.id;
  flowTx = ptx;
  flowTy = pty;
}

const steerOut = { x: 0, y: 0 };
/** Direção (normalizada) de (fx,fy) até (tx,ty): reta se há visão, senão pelo BFS. */
function steerToward(zone, buf, fx, fy, tx, ty) {
  let dx = tx - fx;
  let dy = ty - fy;
  if (!buf || hasLineOfSight(zone, fx, fy, tx, ty)) {
    const d = Math.hypot(dx, dy) || 1;
    steerOut.x = dx / d;
    steerOut.y = dy / d;
    return steerOut;
  }
  const cx = Math.floor(fx);
  const cy = Math.floor(fy);
  const here = buf[cy * flowW + cx];
  let best = here >= 0 ? here : 0x7fff;
  let bx = cx;
  let by = cy;
  for (let k = 0; k < 4; k++) {
    const nx = cx + (k === 0 ? 1 : k === 1 ? -1 : 0);
    const ny = cy + (k === 2 ? 1 : k === 3 ? -1 : 0);
    if (nx < 0 || ny < 0 || nx >= flowW || ny >= flowH) continue;
    const v = buf[ny * flowW + nx];
    if (v >= 0 && v < best) { best = v; bx = nx; by = ny; }
  }
  dx = bx + 0.5 - fx;
  dy = by + 0.5 - fy;
  const d = Math.hypot(dx, dy) || 1;
  steerOut.x = dx / d;
  steerOut.y = dy / d;
  return steerOut;
}

function turnToward(r, target, speedDeg, dtSec) {
  const diff = wrapAngle(target - r.facing);
  const maxStep = speedDeg * DEG * dtSec;
  r.facing = Math.abs(diff) <= maxStep ? target : wrapAngle(r.facing + Math.sign(diff) * maxStep);
}

function pickPatrolTarget(zone, r, mon, cfg) {
  for (let i = 0; i < 6; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = rand(0.5, cfg.patrolRadius);
    const tx = mon.homeX + 0.5 + Math.cos(a) * d;
    const ty = mon.homeY + 0.5 + Math.sin(a) * d;
    const ix = Math.floor(tx);
    const iy = Math.floor(ty);
    if (blockedForEnemy(ix, iy)) continue;
    if (!hasLineOfSight(zone, r.fx, r.fy, tx, ty)) continue;
    r.patrolX = ix + 0.5;
    r.patrolY = iy + 0.5;
    return true;
  }
  return false;
}

function homeFlowFor(zone, r, mon) {
  const key = mon.homeY * 1000 + mon.homeX;
  if (!r.homeFlow || r.homeFlow.length !== flowW * flowH) r.homeFlow = new Int16Array(flowW * flowH);
  if (r.homeFlowFor !== key) {
    bfsInto(r.homeFlow, zone, mon.homeX, mon.homeY);
    r.homeFlowFor = key;
  }
  return r.homeFlow;
}

/**
 * Decisão de um monstro (define wantVx/wantVy, facing e transições).
 */
function think(state, zone, mon, r, P, dtSec, cfg, arena, result) {
  const dpx = P.px - r.fx;
  const dpy = P.py - r.fy;
  const dist = Math.hypot(dpx, dpy);
  const toPlayer = Math.atan2(dpx, -dpy);
  const hx = mon.homeX + 0.5;
  const hy = mon.homeY + 0.5;
  const homeD = Math.hypot(r.fx - hx, r.fy - hy);
  // ARENA PRINCIPAL: cada tipo de monstro traz detecção/coleira próprias (mon.aggroR/leash/loseR)
  const aggroR = mon.aggroR ?? (zone.campo ? 16 : arena ? cfg.aggroRangeArena : cfg.aggroRange);
  // EVO: no Campo de Ascensão as ondas não têm coleira (arena aberta)
  const leashD = mon.leash ?? (zone.campo ? 999 : cfg.maxChaseDistance);
  const loseR = mon.loseR ?? (zone.campo ? 60 : cfg.loseAggroRange);
  const t = clock - r.stateAt;
  r.wantVx = 0;
  r.wantVy = 0;
  // Só detecta quem está dentro da coleira (evita ioiô: voltar para casa e re-aggro na hora)
  const playerHomeD = Math.hypot(P.px - hx, P.py - hy);
  const canDetect = playerHomeD <= leashD + cfg.combatRange;

  switch (r.state) {
    case S.IDLE: {
      // M10: PREDADOR à espreita — parado, quase invisível; só nota o herói de perto e dá o bote na hora
      if (mon.tac === 'lurk') {
        r.behavior = 'lurk'; mon.lurking = true;
        const LR = brTac(state).predador?.espreitaR || 6.5;
        if (dist <= LR && hasLineOfSight(zone, r.fx, r.fy, P.px, P.py)) {
          mon.lurking = false; mon.tac = 'lurk_done'; r.nextAttackAt = clock; r.pounceUntil = clock + 1600; tacStats.pounces++;
          logEvent('POUNCE', mon, { dist: +dist.toFixed(2) }); setState(mon, r, S.CHASE, { pounce: true });
        }
        break;
      }
      // M10: GUARDIÃO vigia o posto — não patrulha; avisa (encara) quem chega perto; só ataca dentro da coleira
      if (mon.tac === 'guard') {
        const AR = brTac(state).guardiao?.alertaR || 10;
        if (dist <= AR && hasLineOfSight(zone, r.fx, r.fy, P.px, P.py)) {
          turnToward(r, toPlayer, cfg.turnSpeedDeg, dtSec); r.behavior = 'guard_watch';
          if (!r.guardWarned) { r.guardWarned = true; tacStats.guardWarns++; logEvent('GUARD_WARN', mon, { dist: +dist.toFixed(2) }); }
        } else { r.behavior = 'guard_post'; if (dist > AR + 3) r.guardWarned = false; }
        if (canDetect && dist <= aggroR && hasLineOfSight(zone, r.fx, r.fy, P.px, P.py)) { setState(mon, r, S.DETECT); break; }
        if (homeD > 0.8) { setState(mon, r, S.RETURN); }
        break;
      }
      if (canDetect && dist <= aggroR && hasLineOfSight(zone, r.fx, r.fy, P.px, P.py)) { setState(mon, r, S.DETECT); break; }
      // MASTER 10: PATRULHA / ESCOLTA — a "casa" anda (diretor da Arena); longe dela → caminha até lá
      if (mon.route && homeD > 2.2) { r.routeWalk = true; setState(mon, r, S.RETURN, { route: true }); break; }
      if (clock >= r.patrolWaitUntil) {
        if (pickPatrolTarget(zone, r, mon, cfg)) setState(mon, r, S.PATROL);
        else r.patrolWaitUntil = clock + rand(cfg.patrolPauseMinMs, cfg.patrolPauseMaxMs);
      }
      break;
    }
    case S.PATROL: {
      if (canDetect && dist <= aggroR && hasLineOfSight(zone, r.fx, r.fy, P.px, P.py)) { setState(mon, r, S.DETECT); break; }
      const dx = r.patrolX - r.fx;
      const dy = r.patrolY - r.fy;
      const d = Math.hypot(dx, dy);
      if (d < ARRIVE_EPS || t > 6000) {
        r.patrolWaitUntil = clock + rand(cfg.patrolPauseMinMs, cfg.patrolPauseMaxMs);
        setState(mon, r, S.IDLE);
        break;
      }
      r.wantVx = (dx / d) * cfg.patrolSpeed;
      r.wantVy = (dy / d) * cfg.patrolSpeed;
      turnToward(r, Math.atan2(dx, -dy), cfg.turnSpeedDeg, dtSec);
      break;
    }
    case S.DETECT: {
      turnToward(r, toPlayer, cfg.turnSpeedDeg, dtSec);
      // M10: ELITE agressivo — chama aliados próximos ao detectar e pula o alerta
      if (mon.tac === 'elite' && !r.eliteCalled) {
        r.eliteCalled = true; const E2 = brTac(state).elite || {}; let n = 0;
        for (const o of state.monstersAlive) { if (n >= (E2.chamaMax || 3)) break; if (o === mon || !o.alive || !o.br || o.boss || o.guard) continue; if (Math.hypot(o.x - mon.x, o.y - mon.y) > (E2.chamaR || 8)) continue; const ro = runtimes.get(o); if (ro && ro.state !== S.IDLE && ro.state !== S.PATROL) continue; if (o.tac === 'lurk') { o.tac = 'lurk_done'; o.lurking = false; } alertMonster(o); n++; }
        tacStats.eliteCalls++; tacStats.eliteAllies += n; logEvent('ELITE_CALL', mon, { allies: n });
        setState(mon, r, S.CHASE); break;
      }
      if (t >= cfg.detectMs) setState(mon, r, S.ALERT);
      break;
    }
    case S.ALERT: {
      turnToward(r, toPlayer, cfg.turnSpeedDeg, dtSec);
      if (t >= Math.max(0, cfg.reactionTimeMs - cfg.detectMs)) setState(mon, r, S.CHASE);
      break;
    }
    case S.CHASE: {
      if (homeD > leashD || dist > loseR) {
        releaseToken(r, cfg.tokenGapMs);
        setState(mon, r, S.RETURN, { homeD: +homeD.toFixed(2), dist: +dist.toFixed(2) });
        break;
      }
      turnToward(r, toPlayer, cfg.turnSpeedDeg, dtSec);
      if (clock < r.hitReactUntil) break;
      const inReach = dist <= cfg.combatRange + 0.2;
      if (inReach && clock >= r.nextAttackAt && clock >= graceUntil && tokenAvailable(cfg) &&
          hasLineOfSight(zone, r.fx, r.fy, P.px, P.py)) {
        r.hasToken = true;
        attackers.add(r);
        r.didImpact = false;
        setState(mon, r, S.ATTACK_PREPARE, { dist: +dist.toFixed(2) });
        result.prepares++;
        break;
      }
      // Aguardando ficha → segura um pouco mais longe e circula
      const waiting = attackers.size > 0 && !r.hasToken;
      const holdR = waiting ? cfg.combatRange + cfg.holdRangeExtra : cfg.combatRange;
      if (dist > holdR) {
        const dir = steerToward(zone, flow, r.fx, r.fy, P.px, P.py);
        r.wantVx = dir.x * cfg.chaseSpeed;
        r.wantVy = dir.y * cfg.chaseSpeed;
      } else if (waiting) {
        if (clock >= r.circleFlipAt) {
          r.circleDir = -r.circleDir;
          r.circleFlipAt = clock + rand(1400, 2600);
        }
        const nx = dpx / (dist || 1);
        const ny = dpy / (dist || 1);
        // tangente + leve recuo se colado demais
        const back = dist < holdR - 0.25 ? -0.6 : 0;
        r.wantVx = (-ny * r.circleDir + nx * back) * cfg.circleSpeed;
        r.wantVy = (nx * r.circleDir + ny * back) * cfg.circleSpeed;
      }
      break;
    }
    case S.ATTACK_PREPARE: {
      // Compromete-se: não anda; acompanha o herói devagar (dá para contornar)
      turnToward(r, toPlayer, cfg.prepareTurnSpeedDeg, dtSec);
      if (t >= cfg.attackStartupMs) {
        setState(mon, r, S.ATTACK);
        // —— FRAME DE IMPACTO: só acerta se o herói ainda está no alcance/ângulo ——
        r.didImpact = true;
        const ang = Math.abs(wrapAngle(toPlayer - r.facing));
        const hit = dist <= cfg.attackHitRange && ang <= cfg.attackHalfAngleDeg * DEG &&
          hasLineOfSight(zone, r.fx, r.fy, P.px, P.py);
        r.lastImpactHit = hit;
        let res = null;
        if (hit) {
          res = monsterAttackPlayer(state, mon.uid, { rangeChecked: true });
          if (res) result.attacks.push(res);
        }
        if (!res) result.whiffs++;
        logEvent('IMPACT', mon, { hit: !!res, dmg: res ? res.dmgIn : 0, dist: +dist.toFixed(2), angDeg: Math.round(ang / DEG) });
      }
      break;
    }
    case S.ATTACK: {
      if (t >= cfg.attackActiveMs) setState(mon, r, S.RECOVERY);
      break;
    }
    case S.RECOVERY: {
      if (t >= cfg.attackRecoveryMs) {
        releaseToken(r, cfg.tokenGapMs);
        r.nextAttackAt = clock + rand(cfg.attackCooldownMinMs, cfg.attackCooldownMaxMs) * (mon.cdMult || 1);
        setState(mon, r, S.CHASE);
      }
      break;
    }
    case S.STUN: {
      if (clock >= r.stunUntil) setState(mon, r, S.CHASE);
      break;
    }
    case S.RETURN: {
      const dx = hx - r.fx;
      const dy = hy - r.fy;
      const d = Math.hypot(dx, dy);
      // patrulha/escolta andando a rota continua vigiando (não é retirada)
      if (mon.route && canDetect && dist <= aggroR && t > 400 && hasLineOfSight(zone, r.fx, r.fy, P.px, P.py) && r.routeWalk) { r.routeWalk = false; setState(mon, r, S.DETECT); break; }
      if (d < ARRIVE_EPS * 2 || (mon.route && r.routeWalk && d < 1.6)) {
        r.routeWalk = false;
        if (cfg.regenOnReturn && !mon.route) mon.hp = mon.hpMax || mon.hp;
        r.patrolWaitUntil = clock + rand(cfg.patrolPauseMinMs, cfg.patrolPauseMaxMs);
        setState(mon, r, S.IDLE);
        logEvent('HOME', mon);
        break;
      }
      const dir = steerToward(zone, homeFlowFor(zone, r, mon), r.fx, r.fy, hx, hy);
      const rs = (r.routeWalk ? cfg.patrolSpeed * 1.5 : cfg.returnSpeed) * (mon.walkMult || 1); // patrulha anda; retirada corre · RIVAIS: herói anda mais rápido
      r.wantVx = dir.x * rs;
      r.wantVy = dir.y * rs;
      turnToward(r, Math.atan2(dir.x, -dir.y), cfg.turnSpeedDeg, dtSec);
      break;
    }
    default: break;
  }
}

// ————————————————————————————————————————————————————————————————
// Bloco 7 — GIGANTE VERDE (dragão inimigo colossal). Reaproveita estados,
// colisão e corpos da IA genérica; três ataques com telegraph + recuperação:
//   golpe (garra/cauda em cone) · area (pisão: círculo de perigo) · investida (linha, para na parede).
// Todo dano passa por actions.monsterAttackPlayer (esquiva/i-frames, bloqueio, escudo, morte).
// ————————————————————————————————————————————————————————————————
function initBossRuntime(mon, r) {
  r.isBoss = true;
  r.facing = -Math.PI / 2; // olha para o portão (oeste)
  r.bossAtk = null;
  r.recMs = 0;
  r.chargeDirX = 0; r.chargeDirY = 0; r.chargeLen = 0; r.chargeDone = 0;
  r.chargeFromX = 0; r.chargeFromY = 0; r.chargeHit = false; r.chargeWall = false;
  r.touchPlayer = false; r.wallHit = false;
  r.atkCount = { golpe: 0, area: 0, investida: 0, cauda: 0, sopro: 0, aneis: 0, pocas: 0, rugido: 0 };
  r.impactCount = 0;
  // EVO: fases / combos / anéis / sopro
  r.phaseIdx = 0; r.pendingRoar = false; r.comboNext = null; r.lastAtk = null; r.lastAtk2 = null;
  r.ringHit = [false, false, false, false, false]; r.breathNext = 0; r.pools = [];
}
/** EVO: config do ataque do chefe (originais + novos). */
function bossAtkCfg(bc, atk) { return (bc.attacks && bc.attacks[atk]) || (bc.extraAttacks && bc.extraAttacks[atk]) || null; }
function bossPhaseIdx(mon, bc) {
  const ph = bc.phases || [];
  const pct = mon.hpMax ? mon.hp / mon.hpMax : 1;
  let idx = 0;
  for (let i = 0; i < ph.length; i++) if (pct <= ph[i].at + 1e-9) idx = i;
  return idx;
}
/** EVO: escolha por fase (só ataques liberados e que fazem sentido na distância/ângulo). */
function pickBossAttackPhased(r, dist, ang, bc, playerInLair) {
  const ph = (bc.phases || [])[r.phaseIdx || 0];
  if (!ph) return null;
  const rad = bc.bodyRadius;
  const W = bc.phaseWeights || {};
  const X = bc.extraAttacks || {};
  const A = bc.attacks;
  const w = {};
  for (const k of ph.attacks) {
    let ok = false;
    if (k === 'golpe') ok = dist - rad <= A.golpe.useMaxDist && ang < 75 * DEG;
    else if (k === 'cauda') ok = dist - rad <= X.cauda.range && (ang > 70 * DEG || Math.random() < 0.2);
    else if (k === 'investida') ok = playerInLair && dist - rad >= A.investida.useMinDist && dist - rad <= A.investida.maxDistance + 0.5;
    else if (k === 'sopro') ok = dist - rad <= X.sopro.useMaxDist && dist - rad >= 1.2 && ang < 50 * DEG;
    else if (k === 'area') ok = dist <= A.area.radius + 1.0;
    else if (k === 'aneis') ok = dist <= X.aneis.maxRadius - 1;
    else if (k === 'pocas') ok = dist >= 2.2 && dist <= 10;
    if (ok) w[k] = (W[k] || 1) * (k === r.lastAtk ? (k === r.lastAtk2 ? 0.1 : 0.45) : 1);
  }
  const keys = Object.keys(w);
  if (!keys.length) return null;
  let tot = 0;
  for (const k of keys) tot += w[k];
  let x = Math.random() * tot;
  for (const k of keys) { x -= w[k]; if (x <= 0) return k; }
  return keys[keys.length - 1];
}

function bossCfg() { return getConfig().arenaBoss; }

/** Comprimento livre da investida a partir de (fx,fy) na direção (dx,dy) considerando o corpo. */
function chargeClearLength(fx, fy, dx, dy, maxLen, rad) {
  const step = 0.1;
  let len = 0;
  const k = rad * 0.92;
  while (len + step <= maxLen) {
    const x = fx + dx * (len + step);
    const y = fy + dy * (len + step);
    if (blockedForBoss(Math.floor(x - k), Math.floor(y - k)) || blockedForBoss(Math.floor(x + k), Math.floor(y - k)) ||
        blockedForBoss(Math.floor(x - k), Math.floor(y + k)) || blockedForBoss(Math.floor(x + k), Math.floor(y + k))) break;
    len += step;
  }
  return len;
}

function pickBossAttack(dist, bc, playerInLair) {
  const rad = bc.bodyRadius;
  const A = bc.attacks;
  let band;
  if (dist - rad <= A.golpe.useMaxDist) band = 'near';
  else if (dist - rad <= A.area.useMaxDist) band = 'mid';
  else band = 'far';
  const w = { ...(bc.weights[band] || {}) };
  if (!playerInLair || dist - rad < A.investida.useMinDist || dist - rad > A.investida.maxDistance + 0.5) delete w.investida;
  if (dist > A.area.radius + 1.5) delete w.area;
  if (dist - rad > A.golpe.useMaxDist + 0.8) delete w.golpe;
  const keys = Object.keys(w).filter((k) => w[k] > 0);
  if (!keys.length) return null;
  let tot = 0;
  for (const k of keys) tot += w[k];
  let x = Math.random() * tot;
  for (const k of keys) { x -= w[k]; if (x <= 0) return k; }
  return keys[keys.length - 1];
}

function startBossAttack(mon, r, atk, P, bc, result) {
  r.bossAtk = atk;
  r.didImpact = false;
  r.atkCount[atk] = (r.atkCount[atk] || 0) + 1;
  r.lastAtk2 = r.lastAtk; r.lastAtk = atk;
  if (atk === 'aneis') r.ringHit = [false, false, false, false, false];
  if (atk === 'sopro') r.breathNext = 0;
  if (atk === 'investida') {
    const dx = P.px - r.fx;
    const dy = P.py - r.fy;
    const d = Math.hypot(dx, dy) || 1;
    r.chargeDirX = dx / d;
    r.chargeDirY = dy / d;
    r.facing = Math.atan2(r.chargeDirX, -r.chargeDirY);
    // passa um pouco do herói (até maxDistance) e para antes da parede
    const want = Math.min(bc.attacks.investida.maxDistance, d + 2.5);
    r.chargeLen = chargeClearLength(r.fx, r.fy, r.chargeDirX, r.chargeDirY, want, bc.bodyRadius);
    r.chargeWant = want;
    r.chargeFromX = r.fx;
    r.chargeFromY = r.fy;
    r.chargeDone = 0;
    r.chargeHit = false;
    r.chargeWall = false;
  }
  setState(mon, r, S.ATTACK_PREPARE, { boss: atk, dist: +Math.hypot(P.px - r.fx, P.py - r.fy).toFixed(2) });
  logEvent('BOSS_TELEGRAPH', mon, { attack: atk });
  result.prepares++;
  result.bossTele = atk; // EVO: som de aviso por ataque
}

function bossImpact(state, mon, r, atk, P, bc, zone, result, dist, toPlayer) {
  result.bossHit = atk; // EVO: som do impacto por ataque
  const A = bossAtkCfg(bc, atk);
  const pr = P.playerRadius || 0.3;
  let hit = false;
  let angDeg = 0;
  if (atk === 'golpe') {
    const ang = Math.abs(wrapAngle(toPlayer - r.facing));
    angDeg = Math.round(ang / DEG);
    hit = dist - bc.bodyRadius - pr <= A.range && (ang <= A.halfAngleDeg * DEG || dist < bc.bodyRadius + pr + 0.3) &&
      hasLineOfSight(zone, r.fx, r.fy, P.px, P.py);
  } else if (atk === 'area') {
    hit = dist - pr <= A.radius;
  } else if (atk === 'investida') {
    hit = dist - bc.bodyRadius - pr <= A.hitRadius;
  } else if (atk === 'cauda') {
    // varredura da cauda: atrás e nos lados (ângulo medido a partir das costas)
    const back = Math.abs(wrapAngle(toPlayer - (r.facing + Math.PI)));
    angDeg = Math.round(back / DEG);
    hit = dist - bc.bodyRadius - pr <= A.range && (back <= A.halfAngleDeg * DEG || dist < bc.bodyRadius + pr + 0.3);
  } else if (atk === 'sopro') {
    const ang = Math.abs(wrapAngle(toPlayer - r.facing));
    angDeg = Math.round(ang / DEG);
    hit = dist - bc.bodyRadius - pr <= A.range && ang <= A.halfAngleDeg * DEG && hasLineOfSight(zone, r.fx, r.fy, P.px, P.py);
  } else if (atk === 'aneis') {
    hit = true; // já validado pelo anel
  } else if (atk === 'rugido') {
    hit = false;
  }
  let res = null;
  if (hit) {
    res = monsterAttackPlayer(state, mon.uid, { rangeChecked: true, atkMult: A.atkMult, bossAttack: atk });
    if (res) result.attacks.push(res);
  }
  if (!res) result.whiffs++;
  r.lastImpactHit = !!res && !res.dodged;
  r.impactCount++;
  logEvent('IMPACT', mon, {
    boss: atk, hit: !!res, dodged: !!(res && res.dodged), dmg: res ? res.dmgIn : 0,
    dist: +dist.toFixed(2), angDeg
  });
  return res;
}

function thinkBoss(state, zone, mon, r, P, dtSec, result) {
  const bc = bossCfg();
  const dpx = P.px - r.fx;
  const dpy = P.py - r.fy;
  const dist = Math.hypot(dpx, dpy);
  const toPlayer = Math.atan2(dpx, -dpy);
  const hx = mon.homeX + 0.5;
  const hy = mon.homeY + 0.5;
  const t = clock - r.stateAt;
  const playerInLair = P.px >= (Number.isFinite(mon.territoryMinX) ? mon.territoryMinX : bc.territoryMinX) && (!Number.isFinite(mon.territoryMaxY) || P.py <= mon.territoryMaxY + 1);
  r.wantVx = 0;
  r.wantVy = 0;
  const touched = r.touchPlayer;
  r.touchPlayer = false;
  // EVO: troca de FASE assim que o HP cruza o limiar (qualquer estado); o rugido sai no próximo CHASE
  if (bc.phases && bc.phases.length) {
    const want = bossPhaseIdx(mon, bc);
    if (want > (r.phaseIdx || 0)) {
      r.phaseIdx = want;
      r.pendingRoar = true;
      logEvent('BOSS_PHASE', mon, { phase: want + 1, nome: bc.phases[want].nome });
      result.bossPhase = want + 1;
    }
  }

  switch (r.state) {
    case S.IDLE:
    case S.PATROL: {
      if (r.state === S.PATROL) setState(mon, r, S.IDLE);
      if (playerInLair && dist <= bc.aggroRange && hasLineOfSight(zone, r.fx, r.fy, P.px, P.py)) setState(mon, r, S.DETECT);
      break;
    }
    case S.DETECT:
    case S.ALERT: {
      turnToward(r, toPlayer, bc.turnSpeedDeg, dtSec);
      if (t >= bc.detectMs) {
        r.nextAttackAt = Math.max(r.nextAttackAt, clock + 250);
        setState(mon, r, S.CHASE);
      }
      break;
    }
    case S.CHASE: {
      if (!playerInLair && dist > bc.aggroRange * 2) {
        setState(mon, r, S.RETURN, { dist: +dist.toFixed(2) });
        break;
      }
      turnToward(r, toPlayer, bc.turnSpeedDeg, dtSec);
      const angP = Math.abs(wrapAngle(toPlayer - r.facing));
      const facingOk = angP < 40 * DEG;
      // EVO: troca de fase → RUGIDO (anúncio) antes de liberar os ataques novos
      if (bc.phases && bc.phases.length && r.pendingRoar) {
        // a fase já mudou (limiar de HP); o RUGIDO de anúncio sai no primeiro momento livre
        r.pendingRoar = false;
        startBossAttack(mon, r, 'rugido', P, bc, result);
        break;
      }
      if (r.comboNext && clock >= graceUntil) {
        const nx = r.comboNext;
        r.comboNext = null;
        logEvent('BOSS_COMBO', mon, { attack: nx });
        startBossAttack(mon, r, nx, P, bc, result);
        break;
      }
      if (clock >= r.nextAttackAt && clock >= graceUntil && hasLineOfSight(zone, r.fx, r.fy, P.px, P.py)) {
        const atk = bc.phases && bc.phases.length ? pickBossAttackPhased(r, dist, angP, bc, playerInLair) : (facingOk ? pickBossAttack(dist, bc, playerInLair) : null);
        if (atk && (facingOk || atk === 'cauda' || atk === 'aneis' || atk === 'pocas' || atk === 'area')) { startBossAttack(mon, r, atk, P, bc, result); break; }
      }
      if (dist - bc.bodyRadius > 1.4) {
        const dir = steerToward(zone, flow, r.fx, r.fy, P.px, P.py);
        r.wantVx = dir.x * bc.walkSpeed;
        r.wantVy = dir.y * bc.walkSpeed;
      }
      break;
    }
    case S.ATTACK_PREPARE: {
      const atk = r.bossAtk;
      const A = bossAtkCfg(bc, atk);
      if (!A) { setState(mon, r, S.CHASE); break; }
      if (atk === 'golpe' || atk === 'sopro') turnToward(r, toPlayer, bc.prepareTurnSpeedDeg, dtSec);
      // POÇAS: miram no herói até o fim do telegraph (depois ficam fixas — dá para sair)
      if (atk === 'pocas') {
        const n = A.count || 3;
        r.pools.length = 0;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + (r.atkCount.pocas || 0);
          const d = i === 0 ? 0 : A.spread;
          r.pools.push({ x: P.px + Math.cos(a) * d, y: P.py + Math.sin(a) * d });
        }
      }
      if (t >= A.telegraphMs) {
        setState(mon, r, S.ATTACK, { boss: atk });
        if (atk === 'investida') {
          logEvent('CHARGE_START', mon, { len: +r.chargeLen.toFixed(2) });
        } else if (atk === 'sopro' || atk === 'aneis') {
          logEvent(atk === 'sopro' ? 'BREATH_START' : 'RINGS_START', mon, {});
        } else if (atk === 'pocas') {
          for (const pl of r.pools) {
            if (isWalkable(zone, Math.floor(pl.x), Math.floor(pl.y))) spawnHazard(mon.uid, pl.x, pl.y, A, clock, 'boss');
          }
          logEvent('POOLS', mon, { n: r.pools.length });
        } else if (atk === 'rugido') {
          logEvent('ROAR', mon, {});
        } else {
          r.didImpact = true;
          bossImpact(state, mon, r, atk, P, bc, zone, result, dist, toPlayer);
        }
      }
      break;
    }
    case S.ATTACK: {
      const atk = r.bossAtk;
      const A = bossAtkCfg(bc, atk) || {};
      if (atk === 'sopro') {
        // varre devagar na direção do herói; 1 pulso de dano a cada tickMs
        turnToward(r, toPlayer, 22, dtSec);
        if (t >= r.breathNext) {
          r.breathNext += A.tickMs;
          r.didImpact = true;
          bossImpact(state, mon, r, atk, P, bc, zone, result, dist, toPlayer);
        }
      } else if (atk === 'aneis') {
        const pr = P.playerRadius || 0.3;
        for (let i = 0; i < A.rings; i++) {
          const rt = t - i * A.ringGapMs;
          if (rt < 0 || r.ringHit[i]) continue;
          const R = (rt / 1000) * A.ringSpeed + bc.bodyRadius;
          if (R > A.maxRadius) { r.ringHit[i] = true; continue; }
          if (Math.abs(dist - R) <= A.ringWidth / 2 + pr) {
            r.ringHit[i] = true;
            r.didImpact = true;
            bossImpact(state, mon, r, atk, P, bc, zone, result, dist, toPlayer);
          }
        }
      }
      if (atk === 'investida') {
        r.chargeDone = Math.hypot(r.fx - r.chargeFromX, r.fy - r.chargeFromY);
        // contato com o herói: um único acerto por investida
        if (!r.chargeHit && (dist - bc.bodyRadius - (P.playerRadius || 0.3) <= A.hitRadius || touched)) {
          r.chargeHit = true;
          r.didImpact = true;
          bossImpact(state, mon, r, atk, P, bc, zone, result, dist, toPlayer);
        }
        const stoppedByWall = r.wallHit && t > 60;
        const done = r.chargeDone >= r.chargeLen - 0.05 || stoppedByWall || r.chargeHit || t > 4000;
        if (done) {
          r.chargeWall = !r.chargeHit && (stoppedByWall || r.chargeLen < (r.chargeWant || 0) - 0.3);
          r.recMs = A.recoveryMs + (r.chargeWall ? A.wallStunMs : 0);
          if (r.chargeWall) logEvent('CHARGE_WALL', mon, { done: +r.chargeDone.toFixed(2) });
          const phC = (bc.phases || [])[r.phaseIdx || 0];
          if (!r.chargeWall && phC && phC.combos && bc.combos && bc.combos.investida && Math.random() < (bc.comboChance ?? 0.6)) {
            r.comboNext = bc.combos.investida;
            r.recMs = Math.round(r.recMs * 0.45);
          }
          r.vx = r.vy = 0;
          setState(mon, r, S.RECOVERY, { boss: atk, wall: r.chargeWall });
          break;
        }
        r.wantVx = r.chargeDirX * A.speed;
        r.wantVy = r.chargeDirY * A.speed;
        r.vx = r.wantVx;
        r.vy = r.wantVy;
        break;
      }
      if (t >= (A.activeMs || 200)) {
        r.recMs = A.recoveryMs || 1000;
        // EVO: fase final encadeia combos (recuperação curta → próximo golpe já com telegraph)
        const ph = (bc.phases || [])[r.phaseIdx || 0];
        if (ph && ph.combos && bc.combos && bc.combos[atk] && Math.random() < (bc.comboChance ?? 0.6)) {
          r.comboNext = bc.combos[atk];
          r.recMs = Math.round(r.recMs * 0.45);
        }
        setState(mon, r, S.RECOVERY, { boss: atk });
      }
      break;
    }
    case S.RECOVERY: {
      if (t >= r.recMs) {
        r.bossAtk = null;
        const g = bc.attackGapMs;
        const ph = (bc.phases || [])[r.phaseIdx || 0];
        r.nextAttackAt = clock + rand(g[0], g[1]) * (ph && ph.gapScale ? ph.gapScale : 1);
        setState(mon, r, S.CHASE);
      }
      break;
    }
    case S.STUN: {
      if (clock >= r.stunUntil) { r.bossAtk = null; setState(mon, r, S.CHASE); }
      break;
    }
    case S.RETURN: {
      const dx = hx - r.fx;
      const dy = hy - r.fy;
      const d = Math.hypot(dx, dy);
      if (playerInLair && dist <= bc.aggroRange) { setState(mon, r, S.CHASE); break; }
      if (d < 0.35) { setState(mon, r, S.IDLE); logEvent('HOME', mon); break; }
      const dir = steerToward(zone, null, r.fx, r.fy, hx, hy);
      r.wantVx = dir.x * bc.walkSpeed;
      r.wantVy = dir.y * bc.walkSpeed;
      turnToward(r, Math.atan2(dir.x, -dir.y), bc.turnSpeedDeg, dtSec);
      break;
    }
    default: break;
  }
}

/** Bloco 7: visão do chefe para renderer/HUD/testes (objeto reutilizado — não guardar). */
const bossViewOut = {
  state: 'IDLE', attack: null, t: 0, telegraphMs: 0, progress: 0, facing: 0, fx: 0, fy: 0,
  chargeDirX: 0, chargeDirY: 0, chargeLen: 0, chargeFromX: 0, chargeFromY: 0, chargeWall: false,
  atkCount: null, impactCount: 0, lastImpactHit: false, bodyRadius: 0, speed: 0,
  activeMs: 0, phase: 1, phaseName: '', comboNext: null, pools: null, broken: false
};
export function getBossView(mon) {
  const r = mon ? runtimes.get(mon) : null;
  if (!r || !r.isBoss) return null;
  const bc = bossCfg();
  const o = bossViewOut;
  o.state = r.state;
  o.attack = r.bossAtk;
  o.t = clock - r.stateAt;
  const AC = r.bossAtk ? bossAtkCfg(bc, r.bossAtk) : null;
  o.telegraphMs = AC ? AC.telegraphMs : 0;
  o.activeMs = AC ? AC.activeMs || 0 : 0;
  o.phase = (r.phaseIdx || 0) + 1;
  o.phaseName = bc.phases && bc.phases[r.phaseIdx || 0] ? bc.phases[r.phaseIdx || 0].nome : '';
  o.comboNext = r.comboNext;
  o.pools = r.pools;
  o.broken = clock < (r.brokenUntil || 0);
  o.progress = r.state === S.ATTACK_PREPARE && o.telegraphMs ? Math.min(1, o.t / o.telegraphMs) : 0;
  o.facing = r.facing;
  o.fx = r.fx; o.fy = r.fy;
  o.chargeDirX = r.chargeDirX; o.chargeDirY = r.chargeDirY; o.chargeLen = r.chargeLen;
  o.chargeFromX = r.chargeFromX; o.chargeFromY = r.chargeFromY; o.chargeWall = r.chargeWall;
  o.atkCount = r.atkCount; o.impactCount = r.impactCount; o.lastImpactHit = r.lastImpactHit;
  o.bodyRadius = bc.bodyRadius; o.speed = r.speed;
  return o;
}

/** Bloco 7 (e2e/debug): força o próximo ataque do chefe agora. */
export function debugBossAttack(state, uid, atk, P) {
  const mon = state.monstersAlive.find((m) => m.uid === uid);
  if (!mon || !mon.alive) return false;
  const r = rtFor(mon);
  if (!r.isBoss) initBossRuntime(mon, r);
  const p = P || { px: state.player.x + 0.5, py: state.player.y + 0.5 };
  r.facing = Math.atan2(p.px - r.fx, -(p.py - r.fy));
  startBossAttack(mon, r, atk, p, bossCfg(), tickResult);
  return true;
}

/** EVO (e2e): força a fase do chefe (o rugido de troca acontece no próximo tick). */
export function debugBossPhase(state, uid, idx) {
  const mon = state.monstersAlive.find((m) => m.uid === uid);
  if (!mon) return false;
  const r = rtFor(mon);
  if (!r.isBoss) initBossRuntime(mon, r);
  r.phaseIdx = Math.max(0, idx | 0);
  return true;
}
/** Bloco 7: zera o runtime do chefe (nova tentativa). */
export function resetBossRuntime(mon) {
  const r = mon ? runtimes.get(mon) : null;
  // BUG "vilões param de atacar": o runtime do chefe era descartado SEGURANDO a ficha de ataque
  // (morte do herói no covil → resetBossRuntime) → attackers.size ficava 1 para sempre.
  if (r) { releaseToken(r, 0); runtimes.delete(mon); }
}

/**
 * Reação a golpe do herói (chamado por player-combat no impacto).
 * @param {object} mon
 * @param {{ fromX:number, fromY:number, heavy?:boolean }} info
 * @returns {{ stunned:boolean, knockback:number }}
 */
const hitOut = { stunned: false, knockback: 0 };
export function onMonsterHit(mon, info) {
  const r = rtFor(mon);
  const ecfg = getConfig().enemyAi;
  const ccfg = getConfig().combat;
  hitOut.stunned = false;
  hitOut.knockback = 0;
  r.flashUntil = clock + 140;
  if (!mon.alive) return hitOut;
  // Knockback (resolvido com colisão no tick)
  let dx = r.fx - info.fromX;
  let dy = r.fy - info.fromY;
  const d = Math.hypot(dx, dy) || 1;
  dx /= d;
  dy /= d;
  // gp3: fontes externas (dragão) podem escalar o empurrão e não atordoar
  let kbScale = Number.isFinite(info.knockbackScale) ? info.knockbackScale : 1;
  // Bloco 7: o GIGANTE VERDE não é empurrado; atordoamento forçado reduzido e sem stun aleatório
  const bcfg = r.isBoss ? getConfig().arenaBoss : null;
  if (bcfg) {
    kbScale *= bcfg.knockbackScale;
    info = { ...info, noStun: true };
    if (Number.isFinite(info.forceStunMs) && info.forceStunMs > 0) {
      info.forceStunMs = Math.min(bcfg.maxStunMs, info.forceStunMs * bcfg.stunScale);
      // não interrompe a investida em curso
      if (r.state === S.ATTACK && r.bossAtk === 'investida') info.forceStunMs = 0;
    }
  }
  // EVO: arquétipos pesados (couraça/elite/guardião) resistem a empurrão/atordoamento; super-armadura no ataque
  const acfg = !r.isBoss && r.arch ? archCfg(r.arch) : null;
  // RIVAIS FORTES: postura do herói rival — após N golpes seguidos ganha uma janela curta de super-armadura
  // (não fica preso em reação a cada golpe; o herói ainda pode esquivar do contra-ataque, que mantém o aviso normal)
  if (mon.rival && acfg?.poise) {
    const P = acfg.poise;
    if (!(clock < (r.rivalArmorUntil || 0))) {
      r.rivalHitTimes = (r.rivalHitTimes || []).filter((t) => clock - t < P.windowMs); r.rivalHitTimes.push(clock);
      if (r.rivalHitTimes.length >= P.hits) { r.rivalArmorUntil = clock + P.armorMs; r.rivalHitTimes.length = 0; r.hitReactUntil = 0; logEvent('RIVAL_POISE', mon, {}); }
    }
    if (clock < (r.rivalArmorUntil || 0)) info = { ...info, noStun: true, forceStunMs: Number.isFinite(info.forceStunMs) ? info.forceStunMs * 0.4 : info.forceStunMs };
  }
  if (acfg) {
    if (Number.isFinite(acfg.knockbackScale)) kbScale *= acfg.knockbackScale;
    const busy = r.state === S.ATTACK_PREPARE || r.state === S.ATTACK;
    if (acfg.hyperArmor && busy) info = { ...info, noStun: true };
    if (Number.isFinite(info.forceStunMs) && info.forceStunMs > 0 && Number.isFinite(acfg.stunScale)) {
      info = { ...info, forceStunMs: info.forceStunMs * acfg.stunScale };
    }
    // investida/avanço em curso não é interrompido por empurrão
    if (r.state === S.ATTACK && (r.move === 'charge' || acfg.attack.kind === 'lunge')) kbScale = 0;
  }
  const dist = (info.heavy ? ccfg.hit3Knockback : ccfg.knockback) * kbScale;
  const dur = Math.max(1, ccfg.knockbackTimeMs);
  r.kbVx = (dx * dist) / (dur / 1000);
  r.kbVy = (dy * dist) / (dur / 1000);
  r.kbUntil = clock + dur;
  hitOut.knockback = dist;
  // Bloco 4: especiais atordoam/derrubam sempre (forceStunMs), em qualquer estado
  if (Number.isFinite(info.forceStunMs) && info.forceStunMs > 0) {
    releaseToken(r, ecfg.tokenGapMs);
    r.stunUntil = clock + info.forceStunMs;
    r.nextAttackAt = Math.max(r.nextAttackAt, clock + info.forceStunMs + ecfg.attackCooldownMinMs * 0.5);
    if (r.isBoss) { r.bossAtk = null; r.comboNext = null; }
    r.move = null; r.atkPhase = '';
    setState(mon, r, S.STUN, { heavy: true, forced: true });
    hitOut.stunned = true;
  } else if (r.state === S.ATTACK_PREPARE && !info.noStun && (info.heavy || Math.random() < ecfg.stunChance)) {
    releaseToken(r, ecfg.tokenGapMs);
    r.stunUntil = clock + ecfg.stunMs;
    r.nextAttackAt = Math.max(r.nextAttackAt, clock + ecfg.stunMs + ecfg.attackCooldownMinMs * 0.5);
    r.move = null; r.atkPhase = '';
    setState(mon, r, S.STUN, { heavy: !!info.heavy });
    hitOut.stunned = true;
  } else if (r.state === S.IDLE || r.state === S.PATROL || r.state === S.DETECT ||
             r.state === S.ALERT || r.state === S.RETURN) {
    // Foi atacado: entra em combate direto (sem tempo de reação)
    setState(mon, r, S.CHASE);
  }
  if (r.state === S.CHASE && !r.isBoss && !(mon.rival && clock < (r.rivalArmorUntil || 0))) r.hitReactUntil = clock + ecfg.hitReactMs;
  return hitOut;
}

function integrate(mon, r, dtSec, cfg) {
  // aceleração até a velocidade desejada
  const dvx = r.wantVx - r.vx;
  const dvy = r.wantVy - r.vy;
  const dvl = Math.hypot(dvx, dvy);
  if (dvl > 0) {
    const step = Math.min(dvl, (r.isBoss ? getConfig().arenaBoss.acceleration : cfg.acceleration) * dtSec);
    r.vx += (dvx / dvl) * step;
    r.vy += (dvy / dvl) * step;
  }
  let mx = r.vx * dtSec;
  let my = r.vy * dtSec;
  if (clock < r.kbUntil) {
    mx += r.kbVx * dtSec;
    my += r.kbVy * dtSec;
  }
  const dist = Math.hypot(mx, my);
  if (dist > 0) {
    const n = Math.max(1, Math.ceil(dist / MAX_SUBSTEP));
    const sx = mx / n;
    const sy = my / n;
    let hitX = false;
    let hitY = false;
    const pos = r; // fx/fy via adaptador abaixo
    const rad = r.bodyR || (r.isBoss ? getConfig().arenaBoss.bodyRadius : cfg.bodyRadius);
    for (let i = 0; i < n; i++) {
      if (!hitX && moveAxisXr(pos, sx, rad)) hitX = true;
      if (!hitY && moveAxisYr(pos, sy, rad)) hitY = true;
    }
    if (hitX) { r.vx = 0; r.kbVx = 0; }
    if (hitY) { r.vy = 0; r.kbVy = 0; }
    r.wallHit = hitX || hitY;
  } else {
    r.wallHit = false;
  }
  r.speed = Math.hypot(r.vx, r.vy);
}

// Adaptadores: collision.js opera em {x,y}; o runtime usa fx/fy.
const tmpPos = { x: 0, y: 0 };
function moveAxisXr(r, d, rad) {
  tmpPos.x = r.fx; tmpPos.y = r.fy;
  const hit = moveAxisX(tmpPos, d, rad, r.isBoss ? blockedForBoss : blockedForEnemy);
  r.fx = tmpPos.x;
  return hit;
}
function moveAxisYr(r, d, rad) {
  tmpPos.x = r.fx; tmpPos.y = r.fy;
  const hit = moveAxisY(tmpPos, d, rad, r.isBoss ? blockedForBoss : blockedForEnemy);
  r.fy = tmpPos.y;
  return hit;
}

function pushOut(r, nx, ny, amount, rad) {
  moveAxisXr(r, nx * amount, rad);
  moveAxisYr(r, ny * amount, rad);
}

let zoneCacheObj = null;
let zoneCacheList = null;
function zoneFor(state) {
  const list = state._data.zones.zones;
  if (zoneCacheObj && zoneCacheList === list && zoneCacheObj.id === state.zoneId) return zoneCacheObj;
  zoneCacheList = list;
  zoneCacheObj = null;
  for (let i = 0; i < list.length; i++) if (list[i].id === state.zoneId) { zoneCacheObj = list[i]; break; }
  return zoneCacheObj;
}

/**
 * Um passo da IA (chamado pelo rAF único do renderer via simulação do main).
 * @param {object} state
 * @param {number} dtSec segundos de jogo (0 = congelado: hit-stop / pausa)
 * @param {{ px:number, py:number, playerRadius:number, think?:boolean }} P
 * @returns {{ attacks: Array, moved: boolean }} (objeto reutilizado)
 */
/** ARENA PRINCIPAL: contadores do LOD de IA do último quadro. */
let lodFrame = 0;
const lodStats = { full: 0, reduced: 0, frozen: 0 };
export const getAiLodStats = () => ({ ...lodStats });
export function tickEnemyAi(state, dtSec, P) {
  tickResult.attacks.length = 0;
  tickResult.moved = false;
  tickResult.prepares = 0;
  tickResult.bossTele = null; tickResult.bossHit = null; tickResult.bossPhase = 0;
  tickResult.whiffs = 0;
  for (let i = 0; i < bodies.length; i++) bodies[i].active = false;
  if (!state || !state._data) return tickResult;
  const zone = zoneFor(state);
  if (!zone) return tickResult;
  const cfg = getConfig().enemyAi;
  dtSec = Math.min(Math.max(dtSec || 0, 0), MAX_DT);
  clock += dtSec * 1000;
  colState = state;
  colZone = zone;
  const arena = zone.id === ARENA_ZONE;

  const zoneChanged = lastZoneId !== zone.id;
  if (zoneChanged) {
    attackers.clear();
    clearEnemyHazards();
    tokenFreeAt = 0;
    lastZoneId = zone.id;
  }
  const allowThink = aiEnabled && P.think !== false && !state.flags?.event_0217_playing && dtSec > 0;
  K.result = tickResult;
  if (allowThink) updatePlayerFlow(zone, Math.floor(P.px), Math.floor(P.py));
  else ensureFlowBuffers(zone);

  const mons = state.monstersAlive;
  let bi = 0;
  lodFrame++; lodStats.full = 0; lodStats.reduced = 0; lodStats.frozen = 0;
  for (let i = 0; i < mons.length; i++) {
    const mon = mons[i];
    if (mon.zone !== zone.id) continue;
    const r = rtFor(mon);
    if (mon.boss && !r.isBoss) initBossRuntime(mon, r);
    if (zoneChanged) resetForZoneEntry(mon, r);
    if (r.syncX !== mon.x || r.syncY !== mon.y) snapRuntime(mon, r); // mudança externa (save/API/respawn)
    if (!mon.alive) {
      if (r.state !== S.DEAD) { releaseToken(r, cfg.tokenGapMs); setState(mon, r, S.DEAD); }
      r.wasAlive = false;
      continue;
    }
    if (!r.wasAlive) {
      r.wasAlive = true;
      snapRuntime(mon, r);
      resetForZoneEntry(mon, r);
    }
    if (r.arch === null && mon.arch) r.arch = mon.arch;
    if (!r.bodyR) r.bodyR = monBodyRadius(mon);
    if (r.isBoss) { curBossMinX = Number.isFinite(mon.territoryMinX) ? mon.territoryMinX : null; curBossMaxY = Number.isFinite(mon.territoryMaxY) ? mon.territoryMaxY : null; }
    // ARENA PRINCIPAL — LOD de IA: perto = completa · médio = pensa 1 a cada 4 quadros · longe (sem combate) = congelado
    let lod = 0;
    if (zone.br && !r.isBoss) {
      const L = state._data?.arena_br?.lodIa || {};
      const d = Math.hypot(r.fx - P.px, r.fy - P.py);
      const engaged = r.state === S.CHASE || r.state === S.ATTACK_PREPARE || r.state === S.ATTACK || r.state === S.RECOVERY || r.state === S.STUN;
      if (!engaged && d > (L.medio || 24)) lod = 2;
      else if (!engaged && d > (L.perto || 14) && ((lodFrame + mon.uid) & 3) !== 0) lod = 1;
    }
    if (lod === 2) { lodStats.frozen++; r.wantVx = 0; r.wantVy = 0; continue; }
    if (lod === 1) lodStats.reduced++; else if (zone.br) lodStats.full++;
    if (allowThink && lod === 0) {
      if (r.isBoss) thinkBoss(state, zone, mon, r, P, dtSec, tickResult);
      else if (r.arch && thinkArchetype(K, state, zone, mon, r, P, dtSec, cfg, tickResult)) { /* EVO: arquétipo decidiu */ }
      else think(state, zone, mon, r, P, dtSec, cfg, arena || !!zone.campo || !!zone.br, tickResult);
    } else if (lod === 0) { r.wantVx = 0; r.wantVy = 0; }
    if (dtSec > 0) { integrate(mon, r, dtSec, cfg); decayPosture(r, dtSec); }

    // Nunca sobrepor o herói (corpo do inimigo cede, respeitando paredes)
    const bodyR = monBodyRadius(mon);
    const minP = (P.playerRadius || 0.3) + bodyR;
    const ex = r.fx - P.px;
    const ey = r.fy - P.py;
    const ed = Math.hypot(ex, ey);
    if (ed < minP) {
      const nx = ed > 1e-5 ? ex / ed : Math.sin(r.facing);
      const ny = ed > 1e-5 ? ey / ed : -Math.cos(r.facing);
      pushOut(r, nx, ny, minP - ed, bodyR);
      if (r.isBoss) r.touchPlayer = true;
    }
    if (bi >= bodies.length) bodies.push({ x: 0, y: 0, r: 0, active: false, uid: 0 });
    const b = bodies[bi++];
    b.x = r.fx; b.y = r.fy; b.r = bodyR; b.active = true; b.uid = mon.uid; b.rt = r; b.mon = mon;
  }

  // Separação entre inimigos (O(n²), n pequeno)
  for (let a = 0; a < bi; a++) {
    const A = bodies[a];
    for (let c = a + 1; c < bi; c++) {
      const B = bodies[c];
      const minM = A.r + B.r + 0.05;
      const dx = B.x - A.x;
      const dy = B.y - A.y;
      const d = Math.hypot(dx, dy);
      if (d >= minM) continue;
      const nx = d > 1e-5 ? dx / d : 1;
      const ny = d > 1e-5 ? dy / d : 0;
      // Bloco 7: o chefe não é empurrado por bots (só ele empurra)
      const wA = A.rt.isBoss ? 0 : B.rt.isBoss ? 1 : 0.5;
      const wB = 1 - wA;
      const push = minM - d;
      if (wA > 0) pushOut(A.rt, -nx, -ny, push * wA, A.r);
      if (wB > 0) pushOut(B.rt, nx, ny, push * wB, B.r);
      A.x = A.rt.fx; A.y = A.rt.fy;
      B.x = B.rt.fx; B.y = B.rt.fy;
    }
  }

  // EVO: projéteis e zonas de perigo de inimigos/chefe
  if (dtSec > 0 && (enemyHazards.length || K.result)) {
    K.result = tickResult;
    if (allowThink) tickHazards(K, state, zone, P, clock, dtSec);
  }

  // Sincroniza tile inteiro (minimapa, save, buscas por tile)
  for (let k = 0; k < bi; k++) {
    const b = bodies[k];
    const r = b.rt;
    const mon = b.mon;
    const tx = Math.floor(r.fx);
    const ty = Math.floor(r.fy);
    if (tx !== mon.x || ty !== mon.y) {
      mon.x = tx;
      mon.y = ty;
      tickResult.moved = true;
    }
    r.syncX = mon.x;
    r.syncY = mon.y;
  }
  // vagas de ataque à distância recalculadas de quem está vivo (antes: contador que vazava na morte)
  if (TOKFIX) tokenStats.rangedFixed += recountRanged(bodies, bi, S);
  // Rede de segurança das fichas: só fica com ficha quem está vivo nesta zona E num estado de ataque.
  // (runtimes descartados por pool/reinício de onda/teleporte/troca de save nunca mais "seguram" a vez)
  if (TOKFIX && attackers.size) {
    tokenTick++;
    for (let k = 0; k < bi; k++) bodies[k].rt._tokSeen = tokenTick;
    for (const r of attackers) {
      const holding = r.state === S.ATTACK_PREPARE || r.state === S.ATTACK || r.state === S.RECOVERY;
      if (r._tokSeen !== tokenTick || !holding || !r.hasToken) {
        r.hasToken = false; attackers.delete(r); tokenStats.leaksFixed++;
      }
    }
  }
  return tickResult;
}

/** Um tick forçado (e2e / debug) — ignora a carência de spawn. */
export function forceAiTick(state, P) {
  const prev = graceUntil;
  graceUntil = 0;
  const p = P || { px: state.player.x + 0.5, py: state.player.y + 0.5, playerRadius: getConfig().movement.playerRadius };
  const r = tickEnemyAi(state, 1 / 60, p);
  graceUntil = prev;
  return { attacks: r.attacks.slice(), moved: r.moved };
}

/** Snapshot legível dos inimigos da zona (e2e / debug; aloca — não usar por frame). */
export function aiDebug(state) {
  const out = [];
  if (!state) return out;
  for (const mon of state.monstersAlive) {
    if (mon.zone !== state.zoneId) continue;
    const r = runtimes.get(mon);
    out.push({
      uid: mon.uid, alive: mon.alive, hp: mon.hp, x: mon.x, y: mon.y,
      fx: r ? +r.fx.toFixed(3) : mon.x + 0.5, fy: r ? +r.fy.toFixed(3) : mon.y + 0.5,
      state: r ? r.state : 'IDLE', stateMs: r ? Math.round(clock - r.stateAt) : 0,
      facing: r ? +r.facing.toFixed(3) : 0, hasToken: r ? r.hasToken : false,
      speed: r ? +r.speed.toFixed(3) : 0, nextAttackIn: r ? Math.max(0, Math.round(r.nextAttackAt - clock)) : 0,
      homeX: mon.homeX, homeY: mon.homeY,
      arch: r ? r.arch : null, behavior: r ? r.behavior : '', atkPhase: r ? r.atkPhase : '', move: r ? r.move : null,
      posture: r ? Math.round(r.posture || 0) : 0, postureMax: r ? r.postureMax || 0 : 0, broken: r ? clock < r.brokenUntil : false
    });
  }
  return out;
}

/** Posiciona um monstro (e2e / debug) em coords float de tile. */
export function placeMonster(state, uid, fx, fy) {
  const mon = state.monstersAlive.find((m) => m.uid === uid);
  if (!mon) return false;
  const r = rtFor(mon);
  mon.x = Math.floor(fx);
  mon.y = Math.floor(fy);
  r.fx = fx;
  r.fy = fy;
  r.vx = r.vy = 0;
  r.kbUntil = 0;
  r.syncX = mon.x;
  r.syncY = mon.y;
  return true;
}

/** Força estado/cooldowns (e2e) — ex.: zerar cooldown de ataque. */
export function debugResetMonster(state, uid, opts = {}) {
  const mon = state.monstersAlive.find((m) => m.uid === uid);
  if (!mon) return false;
  const r = rtFor(mon);
  if (opts.nextAttackIn != null) r.nextAttackAt = clock + opts.nextAttackIn;
  if (opts.state) { releaseToken(r, 0); r.state = opts.state; r.stateAt = clock; }
  if (opts.home) { mon.homeX = mon.x; mon.homeY = mon.y; r.homeFlowFor = -1; }
  if (opts.facePlayer) r.facing = Math.atan2(state.player.x + 0.5 - r.fx, -(state.player.y + 0.5 - r.fy));
  return true;
}

/** Quem tem a ficha de ataque agora (uids; array reutilizado — não guardar). */
const holderOut = [];
export function getAttackTokenHolders() {
  holderOut.length = 0;
  for (const r of attackers) holderOut.push(r.uid);
  return holderOut;
}

const ENGAGED = new Set([S.ALERT, S.CHASE, S.ATTACK_PREPARE, S.ATTACK, S.RECOVERY, S.STUN]);
/** O monstro está engajado com o herói (alerta/perseguindo/atacando)? */
export function isTargetingPlayer(mon) {
  const r = runtimes.get(mon);
  return !!(r && mon.alive && ENGAGED.has(r.state));
}
/** O monstro está no telegraph/golpe contra o herói? */
export function isAttackingPlayer(mon) {
  const r = runtimes.get(mon);
  return !!(r && mon.alive && (r.state === S.ATTACK_PREPARE || r.state === S.ATTACK));
}

/**
 * Ameaças ao herói na zona atual, ordenadas: atacando (telegraph/golpe) →
 * engajados → demais vivos; empate por distância. Array reutilizado.
 * (Base para o alvo do companheiro/lock-on do Bloco 3.)
 */
const threatOut = [];
export function getThreatsToPlayer(state, px, py) {
  threatOut.length = 0;
  if (!state) return threatOut;
  for (const mon of state.monstersAlive) {
    if (mon.alive && mon.zone === state.zoneId) threatOut.push(mon);
  }
  const rank = (m) => (isAttackingPlayer(m) ? 0 : isTargetingPlayer(m) ? 1 : 2);
  const dist = (m) => { const p = getMonsterPos(m); return Math.hypot(p.x - px, p.y - py); };
  threatOut.sort((a, b) => rank(a) - rank(b) || dist(a) - dist(b));
  return threatOut;
}

export function resetAttackTokens() {
  for (const r of attackers) r.hasToken = false;
  attackers.clear();
  tokenFreeAt = 0;
}
export function attackerCount() { return attackers.size; }
