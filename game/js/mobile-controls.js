/**
 * Controles mobile — gp1 (Bloco 1).
 *
 * - JOYSTICK virtual permanente (canto inferior esquerdo) com área de toque maior
 *   que o círculo visual, zona morta, sensibilidade, curva, raio máximo e retorno
 *   automático ao centro. Tipo 'fixed' (padrão) ou 'floating' (gameplay-config).
 * - ÁREA OLHAR: metade direita da tela arrasta a câmera (anel OLHAR = indicador).
 * - Multi-touch por pointerId (= identificador do toque) + pointer capture:
 *   o dedo do joystick NUNCA move a câmera e vice-versa. touchcancel /
 *   lostpointercapture / blur / aba oculta liberam tudo de forma limpa.
 * - Ao soltar o joystick o movementInput vai a ZERO na hora (o herói freia com a
 *   desaceleração curta do player-motion, sem deslizar).
 * - Sem loop próprio e sem tryMove aqui: player-motion.js é o único dono do
 *   movimento (chamado pelo rAF único do renderer).
 */
import { interactAdjacent, talkNpc } from './actions.js?v=20261009forte';
import { pushLog } from './state.js?v=20261009forte';
import { isArenaState } from './arena.js?v=20261009forte';
import { getConfig, onConfigChange, detectTouchMode } from './gameplay-config.js?v=20261009forte';
import { ICONS } from './icons.js?v=20261009forte';

/**
 * Bloco 6: 5 botões de combate na tela — ATAQUE (anel) + ESQUIVA + GOLPE PODEROSO + ÁREA + SUPREMA.
 * DASH saiu (ESQUIVA durante o combo vira a INVESTIDA), ALVO saiu (tocar no inimigo trava/solta),
 * DEFESA só aparece com "Mostrar botão DEFESA" (buttons.showDefend). Custos vêm do config.
 */
function actionButtonDefs() {
  const sp = getConfig().specials;
  return [
    { id: 'dodge', icon: 'esquiva', label: 'ESQUIVA', title: `Esquiva (Espaço) · no combo com Nexa ≥ ${sp.dash.cost}: ${sp.dash.nome}`, cost: 0 },
    { id: 'defend', icon: 'defesa', label: 'DEFESA', title: 'Defesa — segure (Q / botão direito)', cost: 0 },
    { id: 'golpe_poderoso', icon: 'golpe_poderoso', label: 'GOLPE', title: `Especial 1 — ${sp.golpe_poderoso.nome} (1)`, cost: sp.golpe_poderoso.cost },
    { id: 'ataque_area', icon: 'ataque_area', label: 'ÁREA', title: `Especial 2 — ${sp.ataque_area.nome} (2)`, cost: sp.ataque_area.cost },
    { id: 'suprema', icon: 'suprema', label: 'SUPREMA', title: `${sp.suprema.nome} (R)`, cost: sp.suprema.cost }
  ];
}
const SPECIAL_BTN = new Set(['golpe_poderoso', 'ataque_area', 'suprema']);

