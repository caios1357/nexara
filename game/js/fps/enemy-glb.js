/**
 * NEXARA M3D — VILÕES GLB (KayKit Skeletons, CC0) dentro do bot procedural (que fica como fallback
 * e mantém barras/anel/telegraph). 4 modelos → 10 tipos (arquétipo + variante → modelo + tinta + brilho).
 * Clipes do rig KayKit compartilhado (vêm do hero-knight.glb). Esqueleto próprio por instância
 * (SkeletonUtils.clone); materiais clonados por instância mas com os MESMOS parâmetros → o three
 * reaproveita o programa (sem recompilar) — e os bots continuam no pool do renderer.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { loadModel, getLoaded, cloneSkinned, fitHeight, createAnimator, findNode } from './model-lib.js?v=20261023glb2';

export const ARCH_MODEL = { A: 'vilao-warrior', A2: 'vilao-warrior', B: 'vilao-rogue', B2: 'vilao-rogue', C: 'vilao-mage', C2: 'vilao-mage', D: 'vilao-warrior', E: 'vilao-mage', F: 'vilao-warrior', G: 'vilao-warrior', patrol: 'vilao-minion', base: 'vilao-minion' };
const CLIPS = {
  idle: 'Idle', walk: 'Walking_A', run: 'Running_A',
  melee: '1H_Melee_Attack_Chop', slam: '2H_Melee_Attack_Chop', shot: 'Spellcast_Shoot', cast: 'Spellcast_Raise',
  lunge: '1H_Melee_Attack_Stab', hurt: 'Hit_A', stun: 'Hit_B', death: 'Death_A'
};
const stats = { attached: 0, ready: 0, failed: 0, byModel: {}, weapons: 0, monsters: 0, byKey: {} };
/**
 * VIL — VILÕES NOVOS (Quaternius, CC0 — ver assets/models/LICENSES.md): cada arquétipo ganha silhueta própria
 * (bruto, predador, enxame, mutante, robô, voador…) com clipes PRÓPRIOS do modelo. Combate/hitbox/IA não mudam:
 * o GLB continua sendo só o visual dentro do bot procedural. ?vil=0 (ou graphics.villainModels=false) volta ao KayKit.
 * h = altura no espaço do bot; lift = flutua (voadores); tint = quanto puxa da cor do arquétipo (legibilidade).
 */
