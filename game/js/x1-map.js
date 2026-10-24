/**
 * NEXARA X1 ⚔ — ARENA PEQUENA 1×1 (offline). Mapa fixo 24×18 tiles (48×36 m), simétrico: borda, 4 pilares,
 * 4 muretas baixas (h 1,1 m = cobertura sem tapar a visão por cima) e 6 caixas. Região única = Zona de Elite (arte da folha Elite).
 * Sem baús/caixas de saque/POIs/zona segura/extração/dragão. Herói nasce à esquerda, rival à direita (espelhado).
 */
export const X1_W = 24, X1_H = 18;
export const X1_SPAWNS = [{ x: 2, y: 9 }, { x: 21, y: 8 }];
const LAYOUT = [
  // muretas (W baixas): [x0,y0,x1,y1]
  ['M', 9, 3, 14, 3], ['M', 9, 14, 14, 14], ['M', 4, 7, 4, 10], ['M', 19, 7, 19, 10],
  // pilares
  ['P', 6, 4], ['P', 17, 4], ['P', 6, 13], ['P', 17, 13],
  // caixas
  ['C', 11, 8], ['C', 12, 9], ['C', 8, 6], ['C', 15, 11], ['C', 8, 11], ['C', 15, 6]
];
export function generateX1Map(cfg, { BR_LEGEND, BR_SOLID }) {
  const W = X1_W, H = X1_H;
  const g = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => (x === 0 || y === 0 || x === W - 1 || y === H - 1 ? 'W' : '.')));
  const structures = [];
  for (const it of LAYOUT) {
    if (it[0] === 'M') { const [, x0, y0, x1, y1] = it; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g[y][x] = 'W'; structures.push({ kind: 'mureta', x0, y0, x1, y1, h: 1.1 }); }
    else g[it[2]][it[1]] = it[0];
  }
  const reg = cfg.regioes[0]; const regionGrid = new Uint8Array(W * H);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) regionGrid[x + y * W] = reg?.n || 5;
  const heights = new Float32Array(W * H);
  const solid = (x, y) => BR_SOLID.has(BR_LEGEND[g[y][x]] || 'floor');
  const reach = new Uint8Array(W * H); const q = [X1_SPAWNS[0].x + X1_SPAWNS[0].y * W]; reach[q[0]] = 1;
  while (q.length) { const i = q.pop(); const x = i % W, y = (i / W) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; const j = nx + ny * W; if (nx > 0 && ny > 0 && nx < W - 1 && ny < H - 1 && !reach[j] && !solid(nx, ny)) { reach[j] = 1; q.push(j); } } }
  const spawnPoints = X1_SPAWNS.map((p) => ({ x: p.x, y: p.y, region: reg?.id || 'elite' }));
  const tiles = g.map((r) => r.join(''));
  let walkN = 0; for (let i = 0; i < reach.length; i++) walkN += reach[i];
  return { W, H, tiles, heights, regionGrid, structures, chests: [], crates: [], spawnPoints, pois: [], areas: [], gaps: [], reachable: reach, x1: true,
    stats: { walkable: walkN, total: W * H, chests: 0, crates: 0, spawnPoints: 2, structures: structures.length } };
}

/** Config do X1 a partir da config FAST já escalada (mesmas regras de combate/tática/poderes da PARTIDA JUSTA) */
export function makeX1Config(fastCfg, opts = {}) {
  const c = JSON.parse(JSON.stringify(fastCfg));
  const elite = opts.eliteRegion || c.regioes.find((r) => r.id === "elite") || c.regioes[0];
  c.x1 = { melhorDe: 3, rodadaPausaMs: 2600, contagemMs: 2000, recompensaMcb: opts.recompensaMcb ?? 0 };
  c.regioes = [{ ...elite, id: 'elite', nome: 'Arena X1', n: elite?.n || 5, cor: elite?.cor || '#ffc830', x0: 1, y0: 1, x1: X1_W - 2, y1: X1_H - 2 }];
  c.zona = { ...c.zona, gerador: 'x1', width: X1_W, height: X1_H, seed: 1, name: 'NEXARA X1 ⚔' };
  c.spawnHeroi = { ...X1_SPAWNS[0] };
  delete c.fastRun; c.rotas = [{ id: 'X1', nome: 'X1', via: ['elite'] }];
  c.bausPorRegiao = { elite: 0 }; c.caixasPorRegiao = { elite: 0 };
  c.dragao = { ...c.dragao, desativado: true, x: 12, y: 9, territorio: { x0: 1, x1: X1_W - 2, y0: 1, y1: X1_H - 2 } };
  c.zonaSegura = { ...c.zonaSegura, ativa: false, centro: { x: 12, y: 9 }, inicioMs: 1e12, estagios: [{ raio: 999, duracaoMs: 1e12 }] };
  c.eventos = { ...(c.eventos || {}), primeiroMs: 1e12 };
  c.extracao = { ...(c.extracao || {}), pontos: [], desativada: true };
  c.gigantesElementais = { ...(c.gigantesElementais || {}), ativo: false, enabled: false };
  c.diretor = { ...c.diretor, maxVivos: { low: 0, medium: 0, high: 0 }, pontosPorRegiao: 0 };
  const R = c.rivais; R.n = 1; R.nMax = 1; R.distInicialMin = 8; R.justa = true; R.nivelProprio = true; R.xpMult = 0; R.bb = false;
  R.forca = { hpMult: 1, atkMult: 1, _doc: 'X1: atributos iguais (NV1, arma básica) — a dificuldade vem só da IA' };
  // reações quase perfeitas (CHANCE de reagir), mas MESMAS recargas/duração do FAST — sem trapaça de atributo
  R.tatica = { ...(R.tatica || {}), esquivaChance: 0.85, bloqueioChance: 0.6, aggro: 30 };
  R.alvo = { ...(R.alvo || {}), jogadorAlcance: 40, perdeR: 60, compromissoJogadorMs: 1e9 };
  R.fimUltimoHeroi = false; R.lutamSempre = false; delete R.pisoVivos; delete R.cacaRivalDist;
  c.spawnAleatorio = false; c.lodIa = { ...(c.lodIa || {}), perto: 40, medio: 60 };
  return c;
}
