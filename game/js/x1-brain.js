/**
 * NEXARA X1 ⚔ — CÉREBRO DO RIVAL QUE APRENDE COM O CAIO (offline, só localStorage; sem backend).
 * Lógica pura (sem DOM/Three): registra os PADRÕES do jogador e devolve decisões táticas para o rival.
 * Nunca mexe em atributos (vida/ataque/velocidade iguais) — só POSIÇÃO e TEMPO (esquiva, isca, distância, hora do poder).
 *
 * Perfil (chave própria 'nexara.x1.perfil.v1'):
 *  partidas, rodadas · esquiva: lado (esq/dir/trás/frente) e se foi reação ao preparo do rival · bloqueio: quantos, duração média,
 *  bloqueios por preparo do rival · investida (dash): usos e distância · ataques: golpes, combos (tamanho) · distância preferida (tempo por faixa)
 *  · dano do jogador por faixa de distância · poderes por slot · dano recebido por faixa.
 * Adaptação (calculada a cada rodada e lida a cada 100 ms):
 *  - PREVÊ e PUNE a esquiva: investe no lado em que ele mais esquiva e ataca na hora;
 *  - ISCA de bloqueio: se ele bloqueia muito no preparo, finta (cancela o golpe) e bate quando a guarda cai;
 *  - DISTÂNCIA FRACA: fica na faixa em que o jogador causa MENOS dano (bate e sai se ele é forte de perto);
 *  - TEMPO DO PODER: guarda o poder para quando a esquiva/poder dele está em recarga (ele acabou de gastar).
 */
export const X1_KEY = 'nexara.x1.perfil.v1';
export const DIST_BINS = [1.5, 3, 5, 99]; // tiles: colado · curto · médio · longe
const binOf = (d) => { for (let i = 0; i < DIST_BINS.length; i++) if (d <= DIST_BINS[i]) return i; return DIST_BINS.length - 1; };

/** v2 (20261025ia): + métricas de EVOLUÇÃO (previsões, punições/fintas que acertaram, reação do bloqueio, histórico por partida).
 *  Migração v1→v2 só ACRESCENTA campos (nada do v1 é apagado); o que não existia no v1 fica marcado em `v2desde` → painel mostra "sem dados". */
export const X1_VERSAO = 2;
function v2Fields() {
  return { prev: { esquiva: { n: 0, ok: 0 }, reacao: { n: 0, ok: 0 } }, acoes: { pune: { n: 0, ok: 0 }, finta: { n: 0, ok: 0 } },
    bloqueioReacao: { n: 0, msTotal: 0 }, partidasHist: [], v2desde: { at: Date.now(), partidas: 0, rodadas: 0 } };
}
export function emptyProfile() {
  return { v: X1_VERSAO, ...v2Fields(), partidas: 0, rodadas: 0, vitoriasIA: 0, vitoriasJogador: 0,
    esquiva: { esq: 0, dir: 0, tras: 0, frente: 0, reacao: 0, total: 0 },
    bloqueio: { n: 0, msTotal: 0, noPreparo: 0 }, preparos: 0,
    dash: { n: 0, distTotal: 0 }, ataques: { golpes: 0, combos: [0, 0, 0, 0] },
    tempoFaixa: [0, 0, 0, 0], danoFaixa: [0, 0, 0, 0], recebidoFaixa: [0, 0, 0, 0],
    poderes: { golpe_poderoso: 0, ataque_area: 0, suprema: 0 },
    hist: [] /* últimas adaptações (para o relatório/teste) */ };
}
export function loadProfile(ls = globalThis.localStorage) {
  let raw = null; try { raw = ls?.getItem(X1_KEY) || null; } catch { raw = null; }
  if (!raw) return emptyProfile();
  try {
    const p = JSON.parse(raw);
    if (p && p.v === 1) { const f = v2Fields(); f.v2desde = { at: Date.now(), partidas: p.partidas || 0, rodadas: p.rodadas || 0 }; return { ...emptyProfile(), ...f, ...p, v: X1_VERSAO, migradoDeV1: true }; } // v1 → v2: só acrescenta
    if (p && p.v === X1_VERSAO) { const e = emptyProfile(); return { ...e, ...p, prev: { ...e.prev, ...p.prev }, acoes: { ...e.acoes, ...p.acoes }, bloqueioReacao: { ...e.bloqueioReacao, ...p.bloqueioReacao }, partidasHist: Array.isArray(p.partidasHist) ? p.partidasHist : [] }; }
  } catch { /* corrompido */ }
  try { if (!ls.getItem(X1_KEY + '.backup')) ls.setItem(X1_KEY + '.backup', raw); } catch { /* */ } // nunca perde: guarda o original ilegível/de outra versão antes de recomeçar
  return emptyProfile();
}
export function saveProfile(p, ls = globalThis.localStorage) { try { ls?.setItem(X1_KEY, JSON.stringify(p)); return true; } catch { return false; } }

