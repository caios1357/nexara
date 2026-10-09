/**
 * NEXARA — ARENA PRINCIPAL: itens com RARIDADE, BOLSA (30 espaços) e VENDA no Mercado Negro.
 *
 * Cada equipamento encontrado é uma INSTÂNCIA (uid próprio) de um item-base do Arsenal (eq_*), com raridade
 * (comum → lendário) que multiplica os atributos. Registro persistente em player.brItens {uid:{b,r}}; a definição
 * é reconstruída em runtime (hydrate) — o items.json não muda. A instância vive no inventário normal
 * (mesmo caminho de EQUIPAR do Arsenal/Vestiário); a BOLSA é a vista dos itens da Arena NÃO equipados
 * + materiais marcados bolsa:true. Capacidade: arena_br.bolsa.capacidade (30).
 *
 * Anti-exploit: só itens da Arena (brItem) e materiais da bolsa são vendáveis (itens do Arsenal comprados NÃO —
 * com preço de teste 0 isso viraria MCB infinito); venda remove o item de TODOS os estados espelhados no mesmo
 * passo; uid vendido entra em player.brVendidos (não vende 2×); preço com teto sobre o preço real de compra.
 */
import { basePriceOf } from './mcb.js?v=20261009forte';
import { statSheet, compareSheets } from './vestiario.js?v=20261009forte';

const RAR = ['comum', 'incomum', 'raro', 'epico', 'lendario'];
let uidSeq = 0;
const stats = { rolled: 0, sold: 0, soldMcb: 0, refusedSell: 0, bagFull: 0, hydrated: 0 };
export const brItemStats = () => ({ ...stats });

const cfgOf = (s) => s?._data?.arena_br || null;
export const isBrItemId = (id) => typeof id === 'string' && id.startsWith('brx_');
export function bagCap(s) { return cfgOf(s)?.bolsa?.capacidade || 30; }

/** Definição runtime de uma instância (base do Arsenal × raridade). */
export function brDefFor(s, uid, rec) {
  const cfg = cfgOf(s); const base = s._items[rec?.b] || s._data?.items?.items?.find((i) => i.id === rec?.b);
  if (!cfg || !base) return null;
  const R = cfg.raridades || {}; const mult = R.multAtributo?.[rec.r] || 1;
  const st = { ...(base.stats || {}) };
  for (const k of ['ataque', 'defesa']) if (typeof st[k] === 'number' && st[k] > 0) st[k] = Math.max(st[k] + (rec.r === 'comum' ? 0 : 1), Math.round(st[k] * mult));
  const attrs = {};
  for (const [k, v] of Object.entries(base.attrs || {})) attrs[k] = typeof v === 'number' ? +(v * mult).toFixed(v % 1 ? 2 : 0) : v;
  return {
    ...base, id: uid, name: `${base.name} · ${R.nomes?.[rec.r] || rec.r}`, rarity: rec.r, raridade: rec.r, stats: st, attrs,
    arsenal: false, brItem: true, brBase: base.id, discardable: true, stackable: false, max_stack: 1,
    description: `${base.description || ''} Encontrado na Arena (${R.nomes?.[rec.r] || rec.r}).`, value: sellPriceOfDef(s, { ...base, rarity: rec.r, brItem: true, brBase: base.id })
  };
}
/** Registra (no índice de itens do estado) todas as instâncias do registro do jogador. */
export function hydrateBrItems(s) {
  if (!s?._items || !s.player) return 0;
  const reg = s.player.brItens || {}; let n = 0;
  for (const [uid, rec] of Object.entries(reg)) { if (s._items[uid]) continue; const d = brDefFor(s, uid, rec); if (d) { s._items[uid] = d; n++; } }
  // segurança: equipado/inventário apontando para instância sem registro → remove a referência (nunca quebra a UI)
  for (const [slot, id] of Object.entries(s.equipment || {})) if (isBrItemId(id) && !s._items[id]) s.equipment[slot] = null;
  if (Array.isArray(s.inventory)) s.inventory = s.inventory.filter((e) => !isBrItemId(e.item_id) || s._items[e.item_id]);
  stats.hydrated += n;
  return n;
}

export function bagEntries(s) {
  return (s?.inventory || []).filter((e) => !e.equipped && (isBrItemId(e.item_id) || e.bolsa));
}
export function bagCount(s) { return bagEntries(s).length; }

/** Sorteio ponderado {a: peso}. */
function pickW(w, rnd) { const ent = Object.entries(w || {}).filter(([, v]) => v > 0); const tot = ent.reduce((a, [, v]) => a + v, 0); let x = rnd() * tot; for (const [k, v] of ent) { x -= v; if (x <= 0) return k; } return ent[ent.length - 1]?.[0]; }

