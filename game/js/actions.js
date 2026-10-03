import { trainSkill } from '../../rules/skills.js?v=20261003m10g';
import { calcDamage, inRange, isAiMeleeRange } from '../../rules/combat.js?v=20261003m10g';
import { rollLoot, addToInventory, removeFromInventory, countItem } from '../../rules/loot.js?v=20261003m10g';
import { addReputation } from '../../rules/reputation.js?v=20261003m10g';
import { isWalkable, isWalkableHero, getTileType, monstersInZone } from './map.js?v=20261003m10g';
import { pushLog, addXp, getEquippedStats, isE4Unlocked } from './state.js?v=20261003m10g';
import { currentWeaponClass, magicMult } from './equipment.js?v=20261003m10g';
import { reveal } from './arquivo.js?v=20261003m10g';
import { checkEventReady } from './events.js?v=20261003m10g';
import { getConfig } from './gameplay-config.js?v=20261003m10g';
import { getStat, STATS } from './modifiers.js?v=20261003m10g';

/** Player attack cooldown (ms) — realtime, not turn-based. */
export const PLAYER_ATTACK_COOLDOWN_MS = 400;

/**
 * Passo de tile autoritativo. opts.ignoreMonsters: o movimento contínuo (gp2)
 * resolve corpo-a-corpo por círculos (inimigos em float), então o tile do
 * monstro não bloqueia o herói ali — a API/testes por tile mantêm o bloqueio.
 */
export function tryMove(state, dx, dy, opts = {}) {
  const zone = state._data.zones.zones.find((z) => z.id === state.zoneId);
  const nx = state.player.x + dx;
  const ny = state.player.y + dy;
  if (!(opts.ignoreMonsters ? isWalkableHero(zone, nx, ny) : isWalkable(zone, nx, ny))) return false;
  if (!opts.ignoreMonsters && monstersInZone(state, zone.id).some((m) => m.x === nx && m.y === ny)) return false;
  if (state._data.npcs.npcs.some((n) => n.zone === zone.id && n.x === nx && n.y === ny)) return false;
  state.player.x = nx;
  state.player.y = ny;

  // G6 explore beira
  if (zone.id === 'zone_g6' && (ny >= 8 || (nx >= 4 && nx <= 7 && ny >= 7))) {
    state.flags.explored_beira = true;
    advanceQuest(state, 'G6-Q01', 'step_explore');
  }

  // E4 explore poço
  if (zone.id === 'zone_e4' && ny >= 8) {
    state.flags.explored_poco_e4 = true;
    advanceQuest(state, 'E4-Q01', 'step_explore_poco');
  }

  // Zone exits
  const tile = getTileType(zone, nx, ny);
  const exit = (zone.map.exits || []).find((e) => e.x === nx && e.y === ny);
  if (exit) {
    handleExit(state, zone, exit, tile);
  }
  return true;
}

function handleExit(state, fromZone, exit, tile) {
  if (exit.to_zone === 'zone_e4') {
    if (!isE4Unlocked(state)) {
      pushLog(state, exit.locked_message || fromZone.blocked_message || 'Caminho selado.', 'danger');
      // step back off the tile so they aren't stuck on exit
      return;
    }
    enterZone(state, exit.to_zone, exit.to_x, exit.to_y);
    return;
  }
  if (exit.to_zone === 'zone_g6') {
    enterZone(state, exit.to_zone, exit.to_x, exit.to_y);
    return;
  }
  // other exits blocked for now
  const dest = state._data.zones.zones.find((z) => z.id === exit.to_zone);
  pushLog(state, dest?.blocked_message || 'Zona bloqueada.', 'danger');
}

export function enterZone(state, zoneId, x, y) {
  const zone = state._data.zones.zones.find((z) => z.id === zoneId);
  if (!zone || !zone.playable) {
    pushLog(state, zone?.blocked_message || 'Zona bloqueada.', 'danger');
    return false;
  }
  state.zoneId = zoneId;
  state.player.x = x ?? zone.map.spawn.x;
  state.player.y = y ?? zone.map.spawn.y;
  reveal(state.arquivo, 'zonas', zoneId);
  if (zoneId === 'zone_e4') {
    state.flags.e4_visited = true;
    pushLog(state, 'Você desce ao Subsolo Negro (E4). O ar cheira a ozônio e segredo.', 'sys');
  } else if (zoneId === 'zone_g6') {
    pushLog(state, 'Você sobe de volta à Periferia Ferrugem (G6).', 'sys');
  }
  return true;
}

