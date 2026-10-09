/**
 * NEXARA procedural Canvas2D sprites — silhouettes, not letters/emoji.
 * Own IP: no copying reference characters / names / logos.
 * Pass GRAFICO+: denser props, race armor plates, Mk.I bots with red core.
 */
import { ISO } from './camera.js?v=20261009graf';
import { getSprite } from './assets.js?v=20261009graf';

/** Draw sprite image foot-anchored (bottom-center ≈ foot on tile).
 *  AI painted sprites: height-driven + aspect lock so characters sit ~48–72px tall.
 */
function drawSpriteFoot(ctx, img, wx, wy, drawW, drawH) {
  if (!img || !img.complete || !img.naturalWidth) return false;
  const aspect = img.naturalWidth / img.naturalHeight;
  // Prefer explicit height; derive width from aspect. Default ~64px tall (iso footprint).
  const h = drawH ?? ISO.TH * 2.0;
  const w = drawW ?? Math.max(ISO.TW * 0.55, h * aspect);
  // Slight foot pad — AI art already crops near boots
  const footPad = h * 0.06;
  // Soft foot shadow so silhouette pops on dark floor
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.ellipse(wx, wy + 1, w * 0.28, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.drawImage(img, wx - w / 2, wy - h + footPad, w, h);
  return true;
}

function drawSpriteProp(ctx, img, wx, wy, scale = 1) {
  if (!img || !img.complete || !img.naturalWidth) return false;
  const aspect = img.naturalWidth / img.naturalHeight;
  // Props ~32–48px tall on canvas
  const h = ISO.TH * 1.25 * scale;
  const w = Math.max(ISO.TW * 0.45, h * aspect);
  ctx.drawImage(img, wx - w / 2, wy - h + 4, w, h);
  return true;
}

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function npcSpriteId(npc) {
  const key = (npc?.role || '') + '|' + (npc?.id || '') + '|' + (npc?.name || '');
  const id = (npc?.id || '').toLowerCase();
  const elderRoles = ['quest_giver', 'citizen', 'informant', 'elder', 'arquivo'];
  const techRoles = ['smith_tech', 'merchant', 'trainer', 'guard', 'tech', 'black_market'];
  if (id.includes('elder') || id.includes('rusk') || id.includes('hesh') || id.includes('arquivo')) return 'npc-elder';
  if (id.includes('mara') || id.includes('tech') || id.includes('guarda') || id.includes('trein')) return 'npc-tech';
  if (npc?.role && elderRoles.includes(npc.role)) return 'npc-elder';
  if (npc?.role && techRoles.includes(npc.role)) return 'npc-tech';
  return (hashStr(key) % 2 === 0) ? 'npc-tech' : 'npc-elder';
}


const RACE_PALETTE = {
  humano: { skin: '#c4a882', armor: '#3a4a5a', accent: '#3ecfbf', helm: '#2a3544', plate: '#5a6a7a' },
  orc: { skin: '#5a8a4a', armor: '#4a3a28', accent: '#e85d4c', helm: '#3a2a18', plate: '#6a5030' },
  mago: { skin: '#d0c0e8', armor: '#3a2a5a', accent: '#7b5cff', helm: '#2a1a4a', plate: '#4a3a6a' },
  hibrido: { skin: '#8a9aaa', armor: '#2a3a48', accent: '#f0c14a', helm: '#1a2838', plate: '#3a5060' },
  dragao: { skin: '#c45c4a', armor: '#5a2020', accent: '#ff6a40', helm: '#3a1010', plate: '#7a3030' }
};

const NPC_SIL = {
  npc_quest_giver_g6: { body: '#c9a227', cloak: '#6a5010', hat: true, staff: true },
  npc_mara_venn: { body: '#e85d4c', cloak: '#5a3030', tool: true, apron: true },
  npc_mercador_kesh: { body: '#5dde8a', cloak: '#2a4a38', pack: true },
  npc_treinadora_lia: { body: '#3ecfbf', cloak: '#1a3a3a', blade: true },
  npc_cidadao_tomo: { body: '#8a9aaa', cloak: '#3a4048' },
  npc_informante_nyx: { body: '#7b5cff', cloak: '#2a1a4a', hood: true, thin: true },
  npc_guarda_brak: { body: '#6a7a8a', cloak: '#3a444e', shield: true, helm: true },
  npc_misterioso_sombra: { body: '#c080ff', cloak: '#1a1028', hood: true, tall: true },
  npc_e4_quest_hesh: { body: '#f0c14a', cloak: '#4a3a10', hat: true, cane: true },
  npc_e4_mercador_vex: { body: '#9b5cff', cloak: '#2a1840', pack: true, hood: true },
  npc_e4_informante_cinza: { body: '#9aa0aa', cloak: '#3a3e48', hood: true, thin: true },
  npc_e4_mutante_kal: { body: '#6a8a5a', cloak: '#2a3a28', mutant: true },
  npc_e4_guarda_selo: { body: '#5a6a7a', cloak: '#2a3038', shield: true, helm: true },
  npc_e4_arquivo_rasgado: { body: '#8a7060', cloak: '#3a2820', poster: true }
};

export function racePalette(raceId) {
  return RACE_PALETTE[raceId] || RACE_PALETTE.humano;
}

function hash2(x, y) {
  return ((x * 73856093) ^ (y * 19349663)) >>> 0;
}

/** Draw isometric floor diamond with cracked concrete / rust / plate noise */
export function drawIsoTile(ctx, wx, wy, fill, stroke, opts = {}) {
  const hw = ISO.TW / 2;
  const hh = ISO.TH / 2;
  const { seed = 0, style = 'g6', type = 'floor' } = opts;

  const tileImg = getSprite(style === 'e4' ? 'tile-e4' : 'tile-g6');
  if (tileImg && tileImg.complete && tileImg.naturalWidth) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(wx, wy - hh);
    ctx.lineTo(wx + hw, wy);
    ctx.lineTo(wx, wy + hh);
    ctx.lineTo(wx - hw, wy);
    ctx.closePath();
    ctx.clip();
    // Soften floor: desaturate + darken so characters pop (keep AI sprite)
    const dw = ISO.TW * 1.08;
    const dh = ISO.TH * 1.08;
    ctx.filter = style === 'e4'
      ? 'saturate(0.28) brightness(0.62) contrast(0.82)'
      : 'saturate(0.32) brightness(0.68) contrast(0.8)';
    ctx.drawImage(tileImg, wx - dw / 2, wy - dh / 2, dw, dh);
    ctx.filter = 'none';
    // Graphite wash — kill residual orange/red floor dominance
    ctx.fillStyle = style === 'e4' ? 'rgba(10,14,20,0.42)' : 'rgba(18,22,28,0.4)';
    ctx.fill();
    ctx.restore();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(wx, wy - hh);
      ctx.lineTo(wx + hw, wy);
      ctx.lineTo(wx, wy + hh);
      ctx.lineTo(wx - hw, wy);
      ctx.closePath();
      ctx.stroke();
    }
    return;
  }

  ctx.beginPath();
  ctx.moveTo(wx, wy - hh);
  ctx.lineTo(wx + hw, wy);
  ctx.lineTo(wx, wy + hh);
  ctx.lineTo(wx - hw, wy);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();

  // Clip to diamond for decals
  ctx.save();
  ctx.clip();

  // Subtle noise speckles
  const n = 8 + (seed % 6);
  for (let i = 0; i < n; i++) {
    const hx = hash2(seed, i * 17);
    const ox = ((hx % 48) - 24) * 0.85;
    const oy = (((hx >> 8) % 22) - 11) * 0.7;
    const a = style === 'e4' ? 0.08 : 0.1;
    ctx.fillStyle = (hx & 1) ? `rgba(0,0,0,${a})` : `rgba(140,145,150,${a * 0.55})`;
    ctx.fillRect(wx + ox - 1, wy + oy - 1, 2 + (hx % 2), 1 + (hx % 2));
  }

  // Crack lines on floor/street
  if (type === 'floor' || type === 'street' || type === 'scrap') {
    if (seed % 5 === 0 || seed % 7 === 0) {
      ctx.strokeStyle = style === 'e4' ? 'rgba(8,12,20,0.75)' : 'rgba(18,16,12,0.65)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const cx = ((seed % 20) - 10);
      ctx.moveTo(wx + cx - 8, wy - 4);
      ctx.lineTo(wx + cx + 2, wy + 2);
      ctx.lineTo(wx + cx + 10, wy - 1);
      ctx.stroke();
    }
  }

  // Subtle metal stain (low saturation — avoid orange floor dominance)
  if ((type === 'street' || type === 'scrap' || type === 'floor') && seed % 6 === 0) {
    const rust = style === 'e4'
      ? 'rgba(70,60,55,0.28)'
      : 'rgba(80,75,70,0.26)';
    ctx.fillStyle = rust;
    ctx.beginPath();
    ctx.ellipse(wx + ((seed % 9) - 4), wy + ((seed % 5) - 2), 7 + (seed % 4), 3 + (seed % 2), 0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Metal plate seams
  if ((type === 'street' || type === 'workshop' || type === 'bot_spawn') && seed % 4 === 0) {
    ctx.strokeStyle = style === 'e4' ? 'rgba(60,80,100,0.22)' : 'rgba(90,100,110,0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(wx - 12, wy);
    ctx.lineTo(wx, wy - 6);
    ctx.lineTo(wx + 12, wy);
    ctx.stroke();
  }

  // Neon edge accent (rare)
  if (seed % 23 === 0 && type !== 'wall') {
    ctx.strokeStyle = style === 'e4' ? 'rgba(123,92,255,0.35)' : 'rgba(62,207,191,0.3)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(wx - hw * 0.5, wy);
    ctx.lineTo(wx, wy + hh * 0.55);
    ctx.stroke();
  }

  ctx.restore();

  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(wx, wy - hh);
    ctx.lineTo(wx + hw, wy);
    ctx.lineTo(wx, wy + hh);
    ctx.lineTo(wx - hw, wy);
    ctx.closePath();
    ctx.stroke();
  }
}

