/**
 * NEXARA FAST ⚡ — RANKING PESSOAL (local, só números reais das partidas jogadas neste navegador).
 * Chave própria no localStorage ('nexara.fastRanking.v1'), separada do save do herói: gravar o ranking NUNCA toca o save.
 * Campos (whitelist — nada além disto é aceito ao carregar):
 *   por rival:  partidas, abatesMonstros, abatesRivais, derrotouJogador, derrotadoPeloJogador, vitorias (último sobrevivente), melhorNivel
 *   jogador:    partidas, vitorias, derrotas, extracoes, abatesMonstros, abatesRivais, campeoesDerrotados, melhorColocacao, tempoTotalMs
 */
const KEY = 'nexara.fastRanking.v1';
const RIVAL_F = ['partidas', 'abatesMonstros', 'abatesRivais', 'derrotouJogador', 'derrotadoPeloJogador', 'vitorias', 'melhorNivel'];
const PLAYER_F = ['partidas', 'vitorias', 'derrotas', 'extracoes', 'abatesMonstros', 'abatesRivais', 'campeoesDerrotados', 'melhorColocacao', 'tempoTotalMs'];
const num = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.floor(Number(v)) : 0);
function blank() { return { v: 1, jogador: Object.fromEntries(PLAYER_F.map((k) => [k, 0])), rivais: {}, ultimas: [] }; }
function clean(raw) {
  const r = blank(); if (!raw || typeof raw !== 'object') return r;
  for (const k of PLAYER_F) r.jogador[k] = num(raw.jogador?.[k]);
  for (const [name, o] of Object.entries(raw.rivais || {})) { if (typeof name !== 'string' || name.length > 40) continue; r.rivais[name] = Object.fromEntries(RIVAL_F.map((k) => [k, num(o?.[k])])); }
  r.ultimas = (Array.isArray(raw.ultimas) ? raw.ultimas : []).slice(-10).map((m) => ({ at: num(m?.at), kind: String(m?.kind || '').slice(0, 12), seed: num(m?.seed), colocacao: num(m?.colocacao), vencedor: String(m?.vencedor || '').slice(0, 40), ms: num(m?.ms) }));
  return r;
}
export function loadRanking() { try { return clean(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch { return blank(); } }
function saveRanking(r) { try { localStorage.setItem(KEY, JSON.stringify(clean(r))); return true; } catch { return false; } }

/**
 * Registra UMA partida encerrada.
 * @param {{kind:'vitoria'|'derrotado'|'extraido', seed:number, ms:number, heroKills:number, killerName:string|null,
 *   rivals:Array<{name:string, alive:boolean, by:string|null, killedBy:string|null, kills:number, rivalKills:number, level:number, champion:boolean}>}} m
 */
export function recordMatch(m) {
  const r = loadRanking(); const J = r.jogador;
  const alive = m.rivals.filter((x) => x.alive);
  // vencedor = ÚLTIMO SOBREVIVENTE: jogador na VITÓRIA; um rival só quando ele é o único vivo no fim (nada inventado quando sobram vários)
  let vencedor = '';
  if (m.kind === 'vitoria') vencedor = 'VOCÊ';
  else if (m.kind === 'derrotado' && alive.length === 1) vencedor = alive[0].name;
  const colocacao = m.kind === 'vitoria' ? 1 : m.kind === 'derrotado' ? alive.length + 1 : 0;
  J.partidas++; if (m.kind === 'vitoria') J.vitorias++; else if (m.kind === 'derrotado') J.derrotas++; else if (m.kind === 'extraido') J.extracoes++;
  J.abatesMonstros += num(m.heroKills); J.tempoTotalMs += num(m.ms);
  const byHero = m.rivals.filter((x) => x.by === 'heroi'); J.abatesRivais += byHero.length; J.campeoesDerrotados += byHero.filter((x) => x.champion).length;
  if (colocacao && (!J.melhorColocacao || colocacao < J.melhorColocacao)) J.melhorColocacao = colocacao;
  for (const x of m.rivals) {
    const o = r.rivais[x.name] || (r.rivais[x.name] = Object.fromEntries(RIVAL_F.map((k) => [k, 0])));
    o.partidas++; o.abatesMonstros += num(x.kills); o.abatesRivais += num(x.rivalKills);
    if (x.by === 'heroi') o.derrotadoPeloJogador++;
    if (m.kind === 'derrotado' && m.killerName === x.name) o.derrotouJogador++;
    if (vencedor === x.name) o.vitorias++;
    o.melhorNivel = Math.max(o.melhorNivel, num(x.level));
  }
  r.ultimas.push({ at: Date.now(), kind: m.kind, seed: num(m.seed), colocacao, vencedor, ms: num(m.ms) });
  saveRanking(r);
  return { vencedor, colocacao };
}

/** tabela ordenada (vitórias → derrotou o jogador → abates) + linha do jogador */
export function rankingRows() {
  const r = loadRanking();
  const rows = Object.entries(r.rivais).map(([name, o]) => ({ name, ...o, abates: o.abatesMonstros + o.abatesRivais }));
  rows.sort((a, b) => b.vitorias - a.vitorias || b.derrotouJogador - a.derrotouJogador || b.abatesRivais - a.abatesRivais || b.abatesMonstros - a.abatesMonstros || a.name.localeCompare(b.name));
  return { jogador: r.jogador, rivais: rows, ultimas: r.ultimas };
}

/** tela RANKING (overlay). onClose opcional. */
export function showRanking(onClose) {
  document.getElementById('nx-fast-ranking')?.remove();
  const { jogador: J, rivais, ultimas } = rankingRows();
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const el = document.createElement('div'); el.id = 'nx-fast-ranking'; el.className = 'nx-fast-ranking';
  const tr = rivais.map((x, i) => `<tr><td>${i + 1}</td><td class="nm">${esc(x.name)} <small>(BOT)</small></td><td>${x.partidas}</td><td>${x.vitorias}</td><td>${x.abatesMonstros}</td><td>${x.abatesRivais}</td><td>${x.derrotouJogador}</td><td>${x.derrotadoPeloJogador}</td><td>${x.melhorNivel}</td></tr>`).join('');
  const last = ultimas.slice(-5).reverse().map((m) => `<li>${m.kind === 'vitoria' ? 'VITÓRIA' : m.kind === 'derrotado' ? 'DERROTADO' : 'EXTRAÇÃO'} · ${m.colocacao ? `${m.colocacao}º lugar` : '—'}${m.vencedor ? ` · vencedor: ${esc(m.vencedor)}` : ''} · ${Math.round(m.ms / 1000)} s</li>`).join('');
  el.innerHTML = `<div class="nfr-box"><div class="nfr-head"><b>RANKING · NEXARA FAST ⚡</b><button type="button" class="nfr-x">FECHAR</button></div>
    <p class="nfr-sub">Pessoal e local (este navegador). Só partidas reais; rivais são BOTS da IA local — não há jogadores online.</p>
    <table class="nfr-me"><tr><th>VOCÊ</th><th>Partidas</th><th>Vitórias</th><th>Derrotas</th><th>Abates monstros</th><th>Rivais derrotados</th><th>Campeões</th><th>Melhor colocação</th></tr>
      <tr data-k="jogador"><td></td><td>${J.partidas}</td><td>${J.vitorias}</td><td>${J.derrotas}</td><td>${J.abatesMonstros}</td><td>${J.abatesRivais}</td><td>${J.campeoesDerrotados}</td><td>${J.melhorColocacao ? J.melhorColocacao + 'º' : '—'}</td></tr></table>
    ${rivais.length ? `<table class="nfr-tab"><tr><th>#</th><th>Rival</th><th>Partidas</th><th>Vitórias (último vivo)</th><th>Abates monstros</th><th>Abates rivais</th><th>Derrotou você</th><th>Derrotado por você</th><th>Melhor NV</th></tr>${tr}</table>` : '<p class="nfr-empty">Nenhuma partida FAST ainda.</p>'}
    ${last ? `<ul class="nfr-last">${last}</ul>` : ''}</div>`;
  el.querySelector('.nfr-x').onclick = () => { el.remove(); onClose?.(); };
  document.body.appendChild(el);
  return el;
}
