/**
 * NEXARA — FAMÍLIA DE DRAGÕES da arte do Caio (arte-caio/dragao-*-folha.png): 6 dragões, mesmo tamanho de montaria.
 * VERDE (inicial) · FOGO · RAIO (roxo elétrico) · VENENO (preto + verde ácido) · GELO (branco cristal) · SOMBRIO (azul-escuro + ciano).
 * Só VISUAL: data/dragoes.json continua igual (IDs/elementos); a paleta do JSON é trocada pela da folha na hora de desenhar.
 */
export const DRAGON_ART = {
  verde: { base: '#24502a', escuro: '#0a140b', brilho: '#3aff4a', asa: '#6a4a26' },
  fogo: { base: '#c8401a', escuro: '#2a0a04', brilho: '#ffa020', asa: '#d8501a' },
  raio: { base: '#6a2ac8', escuro: '#180a30', brilho: '#d878ff', asa: '#8a3ae0' },
  veneno: { base: '#1c2a12', escuro: '#080e05', brilho: '#a8ff2a', asa: '#5a9a1a' },
  gelo: { base: '#dcecff', escuro: '#7aa8d8', brilho: '#8ad8ff', asa: '#b8dcff' },
  sombrio: { base: '#163462', escuro: '#060e1e', brilho: '#2ac8ff', asa: '#1a5a9a' }
};
/** paleta do JSON (pela cor base) → dragão da folha. Sem paleta = VERDE (gigante inicial). */
const BY_BASE = {
  '#183a1e': 'verde', '#2f55e8': 'raio', '#8a2e12': 'fogo', '#4a5a1c': 'veneno', '#2f6ea8': 'gelo', '#3c1d62': 'sombrio',
  '#d8481c': 'fogo', '#6fd0ff': 'gelo', '#f2d21c': 'raio', '#7ad02a': 'veneno', '#7a4ad8': 'sombrio', '#2a62c8': 'sombrio'
};
const BY_ELEM = { 'nexa verde': 'verde', verde: 'verde', fogo: 'fogo', raio: 'raio', veneno: 'veneno', gelo: 'gelo', sombra: 'sombrio', sombrio: 'sombrio', azul: 'sombrio' };
const OFF = typeof location !== 'undefined' && /[?&]dragaoArte=0\b/.test(location.search);
export function dragonArtKey(pal, elem) {
  if (elem && BY_ELEM[elem]) return BY_ELEM[elem];
  if (!pal) return 'verde';
  return BY_BASE[String(pal.base || '').toLowerCase()] || null;
}
/** devolve a paleta da folha (mesmo formato base/escuro/brilho) ou a original se não houver correspondente */
export function artPalette(pal, elem) {
  if (OFF) return pal;
  const k = dragonArtKey(pal, elem); if (!k) return pal;
  return { ...DRAGON_ART[k], art: k };
}
