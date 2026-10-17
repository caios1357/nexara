/**
 * NEXARA — MONTARIA DE DRAGÃO (voo) · lógica pura (sem Three.js, sem DOM). Desenho: docs/ESTUDO-VOAR-DRAGAO.md (seções 4 e 5).
 *
 * ESTÁGIO V1 (base invisível): só POSSE da sela — quem MATA o Gigante (o único dragão montável do mapa) ganha o direito de montar.
 *   · Jogador dá o golpe final → sela na partida (br.mount.sela) + desbloqueio permanente em localStorage 'nexara.montaria.v1'
 *     (chave separada, whitelist, NUNCA toca no save principal nem em flags de quest; nada de C2/D3/B1/A0/F5).
 *   · Rival dá o golpe final (hoje rivais ignoram chefes, mas a regra existe): a sela SOME; ninguém voa; o abate é só registrado.
 *   · mount.active é SEMPRE false em V1 (o voo vem nos estágios V2+): com `mount.enabled=false` o jogo é idêntico ao anterior.
 * O companheiro (filhote do Berço) continua NÃO jogável e não tem relação com a montaria.
 */
export const MOUNT_KEY = 'nexara.montaria.v1';

/** desbloqueio permanente (whitelist: só `domado:boolean`; corrompido/ausente → false, nunca apaga nada) */
export function loadTamed() {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(MOUNT_KEY) : null;
    const o = raw ? JSON.parse(raw) : null;
    return !!(o && typeof o === 'object' && o.domado === true);
  } catch { return false; }
}
const HEX = /^#[0-9a-fA-F]{6}$/;
const cleanPal = (p) => (p && typeof p === 'object' && HEX.test(p.base) && HEX.test(p.escuro) && HEX.test(p.brilho) ? { base: p.base, escuro: p.escuro, brilho: p.brilho } : null);
/** paleta do último Gigante domado (whitelist: 3 cores #rrggbb; qualquer outra coisa → null = Gigante verde) */
export function loadPal() {
  try { const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(MOUNT_KEY) : null; const o = raw ? JSON.parse(raw) : null; return o && o.domado === true ? cleanPal(o.pal) : null; } catch { return null; }
}
export function saveTamed(v, pal = null) {
  try { localStorage.setItem(MOUNT_KEY, JSON.stringify({ v: 1, domado: !!v, pal: cleanPal(pal) })); return true; } catch { return false; }
}

/**
 * @param {{ cfg: () => object, br: () => object|null, note: (kind: string, info?: object) => void,
 *           combatBusy?: () => boolean, playerAlive?: () => boolean }} ctx
 */
