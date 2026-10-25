/**
 * NEXARA — 20261024apex: ELENCO DA PARTIDA (50 jogadores = você + 49 RIVAIS BOT offline).
 * Gera, antes da queda, a lista dos rivais (nome único, personagem entre os 9, skin elemental, cor, personalidade,
 * nível relativo ≥ 0 — rival nunca mais fraco que o herói). O LOBBY mostra exatamente esta lista e o spawn usa a mesma.
 * Puramente local (sem rede, sem backend). Não altera data/*.json: os 30 nomes de lá vêm primeiro; o resto sai daqui.
 */
import { sorteiaPersonagem, PERSONAGENS } from './personagens.js?v=20261025ia';

/** total de jogadores por partida (você + rivais) — ?jogadores=N (testes/medição) e teto por preset */
export const JOGADORES_PADRAO = 50;
export const JOGADORES_POR_PRESET = { low: 50, medium: 50, high: 50 };

const EXTRA_NOMES = [
  'Nyx Volta', 'Raika Neon', 'Tavi Cromo', 'Juno Brasa', 'Kael Vidro', 'Mira Pulso', 'Dante Ozônio', 'Lia Faísca', 'Bento Ferrugem', 'Yara Prisma',
  'Caio Ruído', 'Zane Cobalto', 'Iris Vapor', 'Theo Sucata', 'Nina Quasar', 'Rui Turbina', 'Sol Mercúrio', 'Vega Lume', 'Otto Granito', 'Ayla Ciano',
  'Kenji Trovão', 'Lara Plasma', 'Davi Rebite', 'Luna Estática', 'Ravi Circuito', 'Tess Magma', 'Ícaro Néon', 'Maya Ventania', 'Leon Fuligem', 'Bia Holograma',
  'Gael Ônix', 'Zoe Relâmpago', 'Ivo Antena', 'Nara Quartzo', 'Hugo Carbono', 'Lis Aurora', 'Enzo Faro', 'Duda Laser', 'Pietro Asfalto', 'Cléo Vertigem',
  'Ramon Brisa', 'Tainá Raio', 'Ulisses Breu', 'Vivi Ozônio', 'Wagner Pixel', 'Xena Fumaça', 'Yuri Basalto', 'Zara Néctar', 'Akira Sinal', 'Breno Cinza'
];
const PAL = ['#ff3b5c', '#ffb020', '#9b5cff', '#3ecfbf', '#4f8dff', '#ff7a1a', '#7dff3a', '#ff3ad8', '#ffe14a', '#8affe8', '#d8a040', '#ff4a1a'];
const hexCss = (n) => `#${Number(n).toString(16).padStart(6, '0')}`;

/** nº de RIVAIS para o preset (total − 1). URL ?jogadores=N sobrepõe (mín. 4 = 3 rivais). */
export function rivaisPara(preset = 'medium') {
  let tot = JOGADORES_POR_PRESET[preset] ?? JOGADORES_PADRAO;
  try { const q = new URLSearchParams(location.search).get('jogadores'); if (q != null && +q >= 4) tot = Math.min(80, Math.round(+q)); } catch { /* sem location */ }
  return Math.max(3, tot - 1);
}

/**
 * @param {{ n:number, herois?:Array, R?:()=>number, fast?:boolean }} o
 * @returns {Array<{nome:string, primary:string, glow:string, char:string, skin:string, perso:string, lvlOff:number}>}
 */
export function planRoster({ n, herois = [], R = Math.random, fast = false, justa = true } = {}) {
  const names = []; const seen = new Set();
  const push = (nm) => { if (nm && !seen.has(nm)) { seen.add(nm); names.push(nm); } };
  herois.forEach((h) => push(h.nome));
  // nomes extras embaralhados pela semente
  const pool = EXTRA_NOMES.slice(); for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  pool.forEach(push);
  for (let i = 0; names.length < n; i++) push(`Rival ${String(i + 1).padStart(2, '0')}`);
  const off = Math.floor(R() * PERSONAGENS.length); const out = [];
  for (let i = 0; i < n; i++) {
    const h = herois[i] || null;
    const k = sorteiaPersonagem(i + off, R); // rodízio dos 9 → todos aparecem (49 rivais ≈ 5–6 de cada)
    const r = R(); const lvlOff = fast ? (r < 0.6 ? 0 : r < 0.9 ? 1 : 2) : (r < 0.5 ? 0 : r < 0.8 ? 1 : r < 0.95 ? 2 : 3);
    // PARTIDA JUSTA: todos no NV1 (sem nível extra) e só armas básicas — espada OU cajado (magos/bruxos preferem o cajado)
    const arma = R() < (k.char === 'mago' || k.char === 'bruxo' ? 0.8 : 0.35) ? 'cajado' : 'espada';
    out.push({ nome: names[i], primary: h?.primary || PAL[(i * 5 + off) % PAL.length], glow: k.glow, char: k.char, skin: k.skin, perso: k.perso, persoLabel: k.persoLabel, lvlOff: justa ? 0 : lvlOff, arma });
  }
  return out;
}
export { hexCss };
