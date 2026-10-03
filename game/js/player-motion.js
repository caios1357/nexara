/**
 * NEXARA — movimento CONTÍNUO do herói (Bloco 1 · gp1).
 *
 * - Posição em float (coordenadas de tile: centro do tile (x,y) = x+0.5, y+0.5).
 * - Velocidade com aceleração / desaceleração (gameplay-config.movement).
 * - Relativo ao yaw da câmera (FPS) ou eixos fixos (iso), com diagonais.
 * - Colisão AABB (meia-largura playerRadius) contra o mapa de tiles + tiles de
 *   NPC (collision.js), corpos inimigos por círculo (gp2), com deslizamento em paredes e sub-passos (nunca atravessa).
 * - Autoridade de tile preservada: quando o tile inteiro derivado da posição
 *   muda, chama tryMove() (gatilhos de quest, saídas G6↔E4, 02:17, NPC, save,
 *   minimapa continuam usando state.player.x/y inteiros).
 * - Qualquer mudança externa de state.player.x/y / zona (API de teste, respawn,
 *   load, saída de zona) re-sincroniza a posição float no centro do tile.
 *
 * Um único dono do movimento: este módulo. Sem loop próprio — é chamado pelo
 * rAF único do renderer ativo (update(state, dt, yaw, opts)).
 */
import { getConfig, DEG } from './gameplay-config.js?v=20261003m10c';
import { tryMove, maybeRespawn } from './actions.js?v=20261003m10c';
import { isWalkable, isWalkableHero, getTileType, TREE_TRUNK_R } from './map.js?v=20261003m10c';
import { moveAxisX, moveAxisY, wrapAngle } from './collision.js?v=20261003m10c';
import { getStat, STATS } from './modifiers.js?v=20261003m10c';

const KEY_MAP = {
  w: 'f', arrowup: 'f',
  s: 'b', arrowdown: 'b',
  a: 'l', arrowleft: 'l',
  d: 'r', arrowright: 'r'
};