/**
 * LEGADO (API/iso antigos): ataque instantâneo com checagem de tile e cooldown.
 * O jogo em tempo real (gp2) usa player-combat.js, que decide QUANDO (frame de
 * impacto) e QUEM (hitbox em cone) e chama applyPlayerHit() abaixo.
 */
export function attackMonster(state, monUid) {
  const mon = state.monstersAlive.find((m) => m.uid === monUid && m.alive);
  if (!mon) return null;
  if (mon.zone !== state.zoneId) return null;

  const now = performance.now();
  if (state._playerNextAttackAt && now < state._playerNextAttackAt) {
    return null;
  }
  const eq = getEquippedStats(state);
  if (!inRange(state.player, mon, eq.ranged)) {
    pushLog(state, 'Muito longe para atacar.', 'warn');
    return null;
  }
  state._playerNextAttackAt = now + PLAYER_ATTACK_COOLDOWN_MS;
  return applyPlayerHit(state, mon);
}

/**
 * DANO do herói num monstro: fórmula (calcDamage) × golpe do combo, passando
 * por modifiers.getStat (dano/crítico — ganchos das passivas), treino de skill
 * e quest de skill; depois o caminho genérico applyDamageToMonster.
 * Não checa alcance/tempo — quem chama já validou hitbox + frame de impacto.
 * Sem contra-ataque aqui — a IA chama monsterAttackPlayer de forma independente.
 */
const dmgCtx = { source: 'player', mon: null, state: null, crit: false };
/** Inimigo 'comum' = tier comum nos dados (padrão) e não chefe. */
export function isCommonMonster(def) {
  return !!def && !def.boss && (def.tier || 'comum') === 'comum';
}

export function applyPlayerHit(state, mon, opts = {}) {
  if (!mon || !mon.alive || mon.zone !== state.zoneId) return null;
  const def = state._monsters[mon.id];
  if (!def) return null;
  const eq = getEquippedStats(state);
  const skillId = eq.skill;
  const skLevel = state.player.skills[skillId]?.level || 10;
  const base = calcDamage(state.player, def, skLevel, {
    weaponAtk: eq.weaponAtk,
    armorDef: 0
  });
  const mult = Number.isFinite(opts.dmgMult) && opts.dmgMult > 0 ? opts.dmgMult : 1;
  const ccfg = getConfig().combat;
  dmgCtx.mon = mon;
  dmgCtx.state = state;
  dmgCtx.crit = false;
  let dmg = getStat(STATS.DAMAGE, base * mult, dmgCtx);
  // Bloco 4: especiais contam como HABILIDADE (Núcleo Divino +15% etc.)
  if (opts.ability) dmg = getStat(STATS.ABILITY_DAMAGE, dmg, dmgCtx);
  // gp3: bônus contra inimigos comuns (tier 'comum' nos dados; chefes/elite não)
  if (isCommonMonster(def)) dmg = getStat(STATS.DAMAGE_VS_COMMON, dmg, dmgCtx);
  const critChance = getStat(STATS.CRIT_CHANCE, ccfg.critChance, dmgCtx);
  if (critChance > 0 && Math.random() < critChance) {
    dmgCtx.crit = true;
    dmg *= getStat(STATS.CRIT_MULT, ccfg.critMult, dmgCtx);
  }
  // MCB/ARSENAL: CAJADO — Poder mágico multiplica o dano de todos os golpes/especiais com ele
  if (currentWeaponClass() === 'cajado') dmg *= magicMult();
  dmg = Math.max(1, Math.round(dmg));
  const tr = trainSkill(state.player.skills, skillId, state._data.skills, 1);
  state.flags.skill_trained = true;
  advanceQuest(state, 'G6-Q01', 'step_skill');
  if (tr.leveled) pushLog(state, `Skill ${skillId} → ${tr.level}`, 'sys');
  if (def.id.includes('bot') && state.player.skills.hack_runico) {
    trainSkill(state.player.skills, 'hack_runico', state._data.skills, 1);
  }
  const res = applyDamageToMonster(state, mon, dmg, { source: 'player', crit: dmgCtx.crit });
  if (res) res.crit = dmgCtx.crit;
  return res;
}

