/**
 * NEXARA — Bloco 7: GIGANTE VERDE, dragão INIMIGO colossal (modelo procedural próprio).
 *
 * Nada a ver com o Mini Dragão companheiro (azul-ciano, pequeno, asas finas): aqui é um
 * quadrúpede pesado ~6,4 m (3,5× o herói), corpo VERDE-ESCURO com placas/escamas PRETAS
 * blindadas, espinhos dorsais, 4 chifres, asas enormes de membrana escura, cauda longa com
 * lâmina, NÚCLEO NEXA verde brilhante no peito e olhos verdes.
 *
 * Frente = +z (igual aos bots). O grupo raiz só recebe posição/rotação Y do renderer; poses
 * vão no grupo interno "body". Telegraphs no chão:
 *  - GOLPE PESADO: setor (cone) à frente; preenchimento cresce até o impacto;
 *  - ATAQUE DE ÁREA: disco de perigo em volta do dragão, borda pulsante, preenchimento → impacto;
 *  - INVESTIDA: faixa reta até onde ele vai parar (fixa no mundo), setas.
 */
import * as THREE from 'three';
import { attachDragonGlb } from './dragon-glb.js?v=20261003m10c';
import { TILE } from './fps-camera.js?v=20261003m10c';
import { mergeStaticParts } from './merge-util.js?v=20261003m10c';
import { scaleTex, veinEmissiveTex, membraneTex, lathe, addRim } from './creature-kit.js?v=20261003m10c';

const GREEN_DARK = 0x214f29;
const GREEN_MID = 0x2f6636;
const BLACK_PLATE = 0x0b0e0c;
const NEXA = 0x5dff6a;
const DANGER = 0xff3b1f;
const DANGER_EDGE = 0xffc23a;

