/**
 * Arena de Teste — modo separado (não altera saves / G6 / E4).
 * 1 jogador + 2 inimigos, regras de combate existentes.
 * Simplicidade extrema: piso industrial aberto, pouca decoração.
 */
import { createSkillsFromRace } from '../../rules/skills.js?v=20261003m10c';
import { initReputation } from '../../rules/reputation.js?v=20261003m10c';
import { createEmptyArquivo } from './arquivo.js?v=20261003m10c';
import { indexById } from './data-loader.js?v=20261003m10c';
import { pushLog } from './state.js?v=20261003m10c';

export const ARENA_ZONE_ID = 'zone_arena';

/** Bloco 7: arena antiga (14 colunas) + portão + covil do chefe. Linhas 0–11. */
const OLD_W = [
  'WWWWWWWWWWWWW',
  'W............',
  'W..#......#..',
  'W............',
  'W............',
  'W............',
  'W............',
  'W............',
  'W............',
  'W..#......#..',
  'W............',
  'WWWWWWWWWWWWW'
];
const ARENA_TILES = OLD_W.map((row, y) => {
  const gate = y >= 3 && y <= 8 ? '.' : 'W';
  const lair = y === 0 || y === 11 ? 'WWWWWWWWWWW' : (y === 1 || y === 10 ? '..#.....#..' : '...........');
  return row + gate + lair + 'W';
});

/** Mapa aberto só para treino — injetado em runtime, não mexe em G6/E4 */
export function buildArenaZone() {
  return {
    id: ARENA_ZONE_ID,
    code: 'AR',
    name: 'Arena de Teste',
    risk: 0,
    playable: true,
    description: 'Campo de treino. Movimento, combate e feedback visual.',
    blocked_message: null,
    map: {
      width: ARENA_TILES[0].length,
      height: ARENA_TILES.length,
      tile_size: 48,
      spawn: { x: 3, y: 6 },
      // Piso livre no centro; poucas paredes/caixas nas bordas internas.
      // Bloco 7: colunas 0–12 idênticas às de antes; portão aberto na coluna 13 (linhas 3–8)
      // para o COVIL do GIGANTE VERDE (colunas 14–24).
      tiles: ARENA_TILES.slice(),
      legend: {
        W: 'wall',
        '.': 'floor',
        '#': 'street',
        B: 'bot_spawn'
      },
      poi: [
        { id: 'poi_arena_centro', x: 7, y: 5, label: 'AR · ARENA DE TESTE' },
        { id: 'poi_arena_covil', x: 19, y: 5, label: 'COVIL · GIGANTE VERDE' }
      ],
      exits: []
    }
  };
}

/**
 * Estado efêmero da arena. Nunca deve ser gravado no save do mundo.
 */
