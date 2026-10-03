/**
 * NEXARA — ARENA PRINCIPAL: mundo 3D do mapa grande, no MESMO estilo (texturas wall-rust / metal-plate /
 * rust-detail / floor-metal-wet, néons, névoa). Tudo INSTANCIADO e dividido em blocos (chunks) que ligam/desligam
 * pela distância do herói → poucos draw calls mesmo com ~1.600 peças de cenário (mobile MEDIUM).
 *  - chão único com relevo (malha deslocada + cor por região/tipo de tile)
 *  - paredes (altura por estrutura; ruínas quebradas), pilares, torre, árvores, rochas, caixas, arbustos, entulho, postes
 *  - marcadores de objetivo: colunas de luz nos POIs, plataformas de EXTRAÇÃO, runa do covil, anel da arena de elite
 *  - baús/caixas de loot instanciados (abrir = some o brilho, tampa abre)
 */
import * as THREE from 'three';

const REGION_FLOOR = { periferia: 0x5a6878, ruinas: 0x6e5c4c, floresta: 0x355a40, complexo: 0x50627a, elite: 0x76684a, dragao: 0x2c4232 };
const REGION_WALL = { periferia: 0xb08e78, ruinas: 0xb28660, floresta: 0x78907c, complexo: 0x8a9cb4, elite: 0xb8a068, dragao: 0x6a806c };
const TILE_FLOOR = { street: 0x3a4250, grass: 0x34583e, tech: 0x50627a, rubble: 0x6e5a44, bush: 0x34583e };
const RARITY_GLOW = { basico: 0xc8d4d0, medio: 0x4aa0ff, avancado: 0xffc24a, alto: 0xb36bff, lendario: 0xffd34a };

