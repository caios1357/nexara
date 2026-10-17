/**
 * NEXARA — ARMAS DUPLAS (20261017hud, pedido do Caio).
 *  Slot 1 = ESPADA (obrigatória). Slot 2 = ARCO | CAJADO | VARINHA (escolha no vestiário/arsenal).
 *  TROCAR alterna na hora (recarga curta). Estado no save: state.player.armas = { s2, ativo, s1Id, s2Id: { arco, cajado, varinha } }.
 *  Nada é resetado: o equipamento existente vira o slot certo na primeira vez.
 */
export const SLOT2 = ['arco', 'cajado', 'varinha'];
export const SWAP_CD_MS = 600;
const itemOf = (s, id) => (id && s?._items?.[id]) || null;
const clsOf = (s, id) => itemOf(s, id)?.weaponClass || null;

export function ensureArmas(s) {
  const p = s?.player; if (!p) return null;
  if (!p.armas || typeof p.armas !== 'object') {
    const w = s.equipment?.weapon; const c = clsOf(s, w);
    p.armas = { s2: SLOT2.includes(c) ? c : 'arco', ativo: SLOT2.includes(c) ? 2 : 1, s1Id: SLOT2.includes(c) ? null : w || null, s2Id: { arco: null, cajado: null, varinha: null } };
    if (SLOT2.includes(c)) p.armas.s2Id[c] = w;
  }
  const A = p.armas; if (!SLOT2.includes(A.s2)) A.s2 = 'arco'; if (A.ativo !== 2) A.ativo = 1; A.s2Id = A.s2Id || {};
  // o jogador equipou uma arma por outro caminho (Arsenal/bolsa) → o slot dela acompanha
  const w = s.equipment?.weapon; if (w !== A._seen) { A._seen = w; const c = clsOf(s, w);
    if (SLOT2.includes(c)) { A.s2 = c; A.s2Id[c] = w; A.ativo = 2; } // arma de distância → slot 2
    else if (w) { A.s1Id = w; A.ativo = 1; } // espada/lâmina (qualquer arma corpo a corpo) → slot 1
    else if (A.ativo === 1) A.s1Id = null; else A.s2Id[A.s2] = null; } // desequipou: o slot ativo fica com a arma básica
  return A;
}
/** classe da arma ATIVA (sem item no slot 2 → arma básica daquela classe) */
export function activeClass(s) { const A = s?.player?.armas; if (!A) return null; return A.ativo === 2 ? (clsOf(s, s.equipment?.weapon) || A.s2) : 'espada'; }
export function setSlot2(s, cls) {
  const A = ensureArmas(s); if (!A || !SLOT2.includes(cls)) return false; A.s2 = cls;
  if (A.ativo === 2) { s.equipment.weapon = slot2Item(s, A); A._seen = s.equipment.weapon; }
  return true;
}
/** melhor arma JÁ COMPRADA daquela classe (Arsenal) — o slot 2 usa ela quando nada foi equipado ainda */
function bestOwned(s, cls) {
  let best = null, bv = -1;
  for (const id of s?.player?.arsenal?.owned || []) { const it = itemOf(s, id); if (!it || it.weaponClass !== cls) continue;
    const v = Object.values(it.attrs || it.atributos || {}).reduce((a, b) => a + (+b || 0), 0); if (v > bv) { bv = v; best = id; } }
  return best;
}
const slot2Item = (s, A) => { const id = A.s2Id[A.s2]; if (id && itemOf(s, id)) return id; const b = bestOwned(s, A.s2); if (b) A.s2Id[A.s2] = b; return b; };
let lastSwap = -1e9; export const swapStats = { n: 0, denied: 0 };
export function swapWeapon(s, now = performance.now()) {
  const A = ensureArmas(s); if (!A) return null;
  if (now - lastSwap < SWAP_CD_MS) { swapStats.denied++; return { ok: false, why: 'recarga', leftMs: Math.round(SWAP_CD_MS - (now - lastSwap)) }; }
  lastSwap = now; A.ativo = A.ativo === 2 ? 1 : 2;
  const id = A.ativo === 1 ? A.s1Id : slot2Item(s, A);
  s.equipment.weapon = id && itemOf(s, id) ? id : null; A._seen = s.equipment.weapon; swapStats.n++;
  return { ok: true, ativo: A.ativo, cls: activeClass(s) };
}
export const swapCdLeft = (now = performance.now()) => Math.max(0, SWAP_CD_MS - (now - lastSwap));
export const SLOT_INFO = { espada: { nome: 'ESPADA', ico: '🗡' }, arco: { nome: 'ARCO', ico: '🏹' }, cajado: { nome: 'CAJADO', ico: '🔮' }, varinha: { nome: 'VARINHA', ico: '✨' } };
