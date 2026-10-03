/**
 * NEXARA — ARENA PRINCIPAL: gerador DETERMINÍSTICO do mapa grande (seed em data/arena_br.json).
 * Mesmo seed → mesmo mapa sempre (nada salvo no save; o save guarda só o progresso do herói).
 *
 * 6 regiões separadas por muros com poucas passagens (não é uma sala gigante), 3 rotas (A rápida/perigosa,
 * B longa com cobertura, C loot/monstros), estruturas (prédios, ruínas, salas, torre, caverna, arena de elite,
 * covil), cobertura (caixas, pilares, árvores, rochas), espaço vazio proposital, local secreto,
 * relevo suave (alturas por tile, rampas por suavização) e pontos de spawn/baús só em tiles alcançáveis.
 */
import { generateBrMapV2 } from './br-map-v2.js?v=20261003m10a';
export const BR_ZONE_ID = 'zone_arena_br';
export const BR_LEGEND = { W: 'wall', '.': 'floor', '#': 'street', T: 'tree', R: 'rock', b: 'bush', C: 'crate', P: 'pillar', '~': 'rubble', o: 'tech', g: 'grass' };
export const BR_SOLID = new Set(['wall', 'tree', 'rock', 'crate', 'pillar']);

function rng32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function hash2(x, y, s) { let h = (x * 374761393 + y * 668265263 + s * 2147483647) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, y, s, f) {
  const fx = x / f, fy = y / f; const ix = Math.floor(fx), iy = Math.floor(fy); const tx = fx - ix, ty = fy - iy;
  const sm = (t) => t * t * (3 - 2 * t);
  const a = hash2(ix, iy, s), b = hash2(ix + 1, iy, s), c = hash2(ix, iy + 1, s), d = hash2(ix + 1, iy + 1, s);
  return a + (b - a) * sm(tx) + (c - a) * sm(ty) + (a - b - c + d) * sm(tx) * sm(ty);
}

/**
 * MASTER 10 — ESCALA DA ARENA: data/arena_br.json guarda o PROJETO (100×76) + zona.escala.
 * Escala > 1 → devolve uma cópia com tudo redimensionado (tamanho, regiões, spawn, dragão, extração,
 * zona segura que encolhe junto, quantidade de baús/caixas/pontos de spawn por área) e zona.gerador = 2.
 * ?brScale=1 força o mapa original (comparação / rollback). Chamado UMA vez no carregamento dos dados.
 */
export function scaleBrConfig(cfg0) {
  if (!cfg0?.zona || cfg0._escala) return cfg0;
  let S = Number(cfg0.zona.escala) || 1;
  try { const q = new URLSearchParams(globalThis.location?.search || '').get('brScale'); if (q && Number(q) > 0) S = Number(q); } catch { /* sem URL */ }
  if (!(S > 1.01)) return { ...cfg0, _escala: 1 };
  const c = JSON.parse(JSON.stringify(cfg0));
  const D = (v) => Math.round(v * S); const D1 = (v) => Math.round((v + 1) * S) - 1;
  const A = S * S; const k = Number(c.zona.fatorConteudo) || 0.8; // conteúdo cresce com a ÁREA (fator < 1: espaço de exploração entre pontos)
  c._escala = S; c._design = { width: c.zona.width, height: c.zona.height };
  c.zona.width = D(c.zona.width); c.zona.height = D(c.zona.height); c.zona.gerador = 2;
  c.spawnHeroi = { x: D(c.spawnHeroi.x), y: D(c.spawnHeroi.y) };
  for (const r of c.regioes) { r.x0 = D(r.x0); r.y0 = D(r.y0); r.x1 = D1(r.x1); r.y1 = D1(r.y1); }
  const t = c.dragao.territorio; c.dragao.x = D(c.dragao.x); c.dragao.y = D(c.dragao.y);
  c.dragao.territorio = { x0: D(t.x0), x1: D1(t.x1), y0: D(t.y0), y1: D1(t.y1) };
  c.dragao.avisoDist = Math.round(c.dragao.avisoDist * Math.min(S, 2));
  for (const p of c.extracao.pontos) { p.x = D(p.x); p.y = D(p.y); }
  const z = c.zonaSegura; z.centro = { x: D(z.centro.x), y: D(z.centro.y) };
  z.inicioMs = Math.round(z.inicioMs * S); for (const e of z.estagios) { e.raio = Math.round(e.raio * S); e.duracaoMs = Math.round(e.duracaoMs * S); }
  for (const key of ['bausPorRegiao', 'caixasPorRegiao']) for (const id of Object.keys(c[key] || {})) c[key][id] = Math.round(c[key][id] * A * k);
  c.diretor.pontosPorRegiao = Math.round(c.diretor.pontosPorRegiao * A * k);
  return c;
}

