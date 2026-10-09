/**
 * NEXARA — Bloco 7: TENTATIVA DA ARENA contra o GIGANTE VERDE (arenaRun).
 *
 * Camada TEMPORÁRIA separada do save:
 *  - poderes da arena = modificadores do sistema real (modifiers.addModifier), um por poder,
 *    cuja função lê a pilha atual; removidos (remover()) ao fim de cada tentativa e ao sair
 *    da Arena → os números voltam EXATAMENTE aos permanentes;
 *  - o objeto arenaRun vive só neste módulo (nunca em state/save — serialize é lista branca);
 *  - HP do chefe = HP MÁXIMO REAL do herói no início da tentativa (nível + passivas permanentes,
 *    SEM poderes temporários) × arenaBoss.hpMultiplierOfHero (mín. hpMultiplierMin = 101).
 *  - Morte → tentativa encerrada, tudo temporário zerado, chefe e herói restaurados.
 *  - Vitória → XP + loot do data (monsters.json / loot_table) pelas funções reais (addXp,
 *    rollLoot, addToInventory) no personagem PERMANENTE + stats.arenaBossWins++ → saveToLocal;
 *    depois reset e nova tentativa.
 */
import { getConfig } from './gameplay-config.js?v=20261009fast2';
import { addModifier, getStat, listModifiers, STATS } from './modifiers.js?v=20261009fast2';
import { addXp, pushLog } from './state.js?v=20261009fast2';
import { rollLoot, addToInventory } from '../../rules/loot.js?v=20261009fast2';
import { reveal } from './arquivo.js?v=20261009fast2';

/** Estatísticas medidas para a checagem "sem bônus sobrando" (valores exatos). */
const SNAP_STATS = [
  ['damage', STATS.DAMAGE, 100], ['damageTaken', STATS.DAMAGE_TAKEN, 1], ['moveSpeed', STATS.MOVE_SPEED, 3],
  ['critChance', STATS.CRIT_CHANCE, 0.05], ['specialCooldown', STATS.SPECIAL_COOLDOWN, 1],
  ['nexaRegen', STATS.NEXA_REGEN, 1], ['dragonDamage', STATS.DRAGON_DAMAGE, 1],
  ['maxHp', STATS.MAX_HP, 100], ['attackSpeed', STATS.ATTACK_SPEED, 1]
];

/**
 * @param {{
 *   getData: () => object,
 *   buildAttemptState: () => { state: object, source: string },
 *   getPermanent: () => { state: object|null, persist: (s: object) => void, source: string },
 *   applyDerived: (state: object) => void,
 *   onAttemptStart?: (info: object) => void,
 *   onEnd?: (kind: string, info: object) => void
 * }} deps
 */
