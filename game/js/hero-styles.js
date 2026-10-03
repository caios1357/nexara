/**
 * NEXARA — ESTILOS DO HERÓI (M3D). Puramente COSMÉTICO: modelo/cor/brilho/capacete/capa/espada.
 * Salvo em state.player.heroStyle (vai no save com o resto do player). Sem estilo → CAVALEIRO NEXA.
 * Modelos CC0: KayKit Character Pack Adventures (Kay Lousberg) — ver assets/models/LICENSES.md.
 */
export const HERO_STYLES = [
  {
    id: 'cavaleiro', name: 'CAVALEIRO NEXA', tag: 'Armadura escura · núcleo azul · espada de luz',
    lore: 'Juramentado das torres de G6. A placa negra guarda um núcleo de Nexa que pulsa azul.',
    model: 'hero-knight', primary: 0x3a4658, glow: 0x3a9cff, head: 'Knight_Helmet', cape: 'Knight_Cape', capeOn: true,
    weapon: '1H_Sword', weaponLabel: 'Espada longa de luz', css: '#3a9cff'
  },
  {
    id: 'cacador', name: 'CAÇADOR DE RUA', tag: 'Capuz · lâminas curtas · brilho verde',
    lore: 'Cresceu nos túneis do Porto. Some na chuva ácida e volta com duas facas de plasma.',
    model: 'hero-rogue', primary: 0x3b4436, glow: 0x46ff8a, head: null, cape: 'Rogue_Cape', capeOn: false,
    weapon: 'Knife', offhand: 'Knife_Offhand', weaponLabel: 'Lâminas curtas de plasma', css: '#46ff8a'
  },
  {
    id: 'runico', name: 'GUARDIÃO RÚNICO', tag: 'Chapéu rúnico · capa · espada rúnica violeta',
    lore: 'Escriba das runas de 2847. Grava sinais de Nexa na lâmina e a faz cantar.',
    model: 'hero-mage', primary: 0x463a5c, glow: 0xb46aff, head: 'Mage_Hat', cape: 'Mage_Cape', capeOn: true,
    weapon: '2H_Sword', weaponLabel: 'Montante rúnico', css: '#b46aff'
  },
  {
    id: 'ciborgue', name: 'MERCENÁRIO CIBORGUE', tag: 'Cabeça raspada · braço de sucata · montante laranja',
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
  return { weapon: v('weapon'), armor: v('armor'), body: v('body'), accessory: v('accessory'), helmet: v('helmet'), pants: v('pants'), ids: { ...eq } };
}
