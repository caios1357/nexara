/**
 * NEXARA — 20261024apex: SELEÇÃO DE HERÓI estilo Apex + LOBBY dos 50 jogadores (antes da queda).
 *  · 9 heróis (retrato + prévia 3D girando; o GUERREIRO usa o modelo GLB do Caio), nome, papel, arma, habilidades, personalidade e skin elemental;
 *  · CONFIRMAR ou contagem regressiva (escolha automática = última escolha / herói atual);
 *  · LOBBY: você + 49 rivais (BOT offline) com personagem, skin, nível — exatamente os que vão cair no mapa; queda em 5 s.
 * Toque, retrato e paisagem (CSS). Persistência: quem chama grava player.heroStyle (+ skin) e a "última escolha".
 */
import { PERSONAGENS, SKINS, PERSONALIDADES } from './personagens.js?v=20261025perf';
import { heroStyleOf } from './hero-styles.js?v=20261025perf';
import { kitFor, statLine, temVariantes, VARIANTES, SLOTS } from './hero-kits.js?v=20261025perf';
import { ICONS } from './icons.js?v=20261025perf';

export const LAST_PICK_KEY = 'nexara.ultimaEscolha';
export function readLastPick() { try { const v = JSON.parse(localStorage.getItem(LAST_PICK_KEY) || 'null'); return v && PERSONAGENS.some((p) => p.id === v.id) ? v : null; } catch { return null; } }
export function writeLastPick(v) { try { localStorage.setItem(LAST_PICK_KEY, JSON.stringify({ id: v.id, skin: v.skin || '', arma: v.arma === 'cajado' ? 'cajado' : 'espada', at: Date.now() })); } catch { /* sem storage */ } }

/** papel + habilidades mostrados na seleção (as 3 especiais são as do jogo; a arma é a do kit do personagem) */
const INFO = {
  cavaleiro: { papel: 'LINHA DE FRENTE', passiva: 'Equilibrado: troca golpes em qualquer distância curta' },
  arqueiro: { papel: 'ATIRADOR', passiva: 'Equilibrado: mantém distância e acerta de longe' },
  mago: { papel: 'ARCANISTA', passiva: 'Cauteloso: recua com pouco HP' },
  ninja: { papel: 'ASSASSINO', passiva: 'Agressivo: corre mais e ataca primeiro' },
  paladino: { papel: 'DEFENSOR', passiva: 'Cauteloso: escudo erguido, avança com calma' },
  cacadora: { papel: 'CAÇADORA', passiva: 'Caça gigantes: +dano contra gigantes' },
  bruxo: { papel: 'CONTROLE', passiva: 'Oportunista: escolhe alvos fracos' },
  samurai: { papel: 'DUELISTA', passiva: 'Duelista: +dano em duelo entre heróis' },
  berserker: { papel: 'BRUTAMONTES', passiva: 'Agressivo: pressão constante' }
};

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * @param {{ mode:'full'|'fast', current?:{id:string, skin?:string}, seconds?:number, onConfirm:(v:{id:string, skin:string, auto:boolean})=>void, onCancel?:()=>void }} o
 */