/** Táticas derivadas do perfil (puro; testável em node). Sem dados → padrão “difícil genérico”. */
export function deriveTactics(p) {
  const E = p.esquiva; const tot = E.esq + E.dir + E.tras + E.frente;
  const sides = { esq: E.esq, dir: E.dir, tras: E.tras, frente: E.frente };
  let lado = null, conf = 0; if (tot >= 3) { lado = Object.keys(sides).sort((a, b) => sides[b] - sides[a])[0]; conf = sides[lado] / tot; }
  const blockRate = p.preparos >= 4 ? Math.min(1, p.bloqueio.noPreparo / p.preparos) : 0;
  const blockMs = p.bloqueio.n ? Math.round(p.bloqueio.msTotal / p.bloqueio.n) : 600;
  // dano do jogador por SEGUNDO em cada faixa (normalizado pelo tempo que ele passou lá)
  const dps = p.danoFaixa.map((d, i) => (p.tempoFaixa[i] > 3000 ? d / (p.tempoFaixa[i] / 1000) : null));
  let forte = null, fraca = null; dps.forEach((v, i) => { if (v == null) return; if (forte == null || v > dps[forte]) forte = i; if (fraca == null || v < dps[fraca]) fraca = i; });
  // distância preferida do RIVAL = centro da faixa FRACA do jogador (se ele é forte colado, o rival bate e sai)
  const centros = [1.1, 2.3, 4, 6]; const distAlvo = fraca != null && forte != null && fraca !== forte ? centros[fraca] : null;
  const batESai = forte === 0 || forte === 1;
  const reacao = E.total ? E.reacao / E.total : 0; // ele esquiva como REAÇÃO ao preparo do rival → finta funciona
  const dashPorRodada = p.rodadas ? p.dash.n / p.rodadas : 0;
  const poderFav = Object.keys(p.poderes).sort((a, b) => p.poderes[b] - p.poderes[a])[0];
  return {
    amostras: tot + p.bloqueio.n + p.ataques.golpes,
    preveEsquiva: lado, confEsquiva: +conf.toFixed(2), puneEsquivaChance: lado ? Math.min(0.95, 0.45 + conf * 0.5) : 0.35,
    reacaoEsquiva: +reacao.toFixed(2), taxaBloqueio: +blockRate.toFixed(2),
    iscaBloqueio: blockRate >= 0.3 || reacao >= 0.4, iscaChance: Math.min(0.8, 0.2 + blockRate * 0.6 + reacao * 0.3), guardaMs: blockMs,
    distAlvo, batESai, faixaForteJogador: forte, faixaFracaJogador: fraca,
    segurarPoder: true, dashPorRodada: +dashPorRodada.toFixed(2), poderFav: p.poderes[poderFav] > 0 ? poderFav : null
  };
}

/**
 * Controlador por partida: recebe eventos do jogo (jogador/rival) e expõe decisões. Tudo em ms do relógio da partida.
 */
