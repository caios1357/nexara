/**
 * NEXARA — tela "ESCOLHA SUA PASSIVA" + aviso "NOVA PASSIVA DISPONÍVEL" (gp3).
 * Estilo HUD sci-fi escuro do jogo. Um toque/clique escolhe: a carta fica
 * destacada, as demais travam (sem escolha dupla), confirmação curta, fecha.
 * Entrada por pointerup (um caminho só — sem click duplicado no mobile).
 */
import { getRarity, buildOfPassive } from './passives.js?v=20261003m10f';
import { getConfig } from './gameplay-config.js?v=20261003m10f';
import { icon } from './icons.js?v=20261003m10f';

/** EVO: cor-assinatura de cada passiva (mesma da VFX in-game) — arte da carta. */
const SIG_HEX = {
  furia_cibernetica: '#ff3b3b', impulso_neural: '#39a8ff', nucleo_reforcado: '#5ff0ff', mira_neural: '#ffd23f',
  condutor_de_nexa: '#4f8dff', cacador_de_monstros: '#ff8a1f', nucleo_divino: '#ffd76a', eco_runico: '#7affe0',
  fagulha_em_cadeia: '#fff07a', reflexo_fantasma: '#c89aff', telemetria_neural: '#6ae8ff', sobrecarga_de_nexa: '#b46aff',
  sifao_de_reator: '#5affc8', quebra_postura: '#ffb02a', coracao_de_dragao: '#ff5a3a', blindagem_adaptativa: '#ffa040', nucleo_de_vigor: '#6aff7a'
};
import { describeProc } from './passive-procs.js?v=20261003m10f';
/** Bloco 6: texto EFEITO = comportamento automático (gerado do config) + bônus base do JSON. */
const effectText = (d) => describeProc(d.id) || d.descricao;

/** Rótulo curto do atributo (banner "DANO +8%" / painel de passivas ativas). */
const STAT_LABEL = {
  damage: 'DANO', nexaRegen: 'REGEN. NEXA', maxHp: 'HP MÁX.', moveSpeed: 'VELOCIDADE', critChance: 'CRÍTICO',
  damageVsCommon: 'DANO VS COMUNS', abilityDamage: 'DANO DE HABILIDADE', hpRegen: 'REGEN. HP',
  // Bloco 7: poderes da arena
  damageTaken: 'DANO RECEBIDO', specialCooldown: 'RECARGA ESPECIAIS', dragonDamage: 'DANO DO DRAGÃO', attackSpeed: 'VEL. ATAQUE',
  // EVO: builds
  critMult: 'DANO CRÍTICO', postureDamage: 'DANO DE POSTURA', breakDamage: 'DANO EM QUEBRADO', perfectDodgeMs: 'ESQUIVA PERFEITA'
};
/** Bloco 7: "DANO +20%" / "DANO RECEBIDO −15%" / "REGEN. NEXA +1,5/s" de um poder da arena (por pilha). */
export function arenaPowerDeltas(def, stacks = 1) {
  return (def?.efeitos || []).map((e) => {
    const v = e.valor * stacks;
    const sign = v >= 0 ? '+' : '−';
    const abs = Math.abs(v);
    const txt = e.tipo === 'add' && e.stat === 'nexaRegen'
      ? `${sign}${String(Math.round(abs * 10) / 10).replace('.', ',')}/s`
      : `${sign}${Math.round(abs * 1000) / 10}%`;
    return { label: STAT_LABEL[e.stat] || e.stat.toUpperCase(), text: txt };
  });
}
/** "DANO +8%" a partir dos efeitos reais da passiva (mesmos números do modifiers). */
export function passiveDeltas(def) {
  return (def?.efeitos || []).map((e) => {
    const label = STAT_LABEL[e.stat] || e.stat.toUpperCase();
    const sign = e.valor >= 0 ? '+' : '−';
    const abs = Math.abs(e.valor);
    // EVO: unidades reais (ms / por segundo); valores percentuais iguais aos de antes
    if (e.stat === 'perfectDodgeMs') return { label, text: `${sign}${Math.round(abs)} ms` };
    if (e.tipo === 'add' && (e.stat === 'hpRegen' || e.stat === 'nexaRegen')) return { label, text: `${sign}${String(Math.round(abs * 10) / 10).replace('.', ',')}/s` };
    const pct = Math.round(abs * 1000) / 10;
    return { label, text: `${sign}${pct}%` };
  });
}
function rarityView(d) {
  const r = getRarity(d.raridade) || {};
  return { nome: r.nome || d.raridade, cls: r.classe || d.raridade, cor: r.cor || '#3ecfbf' };
}