/** M10: sobe N níveis na escada de loot (basico→medio→avancado→alto→lendario). */
export function lootTierUp(s, tier, n = 1) {
  const cfg = cfgOf(s); const ord = cfg?.lootOrdem || ['basico', 'medio', 'avancado', 'alto', 'lendario'];
  const i = ord.indexOf(tier); if (i < 0) return tier;
  return ord[Math.min(ord.length - 1, i + n)];
}

/** Loot de um baú/caixa/monstro: equipamento (raridade pelo risco) + materiais. Não altera estado. */
export function rollLootFor(s, lootTier, { equip = 1, mats = [1, 2], rnd = Math.random } = {}) {
  const cfg = cfgOf(s); if (!cfg) return [];
  const out = [];
  const bases = (s._data.items.items || []).filter((i) => i.arsenal && i.equip_slot && String(i.id).startsWith('eq_'));
  const tierBases = lootTier === 'basico' ? bases.filter((b) => b.priceTier !== 'avancado') : bases;
  for (let i = 0; i < equip; i++) {
    const r = pickW(cfg.lootPorRisco?.[lootTier] || { comum: 1 }, rnd) || 'comum';
    const b = tierBases[Math.floor(rnd() * tierBases.length)];
    if (b) out.push({ kind: 'equip', b: b.id, r });
  }
  const nm = mats[0] + Math.floor(rnd() * (mats[1] - mats[0] + 1));
  for (let i = 0; i < nm; i++) { const id = cfg.materiais[Math.floor(rnd() * cfg.materiais.length)]; if (s._items[id]) out.push({ kind: 'mat', id, qty: 1 + Math.floor(rnd() * (lootTier === 'basico' ? 2 : 3)) }); }
  stats.rolled += out.length;
  return out;
}

const uniq = (states) => (Array.isArray(states) ? states : [states]).filter((x, i, a) => x?.player && a.indexOf(x) === i);

/**
 * Coloca um loot na BOLSA de todos os estados espelhados (corrida + permanente). Bolsa cheia → recusa.
 * @returns {{ok:boolean, reason?:string, uid?:string, def?:object}}
 */
