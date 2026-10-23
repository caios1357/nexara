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
import { getConfig } from '../gameplay-config.js?v=20261023drag';
import { mergeStaticParts } from './merge-util.js?v=20261023drag';
import { attachHeroGlb } from './hero-glb.js?v=20261023drag';
import { addArmorDetail } from './surface-fx.js?v=20261023drag';

/* LOTE-b M7 (pedido do Caio: "heróis quadrados demais"): volumes do herói/rivais com CANTOS ARREDONDADOS (bisel suave com normais
   esféricas — lê como peça moldada) e membros em CÁPSULA. Mesmo desenho/proporções; ?heroiQuadrado=1 volta às caixas (comparação). */
const SQUARE = typeof location !== 'undefined' && /[?&]heroiQuadrado=1\b/.test(location.search);
const _rbCache = new Map();
export function roundedBoxGeo(w, h, d, r) {
  r = Math.max(0.001, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
  const key = `${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}|${r.toFixed(3)}`; const c = _rbCache.get(key); if (c) return c;
  const g = new THREE.BoxGeometry(w, h, d, 2, 2, 2); const P = g.attributes.position, N = g.attributes.normal;
  const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    const cx = Math.max(-hx, Math.min(hx, x)), cy = Math.max(-hy, Math.min(hy, y)), cz = Math.max(-hz, Math.min(hz, z));
    let dx = x - cx, dy = y - cy, dz = z - cz; const L = Math.hypot(dx, dy, dz);
    if (L > 1e-6) { dx /= L; dy /= L; dz /= L; P.setXYZ(i, cx + dx * r, cy + dy * r, cz + dz * r); N.setXYZ(i, dx, dy, dz); }
  }
  // vértice do centro de cada face: normal da face (fica plano no meio, curva nas bordas)
  P.needsUpdate = true; N.needsUpdate = true; g.userData.rounded = true; g.userData.shared = true; _rbCache.set(key, g); return g;
}
const _capCache = new Map();
/** membro em cápsula com seção elíptica (w × d), altura total h */
export function limbGeo(w, h, d) {
  const key = `${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}`; const c = _capCache.get(key); if (c) return c;
  const r = Math.min(w, d) / 2; const g = new THREE.CapsuleGeometry(r, Math.max(0.01, h - 2 * r), 3, 10);
  g.scale(w / (2 * r), 1, d / (2 * r)); g.userData.shared = true; _capCache.set(key, g); return g;
}

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
  // HERÓI 3: KIT (estilo + editor + equipamento → cores/cabeça/rosto/capa/arma). Sem kit = cavaleiro clássico idêntico ao de antes.
  const K = opts.kit || null;
  const WHITE = new THREE.Color(0xffffff);
  const matSkin = new THREE.MeshStandardMaterial({ color: 0x9a7560, roughness: 0.62, metalness: 0.02 });
  const matFaceDark = new THREE.MeshStandardMaterial({ color: 0x0c0f14, roughness: 0.4, metalness: 0.5 });
  if (K) {
    matArmor.color.setHex(K.armor); matArmor.emissive.copy(new THREE.Color(K.armor).multiplyScalar(0.18));
    matArmor2.color.copy(new THREE.Color(K.armor).lerp(new THREE.Color(0x8a96a6), 0.2));
    matCloth.color.setHex(K.cloth); matUnder.color.copy(new THREE.Color(K.armor).multiplyScalar(0.62));
    if (K.glow != null) { const G = new THREE.Color(K.glow); matGlow.color.copy(G); matGlow.emissive.copy(G); matCore.color.copy(G.clone().lerp(WHITE, 0.7)); matHalo.color.copy(G); }
    const bg = K.bladeGlow ?? K.glow;
    if (bg != null) { const B = new THREE.Color(bg); matBlade.emissive.copy(B); matBlade.color.copy(B.clone().lerp(WHITE, 0.6)); matBladeAura.color.copy(B); matEdge.color.copy(B.clone().lerp(WHITE, 0.6)); }
  }
  const glowHex = K?.glow ?? CYAN;
  const matEye = new THREE.MeshBasicMaterial({ color: new THREE.Color(glowHex).lerp(WHITE, 0.45) });
  // GRÁFICOS 2: linhas de painel + micro-arranhões + borda ciano na armadura (shader, sem textura)
  if (getConfig().graphics.heroDetail !== false) { addArmorDetail(matArmor, { rim: glowHex, rimK: 0.42, panel: 9 }); addArmorDetail(matArmor2, { rim: glowHex, rimK: 0.3, panel: 12, scratch: 0.8 }); }
  const flashMats = [matArmor, matArmor2, matCloth];
  const baseEmissive = flashMats.map((m) => m.emissive.getHex());

  const box = (w, h, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); // peças finas (linhas de brilho, lâmina, guarda)
  /** volume arredondado (raio ~35% da menor medida, máx. 6 cm) */
  let roundN = 0;
  const rbox = (w, h, d, mat, k = 0.36) => (SQUARE ? box(w, h, d, mat) : (roundN++, new THREE.Mesh(roundedBoxGeo(w, h, d, Math.min(0.06, Math.min(w, h, d) * k)), mat)));
  /** membro (coxa/canela/braço/antebraço) em cápsula */
  const limb = (w, h, d, mat) => (SQUARE ? box(w, h, d, mat) : (roundN++, new THREE.Mesh(limbGeo(w, h, d), mat)));
  const joint = (name, x, y, z, parent) => { const g = new THREE.Group(); g.name = name; g.position.set(x, y, z); parent.add(g); return g; };
  const glowLine = (parent, w, h, d, x, y, z) => { const m = box(w, h, d, matGlow); m.position.set(x, y, z); parent.add(m); return m; };

  // ── quadril / pernas ──
  const hips = joint('hips', 0, 0.94, 0, root);
  const pelvis = rbox(0.36, 0.16, 0.24, matArmor, 0.45);
  hips.add(pelvis);
  const belt = glowLine(hips, 0.37, 0.025, 0.25, 0, 0.06, 0);
  belt.scale.set(1, 1, 1);
  const legs = {};
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? 0.11 : -0.11;
    const thigh = joint(`thigh${side}`, sx, -0.06, 0, hips);
    const th = limb(0.15, 0.42, 0.17, matUnder); th.position.y = -0.21; thigh.add(th);
    const plate = rbox(0.16, 0.26, 0.05, matArmor, 0.45); plate.position.set(0, -0.18, 0.08); thigh.add(plate);
    const knee = joint(`knee${side}`, 0, -0.42, 0, thigh);
    const sh = limb(0.13, 0.42, 0.15, matArmor); sh.position.y = -0.21; knee.add(sh);
    const greave = rbox(0.14, 0.3, 0.05, matArmor2, 0.45); greave.position.set(0, -0.2, 0.075); knee.add(greave);
    glowLine(knee, 0.02, 0.26, 0.02, 0, -0.2, -0.078); // linha na panturrilha (visível de costas)
    const foot = rbox(0.14, 0.08, 0.26, matArmor, 0.45); foot.position.set(0, -0.44, 0.05); knee.add(foot);
    legs[side] = { thigh, knee };
  }

  // ── tronco ──
  const spine = joint('spine', 0, 0.08, 0, hips);
  const abdomen = rbox(0.32, 0.22, 0.2, matUnder, 0.45); abdomen.position.y = 0.1; spine.add(abdomen);
  const chest = joint('chest', 0, 0.22, 0, spine);
  const torso = rbox(0.44, 0.34, 0.26, matArmor, 0.42); torso.position.y = 0.16; chest.add(torso);
  const breast = rbox(0.36, 0.2, 0.06, matArmor2, 0.45); breast.position.set(0, 0.2, 0.13); chest.add(breast);
  const back = rbox(0.34, 0.28, 0.05, matArmor2, 0.45); back.position.set(0, 0.17, -0.14); chest.add(back);
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
  const visor = rbox(0.2, 0.035, 0.05, matGlow, 0.45); visor.position.set(0, 0.01, 0.12); head.add(visor);
  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.175, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), matCloth);
  hood.scale.set(1, 1.18, 1.12); hood.position.set(0, 0.02, -0.02); head.add(hood);
  const hoodPeak = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.26, 8), matCloth);
  hoodPeak.position.set(0, 0.05, -0.17); hoodPeak.rotation.x = -1.9; head.add(hoodPeak);
  const mantle = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 0.16, 12, 1, true), matCloth);
  mantle.position.set(0, 0.34, -0.01); chest.add(mantle);

  // ── braços ──
  const arms = {}; const pads = []; const fores = {};
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? 0.27 : -0.27;
    const shoulder = joint(`shoulder${side}`, sx, 0.3, 0, chest);
    const pad = rbox(0.19, 0.12, 0.24, matArmor2, 0.48); pad.position.set(side === 'L' ? 0.03 : -0.03, 0.03, 0); pad.rotation.z = side === 'L' ? -0.25 : 0.25; shoulder.add(pad); pads.push(pad);
    glowLine(shoulder, 0.2, 0.016, 0.02, side === 'L' ? 0.03 : -0.03, 0.02, -0.125).rotation.z = side === 'L' ? -0.25 : 0.25;
    const upper = limb(0.11, 0.3, 0.12, matUnder); upper.position.y = -0.16; shoulder.add(upper);
    const elbow = joint(`elbow${side}`, 0, -0.31, 0, shoulder);
    const fore = limb(0.12, 0.27, 0.13, matArmor); fore.position.y = -0.14; elbow.add(fore); fores[side] = fore;
    glowLine(elbow, 0.018, 0.2, 0.02, 0, -0.14, -0.068);
    const wrist = joint(`wrist${side}`, 0, -0.29, 0, elbow);
    const hand = rbox(0.09, 0.09, 0.1, matArmor2, 0.45); hand.position.y = -0.03; wrist.add(hand);
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
  // HERÓI 3: capa CURVA e afunilada (gomo de cilindro aberto: estreita nos ombros, abre embaixo, envolve o corpo) + bordas acesas
  const CR = [[0.2, 0.25], [0.25, 0.29], [0.29, 0.32]]; const CL = 1.95; // raios topo/base por elo; ângulo do gomo (rad)
  for (let i = 0; i < 3; i++) {
    const [rt, rb] = CR[i];
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, 0.34, 9, 1, true, Math.PI - CL / 2, CL), matCloth);
    seg.position.set(0, -0.17, (rt + rb) / 2);
    capeParent.add(seg);
    for (const sd of [-1, 1]) { const ang = Math.PI + sd * CL / 2; const rm = (rt + rb) / 2; const ed = glowLine(capeParent, 0.012, 0.34, 0.012, Math.sin(ang) * rm, -0.17, (rt + rb) / 2 + Math.cos(ang) * rm); ed.rotation.z = -sd * Math.atan2(rb - rt, 0.34) * 0; }
    if (i === 2) { const hem = new THREE.Mesh(new THREE.CylinderGeometry(rb + 0.004, rb + 0.004, 0.018, 9, 1, true, Math.PI - CL / 2, CL), matGlow); hem.position.set(0, -0.335, (rt + rb) / 2); capeParent.add(hem); }
    cape.push(capeParent);
    if (i < 2) capeParent = joint(`cape${i + 1}`, 0, -0.34, 0, capeParent);
  }

  const kitInfo = { head: K ? K.head : 'classico', face: K ? K.face : 'visor', weapon: K ? K.weapon : 'espada', cape: K ? K.cape !== false : true, parts: 0, get rounded() { return roundN; } };
  if (K) {
    const rm = (o) => { if (o?.parent) o.parent.remove(o); };
    const add = (geo, mat, x, y, z, parent = head) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); kitInfo.parts++; return m; };
    // ── ROSTO ──
    if (K.face !== 'visor') rm(visor);
    if (K.face === 'olhos' || K.face === 'mascara' || K.face === 'ciber') {
      skull.material = matSkin;
      const brow = add(new THREE.BoxGeometry(0.15, 0.022, 0.03), matFaceDark, 0, 0.045, 0.118); brow.rotation.x = -0.25;
      add(new THREE.BoxGeometry(0.026, 0.05, 0.03), matSkin, 0, -0.005, 0.135); // nariz
      for (const sx of [-0.045, 0.045]) {
        const cyb = K.face === 'ciber' && sx < 0;
        const e = add(cyb ? new THREE.SphereGeometry(0.024, 10, 8) : new THREE.BoxGeometry(0.036, 0.015, 0.02), cyb ? matEye : matEye, sx, 0.018, 0.124);
        if (!cyb) e.rotation.z = sx > 0 ? -0.2 : 0.2;
      }
      if (K.face === 'mascara') { const mk = add(new THREE.BoxGeometry(0.2, 0.075, 0.07), matCloth, 0, -0.045, 0.1); mk.scale.set(1, 1, 1.1); }
      else add(new THREE.BoxGeometry(0.06, 0.008, 0.02), matFaceDark, 0, -0.05, 0.125); // boca
      if (K.face === 'ciber') { // meia-placa de sucata + aro do olho biônico
        const hp = add(new THREE.SphereGeometry(0.138, 10, 8, 0, Math.PI, 0, Math.PI * 0.75), matArmor2, 0, 0.0, 0); hp.rotation.y = -Math.PI / 2; hp.scale.set(1.04, 1.12, 1.08);
        const ring = add(new THREE.TorusGeometry(0.03, 0.007, 5, 12), matArmor2, -0.045, 0.018, 0.128);
        add(SQUARE ? new THREE.BoxGeometry(0.16, 0.04, 0.05) : roundedBoxGeo(0.16, 0.04, 0.05, 0.018), matArmor2, 0, -0.085, 0.07); // mandíbula de metal
        ring.rotation.y = 0;
      }
    }
    // ── CABEÇA ──
    if (K.head !== 'capuz') { rm(hood); rm(hoodPeak); }
    else { const seam = add(new THREE.BoxGeometry(0.014, 0.012, 0.3), matGlow, 0, 0.2, -0.06); seam.rotation.x = -0.9; }
    if (K.head === 'chapeu') { // chapéu rúnico: aba larga + cone torto + faixa de runas acesa + estrela na ponta
      add(new THREE.CylinderGeometry(0.3, 0.32, 0.02, 18), matCloth, 0, 0.1, -0.01);
      const cone = add(new THREE.ConeGeometry(0.155, 0.46, 12), matCloth, 0, 0.33, -0.04); cone.rotation.x = -0.22;
      const band = add(new THREE.TorusGeometry(0.152, 0.013, 4, 20), matGlow, 0, 0.13, -0.012); band.rotation.x = Math.PI / 2;
      add(new THREE.OctahedronGeometry(0.03, 0), matEye, 0, 0.555, -0.095);
    } else if (K.head === 'elmo') { // elmo do Arsenal: casco + viseira em T + crista/chifres
      const hm = new THREE.MeshStandardMaterial({ color: new THREE.Color(K.helmColor ?? K.armor).lerp(new THREE.Color(0x8a96a6), K.helmColor != null ? 0.3 : 0.25).getHex(), metalness: 0.78, roughness: 0.3, emissive: new THREE.Color(K.helmGlow ?? glowHex).multiplyScalar(0.06) });
      flashMats.push(hm); baseEmissive.push(hm.emissive.getHex());
      const hg = new THREE.MeshBasicMaterial({ color: new THREE.Color(K.helmGlow ?? glowHex).lerp(WHITE, 0.3) });
      const shell = add(new THREE.SphereGeometry(0.158, 14, 10), hm, 0, 0.02, -0.005); shell.scale.set(1, 1.12, 1.12);
      add(new THREE.BoxGeometry(0.2, 0.03, 0.06), hm, 0, 0.055, 0.12); // sobrancelha do elmo
      visor.material = hg; visor.position.set(0, 0.012, 0.15); visor.scale.set(0.85, 1, 1);
      add(new THREE.BoxGeometry(0.026, 0.09, 0.02), hg, 0, -0.03, 0.158);
      add(SQUARE ? new THREE.BoxGeometry(0.17, 0.05, 0.08) : roundedBoxGeo(0.17, 0.05, 0.08, 0.022), hm, 0, -0.1, 0.07); // queixeira
      const nape = add(new THREE.TorusGeometry(0.168, 0.011, 4, 22, Math.PI * 1.2), hg, 0, -0.03, -0.005); nape.rotation.set(Math.PI / 2, 0, Math.PI * 0.4);
      if (K.crest === 'samurai') { for (const sd of [-1, 1]) { const v = add(new THREE.BoxGeometry(0.03, 0.26, 0.02), hg, sd * 0.07, 0.2, 0.13); v.rotation.z = sd * -0.45; } add(new THREE.CylinderGeometry(0.24, 0.26, 0.03, 14), hm, 0, -0.02, -0.02).rotation.x = 0.25; }
      else if (K.crest === 'crista') { const c = add(new THREE.BoxGeometry(0.034, 0.13, 0.36), hg, 0, 0.19, -0.04); c.rotation.x = 0.15; }
      else if (K.crest === 'chifres' || K.crest === 'demonio') {
        const big = K.crest === 'demonio';
        const hornM = new THREE.MeshStandardMaterial({ color: big ? 0x2a1210 : 0x3b302b, roughness: 0.5, metalness: 0.35, emissive: big ? new THREE.Color(K.helmGlow ?? 0xff3a1e).multiplyScalar(0.25) : new THREE.Color(0x000000) });
        for (const sd of [-1, 1]) { const h = add(new THREE.ConeGeometry(big ? 0.042 : 0.032, big ? 0.3 : 0.24, 7), hornM, sd * 0.13, 0.14, 0.0); h.rotation.set(big ? -0.35 : 0.1, 0, sd * -(big ? 0.55 : 1.05)); if (big) add(new THREE.SphereGeometry(0.016, 6, 5), hg, sd * 0.2, 0.28, -0.05); }
      }
    } else if (K.head === 'careca') { /* rosto descoberto já montado acima */ }
    else if (K.head === 'cabelo') { // CAÇADORA: cabelo de fogo espetado + rabo de cavalo alto (silhueta da folha)
      const hm = new THREE.MeshStandardMaterial({ color: K.hair ?? 0xff7a1a, roughness: 0.6, metalness: 0.05, emissive: new THREE.Color(K.hair ?? 0xff7a1a).multiplyScalar(0.18) });
      const cap = add(new THREE.SphereGeometry(0.15, 12, 9, 0, Math.PI * 2, 0, Math.PI * 0.58), hm, 0, 0.025, -0.01); cap.scale.set(1.05, 1.1, 1.12);
      for (let i = 0; i < 4; i++) { const sp = add(new THREE.ConeGeometry(0.045, 0.16, 5), hm, (i - 1.5) * 0.06, 0.13, 0.09); sp.rotation.x = 1.1; sp.rotation.z = (i - 1.5) * 0.25; }
      const tail = add(new THREE.ConeGeometry(0.07, 0.42, 7), hm, 0, 0.12, -0.2); tail.rotation.x = -2.3;
      add(new THREE.SphereGeometry(0.06, 8, 6), hm, 0, 0.2, -0.12);
    }
    if (K.horns && K.head === 'capuz') { const hm2 = new THREE.MeshStandardMaterial({ color: 0x2a2030, roughness: 0.5, metalness: 0.4 }); for (const sd of [-1, 1]) { const h = add(new THREE.ConeGeometry(0.035, 0.22, 6), hm2, sd * 0.12, 0.17, -0.02); h.rotation.set(-0.3, 0, sd * -0.7); } }
    if (K.scarf) { const sc = add(new THREE.CylinderGeometry(0.15, 0.2, 0.09, 12, 1, true), matCloth, 0, 0.4, 0.0, chest); sc.rotation.x = 0.1; }
    // ── OMBROS / PLACAS / BRAÇO BIÔNICO ──
    for (const pd of pads) pd.scale.multiplyScalar(K.pad || 1);
    if (K.plates) {
      const pm = new THREE.MeshStandardMaterial({ color: K.plates.color ?? 0x5a6070, metalness: 0.82, roughness: 0.28, emissive: new THREE.Color(K.plates.glow ?? glowHex), emissiveIntensity: K.plates.glow ? 0.28 : 0.06 });
      flashMats.push(pm); baseEmissive.push(pm.emissive.getHex());
      add(SQUARE ? new THREE.BoxGeometry(0.38, 0.17, 0.04) : roundedBoxGeo(0.38, 0.17, 0.04, 0.018), pm, 0, 0.21, 0.165, chest);
      add(SQUARE ? new THREE.BoxGeometry(0.36, 0.22, 0.035) : roundedBoxGeo(0.36, 0.22, 0.035, 0.016), pm, 0, 0.18, -0.175, chest);
      for (const pd of pads) { pd.material = pm; }
      add(new THREE.BoxGeometry(0.3, 0.012, 0.02), matGlow, 0, 0.12, 0.19, chest);
    }
    if (K.cyberArm && fores.L) { fores.L.scale.set(1.4, 1.12, 1.4); fores.L.material = matArmor2; add(new THREE.BoxGeometry(0.17, 0.02, 0.18), matGlow, 0, -0.08, 0, arms.L.elbow); add(new THREE.BoxGeometry(0.17, 0.02, 0.18), matGlow, 0, -0.2, 0, arms.L.elbow); }
    if (K.bulk) root.scale.set(K.bulk, 1, K.bulk);
    // ── ARMA ──
    if (K.weapon === 'montante') blade.scale.set(1.9, 1.6, 1.3);
    else if (K.weapon === 'lanca') { blade.scale.set(0.85, 1, 1.6); add(new THREE.ConeGeometry(0.04, 0.16, 4), matBlade, 0, 0, 0.1 + bladeLen + 0.05, blade).rotation.x = Math.PI / 2; }
    else if (K.weapon === 'adagas') {
      blade.scale.set(1.2, 1.3, 0.42);
      const off = joint('bladeOff', 0, -0.05, 0.02, arms.L.wrist);
      const g2 = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.12, 6), matUnder); g2.rotation.x = Math.PI / 2; off.add(g2);
      const b2 = box(0.032, 0.008, 0.36, matBlade); b2.position.z = 0.24; off.add(b2);
      const a2 = box(0.08, 0.03, 0.4, matBladeAura); a2.position.z = 0.24; off.add(a2);
      off.rotation.x = 1.25; kitInfo.parts += 3;
    }
    // ── 9 PERSONAGENS (folhas do Caio): peças extras procedurais (leves, entram no merge estático) ──
    const RB = (w, h, d) => (SQUARE ? new THREE.BoxGeometry(w, h, d) : roundedBoxGeo(w, h, d, Math.min(0.03, Math.min(w, h, d) * 0.4)));
    if (K.weapon === 'katana') { blade.scale.set(0.8, 1, 1.12); add(new THREE.CylinderGeometry(0.05, 0.05, 0.012, 10), matArmor2, 0, 0, 0.09, blade).rotation.x = Math.PI / 2; }
    else if (K.weapon === 'machados') { // dois machados de lava (cabo curto + lâmina larga) — mão direita e esquerda
      blade.scale.set(1.3, 1.3, 0.5);
      const axeHead = (par) => { const hd = add(RB(0.05, 0.26, 0.2), matBlade, 0, 0.1, 0.42, par); hd.rotation.x = 0.1; add(new THREE.BoxGeometry(0.06, 0.3, 0.05), matBladeAura, 0, 0.1, 0.5, par); };
      axeHead(blade);
      const off = joint('axeOff', 0, -0.05, 0.02, arms.L.wrist); off.rotation.x = 1.25;
      const g2 = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.5, 6), matUnder); g2.rotation.x = Math.PI / 2; g2.position.z = 0.2; off.add(g2); axeHead(off); kitInfo.parts++;
    }
    if (K.shield) { // escudo do CAVALEIRO no antebraço esquerdo (placa + borda e cruz douradas)
      const sm = new THREE.MeshStandardMaterial({ color: K.armor, metalness: 0.7, roughness: 0.32 }); flashMats.push(sm); baseEmissive.push(0);
      const sg = joint('kitShield', 0.09, -0.16, 0.02, arms.L.elbow);
      const pl = add(RB(0.05, 0.5, 0.38), sm, 0, 0, 0, sg); pl.scale.set(1, 1, 1);
      add(new THREE.BoxGeometry(0.06, 0.52, 0.03), matGlow, 0.01, 0, 0.18, sg); add(new THREE.BoxGeometry(0.06, 0.52, 0.03), matGlow, 0.01, 0, -0.18, sg);
      add(new THREE.BoxGeometry(0.03, 0.36, 0.05), matGlow, 0.035, 0, 0, sg); add(new THREE.BoxGeometry(0.03, 0.05, 0.26), matGlow, 0.035, 0.06, 0, sg);
      kitInfo.shield = true;
    }
    if (K.robe || K.tabard) { // túnica longa (mago/bruxo) ou tabardo (arqueiro/ninja/samurai/caçadora): frente + trás, ponta em V acesa
      const len = K.robe ? 0.62 : 0.4; const w = K.robe ? 0.38 : 0.26;
      for (const z of [0.13, -0.13]) {
        const pnl = add(RB(w, len, 0.03), matCloth, 0, -0.04 - len / 2, z, hips); pnl.rotation.x = z > 0 ? -0.08 : 0.08;
        const tip = add(new THREE.ConeGeometry(w * 0.5, 0.12, 4), matCloth, 0, -0.06 - len, z, hips); tip.rotation.set(Math.PI, Math.PI / 4, 0); tip.scale.set(1, 1, 0.12);
        add(new THREE.BoxGeometry(0.02, len * 0.8, 0.012), matGlow, 0, -0.05 - len / 2, z + Math.sign(z) * 0.02, hips);
      }
      if (K.robe) for (const x of [0.2, -0.2]) { const sd = add(RB(0.03, len * 0.9, 0.22), matCloth, x, -0.04 - len * 0.45, 0, hips); sd.rotation.z = x > 0 ? 0.12 : -0.12; }
    }
    if (K.crystals) for (const pd of pads) { const sd = Math.sign(pd.position.x) || 1; for (let i = 0; i < 3; i++) { const c = add(new THREE.OctahedronGeometry(0.045 - i * 0.008, 0), matGlow, sd * (0.02 + i * 0.04), 0.1 + (i === 1 ? 0.04 : 0), -0.03 + i * 0.03, pd.parent); c.scale.set(0.6, 1.8, 0.6); c.rotation.z = -sd * (0.3 + i * 0.25); } }
    if (K.spikes != null) for (const pd of pads) { const sd = Math.sign(pd.position.x) || 1; for (let i = 0; i < 2; i++) { const c = add(new THREE.ConeGeometry(0.03, 0.14, 4), matGlow, sd * (0.05 + i * 0.05), 0.1, -0.02 + i * 0.05, pd.parent); c.rotation.z = -sd * 0.8; } }
    if (K.quiver) { // aljava nas costas com flechas acesas (leitura de costas)
      const qv = add(RB(0.1, 0.42, 0.1), matArmor2, 0.1, 0.2, -0.22, chest); qv.rotation.z = -0.45;
      for (let i = 0; i < 3; i++) { const a = add(new THREE.ConeGeometry(0.022, 0.08, 4), matGlow, 0.19 + i * 0.025, 0.44 + i * 0.01, -0.22 + (i - 1) * 0.025, chest); a.rotation.z = -0.45; }
    }
    if (K.fur) { const f = add(new THREE.TorusGeometry(0.22, 0.075, 6, 14), new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 1, metalness: 0 }), 0, 0.36, 0, chest); f.rotation.x = Math.PI / 2; f.scale.set(1.1, 0.85, 1); }
    if (K.handFire) { const hf = add(new THREE.IcosahedronGeometry(0.07, 0), new THREE.MeshBasicMaterial({ color: glowHex, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }), 0, -0.1, 0.02, arms.L.wrist); hf.name = 'handFire'; hf.scale.set(0.8, 1.4, 0.8); }
    // ── CAPA ──
    if (K.cape === false) { for (const g of cape) for (const c of [...g.children]) if (c.isMesh) g.remove(c); }
    else if (K.rune) { const em = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.13), new THREE.MeshBasicMaterial({ color: new THREE.Color(glowHex).lerp(WHITE, 0.2), side: THREE.DoubleSide })); em.rotation.set(0, Math.PI, Math.PI / 4); em.position.set(0, -0.17, (0.25 + 0.29) / 2 - 0.27 - 0.008); em.scale.setScalar(1.25); cape[1].add(em); kitInfo.parts++; }
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
    if (glb) glb.update(dt, { action: act, attacking, combo: st.combo, attackPhase: st.attackPhase, attackT: st.attackT, hurtT: st.hurtT, moveK, runK, speed: st.speed, walkSpeed: inp.walkSpeed || 2.4, runSpeed: inp.runSpeed || 3.4, yaw: inp.yaw, charge: chargeK, time: st.animTime , nexa: inp.nexa });
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
    const cm = getConfig().graphics?.mergeByColor !== false && !/[?&]mergeCor=0\b/.test(location.search);
    mergeInfo = mergeStaticParts(root, keep, { colorMerge: cm, exclude: [matBlade, arcMat, chargeMat, shieldMat, shieldEdgeMat] });
    // META-69: o pisco de dano continua valendo nos materiais mesclados (cor por vértice) — mesmo emissivo base
    if (mergeInfo.matMap?.size) for (let i = 0; i < flashMats.length; i++) { const nm = mergeInfo.matMap.get(flashMats[i]); if (nm && !flashMats.includes(nm)) { flashMats.push(nm); baseEmissive.push(nm.emissive.getHex()); } }
  }
  // ARMAS DUPLAS (20261017perf): arco / cajado / varinha procedurais na mão direita (fora do merge → alternam por visibilidade)
  const altW = {};
  {
    const wMat = new THREE.MeshStandardMaterial({ color: 0x2b2420, roughness: 0.55, metalness: 0.35 });
    const gMat = new THREE.MeshBasicMaterial({ color: 0x9fe8ff });
    const mk = (n) => { const g = new THREE.Group(); g.name = `w_${n}`; g.visible = false; arms.R.wrist.add(g); g.position.set(0, -0.05, 0.02); altW[n] = g; return g; };
    const bow = mk('arco');
    const limb = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.02, 5, 18, Math.PI * 0.9), wMat); limb.rotation.set(0, Math.PI / 2, Math.PI / 2 + Math.PI * 0.05); limb.position.z = 0.08; bow.add(limb);
    const str = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.006, 0.8), gMat); str.rotation.x = Math.PI / 2; str.position.set(0, 0, -0.04); str.name = 'bowString'; bow.add(str);
    const staff = mk('cajado');
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.028, 1.45, 7), wMat); pole.rotation.x = Math.PI / 2; pole.position.z = -0.25; staff.add(pole); // 9 PERSONAGENS: cajado em pé (orbe acima da mão, como na folha do mago)
    const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.075, 1), gMat); orb.position.z = -0.98; orb.name = 'staffOrb'; staff.add(orb);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.008, 4, 16), gMat); halo.position.z = -0.98; staff.add(halo);
    const wand = mk('varinha');
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.016, 0.42, 6), wMat); rod.rotation.x = Math.PI / 2; rod.position.z = 0.16; wand.add(rod);
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.045, 0), gMat); star.position.z = 0.4; star.name = 'wandStar'; wand.add(star);
    altW._g = gMat;
  }
  let weaponCls = 'espada';
  const kitDefW = K && (K.weapon === 'arco' || K.weapon === 'cajado') ? K.weapon : null; // ARQUEIRO/MAGO/BRUXO: arma padrão do personagem
  function setWeaponClass(cls, glow) {
    if ((!cls || cls === 'espada') && kitDefW) cls = kitDefW;
    weaponCls = altW[cls] ? cls : 'espada';
    blade.visible = weaponCls === 'espada';
    for (const k of ['arco', 'cajado', 'varinha']) altW[k].visible = k === weaponCls && procBodyVisible;
    if (glow != null) altW._g.color.setHex(glow);
  }
  if (kitDefW) setWeaponClass(kitDefW, glowHex);
  const api = { root, update, hurt, setVisible, getDebug, blade, mergeInfo, setProceduralBodyVisible, glb: null, setWeaponClass, weaponClass: () => weaponCls, kit: K, kitInfo };
  // ANTES do merge? não: o merge roda acima; o GLB entra depois e não é mesclado
  const glb = opts.glb === false ? null : attachHeroGlb(api, { styleId: opts.styleId, onReady: opts.onGlbReady });
  api.glb = glb;
  return api;
}
