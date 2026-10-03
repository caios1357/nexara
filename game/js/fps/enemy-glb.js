/**
 * NEXARA M3D — VILÕES GLB (KayKit Skeletons, CC0) dentro do bot procedural (que fica como fallback
 * e mantém barras/anel/telegraph). 4 modelos → 10 tipos (arquétipo + variante → modelo + tinta + brilho).
 * Clipes do rig KayKit compartilhado (vêm do hero-knight.glb). Esqueleto próprio por instância
 * (SkeletonUtils.clone); materiais clonados por instância mas com os MESMOS parâmetros → o three
 * reaproveita o programa (sem recompilar) — e os bots continuam no pool do renderer.
 */
import * as THREE from 'three';
import { loadModel, getLoaded, cloneSkinned, fitHeight, createAnimator, findNode } from './model-lib.js?v=20261003arena';

export const ARCH_MODEL = { A: 'vilao-warrior', A2: 'vilao-warrior', B: 'vilao-rogue', B2: 'vilao-rogue', C: 'vilao-mage', C2: 'vilao-mage', D: 'vilao-warrior', E: 'vilao-mage', F: 'vilao-warrior', G: 'vilao-warrior', patrol: 'vilao-minion', base: 'vilao-minion' };
const CLIPS = {
  idle: 'Idle', walk: 'Walking_A', run: 'Running_A',
  melee: '1H_Melee_Attack_Chop', slam: '2H_Melee_Attack_Chop', shot: 'Spellcast_Shoot', cast: 'Spellcast_Raise',
  lunge: '1H_Melee_Attack_Stab', hurt: 'Hit_A', stun: 'Hit_B', death: 'Death_A'
};
const stats = { attached: 0, ready: 0, failed: 0, byModel: {}, weapons: 0 };
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
export function attachEnemyGlb(g, o) {
  const modelName = ARCH_MODEL[o.key] || 'vilao-minion';
  const ctl = { status: 'loading', model: modelName, anim: 'idle', clip: null, changes: 0 };
  let animator = null;
  let mats = [];
  let eyeMats = [];
  let look = 'base';
  stats.attached++;
  stats.byModel[modelName] = (stats.byModel[modelName] || 0) + 1;
  function setup(anim, body) {
    if (!anim || !body) { ctl.status = 'fallback'; stats.failed++; return; }
    const model = cloneSkinned(body.scene);
    const holder = new THREE.Group();
    holder.name = 'enemyGlb';
    holder.add(model);
    // o bot procedural tem ~1.8 de altura no espaço local (escala do arquétipo aplicada no grupo)
    fitHeight(model, o.height || 1.75);
    const L = o.look || { body: 0x8a4540, armor: 0xc07060, eye: 0xff3a2a, glow: 0xff4a2a };
    model.traverse((m) => {
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
    animator = createAnimator(model, anim.animations, CLIPS);
    const pr = getLoaded('hero-props');
    if (pr) ctl.weapons = attachEnemyWeapons(model, o.key, pr, L.glow);
    else loadModel('hero-props').then((p2) => { if (p2) ctl.weapons = attachEnemyWeapons(model, o.key, p2, L.glow); }).catch(() => {});
    for (const b of o.bodyMeshes) b.visible = false;
    g.add(holder);
    ctl.status = 'ready';
    stats.ready++;
  }
  const a0 = getLoaded('hero-knight'); const b0 = getLoaded(modelName);
  if (a0 && b0) setup(a0, b0);
  else Promise.all([loadModel('hero-knight'), loadModel(modelName)]).then(([anim, body]) => setup(anim, body)).catch(() => { ctl.status = 'fallback'; stats.failed++; });

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
