/**
 * NEXARA camera — follow + smooth lerp + zoom. Logical tiles stay authoritative.
 */
export const ISO = { TW: 64, TH: 32 };

export function tileToWorld(tx, ty) {
  return {
    x: (tx - ty) * (ISO.TW / 2),
    y: (tx + ty) * (ISO.TH / 2)
  };
}

export function worldToTile(wx, wy) {
  const tx = (wy / (ISO.TH / 2) + wx / (ISO.TW / 2)) / 2;
  const ty = (wy / (ISO.TH / 2) - wx / (ISO.TW / 2)) / 2;
  return { x: Math.round(tx), y: Math.round(ty) };
}

export function createCamera() {
  return {
    x: 0,
    y: 0,
    zoom: 1,
    targetZoom: 1,
    shake: 0,
    followLerp: 0.18,
    zoomLerp: 0.12
  };
}

export function resizeCameraCanvas(canvas, wrap) {
  if (!canvas || !wrap) return { cssW: 0, cssH: 0, dpr: 1 };
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cssW = Math.max(40, Math.floor(wrap.clientWidth));
  const cssH = Math.max(40, Math.floor(wrap.clientHeight));
  const bw = Math.floor(cssW * dpr);
  const bh = Math.floor(cssH * dpr);
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
  }
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  return { cssW, cssH, dpr, bw, bh };
}

export function updateCamera(cam, targetWorldX, targetWorldY, dt = 1) {
  const t = 1 - Math.pow(1 - cam.followLerp, dt);
  cam.x += (targetWorldX - cam.x) * t;
  cam.y += (targetWorldY - cam.y) * t;
  const zt = 1 - Math.pow(1 - cam.zoomLerp, dt);
  cam.zoom += (cam.targetZoom - cam.zoom) * zt;
  if (cam.shake > 0) cam.shake *= 0.85;
}

/** Apply camera transform: world → canvas buffer pixels */
export function applyCamera(ctx, cam, canvasW, canvasH) {
  const shakeX = cam.shake ? (Math.random() - 0.5) * cam.shake : 0;
  const shakeY = cam.shake ? (Math.random() - 0.5) * cam.shake : 0;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.translate(canvasW / 2 + shakeX, canvasH / 2 + shakeY);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);
}

/** Canvas buffer pixel → world */
export function canvasToWorld(cam, canvasW, canvasH, cx, cy) {
  const lx = (cx - canvasW / 2) / cam.zoom + cam.x;
  const ly = (cy - canvasH / 2) / cam.zoom + cam.y;
  return { x: lx, y: ly };
}

/** Logical tile → canvas CSS pixel position (for e2e / clicks) */
export function tileToCanvasCss(cam, canvas, wrap, tx, ty, dpr = 1) {
  const w = tileToWorld(tx, ty);
  const cssW = canvas.clientWidth || wrap?.clientWidth || canvas.width;
  const cssH = canvas.clientHeight || wrap?.clientHeight || canvas.height;
  const bw = canvas.width;
  const bh = canvas.height;
  // buffer coords
  const bx = (w.x - cam.x) * cam.zoom + bw / 2;
  const by = (w.y - cam.y) * cam.zoom + bh / 2;
  return { x: (bx / bw) * cssW, y: (by / bh) * cssH };
}

export function adaptZoom(cam, zone, cssW, cssH) {
  if (!zone?.map) return;
  // Fit ~8–10 tiles diagonally into view; character ~1/12–1/15 screen height
  const base = Math.min(cssW, cssH);
  const desired = base / (ISO.TH * 10);
  cam.targetZoom = Math.max(0.7, Math.min(1.85, desired * (window.devicePixelRatio > 1.5 ? 0.95 : 1)));
}
