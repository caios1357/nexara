/**
 * NEXARA FAST ⚡ — modo compacto da Arena: as MESMAS 6 regiões do mapa grande (Periferia, Ruínas, Floresta,
 * Complexo, Elite, Território do Dragão), com a POSIÇÃO de cada região SORTEADA por partida (seed),
 * gerada pelo mesmo gerador v2 (br-map-v2) em escala menor, com a mesma checagem de alcance (BFS).
 * 10 RIVAIS (BOT) — IA local, sem rede. Zona segura mais rápida (partida ~6–10 min).
 * A ARENA NEXARA (mapa completo) continua exatamente igual: este módulo só cria uma CÓPIA da config.
 */
import { scaleBrConfig } from './br-map.js?v=20261009fast';

function rng32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** seed da partida: ?fastSeed=N fixa (testes); senão sorteia */
export function fastSeed() {
  try { const q = new URLSearchParams(globalThis.location?.search || '').get('fastSeed'); if (q && Number.isFinite(Number(q))) return Number(q) >>> 0; } catch { /* sem URL */ }
  return ((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0) || 1;
}

/**
 * @param {object} design data.arena_br no tamanho de PROJETO (100×76, antes de scaleBrConfig)
 * @param {number} seed
 */
export function makeFastConfig(design, seed) {
  const F = design.fast || {};
  const c = JSON.parse(JSON.stringify(design));
  delete c._escala; delete c._design;
  const R = rng32(seed ^ 0x2f6b1d3);
  const orig = c.regioes.map((r) => ({ id: r.id, x0: r.x0, x1: r.x1, y0: r.y0, y1: r.y1 }));
  // embaralha as 6 posições (Fisher–Yates); garante que a ordem mude de verdade em relação ao mapa grande
  const perm = orig.map((_, i) => i);
  for (let i = perm.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  if (perm.every((v, i) => v === i)) [perm[0], perm[perm.length - 1]] = [perm[perm.length - 1], perm[0]];
  c.regioes.forEach((r, i) => { const s = orig[perm[i]]; r.x0 = s.x0; r.x1 = s.x1; r.y0 = s.y0; r.y1 = s.y1; });
  const idxOf = (x, y) => orig.findIndex((s) => x >= s.x0 && x <= s.x1 && y >= s.y0 && y <= s.y1);
  // ponto (coordenada de projeto) → mesma posição RELATIVA dentro da nova posição da sua região
  const move = (x, y, iHint = -1) => {
    const i = iHint >= 0 ? iHint : idxOf(x, y); if (i < 0) return { x, y };
    const a = orig[i], b = c.regioes[i];
    const fx = (x - a.x0) / Math.max(1, a.x1 - a.x0), fy = (y - a.y0) / Math.max(1, a.y1 - a.y0);
    return { x: Math.round(b.x0 + fx * (b.x1 - b.x0)), y: Math.round(b.y0 + fy * (b.y1 - b.y0)) };
  };
  const sp = move(c.spawnHeroi.x, c.spawnHeroi.y); c.spawnHeroi = sp;
  const iD = c.regioes.findIndex((r) => r.id === 'dragao');
  const d = c.dragao; const dp = move(d.x, d.y, iD); const t = d.territorio;
  const t0 = move(t.x0, t.y0, iD), t1 = move(t.x1, t.y1, iD);
  d.x = dp.x; d.y = dp.y; d.territorio = { x0: Math.min(t0.x, t1.x), x1: Math.max(t0.x, t1.x), y0: Math.min(t0.y, t1.y), y1: Math.max(t0.y, t1.y) };
  for (const p of c.extracao?.pontos || []) { const q = move(p.x, p.y); p.x = q.x; p.y = q.y; }
  // zona segura: mais curta (partida ~6–10 min); centro no meio do mapa (fecha em direção ao centro do sorteio)
  const Z = F.zonaSegura || {}; const z = c.zonaSegura;
  if (Z.inicioMs != null) z.inicioMs = Z.inicioMs; if (Z.avisoMs != null) z.avisoMs = Z.avisoMs;
  if (Array.isArray(Z.estagios)) z.estagios = Z.estagios.map((e) => ({ ...e }));
  if (Z.centro) z.centro = { ...Z.centro };
  if (F.eventos) Object.assign(c.eventos, F.eventos);
  if (F.extracao) Object.assign(c.extracao, F.extracao);
  // 10 rivais (BOT) — contam no teto de densidade do diretor e usam o LOD de IA
  c.rivais.n = F.rivais ?? 10; c.rivais.nMax = Math.max(c.rivais.n, c.rivais.nMax || 5);
  if (F.rivaisDistInicialMin != null) c.rivais.distInicialMin = F.rivaisDistInicialMin;
  if (Array.isArray(F.herois) && F.herois.length) c.rivais.herois = F.herois.map((h) => ({ ...h })); // 10 nomes do FAST
  c.rivais.lutamSempre = !!F.rivaisLutamSempre;   // rivais se enfrentam a partida toda (não só com a zona fechando)
  c.rivais.nivelProprio = !!F.rivaisNivelProprio; // nível próprio: começam no NV1 e sobem com XP de monstros/rivais
  c.rivais.xpMult = F.rivaisXpMult ?? 1;
  if (F.rivaisSaque) Object.assign(c.rivais.saque, F.rivaisSaque);
  c.zona.seed = seed >>> 0; c.zona.escala = F.escala || 1.3; c.zona.name = 'NEXARA FAST';
  if (F.fatorConteudo) c.zona.fatorConteudo = F.fatorConteudo;
  const bySlot = []; perm.forEach((sl, i) => { bySlot[sl] = c.regioes[i].id; }); // posição (na ordem do mapa completo) → região sorteada
  c.fastRun = { seed: seed >>> 0, order: bySlot, slots: perm.slice() };
  return scaleBrConfig(c, c.zona.escala);
}