export function createMobileControls(hooks) {
  const ACTION_BUTTONS = actionButtonDefs();
  const {
    getState,
    getBusy,
    onInteract,
    onToast,
    onStick,
    onLookDelta,
    onAttackPress,
    onAttackRelease
  } = hooks;
  /*
   * gp3 — ANALÓGICO DIREITO HÍBRIDO (câmera + ataque), cluster inferior direito:
   * anel do analógico com o botão ATAQUE preso na borda inferior-esquerda e os
   * poderes em arco em volta (layoutCluster). Um gesto = OU câmera OU ataque:
   *  - toque rápido no anel (dist < minDragDistance e duração < tapRecognitionTime) → hooks.onLookTap
   *  - arrastar (anel, ATAQUE ou resto da metade direita) → câmera; enquanto ainda
   *    pode ser toque a câmera NÃO gira (deltas guardados e aplicados ao virar arrasto)
   *  - começou no ATAQUE e arrastou → hooks.onAttackDragCancel (cancela golpe no preparo) + câmera
   *  - resto da metade direita: só câmera (toque ali não ataca).
   */
  let forceVisible = !!hooks.forceVisible;

  let root = null;
  let joyZone = null;
  let joy = null;
  let knob = null;
  let lookZone = null;
  let lookKnob = null;
  let visible = false;

  // Estado do joystick (sem alocação por evento)
  const stick = { id: null, cx: 0, cy: 0, rawX: 0, rawY: 0, x: 0, y: 0 };
  // Estado da área de olhar
  // Estado da área de olhar (+ gesto: distância total / duração → gancho toque×arrasto)
  const look = { id: null, lastX: 0, lastY: 0, downX: 0, downY: 0, downT: 0, travel: 0,
    committed: false, pendX: 0, pendY: 0, onStick: false, fromAttack: false, el: null };
  const lookGesture = { distPx: 0, travelPx: 0, durationMs: 0, x: 0, y: 0, cancelled: false, tap: false, onStick: false, fromAttack: false };
  const lastGesture = { kind: '', distPx: 0, durationMs: 0, at: 0 };

  // ——— Bloco 5: layout personalizado (editor) + escala/opacidade do menu Controles ———
  let previewItems = null; // layout temporário enquanto o editor está aberto
  function orientKey() {
    const W = root?.clientWidth || innerWidth;
    const H = root?.clientHeight || innerHeight;
    return W > H ? 'landscape' : 'portrait';
  }
  function curLayout() {
    return previewItems || getConfig().layout[orientKey()] || {};
  }
  /** Geometria efetiva do joystick (px): raio da base, curso, centro (se movido), opacidade. */
  function joyGeom() {
    const j = getConfig().joystick;
    const ov = curLayout().joystick || {};
    const sc = j.sizeScale * (ov.s ?? 1);
    return { r: j.baseRadius * sc, maxR: j.maxRadius * sc, ov, op: (ov.o ?? 1) * getConfig().buttons.opacity };
  }

  function applyCssVars() {
    if (!root) return;
    const j = getConfig().joystick;
    const g = joyGeom();
    let ml = j.marginLeft;
    let mb = j.marginBottom;
    if (g.ov.x != null) {
      const W = root.clientWidth || innerWidth;
      const H = root.clientHeight || innerHeight;
      const em = getConfig().layoutEditor.edgeMarginPx;
      const cx = Math.max(g.r + em, Math.min(W - g.r - em, g.ov.x * W));
      const cy = Math.max(g.r + em, Math.min(H - g.r - em, g.ov.y * H));
      ml = cx - g.r;
      mb = H - cy - g.r;
    }
    root.style.setProperty('--mc-joy-r', `${g.r.toFixed(1)}px`);
    root.style.setProperty('--mc-joy-pad', `${j.hitPadding}px`);
    root.style.setProperty('--mc-joy-ml', `${ml.toFixed(1)}px`);
    root.style.setProperty('--mc-joy-mb', `${mb.toFixed(1)}px`);
    root.style.setProperty('--mc-joy-return', `${j.returnMs}ms`);
    root.classList.toggle('mc-joy-floating', j.type === 'floating');
    if (joy) joy.style.opacity = g.op < 0.999 ? g.op.toFixed(2) : '';
  }

  function ensureDom() {
    if (root) return;
    root = document.createElement('div');
    root.id = 'mobile-controls';
    root.className = 'mobile-controls hidden';
    root.innerHTML = `
      <div class="mc-look-zone" id="mc-look-zone" aria-label="Câmera (arraste) · toque no anel = ataque">
        <div class="mc-look" id="mc-look" aria-hidden="true">
          <div class="mc-look-base"></div>
          <div class="mc-look-knob" id="mc-look-knob"></div>
          <span class="mc-look-label">CÂMERA + ATAQUE</span>
        </div>
      </div>
      <div class="mc-joy-zone" id="mc-joy-zone" aria-label="Joystick de movimento">
        <div class="mc-joy" id="mc-joy">
          <div class="mc-joy-base"></div>
          <span class="mc-joy-arrow mc-ja-n">${ICONS.seta}</span><span class="mc-joy-arrow mc-ja-e">${ICONS.seta}</span><span class="mc-joy-arrow mc-ja-s">${ICONS.seta}</span><span class="mc-joy-arrow mc-ja-w">${ICONS.seta}</span>
          <div class="mc-joy-knob" id="mc-joy-knob"></div>
          <span class="mc-joy-label">MOVER</span>
        </div>
      </div>
      <div class="mc-powers" id="mc-powers" aria-label="Ações">
        ${ACTION_BUTTONS.map((b) => `
        <button type="button" class="mc-btn mc-act mc-act-${b.id}" data-power="${b.id}" data-act="${b.id}" title="${b.title}">
          <span class="mc-ico">${ICONS[b.icon]}</span>
          <span class="mc-lbl">${b.label}</span>
          ${b.cost ? `<span class="mc-cost" data-cost="${b.id}">${b.cost}</span>` : ''}
          ${b.id === 'dodge' ? '<span class="mc-dash-pip" aria-hidden="true"></span>' : ''}
          <span class="mc-cd" aria-hidden="true"><span class="mc-cd-s"></span></span>
        </button>`).join('')}
        <button type="button" class="mc-btn mc-attack" data-power="attack" title="Ataque">
          <span class="mc-ico">${ICONS.espada}</span>
          <span class="mc-lbl">ATAQUE</span>
        </button>
        <button type="button" class="mc-btn mc-interact" data-power="interact" title="Interagir">
          <span class="mc-ico">💬</span>
          <span class="mc-lbl">Falar</span>
        </button>
      </div>
    `;
    const wrap = document.getElementById('canvas-wrap') || document.getElementById('game-screen');
    (wrap || document.body).appendChild(root);

    joyZone = root.querySelector('#mc-joy-zone');
    joy = root.querySelector('#mc-joy');
    knob = root.querySelector('#mc-joy-knob');
    lookZone = root.querySelector('#mc-look-zone');
    lookKnob = root.querySelector('#mc-look-knob');
    applyCssVars();

    joyZone.addEventListener('pointerdown', onJoyDown, { passive: false });
    joyZone.addEventListener('pointermove', onJoyMove, { passive: false });
    joyZone.addEventListener('pointerup', onJoyUp, { passive: false });
    joyZone.addEventListener('pointercancel', onJoyUp, { passive: false });
    joyZone.addEventListener('lostpointercapture', onJoyUp);

    lookZone.addEventListener('pointerdown', onLookDown, { passive: false });
    lookZone.addEventListener('pointermove', onLookMove, { passive: false });
    lookZone.addEventListener('pointerup', onLookUp, { passive: false });
    lookZone.addEventListener('pointercancel', onLookUp, { passive: false });
    lookZone.addEventListener('lostpointercapture', onLookUp);

    // Bloqueia gestos do navegador (scroll / zoom / menu) sobre os controles
    root.addEventListener('touchstart', preventTouch, { passive: false });
    root.addEventListener('touchmove', preventTouch, { passive: false });
    root.addEventListener('contextmenu', (e) => e.preventDefault());

    // gp2: UM caminho de entrada por botão = pointerdown (sem click/touchstart
    // extras). preventTouch cancela o touchstart dos botões, o que também
    // suprime os eventos de mouse/click emulados → um toque = um comando.
    root.querySelectorAll('[data-power]').forEach((btn) => {
      const id = btn.getAttribute('data-power');
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (id === 'attack') {
          if (attackPointer != null && attackPointer !== e.pointerId) return; // 2º dedo no mesmo botão
          attackPointer = e.pointerId;
          try { btn.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
          btn.classList.add('mc-pressed');
          // gp3: o mesmo dedo pode virar câmera se arrastar (cluster híbrido)
          if (look.id == null) beginGesture(e, btn, { fromAttack: true, onStick: false });
        }
        if (id === 'defend') {
          if (defendPointer != null && defendPointer !== e.pointerId) return;
          defendPointer = e.pointerId;
          try { btn.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
          btn.classList.add('mc-pressed');
          hooks.onDefend?.(true);
          return;
        }
        if (id !== 'attack' && id !== 'interact') {
          btn.classList.add('mc-pressed');
          clearTimeout(btn._nxT);
          btn._nxT = setTimeout(() => btn.classList.remove('mc-pressed'), 140);
        }
        handlePower(id);
      }, { passive: false });
      if (id === 'defend') {
        const up = (e) => {
          if (defendPointer == null || (e.pointerId != null && e.pointerId !== defendPointer)) return;
          defendPointer = null;
          btn.classList.remove('mc-pressed');
          hooks.onDefend?.(false);
        };
        btn.addEventListener('pointerup', up);
        btn.addEventListener('pointercancel', up);
        btn.addEventListener('lostpointercapture', up);
      }
      if (id === 'attack') {
        btn.addEventListener('pointermove', (e) => {
          if (e.pointerId === look.id && look.fromAttack) moveGesture(e);
        }, { passive: false });
        const up = (e) => {
          if (attackPointer == null || (e.pointerId != null && e.pointerId !== attackPointer)) return;
          attackPointer = null;
          btn.classList.remove('mc-pressed');
          onAttackRelease?.();
          if (look.id === e.pointerId && look.fromAttack) releaseLook(e.type !== 'pointerup', e);
        };
        btn.addEventListener('pointerup', up);
        btn.addEventListener('pointercancel', up);
        btn.addEventListener('lostpointercapture', up);
      }
    });
  }
  let attackPointer = null;
  let defendPointer = null;
  const lookTaps = { lastAt: -1e9, doubleTaps: 0, swipes: 0, taps: 0 };

  function preventTouch(e) {
    if (e.cancelable) e.preventDefault();
  }

  // ——— JOYSTICK ———
  function onJoyDown(e) {
    e.preventDefault();
    e.stopPropagation();
    if (stick.id != null && stick.id !== e.pointerId) return; // um dedo por vez
    stick.id = e.pointerId;
    try { joyZone.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    const cfg = getConfig().joystick;
    if (cfg.type === 'floating') {
      // Base nasce sob o dedo (limitada para caber na zona)
      const zr = joyZone.getBoundingClientRect();
      const r = joyGeom().r;
      const lx = Math.max(r, Math.min(zr.width - r, e.clientX - zr.left));
      const ly = Math.max(r, Math.min(zr.height - r, e.clientY - zr.top));
      joy.style.left = `${lx - r}px`;
      joy.style.top = `${ly - r}px`;
      joy.style.bottom = 'auto';
      stick.cx = zr.left + lx;
      stick.cy = zr.top + ly;
    } else {
      const jr = joy.getBoundingClientRect();
      stick.cx = jr.left + jr.width / 2;
      stick.cy = jr.top + jr.height / 2;
    }
    root.classList.add('mc-joy-active');
    knob.classList.remove('mc-returning');
    updateStick(e.clientX, e.clientY);
  }

  function onJoyMove(e) {
    if (e.pointerId !== stick.id) return;
    e.preventDefault();
    e.stopPropagation();
    updateStick(e.clientX, e.clientY);
  }

  function onJoyUp(e) {
    if (stick.id == null || e.pointerId !== stick.id) return;
    if (e.cancelable) e.preventDefault();
    releaseStick();
  }

  function releaseStick() {
    const hadId = stick.id;
    stick.id = null;
    stick.rawX = stick.rawY = stick.x = stick.y = 0;
    onStick?.(0, 0, false); // zero IMEDIATO
    if (knob) {
      knob.classList.add('mc-returning');
      knob.style.transform = 'translate(-50%, -50%)';
    }
    root?.classList.remove('mc-joy-active');
    if (getConfig().joystick.type === 'floating' && joy) {
      joy.style.left = '';
      joy.style.top = '';
      joy.style.bottom = '';
    }
    if (hadId != null) {
      try { joyZone?.releasePointerCapture(hadId); } catch (_) { /* ignore */ }
    }
  }

  /** Vetor analógico: raio máx → zona morta → sensibilidade → curva. */
  function updateStick(clientX, clientY) {
    const cfg = getConfig().joystick;
    const maxR = joyGeom().maxR;
    let dx = clientX - stick.cx;
    let dy = clientY - stick.cy;
    const len = Math.hypot(dx, dy);
    if (len > maxR) {
      dx = (dx / len) * maxR;
      dy = (dy / len) * maxR;
    }
    stick.rawX = dx / maxR;
    stick.rawY = dy / maxR;
    const m = Math.min(1, len / maxR);
    let out = 0;
    if (m > cfg.deadZone) {
      out = (m - cfg.deadZone) / (1 - cfg.deadZone);
      out = Math.min(1, out * cfg.sensitivity);
      out = Math.pow(out, cfg.responseCurve);
    }
    if (out > 0 && len > 0) {
      stick.x = (stick.rawX / m) * out;
      stick.y = (stick.rawY / m) * out;
    } else {
      stick.x = 0;
      stick.y = 0;
    }
    onStick?.(stick.x, stick.y, out > 0);
    if (knob) knob.style.transform = `translate(calc(-50% + ${dx.toFixed(1)}px), calc(-50% + ${dy.toFixed(1)}px))`;
  }

  // ——— ÁREA OLHAR / ANALÓGICO DIREITO HÍBRIDO ———
  /** M10: hora REAL do toque (timestamp do evento, do SO/navegador) — um quadro travado (GC, shader no 1º segundo)
   *  não pode transformar um toque rápido em "gesto longo" e engolir o ataque. Fallback: performance.now(). */
  const evT = (e) => { const n = performance.now(); const t = e && e.timeStamp; return t > 0 && t <= n + 50 && n - t < 5000 ? t : n; };
  function beginGesture(e, el, { fromAttack, onStick }) {
    look.id = e.pointerId;
    look.lastX = e.clientX;
    look.lastY = e.clientY;
    look.downX = e.clientX;
    look.downY = e.clientY;
    look.downT = evT(e);
    look.travel = 0;
    look.committed = false;
    look.pendX = 0;
    look.pendY = 0;
    look.fromAttack = !!fromAttack;
    look.onStick = !!onStick;
    look.el = el;
    root.classList.add('mc-look-active');
  }

  function onLookDown(e) {
    e.preventDefault();
    e.stopPropagation();
    if (look.id != null && look.id !== e.pointerId) return; // um dedo de câmera
    const onStick = !!e.target?.closest?.('.mc-look');
    beginGesture(e, lookZone, { fromAttack: false, onStick });
    try { lookZone.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
  }

  function commitDrag() {
    look.committed = true;
    hooks.onLookDragStart?.();
    if (look.fromAttack) hooks.onAttackDragCancel?.();
    if (look.pendX || look.pendY) onLookDelta?.(look.pendX, look.pendY);
    look.pendX = 0;
    look.pendY = 0;
  }

  function moveGesture(e) {
    e.preventDefault();
    e.stopPropagation();
    const dx = e.clientX - look.lastX;
    const dy = e.clientY - look.lastY;
    look.lastX = e.clientX;
    look.lastY = e.clientY;
    look.travel += Math.abs(dx) + Math.abs(dy);
    if (!dx && !dy) return;
    if (!look.committed) {
      // ainda pode ser TOQUE: guarda o delta (câmera parada)
      look.pendX += dx;
      look.pendY += dy;
      const rs = getConfig().rightStick;
      const dist = Math.hypot(e.clientX - look.downX, e.clientY - look.downY);
      const elapsed = evT(e) - look.downT;
      if (dist >= rs.minDragDistance || (elapsed >= rs.tapRecognitionTime && dist >= rs.deadZone)) commitDrag();
    } else {
      onLookDelta?.(dx, dy);
    }
    if (lookKnob && look.committed) {
      const ox = Math.max(-22, Math.min(22, dx * 1.5));
      const oy = Math.max(-22, Math.min(22, dy * 1.5));
      lookKnob.style.transform = `translate(calc(-50% + ${ox.toFixed(1)}px), calc(-50% + ${oy.toFixed(1)}px))`;
    }
  }

  function onLookMove(e) {
    if (e.pointerId !== look.id || look.fromAttack) return;
    moveGesture(e);
  }

  function onLookUp(e) {
    if (look.id == null || e.pointerId !== look.id || look.fromAttack) return;
    if (e.cancelable) e.preventDefault();
    releaseLook(e.type !== 'pointerup', e);
  }

  /**
   * Fim do gesto: TOQUE (no anel, rápido, curto, sem virar arrasto) → onLookTap.
   * hooks.onLookRelease({ distPx, travelPx, durationMs, x, y, cancelled, tap, onStick, fromAttack })
   */
  function releaseLook(cancelled = true, e = null) {
    if (look.id != null) {
      const rs = getConfig().rightStick;
      lookGesture.x = e ? e.clientX : look.lastX;
      lookGesture.y = e ? e.clientY : look.lastY;
      lookGesture.distPx = Math.hypot(lookGesture.x - look.downX, lookGesture.y - look.downY);
      lookGesture.travelPx = look.travel;
      lookGesture.durationMs = evT(e) - look.downT;
      lookGesture.cancelled = !!cancelled;
      lookGesture.onStick = look.onStick;
      lookGesture.fromAttack = look.fromAttack;
      lookGesture.tap = !cancelled && !look.committed && look.onStick && !look.fromAttack &&
        lookGesture.distPx < rs.minDragDistance && lookGesture.durationMs < rs.tapRecognitionTime;
      lastGesture.kind = lookGesture.tap ? 'tap' : look.committed ? 'drag' : look.fromAttack ? 'attack' : 'none';
      lastGesture.distPx = Math.round(lookGesture.distPx);
      lastGesture.durationMs = Math.round(lookGesture.durationMs);
      lastGesture.at = performance.now();
      if (lookGesture.tap) hooks.onLookTap?.(lookGesture);
      // Bloco 6: toque fora do anel = tocar no inimigo (trava) / nele de novo ou no vazio (solta);
      // deslize rápido com alvo travado = trocar alvo
      const lc = getConfig().lockOn;
      if (!cancelled && !look.fromAttack && !look.onStick && !look.committed &&
          lookGesture.distPx < rs.minDragDistance && lookGesture.durationMs < rs.tapRecognitionTime) {
        lookTaps.taps++;
        lookTaps.lastAt = performance.now();
        lastGesture.kind = 'tap_world';
        hooks.onWorldTap?.(lookGesture.x, lookGesture.y);
      }
      if (!cancelled && look.committed && !look.fromAttack && lookGesture.durationMs <= lc.swipeSwitchMs &&
          Math.abs(lookGesture.x - look.downX) >= lc.swipeSwitchPx) {
        lookTaps.swipes++;
        lastGesture.kind = 'swipe';
        hooks.onLookSwipe?.(Math.sign(lookGesture.x - look.downX));
      }
      hooks.onLookRelease?.(lookGesture);
    }
    const hadId = look.id;
    const el = look.el;
    look.id = null;
    look.committed = false;
    look.pendX = 0;
    look.pendY = 0;
    look.fromAttack = false;
    look.el = null;
    if (lookKnob) lookKnob.style.transform = 'translate(-50%, -50%)';
    root?.classList.remove('mc-look-active');
    if (hadId != null && el === lookZone) {
      try { lookZone?.releasePointerCapture(hadId); } catch (_) { /* ignore */ }
    }
  }

  /**
   * Cluster inferior direito: anel do analógico + ATAQUE preso na borda
   * inferior-esquerda + poderes em arco (sem sobreposição, retrato/paisagem).
   */
  function layoutCluster() {
    if (!root || !lookZone) return;
    const rr = root.getBoundingClientRect();
    const W = rr.width || innerWidth;
    const H = rr.height || innerHeight;
    if (!W || !H) return;
    const cs = getComputedStyle(root);
    const safeR = parseFloat(cs.getPropertyValue('--mc-safe-r')) || 0;
    const safeB = parseFloat(cs.getPropertyValue('--mc-safe-b')) || 0;
    const land = W > H;
    const bc = getConfig().buttons;
    const L = curLayout();
    const em = getConfig().layoutEditor.edgeMarginPx;
    const bs = bc.sizeScale;
    const ovR = L.camera || {};
    const R = Math.round((land ? Math.max(44, Math.min(62, H * 0.16)) : Math.max(50, Math.min(66, W * 0.17))) * bs * (ovR.s ?? 1));
    const atk = Math.round((land ? 58 : 64) * bs);
    const dev = Math.round((land ? bc.sizeLandscape : bc.sizePortrait) * bs);
    const sup = Math.round(dev * bc.supremaScale);
    const gap = bc.gap;
    const talk = land ? 44 : 46;
    const showDefend = !!bc.showDefend;
    root.classList.toggle('mc-hide-defend', !showDefend);
    const m = land ? 10 : 12;
    const a225 = 0.72; // cos/sen de 225° (borda inferior-esquerda)
    let cx = W - safeR - m - R;
    let cy = Math.min(H - safeB - m - R, H - safeB - 6 - a225 * R - atk / 2);
    if (ovR.x != null) {
      cx = Math.max(R + em, Math.min(W - R - em, ovR.x * W));
      cy = Math.max(R + em, Math.min(H - R - em, ovR.y * H));
    }
    const opAll = bc.opacity;
    const itemRects = {};
    // Bloco 5: override do editor (centro em fração da tela, escala e opacidade por item)
    const placeItem = (id, el, x, y, size) => {
      const ov = L[id] || {};
      const sz = Math.round(size * (ov.s ?? 1));
      let px = x; let py = y;
      // o layout padrão já cabe na tela; só itens editados (posição/escala) ou botões maiores são contidos na borda
      if (ov.x != null) { px = ov.x * W; py = ov.y * H; }
      if (ov.x != null || (ov.s ?? 1) !== 1 || bs !== 1) {
        px = Math.max(sz / 2 + em, Math.min(W - sz / 2 - em, px));
        py = Math.max(sz / 2 + em, Math.min(H - sz / 2 - em, py));
      }
      place(el, px, py, sz);
      const op = (ov.o ?? 1) * opAll;
      if (el) el.style.opacity = op < 0.999 ? op.toFixed(2) : '';
      itemRects[id] = { cx: px, cy: py, size: sz, opacity: op };
    };
    const place = (el, x, y, size) => {
      if (!el) return;
      el.style.position = 'absolute';
      el.style.left = `${(x - size / 2).toFixed(1)}px`;
      el.style.top = `${(y - size / 2).toFixed(1)}px`;
      el.style.right = 'auto';
      el.style.bottom = 'auto';
      el.style.width = `${size}px`;
      el.style.height = `${size}px`;
      el.style.minHeight = `${size}px`;
      el.style.gridArea = 'auto';
    };
    // anel (dentro da zona OLHAR → coordenadas relativas a ela)
    const ring = root.querySelector('#mc-look');
    const zr = lookZone.getBoundingClientRect();
    if (ring) {
      ring.style.position = 'absolute';
      ring.style.left = `${(cx - R - (zr.left - rr.left)).toFixed(1)}px`;
      ring.style.top = `${(cy - R - (zr.top - rr.top)).toFixed(1)}px`;
      ring.style.right = 'auto';
      ring.style.bottom = 'auto';
      ring.style.width = `${2 * R}px`;
      ring.style.height = `${2 * R}px`;
      const op = (ovR.o ?? 1) * opAll * 0.92;
      ring.style.opacity = op < 0.919 ? op.toFixed(2) : '';
      itemRects.camera = { cx, cy, size: 2 * R, opacity: (ovR.o ?? 1) * opAll };
    }
    const pw = root.querySelector('#mc-powers');
    if (pw) {
      pw.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;display:block;transform:none;';
    }
    placeItem('attack', root.querySelector('.mc-attack'), cx - a225 * R, cy + a225 * R, atk);
    // Bloco 6: 4 botões num arco só em volta do anel (ESQUIVA → GOLPE → ÁREA → SUPREMA), espaçados
    // pelo tamanho real (sem sobreposição); SUPREMA encosta na borda direita. DEFESA (opcional) e
    // Falar ficam num 2º arco.
    const d1 = R + Math.max(dev, sup) / 2 + gap;
    const d2 = d1 + dev + gap;
    const DEG1 = 180 / Math.PI;
    const at = (deg, dd) => [cx + Math.sin(deg / DEG1) * dd, cy - Math.cos(deg / DEG1) * dd];
    const step = (a, b) => 2 * Math.asin(Math.min(1, ((a + b) / 2 + gap) / (2 * d1))) * DEG1;
    const edgeR = W - safeR - 4 - sup / 2;
    const supDeg = Math.min(land ? 24 : 20, Math.asin(Math.max(-1, Math.min(1, (edgeR - cx) / d1))) * DEG1);
    const areaDeg = supDeg - step(sup, dev);
    const golpeDeg = areaDeg - step(dev, dev);
    const dodgeDeg = golpeDeg - step(dev, dev);
    const slots = {
      suprema: [supDeg, d1], ataque_area: [areaDeg, d1], golpe_poderoso: [golpeDeg, d1], dodge: [dodgeDeg, d1],
      defend: land ? [-70, d2] : [-52, d2], talk: land ? [-28, d2] : [-12, d2]
    };
    for (const b of ACTION_BUTTONS) {
      const el = root.querySelector(`.mc-act-${b.id}`);
      if (b.id === 'defend' && !showDefend) { if (el) el.style.opacity = ''; continue; }
      const [deg, dd] = slots[b.id];
      const pt = at(deg, dd);
      placeItem(b.id, el, pt[0], pt[1], b.id === 'suprema' ? sup : dev);
    }
    layoutInfo.slots = { suprema: +supDeg.toFixed(1), ataque_area: +areaDeg.toFixed(1), golpe_poderoso: +golpeDeg.toFixed(1), dodge: +dodgeDeg.toFixed(1) };
    const tk = at(slots.talk[0], slots.talk[1]);
    place(root.querySelector('.mc-interact'), tk[0], tk[1], talk);
    layoutInfo.cx = cx; layoutInfo.cy = cy; layoutInfo.R = R; layoutInfo.land = land; layoutInfo.size = dev;
    // joystick (posição/escala via CSS vars)
    applyCssVars();
    const g = joyGeom();
    const jr = joy?.getBoundingClientRect();
    if (jr && jr.width) itemRects.joystick = { cx: jr.left - rr.left + jr.width / 2, cy: jr.top - rr.top + jr.height / 2, size: 2 * g.r, opacity: g.op };
    layoutInfo.items = itemRects;
    layoutInfo.orient = land ? 'landscape' : 'portrait';
  }
  const layoutInfo = { cx: 0, cy: 0, R: 0 };

  function releaseAll() {
    if (stick.id != null) releaseStick();
    else onStick?.(0, 0, false);
    if (look.id != null) releaseLook();
    if (attackPointer != null) {
      attackPointer = null;
      root?.querySelector('.mc-attack')?.classList.remove('mc-pressed');
      onAttackRelease?.();
    }
    if (defendPointer != null) {
      defendPointer = null;
      root?.querySelector('.mc-act-defend')?.classList.remove('mc-pressed');
      hooks.onDefend?.(false);
    }
  }

  /** Bloco 4: recarga (varredura radial + segundos) / Nexa insuficiente / ativo. */
  const btnState = {};
  function updateActionButtons(info) {
    if (!root || !info) return;
    for (const b of ACTION_BUTTONS) {
      const it = info[b.id];
      if (!it) continue;
      const el = root.querySelector(`.mc-act-${b.id}`);
      if (!el) continue;
      const secs = it.cdLeftMs > 0 ? Math.ceil(it.cdLeftMs / 1000) : 0;
      const frac = Math.round((it.cdFrac || 0) * 100) / 100;
      const key = `${frac}|${secs}|${it.affordable ? 1 : 0}|${it.active ? 1 : 0}|${it.dashReady ? 1 : 0}`;
      if (btnState[b.id] === key) continue;
      btnState[b.id] = key;
      el.style.setProperty('--cd', String(frac));
      el.classList.toggle('mc-on-cd', frac > 0);
      el.classList.toggle('mc-no-nexa', !it.affordable);
      el.classList.toggle('mc-active', !!it.active);
      if (b.id === 'dodge') el.classList.toggle('mc-dash-ready', !!it.dashReady);
      const sEl = el.querySelector('.mc-cd-s');
      if (sEl) sEl.textContent = secs > 0 && SPECIAL_BTN.has(b.id) ? String(secs) : '';
    }
  }
  function flashButton(id, kind) {
    const el = root?.querySelector(`.mc-act-${id}`);
    if (!el) return;
    const cls = kind === 'denied' ? 'mc-denied' : 'mc-fired';
    el.classList.remove(cls);
    void el.offsetWidth; // reinicia a animação
    el.classList.add(cls);
    clearTimeout(el._nxF);
    el._nxF = setTimeout(() => el.classList.remove(cls), 420);
  }
  /** Bloco 6: sem botão ALVO — o anel CÂMERA mostra quando há alvo travado. */
  function setLockActive(v) {
    root?.querySelector('#mc-look')?.classList.toggle('mc-lock-on', !!v);
  }
  function buttonRects() {
    const out = {};
    if (!root) return out;
    root.querySelectorAll('.mc-powers .mc-btn').forEach((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      out[el.getAttribute('data-power')] = {
        x: r.left, y: r.top, w: r.width, h: r.height, combat: el.classList.contains('mc-act') || el.classList.contains('mc-attack'),
        visible: cs.visibility !== 'hidden' && cs.display !== 'none' && r.width > 0,
        cls: el.className
      };
    });
    return out;
  }

  // ——— BOTÕES ———
  function handlePower(id) {
    if (getBusy?.()) return;
    const state = getState?.();
    if (!state) return;

    if (id === 'attack') {
      // gp2: o botão só COMANDA o golpe; tempo/hitbox/dano ficam no player-combat
      onAttackPress?.();
      return;
    }

    if (id === 'interact') {
      if (isArenaState(state)) return;
      const npc = interactAdjacent(state);
      if (npc) {
        const r = talkNpc(state, npc);
        onInteract?.(r);
      } else {
        pushLog(state, 'Ninguém por perto.', 'warn');
        onInteract?.(null);
      }
      return;
    }

    if (id === 'dodge') { hooks.onDodge?.(); return; }
    if (SPECIAL_BTN.has(id)) { hooks.onSpecial?.(id); return; }
  }

  // ——— VISIBILIDADE ———
  function shouldShow() {
    if (forceVisible) return true;
    return detectTouchMode();
  }

  function updateVisibility() {
    ensureDom();
    const gameHidden = document.getElementById('game-screen')?.classList.contains('hidden');
    const next = shouldShow() && !gameHidden;
    if (!next && visible) releaseAll();
    visible = next;
    root.classList.toggle('hidden', !visible);
    if (visible) layoutCluster();
    const arena = isArenaState(getState?.());
    root.classList.toggle('mc-arena', arena);
    document.body.classList.toggle('has-mobile-controls', visible);
    const talk = root.querySelector('.mc-interact');
    if (talk) talk.classList.toggle('mc-hidden-arena', arena);
  }

  function setForceVisible(v) {
    forceVisible = !!v;
    updateVisibility();
  }

  function onBlur() { releaseAll(); }
  function onVis() { if (document.hidden) releaseAll(); }

  ensureDom();
  window.addEventListener('resize', updateVisibility);
  window.addEventListener('orientationchange', updateVisibility);
  window.addEventListener('blur', onBlur);
  document.addEventListener('visibilitychange', onVis);
  const offCfg = onConfigChange(() => { applyCssVars(); if (visible) layoutCluster(); });

  return {
    show() {
      updateVisibility();
    },
    hide() {
      if (!root) return;
      releaseAll();
      visible = false;
      root.classList.add('hidden');
      document.body.classList.remove('has-mobile-controls');
    },
    updateVisibility,
    setForceVisible,
    isForceVisible: () => forceVisible,
    isVisible: () => visible,
    releaseAll,
    updateActionButtons,
    flashButton,
    setLockActive,
    buttonRects,
    getJoystickVector() {
      return { x: stick.x, y: stick.y, active: stick.id != null };
    },
    getDebug() {
      return { stickId: stick.id, lookId: look.id, x: stick.x, y: stick.y, committed: look.committed, lastGesture: { ...lastGesture }, layout: { ...layoutInfo }, lookTaps: { ...lookTaps }, defendPointer };
    },
    layoutCluster,
    /** Bloco 5: layout temporário (editor) — null volta ao salvo. */
    previewLayout(items) {
      previewItems = items ? JSON.parse(JSON.stringify(items)) : null;
      applyCssVars();
      if (visible) layoutCluster();
    },
    /** Bloco 5: centros/tamanhos atuais dos itens editáveis (px, relativos à tela dos controles). */
    getLayoutItems() {
      if (visible) layoutCluster();
      return { orient: orientKey(), items: JSON.parse(JSON.stringify(layoutInfo.items || {})) };
    },
    setEditMode(on) {
      ensureDom();
      if (on) releaseAll();
      root.classList.toggle('mc-editing', !!on);
    },
    getRoot: () => root,
    destroy() {
      window.removeEventListener('resize', updateVisibility);
      window.removeEventListener('orientationchange', updateVisibility);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVis);
      offCfg();
      root?.remove();
      root = null;
    },
    api: {
      setVector(x, y) {
        const m = Math.hypot(x, y);
        const active = m > getConfig().joystick.deadZone;
        stick.x = active ? x : 0;
        stick.y = active ? y : 0;
        onStick?.(stick.x, stick.y, active);
      },
      attackNearest() {
        handlePower('attack');
      },
      interact() {
        handlePower('interact');
      }
    }
  };
}
