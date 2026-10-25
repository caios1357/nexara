/**
 * NEXARA 20261025vfx — VFX PRÓPRIO DE CADA UM DOS 27 PODERES (herói e rivais usam o mesmo).
 * Pedido do Caio: "os poderes ficam feios na prática". Desempenho no celular:
 *  - tudo em POOLS de InstancedMesh (1 draw call por forma, ~10 no total), nada é criado/destruído por golpe;
 *  - partículas = quads aditivos virados para a câmera com textura suave; TETO global (low: 160 · high: 320);
 *  - rivais longe (> 16 tiles) não geram efeito; perto, a mesma função com orçamento menor (`src: 'rival'` → ×0,5 partículas).
 * Entrada em TILES (x,y do mapa); TILE=2 unidades de mundo.
 */
import * as THREE from 'three';

const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);
export const VAR_COR = { azul: 0x3a9cff, fogo: 0xff6a1a, raio: 0xfff27a, veneno: 0x6aff3a, terra: 0xd09858, vento: 0xbff6ff };

export function createPowerVfx({ scene, camera, TILE, groundAt, shake: shake0, low = false, clock = null }) {
  let shakeK = 1; let curA = 1; const shake = (n) => { if (shakeK > 0) shake0?.(n * shakeK); };
  const CAP_P = low ? 160 : 320;
  const now = clock || (() => performance.now()); // relógio do JOGO (heroFxNow): sincroniza com o dano e congela na pausa
  const stats = { casts: 0, byId: {}, peakP: 0, peakO: 0, hits: 0, capped: 0 };
  // —— textura suave (gerada uma vez) ——
  const tex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); return t; })();
  const mkIM = (geo, max, { additive = true, opacity = 1, map = null, order = 5, side = THREE.DoubleSide } = {}) => {
    const m = new THREE.MeshBasicMaterial({ color: 0xffffff, map, transparent: true, opacity, depthWrite: false, side, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    const im = new THREE.InstancedMesh(geo, m, max); im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    im.count = 0; im.visible = false; im.frustumCulled = false; im.renderOrder = order; im.name = 'pvfx'; scene.add(im); return im;
  };
  const G = {}; // geometrias
  G.quad = new THREE.PlaneGeometry(1, 1);
  G.blade = new THREE.RingGeometry(0.62, 1, 22, 1, -Math.PI * 0.42, Math.PI * 0.84); G.blade.rotateX(-Math.PI / 2); G.blade.rotateY(-Math.PI / 2); // crescente deitada (lâmina)
  G.ring = new THREE.RingGeometry(0.86, 1, 40); G.ring.rotateX(-Math.PI / 2);
  G.disc = new THREE.CircleGeometry(1, 28); G.disc.rotateX(-Math.PI / 2);
  G.arrow = new THREE.ConeGeometry(0.07, 1, 5); G.arrow.rotateX(Math.PI / 2); // ponta para +Z
  G.rock = new THREE.DodecahedronGeometry(0.5, 0);
  G.box = new THREE.BoxGeometry(1, 1, 1);
  G.wall = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true, -0.95, 1.9); // arco de escudo (frente = +Z)
  G.torus = new THREE.TorusGeometry(1, 0.06, 6, 36); G.torus.rotateX(Math.PI / 2);
  G.ghost = new THREE.CapsuleGeometry(0.32, 0.9, 3, 8);
  G.star = new THREE.CircleGeometry(1, 4); G.star.rotateX(-Math.PI / 2);
  const P = { // pools
    glow: mkIM(G.quad, CAP_P, { map: tex, order: 7 }), smoke: mkIM(G.quad, low ? 40 : 70, { map: tex, additive: true, opacity: 0.5, order: 6 }) /* aditivo: névoa clara (normal-blend saía preto) */,
    blade: mkIM(G.blade, 24), ring: mkIM(G.ring, 32, { order: 4 }), disc: mkIM(G.disc, 16, { opacity: 0.45, order: 3 }), arrow: mkIM(G.arrow, 64),
    rock: mkIM(G.rock, 40, { additive: false, order: 5, side: THREE.FrontSide }), beam: mkIM(G.box, 64), wall: mkIM(G.wall, 6, { opacity: 0.5 }),
    torus: mkIM(G.torus, 20), ghost: mkIM(G.ghost, 16, { opacity: 0.55 }), star: mkIM(G.star, 16), scorch: mkIM(G.disc, 12, { additive: false, opacity: 0.6, order: 2 })
  };
  for (const k in P) P[k].userData.key = k;
  const parts = []; const objs = []; const jobs = []; const free = [];
  const dummy = new THREE.Object3D(); const col = new THREE.Color(); const colB = new THREE.Color();
  const W = (t) => t * TILE; const GY = (x, y) => groundAt(x, y);
  // —— partículas ——
  function emit(n, o) {
    const k = o.k ?? 1; n = Math.max(1, Math.round(n * k));
    for (let i = 0; i < n; i++) {
      if (parts.length >= (o.smoke ? CAP_P + 70 : CAP_P)) { stats.capped++; return; }
      const a = rnd(0, TAU), sp = rnd(0, o.spread ?? 0.3), v = o.vel ?? 1;
      const p = free.pop() || {};
      p.smoke = !!o.smoke; p.x = W(o.x) + Math.sin(a) * W(sp); p.z = W(o.y) + Math.cos(a) * W(sp); p.y = GY(o.x, o.y) + (o.h ?? 1) + rnd(-(o.hj ?? 0.2), o.hj ?? 0.2);
      const dir = o.dir; // {x,y} em tiles (opcional) → jato
      p.vx = (dir ? dir.x * v : Math.sin(a) * v * rnd(0.3, 1)) + rnd(-0.4, 0.4) * (o.jit ?? 1); p.vz = (dir ? dir.y * v : Math.cos(a) * v * rnd(0.3, 1)) + rnd(-0.4, 0.4) * (o.jit ?? 1);
      p.vy = (o.up ?? 1) * rnd(0.5, 1.2); p.g = o.grav ?? 0; p.drag = o.drag ?? 1.5;
      p.s0 = (o.size ?? 0.5) * rnd(0.7, 1.2); p.s1 = o.size1 ?? p.s0 * 0.2; p.c = o.col; p.c2 = o.col2 ?? o.col;
      p.born = now(); p.life = (o.life ?? 600) * rnd(0.7, 1.2); p.inward = o.inward || null; p.swirl = o.swirl || 0;
      parts.push(p);
    }
  }
  // —— objetos (formas) ——
  function obj(pool, o) { const b = { pool, born: now(), life: 600, x: 0, y: 1, z: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1, c: 0xffffff, a: curA, fade: 'out', ...o }; objs.push(b); return b; }
  const at = (ms, fn) => jobs.push({ at: now() + ms, fn });
  const every = (ms, n, fn) => { for (let i = 0; i < n; i++) at(i * ms, () => fn(i)); };
  const wp = (x, y, h = 0) => ({ x: W(x), y: GY(x, y) + h, z: W(y) }); // mundo
  // —— peças reutilizáveis ——
  function burstAt(x, y, c, r = 1, k = 1, h = 1) { emit(14 * r, { x, y, h, col: c, col2: 0xffffff, vel: 4 * r, up: 2, grav: 6, size: 0.45, life: 420, k }); obj(P.ring, { ...wp(x, y, 0.08), c, life: 380, s0: 0.2, s1: W(r), grow: true }); }
  function shock(x, y, c, r, ms = 600) { obj(P.ring, { ...wp(x, y, 0.07), c, life: ms, s0: 0.3, s1: W(r), grow: true }); obj(P.disc, { ...wp(x, y, 0.05), c, life: ms * 0.7, s0: 0.3, s1: W(r) * 0.9, grow: true }); }
  function scorch(x, y, r, ms = 4000, c = 0x1a0d06) { obj(P.scorch, { ...wp(x, y, 0.035), c, life: ms, sx: W(r), sy: 1, sz: W(r), fade: 'late' }); }
  function pillar(x, y, c, h = 6, ms = 500, w = 0.35) { obj(P.beam, { ...wp(x, y, h / 2), c, life: ms, sx: w, sy: h, sz: w, fade: 'out', pulse: 0 }); }
  function streak(x0, y0, x1, y1, c, ms = 260, w = 0.12, h = 1.1) { const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 0.01; const m = wp((x0 + x1) / 2, (y0 + y1) / 2, h); obj(P.beam, { ...m, ry: Math.atan2(dx, dy), c, life: ms, sx: w, sy: w, sz: W(L) }); }
  function bolt(x0, y0, x1, y1, c, ms = 220, segs = 6) { let px = x0, py = y0; const nx = -(y1 - y0), ny = x1 - x0, L = Math.hypot(nx, ny) || 1; for (let i = 1; i <= segs; i++) { const t = i / segs; const j = i === segs ? 0 : rnd(-0.35, 0.35); const qx = x0 + (x1 - x0) * t + nx / L * j, qy = y0 + (y1 - y0) * t + ny / L * j; streak(px, py, qx, qy, c, ms, 0.07, 1.2 + rnd(-0.2, 0.2)); px = qx; py = qy; } }
  function aura(follow, c, ms, o = {}) { // anel + brasas presos ao herói/rival
    const t = obj(P.torus, { follow, c, life: ms, h: o.h ?? 0.15, s0: W(o.r ?? 0.8), spin: o.spin ?? 2, fade: 'late', pulse: 1 });
    if (o.top) obj(P.torus, { follow, c, life: ms, h: 1.9, s0: W(0.45), spin: -3, fade: 'late', pulse: 1 });
    const n = Math.floor(ms / 120); for (let i = 0; i < n; i++) at(i * 120, () => { const q = follow(); if (q) emit(o.n ?? 2, { x: q.x, y: q.y, h: 0.3, spread: o.r ?? 0.6, col: o.c2 ?? c, vel: 0.3, up: o.up ?? 2.2, grav: -0.5, size: o.size ?? 0.35, life: 700, k: o.k }); });
    return t;
  }
  // —— assinatura das variantes do Guerreiro (fogo chamas · raio arcos · veneno verde · terra pedras · vento redemoinho) ——
  function flavor(v, x, y, r = 1, k = 1) {
    if (v === 'fogo') emit(12 * r, { x, y, h: 0.4, spread: 0.5 * r, col: 0xff5a10, col2: 0xffd040, vel: 0.6, up: 3.2, grav: -1, size: 0.6, life: 650, k });
    else if (v === 'raio') { for (let i = 0; i < 3; i++) { const a = rnd(0, TAU); bolt(x, y, x + Math.sin(a) * r * 1.4, y + Math.cos(a) * r * 1.4, 0xfff27a, 200, 4); } }
    else if (v === 'veneno') emit(10 * r, { x, y, h: 0.8, spread: 0.6 * r, col: 0x6aff3a, col2: 0x2a8a10, vel: 0.8, up: 1, grav: 4, size: 0.4, life: 700, k });
    else if (v === 'terra') { for (let i = 0; i < 4; i++) { const a = rnd(0, TAU), d = rnd(0.3, r); obj(P.rock, { ...wp(x + Math.sin(a) * d, y + Math.cos(a) * d, 0.2), c: 0x8a6a40, life: 900, sx: rnd(0.3, 0.6), sy: rnd(0.3, 0.6), sz: rnd(0.3, 0.6), vy: rnd(3, 6), g: 14, land: GY(x, y) + 0.15, rx: rnd(0, 3), ry: rnd(0, 3), fade: 'late', solid: true }); } emit(8, { x, y, h: 0.2, spread: r * 0.5, col: 0x9a8060, vel: 1.4, up: 0.8, size: 0.7, life: 600, smoke: true, k }); }
    else if (v === 'vento') { for (let i = 0; i < 2; i++) obj(P.torus, { ...wp(x, y, 0.4 + i * 0.6), c: 0xbff6ff, life: 600, s0: W(0.4 * r), s1: W(1.1 * r), grow: true, spin: 9, tilt: 0.25 }); emit(10 * r, { x, y, h: 0.6, spread: 0.6 * r, col: 0xe8ffff, vel: 2.5, up: 0.6, size: 0.3, life: 500, swirl: 7, k }); }
  }
  // —— SPECS dos 27 poderes ——
  const S = {};
  // GUERREIRO
  S.corte_azul = (o) => { flavor(o.var, o.x, o.y, 0.8, o.k); };
  S.grito_guerra = (o) => { shock(o.x, o.y, o.c, 3.2, 650); at(120, () => shock(o.x, o.y, o.c, 4.2, 600)); aura(o.follow, o.c, o.p0.dur || 6000, { r: 0.75, top: true, k: o.k }); flavor(o.var, o.x, o.y, 1.4, o.k); shake(3); };
  S.lamina_nucleo = (o) => { const L = o.p0.alcance || 8; obj(P.blade, { ...wp(o.x + o.dx * 0.9, o.y + o.dy * 0.9, 1.0), fy: o.yaw, c: o.c, life: 520, s0: W(0.7), s1: W(1.4), grow: true, rz: 0, tiltX: 0.35 });
    every(26, 12, (i) => { const t = (i + 1) / 12; const x = o.x + o.dx * L * t, y = o.y + o.dy * L * t; emit(4, { x, y, h: 0.6, spread: 0.5, col: o.c, col2: 0xffffff, vel: 2.5, up: 2.5, grav: 5, size: 0.5, life: 420, k: o.k }); if (i % 3 === 0) flavor(o.var, x, y, 0.6, o.k * 0.6); });
    streak(o.x, o.y, o.x + o.dx * L, o.y + o.dy * L, o.c, 420, 0.5, 0.3); streak(o.x, o.y, o.x + o.dx * L, o.y + o.dy * L, 0xffffff, 200, 0.16, 1.1); scorch(o.x + o.dx * L * 0.5, o.y + o.dy * L * 0.5, 0.7, 2500); shake(6); };
  // ARQUEIRO
  S.flecha_perfurante = (o) => { emit(8, { x: o.x + o.dx * 0.6, y: o.y + o.dy * 0.6, h: 1.2, col: o.c, col2: 0xffffff, dir: { x: o.dx, y: o.dy }, vel: 6, up: 0.2, size: 0.35, life: 260, k: o.k }); };
  S.salto_tras = (o) => { emit(12, { x: o.x, y: o.y, h: 0.2, spread: 0.4, col: 0xb8a888, vel: 1.6, up: 0.6, size: 0.8, life: 650, smoke: true, k: o.k }); const tr = o.p0.armadilha || {}; const r = tr.raio || 1.7;
    obj(P.ring, { ...wp(o.x, o.y, 0.06), c: o.c, life: 4000, sx: W(r), sy: 1, sz: W(r), fade: 'late', pulse: 1 });
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; obj(P.arrow, { ...wp(o.x + Math.sin(a) * r * 0.6, o.y + Math.cos(a) * r * 0.6, 0.25), rx: -Math.PI / 2, c: o.c, life: 4000, sx: 2, sy: 2, sz: 0.5, fade: 'late' }); } };
  S.chuva_flechas = (o) => { const R = o.p0.raio || 3, D = o.p0.durMs || 3000; obj(P.ring, { ...wp(o.cx, o.cy, 0.06), c: o.c, life: D, sx: W(R), sy: 1, sz: W(R), fade: 'late', pulse: 1 });
    const n = Math.round((low ? 22 : 36) * (o.k ?? 1)); for (let i = 0; i < n; i++) at(rnd(0, D - 300), () => { const a = rnd(0, TAU), d = Math.sqrt(Math.random()) * R; const x = o.cx + Math.sin(a) * d, y = o.cy + Math.cos(a) * d; const g = wp(x, y, 0);
      obj(P.arrow, { x: g.x - 0.6, y: g.y + 7, z: g.z, rx: Math.PI / 2 + 0.15, c: 0xdff8ff, life: 320, sx: 1.6, sy: 1.6, sz: 1.3, vx: 1.9, vy: -22, land: g.y + 0.3, onLand: (b) => { b.vx = 0; b.vy = 0; b.life = Math.min(b.life, now() - b.born + 700); emit(3, { x, y, h: 0.1, col: o.c, vel: 1.5, up: 1.5, grav: 6, size: 0.25, life: 250, k: o.k }); } }); }); };
  // MAGO
  S.orbe_arcano = (o) => { emit(10, { x: o.x, y: o.y, h: 1.3, spread: 0.2, col: o.c, col2: 0xffffff, vel: 2, up: 1, size: 0.4, life: 380, k: o.k }); };
  S.teleporte = (o) => { const f = (x, y) => { pillar(x, y, o.c, 4.5, 380, 0.45); pillar(x, y, 0xffffff, 4.5, 220, 0.15); emit(18, { x, y, h: 1, spread: 0.3, col: o.c, col2: 0xffffff, vel: 3, up: 1.5, size: 0.45, life: 450, k: o.k }); shock(x, y, o.c, 1.3, 380); };
    f(o.x, o.y); at(30, () => { const q = o.follow(); if (q) f(q.x, q.y); }); };
  S.meteoro = (o) => { const D = o.p0.atrasoMs || 900, R = o.p0.raio || 2.6; const g = wp(o.cx, o.cy, 0); obj(P.ring, { ...wp(o.cx, o.cy, 0.06), c: 0xff3a10, life: D, sx: W(R), sy: 1, sz: W(R), fade: 'none', pulse: 1 });
    const rock = obj(P.rock, { x: g.x + 6, y: g.y + 16, z: g.z - 3, c: 0x3a1a0a, life: D, sx: 2.2, sy: 2.2, sz: 2.2, vx: -6 / (D / 1000), vy: -16 / (D / 1000), vz: 3 / (D / 1000), spinX: 4, solid: true, fade: 'none',
      tick: (b) => emit(2, { x: b.x / TILE, y: b.z / TILE, h: b.y - GY(o.cx, o.cy), col: 0xff6a10, col2: 0xffe060, vel: 0.5, up: 0.5, size: 0.8, life: 380, k: o.k }) });
    void rock; at(D, () => { shock(o.cx, o.cy, 0xff6a1a, R * 1.15, 700); emit(30, { x: o.cx, y: o.cy, h: 0.4, spread: 0.6, col: 0xff5a10, col2: 0xffe070, vel: 8, up: 4, grav: 9, size: 0.5, life: 650, k: o.k }); emit(14, { x: o.cx, y: o.cy, h: 0.4, spread: R * 0.6, col: 0x8a6a50, vel: 1.2, up: 1.2, size: 1.6, life: 1400, smoke: true, k: o.k });
      for (let i = 0; i < 6; i++) { const a = rnd(0, TAU); obj(P.rock, { ...wp(o.cx, o.cy, 0.3), c: 0x2a160a, life: 1000, sx: 0.4, sy: 0.4, sz: 0.4, vx: Math.sin(a) * 6, vz: Math.cos(a) * 6, vy: rnd(5, 8), g: 18, solid: true, fade: 'late', spinX: 6 }); }
      scorch(o.cx, o.cy, R * 0.85, 5000); pillar(o.cx, o.cy, 0xffb040, 4, 200, 0.45); shake(9); }); };
  // NINJA
  S.shurikens = (o) => { emit(6, { x: o.x + o.dx * 0.5, y: o.y + o.dy * 0.5, h: 1.2, col: 0xffffff, dir: { x: o.dx, y: o.dy }, vel: 5, size: 0.25, life: 200, k: o.k }); };
  S.fumaca = (o) => { const n = low ? 22 : 34; emit(n, { x: o.x, y: o.y, h: 0.7, spread: 0.9, col: 0xb8bcc8, vel: 2.2, up: 0.5, drag: 2.5, size: 2.4, size1: 4.0, life: 1800, smoke: true, k: o.k }); emit(10, { x: o.x, y: o.y, h: 0.6, spread: 0.5, col: 0xc8c8d8, vel: 3.5, up: 0.4, size: 0.5, life: 400, k: o.k }); shock(o.x, o.y, 0x9a9aa8, 2.2, 450); };
  S.mil_cortes = (o) => { const L = o.p0.alvos || 5; let px = o.x, py = o.y; for (let i = 0; i < L; i++) at(i * 130 + 10, () => { const q = o.follow(); if (!q) return; obj(P.ghost, { ...wp(px, py, 1.25), c: o.c, life: 380, sx: 1.6, sy: 1.6, sz: 1.6, fade: 'out' }); streak(px, py, q.x, q.y, o.c, 220, 0.14, 1.1);
      obj(P.blade, { ...wp(q.x - 0.6, q.y - 0.6, 1.1), ry: rnd(0, TAU), c: 0xffffff, life: 220, s0: W(0.6), s1: W(1.1), grow: true, tiltX: rnd(-1, 1) }); emit(6, { x: q.x - 0.6, y: q.y - 0.6, h: 1, col: o.c, col2: 0xffffff, vel: 4, size: 0.3, life: 260, k: o.k }); px = q.x; py = q.y; }); };
  // CAVALEIRO
  S.escudo_investida = (o) => { const sh = obj(P.wall, { follow: o.follow, fy: o.yaw, c: 0xffd23f, life: 450, sx: W(0.55), sy: 1.6, sz: W(0.55), h: 0.9, fade: 'out' }); void sh; every(40, 8, () => { const q = o.follow(); if (q) emit(3, { x: q.x, y: q.y, h: 0.15, spread: 0.3, col: 0xc8b090, vel: 1, up: 0.5, size: 0.7, life: 500, smoke: true, k: o.k }); }); at(240, () => { const q = o.follow(); if (q) burstAt(q.x + o.dx * 0.8, q.y + o.dy * 0.8, 0xffe070, 1, o.k); shake(4); }); };
  S.muralha = (o) => { const D = o.p0.dur || 4000; obj(P.wall, { follow: o.follow, fy: o.yaw, followYaw: o.yawNow, c: 0xffd23f, life: D, sx: W(1.15), sy: 2.4, sz: W(1.15), h: 1.2, fade: 'late', pulse: 1 }); obj(P.wall, { follow: o.follow, fy: o.yaw, followYaw: o.yawNow, c: 0xfff4c0, life: D, sx: W(1.17), sy: 0.08, sz: W(1.17), h: 2.4, fade: 'late' });
    every(200, Math.floor(D / 200), () => { const q = o.follow(); if (!q) return; const yw = (o.yawNow?.() ?? o.yaw) + rnd(-0.9, 0.9); emit(1, { x: q.x + Math.sin(yw) * 1.15, y: q.y - Math.cos(yw) * 1.15, h: rnd(0.3, 2.2), col: 0xffe890, vel: 0.1, up: 0.6, size: 0.3, life: 500, k: o.k }); }); };
  S.martelo_sagrado = (o) => { const g = wp(o.x, o.y, 0); const head = obj(P.beam, { x: g.x, y: g.y + 6, z: g.z, c: 0xffd23f, life: 260, sx: 1.4, sy: 0.9, sz: 0.9, vy: -22, land: g.y + 0.5, fade: 'none' }); void head;
    at(250, () => { shock(o.x, o.y, 0xffd23f, (o.p0.raio || 2.8), 650); pillar(o.x, o.y, 0xfff0a0, 5, 320, 0.4); emit(30, { x: o.x, y: o.y, h: 0.3, spread: 0.6, col: 0xffd23f, col2: 0xffffff, vel: 7, up: 3, grav: 8, size: 0.5, life: 520, k: o.k }); scorch(o.x, o.y, 1.6, 3000, 0x2a2208); shake(8); }); };
  // CAÇADORA
  S.lanca = (o) => { emit(8, { x: o.x + o.dx * 0.6, y: o.y + o.dy * 0.6, h: 1.2, col: o.c, dir: { x: o.dx, y: o.dy }, vel: 5, size: 0.35, life: 260, k: o.k }); };
  S.marca_presa = (o) => { if (!o.tf) return; const D = o.p0.dur || 8000; obj(P.ring, { follow: o.tf, h: 0.08, c: 0xff8a20, life: D, s0: W(0.75), spin: 1.5, fade: 'late', pulse: 1 }); obj(P.arrow, { follow: o.tf, h: 3.0, rx: Math.PI / 2, c: 0xff5a20, life: D, sx: 3, sy: 3, sz: 0.7, fade: 'late', bob: 1 }); burstAt(o.tx, o.ty, 0xff8a20, 0.8, o.k, 1.2); };
  S.fera_interior = (o) => { const D = o.p0.dur || 6000; aura(o.follow, 0xff9a20, D, { r: 0.7, top: false, c2: 0xffc060, up: 1.4, k: o.k }); every(260, Math.floor(D / 260), () => { const q = o.follow(); if (!q) return; const a = rnd(0, TAU); const x = q.x + Math.sin(a) * 0.5, y = q.y + Math.cos(a) * 0.5; streak(x, y, x - Math.sin(a) * 0.1 + rnd(-0.4, 0.4), y + rnd(-0.4, 0.4), 0xffb040, 180, 0.06, rnd(0.6, 1.6)); }); burstAt(o.x, o.y, 0xff9a20, 1.2, o.k); };
  // BRUXO
  S.maldicao = (o) => { if (!o.tf) return; const D = Math.min(5000, o.p0.dur || 5000); streak(o.x, o.y, o.tx, o.ty, 0x9b4dff, 300, 0.1, 1.2); obj(P.torus, { follow: o.tf, h: 1.0, c: 0x9b4dff, life: D, s0: W(0.5), spin: 3, tilt: 0.5, fade: 'late' }); obj(P.torus, { follow: o.tf, h: 1.5, c: 0x6a2acc, life: D, s0: W(0.42), spin: -4, tilt: -0.4, fade: 'late' });
    every(180, Math.floor(D / 180), () => { const q = o.tf(); if (q) emit(1, { x: q.x, y: q.y, h: 2.1, spread: 0.3, col: 0x6a2acc, col2: 0x1a0030, vel: 0.1, up: -0.8, size: 0.5, life: 700, k: o.k }); }); };
  S.corrente_almas = (o) => { if (!o.tf) return; every(45, 14, () => { const t = o.tf(), q = o.follow(); if (!t || !q) return; const dx = q.x - t.x, dy = q.y - t.y, L = Math.hypot(dx, dy) || 1; emit(2, { x: t.x, y: t.y, h: 1.1, spread: 0.15, col: 0x7dff3a, col2: 0xcfffb0, dir: { x: dx / L, y: dy / L }, vel: L * TILE / 0.45, jit: 0.3, up: 0.1, drag: 0, size: 0.45, life: 450, k: o.k }); });
    obj(P.torus, { follow: o.follow, h: 0.2, c: 0x7dff3a, life: 900, s0: W(0.3), s1: W(0.9), grow: true, spin: 3 }); };
  S.portal_sombrio = (o) => { const D = o.p0.atrasoMs || 600, R = o.p0.raio || 4; const c = 0x9b4dff;
    for (let i = 0; i < 3; i++) obj(P.torus, { ...wp(o.cx, o.cy, 0.15 + i * 0.35), c: i === 1 ? 0x2a0050 : c, life: D + 250, s0: W(R * (1 - i * 0.25)), s1: W(0.4), grow: true, spin: 6 + i * 3, fade: 'none' });
    obj(P.disc, { ...wp(o.cx, o.cy, 0.05), c: 0x3a0a6a, life: D + 300, s0: W(R), s1: W(0.6), grow: true, fade: 'none' });
    every(40, Math.floor(D / 40), () => emit(3, { x: o.cx, y: o.cy, h: 0.4, spread: R, col: c, col2: 0xe0b0ff, vel: 0, up: 0.3, size: 0.45, life: 500, inward: { x: o.cx, y: o.cy }, swirl: 5, k: o.k }));
    at(D, () => { shock(o.cx, o.cy, c, 2.4, 600); pillar(o.cx, o.cy, 0xc080ff, 5, 300, 0.45); emit(30, { x: o.cx, y: o.cy, h: 0.8, spread: 0.3, col: c, col2: 0xffffff, vel: 7, up: 3, grav: 6, size: 0.6, life: 550, k: o.k }); shake(7); }); };
  // SAMURAI
  S.iaijutsu = (o) => { const x = o.x + o.dx * 1.2, y = o.y + o.dy * 1.2; obj(P.blade, { ...wp(x, y, 1.05), fy: o.yaw, c: 0xffffff, life: 200, s0: W(0.9), s1: W(1.7), grow: true, tiltX: 0.25 }); obj(P.blade, { ...wp(x, y, 1.0), fy: o.yaw, c: 0xffe14a, life: 300, s0: W(1.0), s1: W(1.8), grow: true, tiltX: 0.25 });
    obj(P.ghost, { ...wp(o.x - o.dx * 0.6, o.y - o.dy * 0.6, 1.25), c: 0xffe8a0, life: 300, sx: 1.6, sy: 1.6, sz: 1.6 }); emit(10, { x, y, h: 1, spread: 0.5, col: 0xffe14a, col2: 0xffffff, vel: 4, size: 0.3, life: 300, k: o.k }); };
  S.postura = (o) => { const D = o.p0.dur || 2500; obj(P.ring, { follow: o.follow, h: 0.06, c: 0xffe14a, life: D, s0: W(1.0), spin: 0.6, fade: 'late', pulse: 1 }); obj(P.star, { follow: o.follow, h: 0.07, c: 0xffe14a, life: D, s0: W(0.95), spin: -0.8, fade: 'late', a: 0.5 }); obj(P.torus, { follow: o.follow, h: 1.0, c: 0xfff0a0, life: D, s0: W(0.6), spin: 2, tilt: 0.9, fade: 'late' }); };
  S.corte_raio = (o) => { const L = o.p0.alcance || 10; const x1 = o.x + o.dx * L, y1 = o.y + o.dy * L; for (let i = 0; i < 3; i++) at(i * 60, () => bolt(o.x, o.y, x1, y1, i === 1 ? 0xffffff : 0xfff27a, 260, 10)); streak(o.x, o.y, x1, y1, 0xfff6c0, 300, 0.4, 0.3);
    obj(P.blade, { ...wp(o.x + o.dx, o.y + o.dy, 1.0), fy: o.yaw, c: 0xffffff, life: 220, s0: W(1), s1: W(2), grow: true, tiltX: 1.3 }); every(30, 8, (i) => { const t = (i + 1) / 8; emit(3, { x: o.x + o.dx * L * t, y: o.y + o.dy * L * t, h: 1, col: 0xfff27a, col2: 0xffffff, vel: 3, size: 0.3, life: 280, k: o.k }); }); shake(6); };
  // BERSERKER
  S.machado_giratorio = (o) => { const D = o.p0.durMs || 2000, R = o.p0.raio || 2.1; for (let i = 0; i < 2; i++) obj(P.blade, { follow: o.follow, h: 0.9 + i * 0.12, c: i ? 0xffffff : 0xff4a2a, life: D, s0: W(R * (i ? 0.85 : 1)), spin: -16, rot0: i * Math.PI, fade: 'late', tiltX: 0 });
    every(110, Math.floor(D / 110), (i) => { const q = o.follow(); if (!q) return; const a = -i * 1.76; emit(3, { x: q.x + Math.sin(a) * R, y: q.y + Math.cos(a) * R, h: 0.9, col: 0xff6a2a, col2: 0xffe060, vel: 2, up: 1, grav: 5, size: 0.3, life: 300, k: o.k }); }); };
  S.salto_brutal = (o) => { emit(12, { x: o.x, y: o.y, h: 0.1, spread: 0.4, col: 0xa08860, vel: 2, up: 0.8, size: 0.9, life: 600, smoke: true, k: o.k });
    at(40, () => { const q = o.follow(); if (!q) return; streak(o.x, o.y, q.x, q.y, 0xc87a3a, 260, 0.2, 2.2); shock(q.x, q.y, 0xc87a3a, o.p0.raio || 2, 550); scorch(q.x, q.y, 1.3, 3500, 0x20140a); flavor('terra', q.x, q.y, 1.4, o.k); emit(20, { x: q.x, y: q.y, h: 0.2, spread: 0.5, col: 0xffa040, vel: 6, up: 3, grav: 10, size: 0.4, life: 450, k: o.k }); shake(8); }); };
  S.furia_lava = (o) => { const D = o.p0.dur || 6000; aura(o.follow, 0xff3a10, D, { r: 0.85, top: true, c2: 0xffa020, n: 3, up: 3, size: 0.45, k: o.k }); shock(o.x, o.y, 0xff3a10, 2.6, 600); emit(24, { x: o.x, y: o.y, h: 0.3, spread: 0.6, col: 0xff4a10, col2: 0xffd040, vel: 4, up: 4, grav: 6, size: 0.6, life: 700, k: o.k }); scorch(o.x, o.y, 1.4, 2500); shake(5); };

  /** dispara o VFX de um poder. o: { x,y,yaw, c, var, p0, follow:()=>{x,y}, cx,cy (centro da área), tf:()=>{x,y} alvo, tx,ty, src } */
  function cast(id, o) {
    const fn = S[id]; if (!fn) return false; stats.casts++; stats.byId[id] = (stats.byId[id] || 0) + 1;
    shakeK = o.src === 'rival' ? 0.35 : 1; curA = o.src === 'rival' ? 0.55 : 1; o.dx = Math.sin(o.yaw || 0); o.dy = -Math.cos(o.yaw || 0); o.k = (o.src === 'rival' ? 0.5 : 1) * (o.k ?? 1);
    if (o.cx == null) { o.cx = o.tx ?? o.x + o.dx * 3; o.cy = o.ty ?? o.y + o.dy * 3; }
    if (o.src !== 'rival') { const q = wp(o.x, o.y, 0); obj(P.ring, { x: q.x, y: q.y + 0.08, z: q.z, c: o.c, life: 300, s0: W(0.3), s1: W(1), grow: true }); emit(8, { x: o.x, y: o.y, h: 1.2, spread: 0.25, col: o.c, col2: 0xffffff, vel: 0.8, up: 2, size: 0.35, life: 380 }); } // pose: brilho de conjuração no herói
    try { fn(o); } catch (e) { console.warn('[power-vfx]', id, e); }
    return true;
  }
  /** rastro preso a um PROJÉTIL real (Corte Azul, flechas, orbe, shurikens, lança...) até ele sumir */
  const KIND_TRAIL = { corte_azul: 'blade', flecha_perfurante: 'arrow', lanca: 'spear', shurikens: 'star', orbe_arcano: 'orb', corrente_almas: null };
  function attach(p, id, v, c, src) {
    if (!p) return; const t = KIND_TRAIL[id]; if (!t) return; const k = src === 'rival' ? 0.5 : 1;
    const fol = () => (p.alive ? { x: p.x, y: p.y } : null);
    if (t === 'blade') obj(P.blade, { follow: fol, fy: p.yaw, h: 1.15, c, life: 3000, s0: W(0.75), tiltX: 0.15, fade: 'none', untilDead: true });
    if (t === 'arrow') obj(P.arrow, { follow: fol, fy: p.yaw, h: 1.2, c: 0xffffff, life: 3000, sx: 3, sy: 3, sz: 1.4, fade: 'none', untilDead: true, aimYaw: true });
    if (t === 'spear') obj(P.beam, { follow: fol, fy: p.yaw, h: 1.2, c, life: 3000, sx: 0.08, sy: 0.08, sz: 2.2, fade: 'none', untilDead: true });
    if (t === 'star') obj(P.star, { follow: fol, h: 1.2, c: 0xe8f0ff, life: 3000, s0: 0.45, spin: 30, fade: 'none', untilDead: true });
    const trail = { fol, c, t, v, k, last: null };
    objs.push({ pool: null, born: now(), life: 3000, trail, untilDead: true, follow: fol });
  }
  function trailStep(tr) { const q = tr.fol(); if (!q) return; const big = tr.t === 'orb' || tr.t === 'blade';
    emit(big ? 2 : 1, { x: q.x, y: q.y, h: 1.18, spread: big ? 0.12 : 0.04, col: tr.c, col2: 0xffffff, vel: 0.1, up: 0.05, size: big ? 0.7 : 0.3, life: big ? 300 : 180, k: tr.k });
    if (tr.t === 'blade' && tr.v && tr.v !== 'azul' && Math.random() < 0.35) flavor(tr.v, q.x, q.y, 0.35, tr.k * 0.5);
    if (tr.t === 'orb') emit(1, { x: q.x, y: q.y, h: 1.2, spread: 0.3, col: 0xe0b0ff, vel: 0.2, size: 0.25, life: 300, swirl: 9, inward: { x: q.x, y: q.y }, k: tr.k }); }
  /** tiro só VISUAL (rivais: o dano deles é resolvido pelo kit, sem projétil com colisão) */
  const shots = [];
  function fakeShot(id, x, y, tx, ty, c, v, src, speed = 18) { const d = Math.hypot(tx - x, ty - y); if (d < 0.4) return; const p = { x, y, alive: true, yaw: Math.atan2(tx - x, -(ty - y)), vx: (tx - x) / d, vy: (ty - y) / d, left: d };
    shots.push({ p, speed, tx, ty, c, src }); attach(p, id, v, c, src); }
  /** impacto de poder: faíscas + mini-tremor */
  function hit(x, y, c, heavy) { stats.hits++; emit(heavy ? 14 : 8, { x, y, h: 1.1, spread: 0.15, col: c, col2: 0xffffff, vel: heavy ? 6 : 4, up: 2, grav: 8, size: 0.32, life: 300 }); emit(1, { x, y, h: 1.1, spread: 0, col: 0xffffff, vel: 0, up: 0, size: heavy ? 2.2 : 1.5, size1: 0.4, life: 140 }); shake(heavy ? 3 : 1.5); }

  // —— atualização por frame (chamada pelo renderer) ——
  const qCam = new THREE.Quaternion(); let lastT = now(); let idleClean = true;
  function update() {
    const t = now(); const dt = Math.min(0.05, (t - lastT) / 1000); lastT = t;
    if (!parts.length && !objs.length && !jobs.length && !shots.length) { if (idleClean) return; for (const k in P) P[k].visible = false; idleClean = true; return; } idleClean = false;
    for (let i = jobs.length - 1; i >= 0; i--) if (t >= jobs[i].at) { const j = jobs[i]; jobs.splice(i, 1); try { j.fn(); } catch { /* */ } }
    for (let i = shots.length - 1; i >= 0; i--) { const s0 = shots[i]; const st = s0.speed * dt; s0.p.x += s0.p.vx * st; s0.p.y += s0.p.vy * st; s0.p.left -= st; if (s0.p.left <= 0) { s0.p.alive = false; shots.splice(i, 1); emit(s0.src === 'rival' ? 5 : 8, { x: s0.tx, y: s0.ty, h: 1.1, col: s0.c, col2: 0xffffff, vel: 4, up: 2, grav: 8, size: 0.3, life: 260 }); } }
    camera.getWorldQuaternion(qCam);
    // partículas
    let ng = 0, ns = 0; const pg = P.glow, ps = P.smoke;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; const age = (t - p.born) / p.life; if (age >= 1) { parts[i] = parts[parts.length - 1]; parts.pop(); free.push(p); continue; }
      if (p.inward) { const dx = W(p.inward.x) - p.x, dz = W(p.inward.y) - p.z; p.vx += dx * 6 * dt; p.vz += dz * 6 * dt; }
      if (p.swirl) { const vx = p.vx; p.vx += -p.vz * p.swirl * dt; p.vz += vx * p.swirl * dt; }
      p.vy -= p.g * dt; const dr = Math.max(0, 1 - p.drag * dt); p.vx *= dr; p.vz *= dr; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const im = p.smoke ? ps : pg; const n = p.smoke ? ns : ng; if (n >= im.instanceMatrix.count) continue;
      dummy.position.set(p.x, p.y, p.z); dummy.quaternion.copy(qCam); const s = p.s0 + (p.s1 - p.s0) * age; dummy.scale.set(s, s, s); dummy.updateMatrix(); im.setMatrixAt(n, dummy.matrix);
      col.setHex(p.c); if (age < 0.25 && p.c2 !== p.c) { colB.setHex(p.c2); col.lerp(colB, 1 - age * 4); } col.multiplyScalar(p.smoke ? 0.55 * (1 - age) : (1 - age) * 0.95); im.setColorAt(n, col);
      if (p.smoke) ns++; else ng++;
    }
    pg.count = ng; ps.count = ns; pg.visible = ng > 0; ps.visible = ns > 0; // pool vazio = 0 draw calls stats.peakP = Math.max(stats.peakP, ng + ns);
    // objetos
    const cnt = {}; for (const k in P) cnt[k] = 0;
    for (let i = objs.length - 1; i >= 0; i--) {
      const b = objs[i]; let age = (t - b.born) / b.life; let fol = null;
      if (b.follow) { fol = b.follow(); if (!fol && (b.untilDead || b.follow)) { objs.splice(i, 1); continue; } }
      if (age >= 1) { objs.splice(i, 1); continue; }
      if (b.trail) { trailStep(b.trail); continue; }
      if (b.tick) b.tick(b);
      if (b.vx || b.vy || b.vz || b.g) { b.vy = (b.vy || 0) - (b.g || 0) * dt; b.x += (b.vx || 0) * dt; b.y += (b.vy || 0) * dt; b.z += (b.vz || 0) * dt; if (b.land != null && b.y <= b.land) { b.y = b.land; const cb = b.onLand; b.land = null; if (cb) cb(b); else { b.vx = b.vy = b.vz = 0; } } }
      const im = b.pool; if (!im) continue; const key = im.userData.key; const n = cnt[key]; if (n >= im.instanceMatrix.count) continue;
      if (fol) { b.x = W(fol.x); b.z = W(fol.y); b.y = GY(fol.x, fol.y) + (b.h ?? 0) + (b.bob ? Math.sin(t * 0.006) * 0.25 : 0); }
      dummy.position.set(b.x, b.y, b.z); dummy.quaternion.identity();
      if (b.faceCam) dummy.quaternion.copy(qCam);
      else { const gy = b.followYaw ? b.followYaw() : b.fy; const rotY = gy != null ? Math.PI - gy : (b.ry || 0); const spin = b.spin ? (t - b.born) / 1000 * b.spin + (b.rot0 || 0) : 0; dummy.rotation.set((b.rx || 0) + (b.tiltX || 0) + (b.spinX ? (t - b.born) / 1000 * b.spinX : 0), rotY + spin, (b.rz || 0) + (b.tilt || 0)); }
      let sx = b.sx, sy = b.sy, sz = b.sz; if (b.s0 != null) { const e = b.grow ? 1 - Math.pow(1 - Math.min(1, age * 1.6), 3) : 1; const s = b.s1 != null && b.grow ? b.s0 + (b.s1 - b.s0) * e : b.s0; sx = sz = s; sy = b.pool === P.torus || b.pool === P.blade || b.pool === P.ring || b.pool === P.disc || b.pool === P.star ? 1 : s; if (b.pool === P.torus) { sy = s; } }
      dummy.scale.set(sx, sy, sz); dummy.updateMatrix(); im.setMatrixAt(n, dummy.matrix);
      let a = b.a ?? 1; if (b.fade === 'out') a *= 1 - age; else if (b.fade === 'late') a *= age > 0.8 ? (1 - age) / 0.2 : 1; if (b.pulse) a *= 0.75 + 0.25 * Math.sin(t * 0.012);
      col.setHex(b.c).multiplyScalar(b.solid ? 1 : 0.9 * a); im.setColorAt(n, col); cnt[key] = n + 1;
    }
    for (const k in P) { const im = P[k]; if (k === 'glow' || k === 'smoke') { if (!im.visible) continue; } else { im.count = cnt[k]; im.visible = cnt[k] > 0; if (!im.visible) continue; } im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
    stats.peakO = Math.max(stats.peakO, objs.length);
  }
  function clear() { shots.length = 0; parts.length = 0; objs.length = 0; jobs.length = 0; }
  return { cast, attach, fakeShot, hit, update, clear, flavor, zap: (a, b, c, d, cl) => { bolt(a, b, c, d, cl, 260, 6); emit(6, { x: c, y: d, h: 1.1, col: cl, col2: 0xffffff, vel: 4, size: 0.3, life: 260 }); }, ids: () => Object.keys(S), stats: () => ({ ...stats, live: parts.length, objs: objs.length, jobs: jobs.length, cap: CAP_P }) };
}
