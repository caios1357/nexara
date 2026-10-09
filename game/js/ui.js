import { label, CATEGORIES } from './arquivo.js?v=20261009jogo';
import { drawMinimap } from './map.js?v=20261009jogo';
import {
  useItem, equipItem, unequipItem, discardItem, buyItem, tryEnterZone
} from './actions.js?v=20261009jogo';
import { saveToLocal, downloadJson, importJsonFile } from './save.js?v=20261009jogo';
import { getEquippedStats } from './state.js?v=20261009jogo';
import { countItem } from '../../rules/loot.js?v=20261009jogo';
import { drawItemIcon, drawSkillIcon, itemRarity, RARITY_COLOR, drawPlayer } from './sprites.js?v=20261009jogo';
import { isArenaState } from './arena.js?v=20261009jogo';
import { spriteCount } from './assets.js?v=20261009jogo';
import { attrLines } from './equipment.js?v=20261009jogo';

let rendererRef = null;

export function bindRenderer(r) {
  rendererRef = r;
}

export function createUI(getState, setState, hooks) {
  const ui = {
    refresh() {
      const state = getState();
      if (!state) return;
      updateHud(state);
      updateQuest(state);
      updateLog(state);
      updateSkillBar(state);
      const zone = state._data.zones.zones.find((z) => z.id === state.zoneId);
      // Canvas size handled by renderer camera; kick a frame if loop not yet up
      rendererRef?.refresh?.();
      const mm = document.getElementById('minimap');
      if (mm && zone) drawMinimap(mm, state, zone);
      const zl = document.getElementById('zone-label');
      if (zl && zone) {
        let txt;
        if (state.brMode || zone.code === 'BR') txt = 'BR · ARENA PRINCIPAL';
        else if (state.campoMode || zone.code === 'CA') txt = 'CA · CAMPO DE ASCENSÃO';
        else if (isArenaState(state) || zone.code === 'AR') txt = 'AR · ARENA DE TESTE';
        else txt = `${zone.code} · ${zone.name}`;
        if (zl.textContent !== txt) zl.textContent = txt;
      }
      const gs = document.getElementById('game-screen');
      if (gs) {
        gs.classList.toggle('arena-mode', isArenaState(state));
        gs.classList.toggle('campo-mode', !!state.campoMode);
      }
      updateHotkeys();
    },
    showToast(msg, ms = 2500) {
      const t = document.getElementById('toast');
      t.textContent = msg;
      t.classList.add('show');
      clearTimeout(t._nxT);
      t._nxT = setTimeout(() => t.classList.remove('show'), ms);
    },
    openModal(title, bodyHtml, buttons = []) {
      const ov = document.getElementById('modal-overlay');
      ov.classList.remove('hidden');
      ov.innerHTML = `<div class="modal"><h2>${title}</h2><div class="modal-body">${bodyHtml}</div><div class="close-row" id="modal-btns"></div></div>`;
      const row = document.getElementById('modal-btns');
      const close = () => ov.classList.add('hidden');
      if (!buttons.length) {
        const b = document.createElement('button');
        b.textContent = 'Fechar';
        b.onclick = close;
        row.appendChild(b);
      }
      for (const btn of buttons) {
        const b = document.createElement('button');
        b.textContent = btn.label;
        if (btn.primary) b.classList.add('primary');
        b.onclick = () => {
          if (btn.keepOpen) {
            btn.onClick?.(close);
          } else {
            close();
            btn.onClick?.();
          }
        };
        row.appendChild(b);
      }
    },
    closeModal() {
      document.getElementById('modal-overlay').classList.add('hidden');
    },
    showDialog(result) {
      const state = getState();
      let extra = '';
      if (result.shop) {
        const npc = typeof result.shop === 'string'
          ? state._npcs[result.shop]
          : state._data.npcs.npcs.find((n) => n.role === 'merchant' && n.zone === state.zoneId);
        extra = '<div style="margin-top:0.8rem"><strong>Loja</strong><div class="inv-grid">';
        for (const id of (npc?.shop?.buy || [])) {
          const it = state._items[id];
          extra += `<div class="inv-row"><span class="inv-icon-wrap" data-item-icon="${id}"></span><span>${it.name} — ${it.value} créd.</span><button data-buy="${id}">Comprar</button></div>`;
        }
        extra += '</div></div>';
      }
      if (result.zoneBlock) {
        extra = '<div style="margin-top:0.8rem;display:flex;flex-wrap:wrap;gap:0.3rem">';
        for (const z of state._data.zones.zones) {
          if (z.code === 'G6') continue;
          extra += `<button data-zone="${z.code}">${z.code}</button>`;
        }
        extra += '</div>';
      }
      this.openModal(result.title, `<p>${result.text}</p>${extra}`, [
        { label: 'OK', primary: true, onClick: () => hooks.onDialogClosed?.(result) }
      ]);
      setTimeout(() => {
        paintItemIcons(getState());
        document.querySelectorAll('[data-buy]').forEach((el) => {
          el.onclick = (e) => {
            e.stopPropagation();
            buyItem(getState(), el.getAttribute('data-buy'));
            this.refresh();
            this.showToast('Compra feita (ou créditos insuficientes — veja o log).');
          };
        });
        document.querySelectorAll('[data-zone]').forEach((el) => {
          el.onclick = (e) => {
            e.stopPropagation();
            const r = tryEnterZone(getState(), el.getAttribute('data-zone'));
            if (r.blocked) this.showToast(r.message);
            else if (r.entered) {
              this.closeModal();
              rendererRef?.resetVis?.();
              this.refresh();
              this.showToast(`Entrou em ${r.zone.code} ${r.zone.name}`);
            }
          };
        });
      }, 0);
    },
    /**
     * M3D/ITENS: INVENTÁRIO — grade de itens (toque), 4 espaços de equipamento (ARMA · ARMADURA · ROUPA ·
     * ACESSÓRIO), detalhes (raridade, categoria, atributos, build, lore) e Equipar/Remover/Usar/Descartar.
     * O equipamento aparece no modelo 3D do herói (main.js → syncHeroLook). Retrato e paisagem (CSS grid).
     */
    openInventory(selId) {
      const state = getState();
      if (!state) return;
      const RAR = { comum: ['COMUM', '#c8d4d0'], incomum: ['INCOMUM', '#4aa0ff'], raro: ['RARO', '#ffc24a'], epico: ['ÉPICO', '#b36bff'], lendario: ['LENDÁRIO', '#ffd34a'], reator: ['REATOR', '#ff3a5a'] };
      const OLD = { common: 'comum', uncommon: 'incomum', rare: 'raro', epic: 'epico', legendary: 'lendario' };
      const CAT = { roupa: 'ROUPA', armadura: 'ARMADURA', espada: 'ESPADA', lanca: 'LANÇA', cajado: 'CAJADO MÁGICO', arco: 'ARCO / BESTA', acessorio: 'ACESSÓRIO', capacete: 'CAPACETE', calca: 'CALÇA' };
      const SLOTS = [['weapon', 'ARMA'], ['armor', 'ARMADURA'], ['body', 'ROUPA'], ['accessory', 'ACESSÓRIO'], ['helmet', 'CAPACETE'], ['pants', 'CALÇA']];
      const rarOf = (it) => it?.rarity || OLD[itemRarity(it)] || 'comum';
      const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      if (!state.equipment) state.equipment = {};
      if (selId === undefined) selId = this._invSel || null;
      if (selId && !state.inventory.some((i) => i.item_id === selId)) selId = null;
      // sem seleção: pré-seleciona o 1º equipável não equipado (EQUIPAR já visível, como no inventário antigo)
      if (!selId) selId = state.inventory.find((i) => !i.equipped && state._items[i.item_id]?.equip_slot)?.item_id || null;
      this._invSel = selId;
      const slotHtml = SLOTS.map(([k, label]) => {
        const id = state.equipment[k];
        const it = id && state._items[id];
        const r = it ? RAR[rarOf(it)] : null;
        return `<button type="button" class="inv-slot${it ? ' on' : ''}${selId && selId === id ? ' sel' : ''}" data-inv-slot="${k}" ${it ? `data-inv-item="${id}" style="--rc:${r[1]}"` : ''}>
          <span class="inv-slot-k">${label}</span>${it ? `<span class="inv-ico" data-item-icon="${id}"></span><span class="inv-slot-n">${esc(it.name)}</span>` : '<span class="inv-slot-e">vazio</span>'}</button>`;
      }).join('');
      const cells = state.inventory.map((sl) => {
        const it = state._items[sl.item_id];
        const r = RAR[rarOf(it)];
        return `<button type="button" class="inv-cell${sl.equipped ? ' eq' : ''}${selId === sl.item_id ? ' sel' : ''}" data-inv-item="${sl.item_id}" style="--rc:${r[1]}" title="${esc(it?.name || sl.item_id)}">
          <span class="inv-ico" data-item-icon="${sl.item_id}"></span>${sl.qty > 1 ? `<b class="inv-q">${sl.qty}</b>` : ''}${sl.equipped ? '<i class="inv-e">E</i>' : ''}</button>`;
      }).join('') || '<p class="inv-empty">Vazio.</p>';
      let det = '<p class="inv-hint">Toque num item para ver os detalhes.</p>';
      if (selId) {
        const sl = state.inventory.find((i) => i.item_id === selId);
        const it = state._items[selId];
        const rk = rarOf(it); const r = RAR[rk];
        const st = it?.stats || {};
        const attrTxt = it?.attrs ? attrLines(it, state._data?.arsenal?.atributos).map((l) => l.text.toUpperCase()).join(' · ') : '';
        const stats = attrTxt ? `${attrTxt}${st.ranged ? ' · À DISTÂNCIA' : ''}` : [st.ataque ? `+${st.ataque} ATAQUE` : '', st.defesa ? `+${st.defesa} DEFESA` : '', st.ranged ? 'À DISTÂNCIA' : '', it?.consumable?.hp ? `+${it.consumable.hp} HP` : '', it?.consumable?.nexa ? `+${it.consumable.nexa} NEXA` : ''].filter(Boolean).join(' · ');
        const cat = CAT[it?.category] || (it?.equip_slot ? it.equip_slot.toUpperCase() : (it?.type || '').toUpperCase());
        const btns = [];
        if (it?.type === 'consumable') btns.push(`<button type="button" data-inv-act="use" data-id="${selId}">USAR</button>`);
        if (it?.equip_slot) btns.push(sl?.equipped ? `<button type="button" data-inv-act="unequip" data-slot="${it.equip_slot}">REMOVER</button>` : `<button type="button" class="primary" data-inv-act="equip" data-act="equip" data-id="${selId}">EQUIPAR</button>`);
        if (it?.discardable !== false && !sl?.equipped) btns.push(`<button type="button" data-inv-act="discard" data-id="${selId}">DESCARTAR</button>`);
        det = `<div class="inv-det-head" style="--rc:${r[1]}"><span class="inv-ico big" data-item-icon="${selId}"></span><div><b>${esc(it?.name || selId)}</b><small><span class="inv-rar">${r[0]}</span> · ${esc(cat)}${sl?.qty > 1 ? ` · ×${sl.qty}` : ''}</small></div></div>
          ${stats ? `<p class="inv-stats">${stats}</p>` : ''}<p class="inv-desc">${esc(it?.description || '')}</p>
          ${it?.lore ? `<p class="inv-lore">“${esc(it.lore)}”</p>` : ''}${it?.build ? `<p class="inv-build">BUILD: <b>${esc(it.build)}</b>${it.passiva ? ` · <i>${esc(it.passiva)}</i>` : ''}</p>` : ''}
          <div class="inv-acts">${btns.join('')}</div>`;
      }
      const eqs = getEquippedStats(state);
      const html = `<div class="inv2" id="inv2">
        <div class="inv-slots">${slotHtml}</div>
        <p class="inv-tot">Equipado: <b>+${eqs.weaponAtk} ATQ</b> · <b>+${eqs.armorDef} DEF</b> · Créditos ${countItem(state.inventory, 'item_credito_g6')}</p>
        <div class="inv-cells">${cells}</div>
        <div class="inv-det" id="inv-det">${det}</div></div>`;
      this.openModal('Inventário', html);
      document.getElementById('modal-overlay')?.querySelector('.modal')?.classList.add('nx-inv-modal');
      setTimeout(() => {
        paintItemIcons(state);
        document.querySelectorAll('#inv2 [data-inv-item]').forEach((el) => {
          el.onclick = () => this.openInventory(el.getAttribute('data-inv-item'));
        });
        document.querySelectorAll('#inv2 [data-inv-act]').forEach((el) => {
          el.onclick = () => {
            const act = el.getAttribute('data-inv-act');
            const id = el.getAttribute('data-id');
            const st = getState();
            if (act === 'use') useItem(st, id);
            if (act === 'equip') equipItem(st, id);
            if (act === 'unequip') unequipItem(st, el.getAttribute('data-slot'));
            if (act === 'discard') { discardItem(st, id); this._invSel = null; }
            if (!isArenaState(st)) { try { saveToLocal(st); } catch { /* sem armazenamento */ } }
            hooks?.onInventoryChange?.(st, act, id);
            this.openInventory();
            this.refresh();
          };
        });
      }, 0);
    },
    openCharacter() {
      const p = getState().player;
      const race = getState()._data.races.races.find((r) => r.id === p.raceId);
      this.openModal(
        'Personagem',
        `<p><strong>${p.name}</strong> — ${race?.name}</p>
         <p>Nível ${p.nivel} | XP ${p.xp}/${p.xpNext}</p>
         <p>HP ${p.hp}/${p.hpMax} | Nexa ${p.nexa}/${p.nexaMax}</p>
         <p>ATK ${p.ataque} DEF ${p.defesa} DIST ${p.distancia} VEL ${p.velocidade}</p>
         <p style="margin-top:0.5rem;color:var(--muted)">Zona: ${(() => { const z = getState()._data.zones.zones.find((zz) => zz.id === getState().zoneId); return z ? z.code + ' ' + z.name : '—'; })()}</p>`
      );
    },
    openSkills() {
      const p = getState().player;
      let html = '<div class="skill-list">';
      for (const [id, sk] of Object.entries(p.skills)) {
        const def = getState()._data.skills.skills.find((s) => s.id === id);
        html += `<div class="skill-row"><canvas class="skill-icon-canvas" data-skill-icon="${id}" width="28" height="28"></canvas><span>${def?.name || id}</span><span>Nv.${sk.level} (xp ${sk.xp})</span></div>`;
      }
      html += '</div>';
      this.openModal('Skills', html);
      setTimeout(() => paintSkillIcons(), 0);
    },
    openQuests() {
      const state = getState();
      let html = '<h4 style="color:var(--accent2)">Ativas</h4>';
      if (!state.quests.active.length) html += '<p>Nenhuma.</p>';
      for (const id of state.quests.active) {
        const q = state._quests[id];
        const prog = state.quests.progress[id] || {};
        html += `<div class="arquivo-entry known"><strong>${q.name}</strong><br>${q.description}<ul>`;
        for (const s of q.steps) {
          html += `<li>${prog[s.id] ? '✓' : '○'} ${s.text}</li>`;
        }
        html += '</ul></div>';
      }
      html += '<h4 style="color:var(--muted);margin-top:0.8rem">Concluídas</h4>';
      for (const id of state.quests.completed) {
        html += `<div class="arquivo-entry known">${state._quests[id].name}</div>`;
      }
      this.openModal('Quests', html);
    },
    openArquivo() {
      const a = getState().arquivo;
      let html = '';
      for (const cat of CATEGORIES) {
        html += `<div class="arquivo-cat"><h4>${cat}</h4>`;
        for (const [id, entry] of Object.entries(a[cat] || {})) {
          const known = entry.known;
          html += `<div class="arquivo-entry ${known ? 'known' : ''}"><strong>${label(entry)}</strong>`;
          if (known) html += `<br><small>${entry.text}</small>`;
          html += '</div>';
        }
        html += '</div>';
      }
      this.openModal('Arquivo Nexara', html);
    },
    openSettings() {
      const self = this;
      const has = !!getState();
      this.openModal(
        'Configurações',
        `<p>Salvar local (localStorage) e exportar JSON.</p>
         <p style="color:var(--muted);font-size:0.85rem">Áudio / teclas avançadas / multijogador: EM DESENVOLVIMENTO</p>
         <div style="margin-top:0.8rem;display:flex;flex-direction:column;gap:0.4rem">
           <button id="cfg-save" class="primary" ${has ? '' : 'disabled'}>Salvar Agora</button>
           <button id="cfg-export" ${has ? '' : 'disabled'}>Exportar JSON</button>
           <label style="font-size:0.85rem">Importar JSON <input type="file" id="cfg-import" accept="application/json" /></label>
         </div>`,
        [{ label: 'Fechar' }]
      );
      setTimeout(() => {
        const saveBtn = document.getElementById('cfg-save');
        const expBtn = document.getElementById('cfg-export');
        if (saveBtn) saveBtn.onclick = () => {
          if (!getState()) return self.showToast('Nenhum jogo ativo.');
          if (isArenaState(getState())) return self.showToast('Arena não grava no save do mundo.');
          saveToLocal(getState());
          self.showToast('Salvo no navegador.');
        };
        if (expBtn) expBtn.onclick = () => {
          if (!getState()) return self.showToast('Nenhum jogo ativo.');
          if (isArenaState(getState())) return self.showToast('Arena não exporta save do mundo.');
          downloadJson(getState());
        };
        document.getElementById('cfg-import').onchange = async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          try {
            const data = await importJsonFile(f);
            hooks.onImport?.(data);
            self.showToast('Save importado.');
            self.closeModal();
          } catch {
            self.showToast('JSON inválido.');
          }
        };
      }, 0);
    },
    openDevMenu() {
      this.showToast('EM DESENVOLVIMENTO');
    }
  };
  bindViewportResize(getState, () => ui.refresh());
  return ui;
}

