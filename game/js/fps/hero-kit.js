/**
 * NEXARA HERÓI 3 — "KIT" do herói procedural clássico (cavaleiro escuro com lâmina de luz) para TODOS os estilos.
 * Estilo salvo (heroStyle) + editor (heroCustom) + equipamento (items.json → visual) → cabeça/rosto/cores/capa/arma.
 * Também gera kits VARIADOS (determinísticos pelo nome) para os rivais. Puramente visual.
 */
export const KIT_STYLES = {
  cavaleiro: { head: 'capuz', face: 'visor', armor: 0x26303c, cloth: 0x1c222c, glow: null, cape: true, weapon: 'espada', pad: 1 },
  runico: { head: 'chapeu', face: 'olhos', armor: 0x2b2538, cloth: 0x281c3b, glow: 0xb46aff, cape: true, weapon: 'montante', pad: 1.1, rune: true },
  cacador: { head: 'capuz', face: 'mascara', armor: 0x212922, cloth: 0x1b281e, glow: 0x46ff8a, cape: false, weapon: 'adagas', pad: 0.85, scarf: true },
  ciborgue: { head: 'careca', face: 'ciber', armor: 0x392f28, cloth: 0x2a2018, glow: 0xff8a2a, cape: false, weapon: 'montante', pad: 1.35, cyberArm: true }
};
const CREST = (c) => (c === 'horns' ? 'chifres' : c === 'demon' ? 'demonio' : 'crista');
const WEAPON_OF = { '1H_Sword': 'espada', '2H_Sword': 'montante', Knife: 'adagas', Knife_Offhand: 'adagas', '1H_Axe': 'espada', '2H_Axe': 'montante' };
const mixHex = (a, b, k) => {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255, br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * k) << 16) | (Math.round(ag + (bg - ag) * k) << 8) | Math.round(ab + (bb - ab) * k);
};
const num = (v) => (v == null ? null : typeof v === 'number' ? v : parseInt(String(v).replace('#', ''), 16));

/** kit do JOGADOR: estilo + editor + equipamento */
export function kitFor({ styleId, custom, equip } = {}) {
  const base = KIT_STYLES[styleId] || KIT_STYLES.cavaleiro;
  const k = { style: KIT_STYLES[styleId] ? styleId : 'cavaleiro', ...base };
  const cu = custom || {};
  if (num(cu.primary) != null) k.armor = mixHex(base.armor, num(cu.primary), 0.42); // a cor do editor tinge a placa, mas o herói continua ESCURO
  if (num(cu.glow) != null) k.glow = num(cu.glow);
  if (cu.cape != null) k.cape = !!cu.cape;
  if (cu.head === false && (k.head === 'chapeu')) k.head = 'capuz';
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
