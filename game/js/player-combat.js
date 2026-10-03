/**
 * NEXARA — ritmo do ATAQUE BÁSICO do herói (Bloco 2 · gp2).
 *
 * Conceitos separados:
 *   - TEMPO / FRAME DE IMPACTO: máquina de estados IDLE → STARTUP (preparo) →
 *     ACTIVE (janela de impacto; único momento com dano) → RECOVERY → IDLE.
 *   - ALCANCE: distância do centro do herói até a BORDA do corpo do inimigo.
 *   - HITBOX: cone à frente do yaw (câmera no FPS / corpo no iso) + linha de
 *     visão (não acerta através de parede) + conjunto de acertos por golpe.
 *   - DANO: actions.applyPlayerHit (fórmula/skills/XP/loot/quests existentes).
 *
 * Combo 1 → 2 → 3 tocando na janela de combo (fim da recuperação); o golpe 3
 * é mais forte, com arco maior e recuperação/cooldown maiores. Buffer de
 * entrada guarda no máx. 1 comando por inputBufferMs. Segurar não repete
 * (a menos que combat.autoAttack). Toques duplicados (touch + pointer/click)
 * são descartados aqui, na camada de entrada.
 *
 * Relógio próprio (ms) avançado por update(dt): congela no hit-stop/pausa.
 * Sem alocação por frame (objetos reutilizados).
 */
import { getConfig, DEG } from './gameplay-config.js?v=20261003vil';
import { hasLineOfSight, wrapAngle } from './collision.js?v=20261003vil';
import { getStat, STATS } from './modifiers.js?v=20261003vil';

export const ATK = Object.freeze({ IDLE: 'IDLE', STARTUP: 'STARTUP', ACTIVE: 'ACTIVE', RECOVERY: 'RECOVERY' });
const EVENT_CAP = 120;

/**
 * @param {{
 *   getZone: (state:object) => object,
 *   getMonsterPos: (mon:object) => {x:number,y:number},
 *   bodyRadius: (mon?) => number,  // Bloco 7: raio por monstro (chefe maior)
 *   isRanged: (state:object) => boolean,
 *   applyHit: (state:object, mon:object, info:object) => object|null,
 *   onHit?: (result:object, mon:object, info:object) => void,
 *   onSwing?: (info:object) => void
 * }} deps
 */
