/**
 * NEXARA — Bloco 6b: TELA INTEIRA.
 * Android/Chrome (prioridade): Fullscreen API em document.documentElement (requestFullscreen,
 * fallback webkitRequestFullscreen) e, depois que o pedido resolve, tenta travar a orientação
 * ATUAL com screen.orientation.lock (try/catch; nunca força — se falhar, segue normal).
 * iPhone/Safari: não há Fullscreen API para páginas → o botão mostra a dica real
 * "Adicionar à Tela de Início" (o manifest abre em display: fullscreen). Nada é simulado.
 */
import { getConfig } from './gameplay-config.js?v=20261003m10e';

const root = () => document.documentElement;
const st = { enters: 0, exits: 0, lastError: null, lastLock: null, tips: 0, changes: 0 };

export function fsElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || null;
}
export function isFullscreen() { return !!fsElement(); }
/** A página pode pedir tela inteira (API presente e habilitada). */
export function fsSupported() {
  const el = root();
  const api = typeof el.requestFullscreen === 'function' || typeof el.webkitRequestFullscreen === 'function';
  const enabled = document.fullscreenEnabled ?? document.webkitFullscreenEnabled ?? false;
  return api && !!enabled;
}
/** Já aberto como app instalado (Tela de Início) em tela inteira/standalone. */
export function isStandalone() {
  try {
    return !!(window.navigator.standalone || matchMedia('(display-mode: fullscreen)').matches || matchMedia('(display-mode: standalone)').matches);
  } catch { return false; }
}
function isIOS() {
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
export const IOS_TIP = 'No iPhone: toque em Compartilhar → Adicionar à Tela de Início para abrir em tela inteira';

async function lockOrientation() {
  st.lastLock = null;
  if (!getConfig().fullscreen?.lockOrientation) {
    // EVO: sem trava — libera qualquer trava anterior para o celular girar (retrato ⇄ paisagem) também em tela cheia
    try { screen.orientation?.unlock?.(); } catch { /* sem trava */ }
    st.lastLock = 'livre';
    return;
  }
  try {
    const so = screen.orientation;
    if (!so || typeof so.lock !== 'function') { st.lastLock = 'sem suporte'; return; }
    const want = String(so.type || '').startsWith('portrait') ? 'portrait' : 'landscape';
    await so.lock(want);
    st.lastLock = want;
  } catch (e) {
    st.lastLock = `ignorado (${e?.name || 'erro'})`;
  }
}

/** Entra em tela inteira. Precisa ser chamado dentro de um gesto (toque/clique). */
export async function enterFullscreen() {
  if (isFullscreen()) return { ok: true, already: true };
  if (!fsSupported()) return { ok: false, reason: 'unsupported' };
  const el = root();
  try {
    if (typeof el.requestFullscreen === 'function') await el.requestFullscreen({ navigationUI: 'hide' });
    else await el.webkitRequestFullscreen();
    st.enters++;
    st.lastError = null;
    await lockOrientation();
    return { ok: true, lock: st.lastLock };
  } catch (e) {
    st.lastError = `${e?.name || 'Error'}: ${e?.message || e}`;
    return { ok: false, reason: 'rejected', error: st.lastError };
  }
}
export async function exitFullscreen() {
  if (!isFullscreen()) return { ok: true, already: true };
  try { screen.orientation?.unlock?.(); } catch { /* sem trava */ }
  try {
    if (typeof document.exitFullscreen === 'function') await document.exitFullscreen();
    else await document.webkitExitFullscreen?.();
    st.exits++;
    return { ok: true };
  } catch (e) {
    st.lastError = `${e?.name || 'Error'}: ${e?.message || e}`;
    return { ok: false, reason: 'rejected', error: st.lastError };
  }
}

/**
 * Controlador da UI: botão ⛶ do HUD, opção TELA INTEIRA do menu inicial, tela inteira automática
 * no 1º toque em JOGAR/Continuar/Arena e redimensionamento ao entrar/sair/girar.
 * @param {{ toast:(msg:string, ms?:number)=>void }} deps
 */
export function createFullscreenUi(deps = {}) {
  const buttons = new Set();
  function refreshButtons() {
    const on = isFullscreen();
    const sup = fsSupported();
    for (const b of buttons) {
      if (!b.isConnected) { buttons.delete(b); continue; }
      b.classList.toggle('is-on', on);
      b.classList.toggle('no-api', !sup);
      b.setAttribute('aria-pressed', String(on));
      const lbl = on ? 'Sair da tela inteira' : 'Tela inteira';
      b.setAttribute('aria-label', lbl);
      b.title = lbl;
      if (b.dataset.fsText) b.textContent = on ? 'SAIR DA TELA INTEIRA' : 'TELA INTEIRA';
      else b.innerHTML = on ? FS_EXIT_SVG : FS_ENTER_SVG;
    }
  }
  function tip() {
    st.tips++;
    const msg = isStandalone() ? 'Já está aberto em tela inteira pela Tela de Início.'
      : (isIOS() ? IOS_TIP : 'Este navegador não libera tela inteira para páginas. Use o menu do navegador → "Adicionar à tela inicial".');
    deps.toast?.(msg, getConfig().fullscreen?.tipMs ?? 6000);
    return msg;
  }
  async function toggle() {
    if (isFullscreen()) return exitFullscreen();
    if (!fsSupported()) return { ok: false, reason: 'unsupported', tip: tip() };
    const r = await enterFullscreen();
    if (!r.ok && r.reason === 'rejected') deps.toast?.('Tela inteira bloqueada pelo navegador — toque de novo.', 2500);
    return r;
  }
  function bind(btn, { text = false } = {}) {
    if (!btn) return;
    if (text) btn.dataset.fsText = '1';
    buttons.add(btn);
    btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); toggle(); });
    refreshButtons();
  }
  /** Gesto em JOGAR/Continuar/Arena → entra sozinho (se ligado e possível). Capture: roda no mesmo gesto. */
  function bindAuto(ids) {
    document.addEventListener('click', (e) => {
      const t = e.target instanceof Element ? e.target.closest(ids.map((i) => `#${i}`).join(',')) : null;
      if (!t || t.disabled) return;
      if (!getConfig().fullscreen?.auto || isFullscreen() || !fsSupported()) return;
      st.autoTried = (st.autoTried || 0) + 1;
      enterFullscreen();
    }, true);
  }
  // Entrou/saiu/girou → botões + canvas/HUD (o renderer mede o canvas a cada frame; os
  // controles e o HUD escutam 'resize') — reforça com um resize após o layout assentar.
  let rt = 0;
  function relayout() {
    st.changes++;
    refreshButtons();
    clearTimeout(rt);
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    rt = setTimeout(() => window.dispatchEvent(new Event('resize')), 350);
    deps.onChange?.(isFullscreen());
  }
  document.addEventListener('fullscreenchange', relayout);
  document.addEventListener('webkitfullscreenchange', relayout);
  window.addEventListener('orientationchange', () => { clearTimeout(rt); rt = setTimeout(() => window.dispatchEvent(new Event('resize')), 250); });
  try { screen.orientation?.addEventListener?.('change', () => { clearTimeout(rt); rt = setTimeout(() => window.dispatchEvent(new Event('resize')), 250); }); } catch { /* sem API */ }
  return {
    bind, bindAuto, toggle, refreshButtons, tip,
    debug: () => ({ ...st, active: isFullscreen(), supported: fsSupported(), standalone: isStandalone(), element: fsElement()?.tagName || null, auto: !!getConfig().fullscreen?.auto })
  };
}

const FS_ENTER_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/></svg>';
const FS_EXIT_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5"/></svg>';
