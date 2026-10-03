/**
 * EVO (gráficos) — kit procedural de criaturas/cenário, tudo em código e barato no celular.
 *
 *  - Texturas compartilhadas geradas em <canvas> UMA vez (sem download):
 *      panelTex()  → placas de armadura/escamas com costuras, rebites e desgaste (map / roughness)
 *      circuitTex()→ linhas de NEXA (circuitos + runas) em preto → usado como emissiveMap
 *      floorTex()  → piso hexagonal/placas com sujeira e frisos (chão do Campo/Arena)
 *      decalTex()  → selo rúnico circular (decal no chão, sprite/plano aditivo)
 *      skyTex()    → gradiente de céu vertical (fundo da cena, sem luz extra)
 *  - Geometrias orgânicas: lathe (tronco/cabeça), cápsulas (membros), tubos (cauda/cabos),
 *    membrana de asa (ShapeGeometry), placas de escama instanciadas.
 *  - "Sombreamento assado": gradiente vertical por vértice (AO de pés → topo) via atributo color.
 *
 * Nada aqui cria luzes, nem mexe em bloom/resolução. Materiais são MeshStandard (mesmo programa
 * dos existentes + variantes map/emissiveMap compiladas 1×).
 */
import * as THREE from 'three';

const cache = {};
function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function tex(c, repeat = 1, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 2;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
// gerador determinístico (mesma textura sempre → screenshots comparáveis)
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

/** Placas de armadura: base clara (multiplica a cor do material), costuras escuras, rebites, arranhões. */
export function panelTex() {
  if (cache.panel) return cache.panel;
  const [c, x] = canvas(256, 256);
  const r = rng(7);
  x.fillStyle = '#d8d8d8'; x.fillRect(0, 0, 256, 256);
  // variação de tom por placa
  const cells = [[0, 0, 128, 96], [128, 0, 128, 64], [128, 64, 128, 96], [0, 96, 80, 160], [80, 96, 48, 80], [80, 176, 48, 80], [128, 160, 128, 96]];
  for (const [px, py, w, h] of cells) {
    const v = 200 + Math.floor(r() * 50);
    const g = x.createLinearGradient(px, py, px, py + h);
    g.addColorStop(0, `rgb(${v + 10},${v + 10},${v + 12})`); g.addColorStop(1, `rgb(${v - 30},${v - 30},${v - 26})`);
    x.fillStyle = g; x.fillRect(px + 2, py + 2, w - 4, h - 4);
    // costura
    x.strokeStyle = 'rgba(20,22,28,0.85)'; x.lineWidth = 3; x.strokeRect(px + 1.5, py + 1.5, w - 3, h - 3);
    x.strokeStyle = 'rgba(255,255,255,0.35)'; x.lineWidth = 1; x.beginPath(); x.moveTo(px + 4, py + 4.5); x.lineTo(px + w - 4, py + 4.5); x.stroke();
    // rebites
    x.fillStyle = 'rgba(40,40,46,0.9)';
    for (const [rx, ry] of [[6, 7], [w - 7, 7], [6, h - 7], [w - 7, h - 7]]) { x.beginPath(); x.arc(px + rx, py + ry, 2.2, 0, Math.PI * 2); x.fill(); }
  }
  // arranhões/desgaste
  for (let i = 0; i < 70; i++) {
    x.strokeStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},${0.08 + r() * 0.15})`;
    x.lineWidth = 0.6 + r();
    const sx = r() * 256, sy = r() * 256, a = r() * Math.PI, l = 4 + r() * 18;
    x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx + Math.cos(a) * l, sy + Math.sin(a) * l); x.stroke();
  }
  cache.panel = tex(c, 1);
  return cache.panel;
}

/** Linhas de Nexa (circuitos + runas) em fundo preto → emissiveMap (só as linhas brilham). */
export function circuitTex() {
  if (cache.circuit) return cache.circuit;
  const [c, x] = canvas(256, 256);
  const r = rng(29);
  x.fillStyle = '#000'; x.fillRect(0, 0, 256, 256);
  x.lineCap = 'round'; x.lineJoin = 'round';
  for (let i = 0; i < 22; i++) {
    let px = Math.floor(r() * 16) * 16, py = Math.floor(r() * 16) * 16;
    x.strokeStyle = `rgba(255,255,255,${0.55 + r() * 0.45})`;
    x.lineWidth = r() < 0.25 ? 2.4 : 1.4;
    x.beginPath(); x.moveTo(px, py);
    const steps = 3 + Math.floor(r() * 4);
    for (let k = 0; k < steps; k++) {
      const d = r();
      if (d < 0.4) px += (r() < 0.5 ? -1 : 1) * 16 * (1 + Math.floor(r() * 3));
      else if (d < 0.8) py += (r() < 0.5 ? -1 : 1) * 16 * (1 + Math.floor(r() * 3));
      else { const s = (r() < 0.5 ? -1 : 1) * 16; px += s; py += s; }
      x.lineTo(px, py);
    }
    x.stroke();
    x.fillStyle = '#fff'; x.beginPath(); x.arc(px, py, 2.6, 0, Math.PI * 2); x.fill();
  }
  // runas pequenas (magia + tecnologia de 2847)
  x.strokeStyle = 'rgba(255,255,255,0.9)'; x.lineWidth = 1.3;
  for (let i = 0; i < 6; i++) {
    const cx = 20 + r() * 216, cy = 20 + r() * 216, s = 6 + r() * 5;
    x.beginPath(); x.arc(cx, cy, s, 0, Math.PI * 2); x.stroke();
    x.beginPath(); x.moveTo(cx - s * 0.6, cy + s * 0.4); x.lineTo(cx, cy - s * 0.7); x.lineTo(cx + s * 0.6, cy + s * 0.4); x.stroke();
  }
  cache.circuit = tex(c, 1);
  return cache.circuit;
}

/** Piso: placas hexagonais metálicas com sujeira, frisos e trilhas de Nexa (linhas claras, cor via material). */
export function floorTex() {
  if (cache.floor) return cache.floor;
  const [c, x] = canvas(512, 512);
  const r = rng(101);
  x.fillStyle = '#5a5e66'; x.fillRect(0, 0, 512, 512);
  const R = 32, H = Math.sqrt(3) * R;
  for (let row = -1; row < 512 / H + 2; row++) {
    for (let col = -1; col < 512 / (R * 1.5) + 2; col++) {
      const cx = col * R * 1.5, cy = row * H + (col % 2 ? H / 2 : 0);
      const v = 70 + Math.floor(r() * 46);
      x.beginPath();
      for (let k = 0; k < 6; k++) { const a = (Math.PI / 3) * k; x.lineTo(cx + Math.cos(a) * (R - 2), cy + Math.sin(a) * (R - 2)); }
      x.closePath();
      const g = x.createRadialGradient(cx - 6, cy - 8, 2, cx, cy, R);
      g.addColorStop(0, `rgb(${v + 26},${v + 28},${v + 34})`); g.addColorStop(1, `rgb(${v - 12},${v - 10},${v - 6})`);
      x.fillStyle = g; x.fill();
      x.strokeStyle = 'rgba(12,14,18,0.9)'; x.lineWidth = 3; x.stroke();
      if (r() < 0.18) { x.strokeStyle = 'rgba(210,250,255,0.75)'; x.lineWidth = 1.6; x.beginPath(); x.arc(cx, cy, R * 0.42, 0, Math.PI * 2); x.stroke(); }
    }
  }
  // sujeira / manchas
  for (let i = 0; i < 40; i++) {
    const g = x.createRadialGradient(0, 0, 0, 0, 0, 1);
    const sx = r() * 512, sy = r() * 512, s = 18 + r() * 60;
    x.save(); x.translate(sx, sy); x.scale(s, s * (0.5 + r() * 0.6));
    g.addColorStop(0, 'rgba(10,12,10,0.35)'); g.addColorStop(1, 'rgba(10,12,10,0)');
    x.fillStyle = g; x.beginPath(); x.arc(0, 0, 1, 0, Math.PI * 2); x.fill(); x.restore();
  }
  cache.floor = tex(c, 1);
  return cache.floor;
}

/** Selo rúnico circular (decal) — branco em transparente; cor pelo material (aditivo). */
export function decalTex() {
  if (cache.decal) return cache.decal;
  const [c, x] = canvas(256, 256);
  x.clearRect(0, 0, 256, 256);
  x.translate(128, 128);
  x.strokeStyle = '#fff'; x.fillStyle = '#fff';
  x.globalAlpha = 0.9; x.lineWidth = 3; x.beginPath(); x.arc(0, 0, 118, 0, Math.PI * 2); x.stroke();
  x.lineWidth = 1.5; x.beginPath(); x.arc(0, 0, 104, 0, Math.PI * 2); x.stroke();
  x.globalAlpha = 0.75;
  for (let k = 0; k < 24; k++) { x.save(); x.rotate((Math.PI * 2 * k) / 24); x.fillRect(-1.5, -116, 3, k % 3 ? 8 : 14); x.restore(); }
  x.lineWidth = 2;
  for (let k = 0; k < 3; k++) { x.save(); x.rotate((Math.PI * 2 * k) / 3); x.beginPath(); x.moveTo(0, -96); x.lineTo(83, 48); x.stroke(); x.restore(); }
  x.beginPath(); x.arc(0, 0, 40, 0, Math.PI * 2); x.stroke();
  for (let k = 0; k < 6; k++) { x.save(); x.rotate((Math.PI * 2 * k) / 6); x.beginPath(); x.arc(0, -70, 9, 0, Math.PI * 2); x.stroke(); x.restore(); }
  x.globalAlpha = 0.4; x.beginPath(); x.arc(0, 0, 18, 0, Math.PI * 2); x.fill();
  cache.decal = tex(c, 1);
  return cache.decal;
}

/** Gradiente de céu (fundo da cena): topo escuro → horizonte na cor da zona (+ névoa clara). */
export function skyTex(top = '#03060e', mid = '#0b1830', horizon = '#1d3a4a') {
  const k = `sky:${top}${mid}${horizon}`;
  if (cache[k]) return cache[k];
  const [c, x] = canvas(4, 256);
  const g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, top); g.addColorStop(0.55, mid); g.addColorStop(0.86, horizon); g.addColorStop(1, horizon);
  x.fillStyle = g; x.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  cache[k] = t;
  return t;
}

/** AO assado por vértice: escurece de baixo (pés/ventre) para cima. Requer material.vertexColors. */
export function bakeGradient(geo, y0, y1, low = 0.55, high = 1.0) {
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(1, Math.max(0, (pos.getY(i) - y0) / (y1 - y0 || 1)));
    const v = low + (high - low) * t;
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

/** Tronco/cabeça orgânico por perfil [raio, altura] (LatheGeometry, achatável em Z pelo chamador). */
/** Detalhe geométrico por nível (high 1 · medium 0.75 · low 0.5): só reduz segmentos, mesma silhueta. */
let DETAIL = 1;
export function setKitDetail(f) { DETAIL = Math.max(0.4, Math.min(1, +f || 1)); }
const segOf = (n, min) => Math.max(min, Math.round(n * DETAIL));
export function lathe(profile, segs = 10) {
  return new THREE.LatheGeometry(profile.map(([rr, y]) => new THREE.Vector2(rr, y)), segOf(segs, 6));
}
/** Cápsula de membro (comprimento total len, origem no topo → pendura para baixo, bom para pivôs). */
export function limb(radius, len, radial = 8) {
  const g = new THREE.CapsuleGeometry(radius, Math.max(0.01, len - radius * 2), DETAIL < 0.9 ? 2 : 3, segOf(radial, 5));
  g.translate(0, -len / 2, 0);
  return g;
}
/** Membrana de asa: contorno com "dedos" (ShapeGeometry plana, dupla face no material). */
export function wingMembrane(span = 1, depth = 0.6, fingers = 4) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(span, depth * 0.15);
  for (let i = fingers; i >= 1; i--) {
    const fx = (span * i) / fingers;
    const fy = -depth * (0.55 + 0.45 * (i / fingers));
    const px = span * (i - 0.5) / fingers;
    s.lineTo(fx, fy);
    s.quadraticCurveTo(px + span * 0.05 / fingers, fy * 0.55, px - span * 0.25 / fingers, fy * 0.9);
  }
  s.lineTo(0, -depth * 0.35);
  s.lineTo(0, 0);
  return new THREE.ShapeGeometry(s, 3);
}
/** Tubo ao longo de pontos (cauda, cabos pendurados). */
export function tube(points, radius = 0.05, segs = 16, radial = 6, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
  return new THREE.TubeGeometry(curve, segOf(segs, 6), radius, segOf(radial, 4), closed);
}
/** Textura pronta para materiais de criatura: map de placas + emissiveMap de circuitos. */
export function creatureMaps(scale = 1) {
  const k = `cm:${scale}`;
  if (cache[k]) return cache[k];
  const p = panelTex().clone(); p.repeat.set(scale, scale); p.needsUpdate = true;
  const e = circuitTex().clone(); e.repeat.set(scale, scale); e.needsUpdate = true;
  cache[k] = { map: p, emissiveMap: e };
  return cache[k];
}

/** Escamas sobrepostas (tons claros → multiplicam a cor do material) com borda escura em cada escama. */
export function scaleTex() {
  if (cache.scale) return cache.scale;
  const [c, x] = canvas(256, 256);
  const r = rng(55);
  x.fillStyle = '#9a9a9a'; x.fillRect(0, 0, 256, 256);
  const S = 22;
  for (let row = -1; row < 256 / (S * 0.62) + 2; row++) {
    for (let col = -1; col < 256 / S + 2; col++) {
      const cx = col * S + (row % 2 ? S / 2 : 0), cy = row * S * 0.62;
      const v = 165 + Math.floor(r() * 70);
      const g = x.createRadialGradient(cx, cy - S * 0.15, 1, cx, cy, S * 0.62);
      g.addColorStop(0, `rgb(${v},${v},${v})`); g.addColorStop(0.75, `rgb(${v - 50},${v - 50},${v - 50})`); g.addColorStop(1, 'rgb(40,40,40)');
      x.fillStyle = g;
      x.beginPath(); x.moveTo(cx - S / 2, cy); x.quadraticCurveTo(cx - S / 2, cy + S * 0.7, cx, cy + S * 0.78); x.quadraticCurveTo(cx + S / 2, cy + S * 0.7, cx + S / 2, cy); x.closePath(); x.fill();
      x.strokeStyle = 'rgba(15,15,15,0.7)'; x.lineWidth = 1.3; x.stroke();
    }
  }
  cache.scale = tex(c, 3);
  return cache.scale;
}
/** Emissivo colorido: base escura (cor própria, mantém o corpo legível no escuro) + veias/circuitos brilhantes. */
export function veinEmissiveTex(base = '#0b260f', line = '#5dff6a', seed = 77) {
  const k = `vein:${base}${line}${seed}`;
  if (cache[k]) return cache[k];
  const [c, x] = canvas(256, 256);
  const r = rng(seed);
  x.fillStyle = base; x.fillRect(0, 0, 256, 256);
  x.strokeStyle = line; x.lineCap = 'round'; x.shadowColor = line; x.shadowBlur = 4;
  // veias orgânicas (ramificadas) + alguns traços retos de circuito
  for (let i = 0; i < 9; i++) {
    let px = r() * 256, py = r() * 256, a = r() * Math.PI * 2;
    x.lineWidth = 1.2 + r() * 1.6;
    x.beginPath(); x.moveTo(px, py);
    for (let k2 = 0; k2 < 14; k2++) { a += (r() - 0.5) * 0.9; px += Math.cos(a) * 9; py += Math.sin(a) * 9; x.lineTo(px, py); }
    x.stroke();
  }
  x.lineWidth = 1.4;
  for (let i = 0; i < 8; i++) {
    let px = Math.floor(r() * 16) * 16, py = Math.floor(r() * 16) * 16;
    x.beginPath(); x.moveTo(px, py);
    for (let k2 = 0; k2 < 3; k2++) { if (r() < 0.5) px += 32 * (r() < 0.5 ? -1 : 1); else py += 32 * (r() < 0.5 ? -1 : 1); x.lineTo(px, py); }
    x.stroke();
    x.fillStyle = line; x.beginPath(); x.arc(px, py, 2.5, 0, Math.PI * 2); x.fill();
  }
  cache[k] = tex(c, 1);
  return cache[k];
}
/** Membrana de asa: veias radiais a partir da raiz + gradiente translúcido (map de cor). */
export function membraneTex() {
  if (cache.membrane) return cache.membrane;
  const [c, x] = canvas(256, 256);
  const g = x.createLinearGradient(0, 0, 256, 0);
  g.addColorStop(0, '#9ab89c'); g.addColorStop(1, '#5a7a5e');
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  const r = rng(13);
  x.strokeStyle = 'rgba(20,40,22,0.75)';
  for (let i = 0; i < 26; i++) {
    let px = 0, py = 40 + r() * 180, a = (r() - 0.5) * 0.9;
    x.lineWidth = 2.2 - i * 0.05;
    x.beginPath(); x.moveTo(px, py);
    for (let k2 = 0; k2 < 18; k2++) { a += (r() - 0.5) * 0.25; px += Math.cos(a) * 15; py += Math.sin(a) * 15; x.lineTo(px, py); }
    x.stroke();
  }
  cache.membrane = tex(c, 1);
  return cache.membrane;
}

/**
 * Luz de recorte (FRESNEL) barata no próprio material: realça a silhueta na arena escura sem luz
 * nova nem bloom extra. Mesmo trecho de shader para todos → 1 variante de programa (cache key fixa).
 * mat.userData.rim = { color, strength, power } (uniforms vivos: mudar strength = flash de acerto).
 */
export function addRim(mat, color = 0x8ffcff, strength = 0.55, power = 2.6) {
  const u = { rimColor: { value: new THREE.Color(color) }, rimStrength: { value: strength }, rimPower: { value: power } };
  mat.userData.rim = u;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.rimColor = u.rimColor; sh.uniforms.rimStrength = u.rimStrength; sh.uniforms.rimPower = u.rimPower;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 rimColor; uniform float rimStrength; uniform float rimPower;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n{ float rimF = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), rimPower); totalEmissiveRadiance += rimColor * (rimF * rimStrength); }');
  };
  mat.customProgramCacheKey = () => 'nx-rim-v1';
  return mat;
}
