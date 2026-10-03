/**
 * NEXARA — ARENA PRINCIPAL: HUD (região/risco, tempo, abates, MCB da corrida, BOLSA x/30, zona segura, evento,
 * extração), minimapa (regiões, zona segura, POIs, extração, evento — NUNCA loot), mapa grande (toque no minimapa / M),
 * seta de OBJETIVO na borda, popup de comparação do loot (↑ MELHOR / ↓ INFERIOR / = EQUIVALENTE → EQUIPAR / GUARDAR /
 * VENDER), painel da BOLSA, MERCADO NEGRO (COMPRAR = Arsenal · VENDER = bolsa) e o resumo DERROTADO / EXTRAÇÃO.
 * Só DOM/canvas 2D — nenhum custo no WebGL.
 */
import { bagEntries, bagCap, sellPriceOfEntry, compareWithEquipped, isBrItemId } from './br-items.js?v=20261003arena';

const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const mmss = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const RAR_N = { comum: 'Comum', incomum: 'Incomum', raro: 'Raro', epico: 'Épico', lendario: 'Lendário', material: 'Material' };
const RAR_C = { comum: '#c8d4d0', incomum: '#4aa0ff', raro: '#ffc24a', epico: '#b36bff', lendario: '#ffd34a', material: '#8fd8c8' };
export const rarColor = (r) => RAR_C[r] || '#c8d4d0';

/**
 * @param {{ getState:()=>object, getView:()=>object, getYaw:()=>number, getPos:()=>{x:number,y:number}, mirrors:()=>object[],
 *  equip:(id:string)=>object, sell:(id:string)=>object, openArsenal:()=>void, toast:(t:string)=>void, onChange:()=>void, sfx?:object }} deps
 */
