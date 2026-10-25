/**
 * NEXARA HERÓI 3 — "KIT" do herói procedural clássico (cavaleiro escuro com lâmina de luz) para TODOS os estilos.
 * Estilo salvo (heroStyle) + editor (heroCustom) + equipamento (items.json → visual) → cabeça/rosto/cores/capa/arma.
 * Também gera kits VARIADOS (determinísticos pelo nome) para os rivais. Puramente visual.
 */
export const KIT_STYLES = {
  cavaleiro: { glbUrl: '../../assets/modelos/guerreiro-lite.glb', head: 'guerreiro', face: 'visor', armor: 0x16264a, cloth: 0x101c38, helmColor: 0x14234a, glow: 0x0aa8ff, cape: true, weapon: 'espada', pad: 1, chibi: true, bigPads: true, emblem: true, bigBoots: true, backSword: true, tabardFront: true }, // GUERREIRO (heroi-guerreiro-folha)
  runico: { glbUrl: '../../assets/modelos/guerreiro-lite.glb', glbGlow: 0xb46aff /* glb3: estilo clássico salvo → mesmo modelo GLB do Caio, tingido na cor do estilo */, head: 'chapeu', face: 'olhos', armor: 0x2b2538, cloth: 0x281c3b, glow: 0xb46aff, cape: true, weapon: 'montante', pad: 1.1, rune: true },
  cacador: { glbUrl: '../../assets/modelos/guerreiro-lite.glb', glbGlow: 0x46ff8a /* glb3: estilo clássico salvo → mesmo modelo GLB do Caio, tingido na cor do estilo */, head: 'capuz', face: 'mascara', armor: 0x212922, cloth: 0x1b281e, glow: 0x46ff8a, cape: false, weapon: 'adagas', pad: 0.85, scarf: true },
  // ── 9 PERSONAGENS (folhas do Caio) — cores/formas tiradas das referências ──
  arqueiro: { head: 'capuz', face: 'visor', armor: 0x1a2848, cloth: 0x14203c, glow: 0x3ab8ff, cape: true, weapon: 'arco', pad: 1.05, tabard: true, quiver: true, spikes: 0x3ab8ff, chibi: true, bigBoots: true },
  mago: { head: 'capuz', face: 'visor', armor: 0x1a2442, cloth: 0x152040, glow: 0x5ad0ff, cape: true, weapon: 'cajado', pad: 1.1, robe: true, crystals: true, rune: true, chibi: true, bigBoots: true },
  ninja: { head: 'capuz', face: 'mascara', armor: 0x15161a, cloth: 0x2a0c10, glow: 0xff2a3a, cape: false, weapon: 'adagas', pad: 0.8, scarf: true, bulk: 0.94, tabard: true, chibi: true, bigBoots: true },
  paladino: { head: 'elmo', crest: 'crista', helmColor: 0xe8e4d8, helmGlow: 0xffc23a, face: 'visor', armor: 0xd8d6cc, cloth: 0x8a7a50, glow: 0xffc23a, cape: false, weapon: 'espada', shield: true, pad: 1.35, bulk: 1.08, plates: { color: 0xc8a040, glow: 0xffc23a }, chibi: true, bigBoots: true },
  cacadora: { head: 'cabelo', hair: 0xff7a1a, face: 'mascara', armor: 0x2a2018, cloth: 0x3a2414, glow: 0xff8a1a, cape: false, weapon: 'lanca', pad: 0.9, tabard: true, bulk: 0.95, chibi: true, bigBoots: true },
  bruxo: { head: 'capuz', horns: true, face: 'visor', armor: 0x2a1f3a, cloth: 0x221832, glow: 0x7dff3a, cape: true, weapon: 'cajado', pad: 1.15, robe: true, rune: true, handFire: true, chibi: true, bigBoots: true },
  samurai: { head: 'elmo', crest: 'samurai', helmColor: 0x1e2a60, helmGlow: 0xff3ad8, face: 'visor', armor: 0x1a2350, cloth: 0x141a3a, glow: 0xff3ad8, cape: false, weapon: 'katana', pad: 1.3, tabard: true, chibi: true, bigBoots: true },
  berserker: { head: 'elmo', crest: 'demonio', helmColor: 0x3a3a40, helmGlow: 0xff4a1a, face: 'visor', armor: 0x2a1a18, cloth: 0x4a3426, glow: 0xff4a1a, cape: false, weapon: 'machados', pad: 1.5, bulk: 1.16, fur: true, plates: { color: 0x3a3438, glow: 0xff4a1a }, chibi: true, bigBoots: true },
  ciborgue: { glbUrl: '../../assets/modelos/guerreiro-lite.glb', glbGlow: 0xff8a2a /* glb3: estilo clássico salvo → mesmo modelo GLB do Caio, tingido na cor do estilo */, head: 'careca', face: 'ciber', armor: 0x392f28, cloth: 0x2a2018, glow: 0xff8a2a, cape: false, weapon: 'montante', pad: 1.35, cyberArm: true }
};
const CREST = (c) => (c === 'horns' ? 'chifres' : c === 'demon' ? 'demonio' : 'crista');
const WEAPON_OF = { '1H_Sword': 'espada', '2H_Sword': 'montante', Knife: 'adagas', Knife_Offhand: 'adagas', '1H_Axe': 'espada', '2H_Axe': 'montante' };
const mixHex = (a, b, k) => {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255, br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * k) << 16) | (Math.round(ag + (bg - ag) * k) << 8) | Math.round(ab + (bb - ab) * k);
};
const num = (v) => (v == null ? null : typeof v === 'number' ? v : parseInt(String(v).replace('#', ''), 16));