export function paintItemIcons(state) {
  document.querySelectorAll('[data-item-icon]').forEach((wrap) => {
    const id = wrap.getAttribute('data-item-icon');
    let c = wrap.querySelector('canvas');
    if (!c) {
      c = document.createElement('canvas');
      c.width = 56;
      c.height = 56;
      wrap.appendChild(c);
    }
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 56, 56);
    ctx.fillStyle = '#0d1218';
    ctx.fillRect(0, 0, 56, 56);
    ctx.save(); ctx.scale(2, 2); drawItemIcon(ctx, 0, 0, 28, state._items[id]); ctx.restore();
  });
}

function paintSkillIcons() {
  document.querySelectorAll('[data-skill-icon]').forEach((c) => {
    const id = c.getAttribute('data-skill-icon');
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    drawSkillIcon(ctx, 0, 0, c.width, id);
  });
}

function updateSkillBar(state) {
  const bar = document.getElementById('skill-bar');
  if (!bar) return;
  const skills = Object.keys(state.player.skills);
  const slots = bar.querySelectorAll('.skill-slot');
  slots.forEach((slot, i) => {
    const id = skills[i];
    const canvas = slot.querySelector('canvas');
    const key = slot.querySelector('.sk-key');
    const name = slot.querySelector('.sk-name');
    if (!id) {
      slot.classList.add('empty');
      if (name) name.textContent = '—';
      return;
    }
    slot.classList.remove('empty');
    const def = state._data.skills.skills.find((s) => s.id === id);
    const sk = state.player.skills[id];
    const skey = `${id}|${sk.level}|${canvas ? canvas.width : 0}`;
    if (slot._nxKey === skey) return;
    slot._nxKey = skey;
    if (name) name.textContent = `${def?.name || id} ${sk.level}`;
    if (key) key.textContent = String(i + 1);
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawSkillIcon(ctx, 0, 0, canvas.width, id);
    }
  });
}