/**
 * Caminho GENÉRICO de dano em monstro (herói, companheiro/dragão, projéteis,
 * efeitos): aplica HP, log e — na morte — arquivo, XP, loot e quests, igual
 * para qualquer fonte. Não treina skills do herói (isso é do applyPlayerHit).
 * @param {object} state
 * @param {object} mon instância em state.monstersAlive
 * @param {number} amount dano já calculado (arredondado, ≥ 1)
 * @param {{ source?: string, label?: string, crit?: boolean }} opts
 * @returns {{ killed:boolean, dmgOut:number, dmgIn:0, mon:object, drops?:Array, source:string }|null}
 */
export function applyDamageToMonster(state, mon, amount, opts = {}) {
  if (!mon || !mon.alive || mon.zone !== state.zoneId) return null;
  const def = state._monsters[mon.id];
  if (!def) return null;
  const source = opts.source || 'player';
  const dmg = Math.max(1, Math.round(Number(amount) || 0));
  mon.hp -= dmg;
  const who = source === 'player' ? 'Você acerta' : `${opts.label || 'Aliado'} acerta`;
  pushLog(state, `${who} ${def.name} por ${dmg}${opts.crit ? ' (CRÍTICO)' : ''}.`, '');
  const dmgOut = dmg;

  if (mon.hp <= 0) {
    mon.alive = false;
    mon.hp = 0;
    pushLog(state, `${def.name} destruído.`, 'sys');
    // MCB: única transição vivo→morto — recompensa 1× por morte (antes do chefe, p/ o sync do Campo levar o saldo)
    if (monsterKillHook) { try { monsterKillHook(state, mon, def, source); } catch (e) { console.warn('[mcb] kill hook', e); } }
    // Bloco 7: chefe da Arena — XP/loot vão para o personagem PERMANENTE (arena-run, mesmas funções reais)
    if (def.boss && bossKillHook) {
      const out = bossKillHook(state, mon, def) || {};
      return { killed: true, dmgOut, dmgIn: 0, mon, drops: out.drops || [], source, boss: true, xp: out.xp || 0 };
    }
    reveal(state.arquivo, 'criaturas', def.id);
    addXp(state, def.xp);
    const drops = rollLoot(def.loot_table);
    for (const d of drops) {
      addToInventory(state.inventory, state._items[d.item_id], d.qty);
      pushLog(state, `Loot: ${state._items[d.item_id]?.name || d.item_id} x${d.qty}`, 'sys');
      if (d.item_id === 'item_doc_sangue_verde') {
        reveal(state.arquivo, 'pistas', 'pista_contrato_sangue_verde');
      }
    }
    state.flags.first_kill = true;
    if (def.zone === 'zone_g6') {
      advanceQuest(state, 'G6-Q01', 'step_combat');
      if (countItem(state.inventory, 'item_plaqueta_bot') >= 1) {
        advanceQuest(state, 'G6-Q01', 'step_loot');
      }
    }
    if (def.zone === 'zone_e4') {
      advanceQuest(state, 'E4-Q01', 'step_kill_e4');
      if (countItem(state.inventory, 'item_chip_sem_nome') >= 1) {
        advanceQuest(state, 'E4-Q01', 'step_chip');
      }
    }
    checkEventReady(state);
    return { killed: true, dmgOut, dmgIn: 0, mon, drops, source };
  }
  return { killed: false, dmgOut, dmgIn: 0, mon, source };
}

/**
 * Monster → player damage (independent of player attack).
 * Called by enemy AI on its own cooldown.
 */
