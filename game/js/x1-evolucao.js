/**
 * Painel "EVOLUÇÃO DA IA" do X1 (20261025ia). Tudo calculado do perfil REAL (localStorage nexara.x1.perfil.v1)
 * via computeEvolution — nenhum número inventado; histórico que não existia antes da v2 aparece como "sem dados".
 */
import { computeEvolution } from './x1-brain.js?v=20261025perf';

const SD = '<i class="sd">sem dados</i>';
const f = (v) => String(v).replace('.', ',');
const fmtPct = (v, extra = '') => (v == null ? SD : `<b>${String(v).replace('.', ',')}%</b>${extra}`);

function chartSvg(serie) {
  const pts = serie.filter((m) => m.iaRodadasPct != null);
  if (pts.length < 2) return `<div class="evo-chart-empty" data-k="grafico">Gráfico: ${SD} — começa a desenhar a partir da 2ª partida registrada (${pts.length} até agora).</div>`;
  const W = 300, H = 110, pad = 18; const last = pts.slice(-30); const n = last.length;
  const X = (i) => pad + (i * (W - 2 * pad)) / (n - 1); const Y = (v) => H - pad - (v / 100) * (H - 2 * pad);
  const line = (key) => last.map((m, i) => (m[key] == null ? null : `${X(i).toFixed(1)},${Y(m[key]).toFixed(1)}`)).filter(Boolean).join(' ');
  const acc = line('precisaoPct');
  const dots = last.map((m, i) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(m.iaRodadasPct).toFixed(1)}" r="2.6" fill="${m.venc === 'ia' ? '#ff4a6a' : '#7cf'}"/>`).join('');
  return `<svg class="evo-chart" data-k="grafico" data-n="${n}" viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="none">
    <line x1="${pad}" y1="${Y(50)}" x2="${W - pad}" y2="${Y(50)}" stroke="#ffffff22" stroke-dasharray="3 3"/>
    <text x="2" y="${Y(100) + 4}" fill="#8aa" font-size="8">100%</text><text x="2" y="${Y(50) + 3}" fill="#8aa" font-size="8">50%</text><text x="6" y="${Y(0) + 3}" fill="#8aa" font-size="8">0</text>
    <polyline points="${line('iaRodadasPct')}" fill="none" stroke="#ff4a6a" stroke-width="2"/>
    ${acc.split(' ').length >= 2 ? `<polyline points="${acc}" fill="none" stroke="#39c6ff" stroke-width="1.6" stroke-dasharray="4 2"/>` : ''}${dots}
    <text x="${pad}" y="${H - 3}" fill="#8aa" font-size="8">partida ${last[0].n}</text><text x="${W - pad}" y="${H - 3}" fill="#8aa" font-size="8" text-anchor="end">${last[n - 1].n}</text></svg>
    <div class="evo-leg"><span style="color:#ff4a6a">━ rodadas vencidas pela IA (%)</span> <span style="color:#39c6ff">┅ precisão de previsão (%)</span></div>`;
}

