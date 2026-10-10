/**
 * NEXARA — Bloco 6: VFX das PASSIVAS AUTOMÁTICAS (pool fixo, aditivo = bloom, sem alocação por frame).
 *  - SUPER FORÇA (Fúria Cibernética): aura vermelha (coluna + anel no chão pulsando)
 *  - IMPULSO (Impulso Neural): rastro azul de imagens residuais + anel veloz nos pés
 *  - ESCUDO DE ENERGIA (Núcleo Reforçado): bolha ciano em volta do herói
 *  - FOCO NEURAL (Mira Neural): anel dourado girando no peito; crítico = explosão dourada
 *  - FLUXO DE NEXA (Condutor de Nexa): brilho azul + 3 orbes girando
 *  - MARCADO (Caçador de Monstros): losango laranja + anel no inimigo marcado
 *  - MODO DIVINO (Núcleo Divino): halo dourado no dragão (a escala fica em dragon-view)
 * Tudo em metros (1 tile = TILE m). O estado vem de main (passive-procs.getView()).
 */
import * as THREE from 'three';
import { TILE } from './fps-camera.js?v=20261009leve';
import { createPassiveSignatures } from './passive-signatures.js?v=20261009leve';

const COL = { furia: 0xff3b3b, impulso: 0x39a8ff, shield: 0x5ff0ff, foco: 0xffd23f, condutor: 0x4f8dff, mark: 0xff8a1f, divine: 0xffd76a };

