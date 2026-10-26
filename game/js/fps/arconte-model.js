/**
 * NEXARA 20261025arconte — MODELO DO ARCONTE (vilão / rival chefe do X1), feito em CÓDIGO com a MESMA técnica dos heróis
 * procedurais (createHeroModel: esqueleto + peças arredondadas + merge estático), só que decorado pelo gancho `decorate`:
 *  · homem alto e régio (×1,26 da altura do herói), pele pálida com RACHADURAS roxas acesas, olhos violeta;
 *  · cabelo branco longo; COROA de chifres de dragão escuros com ouro e gema roxa;
 *  · manto-armadura branco e ouro com GOLA ALTA, ombreiras em camadas e CAPA longa;
 *  · 6 CRISTAIS-NÚCLEO no peito (azul, vermelho, amarelo, verde, laranja/marrom, branco) — acendem conforme os Núcleos carregados
 *    (passiva) e todos explodem de luz no ECLIPSE PRIMORDIAL;
 *  · manoplas pretas e douradas com GARRAS; energia NEGRA nas mãos com RAIOS nas 6 cores dos Núcleos.
 * Puramente visual. Custo: ~1 modelo de herói + 6 cristais + 2 nuvens nas mãos (poucas chamadas de desenho a mais).
 */
import * as THREE from 'three';
import { createHeroModel } from './hero-model.js?v=20261025arconte2';

export const NUCLEO_CORES = [0x2a6cff, 0xff2a2a, 0xffd02a, 0x2aff5a, 0xd0782a, 0xf4f4ff]; // azul · vermelho · amarelo · verde · laranja/marrom · branco
export const ARCONTE_ESCALA = 1.26;

export const ARCONTE_LOOK = { style: 'arconte', head: 'careca', face: 'olhos', armor: 0xd8d2c4, cloth: 0xe9e4d8, glow: 0x9b4dff, cape: true, weapon: 'espada', pad: 1.35, robe: true, chibi: true, bigBoots: true };

export const ARCONTE_ESCALA_JOGADOR = 1.15; // 20261025arconte2: Arconte JOGÁVEL um pouco menor que o chefe (câmera/colisão de herói)
export function createArconteModel(opts = {}) {
  const fx = { cicUntil: 0, crystals: [], crystalMats: [], hands: [], bolts: [], aura: null, nuc: 0, nucShown: -1, eclipseUntil: 0, t: 0 };
  const hm = createHeroModel({ styleId: 'arconte', kit: { ...ARCONTE_LOOK }, glb: false, decorate: (c) => decorate(c, fx) });
  hm.root.scale.setScalar(opts.scale ?? ARCONTE_ESCALA);
  hm.root.name = 'arconte';
  // ESPADA NEGRA: a lâmina do modelo vira uma espada de energia negra (fio violeta + guarda dourada) — só aparece no CICLONE
  if (hm.blade) { hm.blade.visible = false;
    const swB = new THREE.MeshStandardMaterial({ color: 0x050208, metalness: 0.6, roughness: 0.25, emissive: 0x1a0630, emissiveIntensity: 1 });
    hm.blade.children.forEach((o) => { o.visible = false; });
    const sw = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.018, 0.95), swB); sw.position.z = 0.6; hm.blade.add(sw); // lâmina larga negra
    const edgeM = new THREE.MeshBasicMaterial({ color: 0x9b4dff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.008, 0.98), edgeM); edge.position.z = 0.6; hm.blade.add(edge); // fio que pisca nas cores dos Núcleos
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.14, 4), swB); tip.rotation.x = Math.PI / 2; tip.position.z = 1.14; hm.blade.add(tip);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.03, 0.035), new THREE.MeshStandardMaterial({ color: 0xd8a640, metalness: 0.85, roughness: 0.3 })); guard.position.z = 0.12; hm.blade.add(guard);
    fx.sword = hm.blade; fx.swordMat = swB; fx.edgeMat = edgeM; }
  fx.root = hm.root;
  const baseUpdate = hm.update;
  hm.update = (dt, inp) => { baseUpdate(dt, inp); animate(fx, dt || 0.016);
    const cic = fx.t < fx.cicUntil; if (fx.sword) fx.sword.visible = cic || !!opts.espada; // jogador: espada negra sempre na mão
    if (cic) { fx.cicAng = (fx.cicAng || 0) + (dt || 0.016) * 15; fx.root.rotation.y += fx.cicAng; if (fx.armR) { fx.armR.shoulder.rotation.set(0, 0, CIC_ARM); fx.armR.elbow.rotation.set(0, 0, 0); } if (fx.edgeMat) fx.edgeMat.color.setHex(NUCLEO_CORES[Math.floor(fx.t * 12) % 6]); } else fx.cicAng = 0; }; // GIRO MORTAL: corpo gira com a espada negra (raios coloridos no fio)
  hm.ciclone = (ms = 1600) => { fx.cicUntil = fx.t + ms / 1000; };
  hm.setNucleos = (n) => { fx.nuc = Math.max(0, Math.min(6, n | 0)); };
  hm.eclipse = (ms = 1400) => { fx.eclipseUntil = fx.t + ms / 1000; };
  hm.arconte = { parts: fx.parts, crystals: fx.crystals.length, info: () => ({ nucleos: fx.nuc, eclipse: fx.t < fx.eclipseUntil, ciclone: fx.t < fx.cicUntil, espada: !!fx.sword, espadaVisivel: !!fx.sword?.visible, crystals: fx.crystals.length, hands: fx.hands.length, parts: fx.parts }) };
  hm.kitInfo.arconte = true;
  return hm;
}