export function addLootToBag(states, loot) {
  const list = uniq(states); const ref = list[0]; if (!ref) return { ok: false, reason: 'sem jogo' };
  if (loot.kind === 'mat') {
    const has = ref.inventory.find((e) => e.bolsa && e.item_id === loot.id && !e.equipped);
    if (!has && bagCount(ref) >= bagCap(ref)) { stats.bagFull++; return { ok: false, reason: 'Bolsa cheia.' }; }
    for (const s of list) { const e = s.inventory.find((q) => q.bolsa && q.item_id === loot.id); if (e) e.qty = Math.min(99, (e.qty || 0) + loot.qty); else s.inventory.push({ item_id: loot.id, qty: loot.qty, bolsa: true }); }
    return { ok: true, id: loot.id, def: ref._items[loot.id] };
  }
  if (bagCount(ref) >= bagCap(ref)) { stats.bagFull++; return { ok: false, reason: 'Bolsa cheia.' }; }
  const uid = `brx_${Date.now().toString(36)}${(uidSeq++).toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
  const rec = { b: loot.b, r: loot.r, at: Date.now() };
  for (const s of list) {
    if (!s.player.brItens) s.player.brItens = {};
    s.player.brItens[uid] = rec;
    const d = brDefFor(s, uid, rec); if (!d) return { ok: false, reason: 'item-base inválido' };
    s._items[uid] = d;
    s.inventory.push({ item_id: uid, qty: 1 });
  }
  return { ok: true, uid, def: ref._items[uid] };
}

/** Preço de VENDA (Mercado Negro). 0 = não vendável. */
export function sellPriceOfDef(s, def) {
  const cfg = cfgOf(s); if (!cfg || !def) return 0;
  const V = cfg.venda || {};
  if (def.arsenal) return 0; // comprado no Arsenal: não vende (anti MCB infinito com preço de teste)
  if (def.brItem) {
    const base = s._items[def.brBase];
    let p = Math.floor((V.basePorRaridade?.[def.rarity] || 0) * (V.fatorCategoria?.equipamento ?? 1));
    const real = base ? basePriceOf(base) : Infinity;
    if (Number.isFinite(real) && real > 0) p = Math.min(p, Math.floor(real * (V.tetoSobreCompra ?? 0.5)));
    return Math.max(1, p);
  }
  const rar = s._data?.recompensas?.itemRaridade?.[def.id] || def.rarity || 'comum';
  return Math.max(1, Math.floor((V.basePorRaridade?.[rar] || 4) * (V.fatorCategoria?.material ?? 0.3)));
}
export function sellPriceOfEntry(s, e) { const d = s?._items?.[e?.item_id]; return d ? sellPriceOfDef(s, d) * (isBrItemId(e.item_id) ? 1 : Math.max(1, e.qty || 1)) : 0; }

/**
 * VENDER (atômico em todos os estados). Só item da bolsa (não equipado). Material: vende a pilha toda.
 * @returns {{ok:boolean, reason?:string, price?:number, mcb?:number}}
 */
export function sellFromBag(states, itemId) {
  const list = uniq(states); const ref = list[0]; if (!ref) return { ok: false, reason: 'sem jogo' };
  const e = ref.inventory.find((q) => q.item_id === itemId && !q.equipped && (isBrItemId(q.item_id) || q.bolsa));
  if (!e) { stats.refusedSell++; return { ok: false, reason: ref.inventory.some((q) => q.item_id === itemId && q.equipped) ? 'Item equipado — remova antes de vender.' : 'Item não está na bolsa.' }; }
  if ((ref.player.brVendidos || []).includes(itemId)) { stats.refusedSell++; return { ok: false, reason: 'Item já vendido.' }; }
  const price = sellPriceOfEntry(ref, e);
  if (!(price > 0)) { stats.refusedSell++; return { ok: false, reason: 'Não vendável.' }; }
  const after = (ref.player.mcb || 0) + price;
  for (const s of list) {
    const i = s.inventory.findIndex((q) => q.item_id === itemId && !q.equipped && (isBrItemId(q.item_id) || q.bolsa));
    if (i >= 0) s.inventory.splice(i, 1);
    s.player.mcb = after;
    s.player.mcbTotal = (s.player.mcbTotal || 0) + price;
    if (isBrItemId(itemId)) {
      if (s.player.brItens) delete s.player.brItens[itemId];
      s.player.brVendidos = [...(s.player.brVendidos || []), itemId].slice(-300);
    }
    s.player.brVendas = (s.player.brVendas || 0) + 1;
  }
  stats.sold++; stats.soldMcb += price;
  return { ok: true, price, mcb: after };
}

/** Comparação com o equipado no mesmo espaço: ↑ MELHOR / ↓ INFERIOR / = EQUIVALENTE + linhas. */
export function compareWithEquipped(s, uid) {
  const d = s._items[uid]; if (!d?.equip_slot) return null;
  const cur = statSheet(s);
  const cand = statSheet(s, { ...(s.equipment || {}), [d.equip_slot]: uid });
  const rows = compareSheets(cur, cand);
  const W = { dano: 1, defesa: 1, vida: 0.15, critico: 0.5 };
  let score = 0; for (const r of rows) if (!r.text) score += (W[r.key] ?? 0.3) * r.delta;
  const eqId = s.equipment?.[d.equip_slot];
  const verdict = !eqId ? 'melhor' : score > 0.4 ? 'melhor' : score < -0.4 ? 'inferior' : 'equivalente';
  return { verdict, score: +score.toFixed(2), rows, slot: d.equip_slot, equipped: eqId ? s._items[eqId]?.name || eqId : null };
}
/** M10: prévia de um loot que AINDA não está na bolsa (bolsa cheia): def + comparação + preço. Não altera o estado. */
export function previewLoot(s, loot) {
  if (!s || loot?.kind !== 'equip') return null;
  const PK = '__brpeek'; const def = brDefFor(s, PK, { b: loot.b, r: loot.r }); if (!def) return null;
  const had = s._items[PK]; s._items[PK] = def;
  let cmp = null; try { cmp = compareWithEquipped(s, PK); } finally { if (had) s._items[PK] = had; else delete s._items[PK]; }
  const base = s._items[loot.b];
  return { def: { ...def, id: null }, cmp, price: base ? sellPriceOfDef(s, { ...base, arsenal: false, rarity: loot.r, brItem: true, brBase: base.id }) : 0 };
}
/** M10: vende um loot do CHÃO direto no Mercado Negro (bolsa cheia) — mesmo preço da venda pela bolsa. */
export function sellLootDirect(states, loot) {
  const list = uniq(states); const ref = list[0]; if (!ref) return { ok: false, reason: 'sem jogo' };
  const pv = previewLoot(ref, loot); const price = pv?.price || 0;
  if (!(price > 0)) { stats.refusedSell++; return { ok: false, reason: 'Não vendável.' }; }
  const after = (ref.player.mcb || 0) + price;
  for (const q of list) { q.player.mcb = after; q.player.mcbTotal = (q.player.mcbTotal || 0) + price; q.player.brVendas = (q.player.brVendas || 0) + 1; }
  stats.sold++; stats.soldMcb += price; stats.soldDirect = (stats.soldDirect || 0) + 1;
  return { ok: true, price, mcb: after };
}
/** M10: resumo curto da troca ("+7 Ataque · +2 Defesa"). */
export function compareSummary(cmp) {
  const rows = (cmp?.rows || []).filter((r) => !r.text && r.delta);
  if (!rows.length) return '';
  return rows.slice(0, 4).map((r) => `${r.delta > 0 ? '+' : ''}${r.delta}${r.un || ''} ${r.nome}`).join(' · ');
}
export const RARITY_ORDER = RAR;
