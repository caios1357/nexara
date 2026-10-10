/**
 * EVO — IDENTIDADE VISUAL PRÓPRIA DE CADA PASSIVA (7 originais + 10 novas).
 *
 * Formas e movimentos diferentes (não só "aura colorida"):
 *  furia_cibernetica  FRATURAS de energia vermelha estalando em volta do corpo + BRASAS subindo
 *  impulso_neural     SILHUETAS residuais azuis (recorte do herói) deixadas no rastro
 *  nucleo_reforcado   CÉLULAS HEXAGONAIS de escudo; cada golpe absorvido RACHA/apaga células
 *  mira_neural        RETÍCULA holográfica que TRAVA no inimigo (cantos fechando + giro)
 *  condutor_de_nexa   ORBES de Nexa orbitando e ESPIRALANDO para dentro do corpo
 *  cacador_de_monstros GLIFO de caça projetado acima do inimigo + selo no chão
 *  nucleo_divino      HALO RÚNICO dourado + LAMPEJO nas asas do Mini Dragão
 *  eco_runico         RUNA-ECO no ponto de cada golpe (expande e some)
 *  fagulha_em_cadeia  ARCO ELÉTRICO em cadeia do alvo do crítico até o vizinho
 *  reflexo_fantasma   ESTILHAÇOS DE ESPELHO violeta na esquiva (perfeita = mais)
 *  telemetria_neural  ARCO DE VARREDURA tracejado girando no chão
 *  sobrecarga_de_nexa HEXAGRAMA roxo no chão ao usar especial + faíscas com Nexa alta
 *  sifao_de_reator    FILETES sugados dos inimigos próximos para o herói no especial
 *  quebra_postura     ESCUDO RACHADO estilhaçando no inimigo QUEBRADO
 *  coracao_de_dragao  CORAÇÃO-BRASA pulsando no peito do Mini Dragão
 *  blindagem_adaptativa PLACAS hexagonais âmbar acendendo no corpo ao levar dano
 *  nucleo_de_vigor    MOTES "+" verdes subindo enquanto regenera
 *
 * Barato: 1 atlas de glifos (canvas 512², 4×4), pool fixo de sprites (teto global), 1 LineSegments
 * para fraturas/arcos (buffer fixo), células do escudo em 1 InstancedMesh. Sem luzes.
 * Anti-poluição: só MAX_AMBIENT efeitos contínuos ao mesmo tempo (por prioridade); eventos têm teto
 * próprio de sprites (os mais antigos são reciclados).
 */
import * as THREE from 'three';
import { TILE } from './fps-camera.js?v=20261009espada';

export const SIG = {
  furia_cibernetica: { cor: 0xff3b3b, prio: 9, glyph: 0 },
  impulso_neural: { cor: 0x39a8ff, prio: 6, glyph: 8 },
  nucleo_reforcado: { cor: 0x5ff0ff, prio: 10, glyph: 4 },
  mira_neural: { cor: 0xffd23f, prio: 8, glyph: 7 },
  condutor_de_nexa: { cor: 0x4f8dff, prio: 7, glyph: 15 },
  cacador_de_monstros: { cor: 0xff8a1f, prio: 8, glyph: 2 },
  nucleo_divino: { cor: 0xffd76a, prio: 7, glyph: 10 },
  eco_runico: { cor: 0x7affe0, prio: 3, glyph: 1 },
  fagulha_em_cadeia: { cor: 0xfff07a, prio: 3, glyph: 15 },
  reflexo_fantasma: { cor: 0xc89aff, prio: 3, glyph: 6 },
  telemetria_neural: { cor: 0x6ae8ff, prio: 2, glyph: 13 },
  sobrecarga_de_nexa: { cor: 0xb46aff, prio: 4, glyph: 12 },
  sifao_de_reator: { cor: 0x5affc8, prio: 3, glyph: 15 },
  quebra_postura: { cor: 0xffb02a, prio: 4, glyph: 3 },
  coracao_de_dragao: { cor: 0xff5a3a, prio: 4, glyph: 11 },
  blindagem_adaptativa: { cor: 0xffa040, prio: 3, glyph: 4 },
  nucleo_de_vigor: { cor: 0x6aff7a, prio: 2, glyph: 5 }
};