export function createArenaRun(deps) {
  /** Estado TEMPORÁRIO (nunca serializado). */
  const run = {
    active: false,
    attempt: 0,
    source: 'testador',
    bossUid: 0,
    heroHpMaxUsed: 0,
    multiplier: 0,
    bossHpMax: 0,
    powers: {},
    thresholdsHit: [],
    pendingOffers: 0,
    pendingEnd: null,
    offerCount: 0,
    wins: 0,
    deaths: 0,
    startedAt: 0,
    baseline: null,
    lastEnd: null,
    history: []
  };
  /** Removedores dos modificadores instalados (fora do objeto run para não vazar em JSON). */
  const removers = new Map();
  let stateRef = null;

  const cfg = () => getConfig().arenaBoss;
  const data = () => deps.getData();
  const powersData = () => data().arena_powers || { regras: {}, poderes: [] };
  const powerDef = (id) => powersData().poderes.find((p) => p.id === id) || null;

  function effectiveMultiplier() {
    const bm = bossMon(); if (bm && bm.hpMult > 0) return bm.hpMult; // ARENA PRINCIPAL: dragão com HP próprio (arena_br.dragao.hpMult); Arena de teste/Campo seguem a fórmula 101×
    const c = cfg();
    const min = Math.max(101, Number(c.hpMultiplierMin) || 101);
    return Math.max(min, Number(c.hpMultiplierOfHero) || min);
  }

  function bossMon(state = stateRef) {
    if (!state) return null;
    return state.monstersAlive.find((m) => m.boss && m.uid === cfg().uid) || null;
  }

  function snapshotStats() {
    const out = {};
    for (const [k, stat, base] of SNAP_STATS) {
      try { out[k] = +getStat(stat, base).toFixed(6); } catch { out[k] = null; }
    }
    const mods = listModifiers();
    out.modifierCounts = {};
    for (const [k, v] of Object.entries(mods || {})) { const n = Array.isArray(v) ? v.length : Number(v) || 0; if (n > 0) out.modifierCounts[k] = n; }
    // poderes temporários ainda instalados (os demais modificadores são ganchos permanentes das passivas/sinergias,
    // registrados sob demanda e NEUTROS quando o total é 0 — por isso a contagem global cresce sem mudar valores)
    out.powerModifiers = removers.size;
    out.powerStacks = Object.values(run.powers || {}).reduce((a, n) => a + (Number(n) || 0), 0);
    if (stateRef) out.hpMax = stateRef.player.hpMax;
    return out;
  }

  function clearPowers() {
    for (const rm of removers.values()) { try { rm(); } catch { /* já removido */ } }
    removers.clear();
    const hadVigor = (run.powers.arena_vigor || 0) > 0;
    run.powers = {};
    if (stateRef) {
      deps.applyDerived(stateRef);
      if (hadVigor) stateRef.player.hp = Math.min(stateRef.player.hp, stateRef.player.hpMax);
    }
  }

  /** Instala 1 modificador por poder; a função lê a pilha atual (0 → neutro). */
  function installPower(def) {
    if (removers.has(def.id)) return;
    const rms = [];
    for (const e of def.efeitos || []) {
      const valor = Number(e.valor) || 0;
      const fn = e.tipo === 'add'
        ? (v) => v + valor * (run.powers[def.id] || 0)
        : (v) => v * (1 + valor * (run.powers[def.id] || 0));
      rms.push(addModifier(e.stat, fn));
    }
    removers.set(def.id, () => { for (const r of rms) r(); });
  }

  /** Novo começo de tentativa: estado novo do personagem permanente + chefe com HP da fórmula. */
  function startAttempt(state, reason = 'start') {
    clearPowers();
    stateRef = state;
    run.active = true;
    run.attempt++;
    run.thresholdsHit = [];
    run.pendingOffers = 0;
    run.pendingEnd = null;
    run.offerCount = 0;
    run.startedAt = performance.now();
    const c = cfg();
    const mon = bossMon(state);
    // HP do herói usado: HP máximo REAL agora (nível + passivas permanentes; sem poderes — acabaram de ser removidos)
    deps.applyDerived(state);
    run.heroHpMaxUsed = state.player.hpMax;
    run.multiplier = effectiveMultiplier();
    run.bossHpMax = Math.round(run.heroHpMaxUsed * run.multiplier);
    if (mon) {
      mon.hp = mon.hpMax = run.bossHpMax;
      mon.alive = true;
      run.bossUid = mon.uid;
    }
    state.player.hp = state.player.hpMax;
    state.player.nexa = state.player.nexaMax;
    run.baseline = snapshotStats();
    run.history.push({ attempt: run.attempt, reason, heroHpMax: run.heroHpMaxUsed, bossHp: run.bossHpMax, at: Math.round(performance.now()) });
    if (run.history.length > 20) run.history.shift();
    pushLog(state, `ARENA — Tentativa ${run.attempt}: GIGANTE VERDE com ${run.bossHpMax} HP (${run.heroHpMaxUsed} × ${run.multiplier}).`, 'sys');
    deps.onAttemptStart?.({ attempt: run.attempt, reason, bossHp: run.bossHpMax });
  }

  /** Limiar de 20% do HP do chefe → 1 escolha de poder (fila). */
  function checkThresholds() {
    const mon = bossMon();
    if (!run.active || !mon || !mon.alive || run.pendingEnd) return;
    const frac = mon.hp / Math.max(1, mon.hpMax);
    const th = powersData().regras?.bossHpThresholds || [0.8, 0.6, 0.4, 0.2];
    for (let i = 0; i < th.length; i++) {
      if (frac <= th[i] && !run.thresholdsHit.includes(i)) {
        run.thresholdsHit.push(i);
        run.pendingOffers++;
      }
    }
  }

  /** Sorteio ponderado sem repetição, só poderes abaixo do máximo de pilhas. */
  function rollOffer(n) {
    const pool = powersData().poderes.filter((p) => (run.powers[p.id] || 0) < (p.maxStacks || 1));
    const out = [];
    const bag = pool.slice();
    while (out.length < n && bag.length) {
      let tot = 0;
      for (const p of bag) tot += Math.max(1, p.peso || 1);
      let x = Math.random() * tot;
      let idx = 0;
      for (; idx < bag.length; idx++) { x -= Math.max(1, bag[idx].peso || 1); if (x <= 0) break; }
      idx = Math.min(idx, bag.length - 1);
      out.push(bag[idx]);
      bag.splice(idx, 1);
    }
    return out;
  }

  function nextOffer() {
    if (!run.active || run.pendingOffers <= 0 || run.pendingEnd) return null;
    const n = powersData().regras?.choices || 3;
    const offer = rollOffer(n);
    if (!offer.length) { run.pendingOffers = 0; return null; }
    return offer;
  }

  /** Aplica 1 pilha do poder (pelo sistema real de modificadores). */
  function pickPower(id) {
    const def = powerDef(id);
    if (!def || !run.active || !stateRef) return null;
    const cur = run.powers[id] || 0;
    if (cur >= (def.maxStacks || 1)) return null;
    run.powers[id] = cur + 1;
    installPower(def);
    if (run.pendingOffers > 0) run.pendingOffers--;
    run.offerCount++;
    if ((def.efeitos || []).some((e) => e.stat === STATS.MAX_HP)) {
      const before = stateRef.player.hpMax;
      deps.applyDerived(stateRef);
      const heal = Math.round(stateRef.player.hpMax * (powersData().regras?.healOnPickFrac || 0));
      stateRef.player.hp = Math.min(stateRef.player.hpMax, stateRef.player.hp + (stateRef.player.hpMax - before) + heal);
    }
    pushLog(stateRef, `Poder da Arena: ${def.nome} (pilha ${run.powers[id]}/${def.maxStacks}).`, 'sys');
    return def;
  }

  /** actions.setPlayerDeathHook: morte na Arena encerra a tentativa (reset no próximo update). */
  function onPlayerDeath(state) {
    if (!run.active || state !== stateRef) return false;
    state.player.hp = 1; // um quadro; reset em update()
    if (!run.pendingEnd) {
      run.pendingEnd = 'death';
      run.deaths++;
    }
    return true;
  }

  /** actions.setBossKillHook: recompensa REAL no personagem permanente. */
  function onBossKilled(state, mon, def) {
    if (state !== stateRef) return { drops: [], xp: 0 };
    // a tentativa acabou: poderes saem ANTES de mexer no permanente (VIGOR não pode inflar o HP salvo)
    clearPowers();
    // SAVE: progresso da corrida (nível/XP/passivas/itens) vai ao permanente ANTES da recompensa do chefe
    try { deps.syncProgress?.(state, 'boss_victory'); } catch (e) { console.warn('[arena-run] sync', e); }
    const perm = deps.getPermanent();
    const drops = rollLoot(def.loot_table);
    let xp = def.xp || 0;
    // EVO: tabela de recompensa extra (data/recompensas.json) — só quem passa deps.extraReward (Campo)
    const extra = deps.extraReward ? deps.extraReward(def) : null;
    if (extra) {
      xp += extra.xp || 0;
      for (const d of extra.drops || []) drops.push(d);
    }
    let persisted = false;
    const target = perm.state;
    if (target) {
      reveal(target.arquivo, 'criaturas', def.id);
      const nivelAntes = target.player.nivel;
      addXp(target, xp);
      for (const d of drops) addToInventory(target.inventory, target._items[d.item_id], d.qty);
      if (!target.stats || typeof target.stats !== 'object') target.stats = {};
      const key = cfg().victoryStatKey || 'arenaBossWins';
      target.stats[key] = (target.stats[key] || 0) + 1;
      pushLog(target, `Arena: GIGANTE VERDE derrotado! +${xp} XP${target.player.nivel > nivelAntes ? ` (nível ${target.player.nivel})` : ''}.`, 'sys');
      try { perm.persist(target); persisted = true; } catch (e) { console.warn('[arena-run] persist', e); }
    }
    // mesmo XP/loot também no estado da tentativa (log e HUD da vitória); a tentativa é descartada no reset
    reveal(state.arquivo, 'criaturas', def.id);
    for (const d of drops) pushLog(state, `Loot: ${state._items[d.item_id]?.name || d.item_id} x${d.qty}`, 'sys');
    run.wins++;
    run.pendingEnd = 'victory';
    run.lastEnd = { kind: 'victory', xp, drops: drops.map((d) => ({ ...d })), persisted, source: perm.source, attempt: run.attempt };
    return { drops, xp };
  }

  /** Um quadro (depois da IA): limiares + fim de tentativa. */
  function update() {
    if (!run.active || !stateRef) return null;
    if (run.pendingEnd) {
      const kind = run.pendingEnd;
      const info = kind === 'victory' ? run.lastEnd : { kind: 'death', attempt: run.attempt };
      if (kind === 'death') run.lastEnd = info;
      resetAttempt(kind);
      deps.onEnd?.(kind, info);
      return kind;
    }
    checkThresholds();
    return null;
  }

  /** Reset completo: remove poderes, recria a tentativa (mesmo objeto state) e começa outra. */
  function resetAttempt(reason) {
    clearPowers();
    const fresh = deps.buildAttemptState();
    const st = stateRef;
    if (st && fresh?.state) {
      for (const k of Object.keys(st)) delete st[k];
      Object.assign(st, fresh.state);
      run.source = fresh.source;
    }
    startAttempt(st, reason);
  }

  /**
   * EVO (Campo de Ascensão): HP do chefe recalculado com o HP máximo ATUAL do herói (o herói sobe
   * de nível nas ondas) — SEM poderes temporários (zerados só para a medida e restaurados).
   */
  function armBoss() {
    if (!stateRef) return null;
    const pl = stateRef.player;
    const hp0 = pl.hp;
    const saved = run.powers;
    run.powers = {};
    deps.applyDerived(stateRef);
    const base = pl.hpMax;
    run.powers = saved;
    deps.applyDerived(stateRef);
    pl.hp = Math.min(pl.hpMax, hp0);
    run.heroHpMaxUsed = base;
    run.multiplier = effectiveMultiplier();
    run.bossHpMax = Math.round(base * run.multiplier);
    run.thresholdsHit = [];
    const mon = bossMon();
    if (mon) { mon.hp = mon.hpMax = run.bossHpMax; mon.alive = true; run.bossUid = mon.uid; }
    pushLog(stateRef, `PORTÃO DO DRAGÃO — GIGANTE VERDE com ${run.bossHpMax} HP (${base} × ${run.multiplier}).`, 'sys');
    return { heroHpMax: base, multiplier: run.multiplier, bossHp: run.bossHpMax };
  }
  /** EVO: pilhas atuais (cópia) / volta a um ponto de controle (morte no Campo). Exato: os modificadores leem run.powers. */
  function getPowers() { return { ...run.powers }; }
  /** SAVE: roda fn com as pilhas de poder zeradas (os modificadores leem run.powers → neutros), sem reinstalar nada. */
  function withoutPowers(fn) {
    const saved = run.powers;
    run.powers = {};
    try { return fn(); } finally { run.powers = saved; }
  }
  function restorePowers(snap) {
    const next = {};
    for (const [id, n] of Object.entries(snap || {})) {
      const def = powerDef(id);
      if (!def || !(n > 0)) continue;
      next[id] = Math.min(n, def.maxStacks || 1);
      installPower(def);
    }
    run.powers = next;
    if (stateRef) deps.applyDerived(stateRef);
  }
  function queueOffer(n = 1) { if (run.active) run.pendingOffers += n; return run.pendingOffers; }

  /** Sair da Arena: nada temporário fica no mundo. */
  function exit() {
    clearPowers();
    run.active = false;
    run.pendingOffers = 0;
    run.pendingEnd = null;
    stateRef = null;
  }

  /** Visão (cópia) para HUD/testes. */
  function view() {
    const mon = bossMon();
    return {
      active: run.active, attempt: run.attempt, source: run.source,
      heroHpMaxUsed: run.heroHpMaxUsed, multiplier: run.multiplier, multiplierMin: Math.max(101, cfg().hpMultiplierMin || 101),
      bossHpMax: run.bossHpMax, bossHp: mon ? mon.hp : 0, bossAlive: !!mon?.alive, bossUid: run.bossUid,
      powers: { ...run.powers }, installed: [...removers.keys()], thresholdsHit: run.thresholdsHit.slice(),
      pendingOffers: run.pendingOffers, pendingEnd: run.pendingEnd, offerCount: run.offerCount,
      wins: run.wins, deaths: run.deaths, baseline: run.baseline ? JSON.parse(JSON.stringify(run.baseline)) : null,
      lastEnd: run.lastEnd ? JSON.parse(JSON.stringify(run.lastEnd)) : null, history: run.history.slice()
    };
  }

  return {
    startAttempt, resetAttempt, update, exit, pickPower, nextOffer, rollOffer, powerDef,
    onPlayerDeath, onBossKilled, snapshotStats, view, effectiveMultiplier,
    armBoss, getPowers, restorePowers, queueOffer, clearPowers, withoutPowers,
    isActive: () => run.active,
    hasPendingOffer: () => run.active && run.pendingOffers > 0 && !run.pendingEnd,
    getStateRef: () => stateRef,
    bossMon: () => bossMon(),
    powerStacks: (id) => run.powers[id] || 0,
    /** e2e: força um limiar (sem mexer no HP) */
    debugQueueOffer: (n = 1) => { if (run.active) run.pendingOffers += n; return run.pendingOffers; }
  };
}
