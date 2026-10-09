/**
 * NEXARA — Bloco 4: AÇÕES DO HERÓI (esquiva, defesa, 4 especiais) + PRIORIDADE DE COMANDOS.
 *
 * Prioridade (maior vence): MORTO > ANIM_CRITICA (atordoado / tela de passiva) > ESQUIVA >
 * ESPECIAL/ATAQUE > DEFESA > MOVER.
 *  - Nunca esquiva + ataque juntos; ataque não interrompe esquiva; esquiva cancela só a
 *    RECUPERAÇÃO do ataque/especial (nunca preparo/ativo).
 *  - Sem ataque/especial enquanto defende (soltar a defesa primeiro).
 *  - Sem especial durante a esquiva; sem ativação dupla (um especial por vez + filtro de toque).
 *  - Buffer ÚNICO de 1 comando (~150 ms): ataque OU esquiva (o último vence; o do combate é limpo).
 *
 * Tempo: relógio próprio em ms (tempo real × escala de debug; congela com modal/passivas).
 * Dano dos especiais: deps.hitSpecial → actions.applyPlayerHit({ ability:true }) →
 * applyDamageToMonster (XP/loot/quests) — o Núcleo Divino (+15% dano de habilidade) vale aqui.
 * Todos os números em gameplay-config (actions / dodge / defense / specials).
 */
import { getConfig, DEG } from './gameplay-config.js?v=20261009fast2';
import { hasLineOfSight, wrapAngle } from './collision.js?v=20261009fast2';
import { getStat, STATS } from './modifiers.js?v=20261009fast2';

export const ACTION_STATES = Object.freeze({
  DEAD: 'DEAD', CRITICAL_ANIM: 'CRITICAL_ANIM', DODGE: 'DODGE', SPECIAL: 'SPECIAL',
  ATTACK: 'ATTACK', DEFEND: 'DEFEND', MOVE: 'MOVE', IDLE: 'IDLE'
});
export const SPECIAL_IDS = Object.freeze(['golpe_poderoso', 'ataque_area', 'dash', 'suprema']);
const A = ACTION_STATES;
const MAX_DASH_STEP = 0.45; // tiles por frame (sincronia de tile segura em frames lentos)
const EVENT_CAP = 200;

/**
 * @param {{
 *   combat: object, motion: object, getZone: Function, getMonsterPos: Function, bodyRadius: Function,
 *   getNexa: (s)=>number, spendNexa: (s, n)=>void,
 *   hitSpecial: (s, mon, id, info)=>object|null,
 *   getLockTarget?: ()=>object|null,
 *   onEvent?: (type:string, data:object)=>void
 * }} deps
 */
