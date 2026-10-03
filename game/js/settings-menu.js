/**
 * NEXARA — Bloco 5 · MENU CONFIGURAÇÕES → CONTROLES + EDITOR DE LAYOUT
 *
 * - Menu: sliders / escolhas / chaves descritos em SETTINGS_UI (gameplay-config.js). Cada mudança
 *   chama setOverrides() NA HORA (efeito imediato no jogo) e persiste em localStorage
 *   'nexara.settings.v1' (chave separada do save do mundo).
 * - Editor: arrastar cada controle, mudar tamanho e transparência, "Restaurar padrão".
 *   Layout por orientação (retrato / paisagem) salvo em layout.<orientação> do mesmo storage.
 */
import {
  getConfig, setOverrides, setLayout, clearOverridePaths, SETTINGS_UI, LAYOUT_ITEMS
} from './gameplay-config.js?v=20261003m10d';

const ITEM_LABEL = {
  joystick: 'JOYSTICK', camera: 'CÂMERA + ATAQUE', attack: 'ATAQUE', dodge: 'ESQUIVA', defend: 'DEFESA',
  golpe_poderoso: 'GOLPE', ataque_area: 'ÁREA', suprema: 'SUPREMA'
};

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}
function nest(path, value) {
  const out = {};
  const parts = path.split('.');
  let o = out;
  for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]] = {};
  o[parts[parts.length - 1]] = value;
  return out;
}
function fmtVal(v, fmt) {
  if (fmt === '%') return `${Math.round(v * 100)}%`;
  if (fmt === 'op') return `${Math.round((1 - v) * 100)}%`; // transparência = 1 − opacidade
  return `${v.toFixed(2)}×`;
}

