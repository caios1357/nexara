/**
 * First-person camera — eye-height PerspectiveCamera, yaw/pitch.
 * gp1: look estável — alvo (targetYaw/targetPitch) recebe o input; o yaw/pitch
 * renderizado segue o alvo com suavização exponencial (camera.smoothness).
 * Sem aceleração de swipe. Pitch limitado a [pitchMinDeg, pitchMaxDeg].
 * Posição segue a posição float do herói (player-motion) — sem lerp de tile.
 * Todos os números vêm de gameplay-config.js.
 */
import * as THREE from 'three';
import { getConfig, DEG, detectViewMode } from '../gameplay-config.js?v=20261003vil';
import { groundAt } from './ground.js?v=20261003vil';

export const TILE = 2; // world units per tile
/** Altura do olho — definida em gameplay-config.camera.eyeHeight (default 1.68). */
export const EYE_HEIGHT = getConfig().camera.eyeHeight;

/** Bloco V: 'third' (padrão, sobre o ombro) | 'first' (?fp=1). */
export const VIEW_MODE = detectViewMode();

function pitchLimits() {
  const c = VIEW_MODE === 'third' ? getConfig().thirdPerson : getConfig().camera;
  return [c.pitchMinDeg * DEG, c.pitchMaxDeg * DEG];
}
function defaultPitch() {
  return (VIEW_MODE === 'third' ? getConfig().thirdPerson.defaultPitchDeg : getConfig().camera.defaultPitchDeg) * DEG;
}
let aspectNow = 1;
const isPortrait = () => aspectNow < 0.9;
function baseFov() {
  const b = getConfig().arenaBoss?.camera;
  const extra = b && bossFrame > 0 ? bossFrame * b.extraFovDeg : 0;
  if (VIEW_MODE !== 'third') return getConfig().camera.fovDeg + extra;
  const t = getConfig().thirdPerson;
  return (isPortrait() ? t.portraitFovDeg : t.fovDeg) + extra;
}
/** Bloco 7: enquadramento do chefe colossal (0..1, suavizado pelo renderer) — afasta/eleva o braço e abre o FOV. */
let bossFrame = 0;
export function setBossFraming(k) { bossFrame = Math.max(0, Math.min(1, Number(k) || 0)); }
export function getBossFraming() { return bossFrame; }
function bossCam() { return getConfig().arenaBoss?.camera || null; }
/** Comprimento do braço e altura do pivô conforme a orientação da tela. */
function armDistance() {
  const t = getConfig().thirdPerson;
  const b = bossCam();
  return (isPortrait() ? t.portraitDistance : t.distance) + (b && bossFrame > 0 ? bossFrame * (isPortrait() ? b.extraDistancePortrait : b.extraDistance) : 0);
}
function pivotHeight() {
  const t = getConfig().thirdPerson;
  const b = bossCam();
  return (isPortrait() ? t.portraitPivotHeight : t.pivotHeight) + (b && bossFrame > 0 ? bossFrame * b.extraHeight : 0);
}