let atlasTex = null;
/** Atlas 4×4 de glifos brancos (cor vem do material). */
function atlas() {
  if (atlasTex) return atlasTex;
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const x = c.getContext('2d');
  x.lineCap = 'round'; x.lineJoin = 'round';
  const cell = (i, fn) => { x.save(); x.translate((i % 4) * 128 + 64, Math.floor(i / 4) * 128 + 64); x.strokeStyle = '#fff'; x.fillStyle = '#fff'; fn(); x.restore(); };
  const glow = (r, a = 1) => { const g = x.createRadialGradient(0, 0, 0, 0, 0, r); g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.beginPath(); x.arc(0, 0, r, 0, Math.PI * 2); x.fill(); x.fillStyle = '#fff'; };
  const poly = (n, r, rot = 0) => { x.beginPath(); for (let k = 0; k <= n; k++) { const a = rot + (k / n) * Math.PI * 2; x.lineTo(Math.cos(a) * r, Math.sin(a) * r); } };
  // 0 brasa
  cell(0, () => { glow(40, 1); x.beginPath(); x.moveTo(0, -30); x.lineTo(9, 0); x.lineTo(0, 30); x.lineTo(-9, 0); x.closePath(); x.fill(); });
  // 1 runa-eco (círculo + runa angular)
  cell(1, () => { x.lineWidth = 5; x.beginPath(); x.arc(0, 0, 50, 0, Math.PI * 2); x.stroke(); x.lineWidth = 6; x.beginPath(); x.moveTo(-22, 28); x.lineTo(0, -32); x.lineTo(22, 28); x.moveTo(-14, 6); x.lineTo(14, 6); x.moveTo(0, -32); x.lineTo(0, 34); x.stroke(); x.lineWidth = 2; x.beginPath(); x.arc(0, 0, 40, 0, Math.PI * 2); x.stroke(); });
  // 2 glifo do caçador (olho + presas + mira)
  cell(2, () => { x.lineWidth = 6; x.beginPath(); x.moveTo(-46, 0); x.quadraticCurveTo(0, -40, 46, 0); x.quadraticCurveTo(0, 40, -46, 0); x.stroke(); x.beginPath(); x.arc(0, 0, 13, 0, Math.PI * 2); x.fill(); x.lineWidth = 5; for (const s of [-1, 1]) { x.beginPath(); x.moveTo(s * 20, 26); x.lineTo(s * 12, 52); x.lineTo(s * 4, 28); x.stroke(); } x.beginPath(); x.moveTo(0, -56); x.lineTo(0, -38); x.stroke(); });
  // 3 escudo rachado
  cell(3, () => { x.lineWidth = 6; x.beginPath(); x.moveTo(0, -52); x.lineTo(42, -36); x.lineTo(38, 10); x.quadraticCurveTo(30, 40, 0, 54); x.quadraticCurveTo(-30, 40, -38, 10); x.lineTo(-42, -36); x.closePath(); x.stroke(); x.lineWidth = 4; x.beginPath(); x.moveTo(-6, -50); x.lineTo(8, -18); x.lineTo(-10, 4); x.lineTo(10, 26); x.lineTo(2, 52); x.moveTo(8, -18); x.lineTo(30, -6); x.moveTo(-10, 4); x.lineTo(-32, 14); x.stroke(); });
  // 4 célula hexagonal
  cell(4, () => { x.lineWidth = 7; poly(6, 52, Math.PI / 6); x.stroke(); x.globalAlpha = 0.28; poly(6, 46, Math.PI / 6); x.fill(); x.globalAlpha = 1; x.lineWidth = 2; poly(6, 36, Math.PI / 6); x.stroke(); });
  // 5 mote "+"
  cell(5, () => { glow(34, 0.6); x.lineWidth = 12; x.beginPath(); x.moveTo(0, -26); x.lineTo(0, 26); x.moveTo(-26, 0); x.lineTo(26, 0); x.stroke(); });
  // 6 estilhaço de espelho
  cell(6, () => { x.beginPath(); x.moveTo(-10, -54); x.lineTo(28, -6); x.lineTo(4, 50); x.lineTo(-24, 8); x.closePath(); x.globalAlpha = 0.45; x.fill(); x.globalAlpha = 1; x.lineWidth = 4; x.stroke(); x.lineWidth = 2; x.beginPath(); x.moveTo(-10, -54); x.lineTo(4, 50); x.stroke(); });
  // 7 canto de retícula (um quarto; 4 sprites formam a mira)
  cell(7, () => { x.lineWidth = 9; x.beginPath(); x.moveTo(-50, -10); x.lineTo(-50, -50); x.lineTo(-10, -50); x.stroke(); x.lineWidth = 3; x.beginPath(); x.moveTo(-36, -24); x.lineTo(-36, -36); x.lineTo(-24, -36); x.stroke(); });
  // 8 silhueta do herói (imagem residual)
  cell(8, () => { glow(10, 0); x.beginPath(); x.arc(0, -42, 11, 0, Math.PI * 2); x.fill(); x.beginPath(); x.moveTo(-18, -28); x.lineTo(18, -28); x.lineTo(14, 8); x.lineTo(20, 58); x.lineTo(8, 58); x.lineTo(0, 16); x.lineTo(-8, 58); x.lineTo(-20, 58); x.lineTo(-14, 8); x.closePath(); x.fill(); x.lineWidth = 7; x.beginPath(); x.moveTo(18, -24); x.lineTo(30, 4); x.lineTo(44, -34); x.stroke(); x.beginPath(); x.moveTo(-18, -24); x.lineTo(-28, 8); x.stroke(); });
  // 9 raio
  cell(9, () => { x.lineWidth = 7; x.beginPath(); x.moveTo(-10, -56); x.lineTo(8, -10); x.lineTo(-8, -6); x.lineTo(10, 56); x.stroke(); });
  // 10 halo rúnico (anel com runas)
  cell(10, () => { x.lineWidth = 5; x.beginPath(); x.arc(0, 0, 54, 0, Math.PI * 2); x.stroke(); x.lineWidth = 2; x.beginPath(); x.arc(0, 0, 44, 0, Math.PI * 2); x.stroke(); x.lineWidth = 3; for (let k = 0; k < 8; k++) { x.save(); x.rotate((k / 8) * Math.PI * 2); x.beginPath(); x.moveTo(-4, -52); x.lineTo(0, -46); x.lineTo(4, -52); x.moveTo(0, -46); x.lineTo(0, -40); x.stroke(); x.restore(); } });
  // 11 coração-brasa
  cell(11, () => { glow(56, 0.55); x.beginPath(); x.moveTo(0, 40); x.bezierCurveTo(-60, -4, -26, -50, 0, -18); x.bezierCurveTo(26, -50, 60, -4, 0, 40); x.fill(); });
  // 12 hexagrama
  cell(12, () => { x.lineWidth = 5; for (const r of [0, Math.PI]) { x.beginPath(); for (let k = 0; k <= 3; k++) { const a = r - Math.PI / 2 + (k / 3) * Math.PI * 2; x.lineTo(Math.cos(a) * 54, Math.sin(a) * 54); } x.stroke(); } x.lineWidth = 3; x.beginPath(); x.arc(0, 0, 58, 0, Math.PI * 2); x.stroke(); x.beginPath(); x.arc(0, 0, 18, 0, Math.PI * 2); x.stroke(); });
  // 13 arco de varredura tracejado
  cell(13, () => { x.lineWidth = 6; for (let k = 0; k < 7; k++) { x.beginPath(); x.arc(0, 0, 54, -Math.PI / 2 + k * 0.22, -Math.PI / 2 + k * 0.22 + 0.13); x.stroke(); } x.lineWidth = 3; x.beginPath(); x.moveTo(0, 0); x.lineTo(0, -54); x.stroke(); x.globalAlpha = 0.25; x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, 54, -Math.PI / 2, -Math.PI / 2 + 1.5); x.closePath(); x.fill(); });
  // 14 lampejo de asa
  cell(14, () => { glow(60, 0.5); x.beginPath(); x.moveTo(-56, 6); x.quadraticCurveTo(0, -30, 56, -40); x.quadraticCurveTo(10, -6, -56, 6); x.fill(); });
  // 15 faísca-estrela
  cell(15, () => { glow(30, 1); x.lineWidth = 4; for (let k = 0; k < 4; k++) { x.save(); x.rotate((k / 4) * Math.PI); x.beginPath(); x.moveTo(0, -46); x.lineTo(0, 46); x.stroke(); x.restore(); } });
  atlasTex = new THREE.CanvasTexture(c);
  atlasTex.colorSpace = THREE.SRGBColorSpace;
  return atlasTex;
}

