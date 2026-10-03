/**
 * NEXARA — moeda MCB + compras do ARSENAL (lado do cliente).
 *
 * Carteira no personagem: player.mcb (saldo), player.mcbTotal (ganho na vida), player.arsenal.owned (ids comprados).
 * Vai ao save com o resto do player (mundo: save local; Campo: syncCampoProgress copia ao permanente).
 * Config ÚNICA: data/arsenal.json (recompensas, mapa inimigo→tipo, preços).
 *
 * Proteções (cliente — validação de verdade exige servidor, que este projeto não tem):
 *  - recompensa 1× por MORTE: chave zona:uid:nºdamorte (a morte é a única transição vivo→morto em applyDamageToMonster)
 *  - compra ATÔMICA: confere saldo + não-possuído + débito + entrega numa função só, sem await no meio
 *  - itens possuídos sem duplicata (Set) · assinatura da carteira (checksum) conferida ao carregar
 */
let CFG = null;
export function bindArsenalConfig(data) { CFG = data?.arsenal || null; return CFG; }
export const arsenalConfig = () => CFG;

const paid = new Set();
const paidOrder = [];
const stats = { credited: 0, deduped: 0, purchases: 0, refused: 0, byTier: {} };

export function ensureWallet(state) {
  const p = state?.player;
  if (!p) return null;
  if (!Number.isFinite(p.mcb) || p.mcb < 0) p.mcb = 0;
  p.mcb = Math.floor(p.mcb);
  if (!Number.isFinite(p.mcbTotal) || p.mcbTotal < p.mcb) p.mcbTotal = Math.max(p.mcb, Number(p.mcbTotal) || 0);
  if (!p.arsenal || typeof p.arsenal !== 'object') p.arsenal = { owned: [] };
  if (!Array.isArray(p.arsenal.owned)) p.arsenal.owned = [];
  p.arsenal.owned = [...new Set(p.arsenal.owned.filter((x) => typeof x === 'string'))];
  return p;
}

/** Tipo de recompensa do inimigo: mapa explícito > tier dos dados > comum. */
export function rewardTierOf(def) {
  if (!def) return 'comum';
  const map = CFG?.tipoInimigo || {};
  if (typeof map[def.id] === 'string') return map[def.id];
  if (def.boss) return 'chefe';
  const t = def.tier || 'comum';
  return CFG?.recompensaMcb?.[t] != null ? t : 'comum';
}
export function rewardFor(def) {
  const tier = rewardTierOf(def);
  return { tier, n: Math.max(0, Math.floor(CFG?.recompensaMcb?.[tier] ?? 1)) };
}

/**
 * Credita a recompensa da MORTE deste inimigo (1× por morte). Retorna { tier, n, key } ou null (já pago).
 * @param {object} state estado ativo (mundo/Campo/Arena)
 */
export function creditKill(state, mon, def) {
  if (!state?.player || !mon || !def) return null;
  mon._deaths = (mon._deaths || 0) + 1;
  if (!state._mcbNonce) Object.defineProperty(state, '_mcbNonce', { value: Math.random().toString(36).slice(2, 9), enumerable: false });
  const key = `${state._mcbNonce}:${state.campoMode ? 'campo' : state.zoneId}:${mon.uid}:${mon._deaths}`;
  if (paid.has(key)) { stats.deduped++; return null; }
  paid.add(key); paidOrder.push(key);
  if (paidOrder.length > 4000) paid.delete(paidOrder.shift());
  const r = rewardFor(def);
  if (!r.n) return null;
  ensureWallet(state);
  state.player.mcb += r.n;
  state.player.mcbTotal += r.n;
  stats.credited += r.n;
  stats.byTier[r.tier] = (stats.byTier[r.tier] || 0) + r.n;
  return { ...r, key, text: (CFG?.popup?.[r.tier] || '+{n} MCB').replace('{n}', r.n) };
}