/** @param {object} cfg data.arena_br */
export function generateBrMap(cfg) {
  if (cfg.zona.gerador === 2) return generateBrMapV2(cfg, { BR_LEGEND, BR_SOLID, vnoise });
  const W = cfg.zona.width; const H = cfg.zona.height; const seed = cfg.zona.seed | 0;
  const R = rng32(seed);
  const ri = (a, b) => a + Math.floor(R() * (b - a + 1));
  const g = Array.from({ length: H }, () => new Array(W).fill('.'));
  const inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  const set = (x, y, c) => { if (inb(x, y) && x > 0 && y > 0 && x < W - 1 && y < H - 1) g[y][x] = c; };
  const get = (x, y) => (inb(x, y) ? g[y][x] : 'W');
  const rect = (x0, y0, x1, y1, c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, c); };
  const box = (x0, y0, x1, y1, c = 'W') => { for (let x = x0; x <= x1; x++) { set(x, y0, c); set(x, y1, c); } for (let y = y0; y <= y1; y++) { set(x0, y, c); set(x1, y, c); } };
  const regions = cfg.regioes;
  const regionOf = (x, y) => { for (const r of regions) if (x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1) return r; return null; };

  // —— pisos por região ——
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const r = regionOf(x, y); if (!r) continue;
    g[y][x] = r.id === 'floresta' ? 'g' : r.id === 'complexo' ? 'o' : '.';
  }
  // borda
  for (let x = 0; x < W; x++) { g[0][x] = 'W'; g[H - 1][x] = 'W'; }
  for (let y = 0; y < H; y++) { g[y][0] = 'W'; g[y][W - 1] = 'W'; }

  // —— muros entre regiões (poucas passagens) ——
  const gapsX34 = [[52, 54], [66, 68], [10, 12], [30, 32]];
  for (let y = 1; y < H - 1; y++) if (!gapsX34.some(([a, b]) => y >= a && y <= b)) set(34, y, 'W');
  const gapsY45a = [[8, 11], [24, 26]]; const gapsY45b = [[44, 47], [58, 59]];
  for (let x = 1; x <= 33; x++) if (!gapsY45a.some(([a, b]) => x >= a && x <= b)) set(x, 45, 'W');
  for (let x = 35; x <= 65; x++) if (!gapsY45b.some(([a, b]) => x >= a && x <= b)) set(x, 45, 'W');
  const gapsX66 = [[6, 7], [20, 22], [58, 59]];
  for (let y = 1; y < H - 1; y++) if (!gapsX66.some(([a, b]) => y >= a && y <= b)) set(66, y, 'W');
  for (let x = 67; x <= 98; x++) if (!(x >= 82 && x <= 83)) set(x, 46, 'W');
  // muros grossos (2 tiles) nas divisas da Zona de Elite: poucos acessos de verdade
  for (let y = 47; y < H - 1; y++) if (!(y >= 58 && y <= 59)) set(67, y, 'W');
  for (let x = 67; x <= 98; x++) if (!(x >= 82 && x <= 83)) set(x, 47, 'W');

  const structures = []; // para o renderer (altura/estilo) e minimapa
  // —— 1 PERIFERIA: ruas + casebres ——
  for (let y = 48; y <= 73; y++) for (let x = 2; x <= 32; x++) if (x % 9 === 4 || y % 8 === 2) set(x, y, '#');
  const houses = [[6, 49, 11, 53], [20, 50, 25, 54], [13, 57, 18, 61], [26, 59, 31, 63], [3, 62, 8, 65], [18, 66, 23, 70]];
  for (const [x0, y0, x1, y1] of houses) { box(x0, y0, x1, y1); const dx = ri(x0 + 1, x1 - 2); set(dx, y1, '.'); set(dx + 1, y1, '.'); rect(x0 + 1, y0 + 1, x1 - 1, y1 - 1, '.'); structures.push({ kind: 'casa', x0, y0, x1, y1, h: 3.0 }); }
  for (let i = 0; i < 7; i++) { const x = ri(3, 31); const y = ri(48, 73); if (get(x, y) === '#' || get(x, y) === '.') set(x, y, 'C'); }

  // —— 2 RUÍNAS INDUSTRIAIS: blocos quebrados, corredores, caixas, TORRE ——
  for (let by = 0; by < 3; by++) for (let bx = 0; bx < 4; bx++) {
    const x0 = 36 + bx * 7 + ri(0, 1); const y0 = 48 + by * 9 + ri(0, 1); const x1 = x0 + ri(4, 5); const y1 = y0 + ri(4, 5);
    if (x1 >= 64 || y1 >= 74) continue;
    if (bx === 2 && by === 1) continue; // praça da torre
    box(x0, y0, x1, y1);
    // ruína: buracos nas paredes (2–3 aberturas) + entulho dentro
    for (let k = 0; k < ri(2, 3); k++) { const side = ri(0, 3); const t = side < 2 ? ri(x0 + 1, x1 - 1) : ri(y0 + 1, y1 - 1); if (side === 0) set(t, y0, '~'); else if (side === 1) set(t, y1, '~'); else if (side === 2) set(x0, t, '~'); else set(x1, t, '~'); }
    rect(x0 + 1, y0 + 1, x1 - 1, y1 - 1, R() < 0.5 ? '.' : '~');
    structures.push({ kind: 'ruina', x0, y0, x1, y1, h: 2.2 + R() * 1.6 });
  }
  rect(50, 58, 52, 60, 'P'); structures.push({ kind: 'torre', x0: 50, y0: 58, x1: 52, y1: 60, h: 11 });
  for (let i = 0; i < 12; i++) { const x = ri(36, 64); const y = ri(47, 73); const len = ri(2, 3); const hz = R() < 0.5; for (let k = 0; k < len; k++) { const xx = hz ? x + k : x; const yy = hz ? y : y + k; if (get(xx, yy) === '.' || get(xx, yy) === '~') set(xx, yy, 'C'); } }

  // —— 3 FLORESTA: árvores por ruído, rochas, arbustos, trilhas, CAVERNA, LOCAL SECRETO ——
  for (let y = 1; y <= 44; y++) for (let x = 1; x <= 33; x++) {
    if (get(x, y) !== 'g') continue;
    const n = vnoise(x, y, seed, 6);
    if (n > 0.6 && R() < 0.55) set(x, y, 'T');
    else if (n < 0.2 && R() < 0.12) set(x, y, 'R');
    else if (R() < 0.06) set(x, y, 'b');
  }
  const carve = (pts, w = 1) => {
    for (let i = 0; i < pts.length - 1; i++) {
      let [x, y] = pts[i]; const [tx, ty] = pts[i + 1];
      while (x !== tx || y !== ty) { for (let a = -w; a <= w; a++) for (let b = -w; b <= w; b++) { const c = get(x + a, y + b); if (c === 'T' || c === 'R' || c === 'b') set(x + a, y + b, 'g'); } if (x !== tx) x += Math.sign(tx - x); else y += Math.sign(ty - y); }
    }
  };
  carve([[9, 45], [9, 34], [16, 26], [16, 12], [33, 11]], 1);
  carve([[25, 45], [25, 31], [33, 31]], 1);
  carve([[16, 26], [6, 18], [6, 5]], 1);
  // caverna: maciço de rocha com túnel sinuoso
  rect(18, 2, 31, 9, 'R');
  const cave = [[24, 10], [24, 7], [28, 7], [28, 4], [21, 4], [21, 3]];
  for (let i = 0; i < cave.length - 1; i++) { let [x, y] = cave[i]; const [tx, ty] = cave[i + 1]; while (x !== tx || y !== ty) { set(x, y, '.'); if (x !== tx) x += Math.sign(tx - x); else y += Math.sign(ty - y); } set(tx, ty, '.'); }
  structures.push({ kind: 'caverna', x0: 18, y0: 2, x1: 31, y1: 9, h: 4.2 });
  // local secreto: bolsão fechado por árvores com 1 abertura estreita
  rect(26, 35, 32, 41, 'T'); rect(28, 37, 31, 40, 'g'); set(27, 38, 'g'); set(26, 38, 'g');

  // —— 4 COMPLEXO ABANDONADO: salas com portas + plataforma do laboratório ——
  for (let ry = 0; ry < 5; ry++) for (let rx = 0; rx < 3; rx++) {
    const x0 = 36 + rx * 10; const y0 = 2 + ry * 8; const x1 = x0 + 7; const y1 = y0 + 6;
    if (rx === 1 && (ry === 2)) continue; // pátio central (plataforma)
    box(x0, y0, x1, y1);
    const doors = [[ri(x0 + 2, x1 - 3), y0, 'h'], [ri(x0 + 2, x1 - 3), y1, 'h'], [x0, ri(y0 + 2, y1 - 3), 'v'], [x1, ri(y0 + 2, y1 - 3), 'v']];
    const nd = ri(2, 3);
    for (let k = 0; k < nd; k++) { const d = doors.splice(ri(0, doors.length - 1), 1)[0]; if (d[2] === 'h') { set(d[0], d[1], 'o'); set(d[0] + 1, d[1], 'o'); } else { set(d[0], d[1], 'o'); set(d[0], d[1] + 1, 'o'); } }
    structures.push({ kind: 'sala', x0, y0, x1, y1, h: 3.4 });
  }
  // pilares do pátio central
  for (const [x, y] of [[47, 19], [53, 19], [47, 24], [53, 24]]) set(x, y, 'P');

  // —— 5 ZONA DE ELITE: platô aberto, anel de pilares (ARENA DE ELITE), cobertura pesada ——
  const ec = { x: 82, y: 61 };
  for (let a = 0; a < 12; a++) { const ang = (a / 12) * Math.PI * 2; const x = Math.round(ec.x + Math.cos(ang) * 8); const y = Math.round(ec.y + Math.sin(ang) * 6.5); if (a % 3 !== 0) set(x, y, 'P'); }
  for (let i = 0; i < 8; i++) { const x = ri(70, 96); const y = ri(50, 72); if (Math.hypot(x - ec.x, y - ec.y) > 10 && get(x, y) === '.') { set(x, y, 'C'); if (R() < 0.5) set(x + 1, y, 'C'); } }

  // —— 6 TERRITÓRIO DO DRAGÃO: bacia aberta, rochas nas bordas, entulho ——
  const dc = cfg.dragao;
  for (let y = 2; y <= 44; y++) for (let x = 68; x <= 97; x++) {
    if (get(x, y) !== '.') continue;
    const d = Math.hypot(x - dc.x, (y - dc.y) * 1.2);
    if (d > 15 && vnoise(x, y, seed + 7, 4) > 0.68) set(x, y, 'R');
    else if (d < 12 && R() < 0.05) set(x, y, '~');
  }

  // —— alcance (BFS) a partir do herói ——
  const sp = cfg.spawnHeroi;
  const solid = (c) => BR_SOLID.has(BR_LEGEND[c] || 'floor');
  const reach = new Uint8Array(W * H);
  const q = [sp.x + sp.y * W]; reach[q[0]] = 1;
  while (q.length) { const i = q.pop(); const x = i % W; const y = (i / W) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; const j = nx + ny * W; if (inb(nx, ny) && !reach[j] && !solid(g[ny][nx])) { reach[j] = 1; q.push(j); } } }
  const walkable = (x, y) => inb(x, y) && reach[x + y * W] === 1;
  const openAround = (x, y, r = 1) => { for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) if (!walkable(x + a, y + b)) return false; return true; };

  // —— baús, caixas, pontos de spawn (só alcançáveis, espaçados; longe do início) ——
  const taken = [];
  const farFrom = (x, y, d) => taken.every((p) => Math.hypot(p.x - x, p.y - y) >= d);
  const pick = (r, n, minD, need = 1) => {
    const out = [];
    for (let tries = 0; tries < n * 80 && out.length < n; tries++) {
      const x = ri(r.x0 + 1, r.x1 - 1); const y = ri(r.y0 + 1, r.y1 - 1);
      if (!openAround(x, y, need)) continue;
      if (Math.hypot(x - sp.x, y - sp.y) < (cfg.diretor?.zonaLivreSpawn || 8)) continue;
      if (!farFrom(x, y, minD)) continue;
      const p = { x, y, region: r.id }; out.push(p); taken.push(p);
    }
    return out;
  };
  const chests = []; const crates = []; const spawnPoints = [];
  for (const r of regions) {
    for (const p of pick(r, cfg.bausPorRegiao?.[r.id] || 0, 7, 0)) chests.push({ ...p, id: `bau_${r.id}_${chests.length}`, loot: r.loot, kind: 'bau' });
    for (const p of pick(r, cfg.caixasPorRegiao?.[r.id] || 0, 5, 0)) crates.push({ ...p, id: `cx_${r.id}_${crates.length}`, loot: r.loot, kind: 'caixa' });
    const want = cfg.diretor?.pontosPorRegiao || 10;
    const got = pick(r, want, cfg.diretor?.espacoMinEntrePontos || 6, 1);
    if (got.length < want * 0.6) got.push(...pick(r, Math.ceil(want * 0.6) - got.length, 4, 0));
    for (const p of got) spawnPoints.push(p);
  }
  // baús especiais: fim da caverna e local secreto (loot alto), covil (lendário)
  chests.push({ x: 21, y: 3, region: 'floresta', id: 'bau_caverna', loot: 'alto', kind: 'bau', secret: true });
  chests.push({ x: 30, y: 39, region: 'floresta', id: 'bau_secreto', loot: 'lendario', kind: 'bau', secret: true });
  chests.push({ x: ec.x, y: ec.y, region: 'elite', id: 'bau_arena_elite', loot: 'alto', kind: 'bau' });
  for (const c of chests) if (!walkable(c.x, c.y)) c.unreachable = true;

  // —— relevo: altura por tile (região + morros na floresta + platô do lab + bacia do dragão), suavizado ——
  let hgt = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const r = regionOf(x, y); let h = r ? r.altura || 0 : 0;
    if (r?.id === 'floresta') h += (vnoise(x, y, seed + 3, 9) - 0.5) * 0.9;
    if (r?.id === 'complexo' && x >= 45 && x <= 55 && y >= 17 && y <= 26) h = 0.75;
    if (r?.id === 'dragao') h = -0.55 * Math.max(0, 1 - Math.hypot(x - dc.x, y - dc.y) / 16) + 0.05;
    if (r?.id === 'elite') h = 0.6;
    hgt[x + y * W] = h;
  }
  for (let pass = 0; pass < 4; pass++) {
    const nh = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let s = 0, n = 0; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (inb(x + a, y + b)) { s += hgt[x + a + (y + b) * W]; n++; } nh[x + y * W] = s / n; }
    hgt = nh;
  }
  for (let i = 0; i < hgt.length; i++) hgt[i] = Math.max(-0.6, Math.min(0.9, hgt[i]));
  const regionGrid = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) regionGrid[x + y * W] = regionOf(x, y)?.n || 0;

  const pois = [
    { id: 'poi_br_periferia', x: 15, y: 56, label: 'PERIFERIA', kind: 'regiao' },
    { id: 'poi_br_fabrica', x: 40, y: 51, label: 'RUÍNA DA FÁBRICA', kind: 'ruina' },
    { id: 'poi_br_torre', x: 51, y: 62, label: 'TORRE DE SINAL', kind: 'torre' },
    { id: 'poi_br_complexo', x: 50, y: 22, label: 'LABORATÓRIO', kind: 'complexo' },
    { id: 'poi_br_caverna', x: 24, y: 10, label: 'CAVERNA', kind: 'caverna' },
    { id: 'poi_br_elite', x: ec.x, y: ec.y, label: 'ARENA DE ELITE', kind: 'elite' },
    { id: 'poi_br_dragao', x: dc.x, y: dc.y, label: 'COVIL · GIGANTE VERDE', kind: 'dragao' },
    { id: 'poi_br_secreto', x: 30, y: 39, label: 'LOCAL SECRETO', kind: 'secreto', hidden: true }
  ];
  const tiles = g.map((row) => row.join(''));
  let walkN = 0; for (let i = 0; i < reach.length; i++) walkN += reach[i];
  return { W, H, tiles, heights: hgt, regionGrid, structures, chests, crates, spawnPoints, pois, reachable: reach, stats: { walkable: walkN, total: W * H, chests: chests.length, crates: crates.length, spawnPoints: spawnPoints.length, structures: structures.length } };
}

