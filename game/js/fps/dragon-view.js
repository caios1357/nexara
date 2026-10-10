/**
 * NEXARA — visual 3D do MINI DRAGÃO (Bloco 3 · gp3), estilo low-poly/neon do jogo.
 * Referência: visual/reference/mini-dragao-ref-*.png — dragão cibernético azul,
 * asas de morcego, detalhes azuis brilhantes, cauda longa.
 *
 * Leve: 1 grupo, 4 materiais compartilhados, 1 luz pontual só no desktop.
 * Projéteis/rastros/impactos em POOLS (sem alocação por frame):
 *  - RAJADA: bolinhas azul-ciano (núcleo + halo) com rastro curto de partículas.
 *  - CHAMA CONCENTRADA: orbe grande branco-azulado (núcleo + 2 halos + anel
 *    girando) com rastro de energia espesso; impacto com onda de choque.
 *  - Carga: brilho da boca (rajada) / orbe crescendo com partículas sugadas (chama).
 */
import * as THREE from 'three';
import { attachDragonGlb } from './dragon-glb.js?v=20261010ajustes';
import { TILE } from './fps-camera.js?v=20261010ajustes';
import { getConfig } from '../gameplay-config.js?v=20261010ajustes';
import { mergeStaticParts } from './merge-util.js?v=20261010ajustes';
import { buildMiniModel, animateMini, paintMini } from './mini-model.js?v=20261010ajustes';

const BLUE = 0x49c6ff;
const DEEP = 0x2f6bff;

function makePoints(n, size, color, map) {
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) pos[i * 3 + 1] = -50;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  // textura radial suave (partícula redonda com brilho — não quadrado)
  const mat = new THREE.PointsMaterial({ color, size, map, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.85, alphaTest: 0.01 });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return { pts, pos, vel: new Float32Array(n * 3), life: new Float32Array(n), n, next: 0, alive: 0, drag: 2.5 };
}

