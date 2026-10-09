/** Nexara — combat calculation */
import { skillBonusDamage } from './skills.js?v=20261009graf';

export function calcDamage(attacker, defender, skillLevel, opts = {}) {
  const atk = (attacker.ataque || 0) + skillBonusDamage(skillLevel) + (opts.weaponAtk || 0);
  const def = Math.floor((defender.defesa || 0) / 2) + (opts.armorDef || 0);
  return Math.max(1, atk - def + (Math.random() < 0.1 ? 1 : 0));
}

export function isAdjacent(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
}

export function inRange(a, b, ranged) {
  if (ranged) {
    const d = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    return d >= 1 && d <= 4;
  }
  return isAdjacent(a, b);
}

/**
 * Monster AI melee reach: chebyshev ≤ 1 (cardinal + diagonal).
 * Player melee stays isAdjacent (manhattan === 1). Documented asymmetry.
 */
export function isAiMeleeRange(a, b) {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  const cheb = Math.max(dx, dy);
  return cheb >= 1 && cheb <= 1;
}

