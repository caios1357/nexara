/**
 * NEXARA — Bloco 7: barra de vida do chefe "GIGANTE VERDE" (HUD, topo do canvas).
 * Ligada ao HP REAL da instância do monstro (mon.hp / mon.hpMax). Marcas nos limiares de
 * poder (80/60/40/20%). Mostra TENTATIVA e poderes ativos; destaca quando o chefe está travado
 * (lock-on). Enquanto visível, #canvas-wrap ganha .nx-has-boss e --nx-boss-h (o CSS desce
 * minimapa/missão/log/buffs para não colidir).
 */
export function createBossHud() {
  let el = null;
  let fill = null;
  let ghost = null;
  let num = null;
  let meta = null;
  let shown = false;
  let lastKey = '';
  let ghostPct = 1;
  let ghostHoldUntil = 0;
  // EVO: fase do chefe + barra de POSTURA (quebra = janela de vulnerabilidade)
  let phaseEl = null;
  let postFill = null;

  function host() {
    return document.getElementById('canvas-wrap') || document.getElementById('game-screen') || document.body;
  }

  function ensure() {
    if (el && el.isConnected) return;
    el = document.createElement('div');
    el.id = 'nx-boss-bar';
    el.className = 'nx-boss-bar hidden';
    el.setAttribute('role', 'status');
    el.innerHTML = `
      <div class="nbb-head"><span class="nbb-skull">✦</span><span class="nbb-name">GIGANTE VERDE</span><span class="nbb-phase"></span><span class="nbb-lock" aria-hidden="true">◎ ALVO</span></div>
      <div class="nbb-track"><div class="nbb-ghost"></div><div class="nbb-fill"></div>
        <i class="nbb-tick" style="left:20%"></i><i class="nbb-tick" style="left:40%"></i><i class="nbb-tick" style="left:60%"></i><i class="nbb-tick" style="left:80%"></i>
        <span class="nbb-num"></span></div>
      <div class="nbb-post" title="POSTURA"><div class="nbb-post-fill"></div></div>
      <div class="nbb-meta"></div>`;
    fill = el.querySelector('.nbb-fill');
    ghost = el.querySelector('.nbb-ghost');
    num = el.querySelector('.nbb-num');
    meta = el.querySelector('.nbb-meta');
    phaseEl = el.querySelector('.nbb-phase');
    postFill = el.querySelector('.nbb-post-fill');
    host().appendChild(el);
  }

  function setShown(v) {
    if (v === shown && el && el.isConnected) return;
    ensure();
    if (el.parentElement !== host()) host().appendChild(el);
    shown = v;
    el.classList.toggle('hidden', !v);
    const h = host();
    h.classList.toggle('nx-has-boss', v);
    if (v) h.style.setProperty('--nx-boss-h', `${el.offsetHeight + 8}px`);
  }

  /**
   * @param {{ visible:boolean, hp:number, max:number, attempt:number, powers:number, locked:boolean, telegraph?:string }} v
   */
  function update(v) {
    if (!v || !v.visible) { if (shown) setShown(false); return; }
    setShown(true);
    const pct = Math.max(0, Math.min(1, v.hp / Math.max(1, v.max)));
    const now = performance.now();
    if (pct < ghostPct) { if (!ghostHoldUntil) ghostHoldUntil = now + 450; if (now > ghostHoldUntil) ghostPct = Math.max(pct, ghostPct - 0.012); }
    else { ghostPct = pct; ghostHoldUntil = 0; }
    if (Math.abs(ghostPct - pct) < 0.002) ghostHoldUntil = 0;
    const postPct = v.postureMax > 0 ? Math.max(0, Math.min(1, (v.posture || 0) / v.postureMax)) : 0;
    const key = `${v.hp}|${v.max}|${v.attempt}|${v.powers}|${v.locked ? 1 : 0}|${v.telegraph || ''}|${ghostPct.toFixed(3)}|${v.phaseName || ''}|${postPct.toFixed(2)}|${v.broken ? 1 : 0}`;
    if (key === lastKey) return;
    lastKey = key;
    fill.style.width = `${(pct * 100).toFixed(2)}%`;
    ghost.style.width = `${(ghostPct * 100).toFixed(2)}%`;
    num.textContent = `${Math.max(0, Math.ceil(v.hp)).toLocaleString('pt-BR')} / ${Math.round(v.max).toLocaleString('pt-BR')}`;
    meta.textContent = `TENTATIVA ${v.attempt} · PODERES ${v.powers}${v.telegraph ? ` · ${v.telegraph}` : ''}`;
    phaseEl.textContent = v.phaseName || '';
    phaseEl.dataset.phase = String(v.phase ?? '');
    postFill.style.width = `${(v.broken ? 100 : postPct * 100).toFixed(1)}%`;
    el.classList.toggle('nbb-broken', !!v.broken);
    el.classList.toggle('nbb-locked', !!v.locked);
    el.classList.toggle('nbb-danger', !!v.telegraph);
    el.dataset.hp = String(v.hp);
    el.dataset.max = String(v.max);
  }

  return {
    update,
    isShown: () => shown,
    /** e2e: estado exibido (texto/largura) */
    read: () => (el ? { shown, name: el.querySelector('.nbb-name').textContent, num: num.textContent, width: fill.style.width, meta: meta.textContent, phase: phaseEl.textContent, posture: postFill.style.width, broken: el.classList.contains('nbb-broken'), locked: el.classList.contains('nbb-locked'), rect: el.getBoundingClientRect().toJSON() } : { shown: false })
  };
}