export function createX1Brain(opts = {}) {
  const ls = opts.storage || globalThis.localStorage; const R = opts.rand || Math.random;
  let prof = loadProfile(ls); let tac = deriveTactics(prof);
  const live = { open: [], expect: null, m0: null, rivalPrepAt: -1e9, lastDodgeAt: -1e9, lastPowerAt: -1e9, lastBlockStart: -1, combo: 0, comboAt: -1e9, decisions: { pune: 0, isca: 0, recuo: 0, poderSegurado: 0, poderLiberado: 0, esquivaReacao: 0 }, round: 0 };
  const stats = { eventos: 0 };
  function onRoundStart(n) { if (n === 1 || !live.m0) live.m0 = snap(); live.round = n; tac = deriveTactics(prof); prof.hist.push({ r: prof.rodadas + 1, at: Date.now(), tac: { lado: tac.preveEsquiva, conf: tac.confEsquiva, isca: tac.iscaBloqueio, dist: tac.distAlvo, batESai: tac.batESai } }); if (prof.hist.length > 20) prof.hist.splice(0, prof.hist.length - 20); }
  function onRoundEnd(winner) { prof.rodadas++; if (winner === 'rival') prof.vitoriasIA++; else prof.vitoriasJogador++; saveProfile(prof, ls); tac = deriveTactics(prof); } // adapta já no fim da rodada
  function snap() { return { prevN: prof.prev.esquiva.n + prof.prev.reacao.n, prevOk: prof.prev.esquiva.ok + prof.prev.reacao.ok, punN: prof.acoes.pune.n, punOk: prof.acoes.pune.ok, fN: prof.acoes.finta.n, fOk: prof.acoes.finta.ok }; }
  function onMatchEnd(info = {}) {
    resolveExpect(); prof.partidas++;
    const a = snap(), b = live.m0 || snap();
    prof.partidasHist.push({ n: prof.partidas, at: Date.now(), venc: info.winner === 'rival' ? 'ia' : 'jogador', rIA: info.score?.rival ?? 0, rJog: info.score?.heroi ?? 0, kit: info.kit || null,
      prevN: a.prevN - b.prevN, prevOk: a.prevOk - b.prevOk, punN: a.punN - b.punN, punOk: a.punOk - b.punOk, fN: a.fN - b.fN, fOk: a.fOk - b.fOk });
    if (prof.partidasHist.length > 200) prof.partidasHist.splice(0, prof.partidasHist.length - 200);
    live.m0 = null; saveProfile(prof, ls); tac = deriveTactics(prof);
  }
  /** re-leitura no meio da rodada (a cada ~6 s de luta): a IA adapta sem esperar a próxima rodada */
  function refresh() { tac = deriveTactics(prof); return tac; }
  /** distância jogador↔rival a cada passo (para faixa preferida) */
  function tickDist(d, dtMs) { prof.tempoFaixa[binOf(d)] += dtMs; }
  /** lado da esquiva RELATIVO ao rival: vetor esquiva (dx,dy) e vetor jogador→rival (rx,ry) */
  function onPlayerDodge(dx, dy, rx, ry, now) {
    stats.eventos++; const rl = Math.hypot(rx, ry) || 1; const fx = rx / rl, fy = ry / rl; // frente = na direção do rival
    const along = dx * fx + dy * fy; const side = dx * -fy + dy * fx; // >0 = direita do jogador olhando para o rival
    const k = Math.abs(along) >= Math.abs(side) ? (along > 0 ? 'frente' : 'tras') : (side > 0 ? 'dir' : 'esq');
    prof.esquiva[k]++; prof.esquiva.total++; if (now - live.rivalPrepAt < 700) prof.esquiva.reacao++;
    if (tac.preveEsquiva) { prof.prev.esquiva.n++; if (k === tac.preveEsquiva) prof.prev.esquiva.ok++; } // previsão do LADO (a IA tinha um palpite antes da esquiva)
    if (live.expect && live.expect.tipo === 'esquiva' && now - live.expect.at <= 800) { live.expect.ok = true; } // finta contra esquivador: ele reagiu como previsto
    live.lastDodgeAt = now; live.lastDodgeSide = k; return k;
  }
  function onPlayerBlock(start, now) {
    stats.eventos++;
    if (start) { live.lastBlockStart = now; prof.bloqueio.n++; if (now - live.rivalPrepAt < 700) { prof.bloqueio.noPreparo++; prof.bloqueioReacao.n++; prof.bloqueioReacao.msTotal += Math.max(0, now - live.rivalPrepAt); }
      if (live.expect && live.expect.tipo === 'bloqueio' && now - live.expect.at <= 800) live.expect.ok = true; }
    else if (live.lastBlockStart >= 0) { prof.bloqueio.msTotal += Math.min(3000, now - live.lastBlockStart); live.lastBlockStart = -1; }
  }
  function onPlayerDash(dist) { stats.eventos++; prof.dash.n++; prof.dash.distTotal += dist; }
  function onPlayerAttack(now) { stats.eventos++; prof.ataques.golpes++; live.combo = now - live.comboAt < 900 ? live.combo + 1 : 1; live.comboAt = now; prof.ataques.combos[Math.min(3, live.combo - 1)]++; }
  function onPlayerPower(slot, now) { stats.eventos++; if (prof.poderes[slot] != null) prof.poderes[slot]++; live.lastPowerAt = now; }
  function onPlayerDamage(n, d) { prof.danoFaixa[binOf(d)] += n; }
  function onRivalDamage(n, d, now) { prof.recebidoFaixa[binOf(d)] += n; if (now != null) { for (const a of live.open) if (!a.ok && now - a.at <= 1300) { a.ok = true; prof.acoes[a.k].ok++; } } }
  /** a IA EXECUTOU uma punição/finta: conta e espera ~1,3 s para ver se o golpe dela entrou */
  function actionStart(k, now) { if (!prof.acoes[k]) return; prof.acoes[k].n++; live.open.push({ k, at: now, ok: false }); }
  /** finta lançada esperando que ele reaja (esquiva/bloqueio) — conta a previsão do comportamento */
  function expectReaction(tipo, now) { resolveExpect(); live.expect = { tipo, at: now, ok: false }; }
  function resolveExpect() { const e = live.expect; if (!e) return; prof.prev.reacao.n++; if (e.ok) prof.prev.reacao.ok++; live.expect = null; }
  function tick(now) { live.open = live.open.filter((a) => !a.ok && now - a.at <= 1300); if (live.expect && now - live.expect.at > 800) resolveExpect(); }
  function onRivalPrepare(now) { prof.preparos++; live.rivalPrepAt = now; }
  /** Decisões (o modo X1 aplica): */
  // 1) logo depois da esquiva do jogador → punir no lado previsto (ou no lado em que ele foi, se ainda sem dados)
  function punishDodge() { const ch = tac.puneEsquivaChance; if (R() < ch) { live.decisions.pune++; return { lado: tac.preveEsquiva || live.lastDodgeSide || 'tras', conf: tac.confEsquiva }; } return null; }
  // 2) preparo do golpe do rival: fintar? (cancela e bate quando a guarda cair)
  function baitNow() {
    if (!(tac.iscaBloqueio && R() < tac.iscaChance)) return null; live.decisions.isca++;
    // quem ESQUIVA no preparo: finta e golpeia JÁ (o golpe real cai dentro da recarga da esquiva dele) · quem BLOQUEIA: espera a guarda cair
    const esquivador = (tac.reacaoEsquiva || 0) >= (tac.taxaBloqueio || 0);
    return { esperaMs: esquivador ? 0 : Math.min(1400, tac.guardaMs + 120), tipo: esquivador ? 'esquiva' : 'bloqueio' };
  }
  // 3) distância: recuar para a faixa fraca do jogador depois de bater (bate e sai)
  function wantRetreat(d, justHit) { if (tac.distAlvo == null || !justHit) return false; const alvo = Math.min(tac.distAlvo, 3.0); if (tac.batESai && d < alvo - 0.4) { live.decisions.recuo++; return true; } return false; } // só BATE-E-SAI: recua logo depois de acertar, sem sair do alcance de volta (rival corpo a corpo)
  // 4) poder: só quando o jogador acabou de gastar esquiva/poder (janela 1,2 s) ou está colado sem esquiva
  function powerGate(now) { const open = now - live.lastDodgeAt < 1500 || now - live.lastPowerAt < 1500; if (open) live.decisions.poderLiberado++; else live.decisions.poderSegurado++; return open || R() < 0.12; }
  // 5) o jogador começou um poder → o rival esquiva na reação (se a esquiva estiver pronta)
  function dodgeOnPlayerPower() { live.decisions.esquivaReacao++; return true; }
  return { onRoundStart, onRoundEnd, onMatchEnd, refresh, actionStart, expectReaction, tick, tickDist, onPlayerDodge, onPlayerBlock, onPlayerDash, onPlayerAttack, onPlayerPower, onPlayerDamage, onRivalDamage, onRivalPrepare,
    punishDodge, baitNow, wantRetreat, powerGate, dodgeOnPlayerPower,
    profile: () => prof, tactics: () => tac, decisions: () => ({ ...live.decisions }), reset: () => { prof = emptyProfile(); tac = deriveTactics(prof); live.m0 = null; live.open = []; live.expect = null; saveProfile(prof, ls); }, stats };
}