export function monsterAttackPlayer(state, monUid, opts = {}) {
  const mon = state.monstersAlive.find((m) => m.uid === monUid && m.alive);
  if (!mon) return null;
  if (mon.zone !== state.zoneId) return null;
  const def = state._monsters[mon.id];
  if (!def) return null;

  const eq = getEquippedStats(state);
  // gp2: a IA contínua já validou o alcance real (float) no frame de impacto
  // (opts.rangeChecked). Chamadas por tile (API) mantêm chebyshev ≤ 1.
  if (!opts.rangeChecked && !isAiMeleeRange(mon, state.player)) {
    return null;
  }

  // Bloco 7: ataques do chefe escalam o ATAQUE do monstro (opts.atkMult, do config/data)
  const attacker = Number.isFinite(opts.atkMult) ? { ...def, ataque: Math.round((def.ataque || 0) * opts.atkMult) } : def;
  let dmgIn = calcDamage(attacker, state.player, 10, { armorDef: eq.armorDef });
  // Bloco 7: dano recebido passa pelos modificadores (poder temporário BLINDAGEM NEXA)
  dmgIn = Math.max(1, Math.round(getStat(STATS.DAMAGE_TAKEN, 1) * dmgIn));
  // Bloco 4: esquiva (i-frames) zera; defesa reduz (frente/costas) — decidido por player-actions
  const guard = playerDefenseHook ? playerDefenseHook(state, mon) : null;
  let dodged = false;
  let blocked = false;
  if (guard && guard.kind === 'dodge') {
    dodged = true;
    pushLog(state, `${def.name} ataca: ESQUIVOU`, '');
    return { dmgIn: 0, mon, died: false, dodged, blocked, raw: dmgIn, perfect: !!guard.perfect && !opts.hazard };
  }
  const raw = dmgIn;
  if (guard && guard.kind === 'block') {
    blocked = true;
    dmgIn = Math.max(1, Math.round(dmgIn * guard.mult));
  }
  // Bloco 6: escudo de energia (Núcleo Reforçado) absorve antes do HP
  const absorbed = playerAbsorbHook ? Math.max(0, Math.min(dmgIn, Math.round(playerAbsorbHook(state, dmgIn, mon) || 0))) : 0;
  dmgIn -= absorbed;
  state.player.hp -= dmgIn;
  trainSkill(state.player.skills, 'protecao', state._data.skills, 1);
  pushLog(state, `${def.name} ataca: -${dmgIn} HP${blocked ? ' (BLOQUEIO)' : ''}${absorbed ? ` (ESCUDO -${absorbed})` : ''}`, 'danger');

  let died = false;
  if (state.player.hp <= 0) {
    died = true;
    // Bloco 7: na Arena, a morte encerra a tentativa (arena-run reseta tudo e renasce na Arena com HP cheio)
    if (playerDeathHook && playerDeathHook(state, mon)) {
      return { dmgIn, mon, died, dodged, blocked, raw, absorbed, front: guard ? !!guard.front : false, arenaDeath: true };
    }
    state.player.hp = Math.ceil(state.player.hpMax * 0.5);
    const z = state._data.zones.zones.find((zz) => zz.id === state.zoneId);
    state.player.x = z.map.spawn.x;
    state.player.y = z.map.spawn.y;
    pushLog(state, `Você caiu. Respawn na entrada de ${z.code} (50% HP).`, 'danger');
  }
  return { dmgIn, mon, died, dodged, blocked, raw, absorbed, front: guard ? !!guard.front : false };
}

/** Bloco 7: gancho de abate de chefe — fn(state, mon, def) → { drops, xp } (recompensa real no save). */
let monsterKillHook = null;
/** MCB: chamado exatamente 1× quando um monstro morre (qualquer fonte de dano). */
export function setMonsterKillHook(fn) { monsterKillHook = typeof fn === 'function' ? fn : null; }
let bossKillHook = null;
export function setBossKillHook(fn) {
  bossKillHook = typeof fn === 'function' ? fn : null;
}

/** Bloco 7: gancho de morte — fn(state, mon) → true se tratou a morte (tentativa da Arena). */
let playerDeathHook = null;
export function setPlayerDeathHook(fn) {
  playerDeathHook = typeof fn === 'function' ? fn : null;
}

/** Bloco 6: gancho de absorção — fn(state, dmg, mon) → dano absorvido (0 = nada). */
let playerAbsorbHook = null;
export function setPlayerAbsorbHook(fn) {
  playerAbsorbHook = typeof fn === 'function' ? fn : null;
}

/** Bloco 4: gancho de defesa do herói — fn(state, mon) → { kind:'dodge'|'block', mult, front } | null. */
let playerDefenseHook = null;
export function setPlayerDefenseHook(fn) {
  playerDefenseHook = typeof fn === 'function' ? fn : null;
}

export function npcAt(state, x, y) {
  return state._data.npcs.npcs.find(
    (n) => n.zone === state.zoneId && n.x === x && n.y === y
  );
}

