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
    const m = ensure(br); if (m.decidido) return { ...m };
    m.decidido = true; m.at = br.clock || 0;
    if (by === 'player') { m.sela = true; m.por = 'player'; m.pal = cleanPal(extra?.pal); saveTamed(true, m.pal); ctx.note('saddle_player', {}); }
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
    if (m.clock < m.cdUntil) return { ok: false, why: 'recarga', leftMs: m.cdUntil - m.clock };
    if (ctx.combatBusy && ctx.combatBusy()) return { ok: false, why: 'combate' };
    return { ok: true, access: acc };
  }
  function tryMount() {
    const br = ctx.br(); const c = canMount(); if (!c.ok) return c;
    const m = ensure(br); const C0 = C();
    m.active = true; m.phase = 'takeoff'; m.alt = 0; m.mode = c.access; m.warned = false; m.breath = C0.breath?.max ?? 100; m.fireAt = -1e9; m.fireUntil = 0;
    m.leftMs = c.access === 'sela' ? (C0.flightMs ?? 30000) : (C0.callFlightMs ?? 15000);
    if (c.access === 'chamado') m.calledUsed = true;
    ctx.note('mount_up', { mode: c.access, ms: m.leftMs });
    return { ok: true, access: c.access };
  }
  /** DESCER (única ação do jogador montado): toque começa a pousar; durante o pouso vira CANCELAR (volta a subir). */
  function toggleDescend() {
    const br = ctx.br(); const m = br?.mount; if (!m?.active) return null;
    if (m.phase === 'landing') { if (m.alt > 0.6 && !m.forced) { m.phase = 'takeoff'; return 'cancel'; } return null; }
    m.phase = 'landing'; return 'landing';
  }
  function forceLand(why) {
    const m = ctx.br()?.mount; if (!m?.active) return false;
    m.phase = 'landing'; m.forced = true; ctx.note('mount_forced', { why }); return true;
  }
  /** SOPRO DE FOGO (ATAQUE montado): gasta Fôlego, cadência fixa; o main aplica o dano no cone. Não funciona pousando/decolando baixo. */
  function fire() {
    const br = ctx.br(); const m = br?.mount; if (!m?.active || !flyOn()) return { ok: false, why: 'off' };
    const B = C().breath || {}; if (m.phase === 'landing') return { ok: false, why: 'pousando' };
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
    if (!m.active) return;
    const C0 = C(); const cruise = C0.cruiseAltitude ?? 3.2; const dt = dtMs / 1000;
    if (ctx.playerAlive && !ctx.playerAlive()) { endFlight(m, 'morreu'); return; }
    if (!flyOn()) { endFlight(m, 'desligado'); return; }
    if (finalState(br) && !m.forced) forceLand('final');
    if (m.phase === 'takeoff') { m.alt = Math.min(cruise, m.alt + (cruise / 1.2) * dt); if (m.alt >= cruise) m.phase = 'cruise'; }
    if (m.phase === 'cruise') { // rasante: ao cuspir fogo o dragão desce a `rasanteAlt` (janela p/ a espada) e volta ao cruzeiro
      const tgt = m.clock < (m.fireUntil || 0) ? Math.min(cruise, C0.breath?.rasanteAlt ?? 2.0) : cruise; const dz = tgt - m.alt; m.alt += Math.sign(dz) * Math.min(Math.abs(dz), 3 * dt);
    }
    if (m.phase !== 'landing' && m.clock - (m.fireAt ?? -1e9) > 600) m.breath = Math.min(C0.breath?.max ?? 100, (m.breath ?? 0) + (C0.breath?.regenPerSec ?? 8) * dt);
    if (m.phase === 'cruise' || m.phase === 'takeoff') {
      m.leftMs -= dtMs;
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
    m.active = false; m.phase = 'ground'; m.alt = 0; m.forced = false; m.cdUntil = m.clock + (C().cooldownMs ?? 45000);
    ctx.note('mount_down', { why });
  }
  /** morreu com o jogo pausado (tela de derrota): encerra o voo sem depender do passo de simulação */
  function settle() { const br = ctx.br(); const m = br?.mount; if (m?.active && ((ctx.playerAlive && !ctx.playerAlive()) || br.spectate || br.ended)) endFlight(m, 'morreu'); }
  const isActive = () => { settle(); return !!ctx.br()?.mount?.active && flyOn(); };
  /** velocidade de voo em tiles/s (o main converte em multiplicador do movimento) */
  const speed = () => C().speed ?? 6.5;
  const view = () => {
    settle(); const br = ctx.br(); const m = br?.mount || null; const cm = br && flyOn() ? canMount() : { ok: false, why: 'off' };
    return { enabled: on(), flyEnabled: flyOn(), active: !!m?.active, phase: m?.phase || 'ground', alt: m ? +m.alt.toFixed(2) : 0, leftMs: m ? Math.max(0, Math.round(m.leftMs)) : 0,
      cdLeftMs: m ? Math.max(0, Math.round(m.cdUntil - m.clock)) : 0, sela: !!m?.sela, por: m?.por || null, decidido: !!m?.decidido, mode: m?.mode || null, calledUsed: !!m?.calledUsed, breath: m ? Math.round(m.breath ?? 0) : 0, fires: m?.fires || 0,
      canMount: cm.ok, why: cm.ok ? null : cm.why, domado: loadTamed(), key: MOUNT_KEY, cfg: JSON.parse(JSON.stringify(C())) };
  };
  /** leitura leve para o renderer (todo frame) */
  const renderView = () => { settle(); const m = ctx.br()?.mount; return m && m.active && flyOn() ? { active: true, alt: m.alt, phase: m.phase, cruise: C().cruiseAltitude ?? 3.2, scale: C().scale ?? 0.4, pal: m.pal || loadPal() } : null; };
  const status = () => { const br = ctx.br(); const m = br?.mount; return { active: !!m?.active && flyOn(), phase: m?.phase || 'ground', canMount: br && flyOn() ? canMount().ok : false }; };
  return { onGiantKilled, fire, view, has: () => !!ctx.br()?.mount?.sela, canMount, tryMount, toggleDescend, forceLand, step, isActive, speed, renderView, status };
}