export function drawWallBlock(ctx, wx, wy, zoneStyle) {
  const hw = ISO.TW / 2;
  const hh = ISO.TH / 2;
  const h = zoneStyle === 'e4' ? 30 : 24;
  const wallImg = getSprite('wall-g6');
  if (wallImg && wallImg.complete && wallImg.naturalWidth) {
    const dw = ISO.TW * 1.2;
    const dh = (zoneStyle === 'e4' ? 56 : 50);
    ctx.drawImage(wallImg, wx - dw / 2, wy - dh + hh * 0.35, dw, dh);
    return;
  }
  // top
  ctx.beginPath();
  ctx.moveTo(wx, wy - hh - h);
  ctx.lineTo(wx + hw, wy - h);
  ctx.lineTo(wx, wy + hh - h);
  ctx.lineTo(wx - hw, wy - h);
  ctx.closePath();
  ctx.fillStyle = zoneStyle === 'e4' ? '#161e2a' : '#2a3548';
  ctx.fill();
  // rivets on top
  ctx.fillStyle = zoneStyle === 'e4' ? 'rgba(80,100,130,0.35)' : 'rgba(120,130,150,0.3)';
  ctx.fillRect(wx - 6, wy - hh - h + 4, 2, 2);
  ctx.fillRect(wx + 4, wy - hh - h + 6, 2, 2);
  // left face
  ctx.beginPath();
  ctx.moveTo(wx - hw, wy - h);
  ctx.lineTo(wx, wy + hh - h);
  ctx.lineTo(wx, wy + hh);
  ctx.lineTo(wx - hw, wy);
  ctx.closePath();
  ctx.fillStyle = zoneStyle === 'e4' ? '#0a1018' : '#161e2a';
  ctx.fill();
  // right face
  ctx.beginPath();
  ctx.moveTo(wx + hw, wy - h);
  ctx.lineTo(wx, wy + hh - h);
  ctx.lineTo(wx, wy + hh);
  ctx.lineTo(wx + hw, wy);
  ctx.closePath();
  ctx.fillStyle = zoneStyle === 'e4' ? '#101820' : '#1e2838';
  ctx.fill();
  // vertical seam
  ctx.strokeStyle = zoneStyle === 'e4' ? 'rgba(40,55,75,0.4)' : 'rgba(55,70,90,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(wx, wy + hh - h);
  ctx.lineTo(wx, wy + hh);
  ctx.stroke();
}

