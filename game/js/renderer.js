/**
 * NEXARA isometric renderer — presentation only.
 * State/map/entities/combat stay authoritative in their modules.
 * Pass GRAFICO+: denser props, low-key lighting, polished nameplates.
 */
import {
  createCamera, resizeCameraCanvas, updateCamera, applyCamera,
  tileToWorld, worldToTile, canvasToWorld, tileToCanvasCss, adaptZoom, ISO
} from './camera.js?v=20261009forte';
import {
  drawIsoTile, drawWallBlock, drawProp, drawPlayer, drawNpc, drawBot
} from './sprites.js?v=20261009forte';
import { createVfx, updateVfx, drawVfx } from './vfx.js?v=20261009forte';
import { getTileType, monstersInZone } from './map.js?v=20261009forte';
import { getMonsterPos } from './enemy-ai.js?v=20261009forte';

const TILE_FILL = {
  g6: {
    wall: '#1a222c',
    floor: '#1c2228',
    workshop: '#222628',
    shop: '#1e2624',
    npc_area: '#1e2430',
    street: '#20262c',
    bot_spawn: '#242028',
    tunnel: '#181e24',
    scrap: '#222420',
    exit_e4: '#2a2228',
    exit_g6: '#1e2824',
    black_market: '#201e28'
  },
  e4: {
    wall: '#0a0e14',
    floor: '#12161c',
    workshop: '#161418',
    shop: '#121816',
    npc_area: '#141820',
    street: '#14181e',
    bot_spawn: '#181418',
    tunnel: '#0e1218',
    scrap: '#181612',
    exit_e4: '#201418',
    exit_g6: '#121c18',
    black_market: '#16141c'
  }
};

function zoneStyle(zone) {
  return zone?.code === 'E4' ? 'e4' : 'g6';
}

function tileStroke(style, type) {
  if (type === 'wall') return null;
  return style === 'e4' ? 'rgba(35,45,60,0.14)' : 'rgba(60,70,85,0.12)';
}

function hashProp(x, y) {
  return ((x * 73856093) ^ (y * 19349663)) >>> 0;
}