export function renderEvolution(p) {
  const e = computeEvolution(p);
  const L = e.esquivaLados; const C = e.combosPct;
  const semHist = e.partidasSemHist > 0 ? ` <small>(${e.partidasSemHist} partida(s) antigas sem histórico por partida)</small>` : '';
  const row = (k, label, val) => `<div class="evo-row" data-k="${k}"><span>${label}</span><span class="v">${val}</span></div>`;
  return { e, html: `
  <div class="evo-head"><div class="evo-nv" data-k="nivel">🧠 IA Nv. <b>${e.nivel}</b></div>
    <div class="evo-bar"><i style="width:${Math.round(e.progresso * 100)}%"></i></div>
    <div class="evo-pts">${e.pontos} / ${e.proxNivelPontos} pts para o Nv. ${e.nivel + 1}</div></div>
  <div class="evo-sec">PARTIDAS</div>
  ${row('partidas', 'Partidas / rodadas jogadas', `<b>${e.partidas}</b> / <b>${e.rodadas}</b>`)}
  ${row('vitRodadas', 'IA venceu (rodadas)', e.rodadas ? fmtPct(e.vitIARodadasPct, ` (${e.vitIARodadas}/${e.rodadas})`) : SD)}
  ${row('vitPartidas', 'IA venceu (partidas)', fmtPct(e.vitIAPartidasPct, e.partidasRegistradas ? ` (${e.partidasRegistradas} registradas)` : '') + semHist)}
  ${row('vitUlt5', `IA venceu (últimas ${e.ult5N || 5})`, fmtPct(e.vitIAUlt5Pct))}
  <div class="evo-sec">PREVISÃO</div>
  ${row('precisao', 'Acertou suas esquivas/bloqueios', fmtPct(e.precisaoPct, e.previsoes ? ` (${e.previsoesOk}/${e.previsoes})` : ''))}
  ${row('precLado', '· lado da esquiva', fmtPct(e.precisaoLadoPct))}
  ${row('precReacao', '· reação à finta (bloqueio/esquiva)', fmtPct(e.precisaoReacaoPct))}
  ${row('punicoes', 'Punições que acertaram', e.punicoes.n ? fmtPct(e.punicoes.pct, ` (${e.punicoes.ok}/${e.punicoes.n})`) : SD)}
  ${row('fintas', 'Fintas que acertaram', e.fintas.n ? fmtPct(e.fintas.pct, ` (${e.fintas.ok}/${e.fintas.n})`) : SD)}
  <div class="evo-sec">O QUE APRENDEU DE VOCÊ</div>
  ${row('lados', 'Lado da esquiva', L ? `esq <b>${f(L.esq)}%</b> · dir <b>${f(L.dir)}%</b> · trás <b>${f(L.tras)}%</b> · frente <b>${f(L.frente)}%</b> <small>(${e.esquivasTotal})</small>` : SD)}
  ${row('bloqueio', 'Bloqueio', e.bloqueios ? `segura <b>${e.bloqueioDuracaoMs} ms</b> · reage em ${e.bloqueioReacaoMs == null ? SD : `<b>${e.bloqueioReacaoMs} ms</b>`} <small>(${e.bloqueios})</small>` : SD)}
  ${row('combos', 'Combos favoritos', C ? `1 golpe <b>${f(C[0])}%</b> · 2: <b>${f(C[1])}%</b> · 3: <b>${f(C[2])}%</b> · 4+: <b>${f(C[3])}%</b>` : SD)}
  ${row('distancia', 'Distância preferida', e.distanciaFavorita ? `<b>${e.distanciaFavorita}</b> <small>(${f(e.distanciaPct[e.distanciaPct.indexOf(Math.max(...e.distanciaPct))])}% do tempo)</small>` : SD)}
  <div class="evo-sec">EVOLUÇÃO POR PARTIDA</div>
  ${chartSvg(e.serie)}
  <div class="evo-form"><b>Fórmula do nível:</b> pontos = 10×rodadas + 2×(esquivas+bloqueios observados) + 100×precisão×min(1, previsões/20); Nv = 1 + ⌊√(pontos/25)⌋.${e.migradoDeV1 ? ' Dados de antes desta versão foram mantidos; métricas novas contam a partir de agora.' : ''}</div>` };
}

let el = null;
export function closeEvolutionPanel() { if (el) { el.remove(); el = null; } }
export function openEvolutionPanel({ getProfile, onReset }) {
  if (typeof document === 'undefined') return null; closeEvolutionPanel();
  el = document.createElement('div'); el.id = 'x1-evolucao';
  const paint = () => {
    const { html } = renderEvolution(getProfile());
    el.innerHTML = `<div class="evo-box" role="dialog" aria-label="Evolução da IA"><div class="evo-title">EVOLUÇÃO DA IA <button id="evo-fechar" type="button" aria-label="Fechar">✕</button></div>
      <div class="evo-body">${html}</div>
      <div class="evo-foot"><button id="evo-reset" type="button">Resetar IA…</button><button id="evo-ok" class="primary" type="button">FECHAR</button></div>
      <div id="evo-confirm" hidden><div>Apagar <b>tudo</b> que a IA aprendeu de você? Isso não pode ser desfeito.</div><div class="evo-cbtn"><button id="evo-reset-nao" type="button" class="primary">NÃO, MANTER</button><button id="evo-reset-sim" type="button">SIM, RESETAR</button></div></div></div>`;
    el.querySelector('#evo-fechar').onclick = closeEvolutionPanel; el.querySelector('#evo-ok').onclick = closeEvolutionPanel;
    const cf = el.querySelector('#evo-confirm');
    el.querySelector('#evo-reset').onclick = () => { cf.hidden = false; };
    el.querySelector('#evo-reset-nao').onclick = () => { cf.hidden = true; };
    el.querySelector('#evo-reset-sim').onclick = () => { onReset?.(); paint(); };
  };
  paint(); document.body.appendChild(el);
  el.addEventListener('pointerdown', (ev) => ev.stopPropagation()); el.addEventListener('keydown', (ev) => ev.stopPropagation());
  return el;
}