const BIPED = { idle: 'Idle', walk: 'Walk', run: 'Run', melee: 'Punch', slam: 'Weapon', shot: 'Weapon', cast: 'Weapon', lunge: 'Punch', hurt: 'HitReact', stun: 'HitReact', death: 'Death' };
export const MON = {
  A: { model: 'mon-esqueleto', h: 1.8, tint: 0.18, clips: { ...BIPED, melee: 'Sword', slam: 'Sword', shot: 'Punch', cast: 'Punch', lunge: 'Sword' } },
  A2: { model: 'mon-demonio', h: 1.85, tint: 0.3, clips: BIPED },
  B: { model: 'mon-caveira', h: 1.05, lift: 0.55, tint: 0.35, clips: { idle: 'Flying_Idle', walk: 'Flying_Idle', run: 'Fast_Flying', melee: 'Headbutt', slam: 'Punch', shot: 'Punch', cast: 'Punch', lunge: 'Headbutt', hurt: 'HitReact', stun: 'HitReact', death: 'Death' } },
  B2: { model: 'mon-lobo', h: 1.3, tint: 0.3, clips: { idle: 'Idle', walk: 'Walk', run: 'Gallop', melee: 'Attack', slam: 'Attack', shot: 'Attack', cast: 'Attack', lunge: 'Gallop_Jump', hurt: 'Idle_HitReact_Left', stun: 'Idle_HitReact_Right', death: 'Death' } },
  C: { model: 'mon-robo', h: 1.6, tint: 0.35, clips: { idle: 'Idle', walk: 'Walk', run: 'Run', melee: 'Attack', slam: 'Attack', shot: 'Shoot', cast: 'Shoot', lunge: 'Attack', hurt: 'Idle', stun: 'Idle', death: 'Death' } },
  C2: { model: 'mon-drone', h: 0.95, lift: 0.75, tint: 0.4, clips: { idle: 'Idle', walk: 'Walk', run: 'Run', melee: 'Attack', slam: 'Attack', shot: 'Shoot', cast: 'Shoot', lunge: 'Attack', hurt: 'Idle', stun: 'Idle', death: 'Dead' } },
  D: { model: 'mon-yeti', h: 1.85, tint: 0.4, clips: BIPED },
  E: { model: 'mon-zumbi', h: 1.8, tint: 0.12, clips: { ...BIPED, run: 'Run_Arms', slam: 'Idle_Attack', shot: 'Punch', cast: 'Idle_Attack', lunge: 'Run_Attack' } },
  F: { model: 'mon-demonio-azul', h: 1.85, tint: 0.45, clips: BIPED },
  G: { model: 'mon-orc', h: 1.9, tint: 0.3, clips: BIPED }
};
function villainModelsOn() {
  try { if (/[?&]vil=0\b/.test(location.search)) return false; } catch { /* sem URL */ }
  return globalThis.__NEXARA_VIL_OFF__ !== true;
}
/** Contorno (rim) barato: fresnel somado à emissão — 1 programa extra por tipo de material, compartilhado. */
function addRim(mat, color, k) {
  mat.userData.rimColor = { value: new THREE.Color(color).multiplyScalar(k) };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.rimColor = mat.userData.rimColor;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 rimColor;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n{ float rimF = 1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0); totalEmissiveRadiance += rimColor * rimF * rimF * rimF; }');
  };
  mat.customProgramCacheKey = () => 'vilRim';
}
/** ARMAS dos vilões GLB (props KayKit nas mãos) — substituem as lâminas/canhões/escudos do bot procedural. */
export const ARCH_WEAPONS = { A: ['1H_Sword', 'Round_Shield'], A2: ['2H_Sword'], B: ['Knife', 'Knife_Offhand'], B2: ['Knife', 'Knife_Offhand'], C: ['2H_Staff'], C2: ['1H_Wand'], D: ['1H_Axe', 'Spike_Shield'], E: ['1H_Wand'], F: ['2H_Axe'], G: ['2H_Sword', 'Badge_Shield'], patrol: ['1H_Crossbow'], base: ['1H_Axe'] };
let weaponMat = null;
function propMesh(props, name) {
  let src = null;
  props.scene.traverse((o) => { if (!src && o.isMesh && o.name.replace(/^(Knight|Rogue_Hooded|Mage|Barbarian)/, '') === name) src = o; });
  return src;
}
function attachEnemyWeapons(model, key, props, glow) {
  const list = ARCH_WEAPONS[key] || ARCH_WEAPONS.base;
  if (!weaponMat) weaponMat = new THREE.MeshStandardMaterial({ color: 0x5a5f68, metalness: 0.75, roughness: 0.35, emissive: new THREE.Color(0x401010), emissiveIntensity: 0.4 });
  let n = 0;
  list.forEach((name, i) => {
    const src = propMesh(props, name);
    const slot = findNode(model, i === 0 ? 'handslotr' : 'handslotl');
    if (!src || !slot) return;
    const w = new THREE.Mesh(src.geometry, weaponMat); // geometria e material COMPARTILHADOS (sem custo por instância)
    w.position.copy(src.position); w.quaternion.copy(src.quaternion); w.scale.copy(src.scale);
    w.name = `enemyWeapon_${name}`; w.castShadow = true;
    slot.add(w); n++;
  });
  void glow;
  stats.weapons += n;
  return n;
}
export function getEnemyGlbStats() { return JSON.parse(JSON.stringify(stats)); }

/**
 * @param {THREE.Group} g bot procedural
 * @param {{ key: string, look: { body:number, armor:number, eye:number, glow:number } | null, height?: number, bodyMeshes: THREE.Object3D[] }} o
 */
/**
 * 20261023 — DEMÔNIO VERMELHO da arte do Caio (arte-caio/demonio-vermelho-folha.png): corpo carmim, placas pretas com veios vermelhos,
 * olhos rosa-vermelho, CHIFRES grandes curvos pretos com anel aceso, ASAS de morcego vermelhas e CAUDA com ponta de flecha.
 * Só visual (hitbox/IA iguais). Peças presas nos ossos (Head/Torso/Hips) com escala compensada → seguem a animação.
 */
