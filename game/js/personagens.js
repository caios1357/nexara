/**
 * NEXARA — OS 9 PERSONAGENS (arte do Caio: arte-caio/heroi-guerreiro, arqueiro-azul, mago-azul, rival-*.png).
 * Jogáveis pelo jogador (estilo salvo em player.heroStyle) e sorteados pelos bots (com PERSONALIDADE).
 * IDs: 'cavaleiro' continua sendo o GUERREIRO clássico (saves antigos intactos); o cavaleiro branco/dourado é 'paladino'.
 * SKINS ELEMENTAIS (player.heroCustom.skin): azul, fogo, raio, veneno, terra, vento — só cor/brilho (cosmético).
 */
export const SKINS = {
  azul: { name: 'AZUL', glow: 0x3a9cff, tint: 0x1a2a4a, css: '#3a9cff' },
  fogo: { name: 'FOGO', glow: 0xff6a1a, tint: 0x3a1a10, css: '#ff6a1a' },
  raio: { name: 'RAIO', glow: 0xffe14a, tint: 0x2a2a3a, css: '#ffe14a' },
  veneno: { name: 'VENENO', glow: 0x7dff3a, tint: 0x1c2a16, css: '#7dff3a' },
  terra: { name: 'TERRA', glow: 0xd8a040, tint: 0x3a2a18, css: '#d8a040' },
  vento: { name: 'VENTO', glow: 0x8affe8, tint: 0x1e3a3a, css: '#8affe8' }
};
export const SKIN_IDS = Object.keys(SKINS);
/** personalidade dos bots por personagem (decisão do Caio) */
export const PERSONALIDADES = {
  agressivo: { label: 'AGRESSIVO', cacaMult: 1.6, cadMult: 0.85, velMult: 1.1, recuaFrac: 0, fracoPeso: 0.3 },
  cauteloso: { label: 'CAUTELOSO', cacaMult: 0.7, cadMult: 1.05, velMult: 1, recuaFrac: 0.4, fracoPeso: 0.4 },
  duelista: { label: 'DUELISTA', cacaMult: 1.35, cadMult: 0.92, velMult: 1.05, recuaFrac: 0, fracoPeso: 0.1, danoRivalMult: 1.15 },
  cacador: { label: 'CAÇA GIGANTES', cacaMult: 0.8, cadMult: 1, velMult: 1, recuaFrac: 0.2, fracoPeso: 0.4, gigante: true, danoGiganteMult: 1.3 },
  oportunista: { label: 'OPORTUNISTA', cacaMult: 1.1, cadMult: 1, velMult: 1, recuaFrac: 0.3, fracoPeso: 0.95 },
  equilibrado: { label: 'EQUILIBRADO', cacaMult: 1, cadMult: 1, velMult: 1, recuaFrac: 0.15, fracoPeso: 0.4 }
};
export const PERSONAGENS = [
  { id: 'cavaleiro', name: 'GUERREIRO', perso: 'equilibrado', skin: 'azul', art: 'heroi-guerreiro-folha.png' },
  { id: 'arqueiro', name: 'ARQUEIRO', perso: 'equilibrado', skin: 'azul', art: 'arqueiro-azul-folha.png' },
  { id: 'mago', name: 'MAGO', perso: 'cauteloso', skin: 'azul', art: 'mago-azul-folha.png' },
  { id: 'ninja', name: 'NINJA', perso: 'agressivo', skin: 'fogo', art: 'rival-ninja-folha.png' },
  { id: 'paladino', name: 'CAVALEIRO', perso: 'cauteloso', skin: 'terra', art: 'rival-cavaleiro-folha.png' },
  { id: 'cacadora', name: 'CAÇADORA', perso: 'cacador', skin: 'fogo', art: 'rival-cacadora-folha.png' },
  { id: 'bruxo', name: 'BRUXO', perso: 'oportunista', skin: 'veneno', art: 'rival-bruxo-folha-a.png' },
  { id: 'samurai', name: 'SAMURAI', perso: 'duelista', skin: 'raio', art: 'rival-samurai-folha.png' },
  { id: 'berserker', name: 'BERSERKER', perso: 'agressivo', skin: 'fogo', art: 'rival-berserker-folha.png' }
];
export const PERSONAGEM_IDS = PERSONAGENS.map((p) => p.id);
export const personagemOf = (id) => PERSONAGENS.find((p) => p.id === id) || null;
const hexCss = (n) => `#${Number(n).toString(16).padStart(6, '0')}`;
/** sorteio de um bot: personagem (os 9 em rodízio embaralhado pela semente) + skin elemental */
export function sorteiaPersonagem(idx, R = Math.random) {
  const p = PERSONAGENS[((idx % PERSONAGENS.length) + PERSONAGENS.length) % PERSONAGENS.length];
  const skin = R() < 0.55 ? p.skin : SKIN_IDS[Math.floor(R() * SKIN_IDS.length) % SKIN_IDS.length];
  return { char: p.id, perso: p.perso, persoLabel: PERSONALIDADES[p.perso].label, skin, glow: hexCss(SKINS[skin].glow) };
}
