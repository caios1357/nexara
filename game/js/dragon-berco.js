/**
 * NEXARA — DRAGON BERÇO · tela do menu inicial. Mostra TODOS os dragões do jogo com prévia 3D, nome, elemento e poderes REAIS:
 *   · FILHOTES (BB): o companheiro do herói e os de cada rival (data/dragoes.json bebes[] + números de habilidade);
 *   · GIGANTES: o chefe da Arena Principal (GIGANTE VERDE) e os 6 gigantes de distrito do NEXARA FAST (chefes[] + poder derivado da config do chefe).
 * O jogador pode ESCOLHER o filhote companheiro (persistido em localStorage 'nexara.berco.v1'; whitelist de ids). O companheiro NUNCA é jogável.
 * Sem botões falsos: o que não funciona para o herói aparece como EM DESENVOLVIMENTO.
 */
import { bbList, getChosenBB, setChosenBB, bbPlayerSupported, bbAbility, describeAbilities } from './dragon-bb.js?v=20261009espada';
import { describeBoss } from './boss-variants.js?v=20261009espada';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function createBerco(deps) {
  let open = false; let tab = 'bb'; let sel = null; let preview = null; let msg = '';
  const data = () => deps.getData(); const cfg = () => deps.getConfig();
  const bosses = () => data().dragoes?.chefes || [];
  const distritoNome = (id) => { const r = (data().arena_br?.regioes || []).find((q) => q.id === id) || (data().arena_br_design?.regioes || []).find((q) => q.id === id); return r?.nome || id; };
  const list = () => (tab === 'bb' ? bbList(data()) : bosses());
  const cur = () => list().find((d) => d.id === sel) || list()[0] || null;

  function bossFacts(c) {
    const D = describeBoss(cfg().arenaBoss, c); const A = data().arena_br?.dragao || {}; const F = data().arena_br?.fast || {};
    const alt = +(D.altura).toFixed(1);
    return { D, alt, hp: +(((A.hpMult ?? 55) * (c.hpMult ?? 1))).toFixed(1), dano: A.danoMult ?? 2.5 };
  }
  function detailHtml(d) {
    if (!d) return '<p class="brc-empty">Nenhum dragão.</p>';
    const cor = d.cor || {}; const chip = `<span class="brc-chip" style="--c:${esc(cor.brilho || '#fff')}">${esc(d.icone || '')} ${esc(d.elemento)}</span>`;
    if (tab === 'bb') {
      const ab = describeAbilities(d, cfg());
      const chosen = getChosenBB(data()) === d.id; const sup = d.id === 'bb_azul' || bbPlayerSupported(d);
      const rivals = (data().dragoes?.rivais?.atribuicao || []).includes(d.id);
      return `<h3>${esc(d.nome)} ${chip}${chosen ? ' <span class="brc-ok">COMPANHEIRO ✓</span>' : ''}</h3>
        <p class="brc-desc">${esc(d.descricao || '')}</p>
        <div class="brc-abs">${ab.length ? ab.map((a) => `<div class="brc-ab"><b>${esc(a.nome)}</b> <small>${esc(a.tipo)}</small>${a.texto ? `<p>${esc(a.texto)}</p>` : ''}<ul>${(a.linhas || []).map((l) => `<li>${esc(l)}</li>`).join('')}</ul>${a.jogador === false ? '<em class="brc-dev">EM DESENVOLVIMENTO para o herói (os rivais usam)</em>' : ''}</div>`).join('') : '<p>Sem habilidades de apoio.</p>'}</div>
        <p class="brc-meta">${rivals ? 'Acompanha heróis rivais (BOT) na Arena. ' : 'Companheiro original do herói. '}O companheiro <b>nunca é jogável</b>.</p>
        <div class="brc-acts"><button type="button" class="primary" id="brc-pick"${chosen ? ' disabled' : ''}>${chosen ? 'ESCOLHIDO' : 'ESCOLHER COMO COMPANHEIRO'}</button></div>
        ${!sup ? '<p class="brc-dev">Habilidade em desenvolvimento para o herói: o visual/elemento já vale; a habilidade só ajuda os rivais por enquanto.</p>' : ''}`;
    }
    const B = bossFacts(d);
    return `<h3>${esc(d.nome)} ${chip}</h3>
      <p class="brc-desc">${esc(d.descricao || '')}</p>
      ${d.assinatura ? `<p class="brc-sig">★ ${esc(d.assinatura)}</p>` : ''}
      <p class="brc-meta">${d.distrito ? `Distrito: <b>${esc(distritoNome(d.distrito))}</b> (NEXARA FAST) · ` : 'Covil da Arena Principal · '}altura ${B.alt} m · HP ×${B.hp} do herói · dano ${B.dano}× o BASE · velocidade ${B.D.velocidade}</p>
      <div class="brc-abs">${B.D.ataques.map((a) => `<div class="brc-ab"><b>${esc(a.nome)}</b> <small>fase ${a.fase}</small><ul>${a.linhas.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></div>`).join('')}</div>
      <p class="brc-meta">Fases por vida: ${B.D.fases.map((f) => `${f.nome} (${f.em}%)`).join(' → ')}. Todo golpe tem aviso no chão antes do impacto.</p>`;
  }
  function render() {
    const root = document.getElementById('brc'); if (!root) return;
    root.querySelectorAll('[data-brc-tab]').forEach((b) => b.classList.toggle('on', b.dataset.brcTab === tab));
    const d = cur(); sel = d?.id || null;
    root.querySelector('#brc-list').innerHTML = list().map((x) => `<button type="button" class="brc-item${x.id === sel ? ' on' : ''}" data-brc-id="${esc(x.id)}" style="--c:${esc(x.cor?.brilho || '#39f0ff')}"><span class="brc-ic">${esc(x.icone || '🐲')}</span><span class="brc-n">${esc(x.nome)}</span><small>${esc(x.elemento)}</small>${tab === 'bb' && getChosenBB(data()) === x.id ? '<i>✓</i>' : ''}</button>`).join('');
    root.querySelectorAll('[data-brc-id]').forEach((b) => { b.onclick = () => { sel = b.dataset.brcId; msg = ''; render(); showModel(); }; });
    root.querySelector('#brc-detail').innerHTML = detailHtml(d);
    const pick = root.querySelector('#brc-pick'); if (pick) pick.onclick = () => { const ok = setChosenBB(data(), sel); msg = ok ? `Companheiro: ${d.nome}` : 'Não foi possível salvar a escolha'; deps.onChoose?.(sel); render(); };
    const m = root.querySelector('#brc-msg'); if (m) m.textContent = msg;
  }
  function showModel() {
    const d = cur(); if (!d || !preview) return;
    preview.show({ id: d.id, kind: tab === 'bb' ? 'bb' : 'boss', height: tab === 'bb' ? 1.05 : cfg().arenaBoss.visualHeight * (d.poder?.altura || 1), cor: d.cor });
    const nm = document.getElementById('brc-name'); if (nm) nm.textContent = d.nome;
  }
  function close() { if (!open) return; open = false; preview?.dispose(); preview = null; deps.ui.closeModal(); }
  function show(selTab) {
    if (selTab) tab = selTab; msg = ''; preview?.dispose(); preview = null;
    if (!sel) sel = null;
    const html = `<div class="brc" id="brc">
      <div class="brc-stage"><canvas id="brc-canvas" aria-label="Dragão 3D — arraste para girar"></canvas><span class="brc-name" id="brc-name"></span><span class="brc-hint">arraste = girar</span></div>
      <div class="brc-side">
        <div class="brc-tabs"><button type="button" data-brc-tab="bb">FILHOTES (BB)</button><button type="button" data-brc-tab="boss">GIGANTES</button></div>
        <div class="brc-msg" id="brc-msg"></div>
        <div class="brc-list" id="brc-list"></div>
        <div class="brc-detail" id="brc-detail"></div>
      </div></div>`;
    deps.ui.openModal('DRAGON BERÇO', html, [{ label: 'Fechar', onClick: () => { open = true; close(); } }]);
    document.getElementById('modal-overlay')?.querySelector('.modal')?.classList.add('nx-brc-modal');
    open = true;
    document.querySelectorAll('#brc [data-brc-tab]').forEach((b) => { b.onclick = () => { tab = b.dataset.brcTab; sel = null; msg = ''; render(); showModel(); }; });
    import('./fps/dragon-preview.js?v=20261009espada').then((m) => {
      const cv = document.getElementById('brc-canvas'); if (!cv || !open) return;
      try { preview = m.createDragonPreview(cv); showModel(); } catch (e) { console.warn('[berço] prévia 3D indisponível', e); const h = document.querySelector('.brc-hint'); if (h) h.textContent = 'prévia 3D indisponível neste aparelho'; }
    }).catch(() => {});
    render();
    return true;
  }
  return {
    open: show, close, isOpen: () => open && !document.getElementById('modal-overlay')?.classList.contains('hidden'),
    tab: (t) => { tab = t; sel = null; render(); showModel(); }, select: (id) => { sel = id; render(); showModel(); },
    info: () => ({ open, tab, sel, count: list().length, ids: list().map((d) => d.id), chosen: getChosenBB(data()), preview: preview?.info() || null }),
    preview: () => preview
  };
}