export function interactAdjacent(state) {
  const dirs = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [dx, dy] of dirs) {
    const n = npcAt(state, state.player.x + dx, state.player.y + dy);
    if (n) return n;
  }
  return null;
}

export function talkNpc(state, npc) {
  reveal(state.arquivo, 'personagens', npc.id);
  if (npc.faction) reveal(state.arquivo, 'faccoes', npc.faction);

  // —— G6 ——
  if (npc.id === 'npc_quest_giver_g6') {
    if (!state.quests.active.includes('G6-Q01') && !state.quests.completed.includes('G6-Q01')) {
      acceptQuest(state, 'G6-Q01');
      advanceQuest(state, 'G6-Q01', 'step_talk_rusk');
      return {
        title: npc.name,
        text: 'Você é novo na Ferrugem. Os bots na beira estão agitados. Derrube um Mk.1, pegue a plaqueta e leve pra Mara Venn na oficina (noroeste). WASD move. Clique/ataques no bot. F fala com NPCs.'
      };
    }
    return {
      title: npc.name,
      text: state.quests.completed.includes('G6-Q01')
        ? 'Você já fez o básico. Se Brak abrir o alçapão, o Subsolo espera.'
        : 'Ainda sem plaqueta? A beira fica ao sul. Depois, Mara.'
    };
  }

  if (npc.id === 'npc_mara_venn') {
    const q = state.quests.progress['G6-Q01'] || {};
    if (
      state.quests.active.includes('G6-Q01') &&
      q.step_combat &&
      countItem(state.inventory, 'item_plaqueta_bot') >= 1
    ) {
      advanceQuest(state, 'G6-Q01', 'step_explore');
      advanceQuest(state, 'G6-Q01', 'step_loot');
      advanceQuest(state, 'G6-Q01', 'step_skill');
      advanceQuest(state, 'G6-Q01', 'step_mara');
      completeQuest(state, 'G6-Q01');
      state.flags.event_0217_ready = true;
      return {
        title: npc.name,
        text: 'Plaqueta Mk.1... protocolos antigos. Anotei. Fique por perto — as luzes não estão normais hoje. E... cuidado com o alçapão a oeste. Brak sabe.',
        trigger0217: true
      };
    }
    if (state.flags.event_0217_done) {
      if (
        countItem(state.inventory, 'item_chave_runica_g6') >= 1 &&
        !state.quests.completed.includes('G6-Q02')
      ) {
        if (!state.quests.active.includes('G6-Q02')) acceptQuest(state, 'G6-Q02');
        removeFromInventory(state.inventory, 'item_chave_runica_g6', 1);
        advanceQuest(state, 'G6-Q02', 'step_entregar_chave');
        completeQuest(state, 'G6-Q02');
        return {
          title: npc.name,
          text: 'A chave... e o dispositivo que não apagou. Guarde o eco. O Subsolo Negro (E4) fica pelo alçapão — se Brak liberar.'
        };
      }
      return {
        title: npc.name,
        text: 'Isso não desligou. Fragmento de Nexa. Você viu. Não diga nada ainda. O negro sob a cidade escuta.'
      };
    }
    return {
      title: npc.name,
      text: 'Oficina da Mara. Se quebrou, eu vejo. Se pulsa Nexa, eu vejo melhor.'
    };
  }

  if (npc.id === 'npc_mercador_kesh') {
    trainSkill(state.player.skills, 'contrato', state._data.skills, 1);
    reveal(state.arquivo, 'faccoes', 'sindicato_espinha');
    return { title: npc.name, text: 'Créditos G6 ou troca. Sindicato Espinha cobra juros até no sono.', shop: npc.id };
  }

  if (npc.id === 'npc_treinadora_lia') {
    return {
      title: npc.name,
      text: 'Corte, Distância, Proteção — treine nos bots. Eu afio o instinto. (Treino pago: EM DESENVOLVIMENTO)'
    };
  }

  if (npc.id === 'npc_cidadao_tomo') {
    reveal(state.arquivo, 'pistas', 'pista_dragao_jovem');
    return {
      title: npc.name,
      text: 'As luzes piscaram de novo. Dizem que no Núcleo um filhote sumiu. Setenta e duas horas? Eu não conto.'
    };
  }

  if (npc.id === 'npc_informante_nyx') {
    reveal(state.arquivo, 'faccoes', 'sem_nome');
    reveal(state.arquivo, 'pistas', 'pista_dragao_jovem');
    if (state.quests.completed.includes('G6-Q01')) {
      state.flags.e4_path_opened_by_npc = true;
      return {
        title: npc.name,
        text: 'Custódios nervosos. Sem Nome ouvindo — no Subsolo Negro. Brak já pode abrir o alçapão oeste. Ou eu abri por você. Desça.'
      };
    }
    return {
      title: npc.name,
      text: 'Custódios nervosos. Sem Nome ouvindo. Você? Ainda é ninguém. Bom.'
    };
  }

  if (npc.id === 'npc_guarda_brak') {
    if (state.quests.completed.includes('G6-Q01')) {
      state.flags.e4_path_opened_by_npc = true;
      const unlocked = isE4Unlocked(state);
      return {
        title: npc.name,
        text: unlocked
          ? 'Alçapão liberado. Oeste, tile marcado E4. Subsolo Negro — ilegal, mutante, Sem Nome. Volta pelo mesmo caminho. Outras zonas ainda fechadas.'
          : 'Você terminou a noite. Abro o alçapão. Vá. Ordem: G6→E4→C2/D3→B1→A0→F5.',
        zoneBlock: true
      };
    }
    return {
      title: npc.name,
      text: 'Portão fechado pra zonas de risco. Termine o que Rusk pediu antes de mexer no alçapão. Ordem: G6→E4→C2/D3→B1→A0→F5.',
      zoneBlock: true
    };
  }

  if (npc.id === 'npc_misterioso_sombra') {
    reveal(state.arquivo, 'faccoes', 'custodios_nucleo');
    reveal(state.arquivo, 'pistas', 'pista_dragao_jovem');
    return {
      title: npc.name,
      text: 'Setenta e duas horas. O jovem não está no Núcleo. Alguém sabe. Alguém mente. No Subsolo, as sombras repetem o número.'
    };
  }

  // —— E4 ——
  if (npc.id === 'npc_e4_quest_hesh') {
    if (!state.quests.active.includes('E4-Q01') && !state.quests.completed.includes('E4-Q01')) {
      acceptQuest(state, 'E4-Q01');
      advanceQuest(state, 'E4-Q01', 'step_talk_hesh');
      reveal(state.arquivo, 'faccoes', 'sem_nome');
      return {
        title: npc.name,
        text: 'Novo no Negro? Prove. Vá ao Poço de Sucata (sul), derrube o que se mexer, traga um Chip Sem Nome. Sem Nome vê tudo — e não explica nada.'
      };
    }
    if (state.quests.active.includes('E4-Q01')) {
      if (countItem(state.inventory, 'item_chip_sem_nome') >= 1) {
        advanceQuest(state, 'E4-Q01', 'step_explore_poco');
        advanceQuest(state, 'E4-Q01', 'step_kill_e4');
        advanceQuest(state, 'E4-Q01', 'step_chip');
        advanceQuest(state, 'E4-Q01', 'step_report_hesh');
        removeFromInventory(state.inventory, 'item_chip_sem_nome', 1);
        completeQuest(state, 'E4-Q01');
        reveal(state.arquivo, 'pistas', 'pista_presenca_sem_nome');
        return {
          title: npc.name,
          text: 'Chip aceito. Passe do Subsolo é seu. Cinza sabe de um contrato verde — se quiser ouvir. Custódios ainda contam as setenta e duas horas.'
        };
      }
      return {
        title: npc.name,
        text: 'Poço ao sul. Chip. Volte vivo.'
      };
    }
    return {
      title: npc.name,
      text: 'Você já pagou o pedágio. O Negro não esquece. Nem os Sem Nome.'
    };
  }

  if (npc.id === 'npc_e4_mercador_vex') {
    trainSkill(state.player.skills, 'contrato', state._data.skills, 1);
    reveal(state.arquivo, 'faccoes', 'sem_nome');
    return {
      title: npc.name,
      text: 'Mercado negro. Lâmina Sombra, Colete de Túnel, sucata. Créditos G6 ainda passam. Perguntas caras.',
      shop: npc.id
    };
  }

  if (npc.id === 'npc_e4_informante_cinza') {
    reveal(state.arquivo, 'faccoes', 'sem_nome');
    reveal(state.arquivo, 'faccoes', 'cla_sangue_verde');
    reveal(state.arquivo, 'pistas', 'pista_contrato_sangue_verde');
    reveal(state.arquivo, 'pistas', 'pista_presenca_sem_nome');
    trainSkill(state.player.skills, 'contrato', state._data.skills, 1);
    if (state.quests.completed.includes('E4-Q01') && !state.quests.completed.includes('E4-Q02')) {
      if (!state.quests.active.includes('E4-Q02')) acceptQuest(state, 'E4-Q02');
      advanceQuest(state, 'E4-Q02', 'step_talk_cinza');
      completeQuest(state, 'E4-Q02');
      const hasDoc = countItem(state.inventory, 'item_doc_sangue_verde') >= 1;
      return {
        title: npc.name,
        text: hasDoc
          ? 'Esse papel... Contrato Sangue Verde. Aponta C2 Forja Verde. Sem acesso. Sem Nome já sabia. Custódios também contam horas no Núcleo.'
          : 'Contrato Sangue Verde murmura no metal. C2. Você não entra — ainda. Sem Nome escuta. Clã Sangue Verde forja longe daqui.'
      };
    }
    return {
      title: npc.name,
      text: 'Sem Nome não tem rosto. Sangue Verde tem contrato. Custódios têm um filhote faltando e um relógio de setenta e duas horas.'
    };
  }

  if (npc.id === 'npc_e4_mutante_kal') {
    reveal(state.arquivo, 'pistas', 'pista_dragao_jovem');
    return {
      title: npc.name,
      text: 'As cascas coçam quando os reatores gritam. Dizem que um jovem dragão sumiu. Setenta e duas horas. Eu só quero que a sucata pare de andar.'
    };
  }

  if (npc.id === 'npc_e4_guarda_selo') {
    return {
      title: npc.name,
      text: 'Túneis pra C2 e D3 selados. Forja Verde, Rede Rúnica — EM DESENVOLVIMENTO. Ordem de risco: você está em E4. Não force.',
      zoneBlock: true
    };
  }

  if (npc.id === 'npc_e4_arquivo_rasgado') {
    reveal(state.arquivo, 'pistas', 'pista_torre_fantasma');
    return {
      title: npc.name,
      text: 'Cartaz rasgado: silhueta de torre acima das nuvens. «ÓRBITA NÃO RESPONDE.» F5 Órbita Fantasma — só rumor. Ninguém sobe daqui.'
    };
  }

  return { title: npc.name, text: npc.description };
}

