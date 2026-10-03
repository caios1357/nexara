/**
 * NEXARA — prévia 3D do herói (escolha de estilo / editor). Contexto WebGL PRÓPRIO, pequeno, criado só
 * enquanto a tela está aberta (dispose ao fechar). Usa o mesmo hero-glb do jogo → o que se vê é o que entra.
 */
import * as THREE from 'three';
import { attachHeroGlb } from './hero-glb.js?v=20261003vil';

export function createHeroPreview(canvas, opts = {}) {
  // opts.interactive (VESTIÁRIO): arrastar = girar · pinça/roda = zoom · começa de FRENTE · luz de estúdio
  const interactive = !!opts.interactive;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0x9fc8ff, 0x101828, interactive ? 1.9 : 1.5));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(2, 4, 3); scene.add(key);
  const rim = new THREE.DirectionalLight(0x39f0ff, 1.6); rim.position.set(-3, 2, -3); scene.add(rim);
  if (interactive) {
    const fill = new THREE.DirectionalLight(0xfff2e0, 1.3); fill.position.set(-2.5, 1.6, 3.5); scene.add(fill);
    const front = new THREE.DirectionalLight(0xffffff, 0.9); front.position.set(0, 1.2, 5); scene.add(front);
    scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  }
  const floor = new THREE.Mesh(new THREE.CircleGeometry(0.9, 32), new THREE.MeshBasicMaterial({ color: 0x39f0ff, transparent: true, opacity: 0.18 }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  const ZMIN = 2.0; const ZMAX = 6.0;
  let dist = interactive ? 4.0 : 4.2;
  function placeCam() {
    const k = (dist - ZMIN) / (ZMAX - ZMIN); // perto → foca o tronco/rosto
    const ty = 0.85 + (1 - k) * 0.35;
    cam.position.set(0, ty + 0.4, dist); cam.lookAt(0, ty, 0);
  }
  placeCam();
  const root = new THREE.Group(); scene.add(root);
  const fake = { root, setProceduralBodyVisible() {} };
  const glb = attachHeroGlb(fake, { styleId: 'cavaleiro', force: true });
  let raf = 0; let last = performance.now(); let t = 0; let alive = true;
  let spin = interactive ? 0 : 0.5;
  let touched = false; // usuário girou: para o balanço automático
  let autoSpin = interactive ? 0.35 : 0; // rad/s até o 1º arraste (modelo "girando" na vitrine)
  /* ── interação: 1 dedo/mouse gira, 2 dedos pinça, roda = zoom ── */
  const ptrs = new Map(); let pinch0 = 0; let dist0 = dist; let drags = 0;
  const onDown = (e) => { ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); canvas.setPointerCapture?.(e.pointerId); if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); dist0 = dist; } };
  const onMove = (e) => {
    const p = ptrs.get(e.pointerId); if (!p) return;
    if (ptrs.size === 1) { spin += (e.clientX - p.x) * 0.012; touched = true; autoSpin = 0; drags++; }
    p.x = e.clientX; p.y = e.clientY;
    if (ptrs.size === 2 && pinch0 > 0) { const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); setZoom(dist0 * (pinch0 / Math.max(10, d))); }
    e.preventDefault();
  };
  const onUp = (e) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch0 = 0; };
  const onWheel = (e) => { e.preventDefault(); setZoom(dist * (e.deltaY > 0 ? 1.1 : 0.9)); };
  function setZoom(d) { dist = Math.max(ZMIN, Math.min(ZMAX, d)); placeCam(); }
  if (interactive) {
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp); canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
  }
  function size() {
    const w = canvas.clientWidth || 200; const h = canvas.clientHeight || 260;
    renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix();
  }
  function frame(now) {
    if (!alive) return;
    if (!canvas.isConnected) { api.dispose(); return; } // tela fechada por outro caminho → libera o contexto
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    if (canvas.width !== Math.round((canvas.clientWidth || 200) * renderer.getPixelRatio()) || canvas.height !== Math.round((canvas.clientHeight || 260) * renderer.getPixelRatio())) size();
    spin += autoSpin * dt;
    root.rotation.y = interactive ? spin : spin + Math.sin(t * 0.6) * 0.5;
    glb.update(dt, { action: null, attacking: false, combo: 0, attackPhase: 'IDLE', attackT: 0, hurtT: 0, moveK: 0, runK: 0, speed: 0, walkSpeed: 2.4, runSpeed: 3.4, yaw: 0, charge: 0.15 + 0.15 * Math.sin(t * 2), time: t });
    renderer.render(scene, cam);
  }
  size();
  raf = requestAnimationFrame(frame);
  const api = {
    set(styleId, custom = {}, equip = {}) { glb.setStyle(styleId, { custom, equip }); },
    info: () => ({ ...glb.info, yaw: +(((root.rotation.y % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)).toFixed(3), zoom: +dist.toFixed(2), touched, drags, autoSpin }),
    /** vista de FRENTE (botão do Vestiário) */
    front() { spin = 0; autoSpin = 0; touched = true; root.rotation.y = 0; },
    setYaw(r) { spin = r; autoSpin = 0; touched = true; },
    zoom: (d) => (d == null ? dist : setZoom(d)),
    dispose() {
      if (!alive) return; alive = false; cancelAnimationFrame(raf);
      if (interactive) { canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointermove', onMove); canvas.removeEventListener('pointerup', onUp); canvas.removeEventListener('pointercancel', onUp); canvas.removeEventListener('wheel', onWheel); }
      renderer.dispose(); renderer.forceContextLoss?.();
    }
  };
  return api;
}

/**
 * RETRATO do HUD sem custo no jogo (presets sem pós-processo): foto do rosto num contexto WebGL
 * PRÓPRIO e temporário (criado → 1 render → descartado), em cache por estilo+cores. O renderer
 * principal só copia o canvas pronto → nenhum shader novo é compilado no contexto do jogo.
 */
const snapCache = new Map();
const snapPending = new Map();
export const portraitKey = (styleId, custom) => `${styleId || 'cavaleiro'}|${JSON.stringify(custom || {})}`;
export const getPortraitSnapshot = (key) => snapCache.get(key) || null;
export function makePortraitSnapshot(styleId, custom = {}, S = 96) {
  const key = portraitKey(styleId, custom);
  if (snapCache.has(key)) return Promise.resolve(snapCache.get(key));
  if (snapPending.has(key)) return snapPending.get(key);
  const job = (async () => {
    const glc = document.createElement('canvas'); glc.width = S; glc.height = S;
    let renderer = null;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: glc, antialias: true, alpha: false, powerPreference: 'low-power' });
      renderer.setPixelRatio(1); renderer.setSize(S, S, false);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.setClearColor(0x0b1322, 1);
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0x9fc8ff, 0x101828, 1.6));
      const keyL = new THREE.DirectionalLight(0xffffff, 2.4); keyL.position.set(1.5, 3, 4); scene.add(keyL);
      const rim = new THREE.DirectionalLight(0x39f0ff, 1.4); rim.position.set(-3, 2, -3); scene.add(rim);
      const root = new THREE.Group(); scene.add(root);
      const glb = attachHeroGlb({ root, setProceduralBodyVisible() {} }, { styleId, custom, force: true });
      const t0 = performance.now();
      while (glb.info.status !== 'ready' && performance.now() - t0 < 4000) await new Promise((r) => setTimeout(r, 60));
      if (glb.info.status !== 'ready') return null;
      const idle = { action: null, attacking: false, combo: 0, attackPhase: 'IDLE', attackT: 0, hurtT: 0, moveK: 0, runK: 0, speed: 0, walkSpeed: 2.4, runSpeed: 3.4, yaw: 0, charge: 0.2, time: 0 };
      for (let i = 0; i < 6; i++) glb.update(0.05, idle);
      root.updateMatrixWorld(true);
      const head = glb.getRig?.()?.model?.getObjectByName('head');
      const hp = new THREE.Vector3(0, 1.5, 0); if (head) head.getWorldPosition(hp);
      const cam = new THREE.PerspectiveCamera(26, 1, 0.05, 30);
      cam.position.set(hp.x, hp.y + 0.22, hp.z + 1.1); cam.lookAt(hp.x, hp.y + 0.16, hp.z);
      renderer.render(scene, cam);
      const out = document.createElement('canvas'); out.width = S; out.height = S;
      out.getContext('2d').drawImage(glc, 0, 0); // mesmo task do render → buffer ainda válido
      snapCache.set(key, out);
      glb.dispose?.();
      return out;
    } catch (e) { console.warn('[retrato] foto 3D indisponível', e); return null; } finally {
      snapPending.delete(key);
      try { renderer?.dispose(); renderer?.forceContextLoss?.(); } catch { /* ok */ }
    }
  })();
  snapPending.set(key, job);
  return job;
}
