/**
 * NEXARA — MASTER 10 · ARENA PRINCIPAL GRANDE: gerador v2 (determinístico, mesmo contrato do v1).
 * Usado quando data/arena_br.json → zona.escala > 1 (scaleBrConfig põe zona.gerador = 2).
 * Tudo é RELATIVO ao retângulo de cada região (escala livre: 2× = 200×152, 3,16× = 316×240):
 *  - muros nas faixas entre regiões, com passagens calculadas pela vizinhança (Elite: poucas e estreitas)
 *  - PERIFERIA: malha de ruas, casebres por quarteirão, praças, depósitos
 *  - RUÍNAS: blocos quebrados em grade com praças, torre(s), máquinas (pilares + tech), linhas de caixas
 *  - FLORESTA: árvores por ruído, trilhas ligando as entradas a clareiras, caverna principal + grutas, bolsões secretos
 *  - COMPLEXO: salas com portas (corredores entre elas), pátio do laboratório no centro
 *  - ELITE: platô, anel de pilares (arena), cobertura pesada
 *  - DRAGÃO: bacia, rochas nas bordas, entulho perto do covil
 * Devolve também `areas` (sub-áreas com função de jogo) para encontros/loot das próximas fases.
 */
export function generateBrMapV2(cfg, { BR_LEGEND, BR_SOLID, vnoise }) {
  const W = cfg.zona.width; const H = cfg.zona.height; const seed = cfg.zona.seed | 0; const S = cfg._escala || W / 100;
  let a0 = (seed ^ 0x9e3779b9) >>> 0;
  const R = () => { a0 = (a0 + 0x6D2B79F5) >>> 0; let t = a0; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const ri = (a, b) => a + Math.floor(R() * (b - a + 1));
  const g = Array.from({ length: H }, () => new Array(W).fill('W'));
  const inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  const set = (x, y, c) => { if (inb(x, y) && x > 0 && y > 0 && x < W - 1 && y < H - 1) g[y][x] = c; };
  const get = (x, y) => (inb(x, y) ? g[y][x] : 'W');
  const rect = (x0, y0, x1, y1, c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, c); };
  const box = (x0, y0, x1, y1, c = 'W') => { for (let x = x0; x <= x1; x++) { set(x, y0, c); set(x, y1, c); } for (let y = y0; y <= y1; y++) { set(x0, y, c); set(x1, y, c); } };
  const regions = cfg.regioes; const byId = Object.fromEntries(regions.map((r) => [r.id, r]));
  const regionOf = (x, y) => { for (const r of regions) if (x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1) return r; return null; };
  const FLOOR = { floresta: 'g', complexo: 'o' };
  const floorOf = (r) => FLOOR[r.id] || '.';
  const inR = (r, x, y, m = 0) => x >= r.x0 + m && x <= r.x1 - m && y >= r.y0 + m && y <= r.y1 - m;
  const D = (v) => Math.round(v * S); // coordenada de projeto (mapa 100×76) → mapa grande
  const structures = []; const areas = []; const chestsFixed = [];
  const area = (kind, r, x0, y0, x1, y1, extra = {}) => { const a = { id: `area_${kind}_${areas.length}`, kind, region: r.id, x0, y0, x1, y1, cx: Math.round((x0 + x1) / 2), cy: Math.round((y0 + y1) / 2), ...extra }; areas.push(a); return a; };

  // —— pisos ——
  for (const r of regions) rect(r.x0, r.y0, r.x1, r.y1, floorOf(r));
  // muros nas divisas: tile cuja vizinha (direita/baixo) é de outra região vira muro; Elite = muro duplo
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const r = regionOf(x, y); if (!r) continue;
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      const o = regionOf(x + dx, y + dy);
      if (o !== r) { set(x, y, 'W'); if (o && (o.id === 'elite' || r.id === 'elite')) set(x + dx, y + dy, 'W'); }
    }
  }

  // —— passagens entre regiões vizinhas (cruzam toda a faixa de muro) ——
  const gaps = [];
  for (let i = 0; i < regions.length; i++) for (let j = 0; j < regions.length; j++) {
    if (i === j) continue; const a = regions[i], b = regions[j];
    const elite = a.id === 'elite' || b.id === 'elite';
    // vizinho à direita
    if (b.x0 > a.x1 && b.x0 - a.x1 <= 6 && b.y0 <= a.y1 && b.y1 >= a.y0) {
      const y0 = Math.max(a.y0, b.y0) + 2, y1 = Math.min(a.y1, b.y1) - 2; const len = y1 - y0; if (len < 4) continue;
      const k = elite ? (S >= 2.5 ? 2 : 1) : Math.max(2, Math.round(len / 16)); const w = elite ? 2 : 3;
      for (let n = 0; n < k; n++) { const c = Math.round(y0 + (len * (n + 0.5)) / k + (R() - 0.5) * (len / k) * 0.5); for (let yy = c; yy < c + w; yy++) for (let xx = a.x1 - 2; xx <= b.x0 + 2; xx++) { const rr = regionOf(xx, yy); set(xx, yy, rr ? floorOf(rr) : '.'); } gaps.push({ x: a.x1 - 1, y: c + 1, ra: a.id, rb: b.id }, { x: b.x0 + 1, y: c + 1, ra: b.id, rb: a.id }); }
    }
    // vizinho abaixo
    if (b.y0 > a.y1 && b.y0 - a.y1 <= 6 && b.x0 <= a.x1 && b.x1 >= a.x0) {
      const x0 = Math.max(a.x0, b.x0) + 2, x1 = Math.min(a.x1, b.x1) - 2; const len = x1 - x0; if (len < 4) continue;
      const k = elite ? (S >= 2.5 ? 2 : 1) : Math.max(2, Math.round(len / 16)); const w = elite ? 2 : 3;
      for (let n = 0; n < k; n++) { const c = Math.round(x0 + (len * (n + 0.5)) / k + (R() - 0.5) * (len / k) * 0.5); for (let xx = c; xx < c + w; xx++) for (let yy = a.y1 - 2; yy <= b.y0 + 2; yy++) { const rr = regionOf(xx, yy); set(xx, yy, rr ? floorOf(rr) : '.'); } gaps.push({ x: c + 1, y: a.y1 - 1, ra: a.id, rb: b.id }, { x: c + 1, y: b.y0 + 1, ra: b.id, rb: a.id }); }
    }
  }
  const keepClear = (x, y, rad = 2) => { for (let b = -rad; b <= rad; b++) for (let a = -rad; a <= rad; a++) { const rr = regionOf(x + a, y + b); if (rr) set(x + a, y + b, floorOf(rr)); } };

  // —— 1 PERIFERIA ——
  { const r = byId.periferia; if (r) {
    for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) if ((x - r.x0) % 9 === 3 || (y - r.y0) % 8 === 2) set(x, y, '#');
    for (let by = r.y0 + 3; by + 4 <= r.y1; by += 8) for (let bx = r.x0 + 4; bx + 4 <= r.x1; bx += 9) {
      const x0 = bx + ri(0, 1), y0 = by + ri(0, 1); const x1 = Math.min(bx + 7, r.x1 - 1) - ri(0, 1), y1 = Math.min(by + 6, r.y1 - 1) - ri(0, 1);
      if (x1 - x0 < 3 || y1 - y0 < 3) continue;
      const roll = R();
      if (roll < 0.5) { // casebre com porta para a rua
        box(x0, y0, x1, y1); rect(x0 + 1, y0 + 1, x1 - 1, y1 - 1, '.'); const dx = ri(x0 + 1, x1 - 2); set(dx, y1, '.'); set(dx + 1, y1, '.');
        structures.push({ kind: 'casa', x0, y0, x1, y1, h: 2.6 + R() * 0.9 });
        if (R() < 0.18) area('casa_saque', r, x0 + 1, y0 + 1, x1 - 1, y1 - 1);
      } else if (roll < 0.62) { // depósito: galpão com 2 portas e caixas
        box(x0, y0, x1, y1); rect(x0 + 1, y0 + 1, x1 - 1, y1 - 1, '.'); set(x0, ri(y0 + 1, y1 - 1), '.'); set(x1, ri(y0 + 1, y1 - 1), '.');
        for (let k = 0; k < 3; k++) { const cx = ri(x0 + 1, x1 - 1), cy = ri(y0 + 1, y1 - 1); set(cx, cy, 'C'); }
        structures.push({ kind: 'casa', x0, y0, x1, y1, h: 3.6 }); area('deposito', r, x0 + 1, y0 + 1, x1 - 1, y1 - 1);
      } else if (roll < 0.78) { // praça: arbustos e caixas soltas
        for (let k = 0; k < 4; k++) set(ri(x0, x1), ri(y0, y1), R() < 0.5 ? 'b' : 'C'); area('praca', r, x0, y0, x1, y1);
      }
    }
  } }

  // —— 2 RUÍNAS INDUSTRIAIS ——
  { const r = byId.ruinas; if (r) {
    const towers = [];
    const cols = Math.floor((r.x1 - r.x0 - 3) / 7); const rows = Math.floor((r.y1 - r.y0 - 3) / 9);
    for (let by = 0; by < rows; by++) for (let bx = 0; bx < cols; bx++) {
      const x0 = r.x0 + 2 + bx * 7 + ri(0, 1); const y0 = r.y0 + 2 + by * 9 + ri(0, 1); const x1 = x0 + ri(4, 5); const y1 = y0 + ri(4, 5);
      if (x1 >= r.x1 - 1 || y1 >= r.y1 - 1) continue;
      const plaza = (bx % 4 === 2 && by % 3 === 1);
      if (plaza) { if (!towers.length || (S >= 2 && towers.length < Math.round(S))) { const tx = x0 + 2, ty = y0 + 2; rect(tx, ty, tx + 2, ty + 2, 'P'); structures.push({ kind: 'torre', x0: tx, y0: ty, x1: tx + 2, y1: ty + 2, h: 11 }); towers.push({ x: tx + 1, y: ty + 4 }); area('torre', r, x0, y0, x1, y1); } continue; }
      if (R() < 0.14) { // máquina: núcleo tech + pilares
        rect(x0 + 1, y0 + 1, x0 + 2, y0 + 2, 'o'); set(x0, y0, 'P'); set(x0 + 3, y0 + 3, 'P'); area('maquina', r, x0, y0, x0 + 3, y0 + 3); continue;
      }
      box(x0, y0, x1, y1);
      for (let k = 0; k < ri(2, 3); k++) { const side = ri(0, 3); const t = side < 2 ? ri(x0 + 1, x1 - 1) : ri(y0 + 1, y1 - 1); if (side === 0) set(t, y0, '~'); else if (side === 1) set(t, y1, '~'); else if (side === 2) set(x0, t, '~'); else set(x1, t, '~'); }
      rect(x0 + 1, y0 + 1, x1 - 1, y1 - 1, R() < 0.5 ? '.' : '~');
      structures.push({ kind: 'ruina', x0, y0, x1, y1, h: 2.2 + R() * 1.6 });
      if (R() < 0.12) area('ruina_saque', r, x0 + 1, y0 + 1, x1 - 1, y1 - 1);
    }
    const nCr = Math.round(((r.x1 - r.x0) * (r.y1 - r.y0)) / 70);
    for (let i = 0; i < nCr; i++) { const x = ri(r.x0 + 1, r.x1 - 1); const y = ri(r.y0 + 1, r.y1 - 1); const len = ri(2, 3); const hz = R() < 0.5; for (let k = 0; k < len; k++) { const xx = hz ? x + k : x; const yy = hz ? y : y + k; if (get(xx, yy) === '.' || get(xx, yy) === '~') set(xx, yy, 'C'); } }
    r._towers = towers;
  } }

  // —— 3 FLORESTA ——
  const carve = (pts, w = 1, fl = 'g') => {
    for (let i = 0; i < pts.length - 1; i++) {
      let [x, y] = pts[i]; const [tx, ty] = pts[i + 1];
      while (x !== tx || y !== ty) { for (let a = -w; a <= w; a++) for (let b = -w; b <= w; b++) { const c = get(x + a, y + b); if (c === 'T' || c === 'R' || c === 'b') set(x + a, y + b, fl); } if (x !== tx && (y === ty || R() < 0.5)) x += Math.sign(tx - x); else y += Math.sign(ty - y); }
    }
  };
  { const r = byId.floresta; if (r) {
    for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) {
      if (get(x, y) !== 'g') continue;
      const n = vnoise(x, y, seed, 6);
      const n2 = vnoise(x, y, seed + 11, 2.5); if ((n > 0.52 && R() < 0.7) || (n > 0.4 && n2 > 0.7 && R() < 0.5)) set(x, y, 'T'); else if (n < 0.2 && R() < 0.12) set(x, y, 'R'); else if (R() < 0.08) set(x, y, 'b');
    }
    // caverna principal (posição de projeto) + túnel
    const cv = { x0: D(18), y0: Math.max(r.y0 + 1, D(2)), x1: D(31), y1: D(9) };
    rect(cv.x0, cv.y0, cv.x1, cv.y1, 'R');
    const cmx = Math.round((cv.x0 + cv.x1) / 2);
    const tun = [[cmx, cv.y1 + 1], [cmx, cv.y1 - 2], [cv.x1 - 3, cv.y1 - 2], [cv.x1 - 3, cv.y0 + 2], [cv.x0 + 3, cv.y0 + 2], [cv.x0 + 3, cv.y0 + 1]];
    for (let i = 0; i < tun.length - 1; i++) { let [x, y] = tun[i]; const [tx, ty] = tun[i + 1]; while (x !== tx || y !== ty) { set(x, y, '.'); if (S >= 2) set(x + 1, y, '.'); if (x !== tx) x += Math.sign(tx - x); else y += Math.sign(ty - y); } set(tx, ty, '.'); }
    structures.push({ kind: 'caverna', x0: cv.x0, y0: cv.y0, x1: cv.x1, y1: cv.y1, h: 4.2 });
    const caveEnd = { x: cv.x0 + 3, y: cv.y0 + 1 }; const caveMouth = { x: cmx, y: cv.y1 + 1 };
    area('caverna', r, cv.x0, cv.y0, cv.x1, cv.y1, { main: true });
    chestsFixed.push({ x: caveEnd.x, y: caveEnd.y, region: r.id, id: 'bau_caverna', loot: 'alto', kind: 'bau', secret: true });
    // grutas extras (mapa maior): maciço pequeno com câmara
    const nGr = Math.max(0, Math.round(S * S / 3) - 1);
    for (let i = 0; i < nGr; i++) {
      const gx = ri(r.x0 + 6, r.x1 - 14), gy = ri(Math.max(r.y0 + 14, cv.y1 + 6), r.y1 - 12); if (Math.hypot(gx - D(29), gy - D(38)) < 14) continue;
      rect(gx, gy, gx + 8, gy + 6, 'R'); rect(gx + 2, gy + 2, gx + 6, gy + 4, '.'); rect(gx + 4, gy + 5, gx + 5, gy + 7, '.');
      structures.push({ kind: 'caverna', x0: gx, y0: gy, x1: gx + 8, y1: gy + 6, h: 3.4 }); area('gruta', r, gx + 2, gy + 2, gx + 6, gy + 4);
      chestsFixed.push({ x: gx + 4, y: gy + 3, region: r.id, id: `bau_gruta_${i}`, loot: 'medio', kind: 'bau', secret: true });
    }
    // clareiras
    const nCl = Math.max(2, Math.round(((r.x1 - r.x0) * (r.y1 - r.y0)) / 650));
    const clear = [];
    for (let i = 0; i < nCl * 3 && clear.length < nCl; i++) {
      const cx = ri(r.x0 + 6, r.x1 - 6), cy = ri(r.y0 + 6, r.y1 - 6); const rad = ri(3, 5);
      if (cx >= cv.x0 - 3 && cx <= cv.x1 + 3 && cy >= cv.y0 - 3 && cy <= cv.y1 + 3) continue;
      if (clear.some((c) => Math.hypot(c.x - cx, c.y - cy) < 12)) continue;
      for (let y = cy - rad; y <= cy + rad; y++) for (let x = cx - rad; x <= cx + rad; x++) if (Math.hypot(x - cx, y - cy) <= rad && regionOf(x, y) === r && ['T', 'b', 'R'].includes(get(x, y))) set(x, y, 'g');
      clear.push({ x: cx, y: cy }); area('clareira', r, cx - rad, cy - rad, cx + rad, cy + rad);
    }
    // trilhas: entradas → clareiras → boca da caverna (rede ligada)
    const hubs = [...gaps.filter((q) => q.ra === r.id), ...clear, caveMouth];
    for (let i = 1; i < hubs.length; i++) { let best = hubs[0], bd = 1e9; for (let j = 0; j < i; j++) { const d = Math.hypot(hubs[j].x - hubs[i].x, hubs[j].y - hubs[i].y); if (d < bd) { bd = d; best = hubs[j]; } } carve([[hubs[i].x, hubs[i].y], [best.x, best.y]], 1); }
    // local secreto principal (posição de projeto): bolsão de árvores com 1 abertura estreita
    const sx = D(29), sy = D(38);
    rect(sx - 3, sy - 3, sx + 3, sy + 3, 'T'); rect(sx - 1, sy - 1, sx + 2, sy + 2, 'g'); set(sx - 2, sy, 'g'); set(sx - 3, sy, 'g'); set(sx - 4, sy, 'g');
    area('secreto', r, sx - 1, sy - 1, sx + 2, sy + 2, { hidden: true, main: true });
    chestsFixed.push({ x: sx + 1, y: sy + 1, region: r.id, id: 'bau_secreto', loot: 'lendario', kind: 'bau', secret: true });
    r._secret = { x: sx + 1, y: sy + 1 }; r._cave = caveMouth; r._clear = clear;
  } }

  // —— 4 COMPLEXO ABANDONADO ——
  { const r = byId.complexo; if (r) {
    const cols = Math.floor((r.x1 - r.x0 - 1) / 10); const rows = Math.floor((r.y1 - r.y0 - 1) / 8);
    const lab = { x: Math.round((r.x0 + r.x1) / 2), y: Math.round((r.y0 + r.y1) / 2) };
    for (let ry = 0; ry < rows; ry++) for (let rx = 0; rx < cols; rx++) {
      const x0 = r.x0 + 1 + rx * 10; const y0 = r.y0 + 1 + ry * 8; const x1 = x0 + 7; const y1 = y0 + 6;
      if (x1 >= r.x1 || y1 >= r.y1) continue;
      if (Math.abs((x0 + x1) / 2 - lab.x) < 9 && Math.abs((y0 + y1) / 2 - lab.y) < 7) continue; // pátio do laboratório
      if (R() < 0.08) continue; // corredor largo
      box(x0, y0, x1, y1);
      const doors = [[ri(x0 + 2, x1 - 3), y0, 'h'], [ri(x0 + 2, x1 - 3), y1, 'h'], [x0, ri(y0 + 2, y1 - 3), 'v'], [x1, ri(y0 + 2, y1 - 3), 'v']];
      const nd = ri(2, 3);
      for (let k = 0; k < nd; k++) { const d = doors.splice(ri(0, doors.length - 1), 1)[0]; if (d[2] === 'h') { set(d[0], d[1], 'o'); set(d[0] + 1, d[1], 'o'); } else { set(d[0], d[1], 'o'); set(d[0], d[1] + 1, 'o'); } }
      structures.push({ kind: 'sala', x0, y0, x1, y1, h: 3.4 });
      if (R() < 0.15) area('sala_fechada', r, x0 + 1, y0 + 1, x1 - 1, y1 - 1);
    }
    for (const [dx, dy] of [[-3, -3], [3, -3], [-3, 2], [3, 2]]) set(lab.x + dx, lab.y + dy, 'P');
    area('laboratorio', r, lab.x - 5, lab.y - 4, lab.x + 5, lab.y + 4, { main: true });
    r._lab = lab;
  } }

  // —— 5 ZONA DE ELITE ——
  { const r = byId.elite; if (r) {
    const ec = { x: Math.round((r.x0 + r.x1) / 2), y: Math.round((r.y0 + r.y1) / 2) };
    for (let a = 0; a < 12; a++) { const ang = (a / 12) * Math.PI * 2; const x = Math.round(ec.x + Math.cos(ang) * 8); const y = Math.round(ec.y + Math.sin(ang) * 6.5); if (a % 3 !== 0) set(x, y, 'P'); }
    const nCr = Math.round(((r.x1 - r.x0) * (r.y1 - r.y0)) / 110);
    for (let i = 0; i < nCr; i++) { const x = ri(r.x0 + 2, r.x1 - 2); const y = ri(r.y0 + 2, r.y1 - 2); if (Math.hypot(x - ec.x, y - ec.y) > 10 && get(x, y) === '.') { set(x, y, 'C'); if (R() < 0.5) set(x + 1, y, 'C'); } }
    area('arena_elite', r, ec.x - 8, ec.y - 6, ec.x + 8, ec.y + 6, { main: true });
    // zonas de risco extras (anéis menores) no mapa grande
    const nRisk = Math.max(0, Math.round(S) - 1);
    for (let i = 0; i < nRisk; i++) { const x = ri(r.x0 + 8, r.x1 - 8), y = ri(r.y0 + 7, r.y1 - 7); if (Math.hypot(x - ec.x, y - ec.y) < 18) continue; for (let a = 0; a < 8; a++) { const ang = (a / 8) * Math.PI * 2; if (a % 2) set(Math.round(x + Math.cos(ang) * 5), Math.round(y + Math.sin(ang) * 4), 'P'); } area('risco', r, x - 5, y - 4, x + 5, y + 4); }
    r._ec = ec;
  } }

  // —— 6 TERRITÓRIO DO DRAGÃO ——
  const dc = cfg.dragao;
  { const r = byId.dragao; if (r) {
    const R0 = 15 * Math.min(S, 2);
    for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) {
      if (get(x, y) !== '.') continue;
      const d = Math.hypot(x - dc.x, (y - dc.y) * 1.2);
      if (d > R0 && vnoise(x, y, seed + 7, 4) > 0.68) set(x, y, 'R'); else if (d < R0 * 0.8 && R() < 0.05) set(x, y, '~');
    }
    area('covil', r, dc.x - 6, dc.y - 6, dc.x + 6, dc.y + 6, { main: true });
  } }

  // passagens sempre livres
  for (const q of gaps) keepClear(q.x, q.y, 2);
  const sp = cfg.spawnHeroi; keepClear(sp.x, sp.y, 2);

  // —— alcance (BFS) + garantia: toda região ligada ——
  const solid = (c) => BR_SOLID.has(BR_LEGEND[c] || 'floor');
  let reach = null;
  const bfs = () => { const rc = new Uint8Array(W * H); const q = [sp.x + sp.y * W]; rc[q[0]] = 1; while (q.length) { const i = q.pop(); const x = i % W; const y = (i / W) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; const j = nx + ny * W; if (inb(nx, ny) && !rc[j] && !solid(g[ny][nx])) { rc[j] = 1; q.push(j); } } } return rc; };
  reach = bfs();
  for (let pass = 0; pass < 3; pass++) {
    let fixed = 0;
    for (const r of regions) {
      let floor = 0, ok = 0; for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) if (!solid(g[y][x])) { floor++; if (reach[x + y * W]) ok++; }
      if (floor && ok / floor < 0.85) {
        // liga ilhas: para cada tile livre não alcançado (amostrado), cava até o alcançado mais próximo
        for (let y = r.y0; y <= r.y1; y += 3) for (let x = r.x0; x <= r.x1; x += 3) {
          if (solid(g[y][x]) || reach[x + y * W]) continue;
          let best = null, bd = 1e9; for (let yy = Math.max(r.y0, y - 12); yy <= Math.min(r.y1, y + 12); yy++) for (let xx = Math.max(r.x0, x - 12); xx <= Math.min(r.x1, x + 12); xx++) if (reach[xx + yy * W]) { const d = Math.abs(xx - x) + Math.abs(yy - y); if (d < bd) { bd = d; best = [xx, yy]; } }
          if (best) { let cx = x, cy = y; while (cx !== best[0] || cy !== best[1]) { if (solid(g[cy][cx])) set(cx, cy, floorOf(r)); if (cx !== best[0]) cx += Math.sign(best[0] - cx); else cy += Math.sign(best[1] - cy); } fixed++; }
        }
      }
    }
    if (!fixed) break; reach = bfs();
  }
  const walkable = (x, y) => inb(x, y) && reach[x + y * W] === 1;
  const openAround = (x, y, r = 1) => { for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) if (!walkable(x + a, y + b)) return false; return true; };

  // —— baús, caixas, pontos de spawn ——
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
  const ec = byId.elite?._ec || { x: D(82), y: D(61) };
  chests.push(...chestsFixed);
  chests.push({ x: ec.x, y: ec.y, region: 'elite', id: 'bau_arena_elite', loot: 'alto', kind: 'bau' });
  // baús fixos isolados (gruta tapada por árvores): abre trilha até o tile alcançável mais próximo da mesma região
  let carved = false;
  for (const c of chestsFixed) {
    if (walkable(c.x, c.y)) continue;
    const r = byId[c.region]; let best = null, bd = 1e9;
    for (let yy = Math.max(1, c.y - 30); yy <= Math.min(H - 2, c.y + 30); yy++) for (let xx = Math.max(1, c.x - 30); xx <= Math.min(W - 2, c.x + 30); xx++) {
      if (!reach[xx + yy * W] || regionOf(xx, yy) !== r) continue; const d = Math.abs(xx - c.x) + Math.abs(yy - c.y); if (d < bd) { bd = d; best = [xx, yy]; }
    }
    if (!best) continue;
    let x = c.x, y = c.y; const fl = floorOf(r);
    while (x !== best[0] || y !== best[1]) { if (solid(g[y][x]) && g[y][x] !== 'W') set(x, y, fl); else if (g[y][x] === 'W' && regionOf(x, y) === r) set(x, y, fl); if (x !== best[0]) x += Math.sign(best[0] - x); else y += Math.sign(best[1] - y); }
    carved = true;
  }
  if (carved) reach = bfs();
  for (const c of chests) if (!walkable(c.x, c.y)) c.unreachable = true;

  // —— relevo ——
  const lab = byId.complexo?._lab;
  let hgt = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const r = regionOf(x, y); let h = r ? r.altura || 0 : 0;
    if (r?.id === 'floresta') h += (vnoise(x, y, seed + 3, 9 * Math.min(S, 2)) - 0.5) * 0.9;
    if (r?.id === 'complexo' && lab && Math.abs(x - lab.x) <= 5 && Math.abs(y - lab.y) <= 4) h = 0.75;
    if (r?.id === 'dragao') h = -0.55 * Math.max(0, 1 - Math.hypot(x - dc.x, y - dc.y) / (16 * Math.min(S, 2))) + 0.05;
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

  const per = byId.periferia; const ru = byId.ruinas;
  const tw = ru?._towers?.[0] || { x: D(51), y: D(62) };
  const fab = structures.find((s) => s.kind === 'ruina') || { x0: D(38), y0: D(49), x1: D(42), y1: D(53) };
  const pois = [
    { id: 'poi_br_periferia', x: per ? Math.round((per.x0 + per.x1) / 2) : D(15), y: per ? Math.round((per.y0 + per.y1) / 2) : D(56), label: 'PERIFERIA', kind: 'regiao' },
    { id: 'poi_br_fabrica', x: Math.round((fab.x0 + fab.x1) / 2), y: fab.y1 + 1, label: 'RUÍNA DA FÁBRICA', kind: 'ruina' },
    { id: 'poi_br_torre', x: tw.x, y: tw.y, label: 'TORRE DE SINAL', kind: 'torre' },
    { id: 'poi_br_complexo', x: lab ? lab.x : D(50), y: lab ? lab.y : D(22), label: 'LABORATÓRIO', kind: 'complexo' },
    { id: 'poi_br_caverna', x: byId.floresta?._cave?.x ?? D(24), y: byId.floresta?._cave?.y ?? D(10), label: 'CAVERNA', kind: 'caverna' },
    { id: 'poi_br_elite', x: ec.x, y: ec.y, label: 'ARENA DE ELITE', kind: 'elite' },
    { id: 'poi_br_dragao', x: dc.x, y: dc.y, label: 'COVIL · GIGANTE VERDE', kind: 'dragao' },
    { id: 'poi_br_secreto', x: byId.floresta?._secret?.x ?? D(30), y: byId.floresta?._secret?.y ?? D(39), label: 'LOCAL SECRETO', kind: 'secreto', hidden: true }
  ];
  for (const r of regions) { delete r._towers; delete r._secret; delete r._cave; delete r._clear; delete r._lab; delete r._ec; }
  const tiles = g.map((row) => row.join(''));
  let walkN = 0; for (let i = 0; i < reach.length; i++) walkN += reach[i];
  return { W, H, tiles, heights: hgt, regionGrid, structures, chests, crates, spawnPoints, pois, areas, gaps, reachable: reach, gerador: 2, escala: S,
    stats: { walkable: walkN, total: W * H, chests: chests.length, crates: crates.length, spawnPoints: spawnPoints.length, structures: structures.length, areas: areas.length, gaps: gaps.length / 2 } };
}