/** Zona injetada em runtime (zones.json intacto), mesmo formato do Campo. */
export function buildBrZone(cfg) {
  const m = generateBrMap(cfg);
  const z = cfg.zona;
  return {
    id: BR_ZONE_ID, code: z.code || 'BR', name: z.name || 'Arena Principal', risk: 0, playable: true, br: true,
    description: 'Arena principal: 6 regiões, monstros, loot, zona segura, extração e o Território do Dragão.',
    blocked_message: null,
    brMap: m,
    map: { width: m.W, height: m.H, tile_size: 48, spawn: { ...cfg.spawnHeroi }, tiles: m.tiles, legend: { ...BR_LEGEND }, poi: m.pois.filter((p) => !p.hidden).map((p) => ({ id: p.id, x: p.x, y: p.y, label: p.label })), exits: [] }
  };
}

/** Altura do chão (m) em coordenadas de tile float (bilinear) — mesma fonte para renderer e câmera. */
export function brHeightAt(m, fx, fy) {
  const W = m.W, H = m.H; const x = Math.max(0, Math.min(W - 1.001, fx - 0.5)); const y = Math.max(0, Math.min(H - 1.001, fy - 0.5));
  const ix = Math.floor(x), iy = Math.floor(y); const tx = x - ix, ty = y - iy; const h = m.heights;
  const a = h[ix + iy * W], b = h[ix + 1 + iy * W], c = h[ix + (iy + 1) * W], d = h[ix + 1 + (iy + 1) * W];
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}
export function brRegionAt(m, cfg, x, y) {
  const n = m.regionGrid[Math.floor(x) + Math.floor(y) * m.W] || 0;
  return cfg.regioes.find((r) => r.n === n) || null;
}