/** Preço REAL (tabela 'precos' do arsenal.json) — não muda com o modo teste. */
export function basePriceOf(item) {
  if (!item) return Infinity;
  return Math.max(0, Math.floor(CFG?.precos?.[item.priceTier] ?? item.value ?? Infinity));
}
/** MODO TESTE (arsenal.json: testMode + priceMultiplier) — um flag volta aos preços reais. */
export const isTestPricing = () => CFG?.testMode === true;
export const testPriceLabel = () => CFG?.testLabel || 'GRÁTIS (teste)';
/** Preço COBRADO: real × priceMultiplier quando testMode:true (0 = grátis). Mesmo caminho de compra. */
export function priceOf(item) {
  const base = basePriceOf(item);
  if (!Number.isFinite(base) || !isTestPricing()) return base;
  const k = Number(CFG.priceMultiplier);
  return Math.max(0, Math.floor(base * (Number.isFinite(k) && k >= 0 ? k : 1)));
}
export const isOwned = (state, id) => !!state?.player?.arsenal?.owned?.includes(id);

/**
 * COMPRA ATÔMICA em um ou mais estados espelhados (ex.: corrida do Campo + personagem permanente).
 * O PRIMEIRO estado é a referência do saldo; todos recebem o mesmo débito/entrega ou nenhum recebe.
 * @returns {{ ok:boolean, reason?:string, price?:number, mcb?:number }}
 */
export function buyItem(states, id) {
  const list = (Array.isArray(states) ? states : [states]).filter((s, i, a) => s?.player && a.indexOf(s) === i);
  const ref = list[0];
  if (!ref) return { ok: false, reason: 'sem personagem' };
  const item = ref._items?.[id];
  if (!item || !item.arsenal) { stats.refused++; return { ok: false, reason: 'item inválido' }; }
  for (const s of list) ensureWallet(s);
  if (list.some((s) => isOwned(s, id))) { stats.refused++; return { ok: false, reason: 'já comprado' }; }
  const price = priceOf(item);
  if (!Number.isFinite(price) || ref.player.mcb < price) { stats.refused++; return { ok: false, reason: 'MCB insuficiente', price, mcb: ref.player.mcb }; }
  const after = ref.player.mcb - price;
  for (const s of list) {
    s.player.mcb = Math.max(0, after);
    s.player.arsenal.owned.push(id);
    s.player.arsenal.owned = [...new Set(s.player.arsenal.owned)];
    s.player.arsenal.lastBuy = { id, price, at: Date.now() };
  }
  stats.purchases++;
  return { ok: true, price, mcb: after };
}

/** Equipa (dono obrigatório para itens do Arsenal) — slot vem do item. */
export function equipArsenal(states, id) {
  const list = (Array.isArray(states) ? states : [states]).filter((s, i, a) => s?.player && a.indexOf(s) === i);
  const ref = list[0];
  const item = ref?._items?.[id];
  if (!item?.equip_slot) return { ok: false, reason: 'não equipável' };
  if (item.arsenal && !isOwned(ref, id)) return { ok: false, reason: 'não comprado' };
  for (const s of list) {
    if (!s.equipment) s.equipment = {};
    s.equipment[item.equip_slot] = id;
  }
  return { ok: true, slot: item.equip_slot };
}
export function unequipSlot(states, slot) {
  const list = (Array.isArray(states) ? states : [states]).filter((s, i, a) => s?.player && a.indexOf(s) === i);
  for (const s of list) if (s.equipment) s.equipment[slot] = null;
  return { ok: true, slot };
}

/* ── assinatura da carteira (anti-edição casual do save; NÃO é segurança de servidor) ── */
const SALT = 'nexara-mcb-v1';
function fnv(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(36); }
export function walletSig(player, profileId) {
  const owned = [...(player?.arsenal?.owned || [])].sort().join(',');
  return fnv(`${SALT}|${profileId || ''}|${Math.floor(player?.mcb || 0)}|${Math.floor(player?.mcbTotal || 0)}|${owned}`);
}
/**
 * Confere a carteira de um save. Save antigo (sem assinatura) = migração: MCB 0, tudo mantido.
 * Adulterado: MCB volta a 0 e os itens do Arsenal possuídos são mantidos só se o saldo total ganho cobre o preço;
 * nada mais é apagado (o save original fica numa chave de backup — feito por quem chama).
 */