export function openHeroSelect(o) {
  closeHeroSelect();
  const cur = o.current && PERSONAGENS.some((p) => p.id === o.current.id) ? o.current : { id: 'cavaleiro', skin: '' };
  let pick = cur.id; let skin = cur.skin || ''; let arma = cur.arma === 'cajado' ? 'cajado' : 'espada'; let left = Math.max(3, o.seconds ?? 15); let done = false; let preview = null;
  const el = document.createElement('div'); el.id = 'hero-select'; el.className = 'hsel'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Escolha seu herói');
  el.innerHTML = `
    <div class="hsel-top"><div class="hsel-title">ESCOLHA SEU HERÓI<small>${o.mode === 'x1' ? 'X1 ⚔ · DUELO 1×1 · RIVAL SORTEADO' : (o.mode === 'fast' ? 'NEXARA FAST ⚡' : 'ARENA NEXARA') + ' · 50 JOGADORES'}</small></div>
      <div class="hsel-timer" id="hsel-timer" aria-live="polite"><b id="hsel-left">${left}</b><small>escolha automática</small></div></div>
    <div class="hsel-body">
      <div class="hsel-grid" id="hsel-grid">${PERSONAGENS.map((p) => { const s = heroStyleOf(p.id); return `<button type="button" class="hsel-card" data-id="${p.id}" style="--hc:${s.css}" aria-label="${esc(p.name)}">
        <span class="hsel-por"><img src="assets/ui/herois/${p.id}.webp?v=20261024glb3" alt="" loading="eager" onerror="this.remove()"></span><b>${esc(p.name)}</b><small>${esc(INFO[p.id]?.papel || '')}</small></button>`; }).join('')}</div>
      <div class="hsel-detail">
        <div class="hsel-prev"><canvas id="hsel-canvas" aria-label="Prévia 3D do herói"></canvas><span class="hsel-glb" id="hsel-glb"></span></div>
        <div class="hsel-info">
          <div class="hsel-name" id="hsel-name"></div>
          <div class="hsel-role" id="hsel-role"></div>
          <p class="hsel-lore" id="hsel-lore"></p>
          <div class="hsel-row hsel-skins"><span id="hsel-sklab">ELEMENTO</span><div id="hsel-skin"><button type="button" data-sk="">PADRÃO</button>${Object.entries(SKINS).map(([id, k]) => `<button type="button" data-sk="${id}" style="--sc:${k.css}">${k.name}</button>`).join('')}</div></div>
          <div class="hsel-vdesc" id="hsel-vdesc"></div>
          <div class="hsel-row hsel-stats"><span>ATRIBUTOS</span><b id="hsel-stats"></b></div>
          <div class="hsel-row hsel-skins hsel-armas"><span>ARMA (PARTIDA)</span><div id="hsel-arma"><button type="button" data-arma="espada">⚔ ESPADA BÁSICA</button><button type="button" data-arma="cajado">🔮 CAJADO BÁSICO</button></div></div>
          <div class="hsel-row hsel-fair"><span>PARTIDA JUSTA</span><b>Todos começam no NV1 · só espada/cajado básicos · loot e níveis dentro da partida</b></div>
          <div class="hsel-row"><span>VISUAL</span><b id="hsel-weapon"></b></div>
          <div class="hsel-row"><span>PASSIVA</span><b id="hsel-passiva"></b></div>
          <div class="hsel-pw" id="hsel-pw" aria-label="Poderes"></div>
          <div class="hsel-row"><span>PERSONALIDADE</span><b id="hsel-pass"></b></div>
        </div>
      </div>
    </div>
    <div class="hsel-bottom"><button type="button" class="hsel-back" id="hsel-back">VOLTAR</button><button type="button" class="hsel-ok primary" id="hsel-ok">CONFIRMAR</button></div>`;
  document.body.appendChild(el);
  const $ = (id) => el.querySelector(`#${id}`);
  function paint() {
    const p = PERSONAGENS.find((q) => q.id === pick) || PERSONAGENS[0]; const s = heroStyleOf(p.id); const I = INFO[p.id] || {};
    el.querySelectorAll('.hsel-card').forEach((b) => { const on = b.dataset.id === pick; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    el.querySelectorAll('#hsel-skin button').forEach((b) => b.classList.toggle('on', b.dataset.sk === skin));
    el.querySelectorAll('#hsel-arma button').forEach((b) => b.classList.toggle('on', b.dataset.arma === arma));
    const col = skin && SKINS[skin] ? SKINS[skin].css : s.css;
    $('hsel-name').textContent = p.name; $('hsel-name').style.color = col;
    $('hsel-role').textContent = `${I.papel || ''} · ${s.tag}`;
    $('hsel-lore').textContent = s.lore || '';
    $('hsel-weapon').textContent = `${s.weaponLabel || ''} (cosmético)`;
    { // 20261024poder: atributos + passiva + 3 poderes do kit (o Guerreiro muda com a VARIANTE elemental)
      const k = kitFor(p.id, skin); const vv = temVariantes(p.id);
      $('hsel-stats').textContent = statLine(k);
      $('hsel-passiva').textContent = `${k.passiva.nome} — ${k.passiva.desc}`;
      const LB = { golpe_poderoso: 'GOLPE', ataque_area: 'ÁREA', suprema: 'SUPREMA' };
      $('hsel-pw').innerHTML = SLOTS.map((sl) => { const q = k.poderes[sl]; return `<div class="hsel-pwc" data-slot="${sl}" data-poder="${q.id}"><i>${ICONS[q.icon] || ''}</i><span><b>${esc(q.nome)}</b><small>${LB[sl]} · ${Math.round(q.cd / 1000)} s</small><em>${esc(q.desc)}</em></span></div>`; }).join('');
      $('hsel-sklab').textContent = vv ? 'VARIANTE (muda atributos)' : 'ELEMENTO (visual)';
      el.classList.toggle('hsel-var', vv);
      const V = vv ? VARIANTES[k.variante] : null; $('hsel-vdesc').innerHTML = V ? `<b>${esc(V.nome)}</b> ${esc(V.desc)}` : '';
    }
    $('hsel-pass').textContent = `${PERSONALIDADES[p.perso]?.label || ''} — ${I.passiva || ''}`;
    el.style.setProperty('--hc', col);
    try { preview?.set(p.id, skin ? { skin } : {}, {}); } catch { /* prévia opcional */ }
  }
  el.querySelectorAll('.hsel-card').forEach((b) => { b.onclick = () => { pick = b.dataset.id; paint(); }; });
  el.querySelectorAll('#hsel-skin button').forEach((b) => { b.onclick = () => { skin = b.dataset.sk; paint(); }; });
  el.querySelectorAll('#hsel-arma button').forEach((b) => { b.onclick = () => { arma = b.dataset.arma; paint(); }; });
  const finish = (auto) => { if (done) return; done = true; const v = { id: pick, skin, arma, auto: !!auto }; closeHeroSelect(); o.onConfirm(v); };
  $('hsel-ok').onclick = () => finish(false);
  $('hsel-back').onclick = () => { if (done) return; done = true; closeHeroSelect(); o.onCancel?.(); };
  const tm = setInterval(() => { if (done || !el.isConnected) { clearInterval(tm); return; } left--; const lb = $('hsel-left'); if (lb) lb.textContent = String(Math.max(0, left)); el.classList.toggle('hsel-urgent', left <= 5); if (left <= 0) { clearInterval(tm); finish(true); } }, 1000);
  el._timer = tm;
  import('./fps/hero-preview.js?v=20261025perf').then((m) => {
    if (!el.isConnected) return;
    try { preview = m.createHeroPreview($('hsel-canvas'), { interactive: true, autoSpin: 0.6 }); el._preview = preview; paint(); } catch (e) { console.warn('[seleção] prévia 3D indisponível', e); }
  }).catch(() => {});
  const glbTick = setInterval(() => { if (!el.isConnected) { clearInterval(glbTick); return; } const i = preview?.info?.(); const g = $('hsel-glb'); if (g) g.textContent = i?.caioGlb === 'ready' ? 'MODELO 3D DO CAIO' : ''; }, 400);
  paint();
  return { el, info: () => ({ pick, skin, arma, left, preview: preview?.info?.() || null }) };
}
export function closeHeroSelect() {
  const el = document.getElementById('hero-select'); if (!el) return;
  clearInterval(el._timer); try { el._preview?.dispose(); } catch { /* ok */ } el.remove();
}

/**
 * LOBBY: você + rivais do elenco planejado. Queda automática em `seconds` (ou CAIR AGORA).
 * @param {{ mode:string, you:{name:string, id:string, skin?:string, level:number}, roster:Array, levelBase:number, seconds?:number, onDrop:()=>void }} o
 */
export function openLobby(o) {
  closeLobby();
  let left = Math.max(1, o.seconds ?? 5); let done = false;
  const total = o.roster.length + 1;
  const count = {}; for (const r of o.roster) count[r.char] = (count[r.char] || 0) + 1;
  const tile = (nm, id, sk, lv, you, arma) => { const p = PERSONAGENS.find((q) => q.id === id); const css = sk && SKINS[sk] ? SKINS[sk].css : heroStyleOf(id).css;
    return `<li class="hlob-p${you ? ' you' : ''}" style="--pc:${css}"><i class="hlob-ic"><img src="assets/ui/herois/${id}.webp?v=20261024glb3" alt="" onerror="this.remove()"></i><span><b>${esc(nm)}</b><small>${esc(p?.name || id)}${you ? ' · VOCÊ' : ' · BOT'} · NV ${lv}${arma ? ` · ${arma === 'cajado' ? '🔮' : '⚔'}` : ''}</small></span></li>`; };
  const el = document.createElement('div'); el.id = 'hero-lobby'; el.className = 'hlob';
  el.innerHTML = `<div class="hlob-top"><div class="hlob-title">${o.mode === 'fast' ? 'NEXARA FAST ⚡' : 'ARENA NEXARA'} · <b id="hlob-n">${total}</b> JOGADORES<small>você + ${o.roster.length} rivais (BOT, offline)</small></div>
      <div class="hlob-drop">QUEDA EM <b id="hlob-left">${left}</b></div></div>
    <div class="hlob-mix">${PERSONAGENS.map((p) => `<span style="--pc:${heroStyleOf(p.id).css}">${esc(p.name)} <b>${(count[p.id] || 0) + (o.you.id === p.id ? 1 : 0)}</b></span>`).join('')}</div>
    <ul class="hlob-list" id="hlob-list">${tile(o.you.name, o.you.id, o.you.skin, o.you.level, true, o.you.arma)}${o.roster.map((r) => tile(r.nome, r.char, r.skin, Math.max(1, o.levelBase + (r.lvlOff || 0)), false, r.arma)).join('')}</ul>
    <div class="hlob-bottom"><button type="button" class="primary" id="hlob-go">CAIR AGORA</button></div>`;
  document.body.appendChild(el);
  const go = () => { if (done) return; done = true; closeLobby(); o.onDrop(); };
  el.querySelector('#hlob-go').onclick = go;
  const tm = setInterval(() => { if (done || !el.isConnected) { clearInterval(tm); return; } left--; const lb = el.querySelector('#hlob-left'); if (lb) lb.textContent = String(Math.max(0, left)); if (left <= 0) { clearInterval(tm); go(); } }, 1000);
  el._timer = tm;
  return { el };
}
export function closeLobby() { const el = document.getElementById('hero-lobby'); if (!el) return; clearInterval(el._timer); el.remove(); }
