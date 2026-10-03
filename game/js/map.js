/**
 * Map logic (collision / tile types) — authoritative.
 * World drawing lives in renderer.js (isometric presentation).
 */
export const LEGEND_DEFAULT = {
  W: 'wall', '.': 'floor', M: 'workshop', S: 'shop', N: 'npc_area',
  '#': 'street', B: 'bot_spawn', T: 'tunnel', K: 'black_market',
  E: 'exit_e4', G: 'exit_g6', R: 'scrap'
};

export function getTileType(zone, x, y) {
  const rows = zone.map.tiles;
  if (y < 0 || y >= rows.length || x < 0 || x >= rows[0].length) return 'wall';
  const ch = rows[y][x];
  const legend = zone.map.legend || LEGEND_DEFAULT;
  return legend[ch] || 'floor';
}

export function isWalkable(zone, x, y) {
  const t = getTileType(zone, x, y);
  if (t === 'wall') return false;
  // ARENA PRINCIPAL: árvores, rochas, caixas e pilares são sólidos (só existem na legenda da zona BR)
  if (t === 'tree' || t === 'rock' || t === 'crate' || t === 'pillar') return false;
  // EVO: portões do Campo de Ascensão bloqueiam enquanto fechados (zone.closed[gate] = true)
  if (zone.closed && zone.closed[t]) return false;
  return true;
}

/** MASTER 10: o HERÓI passa pelo tile de árvore (colisão só no tronco, círculo pequeno — player-motion). Monstros/IA seguem por tile. */
export function isWalkableHero(zone, x, y) {
  const t = getTileType(zone, x, y);
  if (t === 'tree' && zone.br) return true;
  return isWalkable(zone, x, y);
}
export const TREE_TRUNK_R = 0.24;

export function monstersInZone(state, zoneId) {
  return state.monstersAlive.filter((m) => m.alive && m.zone === zoneId);
}

/** @deprecated — renderer owns frames; shim for any leftover imports */
export function drawWorld() {}

/** Stylized minimap — walls/floor/entities, not letter prototype */
/** EVO: camada estática do minimapa em cache (zona + tamanho + portões); só entidades redesenham. */
const miniCache = { key: '', cv: null };
function miniBase(W, H, zone) {
  const gates = zone.closed ? Object.keys(zone.closed).filter((k) => zone.closed[k]).join(',') : '';
  const key = `${zone.id}|${W}x${H}|${gates}`;
  if (miniCache.key === key && miniCache.cv) return miniCache.cv;
  const cv = miniCache.cv && miniCache.cv.width === W && miniCache.cv.height === H ? miniCache.cv : document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#080c12';
  ctx.fillRect(0, 0, W, H);
  const e4 = zone.code === 'E4';
  const tw = W / zone.map.width;
  const th = H / zone.map.height;
  for (let y = 0; y < zone.map.height; y++) {
    for (let x = 0; x < zone.map.width; x++) {
      const t = getTileType(zone, x, y);
      let col = e4 ? '#1a2030' : '#2a3344';
      if (t === 'wall') col = e4 ? '#0a0e14' : '#111820';
      else if (t === 'exit_e4' || t === 'exit_g6') col = '#6a3a5a';
      else if (t === 'scrap' || t === 'bot_spawn') col = '#4a3028';
      else if (t === 'street') col = '#3a4555';
      else if (t === 'black_market' || t === 'shop') col = '#2a3a48';
      else if (t === 'gate1' || t === 'gate2') col = zone.closed?.[t] ? (t === 'gate2' ? '#2f8a3a' : '#2a7a8a') : '#2a3344';
      ctx.fillStyle = col;
      ctx.fillRect(x * tw, y * th, tw + 0.5, th + 0.5);
    }
  }
  ctx.strokeStyle = 'rgba(62,207,191,0.3)';
  ctx.lineWidth = 1;
  for (let y = 0; y < zone.map.height; y++) {
    for (let x = 0; x < zone.map.width; x++) {
      if (getTileType(zone, x, y) === 'wall') continue;
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [dx, dy] of dirs) {
        if (getTileType(zone, x + dx, y + dy) === 'wall') {
          ctx.strokeRect(x * tw + 0.5, y * th + 0.5, tw - 1, th - 1);
          break;
        }
      }
    }
  }
  miniCache.key = key;
  miniCache.cv = cv;
  return cv;
}

export function drawMinimap(canvas, state, zone) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(miniBase(W, H, zone), 0, 0);
  const tw = W / zone.map.width;
  const th = H / zone.map.height;

  for (const m of monstersInZone(state, zone.id)) {
    // EVO: elite/mini-chefe/chefe em dourado/rosa e maiores
    const big = m.boss || m.arch === 'G' || m.arch === 'F';
    ctx.fillStyle = m.boss ? '#5dff6a' : m.arch === 'G' ? '#ff4a8a' : m.arch === 'F' ? '#ffc93a' : '#e85d4c';
    ctx.beginPath();
    ctx.arc(m.x * tw + tw / 2, m.y * th + th / 2, Math.max(2, tw * (big ? 0.55 : 0.35)), 0, Math.PI * 2);
    ctx.fill();
  }
  for (const n of state._data.npcs.npcs) {
    if (n.zone !== zone.id) continue;
    ctx.fillStyle = '#f0c14a';
    ctx.fillRect(n.x * tw + tw * 0.25, n.y * th + th * 0.25, tw * 0.5, th * 0.5);
  }
  ctx.fillStyle = '#3ecfbf';
  ctx.beginPath();
  ctx.moveTo(state.player.x * tw + tw / 2, state.player.y * th + 2);
  ctx.lineTo(state.player.x * tw + tw - 2, state.player.y * th + th - 2);
  ctx.lineTo(state.player.x * tw + 2, state.player.y * th + th - 2);
  ctx.closePath();
  ctx.fill();
}