function h32(x, y, s = 0) { let h = (x * 374761393 + y * 668265263 + s * 974711) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

/**
 * @param {object} zone zona BR (zone.brMap)
 * @param {object} cfg data.arena_br
 * @param {object} o { TILE, ground(fx,fy), loadTex(name,rx,ry), tierName, accent }
 */
export function buildBrTerrain(zone, cfg, o) {
  const m = zone.brMap; const W = m.W, H = m.H; const T = o.TILE; const G = o.ground;
  const group = new THREE.Group(); group.name = 'br-terrain';
  const regById = Object.fromEntries(cfg.regioes.map((r) => [r.n, r]));
  const regAt = (x, y) => regById[m.regionGrid[x + y * W]] || null;
  const tileAt = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 'wall' : zone.map.legend[m.tiles[y][x]] || 'floor');
  const tmpC = new THREE.Color();
  const stats = { instances: 0, meshes: 0 };

  // —— CHÃO com relevo: blocos de 32×32 tiles (M10: mapa grande → só os blocos perto do herói desenham).
  //    Normais analíticas (diferença central da MESMA função de altura) → sem costura entre blocos. ——
  const FC = 32; const floorChunks = [];
  {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, map: o.loadTex('floor-metal-wet.png', 1, 1), roughness: 0.72, metalness: 0.12, envMapIntensity: 0.7, emissive: 0x18202a, emissiveIntensity: 1 }); // M10: menos metal = chão legível sem envMap
    const nv = new THREE.Vector3();
    for (let fy0 = 0; fy0 < H; fy0 += FC) for (let fx0 = 0; fx0 < W; fx0 += FC) {
      const fx1 = Math.min(W, fx0 + FC), fy1 = Math.min(H, fy0 + FC); const cw = fx1 - fx0, chh = fy1 - fy0; const NV = (cw + 1) * (chh + 1);
      const pos = new Float32Array(NV * 3); const uv = new Float32Array(NV * 2); const col = new Float32Array(NV * 3); const nor = new Float32Array(NV * 3);
      for (let j = fy0; j <= fy1; j++) for (let i = fx0; i <= fx1; i++) {
        const k = (i - fx0) + (j - fy0) * (cw + 1);
        pos[k * 3] = i * T; pos[k * 3 + 1] = G(i, j); pos[k * 3 + 2] = j * T;
        uv[k * 2] = i * 0.5; uv[k * 2 + 1] = j * 0.5;
        nv.set(-(G(i + 1, j) - G(i - 1, j)) / (2 * T), 1, -(G(i, j + 1) - G(i, j - 1)) / (2 * T)).normalize();
        nor[k * 3] = nv.x; nor[k * 3 + 1] = nv.y; nor[k * 3 + 2] = nv.z;
        let r = 0, g = 0, b = 0, n = 0;
        for (const [dx, dy] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) {
          const x = i + dx, y = j + dy; if (x < 0 || y < 0 || x >= W || y >= H) continue;
          const t = tileAt(x, y); const reg = regAt(x, y);
          tmpC.setHex(TILE_FLOOR[t] ?? (reg ? REGION_FLOOR[reg.id] : 0x2a3038));
          const v = (0.86 + h32(x, y, 3) * 0.28) * 1.4; r += tmpC.r * v; g += tmpC.g * v; b += tmpC.b * v; n++;
        }
        n = n || 1; col[k * 3] = r / n; col[k * 3 + 1] = g / n; col[k * 3 + 2] = b / n;
      }
      const idx = new Uint32Array(cw * chh * 6); let q = 0;
      for (let j = 0; j < chh; j++) for (let i = 0; i < cw; i++) { const a = i + j * (cw + 1), b = a + 1, c = a + cw + 1, d = c + 1; idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d; }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      geo.setIndex(new THREE.BufferAttribute(idx, 1)); geo.computeBoundingSphere();
      const floor = new THREE.Mesh(geo, mat); floor.receiveShadow = true; floor.name = 'br-floor';
      floor.userData.cx = (fx0 + cw / 2) * T; floor.userData.cz = (fy0 + chh / 2) * T; floor.userData.rad = Math.hypot(cw, chh) * T * 0.5;
      floorChunks.push(floor); group.add(floor); stats.meshes++;
    }
  }

  // —— materiais (texturas existentes) ——
  const mats = {
    wall: new THREE.MeshStandardMaterial({ color: 0xffffff, map: o.loadTex('wall-rust.png', 1, 1.3), roughness: 0.75, metalness: 0.14 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x8a96a4, map: o.loadTex('metal-plate.png', 1, 1), roughness: 0.45, metalness: 0.65 }),
    crate: new THREE.MeshStandardMaterial({ color: 0x6a5038, map: o.loadTex('metal-plate.png', 1, 1), roughness: 0.7, metalness: 0.15 }),
    rust: new THREE.MeshStandardMaterial({ color: 0xffffff, map: o.loadTex('rust-detail.png', 1, 1), roughness: 0.85, metalness: 0.2 }),
    rock: new THREE.MeshStandardMaterial({ color: 0xffffff, map: o.loadTex('rust-detail.png', 1, 1), roughness: 0.95, metalness: 0.05, flatShading: true }),
    trunk: new THREE.MeshStandardMaterial({ color: 0x2a221c, roughness: 0.9, metalness: 0.05 }),
    canopy: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0.05, flatShading: true, emissive: 0x06281a, emissiveIntensity: 0.6 }),
    neon: new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
    lamp: new THREE.MeshBasicMaterial({ color: 0xbff8ff, toneMapped: false }),
    // M10 fase 8: identidade das regiões + sinais do dragão
    prop: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0.2 }),
    bone: new THREE.MeshStandardMaterial({ color: 0xd8d0bc, roughness: 0.9, metalness: 0.0, emissive: 0x1a1810, emissiveIntensity: 0.5 }),
    decal: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })
  };
  const geos = {
    wall: new THREE.BoxGeometry(T, 1, T).translate(0, 0.5, 0),
    pillar: new THREE.BoxGeometry(T * 0.62, 1, T * 0.62).translate(0, 0.5, 0),
    cap: new THREE.BoxGeometry(T * 0.72, 0.14, T * 0.72),
    neon: new THREE.BoxGeometry(T * 0.9, 0.07, 0.05),
    trunk: new THREE.CylinderGeometry(0.1, 0.2, 2.6, 6).translate(0, 1.3, 0),
    canopy: new THREE.ConeGeometry(1, 2.6, 7).translate(0, 1.3, 0),
    rock: new THREE.DodecahedronGeometry(0.95, 0),
    crate: new THREE.BoxGeometry(1.25, 1.25, 1.25).translate(0, 0.625, 0),
    bush: new THREE.IcosahedronGeometry(0.55, 0),
    rubble: new THREE.BoxGeometry(0.5, 0.22, 0.4),
    pole: new THREE.CylinderGeometry(0.05, 0.07, 3.2, 6).translate(0, 1.6, 0),
    lampHead: new THREE.BoxGeometry(0.5, 0.1, 0.22),
    barrel: new THREE.CylinderGeometry(0.32, 0.32, 0.9, 8).translate(0, 0.45, 0),
    stub: new THREE.CylinderGeometry(0.34, 0.4, 1, 7).translate(0, 0.5, 0),
    fern: new THREE.ConeGeometry(0.32, 0.7, 5).translate(0, 0.35, 0),
    shroom: new THREE.SphereGeometry(0.12, 6, 4),
    strip: new THREE.BoxGeometry(T * 0.95, 0.03, 0.09),
    vent: new THREE.BoxGeometry(0.9, 0.35, 0.9).translate(0, 0.175, 0),
    banner: new THREE.BoxGeometry(0.06, 2.2, 0.7).translate(0, 1.1, 0),
    bone: new THREE.CylinderGeometry(0.05, 0.07, 1, 5).rotateZ(Math.PI / 2),
    skull: new THREE.DodecahedronGeometry(0.22, 0),
    claw: new THREE.PlaneGeometry(0.16, 1.7).rotateX(-Math.PI / 2),
    scorch: new THREE.CircleGeometry(1, 12).rotateX(-Math.PI / 2),
    ember: new THREE.OctahedronGeometry(0.09, 0)
  };

  // —— chunks (16×16 tiles) ——
  const CH = 16; const CW = Math.ceil(W / CH), CHH = Math.ceil(H / CH);
  const chunks = []; for (let cy = 0; cy < CHH; cy++) for (let cx = 0; cx < CW; cx++) { const g = new THREE.Group(); g.name = `br-chunk-${cx}-${cy}`; g.userData.cx = (cx + 0.5) * CH * T; g.userData.cz = (cy + 0.5) * CH * T; chunks.push(g); group.add(g); }
  const buckets = new Map(); // `${kind}|${chunk}` → [{p,r,s,c}]
  const dummy = new THREE.Object3D();
  const push = (kind, tx, ty, p, r, s, c) => {
    const ci = Math.min(CW - 1, Math.floor(tx / CH)) + Math.min(CHH - 1, Math.floor(ty / CH)) * CW;
    const k = `${kind}|${ci}`; let b = buckets.get(k); if (!b) { b = []; buckets.set(k, b); } b.push({ p, r, s, c, t: tx + ty * W });
  };
  const KIND = {
    wall: [geos.wall, mats.wall, true], pillar: [geos.pillar, mats.metal, true], cap: [geos.cap, mats.neon, false], neon: [geos.neon, mats.neon, false],
    trunk: [geos.trunk, mats.trunk, true], canopy: [geos.canopy, mats.canopy, true], rock: [geos.rock, mats.rock, true], crate: [geos.crate, mats.crate, true],
    bush: [geos.bush, mats.canopy, false], rubble: [geos.rubble, mats.rust, false], pole: [geos.pole, mats.metal, false], lampHead: [geos.lampHead, mats.lamp, false],
    barrel: [geos.barrel, mats.prop, true], stub: [geos.stub, mats.rock, true], fern: [geos.fern, mats.canopy, false], shroom: [geos.shroom, mats.neon, false],
    strip: [geos.strip, mats.neon, false], vent: [geos.vent, mats.metal, false], banner: [geos.banner, mats.neon, false],
    bone: [geos.bone, mats.bone, false], skull: [geos.skull, mats.bone, false], claw: [geos.claw, mats.decal, false], scorch: [geos.scorch, mats.decal, false], ember: [geos.ember, mats.neon, false]
  };
  const COLORED = new Set(['wall', 'canopy', 'rock', 'neon', 'cap', 'bush', 'barrel', 'stub', 'fern', 'shroom', 'strip', 'banner', 'ember']);
  const regionProps = { n: 0, byKind: {} }; const pushP = (kind, ...a) => { regionProps.n++; regionProps.byKind[kind] = (regionProps.byKind[kind] || 0) + 1; push(kind, ...a); };
  const wallNear = (x, y) => { for (const [dx, dy, ry] of [[1, 0, Math.PI / 2], [-1, 0, Math.PI / 2], [0, 1, 0], [0, -1, 0]]) if (tileAt(x + dx, y + dy) === 'wall') return { dx, dy, ry }; return null; };
  const isLootTile = new Set([...(m.chests || []), ...(m.crates || [])].map((c) => c.x + c.y * W));
  const structAt = (x, y) => m.structures.find((s) => x >= s.x0 && x <= s.x1 && y >= s.y0 && y <= s.y1) || null;
  const lampPos = [];
  const caveBox = (m.areas || []).find((a) => a.kind === 'caverna') || null;
  const tower = m.structures.find((s) => s.kind === 'torre');
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = tileAt(x, y); const wx = (x + 0.5) * T, wz = (y + 0.5) * T; const gy = G(x + 0.5, y + 0.5); const reg = regAt(x, y); const hs = h32(x, y);
    if (t === 'wall') {
      const st = structAt(x, y); const border = x === 0 || y === 0 || x === W - 1 || y === H - 1;
      let h = border ? 4.6 : st ? st.h : 3.4;
      if (st?.kind === 'ruina') h *= 0.45 + 0.55 * h32(x, y, 9);
      const wc = REGION_WALL[(reg || regAt(Math.min(W - 2, x + 1), Math.min(H - 2, y + 1)) || {}).id] ?? 0x6a7080;
      tmpC.setHex(wc).multiplyScalar(0.85 + hs * 0.3);
      push('wall', x, y, [wx, gy - 0.3, wz], 0, [1, h + 0.3, 1], tmpC.getHex());
      if ((Math.floor(hs * 1000) % 4) === 0 && h > 2.2) {
        // néon na face voltada para um tile andável
        for (const [dx, dy, ry] of [[0, 1, 0], [0, -1, 0], [1, 0, Math.PI / 2], [-1, 0, Math.PI / 2]]) {
          const nt = tileAt(x + dx, y + dy); if (nt === 'wall') continue;
          const nc = (reg?.cor || '#3ecfbf');
          push('neon', x, y, [wx + dx * T * 0.52, gy + h * 0.78, wz + dy * T * 0.52], ry, [1, 1, 1], new THREE.Color(nc).getHex());
          break;
        }
      }
    } else if (t === 'pillar') {
      if (tower && x >= tower.x0 && x <= tower.x1 && y >= tower.y0 && y <= tower.y1) continue; // torre própria abaixo
      const h = reg?.id === 'elite' ? 4.4 : 3.6;
      push('pillar', x, y, [wx, gy - 0.2, wz], 0, [1, h, 1], 0xffffff);
      push('cap', x, y, [wx, gy + h - 0.1, wz], 0, [1, 1, 1], new THREE.Color(reg?.cor || '#ffc830').getHex());
    } else if (t === 'tree') {
      const s = 0.85 + hs * 0.55; const jx = (h32(x, y, 1) - 0.5) * 0.6, jz = (h32(x, y, 2) - 0.5) * 0.6;
      // pinheiro low-poly: tronco alto, copa em cone ACIMA da câmera (não entope a visão do jogador)
      const th = s * (1 + hs * 0.35);
      push('trunk', x, y, [wx + jx, gy - 0.05, wz + jz], hs * 6, [s, th, s], 0xffffff);
      tmpC.setHSL(0.38 + h32(x, y, 4) * 0.1, 0.5, 0.17 + h32(x, y, 5) * 0.08);
      push('canopy', x, y, [wx + jx, gy + 1.6 * th, wz + jz], hs * 9, [0.95 * s, 1.25 * th, 0.95 * s], tmpC.getHex());
    } else if (t === 'rock') {
      const cave = caveBox ? (x >= caveBox.x0 && x <= caveBox.x1 && y >= caveBox.y0 && y <= caveBox.y1) : (x >= 18 && x <= 31 && y >= 2 && y <= 9);
      const s = 0.95 + hs * 0.35;
      tmpC.setHex(reg?.id === 'dragao' ? 0x3a4a40 : 0x5a5650).multiplyScalar(0.8 + hs * 0.3);
      push('rock', x, y, [wx, gy + (cave ? 0.6 : 0.2), wz], hs * 7, [s * 1.15, cave ? 2.4 + hs : 0.8 + hs * 0.6, s * 1.15], tmpC.getHex());
    } else if (t === 'crate') {
      const two = hs > 0.55; push('crate', x, y, [wx, gy, wz], (hs - 0.5) * 0.5, [1, 1, 1], 0xffffff);
      if (two) push('crate', x, y, [wx + 0.1, gy + 1.25, wz - 0.05], hs * 2, [0.85, 0.85, 0.85], 0xffffff);
    } else if (t === 'bush') {
      tmpC.setHSL(0.38 + hs * 0.1, 0.5, 0.16);
      push('bush', x, y, [wx + (hs - 0.5) * 0.6, gy + 0.25, wz], hs * 5, [1.2, 0.7, 1.2], tmpC.getHex());
    } else if (t === 'rubble') {
      for (let k = 0; k < 3; k++) { const a = h32(x, y, 10 + k); push('rubble', x, y, [wx + (a - 0.5) * 1.4, gy + 0.08, wz + (h32(x, y, 20 + k) - 0.5) * 1.4], a * 6, [0.6 + a, 1, 0.6 + a], 0xffffff); }
    } else if (t === 'street' && x % 9 === 4 && y % 8 === 2) {
      push('pole', x, y, [wx + 0.8, gy, wz + 0.8], 0, [1, 1, 1], 0xffffff);
      push('lampHead', x, y, [wx + 0.6, gy + 3.2, wz + 0.8], 0, [1, 1, 1], 0xffffff);
      lampPos.push(new THREE.Vector3(wx + 0.6, gy + 3.0, wz + 0.8));
    }
    // —— M10 fase 8: IDENTIDADE DA REGIÃO (decoração instanciada, rente ao chão ou encostada na parede; não bloqueia) ——
    if (o.props !== false && reg && (t === 'floor' || t === 'street' || t === 'grass' || t === 'tech' || t === 'rubble') && !isLootTile.has(x + y * W)) {
      const q = h32(x, y, 31); const wn = wallNear(x, y);
      if (reg.id === 'periferia') {
        if (wn && q < 0.06) { tmpC.setHSL(h32(x, y, 32) < 0.5 ? 0.02 : 0.55, 0.45, 0.32); pushP('barrel', x, y, [wx + wn.dx * 0.55, gy, wz + wn.dy * 0.55], q * 40, [1, 0.85 + q * 2, 1], tmpC.getHex()); }
      } else if (reg.id === 'ruinas') {
        if (wn && q < 0.05) { tmpC.setHex(0xa8906c).multiplyScalar(0.8 + h32(x, y, 33) * 0.3); pushP('stub', x, y, [wx + wn.dx * 0.45, gy - 0.05, wz + wn.dy * 0.45], q * 50, [1, 0.5 + h32(x, y, 34) * 1.1, 1], tmpC.getHex()); }
        else if (q > 0.975) pushP('rubble', x, y, [wx, gy + 0.08, wz], q * 9, [1.4, 1, 1.2], 0xffffff);
      } else if (reg.id === 'floresta') {
        if (q < 0.07) { tmpC.setHSL(0.33 + h32(x, y, 35) * 0.08, 0.55, 0.2); pushP('fern', x, y, [wx + (h32(x, y, 36) - 0.5) * 1.2, gy, wz + (h32(x, y, 37) - 0.5) * 1.2], q * 60, [1, 0.8 + q * 6, 1], tmpC.getHex()); }
        else if (q > 0.988) { pushP('shroom', x, y, [wx + (h32(x, y, 38) - 0.5), gy + 0.1, wz + (h32(x, y, 39) - 0.5)], 0, [1, 0.7, 1], h32(x, y, 40) < 0.5 ? 0x5dfff0 : 0xb36bff); }
      } else if (reg.id === 'complexo') {
        if (wn && q < 0.08) pushP('strip', x, y, [wx + wn.dx * 0.42, gy + 0.03, wz + wn.dy * 0.42], wn.ry, [1, 1, 1], h32(x, y, 41) < 0.7 ? 0x39e8ff : 0xff4a8a);
        else if (q > 0.985) pushP('vent', x, y, [wx, gy, wz], 0, [1, 1, 1], 0xffffff);
      } else if (reg.id === 'elite') {
        if (wn && q < 0.05) pushP('banner', x, y, [wx + wn.dx * 0.46, gy + 0.6, wz + wn.dy * 0.46], wn.ry + Math.PI / 2, [1, 1, 1], 0xffc830);
      } else if (reg.id === 'dragao') {
        if (q < 0.025) pushP('bone', x, y, [wx + (h32(x, y, 42) - 0.5), gy + 0.05, wz + (h32(x, y, 43) - 0.5)], q * 80, [0.6 + q * 20, 1, 1], 0xffffff);
        else if (q > 0.99) pushP('ember', x, y, [wx, gy + 0.12, wz], q * 7, [1, 1, 1], 0xff7a2a);
      }
    }
  }
  // —— M10 fase 8: SINAIS DO DRAGÃO (garras, ossos, chão queimado; mais fortes perto do covil) ——
  const dragonSignsDrawn = { n: 0 };
  for (const sg of m.dragonSigns || []) {
    const wx = (sg.x + 0.5) * T, wz = (sg.y + 0.5) * T; const gy = G(sg.x + 0.5, sg.y + 0.5); const near = 1 - Math.min(1, sg.d ?? 0.6); const a = h32(sg.x, sg.y, 50) * Math.PI;
    pushP('scorch', sg.x, sg.y, [wx, gy + 0.03, wz], 0, [1.1 + near * 1.6, 1, 0.9 + near * 1.4], 0x000000);
    for (let k = -1; k <= 1; k++) pushP('claw', sg.x, sg.y, [wx + Math.cos(a) * k * 0.32, gy + 0.045, wz + Math.sin(a) * k * 0.32], -a, [1, 1, 1 + near * 0.6], 0x000000);
    pushP('bone', sg.x, sg.y, [wx + 0.7, gy + 0.05, wz - 0.4], a * 2, [0.9, 1, 1], 0xffffff);
    if (near > 0.3) pushP('skull', sg.x, sg.y, [wx - 0.6, gy + 0.16, wz + 0.5], a, [1, 0.85, 1.15], 0xffffff);
    if (near > 0.45) for (let k = 0; k < 2; k++) pushP('ember', sg.x, sg.y, [wx + (h32(sg.x, sg.y, 60 + k) - 0.5) * 1.4, gy + 0.12, wz + (h32(sg.x, sg.y, 70 + k) - 0.5) * 1.4], k, [1, 1, 1], 0xff7a2a);
    dragonSignsDrawn.n++;
  }
  const e = new THREE.Euler(); const qn = new THREE.Quaternion();
  const treeInst = new Map(); // tile → instâncias (tronco/copa) para esconder entre câmera e herói
  for (const [k, list] of buckets) {
    const [kind, ci] = k.split('|'); const [geo, mat, shadow] = KIND[kind];
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((it, i) => {
      dummy.position.set(it.p[0], it.p[1], it.p[2]); dummy.rotation.set(0, it.r, 0); dummy.scale.set(it.s[0], it.s[1], it.s[2]); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix);
      if (it.c !== 0xffffff || COLORED.has(kind)) im.setColorAt(i, tmpC.setHex(it.c));
    });
    if (kind === 'trunk' || kind === 'canopy' || kind === 'bush') list.forEach((it, i) => { let e = treeInst.get(it.t); if (!e) { e = []; treeInst.set(it.t, e); } const mm = new THREE.Matrix4(); im.getMatrixAt(i, mm); e.push({ im, i, m: mm }); });
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = shadow; im.receiveShadow = !['neon', 'cap', 'claw', 'scorch', 'ember', 'shroom', 'strip', 'banner'].includes(kind);
    if (kind === 'claw' || kind === 'scorch') im.renderOrder = 1;
    im.computeBoundingSphere(); im.name = `br-${kind}`;
    chunks[+ci].add(im); stats.meshes++; stats.instances += list.length;
  }
  void e; void qn;

  // —— TORRE DE SINAL (estrutura própria; 1 grupo) ——
  if (tower) {
    const tg = new THREE.Group(); const cx = ((tower.x0 + tower.x1 + 1) / 2) * T, cz = ((tower.y0 + tower.y1 + 1) / 2) * T; const gy = G((tower.x0 + tower.x1 + 1) / 2, (tower.y0 + tower.y1 + 1) / 2);
    const legGeo = new THREE.BoxGeometry(0.35, tower.h, 0.35).translate(0, tower.h / 2, 0);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const l = new THREE.Mesh(legGeo, mats.metal); l.position.set(cx + sx * 2.4, gy, cz + sz * 2.4); l.castShadow = true; tg.add(l); }
    for (let k = 1; k <= 3; k++) { const ring = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.2, 5.2), mats.rust); ring.position.set(cx, gy + k * tower.h / 3.4, cz); tg.add(ring); }
    const deck = new THREE.Mesh(new THREE.BoxGeometry(6, 0.35, 6), mats.metal); deck.position.set(cx, gy + tower.h, cz); deck.castShadow = true; tg.add(deck);
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 5, 6), mats.metal); ant.position.set(cx, gy + tower.h + 2.6, cz); tg.add(ant);
    const bea = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff3a2a, toneMapped: false })); bea.position.set(cx, gy + tower.h + 5.2, cz); bea.name = 'br-tower-beacon'; tg.add(bea);
    group.add(tg); stats.meshes += 10;
  }

  // —— MARCADORES DE OBJETIVO (colunas de luz visíveis de longe, não revelam loot) ——
  const markers = [];
  const beamGeo = new THREE.CylinderGeometry(0.16, 0.3, 22, 10, 1, true).translate(0, 11, 0); // Caio: feixes mais finos
  const mkBeam = (fx, fy, color, opacity = 0.18) => {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
    const b = new THREE.Mesh(beamGeo, mat); b.position.set(fx * T, G(fx, fy), fy * T); b.frustumCulled = true; group.add(b); stats.meshes++; return b;
  };
  for (const p of m.pois) {
    if (p.hidden) continue;
    const reg = regAt(p.x, p.y); const col = new THREE.Color(reg?.cor || '#3ecfbf').getHex();
    if (p.kind === 'regiao') continue;
    markers.push({ id: p.id, beam: mkBeam(p.x + 0.5, p.y + 0.5, col, p.kind === 'dragao' ? 0.13 : 0.07), x: p.x + 0.5, y: p.y + 0.5 });
  }
  // EXTRAÇÃO: plataforma + anel + coluna (fica verde quando liberada)
  const extraction = [];
  for (const ep of cfg.extracao?.pontos || []) {
    const fx = ep.x + 0.5, fy = ep.y + 0.5; const gy = G(fx, fy);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.5 * T * 0.5, 1.6 * T * 0.5, 0.18, 24), mats.metal); pad.position.set(fx * T, gy + 0.05, fy * T); pad.receiveShadow = true; group.add(pad);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x8a9aa8, transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.25 * T * 0.5, 1.5 * T * 0.5, 32).rotateX(-Math.PI / 2), ringMat); ring.position.set(fx * T, gy + 0.16, fy * T); group.add(ring);
    const beam = mkBeam(fx, fy, 0x8a9aa8, 0.06);
    extraction.push({ id: ep.id, ring, ringMat, beam, x: fx, y: fy }); stats.meshes += 2;
  }
  // COVIL: runa hexagonal verde + chão chamuscado (decalque aditivo)
  {
    const d = cfg.dragao; const gy = G(d.x + 0.5, d.y + 0.5);
    const rune = new THREE.Mesh(new THREE.RingGeometry(9 * T * 0.5, 10 * T * 0.5, 6, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x3dff5a, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    rune.position.set((d.x + 0.5) * T, gy + 0.06, (d.y + 0.5) * T); rune.name = 'br-lair-rune'; group.add(rune);
    const scorch = new THREE.Mesh(new THREE.CircleGeometry(7 * T * 0.5, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
    scorch.position.set((d.x + 0.5) * T, gy + 0.04, (d.y + 0.5) * T); group.add(scorch); stats.meshes += 2;
  }
  // ARENA DE ELITE: anel dourado no chão
  {
    const p = m.pois.find((q) => q.kind === 'elite');
    if (p) { const gy = G(p.x + 0.5, p.y + 0.5); const r = new THREE.Mesh(new THREE.RingGeometry(6.2 * T * 0.5, 6.7 * T * 0.5, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffc830, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })); r.scale.set(1, 1, 0.82); r.position.set((p.x + 0.5) * T, gy + 0.05, (p.y + 0.5) * T); group.add(r); stats.meshes++; }
  }

  // —— BAÚS e CAIXAS de loot (instanciados: base / tampa / brilho de raridade) ——
  const lootSpots = [...m.chests, ...m.crates];
  const chestBase = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 0.6, 0.75).translate(0, 0.3, 0), mats.metal, lootSpots.length);
  const chestLid = new THREE.InstancedMesh(new THREE.BoxGeometry(1.14, 0.18, 0.79).translate(0, 0.09, 0.395), mats.rust, lootSpots.length);
  const chestGlow = new THREE.InstancedMesh(new THREE.BoxGeometry(1.16, 0.06, 0.81), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), lootSpots.length);
  const lootState = lootSpots.map((s) => ({ id: s.id, opened: false }));
  const setLoot = (i, opened) => {
    const s = lootSpots[i]; const fx = s.x + 0.5, fy = s.y + 0.5; const gy = G(fx, fy); const yaw = h32(s.x, s.y, 7) * Math.PI * 2; const sc = s.kind === 'caixa' ? 0.8 : 1;
    dummy.position.set(fx * T, gy, fy * T); dummy.rotation.set(0, yaw, 0); dummy.scale.setScalar(sc); dummy.updateMatrix(); chestBase.setMatrixAt(i, dummy.matrix);
    const lid = new THREE.Object3D(); lid.position.set(0, 0.6 * sc, -0.395 * sc); lid.rotation.x = opened ? -1.9 : 0;
    const base = new THREE.Object3D(); base.position.copy(dummy.position); base.rotation.copy(dummy.rotation); base.scale.setScalar(sc); base.add(lid); base.updateMatrixWorld(true);
    chestLid.setMatrixAt(i, lid.matrixWorld);
    dummy.position.set(fx * T, gy + 0.5 * sc, fy * T); dummy.scale.setScalar(opened ? 0.0001 : sc); dummy.updateMatrix(); chestGlow.setMatrixAt(i, dummy.matrix);
    chestGlow.setColorAt(i, tmpC.setHex(s.kind === 'caixa' ? 0x39e8ff : (RARITY_GLOW[s.loot] || 0xffffff)));
    chestBase.instanceMatrix.needsUpdate = true; chestLid.instanceMatrix.needsUpdate = true; chestGlow.instanceMatrix.needsUpdate = true; if (chestGlow.instanceColor) chestGlow.instanceColor.needsUpdate = true;
    lootState[i].opened = opened;
  };
  for (let i = 0; i < lootSpots.length; i++) setLoot(i, false);
  for (const im of [chestBase, chestLid]) { im.castShadow = true; im.receiveShadow = true; }
  chestBase.computeBoundingSphere(); chestLid.computeBoundingSphere(); chestGlow.computeBoundingSphere();
  chestBase.name = 'br-chests'; group.add(chestBase, chestLid, chestGlow); stats.meshes += 3;

  // —— DROPS no chão (loot): gema girando + coluna de luz curta na cor da raridade; 1 draw call cada (pool de 64) ——
  const DROP_MAX = 64;
  const DROP_COL = { comum: 0xc8d4d0, incomum: 0x4aa0ff, raro: 0xffc24a, epico: 0xb36bff, lendario: 0xffd34a, material: 0x8fd8c8 };
  const gem = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.24, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), DROP_MAX);
  const dropBeam = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.025, 0.08, 1.8, 6, 1, true).translate(0, 0.9, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), DROP_MAX);
  for (const im of [gem, dropBeam]) { im.count = 0; im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.setColorAt(0, tmpC.setHex(0xffffff)); group.add(im); }
  gem.name = 'br-drops'; stats.meshes += 2;
  // coleta: anel que abre + sobe na cor da raridade (pool de 12, 1 draw call) — "sentir" o loot entrando na bolsa
  const FL_MAX = 12; const flashes = []; let prevDrops = new Map(); let pickFlashes = 0;
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false });
  const flashIm = new THREE.InstancedMesh(new THREE.RingGeometry(0.7, 1, 28).rotateX(-Math.PI / 2), flashMat, FL_MAX);
  flashIm.count = 0; flashIm.frustumCulled = false; flashIm.instanceMatrix.setUsage(THREE.DynamicDrawUsage); flashIm.setColorAt(0, tmpC.setHex(0xffffff)); flashIm.name = 'br-pick-flash'; group.add(flashIm); stats.meshes += 1;
  function tickFlashes(now) {
    let n = 0;
    for (let i = flashes.length - 1; i >= 0; i--) { if (now - flashes[i].t0 > 520) flashes.splice(i, 1); }
    for (const f of flashes) {
      if (n >= FL_MAX) break;
      const k = (now - f.t0) / 520; const fade = 1 - k;
      dummy.position.set(f.x * T, f.gy + 0.08 + k * 1.3, f.y * T); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar((0.25 + k * 0.9) * (f.big ? 1.4 : 1)); dummy.updateMatrix();
      flashIm.setMatrixAt(n, dummy.matrix); tmpC.setHex(f.col).multiplyScalar(Math.max(0, fade)); flashIm.setColorAt(n, tmpC); n++;
    }
    flashIm.count = n; if (n) { flashIm.instanceMatrix.needsUpdate = true; if (flashIm.instanceColor) flashIm.instanceColor.needsUpdate = true; }
  }
  /** Caio: NENHUM feixe/coluna perto do herói (≤ ~3 tiles some, 1,5→3,5 = fade) nem entre a câmera e o herói. */
  const view = { hx: 0, hy: 0, cx: 0, cy: 0, ok: false };
  const beamStats = { faded: 0, hidden: 0 };
  function beamFade(fx, fy) {
    if (!view.ok) return 1;
    const d = Math.hypot(fx - view.hx, fy - view.hy);
    let k = Math.min(1, Math.max(0, (d - 1.5) / 2));
    // distância do feixe ao segmento câmera→herói (em tiles, no plano)
    const sx = view.hx - view.cx, sy = view.hy - view.cy; const L2 = sx * sx + sy * sy;
    if (L2 > 1e-4) {
      const t = Math.max(0, Math.min(1, ((fx - view.cx) * sx + (fy - view.cy) * sy) / L2));
      const ds = Math.hypot(fx - (view.cx + sx * t), fy - (view.cy + sy * t));
      k = Math.min(k, Math.min(1, Math.max(0, (ds - 0.8) / 1.2)));
    }
    return k;
  }
  function updateDrops(drops, clock, now) {
    const n = Math.min(DROP_MAX, drops?.length || 0);
    // drop que sumiu desde o último quadro = coletado → flash
    const cur = new Map();
    for (let i = 0; i < (drops?.length || 0); i++) cur.set(drops[i].id, drops[i]);
    for (const [id, d] of prevDrops) if (!cur.has(id) && clock - d.at > 120) { flashes.push({ x: d.x, y: d.y, gy: G(d.x, d.y), col: DROP_COL[d.rar] ?? 0xffffff, big: d.rar === 'epico' || d.rar === 'lendario', t0: now }); pickFlashes++; }
    prevDrops = cur;
    tickFlashes(now);
    let list = drops;
    if ((drops?.length || 0) > DROP_MAX) { // muitos drops no chão: desenha os mais próximos do herói
      list = drops.slice().sort((a, b2) => ((a.x - view.hx) ** 2 + (a.y - view.hy) ** 2) - ((b2.x - view.hx) ** 2 + (b2.y - view.hy) ** 2));
    }
    for (let i = 0; i < n; i++) {
      const d = list[i]; const age = clock - d.at;
      const k = Math.min(1, age / 350); const hop = Math.sin(k * Math.PI) * 0.9; // pulo saindo do baú
      const gy = G(d.x, d.y);
      const big = d.rar === 'lendario' || d.rar === 'epico' ? 1.25 : d.rar === 'material' ? 0.75 : 1;
      dummy.position.set(d.x * T, gy + 0.55 + hop + Math.sin(now * 0.004 + d.id) * 0.08, d.y * T);
      dummy.rotation.set(0, now * 0.003 + d.id, 0); dummy.scale.setScalar(big * (0.6 + 0.4 * k)); dummy.updateMatrix(); gem.setMatrixAt(i, dummy.matrix);
      const bf = beamFade(d.x, d.y); dummy.position.set(d.x * T, gy, d.y * T); dummy.rotation.set(0, 0, 0); dummy.scale.set(big * Math.max(0.0001, bf), (d.rar === 'material' ? 0.45 : 1) * k * Math.max(0.0001, bf), big * Math.max(0.0001, bf)); dummy.updateMatrix(); dropBeam.setMatrixAt(i, dummy.matrix);
      tmpC.setHex(DROP_COL[d.rar] ?? 0xffffff); gem.setColorAt(i, tmpC); dropBeam.setColorAt(i, tmpC);
    }
    gem.count = n; dropBeam.count = n;
    gem.instanceMatrix.needsUpdate = true; dropBeam.instanceMatrix.needsUpdate = true;
    if (gem.instanceColor) gem.instanceColor.needsUpdate = true; if (dropBeam.instanceColor) dropBeam.instanceColor.needsUpdate = true;
  }

  const viewDist = o.tierName === 'low' ? 34 : o.tierName === 'medium' ? 44 : 62; // névoa esconde o corte
  let visibleChunks = 0; let visibleFloor = 0; const treeHidden = new Set(); const ZERO_M = new THREE.Matrix4().makeScale(0.0001, 0.0001, 0.0001); let treesFaded = 0;
  return {
    group, stats, markers, extraction, lampPos, lootSpots, lootState,
    regionProps, dragonSigns: dragonSignsDrawn,
    /** M10: região sob um ponto (tiles) — usado para a tonalidade da névoa por região */
    regionAt(fx, fy) { const x = Math.floor(fx), y = Math.floor(fy); return x >= 0 && y >= 0 && x < W && y < H ? (regAt(x, y)?.id || null) : null; },
    updateDrops,
    get pickFlashes() { return pickFlashes; },
    beamFade, get beamStats() { return { ...beamStats }; },
    /** e2e: feixes visíveis (POI/extração) com distância ao herói em tiles */
    beamsNear(r = 3) { const o = []; for (const b of [...markers, ...extraction]) { const d = Math.hypot(b.x - view.hx, b.y - view.hy); if (d <= r) o.push({ id: b.id, d: +d.toFixed(2), visible: b.beam.visible, opacity: +b.beam.material.opacity.toFixed(3) }); } return o; },
    resetLoot() { for (let i = 0; i < lootSpots.length; i++) if (lootState[i].opened) setLoot(i, false); },
    setLootOpened(id, opened = true) { const i = lootSpots.findIndex((s) => s.id === id); if (i >= 0 && lootState[i].opened !== opened) setLoot(i, opened); },
    setExtractionActive(active, now = 0) {
      for (const e2 of extraction) { const c = active ? 0x5dff8a : 0x8a9aa8; e2.ringMat.color.setHex(c); e2.beam.material.color.setHex(c); const f = beamFade(e2.x, e2.y); e2.beam.visible = f > 0.01; e2.beam.material.opacity = (active ? 0.13 + 0.04 * Math.sin(now * 0.004) : 0.05) * f; }
    },
    update(heroWX, heroWZ, now, camWX, camWZ) {
      view.hx = heroWX / T; view.hy = heroWZ / T; view.ok = Number.isFinite(camWX); if (view.ok) { view.cx = camWX / T; view.cy = camWZ / T; }
      const vd = viewDist + CH * T * 0.71; visibleChunks = 0;
      for (const c of chunks) { const on = Math.hypot(c.userData.cx - heroWX, c.userData.cz - heroWZ) < vd; c.visible = on; if (on) visibleChunks++; }
      // árvores entre a câmera e o herói somem (não tampam o herói); voltam quando saem da linha
      if (view.ok && treeInst.size) {
        const want = new Set(); const ax = view.cx, ay = view.cy, bx = view.hx, by = view.hy; const L = Math.hypot(bx - ax, by - ay); const n = Math.ceil(L * 2) + 1;
        for (let k = 0; k <= n; k++) { const f = k / n; if (f > 0.93) break; const px = ax + (bx - ax) * f, py = ay + (by - ay) * f;
          for (let b2 = -1; b2 <= 1; b2++) for (let a2 = -1; a2 <= 1; a2++) { const tx = Math.floor(px + a2 * 0.6), ty = Math.floor(py + b2 * 0.6); const t = tx + ty * W; if (treeInst.has(t)) want.add(t); } }
        for (const t of treeHidden) if (!want.has(t)) { for (const q of treeInst.get(t)) { q.im.setMatrixAt(q.i, q.m); q.im.instanceMatrix.needsUpdate = true; } treeHidden.delete(t); }
        for (const t of want) if (!treeHidden.has(t)) { for (const q of treeInst.get(t)) { q.im.setMatrixAt(q.i, ZERO_M); q.im.instanceMatrix.needsUpdate = true; } treeHidden.add(t); }
        treesFaded = treeHidden.size;
      }
      visibleFloor = 0; for (const f of floorChunks) { const on = Math.hypot(f.userData.cx - heroWX, f.userData.cz - heroWZ) < viewDist * 1.6 + f.userData.rad; f.visible = on; if (on) visibleFloor++; }
      beamStats.faded = 0; beamStats.hidden = 0;
      for (const mk of markers) { const f = beamFade(mk.x, mk.y); if (f < 1) beamStats.faded++; mk.beam.visible = f > 0.01; if (!mk.beam.visible) beamStats.hidden++; mk.beam.material.opacity = (mk.beam.userData.base ??= mk.beam.material.opacity) * (0.85 + 0.15 * Math.sin(now * 0.002 + mk.x)) * f; }
      const glowPulse = 0.75 + 0.25 * Math.sin(now * 0.005);
      chestGlow.material.color.setScalar(glowPulse);
    },
    get visibleChunks() { return visibleChunks; }, get floorChunks() { return floorChunks.length; }, get treesFaded() { return treesFaded; }, get treeTiles() { return treeInst.size; }, mapW: W, mapH: H, get visibleFloor() { return visibleFloor; },
    chunkCount: chunks.length,
    dispose() {
      group.traverse((n) => { if (n.geometry && !Object.values(geos).includes(n.geometry)) n.geometry.dispose?.(); });
      for (const g of Object.values(geos)) g.dispose(); for (const mm of Object.values(mats)) mm.dispose();
      beamGeo.dispose();
    }
  };
}
