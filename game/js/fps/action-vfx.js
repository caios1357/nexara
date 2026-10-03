/**
 * NEXARA — Bloco 4: VFX das ações do herói (pool fixo, sem alocação por frame, aditivo = bloom).
 *  - ondas de choque (anel no chão) — golpe poderoso / ataque em área / suprema / bloqueio
 *  - arco giratório (ataque em área), coluna de energia (suprema)
 *  - imagens residuais (esquiva / dash)
 *  - marcador de LOCK-ON (anel girando + 3 setas) no alvo travado
 * Materiais/geometrias criados uma vez; tudo em coordenadas de mundo (1 tile = TILE m).
 */
import * as THREE from 'three';
import { TILE } from './fps-camera.js?v=20261003vil';
import { getConfig } from '../gameplay-config.js?v=20261003vil';

const COLORS = {
  golpe_poderoso: 0x9ffbff,
  ataque_area: 0x39f0ff,
  dash: 0x5fb4ff,
  suprema: 0x8f7bff,
  dodge: 0x6ff6ff,
  block: 0x7fdcff
};

export function createActionVfx(scene) {
  const root = new THREE.Group();
  root.name = 'actionVfx';
  scene.add(root);
  const add = (c, o = 0) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

  // —— anéis de choque ——
  const ringGeo = new THREE.RingGeometry(0.82, 1, 56);
  const rings = [];
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(ringGeo, add(0xffffff));
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    m.frustumCulled = false;
    root.add(m);
    rings.push({ m, life: 0, dur: 1, r0: 0.2, r1: 1, y: 0.06, op: 0.9 });
  }
  let ringNext = 0;
  function spawnRing(x, z, r0, r1, color, durS, y = 0.06, op = 0.9) {
    const r = rings[ringNext];
    ringNext = (ringNext + 1) % rings.length;
    r.m.material.color.setHex(color);
    r.m.position.set(x, y, z);
    r.life = durS;
    r.dur = durS;
    r.r0 = r0;
    r.r1 = r1;
    r.y = y;
    r.op = op;
    r.m.visible = true;
    r.m.scale.setScalar(r0);
    return r;
  }

  // —— arco giratório (ataque em área) ——
  const spinGeo = new THREE.RingGeometry(0.55, 1, 40, 1, 0, Math.PI * 1.35);
  const spin = new THREE.Mesh(spinGeo, add(COLORS.ataque_area));
  spin.rotation.x = -Math.PI / 2;
  spin.visible = false;
  spin.frustumCulled = false;
  root.add(spin);
  const spinSt = { life: 0, dur: 0.3, radius: 1 };

  // —— coluna de energia (suprema) ——
  const colGeo = new THREE.CylinderGeometry(1, 1, 1, 28, 1, true);
  colGeo.translate(0, 0.5, 0);
  const column = new THREE.Mesh(colGeo, add(COLORS.suprema));
  column.visible = false;
  column.frustumCulled = false;
  root.add(column);
  const inner = new THREE.Mesh(colGeo, add(0xa9e6ff));
  inner.visible = false;
  inner.frustumCulled = false;
  root.add(inner);
  const colSt = { life: 0, dur: 0.7, phase: 'off', x: 0, z: 0 };

  // —— imagens residuais ——
  const ghostGeo = new THREE.CylinderGeometry(0.26, 0.2, 1.75, 10, 1, true);
  ghostGeo.translate(0, 0.9, 0);
  const ghosts = [];
  for (let i = 0; i < 8; i++) {
    const gm = add(COLORS.dodge);
    gm.side = THREE.FrontSide;
    const m = new THREE.Mesh(ghostGeo, gm);
    m.visible = false;
    m.frustumCulled = false;
    root.add(m);
    ghosts.push({ m, life: 0, dur: 0.3 });
  }
  let ghostNext = 0;
  const trail = { active: false, left: 0, every: 0.05, acc: 0, color: COLORS.dodge };
  function spawnGhost(x, z, color) {
    const g = ghosts[ghostNext];
    ghostNext = (ghostNext + 1) % ghosts.length;
    g.m.material.color.setHex(color);
    g.m.position.set(x, 0, z);
    g.life = g.dur = 0.32;
    g.m.visible = true;
  }

  // —— marcador de lock-on ——
  const lock = new THREE.Group();
  lock.name = 'lockMarker';
  // Bloco 5: anel mais legível — cor sólida (mistura normal, não some no chão molhado claro),
  // anel externo tracejado girando ao contrário e setas maiores.
  const vc = getConfig().vfx;
  const solid = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, side: THREE.DoubleSide });
  const lockRing = new THREE.Mesh(new THREE.RingGeometry(vc.lockRingInner, vc.lockRingOuter, 48), solid(0xff4a3a, vc.lockRingOpacity));
  lockRing.rotation.x = -Math.PI / 2;
  lockRing.renderOrder = 5;
  lock.add(lockRing);
  const outer = new THREE.Group();
  if (vc.lockOuterRing) {
    for (let i = 0; i < 4; i++) {
      const seg = new THREE.Mesh(new THREE.RingGeometry(vc.lockRingOuter + 0.1, vc.lockRingOuter + 0.2, 16, 1, (i * Math.PI) / 2 + 0.25, Math.PI / 2 - 0.5), add(0xff8a5a, 0.9));
      seg.rotation.x = -Math.PI / 2;
      outer.add(seg);
    }
  }
  lock.add(outer);
  const arrowGeo = new THREE.ConeGeometry(vc.lockArrowSize, vc.lockArrowSize * 2.4, 3);
  const arrows = [];
  for (let i = 0; i < 3; i++) {
    const a = new THREE.Mesh(arrowGeo, solid(0xff5a3a, 0.95));
    a.rotation.x = Math.PI; // aponta para baixo
    lock.add(a);
    arrows.push(a);
  }
  lock.visible = false;
  lock.traverse((o) => { o.frustumCulled = false; });
  root.add(lock);
  let lockT = 0;
  const lockInfo = { visible: false, x: 0, z: 0 };

  /** Evento de ação (disparado pelo main via renderer.actionVfx). */
  function trigger(kind, d, hero) {
    const hx = hero.x;
    const hz = hero.z;
    if (kind === 'dodge') {
      trail.active = true;
      trail.left = 0.3;
      trail.acc = 0;
      trail.color = COLORS.dodge;
    } else if (kind === 'special_start') {
      if (d.id === 'suprema') {
        colSt.phase = 'charge';
        colSt.hold = 0;
        colSt.life = 0;
        colSt.dur = 0.7;
        column.visible = inner.visible = true;
      } else if (d.id === 'dash') {
        trail.active = true;
        trail.left = 0.36;
        trail.acc = 0;
        trail.color = COLORS.dash;
      }
    } else if (kind === 'special_end') {
      // VIL: fim/cancelamento sem impacto (arma de família, interrupção) → a coluna some (nunca fica presa no herói)
      if (colSt.phase === 'charge') { colSt.phase = 'release'; colSt.life = 0; colSt.dur = 0.35; }
    } else if (kind === 'special_impact') {
      const R = (d.radius || 1.5) * TILE;
      if (d.id === 'golpe_poderoso') {
        const fx = hx + Math.sin(d.yaw) * 1.1 * TILE;
        const fz = hz - Math.cos(d.yaw) * 1.1 * TILE;
        spawnRing(fx, fz, 0.2, 1.3, COLORS.golpe_poderoso, 0.35, 0.08);
        spawnRing(fx, fz, 0.1, 0.8, 0xffffff, 0.22, 0.1, 0.7);
      } else if (d.id === 'ataque_area') {
        spinSt.life = spinSt.dur = 0.32;
        spinSt.radius = R;
        spin.visible = true;
        spawnRing(hx, hz, R * 0.4, R, COLORS.ataque_area, 0.4, 0.07);
      } else if (d.id === 'suprema') {
        colSt.phase = 'burst';
        colSt.life = 0;
        colSt.dur = 0.55;
        spawnRing(hx, hz, 0.4, R, COLORS.suprema, 0.55, 0.07);
        spawnRing(hx, hz, 0.3, R * 0.8, 0xbfe8ff, 0.4, 0.09, 0.45);
        spawnRing(hx, hz, 0.3, R * 1.08, COLORS.suprema, 0.75, 0.05, 0.5);
      }
    } else if (kind === 'block_spark') {
      const fx = hx + Math.sin(hero.yaw) * 0.55;
      const fz = hz - Math.cos(hero.yaw) * 0.55;
      spawnRing(fx, fz, 0.1, 0.7, COLORS.block, 0.2, 1.2, 0.95);
    }
  }

  /**
   * @param {number} dt s
   * @param {{x:number,z:number,yaw:number}} hero posição visual do herói (m)
   * @param {{x:number,z:number}|null} lockPos alvo travado (m) ou null
   */
  function update(dt, hero, lockPos) {
    for (const r of rings) {
      if (r.life <= 0) continue;
      r.life -= dt;
      if (r.life <= 0) { r.m.visible = false; continue; }
      const k = 1 - r.life / r.dur;
      r.m.scale.setScalar(r.r0 + (r.r1 - r.r0) * (1 - (1 - k) * (1 - k)));
      r.m.material.opacity = r.op * (1 - k);
    }
    if (spinSt.life > 0) {
      spinSt.life -= dt;
      const k = 1 - Math.max(0, spinSt.life) / spinSt.dur;
      spin.position.set(hero.x, 0.9, hero.z);
      spin.scale.setScalar(spinSt.radius * (0.7 + 0.3 * k));
      spin.rotation.z = -hero.yaw + k * Math.PI * 2.2;
      spin.material.opacity = 0.85 * (1 - k * k);
      if (spinSt.life <= 0) spin.visible = false;
    }
    if (colSt.phase !== 'off') {
      colSt.life += dt;
      const k = Math.min(1, colSt.life / colSt.dur);
      column.position.set(hero.x, 0, hero.z);
      inner.position.set(hero.x, 0, hero.z);
      if (colSt.phase === 'charge') {
        column.scale.set(0.36 + 0.08 * Math.sin(colSt.life * 30), 1 + k * 5, 0.36 + 0.08 * Math.sin(colSt.life * 30)); // Caio: coluna fina, não esconde o herói
        inner.scale.set(0.14, 1 + k * 5.5, 0.14);
        const vf = getConfig().vfx;
        column.material.opacity = vf.supremaChargeOpacity * (0.35 + 0.65 * k);
        inner.material.opacity = vf.supremaChargeOpacity * 1.2 * (0.35 + 0.65 * k);
        if (k >= 1) { colSt.hold = (colSt.hold || 0) + dt; colSt.life = colSt.dur; if (colSt.hold > 1.2) { colSt.phase = 'release'; colSt.life = 0; colSt.dur = 0.35; colSt.hold = 0; } } // segura até o impacto — no máx. 1,2 s (trava de segurança)
      } else {
        // não expande até a câmera (3ª pessoa fica ~3 tiles atrás): o raio do golpe é mostrado pelos anéis no chão
        column.scale.set(0.5 + k * 0.4, 6 * (1 - k * 0.6), 0.5 + k * 0.4);
        inner.scale.set(0.2 + k * 0.2, 6.5 * (1 - k), 0.2 + k * 0.2);
        const vf = getConfig().vfx;
        column.material.opacity = vf.supremaColumnOpacity * (1 - k) * (1 - k);
        inner.material.opacity = vf.supremaInnerOpacity * (1 - k) * (1 - k);
        if (k >= 1) { colSt.phase = 'off'; column.visible = inner.visible = false; }
      }
    }
    if (trail.active) {
      trail.left -= dt;
      trail.acc += dt;
      if (trail.acc >= trail.every) { trail.acc = 0; spawnGhost(hero.x, hero.z, trail.color); }
      if (trail.left <= 0) trail.active = false;
    }
    for (const g of ghosts) {
      if (g.life <= 0) continue;
      g.life -= dt;
      if (g.life <= 0) { g.m.visible = false; continue; }
      g.m.material.opacity = 0.2 * (g.life / g.dur);
    }
    // lock-on
    if (lockPos) {
      lockT += dt;
      lock.visible = true;
      lock.position.set(lockPos.x, 0.05, lockPos.z);
      lock.scale.setScalar(lockPos.s || 1); // Bloco 7: marcador maior no chefe colossal
      lockRing.rotation.z = lockT * 2.4;
      outer.rotation.y = -lockT * 1.6;
      const pulse = 1 + Math.sin(lockT * 6) * 0.06;
      lockRing.scale.setScalar(pulse);
      for (let i = 0; i < 3; i++) {
        const a = lockT * 2.4 + (i * Math.PI * 2) / 3;
        arrows[i].position.set(Math.sin(a) * 0.95, 2.35 + Math.sin(lockT * 5 + i) * 0.05, Math.cos(a) * 0.95);
      }
      lockInfo.visible = true;
      lockInfo.x = lockPos.x / TILE;
      lockInfo.z = lockPos.z / TILE;
    } else {
      lock.visible = false;
      lockInfo.visible = false;
    }
  }

  function counts() {
    return {
      rings: rings.filter((r) => r.life > 0).length,
      ghosts: ghosts.filter((g) => g.life > 0).length,
      spin: spin.visible, column: column.visible, columnPhase: colSt.phase, columnOpacity: +column.material.opacity.toFixed(3),
      pool: { rings: rings.length, ghosts: ghosts.length }
    };
  }

  return { root, trigger, update, counts, getLock: () => ({ ...lockInfo, rotation: +lockRing.rotation.z.toFixed(3) }) };
}