export function createRenderer() {
  const cam = createCamera();
  const vfx = createVfx();
  const vis = {
    player: { x: 0, y: 0, anim: 'idle', frame: 0, animT: 0 },
    ready: false
  };
  let lastT = performance.now();
  let raf = 0;
  let getState = () => null;
  let running = false;
  /** gp1: movimento contínuo compartilhado (player-motion) + hooks. */
  let hooks = {};
  const motionOpts = { busy: false, facingFromCamera: false, onMoved: (info) => hooks.onMoved?.(info) };

  function syncVis(state) {
    if (!state) return;
    const p = state.player;
    if (!vis.ready) {
      vis.player.x = p.x;
      vis.player.y = p.y;
      vis.ready = true;
      const w = tileToWorld(p.x, p.y);
      cam.x = w.x;
      cam.y = w.y;
    }
  }

  function stepVisual(state, dt, simDt = dt) {
    syncVis(state);
    const motion = hooks.motion;
    if (motion) {
      // Iso: eixos fixos (yaw 0 = W → -y, igual ao mapeamento antigo); corpo gira com turnSpeed
      if (hooks.simulate) {
        // gp2: simulação única do main (movimento + ataque + física/IA)
        hooks.simulate(state, simDt, 0);
      } else {
        motionOpts.busy = !!hooks.getBusy?.() || !!hooks.isInputBlocked?.();
        motion.update(state, simDt, 0, motionOpts);
      }
      const mp = motion.getPos();
      // tileToWorld(inteiro) = centro do tile → float - 0.5
      vis.player.x = mp.x - 0.5;
      vis.player.y = mp.y - 0.5;
      vis.player.facing = motion.getFacing();
      if (vis.player.anim !== 'attack' && vis.player.anim !== 'hurt') {
        vis.player.anim = motion.isMoving() ? 'walk' : 'idle';
      }
    }
    const p = state.player;
    const tx = motion ? vis.player.x : p.x;
    const ty = motion ? vis.player.y : p.y;
    const dx = tx - vis.player.x;
    const dy = ty - vis.player.y;
    const dist = Math.abs(dx) + Math.abs(dy);
    if (motion) {
      // posição já vem contínua do player-motion
    } else if (dist > 0.02) {
      const speed = Math.min(1, dt * 11);
      vis.player.x += dx * speed;
      vis.player.y += dy * speed;
      if (vis.player.anim !== 'attack' && vis.player.anim !== 'hurt') {
        vis.player.anim = 'walk';
      }
    } else {
      vis.player.x = tx;
      vis.player.y = ty;
      if (vis.player.anim === 'walk') vis.player.anim = 'idle';
    }
    vis.player.animT += dt;
    if (vis.player.animT > 0.12) {
      vis.player.animT = 0;
      vis.player.frame = (vis.player.frame + 1) % 8;
    }
    if (vis.player.anim === 'attack' || vis.player.anim === 'hurt') {
      vis.player._lock = (vis.player._lock || 0) - dt;
      if (vis.player._lock <= 0) vis.player.anim = 'idle';
    }
    updateVfx(vfx, dt);
    const w = tileToWorld(vis.player.x, vis.player.y);
    updateCamera(cam, w.x, w.y - 8, dt * 60);
  }

  function drawNameplate(ctx, wx, wy, name, level, hp, hpMax, hostile) {
    const label = level != null ? `${name}  Lv.${level}` : name;
    ctx.font = 'bold 10px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    const tw = Math.min(130, Math.max(56, ctx.measureText(label).width + 12));
    const bx = wx - tw / 2;
    const by = wy - 56;
    // panel
    ctx.fillStyle = 'rgba(6,10,16,0.82)';
    ctx.beginPath();
    const r = 3;
    ctx.moveTo(bx + r, by);
    ctx.lineTo(bx + tw - r, by);
    ctx.quadraticCurveTo(bx + tw, by, bx + tw, by + r);
    ctx.lineTo(bx + tw, by + 12 - r);
    ctx.quadraticCurveTo(bx + tw, by + 12, bx + tw - r, by + 12);
    ctx.lineTo(bx + r, by + 12);
    ctx.quadraticCurveTo(bx, by + 12, bx, by + 12 - r);
    ctx.lineTo(bx, by + r);
    ctx.quadraticCurveTo(bx, by, bx + r, by);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = hostile ? 'rgba(232,93,76,0.45)' : 'rgba(62,207,191,0.45)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = hostile ? '#e8e0d8' : '#5ee0d0';
    ctx.fillText(label, wx, by + 9);
    // HP bar
    const pct = hpMax > 0 ? Math.max(0, Math.min(1, hp / hpMax)) : 0;
    const barW = 40;
    ctx.fillStyle = '#120808';
    ctx.fillRect(wx - barW / 2, by + 14, barW, 5);
    ctx.fillStyle = hostile ? '#e85d4c' : '#3ecfbf';
    ctx.fillRect(wx - barW / 2, by + 14, barW * pct, 5);
    ctx.strokeStyle = 'rgba(200,210,220,0.25)';
    ctx.strokeRect(wx - barW / 2, by + 14, barW, 5);
  }

  function placeProps(ctx, world, type, style, hp, zoneCode) {
    const denser = style === 'g6' && zoneCode !== 'AR';
    const dark = style === 'e4';

    // Arena: só props esparsos (tratado no final com return)
    if (zoneCode === 'AR') {
      if (type === 'street' && hp % 11 === 0) drawProp(ctx, world.x, world.y, 'crate', style);
      if (type === 'street' && hp % 13 === 0) drawProp(ctx, world.x, world.y, 'pipe', style);
      if ((type === 'floor' || type === 'street') && hp % 19 === 0) drawProp(ctx, world.x, world.y, 'light', 'g6');
      return;
    }

    if (type === 'street' || type === 'floor') {
      const m = hp % 8;
      if (m === 0) drawProp(ctx, world.x, world.y, 'crate', style);
      else if (m === 1) drawProp(ctx, world.x, world.y, 'barrel', style);
      else if (m === 2) drawProp(ctx, world.x, world.y, 'pipe', style);
      else if (m === 3 && denser) drawProp(ctx, world.x, world.y, 'container', style);
      else if (m === 4) drawProp(ctx, world.x + 3, world.y, 'scrap', style);
      if (hp % 15 === 0) drawProp(ctx, world.x, world.y, 'neon', style);
    }
    if (type === 'scrap') {
      drawProp(ctx, world.x, world.y, 'scrap', style);
      if (hp % 3 === 0) drawProp(ctx, world.x - 6, world.y, 'barrel', style);
    }
    if (type === 'workshop') {
      if (hp % 2 === 0) drawProp(ctx, world.x - 4, world.y, 'light', style);
      if (hp % 3 === 0) drawProp(ctx, world.x + 6, world.y, 'crate', style);
    }
    if (type === 'bot_spawn') {
      if (hp % 3 === 0) drawProp(ctx, world.x, world.y, 'light', style);
      if (hp % 4 === 0) drawProp(ctx, world.x, world.y, 'scrap', style);
    }
    if (type === 'exit_e4') drawProp(ctx, world.x, world.y, 'exit', 'exit_e4');
    if (type === 'exit_g6') drawProp(ctx, world.x, world.y, 'exit', 'exit_g6');
    if (type === 'black_market' || type === 'shop') {
      drawProp(ctx, world.x, world.y, 'crate', style);
      if (hp % 2 === 0) drawProp(ctx, world.x + 8, world.y, 'barrel', style);
    }
    if (dark && (type === 'tunnel' || type === 'npc_area') && hp % 5 === 0) {
      drawProp(ctx, world.x, world.y, 'light', 'e4');
    }
    if (dark && type === 'street' && hp % 8 === 0) {
      drawProp(ctx, world.x, world.y, 'neon', 'e4');
    }
    if (!dark && type === 'street' && hp % 7 === 0) {
      drawProp(ctx, world.x, world.y, 'light', 'g6');
    }

  }

  function drawWorldIso(ctx, state, zone) {
    const style = zoneStyle(zone);
    const fills = TILE_FILL[style];
    const w = zone.map.width;
    const h = zone.map.height;
    const zoneCode = zone.code || zone.id || '';

    const cells = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        cells.push({ x, y, depth: x + y });
      }
    }
    cells.sort((a, b) => a.depth - b.depth || a.y - b.y);

    for (const c of cells) {
      const type = getTileType(zone, c.x, c.y);
      const world = tileToWorld(c.x, c.y);
      if (type === 'wall') {
        drawWallBlock(ctx, world.x, world.y, style);
        continue;
      }
      let fill = fills[type] || fills.floor;
      const hv = (hashProp(c.x, c.y) % 7) - 3;
      const hp = hashProp(c.x, c.y);
      drawIsoTile(ctx, world.x, world.y, shade(fill, hv), tileStroke(style, type), {
        seed: hp,
        style,
        type
      });
      placeProps(ctx, world, type, style, hp, zoneCode);
    }

    for (const p of zone.map.poi || []) {
      const world = tileToWorld(p.x, p.y);
      ctx.font = zoneCode === 'AR' ? '8px sans-serif' : '9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = zoneCode === 'AR' ? 'rgba(176,188,200,0.35)' : 'rgba(176,188,200,0.5)';
      ctx.fillText(p.label, world.x, world.y + 18);
    }

    const ents = [];
    for (const n of state._data.npcs.npcs) {
      if (n.zone !== zone.id) continue;
      ents.push({ kind: 'npc', n, depth: n.x + n.y, x: n.x, y: n.y });
    }
    for (const m of monstersInZone(state, zone.id)) {
      // gp2: posição float do corpo (knockback/IA) — tileToWorld(inteiro) = centro
      const mp = getMonsterPos(m);
      const fx = mp.x - 0.5;
      const fy = mp.y - 0.5;
      ents.push({ kind: 'mon', m, depth: fx + fy, x: fx, y: fy });
    }
    ents.push({
      kind: 'player',
      depth: vis.player.x + vis.player.y + 0.01,
      x: vis.player.x,
      y: vis.player.y
    });
    ents.sort((a, b) => a.depth - b.depth);

    const arena = !!(state.arenaMode || state.flags?.arena || zoneCode === 'AR');
    for (const e of ents) {
      if (e.kind === 'npc') {
        if (arena) continue; // arena: sem NPCs
        const w = tileToWorld(e.n.x, e.n.y);
        drawNpc(ctx, w.x, w.y, e.n);
        drawNameplate(ctx, w.x, w.y, e.n.name, null, 1, 1, false);
      } else if (e.kind === 'mon') {
        const w = tileToWorld(e.x, e.y);
        const def = state._monsters[e.m.id];
        drawBot(ctx, w.x, w.y, e.m.id, e.m.hp / e.m.hpMax, vis.player.frame);
        const monName = arena
          ? (e.m.arenaLabel || 'INIMIGO')
          : (def?.name || e.m.id);
        drawNameplate(ctx, w.x, w.y, monName, arena ? null : (def?.level || 1), e.m.hp, e.m.hpMax, true);
      } else {
        const w = tileToWorld(e.x, e.y);
        if (vis.player.facing != null) drawFacingMarker(ctx, w.x, w.y, vis.player.facing);
        drawPlayer(ctx, w.x, w.y, state.player.raceId, vis.player.anim, vis.player.frame);
        drawNameplate(
          ctx, w.x, w.y,
          arena ? 'EU' : state.player.name,
          arena ? null : state.player.nivel,
          state.player.hp, state.player.hpMax, false
        );
      }
    }

    drawVfx(ctx, vfx);
  }

  /** Indicador de direção do corpo (facing suavizado — mesma direção usada no ataque). */
  function drawFacingMarker(ctx, wx, wy, facing) {
    const dx = Math.sin(facing);
    const dy = -Math.cos(facing);
    let sx = (dx - dy) * (ISO.TW / 2);
    let sy = (dx + dy) * (ISO.TH / 2);
    const l = Math.hypot(sx, sy) || 1;
    sx /= l;
    sy /= l;
    const cx = wx + sx * 20;
    const cy = wy + 5 + sy * 10;
    ctx.fillStyle = 'rgba(62,207,191,0.75)';
    ctx.beginPath();
    ctx.moveTo(cx + sx * 7, cy + sy * 3.5);
    ctx.lineTo(cx - sy * 6, cy + sx * 3);
    ctx.lineTo(cx + sy * 6, cy - sx * 3);
    ctx.closePath();
    ctx.fill();
  }

  function shade(hex, delta) {
    const r = Math.max(0, Math.min(255, parseInt(hex.slice(1, 3), 16) + delta * 3));
    const g = Math.max(0, Math.min(255, parseInt(hex.slice(3, 5), 16) + delta * 3));
    const b = Math.max(0, Math.min(255, parseInt(hex.slice(5, 7), 16) + delta * 2));
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  function drawVignette(ctx, w, h, style) {
    const g = ctx.createRadialGradient(w * 0.5, h * 0.48, h * 0.15, w * 0.5, h * 0.5, Math.max(w, h) * 0.72);
    if (style === 'e4') {
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.55, 'rgba(4,6,12,0.15)');
      g.addColorStop(1, 'rgba(0,0,0,0.55)');
    } else {
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.6, 'rgba(8,6,10,0.12)');
      g.addColorStop(1, 'rgba(0,0,0,0.45)');
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  function renderFrame() {
    const state = getState();
    const canvas = document.getElementById('game-canvas');
    const wrap = document.getElementById('canvas-wrap');
    if (!canvas || !wrap || !state) return;
    const zone = state._data.zones.zones.find((z) => z.id === state.zoneId);
    if (!zone?.map) return;

    const now = performance.now();
    const dt = Math.min(0.05, (now - lastT) / 1000);
    const simDt = Math.min(0.25, (now - lastT) / 1000);
    lastT = now;

    const { cssW, cssH } = resizeCameraCanvas(canvas, wrap);
    adaptZoom(cam, zone, cssW, cssH);
    stepVisual(state, dt, simDt);

    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const style = zoneStyle(zone);
    const bg = ctx.createRadialGradient(
      canvas.width * 0.5, canvas.height * 0.42, 16,
      canvas.width * 0.5, canvas.height * 0.5, canvas.width * 0.75
    );
    if (style === 'e4') {
      bg.addColorStop(0, '#0e0c16');
      bg.addColorStop(1, '#030408');
    } else {
      bg.addColorStop(0, '#16141c');
      bg.addColorStop(1, '#06070c');
    }
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    applyCamera(ctx, cam, canvas.width, canvas.height);
    drawWorldIso(ctx, state, zone);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawVignette(ctx, canvas.width, canvas.height, style);
  }

  function loop() {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    try {
      renderFrame();
    } catch (e) {
      console.error('[iso-renderer] frame error:', e);
    }
  }

  return {
    cam,
    vfx,
    vis,
    start(gs, opts = {}) {
      getState = gs;
      hooks = opts || {};
      running = true;
      lastT = performance.now();
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(loop);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
    refresh() {
      if (running) return;
      try { renderFrame(); } catch (e) { console.error('[iso-renderer] refresh error:', e); }
    },
    setPlayerAnim(anim, lock = 0.28) {
      vis.player.anim = anim;
      vis.player._lock = lock;
    },
    shake(n = 6) {
      cam.shake = n;
    },
    resetVis() {
      vis.ready = false;
    },
    tileToScreen(tx, ty) {
      const canvas = document.getElementById('game-canvas');
      const wrap = document.getElementById('canvas-wrap');
      return tileToCanvasCss(cam, canvas, wrap, tx, ty);
    },
    screenToTile(cssX, cssY) {
      const canvas = document.getElementById('game-canvas');
      if (!canvas) return { x: 0, y: 0 };
      const bw = canvas.width;
      const bh = canvas.height;
      const cssW = canvas.clientWidth || bw;
      const cssH = canvas.clientHeight || bh;
      const bx = (cssX / cssW) * bw;
      const by = (cssY / cssH) * bh;
      const world = canvasToWorld(cam, bw, bh, bx, by);
      return worldToTile(world.x, world.y);
    }
  };
}