export function createFpsCamera() {
  const cfg0 = getConfig().camera;
  const camera = new THREE.PerspectiveCamera(baseFov(), 1, 0.08, 260);
  camera.rotation.order = 'YXZ';

  const state = {
    camera,
    /** yaw/pitch RENDERIZADOS (suavizados). Escrever direto = snap instantâneo. */
    yaw: 0, // 0 = olhando -Z = norte (tile Y decrescente)
    pitch: defaultPitch(),
    /** Alvo do input do jogador. */
    targetYaw: 0,
    targetPitch: defaultPitch(),
    visX: 0,
    visZ: 0,
    shake: 0,
    /** gp2: leve zoom-in (graus) durante o ataque — só visual, nunca trava o controle. */
    fovKick: 0,
    fovKickTarget: 0,
    locked: false,
    touchLookId: null,
    ready: false
  };
  /**
   * Braço-mola da 3ª pessoa. blocked(tx, ty) → true se o ponto (em tiles float) está dentro de parede.
   * armLen = comprimento atual (suavizado ao crescer, imediato ao encolher).
   */
  let blockedFn = null;
  const arm = { armLen: getConfig().thirdPerson.distance, target: getConfig().thirdPerson.distance, shoulder: getConfig().thirdPerson.shoulderOffset, hit: false, lastDt: 0 };
  const _piv = new THREE.Vector3();
  const _fwd = new THREE.Vector3();
  // Detecta escrita externa em state.yaw/pitch (scripts / setYawToward) → snap
  let lastYaw = state.yaw;
  let lastPitch = state.pitch;

  function clampPitch(p) {
    const [lo, hi] = pitchLimits();
    return Math.max(lo, Math.min(hi, p));
  }

  function tileToWorld(tx, ty) {
    return { x: (tx + 0.5) * TILE, z: (ty + 0.5) * TILE };
  }

  /** Posição em coordenadas float de tile (centro do tile = x+0.5). */
  function setPosition(fx, fy) {
    state.visX = fx * TILE;
    state.visZ = fy * TILE;
    state.ready = true;
  }

  /** Compat: snap no centro do tile inteiro. */
  function syncFromPlayer(px, py) {
    setPosition(px + 0.5, py + 0.5);
  }

  /**
   * Input de olhar em PIXELS. kind: 'touch' | 'mouse'.
   * Linear (sem aceleração), sensibilidade/horiz/vert do config, delta limitado.
   */
  let lastLookAt = -1e9;
  function applyLook(dxPx, dyPx, kind = 'touch') {
    if (dxPx || dyPx) lastLookAt = performance.now();
    const c = getConfig().camera;
    const lim = c.maxDeltaPerEventPx;
    const dx = Math.max(-lim, Math.min(lim, dxPx || 0));
    const dy = Math.max(-lim, Math.min(lim, dyPx || 0));
    const base = kind === 'mouse' ? c.mouseRadPerPx : c.touchRadPerPx;
    const s = base * c.sensitivity;
    syncExternal();
    state.targetYaw += dx * s * c.horizontalSpeed;
    state.targetPitch = clampPitch(state.targetPitch - dy * s * c.verticalSpeed * (c.invertY ? -1 : 1));
  }

  function syncExternal() {
    if (state.yaw !== lastYaw) {
      state.targetYaw = state.yaw;
      lastYaw = state.yaw;
    }
    if (state.pitch !== lastPitch) {
      state.pitch = clampPitch(state.pitch);
      state.targetPitch = state.pitch;
      lastPitch = state.pitch;
    }
  }

  /** Suavização exponencial em direção ao alvo — chamada 1× por frame. */
  function update(dt) {
    syncExternal();
    const c = getConfig().camera;
    const tau = (c.smoothness * c.smoothingMaxTauMs) / 1000;
    const k = tau > 0 ? 1 - Math.exp(-Math.max(0, dt) / tau) : 1;
    state.targetPitch = clampPitch(state.targetPitch);
    const dyaw = state.targetYaw - state.yaw;
    const dpitch = state.targetPitch - state.pitch;
    state.yaw = Math.abs(dyaw) < 1e-5 ? state.targetYaw : state.yaw + dyaw * k;
    state.pitch = Math.abs(dpitch) < 1e-5 ? state.targetPitch : clampPitch(state.pitch + dpitch * k);
    lastYaw = state.yaw;
    lastPitch = state.pitch;
    if (state.shake > 0) {
      state.shake *= Math.exp(-dt * 9);
      if (state.shake < 0.05) state.shake = 0;
    }
    const dk = state.fovKickTarget - state.fovKick;
    state.fovKick = Math.abs(dk) < 0.01 ? state.fovKickTarget : state.fovKick + dk * (1 - Math.exp(-Math.max(0, dt) * 18));
  }

  /** Ponto (metros) livre para a "esfera" da câmera? Testa o centro e 4 pontos no raio. */
  function freeAt(x, z, r) {
    if (!blockedFn) return true;
    const tx = x / TILE;
    const tz = z / TILE;
    const rt = r / TILE;
    return !(blockedFn(tx, tz) || blockedFn(tx + rt, tz) || blockedFn(tx - rt, tz) || blockedFn(tx, tz + rt) || blockedFn(tx, tz - rt));
  }

  /** Maior fração livre do segmento (ax,az)→(bx,bz) antes de entrar em parede (passo fixo). */
  function sweep(ax, az, bx, bz, len, r, step) {
    if (len <= 1e-4) return 0;
    const n = Math.max(1, Math.ceil(len / step));
    let free = 0;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      if (!freeAt(ax + (bx - ax) * t, az + (bz - az) * t, r)) break;
      free = t * len;
    }
    return free;
  }

  /** 3ª pessoa: pivô no ombro direito → braço para trás ao longo do olhar, com colisão. */
  function thirdPersonPosition(dt) {
    const t = getConfig().thirdPerson;
    const cy = Math.cos(state.pitch);
    _fwd.set(Math.sin(state.yaw) * cy, Math.sin(state.pitch), -Math.cos(state.yaw) * cy);
    const rx = Math.cos(state.yaw);
    const rz = Math.sin(state.yaw);
    // 1) ombro: encurta se o lado direito do herói estiver colado na parede
    const r = t.collisionRadius;
    const sh = t.shoulderOffset;
    const shFree = sh === 0 ? 0 : sweep(state.visX, state.visZ, state.visX + rx * sh, state.visZ + rz * sh, Math.abs(sh), r, t.collisionStep);
    const shoulder = Math.sign(sh) * shFree;
    // ARENA PRINCIPAL: relevo — pivô acompanha a altura do chão (0 nas outras zonas)
    _piv.set(state.visX + rx * shoulder, pivotHeight() + groundAt(state.visX / TILE, state.visZ / TILE), state.visZ + rz * shoulder);
    const dist = armDistance();
    // 2) braço: do pivô para trás (plano XZ decide a colisão — paredes vão do chão ao "céu")
    const bx = _piv.x - _fwd.x * dist;
    const bz = _piv.z - _fwd.z * dist;
    const flat = Math.hypot(_fwd.x, _fwd.z) * dist;
    const freeFlat = flat > 1e-4 ? sweep(_piv.x, _piv.z, bx, bz, flat, r, t.collisionStep) : 0;
    // Vale sempre o espaço livre real: a câmera NUNCA entra na parede. Se sobrar menos que minDistance
    // (canto / costas coladas), a câmera sobe acima do pivô em vez de recuar (paredes colidem só no plano XZ).
    let target = flat > 1e-4 ? Math.min(dist, (freeFlat / flat) * dist) : dist;
    let shoulder2 = shoulder;
    if (target < t.minDistance && shoulder !== 0 && flat > 1e-4) {
      // canto apertado: tenta o braço saindo do centro do herói (sem deslocamento de ombro) e fica com o mais longo
      const f0 = sweep(state.visX, state.visZ, state.visX - _fwd.x * dist, state.visZ - _fwd.z * dist, flat, r, t.collisionStep);
      const t0 = Math.min(dist, (f0 / flat) * dist);
      if (t0 > target) { target = t0; shoulder2 = 0; _piv.set(state.visX, _piv.y, state.visZ); }
    }
    arm.lift = target < t.minDistance ? (t.minDistance - target) : 0;
    arm.target = target;
    arm.hit = target < dist - 1e-3;
    if (target < arm.armLen) arm.armLen = target; // encolhe na hora: nunca atravessa
    else arm.armLen += (target - arm.armLen) * (1 - Math.exp(-Math.max(0, dt) * t.easeOutPerSec));
    arm.shoulder = shoulder2;
    return arm.armLen;
  }

  function updateCameraTransform(dt = 0.016) {
    const c = getConfig().camera;
    let sx = 0;
    let sy = 0;
    if (state.shake > 0) {
      const a = state.shake * 0.02 * (c.hitShake ?? 1);
      sx = (Math.random() - 0.5) * a;
      sy = (Math.random() - 0.5) * a;
    }
    if (VIEW_MODE === 'third') {
      const len = thirdPersonPosition(dt);
      camera.position.set(_piv.x - _fwd.x * len + sx, _piv.y - _fwd.y * len + sy + (arm.lift || 0), _piv.z - _fwd.z * len);
      { const gMin = groundAt(camera.position.x / TILE, camera.position.z / TILE) + 0.25; if (camera.position.y < Math.max(0.25, gMin)) camera.position.y = Math.max(0.25, gMin); }
    } else {
      camera.position.set(state.visX + sx, c.eyeHeight + sy + groundAt(state.visX / TILE, state.visZ / TILE), state.visZ);
    }
    const fov = baseFov() - state.fovKick;
    if (Math.abs(camera.fov - fov) > 0.005) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    // Negate yaw: Three.js +rotation.y looks -X; our yaw=+π/2 means look +X
    camera.rotation.y = -state.yaw;
    camera.rotation.x = state.pitch;
  }

  /** Look direction on XZ plane (unit) — reusa objeto (sem alocação por frame). */
  const _look = { x: 0, z: -1 };
  function lookDirFlat() {
    _look.x = Math.sin(state.yaw);
    _look.z = -Math.cos(state.yaw);
    return _look;
  }

  function moveAxes() {
    const fx = Math.sin(state.yaw);
    const fz = -Math.cos(state.yaw);
    const rx = Math.cos(state.yaw);
    const rz = Math.sin(state.yaw);
    return { forward: { dx: fx, dy: fz }, right: { dx: rx, dy: rz } };
  }

  function resize(cssW, cssH) {
    if (!cssW || !cssH) return;
    camera.aspect = cssW / cssH;
    aspectNow = camera.aspect;
    camera.fov = baseFov() - state.fovKick;
    camera.updateProjectionMatrix();
  }

  /** Yaw instantâneo (alvo + renderizado) — entrada em zona / orientação inicial. */
  /** gp3: giro relativo suave (vai para o alvo; a suavização faz o resto). */
  function addYaw(d) {
    syncExternal();
    state.targetYaw += d;
  }

  function setYawInstant(y) {
    state.yaw = y;
    state.targetYaw = y;
    lastYaw = y;
  }

  return {
    state,
    camera,
    tileToWorld,
    setPosition,
    syncFromPlayer,
    applyLook,
    update,
    updateCameraTransform,
    lookDirFlat,
    moveAxes,
    resize,
    setYawInstant,
    addYaw,
    /** Bloco 4: último giro manual (ms, performance.now) — o lock-on espera o jogador. */
    getLastLookAt: () => lastLookAt,
    getTargetYaw: () => state.targetYaw,
    mode: VIEW_MODE,
    /** Braço-mola: blocked(txFloat, tyFloat) → parede? */
    setBlocker(fn) { blockedFn = fn; },
    /** e2e: estado do braço (m) + pivô. */
    getArm() {
      return { armLen: arm.armLen, target: arm.target, hit: arm.hit, lift: arm.lift || 0, shoulder: arm.shoulder, pivot: { x: _piv.x, y: _piv.y, z: _piv.z }, distance: armDistance(), portrait: isPortrait() };
    },
    /** e2e: a câmera está dentro de uma parede? */
    cameraInWall() { return !!blockedFn && !freeAt(camera.position.x, camera.position.z, 0); },
    reset() {
      arm.armLen = armDistance();
      const p = clampPitch(defaultPitch());
      state.ready = false;
      state.shake = 0;
      state.fovKick = 0;
      state.fovKickTarget = 0;
      state.pitch = p;
      state.targetPitch = p;
      lastPitch = p;
      state.targetYaw = state.yaw;
      lastYaw = state.yaw;
    },
    shake(n = 6) {
      state.shake = Math.max(state.shake, n);
    },
    /** Zoom-in sutil (graus) — alvo suavizado; 0 volta ao FOV normal. */
    setFovKick(deg) {
      state.fovKickTarget = Math.max(0, deg || 0);
    },
    setYawToward(tx, ty, px, py) {
      const dx = tx - px;
      const dy = ty - py;
      if (dx === 0 && dy === 0) return;
      setYawInstant(Math.atan2(dx, -dy));
    },
    getYaw() { return state.yaw; },
    getPitch() { return state.pitch; },
    getPitchLimits: pitchLimits,
    getBaseFov: baseFov
  };
}