export function createArenaBrUi(deps) {
  let root = null; let mm = null; let big = null; let arrow = null; let popup = null; let panel = null; let summaryEl = null;
  let shown = false; let lastMini = 0; let bigOpen = false;
  const popQueue = []; let popTimer = 0; let popCur = null;
  const stats = { popups: 0, popupActions: {}, minimapDraws: 0, summaries: 0, bagOpens: 0, marketOpens: 0 };

  function ensure() {
    if (root) return;
    const wrap = document.getElementById('canvas-wrap') || document.body;
    root = document.createElement('div'); root.id = 'br-hud'; root.className = 'br-hud hidden';
    root.innerHTML = `
      <div class="br-top">
        <div class="br-region"><b id="br-reg">—</b><span id="br-risk" class="br-risk"></span></div>
        <div class="br-chips">
          <span class="br-chip" id="br-time" title="Tempo">⏱ 0:00</span>
          <span class="br-chip" id="br-kills" title="Abates">☠ 0</span>
          <span class="br-chip" id="br-mcb" title="MCB nesta corrida">◈ +0</span>
          <button class="br-chip br-bagbtn" id="br-bag" type="button" title="Bolsa">🎒 0 / 30</button>
        </div>
        <div class="br-zone" id="br-zone">ZONA SEGURA</div>
        <div class="br-event hidden" id="br-event"></div>
      </div>
      <canvas id="br-minimap" class="br-minimap" width="168" height="168" title="Mapa (toque para ampliar · M)"></canvas>
      <div class="br-arrow hidden" id="br-arrow"><span class="br-arrow-ico">▲</span><span class="br-arrow-txt"></span></div>
      <div class="br-progress hidden" id="br-progress"><i></i><span></span></div>
      <div class="br-outside hidden" id="br-outside">FORA DA ZONA SEGURA — volte para o círculo</div>`;
    wrap.appendChild(root);
    mm = root.querySelector('#br-minimap');
    mm.addEventListener('click', () => toggleBigMap());
    root.querySelector('#br-bag').addEventListener('click', () => openBag());
    arrow = root.querySelector('#br-arrow');
    big = document.createElement('div'); big.id = 'br-bigmap'; big.className = 'br-bigmap hidden';
    big.innerHTML = '<div class="br-bigmap-box"><div class="br-bigmap-head"><b>MAPA · ARENA PRINCIPAL</b><button type="button" class="br-x">FECHAR</button></div><canvas width="700" height="532"></canvas><div class="br-legend"></div></div>';
    big.querySelector('.br-x').onclick = () => toggleBigMap(false);
    big.addEventListener('click', (e) => { if (e.target === big) toggleBigMap(false); });
    document.body.appendChild(big);
    popup = document.createElement('div'); popup.id = 'br-loot-pop'; popup.className = 'br-loot-pop hidden'; wrap.appendChild(popup);
    window.addEventListener('keydown', onKey, true);
  }
  function onKey(e) {
    if (!shown) return;
    if (e.code === 'KeyM' && !e.repeat && !panel) { toggleBigMap(); e.preventDefault(); }
    if (popCur && !e.repeat) {
      if (e.code === 'Digit1') { popAct('equip'); e.preventDefault(); }
      else if (e.code === 'Digit2') { popAct('keep'); e.preventDefault(); }
      else if (e.code === 'Digit3') { popAct('sell'); e.preventDefault(); }
    }
  }

  function show() { ensure(); root.classList.remove('hidden'); shown = true; document.getElementById('game-screen')?.classList.add('br-mode'); }
  function hide() {
    shown = false; root?.classList.add('hidden'); toggleBigMap(false); closePanel(); closeSummary();
    popQueue.length = 0; popCur = null; popup?.classList.add('hidden'); clearTimeout(popTimer);
    document.getElementById('game-screen')?.classList.remove('br-mode');
  }

  /* ── HUD por quadro (barato: só textContent quando muda) ── */
  const last = {};
  const setText = (id, t) => { if (last[id] === t) return; last[id] = t; const el = root.querySelector(id); if (el) el.textContent = t; };
  function update() {
    if (!shown) return;
    const v = deps.getView(); const s = deps.getState(); if (!v || !s) return;
    setText('#br-reg', v.regionNome || '—');
    setText('#br-risk', '●'.repeat(v.risco || 0) + '○'.repeat(Math.max(0, 5 - (v.risco || 0))));
    setText('#br-time', `⏱ ${mmss(v.clock)}`);
    setText('#br-kills', `☠ ${v.kills}`);
    setText('#br-mcb', `◈ +${v.mcbRun}`);
    const n = bagEntries(s).length; const cap = bagCap(s);
    setText('#br-bag', `🎒 ${n} / ${cap}`);
    root.querySelector('#br-bag').classList.toggle('full', n >= cap);
    const z = v.zone;
    const zt = z.phase === 'wait' ? `ZONA SEGURA fecha em ${mmss(z.msLeft + 30000)}` : z.phase === 'warn' ? `⚠ ZONA FECHA EM ${mmss(z.msLeft)} (${z.stage}/${z.stages})` : z.phase === 'shrink' ? `ZONA FECHANDO · ${mmss(z.msLeft)}` : 'ZONA FINAL';
    setText('#br-zone', zt);
    root.querySelector('#br-zone').classList.toggle('warn', z.phase === 'warn' || z.phase === 'shrink');
    root.querySelector('#br-outside').classList.toggle('hidden', !(z.outside && z.phase !== 'wait'));
    const ev = root.querySelector('#br-event');
    if (v.event) { ev.classList.remove('hidden'); setText('#br-event', `${v.event.kind === 'cacada' ? '🎯' : '📦'} ${v.event.nome}${v.event.done ? ' ✓' : ''} · ${mmss(v.event.msLeft)}`); }
    else ev.classList.add('hidden');
    // progresso (abrindo baú / extraindo)
    const pr = root.querySelector('#br-progress');
    let pk = null; let pt = '';
    if (v.extract?.id && v.extract.ms > 0) { pk = v.extract.ms / v.extract.need; pt = `EXTRAINDO… ${Math.ceil((v.extract.need - v.extract.ms) / 1000)}s — fique no ponto`; }
    else if (v.opening) { pk = v.opening.ms / v.opening.need; pt = 'ABRINDO…'; }
    pr.classList.toggle('hidden', pk == null);
    if (pk != null) { pr.querySelector('i').style.width = `${Math.min(100, pk * 100).toFixed(0)}%`; setText('#br-progress span', pt); }
    updateArrow(v, s);
    const now = performance.now();
    if (now - lastMini > 200) { lastMini = now; drawMini(v, s); if (bigOpen) drawBig(v, s); }
  }

  /** OBJETIVO: evento ativo > extração liberada > território do dragão (se ainda vivo). Seta na borda + distância. */
  function objective(v, s) {
    const cfg = s._data.arena_br; const p = deps.getPos();
    if (v.event && !v.event.done) {
      let x = v.event.x + 0.5, y = v.event.y + 0.5;
      if (v.event.uid) { const m = s.monstersAlive.find((q) => q.uid === v.event.uid && q.alive); if (m) { x = m.x + 0.5; y = m.y + 0.5; } }
      return { x, y, label: v.event.kind === 'cacada' ? 'ALVO DA CAÇADA' : 'DROP ESPECIAL', cor: v.event.kind === 'cacada' ? '#ffc830' : '#b36bff' };
    }
    if (v.extractionOpen) {
      let best = null; let bd = 1e9;
      for (const q of cfg.extracao.pontos) { const d = Math.hypot(q.x + 0.5 - p.x, q.y + 0.5 - p.y); if (d < bd) { bd = d; best = q; } }
      if (best) return { x: best.x + 0.5, y: best.y + 0.5, label: best.nome, cor: '#5dff8a' };
    }
    if (!v.bossKilled) return { x: cfg.dragao.x + 0.5, y: cfg.dragao.y + 0.5, label: 'COVIL DO DRAGÃO', cor: '#5dff6a' };
    return null;
  }
  function updateArrow(v, s) {
    const o = objective(v, s); const p = deps.getPos();
    if (!o) { arrow.classList.add('hidden'); return; }
    const dx = o.x - p.x, dy = o.y - p.y; const d = Math.hypot(dx, dy);
    if (d < 2.5) { arrow.classList.add('hidden'); return; }
    arrow.classList.remove('hidden');
    const ang = Math.atan2(dx, -dy) - (deps.getYaw?.() || 0); // 0 = à frente
    arrow.querySelector('.br-arrow-ico').style.transform = `rotate(${ang}rad)`;
    arrow.style.setProperty('--obj', o.cor);
    setText('.br-arrow-txt', `${o.label} · ${Math.round(d * 2)} m`);
    arrow.dataset.target = o.label;
  }

  /* ── minimapa (janela centrada no herói) e mapa grande ── */
  let baseCanvas = null; let baseKey = '';
  function baseMap(s) {
    const z = s._data.zones.zones.find((q) => q.id === s.zoneId); const m = z?.brMap; if (!m) return null;
    const key = `${m.W}x${m.H}`; if (baseCanvas && baseKey === key) return baseCanvas;
    const cfg = s._data.arena_br; const S = 4;
    const c = document.createElement('canvas'); c.width = m.W * S; c.height = m.H * S; const g = c.getContext('2d');
    const regCol = Object.fromEntries(cfg.regioes.map((r) => [r.n, r.cor]));
    for (let y = 0; y < m.H; y++) for (let x = 0; x < m.W; x++) {
      const t = z.map.legend[m.tiles[y][x]] || 'floor';
      const col = regCol[m.regionGrid[x + y * m.W]] || '#334';
      if (t === 'wall') g.fillStyle = '#0b0f14';
      else if (t === 'tree') g.fillStyle = '#123a24';
      else if (t === 'rock' || t === 'pillar' || t === 'crate') g.fillStyle = '#2a3036';
      else { g.fillStyle = col; g.globalAlpha = t === 'street' ? 0.32 : 0.2; }
      g.fillRect(x * S, y * S, S, S); g.globalAlpha = 1;
    }
    baseCanvas = c; baseKey = key; return c;
  }
  function drawLayer(g, s, v, ox, oy, sc, Wpx, Hpx, full) {
    const cfg = s._data.arena_br; const z = s._data.zones.zones.find((q) => q.id === s.zoneId); const m = z.brMap;
    const T = (x, y) => [(x - ox) * sc, (y - oy) * sc];
    // zona segura: fora escurecido + anel atual + próximo (tracejado)
    const zz = v.zone;
    const [cx, cy] = T(zz.cx, zz.cy);
    g.save(); g.fillStyle = 'rgba(120,20,60,0.32)'; g.beginPath(); g.rect(0, 0, Wpx, Hpx); g.arc(cx, cy, zz.r * sc, 0, Math.PI * 2, true); g.fill('evenodd'); g.restore();
    g.strokeStyle = '#4ad8ff'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, zz.r * sc, 0, Math.PI * 2); g.stroke();
    if (zz.phase === 'warn' || zz.phase === 'shrink') { g.setLineDash([5, 4]); g.strokeStyle = '#ffffff'; g.beginPath(); g.arc(cx, cy, zz.toR * sc, 0, Math.PI * 2); g.stroke(); g.setLineDash([]); }
    // POIs (sem loot e sem o local secreto)
    g.font = `${full ? 12 : 9}px system-ui, sans-serif`; g.textAlign = 'center';
    for (const p of m.pois) {
      if (p.hidden || p.kind === 'regiao') continue;
      const [x, y] = T(p.x + 0.5, p.y + 0.5);
      g.fillStyle = p.kind === 'dragao' ? '#5dff6a' : p.kind === 'elite' ? '#ffc830' : '#e8f6ff';
      g.beginPath(); g.moveTo(x, y - 4); g.lineTo(x + 4, y); g.lineTo(x, y + 4); g.lineTo(x - 4, y); g.fill();
      if (full) { g.fillText(p.label, x, y - 7); }
    }
    for (const q of cfg.extracao.pontos) {
      const [x, y] = T(q.x + 0.5, q.y + 0.5); g.strokeStyle = v.extractionOpen ? '#5dff8a' : '#8a9aa8'; g.lineWidth = 2;
      g.beginPath(); g.arc(x, y, full ? 7 : 4.5, 0, Math.PI * 2); g.stroke(); if (full) { g.fillStyle = g.strokeStyle; g.fillText(v.extractionOpen ? q.nome : `${q.nome} (em ${mmss(v.extractInMs)})`, Math.max(70, Math.min(Wpx - 70, x)), y + 18); }
    }
    if (v.event) { const [x, y] = T(v.event.x + 0.5, v.event.y + 0.5); g.strokeStyle = v.event.kind === 'cacada' ? '#ffc830' : '#b36bff'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, full ? 11 : 7, 0, Math.PI * 2); g.stroke(); }
    // inimigos só PERTO (radar curto) — elites/caçada destacados
    const p = deps.getPos();
    for (const mon of s.monstersAlive) {
      if (!mon.alive || mon.zone !== s.zoneId) continue;
      if (!mon.boss && Math.hypot(mon.x - p.x, mon.y - p.y) > 14) continue;
      const [x, y] = T(mon.x + 0.5, mon.y + 0.5);
      g.fillStyle = mon.boss ? '#5dff6a' : mon.hunted || mon.elite ? '#ffc93a' : '#e85d4c';
      g.beginPath(); g.arc(x, y, mon.boss ? 4 : mon.elite ? 3 : 2, 0, Math.PI * 2); g.fill();
    }
    // herói (seta na direção da câmera)
    const [hx, hy] = T(p.x, p.y); const yaw = deps.getYaw?.() || 0;
    g.save(); g.translate(hx, hy); g.rotate(yaw); g.fillStyle = '#3ecfbf'; g.strokeStyle = '#001'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, -6); g.lineTo(4.5, 5); g.lineTo(0, 2.5); g.lineTo(-4.5, 5); g.closePath(); g.fill(); g.stroke(); g.restore();
  }
  function drawMini(v, s) {
    const b = baseMap(s); if (!b) return;
    const g = mm.getContext('2d'); const W = mm.width, H = mm.height; const span = 40; const sc = W / span; const p = deps.getPos();
    const ox = p.x - span / 2, oy = p.y - span / 2;
    g.clearRect(0, 0, W, H); g.fillStyle = '#05080c'; g.fillRect(0, 0, W, H);
    g.drawImage(b, ox * 4, oy * 4, span * 4, span * 4, 0, 0, W, H);
    drawLayer(g, s, v, ox, oy, sc, W, H, false);
    stats.minimapDraws++;
  }
  function drawBig(v, s) {
    const cv = big.querySelector('canvas'); const b = baseMap(s); if (!b) return;
    const g = cv.getContext('2d'); const m = s._data.zones.zones.find((q) => q.id === s.zoneId).brMap;
    const sc = Math.min(cv.width / m.W, cv.height / m.H);
    g.clearRect(0, 0, cv.width, cv.height); g.drawImage(b, 0, 0, m.W * sc, m.H * sc);
    // nomes das regiões
    g.font = 'bold 13px system-ui, sans-serif'; g.textAlign = 'center';
    for (const r of s._data.arena_br.regioes) { g.fillStyle = r.cor; g.globalAlpha = 0.85; g.fillText(r.nome.toUpperCase(), ((r.x0 + r.x1) / 2) * sc, ((r.y0 + r.y1) / 2) * sc + 22); g.globalAlpha = 1; }
    drawLayer(g, s, v, 0, 0, sc, cv.width, cv.height, true);
  }
  function toggleBigMap(on = !bigOpen) {
    if (!big) return; bigOpen = !!on; big.classList.toggle('hidden', !bigOpen);
    if (bigOpen) {
      const s = deps.getState(); const v = deps.getView();
      big.querySelector('.br-legend').innerHTML = (s?._data?.arena_br?.rotas || []).map((r) => `<span>${esc(r.nome)}</span>`).join('') + '<span>◇ ponto de interesse · ○ extração · círculo azul = zona segura (tracejado = próximo)</span>';
      if (s && v) drawBig(v, s);
    }
  }

  /* ── popup de comparação do loot ── */
  function lootPopup(info) { popQueue.push(info); if (!popCur) nextPop(); }
  function nextPop() {
    clearTimeout(popTimer);
    popCur = popQueue.shift() || null;
    if (!popCur) { popup.classList.add('hidden'); return; }
    const s = deps.getState(); const { def, uid, full } = popCur;
    const cmp = uid ? compareWithEquipped(s, uid) : null;
    popCur.cmp = cmp;
    const V = { melhor: ['↑ MELHOR', 'up'], inferior: ['↓ INFERIOR', 'down'], equivalente: ['= EQUIVALENTE', 'eq'] }[cmp?.verdict || 'equivalente'];
    const rows = (cmp?.rows || []).filter((r) => r.delta || r.text).slice(0, 5).map((r) => r.text ? `<li><span>${esc(r.nome)}</span><b>${esc(r.antes)} → ${esc(r.depois)}</b></li>` : `<li class="${r.delta > 0 ? 'up' : 'down'}"><span>${esc(r.nome)}</span><b>${r.delta > 0 ? '+' : ''}${r.delta}${esc(r.un || '')}</b></li>`).join('');
    const price = uid ? sellPriceOfEntry(s, { item_id: uid, qty: 1 }) : 0;
    popup.innerHTML = `<div class="br-pop-card" style="--rar:${rarColor(def.rarity)}">
      <div class="br-pop-head"><span class="br-pop-rar">${esc(RAR_N[def.rarity] || def.rarity)}</span><b>${esc(def.name)}</b></div>
      <div class="br-pop-verdict ${V[1]}" data-verdict="${cmp?.verdict || ''}">${V[0]}<small>${cmp?.equipped ? ` vs ${esc(cmp.equipped)}` : ' (espaço vazio)'}</small></div>
      ${rows ? `<ul class="br-pop-rows">${rows}</ul>` : ''}
      ${full ? '<div class="br-pop-full">Bolsa cheia. Equipe ou venda — ou deixe no chão.</div>' : ''}
      <div class="br-pop-actions">
        <button type="button" data-a="equip" class="primary">EQUIPAR <kbd>1</kbd></button>
        <button type="button" data-a="keep">${full ? 'DEIXAR' : 'GUARDAR'} <kbd>2</kbd></button>
        <button type="button" data-a="sell">VENDER +${price} <kbd>3</kbd></button>
      </div></div>`;
    popup.querySelectorAll('button[data-a]').forEach((b) => { b.onclick = () => popAct(b.dataset.a); });
    popup.classList.remove('hidden'); popup.classList.remove('pop-in'); void popup.offsetWidth; popup.classList.add('pop-in');
    stats.popups++;
    popTimer = setTimeout(() => popAct('keep', true), 9000); // ignorado → fica guardado (ou no chão, se cheia)
  }
  function popAct(a, auto = false) {
    if (!popCur) return;
    const cur = popCur; stats.popupActions[a] = (stats.popupActions[a] || 0) + 1;
    const r = deps.onPopupAction?.(a, cur, auto);
    if (r?.msg) deps.toast?.(r.msg);
    nextPop();
  }

  /* ── painel da BOLSA / MERCADO NEGRO ── */
  function closePanel() { panel?.remove(); panel = null; }
  function bagRows(s, mode) {
    const list = bagEntries(s);
    if (!list.length) return '<p class="br-empty">Bolsa vazia — o loot da Arena aparece aqui.</p>';
    return list.map((e) => {
      const d = s._items[e.item_id]; if (!d) return '';
      const rar = d.rarity || (e.bolsa ? 'material' : 'comum'); const price = sellPriceOfEntry(s, e);
      const cmp = isBrItemId(e.item_id) && d.equip_slot ? compareWithEquipped(s, e.item_id) : null;
      const tag = cmp ? `<em class="v-${cmp.verdict}">${cmp.verdict === 'melhor' ? '↑ MELHOR' : cmp.verdict === 'inferior' ? '↓ INFERIOR' : '= EQUIVALENTE'}</em>` : '';
      return `<div class="br-row" data-id="${esc(e.item_id)}" style="--rar:${rarColor(rar)}"><span class="br-row-name"><b>${esc(d.name)}</b>${!isBrItemId(e.item_id) ? ` ×${e.qty}` : ''}<small>${esc(RAR_N[rar] || rar)}</small>${tag}</span>
        <span class="br-row-act">${mode === 'bag' && d.equip_slot ? '<button type="button" data-a="equip">EQUIPAR</button>' : ''}<button type="button" data-a="sell">VENDER +${price}</button></span></div>`;
    }).join('');
  }
  function openPanel(kind) {
    ensure(); closePanel();
    const s = deps.getState(); if (!s) { deps.toast?.('Sem personagem — entre na Arena ou crie um herói.'); return; }
    panel = document.createElement('div'); panel.className = 'br-panel'; panel.id = kind === 'market' ? 'br-market' : 'br-bag-panel';
    const render = (tab = 'vender') => {
      const n = bagEntries(s).length; const cap = bagCap(s);
      const head = kind === 'market'
        ? `<div class="br-panel-head"><b>🏴 MERCADO NEGRO</b><span class="br-mcb">◈ ${Math.floor(s.player.mcb || 0)} MCB</span><button type="button" class="br-x">FECHAR</button></div>
           <div class="br-tabs"><button type="button" data-tab="comprar" class="${tab === 'comprar' ? 'on' : ''}">COMPRAR</button><button type="button" data-tab="vender" class="${tab === 'vender' ? 'on' : ''}">VENDER</button></div>`
        : `<div class="br-panel-head"><b>🎒 BOLSA</b><span class="br-count ${n >= cap ? 'full' : ''}">${n} / ${cap}${n >= cap ? ' · Bolsa cheia.' : ''}</span><button type="button" class="br-x">FECHAR</button></div>`;
      const body = kind === 'market' && tab === 'comprar'
        ? '<div class="br-buy"><p>Equipamentos do Arsenal (preços de teste ligados no arsenal.json).</p><button type="button" class="primary" data-open-arsenal>ABRIR VITRINE (COMPRAR)</button><p class="br-note">Itens comprados no Arsenal não podem ser revendidos (evita MCB infinito).</p></div>'
        : `<div class="br-count-line">${n} / ${cap}${n >= cap ? ' · <b>Bolsa cheia.</b>' : ''}</div><div class="br-list">${bagRows(s, kind === 'market' ? 'market' : 'bag')}</div>`;
      panel.innerHTML = `<div class="br-panel-box">${head}${body}</div>`;
      panel.querySelector('.br-x').onclick = () => closePanel();
      panel.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => render(b.dataset.tab); });
      panel.querySelector('[data-open-arsenal]')?.addEventListener('click', () => { closePanel(); deps.openArsenal?.(); });
      panel.querySelectorAll('.br-row button[data-a]').forEach((b) => {
        b.onclick = () => {
          const id = b.closest('.br-row').dataset.id;
          const r = b.dataset.a === 'equip' ? deps.equip(id) : deps.sell(id);
          deps.toast?.(r?.msg || (r?.ok ? 'OK' : r?.reason || 'Não foi possível.'));
          render(tab);
        };
      });
    };
    render(kind === 'market' ? 'vender' : 'vender');
    panel.addEventListener('click', (e) => { if (e.target === panel) closePanel(); });
    document.body.appendChild(panel);
    if (kind === 'market') stats.marketOpens++; else stats.bagOpens++;
  }
  const openBag = () => openPanel('bag');
  const openMarket = () => openPanel('market');

  /* ── resumo DERROTADO / EXTRAÇÃO ── */
  function closeSummary() { summaryEl?.remove(); summaryEl = null; }
  function showSummary(sum, { onAgain, onMenu }) {
    closeSummary(); toggleBigMap(false);
    const ok = sum.kind === 'extraido';
    summaryEl = document.createElement('div'); summaryEl.id = 'br-summary'; summaryEl.className = `br-summary ${ok ? 'ok' : 'dead'}`;
    const best = sum.best ? `<b style="color:${rarColor(sum.best.rar)}">${esc(sum.best.name)}</b>` : '—';
    summaryEl.innerHTML = `<div class="br-sum-box">
      <h2>${ok ? 'EXTRAÇÃO CONCLUÍDA' : 'DERROTADO'}</h2>
      <p class="br-sum-sub">${ok ? `Bônus de extração: <b>+${sum.bonus} MCB</b>` : 'Nada permanente foi perdido — tudo que você pegou já está salvo.'}</p>
      <dl>
        <dt>Tempo sobrevivido</dt><dd data-k="time">${mmss(sum.timeMs)}</dd>
        <dt>Monstros derrotados</dt><dd data-k="kills">${sum.kills}</dd>
        <dt>MCB ganho</dt><dd data-k="mcb">+${sum.mcb + (sum.bonus || 0)}</dd>
        <dt>Itens encontrados</dt><dd data-k="items">${sum.items}</dd>
        <dt>Melhor equipamento</dt><dd data-k="best">${best}</dd>
        <dt>Regiões visitadas</dt><dd data-k="regions">${sum.regions.length} / 6</dd>
      </dl>
      ${sum.boss ? '<p class="br-sum-boss">🐉 GIGANTE VERDE derrotado nesta corrida!</p>' : ''}
      <div class="br-sum-actions"><button type="button" class="primary" data-a="again">JOGAR DE NOVO</button><button type="button" data-a="menu">MENU</button></div></div>`;
    summaryEl.querySelector('[data-a="again"]').onclick = () => { closeSummary(); onAgain?.(); };
    summaryEl.querySelector('[data-a="menu"]').onclick = () => { closeSummary(); onMenu?.(); };
    document.body.appendChild(summaryEl);
    stats.summaries++;
  }

  return { show, hide, update, lootPopup, openBag, openMarket, closePanel, showSummary, closeSummary, toggleBigMap, isPanelOpen: () => !!panel || !!summaryEl || bigOpen, stats: () => JSON.parse(JSON.stringify(stats)), popupOpen: () => !!popCur };
}
