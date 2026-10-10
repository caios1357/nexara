/**
 * NEXARA — HUD da moeda MCB (🪙 MCB: N + popups) e tela ARSENAL (categorias, compra, equipar).
 * Toda a regra fica em mcb.js (compra atômica) e actions.js (equipItem/unequipItem — o mesmo do Inventário).
 */
import { arsenalConfig, buyItem, isOwned, priceOf, basePriceOf, isTestPricing, testPriceLabel, ensureWallet } from './mcb.js?v=20261010ajustes';
import { attrLines } from './equipment.js?v=20261010ajustes';
import { equipItem, unequipItem } from './actions.js?v=20261010ajustes';
import { addToInventory } from '../../rules/loot.js?v=20261010ajustes';

const RAR = { comum: ['COMUM', '#c8d4d0'], incomum: ['INCOMUM', '#4aa0ff'], raro: ['RARO', '#ffc24a'], epico: ['ÉPICO', '#b36bff'], lendario: ['LENDÁRIO', '#ffd34a'] };
const ICON = { capacete: '⛑', armadura: '🛡', calca: '👖', espada: '🗡', arco: '🏹', cajado: '🪄' };
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * @param {{ ui:object, getState:()=>object, mirrors:()=>object[], commit:(reason:string)=>void, onEquipChange?:()=>void }} deps
 *  mirrors(): estados que recebem a mesma compra/equipamento (ativo primeiro; + permanente quando é uma cópia)
 *  commit(): grava (mundo: save · Campo: sync ao permanente · Arena: permanente)
 */