export function createPlayerCombat(deps) {
  let clock = 0;
  let phase = ATK.IDLE;
  let phaseAt = 0;
  let comboIndex = 0;
  let lastComboIndex = -1;
  let lastEndAt = -1e9;
  let cooldownUntil = 0;
  let bufferedAt = -1;
  let held = false;
  let lastPressReal = -1e9;
  let swingId = 0;
  const hitSet = new Set();
  const events = [];
  const stats = { presses: 0, started: 0, impacts: 0, hits: 0, deduped: 0, buffered: 0, bufferUsed: 0, bufferExpired: 0 };
  const view = { phase: ATK.IDLE, t: 0, comboIndex: 0, elapsed: 0, swingId: 0 };
  const hitInfo = { comboIndex: 0, heavy: false, dmgMult: 1, fromX: 0, fromY: 0, yaw: 0, swingId: 0 };
  const box = { range: 0, halfAngle: 0, assistAngle: 0, assistRange: 0, single: false };
  let ctx = null;

  function logEvent(type, extra) {
    if (events.length >= EVENT_CAP) events.shift();
    events.push({ t: clock, real: performance.now(), type, idx: comboIndex, swing: swingId, ...(extra || {}) });
  }

  /** Ritmo (passivas de velocidade de ataque via modifiers.getStat; 1 = normal). */
  function rate() {
    const k = getStat(STATS.ATTACK_SPEED, 1);
    return k > 0.1 ? k : 0.1;
  }
  function startupMs(cfg) { return cfg.attackStartupMs / rate(); }
  function activeMs(cfg) { return cfg.attackActiveMs / rate(); }
  function recoveryMs(cfg, idx) { return (idx >= 2 ? cfg.hit3RecoveryMs : cfg.attackRecoveryMs) / rate(); }

  function start(idx) {
    comboIndex = idx;
    phase = ATK.STARTUP;
    phaseAt = clock;
    swingId++;
    hitSet.clear();
    stats.started++;
    bufferedAt = -1;
    logEvent('start');
  }

  /** Pode aceitar um novo golpe agora? Retorna índice do combo ou -1. */
  function acceptIndex(cfg) {
    if (phase === ATK.IDLE) {
      if (clock < cooldownUntil) return -1;
      const chain = lastComboIndex >= 0 && lastComboIndex < 2 && clock - lastEndAt <= cfg.comboResetMs;
      return chain ? lastComboIndex + 1 : 0;
    }
    if (phase === ATK.RECOVERY && comboIndex < 2) {
      const rec = recoveryMs(cfg, comboIndex);
      if (clock - phaseAt >= rec - cfg.comboWindowMs) return comboIndex + 1;
    }
    return -1;
  }

  function tryStart(cfg) {
    const idx = acceptIndex(cfg);
    if (idx < 0) return false;
    if (phase === ATK.RECOVERY) logEvent('chain');
    start(idx);
    return true;
  }

  /**
   * Toque de ATAQUE (botão, tecla, clique). Retorna 'started' | 'buffered' | 'dup'.
   */
  function press() {
    const cfg = getConfig().combat;
    const realNow = performance.now();
    if (realNow - lastPressReal < cfg.inputDedupMs) {
      stats.deduped++;
      return 'dup';
    }
    lastPressReal = realNow;
    stats.presses++;
    if (tryStart(cfg)) return 'started';
    // Buffer de 1 comando (sobrescreve o anterior, nunca enfileira 2)
    bufferedAt = clock;
    stats.buffered++;
    return 'buffered';
  }

  function setHeld(v) { held = !!v; }

  function cancel() {
    phase = ATK.IDLE;
    phaseAt = clock;
    bufferedAt = -1;
    held = false;
    hitSet.clear();
  }

  // —— HITBOX ——
  function fillHitbox(cfg, idx, ranged) {
    const lvl = cfg.aimAssist;
    box.assistAngle = (cfg.aimAssistExtraAngleDeg[lvl] || 0) * DEG;
    box.assistRange = cfg.aimAssistExtraRange[lvl] || 0;
    if (ranged) {
      box.range = cfg.rangedRange;
      box.halfAngle = cfg.rangedHalfAngleDeg * DEG;
      box.single = true;
    } else {
      box.range = cfg.attackRange * (idx >= 2 ? cfg.hit3RangeMult : 1);
      box.halfAngle = (idx >= 2 ? cfg.hit3HalfAngleDeg : cfg.hitboxHalfAngleDeg) * DEG;
      box.single = false;
    }
    return box;
  }

  /**
   * Resolve quem está na hitbox neste frame da janela ativa e aplica o dano.
   * Cada inimigo no máx. 1 vez por golpe (hitSet).
   */
  function resolveHits(cfg) {
    if (!ctx || !ctx.state) return;
    const state = ctx.state;
    const zone = deps.getZone(state);
    if (!zone) return;
    // ARSENAL: ARCO / CAJADO → projétil real (1 disparo por golpe, no quadro do impacto); espada segue igual
    const wc = deps.weaponClass ? deps.weaponClass(state) : 'espada';
    if (wc === 'arco' || wc === 'cajado') {
      if (!hitSet.has(-1)) { hitSet.add(-1); fireWeapon(state, zone, wc, cfg); }
      return;
    }
    const ranged = deps.isRanged(state);
    const b = fillHitbox(cfg, comboIndex, ranged);
    const bodyR = deps.bodyRadius();
    const fx = Math.sin(ctx.yaw);
    const fy = -Math.cos(ctx.yaw);
    const mons = state.monstersAlive;
    let assistMon = null;
    let assistAng = Infinity;
    let singleMon = null;
    let singleAng = Infinity;
    for (let i = 0; i < mons.length; i++) {
      const mon = mons[i];
      if (!mon.alive || mon.zone !== state.zoneId || hitSet.has(mon.uid)) continue;
      const p = deps.getMonsterPos(mon);
      const mx = p.x;
      const my = p.y;
      const dx = mx - ctx.px;
      const dy = my - ctx.py;
      const dc = Math.hypot(dx, dy);
      const edge = dc - (mon.boss ? deps.bodyRadius(mon) : bodyR); // Bloco 7: chefe tem corpo maior
      if (edge > b.range + b.assistRange) continue;
      const ang = dc > 1e-4 ? Math.acos(Math.max(-1, Math.min(1, (dx * fx + dy * fy) / dc))) : 0;
      const close = !ranged && dc <= cfg.closeHitRadius;
      const inside = edge <= b.range && (ang <= b.halfAngle || close);
      const assisted = !inside && ang <= b.halfAngle + b.assistAngle;
      if (!inside && !assisted) continue;
      if (!hasLineOfSight(zone, ctx.px, ctx.py, mx, my)) continue;
      if (b.single) {
        if (ang < singleAng) { singleAng = ang; singleMon = mon; }
        continue;
      }
      if (inside) applyOne(state, mon, mx, my, cfg);
      else if (ang < assistAng) { assistAng = ang; assistMon = mon; }
    }
    if (b.single && singleMon) {
      const p = deps.getMonsterPos(singleMon);
      applyOne(state, singleMon, p.x, p.y, cfg);
    } else if (assistMon) {
      const p = deps.getMonsterPos(assistMon);
      applyOne(state, assistMon, p.x, p.y, cfg);
    }
  }

  /** Alvo do disparo: travado (se no alcance) → menor ângulo no cone + mira assistida → nenhum (vai reto). */
  function pickShotTarget(state, zone, range, halfAngle) {
    const lock = deps.getLockTarget?.();
    const fx = Math.sin(ctx.yaw);
    const fy = -Math.cos(ctx.yaw);
    let best = null;
    let bestScore = Infinity;
    for (const mon of state.monstersAlive) {
      if (!mon.alive || mon.zone !== state.zoneId) continue;
      const p = deps.getMonsterPos(mon);
      const dx = p.x - ctx.px;
      const dy = p.y - ctx.py;
      const dc = Math.hypot(dx, dy);
      if (dc - deps.bodyRadius(mon) > range) continue;
      const ang = dc > 1e-4 ? Math.acos(Math.max(-1, Math.min(1, (dx * fx + dy * fy) / dc))) : 0;
      const isLock = lock && lock.uid === mon.uid;
      if (!isLock && ang > halfAngle) continue;
      if (!hasLineOfSight(zone, ctx.px, ctx.py, p.x, p.y)) continue;
      const score = isLock ? -1 : ang + dc * 0.02;
      if (score < bestScore) { bestScore = score; best = mon; }
    }
    return best;
  }
  function fireWeapon(state, zone, wc, cfg) {
    const pc = deps.weaponCfg?.(wc)?.projetil || {};
    const lvl = cfg.aimAssist;
    const half = ((pc.meioAnguloDeg ?? cfg.rangedHalfAngleDeg) + (cfg.aimAssistExtraAngleDeg[lvl] || 0)) * DEG;
    const range = (pc.alcance ?? cfg.rangedRange) + (cfg.aimAssistExtraRange[lvl] || 0);
    const target = pickShotTarget(state, zone, range, half);
    const shot = { comboIndex, heavy: comboIndex >= 2, dmgMult: comboIndex >= 2 ? cfg.hit3DamageMult : 1, swingId, fromX: ctx.px, fromY: ctx.py, yaw: ctx.yaw };
    stats.shots = (stats.shots || 0) + 1;
    logEvent('shot', { wc, target: target ? target.uid : null });
    deps.fireWeapon(state, wc, target, shot, pc, range);
  }
  /** Projétil chegou: MESMO caminho do golpe corpo a corpo (applyHit → onHit; evento 'hit'). */
  function applyProjectileHit(state, mon, shot, x, y, mult = 1) {
    if (!mon.alive) return null;
    const info = { ...shot, dmgMult: shot.dmgMult * mult, x, y, ranged: true };
    const result = deps.applyHit(state, mon, info);
    if (!result) return null;
    stats.hits++;
    logEvent('hit', { uid: mon.uid, dmg: result.dmgOut, killed: !!result.killed, ranged: true });
    deps.onHit?.(result, mon, info);
    return result;
  }

  function applyOne(state, mon, mx, my, cfg) {
    hitSet.add(mon.uid);
    hitInfo.comboIndex = comboIndex;
    hitInfo.heavy = comboIndex >= 2;
    hitInfo.dmgMult = comboIndex >= 2 ? cfg.hit3DamageMult : 1;
    hitInfo.fromX = ctx.px;
    hitInfo.fromY = ctx.py;
    hitInfo.yaw = ctx.yaw;
    hitInfo.swingId = swingId;
    hitInfo.x = mx;
    hitInfo.y = my;
    const result = deps.applyHit(state, mon, hitInfo);
    if (!result) return;
    stats.hits++;
    logEvent('hit', { uid: mon.uid, dmg: result.dmgOut, killed: !!result.killed });
    deps.onHit?.(result, mon, hitInfo);
  }

  /**
   * Avança a máquina de estados.
   * @param {number} dtSec segundos de jogo (0 = congelado)
   * @param {{ state:object, px:number, py:number, yaw:number, blocked?:boolean }} frameCtx
   */
  function update(dtSec, frameCtx) {
    ctx = frameCtx;
    const cfg = getConfig().combat;
    if (dtSec > 0) clock += dtSec * 1000;
    if (bufferedAt >= 0 && clock - bufferedAt > cfg.inputBufferMs) {
      bufferedAt = -1;
      stats.bufferExpired++;
    }
    // Várias transições num frame longo; a janela ativa sempre resolve ao menos 1x
    for (let guard = 0; guard < 4; guard++) {
      const el = clock - phaseAt;
      if (phase === ATK.STARTUP) {
        if (el < startupMs(cfg)) break;
        phase = ATK.ACTIVE;
        phaseAt += startupMs(cfg);
        stats.impacts++;
        logEvent('impact');
        deps.onSwing?.({ comboIndex, swingId });
        resolveHits(cfg);
        continue;
      }
      if (phase === ATK.ACTIVE) {
        resolveHits(cfg);
        if (el < activeMs(cfg)) break;
        phase = ATK.RECOVERY;
        phaseAt += activeMs(cfg);
        continue;
      }
      if (phase === ATK.RECOVERY) {
        const rec = recoveryMs(cfg, comboIndex);
        if (el < rec) break;
        phaseAt += rec;
        phase = ATK.IDLE;
        lastEndAt = phaseAt;
        lastComboIndex = comboIndex >= 2 ? -1 : comboIndex;
        cooldownUntil = phaseAt + (comboIndex >= 2 ? cfg.hit3CooldownMs : cfg.attackCooldownMs);
        logEvent('end');
        continue;
      }
      break;
    }
    if (phase === ATK.IDLE && lastComboIndex >= 0 && clock - lastEndAt > cfg.comboResetMs) {
      lastComboIndex = -1; // combo expirou
    }
    // Bloco 4: esquiva/especial/defesa/atordoado seguram o início (o buffer espera ou expira)
    if (frameCtx && frameCtx.noStart) return;
    if (bufferedAt >= 0 && tryStart(cfg)) stats.bufferUsed++;
    else if (held && cfg.autoAttack) tryStart(cfg);
  }

  function getView() {
    const cfg = getConfig().combat;
    const el = clock - phaseAt;
    let dur = 1;
    if (phase === ATK.STARTUP) dur = startupMs(cfg);
    else if (phase === ATK.ACTIVE) dur = activeMs(cfg);
    else if (phase === ATK.RECOVERY) dur = recoveryMs(cfg, comboIndex);
    view.phase = phase;
    view.comboIndex = comboIndex;
    view.elapsed = el;
    view.t = phase === ATK.IDLE ? 0 : Math.max(0, Math.min(1, el / dur));
    view.swingId = swingId;
    return view;
  }

  function getDebug() {
    return {
      phase, comboIndex, elapsedMs: Math.round(clock - phaseAt), clock: Math.round(clock),
      bufferPending: bufferedAt >= 0, held, swingId, hitSet: [...hitSet],
      cooldownMs: Math.max(0, Math.round(cooldownUntil - clock)),
      stats: { ...stats }
    };
  }

  return {
    press,
    setHeld,
    cancel,
    update,
    getView,
    getDebug,
    getEvents: () => events.slice(),
    clearEvents: () => { events.length = 0; },
    isAttacking: () => phase !== ATK.IDLE,
    /** Bloco 4: fase atual ('IDLE'|'STARTUP'|'ACTIVE'|'RECOVERY'), buffer único e cancelamento da recuperação. */
    getPhase: () => phase,
    hasBuffer: () => bufferedAt >= 0,
    clearBuffer: () => { bufferedAt = -1; },
    cancelRecovery: () => {
      if (phase !== ATK.RECOVERY) return false;
      lastEndAt = clock;
      lastComboIndex = -1;
      phase = ATK.IDLE;
      phaseAt = clock;
      bufferedAt = -1;
      hitSet.clear();
      logEvent('cancel');
      return true;
    },
    getClock: () => clock,
    applyProjectileHit,
    /** Hitbox atual (e2e/debug): alcance/ângulo em graus. */
    describeHitbox: (idx = comboIndex, ranged = false) => {
      const b = fillHitbox(getConfig().combat, idx, ranged);
      return { range: b.range, halfAngleDeg: b.halfAngle / DEG, assistAngleDeg: b.assistAngle / DEG, assistRange: b.assistRange, single: b.single };
    },
    _wrap: wrapAngle
  };
}
