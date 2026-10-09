/**
 * NEXARA — VESTIÁRIO: trocar skin (estilo/cores/peças) e itens com o herói 3D na frente.
 *  - prévia 3D própria (hero-preview.js interactive): arrastar gira · pinça/roda = zoom · FRENTE
 *  - 6 espaços (capacete/armadura/calça/arma + roupa/acessório): itens POSSUÍDOS equipam/removem ao vivo
 *    pelo MESMO caminho do Arsenal/Inventário (mcbUi.act → actions.equipItem/unequipItem) → save
 *  - ESTILO: o editor existente (hero-style-ui.js, sem prévia própria) — nada duplicado
 *  - comparação antes→depois (Dano/Defesa/Vida/Crítico…) ao passar o mouse/selecionar um item
 *  - até 3 LOADOUTS salvos em player.loadouts (vai no save com o player)
 */
import { mountHeroStyleEditor } from './hero-style-ui.js?v=20261009perf';
import { heroStyleOf, equipmentVisual } from './hero-styles.js?v=20261009perf';
import { sumEquipAttrs, weaponClassOf, ALL_SLOTS } from './equipment.js?v=20261009perf';
import { getEquippedStats } from './state.js?v=20261009perf';
import { isOwned, arsenalConfig } from './mcb.js?v=20261009perf';
import { paintItemIcons } from './ui.js?v=20261009perf';

export const VEST_SLOTS = [['helmet', 'CAPACETE', '⛑'], ['armor', 'ARMADURA', '🛡'], ['pants', 'CALÇA', '👖'], ['weapon', 'ARMA', '⚔'], ['body', 'ROUPA', '👕'], ['accessory', 'ACESSÓRIO', '💍']];
export const MAX_LOADOUTS = 3;
/**
 * FONTES DE ITENS do Vestiário (extensível): cada fonte devolve ids de itens que o jogador TEM.
 * Hoje: inventário + comprados no Arsenal. Próxima fase (BOLSA de 30 espaços): registerItemSource('bolsa', (s) => …)
 * — o Vestiário passa a listar os itens da bolsa sem mudar mais nada (equipar continua pelo mesmo caminho).
 */
const ITEM_SOURCES = new Map([
  ['inventario', (s) => (s.inventory || []).map((i) => i.item_id)],
  ['arsenal', (s) => s.player?.arsenal?.owned || []]
]);
export function registerItemSource(id, fn) { if (typeof fn === 'function') ITEM_SOURCES.set(id, fn); }
export const itemSources = () => [...ITEM_SOURCES.keys()];
const STAT_ROWS = [['dano', 'Dano', ''], ['defesa', 'Defesa', ''], ['vida', 'Vida', ''], ['critico', 'Crítico', '%'], ['precisao', 'Precisão', '%'], ['velocidade', 'Velocidade', '%'], ['poderMagico', 'Poder mágico', '%'], ['resistencia', 'Resistência', '%'], ['energia', 'Energia', '/s'], ['recarga', 'Recarga', '%']];
const CLASS_N = { espada: 'Espada (corpo a corpo)', arco: 'Arco (projétil)', cajado: 'Cajado (magia)' };
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Ficha de atributos com um equipamento (real: mesmas fontes do combate — getEquippedStats + attrs). */
export function statSheet(st, eq) {
  const cur = sumEquipAttrs(st);
  const fake = { ...st, equipment: { ...(eq || st.equipment || {}) } };
  const g = getEquippedStats(fake);
  const a = sumEquipAttrs(fake);
  const pl = st.player || {};
  const out = { dano: (pl.ataque || 0) + g.weaponAtk, defesa: (pl.defesa || 0) + g.armorDef, vida: Math.max(1, (pl.hpMax || 0) - (cur.vida || 0) + (a.vida || 0)) };
  for (const [k] of STAT_ROWS) if (!(k in out)) out[k] = +(a[k] || 0).toFixed(2);
  out.classe = weaponClassOf(fake);
  return out;
}
/** Linhas antes→depois (só as que mudam ou que importam). */
export function compareSheets(a, b) {
  const rows = [];
  for (const [k, n, un] of STAT_ROWS) {
    const d = +((b[k] || 0) - (a[k] || 0)).toFixed(2);
    if (!d && !['dano', 'defesa', 'vida', 'critico'].includes(k)) continue;
    rows.push({ key: k, nome: n, un, antes: a[k] || 0, depois: b[k] || 0, delta: d });
  }
  if (a.classe !== b.classe) rows.push({ key: 'classe', nome: 'Arma', un: '', antes: CLASS_N[a.classe] || a.classe, depois: CLASS_N[b.classe] || b.classe, delta: 0, text: true });
  return rows;
}

