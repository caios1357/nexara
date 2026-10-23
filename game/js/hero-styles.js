/**
 * NEXARA — ESTILOS DO HERÓI (M3D). Puramente COSMÉTICO: modelo/cor/brilho/capacete/capa/espada.
 * Salvo em state.player.heroStyle (vai no save com o resto do player). Sem estilo → CAVALEIRO NEXA.
 * Modelos CC0: KayKit Character Pack Adventures (Kay Lousberg) — ver assets/models/LICENSES.md.
 */
export const HERO_STYLES = [
  {
    id: 'cavaleiro', name: 'GUERREIRO', tag: 'Armadura escura · núcleo azul · espada de luz',
    lore: 'Juramentado das torres de G6. A placa negra guarda um núcleo de Nexa que pulsa azul.',
    model: 'hero-knight', primary: 0x3a4658, glow: 0x3a9cff, head: 'Knight_Helmet', cape: 'Knight_Cape', capeOn: true,
    weapon: '1H_Sword', weaponLabel: 'Espada longa de luz', css: '#3a9cff', guerreiro: true
  },
  // ── OS 9 PERSONAGENS (arte do Caio) — 'cavaleiro' acima é o GUERREIRO ──
  { id: 'arqueiro', name: 'ARQUEIRO', tag: 'Capuz · arco de luz · aljava', lore: 'Atirador das passarelas de G6. Flechas de Nexa azul atravessam a chuva ácida.',
    model: 'hero-rogue', primary: 0x1a2848, glow: 0x3ab8ff, head: 'capuz', cape: 'Rogue_Cape', capeOn: true, weapon: 'arco', weaponLabel: 'Arco de luz', css: '#3ab8ff', personagem: true },
  { id: 'mago', name: 'MAGO', tag: 'Capuz · túnica · cajado de cristal', lore: 'Arcanista dos reatores. Cristais de Nexa crescem nos ombros e no cajado.',
    model: 'hero-mage', primary: 0x1a2442, glow: 0x5ad0ff, head: 'capuz', cape: 'Mage_Cape', capeOn: true, weapon: 'cajado', weaponLabel: 'Cajado de cristal', css: '#5ad0ff', personagem: true },
  { id: 'ninja', name: 'NINJA', tag: 'Capuz · máscara · adagas rubras', lore: 'Sombra dos telhados do Porto. Ataca primeiro e nunca para.',
    model: 'hero-rogue', primary: 0x15161a, glow: 0xff2a3a, head: 'capuz', cape: 'Rogue_Cape', capeOn: false, weapon: 'Knife', weaponLabel: 'Adagas rubras', css: '#ff2a3a', personagem: true },
  { id: 'paladino', name: 'CAVALEIRO', tag: 'Placa branca · escudo · espada dourada', lore: 'Guardião das muralhas da Elite. Escudo erguido, avança com cautela.',
    model: 'hero-knight', primary: 0xd8d6cc, glow: 0xffc23a, head: 'Knight_Helmet', cape: 'Knight_Cape', capeOn: false, weapon: '1H_Sword', weaponLabel: 'Espada e escudo', css: '#ffc23a', personagem: true },
  { id: 'cacadora', name: 'CAÇADORA', tag: 'Cabelo de fogo · máscara · lança', lore: 'Caçadora de gigantes da Periferia. Monta o que derruba.',
    model: 'hero-rogue', primary: 0x2a2018, glow: 0xff8a1a, head: null, cape: 'Rogue_Cape', capeOn: false, weapon: 'lanca', weaponLabel: 'Lança de brasa', css: '#ff8a1a', personagem: true },
  { id: 'bruxo', name: 'BRUXO', tag: 'Capuz com chifres · túnica · cajado tóxico', lore: 'Espera os outros se ferirem e entra no fim. Fogo verde no punho.',
    model: 'hero-mage', primary: 0x2a1f3a, glow: 0x7dff3a, head: 'capuz', cape: 'Mage_Cape', capeOn: true, weapon: 'cajado', weaponLabel: 'Cajado tóxico', css: '#7dff3a', personagem: true },
  { id: 'samurai', name: 'SAMURAI', tag: 'Kabuto · placas azuis · katana neon', lore: 'Duelista do Complexo. Procura o mais forte e o desafia.',
    model: 'hero-knight', primary: 0x1a2350, glow: 0xff3ad8, head: 'Knight_Helmet', cape: null, capeOn: false, weapon: 'katana', weaponLabel: 'Katana neon', css: '#ff3ad8', personagem: true },
  { id: 'berserker', name: 'BERSERKER', tag: 'Elmo de chifres · pele · machados de lava', lore: 'Brutamontes da Fábrica. Lava nas rachaduras da armadura.',
    model: 'hero-barbarian', primary: 0x2a1a18, glow: 0xff4a1a, head: 'Knight_Helmet', cape: null, capeOn: false, weapon: 'machados', weaponLabel: 'Machados de lava', css: '#ff4a1a', personagem: true },
  {
    id: 'cacador', classico: true, name: 'CAÇADOR DE RUA', tag: 'Capuz · lâminas curtas · brilho verde',
    lore: 'Cresceu nos túneis do Porto. Some na chuva ácida e volta com duas facas de plasma.',
    model: 'hero-rogue', primary: 0x3b4436, glow: 0x46ff8a, head: null, cape: 'Rogue_Cape', capeOn: false,
    weapon: 'Knife', offhand: 'Knife_Offhand', weaponLabel: 'Lâminas curtas de plasma', css: '#46ff8a'
  },
  {
    id: 'runico', classico: true, name: 'GUARDIÃO RÚNICO', tag: 'Chapéu rúnico · capa · espada rúnica violeta',
    lore: 'Escriba das runas de 2847. Grava sinais de Nexa na lâmina e a faz cantar.',
    model: 'hero-mage', primary: 0x463a5c, glow: 0xb46aff, head: 'Mage_Hat', cape: 'Mage_Cape', capeOn: true,
    weapon: '2H_Sword', weaponLabel: 'Montante rúnico', css: '#b46aff'
  },
  {
    id: 'ciborgue', classico: true, name: 'MERCENÁRIO CIBORGUE', tag: 'Cabeça raspada · braço de sucata · montante laranja',
    lore: 'Vende a espada a quem pagar em créditos de G6. Metade do corpo é sucata reforçada.',
    model: 'hero-barbarian', primary: 0x5a4a3a, glow: 0xff8a2a, head: null, cape: 'Barbarian_Cape', capeOn: false,
    weapon: '2H_Sword', weaponLabel: 'Montante de sucata', css: '#ff8a2a'
  }
];
export const DEFAULT_HERO_STYLE = 'cavaleiro';
export function heroStyleOf(idOrState) {
  const id = typeof idOrState === 'string' ? idOrState : idOrState?.player?.heroStyle;
  return HERO_STYLES.find((s) => s.id === id) || HERO_STYLES[0];
}
/** Visual do equipamento (data/items.json → item.visual) para o modelo 3D. */
export function equipmentVisual(state) {
  const eq = state?.equipment || {};
  const it = (id) => (id && state?._items?.[id]) || null;
  const v = (slot) => it(eq[slot])?.visual || null;
  // ARMAS DUPLAS: slot 2 sem item → modelo básico da classe escolhida (arco/cajado/varinha)
  const A = state?.player?.armas; const BASE = { arco: '1H_Crossbow', cajado: '2H_Staff', varinha: '1H_Wand' };
  const wv = v('weapon') || (A && A.ativo === 2 && BASE[A.s2] ? { model: BASE[A.s2], color: 0x2a2f3a, glow: 0x7fd8ff, family: 'basico' } : null);
  return { weapon: wv, armor: v('armor'), body: v('body'), accessory: v('accessory'), helmet: v('helmet'), pants: v('pants'), ids: { ...eq } };
}
