/**
 * FPS look input (desktop) — gp1.
 * - Mouse com pointer-lock: clique no canvas trava; Esc libera.
 * - Sem pointer-lock (fallback): arrastar com o mouse no canvas.
 * - Toque NÃO é tratado aqui: a área OLHAR (mobile-controls) é a dona exclusiva
 *   dos dedos de câmera; o joystick é dono dos dedos de movimento.
 * - Movimento (WASD/setas/Shift) NÃO é tratado aqui: player-motion.js é o
 *   único dono do movimento (contínuo).
 * Todas as sensibilidades vêm de gameplay-config.js via fpsCam.applyLook.
 */
export function createFpsControls({ fpsCam, isTouchUi }) {
  let canvas = null;
  let wired = false;
  let dragId = null;
  let dragX = 0;
  let dragY = 0;

  function onMouseMove(e) {
    if (!fpsCam.state.locked) return;
    fpsCam.applyLook(e.movementX || 0, e.movementY || 0, 'mouse');
  }

  function onPointerLockChange() {
    fpsCam.state.locked = document.pointerLockElement === canvas;
    if (!fpsCam.state.locked) dragId = null;
  }

  function requestLock() {
    if (!canvas || isTouchUi?.()) return;
    if (document.pointerLockElement === canvas) return;
    try {
      const r = canvas.requestPointerLock?.();
      if (r && typeof r.catch === 'function') r.catch(() => {});
    } catch (_) { /* ignore */ }
  }

  function exitLock() {
    if (document.pointerLockElement) document.exitPointerLock?.();
  }

  function onPointerDown(e) {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    if (fpsCam.state.locked) return;
    dragId = e.pointerId;
    dragX = e.clientX;
    dragY = e.clientY;
  }
  function onPointerMove(e) {
    if (dragId == null || e.pointerId !== dragId || fpsCam.state.locked) return;
    const dx = e.clientX - dragX;
    const dy = e.clientY - dragY;
    dragX = e.clientX;
    dragY = e.clientY;
    fpsCam.applyLook(dx, dy, 'mouse');
  }
  function onPointerUp(e) {
    if (e.pointerId === dragId) dragId = null;
  }

  function clearInput() {
    dragId = null;
  }

  function wire(el) {
    canvas = el;
    if (wired) return;
    wired = true;
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    window.addEventListener('blur', clearInput);
    canvas.addEventListener('click', (e) => {
      if (e.target.closest?.('#mobile-controls')) return;
      const ov = document.getElementById('modal-overlay');
      if (ov && !ov.classList.contains('hidden')) return;
      requestLock();
    });
    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  }

  function dispose() {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('pointerlockchange', onPointerLockChange);
    window.removeEventListener('blur', clearInput);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    wired = false;
  }

  /** Área OLHAR (touch) → câmera. */
  function applyTouchLook(dx, dy) {
    fpsCam.applyLook(dx, dy, 'touch');
  }

  return { wire, applyTouchLook, requestLock, exitLock, dispose, clearInput };
}