/**
 * @param {{ ui:object, getState:()=>object, mirrors:()=>object[], commit:(r:string)=>void, act:(kind:string,id?:string,slot?:string)=>object, onLook?:()=>void }} deps
 */
export function createVestiario(deps) {
  let preview = null; let styleEd = null; let open = false;
  let tab = 'equip'; let slot = 'helmet'; let cand = null; let hover = null; let msg = '';
  let saveT = 0;

  const st = () => deps.getState();
  function ensureLoadouts(s) {
    const p = s?.player; if (!p) return [];
    if (!Array.isArray(p.loadouts)) p.loadouts = [];
    while (p.loadouts.length < MAX_LOADOUTS) p.loadouts.push(null);
    if (p.loadouts.length > MAX_LOADOUTS) p.loadouts.length = MAX_LOADOUTS;
    return p.loadouts;
  }
  /** itens que o jogador TEM para um espaço (inventário + comprados no Arsenal) */
  function ownedFor(s, sl) {
    const ids = new Set();
    for (const src of ITEM_SOURCES.values()) for (const id of src(s) || []) { const it = s._items[id]; if (it?.equip_slot === sl) ids.add(id); }
    if (s.equipment?.[sl]) ids.add(s.equipment[sl]);
    return [...ids].map((id) => s._items[id]).filter(Boolean);
  }
  const look = (s) => ({ styleId: heroStyleOf(s).id, custom: s.player.heroCustom || {}, equip: equipmentVisual(s) });
  function refreshModel() {
    const s = st(); if (!s || !preview) return;
    const l = look(s); preview.set(l.styleId, l.custom, l.equip);
  }
  function persist(reason) { clearTimeout(saveT); saveT = 0; deps.commit(reason); deps.onLook?.(); }
  function persistSoon(reason) { clearTimeout(saveT); saveT = setTimeout(() => persist(reason), 350); }

  /* ── ações (mesmo caminho do Arsenal/Inventário) ── */
  function equip(id) {
    const r = deps.act('equip', id);
    msg = r?.ok ? `EQUIPADO: ${st()._items[id]?.name}` : (r?.reason || 'falhou');
    cand = null; refreshModel(); render(); return r;
  }
  function unequip(sl) {
    const r = deps.act('unequip', null, sl);
    msg = r?.ok ? `Removido: ${VEST_SLOTS.find((x) => x[0] === sl)?.[1] || sl}` : (r?.reason || 'falhou');
    cand = null; refreshModel(); render(); return r;
  }
  function applyStyle(v) {
    const s = st(); if (!s || !v) return;
    for (const m of deps.mirrors()) { m.player.heroStyle = v.styleId; m.player.heroCustom = { ...(v.custom || {}) }; }
    refreshModel(); persistSoon('style');
    const nm = document.getElementById('vst-name'); if (nm) nm.textContent = heroStyleOf(v.styleId).name;
  }
  function saveLoadout(i, name) {
    const s = st(); if (!s) return null;
    const lo = { name: String(name || `Loadout ${i + 1}`).slice(0, 24), equipment: { ...s.equipment }, heroStyle: heroStyleOf(s).id, heroCustom: { ...(s.player.heroCustom || {}) }, at: Date.now() };
    for (const m of deps.mirrors()) { ensureLoadouts(m)[i] = JSON.parse(JSON.stringify(lo)); }
    msg = `Loadout ${i + 1} salvo.`; persist('loadout'); render(); return lo;
  }
  function applyLoadout(i) {
    const s = st(); const lo = ensureLoadouts(s)[i]; if (!lo) return { ok: false, reason: 'vazio' };
    const skipped = [];
    for (const sl of ALL_SLOTS) {
      const want = lo.equipment?.[sl] || null;
      if ((s.equipment?.[sl] || null) === want) continue;
      if (!want) { deps.act('unequip', null, sl); continue; }
      const it = s._items[want];
      const have = it && (it.arsenal ? isOwned(s, want) : (s.inventory || []).some((x) => x.item_id === want));
      if (!have) { skipped.push(it?.name || want); continue; }
      deps.act('equip', want);
    }
    for (const m of deps.mirrors()) { m.player.heroStyle = lo.heroStyle; m.player.heroCustom = { ...(lo.heroCustom || {}) }; }
    styleEd?.setValue({ styleId: lo.heroStyle, custom: lo.heroCustom });
    msg = `Loadout "${lo.name}" aplicado${skipped.length ? ` (sem: ${skipped.join(', ')})` : ''}.`;
    persist('loadout-apply'); refreshModel(); render();
    return { ok: true, skipped };
  }
  function clearLoadout(i) { for (const m of deps.mirrors()) ensureLoadouts(m)[i] = null; msg = `Loadout ${i + 1} apagado (só o atalho; itens continuam).`; persist('loadout-clear'); render(); }

  /* ── tela ── */
  function cmpHtml(s) {
    const c = hover || cand;
    const now = statSheet(s, s.equipment);
    let after = now; let title = 'Atributos atuais';
    if (c) {
      const eq = { ...s.equipment };
      if (c === '__none__') { eq[slot] = null; title = `Remover ${VEST_SLOTS.find((x) => x[0] === slot)?.[1]}`; }
      else { const it = s._items[c]; eq[it.equip_slot] = c; title = `${it.name}`; }
      after = statSheet(s, eq);
    }
    const rows = compareSheets(now, after).map((r) => r.text
      ? `<tr><td>${r.nome}</td><td colspan="3">${esc(r.antes)} → <b>${esc(r.depois)}</b></td></tr>`
      : `<tr data-vst-stat="${r.key}"><td>${r.nome}</td><td>${r.antes}${r.un}</td><td>→</td><td class="${r.delta > 0 ? 'up' : r.delta < 0 ? 'down' : ''}"><b>${r.depois}${r.un}</b>${r.delta ? ` <small>(${r.delta > 0 ? '+' : ''}${r.delta}${r.un})</small>` : ''}</td></tr>`).join('');
    return `<div class="vst-cmp-t">${esc(title)}${c ? ' · antes → depois' : ''}</div><table class="vst-cmp-tb">${rows}</table>`;
  }
  function paneEquip(s) {
    const slots = VEST_SLOTS.map(([k, n, ic]) => {
      const it = s.equipment?.[k] && s._items[s.equipment[k]];
      return `<button type="button" class="vst-slot${k === slot ? ' on' : ''}${it ? ' full' : ''}" data-vst-slot="${k}"><span class="vst-slot-k">${ic} ${n}</span><span class="vst-slot-n">${it ? esc(it.name) : 'vazio'}</span></button>`;
    }).join('');
    const items = ownedFor(s, slot);
    const fam = arsenalConfig()?.familias || {};
    const list = items.length ? items.map((it) => {
      const eq = s.equipment?.[slot] === it.id;
      return `<button type="button" class="vst-item${eq ? ' eq' : ''}${cand === it.id ? ' sel' : ''}" data-vst-item="${it.id}" style="--fc:${fam[it.family]?.cor || '#3ecfbf'}"><span class="inv-icon-wrap" data-item-icon="${it.id}"></span><span class="vst-item-n">${esc(it.name)}</span>${eq ? '<span class="vst-tag">EQUIPADO</span>' : ''}</button>`;
    }).join('') : `<p class="vst-empty">Nenhum item para este espaço. Compre no ARSENAL${arsenalConfig()?.testMode ? ' (modo teste: grátis)' : ''}.</p>`;
    const cur = s.equipment?.[slot];
    const sel = cand && cand !== '__none__' ? cand : null;
    const canEquip = sel && sel !== cur;
    return `<div class="vst-slots">${slots}</div>
      <div class="vst-items" id="vst-items">${list}</div>
      <div class="vst-cmp" id="vst-cmp">${cmpHtml(s)}</div>
      <div class="vst-acts"><button type="button" class="primary" id="vst-equip"${canEquip ? '' : ' disabled'}>EQUIPAR</button><button type="button" id="vst-unequip"${cur ? '' : ' disabled'}>REMOVER</button><button type="button" id="vst-arsenal">ARSENAL</button></div>`;
  }
  function paneLoadouts(s) {
    const lo = ensureLoadouts(s);
    return `<div class="vst-lo">${lo.map((l, i) => {
      const parts = l ? VEST_SLOTS.map(([k, n]) => l.equipment?.[k] && s._items[l.equipment[k]] ? `${n}: ${esc(s._items[l.equipment[k]].name)}` : null).filter(Boolean) : [];
      return `<div class="vst-lo-c${l ? ' full' : ''}" data-vst-lo="${i}">
        <div class="vst-lo-h"><b>${l ? esc(l.name) : `Espaço ${i + 1} — vazio`}</b>${l ? `<small>${esc(heroStyleOf(l.heroStyle).name)}</small>` : ''}</div>
        ${l ? `<p>${parts.length ? parts.join(' · ') : 'sem itens'}</p>` : '<p>Salve o visual + itens atuais aqui.</p>'}
        <div class="vst-lo-b"><button type="button" class="primary" data-vst-lo-save="${i}">SALVAR AQUI</button>${l ? `<button type="button" data-vst-lo-apply="${i}">USAR</button><button type="button" data-vst-lo-clear="${i}">LIMPAR</button>` : ''}</div></div>`;
    }).join('')}</div>`;
  }
  function render() {
    const s = st(); const box = document.getElementById('vst-pane'); if (!s || !box) return;
    document.querySelectorAll('#vst [data-vst-tab]').forEach((b) => b.classList.toggle('on', b.dataset.vstTab === tab));
    const m = document.getElementById('vst-msg'); if (m) m.textContent = msg;
    if (tab === 'estilo') { document.getElementById('vst-style-box').hidden = false; box.hidden = true; return; }
    document.getElementById('vst-style-box').hidden = true; box.hidden = false;
    box.innerHTML = tab === 'equip' ? paneEquip(s) : paneLoadouts(s);
    paintItemIcons(s);
    if (tab === 'equip') {
      box.querySelectorAll('[data-vst-slot]').forEach((b) => { b.onclick = () => { slot = b.dataset.vstSlot; cand = null; hover = null; render(); }; });
      box.querySelectorAll('[data-vst-item]').forEach((b) => {
        b.onclick = () => { cand = b.dataset.vstItem; hover = null; render(); };
        b.onmouseenter = () => { hover = b.dataset.vstItem; const c = document.getElementById('vst-cmp'); if (c) c.innerHTML = cmpHtml(s); };
        b.onmouseleave = () => { hover = null; const c = document.getElementById('vst-cmp'); if (c) c.innerHTML = cmpHtml(s); };
      });
      const be = document.getElementById('vst-equip'); if (be) be.onclick = () => cand && equip(cand);
      const bu = document.getElementById('vst-unequip'); if (bu) { bu.onclick = () => unequip(slot); bu.onmouseenter = () => { hover = '__none__'; document.getElementById('vst-cmp').innerHTML = cmpHtml(s); }; bu.onmouseleave = () => { hover = null; document.getElementById('vst-cmp').innerHTML = cmpHtml(s); }; }
      const ba = document.getElementById('vst-arsenal'); if (ba) ba.onclick = () => { close(); deps.openArsenal?.(); };
    } else {
      box.querySelectorAll('[data-vst-lo-save]').forEach((b) => { b.onclick = () => saveLoadout(+b.dataset.vstLoSave); });
      box.querySelectorAll('[data-vst-lo-apply]').forEach((b) => { b.onclick = () => applyLoadout(+b.dataset.vstLoApply); });
      box.querySelectorAll('[data-vst-lo-clear]').forEach((b) => { b.onclick = () => clearLoadout(+b.dataset.vstLoClear); });
    }
  }
  function close() {
    if (!open) return;
    open = false;
    if (saveT) persist('style');
    styleEd?.dispose(); styleEd = null;
    preview?.dispose(); preview = null;
    deps.ui.closeModal();
  }
  function show(selTab) {
    const s = st(); if (!s?.player) return false;
    ensureLoadouts(s);
    if (selTab) tab = selTab;
    msg = ''; cand = null; hover = null;
    styleEd?.dispose(); preview?.dispose(); preview = null;
    const html = `<div class="vst" id="vst">
      <div class="vst-stage"><canvas id="vst-canvas" aria-label="Herói 3D — arraste para girar, pinça para zoom"></canvas>
        <span class="vst-name" id="vst-name">${esc(heroStyleOf(s).name)}</span>
        <div class="vst-cam"><button type="button" id="vst-front" title="Vista de frente">FRENTE</button><button type="button" id="vst-zin" aria-label="Aproximar">＋</button><button type="button" id="vst-zout" aria-label="Afastar">－</button></div>
        <span class="vst-hint">arraste = girar · pinça/roda = zoom</span></div>
      <div class="vst-side">
        <div class="vst-tabs"><button type="button" data-vst-tab="equip">EQUIPAMENTO</button><button type="button" data-vst-tab="estilo">ESTILO</button><button type="button" data-vst-tab="loadouts">LOADOUTS</button></div>
        <div class="vst-msg" id="vst-msg"></div>
        <div id="vst-pane" class="vst-pane"></div>
        <div id="vst-style-box" class="vst-pane" hidden></div>
      </div></div>`;
    deps.ui.openModal('VESTIÁRIO', html, [{ label: 'Fechar', onClick: () => { open = true; close(); } }]);
    document.getElementById('modal-overlay')?.querySelector('.modal')?.classList.add('nx-vest-modal');
    open = true;
    document.querySelectorAll('#vst [data-vst-tab]').forEach((b) => { b.onclick = () => { tab = b.dataset.vstTab; msg = ''; render(); }; });
    styleEd = mountHeroStyleEditor(document.getElementById('vst-style-box'), { styleId: s.player.heroStyle, custom: s.player.heroCustom || {}, preview: false, onChange: (v) => { if (styleEd) applyStyle(v); } });
    import('./fps/hero-preview.js?v=20261009perf').then((m) => {
      const cv = document.getElementById('vst-canvas'); if (!cv || !open) return;
      try { preview = m.createHeroPreview(cv, { interactive: true }); refreshModel(); } catch (e) { console.warn('[vestiário] prévia 3D indisponível', e); }
      document.getElementById('vst-front').onclick = () => preview?.front();
      document.getElementById('vst-zin').onclick = () => preview?.zoom(preview.zoom() * 0.85);
      document.getElementById('vst-zout').onclick = () => preview?.zoom(preview.zoom() * 1.15);
    }).catch(() => {});
    render();
    return true;
  }
  return {
    open: show, close, isOpen: () => open && !document.getElementById('modal-overlay')?.classList.contains('hidden'),
    equip, unequip, saveLoadout, applyLoadout, clearLoadout,
    selectSlot: (k) => { slot = k; cand = null; render(); }, selectItem: (id) => { cand = id; render(); },
    hoverItem: (id) => { hover = id; const c = document.getElementById('vst-cmp'); const s = st(); if (c && s) c.innerHTML = cmpHtml(s); },
    tab: (t) => { tab = t; render(); },
    info: () => { const s = st(); return { open, tab, slot, cand, msg, preview: preview?.info() || null, sheet: s ? statSheet(s, s.equipment) : null, loadouts: s ? ensureLoadouts(s).map((l) => (l ? { name: l.name, heroStyle: l.heroStyle, equipment: { ...l.equipment } } : null)) : [] }; },
    preview: () => preview,
    statSheet: (eq) => { const s = st(); return s ? statSheet(s, eq || s.equipment) : null; }
  };
}