import { SKINS } from '../personagens.js?v=20261025perf';
/** SKIN ELEMENTAL: brilho do elemento + armadura tingida (mantém a forma do personagem) */
export function applySkin(k, skinId) {
  const S = SKINS[skinId]; if (!S) return k;
  k.skin = skinId; k.glow = S.glow; k.armor = mixHex(k.armor, S.tint, 0.45); k.cloth = mixHex(k.cloth, S.tint, 0.55);
  if (k.helmGlow != null) k.helmGlow = S.glow; if (k.plates) k.plates = { ...k.plates, glow: S.glow };
  if (k.spikes != null) k.spikes = S.glow;
  return k;
}
/** kit do JOGADOR: estilo + editor + equipamento */
export function kitFor({ styleId, custom, equip } = {}) {
  const base = KIT_STYLES[styleId] || KIT_STYLES.cavaleiro;
  const k = { style: KIT_STYLES[styleId] ? styleId : 'cavaleiro', ...base };
  const cu = custom || {};
  if (num(cu.primary) != null) k.armor = mixHex(base.armor, num(cu.primary), 0.42); // a cor do editor tinge a placa, mas o herói continua ESCURO
  if (num(cu.glow) != null) k.glow = num(cu.glow);
  if (cu.cape != null) k.cape = !!cu.cape;
  if (cu.head === false && (k.head === 'chapeu')) k.head = 'capuz';
  if (cu.skin) applySkin(k, cu.skin);
  if (cu.weapon && WEAPON_OF[cu.weapon]) k.weapon = WEAPON_OF[cu.weapon];
  const eq = equip || {};
  if (eq.helmet) { k.head = 'elmo'; k.crest = CREST(eq.helmet.crest); k.helmColor = num(eq.helmet.color); k.helmGlow = num(eq.helmet.glow); k.face = 'visor'; }
  if (eq.armor) { if (num(eq.armor.tint) != null) k.armor = mixHex(num(eq.armor.tint), 0x10141a, 0.35); if (eq.armor.plates) k.plates = { color: num(eq.armor.color) ?? 0x5a6070, glow: num(eq.armor.glow) }; }
  if (eq.body && num(eq.body.tint) != null) k.cloth = mixHex(num(eq.body.tint), 0x0c0e12, 0.4);
  if (eq.pants?.greaves) k.greaves = { color: num(eq.pants.color) ?? 0x4a505c, glow: num(eq.pants.glow) };
  if (eq.weapon) { const w = eq.weapon; if (w.spear) k.weapon = 'lanca'; else if (WEAPON_OF[w.model]) k.weapon = WEAPON_OF[w.model]; if (num(w.glow) != null) k.bladeGlow = num(w.glow); }
  return k;
}

function hash(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let a = seed || 1; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pick = (r, a) => a[Math.floor(r() * a.length) % a.length];

/** kit VARIADO de rival (determinístico pelo nome/estilo): cabeça, crista, capa, arma, ombreiras, placas — na cor do rival */
export function rivalKit(R0) {
  const r = rng(hash(`${R0?.name}|${R0?.style}`));
  if (R0?.char && KIT_STYLES[R0.char]) { // 9 PERSONAGENS: bot usa o personagem sorteado (forma intacta) + skin elemental
    const k = { style: R0.char, ...KIT_STYLES[R0.char] }; if (k.plates) k.plates = { ...k.plates };
    if (R0.skin) applySkin(k, R0.skin);
    if (R0.arma === 'cajado' || R0.arma === 'espada') k.weapon = R0.arma; // 20261024apex PARTIDA JUSTA: arma básica do bot (espada ou cajado)
    return k;
  }
  const base = KIT_STYLES[R0?.style] || pick(r, Object.values(KIT_STYLES));
  const k = { style: R0?.style || 'cavaleiro', ...base };
  const prim = num(R0?.primary); const glow = num(R0?.glow);
  if (prim != null) { k.armor = mixHex(prim, 0x0e1116, 0.62); k.cloth = mixHex(prim, 0x0a0b0e, 0.5); }
  if (glow != null) k.glow = glow;
  if (r() < 0.5) { k.head = pick(r, ['capuz', 'elmo', 'elmo', 'chapeu', 'careca']); }
  if (k.head === 'elmo') { k.crest = pick(r, ['crista', 'chifres', 'demonio', 'nenhuma']); k.helmColor = mixHex(k.armor, 0x9aa4b0, 0.18); k.face = 'visor'; }
  else if (k.head === 'careca') k.face = 'ciber';
  else if (k.head === 'chapeu') k.face = 'olhos';
  else if (k.face === 'visor' && r() < 0.5) k.face = 'mascara';
  k.cape = r() < 0.6;
  if (r() < 0.55) k.weapon = pick(r, ['espada', 'montante', 'adagas', 'lanca']);
  k.pad = +(0.85 + r() * 0.55).toFixed(2);
  if (r() < 0.45) k.plates = { color: mixHex(prim ?? 0x5a6070, 0x2a2e36, 0.5), glow: glow ?? null };
  k.cyberArm = k.head === 'careca' && r() < 0.7;
  k.scarf = k.head === 'capuz' && r() < 0.5;
  k.rune = k.cape && r() < 0.5;
  k.bulk = +(0.94 + r() * 0.14).toFixed(3); // corpo um pouco mais largo/estreito
  return k;
}
export const kitSig = (k) => (k ? JSON.stringify(k) : '');
