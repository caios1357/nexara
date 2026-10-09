/**
 * NEXARA — colisão contínua compartilhada (gp2).
 *
 * Usado pelo herói (player-motion) e pelos inimigos (enemy-ai): caixa AABB de
 * meia-largura r contra tiles bloqueados, movendo um eixo por vez (desliza em
 * paredes) e nunca atravessando. `blocked(tx, ty)` é uma função estável do
 * chamador (sem closures por frame). Também: linha de visão por DDA de tiles.
 */
import { isWalkable } from './map.js?v=20261009som';

const EPS = 1e-6;
const SKIN = 1e-4;

/** Move pos.x por d; clampa no primeiro tile bloqueado. Retorna true se barrou. */
export function moveAxisX(pos, d, r, blocked) {
  if (!d) return false;
  let nx = pos.x + d;
  const y0 = Math.floor(pos.y - r + EPS);
  const y1 = Math.floor(pos.y + r - EPS);
  let hit = false;
  if (d > 0) {
    const tx = Math.floor(nx + r - EPS);
    for (let ty = y0; ty <= y1; ty++) {
      if (blocked(tx, ty)) { nx = Math.min(nx, tx - r - SKIN); hit = true; break; }
    }
    if (nx < pos.x) nx = pos.x; // nunca empurra para trás (sobreposição dinâmica)
  } else {
    const tx = Math.floor(nx - r + EPS);
    for (let ty = y0; ty <= y1; ty++) {
      if (blocked(tx, ty)) { nx = Math.max(nx, tx + 1 + r + SKIN); hit = true; break; }
    }
    if (nx > pos.x) nx = pos.x;
  }
  pos.x = nx;
  return hit;
}

/** Move pos.y por d; clampa no primeiro tile bloqueado. Retorna true se barrou. */
export function moveAxisY(pos, d, r, blocked) {
  if (!d) return false;
  let ny = pos.y + d;
  const x0 = Math.floor(pos.x - r + EPS);
  const x1 = Math.floor(pos.x + r - EPS);
  let hit = false;
  if (d > 0) {
    const ty = Math.floor(ny + r - EPS);
    for (let tx = x0; tx <= x1; tx++) {
      if (blocked(tx, ty)) { ny = Math.min(ny, ty - r - SKIN); hit = true; break; }
    }
    if (ny < pos.y) ny = pos.y;
  } else {
    const ty = Math.floor(ny - r + EPS);
    for (let tx = x0; tx <= x1; tx++) {
      if (blocked(tx, ty)) { ny = Math.max(ny, ty + 1 + r + SKIN); hit = true; break; }
    }
    if (ny > pos.y) ny = pos.y;
  }
  pos.y = ny;
  return hit;
}

/**
 * Deslocamento (dx,dy) com sub-passos. `out.hitX/hitY` indicam contato.
 * Retorna `out` (objeto reutilizado pelo chamador).
 */
export function moveBox(pos, dx, dy, r, blocked, maxSubstep, out) {
  out.hitX = false;
  out.hitY = false;
  const dist = Math.hypot(dx, dy);
  if (dist <= 0) return out;
  const n = Math.max(1, Math.ceil(dist / maxSubstep));
  const sx = dx / n;
  const sy = dy / n;
  for (let i = 0; i < n; i++) {
    if (!out.hitX && moveAxisX(pos, sx, r, blocked)) out.hitX = true;
    if (!out.hitY && moveAxisY(pos, sy, r, blocked)) out.hitY = true;
  }
  return out;
}

/**
 * Linha de visão entre dois pontos (coords de tile float) — só paredes bloqueiam.
 * DDA (Amanatides-Woo): percorre exatamente os tiles cruzados pelo segmento.
 */
export function hasLineOfSight(zone, x0, y0, x1, y1) {
  if (!zone) return false;
  let tx = Math.floor(x0);
  let ty = Math.floor(y0);
  const ex = Math.floor(x1);
  const ey = Math.floor(y1);
  const dx = x1 - x0;
  const dy = y1 - y0;
  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  let tMaxX = dx !== 0 ? (dx > 0 ? (tx + 1 - x0) : (x0 - tx)) * tDeltaX : Infinity;
  let tMaxY = dy !== 0 ? (dy > 0 ? (ty + 1 - y0) : (y0 - ty)) * tDeltaY : Infinity;
  let guard = 64;
  while ((tx !== ex || ty !== ey) && guard-- > 0) {
    if (tMaxX < tMaxY) {
      if (tMaxX > 1) break;
      tMaxX += tDeltaX;
      tx += stepX;
    } else {
      if (tMaxY > 1) break;
      tMaxY += tDeltaY;
      ty += stepY;
    }
    if ((tx !== ex || ty !== ey) && !isWalkable(zone, tx, ty)) return false;
  }
  return true;
}

export function wrapAngle(a) {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
}