/** EVO: HUD só escreve no DOM o que mudou (sem layout/innerHTML por chamada). */
const hudCache = Object.create(null);
function setText(id, txt) {
  if (hudCache[id] === txt) return;
  const el = document.getElementById(id);
  if (!el) return;
  hudCache[id] = txt;
  el.textContent = txt;
}
function updateHud(state) {
  const p = state.player;
  setBar('hp-bar', p.hp, p.hpMax);
  setBar('nexa-bar', p.nexa, p.nexaMax);
  nexaFx(p.nexa, p.nexaMax);
  setBar('xp-bar', p.xp, p.xpNext);
  setText('hud-hp-text', `${p.hp}/${p.hpMax}`);
  setText('hud-nexa-text', `${p.nexa}/${p.nexaMax}`);
  setText('hud-level', `Nv.${p.nivel}`);
  setText('hud-xp-text', `${p.xp}/${p.xpNext}`);
  setText('hud-name', p.name);
  const skTxt = Object.entries(p.skills)
    .map(([id, s]) => `${id.slice(0, 3)}:${s.level}`)
    .join(' ');
  setText('hud-skills', skTxt);
  const portrait = document.getElementById('hud-portrait');
  const hp3 = rendererRef?.getHeroPortrait?.() || null;
  const pkey = `${p.raceId}|${portrait ? portrait.width : 0}x${portrait ? portrait.height : 0}|${spriteCount()}|${hp3 ? hp3.version : 0}`;
  if (portrait && hudCache.portrait !== pkey && hp3) {
    // M3D: retrato renderizado do modelo 3D do herói (estilo + equipamento)
    hudCache.portrait = pkey;
    const ctx = portrait.getContext('2d');
    ctx.clearRect(0, 0, portrait.width, portrait.height);
    ctx.drawImage(hp3.canvas, 0, 0, portrait.width, portrait.height);
    portrait.dataset.src = 'model3d';
  } else if (portrait && hudCache.portrait !== pkey) {
    hudCache.portrait = pkey;
    portrait.dataset.src = 'sprite';
    const ctx = portrait.getContext('2d');
    ctx.clearRect(0, 0, portrait.width, portrait.height);
    ctx.fillStyle = '#121820';
    ctx.fillRect(0, 0, portrait.width, portrait.height);
    ctx.save();
    ctx.translate(portrait.width / 2, portrait.height - 4);
    ctx.scale(0.85, 0.85);
    drawPlayer(ctx, 0, 0, p.raceId, 'idle', 0);
    ctx.restore();
  }
}

