/**
 * First-person arms / hands / nexa blade — hierarchical meshes parented to camera.
 * Pure FPS: this is the ONLY player visual (no world body mesh).
 * Idle bob when moving; brief interact gesture.
 * gp2: o golpe é dirigido pela máquina de estados do combate (setAttack):
 * PREPARO (wind-up visível) → IMPACTO (varredura rápida) → RECUPERAÇÃO, com
 * direção diferente por golpe do combo (1: dir→esq, 2: esq→dir, 3: vertical).
 */
import * as THREE from 'three';

const NEXA = 0x3ecfbf;
const SKIN = 0xe0b898;
const SLEEVE = 0x3a505c;
const SLEEVE_HL = 0x4a6a7a;
const BLADE = 0xc8d0d8;
const HILT = 0x4a3020;

export function createViewmodel(camera) {
  const root = new THREE.Group();
  root.name = 'viewmodel';
  camera.add(root);

  // Right arm group
  const rightArm = new THREE.Group();
  rightArm.position.set(0.28, -0.28, -0.42);
  root.add(rightArm);

  const rUpper = makeBox(0.09, 0.24, 0.09, SLEEVE, 0.45, 0.35);
  rUpper.position.set(0, -0.05, 0.02);
  rightArm.add(rUpper);

  const rFore = makeBox(0.075, 0.22, 0.075, SLEEVE_HL, 0.5, 0.3);
  rFore.position.set(0.02, -0.24, -0.04);
  rightArm.add(rFore);

  const rHand = makeBox(0.095, 0.085, 0.11, SKIN, 0.7, 0.05);
  rHand.position.set(0.02, -0.36, -0.06);
  rightArm.add(rHand);

  // Weapon
  const weapon = new THREE.Group();
  weapon.position.set(0.04, -0.32, -0.18);
  weapon.rotation.x = -0.35;
  weapon.rotation.z = 0.15;
  rightArm.add(weapon);

  const hilt = makeBox(0.032, 0.13, 0.032, HILT, 0.7, 0.15);
  hilt.position.set(0, 0, 0);
  weapon.add(hilt);

  const guard = makeBox(0.09, 0.022, 0.03, 0x6a7080, 0.4, 0.7);
  guard.position.set(0, 0.06, -0.02);
  weapon.add(guard);

  // gp3: lâmina FINA e elegante (perfil estreito + ponta afilada); gume Nexa mantido
  const blade = makeBox(0.022, 0.009, 0.5, BLADE, 0.22, 0.9);
  blade.position.set(0, 0.02, -0.28);
  weapon.add(blade);

  // ponta afilada (cunha achatada)
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.0155, 0.09, 4), blade.material);
  tip.rotation.x = -Math.PI / 2;
  tip.rotation.y = Math.PI / 4;
  tip.scale.set(1, 1, 0.42);
  tip.position.set(0, 0.02, -0.575);
  weapon.add(tip);

  // Glowing nexa edge (fio fino ao longo do gume)
  const edge = makeBox(0.006, 0.011, 0.49, NEXA, 0.3, 0.4);
  edge.position.set(0.013, 0.02, -0.28);
  edge.material.emissive = new THREE.Color(NEXA);
  edge.material.emissiveIntensity = 0.95;
  weapon.add(edge);

  const edge2 = makeBox(0.004, 0.008, 0.44, 0xa0fff0, 0.3, 0.2);
  edge2.position.set(-0.012, 0.02, -0.27);
  edge2.material.emissive = new THREE.Color(NEXA);
  edge2.material.emissiveIntensity = 0.5;
  weapon.add(edge2);

  // sulco central (fuller) — leitura de lâmina, não de barra
  const fuller = makeBox(0.005, 0.0105, 0.34, 0x2a3440, 0.5, 0.6);
  fuller.position.set(0, 0.02, -0.24);
  weapon.add(fuller);

  // Left arm
  const leftArm = new THREE.Group();
  leftArm.position.set(-0.28, -0.30, -0.40);
  root.add(leftArm);

  const lUpper = makeBox(0.085, 0.22, 0.085, SLEEVE, 0.45, 0.35);
  lUpper.position.set(0, -0.04, 0);
  leftArm.add(lUpper);

  const lFore = makeBox(0.075, 0.2, 0.075, SLEEVE_HL, 0.5, 0.3);
  lFore.position.set(-0.02, -0.22, -0.03);
  leftArm.add(lFore);

  const lHand = makeBox(0.085, 0.075, 0.095, SKIN, 0.7, 0.05);
  lHand.position.set(-0.02, -0.34, -0.05);
  leftArm.add(lHand);

  // Bracer glow
  const bracer = makeBox(0.1, 0.06, 0.1, NEXA, 0.4, 0.5);
  bracer.position.set(-0.02, -0.16, -0.03);
  bracer.material.emissive = new THREE.Color(NEXA);
  bracer.material.emissiveIntensity = 0.4;
  leftArm.add(bracer);

  const anim = {
    mode: 'idle',
    t: 0,
    lock: 0,
    moving: false
  };

  const baseR = { x: 0.28, y: -0.28, z: -0.42 };
  /**
   * Poses do braço direito: [px,py,pz (offset), rx,ry,rz (braço), wx,wz (arma)].
   * REST = pose normal; por golpe: WIND (fim do preparo) e END (fim da varredura).
   */
  const REST = [0, 0, 0, 0.15, 0.1, 0.05, -0.35, 0.15];
  const SWINGS = [
    // golpe 1 — corte horizontal da direita para a esquerda
    { wind: [0.06, 0.24, 0.04, 0.5, -0.9, -0.5, 0.1, -1.1], end: [-0.34, 0.1, -0.12, 0.1, 1.0, 0.4, -0.1, -1.4] },
    // golpe 2 — revés da esquerda para a direita
    { wind: [-0.3, 0.2, -0.02, 0.45, 1.0, 0.5, 0.1, 1.2], end: [0.08, 0.06, -0.12, 0.05, -0.9, -0.4, -0.15, 1.35] },
    // golpe 3 — finalizador vertical (de cima para baixo), mais amplo
    { wind: [-0.1, 0.34, 0.12, 1.5, 0.15, 0.1, 0.6, 0.1], end: [-0.1, 0.0, -0.22, -0.9, 0.1, 0.05, -1.1, 0.1] }
  ];

  const pose = new Array(8).fill(0);
  /** Retrato: FOV horizontal estreito → aproxima os braços do centro (k ≤ 1). */
  let aspectK = 1;
  function setAspect(aspect) {
    aspectK = Math.max(0.42, Math.min(1, (aspect || 1.6) / 1.6));
  }
  const atk = { phase: 'IDLE', t: 0, comboIndex: 0 };
  function easeOut(t) { return 1 - (1 - t) * (1 - t); }
  function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function lerpPose(a, b, t) {
    for (let i = 0; i < 8; i++) pose[i] = a[i] + (b[i] - a[i]) * t;
    return pose;
  }
  /** Estado do ataque vindo do player-combat (objeto view reutilizado). */
  function setAttack(view) {
    atk.phase = view.phase;
    atk.t = view.t;
    atk.comboIndex = view.comboIndex;
  }
  function applyAttackPose() {
    const sw = SWINGS[Math.max(0, Math.min(2, atk.comboIndex))];
    let p;
    if (atk.phase === 'STARTUP') p = lerpPose(REST, sw.wind, easeOut(atk.t));
    else if (atk.phase === 'ACTIVE') p = lerpPose(sw.wind, sw.end, easeInOut(atk.t));
    else p = lerpPose(sw.end, REST, easeInOut(atk.t));
    rightArm.position.set((baseR.x + p[0]) * aspectK, baseR.y + p[1], baseR.z + p[2]);
    rightArm.rotation.set(p[3], p[4], p[5]);
    weapon.rotation.x = p[6];
    weapon.rotation.z = p[7];
    // leve avanço do corpo no impacto
    if (atk.phase === 'ACTIVE') root.position.z -= Math.sin(atk.t * Math.PI) * 0.04;
  }
  const baseL = { x: -0.28, y: -0.30, z: -0.40 };

  function makeBox(w, h, d, color, roughness = 0.65, metalness = 0.25) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness
    });
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = false;
    return m;
  }

  function play(mode, lock = 0.32) {
    anim.mode = mode;
    anim.t = 0;
    anim.lock = lock;
  }

  function setMoving(v) {
    anim.moving = !!v;
  }

  function update(dt) {
    anim.t += dt;
    if (anim.lock > 0) {
      anim.lock -= dt;
      if (anim.lock <= 0 && (anim.mode === 'attack' || anim.mode === 'interact' || anim.mode === 'hurt')) {
        anim.mode = anim.moving ? 'walk' : 'idle';
      }
    } else if (anim.moving && anim.mode === 'idle') {
      anim.mode = 'walk';
    } else if (!anim.moving && anim.mode === 'walk') {
      anim.mode = 'idle';
    }

    rightArm.position.set(baseR.x * aspectK, baseR.y, baseR.z);
    rightArm.rotation.set(0.15, 0.1, 0.05);
    leftArm.position.set(baseL.x * aspectK, baseL.y, baseL.z);
    leftArm.rotation.set(0.2, -0.08, -0.05);
    weapon.rotation.x = -0.35;
    weapon.rotation.z = 0.15;
    root.rotation.z = 0;

    const bob = Math.sin(anim.t * (anim.moving ? 8 : 2.0)) * (anim.moving ? 0.014 : 0.005);
    const sway = Math.sin(anim.t * (anim.moving ? 4.0 : 1.2)) * (anim.moving ? 0.01 : 0.003);
    root.position.set(sway, bob - 0.02, 0);

    if (atk.phase !== 'IDLE') {
      applyAttackPose();
      if (anim.mode === 'hurt') {
        const g = Math.sin(Math.min(1, anim.t / 0.3) * Math.PI);
        root.position.z += g * 0.08;
        root.rotation.z = g * 0.08;
      }
      return;
    }

    if (anim.mode === 'walk' || anim.mode === 'idle') {
      rightArm.position.y += bob * 0.5;
      leftArm.position.y -= bob * 0.4;
      return;
    }

    if (anim.mode === 'attack') {
      const p = Math.min(1, anim.t / 0.28);
      const swing = Math.sin(p * Math.PI);
      rightArm.rotation.x = 0.15 - swing * 1.1;
      rightArm.rotation.y = 0.1 + swing * 0.35;
      rightArm.position.z = baseR.z - swing * 0.25;
      rightArm.position.y = baseR.y + swing * 0.12;
      weapon.rotation.x = -0.35 - swing * 0.8;
      return;
    }

    if (anim.mode === 'interact') {
      const p = Math.min(1, anim.t / 0.35);
      const g = Math.sin(p * Math.PI);
      leftArm.rotation.x = 0.2 - g * 0.9;
      leftArm.position.z = baseL.z - g * 0.2;
      leftArm.position.y = baseL.y + g * 0.15;
      return;
    }

    if (anim.mode === 'hurt') {
      const g = Math.sin(Math.min(1, anim.t / 0.3) * Math.PI);
      root.position.z = g * 0.08;
      root.rotation.z = g * 0.08;
      return;
    }
  }

  function dispose() {
    camera.remove(root);
    root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }

  return { root, play, setMoving, setAttack, setAspect, update, dispose, getAttack: () => ({ ...atk }), weaponGroup: weapon, rightArm };
}