const _demon = {};
function demonMats() {
  if (_demon.ready) return _demon;
  _demon.horn = new THREE.MeshStandardMaterial({ color: 0x141016, roughness: 0.45, metalness: 0.4, emissive: 0x2a0408, emissiveIntensity: 1 });
  _demon.glow = new THREE.MeshBasicMaterial({ color: 0xff2a3a });
  _demon.wing = new THREE.MeshStandardMaterial({ color: 0x9a1a24, roughness: 0.7, metalness: 0.05, side: THREE.DoubleSide, emissive: 0x3a0408, emissiveIntensity: 1 });
  _demon.tail = new THREE.MeshStandardMaterial({ color: 0x7a1420, roughness: 0.6, metalness: 0.1 });
  for (const m of [_demon.horn, _demon.glow, _demon.wing, _demon.tail]) m.userData.shared = true;
  _demon.ready = true; return _demon;
}
/** junta as peças de um grupo por material (1 draw call por material) — celular */
function mergeByMat(g) {
  g.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(g.matrixWorld).invert(); const by = new Map();
  g.traverse((o) => { if (!o.isMesh) return; const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k); geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld)); (by.get(o.material) || by.set(o.material, []).get(o.material)).push(geo); });
  for (const c of [...g.children]) g.remove(c);
  for (const [mat, list] of by) { const m = new THREE.Mesh(mergeGeometries(list, false), mat); m.castShadow = true; g.add(m); }
}
function demonArt(model, mats, eyeMats) {
  const D = demonMats();
  for (const m of mats) { const nm = m.name || ''; if (/Black/i.test(nm)) { m.color.set(0x1a1218); m.emissive.set(0xff1a2a); m.emissiveIntensity = 0.12; } else { if (m.map) m.color.set(0xd04a58); else m.color.set(0x8e1a2a); m.emissive.set(0x3a0610); m.emissiveIntensity = 0.35; } m.needsUpdate = true; }
  for (const m of eyeMats) { m.color.set(0xff3a6a); m.emissive.set(0xff2a5a); }
  model.updateMatrixWorld(true);
  const bone = (n) => { let b = null; model.traverse((q) => { if (!b && q.isBone && q.name === n) b = q; }); return b; };
  const pin = (b, grp) => { const ws = b.getWorldScale(new THREE.Vector3()); grp.scale.setScalar(1 / (ws.x || 1)); b.add(grp); return grp; };
  const head = bone('Head'); const torso = bone('Torso'); const hips = bone('Hips');
  if (head) { // chifres GRANDES curvos pretos (3 gomos de cone, abrindo para fora e para cima) + anel aceso na base
    const g = pin(head, new THREE.Group()); g.name = 'demonHorns';
    for (const sd of [-1, 1]) {
      const base = new THREE.Group(); base.position.set(sd * 0.12, 0.12, 0.0); base.rotation.z = -sd * 1.0; g.add(base);
      let par = base; const segs = [[0.075, 0.16], [0.06, 0.15], [0.045, 0.15]];
      segs.forEach(([r, l], i) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r, l, 7), D.horn); c.position.y = l / 2; par.add(c); const nx = new THREE.Group(); nx.position.y = l; nx.rotation.z = sd * 0.55; par.add(nx); par = nx; if (i === 0) { const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.95, 0.011, 4, 12), D.glow); ring.rotation.x = Math.PI / 2; ring.position.y = l * 0.65; c.parent.add(ring); } });
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.16, 7), D.horn); tip.position.y = 0.08; par.add(tip);
    }
  }
  if (torso) { // asas de morcego (membrana em leque com dedos)
    const g = pin(torso, new THREE.Group()); g.name = 'demonWings'; g.scale.multiplyScalar(1.5);
    for (const sd of [-1, 1]) {
      const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(0.55, 0.32); sh.lineTo(0.62, -0.02); sh.lineTo(0.48, -0.12); sh.lineTo(0.38, -0.02); sh.lineTo(0.26, -0.14); sh.lineTo(0.16, -0.04); sh.lineTo(0.05, -0.12); sh.lineTo(0, 0);
      const w = new THREE.Mesh(new THREE.ShapeGeometry(sh), D.wing); w.scale.set(sd, 1, 1); w.position.set(sd * 0.08, 0.18, -0.16); w.rotation.y = sd * -0.5; g.add(w);
      const bone2 = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.018, 0.64, 5), D.wing); bone2.position.set(sd * 0.34, 0.33, -0.2); bone2.rotation.z = -sd * 1.03; bone2.rotation.y = sd * -0.5; g.add(bone2);
    }
  }
  if (hips) { // cauda segmentada com ponta de flecha
    const g = pin(hips, new THREE.Group()); g.name = 'demonTail';
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, -0.12), new THREE.Vector3(0, -0.12, -0.4), new THREE.Vector3(0, -0.05, -0.7), new THREE.Vector3(0, 0.15, -0.9)]);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 10, 0.035, 5, false), D.tail));
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.18, 4), D.tail); tip.position.set(0, 0.22, -0.95); tip.rotation.x = -0.6; tip.scale.set(1, 1, 0.35); g.add(tip);
  }
  for (const n of ['demonHorns', 'demonWings', 'demonTail']) { const gg = model.getObjectByName(n); if (gg) mergeByMat(gg); }
}

