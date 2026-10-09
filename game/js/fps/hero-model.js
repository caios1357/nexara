/**
 * NEXARA — HERÓI em 3ª pessoa (Bloco V): cavaleiro cibernético low-poly procedural,
 * articulado em grupos tipo "ossos" (quadril → coxa → canela; tronco → ombro → cotovelo →
 * pulso → lâmina fina), capuz + capa segmentada, linhas de brilho ciano (bloom).
 *
 * Animações procedurais (sem assets externos — ver game/assets/models/LICENSES.md):
 *   idle (respiração), walk/run (ciclo pela velocidade real), ataque em 3 golpes do combo
 *   sincronizados com as fases do player-combat (STARTUP → ACTIVE → RECOVERY), reação a dano
 *   (recuo + flash vermelho). O relógio `animTime` avança sempre (equivalente ao mixer.time).
 *
 * Convenção: frente do modelo = +Z local; direita do herói = −X local.
 * yaw do jogo (0 = olhando −Z) → root.rotation.y = π − yaw.
 */
import * as THREE from 'three';
import { getConfig } from '../gameplay-config.js?v=20261009perf';
import { mergeStaticParts } from './merge-util.js?v=20261009perf';
import { attachHeroGlb } from './hero-glb.js?v=20261009perf';

const CYAN = 0x39f0ff;