export function acceptQuest(state, questId) {
  if (state.quests.active.includes(questId) || state.quests.completed.includes(questId)) return;
  state.quests.active.push(questId);
  state.quests.progress[questId] = {};
  reveal(state.arquivo, 'quests', questId);
  const q = state._quests[questId];
  pushLog(state, `Quest aceita: ${q.name}`, 'sys');
}

export function advanceQuest(state, questId, stepId) {
  if (!state.quests.active.includes(questId)) return;
  if (!state.quests.progress[questId]) state.quests.progress[questId] = {};
  state.quests.progress[questId][stepId] = true;
}

export function completeQuest(state, questId) {
  const q = state._quests[questId];
  if (!q || state.quests.completed.includes(questId)) return;
  const prog = state.quests.progress[questId] || {};
  for (const s of q.steps) {
    if (!prog[s.id]) return;
  }
  state.quests.active = state.quests.active.filter((id) => id !== questId);
  state.quests.completed.push(questId);
  addXp(state, q.rewards.xp || 0);
  for (const it of q.rewards.items || []) {
    addToInventory(state.inventory, state._items[it.item_id], it.qty);
  }
  if (q.rewards.reputation) {
    for (const [fid, amt] of Object.entries(q.rewards.reputation)) {
      addReputation(state.reputation, fid, amt);
    }
  }
  pushLog(state, `Quest concluída: ${q.name} (+${q.rewards.xp} XP)`, 'sys');
}

