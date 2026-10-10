/**
 * NEXARA — modelo PROCEDURAL do MINI DRAGÃO (o mesmo do companheiro do herói), reutilizável:
 * dragon-view.js (companheiro do jogador) e os FILHOTES (BB) dos rivais usam ESTE construtor → mesma forma, tamanho e animação;
 * só a paleta (paintMini) e as habilidades mudam. (20261010ajustes)
 */
import * as THREE from 'three';

const BLUE = 0x49c6ff;

export function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(160,225,255,0.85)');
  gr.addColorStop(0.6, 'rgba(60,140,255,0.28)');
  gr.addColorStop(1, 'rgba(20,60,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Membrana de asa de morcego (plano XZ, ponta em +X). */
export function wingGeometry() {
  const pts = [
    [0, 0], [0.34, -0.12], [0.62, -0.02], [0.78, 0.26], [0.6, 0.2], [0.55, 0.44], [0.38, 0.3], [0.28, 0.46], [0.16, 0.3], [0.04, 0.36]
  ];
  const pos = [];
  for (let i = 1; i < pts.length - 1; i++) {
    pos.push(0, 0, 0, pts[i][0], 0, pts[i][1], pts[i + 1][0], 0, pts[i + 1][1]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** Monta as partes do dragão dentro de `model` (grupo vazio). Devolve materiais/partes animáveis. */
export function buildMiniModel(model, o = {}) {
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x173a6e, metalness: 0.88, roughness: 0.26, emissive: 0x061a3a, flatShading: true });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x0b1628, metalness: 0.9, roughness: 0.32, flatShading: true });
  const accentMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(BLUE).multiplyScalar(2.2) });
  const jointMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x5ab8ff).multiplyScalar(3) });
  const wingMat = new THREE.MeshStandardMaterial({ color: 0x2466c0, emissive: 0x0e3a88, emissiveIntensity: 0.9, metalness: 0.4, roughness: 0.45, side: THREE.DoubleSide, transparent: true, opacity: 0.82, flatShading: true });
  const mats = [bodyMat, darkMat, accentMat, wingMat, jointMat];
  const geos = [];
  const G = (g) => { geos.push(g); return g; };
  const add = (parent, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.scale.set(sx, sy, sz);
    parent.add(m);
    return m;
  };

  // —— corpo (frente = -Z) ——
  const sph = G(new THREE.IcosahedronGeometry(0.16, 1));
  const box = G(new THREE.BoxGeometry(1, 1, 1));
  const cone = G(new THREE.ConeGeometry(1, 1, 5));
  const cyl = G(new THREE.CylinderGeometry(1, 1, 1, 6));
  add(model, sph, bodyMat, 0, 0, 0, 0, 0, 0, 0.82, 0.74, 1.9);       // tronco (mais esguio)
  // placas dorsais mecânicas + juntas brilhando
  for (let i = 0; i < 4; i++) add(model, box, darkMat, 0, 0.11 - i * 0.006, -0.16 + i * 0.1, 0.12, 0, 0, 0.11 - i * 0.012, 0.03, 0.08);
  const jointGeo = G(new THREE.SphereGeometry(0.022, 8, 6));
  for (const [x, y, z] of [[0, 0.06, -0.26], [0.085, 0.08, -0.08], [-0.085, 0.08, -0.08], [0.07, -0.1, -0.12], [-0.07, -0.1, -0.12], [0.07, -0.1, 0.14], [-0.07, -0.1, 0.14], [0, 0.0, 0.26]]) add(model, jointGeo, jointMat, x, y, z);
  add(model, box, darkMat, 0, -0.07, -0.05, 0, 0, 0, 0.16, 0.08, 0.34); // placa do peito
  add(model, box, accentMat, 0.105, 0.0, 0, 0, 0, 0, 0.012, 0.03, 0.34);  // linhas neon laterais
  add(model, box, accentMat, -0.105, 0.0, 0, 0, 0, 0, 0.012, 0.03, 0.34);
  // crista dorsal
  for (let i = 0; i < 5; i++) add(model, cone, accentMat, 0, 0.15 - i * 0.008, -0.18 + i * 0.1, -0.5, 0, 0, 0.022, 0.07, 0.022);
  // pescoço
  add(model, cyl, bodyMat, 0, 0.07, -0.3, -0.9, 0, 0, 0.07, 0.2, 0.07);
  add(model, cyl, bodyMat, 0, 0.16, -0.42, -0.5, 0, 0, 0.06, 0.14, 0.06);
  // cabeça
  const head = new THREE.Group();
  head.position.set(0, 0.23, -0.5);
  model.add(head);
  add(head, box, bodyMat, 0, 0, 0, 0, 0, 0, 0.14, 0.1, 0.17);
  add(head, box, darkMat, 0, -0.015, -0.14, 0.08, 0, 0, 0.095, 0.06, 0.15); // focinho
  add(head, box, darkMat, 0, -0.06, -0.1, -0.12, 0, 0, 0.08, 0.025, 0.14);  // mandíbula
  add(head, cone, darkMat, 0.05, 0.07, 0.07, -2.3, 0, 0.25, 0.022, 0.2, 0.022); // chifres
  add(head, cone, darkMat, -0.05, 0.07, 0.07, -2.3, 0, -0.25, 0.022, 0.2, 0.022);
  const eyeGeo = G(new THREE.SphereGeometry(0.024, 8, 6));
  add(head, eyeGeo, jointMat, 0.062, 0.02, -0.05);
  add(head, eyeGeo, jointMat, -0.062, 0.02, -0.05);
  add(head, jointGeo, jointMat, 0, -0.02, 0.08); // junta do pescoço
  // ponto de brilho da boca (carga)
  const mouthGlow = add(head, G(new THREE.SphereGeometry(0.035, 8, 6)), accentMat, 0, -0.03, -0.23);
  const glowTex = o.glowTex || glowTexture();
  const spriteMat = (color, opacity = 1) => new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });
  const mouthHaloMat = spriteMat(0x7fd6ff, 0.9);
  const mouthHalo = new THREE.Sprite(mouthHaloMat);
  mouthHalo.position.copy(mouthGlow.position);
  mouthHalo.scale.setScalar(0.12);
  head.add(mouthHalo);
  // patas recolhidas
  for (const [x, z] of [[0.08, -0.12], [-0.08, -0.12], [0.08, 0.14], [-0.08, 0.14]]) add(model, box, darkMat, x, -0.13, z, 0.5, 0, 0, 0.04, 0.12, 0.05);
  // asas (pivô no ombro)
  const wGeo = G(wingGeometry());
  const wings = [];
  for (const side of [1, -1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.09, 0.1, -0.08);
    model.add(pivot);
    const w = new THREE.Group();
    w.scale.set(side * 1.05, 1, 1.05);
    pivot.add(w);
    add(w, wGeo, wingMat, 0, 0, 0);
    // longarinas neon (borda de ataque + dedos)
    add(w, box, accentMat, 0.17, 0.004, -0.06, 0, 0.34, 0, 0.36, 0.012, 0.014);
    add(w, box, accentMat, 0.48, 0.004, -0.07, 0, -0.33, 0, 0.3, 0.012, 0.014);
    add(w, box, darkMat, 0.5, 0.004, 0.15, 0, -1.2, 0, 0.3, 0.01, 0.012);
    add(w, box, darkMat, 0.4, 0.004, 0.18, 0, -1.75, 0, 0.3, 0.01, 0.012);
    add(w, box, darkMat, 0.25, 0.004, 0.2, 0, -2.2, 0, 0.3, 0.01, 0.012);
    wings.push({ pivot, side });
  }
  // cauda (cadeia de segmentos que ondula)
  const tail = [];
  let parent = model;
  let seg = 0.12;
  for (let i = 0; i < 7; i++) {
    const g = new THREE.Group();
    g.position.set(0, i === 0 ? -0.01 : 0, i === 0 ? 0.26 : seg);
    parent.add(g);
    const s = 1 - i * 0.12;
    add(g, box, i % 2 ? darkMat : bodyMat, 0, 0, seg / 2, 0, 0, 0, 0.075 * s, 0.06 * s, seg * 1.05);
    if (i % 2 === 0) add(g, cone, accentMat, 0, 0.035 * s, seg / 2, -0.6, 0, 0, 0.012, 0.04, 0.012);
    else add(g, jointGeo, jointMat, 0, 0, 0, 0, 0, 0, 0.8 * s, 0.8 * s, 0.8 * s);
    tail.push(g);
    parent = g;
  }
  add(parent, cone, accentMat, 0, 0, seg + 0.06, Math.PI / 2, 0, 0, 0.05, 0.14, 0.012); // lâmina da ponta
  return { bodyMat, darkMat, accentMat, wingMat, jointMat, mats, geos, G, head, mouthGlow, mouthHalo, mouthHaloMat, wings, tail, glowTex, spriteMat, add, box, cone, cyl, sph, jointGeo };
}