function decorate(c, fx) {
  const { THREE: T, head, neck, chest, spine, hips, arms, legs, pads, cape, mats, slash, arcMat } = c;
  fx.armR = arms.R;
  if (c.mantle?.parent) c.mantle.parent.remove(c.mantle); // sem a manta do capuz (a gola alta entra no lugar)
  let parts = 0;
  const add = (geo, mat, x, y, z, parent) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); parts++; return m; };
  const RB = (w, h, d, r = 0.35) => c.roundedBoxGeo(w, h, d, Math.min(0.05, Math.min(w, h, d) * r));
  const keep = []; const exclude = [];
  // —— materiais ——
  mats.skin.color.setHex(0xc9bcc9); mats.skin.roughness = 0.55; // pele pálida, sem idade
  const gold = new T.MeshStandardMaterial({ color: 0xd8a63a, metalness: 0.92, roughness: 0.26, emissive: 0x3a2404 });
  const white = new T.MeshStandardMaterial({ color: 0xf0ece4, metalness: 0.35, roughness: 0.42, emissive: 0x16121c });
  c.addRim(white, 0.55); c.addRim(gold, 0.35);
  const black = new T.MeshStandardMaterial({ color: 0x121016, metalness: 0.7, roughness: 0.32, emissive: 0x05030a });
  const horn = new T.MeshStandardMaterial({ color: 0x1c1622, metalness: 0.45, roughness: 0.38, emissive: 0x0c0414 });
  const hair = new T.MeshStandardMaterial({ color: 0xf4f6ff, metalness: 0.15, roughness: 0.5, emissive: 0x30344a, side: T.DoubleSide });
  const crack = new T.MeshBasicMaterial({ color: 0xa040ff });
  const gem = new T.MeshBasicMaterial({ color: 0xd8b4ff });
  c.flashMats.push(white, gold, black); c.baseEmissive.push(white.emissive.getHex(), gold.emissive.getHex(), black.emissive.getHex());
  mats.glow.color.setHex(0xffd27a); mats.glow.emissive.setHex(0xc88a20); mats.glow.emissiveIntensity = 0.9; // frisos da armadura = filigrana de OURO (o roxo fica no contorno/rachaduras/aura)
  arcMat.color.setHex(0x8a3aff); // rastro do golpe das garras
  // —— tira o emblema de escudo do peito (no lugar: os 6 Núcleos) ——
  for (const o of [...chest.children]) if (o.isMesh && o.geometry?.type === 'ExtrudeGeometry') chest.remove(o);
  // —— proporções régias: pernas mais longas, cabeça um pouco menor que a dos heróis chibi ——
  for (const sd of ['L', 'R']) legs[sd].thigh.scale.set(1.12, 0.96, 1.12);
  c.setHipY(0.94 * (0.12 + 0.88 * 0.96) - 0.02);
  head.scale.setScalar(1.3);
  chest.scale.set(1.18, 1.06, 1.12);
  // —— ROSTO: rachaduras roxas acesas (lado esquerdo do rosto + testa + pescoço, como no conceito) ——
  const CR = [[0.075, 0.03, 0.112, 0.06, 0.5], [0.09, -0.02, 0.1, 0.05, -0.5], [0.065, -0.05, 0.112, 0.04, 1.0], [0.04, 0.075, 0.122, 0.045, -0.9], [0.105, 0.04, 0.085, 0.04, 1.3]];
  for (const [x, y, z, l, r] of CR) { const m = add(new T.BoxGeometry(0.006, l, 0.004), crack, x, y, z, head); m.rotation.set(0, 0.45, r); }
  for (const o of head.children) if (o.isMesh && o.material === mats.faceDark) { o.material = hair; o.scale.set(0.9, 0.45, 0.6); } // sobrancelhas/boca claras e finas (não blocos pretos)
  const sock = new T.MeshBasicMaterial({ color: 0x2a1436 });
  for (const sd of [-1, 1]) { const so = add(new T.BoxGeometry(0.06, 0.03, 0.01), sock, sd * 0.047, 0.022, 0.124, head); so.rotation.z = sd * -0.2; const e = add(new T.BoxGeometry(0.05, 0.014, 0.012), gem, sd * 0.047, 0.02, 0.13, head); e.rotation.z = sd * -0.2; } // olhos violeta acesos em órbitas escuras
  for (const sd of [-1, 1]) { const bw = add(new T.BoxGeometry(0.058, 0.011, 0.012), hair, sd * 0.048, 0.05, 0.128, head); bw.rotation.z = sd * 0.38; } // sobrancelhas brancas franzidas (olhar severo)
  { const nm = new T.MeshBasicMaterial({ color: 0x9a7fa0 }); add(new T.BoxGeometry(0.05, 0.006, 0.01), nm, 0, -0.055, 0.124, head); } // boca fina
  // —— CABELO branco longo (calota + mecha traseira até os ombros + mechas laterais) ——
  const cap = add(new T.SphereGeometry(0.142, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, 0, 0.02, -0.012, head); cap.scale.set(1.08, 1.1, 1.1);
  const back = add(RB(0.24, 0.3, 0.05), hair, 0, -0.1, -0.115, head); back.rotation.x = 0.1;
  for (const sd of [-1, 1]) {
    const lock = add(RB(0.05, 0.3, 0.05), hair, sd * 0.13, -0.08, 0.0, head); lock.rotation.z = sd * 0.08;
    const lock2 = add(RB(0.045, 0.24, 0.045), hair, sd * 0.1, -0.12, -0.07, head); lock2.rotation.z = sd * 0.18;
    const fr = add(new T.ConeGeometry(0.03, 0.12, 5), hair, sd * 0.07, 0.1, 0.1, head); fr.rotation.set(1.9, 0, sd * 0.5); // franja caindo
  }
  // cabelo longo caindo nos ombros/peito (frente) e nas costas (sobre a capa) — preso ao peito para cair "pesado"
  for (const sd of [-1, 1]) { const fl = add(RB(0.07, 0.32, 0.045), hair, sd * 0.155, 0.36, 0.06, chest); fl.rotation.set(-0.15, 0, sd * 0.1); const fl2 = add(new T.ConeGeometry(0.035, 0.1, 5), hair, sd * 0.16, 0.17, 0.08, chest); fl2.rotation.x = Math.PI; }
  { const bk = add(RB(0.3, 0.42, 0.05), hair, 0, 0.3, -0.2, chest); bk.rotation.x = 0.08; const bt = add(new T.ConeGeometry(0.15, 0.14, 6), hair, 0, 0.04, -0.21, chest); bt.rotation.x = Math.PI; bt.scale.set(1, 1, 0.3); }
  // —— COROA de chifres de dragão (escuros) com ouro ——
  const band = add(new T.TorusGeometry(0.145, 0.016, 5, 22), gold, 0, 0.095, -0.005, head); band.rotation.x = Math.PI / 2 - 0.12;
  const front = add(new T.ConeGeometry(0.03, 0.17, 4), gold, 0, 0.2, 0.12, head); front.scale.set(1, 1, 0.4);
  add(new T.OctahedronGeometry(0.022, 0), gem, 0, 0.165, 0.137, head).scale.set(0.8, 1.4, 0.5);
  const UP = new T.Vector3(0, 1, 0);
  const spike = (geo, mat, base, dir, len, parent) => { const d = new T.Vector3(...dir).normalize(); const m = add(geo, mat, base[0] + d.x * len / 2, base[1] + d.y * len / 2, base[2] + d.z * len / 2, parent); m.quaternion.setFromUnitVectors(UP, d); return m; };
  // chifres (3 por lado, curtos, abrindo para fora e para trás) com ponta de ouro — sem Group (entram no merge)
  const HR = [[0.07, 0.13, 0.08, [0.35, 1, 0.15], 0.11], [0.115, 0.12, 0.0, [0.75, 1, -0.25], 0.12], [0.1, 0.1, -0.08, [0.55, 0.7, -0.8], 0.1]];
  for (const sd of [-1, 1]) for (const [x, y, z, dir, h] of HR) {
    const dv = [sd * dir[0], dir[1], dir[2]];
    spike(new T.ConeGeometry(0.022, h, 6), horn, [sd * x, y, z], dv, h, head);
    const n = new T.Vector3(...dv).normalize(); spike(new T.ConeGeometry(0.01, 0.045, 5), gold, [sd * x + n.x * h * 0.92, y + n.y * h * 0.92, z + n.z * h * 0.92], dv, 0.045, head);
  }
  for (const sd of [-1, 1]) spike(new T.ConeGeometry(0.014, 0.09, 4), gold, [sd * 0.04, 0.13, 0.12], [sd * 0.25, 1, 0.1], 0.09, head); // pontas de ouro da coroa
  // —— GOLA ALTA (branca com borda de ouro), aberta na frente ——
  const TS = Math.PI * 0.32, TL = Math.PI * 1.36; // de ~58° a ~302° (passa pelas costas): a frente fica aberta e o rosto livre
  add(new T.CylinderGeometry(0.21, 0.15, 0.22, 16, 1, true, TS, TL), white, 0, 0.46, -0.03, chest);
  add(new T.CylinderGeometry(0.215, 0.215, 0.022, 16, 1, true, TS, TL), gold, 0, 0.57, -0.03, chest);
  // —— PEITORAL branco com filigrana de ouro + 6 NÚCLEOS ——
  add(RB(0.42, 0.34, 0.05), white, 0, 0.17, 0.145, chest);
  const FIL = [[0, 0.17, 0.012, 0.34, 0], [-0.1, 0.26, 0.012, 0.16, 0.7], [0.1, 0.26, 0.012, 0.16, -0.7], [-0.1, 0.1, 0.012, 0.16, -0.7], [0.1, 0.1, 0.012, 0.16, 0.7], [0, 0.02, 0.36, 0.012, 0]];
  for (const [x, y, w, h, r] of FIL) add(new T.BoxGeometry(w, h, 0.01), gold, x, y, 0.174, chest).rotation.z = r;
  const CP = [[-0.1, 0.27], [0.1, 0.25], [-0.12, 0.14], [0.0, 0.06], [0.12, 0.11], [-0.07, 0.03]]; // azul, vermelho, amarelo, verde, laranja, branco (como no conceito)
  const cg = new T.Group(); cg.name = 'arconteNucleos'; cg.position.set(0, 0, 0.18); chest.add(cg); keep.push(cg);
  CP.forEach(([x, y], i) => {
    const m = new T.MeshStandardMaterial({ color: NUCLEO_CORES[i], emissive: NUCLEO_CORES[i], emissiveIntensity: 0.5, metalness: 0.2, roughness: 0.15 });
    const cr = add(new T.OctahedronGeometry(0.036, 0), m, x, y, 0.004, cg); cr.scale.set(0.75, 1.25, 0.5); cr.name = 'nucleo' + i;
    add(new T.TorusGeometry(0.038, 0.007, 4, 12), gold, x, y, -0.004, chest).position.z = 0.176;
    fx.crystals.push(cr); fx.crystalMats.push(m); exclude.push(m);
  });
  // —— OMBREIRAS brancas em camadas com ouro ——
  for (const pd of pads) {
    pd.material = white; const sd = Math.sign(pd.position.x) || 1; const P = pd.parent;
    const l1 = add(RB(0.24, 0.07, 0.3), white, sd * 0.08, -0.04, 0, P); l1.rotation.z = -sd * 0.55;
    add(new T.BoxGeometry(0.25, 0.014, 0.31), gold, sd * 0.085, -0.075, 0, P).rotation.z = -sd * 0.55;
    const l2 = add(RB(0.2, 0.06, 0.28), white, sd * 0.11, -0.1, 0, P); l2.rotation.z = -sd * 0.75;
    const sp = add(new T.ConeGeometry(0.03, 0.16, 5), gold, sd * 0.05, 0.12, -0.02, P); sp.rotation.z = -sd * 0.35; // espigão dourado
  }
  // —— MANOPLAS pretas e douradas com GARRAS ——
  for (const sd of ['L', 'R']) {
    const E = arms[sd].elbow, W = arms[sd].wrist;
    for (const ch of E.children) if (ch.isMesh && ch.material === mats.armor) ch.material = black;
    add(new T.TorusGeometry(0.075, 0.012, 4, 14), gold, 0, -0.04, 0, E).rotation.x = Math.PI / 2;
    add(new T.TorusGeometry(0.072, 0.012, 4, 14), gold, 0, -0.24, 0, E).rotation.x = Math.PI / 2;
    for (const ch of W.children) if (ch.isMesh) ch.material = black;
    add(RB(0.1, 0.04, 0.11), gold, 0, 0.005, 0, W);
    for (let i = 0; i < 4; i++) { const cl = add(new T.ConeGeometry(0.011, 0.075, 4), gold, (i - 1.5) * 0.022, -0.09, 0.035, W); cl.rotation.x = Math.PI + 0.5; }
    // energia NEGRA nas mãos: núcleo escuro + véu (normal blend) + 2 raios nas cores dos Núcleos (aditivo, piscam)
    const hg = new T.Group(); hg.name = 'arconteMao' + sd; hg.position.set(0, -0.08, 0.02); W.add(hg); keep.push(hg);
    const dk = new T.MeshBasicMaterial({ color: 0x07020c, transparent: true, opacity: 0.82, depthWrite: false });
    const veil = new T.MeshBasicMaterial({ color: 0x1a0a2a, transparent: true, opacity: 0.4, depthWrite: false });
    const coreM = add(new T.IcosahedronGeometry(0.075, 0), dk, 0, 0, 0, hg);
    const v1 = add(new T.IcosahedronGeometry(0.13, 0), veil, 0.02, 0.03, 0, hg);
    const bl = [];
    for (let k = 0; k < 3; k++) { const bm = new T.MeshBasicMaterial({ color: NUCLEO_CORES[k], transparent: true, opacity: 0.95, blending: T.AdditiveBlending, depthWrite: false }); const b = add(new T.BoxGeometry(0.008, 0.24, 0.008), bm, 0, 0, 0, hg); bl.push({ m: b, mat: bm }); exclude.push(bm); }
    exclude.push(dk, veil); coreM.renderOrder = 6; v1.renderOrder = 6;
    fx.hands.push({ g: hg, core: coreM, veil: v1, bl });
  }
  // —— MANTO: faixa de ouro no centro + barra dourada; CAPA mais longa com forro escuro ——
  add(new T.BoxGeometry(0.05, 0.62, 0.012), gold, 0, -0.35, 0.155, hips);
  add(new T.BoxGeometry(0.4, 0.02, 0.02), gold, 0, -0.64, 0.14, hips);
  for (const sd of [-1, 1]) add(new T.BoxGeometry(0.012, 0.55, 0.012), gold, sd * 0.17, -0.33, 0.15, hips);
  if (cape[0]) cape[0].scale.set(1.25, 1.28, 1.1);
  // botas pretas e ouro
  for (const sd of ['L', 'R']) { const kn = legs[sd].knee; for (const ch of kn.children) if (ch.isMesh && ch.material === mats.armor) ch.material = black; add(new T.BoxGeometry(0.21, 0.02, 0.2), gold, 0, -0.33, 0.06, kn); }
  // aura escura no chão (anel) — piscando no Eclipse
  const auraM = new T.MeshBasicMaterial({ color: 0x6a2aff, transparent: true, opacity: 0.3, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide });
  const aura = new T.Mesh(new T.RingGeometry(0.42, 0.62, 30), auraM); aura.rotation.x = -Math.PI / 2; aura.position.y = 0.03; c.root.add(aura); aura.name = 'arconteAura'; exclude.push(auraM); keep.push(aura);
  fx.aura = { m: aura, mat: auraM };
  void spine; void neck; void slash;
  fx.parts = parts;
  return { keep, exclude };
}