export function drawProp(ctx, wx, wy, kind, zoneStyle) {
  ctx.save();
  const propMap = {
    crate: 'prop-crate',
    barrel: 'prop-barrel',
    scrap: 'prop-scrap',
    light: 'prop-lamp',
    neon: 'prop-lamp'
  };
  const propId = propMap[kind];
  if (propId) {
    const pimg = getSprite(propId);
    if (pimg && drawSpriteProp(ctx, pimg, wx, wy, kind === 'scrap' ? 0.95 : kind === 'light' || kind === 'neon' ? 1.35 : kind === 'barrel' ? 1.05 : 1)) {
      ctx.restore();
      return;
    }
  }
  if (kind === 'crate') {
    // stacked crate with band
    ctx.fillStyle = zoneStyle === 'e4' ? '#2a3038' : '#5a4030';
    ctx.fillRect(wx - 11, wy - 24, 22, 20);
    ctx.fillStyle = zoneStyle === 'e4' ? '#1a2028' : '#3a2818';
    ctx.fillRect(wx - 11, wy - 8, 22, 6);
    ctx.strokeStyle = zoneStyle === 'e4' ? '#4a5565' : '#8a6a3a';
    ctx.lineWidth = 1;
    ctx.strokeRect(wx - 11, wy - 24, 22, 20);
    ctx.strokeStyle = '#6a5030';
    ctx.beginPath();
    ctx.moveTo(wx - 11, wy - 16);
    ctx.lineTo(wx + 11, wy - 16);
    ctx.stroke();
    // occasional tarp
    if ((Math.abs(Math.floor(wx + wy)) % 3) === 0) {
      ctx.fillStyle = zoneStyle === 'e4' ? 'rgba(40,80,60,0.55)' : 'rgba(50,90,55,0.5)';
      ctx.fillRect(wx - 12, wy - 26, 24, 5);
    }
  } else if (kind === 'barrel') {
    ctx.fillStyle = '#5a3220';
    ctx.beginPath();
    ctx.ellipse(wx, wy - 8, 9, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3a2010';
    ctx.beginPath();
    ctx.ellipse(wx, wy + 2, 9, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#c08040';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(wx, wy - 14, 8, 3, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(wx, wy - 4, 8, 3, 0, 0, Math.PI * 2);
    ctx.stroke();
    // rust drip
    ctx.fillStyle = 'rgba(160,70,30,0.5)';
    ctx.fillRect(wx + 5, wy - 10, 2, 8);
  } else if (kind === 'pipe') {
    ctx.strokeStyle = zoneStyle === 'e4' ? '#3a4a5a' : '#7a5a3a';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(wx - 16, wy - 2);
    ctx.lineTo(wx + 4, wy - 14);
    ctx.lineTo(wx + 16, wy - 10);
    ctx.stroke();
    ctx.fillStyle = zoneStyle === 'e4' ? '#4a5a6a' : '#8a6a4a';
    ctx.beginPath();
    ctx.arc(wx + 4, wy - 14, 4, 0, Math.PI * 2);
    ctx.fill();
    // valve glow rare
    if (zoneStyle === 'e4') {
      ctx.fillStyle = 'rgba(123,92,255,0.4)';
      ctx.beginPath();
      ctx.arc(wx + 4, wy - 14, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (kind === 'container') {
    ctx.fillStyle = zoneStyle === 'e4' ? '#1e2835' : '#3a4a38';
    ctx.fillRect(wx - 16, wy - 28, 32, 24);
    ctx.fillStyle = zoneStyle === 'e4' ? '#141c28' : '#2a3830';
    ctx.fillRect(wx - 16, wy - 8, 32, 8);
    ctx.strokeStyle = zoneStyle === 'e4' ? 'rgba(62,207,191,0.35)' : 'rgba(240,160,60,0.4)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(wx - 16, wy - 28, 32, 24);
    ctx.fillStyle = zoneStyle === 'e4' ? 'rgba(123,92,255,0.5)' : 'rgba(232,93,76,0.45)';
    ctx.fillRect(wx - 4, wy - 22, 8, 3);
  } else if (kind === 'scrap') {
    ctx.fillStyle = '#6a5030';
    ctx.fillRect(wx - 14, wy - 8, 28, 10);
    ctx.fillStyle = '#4a3a28';
    ctx.fillRect(wx - 10, wy - 14, 12, 7);
    ctx.fillStyle = '#8a7060';
    ctx.fillRect(wx + 2, wy - 18, 10, 6);
    ctx.strokeStyle = 'rgba(200,140,60,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(wx - 12, wy - 4);
    ctx.lineTo(wx + 8, wy - 12);
    ctx.stroke();
  } else if (kind === 'neon') {
    const col = zoneStyle === 'e4' ? 'rgba(123,92,255,0.7)' : 'rgba(62,207,191,0.65)';
    const g = ctx.createRadialGradient(wx, wy - 12, 1, wx, wy - 12, 22);
    g.addColorStop(0, col);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(wx, wy - 12, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = zoneStyle === 'e4' ? '#9b7cff' : '#5ee0d0';
    ctx.fillRect(wx - 8, wy - 16, 16, 3);
  } else if (kind === 'light') {
    const warm = zoneStyle === 'e4';
    const g = ctx.createRadialGradient(wx, wy - 10, 2, wx, wy - 10, 36);
    g.addColorStop(0, warm ? 'rgba(123,92,255,0.55)' : 'rgba(255,170,70,0.55)');
    g.addColorStop(0.45, warm ? 'rgba(80,50,160,0.18)' : 'rgba(200,100,40,0.15)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(wx, wy - 10, 36, 0, Math.PI * 2);
    ctx.fill();
    // lamp fixture
    ctx.fillStyle = '#2a3038';
    ctx.fillRect(wx - 3, wy - 22, 6, 8);
    ctx.fillStyle = warm ? '#b090ff' : '#ffc060';
    ctx.beginPath();
    ctx.arc(wx, wy - 12, 3, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'exit') {
    const col = zoneStyle === 'exit_e4' ? '#e85d4c' : '#3ecfbf';
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.strokeRect(wx - 12, wy - 20, 24, 16);
    ctx.fillStyle = col;
    ctx.globalAlpha = 0.22;
    ctx.fillRect(wx - 12, wy - 20, 24, 16);
    ctx.globalAlpha = 1;
    const g = ctx.createRadialGradient(wx, wy - 12, 2, wx, wy - 12, 28);
    g.addColorStop(0, col.replace(')', ',0.25)').replace('#e85d4c', 'rgba(232,93,76').replace('#3ecfbf', 'rgba(62,207,191') + ')');
    // simpler glow
    ctx.fillStyle = zoneStyle === 'exit_e4' ? 'rgba(232,93,76,0.2)' : 'rgba(62,207,191,0.2)';
    ctx.beginPath();
    ctx.arc(wx, wy - 12, 22, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Player silhouette by race + armor plates — NEXARA identity
 */
export function drawPlayer(ctx, wx, wy, raceId, anim = 'idle', frame = 0) {
  const pal = racePalette(raceId);
  const bob = anim === 'walk' ? Math.sin(frame * 1.2) * 2 : anim === 'idle' ? Math.sin(frame * 0.4) * 1 : 0;
  const lean = anim === 'attack' ? 5 : anim === 'hurt' ? -3 : 0;
  const y = wy + bob;
  const x = wx + lean;

  const raceSprite = getSprite(`player-${raceId}`) || getSprite('player-humano');
  if (raceSprite && raceSprite.complete && raceSprite.naturalWidth) {
    // soft ground glow
    const glow = ctx.createRadialGradient(wx, wy + 4, 2, wx, wy + 4, 22);
    glow.addColorStop(0, 'rgba(62,207,191,0.22)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(wx, wy + 4, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(wx, wy + 6, 15, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    drawSpriteFoot(ctx, raceSprite, x, y, undefined, ISO.TH * 2.05);
    if (anim === 'attack') {
      ctx.strokeStyle = 'rgba(62,207,191,0.85)';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(x + 10, y - 18, 18, -1.0, 0.7);
      ctx.stroke();
    }
    if (anim === 'hurt') {
      ctx.fillStyle = 'rgba(232,93,76,0.35)';
      ctx.beginPath();
      ctx.arc(x, y - 20, 20, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }

  // soft ground glow (cyan for ally)
  const glow = ctx.createRadialGradient(wx, wy + 4, 2, wx, wy + 4, 22);
  glow.addColorStop(0, 'rgba(62,207,191,0.22)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(wx, wy + 4, 22, 0, Math.PI * 2);
  ctx.fill();

  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(wx, wy + 6, 15, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // legs with plate greaves
  const legSpread = anim === 'walk' ? Math.sin(frame * 1.2) * 3.5 : 0;
  ctx.fillStyle = pal.armor;
  ctx.fillRect(x - 8 - legSpread, y - 8, 6, 13);
  ctx.fillRect(x + 2 + legSpread, y - 8, 6, 13);
  ctx.fillStyle = pal.plate;
  ctx.fillRect(x - 8 - legSpread, y - 2, 6, 4);
  ctx.fillRect(x + 2 + legSpread, y - 2, 6, 4);

  // torso + shoulder plates
  ctx.fillStyle = pal.armor;
  ctx.fillRect(x - 10, y - 28, 20, 20);
  ctx.fillStyle = pal.plate;
  ctx.fillRect(x - 12, y - 28, 6, 8);
  ctx.fillRect(x + 6, y - 28, 6, 8);
  // chest accent core
  ctx.fillStyle = pal.accent;
  ctx.globalAlpha = 0.85;
  ctx.fillRect(x - 3, y - 22, 6, 9);
  ctx.globalAlpha = 1;
  // belt
  ctx.fillStyle = '#1a2028';
  ctx.fillRect(x - 10, y - 10, 20, 3);

  // arms
  ctx.fillStyle = pal.armor;
  ctx.fillRect(x - 15, y - 26, 5, 14);
  ctx.fillRect(x + 10, y - 26, 5, 14);

  // head
  ctx.fillStyle = pal.skin;
  ctx.beginPath();
  ctx.arc(x, y - 34, 7.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = pal.helm;
  ctx.fillRect(x - 9, y - 40, 18, 7);
  // visor slit
  ctx.fillStyle = pal.accent;
  ctx.globalAlpha = 0.7;
  ctx.fillRect(x - 5, y - 36, 10, 2);
  ctx.globalAlpha = 1;

  // race accents
  if (raceId === 'orc') {
    ctx.fillStyle = pal.skin;
    ctx.fillRect(x - 11, y - 32, 3, 5);
    ctx.fillRect(x + 8, y - 32, 3, 5);
    // heavier pauldrons
    ctx.fillStyle = pal.plate;
    ctx.fillRect(x - 14, y - 30, 5, 10);
    ctx.fillRect(x + 9, y - 30, 5, 10);
  }
  if (raceId === 'mago') {
    // cloak sweep
    ctx.fillStyle = pal.armor;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(x - 12, y - 20);
    ctx.lineTo(x - 18, y + 2);
    ctx.lineTo(x - 4, y - 8);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    // orb
    ctx.fillStyle = pal.accent;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(x + 14, y - 28, 5, 0, Math.PI * 2);
    ctx.fill();
    const og = ctx.createRadialGradient(x + 14, y - 28, 1, x + 14, y - 28, 12);
    og.addColorStop(0, 'rgba(123,92,255,0.5)');
    og.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = og;
    ctx.beginPath();
    ctx.arc(x + 14, y - 28, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  if (raceId === 'hibrido') {
    ctx.strokeStyle = pal.accent;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - 7, y - 18);
    ctx.lineTo(x + 7, y - 18);
    ctx.moveTo(x - 5, y - 14);
    ctx.lineTo(x + 5, y - 14);
    ctx.stroke();
    // tech ear
    ctx.fillStyle = pal.accent;
    ctx.fillRect(x + 7, y - 36, 4, 6);
  }
  if (raceId === 'humano') {
    // short blade on back
    ctx.strokeStyle = '#c8d0da';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 8, y - 30);
    ctx.lineTo(x + 14, y - 12);
    ctx.stroke();
  }

  if (anim === 'attack') {
    ctx.strokeStyle = 'rgba(62,207,191,0.85)';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(x + 10, y - 18, 18, -1.0, 0.7);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(200,255,250,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x + 10, y - 18, 14, -0.8, 0.5);
    ctx.stroke();
  }
  if (anim === 'hurt') {
    ctx.fillStyle = 'rgba(232,93,76,0.35)';
    ctx.beginPath();
    ctx.arc(x, y - 20, 20, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawNpc(ctx, wx, wy, npc) {
  const sil = NPC_SIL[npc.id] || { body: '#8a9aaa', cloak: '#3a4048' };
  const thin = sil.thin ? 0.85 : 1;
  const tall = sil.tall ? 1.15 : 1;

  const nimg = getSprite(npcSpriteId(npc));
  if (nimg && nimg.complete && nimg.naturalWidth) {
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath();
    ctx.ellipse(wx, wy + 5, 13 * thin, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    const g = ctx.createRadialGradient(wx, wy + 2, 2, wx, wy + 2, 16);
    g.addColorStop(0, 'rgba(62,207,191,0.12)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(wx, wy + 2, 16, 0, Math.PI * 2);
    ctx.fill();
    drawSpriteFoot(ctx, nimg, wx, wy, undefined, ISO.TH * 1.95);
    return;
  }

  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.beginPath();
  ctx.ellipse(wx, wy + 5, 13 * thin, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // soft ally glow
  const g = ctx.createRadialGradient(wx, wy + 2, 2, wx, wy + 2, 16);
  g.addColorStop(0, 'rgba(62,207,191,0.12)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(wx, wy + 2, 16, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = sil.cloak;
  ctx.beginPath();
  ctx.moveTo(wx - 12 * thin, wy - 8);
  ctx.lineTo(wx, wy - 34 * tall);
  ctx.lineTo(wx + 12 * thin, wy - 8);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = sil.body;
  ctx.fillRect(wx - 7 * thin, wy - 28 * tall, 14 * thin, 20 * tall);

  ctx.fillStyle = sil.hood ? sil.cloak : '#c4a882';
  ctx.beginPath();
  ctx.arc(wx, wy - 34 * tall, 6.5, 0, Math.PI * 2);
  ctx.fill();

  if (sil.hat) {
    ctx.fillStyle = sil.body;
    ctx.fillRect(wx - 8, wy - 42 * tall, 16, 4);
    ctx.fillRect(wx - 4, wy - 48 * tall, 8, 6);
  }
  if (sil.helm) {
    ctx.fillStyle = '#4a5560';
    ctx.fillRect(wx - 7, wy - 40 * tall, 14, 8);
  }
  if (sil.shield) {
    ctx.fillStyle = '#5a6a7a';
    ctx.fillRect(wx - 16, wy - 26, 8, 14);
    ctx.strokeStyle = '#3ecfbf';
    ctx.strokeRect(wx - 16, wy - 26, 8, 14);
  }
  if (sil.staff || sil.cane) {
    ctx.strokeStyle = '#c9a227';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(wx + 10, wy - 40);
    ctx.lineTo(wx + 12, wy + 2);
    ctx.stroke();
  }
  if (sil.tool) {
    ctx.fillStyle = '#aaa';
    ctx.fillRect(wx + 8, wy - 22, 10, 3);
  }
  if (sil.pack) {
    ctx.fillStyle = '#3a2a18';
    ctx.fillRect(wx - 14, wy - 24, 6, 12);
  }
  if (sil.blade) {
    ctx.strokeStyle = '#d8e0ea';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(wx + 10, wy - 30);
    ctx.lineTo(wx + 16, wy - 8);
    ctx.stroke();
  }
  if (sil.mutant) {
    ctx.fillStyle = '#6a8a5a';
    ctx.beginPath();
    ctx.arc(wx + 8, wy - 20, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  if (sil.poster) {
    ctx.fillStyle = '#d8c8a0';
    ctx.fillRect(wx - 6, wy - 30, 12, 16);
    ctx.strokeStyle = '#e85d4c';
    ctx.strokeRect(wx - 6, wy - 30, 12, 16);
  }
  if (sil.apron) {
    ctx.fillStyle = '#8a6a4a';
    ctx.fillRect(wx - 8, wy - 18, 16, 12);
  }
}

/** Mechanical bot Mk.I — metal limbs, red eye/core glow (NEXARA identity) */
export function drawBot(ctx, wx, wy, monId, hpPct = 1, frame = 0) {
  const isRato = monId.includes('rato');
  const isDrone = monId.includes('drone');
  const isMut = monId.includes('mut');
  const isSucata = monId.includes('sucata');
  const pulse = 0.65 + Math.sin(frame * 0.35) * 0.35;
  const id = monId || '';

  // Original bot sprites for combate / patrulha Mk.I
  let botImg = null;
  if (id.includes('combate')) botImg = getSprite('bot-combate');
  else if (id.includes('patrulha')) botImg = getSprite('bot-patrulha');
  if (botImg && botImg.complete && botImg.naturalWidth) {
    const hg = ctx.createRadialGradient(wx, wy + 4, 2, wx, wy + 4, 20);
    hg.addColorStop(0, `rgba(232,93,76,${0.18 * pulse})`);
    hg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.arc(wx, wy + 4, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(wx, wy + 5, 13, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    drawSpriteFoot(ctx, botImg, wx, wy, undefined, ISO.TH * 2.0);
    if (hpPct < 0.35) {
      ctx.fillStyle = 'rgba(232,93,76,0.18)';
      ctx.fillRect(wx - 14, wy - 44, 28, 50);
    }
    return;
  }

  // hostile ground glow
  const hg = ctx.createRadialGradient(wx, wy + 4, 2, wx, wy + 4, 20);
  hg.addColorStop(0, `rgba(232,93,76,${0.18 * pulse})`);
  hg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.arc(wx, wy + 4, 20, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(wx, wy + 5, 13, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();

  if (isRato) {
    ctx.fillStyle = '#4a5058';
    ctx.beginPath();
    ctx.ellipse(wx, wy - 8, 15, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2a3038';
    ctx.fillRect(wx - 4, wy - 14, 14, 8);
    ctx.fillStyle = '#e85d4c';
    ctx.globalAlpha = pulse;
    ctx.beginPath();
    ctx.arc(wx + 9, wy - 11, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#3a4048';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(wx - 12, wy - 8);
    ctx.lineTo(wx - 22, wy - 18);
    ctx.stroke();
    return;
  }

  if (isDrone) {
    ctx.fillStyle = '#3a4550';
    ctx.beginPath();
    ctx.ellipse(wx, wy - 20, 13, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2a3038';
    ctx.fillRect(wx - 6, wy - 24, 12, 5);
    ctx.fillStyle = '#e85d4c';
    ctx.globalAlpha = pulse;
    ctx.beginPath();
    ctx.arc(wx, wy - 18, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = `rgba(232,93,76,${0.35 * pulse})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(wx, wy - 18, 18, 0, Math.PI * 2);
    ctx.stroke();
    // rotor blades hint
    ctx.strokeStyle = 'rgba(160,170,180,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(wx - 18, wy - 22);
    ctx.lineTo(wx + 18, wy - 22);
    ctx.stroke();
    return;
  }

  // biped Mk.I
  const bodyCol = isMut ? '#3a4a3a' : isSucata ? '#5a4a30' : '#3e4a58';
  const plateCol = isMut ? '#4a5a4a' : isSucata ? '#7a6a40' : '#5a6878';

  // hydraulic legs
  ctx.strokeStyle = '#2a3038';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(wx - 6, wy - 10);
  ctx.lineTo(wx - 8, wy + 2);
  ctx.moveTo(wx + 6, wy - 10);
  ctx.lineTo(wx + 8, wy + 2);
  ctx.stroke();
  ctx.fillStyle = plateCol;
  ctx.fillRect(wx - 10, wy - 4, 7, 8);
  ctx.fillRect(wx + 3, wy - 4, 7, 8);

  // torso chassis
  ctx.fillStyle = bodyCol;
  ctx.fillRect(wx - 11, wy - 30, 22, 22);
  ctx.fillStyle = plateCol;
  ctx.fillRect(wx - 9, wy - 28, 18, 6);
  // panel lines
  ctx.strokeStyle = 'rgba(20,24,32,0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(wx, wy - 30);
  ctx.lineTo(wx, wy - 10);
  ctx.stroke();

  // arms — segmented metal
  ctx.fillStyle = bodyCol;
  ctx.fillRect(wx - 17, wy - 26, 6, 16);
  ctx.fillRect(wx + 11, wy - 26, 6, 16);
  ctx.fillStyle = plateCol;
  ctx.fillRect(wx - 18, wy - 12, 7, 5);
  ctx.fillRect(wx + 11, wy - 12, 7, 5);

  // head / visor
  ctx.fillStyle = '#1a2028';
  ctx.fillRect(wx - 9, wy - 42, 18, 13);
  ctx.fillStyle = plateCol;
  ctx.fillRect(wx - 9, wy - 42, 18, 3);
  // red eye bar
  ctx.fillStyle = '#e85d4c';
  ctx.globalAlpha = pulse;
  ctx.fillRect(wx - 7, wy - 36, 14, 4);
  // soft eye bloom
  const eg = ctx.createRadialGradient(wx, wy - 34, 1, wx, wy - 34, 14);
  eg.addColorStop(0, `rgba(255,60,40,${0.55 * pulse})`);
  eg.addColorStop(1, 'rgba(255,40,20,0)');
  ctx.fillStyle = eg;
  ctx.beginPath();
  ctx.arc(wx, wy - 34, 14, 0, Math.PI * 2);
  ctx.fill();

  // chest core glow
  const core = ctx.createRadialGradient(wx, wy - 18, 1, wx, wy - 18, 12);
  core.addColorStop(0, `rgba(255,70,50,${0.95 * pulse})`);
  core.addColorStop(0.5, `rgba(200,40,30,${0.35 * pulse})`);
  core.addColorStop(1, 'rgba(255,40,20,0)');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(wx, wy - 18, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(255,120,90,${0.9 * pulse})`;
  ctx.beginPath();
  ctx.arc(wx, wy - 18, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  if (hpPct < 0.35) {
    ctx.fillStyle = 'rgba(232,93,76,0.18)';
    ctx.fillRect(wx - 14, wy - 44, 28, 50);
    // spark
    if (frame % 3 === 0) {
      ctx.fillStyle = '#ffc060';
      ctx.fillRect(wx + 8, wy - 26, 2, 2);
    }
  }
}

/** Small canvas icon for inventory item type */
const CAT_ICON_RAR = { comum: '#c8d4d0', incomum: '#4aa0ff', raro: '#ffc24a', epico: '#b36bff', lendario: '#ffd34a', reator: '#ff3a5a' };
/** M3D/itens: ícone vetorial por CATEGORIA (roupa, armadura, espada, lança, cajado, arco, acessório). */
function drawCategoryIcon(ctx, s, item) {
  const g = item.visual?.glow != null ? `#${Number(item.visual.glow).toString(16).padStart(6, '0')}` : (CAT_ICON_RAR[item.rarity] || '#9fd8ff');
  const metal = '#d8e4f0';
  ctx.lineCap = 'round';
  const line = (c, w, pts) => { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); pts.forEach(([a, b], i) => (i ? ctx.lineTo(a * s, b * s) : ctx.moveTo(a * s, b * s))); ctx.stroke(); };
  const c = item.category;
  if (c === 'espada') { line(g, 4, [[0.22, 0.78], [0.82, 0.18]]); line(metal, 1.6, [[0.22, 0.78], [0.82, 0.18]]); line('#8a6a3a', 3, [[0.12, 0.88], [0.26, 0.74]]); line(metal, 2, [[0.18, 0.62], [0.38, 0.82]]); }
  else if (c === 'lanca') { line('#8a6a3a', 2.5, [[0.12, 0.88], [0.72, 0.28]]); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0.9 * s, 0.1 * s); ctx.lineTo(0.62 * s, 0.24 * s); ctx.lineTo(0.76 * s, 0.38 * s); ctx.closePath(); ctx.fill(); }
  else if (c === 'cajado') { line('#6a4a2a', 2.5, [[0.3, 0.92], [0.62, 0.3]]); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0.66 * s, 0.22 * s, 0.13 * s, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0.64 * s, 0.2 * s, 0.04 * s, 0, Math.PI * 2); ctx.fill(); }
  else if (c === 'arco') { ctx.strokeStyle = metal; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0.32 * s, 0.5 * s, 0.38 * s, -1.1, 1.1); ctx.stroke(); line(g, 1.2, [[0.47, 0.17], [0.47, 0.83]]); line(g, 2, [[0.2, 0.5], [0.86, 0.5]]); }
  else if (c === 'armadura') { ctx.fillStyle = '#4a5565'; ctx.beginPath(); ctx.moveTo(0.2 * s, 0.2 * s); ctx.lineTo(0.8 * s, 0.2 * s); ctx.lineTo(0.74 * s, 0.86 * s); ctx.lineTo(0.26 * s, 0.86 * s); ctx.closePath(); ctx.fill(); ctx.strokeStyle = g; ctx.lineWidth = 1.6; ctx.stroke(); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0.5 * s, 0.44 * s, 0.07 * s, 0, Math.PI * 2); ctx.fill(); }
  else if (c === 'roupa') { ctx.fillStyle = '#2a3442'; ctx.beginPath(); ctx.moveTo(0.3 * s, 0.14 * s); ctx.lineTo(0.7 * s, 0.14 * s); ctx.lineTo(0.9 * s, 0.4 * s); ctx.lineTo(0.76 * s, 0.46 * s); ctx.lineTo(0.74 * s, 0.88 * s); ctx.lineTo(0.26 * s, 0.88 * s); ctx.lineTo(0.24 * s, 0.46 * s); ctx.lineTo(0.1 * s, 0.4 * s); ctx.closePath(); ctx.fill(); ctx.strokeStyle = g; ctx.lineWidth = 1.4; ctx.stroke(); }
  else if (c === 'acessorio') { ctx.strokeStyle = metal; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(0.5 * s, 0.34 * s, 0.24 * s, Math.PI * 0.1, Math.PI * 0.9, true); ctx.stroke(); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0.5 * s, 0.52 * s); ctx.lineTo(0.66 * s, 0.7 * s); ctx.lineTo(0.5 * s, 0.9 * s); ctx.lineTo(0.34 * s, 0.7 * s); ctx.closePath(); ctx.fill(); }
  else return false;
  return true;
}

export function drawItemIcon(ctx, x, y, size, item) {
  const t = item?.type || 'material';
  ctx.save();
  ctx.translate(x, y);
  if (item?.category && drawCategoryIcon(ctx, size, item)) { ctx.restore(); return; }
  if (t === 'weapon') {
    ctx.strokeStyle = '#d8e0ea';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(4, size - 4);
    ctx.lineTo(size - 4, 4);
    ctx.stroke();
    ctx.fillStyle = '#8a6a3a';
    ctx.fillRect(2, size - 8, 8, 5);
  } else if (t === 'armor') {
    ctx.fillStyle = '#4a5565';
    ctx.fillRect(6, 4, size - 12, size - 8);
    ctx.strokeStyle = '#3ecfbf';
    ctx.strokeRect(6, 4, size - 12, size - 8);
  } else if (t === 'consumable') {
    ctx.fillStyle = item?.id?.includes('nexa') ? '#7b5cff' : '#e85d4c';
    ctx.beginPath();
    ctx.moveTo(size / 2, 4);
    ctx.lineTo(size - 5, size - 4);
    ctx.lineTo(5, size - 4);
    ctx.closePath();
    ctx.fill();
  } else if (t === 'quest') {
    ctx.fillStyle = '#f0c14a';
    ctx.fillRect(5, 5, size - 10, size - 10);
    ctx.strokeStyle = '#fff';
    ctx.strokeRect(5, 5, size - 10, size - 10);
  } else if (t === 'special') {
    ctx.fillStyle = '#9b5cff';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 3, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = '#8a6a3a';
    ctx.fillRect(6, 8, size - 12, size - 14);
  }
  ctx.restore();
}

export function drawSkillIcon(ctx, x, y, size, skillId) {
  ctx.save();
  ctx.translate(x, y);
  const colors = {
    corte: '#e85d4c',
    distancia: '#3ecfbf',
    protecao: '#5dde8a',
    canalizacao: '#7b5cff',
    hack_runico: '#f0c14a',
    contrato: '#c080ff'
  };
  const c = colors[skillId] || '#8a9aaa';
  ctx.fillStyle = '#0a1018';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = c;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, size - 2, size - 2);
  // inner glow
  ctx.strokeStyle = c.replace(')', ',0.25)').length > 20 ? c : c;
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = c;
  ctx.fillRect(3, 3, size - 6, size - 6);
  ctx.globalAlpha = 1;
  ctx.fillStyle = c;
  if (skillId === 'corte') {
    ctx.beginPath();
    ctx.moveTo(6, size - 6);
    ctx.lineTo(size - 6, 6);
    ctx.lineTo(size - 10, 6);
    ctx.lineTo(6, size - 10);
    ctx.fill();
  } else if (skillId === 'distancia') {
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(size / 2 + 4, size / 2 - 1, 8, 2);
  } else if (skillId === 'protecao') {
    ctx.beginPath();
    ctx.moveTo(size / 2, 5);
    ctx.lineTo(size - 6, 12);
    ctx.lineTo(size - 6, size - 8);
    ctx.lineTo(size / 2, size - 4);
    ctx.lineTo(6, size - 8);
    ctx.lineTo(6, 12);
    ctx.closePath();
    ctx.fill();
  } else if (skillId === 'canalizacao') {
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#121820';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, 3, 0, Math.PI * 2);
    ctx.fill();
  } else if (skillId === 'hack_runico') {
    ctx.font = `bold ${Math.floor(size * 0.45)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⌘', size / 2, size / 2 + 1);
  } else {
    ctx.fillRect(8, 8, size - 16, size - 16);
  }
  ctx.restore();
}

export function itemRarity(item) {
  if (!item) return 'common';
  if (item.quest_item || item.type === 'quest') return 'epic';
  if (item.type === 'special') return 'rare';
  if (item.type === 'weapon' || item.type === 'armor') return 'uncommon';
  if ((item.value || 0) >= 40) return 'uncommon';
  return 'common';
}

export const RARITY_COLOR = {
  common: '#8a9aaa',
  uncommon: '#5dde8a',
  rare: '#3ecfbf',
  epic: '#f0c14a',
  legendary: '#e85d4c'
};