/** animação padrão (bater de asas + ondular da cauda) — igual à do companheiro */
export function animateMini(p, t, flapHz = 2.6) {
  const ph = t * flapHz * Math.PI * 2;
  for (const w of p.wings) w.pivot.rotation.z = w.side * (Math.sin(ph) * 0.62 + 0.12);
  for (let i = 0; i < p.tail.length; i++) {
    p.tail[i].rotation.y = Math.sin(t * 2.2 - i * 0.7) * 0.16;
    p.tail[i].rotation.x = 0.05 + Math.sin(t * 1.7 - i * 0.5) * 0.05;
  }
  return -Math.sin(ph) * 0.025; // deslocamento vertical do corpo
}

const hex = (h) => parseInt(String(h || '#ffffff').replace('#', ''), 16) || 0xffffff;
/** pinta com a paleta do filhote { base, escuro, brilho } ('#rrggbb'); sem paleta = azul original */
export function paintMini(p, pal) {
  const base = pal ? hex(pal.base) : 0x173a6e; const dark = pal ? hex(pal.escuro) : 0x0b1628; const glow = pal ? hex(pal.brilho) : BLUE;
  const c = (n) => new THREE.Color(n);
  p.bodyMat.color.copy(c(base).lerp(c(0x000000), pal ? 0.35 : 0)); p.bodyMat.emissive.copy(c(pal ? base : 0x061a3a).multiplyScalar(pal ? 0.22 : 1));
  p.darkMat.color.copy(c(dark).lerp(c(0x000000), pal ? 0.1 : 0));
  p.accentMat.color.copy(c(glow).multiplyScalar(2.2)); p.jointMat.color.copy(c(pal ? glow : 0x5ab8ff).multiplyScalar(3));
  p.wingMat.color.copy(c(pal ? base : 0x2466c0)); p.wingMat.emissive.copy(c(pal ? glow : 0x0e3a88).multiplyScalar(pal ? 0.35 : 1));
  if (p.mouthHalo?.material) p.mouthHalo.material.color.copy(c(pal ? glow : 0x7fd6ff));
}
