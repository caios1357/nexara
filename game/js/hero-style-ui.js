/**
 * NEXARA — ESCOLHA DE ESTILO + EDITOR DO HERÓI (cosmético). 4 estilos iniciais; editor de cor primária,
 * cor do brilho (Nexa), capacete/chapéu, capa e modelo da espada. Salvo em player.heroStyle + player.heroCustom.
 * Prévia 3D ao vivo (hero-preview.js, contexto próprio só enquanto aberto).
 */
import { HERO_STYLES, heroStyleOf } from './hero-styles.js?v=20261003arena';

export const PRIMARY_SWATCHES = [0x3a4658, 0x26303c, 0x5a2a2a, 0x2a4a3a, 0x463a5c, 0x5a4a3a, 0x2a3a6a, 0x6a6a72];
export const GLOW_SWATCHES = [0x3a9cff, 0x39f0ff, 0x46ff8a, 0xb46aff, 0xff8a2a, 0xff3a5a, 0xffd34a];
export const WEAPONS = [['1H_Sword', 'Espada longa'], ['2H_Sword', 'Montante'], ['Knife', 'Lâminas curtas'], ['1H_Axe', 'Machado de sucata']];
const hex = (n) => `#${Number(n).toString(16).padStart(6, '0')}`;

/**
 * @param {HTMLElement} box
 * @param {{ styleId?: string, custom?: object, equip?: object, preview?: boolean, onChange?: (v:{styleId:string, custom:object}) => void }} o
 *  preview:false (VESTIÁRIO) → só os controles; quem monta desenha a prévia (1 contexto WebGL só)
 */
export function mountHeroStyleEditor(box, o = {}) {
  let styleId = heroStyleOf(o.styleId || 'cavaleiro').id;
  let custom = { ...(o.custom || {}) };
  let preview = null;
  const withPreview = o.preview !== false;
  box.innerHTML = `<div class="hse${withPreview ? '' : ' hse-embed'}">
    ${withPreview ? '<div class="hse-prev"><canvas id="hse-canvas" aria-label="Prévia 3D do herói"></canvas><span class="hse-prev-n" id="hse-name"></span></div>' : '<span class="hse-prev-n" id="hse-name" hidden></span>'}
    <div class="hse-side">
      <div class="hse-styles" id="hse-styles">${HERO_STYLES.map((s) => `<button type="button" class="hse-style" data-style="${s.id}" style="--sc:${s.css}"><b>${s.name}</b><small>${s.tag}</small></button>`).join('')}</div>
      <p class="hse-lore" id="hse-lore"></p>
      <div class="hse-row"><span>COR</span><div class="hse-sw" id="hse-primary">${PRIMARY_SWATCHES.map((c) => `<button type="button" data-c="${c}" style="background:${hex(c)}" aria-label="cor ${hex(c)}"></button>`).join('')}</div></div>
      <div class="hse-row"><span>BRILHO</span><div class="hse-sw" id="hse-glow">${GLOW_SWATCHES.map((c) => `<button type="button" data-c="${c}" style="background:${hex(c)};box-shadow:0 0 8px ${hex(c)}" aria-label="brilho ${hex(c)}"></button>`).join('')}</div></div>
      <div class="hse-row"><span>PEÇAS</span><div class="hse-tg"><button type="button" id="hse-head">CAPACETE</button><button type="button" id="hse-cape">CAPA</button></div></div>
      <div class="hse-row"><span>ESPADA</span><div class="hse-tg" id="hse-weapon">${WEAPONS.map(([id, n]) => `<button type="button" data-w="${id}">${n}</button>`).join('')}</div></div>
      <button type="button" class="hse-reset" id="hse-reset">Cores do estilo</button>
    </div></div>`;
  const $ = (id) => box.querySelector(`#${id}`);
  function eff() {
    const s = heroStyleOf(styleId);
    return { primary: custom.primary ?? s.primary, glow: custom.glow ?? s.glow, head: custom.head ?? true, cape: custom.cape ?? s.capeOn, weapon: custom.weapon || s.weapon, hasHead: !!s.head };
  }
  function paint() {
    const s = heroStyleOf(styleId); const e = eff();
    box.querySelectorAll('.hse-style').forEach((b) => b.classList.toggle('on', b.dataset.style === styleId));
    box.querySelectorAll('#hse-primary button').forEach((b) => b.classList.toggle('on', +b.dataset.c === e.primary));
    box.querySelectorAll('#hse-glow button').forEach((b) => b.classList.toggle('on', +b.dataset.c === e.glow));
    box.querySelectorAll('#hse-weapon button').forEach((b) => b.classList.toggle('on', b.dataset.w === e.weapon));
    const hb = $('hse-head'); hb.classList.toggle('on', e.head && e.hasHead); hb.disabled = !e.hasHead; hb.textContent = s.head ? (/Hat/.test(s.head) ? 'CHAPÉU' : 'CAPACETE') : 'SEM CAPACETE';
    $('hse-cape').classList.toggle('on', !!e.cape);
    $('hse-name').textContent = s.name;
    $('hse-name').style.color = hex(e.glow);
    $('hse-lore').textContent = s.lore;
    preview?.set(styleId, custom, o.equip || {});
    o.onChange?.({ styleId, custom: { ...custom } });
  }
  box.querySelectorAll('.hse-style').forEach((b) => { b.onclick = () => { styleId = b.dataset.style; custom = {}; paint(); }; });
  box.querySelectorAll('#hse-primary button').forEach((b) => { b.onclick = () => { custom.primary = +b.dataset.c; paint(); }; });
  box.querySelectorAll('#hse-glow button').forEach((b) => { b.onclick = () => { custom.glow = +b.dataset.c; paint(); }; });
  box.querySelectorAll('#hse-weapon button').forEach((b) => { b.onclick = () => { custom.weapon = b.dataset.w; paint(); }; });
  $('hse-head').onclick = () => { custom.head = !eff().head; paint(); };
  $('hse-cape').onclick = () => { custom.cape = !eff().cape; paint(); };
  $('hse-reset').onclick = () => { custom = {}; paint(); };
  if (withPreview) import('./fps/hero-preview.js?v=20261003arena').then((m) => {
    if (!box.isConnected) return;
    try { preview = m.createHeroPreview($('hse-canvas')); preview.set(styleId, custom, o.equip || {}); } catch (e) { console.warn('[estilo] prévia 3D indisponível', e); }
  }).catch(() => {});
  paint();
  return {
    value: () => ({ styleId, custom: { ...custom } }),
    /** VESTIÁRIO: equipamento mudou → prévia própria (se houver) acompanha */
    setEquip(eq) { o.equip = eq || {}; preview?.set(styleId, custom, o.equip); },
    /** aplica um estilo salvo (loadout) sem recriar o editor */
    setValue(v) { if (!v) return; styleId = heroStyleOf(v.styleId || styleId).id; custom = { ...(v.custom || {}) }; paint(); },
    previewInfo: () => preview?.info() || null,
    dispose() { preview?.dispose(); preview = null; }
  };
}