export function createDragonView(scene, { pointLight = true } = {}) {
  const root = new THREE.Group();
  root.name = 'mini-dragao';
  const model = new THREE.Group();
  root.add(model);
  // Bloco V: dragão mecânico mais esguio (referência mini-dragao-ref), juntas e olhos azuis brilhando (bloom)
  model.scale.setScalar(1.12);
  // M3D: mini-dragão GLB azul (Quaternius, CC0); o procedural fica de fallback
  const glbHolder = new THREE.Group();
  root.add(glbHolder);
  const glb = attachDragonGlb(glbHolder, model, 'mini', {});

  let curPal = null;
  const MM = buildMiniModel(model); // 20261010ajustes: construtor compartilhado (mini-model.js) — companheiro e BB dos rivais usam o MESMO modelo
  const { bodyMat, darkMat, accentMat, wingMat, jointMat, mats, geos, G, head, mouthGlow, mouthHalo, mouthHaloMat, wings, tail, glowTex, spriteMat } = MM;

  let light = null;
  if (pointLight) {
    light = new THREE.PointLight(0x3aa0ff, 0.9, 5, 2);
    // luz FORA do root: esconder o dragão (root.visible=false) mudava o nº de luzes da cena → todos os materiais
    // iluminados recompilavam (engasgo ~0,5 s). Agora a luz fica sempre na cena e só apaga (intensidade 0).
    light.userData.local = new THREE.Vector3(0, 0.1, -0.2);
    scene.add(light);
  }
  model.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  // EVO: mescla partes estáticas por pivô (asas/cabeça/cauda continuam animadas) — menos draw calls
  let mergeInfo = null;
  if (getConfig().graphics?.mergeCharacterParts !== false) {
    const keep = [mouthGlow, mouthHalo];
    model.traverse((o) => { if (o.type === 'Group') keep.push(o); });
    mergeInfo = mergeStaticParts(model, keep);
  }
  scene.add(root);

  // —— projéteis ——
  const maxP = 24;
  const smallCoreGeo = G(new THREE.SphereGeometry(0.06, 8, 6));
  const bigCoreGeo = G(new THREE.IcosahedronGeometry(0.15, 1));
  const coreSmallMat = new THREE.MeshBasicMaterial({ color: 0xbfeaff });
  const coreBigMat = new THREE.MeshBasicMaterial({ color: 0xf0fbff });
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x7fb4ff, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const ringGeo = G(new THREE.TorusGeometry(0.24, 0.025, 4, 18));
  const haloSmall = spriteMat(0x59c3ff, 0.95);
  const haloBig = spriteMat(0x3f86ff, 1);
  const haloBigOuter = spriteMat(0x2d5cff, 0.55);
  mats.push(coreSmallMat, coreBigMat, ringMat, haloSmall, haloBig, haloBigOuter, mouthHaloMat);
  const pviews = [];
  for (let i = 0; i < maxP; i++) {
    const g = new THREE.Group();
    const small = new THREE.Group();
    small.add(new THREE.Mesh(smallCoreGeo, coreSmallMat));
    const hs = new THREE.Sprite(haloSmall);
    hs.scale.setScalar(0.62);
    small.add(hs);
    const big = new THREE.Group();
    big.add(new THREE.Mesh(bigCoreGeo, coreBigMat));
    const hb = new THREE.Sprite(haloBig);
    hb.scale.setScalar(1.05);
    big.add(hb);
    const hbo = new THREE.Sprite(haloBigOuter);
    hbo.scale.setScalar(1.9);
    big.add(hbo);
    const ring = new THREE.Mesh(ringGeo, ringMat);
    big.add(ring);
    g.add(small, big);
    g.visible = false;
    scene.add(g);
    pviews.push({ g, small, big, ring });
  }

  const trail = makePoints(220, 0.16, 0x56c0ff, glowTex);
  const trailBig = makePoints(160, 0.3, 0x5f8dff, glowTex);
  trailBig.drag = 1.5;
  scene.add(trail.pts, trailBig.pts);
  mats.push(trail.pts.material, trailBig.pts.material);
  geos.push(trail.pts.geometry, trailBig.pts.geometry);

  const shock = [];
  const shockMat = new THREE.MeshBasicMaterial({ color: 0x6fa8ff, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const shockGeo = G(new THREE.RingGeometry(0.3, 0.42, 28));
  mats.push(shockMat);
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(shockGeo, shockMat.clone());
    mats.push(m.material);
    m.visible = false;
    scene.add(m);
    shock.push({ m, life: 0 });
  }

  function emit(pool, x, y, z, spread, vmag, life, count, vx0 = 0, vy0 = 0, vz0 = 0) {
    for (let k = 0; k < count; k++) {
      const i = pool.next;
      pool.next = (pool.next + 1) % pool.n;
      if (pool.life[i] <= 0) pool.alive++;
      pool.pos[i * 3] = x + (Math.random() - 0.5) * spread;
      pool.pos[i * 3 + 1] = y + (Math.random() - 0.5) * spread;
      pool.pos[i * 3 + 2] = z + (Math.random() - 0.5) * spread;
      pool.vel[i * 3] = vx0 + (Math.random() - 0.5) * vmag;
      pool.vel[i * 3 + 1] = vy0 + (Math.random() - 0.5) * vmag;
      pool.vel[i * 3 + 2] = vz0 + (Math.random() - 0.5) * vmag;
      pool.life[i] = life * (0.7 + Math.random() * 0.6);
    }
  }
  function stepPool(pool, dt) {
    if (pool.alive <= 0) return;
    let alive = 0;
    const { pos, vel, life, n } = pool;
    const k = Math.exp(-pool.drag * dt);
    for (let i = 0; i < n; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      if (life[i] <= 0) { pos[i * 3 + 1] = -50; continue; }
      alive++;
      vel[i * 3] *= k; vel[i * 3 + 1] *= k; vel[i * 3 + 2] *= k;
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
    }
    pool.alive = alive;
    pool.pts.geometry.attributes.position.needsUpdate = true;
  }

  let lastImpactSeq = 0;
  let t = 0;
  const wp = new THREE.Vector3();
  const counts = { small: 0, big: 0 };

  /**
   * @param {object} v dragon.getView()
   * @param {number} dt s (visual, já escalado pelo tempo de debug)
   */
  let divK = 0;
  const divineScale = () => getConfig().passiveProcs?.nucleo_divino?.dragonScale ?? 1;
  function update(v, dt, camera) {
    t += dt;
    root.visible = !!v.visible;
    if (!v.visible) {
      if (light) light.intensity = 0;
      for (const pv of pviews) pv.g.visible = false;
      return;
    }
    root.position.set(v.x * TILE, v.h, v.y * TILE);
    root.rotation.y = -v.facing;
    // Bloco 6: MODO DIVINO (Núcleo Divino) — dragão cresce suavemente (brilho em passive-vfx)
    divK += ((v.divine ? 1 : 0) - divK) * Math.min(1, dt * 6);
    model.scale.setScalar(1.12 * (1 + (divineScale() - 1) * divK));
    // inclina na direção do voo
    model.rotation.x = -Math.min(0.35, v.speed * 0.08);
    glbHolder.rotation.x = model.rotation.x;
    glbHolder.scale.copy(model.scale).multiplyScalar(1 / 1.12);
    glb.update(dt, { state: v.state === 'ATTACK' ? 'ATTACK' : 'IDLE', progress: 0.5, speed: v.speed, charge: v.charge || 0 });
    // bater de asas (mais rápido voando / atacando)
    const flapHz = v.state === 'ATTACK' ? 3.2 : v.speed > 0.5 ? 4.2 : 2.6;
    const ph = t * flapHz * Math.PI * 2;
    for (const w of wings) w.pivot.rotation.z = w.side * (Math.sin(ph) * 0.62 + 0.12);
    model.position.y = -Math.sin(ph) * 0.025;
    for (let i = 0; i < tail.length; i++) {
      tail[i].rotation.y = Math.sin(t * 2.2 - i * 0.7) * 0.16;
      tail[i].rotation.x = 0.05 + Math.sin(t * 1.7 - i * 0.5) * 0.05;
    }
    head.rotation.x = v.chargeKind ? -0.18 : 0;
    // carga / boca
    let mScale = 1;
    let haloS = 0.12;
    if (v.chargeKind === 'rajada_azul') {
      mScale = 1.2 + v.charge * 0.9 + Math.sin(t * 40) * 0.2;
      haloS = 0.2 + v.charge * 0.35;
    } else if (v.chargeKind === 'chama_concentrada') {
      mScale = 1 + v.charge * 4.2;
      haloS = 0.25 + v.charge * 1.35;
      mouthGlow.getWorldPosition(wp);
      // partículas sugadas para a boca
      const r = 0.55;
      const a = Math.random() * Math.PI * 2;
      const b = (Math.random() - 0.5) * Math.PI;
      const ox = Math.cos(a) * Math.cos(b) * r;
      const oy = Math.sin(b) * r;
      const oz = Math.sin(a) * Math.cos(b) * r;
      if (dt > 0) emit(trailBig, wp.x + ox, wp.y + oy, wp.z + oz, 0.02, 0, 0.18, 2, -ox * 4.5, -oy * 4.5, -oz * 4.5);
    } else if (v.firing) {
      mScale = 1.4;
      haloS = 0.3;
    }
    mouthGlow.scale.setScalar(mScale);
    mouthHalo.scale.setScalar(haloS);
    if (light) {
      light.intensity = v.visible ? 0.6 + (v.chargeKind ? v.charge * 1.8 : 0) + (v.firing ? 0.8 : 0) : 0;
      root.updateMatrixWorld(); light.position.copy(light.userData.local).applyMatrix4(root.matrixWorld);
    }

    // projéteis
    counts.small = 0;
    counts.big = 0;
    const ps = v.projectiles;
    for (let i = 0; i < pviews.length; i++) {
      const pv = pviews[i];
      const p = ps[i];
      if (!p || !p.active) { pv.g.visible = false; continue; }
      const big = p.kind === 'chama_concentrada';
      pv.g.visible = true;
      pv.small.visible = !big;
      pv.big.visible = big;
      const x = p.x * TILE;
      const z = p.y * TILE;
      pv.g.position.set(x, p.h, z);
      if (big) {
        counts.big++;
        pv.ring.rotation.set(t * 7, t * 5, 0);
        const pulse = 1 + Math.sin(t * 30) * 0.08;
        pv.big.scale.setScalar(pulse);
        if (dt > 0) emit(trailBig, x, p.h, z, 0.18, 0.6, 0.42, 3, -p.vx * 0.5, 0.2, -p.vy * 0.5);
      } else {
        counts.small++;
        if (dt > 0) emit(trail, x, p.h, z, 0.05, 0.3, 0.22, 1, -p.vx * 0.3, 0.1, -p.vy * 0.3);
      }
    }
    // impactos novos
    for (const im of v.impacts) {
      if (im.seq <= lastImpactSeq || im.t < 0) continue;
      const x = im.x * TILE;
      const z = im.y * TILE;
      if (im.big) {
        emit(trailBig, x, im.h, z, 0.3, 7, 0.5, 34);
        const s = shock.find((q) => q.life <= 0) || shock[0];
        s.life = 0.45;
        s.m.position.set(x, im.h, z);
        if (camera) s.m.quaternion.copy(camera.quaternion);
        s.m.visible = true;
      } else {
        emit(trail, x, im.h, z, 0.12, 4, 0.3, 10);
      }
    }
    for (const im of v.impacts) if (im.seq > lastImpactSeq) lastImpactSeq = im.seq;
    for (const s of shock) {
      if (s.life <= 0) continue;
      s.life -= dt;
      const k = 1 - Math.max(0, s.life) / 0.45;
      s.m.scale.setScalar(0.6 + k * 3.2);
      s.m.material.opacity = 0.85 * (1 - k);
      if (s.life <= 0) s.m.visible = false;
    }
    stepPool(trail, dt);
    stepPool(trailBig, dt);
  }

  return {
    root,
    update,
    getCounts: () => ({ ...counts, trail: trail.alive + trailBig.alive }),
    info: () => { let n = 0; model.traverse((c) => { if (c.isMesh) n++; }); return { scale: model.scale.x, meshes: n, glb: glb.status, kind: 'mini-model', pal: curPal }; },
    glb, setPalette: (pal) => { curPal = pal?.brilho || null; paintMini(MM, pal || null); glb.setPalette?.(pal || null); },
    mergeInfo,
    dispose() {
      scene.remove(root, trail.pts, trailBig.pts); if (light) scene.remove(light);
      for (const pv of pviews) scene.remove(pv.g);
      for (const s of shock) scene.remove(s.m);
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      glowTex.dispose();
    }
  };
}