const _c = new THREE.Color();
const CIC_ARM = -1.45; // braço da espada estendido para fora durante o giro
function animate(fx, dt) {
  fx.t += dt; const t = fx.t; const ecl = t < fx.eclipseUntil;
  // Núcleos: apagados (0,35) → acesos (1,6) conforme a passiva; no Eclipse todos a 4+ pulsando
  for (let i = 0; i < fx.crystalMats.length; i++) {
    const on = ecl || i < fx.nuc; const m = fx.crystalMats[i];
    m.emissiveIntensity = ecl ? 3.2 + Math.sin(t * 22 + i) * 0.8 : on ? 1.5 + Math.sin(t * 4 + i) * 0.25 : 0.32;
    const s = ecl ? 1.35 : on ? 1.08 : 1; fx.crystals[i].scale.set(0.75 * s, 1.25 * s, 0.5 * s);
  }
  // mãos: véu negro respirando + 2 raios coloridos que mudam de forma/cor a cada ~70 ms
  for (const h of fx.hands) {
    const br = 1 + Math.sin(t * 5.3 + (h === fx.hands[0] ? 0 : 1.7)) * 0.15; h.veil.scale.setScalar(br * (ecl ? 1.6 : 1)); h.core.rotation.y = t * 2; h.veil.rotation.x = t * 1.3;
    const step = Math.floor(t * 14);
    h.bl.forEach((b, k) => {
      if (b.step !== step) { b.step = step; const r = Math.sin(step * 12.9898 + k * 78.233) * 43758.5453; const fr = r - Math.floor(r);
        b.m.visible = fr > 0.25 || ecl; b.m.rotation.set(fr * 6.28, fr * 3.1, (fr * 17) % 6.28); b.m.position.set((fr - 0.5) * 0.14, ((fr * 7) % 1 - 0.5) * 0.14, ((fr * 3) % 1 - 0.5) * 0.08); b.m.scale.set(1, 0.6 + fr, 1);
        b.mat.color.setHex(NUCLEO_CORES[(step + k * 2) % 6]); }
    });
  }
  if (fx.aura) { const a = fx.aura; a.mat.opacity = ecl ? 0.55 + Math.sin(t * 20) * 0.2 : 0.22 + fx.nuc * 0.03; a.m.scale.setScalar(ecl ? 1.5 + Math.sin(t * 9) * 0.1 : 1); _c.setHex(ecl ? NUCLEO_CORES[Math.floor(t * 10) % 6] : 0x6a2aff); a.mat.color.copy(_c); }
}
