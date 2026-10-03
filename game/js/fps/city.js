/**
 * NEXARA — cenário urbano neon (Bloco V, só decoração): arranha-céus instanciados com janelas
 * emissivas, letreiros neon originais (NEXARA / G6 / E4 / runas — nenhuma marca real),
 * painéis holográficos, canos, cabos, vapor e luzes de topo. Tudo FORA dos tiles andáveis
 * ou sem colisão — o mapa / colisão / jogabilidade não mudam.
 * Acento por zona: G6 ferrugem/âmbar · E4 verde tóxico/ciano escuro · Arena ciano/magenta.
 */
import * as THREE from 'three';

export const ZONE_ACCENTS = {
  g6: { a: 0xffa040, b: 0xff5a2a, c: 0x39f0ff, sky: 0x0d1016, win: ['#ffb45a', '#ff7a3a', '#6fe8ff', '#ffd89a'] },
  e4: { a: 0x39ffb0, b: 0x2ad8ff, c: 0x9dff4a, sky: 0x070d0d, win: ['#5affc0', '#2ad8ff', '#b4ff6a', '#9ff'] },
  ar: { a: 0x39f0ff, b: 0xff3fb4, c: 0x8a6cff, sky: 0x090b14, win: ['#6ff6ff', '#ff5ec8', '#a08bff', '#e0f8ff'] },
  // EVO (referência do Caio): Campo de Ascensão = cidade neon NOTURNA azul/ciano/verde (antes caía na paleta laranja do G6)
  ca: { a: 0x39e8ff, b: 0x2cff9a, c: 0x3a6bff, hor: 0x2a6aff, horK: 0.045, sky: 0x02050c, win: ['#6ff0ff', '#4dffb0', '#7aa8ff', '#d8f6ff'] }
};

const SIGNS = {
  g6: ['NEXARA', 'G6', 'SUCATA', 'REPARO 24H', 'ᚾ◇ᛉ', 'NÚCLEO'],
  e4: ['NEXARA', 'E4', 'ZONA TÓXICA', 'ᛟ⟁ᚱ', 'FILTROS', 'NEXA'],
  ar: ['ARENA', 'NEXARA', 'COMBATE', '◇ᚾ◇', 'AR', 'TREINO'],
  ca: ['NEXARA', 'ASCENSÃO', '2847', '◇ᚾ◇', 'NEXA', 'PORTÃO']
};

let dotTex = null;
/** Ponto redondo suave (Points sem textura = quadrados). */
function dotTexture() {
  if (dotTex) return dotTex;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  dotTex = new THREE.CanvasTexture(cv);
  dotTex.colorSpace = THREE.SRGBColorSpace;
  return dotTex;
}

function rng(seed) { let r = seed >>> 0 || 1; return () => ((r = (r * 1664525 + 1013904223) >>> 0) / 4294967296); }

function windowTexture(colors, seed, lit = 0.34) {
  const W = 256, H = 512;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  c.fillStyle = '#05070a'; c.fillRect(0, 0, W, H);
  const r = rng(seed);
  // janelas pequenas em blocos de andares; maioria apagada, poucas com cor de acento
  for (let y = 6; y < H; y += 7) {
    const floorLit = r() < 0.55;
    for (let x = 4; x < W; x += 5) {
      if (floorLit && r() < lit) {
        const accent = r() < 0.25;
        c.fillStyle = accent ? colors[(r() * colors.length) | 0] : (r() < 0.5 ? '#c8d6e0' : '#e8c89a');
        c.globalAlpha = 0.25 + r() * 0.6;
        c.fillRect(x, y, 2, 3);
      }
    }
  }
  c.globalAlpha = 1;
  // faixas verticais de estrutura
  c.fillStyle = 'rgba(0,0,0,0.6)';
  for (let x = 0; x < W; x += 32) c.fillRect(x, 0, 2, H);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  return t;
}