export function createPassiveSignatures(root, opts = {}) {
  const MAX_SPRITES = opts.maxSprites ?? 44;
  const MAX_AMBIENT = opts.maxAmbient ?? 3;
  const base = atlas();
  const glyphTex = [];
  for (let i = 0; i < 16; i++) {
    const t = base.clone();
    t.repeat.set(0.25, 0.25);
    t.offset.set((i % 4) * 0.25, 0.75 - Math.floor(i / 4) * 0.25);
    t.needsUpdate = true;
    glyphTex.push(t);
  }
  const group = new THREE.Group();
  group.name = 'passiveSignatures';
  root.add(group);

  // —— pool de sprites (cada um com material próprio: cor/opacidade/rotação individuais) ——
  const pool = [];
  for (let i = 0; i < MAX_SPRITES; i++) {
    const m = new THREE.SpriteMaterial({ map: glyphTex[0], color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const s = new THREE.Sprite(m);
    s.visible = false; s.frustumCulled = false;
    group.add(s);
    pool.push({ s, life: 0, dur: 1, vx: 0, vy: 0, vz: 0, s0: 1, s1: 1, op: 1, spin: 0, src: '', follow: null, ox: 0, oy: 0, oz: 0, spiral: 0, ang: 0, rad: 0 });
  }
  let next = 0;
  const live = { total: 0, bySrc: {} };
  function spawn(src, glyph, color, x, y, z, o = {}) {
    // recicla o mais antigo (teto global)
    let p = null;
    for (let k = 0; k < pool.length; k++) { const q = pool[(next + k) % pool.length]; if (q.life <= 0) { p = q; next = (next + k + 1) % pool.length; break; } }
    if (!p) { p = pool[next]; next = (next + 1) % pool.length; }
    p.s.material.map = glyphTex[glyph];
    p.s.material.color.setHex(color);
    p.s.material.rotation = o.rot ?? 0;
    p.s.position.set(x, y, z);
    p.life = p.dur = o.dur ?? 0.6;
    p.vx = o.vx || 0; p.vy = o.vy || 0; p.vz = o.vz || 0;
    p.s0 = o.s0 ?? 0.4; p.s1 = o.s1 ?? p.s0; p.op = o.op ?? 1; p.spin = o.spin || 0;
    p.src = src; p.follow = o.follow || null; p.ox = x; p.oy = y; p.oz = z;
    p.spiral = o.spiral || 0; p.ang = o.ang || 0; p.rad = o.rad || 0;
    p.s.scale.setScalar(p.s0);
    p.s.visible = true;
    return p;
  }

  // —— decalques no chão (planos deitados; poucos) ——
  const FLATS = 6;
  const flatGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const flats = [];
  for (let i = 0; i < FLATS; i++) {
    const m = new THREE.Mesh(flatGeo, new THREE.MeshBasicMaterial({ map: glyphTex[13], transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    m.visible = false; m.frustumCulled = false; m.renderOrder = 2;
    group.add(m);
    flats.push({ m, life: 0, dur: 1, s0: 1, s1: 1, op: 1, src: '' });
  }
  let flatNext = 0;
  function spawnFlat(src, glyph, color, x, z, o = {}) {
    let f = flats.find((q) => q.life <= 0 && q.src === src && o.persist) || flats.find((q) => q.life <= 0) || flats[flatNext];
    flatNext = (flatNext + 1) % FLATS;
    f.m.material.map = glyphTex[glyph]; f.m.material.color.setHex(color);
    f.m.position.set(x, 0.05 + flats.indexOf(f) * 0.004, z);
    f.m.rotation.y = o.rotY || 0;
    f.life = f.dur = o.dur ?? 0.6; f.s0 = o.s0 ?? 1; f.s1 = o.s1 ?? f.s0; f.op = o.op ?? 0.8; f.src = src;
    f.m.scale.setScalar(f.s0); f.m.visible = true;
    return f;
  }

  // —— linhas (fraturas da Fúria, arco em cadeia, filetes do sifão) — buffer fixo ——
  const MAX_SEG = 96;
  const lpos = new Float32Array(MAX_SEG * 6);
  const lcol = new Float32Array(MAX_SEG * 6);
  const lgeo = new THREE.BufferGeometry();
  lgeo.setAttribute('position', new THREE.BufferAttribute(lpos, 3));
  lgeo.setAttribute('color', new THREE.BufferAttribute(lcol, 3));
  lgeo.setDrawRange(0, 0);
  const lines = new THREE.LineSegments(lgeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }));
  lines.frustumCulled = false;
  group.add(lines);
  let nseg = 0;
  const tmpC = new THREE.Color();
  function seg(ax, ay, az, bx, by, bz, color, k = 1) {
    if (nseg >= MAX_SEG) return;
    const i = nseg * 6;
    lpos[i] = ax; lpos[i + 1] = ay; lpos[i + 2] = az; lpos[i + 3] = bx; lpos[i + 4] = by; lpos[i + 5] = bz;
    tmpC.setHex(color).multiplyScalar(k);
    lcol[i] = lcol[i + 3] = tmpC.r; lcol[i + 1] = lcol[i + 4] = tmpC.g; lcol[i + 2] = lcol[i + 5] = tmpC.b;
    nseg++;
  }
  function zigzag(ax, ay, az, bx, by, bz, color, n = 6, amp = 0.12, k = 1) {
    let px = ax, py = ay, pz = az;
    for (let j = 1; j <= n; j++) {
      const t = j / n;
      const jx = j === n ? 0 : (Math.random() - 0.5) * amp * 2, jy = j === n ? 0 : (Math.random() - 0.5) * amp * 2, jz = j === n ? 0 : (Math.random() - 0.5) * amp * 2;
      const qx = ax + (bx - ax) * t + jx, qy = ay + (by - ay) * t + jy, qz = az + (bz - az) * t + jz;
      seg(px, py, pz, qx, qy, qz, color, k);
      px = qx; py = qy; pz = qz;
    }
  }
  // arcos/filetes temporários (eventos) redesenhados a cada frame até expirar
  const arcs = [];
  function addArc(kind, a, b, color, dur) { if (arcs.length > 6) arcs.shift(); arcs.push({ kind, a, b, color, life: dur, dur }); }

  // —— células hexagonais do escudo (InstancedMesh, cada célula liga/desliga e racha) ——
  const CELLS = 26;
  const cellGeo = new THREE.CircleGeometry(0.2, 6);
  const cellMat = new THREE.MeshBasicMaterial({ map: glyphTex[4], color: SIG.nucleo_reforcado.cor, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  // UV da célula (CircleGeometry → mapeia no glifo 4 via repeat/offset da textura)
  const cells = new THREE.InstancedMesh(cellGeo, cellMat, CELLS);
  cells.frustumCulled = false; cells.visible = false;
  cells.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CELLS * 3), 3);
  group.add(cells);
  const cellDirs = [];
  for (let i = 0; i < CELLS; i++) {
    // espiral de Fibonacci (cúpula acima da cintura)
    const y = 1 - (i + 0.5) / CELLS * 1.5;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const a = i * 2.39996;
    cellDirs.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
  }
  const cellState = new Float32Array(CELLS).fill(1); // 1 inteira · 0..1 rachando · 0 apagada
  const cellCrack = new Float32Array(CELLS);
  const dummy = new THREE.Object3D();
  const up = new THREE.Vector3(0, 0, 1);
  let cellMode = ''; // 'shield' (Núcleo Reforçado) | 'armor' (Blindagem, flash)
  let armorFlash = 0;

  let t = 0;
  const em = {}; // acumuladores de emissão por fonte
  const stats = { ambient: [], events: {}, suppressed: [] };
  const wp = new THREE.Vector3();
  let lastHero = { x: 0, z: 0 };
  let ghostAcc = 0;

  /** Eventos (posições em TILES quando vierem do jogo). */
  function event(kind, d = {}, ctx = {}) {
    const owned = ctx.owned || new Set();
    const hx = ctx.hero?.x ?? 0, hz = ctx.hero?.z ?? 0;
    const px = Number.isFinite(d.x) ? d.x * TILE : hx, pz = Number.isFinite(d.y) ? d.y * TILE : hz;
    const bump = (id) => { stats.events[id] = (stats.events[id] || 0) + 1; };
    if (kind === 'hit') {
      if (owned.has('eco_runico')) { bump('eco_runico'); spawn('eco_runico', 1, SIG.eco_runico.cor, px, 1.1, pz, { dur: 0.5, s0: 0.35, s1: 1.25, op: 0.9, rot: Math.random() * 6 }); }
      if (d.crit && owned.has('fagulha_em_cadeia') && d.near) {
        bump('fagulha_em_cadeia');
        addArc('chain', { x: px, y: 1.1, z: pz }, { x: d.near.x * TILE, y: 1.1, z: d.near.y * TILE }, SIG.fagulha_em_cadeia.cor, 0.32);
        spawn('fagulha_em_cadeia', 15, SIG.fagulha_em_cadeia.cor, d.near.x * TILE, 1.1, d.near.y * TILE, { dur: 0.3, s0: 0.5, s1: 0.9 });
      }
      if (owned.has('furia_cibernetica') && ctx.v?.furia > 0) { bump('furia_cibernetica'); for (let k = 0; k < 3; k++) spawn('furia_cibernetica', 0, 0xff5a2a, px, 1.0, pz, { dur: 0.5, s0: 0.22, s1: 0.06, vx: (Math.random() - 0.5) * 2, vy: 1.4 + Math.random(), vz: (Math.random() - 0.5) * 2 }); }
    } else if (kind === 'dodge') {
      if (owned.has('reflexo_fantasma')) {
        bump('reflexo_fantasma');
        const n = d.perfect ? 7 : 4;
        for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2 + Math.random() * 0.4; spawn('reflexo_fantasma', 6, SIG.reflexo_fantasma.cor, hx, 1.0 + Math.random() * 0.6, hz, { dur: 0.55, s0: 0.32, s1: 0.12, vx: Math.cos(a) * 2.6, vy: 0.4 + Math.random(), vz: Math.sin(a) * 2.6, rot: a, spin: 6 }); }
        spawn('reflexo_fantasma', 8, SIG.reflexo_fantasma.cor, hx, 0.95, hz, { dur: 0.5, s0: 1.9, s1: 2.1, op: 0.55 });
      }
    } else if (kind === 'special') {
      if (owned.has('sobrecarga_de_nexa')) { bump('sobrecarga_de_nexa'); spawnFlat('sobrecarga_de_nexa', 12, SIG.sobrecarga_de_nexa.cor, hx, hz, { dur: 0.7, s0: 0.8, s1: 3.6, op: 0.95 }); }
      if (owned.has('sifao_de_reator') && Array.isArray(d.near)) {
        bump('sifao_de_reator');
        for (const q of d.near.slice(0, 4)) addArc('siphon', { x: q.x * TILE, y: 1.0, z: q.y * TILE }, null, SIG.sifao_de_reator.cor, 0.6);
      }
    } else if (kind === 'break') {
      if (owned.has('quebra_postura')) {
        bump('quebra_postura');
        spawn('quebra_postura', 3, SIG.quebra_postura.cor, px, 2.0, pz, { dur: 0.75, s0: 0.9, s1: 1.5 });
        for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; spawn('quebra_postura', 6, SIG.quebra_postura.cor, px, 2.0, pz, { dur: 0.6, s0: 0.25, s1: 0.08, vx: Math.cos(a) * 2.2, vy: Math.sin(a) * 1.8, vz: 0, spin: 8 }); }
      }
    } else if (kind === 'hurt') {
      if (owned.has('blindagem_adaptativa')) { bump('blindagem_adaptativa'); armorFlash = 0.45; }
    } else if (kind === 'absorb') {
      // Núcleo Reforçado: racha 2–4 células por golpe absorvido
      bump('nucleo_reforcado');
      let n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < CELLS && n > 0; i++) { const j = (i * 7 + Math.floor(t * 13)) % CELLS; if (cellState[j] > 0.5) { cellState[j] = 0.45; cellCrack[j] = 0.35; n--; } }
    } else if (kind === 'shield_up') {
      cellState.fill(1);
    }
  }

  /**
   * @param {number} dt
   * @param {object} ctx { hero:{x,z}, fp, owned:Set, v (procs), markPos, aimPos, dragonRoot, hpFrac, nexaFrac, shieldFrac, moving }
   */
  function update(dt, ctx) {
    t += dt;
    nseg = 0;
    const owned = ctx.owned || new Set();
    const v = ctx.v || {};
    const hx = ctx.hero.x, hz = ctx.hero.z;
    const fp = !!ctx.fp;
    const moved = Math.hypot(hx - lastHero.x, hz - lastHero.z);
    lastHero = { x: hx, z: hz };
    // —— AMBIENTES CONTÍNUOS: candidatos ativos agora, ordenados por prioridade, teto MAX_AMBIENT ——
    const cand = [];
    if (owned.has('nucleo_reforcado') && v.shield > 0) cand.push('nucleo_reforcado');
    if (owned.has('furia_cibernetica') && v.furia > 0) cand.push('furia_cibernetica');
    if (owned.has('mira_neural') && v.foco > 0 && ctx.aimPos) cand.push('mira_neural');
    if (owned.has('cacador_de_monstros') && ctx.markPos) cand.push('cacador_de_monstros');
    if (owned.has('condutor_de_nexa') && v.condutor > 0) cand.push('condutor_de_nexa');
    if (owned.has('nucleo_divino') && v.divine > 0 && ctx.dragonRoot) cand.push('nucleo_divino');
    if (owned.has('impulso_neural') && v.impulso > 0) cand.push('impulso_neural');
    if (owned.has('coracao_de_dragao') && ctx.dragonRoot) cand.push('coracao_de_dragao');
    if (owned.has('sobrecarga_de_nexa') && (ctx.nexaFrac ?? 0) > 0.8) cand.push('sobrecarga_de_nexa');
    if (owned.has('telemetria_neural')) cand.push('telemetria_neural');
    if (owned.has('nucleo_de_vigor') && (ctx.hpFrac ?? 1) < 0.999) cand.push('nucleo_de_vigor');
    cand.sort((a, b) => SIG[b].prio - SIG[a].prio);
    const on = new Set(cand.slice(0, MAX_AMBIENT));
    stats.ambient = [...on];
    stats.suppressed = cand.slice(MAX_AMBIENT);
    const tick = (id, every) => { em[id] = (em[id] || 0) + dt; if (em[id] >= every) { em[id] = 0; return true; } return false; };

    if (!fp && on.has('furia_cibernetica')) {
      // fraturas que estalam (redesenhadas ~12×/s) + brasas subindo
      const seed = Math.floor(t * 12);
      for (let k = 0; k < 4; k++) {
        const a = seed * 1.7 + k * 1.57;
        const r = 0.36;
        const ax = hx + Math.cos(a) * r, az = hz + Math.sin(a) * r, ay = 0.5 + ((seed + k) % 3) * 0.35;
        zigzag(ax, ay, az, ax + Math.cos(a + 1.2) * 0.25, ay + 0.55, az + Math.sin(a + 1.2) * 0.25, SIG.furia_cibernetica.cor, 4, 0.08, 1.4);
      }
      if (tick('furia', 0.07)) { const a = Math.random() * 6.28; spawn('furia_cibernetica', 0, Math.random() < 0.5 ? 0xff3b3b : 0xff9a3a, hx + Math.cos(a) * 0.4, 0.3 + Math.random() * 0.8, hz + Math.sin(a) * 0.4, { dur: 0.8, s0: 0.16, s1: 0.03, vy: 1.3, vx: (Math.random() - 0.5) * 0.3, vz: (Math.random() - 0.5) * 0.3 }); }
    }
    if (!fp && on.has('impulso_neural') && tick('impulso', moved > 0.004 ? 0.08 : 0.3)) {
      spawn('impulso_neural', 8, SIG.impulso_neural.cor, hx, 0.92, hz, { dur: 0.45, s0: 1.85, s1: 1.95, op: 0.42 });
    }
    // escudo hexagonal / blindagem
    armorFlash = Math.max(0, armorFlash - dt);
    const shieldOn = on.has('nucleo_reforcado');
    cellMode = shieldOn ? 'shield' : armorFlash > 0 ? 'armor' : '';
    cells.visible = !fp && !!cellMode;
    if (cells.visible) {
      const col = cellMode === 'shield' ? SIG.nucleo_reforcado.cor : SIG.blindagem_adaptativa.cor;
      const R = cellMode === 'shield' ? 1.0 : 0.55;
      for (let i = 0; i < CELLS; i++) {
        if (cellCrack[i] > 0) { cellCrack[i] -= dt; if (cellCrack[i] <= 0) cellState[i] = 0; }
        const st = cellMode === 'armor' ? (i % 3 === 0 ? armorFlash / 0.45 : 0) : cellState[i] * (0.75 + 0.25 * Math.sin(t * 5 + i));
        const d = cellDirs[i];
        dummy.position.set(hx + d.x * R, 0.95 + d.y * R * 1.1, hz + d.z * R);
        dummy.quaternion.setFromUnitVectors(up, d);
        const crackJit = cellCrack[i] > 0 ? 1 + Math.sin(t * 60) * 0.15 : 1;
        dummy.scale.setScalar(Math.max(0.001, (cellMode === 'armor' ? 0.7 : 1) * crackJit * (st > 0 ? 1 : 0.001)));
        dummy.updateMatrix();
        cells.setMatrixAt(i, dummy.matrix);
        tmpC.setHex(cellCrack[i] > 0 ? 0xffffff : col).multiplyScalar(Math.max(0, st));
        cells.instanceColor.setXYZ(i, tmpC.r, tmpC.g, tmpC.b);
      }
      cells.instanceMatrix.needsUpdate = true;
      cells.instanceColor.needsUpdate = true;
    }
    if (!shieldOn && v.shield === 0) cellState.fill(1); // escudo novo nasce inteiro
    // retícula da Mira travando no alvo (4 cantos fechando + giro)
    if (on.has('mira_neural') && ctx.aimPos) {
      em.mira = (em.mira || 0) + dt;
      const lock = Math.min(1, em.mira / 0.35);
      const R = (0.95 - 0.45 * lock) * (ctx.aimPos.s || 1);
      const spin = t * (lock < 1 ? 6 : 1.2);
      for (let k = 0; k < 4; k++) {
        const a = spin + k * Math.PI / 2;
        const rx = ctx.camRight?.x ?? 1, rz = ctx.camRight?.z ?? 0;
        spawn('mira_neural', 7, lock >= 1 ? 0xffffff : SIG.mira_neural.cor, ctx.aimPos.x + rx * Math.cos(a) * R * 0.5, 1.15 + Math.sin(a) * R * 0.5, ctx.aimPos.z + rz * Math.cos(a) * R * 0.5, { dur: dt * 1.5, s0: 0.42, rot: a + Math.PI * 0.75, op: 0.95 });
      }
    } else em.mira = 0;
    // glifo do caçador
    if (on.has('cacador_de_monstros') && ctx.markPos) {
      spawn('cacador_de_monstros', 2, SIG.cacador_de_monstros.cor, ctx.markPos.x, 2.55 + Math.sin(t * 4) * 0.08, ctx.markPos.z, { dur: dt * 1.5, s0: 0.62 + Math.sin(t * 8) * 0.04 });
      spawnFlat('cacador_de_monstros', 2, SIG.cacador_de_monstros.cor, ctx.markPos.x, ctx.markPos.z, { dur: dt * 1.5, s0: 1.4, op: 0.55, rotY: t * 0.8, persist: true });
    }
    // orbes do Condutor: orbitam e espiralam para dentro do corpo
    if (!fp && on.has('condutor_de_nexa') && tick('condutor', 0.16)) {
      const a = Math.random() * Math.PI * 2;
      spawn('condutor_de_nexa', 15, SIG.condutor_de_nexa.cor, hx, 0.4, hz, { dur: 0.9, s0: 0.26, s1: 0.1, spiral: 1, ang: a, rad: 0.95, follow: ctx.hero });
    }
    // Núcleo Divino: halo rúnico + lampejo nas asas do Mini Dragão
    if (ctx.dragonRoot && (on.has('nucleo_divino') || on.has('coracao_de_dragao'))) {
      ctx.dragonRoot.getWorldPosition(wp);
      if (on.has('nucleo_divino')) {
        spawn('nucleo_divino', 10, SIG.nucleo_divino.cor, wp.x, wp.y + 0.45, wp.z, { dur: dt * 1.5, s0: 0.62, rot: t * 0.8 });
        if (tick('divwing', 0.5)) for (const s of [-1, 1]) spawn('nucleo_divino', 14, SIG.nucleo_divino.cor, wp.x + s * 0.35, wp.y + 0.1, wp.z, { dur: 0.4, s0: 0.5, s1: 0.75, rot: s > 0 ? 0 : Math.PI, op: 0.8 });
      }
      if (on.has('coracao_de_dragao')) spawn('coracao_de_dragao', 11, SIG.coracao_de_dragao.cor, wp.x, wp.y - 0.02, wp.z, { dur: dt * 1.5, s0: 0.2 + 0.06 * Math.max(0, Math.sin(t * 7)) });
    }
    if (on.has('sobrecarga_de_nexa') && tick('sobre', 0.12)) {
      const a = Math.random() * 6.28;
      spawn('sobrecarga_de_nexa', 9, SIG.sobrecarga_de_nexa.cor, hx + Math.cos(a) * 0.32, 1.0 + Math.random() * 0.3, hz + Math.sin(a) * 0.32, { dur: 0.16, s0: 0.22, rot: Math.random() * 6 });
    }
    if (on.has('telemetria_neural')) {
      spawnFlat('telemetria_neural', 13, SIG.telemetria_neural.cor, hx, hz, { dur: dt * 1.5, s0: 2.3, op: 0.6, rotY: -t * 2.2, persist: true });
    }
    if (!fp && on.has('nucleo_de_vigor') && tick('vigor', 0.2)) {
      for (let k = 0; k < 2; k++) {
        const a = Math.random() * 6.28;
        spawn('nucleo_de_vigor', 5, SIG.nucleo_de_vigor.cor, hx + Math.cos(a) * 0.5, 0.2, hz + Math.sin(a) * 0.5, { dur: 1.2, s0: 0.24, s1: 0.12, vy: 0.85 });
      }
    }
    // arcos de eventos
    for (let i = arcs.length - 1; i >= 0; i--) {
      const a = arcs[i];
      a.life -= dt;
      if (a.life <= 0) { arcs.splice(i, 1); continue; }
      const k = a.life / a.dur;
      if (a.kind === 'chain') zigzag(a.a.x, a.a.y, a.a.z, a.b.x, a.b.y, a.b.z, a.color, 7, 0.18, 1.5 * k);
      else if (a.kind === 'siphon') { const q = 1 - k; zigzag(a.a.x + (hx - a.a.x) * q * 0.6, a.a.y, a.a.z + (hz - a.a.z) * q * 0.6, hx, 1.0, hz, a.color, 5, 0.1, 1.3 * k); }
    }
    lgeo.setDrawRange(0, nseg * 2);
    lgeo.attributes.position.needsUpdate = true;
    lgeo.attributes.color.needsUpdate = true;
    lines.visible = nseg > 0;
    // sprites
    let total = 0;
    const by = {};
    for (const p of pool) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.s.visible = false; continue; }
      total++; by[p.src] = (by[p.src] || 0) + 1;
      const q = 1 - p.life / p.dur;
      if (p.spiral && p.follow) {
        const rr = p.rad * (1 - q);
        const aa = p.ang + q * 7;
        p.s.position.set(p.follow.x + Math.cos(aa) * rr, 0.4 + q * 0.8, p.follow.z + Math.sin(aa) * rr);
      } else {
        p.s.position.x += p.vx * dt; p.s.position.y += p.vy * dt; p.s.position.z += p.vz * dt;
      }
      p.s.scale.setScalar(p.s0 + (p.s1 - p.s0) * q);
      p.s.material.opacity = p.op * (p.dur < 0.1 ? 1 : (1 - q * q));
      if (p.spin) p.s.material.rotation += p.spin * dt;
    }
    for (const f of flats) {
      if (f.life <= 0) continue;
      f.life -= dt;
      if (f.life <= 0) { f.m.visible = false; continue; }
      total++; by[f.src] = (by[f.src] || 0) + 1;
      const q = 1 - f.life / f.dur;
      f.m.scale.setScalar(f.s0 + (f.s1 - f.s0) * q);
      f.m.material.opacity = f.op * (f.dur < 0.1 ? 1 : (1 - q));
    }
    live.total = total; live.bySrc = by;
  }
  function counts() { return { sprites: live.total, bySrc: { ...live.bySrc }, segs: nseg, cells: cells.visible ? cellMode : '', ambient: stats.ambient.slice(), suppressed: stats.suppressed.slice(), events: { ...stats.events }, maxAmbient: MAX_AMBIENT, maxSprites: MAX_SPRITES }; }
  return { group, update, event, counts };
}
