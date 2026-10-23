/**
 * META-69 — TUTORIAL CURTO da 1ª partida (4 passos, ~30 s, sem pausar o jogo).
 * Cada passo só conclui com a AÇÃO REAL do jogador (andar, atacar, usar habilidade, olhar o objetivo/mapa).
 * Guardado à parte do save (localStorage 'nexara.tutorial.v1') — nunca mexe no save do herói.
 * ?tutorial=1 força · ?tutorial=0 desliga · em testes automatizados (webdriver) só aparece com ?tutorial=1.
 */
const KEY = 'nexara.tutorial.v1';
let forcedShown = false; // ?tutorial=1 força só na 1ª partida da sessão (bug R3: reabria na 2ª)
const STEPS = [
  { id: 'mover', icon: '🕹️', title: 'ANDE', text: 'Arraste o <b>analógico esquerdo</b> (ou use <b>WASD</b>) para andar.' },
  { id: 'atacar', icon: '⚔️', title: 'ATAQUE', text: 'Toque em <b>ATACAR</b> (ou <b>E</b>/clique) perto de um monstro — a mira trava sozinha. <b>Espaço</b> = esquiva.' },
  { id: 'habilidade', icon: '✨', title: 'HABILIDADE', text: 'Use uma <b>HABILIDADE</b> (botões ao redor do ataque · teclas <b>1–3</b>). Elas recarregam sozinhas.' },
  { id: 'objetivo', icon: '🧭', title: 'OBJETIVO', text: 'Siga a <b>SETA</b> até o objetivo e fuja da <b>ZONA</b> que fecha. <b>M</b> ou o minimapa abre o mapa.' }
];
export function createTutorial({ getState }) {
  const q = new URLSearchParams(location.search).get('tutorial');
  const stats = { shown: 0, step: -1, done: false, skipped: false, completed: [], startedAt: 0, finishedAt: 0 };
  let el = null, startPos = null, stepAt = 0, active = false;
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
  const persist = (o) => { try { localStorage.setItem(KEY, JSON.stringify({ ...load(), ...o, at: Date.now() })); } catch { /* sem storage */ } };
  function eligible() {
    if (q === '0') return false; if (q === '1') return !forcedShown && !load().done;
    if (navigator.webdriver) return false;
    return !load().done;
  }
  function render() {
    if (!el) return; const s = STEPS[stats.step]; if (!s) return;
    el.querySelector('.nx-tuto-ic').textContent = s.icon;
    el.querySelector('.nx-tuto-t').innerHTML = `${s.title} <span>${stats.step + 1}/${STEPS.length}</span>`;
    el.querySelector('.nx-tuto-x').innerHTML = s.text;
    el.dataset.step = s.id; el.classList.remove('nx-tuto-pop'); void el.offsetWidth; el.classList.add('nx-tuto-pop');
  }
  function ensureCss() {
    if (document.getElementById('nx-tuto-css')) return;
    const st = document.createElement('style'); st.id = 'nx-tuto-css';
    st.textContent = `#nx-tuto{position:fixed;left:50%;top:clamp(130px,32vh,190px);transform:translateX(-50%);z-index:60;display:flex;gap:10px;align-items:center;max-width:min(470px,86vw);padding:9px 12px 9px 10px;border-radius:14px;background:rgba(6,16,28,.86);border:1px solid rgba(80,220,255,.55);box-shadow:0 0 18px rgba(40,200,255,.25);color:#e8f6ff;font:13px/1.3 system-ui,sans-serif;pointer-events:auto}
#nx-tuto .nx-tuto-ic{font-size:24px}#nx-tuto .nx-tuto-t{font-weight:800;letter-spacing:.06em;color:#7fe7ff;font-size:12px}#nx-tuto .nx-tuto-t span{opacity:.7;font-weight:600;margin-left:6px}
#nx-tuto .nx-tuto-x b{color:#ffd76a}#nx-tuto button{margin-left:auto;background:none;border:1px solid rgba(255,255,255,.3);color:#cfe;border-radius:9px;padding:6px 9px;font:700 11px system-ui;min-width:52px;min-height:32px}
#nx-tuto.nx-tuto-pop{animation:nxTuto .35s ease-out}#nx-tuto.nx-tuto-ok{border-color:#6f6;box-shadow:0 0 22px rgba(90,255,120,.45)}
@keyframes nxTuto{0%{transform:translate(-50%,-8px) scale(.94);opacity:0}100%{transform:translate(-50%,0) scale(1);opacity:1}}`;
    document.head.appendChild(st);
  }
  function start(force = false) {
    if (active) return true;
    if (!force && !eligible()) return false;
    const s = getState(); if (!s?.player) return false;
    ensureCss(); el?.remove();
    el = document.createElement('div'); el.id = 'nx-tuto'; el.setAttribute('role', 'status');
    el.innerHTML = '<div class="nx-tuto-ic"></div><div><div class="nx-tuto-t"></div><div class="nx-tuto-x"></div></div><button type="button" data-a="pular">PULAR</button>';
    el.querySelector('[data-a="pular"]').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); skip(); });
    document.body.appendChild(el);
    active = true; forcedShown = true; stats.shown++; stats.done = false; stats.skipped = false; stats.completed = []; stats.step = 0; stats.startedAt = performance.now();
    startPos = { x: s.player.x, y: s.player.y }; stepAt = performance.now(); render();
    return true;
  }
  function advance(id) {
    if (!active || STEPS[stats.step]?.id !== id) return false;
    stats.completed.push(id); el?.classList.add('nx-tuto-ok');
    stats.step++; stepAt = performance.now();
    if (stats.step >= STEPS.length) { finish(false); return true; }
    setTimeout(() => { el?.classList.remove('nx-tuto-ok'); render(); }, 380);
    const s = getState(); if (s?.player) startPos = { x: s.player.x, y: s.player.y };
    return true;
  }
  function finish(skipped) {
    active = false; stats.done = !skipped; stats.skipped = !!skipped; stats.finishedAt = performance.now();
    persist({ done: true, skipped: !!skipped });
    const e = el; el = null;
    if (e) { e.classList.add('nx-tuto-ok'); setTimeout(() => e.remove(), skipped ? 0 : 900); }
  }
  function skip() { if (active) finish(true); }
  /** eventos reais do jogo: 'attack' (comando de ataque), 'skill' (habilidade usada), 'map' (mapa aberto) */
  function note(evt) {
    if (!active) return false;
    if (evt === 'attack') return advance('atacar');
    if (evt === 'skill') return advance('habilidade');
    if (evt === 'map') return advance('objetivo');
    return false;
  }
  function tick() {
    if (!active) return;
    const s = getState(); if (!s?.player || !s.brMode) { if (!s?.brMode) { active = false; el?.remove(); el = null; } return; }
    const id = STEPS[stats.step]?.id;
    if (id === 'mover' && startPos && Math.hypot(s.player.x - startPos.x, s.player.y - startPos.y) >= 1.5) advance('mover');
    else if (id === 'objetivo' && performance.now() - stepAt > 6000) advance('objetivo'); // leu a dica e seguiu jogando
  }
  return {
    start, note, tick, skip, isActive: () => active,
    reset: () => { forcedShown = false; try { localStorage.removeItem(KEY); } catch { /* */ } return true; },
    stats: () => ({ ...stats, active, stepId: STEPS[stats.step]?.id ?? null, saved: load(), steps: STEPS.map((s) => s.id), visible: !!el && el.isConnected })
  };
}