let shared = null;
function mats() {
  if (shared) return shared;
  const std = (color, o = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.18, flatShading: true, ...o });
    m.userData.shared = true;
    return m;
  };
  const basic = (color, o = {}) => {
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, ...o });
    m.userData.shared = true;
    return m;
  };
  shared = {
    // EVO gráficos: pele LISA (sem flat) com ESCAMAS procedurais (map) e VEIAS DE NEXA no emissivo
    // (textura emissiva com base verde-escura → continua legível na arena escura, sem luz extra)
    skin: std(GREEN_DARK, { flatShading: false, map: scaleTex(), emissive: 0xffffff, emissiveMap: veinEmissiveTex('#020803', '#7dff7a', 77), emissiveIntensity: 0.8, roughness: 0.55 }),
    skin2: std(GREEN_MID, { flatShading: false, roughness: 0.7, map: scaleTex(), emissive: 0xffffff, emissiveMap: veinEmissiveTex('#040c05', '#a0ff8a', 91), emissiveIntensity: 0.6 }),
    plate: std(BLACK_PLATE, { roughness: 0.3, metalness: 0.75, emissive: 0x040a05, emissiveIntensity: 1 }),
    horn: std(0x1a1712, { roughness: 0.4, metalness: 0.5, emissive: 0x0b0a07, emissiveIntensity: 1 }),
    claw: std(0x0a0a0a, { roughness: 0.3, metalness: 0.6 }),
    membrane: std(0x2a5a2e, { flatShading: false, map: membraneTex(), roughness: 0.85, metalness: 0.05, side: THREE.DoubleSide, transparent: true, opacity: 0.93, emissive: 0x0e3313, emissiveIntensity: 1 }),
    rim: new THREE.MeshBasicMaterial({ color: 0x3dff5a }),
    nexa: new THREE.MeshStandardMaterial({ color: NEXA, emissive: NEXA, emissiveIntensity: 2.2, roughness: 0.2, metalness: 0.1, flatShading: true }),
    eye: new THREE.MeshBasicMaterial({ color: 0xaaffb0 }),
    glow: basic(NEXA, { opacity: 0.4, blending: THREE.AdditiveBlending }),
    shadow: basic(0x000000, { opacity: 0.42 }),
    teleFill: basic(DANGER, { opacity: 0.32, side: THREE.DoubleSide }),
    teleEdge: basic(DANGER_EDGE, { opacity: 0.85, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
    teleBase: basic(DANGER, { opacity: 0.14, side: THREE.DoubleSide }),
    shock: basic(0xbfffa8, { opacity: 0.7, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
    // EVO: cone do sopro (verde Nexa) e anéis de choque
    soproFill: basic(0x5dff6a, { opacity: 0.38, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
    ringEdge: basic(0xd8ff5a, { opacity: 0.9, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })
  };
  addRim(shared.skin, 0x8affa0, 0.38, 3.0);
  addRim(shared.skin2, 0x8affa0, 0.26, 3.0);
  shared.nexa.userData.shared = false; // pisca por instância (clonado abaixo)
  shared.eye.userData.shared = true;
  shared.rim.userData.shared = true;
  return shared;
}

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}

/** Membrana de asa grande (plano XZ, ponta em +X) com recortes entre os "dedos". */
function wingGeometry() {
  const pts = [
    [0, 0], [0.9, -0.55], [2.1, -0.95], [3.4, -0.75], [4.3, -0.2], [3.6, 0.35], [3.2, 1.2], [2.5, 0.8], [2.1, 1.75], [1.5, 1.05], [1.0, 1.9], [0.55, 1.1], [0.1, 1.2]
  ];
  const pos = [];
  for (let i = 1; i < pts.length - 1; i++) pos.push(0, 0, 0, pts[i][0], 0, pts[i][1], pts[i + 1][0], 0, pts[i + 1][1]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  // EVO: UV planar (veias da membrana partem da raiz)
  const uv = [];
  for (let i = 0; i < pos.length; i += 3) uv.push(pos[i] / 4.3, (pos[i + 2] + 0.95) / 2.85);
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

function hornGeo(len, r) {
  const g = new THREE.ConeGeometry(r, len, 6, 1);
  g.translate(0, len / 2, 0);
  return g;
}

/**
 * @returns {{ root: THREE.Group, update: Function, parts: object }}
 */
export function createBossDragon({ height = 6.4 } = {}) {
  const M = mats();
  const nexaMat = M.nexa.clone();
  const root = new THREE.Group();
  root.name = 'bossGiganteVerde';
  const body = new THREE.Group(); // poses
  root.add(body);
  // escala: modelo construído com ~6,4 m de altura (cabeça erguida) → ajusta ao config
  const k = height / 6.4;
  body.scale.setScalar(k);

  // sombra no chão
  const shadow = mesh(new THREE.CircleGeometry(3.3, 28), M.shadow, 0, 0.03, 0.2);
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(1, 1.35, 1);
  root.add(shadow);
  // M3D: dragão GLB (Quaternius, CC0) — corpo procedural vira fallback
  const glb = attachDragonGlb(root, body, 'boss', { height: height * 0.97 });

  // —— TORSO (pivô no quadril para empinar) ——
  const hips = new THREE.Group();
  hips.position.set(0, 2.25, -1.1);
  body.add(hips);
  const torso = new THREE.Group();
  torso.position.set(0, 0, 1.1);
  hips.add(torso);
  const torsoMesh = mesh(new THREE.SphereGeometry(1, 20, 14), M.skin, 0, 0.1, 0);
  torsoMesh.scale.set(1.25, 1.1, 2.3);
  torso.add(torsoMesh);
  const belly = mesh(new THREE.SphereGeometry(1, 16, 10), M.skin2, 0, -0.45, 0.2);
  belly.scale.set(1.0, 0.7, 1.9);
  torso.add(belly);
  // EVO: placas ventrais segmentadas (anéis achatados ao longo da barriga)
  for (let i = 0; i < 7; i++) {
    const z = -1.35 + i * 0.45;
    const w = 0.78 - Math.abs(i - 3) * 0.07;
    const vp = mesh(new THREE.CylinderGeometry(w, w, 0.32, 14, 1, true, Math.PI * 0.6, Math.PI * 0.8), M.skin2, 0, -0.42, z);
    vp.rotation.x = Math.PI / 2; vp.rotation.y = 0; vp.scale.set(1, 1, 0.6);
    torso.add(vp);
  }
  // placas pretas nas costas + espinhos dorsais
  const spikes = [];
  for (let i = 0; i < 6; i++) {
    const z = -1.6 + i * 0.62;
    const plate = mesh(new THREE.BoxGeometry(1.6 - Math.abs(i - 2.5) * 0.14, 0.22, 0.58), M.plate, 0, 1.1 - Math.abs(z) * 0.08, z);
    plate.rotation.x = -0.08;
    torso.add(plate);
    const seam = mesh(new THREE.BoxGeometry(1.64 - Math.abs(i - 2.5) * 0.14, 0.05, 0.06), M.rim, 0, 1.12 - Math.abs(z) * 0.08, z + 0.3);
    torso.add(seam);
    const sp = mesh(hornGeo(0.75 - Math.abs(i - 2.5) * 0.06, 0.2), M.horn, 0, 1.2 - Math.abs(z) * 0.08, z);
    sp.rotation.x = -0.45;
    torso.add(sp);
    spikes.push(sp);
  }
  // placas laterais (escamas blindadas)
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const pl = mesh(new THREE.BoxGeometry(0.16, 0.7, 0.72), M.plate, sx * 1.18, 0.25, -1.2 + i * 0.8);
      pl.rotation.z = sx * 0.28;
      torso.add(pl);
    }
  }
  // NÚCLEO NEXA no peito
  const core = mesh(new THREE.IcosahedronGeometry(0.42, 0), nexaMat, 0, -0.05, 2.0);
  torso.add(core);
  const coreHalo = mesh(new THREE.SphereGeometry(0.55, 12, 10), M.glow, 0, -0.05, 2.0);
  torso.add(coreHalo);
  const coreFrame = mesh(new THREE.TorusGeometry(0.58, 0.1, 6, 18), M.plate, 0, -0.05, 2.02);
  torso.add(coreFrame);
  // EVO: giroscópio do NÚCLEO (2 anéis girando em eixos diferentes) + garras de contenção
  const gyro = new THREE.Group();
  gyro.position.set(0, -0.05, 2.0);
  torso.add(gyro);
  const gyroA = mesh(new THREE.TorusGeometry(0.5, 0.025, 4, 24), nexaMat);
  const gyroB = mesh(new THREE.TorusGeometry(0.42, 0.02, 4, 24), nexaMat);
  gyro.add(gyroA, gyroB);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const cl = mesh(hornGeo(0.4, 0.07), M.horn, Math.cos(a) * 0.62, Math.sin(a) * 0.62 - 0.05, 2.05);
    cl.rotation.z = a - Math.PI / 2; cl.rotation.x = 0.5;
    torso.add(cl);
  }
  // veias de energia
  for (const sx of [-1, 1]) {
    const vein = mesh(new THREE.BoxGeometry(0.07, 0.07, 1.6), nexaMat, sx * 0.62, -0.15, 1.1);
    vein.rotation.y = sx * -0.35;
    torso.add(vein);
  }

  // —— PESCOÇO + CABEÇA ——
  const neck = new THREE.Group();
  neck.position.set(0, 0.55, 2.0);
  torso.add(neck);
  const neckSegs = [];
  let parent = neck;
  for (let i = 0; i < 4; i++) {
    const seg = new THREE.Group();
    seg.position.set(0, i === 0 ? 0 : 0.62, i === 0 ? 0 : 0.28);
    seg.rotation.x = -0.28;
    parent.add(seg);
    const r = 0.62 - i * 0.07;
    const cyl = mesh(new THREE.CapsuleGeometry(r * 0.95, 0.5, 4, 12), M.skin, 0, 0.3, 0);
    seg.add(cyl);
    const np = mesh(new THREE.BoxGeometry(r * 1.1, 0.18, 0.5), M.plate, 0, 0.35, -r * 0.8);
    np.rotation.x = 0.2;
    seg.add(np);
    const ns = mesh(hornGeo(0.45, 0.13), M.horn, 0, 0.4, -r * 0.95);
    ns.rotation.x = -0.9;
    seg.add(ns);
    neckSegs.push(seg);
    parent = seg;
  }
  const head = new THREE.Group();
  head.position.set(0, 0.75, 0.3);
  head.rotation.x = 0.95; // compensa a curvatura: focinho para frente
  parent.add(head);
  // EVO: crânio e focinho orgânicos (torno, afunilando para a frente) em vez de caixas
  const skull = mesh(new THREE.SphereGeometry(0.62, 16, 12), M.skin, 0, 0.1, 0.1);
  skull.scale.set(0.95, 0.68, 1.0);
  head.add(skull);
  const snoutGeo = lathe([[0.001, -0.75], [0.3, -0.7], [0.42, -0.35], [0.46, 0.1], [0.5, 0.5], [0.52, 0.72], [0.001, 0.75]], 14);
  snoutGeo.rotateX(Math.PI / 2);
  const snout = mesh(snoutGeo, M.skin, 0, -0.02, 1.15);
  snout.scale.set(0.88, 0.5, 1.0);
  head.add(snout);
  // narinas acesas
  for (const sx of [-1, 1]) { const nn = mesh(new THREE.SphereGeometry(0.06, 6, 4), M.eye, sx * 0.18, 0.12, 1.86); nn.scale.set(1, 0.6, 1); head.add(nn); }
  const snoutPlate = mesh(new THREE.BoxGeometry(0.9, 0.14, 1.5), M.plate, 0, 0.3, 0.95);
  snoutPlate.rotation.x = 0.08;
  head.add(snoutPlate);
  const browL = mesh(new THREE.BoxGeometry(0.45, 0.16, 0.5), M.plate, -0.36, 0.52, 0.45);
  const browR = browL.clone();
  browR.position.x = 0.36;
  browL.rotation.z = 0.25; browR.rotation.z = -0.25;
  head.add(browL, browR);
  const eyes = [];
  for (const sx of [-1, 1]) {
    const e = mesh(new THREE.SphereGeometry(0.11, 8, 6), M.eye, sx * 0.43, 0.32, 0.72);
    e.scale.set(1.5, 0.7, 1);
    head.add(e);
    const eg = mesh(new THREE.SphereGeometry(0.24, 8, 6), M.glow, sx * 0.43, 0.32, 0.72);
    head.add(eg);
    eyes.push(e, eg);
  }
  // chifres: 2 grandes curvos para trás + 2 menores
  const horns = [];
  for (const sx of [-1, 1]) {
    const hBase = new THREE.Group();
    hBase.position.set(sx * 0.42, 0.45, -0.25);
    hBase.rotation.set(-1.9, 0, sx * -0.35);
    head.add(hBase);
    const h1 = mesh(hornGeo(1.0, 0.2), M.horn);
    hBase.add(h1);
    const h1b = mesh(hornGeo(0.8, 0.13), M.horn, 0, 0.92, 0);
    h1b.rotation.x = 0.55;
    hBase.add(h1b);
    const h2 = mesh(hornGeo(0.55, 0.11), M.horn, sx * 0.6, 0.1, -0.05);
    h2.rotation.set(-1.6, 0, sx * -1.1);
    head.add(h2);
    horns.push(hBase, h2);
  }
  // mandíbula (abre no rugido/ataques)
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.3, 0.45);
  head.add(jaw);
  const jawGeo = lathe([[0.001, -0.75], [0.26, -0.7], [0.38, -0.3], [0.4, 0.3], [0.32, 0.7], [0.001, 0.76]], 12);
  jawGeo.rotateX(Math.PI / 2);
  const jawMesh = mesh(jawGeo, M.skin2, 0, -0.08, 0.7);
  jawMesh.scale.set(1, 0.32, 1);
  jaw.add(jawMesh);
  for (let i = 0; i < 5; i++) {
    for (const sx of [-1, 1]) {
      const tooth = mesh(new THREE.ConeGeometry(0.05, 0.18, 4), M.eye, sx * 0.3, 0.1, 0.25 + i * 0.26);
      jaw.add(tooth);
    }
  }
  const mouthGlow = mesh(new THREE.SphereGeometry(0.28, 8, 6), M.glow, 0, -0.1, 1.0);
  mouthGlow.scale.set(1, 0.5, 1.6);
  jaw.add(mouthGlow);

  // —— PERNAS (4) ——
  function makeLeg(x, z, front) {
    const hip = new THREE.Group();
    hip.position.set(x, front ? -0.2 : -0.1, z);
    torso.add(hip);
    const upper = mesh(new THREE.CapsuleGeometry(0.4, 0.75, 4, 12), M.skin, 0, -0.55, 0);
    hip.add(upper);
    const thighPlate = mesh(new THREE.BoxGeometry(0.2, 0.8, 0.7), M.plate, Math.sign(x) * 0.36, -0.35, 0);
    hip.add(thighPlate);
    const knee = new THREE.Group();
    knee.position.set(0, -1.15, 0);
    hip.add(knee);
    const lower = mesh(new THREE.CapsuleGeometry(0.28, 0.6, 4, 10), M.skin2, 0, -0.45, front ? 0.08 : -0.08);
    knee.add(lower);
    const foot = mesh(new THREE.BoxGeometry(0.62, 0.22, 0.75), M.plate, 0, -0.95, front ? 0.22 : 0.12);
    knee.add(foot);
    for (let i = -1; i <= 1; i++) {
      const cl = mesh(new THREE.ConeGeometry(0.07, 0.36, 4), M.claw, i * 0.2, -0.98, (front ? 0.22 : 0.12) + 0.48);
      cl.rotation.x = Math.PI / 2;
      knee.add(cl);
    }
    return { hip, knee };
  }
  const legFL = makeLeg(-0.95, 1.2, true);
  const legFR = makeLeg(0.95, 1.2, true);
  const legBL = makeLeg(-1.0, -1.45, false);
  const legBR = makeLeg(1.0, -1.45, false);

  // —— ASAS ——
  const wingGeo = wingGeometry();
  function makeWing(side) {
    const w = new THREE.Group();
    w.position.set(side * 0.9, 0.95, 0.8);
    torso.add(w);
    const inner = new THREE.Group();
    w.add(inner);
    inner.scale.set(side * 1.25, 1, 1.25);
    const mem = mesh(wingGeo, M.membrane);
    inner.add(mem);
    // ossos (braço + dedos) pretos
    const bones = [[0, 0, 4.3, -0.2], [0, 0, 3.4, -0.75], [0, 0, 3.2, 1.2], [0, 0, 2.1, 1.75], [0, 0, 1.0, 1.9]];
    for (const [x0, z0, x1, z1] of bones) {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const b = mesh(new THREE.CylinderGeometry(0.05, 0.1, len, 5), M.plate, (x0 + x1) / 2, 0.03, (z0 + z1) / 2);
      b.rotation.z = Math.PI / 2;
      b.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
      inner.add(b);
    }
    const claw = mesh(hornGeo(0.45, 0.09), M.horn, 3.4, 0.05, -0.75);
    claw.rotation.z = -Math.PI / 2;
    inner.add(claw);
    // EVO: borda de fuga da membrana com fio de NEXA (linha fina, mesma cor do núcleo)
    const edgePts = [[4.3, -0.2], [3.6, 0.35], [3.2, 1.2], [2.5, 0.8], [2.1, 1.75], [1.5, 1.05], [1.0, 1.9], [0.55, 1.1], [0.1, 1.2]];
    const pe = new THREE.CatmullRomCurve3(edgePts.map(([ex, ez]) => new THREE.Vector3(ex, 0.02, ez)));
    inner.add(mesh(new THREE.TubeGeometry(pe, 40, 0.025, 3, false), nexaMat));
    return w;
  }
  const wingL = makeWing(-1);
  const wingR = makeWing(1);

  // —— CAUDA (segmentos encadeados) ——
  const tailSegs = [];
  let tp = torso;
  for (let i = 0; i < 9; i++) {
    const seg = new THREE.Group();
    seg.position.set(0, i === 0 ? 0.1 : 0, i === 0 ? -2.1 : -0.72);
    tp.add(seg);
    const r = 0.55 * (1 - i / 10.5);
    const c = mesh(new THREE.CapsuleGeometry(r * 0.92, Math.max(0.05, 0.8 - r), 3, 10), M.skin, 0, 0, -0.36);
    c.rotation.x = Math.PI / 2;
    seg.add(c);
    const s = mesh(hornGeo(0.42 * (1 - i / 12), 0.12 * (1 - i / 14)), M.horn, 0, r * 0.85, -0.3);
    s.rotation.x = -0.6;
    seg.add(s);
    if (i % 2 === 0) {
      const pl = mesh(new THREE.BoxGeometry(r * 1.8, 0.1, 0.5), M.plate, 0, r * 0.7, -0.35);
      seg.add(pl);
    }
    tailSegs.push(seg);
    tp = seg;
  }
  const blade = mesh(new THREE.ConeGeometry(0.34, 1.2, 4), M.plate, 0, 0, -0.9);
  blade.rotation.x = -Math.PI / 2;
  blade.scale.set(1.6, 1, 0.35);
  tp.add(blade);
  const bladeGlow = mesh(new THREE.BoxGeometry(0.06, 0.06, 0.9), nexaMat, 0, 0.1, -0.8);
  tp.add(bladeGlow);

  // —— TELEGRAPHS (filhos da raiz; a investida é contra-posicionada no mundo) ——
  const tele = new THREE.Group();
  tele.name = 'bossTelegraphs';
  root.add(tele);
  function sector(inner, outer, halfRad, mat) {
    const g = new THREE.RingGeometry(inner, outer, 28, 1, -Math.PI / 2 - halfRad, halfRad * 2);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, mat);
    m.renderOrder = 4;
    return m;
  }
  const golpeGroup = new THREE.Group();
  const areaGroup = new THREE.Group();
  const chargeGroup = new THREE.Group();
  // EVO: telegraphs dos ataques novos (cauda atrás, cone do sopro, anéis, rugido)
  const caudaGroup = new THREE.Group();
  const soproGroup = new THREE.Group();
  const aneisGroup = new THREE.Group();
  tele.add(golpeGroup, areaGroup, chargeGroup, caudaGroup, soproGroup, aneisGroup);
  let caudaParts = null;
  let soproParts = null;
  let aneisParts = null;
  const tmat = { base: M.teleBase, fill: M.teleFill, edge: M.teleEdge };
  let golpeParts = null;
  let areaParts = null;
  let chargeParts = null;
  let builtFor = '';
  function buildTelegraphs(dims) {
    const key = JSON.stringify(dims);
    if (key === builtFor) return;
    builtFor = key;
    for (const g of [golpeGroup, areaGroup, chargeGroup, caudaGroup, soproGroup, aneisGroup]) {
      while (g.children.length) { const c = g.children.pop(); c.geometry?.dispose(); }
    }
    // golpe: setor à frente (m)
    const gIn = dims.bodyR * 0.55;
    const gOut = dims.bodyR + dims.golpeRange;
    const half = dims.golpeHalf;
    const gBase = sector(gIn, gOut, half, tmat.base);
    const gFill = sector(gIn, gOut, half, tmat.fill);
    const gEdge = sector(gOut - 0.14, gOut, half, tmat.edge);
    golpeGroup.add(gBase, gFill, gEdge);
    golpeParts = { gBase, gFill, gEdge, gIn, gOut };
    // área: disco + borda
    const aBase = new THREE.Mesh(new THREE.CircleGeometry(dims.areaR, 40).rotateX(-Math.PI / 2), tmat.base);
    const aFill = new THREE.Mesh(new THREE.CircleGeometry(dims.areaR, 40).rotateX(-Math.PI / 2), tmat.fill);
    const aEdge = new THREE.Mesh(new THREE.RingGeometry(dims.areaR - 0.18, dims.areaR, 48).rotateX(-Math.PI / 2), tmat.edge);
    const aShock = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2), M.shock);
    aShock.visible = false;
    for (const m of [aBase, aFill, aEdge, aShock]) m.renderOrder = 4;
    areaGroup.add(aBase, aFill, aEdge, aShock);
    areaParts = { aBase, aFill, aEdge, aShock };
    // investida: faixa unitária (z 0→1), escala no comprimento
    const unit = () => new THREE.PlaneGeometry(1, 1).translate(0, -0.5, 0).rotateX(-Math.PI / 2);
    const cBase = new THREE.Mesh(unit(), tmat.base);
    const cFill = new THREE.Mesh(unit(), tmat.fill);
    const cEdgeL = new THREE.Mesh(unit(), tmat.edge);
    const cEdgeR = new THREE.Mesh(unit(), tmat.edge);
    const arrows = [];
    for (let i = 0; i < 5; i++) {
      const a = new THREE.Mesh(new THREE.RingGeometry(0.0, 0.6, 3, 1).rotateX(-Math.PI / 2).rotateY(Math.PI), tmat.edge);
      a.scale.set(1, 1, 1.4);
      arrows.push(a);
      chargeGroup.add(a);
    }
    for (const m of [cBase, cFill, cEdgeL, cEdgeR, ...arrows]) m.renderOrder = 4;
    chargeGroup.add(cBase, cFill, cEdgeL, cEdgeR);
    chargeParts = { cBase, cFill, cEdgeL, cEdgeR, arrows, width: dims.chargeW };
    // cauda: setor ATRÁS (gira 180°)
    if (dims.caudaRange) {
      const cIn = dims.bodyR * 0.4;
      const cOut = dims.bodyR + dims.caudaRange;
      const b = sector(cIn, cOut, dims.caudaHalf, tmat.base);
      const f = sector(cIn, cOut, dims.caudaHalf, tmat.fill);
      const e = sector(cOut - 0.14, cOut, dims.caudaHalf, tmat.edge);
      caudaGroup.add(b, f, e);
      caudaGroup.rotation.y = Math.PI;
      caudaParts = { b, f, e };
    }
    if (dims.soproRange) {
      const sIn = dims.bodyR * 0.9;
      const sOut = dims.bodyR + dims.soproRange;
      const b = sector(sIn, sOut, dims.soproHalf, tmat.base);
      const f = sector(sIn, sOut, dims.soproHalf, M.soproFill);
      const e = sector(sOut - 0.16, sOut, dims.soproHalf, tmat.edge);
      soproGroup.add(b, f, e);
      soproParts = { b, f, e };
    }
    // anéis: 3 anéis de choque (raio = escala); marcador de origem no preparo
    const rings = [];
    for (let i = 0; i < 5; i++) {
      const rm = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 56).rotateX(-Math.PI / 2), M.ringEdge);
      rm.visible = false; rm.renderOrder = 4;
      aneisGroup.add(rm);
      rings.push(rm);
    }
    const warn = new THREE.Mesh(new THREE.RingGeometry(dims.bodyR + 0.2, dims.bodyR + 0.55, 40).rotateX(-Math.PI / 2), tmat.edge);
    warn.renderOrder = 4;
    aneisGroup.add(warn);
    aneisParts = { rings, warn };
  }
  golpeGroup.visible = areaGroup.visible = chargeGroup.visible = false;
  caudaGroup.visible = soproGroup.visible = aneisGroup.visible = false;

  const tmpV = new THREE.Vector3();
  const st = { walk: 0, t: 0, flash: 0, shockT: -1, lastState: '', lastAtk: null, visibleTele: '', introT: -1 };

  /**
   * @param {object} v getBossView() (estado da IA do chefe)
   * @param {object} o { dt, now, cfg (arenaBoss), flashing, hpPct }
   */
  function update(v, o) {
    const dt = o.dt || 0.016;
    st.t += dt;
    const cfg = o.cfg;
    buildTelegraphs({
      bodyR: cfg.bodyRadius * TILE, golpeRange: cfg.attacks.golpe.range * TILE, golpeHalf: (cfg.attacks.golpe.halfAngleDeg * Math.PI) / 180,
      areaR: cfg.attacks.area.radius * TILE, chargeW: 2 * (cfg.bodyRadius + cfg.attacks.investida.hitRadius) * TILE,
      caudaRange: (cfg.extraAttacks?.cauda?.range || 0) * TILE, caudaHalf: ((cfg.extraAttacks?.cauda?.halfAngleDeg || 0) * Math.PI) / 180,
      soproRange: (cfg.extraAttacks?.sopro?.range || 0) * TILE, soproHalf: ((cfg.extraAttacks?.sopro?.halfAngleDeg || 0) * Math.PI) / 180
    });
    const X = cfg.extraAttacks || {};
    const S = v ? v.state : 'IDLE';
    const atk = v ? v.attack : null;
    const t = v ? v.t : 0;
    const prog = v ? v.progress : 0;
    const e = 1 - (1 - prog) * (1 - prog);
    // —— pose base ——
    let hipPitch = 0; // + empina (frente sobe)
    let lift = 0; // voo rasante
    let neckBend = 0; // + abaixa cabeça
    let jawOpen = 0.08 + Math.sin(st.t * 1.3) * 0.04;
    let wingSpread = 0.25 + Math.sin(st.t * 0.9) * 0.05; // 0 dobrada, 1 aberta
    let wingFlap = 0;
    let tailSwing = Math.sin(st.t * 1.1) * 0.12;
    let clawR = 0; // golpe de garra (braço dianteiro direito)
    let twist = 0;
    let wobble = 0;
    const breathe = 1 + Math.sin(st.t * 1.6) * 0.018;
    const speed = v ? v.speed : 0;
    st.walk += speed * dt * 2.2;
    const legSw = speed > 0.05 ? Math.sin(st.walk * 3.2) * 0.38 : 0;
    let corePulse = 0.5 + 0.5 * Math.sin(st.t * 2.4);

    if (S === 'DETECT' || S === 'ALERT') {
      jawOpen = 0.55; neckBend = -0.2; wingSpread = 0.7; corePulse = 1;
    } else if (S === 'ATTACK_PREPARE') {
      corePulse = 0.6 + 0.4 * Math.sin(t * 0.03);
      if (atk === 'golpe') {
        clawR = -1.1 * e; twist = -0.35 * e; tailSwing = 0.6 * e; neckBend = 0.15 * e; jawOpen = 0.35;
      } else if (atk === 'area') {
        hipPitch = 0.5 * e; wingSpread = 0.35 + 0.65 * e; wingFlap = Math.sin(t * 0.02) * 0.25 * e; jawOpen = 0.6 * e; neckBend = -0.35 * e;
      } else if (atk === 'investida') {
        hipPitch = -0.12 * e; neckBend = 0.35 * e; wingSpread = 0.3 + 0.7 * e; jawOpen = 0.4 * e; tailSwing = Math.sin(t * 0.02) * 0.25;
      } else if (atk === 'cauda') {
        twist = 0.5 * e; tailSwing = -1.1 * e; neckBend = 0.1 * e; jawOpen = 0.3;
      } else if (atk === 'sopro') {
        hipPitch = 0.25 * e; neckBend = -0.45 * e; jawOpen = 0.2 + 0.7 * e; corePulse = 1; wingSpread = 0.4 + 0.3 * e;
      } else if (atk === 'aneis' || atk === 'rugido') {
        hipPitch = 0.65 * e; wingSpread = 0.4 + 0.6 * e; jawOpen = (atk === 'rugido' ? 0.9 : 0.5) * e; neckBend = -0.4 * e; corePulse = 1;
        wingFlap = Math.sin(t * 0.025) * 0.2 * e;
      } else if (atk === 'pocas') {
        neckBend = -0.2 * e; jawOpen = 0.7 * e; hipPitch = 0.15 * e;
      }
    } else if (S === 'ATTACK') {
      if (atk === 'golpe') {
        const q = Math.min(1, t / Math.max(1, cfg.attacks.golpe.activeMs));
        clawR = -1.1 + 2.3 * q; twist = -0.35 + 0.8 * q; tailSwing = 0.6 - 1.4 * q; jawOpen = 0.5;
      } else if (atk === 'area') {
        const q = Math.min(1, t / Math.max(1, cfg.attacks.area.activeMs));
        hipPitch = 0.5 * (1 - q) - 0.08 * q; wingSpread = 1 - 0.4 * q; jawOpen = 0.8;
        if (st.lastState !== 'ATTACK') st.shockT = 0;
      } else if (atk === 'investida') {
        lift = 0.7; hipPitch = -0.15; neckBend = 0.45; wingSpread = 1; wingFlap = Math.sin(st.t * 16) * 0.35; jawOpen = 0.7;
        st.walk += dt * 12;
      } else if (atk === 'cauda') {
        const q = Math.min(1, t / Math.max(1, X.cauda?.activeMs || 240));
        twist = 0.5 - 1.3 * q; tailSwing = -1.1 + 2.6 * q; jawOpen = 0.4;
      } else if (atk === 'sopro') {
        hipPitch = 0.2; neckBend = 0.1; jawOpen = 1; corePulse = 1;
      } else if (atk === 'aneis' || atk === 'rugido') {
        const q = Math.min(1, t / 300);
        hipPitch = 0.65 * (1 - q) - 0.05 * q; wingSpread = 1 - 0.3 * q; jawOpen = 0.8;
      } else if (atk === 'pocas') {
        jawOpen = 0.8; neckBend = 0.1;
      }
    } else if (S === 'RECOVERY') {
      neckBend = 0.45; jawOpen = 0.3 + Math.sin(st.t * 5) * 0.08; wingSpread = 0.2; corePulse = 0.25;
      if (v && v.chargeWall && atk === 'investida') wobble = Math.sin(st.t * 9) * 0.07;
    } else if (S === 'STUN') {
      wobble = Math.sin(st.t * 10) * 0.08; neckBend = 0.5; corePulse = 0.2;
    }
    st.lastState = S;
    // EVO: MOMENTO DE ENTRADA (≈2,6 s): ergue-se nas patas traseiras, abre as asas inteiras, ruge e o núcleo explode em luz
    if (st.introT >= 0) {
      st.introT += dt;
      const T = st.introT;
      const up = Math.min(1, T / 0.7);
      const hold = T < 2.0 ? 1 : Math.max(0, 1 - (T - 2.0) / 0.6);
      const k2 = up * hold;
      hipPitch = Math.max(hipPitch, 0.75 * k2);
      wingSpread = Math.max(wingSpread, 0.25 + 0.75 * k2);
      wingFlap = Math.sin(T * 9) * 0.22 * k2;
      jawOpen = Math.max(jawOpen, (T > 0.5 && T < 2.1 ? 1 : 0.3) * k2);
      neckBend = -0.5 * k2;
      corePulse = Math.max(corePulse, k2);
      tailSwing = Math.sin(T * 5) * 0.5 * k2;
      if (T > 2.6) st.introT = -1;
    }

    hips.rotation.x = -hipPitch;
    body.position.y = lift + (S === 'ATTACK' && atk === 'investida' ? Math.sin(st.t * 8) * 0.08 : 0);
    body.rotation.z = wobble;
    body.rotation.y = twist * 0.5;
    torsoMesh.scale.set(1.25 * breathe, 1.1 * breathe, 2.3);
    for (let i = 0; i < neckSegs.length; i++) neckSegs[i].rotation.x = -0.28 + neckBend * 0.25 + Math.sin(st.t * 0.8 + i) * 0.015;
    head.rotation.x = 0.95 + neckBend * 0.2;
    jaw.rotation.x = Math.max(0, jawOpen) * 0.6;
    const ws = wingSpread;
    // dobrada (ws 0): quase vertical ao longo das costas; aberta (ws 1): larga, ~30° acima da horizontal
    wingL.rotation.set(0, 1.0 - ws * 1.0, -(1.3 - ws * 0.8 + wingFlap));
    wingR.rotation.set(0, -(1.0 - ws * 1.0), 1.3 - ws * 0.8 + wingFlap);
    for (let i = 0; i < tailSegs.length; i++) {
      tailSegs[i].rotation.y = tailSwing * (0.35 + i * 0.08) + Math.sin(st.t * 1.4 - i * 0.5) * 0.05;
      tailSegs[i].rotation.x = i === 0 ? 0.12 : -0.03 + (lift > 0 ? 0.02 : 0);
    }
    // pernas
    const frontLift = hipPitch > 0.1 ? hipPitch * 1.2 : 0;
    legFL.hip.rotation.x = legSw - frontLift;
    legFR.hip.rotation.x = -legSw - frontLift + clawR * 0.9;
    legFR.hip.rotation.z = clawR < 0 ? clawR * 0.25 : 0;
    legFR.knee.rotation.x = clawR < -0.2 ? -clawR * 0.8 : 0;
    legFL.knee.rotation.x = frontLift * 0.9;
    legBL.hip.rotation.x = -legSw + hipPitch * 0.4 + (lift ? 0.6 : 0);
    legBR.hip.rotation.x = legSw + hipPitch * 0.4 + (lift ? 0.6 : 0);
    legBL.knee.rotation.x = lift ? -0.6 : 0;
    legBR.knee.rotation.x = lift ? -0.6 : 0;
    // núcleo / olhos
    const flashing = !!o.flashing;
    nexaMat.emissiveIntensity = flashing ? 5 : 1.4 + corePulse * 2.2 + (st.introT >= 0 ? 2.5 * Math.min(1, st.introT / 0.7) : 0);
    nexaMat.emissive.setHex(flashing ? 0xffffff : NEXA);
    coreHalo.scale.setScalar(0.9 + corePulse * 0.35);
    core.rotation.y += dt * 1.2;
    gyroA.rotation.x += dt * (1.4 + corePulse * 2.5);
    gyroB.rotation.y += dt * (1.9 + corePulse * 3.0);
    gyro.scale.setScalar(1 + corePulse * 0.12);
    mouthGlow.visible = jawOpen > 0.3;
    mouthGlow.scale.set(1, 0.5, (atk === 'sopro' && S === 'ATTACK') ? 6 + Math.sin(st.t * 30) * 1.2 : 1.6);
    // sombra acompanha voo
    shadow.scale.set(1 - lift * 0.2, 1.35 - lift * 0.25, 1);
    shadow.material.opacity = 0.42;

    // —— telegraphs ——
    const showG = (S === 'ATTACK_PREPARE' || (S === 'ATTACK' && t < 180)) && atk === 'golpe';
    const showA = (S === 'ATTACK_PREPARE' && atk === 'area');
    const showC = (S === 'ATTACK_PREPARE' || S === 'ATTACK') && atk === 'investida';
    golpeGroup.visible = showG;
    areaGroup.visible = showA || st.shockT >= 0;
    chargeGroup.visible = showC;
    const pulse = 0.65 + 0.35 * Math.sin(st.t * 14);
    tele.position.y = 0.06 - body.position.y * 0; // no chão
    if (showG && golpeParts) {
      const f = S === 'ATTACK' ? 1 : e;
      golpeParts.gFill.scale.setScalar(0.25 + 0.75 * f);
      golpeParts.gEdge.material.opacity = 0.55 + 0.4 * pulse;
      golpeGroup.rotation.y = -twist * 0.5; // acompanha o corpo, não o giro de pose
    }
    if (areaParts) {
      areaParts.aBase.visible = areaParts.aFill.visible = areaParts.aEdge.visible = showA;
      if (showA) {
        areaParts.aFill.scale.setScalar(Math.max(0.02, e));
        areaParts.aEdge.material.opacity = 0.5 + 0.45 * pulse;
      }
      if (st.shockT >= 0) {
        st.shockT += dt;
        const q = st.shockT / 0.45;
        const R = cfg.attacks.area.radius * TILE;
        areaParts.aShock.visible = q < 1;
        areaParts.aShock.scale.setScalar(Math.max(0.05, q) * R);
        areaParts.aShock.material.opacity = 0.75 * (1 - q);
        if (q >= 1) { st.shockT = -1; areaParts.aShock.visible = false; }
      }
    }
    if (showC && chargeParts && v) {
      // fixo no MUNDO: do ponto de partida na direção travada
      const L = (v.chargeLen + cfg.bodyRadius) * TILE;
      const W = chargeParts.width;
      root.updateMatrixWorld(true);
      tmpV.set(v.chargeFromX * TILE, 0.06, v.chargeFromY * TILE);
      root.worldToLocal(tmpV);
      chargeGroup.position.copy(tmpV);
      chargeGroup.rotation.y = Math.atan2(v.chargeDirX, v.chargeDirY) - root.rotation.y;
      chargeParts.cBase.scale.set(W, 1, L);
      const f = S === 'ATTACK' ? 1 : e;
      chargeParts.cFill.scale.set(W, 1, Math.max(0.02, L * f));
      chargeParts.cEdgeL.scale.set(0.14, 1, L);
      chargeParts.cEdgeR.scale.set(0.14, 1, L);
      chargeParts.cEdgeL.position.x = -W / 2;
      chargeParts.cEdgeR.position.x = W / 2;
      chargeParts.cEdgeL.material.opacity = 0.55 + 0.4 * pulse;
      for (let i = 0; i < chargeParts.arrows.length; i++) {
        const a = chargeParts.arrows[i];
        const z = ((i + 1) / (chargeParts.arrows.length + 1)) * L + ((st.t * 3) % 1) * (L / (chargeParts.arrows.length + 1)) * 0.5;
        a.position.set(0, 0.01, Math.min(L - 0.3, z));
      }
    }
    // EVO: cauda / sopro / anéis
    const showT = (S === 'ATTACK_PREPARE' || (S === 'ATTACK' && t < 160)) && atk === 'cauda';
    const showS = (S === 'ATTACK_PREPARE' || S === 'ATTACK') && atk === 'sopro';
    const showR = (S === 'ATTACK_PREPARE' || S === 'ATTACK') && (atk === 'aneis' || atk === 'rugido');
    caudaGroup.visible = showT && !!caudaParts;
    soproGroup.visible = showS && !!soproParts;
    aneisGroup.visible = showR && !!aneisParts;
    if (showT && caudaParts) {
      caudaParts.f.scale.setScalar(0.25 + 0.75 * (S === 'ATTACK' ? 1 : e));
      caudaGroup.rotation.y = Math.PI - twist * 0.5;
    }
    if (showS && soproParts) {
      soproParts.f.scale.setScalar(S === 'ATTACK' ? 1 : Math.max(0.05, e));
      soproParts.f.material.opacity = S === 'ATTACK' ? 0.55 + 0.25 * pulse : 0.3;
      soproGroup.rotation.y = -twist * 0.5;
    }
    if (showR && aneisParts) {
      const A = atk === 'aneis' ? X.aneis : null;
      aneisParts.warn.visible = S === 'ATTACK_PREPARE';
      aneisParts.warn.scale.setScalar(1 + 0.08 * pulse);
      for (let i = 0; i < aneisParts.rings.length; i++) {
        const rm = aneisParts.rings[i];
        let vis = false;
        if (S === 'ATTACK' && A && i < A.rings) {
          const rt = t - i * A.ringGapMs;
          const R = (rt / 1000) * A.ringSpeed + cfg.bodyRadius;
          if (rt >= 0 && R <= A.maxRadius) {
            vis = true;
            const Rm = R * TILE;
            rm.scale.set(Rm, 1, Rm);
          }
        } else if (S === 'ATTACK' && atk === 'rugido' && i === 0) {
          const q = Math.min(1, t / 300);
          const Rm = (cfg.bodyRadius + q * (X.rugido?.radius || 3)) * TILE;
          rm.scale.set(Rm, 1, Rm); vis = true;
        }
        rm.visible = vis;
      }
    }
    st.visibleTele = showG ? 'golpe' : showA ? 'area' : showC ? 'investida' : showT ? 'cauda' : showS ? 'sopro' : showR ? atk : (S === 'ATTACK_PREPARE' && atk === 'pocas' ? 'pocas' : '');
  }

  root.userData.boss = true;
  root.userData.parts = { head, core, wingL, wingR, tailSegs, horns, eyes, spikes };
  // EVO: mescla as peças estáticas por pivô (pernas/asas/pescoço/cauda/mandíbula seguem animados)
  const keep = [torsoMesh, core, coreHalo, mouthGlow, gyroA, gyroB];
  body.traverse((o) => { if (o.type === 'Group') keep.push(o); });
  const mergeInfo = mergeStaticParts(body, keep);
  const playIntro = () => { st.introT = 0; };
  root.userData.playIntro = playIntro;
  function updateAll(v, o) {
    update(v, o);
    glb.update(o.dt || 0.016, { state: v ? v.state : 'IDLE', progress: v ? v.progress : 0, speed: v ? v.speed : 0, attack: v ? v.attack : null });
  }
  return { root, update: updateAll, glb, getTelegraph: () => st.visibleTele, height, mergeInfo, playIntro, introActive: () => st.introT >= 0 };
}
