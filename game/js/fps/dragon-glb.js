/**
 * NEXARA M3D — DRAGÕES GLB (Quaternius "Dragon", CC0 via Poly Pizza) por cima dos procedurais.
 * Chefe GIGANTE VERDE: verde-escuro + preto, núcleo/veias de Nexa verdes emissivos.
 * Mini-dragão companheiro: azul. Falha de carregamento → procedural continua.
 */
import * as THREE from 'three';
import { loadModel, getLoaded, cloneSkinned, fitHeight, findNode, createAnimator } from './model-lib.js?v=20261003m10e';

export const DRAGON_PRESETS = {
  boss: {
    model: 'boss-dragon', height: 6.2, base: 0x183a1e, dark: 0x0a120c, glow: 0x3aff6a, glowK: 0.22,
    clips: { idle: 'Dragon_Flying', run: 'Dragon_Flying', attack: 'Dragon_Attack', attack2: 'Dragon_Attack2', hurt: 'Dragon_Hit', death: 'Dragon_Death' },
    core: { bone: 'Body', r: 0.32, y: 0.0, z: 0.55 }
  },
  mini: {
    model: 'mini-dragon', height: 1.05, base: 0x2a62c8, dark: 0x0b1a3a, glow: 0x5ab8ff, glowK: 0.18,
    clips: { idle: 'Flying_Idle', run: 'Fast_Flying', attack: 'Headbutt', attack2: 'Punch', hurt: 'HitReact', death: 'Death' },
    core: { bone: 'Torso', r: 0.08, y: 0.0, z: 0.1 }
  }
};
const stats = { boss: 'off', mini: 'off' };
const ctls = {};
let presetDragonsOff = false;
/** preset sem dragões GLB (tiers.X.dragonModels === false) → dragões procedurais; ?dragonModels=1/0 força. */
export function setPresetDragons(on) { presetDragonsOff = !on; }
const dragonsWanted = () => { const q = /[?&]dragonModels=([01])\b/.exec(location.search); return q ? q[1] === '1' : !presetDragonsOff; };
export function getDragonGlbStats() { return { ...stats, boxes: Object.fromEntries(Object.entries(ctls).map(([k, c]) => [k, c.box?.()])), procVisible: Object.fromEntries(Object.entries(ctls).map(([k, c]) => [k, c.status === 'ready' ? c.procVisibleMeshes?.() ?? null : null])), glbMeshes: Object.fromEntries(Object.entries(ctls).map(([k, c]) => [k, c.glbMeshes?.() ?? 0])) }; }

/**
 * @param {THREE.Object3D} parent onde o GLB entra
 * @param {THREE.Object3D} procBody corpo procedural a esconder quando o GLB carregar
 * @param {'boss'|'mini'} kind
 */