function signTexture(text, color, sub = '') {
  const W = 512, H = 128;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  c.fillStyle = 'rgba(0,0,0,0)'; c.fillRect(0, 0, W, H);
  c.strokeStyle = color; c.lineWidth = 6; c.globalAlpha = 0.9;
  c.strokeRect(8, 8, W - 16, H - 16);
  c.globalAlpha = 1;
  c.font = `bold ${text.length > 8 ? 58 : 76}px "Segoe UI", system-ui, sans-serif`;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.shadowColor = color; c.shadowBlur = 18;
  c.fillStyle = '#ffffff';
  c.fillText(text, W / 2, H / 2 + (sub ? -8 : 2));
  c.shadowBlur = 0;
  c.fillStyle = color;
  if (sub) { c.font = 'bold 22px system-ui'; c.fillText(sub, W / 2, H - 26); }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function holoTexture(color) {
  const W = 128, H = 128;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  c.fillStyle = 'rgba(0,0,0,0)'; c.fillRect(0, 0, W, H);
  c.strokeStyle = color; c.lineWidth = 2;
  c.strokeRect(4, 4, W - 8, H - 8);
  c.globalAlpha = 0.5;
  for (let y = 6; y < H; y += 4) { c.fillStyle = color; c.fillRect(6, y, W - 12, 1); }
  c.globalAlpha = 1;
  c.beginPath(); c.arc(W / 2, H / 2, 26, 0, Math.PI * 2); c.stroke();
  c.beginPath(); c.moveTo(W / 2, H / 2 - 34); c.lineTo(W / 2 + 22, H / 2 + 18); c.lineTo(W / 2 - 22, H / 2 + 18); c.closePath(); c.stroke();
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * @param {object} zone — zona do jogo (map.width/height em tiles)
 * @param {'g6'|'e4'|'ar'} key
 * @param {number} TILE — metros por tile
 * @param {(x:number,y:number)=>string} tileType
 * @param {{ density:number }} opts
 */
export function buildCity(zone, key, TILE, tileType, opts = {}) {
  const acc = ZONE_ACCENTS[key] || ZONE_ACCENTS.g6;
  const density = Math.max(0.2, Math.min(1, opts.density ?? 1));
  const group = new THREE.Group();
  group.name = 'city';
  const W = zone.map.width * TILE;
  const H = zone.map.height * TILE;
  const cx = W / 2, cz = H / 2;
  const r = rng(zone.map.width * 131 + zone.map.height * 7 + key.charCodeAt(0));
  const disposables = [];
  const anim = { holos: [], steam: null, blink: null, t: 0 };
  const hdr = (hex, k) => new THREE.Color(hex).multiplyScalar(k);

  // ── arranha-céus: 3 classes de altura (1 InstancedMesh cada) em anéis ao redor da zona ──
  const classes = [
    { h: [16, 28], rep: 1, n: Math.round(18 * density) },
    { h: [30, 50], rep: 2, n: Math.round(14 * density) },
    { h: [55, 95], rep: 3, n: Math.round(9 * density) }
  ];
  const dummy = new THREE.Object3D();
  classes.forEach((cl, ci) => {
    const tex = windowTexture(acc.win, 11 + ci * 17 + key.length, 0.22 + ci * 0.04);
    tex.repeat.set(1, cl.rep);
    const mat = new THREE.MeshStandardMaterial({ color: 0x0a0d12, roughness: 0.45, metalness: 0.7, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.95 });
    disposables.push(tex, mat);
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    disposables.push(geo);
    const im = new THREE.InstancedMesh(geo, mat, cl.n);
    const col = new THREE.Color();
    for (let i = 0; i < cl.n; i++) {
      const ang = r() * Math.PI * 2;
      const rad = Math.max(W, H) * 0.5 + 24 + ci * 20 + r() * 40;
      const x = cx + Math.cos(ang) * rad * (W >= H ? 1 : 0.8);
      const z = cz + Math.sin(ang) * rad * (H >= W ? 1 : 0.8);
      const h = cl.h[0] + r() * (cl.h[1] - cl.h[0]);
      const w = 7 + r() * 8;
      const d = 7 + r() * 8;
      dummy.position.set(x, -0.5, z);
      dummy.rotation.set(0, r() < 0.5 ? 0 : Math.PI / 2 * r() * 0.3, 0);
      dummy.scale.set(w, h, d);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
      im.setColorAt(i, col.setHSL(0, 0, 0.75 + r() * 0.5));
    }
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.name = `towers${ci}`;
    group.add(im);
  });

  // ── luzes piscando no topo (Points, 1 draw call) ──
  {
    const n = Math.round(30 * density);
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const ang = r() * Math.PI * 2;
      const rad = Math.max(W, H) * 0.5 + 14 + r() * 50;
      pos.set([cx + Math.cos(ang) * rad, 20 + r() * 60, cz + Math.sin(ang) * rad], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ color: hdr(0xff3030, 3), map: dotTexture(), size: 1.6, sizeAttenuation: true, transparent: true, depthWrite: false, fog: false });
    disposables.push(g, m);
    const pts = new THREE.Points(g, m);
    group.add(pts);
    anim.blink = m;
  }

  // ── letreiros neon (em cima das paredes do perímetro, virados para dentro) ──
  const signs = SIGNS[key] || SIGNS.g6;
  const signColors = [acc.a, acc.b, acc.c];
  const edges = [
    { x: cx, z: -0.2, ry: 0, len: W }, { x: cx, z: H + 0.2, ry: Math.PI, len: W },
    { x: -0.2, z: cz, ry: Math.PI / 2, len: H }, { x: W + 0.2, z: cz, ry: -Math.PI / 2, len: H }
  ];
  const nSigns = Math.max(3, Math.round(6 * density));
  for (let i = 0; i < nSigns; i++) {
    const e = edges[i % 4];
    const color = signColors[i % 3];
    const css = `#${new THREE.Color(color).getHexString()}`;
    const tex = signTexture(signs[i % signs.length], css, i % 2 ? '' : 'NEXARA · SETOR ' + zone.code);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, color: hdr(color, 1.6), side: THREE.DoubleSide, depthWrite: false, fog: false });
    disposables.push(tex, mat);
    const w = 4.2 + r() * 2;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), mat);
    disposables.push(sign.geometry);
    const along = (((i / 4) | 0) + 0.5) / Math.ceil(nSigns / 4) - 0.5;
    const off = along * e.len * 0.8;
    sign.position.set(e.x + (e.ry === 0 || e.ry === Math.PI ? off : 0), 4.2 + r() * 2.5, e.z + (e.ry === 0 || e.ry === Math.PI ? 0 : off));
    sign.rotation.y = e.ry;
    sign.name = 'neonSign';
    group.add(sign);
    // "reflexo" barato: faixa aditiva vertical no chão molhado abaixo do letreiro
    const refl = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.7, 3.2), new THREE.MeshBasicMaterial({ color: hdr(color, 0.6), transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }));
    disposables.push(refl.geometry, refl.material);
    refl.rotation.x = -Math.PI / 2;
    refl.rotation.z = e.ry;
    const inward = 2.2;
    refl.position.set(sign.position.x + Math.sin(e.ry) * inward, 0.025, sign.position.z + Math.cos(e.ry) * inward);
    group.add(refl);
  }

  // ── painéis holográficos flutuando sobre paredes (aditivos, piscam) ──
  const holoTexs = [holoTexture(`#${new THREE.Color(acc.a).getHexString()}`), holoTexture(`#${new THREE.Color(acc.b).getHexString()}`)];
  disposables.push(...holoTexs);
  const wallTiles = [];
  for (let y = 0; y < zone.map.height; y++) for (let x = 0; x < zone.map.width; x++) if (tileType(x, y) === 'wall') wallTiles.push([x, y]);
  const nHolo = Math.round(4 * density);
  for (let i = 0; i < nHolo && wallTiles.length; i++) {
    const [tx, ty] = wallTiles[(r() * wallTiles.length) | 0];
    const mat = new THREE.MeshBasicMaterial({ map: holoTexs[i % 2], transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, color: hdr(i % 2 ? acc.b : acc.a, 1.4) });
    disposables.push(mat);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), mat);
    disposables.push(m.geometry);
    m.position.set((tx + 0.5) * TILE, 3.6 + r(), (ty + 0.5) * TILE);
    m.rotation.y = r() * Math.PI;
    group.add(m);
    anim.holos.push({ m, mat, ph: r() * 10 });
  }

  // ── canos ao longo do topo das paredes do perímetro (InstancedMesh) ──
  {
    const seg = [];
    for (const [tx, ty] of wallTiles) {
      if (tx === 0 || ty === 0 || tx === zone.map.width - 1 || ty === zone.map.height - 1) seg.push([tx, ty]);
    }
    const geo = new THREE.CylinderGeometry(0.09, 0.09, TILE, 8);
    const mat = new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 0.35, metalness: 0.85 });
    disposables.push(geo, mat);
    const im = new THREE.InstancedMesh(geo, mat, seg.length * 2);
    let k = 0;
    for (const [tx, ty] of seg) {
      const horiz = ty === 0 || ty === zone.map.height - 1;
      for (let j = 0; j < 2; j++) {
        dummy.position.set((tx + 0.5) * TILE, 2.95 + j * 0.24, (ty + 0.5) * TILE + (horiz ? (j ? 0.25 : -0.2) : 0));
        if (!horiz) dummy.position.x += j ? 0.25 : -0.2;
        dummy.rotation.set(horiz ? 0 : Math.PI / 2, 0, horiz ? Math.PI / 2 : 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        im.setMatrixAt(k++, dummy.matrix);
      }
    }
    im.instanceMatrix.needsUpdate = true;
    im.name = 'pipes';
    group.add(im);
  }

  // ── cabos em catenária entre prédios e o topo das paredes (LineSegments, 1 draw call) ──
  {
    const pts = [];
    const nC = Math.round(10 * density);
    for (let i = 0; i < nC; i++) {
      const e = edges[i % 4];
      const t = r() - 0.5;
      const ax = e.x + (e.ry === 0 || e.ry === Math.PI ? t * e.len : 0);
      const az = e.z + (e.ry === 0 || e.ry === Math.PI ? 0 : t * e.len);
      const out = 12 + r() * 14;
      const bx = ax - Math.sin(e.ry) * out, bz = az - Math.cos(e.ry) * out;
      const ay = 3.1, by = 9 + r() * 10;
      const sag = 1.5 + r() * 2;
      let px = ax, py = ay, pz = az;
      for (let s = 1; s <= 10; s++) {
        const u = s / 10;
        const x = ax + (bx - ax) * u, z = az + (bz - az) * u;
        const y = ay + (by - ay) * u - Math.sin(u * Math.PI) * sag;
        pts.push(px, py, pz, x, y, z);
        px = x; py = y; pz = z;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const m = new THREE.LineBasicMaterial({ color: 0x05070a });
    disposables.push(g, m);
    group.add(new THREE.LineSegments(g, m));
  }

  // ── vapor subindo de respiros junto às paredes (Points, sobe e recicla) ──
  {
    const vents = [];
    for (let i = 0; i < Math.round(4 * density) && wallTiles.length; i++) vents.push(wallTiles[(r() * wallTiles.length) | 0]);
    const per = 14;
    const n = vents.length * per;
    const pos = new Float32Array(n * 3);
    const base = [];
    for (let v = 0; v < vents.length; v++) {
      for (let j = 0; j < per; j++) {
        const i = v * per + j;
        const bx = (vents[v][0] + 0.5) * TILE, bz = (vents[v][1] + 0.5) * TILE;
        base.push({ bx, bz, ph: j / per, i });
        pos.set([bx, 2.9, bz], i * 3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ color: 0x8aa0aa, map: dotTexture(), size: 2.2, transparent: true, opacity: 0.16, depthWrite: false, sizeAttenuation: true });
    disposables.push(g, m);
    const p = new THREE.Points(g, m);
    p.name = 'steam';
    group.add(p);
    anim.steam = { g, base };
  }

  // céu: gradiente vertical grande (sem textura externa)
  {
    const g = new THREE.SphereGeometry(180, 16, 8);
    const m = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { cTop: { value: new THREE.Color(acc.sky) }, cHor: { value: new THREE.Color(acc.hor ?? acc.b).multiplyScalar(acc.horK ?? 0.1).add(new THREE.Color(acc.sky)) } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 cTop; uniform vec3 cHor; varying vec3 vP; void main(){ float h = clamp(vP.y*1.6, 0.0, 1.0); gl_FragColor = vec4(mix(cHor, cTop, h), 1.0); }'
    });
    disposables.push(g, m);
    const sky = new THREE.Mesh(g, m);
    sky.position.set(cx, 0, cz);
    sky.renderOrder = -10;
    sky.name = 'sky';
    group.add(sky);
  }

  return {
    group,
    update(dt) {
      anim.t += dt;
      for (const h of anim.holos) h.mat.opacity = 0.4 + 0.2 * Math.sin(anim.t * 3 + h.ph) + (Math.sin(anim.t * 23 + h.ph) > 0.97 ? -0.3 : 0);
      if (anim.blink) anim.blink.opacity = 0.35 + 0.65 * (Math.sin(anim.t * 2.4) > 0 ? 1 : 0.2);
      if (anim.steam) {
        const a = anim.steam.g.attributes.position;
        for (const b of anim.steam.base) {
          const u = (anim.t * 0.35 + b.ph) % 1;
          a.setXYZ(b.i, b.bx + Math.sin(u * 6 + b.ph * 9) * 0.3 * u, 2.9 + u * 3.2, b.bz + Math.cos(u * 5 + b.ph * 7) * 0.3 * u);
        }
        a.needsUpdate = true;
      }
    },
    dispose() { for (const d of disposables) d.dispose?.(); }
  };
}
