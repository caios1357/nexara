/**
 * NEXARA — RASTRO ELEMENTAL NO CHÃO (20261016trilha, pedido do Caio).
 * Substitui as "imagens residuais" azuis (silhuetas/cilindros translúcidos do herói-fantasma) ao correr com IMPULSO,
 * na ESQUIVA e no DASH por marcas BARATAS no chão: RAIO (impulso), VENTO (esquiva) e FOGO (dash).
 * Pool fixo de 18 quads planos aditivos + 3 texturas de canvas (1 vez) → 0 alocação por quadro, 1 material por elemento.
 */
import * as THREE from 'three';

const EL = {
  raio: { cor: 0x8fd8ff, nucleo: '#ffffff', borda: 'rgba(110,190,255,', len: 1.5, w: 0.68, dur: 0.6 },
  vento: { cor: 0xc8fff4, nucleo: '#f2fffb', borda: 'rgba(160,255,230,', len: 1.6, w: 0.8, dur: 0.6 },
  fogo: { cor: 0xff7a2a, nucleo: '#fff1a8', borda: 'rgba(255,110,30,', len: 1.45, w: 0.72, dur: 0.7 }
};
export const KIND_EL = { impulso: 'raio', dodge: 'vento', dash: 'fogo' };
const stats = { emit: { raio: 0, vento: 0, fogo: 0 }, live: 0 };
if (typeof window !== 'undefined') window.__nxTrail = stats;

function tex(el) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64; const g = c.getContext('2d'); const E = EL[el];
  const grad = g.createLinearGradient(0, 0, 128, 0); grad.addColorStop(0, E.borda + '0)'); grad.addColorStop(0.55, E.borda + '0.55)'); grad.addColorStop(1, E.borda + '0)');
  g.fillStyle = grad; g.beginPath(); g.ellipse(64, 32, 62, el === 'vento' ? 20 : 16, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = E.nucleo; g.lineCap = 'round';
  if (el === 'raio') { g.lineWidth = 3.2; g.beginPath(); let y = 32; g.moveTo(6, y); for (let x = 14; x <= 122; x += 10) { y = 32 + (Math.random() * 2 - 1) * 13; g.lineTo(x, y); } g.stroke(); g.lineWidth = 1.4; g.beginPath(); g.moveTo(40, 30); g.lineTo(52, 14); g.lineTo(60, 20); g.stroke(); }
  else if (el === 'vento') { g.lineWidth = 2.4; for (let k = 0; k < 3; k++) { g.beginPath(); const y0 = 18 + k * 14; g.moveTo(8, y0); g.bezierCurveTo(40, y0 - 10, 80, y0 + 10, 120, y0 - 2); g.stroke(); } g.beginPath(); g.arc(96, 30, 9, 0, Math.PI * 1.5); g.stroke(); }
  else { for (let k = 0; k < 9; k++) { const x = 12 + k * 12, h = 10 + Math.random() * 16; const gr = g.createLinearGradient(0, 32 + h, 0, 32 - h); gr.addColorStop(0, 'rgba(255,90,20,0)'); gr.addColorStop(0.5, 'rgba(255,150,40,0.9)'); gr.addColorStop(1, E.nucleo); g.fillStyle = gr; g.beginPath(); g.moveTo(x - 6, 32 + 8); g.quadraticCurveTo(x, 32 - h * 1.4, x + 6, 32 + 8); g.fill(); } }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const byScene = new WeakMap();
/** um pool por cena (action-vfx, passive-vfx e assinaturas usam o MESMO) */
export function getGroundTrail(scene) {
  if (byScene.has(scene)) return byScene.get(scene);
  const root = new THREE.Group(); root.name = 'groundTrail'; scene.add(root);
  const mats = {}; for (const el of Object.keys(EL)) mats[el] = new THREE.MeshBasicMaterial({ map: tex(el), color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
  const pool = []; for (let i = 0; i < 18; i++) { const m = new THREE.Mesh(geo, mats.raio.clone()); m.visible = false; m.frustumCulled = false; m.renderOrder = 2; root.add(m); pool.push({ m, life: 0, dur: 0.5, el: 'raio', s: 1 }); }
  for (const p of pool) p.m.material.map = mats.raio.map;
  let next = 0, last = performance.now(), lastX = null, lastZ = null, yaw = 0;
  function emit(x, z, kind = 'impulso', ownYaw = null) {
    const el = EL[kind] ? kind : KIND_EL[kind] || 'raio'; const E = EL[el];
    if (ownYaw != null) yaw = ownYaw; else if (lastX != null && Math.hypot(x - lastX, z - lastZ) > 0.02) yaw = Math.atan2(x - lastX, z - lastZ);
    lastX = x; lastZ = z;
    const p = pool[next]; next = (next + 1) % pool.length;
    p.el = el; p.m.material.map = mats[el].map; p.m.material.color.setHex(E.cor);
    p.m.position.set(x, 0.035 + (next % 3) * 0.002, z); p.m.rotation.y = yaw + Math.PI / 2; p.s = 0.85 + Math.random() * 0.25; p.m.scale.set(E.len * p.s, 1, E.w * p.s);
    p.life = p.dur = E.dur; p.m.visible = true; stats.emit[el]++;
  }
  function update() {
    const now = performance.now(); const dt = Math.min(0.1, (now - last) / 1000); if (dt < 0.001) return; last = now; let live = 0;
    for (const p of pool) { if (p.life <= 0) continue; p.life -= dt; if (p.life <= 0) { p.m.visible = false; continue; } live++;
      const k = p.life / p.dur; p.m.material.opacity = (p.el === 'fogo' ? 0.95 : 0.85) * Math.min(1, k * 1.6); p.m.scale.z = EL[p.el].w * p.s * (1 + (1 - k) * (p.el === 'vento' ? 0.9 : 0.35)); }
    stats.live = live;
  }
  function hideAll() { for (const p of pool) { p.life = 0; p.m.visible = false; } }
  const api = { emit, update, hideAll, stats: () => ({ emit: { ...stats.emit }, live: pool.filter((p) => p.life > 0).length }), root };
  byScene.set(scene, api); return api;
}