export function createPassiveVfx(scene) {
  const root = new THREE.Group();
  root.name = 'passiveVfx';
  scene.add(root);
  const add = (c, o = 0, side = THREE.DoubleSide) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, side });
  const nofc = (o) => { o.frustumCulled = false; o.visible = false; root.add(o); return o; };

  // —— auras de coluna (fúria / condutor) ——
  const colGeo = new THREE.CylinderGeometry(1, 1, 1, 32, 6, true);
  colGeo.translate(0, 0.5, 0);
  // brilho some para cima (aditivo: cor de vértice preta = invisível)
  {
    const pos = colGeo.attributes.position;
    const cols = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) { const k = Math.pow(1 - pos.getY(i), 1.6); cols[i * 3] = cols[i * 3 + 1] = cols[i * 3 + 2] = k; }
    colGeo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  }
  const addV = (c) => { const m = add(c); m.vertexColors = true; return m; };
  const ringGeo = new THREE.RingGeometry(0.7, 1, 48);
  function aura(color) {
    const col = nofc(new THREE.Mesh(colGeo, addV(color)));
    const ring = nofc(new THREE.Mesh(ringGeo, add(color)));
    ring.rotation.x = -Math.PI / 2;
    return { col, ring, k: 0 };
  }
  const furia = aura(COL.furia);
  const condutor = aura(COL.condutor);
  const orbGeo = new THREE.SphereGeometry(0.055, 10, 8);
  const orbs = [0, 1, 2].map(() => nofc(new THREE.Mesh(orbGeo, add(0x5f9dff, 0.7))));

  // —— escudo ——
  const shieldGeo = new THREE.IcosahedronGeometry(1, 2);
  const shield = nofc(new THREE.Mesh(shieldGeo, add(COL.shield, 0, THREE.FrontSide)));
  const shieldWire = nofc(new THREE.Mesh(shieldGeo, new THREE.MeshBasicMaterial({ color: COL.shield, wireframe: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })));
  let shieldK = 0;

  // —— foco (mira) ——
  const focoRing = nofc(new THREE.Mesh(new THREE.RingGeometry(0.62, 0.7, 40, 1, 0, Math.PI * 1.6), add(COL.foco)));
  let focoK = 0;
  // explosão dourada do crítico
  const burstGeo = new THREE.SphereGeometry(1, 16, 12);
  const bursts = [0, 1, 2].map(() => ({ m: nofc(new THREE.Mesh(burstGeo, add(COL.foco, 0, THREE.FrontSide))), life: 0, dur: 0.35, x: 0, y: 0, z: 0, r: 1 }));
  let burstNext = 0;
  const flashRings = [0, 1, 2, 3].map(() => { const m = nofc(new THREE.Mesh(ringGeo, add(0xffffff))); m.rotation.x = -Math.PI / 2; return { m, life: 0, dur: 0.4, r0: 0.3, r1: 1.4, op: 0.9 }; });
  let flashNext = 0;

  // —— impulso: rastro ——
  const ghostGeo = new THREE.CylinderGeometry(0.28, 0.22, 1.75, 10, 1, true);
  ghostGeo.translate(0, 0.9, 0);
  const ghosts = [];
  for (let i = 0; i < 10; i++) ghosts.push({ m: nofc(new THREE.Mesh(ghostGeo, add(COL.impulso, 0, THREE.FrontSide))), life: 0, dur: 0.42 });
  let ghostNext = 0;
  let ghostAcc = 0;
  const impulsoRing = nofc(new THREE.Mesh(ringGeo, add(COL.impulso)));
  impulsoRing.rotation.x = -Math.PI / 2;
  let impK = 0;
  let lastHx = 0;
  let lastHz = 0;

  // —— marca do caçador ——
  const mark = new THREE.Group();
  const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(0.15, 0), new THREE.MeshBasicMaterial({ color: COL.mark, transparent: true, opacity: 0.95, depthWrite: false }));
  diamond.scale.set(1, 1.5, 1);
  const diamondGlow = new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 0), add(COL.mark, 0.4));
  diamondGlow.scale.set(1, 1.5, 1);
  const markRing = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 6), add(COL.mark, 0.8));
  markRing.rotation.x = -Math.PI / 2;
  mark.add(diamond, diamondGlow, markRing);
  mark.traverse((o) => { o.frustumCulled = false; });
  mark.visible = false;
  root.add(mark);
  const markInfo = { visible: false, uid: null };

  // —— dragão divino ——
  const divHalo = nofc(new THREE.Mesh(burstGeo, add(COL.divine, 0, THREE.FrontSide)));
  const divRing = nofc(new THREE.Mesh(ringGeo, add(COL.divine)));
  divRing.rotation.x = -Math.PI / 2;
  let divK = 0;

  // EVO: identidade visual própria por passiva (formas/movimentos distintos; ver passive-signatures.js).
  // As auras genéricas de coluna/anel, o losango e a esfera dourada ficam DESLIGADAS (mantidas só como estado).
  const sig = createPassiveSignatures(root, {});
  const sigCtx = { hero: { x: 0, z: 0 }, fp: false, owned: new Set(), v: null, markPos: null, aimPos: null, dragonRoot: null, hpFrac: 1, nexaFrac: 0, camRight: { x: 1, z: 0 } };
  const LEGACY = false;

  let t = 0;
  /** 1ª pessoa (?fp=1): sem malhas em volta da câmera — só anéis no chão (o HUD mostra o resto). */
  let fp = false;
  const vis = { furia: false, condutor: false, shield: false, foco: false, impulso: false, mark: false, divine: false };
  const wp = new THREE.Vector3();

  function setAura(a, k, hx, hz, radius, height, pulse) {
    const on = k > 0.01;
    a.col.visible = a.ring.visible = on;
    if (!on) return false;
    const p = 1 + Math.sin(t * pulse) * 0.08;
    a.col.position.set(hx, 0.02, hz);
    a.col.scale.set(radius * p, height, radius * p);
    a.col.material.opacity = 0.4 * k;
    a.ring.position.set(hx, 0.05, hz);
    a.ring.scale.setScalar(radius * 1.5 * (1 + ((t * 1.6) % 1) * 0.35));
    a.ring.material.opacity = 0.75 * k * (1 - ((t * 1.6) % 1) * 0.7);
    return true;
  }

  /** Disparo pontual: 'crit' (explosão dourada no alvo), 'proc' (anel no herói). */
  function burst(kind, d, hero) {
    if (kind === 'crit') {
      const b = bursts[burstNext];
      burstNext = (burstNext + 1) % bursts.length;
      b.x = Number.isFinite(d.x) ? d.x * TILE : hero.x;
      b.z = Number.isFinite(d.y) ? d.y * TILE : hero.z;
      b.y = 1.2;
      b.life = b.dur = 0.34;
      b.r = 0.9;
      b.m.visible = true;
      ring(b.x, b.z, 0.2, 1.3, COL.foco, 0.4);
    } else if (kind === 'proc') {
      ring(hero.x, hero.z, 0.3, 1.6, d.color ?? 0xffffff, 0.45);
    }
  }
  function ring(x, z, r0, r1, color, dur) {
    const r = flashRings[flashNext];
    flashNext = (flashNext + 1) % flashRings.length;
    r.m.material.color.setHex(color);
    r.m.position.set(x, 0.08, z);
    r.life = r.dur = dur;
    r.r0 = r0;
    r.r1 = r1;
    r.m.visible = true;
  }

  /**
   * @param {number} dt s
   * @param {{x:number,z:number,yaw:number}} hero
   * @param {object|null} v passive-procs.getView()
   * @param {{x:number,z:number}|null} markPos inimigo marcado (m)
   * @param {THREE.Object3D|null} dragonRoot
   */
  function update(dt, hero, v, markPos, dragonRoot, camPos = null, ext = null) {
    t += dt;
    sigCtx.hero.x = hero.x; sigCtx.hero.z = hero.z; sigCtx.fp = fp; sigCtx.v = v; sigCtx.markPos = markPos;
    sigCtx.dragonRoot = dragonRoot && dragonRoot.visible ? dragonRoot : null;
    if (ext) { sigCtx.owned = ext.owned || sigCtx.owned; sigCtx.aimPos = ext.aimPos || null; sigCtx.hpFrac = ext.hpFrac ?? 1; sigCtx.nexaFrac = ext.nexaFrac ?? 0; if (ext.camRight) sigCtx.camRight = ext.camRight; }
    sig.update(dt, sigCtx);
    const hx = hero.x;
    const hz = hero.z;
    const L = Math.min(1, dt * 8);
    const tgt = (x) => (v && v[x] > 0 ? 1 : 0);
    furia.k += (tgt('furia') - furia.k) * L;
    condutor.k += (tgt('condutor') - condutor.k) * L;
    shieldK += (tgt('shield') - shieldK) * L;
    focoK += (tgt('foco') - focoK) * L;
    impK += (tgt('impulso') - impK) * L;
    divK += (tgt('divine') - divK) * L;
    vis.furia = setAura(furia, furia.k, hx, hz, 0.62, 2.1, 9);
    vis.condutor = setAura(condutor, condutor.k, hx, hz, 0.44, 1.7, 5);
    for (let i = 0; i < orbs.length; i++) {
      const o = orbs[i];
      o.visible = vis.condutor;
      if (!o.visible) continue;
      const a = t * 3.2 + (i * Math.PI * 2) / 3;
      o.position.set(hx + Math.sin(a) * 0.7, 0.7 + Math.sin(t * 4 + i) * 0.35 + i * 0.35, hz + Math.cos(a) * 0.7);
      o.material.opacity = 0.95 * condutor.k;
    }
    // escudo
    vis.shield = shieldK > 0.01;
    shield.visible = shieldWire.visible = vis.shield;
    if (vis.shield) {
      const s = 1.05 + Math.sin(t * 7) * 0.04;
      shield.position.set(hx, 0.95, hz);
      shield.scale.set(s, s * 1.12, s);
      shield.material.opacity = 0.16 * shieldK;
      shieldWire.position.copy(shield.position);
      shieldWire.scale.copy(shield.scale);
      shieldWire.rotation.y = t * 0.8;
      shieldWire.material.opacity = 0.45 * shieldK;
    }
    // foco
    vis.foco = focoK > 0.01;
    focoRing.visible = vis.foco;
    if (vis.foco) {
      focoRing.position.set(hx, 1.25, hz);
      focoRing.rotation.set(-Math.PI / 2, 0, t * 4);
      focoRing.material.opacity = 0.85 * focoK;
    }
    // impulso: rastro enquanto anda + anel nos pés
    vis.impulso = impK > 0.01;
    impulsoRing.visible = vis.impulso;
    const moved = Math.hypot(hx - lastHx, hz - lastHz);
    lastHx = hx;
    lastHz = hz;
    if (vis.impulso) {
      impulsoRing.position.set(hx, 0.05, hz);
      impulsoRing.scale.setScalar(0.75 + Math.sin(t * 14) * 0.08);
      impulsoRing.material.opacity = 0.8 * impK;
      ghostAcc += dt;
      if (ghostAcc >= 0.07 && (moved > 0.004 || ghostAcc >= 0.25)) {
        ghostAcc = 0;
        const g = ghosts[ghostNext];
        ghostNext = (ghostNext + 1) % ghosts.length;
        g.m.position.set(hx, 0, hz);
        g.life = g.dur;
        g.m.visible = true;
      }
    }
    if (fp) {
      furia.col.visible = condutor.col.visible = shield.visible = shieldWire.visible = focoRing.visible = false;
      for (const o of orbs) o.visible = false;
      for (const g of ghosts) { g.life = 0; g.m.visible = false; }
    }
    for (const g of ghosts) {
      if (g.life <= 0) continue;
      g.life -= dt;
      if (g.life <= 0) { g.m.visible = false; continue; }
      g.m.material.opacity = 0.32 * (g.life / g.dur);
    }
    for (const b of bursts) {
      if (b.life <= 0) continue;
      b.life -= dt;
      if (b.life <= 0) { b.m.visible = false; continue; }
      const k = 1 - b.life / b.dur;
      b.m.position.set(b.x, b.y, b.z);
      b.m.scale.setScalar(0.2 + b.r * k);
      b.m.material.opacity = 0.75 * (1 - k);
    }
    for (const r of flashRings) {
      if (r.life <= 0) continue;
      r.life -= dt;
      if (r.life <= 0) { r.m.visible = false; continue; }
      const k = 1 - r.life / r.dur;
      r.m.scale.setScalar(r.r0 + (r.r1 - r.r0) * k);
      r.m.material.opacity = 0.9 * (1 - k);
    }
    // marca
    vis.mark = !!markPos;
    mark.visible = vis.mark;
    markInfo.visible = vis.mark;
    markInfo.uid = v?.markUid ?? null;
    if (markPos) {
      mark.position.set(markPos.x, 0, markPos.z);
      diamond.position.y = diamondGlow.position.y = 2.45 + Math.sin(t * 4) * 0.07;
      diamond.rotation.y = diamondGlow.rotation.y = t * 2.5;
      markRing.position.y = 0.06;
      markRing.rotation.z = -t * 1.2;
    }
    // dragão divino
    vis.divine = divK > 0.01 && !!dragonRoot && dragonRoot.visible;
    divHalo.visible = divRing.visible = vis.divine;
    if (vis.divine) {
      dragonRoot.getWorldPosition(wp);
      // halo discreto: o dragão voa perto da câmera (3ª pessoa) — esfera grande lavaria a tela
      const camD = camPos ? wp.distanceTo(camPos) : 9;
      const s = (0.42 + Math.sin(t * 6) * 0.04) * Math.min(1, Math.max(0.35, (camD - 0.6) / 2.4));
      divHalo.position.copy(wp);
      divHalo.scale.setScalar(s);
      divHalo.material.opacity = 0.2 * divK * Math.min(1, Math.max(0.25, (camD - 0.8) / 2));
      divRing.position.set(wp.x, wp.y - 0.35, wp.z);
      divRing.scale.setScalar(0.9 + ((t * 1.4) % 1) * 0.5);
      divRing.material.opacity = 0.8 * divK * (1 - ((t * 1.4) % 1) * 0.6);
    }
    if (!LEGACY) {
      // estado (vis.*) continua valendo; as malhas genéricas não aparecem — quem desenha é a assinatura
      furia.col.visible = furia.ring.visible = condutor.col.visible = condutor.ring.visible = false;
      for (const o of orbs) o.visible = false;
      shield.visible = shieldWire.visible = false;
      focoRing.visible = false;
      impulsoRing.visible = false;
      for (const g of ghosts) g.m.visible = false;
      mark.visible = false;
      divHalo.visible = divRing.visible = false;
    }
  }
  function sigEvent(kind, d) { sig.event(kind, d || {}, sigCtx); }

  function counts() {
    return { ...vis, markUid: markInfo.visible ? markInfo.uid : null, ghosts: ghosts.filter((g) => g.life > 0).length, bursts: bursts.filter((b) => b.life > 0).length };
  }
  return { root, update, burst, counts, sigEvent, sigCounts: () => sig.counts(), setFirstPerson: (v) => { fp = !!v; } };
}