export function createArenaState(data, { name = 'Testador', raceId = 'humano', from = null, boss = null } = {}) {
  const race = data.races.races.find((r) => r.id === raceId) || data.races.races.find((r) => r.playable);
  const attrs = { ...race.base_attrs };
  const skills = createSkillsFromRace(data.skills, race);
  const arenaZone = buildArenaZone();

  const zonesClone = {
    ...data.zones,
    zones: [...data.zones.zones.filter((z) => z.id !== ARENA_ZONE_ID), arenaZone]
  };
  const dataClone = { ...data, zones: zonesClone };

  const monCombate = data.monsters.monsters.find((m) => m.id === 'mon_bot_combate_mk1');
  const monPatrulha = data.monsters.monsters.find((m) => m.id === 'mon_bot_patrulha_mk1');
  const m1 = monCombate || data.monsters.monsters[0];
  const m2 = monPatrulha || data.monsters.monsters[1] || m1;

  const state = {
    zoneId: ARENA_ZONE_ID,
    arenaMode: true,
    player: {
      name: (name || 'Testador').slice(0, 20),
      raceId: race.id,
      x: arenaZone.map.spawn.x,
      y: arenaZone.map.spawn.y,
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
      { item_id: 'item_lamina_sucata', qty: 1, equipped: true },
      { item_id: 'item_lata_oleo', qty: 2, equipped: false },
      { item_id: 'item_credito_g6', qty: 10, equipped: false }
    ],
    equipment: { weapon: 'item_lamina_sucata', armor: null, body: null, accessory: null, helmet: null, pants: null },
    quests: { active: [], completed: [], progress: {} },
    reputation: initReputation(data.factions.factions),
    arquivo: createEmptyArquivo(data),
    flags: {
      intro_done: true,
      event_0217_done: false,
      event_0217_ready: false,
      event_0217_playing: false,
      first_kill: false,
      explored_beira: false,
      skill_trained: false,
      e4_path_opened_by_npc: false,
      e4_visited: false,
      explored_poco_e4: false,
      arena: true
    },
    passives: { owned: [], pending: 0, lastOffer: [], offer: null },
    dragon: { stage: 1, level: 1 },
    monstersAlive: [
      {
        uid: 9001,
        id: m1.id,
        zone: ARENA_ZONE_ID,
        x: 9,
        y: 5,
        hp: m1.hp,
        hpMax: m1.hp,
        alive: true,
        arenaLabel: 'INIMIGO 1'
      },
      {
        uid: 9002,
        id: m2.id,
        zone: ARENA_ZONE_ID,
        x: 9,
        y: 7,
        hp: m2.hp,
        hpMax: m2.hp,
        alive: true,
        arenaLabel: 'INIMIGO 2'
      }
    ],
    journal: [],
    log: [],
    _data: dataClone,
    _items: indexById(data.items.items),
    _monsters: indexById(data.monsters.monsters),
    _npcs: indexById(data.npcs.npcs),
    _quests: indexById(data.quests.quests)
  };

  const invW = state.inventory.find((i) => i.item_id === 'item_lamina_sucata');
  if (invW) invW.equipped = true;

  // Bloco 7: personagem PERMANENTE (cópia profunda; nada daqui volta ao save sem arena-run)
  if (from && from.player) {
    const src = JSON.parse(JSON.stringify({
      player: from.player, inventory: from.inventory, equipment: from.equipment,
      passives: from.passives, dragon: from.dragon, arquivo: from.arquivo, reputation: from.reputation
    }));
    Object.assign(state.player, src.player);
    state.player.x = arenaZone.map.spawn.x;
    state.player.y = arenaZone.map.spawn.y;
    state.player.hp = state.player.hpMax;
    state.player.nexa = state.player.nexaMax;
    if (!state.player.skills || !Object.keys(state.player.skills).length) state.player.skills = skills;
    state.inventory = Array.isArray(src.inventory) ? src.inventory : state.inventory;
    state.equipment = { weapon: null, armor: null, body: null, accessory: null, helmet: null, pants: null, ...(src.equipment || state.equipment) };
    const sp = src.passives || {};
    state.passives = { owned: Array.isArray(sp.owned) ? sp.owned.slice() : [], pending: 0, lastOffer: [], offer: null };
    state.dragon = { stage: Math.max(1, src.dragon?.stage || 1), level: Math.max(1, src.dragon?.level || 1) };
    if (src.arquivo && Object.keys(src.arquivo).length) state.arquivo = src.arquivo;
    if (src.reputation && Object.keys(src.reputation).length) state.reputation = src.reputation;
    state.arenaFromPermanent = true;
  }

  // Bloco 7: GIGANTE VERDE (chefe real do sistema de inimigos; HP definido por arena-run)
  const bossDef = boss && data.monsters.monsters.find((m) => m.id === boss.monsterId);
  if (bossDef) {
    state.monstersAlive.push({
      uid: boss.uid,
      id: bossDef.id,
      zone: ARENA_ZONE_ID,
      x: boss.spawn.x,
      y: boss.spawn.y,
      homeX: boss.spawn.x,
      homeY: boss.spawn.y,
      hp: bossDef.hp,
      hpMax: bossDef.hp,
      alive: true,
      boss: true,
      arenaLabel: 'GIGANTE VERDE'
    });
  }

  pushLog(state, bossDef
    ? 'Arena — 2 bots de treino · a leste, o covil do GIGANTE VERDE. Joystick L · Ataque R.'
    : 'Arena — 1 jogador · 2 inimigos. Joystick L · Ataque R.', 'sys');
  return state;
}

export function isArenaState(state) {
  return !!(state && (state.arenaMode || state.flags?.arena || state.zoneId === ARENA_ZONE_ID));
}