export function attachDragonGlb(parent, procBody, kind, opts = {}) {
  const P = DRAGON_PRESETS[kind];
  const ctl = { status: 'loading', anim: 'idle', clip: null, changes: 0, kind };
  stats[kind] = 'loading';
  ctls[kind] = ctl;
  let animator = null;
  const glowMats = [];
  let holder = null;
  function setup(g) {
    if (!g) { ctl.status = 'fallback'; stats[kind] = 'fallback'; return; }
    const model = cloneSkinned(g.scene);
    holder = new THREE.Group();
    holder.name = `dragonGlb_${kind}`;
    holder.add(model);
    if (opts.yaw) model.rotation.y += opts.yaw;
    const base = new THREE.Color(P.base);
    const dark = new THREE.Color(P.dark);
    model.traverse((o) => {
      if (!o.isMesh) return;
      const m = o.material.clone();
      if (/Eye/i.test(o.name)) { m.color.set(P.glow); m.emissive = new THREE.Color(P.glow); m.emissiveIntensity = 3; glowMats.push(m); }
      else {
        // cor original → escurecida para verde/preto (ou azul) mantendo o contraste entre as partes
        const lum = m.color.r * 0.3 + m.color.g * 0.59 + m.color.b * 0.11;
        m.color.copy(dark).lerp(base, Math.min(1, lum * 1.6));
        m.metalness = 0.45; m.roughness = 0.5;
        m.emissive = new THREE.Color(P.glow); m.emissiveIntensity = lum > 0.5 ? P.glowK : P.glowK * 0.25;
        glowMats.push(m);
      }
      o.material = m;
      o.castShadow = true;
    });
    animator = createAnimator(model, g.animations, P.clips);
    // pose do clipe ANTES de medir (o Root dos clipes Quaternius tem escala própria)
    animator.update(0.0001, { loco: { idle: 1 }, fade: 0.00001 });
    fitHeight(model, opts.height || P.height, { center: kind === 'mini' ? 'xyz' : true });
    // núcleo de Nexa (reator) no peito — tamanho em unidades do MUNDO (osso pode ter escala própria)
    const bone = findNode(model, P.core.bone);
    if (bone) {
      holder.updateMatrixWorld(true);
      const ws = bone.getWorldScale(new THREE.Vector3()).x || 1;
      const core = new THREE.Mesh(new THREE.SphereGeometry(P.core.r, 12, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(P.glow).lerp(new THREE.Color(0xffffff), 0.35) }));
      core.scale.setScalar(1 / ws);
      core.position.set(0, P.core.y / ws, P.core.z / ws);
      core.name = 'dragonCore';
      bone.add(core);
    }
    hideProc();
    parent.add(holder);
    ctl.status = 'ready';
    stats[kind] = 'ready';
    opts.onReady?.();
  }
  // FIX (sobreposição GLB + procedural): com o GLB em cache o setup roda SÍNCRONO, antes de a view montar as
  // partes procedurais → elas ficavam visíveis por cima do GLB. Esconde de novo no 1º quadro e sempre que
  // o corpo procedural ganhar/mostrar malhas (checagem barata a cada 30 quadros).
  let procChecks = 0;
  function hideProc() {
    let n = 0;
    procBody.traverse((o) => { if ((o.isMesh || o.isInstancedMesh) && o.visible) { o.visible = false; n++; } });
    ctl.procHidden = (ctl.procHidden || 0) + n;
    return n;
  }
  ctl.procVisibleMeshes = () => { let n = 0; procBody.traverse((o) => { if ((o.isMesh || o.isInstancedMesh) && o.visible) { let p = o; let vis = true; while (p && p !== procBody) { if (!p.visible) { vis = false; break; } p = p.parent; } if (vis) n++; } }); return n; };
  ctl.glbMeshes = () => { let n = 0; holder?.traverse((o) => { if (o.isMesh || o.isSkinnedMesh) n++; }); return n; };
  const g0 = dragonsWanted() ? getLoaded(P.model) : null;
  if (!dragonsWanted()) setup(null);
  else if (g0) setup(g0);
  else loadModel(P.model).then(setup).catch(() => { ctl.status = 'fallback'; stats[kind] = 'fallback'; });

  ctl.box = () => { if (!holder) return null; holder.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(holder); return { min: b.min.toArray().map((x) => +x.toFixed(2)), max: b.max.toArray().map((x) => +x.toFixed(2)), vis: holder.visible, parentVis: !!holder.parent?.visible }; };
  /** @param {{ state?:string, progress?:number, speed?:number, attack?:string, charge?:number, hurt?:number }} v */
  ctl.update = (dt, v) => {
    if (!animator) return;
    if (procChecks++ % 30 === 0) hideProc();
    let pose = null; let poseT = 0;
    const S = v.state || 'IDLE';
    const p = Math.max(0, Math.min(1, v.progress || 0));
    const big = v.attack && v.attack !== 'golpe' && v.attack !== 'cauda';
    if (S === 'ATTACK_PREPARE') { pose = big ? 'attack2' : 'attack'; poseT = 0.4 * p; }
    else if (S === 'ATTACK') { pose = big ? 'attack2' : 'attack'; poseT = 0.4 + 0.3 * p; }
    else if (S === 'RECOVERY') { pose = big ? 'attack2' : 'attack'; poseT = 0.7 + 0.3 * p; }
    else if (S === 'STUN' || (v.hurt || 0) > 0) { pose = 'hurt'; poseT = S === 'STUN' ? 0.3 + 0.2 * Math.sin(p * 6) : 1 - v.hurt; }
    else if (S === 'DEAD') { pose = 'death'; poseT = p; }
    const sp = Math.max(0, v.speed || 0);
    const runK = Math.min(1, sp / 2.5);
    animator.update(dt, { pose, poseT, loco: { idle: 1 - runK, run: runK }, locoRate: 1 + (v.charge || 0) * 0.6 });
    const pulse = 0.75 + 0.25 * Math.sin(performance.now() * 0.004);
    for (const m of glowMats) if (m.userData.k0 === undefined) m.userData.k0 = m.emissiveIntensity;
    for (const m of glowMats) m.emissiveIntensity = m.userData.k0 * pulse * (1 + (v.charge || 0) * 1.5);
    ctl.anim = animator.state; ctl.clip = animator.clipOf(animator.state); ctl.changes = animator.changes;
  };
  return ctl;
}