export function createMount(ctx) {
  const C = () => ctx.cfg()?.mount || { enabled: false };
  const on = () => !!C().enabled;
  const flyOn = () => on() && !!C().flyEnabled;
  function ensure(br) {
    if (!br.mount) br.mount = { sela: false, por: null, decidido: false, active: false, at: 0, phase: 'ground', alt: 0, leftMs: 0, cdUntil: 0, calledUsed: false, warned: false, mode: null, clock: 0, lastCombatClock: -1e9 };
    return br.mount;
  }

  /** o Gigante do mapa morreu. `by` = 'player' | nome do rival. Retorna o estado da posse (ou null se desligado). */
  function onGiantKilled(by = 'player', extra = null) {
    const br = ctx.br(); if (!br || !on()) return null;
    const m = ensure(br); if (m.decidido && !(by === 'player' && extra)) return { ...m }; // 20261016: cada gigante elemental abatido pelo herói troca a sela p/ ESSE dragão (cor/elemento)
    m.decidido = true; m.at = br.clock || 0;
    if (by === 'player') { m.sela = true; m.por = 'player'; m.pal = cleanPal(extra?.pal); m.elemento = extra?.elemento || null; if (Number.isFinite(extra?.x) && Number.isFinite(extra?.y)) m.spot = { x: extra.x, y: extra.y }; saveTamed(true, m.pal); ctx.note('saddle_player', {}); }
    else { m.sela = false; m.por = String(by); ctx.note('saddle_lost', { by: m.por }); } // rival abateu: a sela some, ninguém voa
    return { ...m };
  }

  // ── V2: máquina de estados do voo (lógica pura; o visual/câmera/movimento leem o estado) ──
  const stage = (br) => br?.zone?.stage ?? 0;
  const finalState = (br) => !!br.rivalFinal || stage(br) >= 3 || !!br.spectate;
  /** acesso: 'sela' (matou o Gigante nesta partida) · 'chamado' (já domou antes; só a partir do estágio 2, 1 uso, metade do tempo) · null */
  function accessOf(br) {
    const m = ensure(br);
    if (m.sela) return 'sela';
    if (loadTamed() && stage(br) >= 2 && !m.calledUsed) return 'chamado';
    return null;
  }
  function canMount() {
    const br = ctx.br(); if (!br || !flyOn()) return { ok: false, why: 'off' };
    const m = ensure(br);
    if (m.active) return { ok: false, why: 'ja' };
    if (ctx.playerAlive && !ctx.playerAlive()) return { ok: false, why: 'morto' };
    const acc = accessOf(br); if (!acc) return { ok: false, why: 'sem_sela' };
    if (finalState(br)) return { ok: false, why: 'final' };
    if (ctx.inCover?.()) return { ok: false, why: 'abrigo' }; // sob teto/copa: não decola
    if (m.down) { // montaria abatida: renasce no ponto original (covil) depois de `respawnMs`; é preciso ir até lá
      if (m.clock < m.down.respawnAt) return { ok: false, why: 'renascendo', leftMs: Math.round(m.down.respawnAt - m.clock) };
      const w = ctx.where?.(); const sp = m.down.spot; if (sp && w && Math.hypot(w.x - sp.x, w.y - sp.y) > (C().spotR ?? 3.5)) return { ok: false, why: 'longe', spot: sp };
    } else if (m.clock < m.cdUntil) return { ok: false, why: 'recarga', leftMs: m.cdUntil - m.clock };
    if (ctx.combatBusy && ctx.combatBusy()) return { ok: false, why: 'combate' };
    return { ok: true, access: acc };
  }
  function tryMount() {
    const br = ctx.br(); const c = canMount(); if (!c.ok) return c;
    const m = ensure(br); const C0 = C();
    m.active = true; m.phase = 'takeoff'; m.alt = 0; m.mode = c.access; m.warned = false; m.breath = C0.breath?.max ?? 100; m.fireAt = -1e9; m.fireUntil = 0; m.hpMax = Math.max(1, Math.round((C0.hpFracOfHero ?? 0.6) * (ctx.heroHpMax?.() || 100))); m.hp = m.hpMax; m.down = null; m.falling = false;
    m.leftMs = c.access === 'sela' ? (C0.flightMs ?? 30000) : (C0.callFlightMs ?? 15000);
    if (c.access === 'chamado') m.calledUsed = true;
    ctx.note('mount_up', { mode: c.access, ms: m.leftMs });
    return { ok: true, access: c.access };
  }
  /** DESCER (única ação do jogador montado): toque começa a pousar; durante o pouso vira CANCELAR (volta a subir). */
  function toggleDescend() {
    const br = ctx.br(); const m = br?.mount; if (!m?.active || m.phase === 'falling') return null;
    if (m.phase === 'landing') { if (m.alt > 0.6 && !m.forced) { m.phase = 'takeoff'; return 'cancel'; } return null; }
    m.phase = 'landing'; return 'landing';
  }
  function forceLand(why) {
    const m = ctx.br()?.mount; if (!m?.active || m.phase === 'falling') return false;
    m.phase = 'landing'; m.forced = true; ctx.note('mount_forced', { why }); return true;
  }
  /** SOPRO DE FOGO (ATAQUE montado): gasta Fôlego, cadência fixa; o main aplica o dano no cone. Não funciona pousando/decolando baixo. */
  function fire() {
    const br = ctx.br(); const m = br?.mount; if (!m?.active || !flyOn()) return { ok: false, why: 'off' };
    const B = C().breath || {}; if (m.phase === 'landing' || m.phase === 'falling') return { ok: false, why: 'pousando' };
    if (m.alt < 1.2) return { ok: false, why: 'baixo' };
    if (m.clock - (m.fireAt ?? -1e9) < (B.cadenceMs ?? 450)) return { ok: false, why: 'cadencia' };
    if ((m.breath ?? 0) < (B.burst ?? 12)) { if (!m.noBreathWarned || m.clock - m.noBreathWarned > 2500) { m.noBreathWarned = m.clock; ctx.note('mount_nobreath', {}); } return { ok: false, why: 'sem_folego' }; }
    m.breath -= B.burst ?? 12; m.fireAt = m.clock; m.fireUntil = m.clock + 700; m.fires = (m.fires || 0) + 1;
    return { ok: true, range: B.range ?? 7, halfAngle: (B.halfAngleDeg ?? 28) * Math.PI / 180, dmgMult: B.dmgMult ?? 0.8, maxTargets: B.maxTargets ?? 3 };
  }
  /** avança o voo `dtMs` (chamar todo frame de simulação com o jogo rodando). */
  function step(dtMs) {
    const br = ctx.br(); if (!br || !on()) return;
    const m = ensure(br); m.clock += dtMs; settle();
    if (m.down && !m.down.announced && m.clock >= m.down.respawnAt) { m.down.announced = true; ctx.note('mount_respawned', { spot: m.down.spot }); }
    if (!m.active) return;
    const C0 = C(); const cruise = C0.cruiseAltitude ?? 3.2; const dt = dtMs / 1000;
    if (ctx.playerAlive && !ctx.playerAlive()) { endFlight(m, 'morreu'); return; }
    if (!flyOn()) { endFlight(m, 'desligado'); return; }
    if (m.phase === 'falling') { // abatido: o herói cai (9 m/s²-ish); ao chegar ao chão leva o dano de queda por altitude (nunca letal)
      const a0 = m.alt; m.fallV = Math.min(14, (m.fallV || 0) + 18 * dt); m.alt = Math.max(0, m.alt - m.fallV * dt);
      if (m.alt <= 0) { const n = fallDamage(m.fallFrom ?? a0); if (n > 0) ctx.fallHurt?.(n); m.graceUntil = m.clock + (C0.fall?.graceMs ?? 2000); const sp = m.spot; endFlight(m, 'abatida'); m.cdUntil = m.clock; m.down = { at: m.clock, respawnAt: m.clock + (C0.respawnMs ?? 90000), spot: sp || null }; ctx.note('mount_shot_down', { fall: n, respawnMs: C0.respawnMs ?? 90000 }); }
      return;
    }
    if (m.phase !== 'landing' && m.phase !== 'cruise' && ctx.inCover?.()) forceLand('abrigo'); /* 20261016voo: em cruzeiro o dragão sobrevoa telhados/abrigos (não pousa à força) */ // entrou num esconderijo: pousa na borda e segue a pé
    if (finalState(br) && !m.forced && !(m.mode === 'sela' && C().semLimite)) forceLand('final'); // 20261016 (Caio): com a sela o voo só acaba no DESCER ou se o dragão morrer
    if (m.phase === 'takeoff') { m.alt = Math.min(cruise, m.alt + (cruise / 1.2) * dt); if (m.alt >= cruise) m.phase = 'cruise'; }
    if (m.phase === 'cruise') { // rasante: ao cuspir fogo o dragão desce a `rasanteAlt` (janela p/ a espada) e volta ao cruzeiro
      const tgt = m.clock < (m.fireUntil || 0) ? Math.min(cruise, C0.breath?.rasanteAlt ?? 2.0) : cruise; const dz = tgt - m.alt; m.alt += Math.sign(dz) * Math.min(Math.abs(dz), 3 * dt);
    }
    if (m.phase !== 'landing' && m.clock - (m.fireAt ?? -1e9) > 600) m.breath = Math.min(C0.breath?.max ?? 100, (m.breath ?? 0) + (C0.breath?.regenPerSec ?? 8) * dt);
    if (m.phase === 'cruise' || m.phase === 'takeoff') {
      if (!(m.mode === 'sela' && C().semLimite)) m.leftMs -= dtMs; // sem limite de tempo com a sela
      if (!m.warned && m.leftMs <= 5000) { m.warned = true; ctx.note('mount_warn', { ms: Math.max(0, m.leftMs) }); }
      if (m.leftMs <= 0) forceLand('energia');
    }
    if (m.phase === 'landing') {
      const v = m.forced ? 4 : (C0.descendSpeed ?? 2.2);
      m.alt = Math.max(0, m.alt - v * dt);
      if (m.alt <= 0) endFlight(m, 'pousou');
    }
  }
  function endFlight(m, why) {
    m.active = false; m.phase = 'ground'; m.alt = 0; m.forced = false; m.cdUntil = m.clock + (m.mode === 'sela' && C().semLimite && why !== 'abatida' ? 0 : (C().cooldownMs ?? 45000)); // pousou com a sela → remonta na hora
    ctx.note('mount_down', { why });
  }
  /** dano de queda (herói derrubado): min(0,25×HPmáx, 0,05×HPmáx×max(0, altitude−0,5 m)); nunca letal (o main deixa ≥ 1 HP) */
  function fallDamage(alt) { const F = C().fall || {}; const hpMax = ctx.heroHpMax?.() || 100; return Math.max(0, Math.round(Math.min((F.maxFrac ?? 0.25) * hpMax, (F.pctPerMeter ?? 0.05) * hpMax * Math.max(0, alt - 0.5)))); }
  /** a montaria absorve o dano ANTES do herói (reserva `hp`); a 0 → abatida (herói cai). Carência curta pós-queda = invulnerável. Retorna o dano absorvido. */
  function absorb(dmg) {
    const br = ctx.br(); const m = br?.mount; if (!m || !flyOn() || !(dmg > 0)) return 0;
    if (m.clock < (m.graceUntil || 0)) return dmg;
    if (!m.active || m.phase === 'falling') return 0;
    const take = Math.min(m.hp, dmg); m.hp -= take;
    if (m.hp <= 0) { m.phase = 'falling'; m.fallFrom = m.alt; m.fallV = 0; m.forced = false; ctx.note('mount_hit_down', {}); }
    return take;
  }
  /** morreu com o jogo pausado (tela de derrota): encerra o voo sem depender do passo de simulação */
  function settle() { const br = ctx.br(); const m = br?.mount; if (m?.active && ((ctx.playerAlive && !ctx.playerAlive()) || br.spectate || br.ended)) endFlight(m, 'morreu'); }
  const isActive = () => { settle(); return !!ctx.br()?.mount?.active && flyOn(); };
  /** velocidade de voo em tiles/s (o main converte em multiplicador do movimento) */
  const speed = () => { const m = ctx.br()?.mount; if (m?.phase === 'falling') { const mv = ctx.cfg()?.movement || {}; return (mv.walkSpeed ?? 2.4) * (mv.speedScale ?? 1); } return C().speed ?? 6.5; };
  const view = () => {
    settle(); const br = ctx.br(); const m = br?.mount || null; const cm = br && flyOn() ? canMount() : { ok: false, why: 'off' };
    return { enabled: on(), flyEnabled: flyOn(), active: !!m?.active, phase: m?.phase || 'ground', alt: m ? +m.alt.toFixed(2) : 0, leftMs: m ? Math.max(0, Math.round(m.leftMs)) : 0,
      cdLeftMs: m ? Math.max(0, Math.round(m.cdUntil - m.clock)) : 0, sela: !!m?.sela, por: m?.por || null, decidido: !!m?.decidido, mode: m?.mode || null, calledUsed: !!m?.calledUsed, breath: m ? Math.round(m.breath ?? 0) : 0, hp: m ? Math.round(m.hp ?? 0) : 0, hpMax: m ? m.hpMax || 0 : 0, down: m?.down ? { leftMs: Math.max(0, Math.round(m.down.respawnAt - m.clock)), spot: m.down.spot } : null, graceMs: m ? Math.max(0, Math.round((m.graceUntil || 0) - m.clock)) : 0, fires: m?.fires || 0,
      canMount: cm.ok, why: cm.ok ? null : cm.why, domado: loadTamed(), key: MOUNT_KEY, cfg: JSON.parse(JSON.stringify(C())) };
  };
  /** leitura leve para o renderer (todo frame) */
  const renderView = () => { settle(); const m = ctx.br()?.mount; return m && m.active && flyOn() ? { active: true, dragon: m.phase !== 'falling', alt: m.alt, phase: m.phase, cruise: C().cruiseAltitude ?? 3.2, scale: C().scale ?? 0.4, pal: m.pal || loadPal() } : null; };
  /** montaria renascida esperando no ponto original (visual: dragão em pé no covil) */
  const restView = () => { const m = ctx.br()?.mount; return m?.down && flyOn() && m.clock >= m.down.respawnAt && m.down.spot ? { x: m.down.spot.x, y: m.down.spot.y, scale: C().scale ?? 0.4, pal: m.pal || loadPal() } : null; };
  const status = () => { const br = ctx.br(); const m = br?.mount; return { active: !!m?.active && flyOn(), phase: m?.phase || 'ground', canMount: br && flyOn() ? canMount().ok : false }; };
  return { onGiantKilled, fire, absorb, fallDamage, restView, view, has: () => !!ctx.br()?.mount?.sela, canMount, tryMount, toggleDescend, forceLand, step, isActive, speed, renderView, status };
}
