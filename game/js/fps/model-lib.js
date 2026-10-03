/**
 * NEXARA M3D — biblioteca de modelos GLB (CC0, ver assets/models/LICENSES.md).
 * Carregamento preguiçoso + cache (1 download por arquivo), MeshoptDecoder, clones com esqueleto
 * próprio (SkeletonUtils.clone) e clipes compartilhados (todos os KayKit usam o mesmo rig "Rig_Medium").
 * Falha de rede/decodificação → promessa resolve null e o chamador fica no modelo procedural (fallback).
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';

const BASE = new URL('../../../assets/models/', import.meta.url).href;
const cache = new Map();
const ready = new Map();
const stats = { requested: [], loaded: [], failed: [], ms: {}, disabled: false };
let loader = null;

/** ?models=0 desliga os GLB (fallback procedural) — útil para medir/comparar. */
let presetOff = false;
const urlModels = () => { try { return new URLSearchParams(location.search).get('models'); } catch { return null; } };
export function modelsEnabled() {
  let q = null;
  try { q = new URLSearchParams(location.search).get('models'); } catch { /* sem URL */ }
  if (q === '0') return false;
  if (q === '1') return true; // força GLB mesmo no preset que usa o procedural
  return !presetOff;
}
/** Preset gráfico sem modelos (tiers.X.models === false): mantém o procedural (desempenho primeiro). */
export function setPresetModels(on) { presetOff = !on; stats.presetOff = presetOff; }
stats.disabled = !modelsEnabled();

export function loadModel(name, force = false) {
  if (!modelsEnabled() && !(force && urlModels() !== '0')) return Promise.resolve(null);
  if (cache.has(name)) return cache.get(name);
  if (!loader) { loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder); }
  const t0 = performance.now();
  stats.requested.push(name);
  const p = loader.loadAsync(`${BASE}${name}.glb`).then((g) => {
    stats.loaded.push(name); stats.ms[name] = Math.round(performance.now() - t0);
    ready.set(name, g);
    g.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = !o.isSkinnedMesh; } });
    return g;
  }).catch((e) => { stats.failed.push(`${name}: ${e?.message || e}`); console.warn('[models] falhou', name, e?.message || e); return null; });
  cache.set(name, p);
  return p;
}
/** GLB já decodificado (síncrono) — monta o modelo NA HORA (entra no pré-compile da zona, sem troca depois). */
export function getLoaded(name, force = false) { return modelsEnabled() || (force && urlModels() !== '0') ? ready.get(name) || null : null; }
export function getModelStats() { return JSON.parse(JSON.stringify(stats)); }

/** Clone independente (esqueleto próprio) de uma cena glTF. */
export function cloneSkinned(scene) { return skClone(scene); }

/** Procura um osso/nó pelo nome (o GLTFLoader tira os pontos: "handslot.r" → "handslotr"). */
export function findNode(root, ...names) {
  const want = names.map((n) => n.replace(/[.\s]/g, '').toLowerCase());
  let hit = null;
  root.traverse((o) => { if (!hit && want.includes(o.name.replace(/[.\s]/g, '').toLowerCase())) hit = o; });
  return hit;
}

/** Normaliza: pés no chão (y=0), altura `h`. Devolve o fator de escala. */
export function fitHeight(obj, h, { center = false } = {}) {
  obj.updateMatrixWorld(true);
  // malhas com esqueleto: caixa com a pose ATUAL dos ossos (o clipe pode mudar escala/posição do Root)
  obj.traverse((o) => { if (o.isSkinnedMesh) { o.skeleton.update(); o.computeBoundingBox(); o.computeBoundingSphere(); } });
  const box = new THREE.Box3().setFromObject(obj, true);
  const size = box.getSize(new THREE.Vector3());
  const k = h / Math.max(0.001, size.y);
  obj.scale.multiplyScalar(k);
  obj.position.y -= box.min.y * k;
  if (center) { const c = box.getCenter(new THREE.Vector3()); obj.position.x -= c.x * k; obj.position.z -= c.z * k; if (center === 'xyz') obj.position.y -= h / 2; }
  return k;
}

/**
 * Animador simples por estado: locomoção (idle/walk/run) misturada por peso + 1 camada "pose"
 * com tempo controlado pelo jogo (golpes sincronizados com STARTUP/ACTIVE/RECOVERY) e cross-fade.
 */
export function createAnimator(root, clips, map) {
  const mixer = new THREE.AnimationMixer(root);
  const byName = new Map(clips.map((c) => [c.name, c]));
  const actions = {};
  for (const [state, clipName] of Object.entries(map)) {
    const c = byName.get(clipName);
    if (!c) continue;
    const a = mixer.clipAction(c);
    a.enabled = true; a.setEffectiveWeight(0); a.play();
    actions[state] = { a, dur: c.duration, clip: clipName };
  }
  const w = {};
  for (const k of Object.keys(actions)) w[k] = 0;
  let current = 'idle';
  let poseState = null;
  let changes = 0;
  /**
   * @param {number} dt
   * @param {{ loco?: {idle:number, walk:number, run:number}, locoRate?: number, pose?: string|null, poseT?: number, fade?: number }} s
   */
  function update(dt, s) {
    const fade = s.fade ?? 0.12;
    const k = Math.min(1, dt / Math.max(0.001, fade));
    const pose = s.pose && actions[s.pose] ? s.pose : null;
    const target = {};
    for (const key of Object.keys(actions)) target[key] = 0;
    if (pose) target[pose] = 1;
    else if (s.loco) for (const [key, v] of Object.entries(s.loco)) if (actions[key]) target[key] = v;
    for (const key of Object.keys(actions)) {
      w[key] += (target[key] - w[key]) * k;
      if (w[key] < 0.002) w[key] = 0;
      actions[key].a.setEffectiveWeight(w[key]);
    }
    if (pose) {
      const ac = actions[pose];
      ac.a.timeScale = 0;
      ac.a.time = Math.max(0, Math.min(0.999, s.poseT ?? 0)) * ac.dur;
    }
    if (pose !== poseState) { poseState = pose; changes++; }
    for (const key of ['idle', 'walk', 'run']) if (actions[key]) actions[key].a.timeScale = key === 'idle' ? 1 : (s.locoRate ?? 1);
    const top = pose || Object.entries(target).sort((a, b) => b[1] - a[1])[0]?.[0] || 'idle';
    current = top;
    mixer.update(dt);
  }
  return { mixer, update, actions, get state() { return current; }, get changes() { return changes; }, clipOf: (st) => actions[st]?.clip || null };
}
