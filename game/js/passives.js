/**
 * NEXARA — PassiveManager (Bloco 3 · gp3).
 *
 * Registro central de passivas orientado a dados (data/passives.json):
 *   { id, nome, descricao, icone, raridade, peso?, empilhavel, efeitos:[{stat, tipo:'mult'|'add', valor}] }
 * - Efeitos aplicados SÓ via modifiers.addModifier/getStat: um modificador por
 *   atributo lê os totais pré-somados (sem alocação no caminho quente).
 *   Fórmula: (base + Σadd) × (1 + Σmult) — porcentagens somam entre passivas.
 * - Sorteio ponderado sem reposição (peso da raridade ou peso próprio), exclui
 *   passivas já obtidas (não empilháveis) e evita repetir exatamente o conjunto
 *   oferecido na escolha anterior. Escala para centenas de entradas.
 * - Estado por partida em state.passives = { owned:[ids], pending:n, lastOffer:[ids], offer:[ids]|null }
 *   (salvo no save do mundo; saves antigos carregam owned=[]).
 */
import { addModifier, getStat, STATS } from './modifiers.js?v=20261003m10g';
import { getConfig } from './gameplay-config.js?v=20261003m10g';

const registry = new Map(); // id → def normalizada
let rarities = {};
const order = []; // ids em ordem de registro
/** Totais por atributo: { add, mult } — lidos pelos modificadores instalados. */
const totals = new Map();
const installed = new Set();
let boundState = null;
/** EVO: sinergia de build (2/3 passivas da mesma direção) — totais separados dos das passivas. */
const synTotals = new Map();
const synInstalled = new Set();
let synView = {};
function installSyn(stat) {
  if (synInstalled.has(stat)) return;
  synInstalled.add(stat);
  const t = { add: 0, mult: 0 };
  synTotals.set(stat, t);
  addModifier(stat, (v) => (t.add === 0 && t.mult === 0 ? v : (v + t.add) * (1 + t.mult)));
}
/** Direção de build de uma passiva (campo build do JSON ou progression.buildOf para as originais). */
export function buildOfPassive(id) {
  const d = registry.get(id);
  return (d && d.build) || getConfig().progression?.buildOf?.[id] || null;
}
/** Contagem por direção + sinergias ativas (cópia). */
export function getBuildSynergy() { return JSON.parse(JSON.stringify(synView)); }
function recomputeSynergy(owned) {
  for (const t of synTotals.values()) { t.add = 0; t.mult = 0; }
  const builds = getConfig().progression?.builds || {};
  const count = {};
  for (const id of new Set(owned)) { const b = buildOfPassive(id); if (b) count[b] = (count[b] || 0) + 1; }
  const active = [];
  for (const [b, n] of Object.entries(count)) {
    const bc = builds[b];
    if (!bc) continue;
    for (const [need, key] of [[2, 'syn2'], [3, 'syn3']]) {
      const e = bc[key];
      if (n >= need && e && Number.isFinite(e.valor)) {
        installSyn(e.stat);
        const t = synTotals.get(e.stat);
        if (e.stat === 'critChance') t.add += e.valor; else t.mult += e.valor;
        active.push({ build: b, nivel: need, stat: e.stat, valor: e.valor });
      }
    }
  }
  synView = { count, active };
}

/** Registra uma passiva (ou substitui a de mesmo id). */
export function registerPassive(def) {
  if (!def || !def.id) return false;
  const d = {
    id: String(def.id),
    nome: def.nome || def.id,
    descricao: def.descricao || '',
    categoria: def.categoria || '',
    resumo: def.resumo || '',
    icone: def.icone || '◆',
    raridade: def.raridade || 'comum',
    peso: Number.isFinite(def.peso) ? def.peso : null,
    empilhavel: !!def.empilhavel,
    // EVO: empilháveis têm teto (o pool pode esgotar; sem bônus infinito)
    maxStacks: def.empilhavel ? Math.max(1, Number(def.maxStacks) || 3) : 1,
    build: def.build || null,
    efeitos: (def.efeitos || []).filter((e) => e && e.stat && Number.isFinite(e.valor)).map((e) => ({
      stat: e.stat,
      tipo: e.tipo === 'add' ? 'add' : 'mult',
      valor: e.valor
    }))
  };
  if (!registry.has(d.id)) order.push(d.id);
  registry.set(d.id, d);
  for (const e of d.efeitos) installStat(e.stat);
  return true;
}

/** Carrega raridades + passivas do JSON de dados. */
export function registerPassivesFromData(json) {
  rarities = { ...(json?.raridades || {}) };
  for (const p of json?.passivas || []) registerPassive(p);
  return registry.size;
}

export function getPassive(id) {
  return registry.get(id) || null;
}
export function listPassives() {
  return order.map((id) => registry.get(id));
}
export function getRarity(id) {
  return rarities[id] || { nome: String(id || '').toUpperCase(), peso: 1, cor: '#3ecfbf' };
}
export function weightOf(def) {
  if (!def) return 0;
  if (Number.isFinite(def.peso)) return Math.max(0, def.peso);
  return Math.max(0, getRarity(def.raridade).peso ?? 1);
}

function installStat(stat) {
  if (installed.has(stat)) return;
  installed.add(stat);
  const t = { add: 0, mult: 0 };
  totals.set(stat, t);
  addModifier(stat, (v) => (t.add === 0 && t.mult === 0 ? v : (v + t.add) * (1 + t.mult)));
}