export function createPlayerMotion() {
  /** Vetor analógico do joystick: +x direita, +y para baixo (tela). |v| ≤ 1. */
  const movementInput = { x: 0, y: 0 };
  const keys = { f: false, b: false, l: false, r: false };
  let runKey = false;
  let runHoldStart = 0;
  let running = false;

  const pos = { x: 0.5, y: 0.5 };
  const vel = { x: 0, y: 0 };
  const synced = { state: null, zoneId: null, tx: 0, ty: 0 };
  let zoneCache = null;
  let facing = 0;
  let facingVel = 0;
  let lastSpeed = 0;
  let keyboardBound = false;
  let keyboardActive = () => true;

  // —— input ——
  function setStick(x, y) {
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    movementInput.x = x || 0;
    movementInput.y = y || 0;
  }
  function clearStick() {
    movementInput.x = 0;
    movementInput.y = 0;
  }
  function clearKeys() {
    keys.f = keys.b = keys.l = keys.r = false;
    runKey = false;
  }
  function clearAll() {
    clearStick();
    clearKeys();
    runHoldStart = 0;
    running = false;
  }
  function stopNow() {
    clearAll();
    vel.x = 0;
    vel.y = 0;
    lastSpeed = 0;
  }

  function isTypingTarget(t) {
    const tag = t?.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable;
  }
  function onKeyDown(e) {
    if (isTypingTarget(e.target)) return;
    const k = e.key.toLowerCase();
    if (k === 'shift') { runKey = true; return; }
    const dir = KEY_MAP[k];
    if (!dir) return;
    if (!keyboardActive()) return;
    keys[dir] = true;
    e.preventDefault();
  }
  function onKeyUp(e) {
    const k = e.key.toLowerCase();
    if (k === 'shift') { runKey = false; return; }
    const dir = KEY_MAP[k];
    if (dir) keys[dir] = false;
  }
  function onBlur() { clearAll(); }
  function onVis() { if (document.hidden) clearAll(); }

  function bindKeyboard(isActive) {
    if (isActive) keyboardActive = isActive;
    if (keyboardBound) return;
    keyboardBound = true;
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVis);
  }

  // —— colisão ——
  function getZone(state) {
    if (zoneCache && zoneCache.id === state.zoneId) return zoneCache;
    zoneCache = state._data.zones.zones.find((z) => z.id === state.zoneId) || null;
    return zoneCache;
  }

  // Contexto do passo atual para a função estável blockedTile (sem closures por frame)
  let colState = null;
  let colZone = null;

  /**
   * Tiles bloqueados para o herói: paredes + NPCs (tile). Monstros NÃO entram
   * aqui (gp2): eles se movem em float, então o contato herói↔inimigo é
   * resolvido por círculos em resolveBodies().
   */
  function blockedTile(tx, ty) {
    const state = colState;
    const zone = colZone;
    if (!isWalkableHero(zone, tx, ty)) return true;
    // Tile onde o herói está (autoridade) nunca bloqueia a si mesmo
    if (tx === state.player.x && ty === state.player.y) return false;
    const npcs = state._data.npcs.npcs;
    for (let i = 0; i < npcs.length; i++) {
      const n = npcs[i];
      if (n.zone === zone.id && n.x === tx && n.y === ty) return true;
    }
    return false;
  }

  /**
   * Empurra o herói para fora dos corpos inimigos (círculos), respeitando
   * paredes. bodies: array reutilizado [{x,y,r}] fornecido pela IA.
   */
  function resolveBodies(bodies, r) {
    if (!bodies) return;
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      if (!b.active) continue;
      const dx = pos.x - b.x;
      const dy = pos.y - b.y;
      const min = r + b.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2);
      let nx = 1;
      let ny = 0;
      if (d > 1e-5) { nx = dx / d; ny = dy / d; }
      const push = min - d;
      moveAxisX(pos, nx * push, r, blockedTile);
      moveAxisY(pos, ny * push, r, blockedTile);
      // tira a componente da velocidade que entra no corpo
      const vn = vel.x * nx + vel.y * ny;
      if (vn < 0) { vel.x -= vn * nx; vel.y -= vn * ny; }
    }
  }

  /** MASTER 10: troncos de árvore = círculos pequenos (o herói desliza entre eles, não trava no tile inteiro) */
  function resolveTrees(zone, r) {
    if (!zone?.br) return;
    const cx = Math.floor(pos.x), cy = Math.floor(pos.y);
    for (let ty = cy - 1; ty <= cy + 1; ty++) for (let tx = cx - 1; tx <= cx + 1; tx++) {
      if (getTileType(zone, tx, ty) !== 'tree') continue;
      const bx = tx + 0.5, by = ty + 0.5; const dx = pos.x - bx, dy = pos.y - by; const min = r + TREE_TRUNK_R; const d2 = dx * dx + dy * dy;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2); let nx = 1, ny = 0; if (d > 1e-5) { nx = dx / d; ny = dy / d; }
      const push = min - d; moveAxisX(pos, nx * push, r, blockedTile); moveAxisY(pos, ny * push, r, blockedTile);
      const vn = vel.x * nx + vel.y * ny;
      // de frente para o tronco: escorrega para o lado (não trava atrás da árvore)
      const tx2 = -ny, ty2 = nx; const vt = vel.x * tx2 + vel.y * ty2; const sp = Math.hypot(vel.x, vel.y);
      if (vn < 0 && sp > 0.2 && Math.abs(vt) < sp * 0.5) { const sg = vt !== 0 ? Math.sign(vt) : ((tx + ty) & 1 ? 1 : -1); moveAxisX(pos, tx2 * sg * 0.06, r, blockedTile); moveAxisY(pos, ty2 * sg * 0.06, r, blockedTile); }
      if (vn < 0) { vel.x -= vn * nx; vel.y -= vn * ny; }
    }
  }

  function markSynced(state) {
    synced.state = state;
    synced.zoneId = state.zoneId;
    synced.tx = state.player.x;
    synced.ty = state.player.y;
  }

  /** Coloca a posição float no centro do tile autoritativo; zera velocidade. */
  function snapToTile(state) {
    if (!state) return;
    pos.x = state.player.x + 0.5;
    pos.y = state.player.y + 0.5;
    vel.x = 0;
    vel.y = 0;
    lastSpeed = 0;
    markSynced(state);
  }

  function externallyChanged(state) {
    return synced.state !== state ||
      synced.zoneId !== state.zoneId ||
      synced.tx !== state.player.x ||
      synced.ty !== state.player.y;
  }

  /**
   * Um passo de simulação.
   * @param {object} state
   * @param {number} dt segundos
   * @param {number} yaw base de movimento (rad; 0 = norte / -y)
   * @param {{ busy?: boolean, facingFromCamera?: boolean, onMoved?: Function, bodies?: Array }} opts
   * @returns {boolean} snapped/teleportado neste frame
   */
  function update(state, dt, yaw = 0, opts = {}) {
    if (!state || !state.player) return false;
    const zone = getZone(state);
    if (!zone) return false;
    let snapped = false;
    if (externallyChanged(state)) {
      snapToTile(state);
      snapped = true;
    }
    const cfg = getConfig().movement;
    dt = Math.min(Math.max(dt, 0), cfg.maxFrameDt);
    // Bloco 4: deslocamento forçado (esquiva / dash) — colide com paredes, ignora o stick
    if (opts.dash) { wasDashing = true; return applyDash(state, zone, dt, opts, snapped); }
    if (wasDashing) {
      // fim da esquiva/dash: não "desliza" com a velocidade do dash
      wasDashing = false;
      vel.x = 0;
      vel.y = 0;
      lastSpeed = 0;
    }

    // —— intenção (espaço local: frente = -y do stick) ——
    let ix = movementInput.x;
    let iy = movementInput.y;
    const kx = (keys.r ? 1 : 0) - (keys.l ? 1 : 0);
    const ky = (keys.b ? 1 : 0) - (keys.f ? 1 : 0);
    const usingKeys = kx !== 0 || ky !== 0;
    if (usingKeys) { ix += kx; iy += ky; }
    let mag = Math.hypot(ix, iy);
    if (mag > 1) { ix /= mag; iy /= mag; mag = 1; }
    if (opts.busy) mag = 0;

    // —— corrida ——
    const now = performance.now();
    const stickMag = Math.hypot(movementInput.x, movementInput.y);
    if (mag === 0) {
      running = false;
      runHoldStart = 0;
    } else if (usingKeys) {
      running = runKey;
      runHoldStart = 0;
    } else if (stickMag >= cfg.runThreshold) {
      if (!runHoldStart) runHoldStart = now;
      running = now - runHoldStart >= cfg.runHoldMs;
    } else {
      runHoldStart = 0;
      running = false;
    }

    let targetSpeed = 0;
    if (mag > 0) {
      const analog = usingKeys ? 1 : cfg.minAnalogSpeed + (1 - cfg.minAnalogSpeed) * mag;
      if (opts.noRun) running = false;
      const sm = Number.isFinite(opts.speedMult) ? Math.max(0, opts.speedMult) : 1;
      targetSpeed = getStat(STATS.MOVE_SPEED, cfg.walkSpeed) * cfg.speedScale * (running ? cfg.runMultiplier : 1) * analog * sm;
    }

    // Direção no mundo (tile x,y) a partir do yaw
    let tvx = 0;
    let tvy = 0;
    if (targetSpeed > 0) {
      const sf = -iy / mag;
      const sr = ix / mag;
      const s = Math.sin(yaw);
      const c = Math.cos(yaw);
      // frente = (sin, -cos) · direita = (cos, sin)
      tvx = (s * sf + c * sr) * targetSpeed;
      tvy = (-c * sf + s * sr) * targetSpeed;
    }

    // —— aceleração vetorial ——
    const dvx = tvx - vel.x;
    const dvy = tvy - vel.y;
    const dvl = Math.hypot(dvx, dvy);
    if (dvl > 0) {
      const reversing = targetSpeed > 0 && (vel.x * tvx + vel.y * tvy) < 0;
      const rate = targetSpeed > 0 && !reversing ? cfg.acceleration : cfg.deceleration;
      const stepV = Math.min(dvl, rate * dt);
      vel.x += (dvx / dvl) * stepV;
      vel.y += (dvy / dvl) * stepV;
    }
    let speed = Math.hypot(vel.x, vel.y);
    if (targetSpeed === 0 && speed < cfg.stopSpeed) {
      vel.x = 0;
      vel.y = 0;
      speed = 0;
    }
    lastSpeed = speed;

    // —— integração com sub-passos + colisão ——
    const prevX = pos.x;
    const prevY = pos.y;
    colState = state;
    colZone = zone;
    if (speed > 0) {
      const r = cfg.playerRadius;
      const dist = speed * dt;
      const n = Math.max(1, Math.ceil(dist / cfg.maxSubstep));
      const sx = (vel.x * dt) / n;
      const sy = (vel.y * dt) / n;
      let hitX = false;
      let hitY = false;
      for (let i = 0; i < n; i++) {
        if (!hitX && moveAxisX(pos, sx, r, blockedTile)) hitX = true;
        if (!hitY && moveAxisY(pos, sy, r, blockedTile)) hitY = true;
      }
      // Encostou na parede: zera o componente (desliza no outro eixo, sem "grudar")
      if (hitX) vel.x = 0;
      if (hitY) vel.y = 0;
    }
    resolveBodies(opts.bodies, cfg.playerRadius);
    resolveTrees(zone, cfg.playerRadius);
    return finishStep(state, dt, yaw, opts, prevX, prevY, speed, cfg, snapped);
  }

  /** Bloco 4: aplica o deslocamento de esquiva/dash deste frame (tiles), com colisão de parede. */
  const dashOut = { moved: 0, hitWall: false };
  let wasDashing = false;
  function applyDash(state, zone, dt, opts, snapped) {
    const cfg = getConfig().movement;
    const d = opts.dash;
    const prevX = pos.x;
    const prevY = pos.y;
    colState = state;
    colZone = zone;
    const r = cfg.playerRadius;
    const dist = Math.hypot(d.x, d.y);
    let hitX = false;
    let hitY = false;
    if (dist > 0) {
      const n = Math.max(1, Math.ceil(dist / cfg.maxSubstep));
      const sx = d.x / n;
      const sy = d.y / n;
      for (let i = 0; i < n; i++) {
        if (!hitX && moveAxisX(pos, sx, r, blockedTile)) hitX = true;
        if (!hitY && moveAxisY(pos, sy, r, blockedTile)) hitY = true;
      }
    }
    if (!opts.dashThrough) resolveBodies(opts.bodies, r);
    resolveTrees(zone, r);
    const ddt = Math.max(1e-3, dt);
    vel.x = (pos.x - prevX) / ddt;
    vel.y = (pos.y - prevY) / ddt;
    dashOut.moved = Math.hypot(pos.x - prevX, pos.y - prevY);
    dashOut.hitWall = hitX || hitY;
    d.moved = dashOut.moved;
    d.hitWall = dashOut.hitWall;
    const speed = Math.hypot(vel.x, vel.y);
    lastSpeed = speed;
    return finishStep(state, dt, facing, { ...opts, facingFromCamera: false, keepFacing: true }, prevX, prevY, speed, cfg, snapped);
  }

  function finishStep(state, dt, yaw, opts, prevX, prevY, speed, cfg, snapped) {
    // —— facing do corpo (iso / direção de ataque) ——
    if (opts.keepFacing) {
      facingVel = 0;
    } else if (opts.facingFromCamera) {
      facing = yaw;
      facingVel = 0;
    } else {
      if (speed > 0.15) {
        const target = Math.atan2(vel.x, -vel.y);
        turnToward(target, dt, cfg);
      } else {
        facingVel = 0;
      }
    }

    // —— sincroniza tile autoritativo ——
    const ntx = Math.floor(pos.x);
    const nty = Math.floor(pos.y);
    if (ntx !== state.player.x || nty !== state.player.y) {
      const dx = Math.sign(ntx - state.player.x);
      const dy = Math.sign(nty - state.player.y);
      const prevZone = state.zoneId;
      const ok = tryMove(state, dx, dy, { ignoreMonsters: true });
      if (!ok) {
        // Tile recusado pela autoridade → volta para a posição anterior
        pos.x = prevX;
        pos.y = prevY;
        vel.x = 0;
        vel.y = 0;
        lastSpeed = 0;
        markSynced(state);
      } else {
        const zoneChanged = state.zoneId !== prevZone;
        const teleported = !zoneChanged && (state.player.x !== ntx || state.player.y !== nty);
        if (zoneChanged || teleported) {
          zoneCache = null;
          snapToTile(state);
          snapped = true;
        } else {
          markSynced(state);
        }
        maybeRespawn(state);
        opts.onMoved?.({ zoneChanged, teleported });
      }
    }
    return snapped;
  }

  function turnToward(target, dt, cfg) {
    const maxW = cfg.turnSpeedDeg * DEG;
    const acc = cfg.turnAccelerationDeg * DEG;
    const diff = wrapAngle(target - facing);
    if (Math.abs(diff) < 0.002) {
      facing = target;
      facingVel = 0;
      return;
    }
    // velocidade desejada com frenagem (sem overshoot, sem giro instantâneo de 180°)
    const desired = Math.sign(diff) * Math.min(maxW, Math.sqrt(2 * acc * Math.abs(diff)));
    const dv = desired - facingVel;
    facingVel += Math.sign(dv) * Math.min(Math.abs(dv), acc * dt);
    let step = facingVel * dt;
    if (Math.abs(step) > Math.abs(diff)) step = diff;
    facing = wrapAngle(facing + step);
  }

  return {
    movementInput,
    setStick,
    clearStick,
    clearAll,
    stopNow,
    bindKeyboard,
    update,
    snapToTile,
    /** Posição float em tiles (objeto vivo — não mutar). */
    getPos: () => pos,
    getVelocity: () => vel,
    getSpeed: () => lastSpeed,
    isMoving: () => lastSpeed > 0.05,
    isRunning: () => running,
    getFacing: () => facing,
    setFacing: (a) => { facing = a; facingVel = 0; },
    getKeys: () => keys,
    /** Bloco 4: intenção local atual (stick + teclas; frente = -y), sem normalizar zona morta. */
    getInputVector: () => {
      const kx = (keys.r ? 1 : 0) - (keys.l ? 1 : 0);
      const ky = (keys.b ? 1 : 0) - (keys.f ? 1 : 0);
      let x = movementInput.x + kx;
      let y = movementInput.y + ky;
      const m = Math.hypot(x, y);
      if (m > 1) { x /= m; y /= m; }
      return { x, y };
    }
  };
}
