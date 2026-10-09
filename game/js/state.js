import { createSkillsFromRace } from '../../rules/skills.js?v=20261009graf';
import { initReputation } from '../../rules/reputation.js?v=20261009graf';
import { createEmptyArquivo, reveal } from './arquivo.js?v=20261009graf';
import { indexById } from './data-loader.js?v=20261009graf';
import { getConfig } from './gameplay-config.js?v=20261009graf';
import { getStat, STATS } from './modifiers.js?v=20261009graf';

export function createNewGame(data, { name, raceId }) {
  const race = data.races.races.find((r) => r.id === raceId);
  if (!race || !race.playable) throw new Error('Raça inválida');
  const attrs = { ...race.base_attrs };
  const skills = createSkillsFromRace(data.skills, race);
  const g6 = data.zones.zones.find((z) => z.id === 'zone_g6');
  const state = {
    zoneId: 'zone_g6',
    player: {
      name: name.slice(0, 20) || 'Viajante',
      raceId,
      mcb: 0,
      mcbTotal: 0,
      arsenal: { owned: [] },
      x: g6.map.spawn.x,
      y: g6.map.spawn.y,
      hp: attrs.hp,
      hpMax: attrs.hp,
      nexa: attrs.nexa,
      nexaMax: attrs.nexa,
      ataque: attrs.ataque,
      defesa: attrs.defesa,
      distancia: attrs.distancia,
      velocidade: attrs.velocidade,
      nivel: attrs.nivel,
      xp: attrs.xp,
      xpNext: data.skills.character_xp_per_level || 100,
      skills
    },
    inventory: [
      { item_id: 'item_lata_oleo', qty: 1, equipped: false },
      { item_id: 'item_credito_g6', qty: 15, equipped: false }
    ],
    equipment: { weapon: null, armor: null, body: null, accessory: null, helmet: null, pants: null },
    quests: { active: [], completed: [], progress: {} },
    reputation: initReputation(data.factions.factions),
    arquivo: createEmptyArquivo(data),
    flags: {
      intro_done: false,
      event_0217_done: false,
      event_0217_ready: false,
      event_0217_playing: false,
      first_kill: false,
      explored_beira: false,
      skill_trained: false,
      e4_path_opened_by_npc: false,
      e4_visited: false,
      explored_poco_e4: false
    },
    monstersAlive: spawnMonsters(data),
    /** gp3: passivas obtidas / escolhas pendentes (PassiveManager). */
    passives: { owned: [], pending: 0, lastOffer: [], offer: null },
    /** gp3: Mini Dragão companheiro (estágio salvo; 1 = Rajada, 2 = + Chama Concentrada). */
    dragon: { stage: 1, level: 1 },
    /** Bloco 7: estatísticas permanentes (arenaBossWins…). */
    stats: {},
    journal: [],
    log: [],
    _data: data,
    _items: indexById(data.items.items),
    _monsters: indexById(data.monsters.monsters),
    _npcs: indexById(data.npcs.npcs),
    _quests: indexById(data.quests.quests)
  };
  reveal(state.arquivo, 'zonas', 'zone_g6');
  reveal(state.arquivo, 'personagens', 'npc_guarda_brak');
  pushLog(state, 'Você chega à Periferia Ferrugem (G6). Ano 2847.', 'sys');
  return state;
}

export function spawnMonsters(data) {
  const list = [];
  let uid = 1;
  for (const m of data.monsters.monsters) {
    for (const t of m.spawn_tiles || []) {
      list.push({
        uid: uid++,
        id: m.id,
        zone: m.zone,
        x: t.x,
        y: t.y,
        hp: m.hp,
        hpMax: m.hp,
        alive: true
      });
    }
  }
  return list;
}

export function applySave(data, saved) {
  const state = createNewGame(data, {
    name: saved.player.name,
    raceId: saved.player.raceId
  });
  Object.assign(state.player, saved.player);
  // MCB: saves antigos carregam com carteira vazia (MCB 0) — migração não destrutiva
  if (!Number.isFinite(state.player.mcb)) state.player.mcb = 0;
  if (!Number.isFinite(state.player.mcbTotal)) state.player.mcbTotal = state.player.mcb;
  if (!state.player.arsenal || !Array.isArray(state.player.arsenal.owned)) state.player.arsenal = { owned: [] };
  if (saved.profile?.id) state.profile = { ...saved.profile };
  state.inventory = saved.inventory || [];
  state.equipment = { weapon: null, armor: null, body: null, accessory: null, helmet: null, pants: null, ...(saved.equipment || {}) };
  state.quests = saved.quests || state.quests;
  state.reputation = saved.reputation || state.reputation;
  state.arquivo = saved.arquivo || state.arquivo;
  state.flags = { ...state.flags, ...saved.flags };
  state.flags.event_0217_playing = false;
  // Migrate old saves: monsters may lack zone
  if (saved.monstersAlive) {
    state.monstersAlive = saved.monstersAlive.map((m) => {
      if (m.zone) return m;
      const def = state._monsters[m.id];
      return { ...m, zone: def?.zone || 'zone_g6' };
    });
  }
  // gp3: passivas + dragão (saves antigos: [] / estágio 1)
  const sp = saved.passives;
  state.passives = {
    owned: Array.isArray(sp) ? sp.slice() : Array.isArray(sp?.owned) ? sp.owned.slice() : [],
    pending: Number.isFinite(saved.passivePending) ? saved.passivePending : Number(sp?.pending) || 0,
    lastOffer: Array.isArray(saved.passiveLastOffer) ? saved.passiveLastOffer.slice() : [],
    offer: null
  };
  state.dragon = {
    stage: Math.max(1, Math.floor(Number(saved.dragon?.stage) || 1)),
    level: Math.max(1, Math.floor(Number(saved.dragon?.level) || 1))
  };
  // Bloco 7: estatísticas permanentes (saves antigos: {})
  state.stats = saved.stats && typeof saved.stats === 'object' && !Array.isArray(saved.stats) ? { ...saved.stats } : {};
  state.journal = saved.journal || [];
  state.zoneId = saved.zoneId || 'zone_g6';
  if (saved.logTail) state.log = saved.logTail;
  // Ensure arquivo has new E4 entries if save is from Phase 01
  mergeArquivo(state, data);
  pushLog(state, 'Jogo carregado.', 'sys');
  return state;
}