/** M10 passo 3 — energia NEXA: pulso ao gastar, aura quando cheia (classes CSS; nada por quadro). */
let nexaPrev = null; const nexaFxStats = { spends: 0, full: false };
function nexaFx(v, max) {
  const el = document.getElementById('nexa-bar'); if (!el) return;
  if (nexaPrev != null && v < nexaPrev - 0.5) { el.classList.remove('nx-nexa-spend'); void el.offsetWidth; el.classList.add('nx-nexa-spend'); nexaFxStats.spends++; }
  const full = max > 0 && v >= max - 0.01; if (full !== nexaFxStats.full) { nexaFxStats.full = full; el.classList.toggle('nx-nexa-full', full); }
  nexaPrev = v;
}
export const getNexaFxStats = () => ({ ...nexaFxStats });
function setBar(id, v, max) {
  const w = `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
  if (hudCache[`bar:${id}`] === w) return;
  const el = document.querySelector(`#${id} > span`);
  if (el) { el.style.width = w; hudCache[`bar:${id}`] = w; }
}

function setHtml(el, key, html) {
  if (hudCache[key] === html) return;
  hudCache[key] = html;
  el.innerHTML = html;
}
function updateQuest(state) {
  const box = document.getElementById('current-quest');
  const id = state.quests.active[0];
  if (!id) {
    setHtml(box, 'quest', isArenaState(state)
      ? '<em style="opacity:0.8">Nenhuma quest ativa</em>'
      : '<em>Nenhuma quest ativa</em>');
    return;
  }
  const q = state._quests[id];
  const prog = state.quests.progress[id] || {};
  const next = q.steps.find((s) => !prog[s.id]);
  setHtml(box, 'quest', `<strong>${q.name}</strong><br>${next ? next.text : 'Objetivos concluídos — reporte!'}`);
}

