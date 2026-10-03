import { scaleBrConfig } from './br-map.js?v=20261003m10f';
/** Load all data/*.json — single source of truth */
const DATA_BASE = new URL('../../data/', import.meta.url).href;

export async function loadAllData() {
  const files = [
    'zones', 'races', 'factions', 'npcs', 'quests', 'items', 'monsters', 'skills', 'passives',
    // Bloco 7: poderes temporários da Arena (nunca vão para o save)
    'arena_powers',
    // EVO: Campo de Ascensão (ondas) + tabelas de recompensa extra
    'campo_ascensao', 'recompensas',
    // MODELOS3D/itens: categoria/raridade/visual dos itens antigos (items.json antigo intacto)
    'items_meta',
    // MCB/ARSENAL: moeda, recompensas, preços, atributos e classes de arma (config única)
    'arsenal',
    // ARENA PRINCIPAL (BR PvE): mapa/regiões/diretor/loot/zona segura/extração (config única)
    'arena_br'
  ];
  const data = {};
  await Promise.all(
    files.map(async (f) => {
      const res = await fetch(`${DATA_BASE}${f}.json`);
      if (!res.ok) throw new Error(`Falha ao carregar data/${f}.json (${res.status})`);
      data[f] = await res.json();
    })
  );
  // MASTER 10: Arena Principal no tamanho da escala configurada (zona.escala; ?brScale=1 = mapa original)
  if (data.arena_br) data.arena_br = scaleBrConfig(data.arena_br);
  const meta = data.items_meta?.meta || {};
  for (const it of data.items?.items || []) if (meta[it.id]) Object.assign(it, meta[it.id]);
  return data;
}

export function indexById(arr, key = 'id') {
  const m = {};
  for (const o of arr) m[o[key]] = o;
  return m;
}
