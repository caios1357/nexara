/**
 * NEXARA — EQUIPAMENTOS do ARSENAL: atributos REAIS no combate.
 *
 * Fonte única dos valores: data/items.json (item.attrs) + data/arsenal.json (atributos/armas).
 *  - dano / defesa → stats.ataque / stats.defesa → getEquippedStats → calcDamage (golpe e dano recebido)
 *  - os demais viram modificadores do sistema real (modifiers.addModifier), registrados UMA vez e
 *    lidos do total em cache do estado ativo (recalculado só quando o equipamento muda).
 * Sem nada equipado do Arsenal: todos os modificadores são neutros (combate idêntico ao da build anterior).
 */
import { addModifier, STATS } from './modifiers.js?v=20261009leve';

export const ARSENAL_SLOTS = Object.freeze(['helmet', 'armor', 'pants', 'weapon']);
export const ALL_SLOTS = Object.freeze(['weapon', 'armor', 'helmet', 'pants', 'body', 'accessory']);
export const EMPTY_EQUIPMENT = () => ({ weapon: null, armor: null, body: null, accessory: null, helmet: null, pants: null });

const ZERO = { dano: 0, defesa: 0, vida: 0, critico: 0, velocidade: 0, precisao: 0, poderMagico: 0, resistencia: 0, energia: 0, recarga: 0 };
let totals = { ...ZERO };
let weaponClass = 'espada';
let weaponFamily = null;
let registered = false;

/** Soma dos atributos de TODOS os itens equipados (attrs do Arsenal; itens antigos só têm stats). */
export function sumEquipAttrs(state) {
  const t = { ...ZERO };
  const eq = state?.equipment || {};
  for (const slot of ALL_SLOTS) {
    const it = eq[slot] && state._items?.[eq[slot]];
    if (!it?.attrs) continue;
    for (const [k, v] of Object.entries(it.attrs)) if (Number.isFinite(v)) t[k] = (t[k] || 0) + v;
  }
  return t;
}
/** Classe da arma principal: 'espada' (combo corpo a corpo atual) | 'arco' | 'cajado'. */
export function weaponClassOf(state) {
  const w = state?.equipment?.weapon && state._items?.[state.equipment.weapon];
  return w?.weaponClass || 'espada';
}
export function weaponFamilyOf(state) {
  const w = state?.equipment?.weapon && state._items?.[state.equipment.weapon];
  return w?.family || null;
}

/** Recalcula o cache (chamar quando o equipamento muda / troca de estado ativo). */
export function refreshEquipment(state) {
  ensureModifiers();
  totals = state ? sumEquipAttrs(state) : { ...ZERO };
  weaponClass = state ? weaponClassOf(state) : 'espada';
  weaponFamily = state ? weaponFamilyOf(state) : null;
  return getEquipTotals();
}
export function getEquipTotals() { return { ...totals, weaponClass, weaponFamily }; }
export const currentWeaponClass = () => weaponClass;
export const currentWeaponFamily = () => weaponFamily;
/** Multiplicador do Poder mágico (só ataques/especiais do cajado). */
export const magicMult = () => (weaponClass === 'cajado' ? 1 + (totals.poderMagico || 0) / 100 : 1);

function ensureModifiers() {
  if (registered) return;
  registered = true;
  addModifier(STATS.CRIT_CHANCE, (v) => (totals.critico ? Math.min(0.95, v + totals.critico / 100) : v));
  addModifier(STATS.CRIT_MULT, (v) => (totals.precisao ? v * (1 + totals.precisao / 100) : v));
  addModifier(STATS.MOVE_SPEED, (v) => (totals.velocidade ? v * (1 + totals.velocidade / 100) : v));
  addModifier(STATS.MAX_HP, (v) => (totals.vida ? v + totals.vida : v));
  addModifier(STATS.DAMAGE_TAKEN, (v) => (totals.resistencia ? v * Math.max(0.4, 1 - totals.resistencia / 100) : v));
  addModifier(STATS.NEXA_REGEN, (v) => (totals.energia ? v + totals.energia : v));
  addModifier(STATS.SPECIAL_COOLDOWN, (v) => (totals.recarga ? v * Math.max(0.4, 1 - totals.recarga / 100) : v));
}

/** Texto dos modificadores de um item ("+12 Dano · +3% Crítico"). */
export function attrLines(item, attrDefs) {
  const out = [];
  for (const [k, v] of Object.entries(item?.attrs || {})) {
    const d = attrDefs?.[k] || { nome: k, un: '' };
    out.push({ key: k, text: `+${v}${d.un === '%' ? '%' : d.un === '/s' ? '/s' : ''} ${d.nome}`, efeito: d.efeito || '' });
  }
  return out;
}
