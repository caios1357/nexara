/**
 * NEXARA X1 ⚔ — controlador da partida 1×1 offline (melhor de 3) + ponte entre o jogo e o cérebro que aprende (x1-brain).
 * Regras justas: os dois no NV1, arma básica, vida do próprio herói (mesma regra da PARTIDA JUSTA), mesmas recargas.
 * A IA só decide POSIÇÃO/TEMPO (punir esquiva, fintar bloqueio, distância, hora do poder) — nunca ganha atributo.
 * Nada do save é tocado: o perfil de aprendizado vive na chave própria 'nexara.x1.perfil.v1'.
 */
import { createX1Brain, computeEvolution } from './x1-brain.js?v=20261025arconte2';
import { openEvolutionPanel } from './x1-evolucao.js?v=20261025arconte2';
import { X1_SPAWNS } from './x1-map.js?v=20261025arconte2';

const LADO_VEC = { esq: [0, -1], dir: [0, 1], tras: [-1, 0], frente: [1, 0] }; // [along, side] relativos ao eixo jogador→rival

export function createX1Mode(deps) {
  let M = null; // partida atual
  const brain = createX1Brain();
  const log = []; const pushLog = (k, o = {}) => { if (!M) return; const e = { k, t: Math.round(M.t), r: M.round, ...o }; log.push(e); if (log.length > 400) log.shift(); };
  function active() { return !!M && !M.done; }
  function cfg() { return deps.cfg()?.x1 || { melhorDe: 3, rodadaPausaMs: 2600, contagemMs: 2000 }; }
  function rival() { const st = deps.getState(); const mon = st?.monstersAlive?.find((m) => m.rival && m.alive); return mon || null; }
  function start() {
    M = { t: 0, round: 0, score: { heroi: 0, rival: 0 }, phase: 'contagem', phaseAt: 0, done: false, lastPrep: false, hpP: null, hpR: null, pend: [], decisions: [], rodadas: [], rivalName: null, rivalKit: null };
    log.length = 0; hideEnd();
    M.phase = 'espera'; // o rival nasce no 1º passo da arena → a rodada 1 começa quando ele existir
    showIndicator();
  }
  function stop() { M = null; hideHud(); hideEnd(); }
  function nextRound() {
    M.round++; M.phase = 'contagem'; M.phaseAt = M.t; M.pend.length = 0; M.lastPrep = false;
    deps.resetRound?.(X1_SPAWNS[0], X1_SPAWNS[1]);
    const mon = rival(); M.hpP = deps.getState().player.hp; M.hpR = mon ? mon.hp : null;
    if (mon) { M.rivalName = mon.rival?.name || 'Rival'; M.rivalKit = mon.rival?.kit ? mon.rival.kit.heroi + (mon.rival.kit.variante ? ':' + mon.rival.kit.variante : '') : (mon.rival?.char || null); }
    deps.grace?.(cfg().contagemMs + 150);
    brain.onRoundStart(M.round);
    pushLog('round_start', { tac: brain.tactics() });
    deps.banner?.(`<b>RODADA ${M.round}</b>${M.score.heroi} × ${M.score.rival} · melhor de ${cfg().melhorDe}`, 1500);
    updateHud();
  }
  /** fim de rodada: 'heroi' (rival chegou a 1 HP) ou 'rival' (herói caiu) — chamado pelos ganchos de dano/morte */
  function roundOver(winner) {
    if (!active() || M.phase !== 'luta') return false;
    M.score[winner]++; M.phase = 'pausa'; M.phaseAt = M.t; deps.grace?.(cfg().rodadaPausaMs + 400);
    brain.onRoundEnd(winner);
    M.rodadas.push({ n: M.round, winner, ms: Math.round(M.t - (M.fightAt || 0)) });
    pushLog('round_end', { winner });
    const need = Math.floor(cfg().melhorDe / 2) + 1;
    if (M.score[winner] >= need) { M.phase = 'fim'; M.done = true; brain.onMatchEnd({ winner, score: { ...M.score }, kit: M.rivalKit }); pushLog('match_end', { winner });
      const res = { winner, score: { ...M.score }, rodadas: M.rodadas.slice(), rival: M.rivalName, kit: M.rivalKit, partidas: brain.profile().partidas };
      deps.grace?.(36e5); showEnd(res); deps.onMatchEnd?.(res);
    } else deps.banner?.(`<b>${winner === 'heroi' ? 'VOCÊ VENCEU A RODADA' : `${(M.rivalName || 'RIVAL').toUpperCase()} VENCEU A RODADA`}</b>${M.score.heroi} × ${M.score.rival}`, 1500);
    updateHud(); return true;
  }
  /** chamado pelo mitigador: o golpe do herói no rival nesta rodada — clampa o letal (rival nunca "morre" no X1; a rodada termina) */
  function clampRivalDamage(mon, dmg) {
    if (!active()) return dmg; if (M.phase !== 'luta') return 0;
    if (dmg >= mon.hp) { const d = Math.max(0, mon.hp - 1); roundOver('heroi'); return d; }
    return dmg;
  }
  function onPlayerDeath() { if (!active()) return; if (M.phase === 'luta') roundOver('rival'); }
  function playerShielded() { return active() && M.phase !== 'luta'; }
  /** eventos do árbitro de ações do herói (main.onActionEvent) */
  function onPlayerEvent(type, d = {}) {
    if (!active() || M.phase !== 'luta') return;
    const mon = rival(); const p = deps.playerPos(); const mp = mon ? deps.monPos(mon) : null;
    const rx = mp ? mp.x - p.x : 1, ry = mp ? mp.y - p.y : 0; const dist = Math.hypot(rx, ry);
    if (type === 'dodge') {
      const side = brain.onPlayerDodge(d.dirX || 0, d.dirY || 0, rx, ry, M.t); pushLog('p_dodge', { side, dist: +dist.toFixed(1) });
      const pun = mon && brain.punishDodge();
      if (pun) { // PUNE: investe no ponto de pouso previsto (lado mais provável pelo perfil) e ataca na hora
        const ln = Math.hypot(rx, ry) || 1; const fx = rx / ln, fy = ry / ln; const L = LADO_VEC[pun.lado] || [0, 0];
        const dxW = fx * L[0] + (-fy) * L[1], dyW = fy * L[0] + fx * L[1]; // vetor esquiva previsto (mundo)
        const land = { x: p.x + dxW * 2.0, y: p.y + dyW * 2.0 };
        M.pend.push({ kind: 'pune', at: M.t + 90, until: M.t + 700, land, lado: pun.lado });
        M.decisions.push({ t: M.t, k: 'pune', lado: pun.lado, real: side }); pushLog('ai_pune', { lado: pun.lado, real: side });
      }
    } else if (type === 'defend') { brain.onPlayerBlock(true, M.t); pushLog('p_block'); }
    else if (type === 'defend_end') brain.onPlayerBlock(false, M.t);
    else if (type === 'special') {
      if (d.id === 'dash') { brain.onPlayerDash(dist); pushLog('p_dash', { dist: +dist.toFixed(1) }); }
      else { brain.onPlayerPower(d.id, M.t); pushLog('p_power', { id: d.id });
        if (mon && dist < 6 && brain.dodgeOnPlayerPower()) M.pend.push({ kind: 'esquivaPoder', at: M.t + 120, until: M.t + 600 }); }
    } else if (type === 'dash_strike') { brain.onPlayerDash(dist); pushLog('p_dash', { dist: +dist.toFixed(1) }); }
    else if (type === 'attack') { brain.onPlayerAttack(M.t); if (mon && dist < 2.6) { M.pend.push({ kind: 'defesa', at: M.t + 60, until: M.t + 220 }); M.pend.push({ kind: 'contra', at: M.t + 380, until: M.t + 900 }); } } // reação (~60 ms) ao golpe dele: esquiva ou guarda, com as recargas normais
  }
  /** passo por quadro (arena-br.update no X1) */
  function step(dtMs) {
    if (!M) return; M.t += dtMs;
    if (M.done) return;
    if (M.phase === 'espera') { if (rival()) nextRound(); return; }
    if (M.phase === 'contagem') {
      const left = cfg().contagemMs - (M.t - M.phaseAt);
      if (left <= 0) { M.phase = 'luta'; M.fightAt = M.t; deps.clearGrace?.(); { const mon = rival(); if (mon) deps.alert?.(mon); } deps.banner?.('<b>LUTE!</b>', 600); pushLog('fight'); }
      updateHud(); return;
    }
    if (M.phase === 'pausa') { if (M.t - M.phaseAt >= cfg().rodadaPausaMs) nextRound(); return; }
    // —— luta ——
    const st = deps.getState(); const mon = rival(); if (!mon) return;
    const p = deps.playerPos(); const mp = deps.monPos(mon); const dist = Math.hypot(mp.x - p.x, mp.y - p.y);
    brain.tickDist(dist, dtMs); brain.tick(M.t);
    if (M.t - (M.refreshAt || 0) > 6000) { M.refreshAt = M.t; brain.refresh(); }
    if (M.hpR != null && mon.hp < M.hpR) brain.onPlayerDamage(M.hpR - mon.hp, dist); M.hpR = mon.hp;
    if (M.hpP != null && st.player.hp < M.hpP) { brain.onRivalDamage(M.hpP - st.player.hp, dist, M.t); M.justHit = M.t; } M.hpP = st.player.hp;
    const v = deps.aiView(mon); const prep = v?.state === 'ATTACK_PREPARE';
    if (prep && !M.lastPrep) { // o rival começou a preparar um golpe
      brain.onRivalPrepare(M.t);
      const tac = brain.tactics();
      const bait = brain.baitNow();
      if (bait) { M.pend.push({ kind: 'finta', at: M.t + 160, until: M.t + 300, espera: bait.esperaMs, tipo: bait.tipo }); M.decisions.push({ t: M.t, k: 'finta', espera: bait.esperaMs }); pushLog('ai_finta', { espera: bait.esperaMs }); }
      else if (tac.preveEsquiva && tac.confEsquiva >= 0.5) { // MIRA ADIANTADA: vira o golpe para o lado em que ele costuma esquivar
        const off = tac.preveEsquiva === 'esq' ? 0.32 : tac.preveEsquiva === 'dir' ? -0.32 : 0;
        if (off) { deps.steer(mon, { facingOffset: off }); M.decisions.push({ t: M.t, k: 'mira', lado: tac.preveEsquiva }); pushLog('ai_mira', { lado: tac.preveEsquiva }); }
      }
    }
    M.lastPrep = prep;
    // bate e sai: depois de acertar (ou se o jogador é forte de perto), volta à faixa fraca dele
    if (!prep && v?.state !== 'ATTACK' && brain.wantRetreat(dist, M.t - (M.justHit || -1e9) < 500) && M.t - (M.retreatAt || -1e9) > 900) {
      M.retreatAt = M.t; const ln = dist || 1; deps.steer(mon, { vx: (mp.x - p.x) / ln * 6, vy: (mp.y - p.y) / ln * 6, ms: 260 });
      M.decisions.push({ t: M.t, k: 'recuo', dist: +dist.toFixed(1) }); pushLog('ai_recuo', { dist: +dist.toFixed(1) });
    }
    // ações agendadas (respeitam o estado da IA: nada de cancelar recuperação/ataque)
    for (let i = M.pend.length - 1; i >= 0; i--) {
      const a = M.pend[i]; if (M.t < a.at) continue; if (M.t > a.until) { M.pend.splice(i, 1); continue; }
      const s = deps.aiView(mon)?.state;
      if (a.kind === 'defesa') { if (s !== 'ATTACK' && s !== 'STUN') { const k = deps.rivalDodge?.(p.x, p.y, s === 'ATTACK_PREPARE' ? 'guarda' : 'ambos'); if (k) { M.decisions.push({ t: M.t, k: 'defesa', como: k }); pushLog('ai_defesa', { como: k }); } } M.pend.splice(i, 1); continue; }
      if (a.kind === 'finta') { if (s === 'ATTACK_PREPARE') { deps.steer(mon, { feintMs: a.espera }); brain.actionStart('finta', M.t); brain.expectReaction(a.tipo || 'bloqueio', M.t); pushLog('ai_finta_ok'); } M.pend.splice(i, 1); continue; }
      if (s === 'ATTACK' || s === 'RECOVERY' || s === 'STUN' || s === 'ATTACK_PREPARE') continue;
      if (a.kind === 'contra') { if (dist < 2.2) { deps.steer(mon, { attackNow: true }); pushLog('ai_contra'); } }
      else if (a.kind === 'pune') { const dx = a.land.x - mp.x, dy = a.land.y - mp.y; const d = Math.hypot(dx, dy) || 1; if (d > 1.2) deps.steer(mon, { vx: dx / d * 7, vy: dy / d * 7, ms: Math.min(320, d / 7 * 1000), attackNow: true }); else deps.steer(mon, { attackNow: true }); brain.actionStart('pune', M.t); pushLog('ai_pune_ok', { d: +d.toFixed(1) }); }
      else if (a.kind === 'esquivaPoder') { const ok = deps.rivalDodge?.(p.x, p.y, 'ambos'); pushLog('ai_esquiva_poder', { ok: !!ok }); } // respeita a recarga da esquiva do rival
      M.pend.splice(i, 1);
    }
    updateHud();
  }
  /** porteiro dos PODERES do rival no herói (arena-rivals.stepPowers): segura até a janela em que o herói gastou esquiva/poder */
  function powerGate() { if (!active()) return true; if (M.phase !== 'luta') return false; return brain.powerGate(M.t); }
  // —— HUD: placar + indicador "IA aprendendo" ——
  let hud = null;
  function ensureHud() {
    if (hud || typeof document === 'undefined') return hud;
    hud = document.createElement('div'); hud.id = 'x1-hud';
    hud.style.cssText = 'position:fixed;top:calc(env(safe-area-inset-top,0px) + 168px);left:50%;transform:translateX(-50%);z-index:40;pointer-events:none;text-align:center;font:700 13px/1.25 system-ui,sans-serif;color:#fff;text-shadow:0 1px 3px #000';
    hud.innerHTML = '<div id="x1-score" style="background:rgba(10,14,24,.6);border:1px solid #ffc83055;border-radius:6px;padding:2px 8px;display:inline-block"></div><div id="x1-ia" style="margin-top:2px;font-size:11px;color:#9ff;opacity:.9"></div>';
    (document.querySelector('#br-hud .br-top') || document.body).appendChild(hud); return hud; // 20261025hud: na coluna do canto (sem HUD da arena: fixo no topo)
  }
  function showIndicator() { ensureHud(); if (hud) { const col = document.querySelector('#br-hud .br-top'); if (col && hud.parentElement !== col) col.appendChild(hud); hud.style.display = ''; } updateHud(); }
  function hideHud() { if (hud) hud.style.display = 'none'; }
  function updateHud() {
    if (!hud || !M) return; const pr = brain.profile();
    if (!hud.__col) { const col = typeof document !== 'undefined' && document.querySelector('#br-hud .br-top'); if (col) { col.appendChild(hud); hud.__col = true; } } // 20261025hud: entra na coluna do canto assim que o HUD da arena existir
    const sc = hud.querySelector('#x1-score'); const ia = hud.querySelector('#x1-ia');
    const txt = `⚔ R${M.round} · VOCÊ ${M.score.heroi} × ${M.score.rival} ${(M.rivalName || 'RIVAL').toUpperCase()}`;
    if (sc.textContent !== txt) sc.textContent = txt;
    const it = `🧠 IA aprendendo: ${pr.partidas}x partidas · IA Nv. ${computeEvolution(pr).nivel}`; // 20261025ia: nível (fórmula em x1-brain.computeEvolution)
    if (ia.textContent !== it) ia.textContent = it;
  }
  // —— tela de VITÓRIA/DERROTA da partida (melhor de 3) ——
  let endEl = null;
  function hideEnd() { if (endEl) { endEl.remove(); endEl = null; } }
  function showEnd(res) {
    if (typeof document === 'undefined') return; hideEnd();
    const win = res.winner === 'heroi'; const pr = brain.profile(); const tac = brain.tactics();
    const lado = { esq: 'esquerda', dir: 'direita', tras: 'para trás', frente: 'para frente' }[tac.preveEsquiva] || null;
    const lic = [lado ? `Você esquiva mais para a <b>${lado}</b> (${Math.round(tac.confEsquiva * 100)}%) — a IA vai punir esse lado.` : 'Ainda poucos dados das suas esquivas.',
      tac.iscaBloqueio ? 'Você bloqueia muito no preparo do golpe — a IA vai fintar.' : null,
      tac.distAlvo != null ? `Sua distância mais fraca: ~${tac.distAlvo} tiles — a IA vai lutar nela.` : null].filter(Boolean);
    endEl = document.createElement('div'); endEl.id = 'x1-end';
    endEl.style.cssText = 'position:fixed;inset:0;z-index:9700;display:flex;align-items:center;justify-content:center;background:rgba(2,6,12,.78);font:600 14px/1.35 system-ui,sans-serif;color:#e8f2ff';
    endEl.innerHTML = `<div style="width:min(92vw,440px);padding:16px 18px;border:1px solid ${win ? '#ffc830' : '#ff4a6a'};border-radius:12px;background:#0b1220;text-align:center">
      <div style="font-size:26px;font-weight:900;letter-spacing:.06em;color:${win ? '#ffc830' : '#ff4a6a'}">${win ? 'VITÓRIA' : 'DERROTA'}</div>
      <div style="margin:4px 0 8px">X1 ⚔ · VOCÊ <b>${res.score.heroi}</b> × <b>${res.score.rival}</b> ${(res.rival || 'RIVAL').toUpperCase()} <small style="opacity:.7">(${res.kit || ''})</small></div>
      <div style="font-size:12px;opacity:.85;text-align:left;margin:6px 0 10px">🧠 IA aprendendo: <b>${pr.partidas}x partidas</b> · ${pr.rodadas} rodadas<br>${lic.map((t) => '• ' + t).join('<br>')}</div>
      <div style="display:flex;gap:10px;justify-content:center"><button id="x1-again" class="primary" type="button" style="min-width:130px;min-height:44px">REVANCHE ⚔</button><button id="x1-menu" type="button" style="min-width:110px;min-height:44px">MENU</button></div>
      <button id="x1-evo" type="button" style="margin-top:10px;min-height:40px;width:100%;background:#12203a;color:#9ff;border:1px solid #39c6ff88;border-radius:8px;font-weight:800">🧠 EVOLUÇÃO DA IA · Nv. ${computeEvolution(pr).nivel}</button></div>`;
    document.body.appendChild(endEl);
    endEl.querySelector('#x1-again').onclick = () => { hideEnd(); deps.onRematch?.(); };
    endEl.querySelector('#x1-menu').onclick = () => { hideEnd(); deps.onMenu?.(); };
    endEl.querySelector('#x1-evo').onclick = () => openEvolution();
  }
  /** painel EVOLUÇÃO DA IA (também aberto pelo menu via main.js) — sempre lê o perfil real do cérebro */
  function openEvolution() { return openEvolutionPanel({ getProfile: () => brain.profile(), onReset: () => { brain.reset(); updateHud(); } }); }
  function view() {
    return { active: active(), match: M ? { t: Math.round(M.t), round: M.round, score: { ...M.score }, phase: M.phase, done: M.done, rival: M.rivalName, kit: M.rivalKit, rodadas: M.rodadas.slice(), decisions: M.decisions.slice(-60) } : null,
      profile: JSON.parse(JSON.stringify(brain.profile())), tactics: brain.tactics(), brainDecisions: brain.decisions(), log: log.slice(-120) };
  }
  return { start, stop, active, step, roundOver, clampRivalDamage, onPlayerDeath, onPlayerEvent, powerGate, playerShielded, view, openEvolution, brain, hud: () => hud };
}