export function createSettingsMenu({ ui, mobile, isGameVisible, openGameSettings, onChange, openHeroStyle }) {
  let editor = null;

  // ——————————————————— MENU ———————————————————
  function itemHtml(it) {
    const cfg = getConfig();
    const path = Array.isArray(it.path) ? it.path[0] : it.path;
    if (it.type === 'note') return `<div class="nxs-row nxs-note" data-set="${it.id}" style="opacity:.72;font-size:11px;line-height:1.35">${it.label}</div>`;
    const v = getPath(cfg, path);
    if (it.type === 'range') {
      return `<div class="nxs-row" data-set="${it.id}">
        <label for="nxs-${it.id}">${it.label}</label>
        <div class="nxs-ctl"><input type="range" id="nxs-${it.id}" min="${it.min}" max="${it.max}" step="${it.step}" value="${v}">
        <output id="nxs-${it.id}-v">${fmtVal(v, it.fmt)}</output></div></div>`;
    }
    if (it.type === 'toggle') {
      return `<div class="nxs-row" data-set="${it.id}"><label>${it.label}</label>
        <div class="nxs-ctl"><button type="button" class="nxs-toggle${v ? ' on' : ''}" id="nxs-${it.id}" aria-pressed="${!!v}">${v ? 'LIGADO' : 'DESLIGADO'}</button></div></div>`;
    }
    return `<div class="nxs-row" data-set="${it.id}"><label>${it.label}</label>
      <div class="nxs-ctl nxs-choice" id="nxs-${it.id}">${it.options.map(([val, lbl]) =>
        `<button type="button" data-val="${val}" class="${val === v ? 'on' : ''}">${lbl}</button>`).join('')}</div></div>`;
  }

  function apply(it, value) {
    const paths = Array.isArray(it.path) ? it.path : [it.path];
    for (const p of paths) setOverrides(nest(p, value));
    onChange?.(it.id, value);
  }

  function bind() {
    for (const g of SETTINGS_UI) {
      for (const it of g.items) {
        const el = document.getElementById(`nxs-${it.id}`);
        if (!el) continue;
        if (it.type === 'range') {
          el.oninput = () => {
            const v = Number(el.value);
            apply(it, v);
            const o = document.getElementById(`nxs-${it.id}-v`);
            if (o) o.textContent = fmtVal(v, it.fmt);
          };
        } else if (it.type === 'toggle') {
          el.onclick = () => {
            const nv = !el.classList.contains('on');
            apply(it, nv);
            el.classList.toggle('on', nv);
            el.setAttribute('aria-pressed', String(nv));
            el.textContent = nv ? 'LIGADO' : 'DESLIGADO';
          };
        } else {
          el.querySelectorAll('button').forEach((b) => {
            b.onclick = () => {
              apply(it, b.dataset.val);
              el.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
            };
          });
        }
      }
    }
    const ed = document.getElementById('nxs-edit-layout');
    if (ed) ed.onclick = () => { if (isGameVisible()) { ui.closeModal(); openEditor(); } };
  }

  function open() {
    const inGame = isGameVisible();
    const html = `<div class="nx-settings" id="nx-settings">
      <div class="nxs-tabs"><span class="on">CONTROLES</span></div>
      ${SETTINGS_UI.map((g) => `<section class="nxs-group"><h3>${g.group}</h3>${g.items.map(itemHtml).join('')}</section>`).join('')}
      <section class="nxs-group"><h3>LAYOUT DOS CONTROLES</h3>
        <p class="nxs-note">Arraste cada botão, mude o tamanho e a transparência. Salvo separado para retrato e paisagem.</p>
        <button type="button" id="nxs-edit-layout" class="primary" ${inGame ? '' : 'disabled'}>EDITAR LAYOUT</button>
        ${inGame ? '' : '<p class="nxs-note">Entre num jogo (Continuar ou Arena de Teste) para editar o layout.</p>'}
      </section>
      <p class="nxs-note">As mudanças valem na hora e ficam salvas neste aparelho.</p>
    </div>`;
    ui.openModal('Configurações', html, [
      ...(inGame ? [{ label: 'Inventário', onClick: () => ui.openInventory?.() }, { label: 'Estilo do herói', onClick: () => openHeroStyle?.() }] : []),
      { label: 'Restaurar padrão', keepOpen: true, onClick: () => { restoreControls(); open(); ui.showToast?.('Controles restaurados ao padrão'); } },
      { label: 'Salvar / Exportar jogo', onClick: () => openGameSettings?.() },
      { label: 'Fechar', primary: true }
    ]);
    document.getElementById('modal-overlay')?.querySelector('.modal')?.classList.add('nx-settings-modal');
    bind();
  }

  function restoreControls() {
    const paths = [];
    for (const g of SETTINGS_UI) for (const it of g.items) if (it.path) paths.push(...(Array.isArray(it.path) ? it.path : [it.path]));
    clearOverridePaths(paths);
    onChange?.('restore', null);
  }

  // ——————————————————— EDITOR DE LAYOUT ———————————————————
  function openEditor() {
    if (editor) return;
    const host = document.getElementById('canvas-wrap') || document.getElementById('game-screen') || document.body;
    const prevForce = mobile.isForceVisible?.() ?? false;
    mobile.setForceVisible(true);
    mobile.setEditMode(true);
    const start = mobile.getLayoutItems();
    const orient = start.orient;
    const work = JSON.parse(JSON.stringify(getConfig().layout[orient] || {}));
    const el = document.createElement('div');
    el.id = 'nx-layout-editor';
    el.className = 'nx-layout-editor';
    el.innerHTML = `
      <div class="nle-bar"><b>EDITOR DE LAYOUT · ${orient === 'landscape' ? 'PAISAGEM' : 'RETRATO'}</b>
        <span>Arraste para mover · toque para escolher</span></div>
      <div class="nle-panel">
        <div class="nle-sel" id="nle-sel">Toque num controle</div>
        <label>TAMANHO <input type="range" id="nle-size" disabled><output id="nle-size-v">—</output></label>
        <label>TRANSPARÊNCIA <input type="range" id="nle-op" disabled><output id="nle-op-v">—</output></label>
        <div class="nle-btns">
          <button type="button" id="nle-reset">Restaurar padrão</button>
          <button type="button" id="nle-cancel">Cancelar</button>
          <button type="button" id="nle-save" class="primary">Salvar</button>
        </div>
      </div>
      <div class="nle-handles" id="nle-handles"></div>`;
    host.appendChild(el);
    const le = getConfig().layoutEditor;
    const size = el.querySelector('#nle-size');
    const op = el.querySelector('#nle-op');
    size.min = String(le.minScale); size.max = String(le.maxScale); size.step = '0.05';
    op.min = String(le.minOpacity); op.max = '1'; op.step = '0.05';
    const handles = {};
    let selected = null;
    let drag = null;

    function refresh() {
      mobile.previewLayout(work);
      const { items } = mobile.getLayoutItems();
      const hr = el.querySelector('#nle-handles').getBoundingClientRect();
      const mr = mobile.getRoot().getBoundingClientRect();
      for (const id of LAYOUT_ITEMS) {
        const it = items[id];
        let h = handles[id];
        if (!it) { if (h) h.style.display = 'none'; continue; }
        if (!h) {
          h = document.createElement('div');
          h.className = `nle-h nle-h-${id}`;
          h.dataset.id = id;
          h.innerHTML = `<span>${ITEM_LABEL[id]}</span>`;
          h.addEventListener('pointerdown', onDown);
          el.querySelector('#nle-handles').appendChild(h);
          handles[id] = h;
        }
        const ox = mr.left - hr.left;
        const oy = mr.top - hr.top;
        h.style.display = '';
        h.style.left = `${(ox + it.cx - it.size / 2).toFixed(1)}px`;
        h.style.top = `${(oy + it.cy - it.size / 2).toFixed(1)}px`;
        h.style.width = h.style.height = `${it.size.toFixed(1)}px`;
        h.classList.toggle('sel', id === selected);
      }
      syncPanel();
    }
    function syncPanel() {
      const on = !!selected;
      size.disabled = op.disabled = !on;
      const w = (selected && work[selected]) || {};
      el.querySelector('#nle-sel').textContent = on ? ITEM_LABEL[selected] : 'Toque num controle';
      size.value = String(w.s ?? 1);
      op.value = String(w.o ?? 1);
      el.querySelector('#nle-size-v').textContent = on ? `${Math.round((w.s ?? 1) * 100)}%` : '—';
      el.querySelector('#nle-op-v').textContent = on ? `${Math.round((1 - (w.o ?? 1)) * 100)}%` : '—';
    }
    function onDown(e) {
      e.preventDefault();
      e.stopPropagation();
      const id = e.currentTarget.dataset.id;
      selected = id;
      const { items } = mobile.getLayoutItems();
      const it = items[id];
      drag = { id, pid: e.pointerId, x0: e.clientX, y0: e.clientY, cx: it.cx, cy: it.cy, moved: false };
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      refresh();
    }
    function onMove(e) {
      if (!drag || e.pointerId !== drag.pid) return;
      e.preventDefault();
      const dx = e.clientX - drag.x0;
      const dy = e.clientY - drag.y0;
      if (!drag.moved && Math.hypot(dx, dy) < le.dragThresholdPx) return;
      drag.moved = true;
      const r = mobile.getRoot().getBoundingClientRect();
      const w = work[drag.id] || (work[drag.id] = {});
      w.x = Math.max(0, Math.min(1, (drag.cx + dx) / r.width));
      w.y = Math.max(0, Math.min(1, (drag.cy + dy) / r.height));
      refresh();
    }
    function onUp(e) {
      if (!drag || e.pointerId !== drag.pid) return;
      drag = null;
    }
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('touchstart', (e) => { if (e.target.closest('.nle-h') && e.cancelable) e.preventDefault(); }, { passive: false });
    size.oninput = () => { if (!selected) return; (work[selected] || (work[selected] = {})).s = Number(size.value); refresh(); };
    op.oninput = () => { if (!selected) return; (work[selected] || (work[selected] = {})).o = Number(op.value); refresh(); };
    el.querySelector('#nle-reset').onclick = () => {
      for (const k of Object.keys(work)) delete work[k];
      setLayout('portrait', null);
      setLayout('landscape', null);
      selected = null;
      refresh();
      ui.showToast?.('Layout padrão restaurado');
      onChange?.('layout-reset', null);
    };
    el.querySelector('#nle-cancel').onclick = () => close(false);
    el.querySelector('#nle-save').onclick = () => close(true);
    const onResize = () => refresh();
    window.addEventListener('resize', onResize);

    function close(save) {
      window.removeEventListener('resize', onResize);
      if (save) {
        const clean = {};
        for (const [k, v] of Object.entries(work)) if (v && Object.keys(v).length) clean[k] = v;
        setLayout(orient, clean);
        onChange?.('layout-save', clean);
        ui.showToast?.('Layout salvo');
      }
      mobile.previewLayout(null);
      mobile.setEditMode(false);
      mobile.setForceVisible(prevForce);
      el.remove();
      editor = null;
    }
    editor = { el, close, work, orient, refresh, select: (id) => { selected = id; refresh(); } };
    refresh();
  }

  return {
    open,
    openEditor,
    isEditorOpen: () => !!editor,
    closeEditor: (save) => editor?.close(!!save),
    editorDebug: () => editor && { orient: editor.orient, work: JSON.parse(JSON.stringify(editor.work)) }
  };
}
