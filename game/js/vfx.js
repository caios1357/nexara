/**
 * Combat VFX + floating REAL damage numbers + loot ground glow.
 * Numbers come from combat system — never fabricated.
 * Pass GRAFICO+: stronger slash arcs, impact sparks, bloom-ish overlays.
 */
import { tileToWorld } from './camera.js?v=20261009berco';
import { RARITY_COLOR } from './sprites.js?v=20261009berco';

export function createVfx() {
  return { floats: [], arcs: [], impacts: [], loots: [], sparks: [], time: 0 };
}

export function spawnDamage(vfx, tx, ty, amount, kind = 'out') {
  const w = tileToWorld(tx, ty);
  vfx.floats.push({
    x: w.x + (Math.random() - 0.5) * 18,
    y: w.y - 40,
    text: `-${amount}`,
    life: 1.15,
    vy: -36,
    kind,
    scale: amount >= 20 ? 1.25 : 1
  });
}

export function spawnArc(vfx, fromTx, fromTy, toTx, toTy, color = 'rgba(62,207,191,0.85)') {
  const a = tileToWorld(fromTx, fromTy);
  const b = tileToWorld(toTx, toTy);
  vfx.arcs.push({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2 - 22,
    ang: Math.atan2(b.y - a.y, b.x - a.x),
    life: 0.42,
    color,
    fromX: a.x,
    fromY: a.y - 18,
    toX: b.x,
    toY: b.y - 18
  });
}

export function spawnImpact(vfx, tx, ty) {
  const w = tileToWorld(tx, ty);
  vfx.impacts.push({ x: w.x, y: w.y - 18, life: 0.45, r: 4 });
  // cheap spark burst
  for (let i = 0; i < 6; i++) {
    const ang = (Math.PI * 2 * i) / 6 + Math.random() * 0.4;
    vfx.sparks.push({
      x: w.x,
      y: w.y - 18,
      vx: Math.cos(ang) * (40 + Math.random() * 50),
      vy: Math.sin(ang) * (40 + Math.random() * 50) - 20,
      life: 0.35 + Math.random() * 0.2
    });
  }
}

export function spawnLootGlow(vfx, tx, ty, rarity = 'common', label = '') {
  const w = tileToWorld(tx, ty);
  vfx.loots.push({
    x: w.x,
    y: w.y,
    life: 1.6,
    rarity,
    label,
    color: RARITY_COLOR[rarity] || RARITY_COLOR.common
  });
}

export function updateVfx(vfx, dt) {
  vfx.time += dt;
  for (const f of vfx.floats) {
    f.life -= dt * 0.85;
    f.y += f.vy * dt;
    f.vy *= 0.95;
  }
  vfx.floats = vfx.floats.filter((f) => f.life > 0);
  for (const a of vfx.arcs) a.life -= dt;
  vfx.arcs = vfx.arcs.filter((a) => a.life > 0);
  for (const i of vfx.impacts) {
    i.life -= dt;
    i.r += 55 * dt;
  }
  vfx.impacts = vfx.impacts.filter((i) => i.life > 0);
  for (const l of vfx.loots) l.life -= dt * 0.55;
  vfx.loots = vfx.loots.filter((l) => l.life > 0);
  if (vfx.sparks) {
    for (const s of vfx.sparks) {
      s.life -= dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 90 * dt;
    }
    vfx.sparks = vfx.sparks.filter((s) => s.life > 0);
  }
}

function hexAlpha(hex, a) {
  if (!hex || hex[0] !== '#') return `rgba(200,200,200,${a})`;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

export function drawVfx(ctx, vfx) {
  for (const l of vfx.loots) {
    const a = Math.min(1, l.life);
    ctx.fillStyle = hexAlpha(l.color, 0.45 * a);
    ctx.beginPath();
    ctx.ellipse(l.x, l.y + 4, 18, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = hexAlpha(l.color, a);
    ctx.beginPath();
    ctx.arc(l.x, l.y - 6, 4, 0, Math.PI * 2);
    ctx.fill();
    if (l.label) {
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = hexAlpha('#d8e0ea', a);
      ctx.fillText(l.label, l.x, l.y - 16);
    }
  }

  // Slash arcs — bright core + soft outer bloom
  for (const a of vfx.arcs) {
    const alpha = Math.max(0, a.life / 0.42);
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.rotate(a.ang);
    ctx.globalAlpha = alpha * 0.35;
    ctx.strokeStyle = a.color;
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, 26, -1.05, 1.05);
    ctx.stroke();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = a.color;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(0, 0, 24, -1.0, 1.0);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(220,255,250,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 22, -0.85, 0.85);
    ctx.stroke();
    ctx.restore();

    // thin travel streak
    ctx.save();
    ctx.globalAlpha = alpha * 0.55;
    ctx.strokeStyle = 'rgba(180,240,255,0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(a.fromX, a.fromY);
    ctx.lineTo(a.toX, a.toY);
    ctx.stroke();
    ctx.restore();
  }

  // Impacts — flash ring + additive orange core
  for (const i of vfx.impacts) {
    const a = Math.max(0, i.life);
    ctx.save();
    ctx.globalAlpha = a;
    const g = ctx.createRadialGradient(i.x, i.y, 1, i.x, i.y, i.r);
    g.addColorStop(0, 'rgba(255,240,180,0.9)');
    g.addColorStop(0.4, 'rgba(255,140,60,0.45)');
    g.addColorStop(1, 'rgba(255,80,20,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(i.x, i.y, i.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(255,200,120,${a})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(i.x, i.y, i.r * 0.85, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Sparks
  if (vfx.sparks) {
    for (const s of vfx.sparks) {
      ctx.globalAlpha = Math.max(0, s.life * 2);
      ctx.fillStyle = '#ffc060';
      ctx.fillRect(s.x - 1.5, s.y - 1.5, 3, 3);
      ctx.fillStyle = '#fff8e0';
      ctx.fillRect(s.x - 0.5, s.y - 0.5, 1.5, 1.5);
    }
    ctx.globalAlpha = 1;
  }

  // Floating damage — larger, outlined, REAL values only
  for (const f of vfx.floats) {
    ctx.save();
    const a = Math.max(0, Math.min(1, f.life));
    ctx.globalAlpha = a;
    const size = Math.floor(15 * (f.scale || 1));
    ctx.font = `bold ${size}px "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#060a10';
    ctx.strokeText(f.text, f.x, f.y);
    ctx.fillStyle = f.kind === 'in' ? '#ff6a5a' : '#fff8f0';
    ctx.fillText(f.text, f.x, f.y);
    // soft under-glow
    ctx.globalAlpha = a * 0.35;
    ctx.fillStyle = f.kind === 'in' ? '#e85d4c' : '#3ecfbf';
    ctx.fillText(f.text, f.x, f.y + 1);
    ctx.restore();
  }
}