function mergeArquivo(state, data) {
  const fresh = createEmptyArquivo(data);
  for (const cat of Object.keys(fresh)) {
    if (!state.arquivo[cat]) state.arquivo[cat] = {};
    for (const [id, entry] of Object.entries(fresh[cat])) {
      if (!state.arquivo[cat][id]) {
        state.arquivo[cat][id] = { ...entry };
      }
    }
  }
}

export function pushLog(state, msg, cls = '') {
  state.log.push({ msg, cls, t: Date.now() });
  if (state.log.length > 80) state.log.shift();
}

/**
 * EVO: curva de XP (gameplay-config.progression). Nível 1 → 100 (igual aos saves antigos).
 * xpNext(n) = round(base × growth^(n−1) + linear × (n−1)).
 */
export function xpForLevel(n) {
  const c = getConfig().progression;
  if (!c) return 100;
  const k = Math.max(0, (n | 0) - 1);
  return Math.max(1, Math.round(c.xpBase * Math.pow(c.xpGrowth, k) + c.xpLinear * k));
}
/** Ganho acumulado (arredondado) de um atributo do nível 1 até n — evita deriva por arredondamento. */
function gainAt(per, n) { return Math.round(per * Math.max(0, n - 1)); }

export function addXp(state, amount) {
  state.player.xp += amount;
  const prog = getConfig().progression;
  while (state.player.xp >= state.player.xpNext) {
    if (prog && state.player.nivel >= prog.maxLevel) { state.player.xp = Math.min(state.player.xp, state.player.xpNext - 1); break; }
    state.player.xp -= state.player.xpNext;
    state.player.nivel += 1;
    const n = state.player.nivel;
    const per = prog?.perLevel || { hpMax: 5, nexaMax: 3, ataque: 0, defesa: 0 };
    // gp3: HP máximo = base (+X/nível, EVO: config) passada pelas passivas (modifiers MAX_HP)
    const pl = state.player;
    pl.hpMaxBase = (Number.isFinite(pl.hpMaxBase) ? pl.hpMaxBase : pl.hpMax) + (gainAt(per.hpMax, n) - gainAt(per.hpMax, n - 1));
    pl.hpMax = Math.max(1, Math.round(getStat(STATS.MAX_HP, pl.hpMaxBase)));
    state.player.nexaMax += gainAt(per.nexaMax, n) - gainAt(per.nexaMax, n - 1);
    // EVO: dano e defesa também crescem com o nível
    pl.ataque = (pl.ataque || 0) + (gainAt(per.ataque, n) - gainAt(per.ataque, n - 1));
    pl.defesa = (pl.defesa || 0) + (gainAt(per.defesa, n) - gainAt(per.defesa, n - 1));
    state.player.hp = state.player.hpMax;
    state.player.xpNext = prog ? xpForLevel(n) : state.player.xpNext;
    // gp3: cada nível = 1 escolha de passiva na fila (tela abre automaticamente)
    if (!state.passives || typeof state.passives !== 'object') state.passives = { owned: [], pending: 0, lastOffer: [], offer: null };
    state.passives.pending = (state.passives.pending || 0) + 1;
    state.player.nexa = state.player.nexaMax;
    pushLog(state, `Nível ${state.player.nivel}!`, 'sys');
  }
}

export function getEquippedStats(state) {
  let weaponAtk = 0;
  let armorDef = 0;
  let skill = 'corte';
  let ranged = false;
  const w = state.equipment.weapon && state._items[state.equipment.weapon];
  const a = state.equipment.armor && state._items[state.equipment.armor];
  if (w && w.stats) {
    weaponAtk = w.stats.ataque || 0;
    skill = w.stats.skill || 'corte';
    ranged = !!w.stats.ranged;
  }
  if (a && a.stats) armorDef = a.stats.defesa || 0;
  // M3D/itens: ROUPA (body) e ACESSÓRIO somam ataque/defesa (ataque da arma, defesa da armadura continuam iguais)
  // MCB/ARSENAL: capacete e calça somam ataque/defesa como roupa/acessório
  for (const slot of ['body', 'accessory', 'helmet', 'pants']) {
    const it = state.equipment[slot] && state._items[state.equipment[slot]];
    if (it && it.stats) { weaponAtk += it.stats.ataque || 0; armorDef += it.stats.defesa || 0; }
  }
  if (a && a.stats && a.stats.ataque) weaponAtk += a.stats.ataque;
  return { weaponAtk, armorDef, skill, ranged };
}

/** Unlock E4: G6-Q01 + (02:17 OR NPC opened path) */
export function isE4Unlocked(state) {
  if (!state.quests.completed.includes('G6-Q01')) return false;
  return !!(state.flags.event_0217_done || state.flags.e4_path_opened_by_npc);
}