export function createHeroModel(opts = {}) {
  const root = new THREE.Group();
  root.name = 'hero';
  root.rotation.order = 'YXZ';

  // ── materiais (compartilhados entre as peças) ──
  const matArmor = new THREE.MeshStandardMaterial({ color: 0x26303c, roughness: 0.3, metalness: 0.72, emissive: 0x060c16 });
  const matArmor2 = new THREE.MeshStandardMaterial({ color: 0x3d4a5a, roughness: 0.28, metalness: 0.75 });
  const matCloth = new THREE.MeshStandardMaterial({ color: 0x1c222c, roughness: 0.85, metalness: 0.05, side: THREE.DoubleSide });
  const matUnder = new THREE.MeshStandardMaterial({ color: 0x151a22, roughness: 0.6, metalness: 0.4 });
  const matGlow = new THREE.MeshStandardMaterial({ color: CYAN, emissive: CYAN, emissiveIntensity: 1.25, roughness: 0.3, metalness: 0.1 });
  const matBlade = new THREE.MeshStandardMaterial({ color: 0xa8dcff, emissive: 0x3a9cff, emissiveIntensity: 2.4, roughness: 0.15, metalness: 0.6 });
  const matCore = new THREE.MeshBasicMaterial({ color: 0xbfe6ff });
  const matHalo = new THREE.MeshBasicMaterial({ color: 0x3a9cff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
  const matBladeAura = new THREE.MeshBasicMaterial({ color: 0x3a9cff, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false });
  const matEdge = new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const flashMats = [matArmor, matArmor2, matCloth];
  const baseEmissive = flashMats.map((m) => m.emissive.getHex());

  const box = (w, h, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  const joint = (name, x, y, z, parent) => { const g = new THREE.Group(); g.name = name; g.position.set(x, y, z); parent.add(g); return g; };
  const glowLine = (parent, w, h, d, x, y, z) => { const m = box(w, h, d, matGlow); m.position.set(x, y, z); parent.add(m); return m; };

  // ── quadril / pernas ──
  const hips = joint('hips', 0, 0.94, 0, root);
  const pelvis = box(0.36, 0.16, 0.24, matArmor);
  hips.add(pelvis);
  const belt = glowLine(hips, 0.37, 0.025, 0.25, 0, 0.06, 0);
  belt.scale.set(1, 1, 1);
  const legs = {};
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? 0.11 : -0.11;
    const thigh = joint(`thigh${side}`, sx, -0.06, 0, hips);
    const th = box(0.15, 0.42, 0.17, matUnder); th.position.y = -0.21; thigh.add(th);
    const plate = box(0.16, 0.26, 0.05, matArmor); plate.position.set(0, -0.18, 0.08); thigh.add(plate);
    const knee = joint(`knee${side}`, 0, -0.42, 0, thigh);
    const sh = box(0.13, 0.42, 0.15, matArmor); sh.position.y = -0.21; knee.add(sh);
    const greave = box(0.14, 0.3, 0.05, matArmor2); greave.position.set(0, -0.2, 0.075); knee.add(greave);
    glowLine(knee, 0.02, 0.26, 0.02, 0, -0.2, -0.078); // linha na panturrilha (visível de costas)
    const foot = box(0.14, 0.08, 0.26, matArmor); foot.position.set(0, -0.44, 0.05); knee.add(foot);
    legs[side] = { thigh, knee };
  }

  // ── tronco ──
  const spine = joint('spine', 0, 0.08, 0, hips);
  const abdomen = box(0.32, 0.22, 0.2, matUnder); abdomen.position.y = 0.1; spine.add(abdomen);
  const chest = joint('chest', 0, 0.22, 0, spine);
  const torso = box(0.44, 0.34, 0.26, matArmor); torso.position.y = 0.16; chest.add(torso);
  const breast = box(0.36, 0.2, 0.06, matArmor2); breast.position.set(0, 0.2, 0.13); chest.add(breast);
  const back = box(0.34, 0.28, 0.05, matArmor2); back.position.set(0, 0.17, -0.14); chest.add(back);
  // linhas de brilho nas costas: espinha + chevron (leitura em 3ª pessoa)
  glowLine(chest, 0.022, 0.26, 0.02, 0, 0.17, -0.168);
  const chevL = glowLine(chest, 0.16, 0.02, 0.02, 0.07, 0.25, -0.168); chevL.rotation.z = -0.5;
  const chevR = glowLine(chest, 0.16, 0.02, 0.02, -0.07, 0.25, -0.168); chevR.rotation.z = 0.5;
  glowLine(chest, 0.3, 0.018, 0.02, 0, 0.05, -0.165);
  const core = new THREE.Mesh(new THREE.CircleGeometry(0.055, 14), matCore); core.position.set(0, 0.22, 0.166); chest.add(core);
  // EVO (ref. do Caio): NÚCLEO azul no peito com halo + brilho que vaza pelas costas (visível na câmera de trás)
  const coreHalo = new THREE.Mesh(new THREE.CircleGeometry(0.13, 16), matHalo); coreHalo.position.set(0, 0.22, 0.17); chest.add(coreHalo);
  const coreBack = new THREE.Mesh(new THREE.CircleGeometry(0.09, 14), matHalo); coreBack.position.set(0, 0.2, -0.172); coreBack.rotation.y = Math.PI; chest.add(coreBack);

  // ── cabeça + capuz ──
  const neck = joint('neck', 0, 0.36, 0, chest);
  const head = joint('head', 0, 0.1, 0, neck);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), matUnder); skull.scale.set(1, 1.1, 1.05); head.add(skull);
  const visor = box(0.2, 0.035, 0.05, matGlow); visor.position.set(0, 0.01, 0.12); head.add(visor);
  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.175, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), matCloth);
  hood.scale.set(1, 1.18, 1.12); hood.position.set(0, 0.02, -0.02); head.add(hood);
  const hoodPeak = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.26, 8), matCloth);
  hoodPeak.position.set(0, 0.05, -0.17); hoodPeak.rotation.x = -1.9; head.add(hoodPeak);
  const mantle = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 0.16, 12, 1, true), matCloth);
  mantle.position.set(0, 0.34, -0.01); chest.add(mantle);

  // ── braços ──
  const arms = {};
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? 0.27 : -0.27;
    const shoulder = joint(`shoulder${side}`, sx, 0.3, 0, chest);
    const pad = box(0.19, 0.12, 0.24, matArmor2); pad.position.set(side === 'L' ? 0.03 : -0.03, 0.03, 0); pad.rotation.z = side === 'L' ? -0.25 : 0.25; shoulder.add(pad);
    glowLine(shoulder, 0.2, 0.016, 0.02, side === 'L' ? 0.03 : -0.03, 0.02, -0.125).rotation.z = side === 'L' ? -0.25 : 0.25;
    const upper = box(0.11, 0.3, 0.12, matUnder); upper.position.y = -0.16; shoulder.add(upper);
    const elbow = joint(`elbow${side}`, 0, -0.31, 0, shoulder);
    const fore = box(0.12, 0.27, 0.13, matArmor); fore.position.y = -0.14; elbow.add(fore);
    glowLine(elbow, 0.018, 0.2, 0.02, 0, -0.14, -0.068);
    const wrist = joint(`wrist${side}`, 0, -0.29, 0, elbow);
    const hand = box(0.09, 0.09, 0.1, matArmor2); hand.position.y = -0.03; wrist.add(hand);
    arms[side] = { shoulder, elbow, wrist };
  }

  // ── lâmina FINA na mão direita (procedural) ──
  const blade = joint('blade', 0, -0.05, 0.02, arms.R.wrist);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.17, 6), matUnder); grip.rotation.x = Math.PI / 2; grip.position.z = 0.0; blade.add(grip);
  const guard = box(0.12, 0.018, 0.022, matArmor2); guard.position.z = 0.09; blade.add(guard);
  const bladeLen = 0.92;
  const bladeMesh = box(0.026, 0.008, bladeLen, matBlade); bladeMesh.position.z = 0.1 + bladeLen / 2; blade.add(bladeMesh);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.009, 0.08, 4), matBlade); tip.rotation.x = Math.PI / 2; tip.position.z = 0.1 + bladeLen + 0.04; tip.scale.set(1, 1, 0.4); blade.add(tip);
  const bladeAura = box(0.075, 0.03, bladeLen + 0.06, matBladeAura); bladeAura.position.z = 0.1 + bladeLen / 2; blade.add(bladeAura); // lâmina azul sempre acesa
  const edge = box(0.004, 0.004, bladeLen, matEdge); edge.position.set(0.0095, 0, 0.1 + bladeLen / 2); blade.add(edge);

  // ── capa segmentada (3 elos que balançam) ──
  const cape = [];
  let capeParent = joint('cape0', 0, 0.33, -0.16, chest);
  const capeW = [0.5, 0.56, 0.6];
  for (let i = 0; i < 3; i++) {
    const seg = new THREE.Mesh(new THREE.PlaneGeometry(capeW[i], 0.34), matCloth);
    seg.position.y = -0.17;
    capeParent.add(seg);
    if (i === 2) { const hem = glowLine(capeParent, capeW[i], 0.016, 0.01, 0, -0.335, -0.004); hem.material = matGlow; }
    cape.push(capeParent);
    if (i < 2) capeParent = joint(`cape${i + 1}`, 0, -0.34, 0, capeParent);
  }

  // ── arco do golpe (rastro aditivo durante o impacto) ──
  const arcMat = new THREE.MeshBasicMaterial({ color: 0x6ff6ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const slash = new THREE.Mesh(new THREE.RingGeometry(0.75, 1.25, 28, 1, 0, Math.PI * 0.9), arcMat);
  slash.name = 'slashArc';
  slash.visible = false;
  root.add(slash);

  // ── Bloco 4: brilho de carga da lâmina + escudo de energia (defesa) ──
  const chargeMat = new THREE.MeshBasicMaterial({ color: 0x9ffbff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const bladeGlow = box(0.07, 0.05, bladeLen + 0.1, chargeMat);
  bladeGlow.position.z = 0.1 + bladeLen / 2;
  bladeGlow.visible = false;
  blade.add(bladeGlow);
  const shieldMat = new THREE.MeshBasicMaterial({ color: 0x39f0ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const shieldEdgeMat = new THREE.MeshBasicMaterial({ color: 0x8ffcff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const shield = new THREE.Group();
  shield.name = 'energyShield';
  const shieldFace = new THREE.Mesh(new THREE.CircleGeometry(0.62, 6), shieldMat);
  const shieldEdge = new THREE.Mesh(new THREE.RingGeometry(0.56, 0.64, 6), shieldEdgeMat);
  const shieldHex = new THREE.Mesh(new THREE.RingGeometry(0.26, 0.3, 6), shieldEdgeMat);
  shield.add(shieldFace, shieldEdge, shieldHex);
  shield.position.set(0, 1.18, 0.62);
  shield.rotation.z = Math.PI / 6;
  shield.visible = false;
  root.add(shield);

  root.traverse((o) => { if (o.isMesh && o.material !== matEdge && o.material !== arcMat && o.material !== chargeMat && o.material !== shieldMat && o.material !== shieldEdgeMat) { o.castShadow = true; } });

  // ── poses de ataque: [ombroR.x, ombroR.y, ombroR.z, cotoveloR.x, pulsoR.x, torçãoTronco, inclinação, ombroL.x] ──
  // pulso: +x inclina a lâmina para frente ao longo do antebraço (lâmina ⟂ mão)
  const REST = [-0.3, 0, -0.15, -0.5, 1.3, 0, 0.04, -0.2];
  const SWINGS = [
    // 1: corte horizontal direita → esquerda
    { wind: [-1.35, -0.2, -1.25, -0.5, 1.1, -0.65, 0.02, -0.6], end: [-1.25, 0.2, 0.8, -0.25, 1.0, 0.7, 0.12, 0.1], arc: { y: 1.25, rz: 0, flip: false } },
    // 2: revés esquerda → direita
    { wind: [-1.3, 0.2, 0.85, -0.35, 1.05, 0.65, 0.04, 0.1], end: [-1.05, -0.2, -1.1, -0.45, 1.0, -0.6, 0.12, -0.5], arc: { y: 1.1, rz: 0.25, flip: true } },
    // 3: finalizador — golpe descendente por cima da cabeça
    { wind: [-2.9, 0, -0.2, -0.7, 0.9, -0.15, -0.12, -1.2], end: [-0.55, 0, -0.1, -0.15, 1.0, 0.1, 0.32, 0.2], arc: { y: 1.2, rz: Math.PI / 2, flip: false } }
  ];
  // Bloco 4: poses das ações (mesmo formato)
  const ACT = {
    guard: [-1.35, 0.55, 0.95, -1.35, 0.35, 0.3, 0.06, -1.45],
    dodge: [-0.6, 0, -0.4, -1.2, 1.2, 0, 0.3, -0.9],
    golpeWind: [-3.0, 0, -0.3, -0.9, 0.8, -0.3, -0.18, -1.3],
    golpeEnd: [-0.4, 0, -0.1, -0.1, 1.0, 0.1, 0.45, 0.3],
    areaWind: [-1.4, -0.2, -1.4, -0.4, 1.1, -0.9, 0.1, -0.5],
    areaSpin: [-1.5, 0, -1.5, -0.1, 1.4, 0, 0.15, -0.3],
    dashWind: [-0.8, 0, -0.5, -1.4, 1.2, -0.2, 0.35, -0.6],
    dashThrust: [-1.55, 0, -0.1, -0.05, 1.5, 0.15, 0.5, 0.6],
    supWind: [-3.05, 0, -0.1, -0.4, 0.7, 0, -0.25, -3.0],
    supEnd: [-0.35, 0, -0.1, -0.05, 1.1, 0, 0.6, -0.3]
  };
  const pose = new Float32Array(8);
  const easeOut = (t) => 1 - (1 - t) * (1 - t);
  const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  function lerpPose(a, b, t) { for (let i = 0; i < 8; i++) pose[i] = a[i] + (b[i] - a[i]) * t; return pose; }

  const st = {
    animTime: 0, anim: 'idle', walkPhase: 0, speed: 0, yaw: 0, hurtT: 0, hurtDir: 1, attackPhase: 'IDLE', attackT: 0, combo: 0,
    capeSwing: 0, visible: true, swings: 0, lastSwingId: -1, action: 'none', actionPhase: '', shield: 0, charge: 0, leap: 0
  };

  /**
   * @param {number} dt s
   * @param {{ x:number, z:number, yaw:number, speed:number, runSpeed:number, attack?:{phase:string,t:number,comboIndex:number,swingId?:number} }} inp
   */
  function update(dt, inp) {
    st.animTime += dt;
    root.position.set(inp.x, 0, inp.z);
    st.yaw = inp.yaw;
    root.rotation.y = Math.PI - inp.yaw;
    const sp = Math.max(0, inp.speed || 0);
    st.speed += (sp - st.speed) * Math.min(1, dt * 10);
    const moveK = Math.min(1, st.speed / Math.max(0.1, inp.walkSpeed || 2.4));
    const runK = Math.max(0, Math.min(1, (st.speed - (inp.walkSpeed || 2.4)) / Math.max(0.1, (inp.runSpeed || 3.4) - (inp.walkSpeed || 2.4))));
    const a = inp.attack;
    const attacking = !!a && a.phase && a.phase !== 'IDLE' && a.phase !== 'COOLDOWN';
    st.attackPhase = a?.phase || 'IDLE';
    st.attackT = a?.t || 0;
    st.combo = a?.comboIndex || 0;
    if (attacking && a.swingId != null && a.swingId !== st.lastSwingId) { st.lastSwingId = a.swingId; st.swings++; }
    st.anim = st.hurtT > 0 ? 'hurt' : attacking ? `attack${st.combo + 1}` : st.speed > 0.15 ? (runK > 0.3 ? 'run' : 'walk') : 'idle';

    // ciclo de passada (fase pela distância percorrida → pés não "patinam")
    st.walkPhase += st.speed * dt * (2.6 + runK * 0.6);
    const s = Math.sin(st.walkPhase * Math.PI);
    const c = Math.cos(st.walkPhase * Math.PI);
    const stride = (0.55 + runK * 0.35) * moveK;
    legs.L.thigh.rotation.x = -s * stride;
    legs.R.thigh.rotation.x = s * stride;
    legs.L.knee.rotation.x = Math.max(0, c) * 0.9 * moveK + 0.05;
    legs.R.knee.rotation.x = Math.max(0, -c) * 0.9 * moveK + 0.05;
    const breathe = Math.sin(st.animTime * 2.1) * 0.012;
    hips.position.y = 0.94 - Math.abs(c) * 0.05 * moveK + breathe * 0.5 - (attacking ? 0.04 : 0);
    spine.rotation.x = 0.06 * moveK + runK * 0.12;
    chest.rotation.y = 0;
    chest.rotation.x = breathe;
    // braço esquerdo balança contra a perna; direito segura a lâmina
    let p;
    if (attacking) {
      const sw = SWINGS[Math.max(0, Math.min(2, st.combo))];
      if (a.phase === 'STARTUP') p = lerpPose(REST, sw.wind, easeOut(a.t));
      else if (a.phase === 'ACTIVE') p = lerpPose(sw.wind, sw.end, easeInOut(a.t));
      else p = lerpPose(sw.end, REST, easeInOut(a.t));
      // rastro do golpe no impacto
      if (a.phase === 'ACTIVE' || (a.phase === 'RECOVERY' && a.t < 0.35)) {
        slash.visible = true;
        const k = a.phase === 'ACTIVE' ? 0.35 + 0.65 * a.t : 1 - a.t / 0.35;
        arcMat.opacity = 0.75 * Math.max(0, Math.min(1, k));
        slash.position.set(0, sw.arc.y, 0.25);
        slash.rotation.set(-Math.PI / 2 + 0.55, 0, sw.arc.rz + (sw.arc.flip ? Math.PI : 0) + Math.PI * 0.05);
        const sc = 0.95 + 0.1 * a.t;
        slash.scale.set(sc, sc, sc);
      } else slash.visible = false;
    } else {
      slash.visible = false;
      p = lerpPose(REST, REST, 0);
      p[0] += -s * 0.18 * moveK; // leve balanço do braço da espada
    }
    // —— Bloco 4: ações (esquiva/defesa/especiais) sobrepõem a pose ——
    const act = inp.action;
    let acting = false;
    let chargeK = 0;
    let shieldK = 0;
    let leapY = 0;
    let extraYaw = 0;
    let tiltZ = 0;
    st.action = act ? act.kind : 'none';
    st.actionPhase = act ? act.phase : '';
    if (act) {
      acting = true;
      const t = act.t || 0;
      slash.visible = false;
      if (act.kind === 'guard') {
        p = lerpPose(REST, ACT.guard, Math.min(1, t * 1.5 + 0.35));
        shieldK = Math.min(1, t * 1.3 + 0.25);
        hips.position.y -= 0.07;
        legs.L.knee.rotation.x += 0.25;
        legs.R.knee.rotation.x += 0.25;
      } else if (act.kind === 'dodge') {
        p = lerpPose(REST, ACT.dodge, Math.sin(Math.min(1, t) * Math.PI));
        const k = Math.sin(Math.min(1, t) * Math.PI);
        hips.position.y -= 0.24 * k;
        // inclina para o lado/frente da esquiva (direção local ao herói)
        const ly = Math.atan2(act.dirX || 0, -(act.dirY || 0)) - inp.yaw;
        spine.rotation.x += 0.5 * k * Math.cos(ly);
        tiltZ = -0.35 * k * Math.sin(ly);
        legs.L.knee.rotation.x += 0.7 * k;
        legs.R.knee.rotation.x += 0.7 * k;
      } else if (act.kind === 'golpe_poderoso') {
        if (act.phase === 'WINDUP') { p = lerpPose(REST, ACT.golpeWind, easeOut(t)); chargeK = t; }
        else if (act.phase === 'ACTIVE') { p = lerpPose(ACT.golpeWind, ACT.golpeEnd, easeInOut(Math.min(1, t * 1.6))); chargeK = 1 - t * 0.5; }
        else { p = lerpPose(ACT.golpeEnd, REST, easeInOut(t)); chargeK = 0.5 * (1 - t); }
        hips.position.y -= 0.08;
      } else if (act.kind === 'ataque_area') {
        if (act.phase === 'WINDUP') { p = lerpPose(REST, ACT.areaWind, easeOut(t)); hips.position.y -= 0.12 * t; chargeK = t * 0.6; }
        else if (act.phase === 'ACTIVE') { p = lerpPose(ACT.areaWind, ACT.areaSpin, Math.min(1, t * 3)); extraYaw = easeInOut(t) * Math.PI * 2; hips.position.y -= 0.12; chargeK = 0.8; }
        else { p = lerpPose(ACT.areaSpin, REST, easeInOut(t)); }
      } else if (act.kind === 'dash') {
        if (act.phase === 'WINDUP') { p = lerpPose(REST, ACT.dashWind, easeOut(t)); hips.position.y -= 0.12 * t; }
        else if (act.phase === 'ACTIVE') { p = lerpPose(ACT.dashWind, ACT.dashThrust, Math.min(1, t * 3)); spine.rotation.x += 0.35; hips.position.y -= 0.1; chargeK = 0.7; }
        else { p = lerpPose(ACT.dashThrust, REST, easeInOut(t)); }
      } else if (act.kind === 'suprema') {
        const lh = inp.leapHeight ?? 0.9;
        if (act.phase === 'WINDUP') { p = lerpPose(REST, ACT.supWind, easeOut(Math.min(1, t * 1.4))); leapY = lh * Math.sin(Math.min(1, t) * Math.PI * 0.5); chargeK = t; }
        else if (act.phase === 'ACTIVE') { p = lerpPose(ACT.supWind, ACT.supEnd, easeInOut(Math.min(1, t * 2.2))); leapY = lh * Math.max(0, 1 - t * 3); chargeK = 1; hips.position.y -= 0.18 * Math.min(1, t * 3); }
        else { p = lerpPose(ACT.supEnd, REST, easeInOut(t)); hips.position.y -= 0.18 * (1 - t); chargeK = 0.4 * (1 - t); }
      } else acting = false;
    }
    st.shield += (shieldK - st.shield) * Math.min(1, dt * 14);
    shield.visible = st.shield > 0.02;
    if (shield.visible) {
      const pulse = 0.85 + Math.sin(st.animTime * 9) * 0.15;
      shieldMat.opacity = 0.22 * st.shield * pulse;
      shieldEdgeMat.opacity = 0.85 * st.shield;
      shield.scale.setScalar(0.7 + 0.3 * st.shield);
    }
    st.charge = chargeK;
    bladeGlow.visible = chargeK > 0.02;
    chargeMat.opacity = Math.min(0.9, chargeK * (0.75 + Math.sin(st.animTime * 30) * 0.15));
    matBlade.emissiveIntensity = 2.2 + chargeK * 4.5;
    st.leap = leapY;
    root.position.y = leapY + (inp.groundY || 0); // ARENA PRINCIPAL: relevo
    if (extraYaw) root.rotation.y = Math.PI - inp.yaw - extraYaw;
    arms.R.shoulder.rotation.set(p[0], p[1], p[2]);
    arms.R.elbow.rotation.x = p[3];
    arms.R.wrist.rotation.x = p[4];
    chest.rotation.y = p[5];
    spine.rotation.x += p[6];
    const armsBusy = attacking || acting;
    arms.L.shoulder.rotation.set(armsBusy ? p[7] : s * 0.5 * moveK - 0.1, 0, 0.12 + (armsBusy ? 0.2 : 0));
    arms.L.elbow.rotation.x = armsBusy ? -0.9 : -0.35 - Math.max(0, s) * 0.4 * moveK;
    head.rotation.y = -p[5] * 0.5;
    // capa: levanta com a velocidade + ondulação
    const flutter = Math.sin(st.animTime * (4 + runK * 5)) * (0.06 + 0.1 * moveK);
    st.capeSwing += ((0.12 + moveK * 0.55 + runK * 0.3) - st.capeSwing) * Math.min(1, dt * 4);
    cape[0].rotation.x = st.capeSwing * 0.55 + flutter * 0.5;
    cape[1].rotation.x = st.capeSwing * 0.35 + flutter;
    cape[2].rotation.x = st.capeSwing * 0.25 + flutter * 1.3;
    // reação a dano: recuo + flash
    if (st.hurtT > 0) {
      st.hurtT = Math.max(0, st.hurtT - dt);
      const k = st.hurtT / 0.32;
      spine.rotation.x -= 0.35 * k;
      root.rotation.z = Math.sin(st.animTime * 40) * 0.03 * k;
      const on = st.hurtT > 0.12;
      for (const m of flashMats) m.emissive.setHex(on ? 0x801010 : 0x000000);
      if (st.hurtT === 0) flashMats.forEach((m, i) => m.emissive.setHex(baseEmissive[i]));
    } else root.rotation.z = tiltZ;
    if (glb) glb.update(dt, { action: act, attacking, combo: st.combo, attackPhase: st.attackPhase, attackT: st.attackT, hurtT: st.hurtT, moveK, runK, speed: st.speed, walkSpeed: inp.walkSpeed || 2.4, runSpeed: inp.runSpeed || 3.4, yaw: inp.yaw, charge: chargeK, time: st.animTime });
    if (!procBodyVisible) bladeGlow.visible = false;
  }

  function hurt() { st.hurtT = 0.32; }
  // M3D: o GLB esconde o corpo procedural (rastro do golpe + escudo de energia continuam sendo os do procedural)
  let procBodyVisible = true;
  const vfxKeep = new Set();
  function setProceduralBodyVisible(v) {
    procBodyVisible = !!v;
    if (!vfxKeep.size) { slash.traverse((o) => vfxKeep.add(o)); shield.traverse((o) => vfxKeep.add(o)); }
    root.traverse((o) => {
      if (!o.isMesh || vfxKeep.has(o)) return;
      if (o.parent?.name === 'heroGlb' || isUnderGlb(o)) return;
      o.visible = procBodyVisible;
    });
  }
  function isUnderGlb(o) { for (let q = o.parent; q; q = q.parent) { if (q.name === 'heroGlb') return true; if (q === root) return false; } return false; }
  function setVisible(v) { st.visible = !!v; root.visible = !!v; }
  function getDebug() {
    return { action: st.action, actionPhase: st.actionPhase, shield: +st.shield.toFixed(3), shieldVisible: shield.visible, charge: +st.charge.toFixed(3), leap: +st.leap.toFixed(3), anim: st.anim, animTime: +st.animTime.toFixed(3), yaw: st.yaw, speed: +st.speed.toFixed(3), attackPhase: st.attackPhase, combo: st.combo, swings: st.swings, visible: root.visible, walkPhase: +st.walkPhase.toFixed(3), slash: slash.visible, bladeLength: bladeLen, bladeWidth: 0.016, model: glb ? { ...glb.info } : null };
  }
  // EVO: partes estáticas mescladas por junta (pivôs animados/VFX preservados) — menos draw calls
  let mergeInfo = null;
  if (getConfig().graphics?.mergeCharacterParts !== false) {
    const keep = [slash, bladeGlow];
    root.traverse((o) => { if (o.type === 'Group') keep.push(o); });
    mergeInfo = mergeStaticParts(root, keep);
  }
  const api = { root, update, hurt, setVisible, getDebug, blade, mergeInfo, setProceduralBodyVisible, glb: null };
  // ANTES do merge? não: o merge roda acima; o GLB entra depois e não é mesclado
  const glb = opts.glb === false ? null : attachHeroGlb(api, { styleId: opts.styleId, onReady: opts.onGlbReady });
  api.glb = glb;
  return api;
}