/** EVO: etiqueta de BUILD da carta + progresso da sinergia (2/3 da mesma direção). */
function buildTag(d, opts) {
  const b = buildOfPassive(d.id);
  const bc = b && getConfig().progression?.builds?.[b];
  if (!bc) return '';
  const have = typeof opts.buildCount === 'function' ? opts.buildCount(b) : 0;
  const owned = typeof opts.owned === 'function' && opts.owned(d.id);
  const next = owned ? have : have + 1;
  const syn = next >= 3 ? 'SINERGIA 3' : next >= 2 ? 'SINERGIA 2' : `${next}/2 p/ sinergia`;
  return `<span class="po-build" data-build="${b}" style="--po-build:${bc.cor}">BUILD ${bc.nome} · ${syn}</span>`;
}

export function createPassiveUi() {
  let root = null;
  let notice = null;
  let open = false;
  let locked = false;
  let onPick = null;
  let onClosed = null;
  let noticeTimer = 0;
  let closeTimer = 0;
  let picks = 0;
  /** Bloco 7: 'passiva' (evolução) | 'arena' (poder temporário da tentativa). */
  let mode = 'passiva';

  function host() {
    return document.getElementById('canvas-wrap') || document.getElementById('game-screen') || document.body;
  }

  function ensure() {
    if (root && root.isConnected) return;
    root = document.createElement('div');
    root.id = 'passive-overlay';
    root.className = 'passive-overlay hidden';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.innerHTML = `
      <div class="po-panel">
        <div class="po-head">
          <h2 class="po-title">NOVA EVOLUÇÃO</h2>
          <span class="po-kicker">ESCOLHA SUA PASSIVA</span>
          <span class="po-level"><i>«</i> NÍVEL <b id="po-level">?</b> <i>»</i></span>
          <span class="po-sub" id="po-sub">Toque em uma carta. O combate está pausado.</span>
        </div>
        <div class="po-cards" id="po-cards"></div>
        <div class="po-confirm hidden" id="po-confirm"></div>
      </div>`;
    host().appendChild(root);
    const cards = root.querySelector('#po-cards');
    cards.addEventListener('pointerup', onCardUp);
    root.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
    root.addEventListener('touchstart', (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
    root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  function ensureNotice() {
    if (notice && notice.isConnected) return;
    notice = document.createElement('div');
    notice.id = 'passive-notice';
    notice.className = 'passive-notice hidden';
    notice.innerHTML = '<span class="pn-ico">✦</span><span class="pn-txt"><b>NOVA PASSIVA DISPONÍVEL</b><small>Escolha sua passiva!</small></span>';
    host().appendChild(notice);
  }

  function onCardUp(e) {
    const card = e.target.closest?.('.po-card');
    if (!card || !open) return;
    e.preventDefault();
    e.stopPropagation();
    if (locked) return; // segunda escolha ignorada
    locked = true;
    const id = card.dataset.id;
    const def = onPick ? onPick(id) : null;
    if (!def) { locked = false; return; }
    picks++;
    root.querySelectorAll('.po-card').forEach((c) => {
      c.classList.toggle('po-chosen', c === card);
      c.classList.toggle('po-dim', c !== card);
      c.setAttribute('aria-disabled', 'true');
    });
    const conf = root.querySelector('#po-confirm');
    const rv = rarityView(def);
    const arena = mode === 'arena';
    const deltas = arena ? arenaPowerDeltas(def, 1) : passiveDeltas(def);
    conf.style.setProperty('--po-color', rv.cor);
    conf.innerHTML = `<span class="pc-emblem">${icon(arena ? def.icone || def.id : def.id)}</span>
      <span class="pc-txt"><span class="pc-name">${def.nome}</span><b>${arena ? 'PODER ADQUIRIDO!' : 'PASSIVA ADQUIRIDA!'}</b></span>
      <span class="pc-deltas">${deltas.map((x) => `<span class="pc-delta">${x.label} <em>${x.text}</em> ▲</span>`).join('')}</span>`;
    conf.classList.remove('hidden');
    root.querySelector('#po-sub').textContent = arena ? `${def.resumo} Só nesta tentativa.` : effectText(def);
    if (arena) { lastAcquired = null; clearTimeout(closeTimer); closeTimer = setTimeout(close, getConfig().passives.confirmMs); return; }
    lastAcquired = def;
    clearTimeout(closeTimer);
    closeTimer = setTimeout(close, getConfig().passives.confirmMs);
  }

  /**
   * @param {object[]} defs passivas oferecidas
   * @param {{ level:number, onPick:(id)=>object|null, onClosed:()=>void }} opts
   */
  function show(defs, opts) {
    ensure();
    // o host pode ter mudado (tela de jogo recriada)
    if (root.parentElement !== host()) host().appendChild(root);
    onPick = opts.onPick;
    onClosed = opts.onClosed;
    locked = false;
    open = true;
    mode = opts.mode === 'arena' ? 'arena' : 'passiva';
    const arena = mode === 'arena';
    root.classList.toggle('po-arena', arena);
    root.querySelector('.po-title').textContent = arena ? 'PODER DA ARENA' : 'NOVA EVOLUÇÃO';
    root.querySelector('.po-kicker').textContent = arena ? 'ESCOLHA 1 PODER TEMPORÁRIO' : 'ESCOLHA SUA PASSIVA';
    root.querySelector('.po-level').innerHTML = arena
      ? `<i>«</i> TENTATIVA <b id="po-level">${opts.level ?? '?'}</b> <i>»</i>`
      : `<i>«</i> NÍVEL <b id="po-level">${opts.level ?? '?'}</b> <i>»</i>`;
    root.querySelector('#po-sub').textContent = arena
      ? 'Vale só até o fim desta tentativa (morte ou vitória zera). Combate pausado.'
      : 'Toque em uma carta. O combate está pausado.';
    root.querySelector('#po-confirm').classList.add('hidden');
    const cards = root.querySelector('#po-cards');
    cards.innerHTML = '';
    if (arena) {
      for (const d of defs) {
        const rv = rarityView(d);
        const have = typeof opts.stacks === 'function' ? opts.stacks(d.id) : 0;
        const el = document.createElement('button');
        el.type = 'button';
        el.className = `po-card po-arena-card po-r-${d.raridade} po-rarity-${rv.cls}`;
        el.dataset.id = d.id;
        el.dataset.rarity = rv.cls;
        el.style.setProperty('--po-color', rv.cor);
        el.innerHTML = `<span class="po-emblem">${icon(d.icone || d.id)}</span>
          <span class="po-name">${d.nome}</span>
          <span class="po-tags"><span class="po-cat">PODER TEMPORÁRIO</span><span class="po-rar">${rv.nome}</span></span>
          <span class="po-desc">${d.resumo}</span>
          <span class="po-effect"><small>EFEITO:</small> ${arenaPowerDeltas(d, 1).map((x) => `${x.label} ${x.text}`).join(' · ')}<small class="po-base">PILHAS: ${have}/${d.maxStacks} → ${have + 1}/${d.maxStacks}</small></span>
          <span class="po-choose" role="presentation">ESCOLHER</span>`;
        cards.appendChild(el);
      }
      root.classList.remove('hidden');
      return;
    }
    for (const d of defs) {
      const rv = rarityView(d);
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `po-card po-r-${d.raridade} po-rarity-${rv.cls}`;
      el.dataset.id = d.id;
      el.dataset.rarity = rv.cls;
      el.style.setProperty('--po-color', rv.cor);
      el.style.setProperty('--po-sig', SIG_HEX[d.id] || rv.cor);
      el.dataset.build = (buildOfPassive?.(d.id) || d.build || '').toString().toLowerCase();
      el.innerHTML = `<span class="po-art" aria-hidden="true">${icon(d.id)}</span><span class="po-emblem">${icon(d.id)}</span>
        <span class="po-name">${d.nome}</span>
        <span class="po-tags"><span class="po-cat">${d.categoria || 'PASSIVA'}</span><span class="po-rar">${rv.nome}</span>${buildTag(d, opts)}</span>
        <span class="po-desc">${d.resumo || d.descricao}</span>
        <span class="po-effect"><small>EFEITO:</small> ${effectText(d)}<small class="po-base">BASE: ${passiveDeltas(d).map((x) => `${x.label} ${x.text}`).join(' · ')}</small></span>
        <span class="po-choose" role="presentation">ESCOLHER</span>`;
      cards.appendChild(el);
    }
    root.classList.remove('hidden');
  }

  function close() {
    clearTimeout(closeTimer);
    if (!root) return;
    root.classList.add('hidden');
    const was = open;
    open = false;
    locked = false;
    if (was && lastAcquired) showAcquired(lastAcquired);
    lastAcquired = null;
    if (was) onClosed?.();
  }

  /** Toast no HUD após fechar: "PASSIVA ADQUIRIDA!  DANO +8%" (canto superior direito, não cobre o centro). */
  let acquired = null;
  let acquiredTimer = 0;
  let lastAcquired = null;
  function showAcquired(def) {
    if (!acquired || !acquired.isConnected) {
      acquired = document.createElement('div');
      acquired.id = 'passive-acquired';
      acquired.className = 'passive-acquired hidden';
      host().appendChild(acquired);
    }
    const rv = rarityView(def);
    acquired.style.setProperty('--po-color', rv.cor);
    acquired.innerHTML = `<b>PASSIVA ADQUIRIDA!</b>${passiveDeltas(def).map((x) => `<span>${x.label} <em>${x.text}</em></span>`).join('')}`;
    acquired.classList.remove('hidden');
    clearTimeout(acquiredTimer);
    acquiredTimer = setTimeout(() => acquired.classList.add('hidden'), getConfig().passives.noticeMs);
  }

  /** Painel "PASSIVAS ATIVAS" (aberto pelo menu ☰). owned = definições das passivas obtidas. */
  let listPanel = null;
  function showActive(owned) {
    if (!listPanel || !listPanel.isConnected) {
      listPanel = document.createElement('div');
      listPanel.id = 'passives-panel';
      listPanel.className = 'passives-panel hidden';
      listPanel.setAttribute('role', 'dialog');
      host().appendChild(listPanel);
      listPanel.addEventListener('pointerup', (e) => { if (e.target.closest('.pp-close') || e.target === listPanel) listPanel.classList.add('hidden'); });
      listPanel.addEventListener('pointerdown', (e) => e.stopPropagation());
    }
    const rows = owned.length ? owned.map((d) => {
      const rv = rarityView(d);
      return `<div class="pp-row po-rarity-${rv.cls}" style="--po-color:${rv.cor}"><span class="pp-ico">${icon(d.id)}</span><span class="pp-txt"><b>${d.nome}</b><small>${effectText(d)}</small><small>BASE: ${passiveDeltas(d).map((x) => `${x.label} ${x.text}`).join(' · ')}</small></span><span class="pp-rar">${rv.nome}</span></div>`;
    }).join('') : '<div class="pp-empty">Nenhuma passiva ainda — suba de nível para escolher.</div>';
    listPanel.innerHTML = `<div class="pp-box"><div class="pp-head"><span class="pp-hico">${icon('passivas')}</span><b>PASSIVAS ATIVAS</b><button type="button" class="pp-close" aria-label="Fechar">✕</button></div>${rows}</div>`;
    listPanel.classList.remove('hidden');
  }

  function showNotice() {
    ensureNotice();
    if (notice.parentElement !== host()) host().appendChild(notice);
    notice.classList.remove('hidden');
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => notice.classList.add('hidden'), getConfig().passives.noticeMs);
  }

  /** Banner curto (ex.: evolução do dragão). */
  let banner = null;
  let bannerTimer = 0;
  function showBanner(html, ms = 3200) {
    if (!banner || !banner.isConnected) {
      banner = document.createElement('div');
      banner.id = 'game-banner';
      banner.className = 'game-banner hidden';
      host().appendChild(banner);
    }
    banner.innerHTML = html;
    banner.classList.remove('hidden');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => banner.classList.add('hidden'), ms);
  }

  return {
    show,
    close,
    showNotice,
    showBanner,
    showActive,
    showAcquired,
    isOpen: () => open,
    getMode: () => mode,
    isLocked: () => locked,
    getPicks: () => picks,
    /** e2e: ids das cartas visíveis. */
    getCards: () => (root ? [...root.querySelectorAll('.po-card')].map((c) => c.dataset.id) : [])
  };
}