/**
 * EVOLUÇÃO DA IA (puro; o painel e o e2e usam a MESMA conta sobre o perfil salvo).
 * NÍVEL: pontos = 10·rodadas + 2·(esquivas + bloqueios observados) + 100·precisão·confiança,
 *   confiança = min(1, previsões / 20)  (precisão só vale com amostra) → Nv = 1 + ⌊√(pontos / 25)⌋ (máx. 99).
 *   Ex.: 10 rodadas + 30 esquivas/bloqueios + 70% em 20 previsões → 100+60+70 = 230 → Nv 4.
 */
export function computeEvolution(p) {
  const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
  const obs = (p.esquiva?.total || 0) + (p.bloqueio?.n || 0);
  const prevN = (p.prev?.esquiva?.n || 0) + (p.prev?.reacao?.n || 0), prevOk = (p.prev?.esquiva?.ok || 0) + (p.prev?.reacao?.ok || 0);
  const precisao = prevN > 0 ? prevOk / prevN : null; const conf = Math.min(1, prevN / 20);
  const pontos = 10 * (p.rodadas || 0) + 2 * obs + 100 * (precisao || 0) * conf;
  const nivel = Math.min(99, 1 + Math.floor(Math.sqrt(pontos / 25)));
  const prox = 25 * Math.pow(nivel, 2); const atual = 25 * Math.pow(nivel - 1, 2);
  const H = p.partidasHist || []; const ult = H.slice(-5);
  const E = p.esquiva || {}; const tot = (E.esq || 0) + (E.dir || 0) + (E.tras || 0) + (E.frente || 0);
  const lados = tot ? { esq: pct(E.esq, tot), dir: pct(E.dir, tot), tras: pct(E.tras, tot), frente: pct(E.frente, tot) } : null;
  const C = p.ataques?.combos || [0, 0, 0, 0]; const cTot = C.reduce((a, x) => a + x, 0);
  const tf = p.tempoFaixa || [0, 0, 0, 0]; const tfTot = tf.reduce((a, x) => a + x, 0); const FAIXAS = ['colado (≤1,5)', 'curto (1,5–3)', 'médio (3–5)', 'longe (>5)'];
  const favF = tfTot > 0 ? tf.indexOf(Math.max(...tf)) : -1;
  return {
    nivel, pontos: Math.round(pontos), proxNivelPontos: prox, progresso: Math.max(0, Math.min(1, (pontos - atual) / Math.max(1, prox - atual))),
    partidas: p.partidas || 0, rodadas: p.rodadas || 0,
    vitIARodadasPct: pct(p.vitoriasIA || 0, p.rodadas || 0), vitIARodadas: p.vitoriasIA || 0,
    partidasRegistradas: H.length, partidasSemHist: Math.max(0, (p.partidas || 0) - H.length),
    vitIAPartidasPct: H.length ? pct(H.filter((m) => m.venc === 'ia').length, H.length) : null,
    vitIAUlt5Pct: ult.length ? pct(ult.filter((m) => m.venc === 'ia').length, ult.length) : null, ult5N: ult.length,
    precisaoPct: precisao == null ? null : Math.round(precisao * 1000) / 10, previsoes: prevN, previsoesOk: prevOk,
    precisaoLadoPct: pct(p.prev?.esquiva?.ok || 0, p.prev?.esquiva?.n || 0), precisaoReacaoPct: pct(p.prev?.reacao?.ok || 0, p.prev?.reacao?.n || 0),
    punicoes: { n: p.acoes?.pune?.n || 0, ok: p.acoes?.pune?.ok || 0, pct: pct(p.acoes?.pune?.ok || 0, p.acoes?.pune?.n || 0) },
    fintas: { n: p.acoes?.finta?.n || 0, ok: p.acoes?.finta?.ok || 0, pct: pct(p.acoes?.finta?.ok || 0, p.acoes?.finta?.n || 0) },
    esquivaLados: lados, esquivasTotal: tot,
    bloqueioDuracaoMs: p.bloqueio?.n ? Math.round(p.bloqueio.msTotal / p.bloqueio.n) : null, bloqueios: p.bloqueio?.n || 0,
    bloqueioReacaoMs: p.bloqueioReacao?.n ? Math.round(p.bloqueioReacao.msTotal / p.bloqueioReacao.n) : null,
    combosPct: cTot ? C.map((x) => pct(x, cTot)) : null, golpes: p.ataques?.golpes || 0,
    distanciaFavorita: favF >= 0 ? FAIXAS[favF] : null, distanciaPct: tfTot ? tf.map((x) => pct(x, tfTot)) : null,
    serie: H.map((m) => ({ n: m.n, iaRodadasPct: pct(m.rIA, m.rIA + m.rJog), precisaoPct: pct(m.prevOk, m.prevN), venc: m.venc })),
    v2desde: p.v2desde || null, migradoDeV1: !!p.migradoDeV1
  };
}
