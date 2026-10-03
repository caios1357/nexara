/**
 * EVO (gráficos) — cenário do Campo de Ascensão / Arena: pilares rúnicos, cabos pendurados,
 * placas holográficas, selos no chão e céu em gradiente. Tudo procedural e em POUCOS draw calls:
 *   pilares (InstancedMesh ×3 partes) · anéis de runa (InstancedMesh) · cabos (1 geometria mesclada)
 *   · placas holo (1 InstancedMesh com textura-atlas) · selos (1 InstancedMesh aditivo).
 * Sem luzes novas, sem bloom extra. Pilares ficam SOBRE tiles de parede (não bloqueiam caminho).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lathe, tube, decalTex, circuitTex, panelTex } from './creature-kit.js?v=20261003m10d';

const H = (x, y) => (((x * 73856093) ^ (y * 19349663)) >>> 0);

function holoAtlas() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const x = c.getContext('2d');
  const signs = [['NEXARA', '2847'], ['ASCENSÃO', '◆ CAMPO ◆'], ['PERIGO', 'COVIL ⟶'], ['NEXA', '⚡ 99%']];
  signs.forEach(([a, b], i) => {
    const ox = (i % 2) * 256, oy = Math.floor(i / 2) * 128;
    x.fillStyle = 'rgba(0,0,0,0)'; x.clearRect(ox, oy, 256, 128);
    x.strokeStyle = 'rgba(255,255,255,0.9)'; x.lineWidth = 4; x.strokeRect(ox + 6, oy + 6, 244, 116);
    x.globalAlpha = 0.18; x.fillStyle = '#fff'; x.fillRect(ox + 8, oy + 8, 240, 112); x.globalAlpha = 1;
    for (let k = 0; k < 14; k++) { x.globalAlpha = 0.12; x.fillRect(ox + 8, oy + 12 + k * 8, 240, 2); }
    x.globalAlpha = 1; x.fillStyle = '#fff'; x.textAlign = 'center';
    x.font = '900 40px system-ui, sans-serif'; x.fillText(a, ox + 128, oy + 58);
    x.font = '700 26px system-ui, sans-serif'; x.fillText(b, ox + 128, oy + 100);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * @param {object} zone  zona (map, tiles, spawnPoints opcionais, lair)
 * @param {(x:number,y:number)=>string} tileType
 * @param {number} TILE
 * @param {{ accent:number, accent2:number, density?:number }} look
 * @returns {{ group: THREE.Group, stats: object, dispose: () => void }}
 */
