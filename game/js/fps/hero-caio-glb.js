/**
 * NEXARA — MODELO 3D DO CAIO (guerreiro-lite.glb, 20k tris, T-pose, sem rig) → SkinnedMesh no ESQUELETO PROCEDURAL do herói.
 * Auto-rig grátis no próprio navegador: pesos por distância aos SEGMENTOS dos ossos (2 ossos por vértice, suave),
 * com regras para tabardo (só quadril) e capa/espada das costas (tronco). Os ossos SÃO as juntas procedurais
 * (hips/spine/chest/neck/head/shoulder/elbow/wrist/thigh/knee) → todas as animações existentes (correr, ataque, esquiva, montaria) valem.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const cache = new Map();
export function loadCaioGlb(url) {
  if (!cache.has(url)) cache.set(url, new Promise((res, rej) => new GLTFLoader().load(url, (g) => { let m = null; g.scene.traverse((o) => { if (o.isMesh && !m) m = o; }); m ? res(m) : rej(new Error('sem malha')); }, undefined, rej)));
  return cache.get(url);
}

/** marcos anatômicos do guerreiro-lite (unidades do modelo: pés y=-1, topo ~0.96, frente +Z) */
export const LM_GUERREIRO = {
  hips: [-0.02, -0.04, 0], spine: [-0.02, 0.08, 0], chest: [-0.02, 0.2, 0], neck: [-0.02, 0.42, 0], head: [-0.02, 0.5, 0], top: [-0.02, 0.96, 0],
  shoulderL: [0.27, 0.28, -0.03], elbowL: [0.57, 0.26, -0.03], wristL: [0.8, 0.24, -0.03], handL: [0.96, 0.22, -0.03],
  shoulderR: [-0.31, 0.28, -0.03], elbowR: [-0.61, 0.26, -0.03], wristR: [-0.84, 0.24, -0.03], handR: [-1.0, 0.22, -0.03],
  thighL: [0.21, -0.1, 0], kneeL: [0.23, -0.5, 0], footL: [0.25, -1.0, 0.03], thighR: [-0.25, -0.1, 0], kneeR: [-0.27, -0.5, 0], footR: [-0.29, -1.0, 0.03]
};
// osso → [início, fim, raio]
const SEG = (L) => ({
  hips: [L.hips, L.spine, 0.26], spine: [L.spine, L.chest, 0.26], chest: [L.chest, L.neck, 0.3], neck: [L.neck, L.head, 0.12], head: [L.head, L.top, 0.3],
  shoulderL: [L.shoulderL, L.elbowL, 0.13], elbowL: [L.elbowL, L.wristL, 0.11], wristL: [L.wristL, L.handL, 0.09],
  shoulderR: [L.shoulderR, L.elbowR, 0.13], elbowR: [L.elbowR, L.wristR, 0.11], wristR: [L.wristR, L.handR, 0.09],
  thighL: [L.thighL, L.kneeL, 0.15], kneeL: [L.kneeL, L.footL, 0.16], thighR: [L.thighR, L.kneeR, 0.15], kneeR: [L.kneeR, L.footR, 0.16]
});
export const BONE_ORDER = ['hips', 'spine', 'chest', 'neck', 'head', 'shoulderL', 'elbowL', 'wristL', 'shoulderR', 'elbowR', 'wristR', 'thighL', 'kneeL', 'thighR', 'kneeR'];

function segDist(p, a, b) { const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; const ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]]; const l2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1e-6; const t = Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / l2)); return Math.hypot(ap[0] - ab[0] * t, ap[1] - ab[1] * t, ap[2] - ab[2] * t); }

/** pesos de skin (4 slots, usa 2) para a geometria em unidades do modelo */
export function autoWeights(geo, L = LM_GUERREIRO) {
  const S = SEG(L); const idx = Object.fromEntries(BONE_ORDER.map((b, i) => [b, i])); const pos = geo.attributes.position; const n = pos.count;
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4); const p = [0, 0, 0]; const cx = L.hips[0];
  for (let v = 0; v < n; v++) {
    p[0] = pos.getX(v); p[1] = pos.getY(v); p[2] = pos.getZ(v);
    let forced = null;
    if (Math.abs(p[0] - cx) < 0.15 && p[1] < -0.02 && p[1] > -0.55 && p[2] > 0.05) forced = 'hips'; // tabardo da frente: segue o quadril (não rasga entre as pernas)
    else if (p[2] < -0.13 && p[1] < 0.3 && p[1] > -0.75 && Math.abs(p[0] - cx) < 0.32) forced = p[1] > 0.05 ? 'chest' : 'hips'; // capa + montante das costas
    if (forced) { si[v * 4] = idx[forced]; sw[v * 4] = 1; continue; }
    let b1 = -1, b2 = -1, w1 = 0, w2 = 0;
    for (const b of BONE_ORDER) { const [a, e, r] = S[b]; const d = Math.max(0, segDist(p, a, e) - r) + 0.012; const w = 1 / (d * d * d); if (w > w1) { b2 = b1; w2 = w1; b1 = idx[b]; w1 = w; } else if (w > w2) { b2 = idx[b]; w2 = w; } }
    const t = w1 + w2; si[v * 4] = b1; sw[v * 4] = w1 / t; si[v * 4 + 1] = Math.max(0, b2); sw[v * 4 + 1] = b2 < 0 ? 0 : w2 / t;
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  return geo;
}