export function useItem(state, itemId) {
  const def = state._items[itemId];
  if (!def) return;
  if (def.type === 'consumable' && def.consumable) {
    if (!removeFromInventory(state.inventory, itemId, 1)) return;
    state.player.hp = Math.min(state.player.hpMax, state.player.hp + (def.consumable.hp || 0));
    state.player.nexa = Math.min(state.player.nexaMax, state.player.nexa + (def.consumable.nexa || 0));
    if (def.consumable.nexa) trainSkill(state.player.skills, 'canalizacao', state._data.skills, 1);
    pushLog(state, `Usou ${def.name}.`, 'sys');
    return;
  }
  pushLog(state, 'Não pode usar este item assim.', 'warn');
}

export function equipItem(state, itemId) {
  const def = state._items[itemId];
  if (!def || !def.equip_slot) {
    pushLog(state, 'Não equipável.', 'warn');
    return;
  }
  const slot = def.equip_slot;
  if (state.equipment[slot]) {
    const prev = state.inventory.find((i) => i.item_id === state.equipment[slot]);
    if (prev) prev.equipped = false;
  }
  const inv = state.inventory.find((i) => i.item_id === itemId);
  if (!inv) return;
  inv.equipped = true;
  state.equipment[slot] = itemId;
  pushLog(state, `Equipou ${def.name}.`, 'sys');
}