function updateLog(state) {
  const el = document.getElementById('log');
  const lines = state.log.slice(-5);
  const n = lines.length;
  const lkey = `${state.log.length}|${n ? lines[n - 1].msg : ''}|${n ? lines[0].msg : ''}`;
  if (hudCache.logKey === lkey && el.childElementCount === n) return;
  hudCache.logKey = lkey;
  el.innerHTML = lines
    .map((l, i) => {
      const age = n - 1 - i;
      const fade = age === 0 ? 'fresh' : age === 1 ? 'mid' : '';
      return `<div class="log-line ${fade} ${l.cls || ''}">${l.msg}</div>`;
    })
    .join('');
}

function updateHotkeys() {
  setText('hotkeys', 'WASD relativo ao olhar · mouse look (clique) · F falar · ATAQUE/click · I/C/Q/K/J · Esc libera look/menu');
}

export function resizeCanvasToZone(state) {
  // Camera renderer owns canvas buffer size; keep function for callers
  rendererRef?.refresh?.();
}

let _resizeBound = false;
export function bindViewportResize(getState, refresh) {
  if (_resizeBound) return;
  _resizeBound = true;
  let t = 0;
  const onResize = () => {
    clearTimeout(t);
    t = setTimeout(() => {
      const st = getState?.();
      if (!st) return;
      refresh?.();
    }, 80);
  };
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
}