/** Garante o formato de state.passives (saves antigos / arena). */
export function ensurePassiveState(state) {
  if (!state) return null;
  const raw = state.passives;
  const p = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : { owned: Array.isArray(raw) ? raw : [] };
  p.owned = Array.isArray(p.owned) ? p.owned.filter((id) => typeof id === 'string') : [];
  p.pending = Number.isFinite(p.pending) && p.pending > 0 ? Math.floor(p.pending) : 0;
  p.lastOffer = Array.isArray(p.lastOffer) ? p.lastOffer : [];
  p.offer = Array.isArray(p.offer) && p.offer.length ? p.offer : null;
  state.passives = p;
  return p;
}

/** Recalcula os totais a partir das passivas da partida ativa. */
export function recomputeTotals(state = boundState) {
  for (const t of totals.values()) { t.add = 0; t.mult = 0; }
  const owned = state?.passives?.owned || [];
  for (const id of owned) {
    const d = registry.get(id);
    if (!d) continue; // id desconhecido (data mudou) — ignorado com segurança
    for (const e of d.efeitos) {
      installStat(e.stat);
      const t = totals.get(e.stat);
      if (e.tipo === 'add') t.add += e.valor;
      else t.mult += e.valor;
    }
  }
  recomputeSynergy(owned);
}

/**
 * HP máximo derivado: hpMax = round(getStat(MAX_HP, hpMaxBase)). O HP atual
 * acompanha na mesma proporção quando o máximo muda.
 */
export function applyDerivedStats(state = boundState) {
  const pl = state?.player;
  if (!pl) return;
  if (!Number.isFinite(pl.hpMaxBase)) pl.hpMaxBase = pl.hpMax;
  const next = Math.max(1, Math.round(getStat(STATS.MAX_HP, pl.hpMaxBase)));
  if (next !== pl.hpMax) {
    const ratio = pl.hpMax > 0 ? pl.hp / pl.hpMax : 1;
    pl.hpMax = next;
    pl.hp = Math.max(pl.hp > 0 ? 1 : 0, Math.min(next, Math.round(next * ratio)));
  }
}

/** Liga o gerenciador à partida ativa (mundo ou arena). */
export function bindPassiveState(state) {
  boundState = state || null;
  if (state) ensurePassiveState(state);
  recomputeTotals(state);
  if (state) applyDerivedStats(state);
}

export function getTotals() {
  const out = {};
  for (const [k, t] of totals) if (t.add || t.mult) out[k] = { add: +t.add.toFixed(4), mult: +t.mult.toFixed(4) };
  return out;
}

/** Pool disponível (exclui obtidas não empilháveis e peso 0). */
export function availablePool(state) {
  const ownedList = state?.passives?.owned || [];
  const owned = new Set(ownedList);
  const out = [];
  for (const id of order) {
    const d = registry.get(id);
    if (!d || weightOf(d) <= 0) continue;
    if (owned.has(id) && !d.empilhavel) continue;
    if (d.empilhavel && ownedList.filter((x) => x === id).length >= d.maxStacks) continue;
    out.push(d);
  }
  return out;
}

/** Sorteio ponderado de n passivas DIFERENTES (sem reposição). */
export function weightedPick(pool, n, rng = Math.random) {
  const bag = pool.slice();
  const out = [];
  while (out.length < n && bag.length) {
    let total = 0;
    for (const d of bag) total += weightOf(d);
    if (total <= 0) break;
    let r = rng() * total;
    let idx = bag.length - 1;
    for (let i = 0; i < bag.length; i++) {
      r -= weightOf(bag[i]);
      if (r < 0) { idx = i; break; }
    }
    out.push(bag[idx]);
    bag.splice(idx, 1);
  }
  return out;
}

function sameSet(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}

/**
 * Monta a oferta da próxima escolha (n cartas diferentes). Evita repetir o
 * conjunto exato da escolha anterior quando o pool permite. [] = pool esgotado.
 */
export function rollOffer(state, n, { rng = Math.random, attempts = 12 } = {}) {
  const ps = ensurePassiveState(state);
  const pool = availablePool(state);
  if (!pool.length) return [];
  const k = Math.min(n, pool.length);
  let pick = weightedPick(pool, k, rng).map((d) => d.id);
  const canDiffer = pool.length > k;
  for (let i = 0; canDiffer && i < attempts && sameSet(pick, ps.lastOffer); i++) {
    pick = weightedPick(pool, k, rng).map((d) => d.id);
  }
  return pick;
}

/**
 * Aplica a passiva escolhida. Só aceita id presente na oferta atual (sem
 * escolha dupla / sem id forjado). Retorna a definição ou null.
 */
export function choosePassive(state, id) {
  const ps = ensurePassiveState(state);
  if (!ps.offer || !ps.offer.includes(id)) return null;
  const d = registry.get(id);
  if (!d) return null;
  if (ps.owned.includes(id) && !d.empilhavel) return null;
  if (d.empilhavel && ps.owned.filter((x) => x === id).length >= d.maxStacks) return null;
  ps.owned.push(id);
  ps.lastOffer = ps.offer.slice();
  ps.offer = null;
  ps.pending = Math.max(0, ps.pending - 1);
  if (state === boundState) {
    recomputeTotals(state);
    applyDerivedStats(state);
  }
  return d;
}
