/**
 * NEXARA — Bloco 6: ícones de BUFF das passivas automáticas (perto da barra superior).
 * Um ícone por efeito ativo: símbolo da passiva + anel de contagem regressiva + segundos restantes.
 * Só mostra o que está realmente ativo (dados de passive-procs.getBuffs()). Sem efeitos → some.
 * Em 1ª pessoa (?fp=1), um brilho na borda da tela com a cor do efeito substitui a aura no corpo.
 */
import { icon } from './icons.js?v=20261003arena';
import { getConfig } from './gameplay-config.js?v=20261003arena';

export function createPassiveHud() {
  let row = null;
  let edge = null;
  const els = new Map(); // passiveId → { el, t }
  function host() { return document.getElementById('canvas-wrap') || document.body; }
  function ensure() {
    if (row && row.isConnected) return;
    row = document.createElement('div');
    row.id = 'nx-buffs';
    row.className = 'nx-buffs';
    row.setAttribute('aria-live', 'polite');
    host().appendChild(row);
    edge = document.createElement('div');
    edge.id = 'nx-aura-edge';
    edge.className = 'nx-aura-edge';
    host().appendChild(edge);
    els.clear();
  }
  /**
   * @param {Array<{id,buff,label,color,leftMs,frac,extra}>} buffs
   * @param {{firstPerson?:boolean}} opts
   */
  function update(buffs, opts = {}) {
    ensure();
    const max = getConfig().passiveProcs?.maxHudIcons ?? 6;
    const list = buffs.slice(0, max);
    const seen = new Set();
    for (const b of list) {
      seen.add(b.id);
      let e = els.get(b.id);
      if (!e) {
        const el = document.createElement('div');
        el.className = 'nx-buff nx-buff-in';
        el.dataset.id = b.id;
        el.dataset.buff = b.buff;
        el.style.setProperty('--c', b.color);
        el.innerHTML = `<span class="nx-buff-ring"><span class="nx-buff-ico">${icon(b.id)}</span></span><b class="nx-buff-t"></b><i class="nx-buff-name">${b.label}</i>`;
        row.appendChild(el);
        e = { el, t: el.querySelector('.nx-buff-t') };
        els.set(b.id, e);
        setTimeout(() => el.classList.remove('nx-buff-in'), 420);
      }
      e.el.style.setProperty('--p', b.frac.toFixed(3));
      const s = b.leftMs / 1000;
      e.t.textContent = s >= 10 ? String(Math.ceil(s)) : s.toFixed(1).replace('.', ',');
      e.el.classList.toggle('nx-buff-low', b.leftMs < 1200);
    }
    for (const [id, e] of els) if (!seen.has(id)) { e.el.remove(); els.delete(id); }
    row.classList.toggle('on', list.length > 0);
    host().classList.toggle('nx-has-buffs', list.length > 0);
    if (list.length) host().style.setProperty('--nx-buffs-h', `${row.offsetHeight + 4}px`);
    // 1ª pessoa: brilho de borda com a cor do efeito mais recente
    const fp = !!opts.firstPerson && list.length > 0;
    edge.classList.toggle('on', fp);
    if (fp) edge.style.setProperty('--c', list[list.length - 1].color);
  }
  function clear() { update([]); }
  function snapshot() {
    return [...els.entries()].map(([id, e]) => {
      const r = e.el.getBoundingClientRect();
      return { id, buff: e.el.dataset.buff, text: e.t.textContent, visible: r.width > 0 && getComputedStyle(e.el).display !== 'none', x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    });
  }
  return { update, clear, snapshot };
}