export function verifyWallet(saved) {
  const p = saved?.player;
  if (!p) return { status: 'sem-player' };
  const hasWallet = Number(p.mcb) > 0 || Number(p.mcbTotal) > 0 || (p.arsenal?.owned || []).length > 0;
  if (saved.walletSig == null && !hasWallet) { p.mcb = 0; p.mcbTotal = 0; p.arsenal = { owned: [] }; return { status: 'migrado' }; }
  if (saved.walletSig != null && walletSig(p, saved.profile?.id) === saved.walletSig) return { status: 'ok' };
  // adulterado (ou carteira sem assinatura): carteira volta ao seguro; resto do save intacto; quem chama guarda o original
  const before = { mcb: p.mcb, mcbTotal: p.mcbTotal, owned: (p.arsenal?.owned || []).slice() };
  p.mcb = 0; p.mcbTotal = 0; p.arsenal = { owned: [] };
  if (saved.equipment) for (const [slot, id] of Object.entries(saved.equipment)) if (typeof id === 'string' && id.startsWith('eq_')) saved.equipment[slot] = null;
  return { status: 'adulterado', before };
}
export const mcbStats = () => JSON.parse(JSON.stringify({ ...stats, paidKeys: paid.size }));

/* ── CRÉDITO DE TESTE (arsenal.json: testGrantMcb + testGrantId) — 1× por perfil, registrado ── */
const GRANT_KEY = 'nexara_mcb_grants_v1';
function grantLedger() { try { return JSON.parse(localStorage.getItem(GRANT_KEY) || '{}') || {}; } catch { return {}; } }
export function testGrantConfig() {
  const n = Math.floor(Number(CFG?.testGrantMcb) || 0);
  return n > 0 ? { n, id: String(CFG.testGrantId || `grant-${n}`) } : null;
}
/**
 * Aplica o crédito de teste nos estados espelhados (1º = referência), se este perfil ainda não recebeu.
 * Não apaga nada: só soma ao saldo/total e marca player.mcbGrants. Quem chama grava (assinatura nova no save).
 * @returns {{ applied:boolean, reason?:string, n?:number, id?:string, mcb?:number }}
 */
export function applyTestGrant(states, profileId) {
  const g = testGrantConfig();
  if (!g) return { applied: false, reason: 'desligado' };
  const list = (Array.isArray(states) ? states : [states]).filter((s, i, a) => s?.player && a.indexOf(s) === i);
  const ref = list[0];
  if (!ref) return { applied: false, reason: 'sem personagem' };
  const key = `${g.id}|${profileId || ''}`;
  const led = grantLedger();
  if (led[key]) return { applied: false, reason: 'perfil já recebeu', id: g.id };
  if ((ref.player.mcbGrants || []).some((x) => x?.id === g.id)) { led[key] = { at: Date.now(), n: g.n, note: 'já no save' }; try { localStorage.setItem(GRANT_KEY, JSON.stringify(led)); } catch {} return { applied: false, reason: 'save já recebeu', id: g.id }; }
  for (const s of list) {
    ensureWallet(s);
    s.player.mcb += g.n;
    s.player.mcbTotal += g.n;
    if (!Array.isArray(s.player.mcbGrants)) s.player.mcbGrants = [];
    s.player.mcbGrants.push({ id: g.id, n: g.n, at: Date.now(), profile: profileId || null });
  }
  led[key] = { at: Date.now(), n: g.n, mcbAfter: ref.player.mcb };
  try { localStorage.setItem(GRANT_KEY, JSON.stringify(led)); } catch {}
  stats.grants = (stats.grants || 0) + g.n;
  return { applied: true, n: g.n, id: g.id, mcb: ref.player.mcb };
}