export function createPlayerActions(deps) {
  let clock = 0;
  const events = [];
  const dedup = new Map(); // comando → último toque real (ms)
  const buffer = { cmd: null, at: -1 };
  const stats = { dodges: 0, dodged: 0, perfectDodges: 0, blocked: 0, specials: 0, denied: 0, buffered: 0, bufferUsed: 0, bufferExpired: 0 };

  const dodge = { active: false, at: 0, dirX: 0, dirY: 0, consumed: 0, cooldownUntil: 0, mode: '' };
  const defend = { held: false, active: false, since: 0 };
  const sp = { id: null, phase: 'IDLE', at: 0, yaw: 0, dirX: 0, dirY: 0, consumed: 0, hit: new Set(), hits: 0, targetUid: null };
  const cooldowns = { golpe_poderoso: 0, ataque_area: 0, dash: 0, suprema: 0 };
  /** Bloco 7: duração real da recarga em curso (com modificadores) — para a varredura do botão. */
  const cdTotal = { golpe_poderoso: 0, ataque_area: 0, dash: 0, suprema: 0 };
  let hitStunUntil = 0;
  let lastAttackAt = -1e9; // Bloco 6: último frame com ataque em andamento (esquiva→investida)
  let bufferFromAttack = false;
  let critical = false; // tela de passivas / modal
  let dead = false;
  let ctx = null;
  const motionOut = { dash: null, dashThrough: false, speedMult: 1, noRun: false };
  const dashVec = { x: 0, y: 0, moved: 0, hitWall: false };
  const tmp = { x: 0, y: 0 };

  function cfgAll() { return getConfig(); }
  function log(type, extra) {
    if (events.length >= EVENT_CAP) events.shift();
    events.push({ t: Math.round(clock), real: performance.now(), type, ...(extra || {}) });
    deps.onEvent?.(type, extra || {});
  }
  function isDup(cmd) {
    const now = performance.now();
    const last = dedup.get(cmd) ?? -1e9;
    if (now - last < cfgAll().actions.inputDedupMs) return true;
    dedup.set(cmd, now);
    return false;
  }

  // —— estado central ——
  function inIFrames() {
    if (dodge.active) {
      const c = cfgAll().dodge;
      const el = clock - dodge.at;
      if (el >= c.iFrameStartMs && el < c.iFrameStartMs + c.iFrameMs) return true;
    }
    if (sp.id === 'dash' && (sp.phase === 'ACTIVE' || sp.phase === 'WINDUP')) {
      const c = cfgAll().specials.dash;
      if (clock - sp.startedAt < c.windupMs + c.iFrameMs) return true;
    }
    return false;
  }
  function combatPhase() { return deps.combat.getPhase ? deps.combat.getPhase() : 'IDLE'; }
  function getActionState() {
    if (dead) return A.DEAD;
    if (critical || clock < hitStunUntil) return A.CRITICAL_ANIM;
    if (dodge.active) return A.DODGE;
    if (sp.id) return A.SPECIAL;
    if (combatPhase() !== 'IDLE') return A.ATTACK;
    if (defend.active) return A.DEFEND;
    const m = deps.motion;
    return m.isMoving?.() ? A.MOVE : A.IDLE;
  }

  function setBuffer(cmd) {
    buffer.cmd = cmd;
    buffer.at = clock;
    bufferFromAttack = false;
    stats.buffered++;
    if (cmd !== 'attack') deps.combat.clearBuffer?.();
    log('buffer', { cmd });
  }

  // —— ESQUIVA ——
  /** Direção: stick relativo à câmera; sem stick = para trás. */
  function dodgeDir(yaw) {
    const v = deps.motion.getInputVector ? deps.motion.getInputVector() : { x: 0, y: 0 };
    const mag = Math.hypot(v.x, v.y);
    const s = Math.sin(yaw);
    const c = Math.cos(yaw);
    if (mag < 0.2) { tmp.x = -s; tmp.y = c; return 'tras'; }
    const sf = -v.y / mag;
    const sr = v.x / mag;
    tmp.x = s * sf + c * sr;
    tmp.y = -c * sf + s * sr;
    return 'stick';
  }
  function startDodge() {
    const c = cfgAll().dodge;
    const yaw = ctx ? ctx.yaw : 0;
    dodge.mode = dodgeDir(yaw);
    dodge.dirX = tmp.x;
    dodge.dirY = tmp.y;
    dodge.active = true;
    dodge.at = clock;
    dodge.consumed = 0;
    dodge.cooldownUntil = clock + c.cooldownMs;
    const p = deps.motion.getPos();
    dodge.fromX = p.x;
    dodge.fromY = p.y;
    stats.dodges++;
    buffer.cmd = null;
    deps.combat.clearBuffer?.();
    log('dodge', { dirX: +dodge.dirX.toFixed(3), dirY: +dodge.dirY.toFixed(3), mode: dodge.mode });
  }
  function pressDodge() {
    if (isDup('dodge')) return 'dup';
    const st = getActionState();
    if (st === A.DEAD) return 'blocked';
    if (st === A.CRITICAL_ANIM) { if (critical) return 'blocked'; setBuffer('dodge'); return 'buffered'; }
    if (dodge.active) return 'busy';
    if (clock < dodge.cooldownUntil) { log('denied', { cmd: 'dodge', why: 'cooldown' }); return 'cooldown'; }
    if (sp.id) {
      if (sp.phase === 'RECOVERY') { endSpecial('cancel_dodge'); }
      else { setBuffer('dodge'); return 'buffered'; }
    }
    const ph = combatPhase();
    const fromAttack = inAttackWindow();
    if (ph === 'STARTUP' || ph === 'ACTIVE') { setBuffer('dodge'); bufferFromAttack = true; return 'buffered'; }
    if (ph === 'RECOVERY') {
      if (!cfgAll().dodge.cancelAttackRecovery) { setBuffer('dodge'); bufferFromAttack = true; return 'buffered'; }
      deps.combat.cancelRecovery?.();
      log('cancel_recovery', {});
    }
    if (fromAttack && tryDashStrike()) return 'dash';
    startDodge();
    return 'started';
  }
  /** Bloco 6: esquiva durante o combo (ou logo depois) vira a INVESTIDA (antigo DASH). */
  function inAttackWindow() {
    const ds = cfgAll().dodge.dashStrike;
    if (!ds || !ds.enabled) return false;
    return combatPhase() !== 'IDLE' || clock - lastAttackAt <= ds.comboWindowMs;
  }
  function tryDashStrike() {
    const ds = cfgAll().dodge.dashStrike;
    if (!ds || !ds.enabled || sp.id || dodge.active) return false;
    const c = specialCfg('dash');
    if (cooldownLeft('dash') > 0 || deps.getNexa(ctx?.state) < c.cost) return false;
    startSpecialCore('dash', c);
    dodge.cooldownUntil = clock + cfgAll().dodge.cooldownMs;
    log('dash_strike', { cost: c.cost });
    return true;
  }

  // —— ATAQUE (passa pelo árbitro) ——
  function pressAttack() {
    const st = getActionState();
    if (st === A.DEAD) return 'blocked';
    if (defend.active) { log('denied', { cmd: 'attack', why: 'defending' }); return 'defending'; }
    if (st === A.CRITICAL_ANIM && critical) return 'blocked';
    if (st === A.CRITICAL_ANIM || dodge.active || sp.id) {
      if (isDup('attack')) return 'dup';
      setBuffer('attack');
      deps.combat.clearBuffer?.();
      return 'buffered';
    }
    const r = deps.combat.press();
    if (r === 'buffered' || r === 'started') buffer.cmd = null; // um só slot (o do combate)
    return r;
  }

  // —— DEFESA ——
  function setDefend(v) {
    defend.held = !!v;
    if (!v && defend.active) { defend.active = false; log('defend_end', {}); }
  }
  function canDefendNow() {
    if (dead || critical || dodge.active || sp.id) return false;
    const ph = combatPhase();
    if (ph === 'STARTUP' || ph === 'ACTIVE') return false;
    return true;
  }

  /** Gancho de dano recebido (actions.monsterAttackPlayer). */
  function resolveIncoming(state, mon) {
    if (inIFrames()) {
      stats.dodged++;
      // EVO: ESQUIVA PERFEITA — o golpe chegou logo no começo da janela de invencibilidade
      let perfect = false;
      const win = getStat(STATS.PERFECT_DODGE_MS, getConfig().feel?.perfectDodgeWindowMs || 0);
      if (win > 0) {
        if (dodge.active) {
          const el = clock - dodge.at - cfgAll().dodge.iFrameStartMs;
          perfect = el >= 0 && el <= win;
        } else if (sp.id === 'dash') {
          perfect = clock - sp.startedAt <= win;
        }
      }
      if (perfect) stats.perfectDodges = (stats.perfectDodges || 0) + 1;
      log('dodged', { uid: mon.uid, perfect });
      return { kind: 'dodge', mult: 0, perfect };
    }
    if (defend.active) {
      const c = cfgAll().defense;
      const p = deps.motion.getPos();
      const mp = deps.getMonsterPos(mon);
      const toMon = Math.atan2(mp.x - p.x, -(mp.y - p.y));
      const yaw = ctx ? ctx.yaw : 0;
      const ang = Math.abs(wrapAngle(toMon - yaw));
      const front = ang <= (c.frontArcDeg * DEG) / 2;
      let red = front ? c.frontReduction : c.backReduction;
      const parry = !!c.parryEnabled && clock - defend.since <= c.perfectBlockWindowMs;
      if (parry && front) red = 1; // gancho: parry perfeito (desligado por padrão)
      stats.blocked++;
      log('blocked', { uid: mon.uid, front, parry });
      return { kind: 'block', mult: Math.max(0, 1 - red), front, parry };
    }
    return null;
  }
  function onHeroHit(dmg) {
    const ms = cfgAll().actions.heroHitStunMs;
    if (dmg > 0 && ms > 0) hitStunUntil = Math.max(hitStunUntil, clock + ms);
  }

  // —— ESPECIAIS ——
  function specialCfg(id) { return cfgAll().specials[id]; }
  function cooldownLeft(id) { return Math.max(0, cooldowns[id] - clock); }
  function pressSpecial(id) {
    const c = specialCfg(id);
    if (!c) return 'unknown';
    if (isDup(`sp_${id}`)) return 'dup';
    const st = getActionState();
    const deny = (why) => { stats.denied++; log('denied', { cmd: id, why }); return why; };
    if (st === A.DEAD || critical) return deny('blocked');
    if (sp.id) return deny('busy');
    if (dodge.active) return deny('dodging');
    if (st === A.CRITICAL_ANIM) return deny('stunned');
    if (defend.active) return deny('defending');
    const ph = combatPhase();
    if (ph === 'STARTUP' || ph === 'ACTIVE') return deny('attacking');
    if (cooldownLeft(id) > 0) return deny('cooldown');
    if (deps.getNexa(ctx?.state) < c.cost) return deny('nexa');
    if (ph === 'RECOVERY') deps.combat.cancelRecovery?.();
    startSpecialCore(id, c);
    return 'started';
  }
  function startSpecialCore(id, c) {
    deps.spendNexa(ctx?.state, c.cost);
    // Bloco 7: recarga passa pelo sistema de modificadores (poder temporário CIRCUITO RÁPIDO)
    const cdMs = Math.max(0, getStat(STATS.SPECIAL_COOLDOWN, 1)) * c.cooldownMs;
    cooldowns[id] = clock + cdMs;
    cdTotal[id] = cdMs;
    sp.id = id;
    sp.phase = 'WINDUP';
    sp.at = clock;
    sp.startedAt = clock;
    sp.hit.clear();
    sp.hits = 0;
    sp.consumed = 0;
    buffer.cmd = null;
    deps.combat.clearBuffer?.();
    aimSpecial();
    stats.specials++;
    log('special', { id, cost: c.cost });
  }
  /** Direção do especial: alvo travado (se houver e perto) senão a mira. */
  function aimSpecial() {
    let yaw = ctx ? ctx.yaw : 0;
    const lock = deps.getLockTarget?.();
    sp.targetUid = null;
    if (lock) {
      const p = deps.motion.getPos();
      const mp = deps.getMonsterPos(lock);
      const d = Math.hypot(mp.x - p.x, mp.y - p.y);
      if (d <= Math.max(specialCfg('dash').distance + 1, 5)) {
        yaw = Math.atan2(mp.x - p.x, -(mp.y - p.y));
        sp.targetUid = lock.uid;
      }
    }
    sp.yaw = yaw;
    sp.dirX = Math.sin(yaw);
    sp.dirY = -Math.cos(yaw);
  }
  function phaseDur(c, phase) {
    if (phase === 'WINDUP') return c.windupMs;
    if (phase === 'ACTIVE') return c.activeMs ?? c.durationMs;
    return c.recoveryMs;
  }
  function endSpecial(why) {
    if (!sp.id) return;
    log('special_end', { id: sp.id, why, hits: sp.hits });
    sp.id = null;
    sp.phase = 'IDLE';
    sp.targetUid = null;
  }

  /** Inimigos elegíveis (vivos, na zona, com linha de visão). */
  function forEachMon(fn) {
    const s = ctx?.state;
    if (!s) return;
    const zone = deps.getZone(s);
    const p = deps.motion.getPos();
    const mons = s.monstersAlive;
    for (let i = 0; i < mons.length; i++) {
      const m = mons[i];
      if (!m.alive || m.zone !== s.zoneId) continue;
      const mp = deps.getMonsterPos(m);
      const dx = mp.x - p.x;
      const dy = mp.y - p.y;
      const dc = Math.hypot(dx, dy);
      if (zone && dc > 0.05 && !hasLineOfSight(zone, p.x, p.y, mp.x, mp.y)) continue;
      fn(m, mp, dx, dy, dc);
    }
  }
  function hitOne(m, mp, c, heavy) {
    if (sp.hit.has(m.uid)) return;
    sp.hit.add(m.uid);
    const p = deps.motion.getPos();
    const res = deps.hitSpecial(ctx.state, m, sp.id, {
      dmgMult: c.dmgMult, fromX: p.x, fromY: p.y, x: mp.x, y: mp.y, heavy: !!heavy,
      knockbackScale: c.knockbackScale, stunMs: c.stunMs || 0
    });
    if (res) { sp.hits++; log('special_hit', { id: sp.id, uid: m.uid, dmg: res.dmgOut, killed: !!res.killed }); }
  }
  /** ARSENAL: dano de especial que chega DEPOIS (projétil) — mesmo caminho (hitSpecial), fora da janela do especial. */
  function lateHit(id, m, x, y, v, heavy) {
    if (!m.alive || !ctx?.state) return null;
    const p = deps.motion.getPos();
    const res = deps.hitSpecial(ctx.state, m, id, { dmgMult: v.dmgMult, fromX: p.x, fromY: p.y, x, y, heavy: !!heavy, knockbackScale: v.knockbackScale ?? 1, stunMs: v.stunMs || 0 });
    if (res) log('special_hit', { id, uid: m.uid, dmg: res.dmgOut, killed: !!res.killed, late: true, variant: v.nome });
    return res;
  }
  /** ARSENAL: variante do especial pelo ARCO/CAJADO (data/arsenal.json). Retorna true se tratou. */
  function resolveWeaponSpecial(id, c, v) {
    const bodyR = deps.bodyRadius();
    const p = deps.motion.getPos();
    if (v.modo === 'projetil') {
      let best = null;
      let bestScore = Infinity;
      forEachMon((m, mp, dx, dy, dc) => {
        if (dc - (m.boss ? deps.bodyRadius(m) : bodyR) > v.range) return;
        const ang = dc > 1e-4 ? Math.abs(wrapAngle(Math.atan2(dx, -dy) - sp.yaw)) : 0;
        if (m.uid !== sp.targetUid && ang > v.halfAngleDeg * DEG && dc > 0.6) return;
        const score = (m.uid === sp.targetUid ? -10 : 0) + ang;
        if (score < bestScore) { bestScore = score; best = m; }
      });
      deps.fireSpecialShot?.(ctx.state, id, best, sp.yaw, v, (m, x, y, mult = 1) => lateHit(id, m, x, y, mult === 1 ? v : { ...v, dmgMult: v.dmgMult * mult }, true));
      log('special_impact', { id, hits: 0, variant: v.nome, modo: v.modo, target: best ? best.uid : null });
      return true;
    }
    if (v.modo === 'area_alvo') {
      // centro: alvo travado (no alcance) → inimigo mais próximo à frente → ponto à frente
      let cx = p.x + sp.dirX * v.alcanceCentro * 0.6;
      let cy = p.y + sp.dirY * v.alcanceCentro * 0.6;
      let centerUid = null;
      let bestD = Infinity;
      forEachMon((m, mp, dx, dy, dc) => {
        if (dc > v.alcanceCentro + (m.boss ? deps.bodyRadius(m) : bodyR)) return;
        const ang = dc > 1e-4 ? Math.abs(wrapAngle(Math.atan2(dx, -dy) - sp.yaw)) : 0;
        const score = m.uid === sp.targetUid ? -1 : ang < 70 * DEG ? dc : Infinity;
        if (score < bestD) { bestD = score; cx = mp.x; cy = mp.y; centerUid = m.uid; }
      });
      deps.onWeaponArea?.(id, cx, cy, v);
      forEachMon((m, mp) => {
        if (Math.hypot(mp.x - cx, mp.y - cy) - (m.boss ? deps.bodyRadius(m) : bodyR) <= v.radius) hitOne(m, mp, { ...c, dmgMult: v.dmgMult }, id === 'suprema');
      });
      log('special_impact', { id, hits: sp.hits, variant: v.nome, modo: v.modo, center: { x: +cx.toFixed(2), y: +cy.toFixed(2) }, centerUid });
      return true;
    }
    return false;
  }
  function resolveSpecialImpact() {
    const id = sp.id;
    const c = specialCfg(id);
    const bodyR = deps.bodyRadius();
    const wv = deps.weaponSpecial?.(id);
    if (wv && resolveWeaponSpecial(id, c, wv)) return;
    if (id === 'golpe_poderoso') {
      // alvo único à frente: prioriza o travado; senão o de menor ângulo no cone
      let best = null;
      let bestScore = Infinity;
      forEachMon((m, mp, dx, dy, dc) => {
        const edge = dc - (m.boss ? deps.bodyRadius(m) : bodyR);
        if (edge > c.range) return;
        const ang = dc > 1e-4 ? Math.abs(wrapAngle(Math.atan2(dx, -dy) - sp.yaw)) : 0;
        if (ang > c.halfAngleDeg * DEG && dc > 0.6) return;
        const score = (m.uid === sp.targetUid ? -10 : 0) + ang;
        if (score < bestScore) { bestScore = score; best = { m, mp }; }
      });
      if (best) hitOne(best.m, best.mp, c, true);
    } else if (id === 'ataque_area' || id === 'suprema') {
      forEachMon((m, mp, dx, dy, dc) => {
        if (dc - (m.boss ? deps.bodyRadius(m) : bodyR) <= c.radius) hitOne(m, mp, c, id === 'suprema');
      });
    }
    log('special_impact', { id, hits: sp.hits });
  }
  function dashHits() {
    const c = specialCfg('dash');
    const bodyR = deps.bodyRadius();
    forEachMon((m, mp, dx, dy, dc) => {
      if (sp.hits >= c.maxTargets) return;
      if (dc - (m.boss ? deps.bodyRadius(m) : bodyR) <= c.hitRadius) hitOne(m, mp, c, false);
    });
  }

  function stepDash(dirX, dirY, total, durMs, elapsedMs, consumed) {
    const want = Math.min(total, (total * Math.min(1, elapsedMs / Math.max(1, durMs))));
    const step = Math.min(MAX_DASH_STEP, Math.max(0, want - consumed));
    dashVec.x = dirX * step;
    dashVec.y = dirY * step;
    dashVec.moved = 0;
    dashVec.hitWall = false;
    return step;
  }

  /**
   * Avança as ações e prepara as opções de movimento deste frame.
   * @param {number} dtMs ms (0 = congelado)
   * @param {{ state:object, yaw:number, blocked:boolean }} frameCtx
   * @returns {{ dash:object|null, dashThrough:boolean, speedMult:number, noRun:boolean }}
   */
  function update(dtMs, frameCtx) {
    ctx = frameCtx;
    const s = frameCtx.state;
    critical = !!frameCtx.critical;
    dead = !!s && s.player.hp <= 0;
    if (dtMs > 0) clock += dtMs;
    motionOut.dash = null;
    motionOut.dashThrough = false;
    motionOut.speedMult = 1;
    motionOut.noRun = false;
    const all = cfgAll();
    if (dead || critical) {
      if (dodge.active) { dodge.active = false; log('dodge_end', { why: 'critical' }); }
      if (sp.id && critical && dtMs > 0) endSpecial('critical');
      if (critical) motionOut.speedMult = 0;
      return motionOut;
    }
    if (combatPhase() !== 'IDLE') lastAttackAt = clock;
    // buffer único
    // Bloco 6: ESQUIVA apertada no preparo/impacto do golpe espera o golpe sair (vira INVESTIDA ou esquiva)
    if (buffer.cmd === 'dodge' && bufferFromAttack && all.dodge.holdBufferDuringAttack) {
      const ph = combatPhase();
      if (ph === 'STARTUP' || ph === 'ACTIVE') buffer.at = clock;
    }
    if (buffer.cmd && clock - buffer.at > all.actions.inputBufferMs) {
      stats.bufferExpired++;
      log('buffer_expired', { cmd: buffer.cmd });
      buffer.cmd = null;
    }
    // —— esquiva ——
    if (dodge.active) {
      const c = all.dodge;
      const el = clock - dodge.at;
      const dist = c.distance;
      const step = stepDash(dodge.dirX, dodge.dirY, dist, c.durationMs, el, dodge.consumed);
      dodge.consumed += step;
      if (step > 0) motionOut.dash = dashVec;
      if (el >= c.durationMs && dodge.consumed >= dist - 1e-4) {
        dodge.active = false;
        const p = deps.motion.getPos();
        log('dodge_end', { moved: +Math.hypot(p.x - dodge.fromX, p.y - dodge.fromY).toFixed(3) });
      } else if (el >= c.durationMs + 250) {
        dodge.active = false; // frames muito lentos: não prende o herói
        log('dodge_end', { why: 'timeout' });
      }
    }
    // —— especial ——
    if (sp.id) {
      const c = specialCfg(sp.id);
      let guard = 0;
      while (sp.id && guard++ < 4) {
        const el = clock - sp.at;
        const dur = phaseDur(c, sp.phase);
        if (sp.phase === 'ACTIVE' && sp.id === 'dash') {
          const step = stepDash(sp.dirX, sp.dirY, c.distance, c.durationMs, el, sp.consumed);
          sp.consumed += step;
          if (step > 0) { motionOut.dash = dashVec; motionOut.dashThrough = true; }
          dashHits();
          if (el >= dur && sp.consumed >= c.distance - 1e-4 || el >= dur + 250) {
            sp.phase = 'RECOVERY';
            sp.at += dur;
            continue;
          }
          break;
        }
        if (el < dur) break;
        if (sp.phase === 'WINDUP') {
          sp.phase = 'ACTIVE';
          sp.at += dur;
          log('special_active', { id: sp.id });
          if (sp.id !== 'dash') resolveSpecialImpact();
          else aimSpecial();
          continue;
        }
        if (sp.phase === 'ACTIVE') { sp.phase = 'RECOVERY'; sp.at += dur; continue; }
        if (sp.phase === 'RECOVERY') { endSpecial('done'); break; }
      }
      if (sp.id && sp.id !== 'dash' && !motionOut.dash) {
        motionOut.speedMult = sp.id === 'suprema' ? 0 : sp.phase === 'RECOVERY' ? 0.6 : 0.25;
        motionOut.noRun = true;
      }
    }
    // —— defesa ——
    if (defend.held && !defend.active && canDefendNow()) {
      defend.active = true;
      defend.since = clock;
      deps.combat.setHeld?.(false);
      log('defend', {});
    } else if (defend.active && (dodge.active || sp.id)) {
      defend.active = false; // suspensa pela esquiva/especial; volta se ainda segurando
    }
    if (defend.active) {
      motionOut.speedMult = Math.min(motionOut.speedMult, all.defense.moveSpeedMult);
      motionOut.noRun = true;
    }
    // —— executa o buffer quando livre ——
    if (buffer.cmd && !dodge.active && !sp.id && clock >= hitStunUntil) {
      const cmd = buffer.cmd;
      const ph = combatPhase();
      if (cmd === 'dodge' && ph !== 'STARTUP' && ph !== 'ACTIVE') {
        buffer.cmd = null;
        const fromAtk = bufferFromAttack || inAttackWindow();
        bufferFromAttack = false;
        if (ph === 'RECOVERY') deps.combat.cancelRecovery?.();
        if (clock >= dodge.cooldownUntil) {
          if (!(fromAtk && tryDashStrike())) startDodge();
          stats.bufferUsed++;
        }
      } else if (cmd === 'attack' && !defend.active) {
        buffer.cmd = null;
        const r = deps.combat.press();
        if (r !== 'dup') stats.bufferUsed++;
      }
    }
    return motionOut;
  }

  /** Bloqueia o início de ataques do combate (buffer interno espera). */
  function blocksAttackStart() {
    return dead || critical || clock < hitStunUntil || dodge.active || !!sp.id || defend.active;
  }

  function getView() {
    let action = null;
    if (dodge.active) {
      const c = cfgAll().dodge;
      action = { kind: 'dodge', phase: 'ACTIVE', t: Math.min(1, (clock - dodge.at) / c.durationMs), dirX: dodge.dirX, dirY: dodge.dirY, iframes: inIFrames() };
    } else if (sp.id) {
      const c = specialCfg(sp.id);
      action = { kind: sp.id, phase: sp.phase, t: Math.min(1, (clock - sp.at) / Math.max(1, phaseDur(c, sp.phase))), yaw: sp.yaw, dirX: sp.dirX, dirY: sp.dirY };
    } else if (defend.active) {
      action = { kind: 'guard', phase: 'ACTIVE', t: Math.min(1, (clock - defend.since) / 120) };
    }
    return action;
  }

  function getButtonsInfo(state) {
    const nexa = deps.getNexa(state);
    const out = {};
    for (const id of SPECIAL_IDS) {
      const c = specialCfg(id);
      const left = cooldownLeft(id);
      out[id] = { cost: c.cost, cdLeftMs: left, cdFrac: left > 0 ? Math.min(1, left / (cdTotal[id] || c.cooldownMs)) : 0, affordable: nexa >= c.cost, active: sp.id === id };
    }
    const dl = Math.max(0, dodge.cooldownUntil - clock);
    const ds = cfgAll().dodge.dashStrike;
    out.dodge = { cost: 0, cdLeftMs: dl, cdFrac: dl > 0 ? dl / cfgAll().dodge.cooldownMs : 0, affordable: true, active: dodge.active,
      dashReady: !!ds?.enabled && out.dash.affordable && out.dash.cdLeftMs <= 0 };
    out.defend = { cost: 0, cdLeftMs: 0, cdFrac: 0, affordable: true, active: defend.active, held: defend.held };
    return out;
  }

  function getDebug() {
    return {
      state: getActionState(), clock: Math.round(clock),
      buffer: buffer.cmd ? { cmd: buffer.cmd, ageMs: Math.round(clock - buffer.at) } : null,
      combatBuffer: !!deps.combat.hasBuffer?.(),
      dodge: { active: dodge.active, cooldownMs: Math.max(0, Math.round(dodge.cooldownUntil - clock)), iframes: inIFrames(), elapsedMs: dodge.active ? Math.round(clock - dodge.at) : null, mode: dodge.mode },
      defend: { held: defend.held, active: defend.active },
      special: sp.id ? { id: sp.id, phase: sp.phase, hits: sp.hits, target: sp.targetUid } : null,
      cooldowns: Object.fromEntries(SPECIAL_IDS.map((id) => [id, Math.round(cooldownLeft(id))])),
      hitStunMs: Math.max(0, Math.round(hitStunUntil - clock)),
      stats: { ...stats }
    };
  }

  function reset() {
    dodge.active = false;
    dodge.cooldownUntil = 0;
    defend.active = false;
    defend.held = false;
    if (sp.id) endSpecial('reset');
    for (const id of SPECIAL_IDS) cooldowns[id] = 0;
    buffer.cmd = null;
    bufferFromAttack = false;
    lastAttackAt = -1e9;
    hitStunUntil = 0;
  }

  return {
    update, pressDodge, pressAttack, pressSpecial, setDefend, resolveIncoming, onHeroHit,
    blocksAttackStart, getActionState, getView, getButtonsInfo, getDebug, reset, inIFrames,
    getEvents: () => events.slice(),
    clearEvents: () => { events.length = 0; },
    cooldownLeft,
    getClock: () => clock,
    isDefending: () => defend.active,
    isDodging: () => dodge.active,
    currentSpecial: () => sp.id
  };
}
