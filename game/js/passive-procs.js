/**
 * NEXARA — Bloco 6: PASSIVAS AUTOMÁTICAS (procs visíveis).
 *
 * Cada passiva de data/passives.json (mesmos 7 ids — saves antigos continuam válidos) ganha um
 * efeito que DISPARA SOZINHO, sem botão: gatilho claro → buff com duração (ícone + contagem no
 * HUD, aura no herói/dragão, texto flutuante). O bônus base pequeno (efeitos do JSON) continua.
 *
 *  furia_cibernetica   3 acertos seguidos            → SUPER FORÇA: +dano por X s (aura vermelha)
 *  impulso_neural      abate ou esquiva              → IMPULSO: +velocidade por X s (rastro azul)
 *  nucleo_reforcado    HP cai abaixo de 30%          → ESCUDO DE ENERGIA absorve dano (recarga interna)
 *  mira_neural         a cada N acertos um crítico garantido; crítico → FOCO NEURAL (+chance)
 *  condutor_de_nexa    acerto                        → FLUXO DE NEXA: +Nexa por acerto e regen extra
 *  cacador_de_monstros marca um inimigo (1º atingido/travado) → dano extra nele (herói e dragão)
 *  nucleo_divino       usar um especial              → MODO DIVINO do dragão (mais dano, mais rápido)
 *
 * Relógio próprio em ms de JOGO (congela com passivas/modal/hit-stop, igual ao combate).
 * Números em gameplay-config.js → passiveProcs. Efeitos via modifiers (getStat), sem atalhos.
 */
import { getConfig } from './gameplay-config.js?v=20261009leve';
import { addModifier, STATS } from './modifiers.js?v=20261009leve';

export const PROC_IDS = Object.freeze([
  'furia_cibernetica', 'impulso_neural', 'nucleo_reforcado', 'mira_neural',
  'condutor_de_nexa', 'cacador_de_monstros', 'nucleo_divino'
]);
/** Buff de HUD/aura por passiva. */
const BUFF_OF = {
  furia_cibernetica: 'furia', impulso_neural: 'impulso', nucleo_reforcado: 'shield', mira_neural: 'foco',
  condutor_de_nexa: 'condutor', cacador_de_monstros: 'mark', nucleo_divino: 'divine'
};

const pct = (v) => `${Math.round(v * 100)}%`;
const sec = (ms) => `${+(ms / 1000).toFixed(1)} s`.replace('.', ',');
/** Texto EFEITO da carta, gerado do config (sempre bate com os números reais). */
export function describeProc(id) {
  const c = getConfig().passiveProcs?.[id];
  if (!c) return '';
  switch (id) {
    case 'furia_cibernetica': return `AUTOMÁTICA: ${c.hitsNeeded} acertos seguidos ativam SUPER FORÇA — +${pct(c.damageBonus)} de dano por ${sec(c.durationMs)} (aura vermelha).`;
    case 'impulso_neural': return `AUTOMÁTICA: abater ou esquivar ativa IMPULSO — +${pct(c.speedBonus)} de velocidade por ${sec(c.durationMs)} (rastro azul).`;
    case 'nucleo_reforcado': return `AUTOMÁTICA: HP abaixo de ${pct(c.hpThreshold)} cria ESCUDO DE ENERGIA que absorve ${pct(c.absorbFrac)} do HP máx. por ${sec(c.durationMs)}. Recarga ${sec(c.cooldownMs)}.`;
    case 'mira_neural': return `AUTOMÁTICA: a cada ${c.guaranteedEveryHits} acertos, CRÍTICO garantido (clarão dourado); crítico ativa FOCO NEURAL +${pct(c.critChanceBonus)} de chance por ${sec(c.durationMs)}.`;
    case 'condutor_de_nexa': return `AUTOMÁTICA: acertos ativam FLUXO DE NEXA — +${c.nexaPerHit} Nexa por acerto e +${String(c.regenPerSec).replace('.', ',')} Nexa/s por ${sec(c.durationMs)} (brilho azul).`;
    case 'cacador_de_monstros': return `AUTOMÁTICA: MARCA o inimigo atingido (ou travado) — ele recebe +${pct(c.damageBonus)} de dano do herói e do dragão.`;
    case 'nucleo_divino': return `AUTOMÁTICA: usar um especial ativa o MODO DIVINO do dragão — dano ×${String(c.dragonDamageMult).replace('.', ',')} e ataques mais rápidos por ${sec(c.durationMs)}. Recarga ${sec(c.cooldownMs)}.`;
    default: return '';
  }
}

