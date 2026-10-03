/**
 * NEXARA — ponto ÚNICO de leitura de atributos modificáveis do herói (gp2).
 *
 * Dano, velocidade de movimento, velocidade de ataque, crítico e regeneração
 * passam por getStat(stat, base, ctx). Hoje não há modificadores (valor = base);
 * o PassiveManager do Bloco 3 registra funções com addModifier().
 * Sem alocação no caminho quente (ctx opcional, reutilizado pelo chamador).
 */
export const STATS = Object.freeze({
  DAMAGE: 'damage',             // dano final de um golpe do herói (após multiplicador do combo)
  MOVE_SPEED: 'moveSpeed',      // tiles/s de caminhada (base: movement.walkSpeed)
  ATTACK_SPEED: 'attackSpeed',  // multiplicador de ritmo do ataque (1 = normal; 1.2 = 20% mais rápido)
  CRIT_CHANCE: 'critChance',    // 0..1 (base: combat.critChance)
  CRIT_MULT: 'critMult',        // multiplicador do crítico (base: combat.critMult)
  HP_REGEN: 'hpRegen',          // HP/s (base: combat.hpRegenPerSec)
  // gp3 (Bloco 3 — passivas)
  NEXA_REGEN: 'nexaRegen',      // Nexa/s (base: combat.nexaRegenPerSec)
  MAX_HP: 'maxHp',              // HP máximo (base: player.hpMaxBase)
  ABILITY_DAMAGE: 'abilityDamage', // dano de habilidades (hoje: chamas do Mini Dragão; Bloco 4: especiais)
  DAMAGE_VS_COMMON: 'damageVsCommon', // dano do herói contra inimigos de tier 'comum' (não chefes)
  // Bloco 7 (poderes temporários da Arena; neutros = 1 sem modificadores)
  DAMAGE_TAKEN: 'damageTaken',         // multiplicador do dano recebido pelo herói (1 = normal)
  SPECIAL_COOLDOWN: 'specialCooldown', // multiplicador da recarga dos especiais (1 = normal)
  DRAGON_DAMAGE: 'dragonDamage',       // multiplicador do dano do Mini Dragão (1 = normal)
  // EVO (builds / postura)
  POSTURE_DAMAGE: 'postureDamage',     // multiplicador do dano de POSTURA causado (1 = normal)
  BREAK_DAMAGE: 'breakDamage',         // multiplicador extra do dano em inimigo QUEBRADO (base posture.breakDamageMult)
  PERFECT_DODGE_MS: 'perfectDodgeMs'   // janela da ESQUIVA PERFEITA (ms; base feel.perfectDodgeWindowMs)
});

const mods = new Map(); // stat → Array<fn(value, ctx) => value>

/** Valor efetivo do atributo: base passado por todos os modificadores registrados. */
export function getStat(stat, base, ctx) {
  const list = mods.get(stat);
  if (!list || !list.length) return base;
  let v = base;
  for (let i = 0; i < list.length; i++) v = list[i](v, ctx);
  return Number.isFinite(v) ? v : base;
}

/** Registra um modificador; retorna função para remover. */
export function addModifier(stat, fn) {
  if (typeof fn !== 'function') return () => {};
  let list = mods.get(stat);
  if (!list) { list = []; mods.set(stat, list); }
  list.push(fn);
  return () => {
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  };
}

export function clearModifiers(stat) {
  if (stat) mods.delete(stat);
  else mods.clear();
}

export function listModifiers() {
  const out = {};
  for (const [k, v] of mods) out[k] = v.length;
  return out;
}
