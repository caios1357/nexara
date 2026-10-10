/**
 * NEXARA FAST ⚡ — modo compacto da Arena: as MESMAS 6 regiões do mapa grande (Periferia, Ruínas, Floresta,
 * Complexo, Elite, Território do Dragão), com a POSIÇÃO de cada região SORTEADA por partida (seed),
 * gerada pelo mesmo gerador v2 (br-map-v2) em escala menor, com a mesma checagem de alcance (BFS).
 * 10 RIVAIS (BOT) — IA local, sem rede. Zona segura mais rápida (partida ~6–10 min).
 * A ARENA NEXARA (mapa completo) continua exatamente igual: este módulo só cria uma CÓPIA da config.
 */
import { scaleBrConfig } from './br-map.js?v=20261009berco';

function rng32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** seed da partida: ?fastSeed=N fixa (testes); senão sorteia */
export function fastSeed() {
  try { const q = new URLSearchParams(globalThis.location?.search || '').get('fastSeed'); if (q && Number.isFinite(Number(q))) return Number(q) >>> 0; } catch { /* sem URL */ }
  return ((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0) || 1;
}

/** distrito (região do mapa grande) sorteado pela seed; ?fastDistrito=<id> fixa (testes) */
export function fastDistrictId(design, seed) {
  const ids = design.regioes.map((r) => r.id);
  try { const q = new URLSearchParams(globalThis.location?.search || '').get('fastDistrito'); if (q && ids.includes(q)) return q; } catch { /* sem URL */ }
  const R = rng32((seed ^ 0x51ed270b) >>> 0);
  return ids[Math.floor(R() * ids.length)];
}

/**
 * NEXARA FAST ⚡ (20261009fast3): a partida acontece em UM ÚNICO DISTRITO do mapa grande, sorteado por partida (seed).
 * O distrito mantém a identidade/layout do mapa grande (mesmo gerador v2, mesma região: ruas da Periferia, ruínas, floresta+caverna,
 * salas do Complexo, platô da Elite, bacia do Dragão) num mapa só dele (≤ ~90 tiles), com a mesma checagem de alcance (BFS).
 *
 * @param {object} design data.arena_br no tamanho de PROJETO (100×76, antes de scaleBrConfig)
 * @param {number} seed
 */
export function makeFastConfig(design, seed) {
  const F = design.fast || {};
  const c = JSON.parse(JSON.stringify(design));
  delete c._escala; delete c._design;
  const did = fastDistrictId(design, seed);
  const DF = (F.distritos || {})[did] || {};
  const reg = c.regioes.find((r) => r.id === did);
  const w = reg.x1 - reg.x0 + 1, h = reg.y1 - reg.y0 + 1; // tamanho do distrito em unidades de PROJETO
  const ox = reg.x0 - 1, oy = reg.y0 - 1;                  // deslocamento: distrito vai para (1,1)
  const mv = (x, y) => ({ x: Math.max(1, Math.min(w, x - ox)), y: Math.max(1, Math.min(h, y - oy)) });
  const S = DF.escala || F.escala || 2;
  // só o distrito sorteado; mesmo id/cor/loot/densidade/risco/monstros (identidade) e o mesmo `n` (grade de regiões)
  c.regioes = [{ ...reg, x0: 1, y0: 1, x1: w, y1: h }];
  c.zona.width = w + 2; c.zona.height = h + 2;
  // herói nasce na borda sul-oeste do distrito (fração por distrito); o gerador mantém a área livre
  const sf = DF.spawn || { fx: 0.12, fy: 0.9 };
  c.spawnHeroi = { x: Math.max(2, Math.round(1 + sf.fx * (w - 1))), y: Math.max(2, Math.round(1 + sf.fy * (h - 1))) };
  // rotas: uma só (o distrito)
  c.rotas = [{ id: 'D', nome: `Distrito — ${reg.nome}`, via: [did] }];
  c.bausPorRegiao = { [did]: c.bausPorRegiao[did] }; c.caixasPorRegiao = { [did]: c.caixasPorRegiao[did] };
  if (DF.baus != null) c.bausPorRegiao[did] = DF.baus; if (DF.caixas != null) c.caixasPorRegiao[did] = DF.caixas;
  // dragão: só o Território do Dragão tem o covil; nos outros distritos não há chefe (estágio 2: cada distrito ganha o seu gigante)
  const d = c.dragao; const t = d.territorio;
  if (did === 'dragao') { const dp = mv(d.x, d.y), t0 = mv(t.x0, t.y0), t1 = mv(t.x1, t.y1); d.x = dp.x; d.y = dp.y; d.territorio = { x0: Math.min(t0.x, t1.x), x1: Math.max(t0.x, t1.x), y0: Math.min(t0.y, t1.y), y1: Math.max(t0.y, t1.y) }; }
  else { d.desativado = true; d.x = Math.round(w / 2); d.y = Math.round(h / 2); d.territorio = { x0: 1, x1: w, y0: 1, y1: h }; }
  c.extracao.pontos = [];
  // zona segura (em TILES finais; scaleBrConfig multiplica por S → divide aqui)
  c.zonaSegura.centro = { x: Math.round(1 + w / 2), y: Math.round(1 + h / 2) };
  // zona segura mais curta (partida ~6–10 min): raios/tempos do `fast.zonaSegura` são em TILES/ms FINAIS → divide por S (scaleBrConfig multiplica)
  const Z = F.zonaSegura || {}; const z = c.zonaSegura;
  if (Z.inicioMs != null) z.inicioMs = Math.round(Z.inicioMs / S); if (Z.avisoMs != null) z.avisoMs = Z.avisoMs;
  const ZR = (DF.zonaRaios || Z.raios);
  if (Array.isArray(Z.estagios)) z.estagios = Z.estagios.map((e, i) => ({ raio: Math.max(3, Math.round((ZR?.[i] ?? e.raio) / S)), duracaoMs: Math.round(e.duracaoMs / S) }));
  if (F.eventos) Object.assign(c.eventos, F.eventos);
  if (F.extracao) Object.assign(c.extracao, F.extracao);
  // sem EXTRAÇÃO no FAST: a partida só termina quando o último herói cai (sem pontos, sem fim por extração, sem HUD de extração)
  if (F.semExtracao) { c.extracao.pontos = []; c.extracao.desativada = true; }
  // 10 rivais (BOT) — contam no teto de densidade do diretor e usam o LOD de IA
  c.rivais.n = F.rivais ?? 10; c.rivais.nMax = Math.max(c.rivais.n, c.rivais.nMax || 5);
  if (F.rivaisDistInicialMin != null) c.rivais.distInicialMin = F.rivaisDistInicialMin;
  if (Array.isArray(F.herois) && F.herois.length) c.rivais.herois = F.herois.map((h) => ({ ...h })); // 10 nomes do FAST
  c.rivais.lutamSempre = !!F.rivaisLutamSempre;   // rivais se enfrentam a partida toda (não só com a zona fechando)
  c.rivais.nivelProprio = !!F.rivaisNivelProprio; // nível próprio: começam no NV1 e sobem com XP de monstros/rivais
  c.rivais.xpMult = F.rivaisXpMult ?? 1;
  if (F.rivaisSaque) Object.assign(c.rivais.saque, F.rivaisSaque);
  // RIVAIS MAIS FORTES no FAST (HP/ataque, reação mais rápida, esquiva/bloqueio, pressão em grupo)
  if (F.rivaisForca) c.rivais.forca = { ...(c.rivais.forca || {}), ...F.rivaisForca };
  if (F.rivaisTatica) c.rivais.tatica = { ...F.rivaisTatica };
  c.lodIa = { ...(c.lodIa || {}), perto: 11, medio: 20 }; // 20261009leve: mapa pequeno + 10 rivais → IA completa só bem perto (menos CPU no celular)
  if (F.rivaisAlvo) c.rivais.alvo = { ...F.rivaisAlvo }; // 20261009leve: rivais escolhem o alvo entre TODOS os heróis (herói do jogador = só mais um)
  if (F.campeaoGatilhoEstagio != null) c.rivais.campeao = { ...(c.rivais.campeao || {}), gatilhoEstagio: F.campeaoGatilhoEstagio }; // FAST: o 'campeão' não vira todos contra o herói no estágio 3 (só com 1 rival restante)
  if (F.espectador) c.rivais.espectador = { ...F.espectador };
  if (F.rivaisCombate) c.rivais.combate = { ...c.rivais.combate, ...F.rivaisCombate }; // ritmo das eliminações entre rivais (não zerar a partida antes do herói chegar)
  if (F.rivaisCacaDist != null) c.rivais.cacaRivalDist = F.rivaisCacaDist;
  if (F.rivaisElim) { c.rivais.elimPrimeiraMs = F.rivaisElim.primeiraMs; c.rivais.elimIntervaloMs = F.rivaisElim.intervaloMs; c.rivais.elimEspectadorMs = F.rivaisElim.espectadorMs; }
  c.rivais.fimUltimoHeroi = true; // vitória = todos os rivais mortos; morte do jogador com ≥ 2 rivais vivos = espectador até sobrar 1
  c.zona.seed = seed >>> 0; c.zona.escala = S; c.zona.name = `NEXARA FAST · ${reg.nome}`;
  if (F.fatorConteudo) c.zona.fatorConteudo = F.fatorConteudo;
  c.fastRun = { seed: seed >>> 0, distrito: did, distritoNome: reg.nome, cor: reg.cor, order: [did], slots: [0] };
  return scaleBrConfig(c, c.zona.escala);
}