/**
 * @param {{
 *   getState: ()=>object|null,
 *   getLockUid?: ()=>number|null,
 *   isMonAlive?: (uid:number)=>boolean,
 *   onProc?: (id:string, info:object)=>void,
 *   onNexa?: ()=>void
 * }} deps
 */
export function createPassiveProcs(deps) {
  let clock = 0;
  const buffs = new Map(); // passiveId → { until, dur, startedAt }
  const cdUntil = Object.create(null);
  const chain = { count: 0, lastAt: -1e9 };
  let miraHits = 0;
  const shield = { left: 0, max: 0 };
  const mark = { uid: null, until: 0, remarkAt: 0 };
  let nexaAcc = 0;
  const events = [];
  const stats = Object.fromEntries(PROC_IDS.map((id) => [id, 0]));
  stats.absorbed = 0;
  stats.forcedCrits = 0;
  stats.nexaGiven = 0;

  const cfgAll = () => getConfig().passiveProcs;
  const cfg = (id) => cfgAll()?.[id];
  function owned(id) {
    const c = cfgAll();
    if (!c || !c.enabled) return false;
    const s = deps.getState();
    const o = s?.passives?.owned;
    return Array.isArray(o) && o.includes(id);
  }
  const active = (id) => { const b = buffs.get(id); return !!b && b.until > clock; };
  function log(type, extra) {
    if (events.length >= 200) events.shift();
    events.push({ t: Math.round(clock), type, ...(extra || {}) });
  }
  function activate(id, info = {}) {
    const c = cfg(id);
    const dur = info.durationMs ?? c.durationMs;
    const refreshing = active(id);
    buffs.set(id, { until: clock + dur, dur, startedAt: refreshing ? buffs.get(id).startedAt : clock });
    if (c.cooldownMs > 0) cdUntil[id] = clock + dur + c.cooldownMs; // recarga conta depois do efeito
    if (!refreshing) {
      stats[id]++;
      log('proc', { id, ...info });
      deps.onProc?.(id, { label: c.nome, color: c.color, ...info });
    }
  }
  const ready = (id) => (cdUntil[id] ?? 0) <= clock && !active(id);

  // —— modificadores (instalados uma vez; neutros sem a passiva / sem o buff) ——
  addModifier(STATS.DAMAGE, (v, ctx) => {
    let m = 1;
    if (active('furia_cibernetica')) m += cfg('furia_cibernetica').damageBonus;
    if (ctx?.mon && mark.uid != null && ctx.mon.uid === mark.uid && owned('cacador_de_monstros')) m += cfg('cacador_de_monstros').damageBonus;
    return m === 1 ? v : v * m;
  });
  addModifier(STATS.MOVE_SPEED, (v) => (active('impulso_neural') ? v * (1 + cfg('impulso_neural').speedBonus) : v));
  addModifier(STATS.CRIT_CHANCE, (v, ctx) => {
    if (!owned('mira_neural')) return v;
    const c = cfg('mira_neural');
    // só nos golpes do herói (ctx.mon): o N-ésimo acerto sem crítico vira crítico
    if (ctx?.mon && c.guaranteedEveryHits > 0 && miraHits >= c.guaranteedEveryHits - 1) return 1;
    return active('mira_neural') ? v + c.critChanceBonus : v;
  });

  /** Golpe/especial do herói acertou (res = applyPlayerHit). */
  function onHeroHit(mon, res) {
    if (!mon || !res) return;
    // Fúria: acertos seguidos (no máx. 1 por 80 ms: um giro em 3 inimigos conta como 1)
    if (owned('furia_cibernetica')) {
      const c = cfg('furia_cibernetica');
      if (clock - chain.lastAt > 80) {
        chain.count = clock - chain.lastAt <= c.chainWindowMs ? chain.count + 1 : 1;
        chain.lastAt = clock;
        if (chain.count >= c.hitsNeeded && ready('furia_cibernetica')) { activate('furia_cibernetica', { hits: chain.count }); chain.count = 0; }
      }
    }
    // Mira: contador para o crítico garantido; crítico → FOCO
    if (owned('mira_neural')) {
      const c = cfg('mira_neural');
      if (res.crit) {
        if (miraHits >= c.guaranteedEveryHits - 1) stats.forcedCrits++;
        miraHits = 0;
        log('crit', { uid: mon.uid, dmg: res.dmgOut });
        if (active('mira_neural')) buffs.get('mira_neural').until = clock + c.durationMs;
        else activate('mira_neural', { crit: true, uid: mon.uid });
      } else miraHits++;
    }
    // Condutor: +Nexa por acerto e FLUXO (renova a cada acerto)
    if (owned('condutor_de_nexa')) {
      const c = cfg('condutor_de_nexa');
      const s = deps.getState();
      if (s && c.nexaPerHit > 0 && s.player.nexa < s.player.nexaMax) {
        const before = s.player.nexa;
        s.player.nexa = Math.min(s.player.nexaMax, s.player.nexa + c.nexaPerHit);
        stats.nexaGiven += s.player.nexa - before;
        deps.onNexa?.();
      }
      activate('condutor_de_nexa');
    }
    // Caçador: marca o inimigo atingido (se não houver marca viva); acertar a marca renova
    if (owned('cacador_de_monstros')) {
      const c = cfg('cacador_de_monstros');
      if (mark.uid === mon.uid) mark.until = clock + c.markDurationMs;
      else if ((mark.uid == null || !alive(mark.uid)) && clock >= mark.remarkAt && mon.alive) setMark(mon.uid);
    }
    if (res.killed) onKill(mon);
  }
  function alive(uid) { return deps.isMonAlive ? deps.isMonAlive(uid) : true; }
  function setMark(uid) {
    const c = cfg('cacador_de_monstros');
    mark.uid = uid;
    mark.until = clock + c.markDurationMs;
    buffs.set('cacador_de_monstros', { until: mark.until, dur: c.markDurationMs, startedAt: clock });
    stats.cacador_de_monstros++;
    log('proc', { id: 'cacador_de_monstros', uid });
    deps.onProc?.('cacador_de_monstros', { label: c.nome, color: c.color, uid });
  }
  function clearMark(why) {
    if (mark.uid == null) return;
    log('mark_end', { uid: mark.uid, why });
    mark.uid = null;
    buffs.delete('cacador_de_monstros');
    mark.remarkAt = clock + cfg('cacador_de_monstros').remarkDelayMs;
  }
  /** Abate (herói ou dragão). */
  function onKill(mon) {
    if (mon && mark.uid === mon.uid) clearMark('abatido');
    if (owned('impulso_neural') && cfg('impulso_neural').onKill && (cdUntil.impulso_neural ?? 0) <= clock) {
      if (active('impulso_neural')) buffs.get('impulso_neural').until = clock + cfg('impulso_neural').durationMs;
      else activate('impulso_neural', { from: 'abate' });
    }
  }
  function onDodge() {
    if (!owned('impulso_neural') || !cfg('impulso_neural').onDodge) return;
    if (active('impulso_neural')) { buffs.get('impulso_neural').until = clock + cfg('impulso_neural').durationMs; return; }
    if ((cdUntil.impulso_neural ?? 0) <= clock) activate('impulso_neural', { from: 'esquiva' });
  }
  /** Herói tomou dano (quebra a sequência da Fúria). */
  function onHeroDamaged(dmg) {
    if (dmg > 0) chain.count = 0;
  }
  /**
   * Antes do dano entrar (actions.monsterAttackPlayer): Núcleo Reforçado liga o escudo quando o
   * golpe deixaria o HP abaixo do limite, e o escudo absorve. Retorna o dano absorvido.
   */
  function absorb(state, dmg) {
    if (!state || !(dmg > 0) || !owned('nucleo_reforcado')) return 0;
    const c = cfg('nucleo_reforcado');
    const p = state.player;
    if (!active('nucleo_reforcado') && ready('nucleo_reforcado') && (p.hp - dmg) / p.hpMax < c.hpThreshold) {
      shield.max = shield.left = Math.max(c.absorbMin, Math.round(p.hpMax * c.absorbFrac));
      activate('nucleo_reforcado', { absorb: shield.max });
    }
    if (!active('nucleo_reforcado') || shield.left <= 0) return 0;
    const a = Math.min(shield.left, dmg);
    shield.left -= a;
    stats.absorbed += a;
    log('absorb', { amount: a, left: shield.left });
    if (shield.left <= 0) { buffs.get('nucleo_reforcado').until = clock + 250; log('shield_break', {}); }
    return a;
  }
  /** Especial usado → Núcleo Divino. */
  function onSpecial(id) {
    if (!owned('nucleo_divino') || !ready('nucleo_divino')) return;
    activate('nucleo_divino', { special: id });
  }
  /** Dano do dragão: MODO DIVINO × marca do caçador. */
  function dragonDamageMult(mon) {
    let m = 1;
    if (active('nucleo_divino')) m *= cfg('nucleo_divino').dragonDamageMult;
    if (mon && mark.uid === mon.uid && owned('cacador_de_monstros')) m *= 1 + cfg('cacador_de_monstros').damageBonus;
    return m;
  }
  const dragonCooldownMult = () => (active('nucleo_divino') ? cfg('nucleo_divino').dragonCooldownMult : 1);

  /** @param {number} dtMs ms de jogo */
  function update(dtMs, state) {
    if (!(dtMs > 0)) return;
    clock += dtMs;
    for (const [id, b] of buffs) {
      if (b.until <= clock) {
        buffs.delete(id);
        log('end', { id });
        if (id === 'nucleo_reforcado') shield.left = 0;
        if (id === 'cacador_de_monstros' && mark.uid != null) { mark.uid = null; mark.remarkAt = clock + cfg(id).remarkDelayMs; }
      }
    }
    if (mark.uid != null && !alive(mark.uid)) clearMark('sumiu');
    // Caçador: sem marca → marca o alvo travado
    if (mark.uid == null && owned('cacador_de_monstros') && clock >= mark.remarkAt) {
      const lu = deps.getLockUid?.();
      if (lu != null && alive(lu)) setMark(lu);
    }
    if (mark.uid != null) { const b = buffs.get('cacador_de_monstros'); if (b) b.until = mark.until; }
    // Condutor: regen extra enquanto o FLUXO estiver ativo
    if (state && active('condutor_de_nexa')) {
      const c = cfg('condutor_de_nexa');
      if (c.regenPerSec > 0 && state.player.nexa < state.player.nexaMax) {
        nexaAcc += (c.regenPerSec * dtMs) / 1000;
        if (nexaAcc >= 1) {
          const whole = Math.floor(nexaAcc);
          nexaAcc -= whole;
          state.player.nexa = Math.min(state.player.nexaMax, state.player.nexa + whole);
          stats.nexaGiven += whole;
          deps.onNexa?.();
        }
      }
    } else nexaAcc = 0;
  }

  /** Buffs para o HUD: [{ id, buff, label, color, leftMs, frac }] (ordem estável). */
  function getBuffs() {
    const out = [];
    for (const id of PROC_IDS) {
      const b = buffs.get(id);
      if (!b || b.until <= clock) continue;
      const c = cfg(id);
      const left = b.until - clock;
      out.push({ id, buff: BUFF_OF[id], label: c.nome, color: c.color, leftMs: Math.round(left), frac: Math.max(0, Math.min(1, left / b.dur)), extra: id === 'nucleo_reforcado' ? shield.left : null });
    }
    return out;
  }
  const view = { furia: 0, impulso: 0, shield: 0, foco: 0, condutor: 0, divine: 0, mark: 0, markUid: null };
  /** Estado das auras (renderer). */
  function getView() {
    for (const id of PROC_IDS) {
      const b = buffs.get(id);
      view[BUFF_OF[id]] = b && b.until > clock ? Math.max(0.001, (b.until - clock) / b.dur) : 0;
    }
    view.markUid = mark.uid;
    return view;
  }
  function reset() {
    buffs.clear();
    for (const k of Object.keys(cdUntil)) delete cdUntil[k];
    chain.count = 0;
    chain.lastAt = -1e9;
    miraHits = 0;
    shield.left = shield.max = 0;
    mark.uid = null;
    mark.remarkAt = 0;
    nexaAcc = 0;
  }
  function getDebug() {
    return {
      clock: Math.round(clock), owned: PROC_IDS.filter(owned), buffs: getBuffs(),
      cooldowns: Object.fromEntries(PROC_IDS.map((id) => [id, Math.max(0, Math.round((cdUntil[id] ?? 0) - clock))])),
      chain: chain.count, miraHits, shield: { ...shield }, mark: { uid: mark.uid, leftMs: mark.uid != null ? Math.round(mark.until - clock) : 0 },
      stats: { ...stats }
    };
  }
  return {
    onHeroHit, onKill, onDodge, onHeroDamaged, absorb, onSpecial, update, reset,
    dragonDamageMult, dragonCooldownMult, isActive: active, isDivine: () => active('nucleo_divino'),
    getBuffs, getView, getDebug, getEvents: () => events.slice(), clearEvents: () => { events.length = 0; },
    describe: describeProc,
    /** Debug/captura: ativa o buff de um proc (escudo do Núcleo Reforçado nasce cheio). */
    debugActivate: (id) => {
      if (!PROC_IDS.includes(id)) return false;
      activate(id, { debug: true });
      if (id === 'nucleo_reforcado') { const c = cfg(id); shield.max = shield.left = Math.max(c.absorbMin || 20, 30); }
      return true;
    }
  };
}