export function buildArenaDressing(zone, tileType, TILE, look) {
  const group = new THREE.Group();
  group.name = 'arena-dressing';
  const W = zone.map.width, Hh = zone.map.height;
  const density = look.density ?? 1;
  const disposables = [];
  const own = (o) => { disposables.push(o); return o; };

  // ── pilares: em tiles de PAREDE com chão ao lado, espaçados por hash ──
  const pillars = [];
  for (let y = 0; y < Hh; y++) {
    for (let x = 0; x < W; x++) {
      if (tileType(x, y) !== 'wall') continue;
      let open = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const t = tileType(x + dx, y + dy); if (t && t !== 'wall' && t !== 'void') open++; }
      if (!open) continue;
      const h = H(x, y);
      const edge = x === 0 || y === 0 || x === W - 1 || y === Hh - 1;
      if (edge ? (x + y) % Math.max(3, Math.round(5 / density)) === 0 : h % 7 === 0) pillars.push({ x: (x + 0.5) * TILE, z: (y + 0.5) * TILE, h: 4.2 + (h % 5) * 0.35, edge, gx: x, gy: y });
    }
  }
  const maxP = Math.round(48 * density);
  if (pillars.length > maxP) pillars.length = maxP;
  const panel = panelTex();
  const stoneMat = own(new THREE.MeshStandardMaterial({ color: 0x5a6670, map: panel, roughness: 0.62, metalness: 0.4,
    emissive: look.accent, emissiveMap: circuitTex(), emissiveIntensity: 0.6 }));
  const capMat = own(new THREE.MeshStandardMaterial({ color: 0x2a3036, roughness: 0.4, metalness: 0.75 }));
  const runeMat = own(new THREE.MeshBasicMaterial({ color: new THREE.Color(look.accent).multiplyScalar(1.6), transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
  // fuste orgânico (base larga, cintura, capitel), cristal no topo
  const shaft = own(lathe([[0.62, 0], [0.55, 0.25], [0.4, 0.45], [0.36, 1.6], [0.4, 2.8], [0.33, 3.4], [0.5, 3.6], [0.56, 3.75], [0.001, 3.8]], 8));
  const crystal = own(new THREE.OctahedronGeometry(0.26, 0));
  const ring = own(new THREE.TorusGeometry(0.44, 0.035, 4, 18).rotateX(Math.PI / 2));
  const imShaft = new THREE.InstancedMesh(shaft, stoneMat, Math.max(1, pillars.length));
  const imCrys = new THREE.InstancedMesh(crystal, runeMat, Math.max(1, pillars.length));
  const imRing = new THREE.InstancedMesh(ring, runeMat, Math.max(1, pillars.length * 2));
  const d = new THREE.Object3D();
  pillars.forEach((p, i) => {
    const s = p.h / 3.8;
    d.position.set(p.x, 0, p.z); d.rotation.set(0, (H(p.gx, p.gy) % 6) * 0.5, 0); d.scale.set(1, s, 1); d.updateMatrix(); imShaft.setMatrixAt(i, d.matrix);
    d.position.set(p.x, p.h + 0.45, p.z); d.scale.set(1, 1.6, 1); d.rotation.set(0, i * 0.7, 0); d.updateMatrix(); imCrys.setMatrixAt(i, d.matrix);
    for (let k = 0; k < 2; k++) { d.position.set(p.x, p.h * (0.42 + k * 0.3), p.z); d.scale.set(1, 1, 1); d.rotation.set(0, 0, 0); d.updateMatrix(); imRing.setMatrixAt(i * 2 + k, d.matrix); }
  });
  imShaft.count = pillars.length; imCrys.count = pillars.length; imRing.count = pillars.length * 2;
  for (const im of [imShaft, imCrys, imRing]) { im.instanceMatrix.needsUpdate = true; im.frustumCulled = false; group.add(im); }
  imShaft.castShadow = true;
  void capMat;

  // ── cabos pendurados entre pilares vizinhos (catenária) — 1 geometria mesclada ──
  const cables = [];
  const used = new Set();
  for (let i = 0; i < pillars.length; i++) {
    let best = -1, bd = 1e9;
    for (let j = 0; j < pillars.length; j++) {
      if (i === j || used.has(`${Math.min(i, j)}:${Math.max(i, j)}`)) continue;
      const dd = Math.hypot(pillars[i].x - pillars[j].x, pillars[i].z - pillars[j].z);
      if (dd > TILE * 2.5 && dd < TILE * 9 && dd < bd) { bd = dd; best = j; }
    }
    if (best < 0) continue;
    used.add(`${Math.min(i, best)}:${Math.max(i, best)}`);
    const a = pillars[i], b = pillars[best];
    const ya = a.h * 0.86, yb = b.h * 0.86;
    const sag = 0.6 + bd * 0.06;
    const pts = [];
    for (let k = 0; k <= 6; k++) { const t = k / 6; pts.push([a.x + (b.x - a.x) * t, ya + (yb - ya) * t - Math.sin(Math.PI * t) * sag, a.z + (b.z - a.z) * t]); }
    cables.push(tube(pts, 0.035, 10, 4));
    if (cables.length >= Math.round(24 * density)) break;
  }
  let cableMesh = null;
  if (cables.length) {
    const merged = own(mergeGeometries(cables, false));
    for (const c of cables) c.dispose();
    cableMesh = new THREE.Mesh(merged, own(new THREE.MeshStandardMaterial({ color: 0x0c1014, roughness: 0.5, metalness: 0.6, emissive: look.accent2, emissiveIntensity: 0.12 })));
    group.add(cableMesh);
  }

  // ── placas holográficas (atlas 2×2) no alto de alguns pilares, viradas para dentro ──
  const atlas = own(holoAtlas());
  const holoMat = own(new THREE.MeshBasicMaterial({ map: atlas, color: new THREE.Color(look.accent).multiplyScalar(1.3), transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  const holoGeo = own(new THREE.PlaneGeometry(2.2, 1.1));
  // uv por instância via 4 geometrias? → mais simples: 4 InstancedMesh pequenos não; usamos offset por grupo (4 sub-meshes)
  const holoSets = [[], [], [], []];
  pillars.forEach((p, i) => { if (i % 3 === 1) holoSets[i % 4].push(p); });
  const cx = (W * TILE) / 2, cz = (Hh * TILE) / 2;
  let holoCount = 0;
  holoSets.forEach((set, k) => {
    if (!set.length) return;
    const g = holoGeo.clone();
    const uv = g.attributes.uv;
    const ox = (k % 2) * 0.5, oy = k < 2 ? 0.5 : 0;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, ox + uv.getX(i) * 0.5, oy + uv.getY(i) * 0.5);
    own(g);
    const im = new THREE.InstancedMesh(g, holoMat, set.length);
    set.forEach((p, i) => {
      d.position.set(p.x + Math.sign(cx - p.x) * 0.2, p.h * 0.66, p.z + Math.sign(cz - p.z) * 0.2);
      d.rotation.set(0, Math.atan2(cx - p.x, cz - p.z), 0); d.scale.set(1, 1, 1); d.updateMatrix(); im.setMatrixAt(i, d.matrix);
    });
    im.instanceMatrix.needsUpdate = true;
    im.name = 'holo';
    group.add(im);
    holoCount += set.length;
  });

  // ── selos rúnicos no chão (pontos de entrada das ondas + centro de cada área) ──
  const seals = [];
  for (const sp of zone.spawnPoints || []) seals.push([sp.x + 0.5, sp.y + 0.5, 1.6]);
  seals.push([W * 0.22, Hh / 2, 3.2]);
  if (zone.lair) seals.push([(zone.lair.x0 + zone.lair.x1 + 1) / 2, (zone.lair.y0 + zone.lair.y1 + 1) / 2, 4.2]);
  else seals.push([W / 2, Hh / 2, 3.6]);
  const sealMat = own(new THREE.MeshBasicMaterial({ map: decalTex(), color: new THREE.Color(look.accent).multiplyScalar(0.9), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2 }));
  const sealGeo = own(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
  const imSeal = new THREE.InstancedMesh(sealGeo, sealMat, seals.length);
  seals.forEach(([sx, sz, r], i) => { d.position.set(sx * TILE, 0.025, sz * TILE); d.rotation.set(0, i * 0.4, 0); d.scale.set(r * 2 * TILE, 1, r * 2 * TILE); d.updateMatrix(); imSeal.setMatrixAt(i, d.matrix); });
  imSeal.instanceMatrix.needsUpdate = true;
  imSeal.renderOrder = 1;
  group.add(imSeal);

  // ── CHÃO MOLHADO (truque barato, sem espelho em tempo real): faixas de reflexo das luzes ──
  // cada luz (cristal do pilar / placa holo) ganha uma faixa aditiva deitada no chão que se estica
  // do pé da luz NA DIREÇÃO DA CÂMERA — como reflexo em asfalto molhado. 1 InstancedMesh, ~N matrizes/quadro.
  let refl = null; const reflSrc = [];
  if (look.reflections !== false) {
    pillars.forEach((p, i) => reflSrc.push({ x: p.x + Math.sign(cx - p.x) * 0.35, z: p.z + Math.sign(cz - p.z) * 0.35, c: i % 3 === 1 ? look.accent : (i % 2 ? look.accent2 : look.accent), w: 0.55, L: 3.4 + (i % 3) * 0.6 }));
    for (const [sx, sz, r] of seals) reflSrc.push({ x: sx * TILE, z: sz * TILE, c: look.accent, w: r * 0.9, L: r * 1.6 });
    const n = Math.min(reflSrc.length, look.maxReflections ?? 48);
    reflSrc.length = n;
    const rc = document.createElement('canvas'); rc.width = 32; rc.height = 128;
    const rg = rc.getContext('2d');
    const gy = rg.createLinearGradient(0, 0, 0, 128); gy.addColorStop(0, 'rgba(255,255,255,1)'); gy.addColorStop(0.25, 'rgba(255,255,255,0.55)'); gy.addColorStop(1, 'rgba(255,255,255,0)');
    rg.fillStyle = gy; rg.fillRect(0, 0, 32, 128);
    const gx = rg.createLinearGradient(0, 0, 32, 0); gx.addColorStop(0, 'rgba(0,0,0,1)'); gx.addColorStop(0.5, 'rgba(0,0,0,0)'); gx.addColorStop(1, 'rgba(0,0,0,1)');
    rg.globalCompositeOperation = 'destination-out'; rg.fillStyle = gx; rg.fillRect(0, 0, 32, 128);
    // estrias horizontais (ondulação da água)
    rg.globalCompositeOperation = 'destination-out'; rg.fillStyle = 'rgba(0,0,0,0.35)';
    for (let y = 6; y < 128; y += 9) rg.fillRect(0, y, 32, 2);
    const rtex = own(new THREE.CanvasTexture(rc)); rtex.colorSpace = THREE.SRGBColorSpace;
    const rgeo = own(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5)); // comprimento ao longo de +Z
    const rmat = own(new THREE.MeshBasicMaterial({ map: rtex, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3, fog: true }));
    refl = new THREE.InstancedMesh(rgeo, rmat, n);
    refl.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    const col = new THREE.Color();
    reflSrc.forEach((r, i) => { col.setHex(r.c); refl.instanceColor.setXYZ(i, col.r, col.g, col.b); });
    refl.frustumCulled = false; refl.renderOrder = 2; refl.name = 'wet-reflections';
    group.add(refl);
  }

  // ── DRAGÃO AO LONGE (silhueta voando sobre a cidade, como na arte de referência) ──
  let skyDragon = null;
  if (look.skyDragon !== false) {
    skyDragon = new THREE.Group(); skyDragon.name = 'sky-dragon';
    const dark = own(new THREE.MeshBasicMaterial({ color: 0x050b18, fog: false }));
    const glow = own(new THREE.MeshBasicMaterial({ color: new THREE.Color(look.dragonGlow ?? 0x3aa8ff), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    const body = new THREE.Mesh(own(new THREE.SphereGeometry(1, 10, 6)), dark); body.scale.set(0.75, 0.6, 2.4); skyDragon.add(body);
    const neck = new THREE.Mesh(own(new THREE.ConeGeometry(0.42, 2.6, 6).rotateX(Math.PI / 2)), dark); neck.position.set(0, 0.45, 2.9); neck.rotation.x = -0.35; skyDragon.add(neck);
    const head = new THREE.Mesh(own(new THREE.ConeGeometry(0.38, 1.3, 5).rotateX(Math.PI / 2)), dark); head.position.set(0, 0.95, 4.35); skyDragon.add(head);
    const eye = new THREE.Mesh(own(new THREE.SphereGeometry(0.12, 6, 4)), glow); eye.position.set(0, 1.08, 4.4); skyDragon.add(eye);
    const tail = new THREE.Mesh(own(new THREE.ConeGeometry(0.4, 5.5, 5).rotateX(-Math.PI / 2)), dark); tail.position.set(0, -0.1, -4.6); skyDragon.add(tail);
    const core = new THREE.Mesh(own(new THREE.SphereGeometry(0.32, 8, 6)), glow); core.position.set(0, -0.25, 0.9); skyDragon.add(core);
    // asas: membrana (triângulos em leque) + bordas brilhantes
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, 0); wingShape.lineTo(2.2, 1.4); wingShape.lineTo(5.4, 2.1); wingShape.lineTo(8.2, 0.6);
    wingShape.lineTo(6.6, -0.4); wingShape.lineTo(5.6, -1.6); wingShape.lineTo(4.0, -0.9); wingShape.lineTo(3.0, -2.2); wingShape.lineTo(1.6, -1.2); wingShape.lineTo(0, -1.4);
    const wg = own(new THREE.ShapeGeometry(wingShape).rotateX(-Math.PI / 2));
    const memb = own(new THREE.MeshBasicMaterial({ color: 0x0a1a34, side: THREE.DoubleSide, fog: false }));
    const edgePts = [[0, 0], [2.2, 1.4], [5.4, 2.1], [8.2, 0.6], [6.6, -0.4], [5.6, -1.6], [4.0, -0.9], [3.0, -2.2], [1.6, -1.2], [0, -1.4]];
    const ev = []; for (let k = 0; k < edgePts.length - 1; k++) { ev.push(edgePts[k][0], 0, -edgePts[k][1], edgePts[k + 1][0], 0, -edgePts[k + 1][1]); }
    for (const k of [[2.2, 1.4], [5.4, 2.1], [8.2, 0.6]]) ev.push(0, 0, 0, k[0], 0, -k[1]);
    const eg = own(new THREE.BufferGeometry()); eg.setAttribute('position', new THREE.Float32BufferAttribute(ev, 3));
    const lmat = own(new THREE.LineBasicMaterial({ color: new THREE.Color(look.dragonGlow ?? 0x3aa8ff), transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, fog: false }));
    const wings = [];
    for (const sx of [-1, 1]) {
      const w = new THREE.Group(); w.position.set(sx * 0.5, 0.35, 0.6); w.scale.x = sx;
      w.add(new THREE.Mesh(wg, memb)); w.add(new THREE.LineSegments(eg, lmat));
      skyDragon.add(w); wings.push(w);
    }
    skyDragon.userData.wings = wings;
    skyDragon.scale.setScalar(look.dragonScale ?? 1.6);
    skyDragon.renderOrder = -1;
    group.add(skyDragon);
  }
  const reflDummy = new THREE.Object3D();

  let t = 0;
  function update(dt, camPos) {
    t += dt;
    if (refl && camPos) {
      for (let i = 0; i < reflSrc.length; i++) {
        const r = reflSrc[i];
        const dx = camPos.x - r.x, dz = camPos.z - r.z;
        const d = Math.hypot(dx, dz) || 1;
        const L = Math.min(r.L * (0.7 + 0.12 * d / 4), d * 0.85);
        reflDummy.position.set(r.x, 0.03, r.z);
        reflDummy.rotation.set(0, Math.atan2(dx, dz), 0);
        reflDummy.scale.set(r.w * (1 + 0.08 * Math.sin(t * 3 + i)), 1, L);
        reflDummy.updateMatrix();
        refl.setMatrixAt(i, reflDummy.matrix);
      }
      refl.instanceMatrix.needsUpdate = true;
      refl.material.opacity = 0.42 + 0.06 * Math.sin(t * 1.7);
    }
    if (skyDragon) {
      // voo em elipse larga por cima da cidade, com subida/descida e batida de asas
      const R = Math.max(W, Hh) * TILE * 0.75, a = t * 0.07;
      const x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R * 0.55, y = 17 + Math.sin(t * 0.4) * 2.5;
      const nx = cx + Math.cos(a + 0.05) * R, nz = cz + Math.sin(a + 0.05) * R * 0.55;
      skyDragon.position.set(x, y, z);
      skyDragon.rotation.set(Math.sin(t * 0.4) * 0.12, Math.atan2(nx - x, nz - z), Math.sin(a) * 0.25);
      const flap = Math.sin(t * 2.6);
      skyDragon.userData.wings.forEach((w) => { w.rotation.z = flap * 0.55 * Math.sign(w.scale.x); });
    }
    // pulso suave das runas (1 uniform de cor — sem custo por instância)
    runeMat.opacity = 0.62 + 0.22 * Math.sin(t * 2.2);
    sealMat.opacity = 0.42 + 0.14 * Math.sin(t * 1.3);
    holoMat.opacity = 0.7 + 0.12 * Math.sin(t * 9.0) * Math.sin(t * 2.7);
  }
  return {
    group, update,
    stats: { pillars: pillars.length, cables: cables.length, holos: holoCount, seals: seals.length, reflections: refl ? reflSrc.length : 0, skyDragon: !!skyDragon, drawCalls: group.children.length + (skyDragon ? skyDragon.children.length + 4 : 0) },
    dispose() { for (const o of disposables) o.dispose?.(); }
  };
}