export function unequipItem(state, slot) {
  const id = state.equipment[slot];
  if (!id) return;
  const inv = state.inventory.find((i) => i.item_id === id);
  if (inv) inv.equipped = false;
  state.equipment[slot] = null;
  pushLog(state, 'Item removido.', 'sys');
}

export function discardItem(state, itemId) {
  const def = state._items[itemId];
  if (!def || def.discardable === false) {
    pushLog(state, 'Não pode descartar.', 'warn');
    return;
  }
  removeFromInventory(state.inventory, itemId, 1);
  pushLog(state, `Descartou ${def.name}.`, '');
}

export function buyItem(state, itemId) {
  const def = state._items[itemId];
  if (!def) return;
  const cred = countItem(state.inventory, 'item_credito_g6');
  if (cred < def.value) {
    pushLog(state, 'Créditos insuficientes.', 'warn');
    return;
  }
  removeFromInventory(state.inventory, 'item_credito_g6', def.value);
  addToInventory(state.inventory, def, 1);
  trainSkill(state.player.skills, 'contrato', state._data.skills, 1);
  pushLog(state, `Comprou ${def.name}.`, 'sys');
}

export function tryEnterZone(state, zoneCode) {
  const z = state._data.zones.zones.find((x) => x.code === zoneCode);
  if (!z) return { blocked: true, message: 'Zona inexistente.' };
  if (z.code === 'E4') {
    if (!isE4Unlocked(state)) {
      pushLog(state, z.blocked_message, 'danger');
      return { blocked: true, message: z.blocked_message };
    }
    const ok = enterZone(state, 'zone_e4');
    return ok ? { blocked: false, entered: true, zone: z } : { blocked: true, message: z.blocked_message };
  }
  if (z.code === 'G6') {
    const ok = enterZone(state, 'zone_g6');
    return ok ? { blocked: false, entered: true, zone: z } : { blocked: true, message: 'Falha ao voltar.' };
  }
  if (!z.playable) {
    pushLog(state, z.blocked_message || 'Zona bloqueada.', 'danger');
    return { blocked: true, message: z.blocked_message };
  }
  return { blocked: false, zone: z };
}

/** Respawn monsters of current zone if all dead there */
export function maybeRespawn(state) {
  // EVO: Campo de Ascensão controla as próprias ondas (campo-ascensao.js) — sem respawn automático
  if (state.campoMode || state.brMode) return; // Campo / Arena Principal: sem respawn do mundo
  const here = state.monstersAlive.filter((m) => m.zone === state.zoneId);
  if (!here.length) return;
  if (here.every((m) => !m.alive)) {
    for (const m of here) {
      const def = state._monsters[m.id];
      m.alive = true;
      m.hp = def.hp;
      // gp2: renasce no ponto de origem (a IA contínua reinicia o runtime ao ver alive=true)
      if (Number.isInteger(m.homeX) && Number.isInteger(m.homeY)) {
        m.x = m.homeX;
        m.y = m.homeY;
      }
    }
    const z = state._data.zones.zones.find((zz) => zz.id === state.zoneId);
    pushLog(state, z?.code === 'E4' ? 'A sucata se remexe de novo...' : 'Novos bots surgem na beira...', 'warn');
  }
}