export function createMcbUi(deps) {
  let shown = null;
  const log = [];
  let tab = 'capacete';
  let lastMsg = '';

  function updateHud(state) {
    const n = Math.floor(state?.player?.mcb || 0);
    if (n === shown) return;
    shown = n;
    const el = document.getElementById('hud-mcb-n');
    if (el) el.textContent = String(n);
    const box = document.getElementById('hud-mcb');
    if (box) { box.dataset.mcb = String(n); box.classList.remove('bump'); void box.offsetWidth; box.classList.add('bump'); }
  }

  // VEST: popups NÃO cobrem menus abertos — ficam na fila e aparecem quando o menu fecha
  const queue = [];
  let flushTimer = 0;
  const menuOpen = () => !!deps.isMenuOpen?.();
  function flush() {
    if (menuOpen()) { flushTimer = setTimeout(flush, 300); return; }
    flushTimer = 0;
    // ao fechar o menu: comuns acumuladas viram 1 linha; especiais aparecem uma a uma
    const comuns = queue.filter((q) => q.tier === 'comum');
    const esp = queue.filter((q) => q.tier !== 'comum');
    queue.length = 0;
    if (comuns.length) {
      const n = comuns.reduce((a, q) => a + (parseInt(String(q.text).replace(/[^0-9]/g, ''), 10) || 0), 0);
      show(comuns.length > 1 ? `+${n} MCB` : comuns[0].text, 'comum');
    }
    esp.slice(-3).forEach((q, i) => setTimeout(() => show(q.text, q.tier), 350 * (i + (comuns.length ? 1 : 0))));
  }
  function pop(text, tier = 'comum') {
    log.push({ text, tier, at: Math.round(performance.now()), queued: menuOpen() });
    if (log.length > 60) log.shift();
    if (menuOpen()) { queue.push({ text, tier }); if (queue.length > 40) queue.shift(); if (!flushTimer) flushTimer = setTimeout(flush, 300); return; }
    show(text, tier);
  }
  function show(text, tier) {
    const layer = document.getElementById('mcb-pop-layer');
    if (!layer) return;
    while (layer.childElementCount > 5) layer.firstElementChild.remove();
    const d = document.createElement('div');
    d.className = `mcb-pop tier-${tier}`;
    d.textContent = tier === 'comum' ? text : `🪙 ${text}`;
    layer.appendChild(d);
    setTimeout(() => d.remove(), tier === 'comum' ? 1100 : 2400);
  }

  function ensureInInventory(st, id) {
    if (!st.inventory.some((i) => i.item_id === id)) addToInventory(st.inventory, st._items[id], 1);
  }

  function act(kind, id, slot) {
    const states = deps.mirrors();
    const ref = states[0];
    if (!ref) return { ok: false, reason: 'sem jogo' };
    let r;
    if (kind === 'buy') {
      r = buyItem(states, id);
      if (r.ok) for (const s of states) ensureInInventory(s, id);
      lastMsg = r.ok ? `COMPRADO: ${ref._items[id]?.name} (${r.price === 0 && isTestPricing() ? testPriceLabel() : `−${r.price} MCB`})` : r.reason === 'MCB insuficiente' ? `MCB insuficiente — faltam ${r.price - r.mcb} MCB` : r.reason;
    } else if (kind === 'equip') {
      const it = ref._items?.[id];
      if (!it?.equip_slot) { r = { ok: false, reason: 'não equipável' }; lastMsg = 'Item não equipável.'; }
      else if (!it.arsenal && !ref.inventory.some((i) => i.item_id === id)) { r = { ok: false, reason: 'não possuído' }; lastMsg = 'Você não tem esse item.'; }
      else if (it.arsenal && !isOwned(ref, id)) { r = { ok: false, reason: 'não comprado' }; lastMsg = 'Compre o item primeiro.'; }
      else { for (const s of states) { if (it.arsenal) ensureInInventory(s, id); if (s.inventory.some((i) => i.item_id === id)) equipItem(s, id); } r = { ok: true }; lastMsg = `EQUIPADO: ${ref._items[id]?.name}`; }
    } else if (kind === 'unequip') {
      for (const s of states) unequipItem(s, slot);
      r = { ok: true }; lastMsg = 'Item removido.';
    }
    if (r?.ok) deps.commit(kind);
    deps.onEquipChange?.();
    return r;
  }

  function open(selTab) {
    const st = deps.getState();
    const cfg = arsenalConfig();
    if (!st || !cfg) return;
    ensureWallet(st);
    if (selTab) tab = selTab;
    const cats = cfg.categorias || [];
    const fam = cfg.familias || {};
    const items = Object.values(st._items).filter((it) => it.arsenal && it.category === tab);
    const mcb = Math.floor(st.player.mcb || 0);
    const tabs = cats.map((c) => `<button type="button" class="ars-tab${c.id === tab ? ' on' : ''}" data-ars-tab="${c.id}">${ICON[c.id] || ''} ${esc(c.nome)}</button>`).join('');
    const cards = items.map((it) => {
      const f = fam[it.family] || {};
      const r = RAR[it.rarity] || RAR.comum;
      const owned = isOwned(st, it.id);
      const eq = st.equipment?.[it.equip_slot] === it.id;
      const price = priceOf(it);
      const base = basePriceOf(it);
      const free = isTestPricing() && price === 0;
      const status = eq ? 'EQUIPADO' : owned ? 'COMPRADO' : 'COMPRAR';
      const btn = eq
        ? `<button type="button" data-ars="unequip" data-slot="${it.equip_slot}" data-id="${it.id}">REMOVER</button>`
        : owned ? `<button type="button" class="primary" data-ars="equip" data-id="${it.id}">EQUIPAR</button>`
          : `<button type="button" class="primary${mcb < price ? ' poor' : ''}${free ? ' free' : ''}" data-ars="buy" data-id="${it.id}">${free ? `COMPRAR · ${esc(testPriceLabel())}` : `COMPRAR · ${price} MCB`}</button>`;
      // 1 só botão de ação por card: o selo de status aparece só para COMPRADO/EQUIPADO (COMPRAR já é o botão)
      const pill = status === 'COMPRAR' ? `<span class="ars-status st-comprar" data-ars-status="COMPRAR" hidden></span>` : `<span class="ars-status st-${status.toLowerCase()}" data-ars-status="${status}">${status}</span>`;
      const priceHtml = free ? `<span class="ars-price was" title="preço real ${base} MCB (modo teste ativo)">🪙 <s>${base}</s></span><span class="ars-free" data-ars-free="1">${esc(testPriceLabel())}</span>` : `<span class="ars-price">🪙 ${price}</span>`;
      const lines = attrLines(it, cfg.atributos).map((l) => `<li title="${esc(l.efeito)}">${esc(l.text)}</li>`).join('');
      return `<div class="ars-card fam-${it.family}${eq ? ' eq' : owned ? ' own' : ''}" data-ars-item="${it.id}" style="--fc:${f.cor || '#3ecfbf'};--rc:${r[1]}">
        <div class="ars-head"><span class="ars-ico">${ICON[it.category] || '◆'}</span><div><b>${esc(it.name)}</b>
        <small>${esc((cats.find((c) => c.id === it.category) || {}).nome || it.category)} · ${esc(f.nome || it.family)} · <span class="ars-rar">${r[0]}</span></small></div></div>
        <ul class="ars-attrs">${lines}</ul>
        <div class="ars-foot">${priceHtml}${pill}${btn}</div></div>`;
    }).join('');
    const html = `<div class="ars" id="ars"><div class="ars-top"><span class="ars-wallet">🪙 MCB: <b id="ars-mcb">${mcb}</b></span>
      ${isTestPricing() ? `<span class="ars-testmode" id="ars-testmode">MODO TESTE · ${esc(testPriceLabel())}</span>` : ''}<span class="ars-msg${/insuficiente/.test(lastMsg) ? ' bad' : ''}" id="ars-msg">${esc(lastMsg)}</span></div>
      <div class="ars-tabs">${tabs}</div><div class="ars-grid">${cards}</div>
      <p class="ars-note">Infernal: dano/crítico · Dracônico: dano + defesa/resistência · Cibernético: velocidade/precisão/energia/recarga. Validação no cliente — sem servidor.</p></div>`;
    deps.ui.openModal('ARSENAL', html);
    document.getElementById('modal-overlay')?.querySelector('.modal')?.classList.add('nx-ars-modal');
    setTimeout(() => {
      document.querySelectorAll('#ars [data-ars-tab]').forEach((el) => { el.onclick = () => { lastMsg = ''; open(el.getAttribute('data-ars-tab')); }; });
      document.querySelectorAll('#ars [data-ars]').forEach((el) => {
        el.onclick = () => { act(el.getAttribute('data-ars'), el.getAttribute('data-id'), el.getAttribute('data-slot')); open(); };
      });
    }, 0);
  }

  return { updateHud, pop, open, act, popLog: () => log.slice(), lastMessage: () => lastMsg, resetHud: () => { shown = null; } };
}