export function attachEnemyGlb(g, o) {
  const mon = villainModelsOn() ? MON[o.key] || null : null;
  const modelName = mon ? mon.model : ARCH_MODEL[o.key] || 'vilao-minion';
  const ctl = { status: 'loading', model: modelName, anim: 'idle', clip: null, changes: 0 };
  let animator = null;
  let mats = [];
  let eyeMats = [];
  let look = 'base';
  stats.attached++;
  stats.byModel[modelName] = (stats.byModel[modelName] || 0) + 1;
  stats.byKey[o.key] = modelName;
  function setup(anim, body) {
    if (!anim || !body) { ctl.status = 'fallback'; stats.failed++; return; }
    const model = cloneSkinned(body.scene);
    const holder = new THREE.Group();
    holder.name = 'enemyGlb';
    holder.add(model);
    // o bot procedural tem ~1.8 de altura no espaço local (escala do arquétipo aplicada no grupo)
    fitHeight(model, mon ? mon.h : o.height || 1.75);
    const L = o.look || { body: 0x8a4540, armor: 0xc07060, eye: 0xff3a2a, glow: 0xff4a2a };
    if (mon) {
      if (mon.lift) holder.position.y = mon.lift;
      model.traverse((m) => {
        if (!m.isMesh) return;
        const list = Array.isArray(m.material) ? m.material : [m.material];
        const out = list.map((src) => {
          const nm = src.name || '';
          const mat = new THREE.MeshStandardMaterial({ color: src.color.clone(), map: src.map || null, roughness: 0.62, metalness: /Edge|Main2|Dark|Straps|Wood/i.test(nm) ? 0.45 : 0.08 });
          mat.name = nm;
          if (/^Eye$|Eye_Black|Eyes_Black/i.test(nm)) {
            mat.color.set(L.eye); mat.emissive = new THREE.Color(L.eye); mat.emissiveIntensity = 2.2; eyeMats.push(mat);
          } else if (/Eye_White/i.test(nm)) {
            mat.color.set(0x15161a); mat.roughness = 0.3;
          } else {
            // cor original do monstro + um pouco da cor do arquétipo (leitura à distância) — atlas: tinta multiplicada leve
            const t = new THREE.Color(/Secondary|Light|Edge|Straps/i.test(nm) ? L.armor : L.body);
            if (mat.map) mat.color.set(0xffffff).lerp(t, mon.tint * 0.6); else mat.color.lerp(t, mon.tint);
            mat.emissive = new THREE.Color(L.glow); mat.emissiveIntensity = 0.06;
            addRim(mat, L.glow, mat.map ? 0.16 : 0.3);
            mats.push(mat);
          }
          return mat;
        });
        m.material = Array.isArray(m.material) ? out : out[0];
        m.castShadow = true;
      });
      stats.monsters++;
    } else model.traverse((m) => {
      if (!m.isMesh) return;
      const isEye = /Eyes/i.test(m.name);
      const mat = m.material.clone();
      if (isEye) {
        mat.color.set(L.eye); mat.emissive = new THREE.Color(L.eye); mat.emissiveIntensity = 2.2; mat.map = null;
        eyeMats.push(mat);
      } else {
        mat.color.set(0xffffff).lerp(new THREE.Color(/Helmet|Cloak|Body/.test(m.name) ? L.armor : L.body), 0.55);
        mat.emissive = new THREE.Color(L.glow); mat.emissiveIntensity = 0.06;
        mat.metalness = 0.35; mat.roughness = 0.55;
        mats.push(mat);
      }
      m.material = mat;
      m.castShadow = true;
    });
    if (mon && o.key === 'A2' && !/[?&]demonioArte=0\b/.test(location.search)) { try { demonArt(model, mats, eyeMats); ctl.demonArt = true; } catch (e) { console.warn('[demônio] arte', e); } }
    animator = createAnimator(model, mon ? body.animations : anim.animations, mon ? mon.clips : CLIPS);
    const pr = mon ? null : getLoaded('hero-props');
    if (mon) { /* armas/garras já vêm no modelo */ } else
    if (pr) ctl.weapons = attachEnemyWeapons(model, o.key, pr, L.glow);
    else loadModel('hero-props').then((p2) => { if (p2) ctl.weapons = attachEnemyWeapons(model, o.key, p2, L.glow); }).catch(() => {});
    for (const b of o.bodyMeshes) b.visible = false;
    g.add(holder);
    ctl.status = 'ready';
    stats.ready++;
  }
  const animSrc = mon ? modelName : 'hero-knight';
  const a0 = getLoaded(animSrc); const b0 = getLoaded(modelName);
  if (a0 && b0) setup(a0, b0);
  else Promise.all([loadModel(animSrc), loadModel(modelName)]).then(([anim, body]) => setup(anim, body)).catch(() => { ctl.status = 'fallback'; stats.failed++; });

  const kindClip = (kind) => (kind === 'shot' || kind === 'hazard' ? (kind === 'shot' ? 'shot' : 'cast') : kind === 'slam' || kind === 'nova' || kind === 'roar' ? 'slam' : kind === 'lunge' || kind === 'charge' ? 'lunge' : 'melee');
  /**
   * @param {number} dt
   * @param {{ speed:number, phase:'idle'|'prepare'|'attack'|'recovery'|'stun'|'hurt', p:number, kind?:string }} v
   */
  ctl.update = (dt, v) => {
    if (!animator) return;
    let pose = null; let poseT = 0;
    if (v.phase === 'prepare' || v.phase === 'attack' || v.phase === 'recovery') {
      pose = kindClip(v.kind);
      poseT = v.phase === 'prepare' ? 0.35 * v.p : v.phase === 'attack' ? 0.35 + 0.25 * v.p : 0.6 + 0.4 * v.p;
    } else if (v.phase === 'stun') { pose = 'stun'; poseT = 0.3 + 0.2 * Math.sin(v.p * 6); }
    const sp = Math.max(0, v.speed || 0);
    const moveK = Math.min(1, sp / 0.6);
    const runK = Math.max(0, Math.min(1, (sp - 0.7) / 0.8));
    animator.update(dt, { pose, poseT, loco: { idle: 1 - moveK, walk: moveK * (1 - runK), run: moveK * runK }, locoRate: 0.8 + Math.min(0.8, sp * 0.4) });
    ctl.anim = animator.state; ctl.clip = animator.clipOf(animator.state); ctl.changes = animator.changes;
  };
  ctl.setLook = (lk) => {
    if (lk === look || !mats.length) { look = lk; return; }
    look = lk;
    const L = o.look || { eye: 0xff3a2a, glow: 0xff4a2a };
    for (const m of mats) {
      if (lk === 'flash') { m.emissive.set(0xffb08a); m.emissiveIntensity = 0.9; }
      else if (lk === 'danger') { m.emissive.set(0xff2010); m.emissiveIntensity = 0.32; }
      else if (lk === 'dim') { m.emissive.set(L.glow); m.emissiveIntensity = 0.0; }
      else { m.emissive.set(L.glow); m.emissiveIntensity = lk === 'alert' ? 0.14 : 0.06; }
    }
    for (const m of eyeMats) { m.emissiveIntensity = lk === 'danger' ? 4 : lk === 'dim' ? 0.4 : 2.2; m.emissive.set(lk === 'danger' ? 0xff1a10 : lk === 'alert' ? 0xffc030 : L.eye); }
  };
  ctl.reset = () => { look = ''; ctl.setLook('base'); };
  return ctl;
}
