/**
 * NEXARA — DRAGON BERÇO · prévia 3D dos dragões (filhotes e gigantes). Contexto WebGL PRÓPRIO, criado só enquanto a tela está aberta
 * (dispose ao fechar), no estilo do hero-preview. Usa os MESMOS modelos GLB do jogo (mini-dragon / boss-dragon) com a paleta de cada dragão.
 * Falha de carregamento → o gigante cai no procedural (boss-dragon-view); o filhote avisa "modelo indisponível".
 */
import * as THREE from 'three';
import { attachDragonGlb } from './dragon-glb.js?v=20261009espada';
import { createBossDragon } from './boss-dragon-view.js?v=20261009espada';

const hexNum = (h) => parseInt(String(h || '#ffffff').replace('#', ''), 16) || 0xffffff;

export function createDragonPreview(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x141a28, 1.7));
  const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(3, 5, 4); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 1.6); rim.position.set(-4, 2, -3); scene.add(rim);
  scene.add(new THREE.AmbientLight(0xffffff, 0.4));
  const floor = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ color: 0x39f0ff, transparent: true, opacity: 0.2, depthWrite: false }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.01; scene.add(floor);
  const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 120);
  const root = new THREE.Group(); scene.add(root);
  let item = null; let H = 1.05; let dist = 3.2; let alive = true; let raf = 0; let last = performance.now(); let spin = 0.6; let autoSpin = 0.5; let touched = false;
  const info = { id: null, kind: null, status: 'vazio', height: 0, meshes: 0 };
  function placeCam() { cam.position.set(0, H * 0.62 + 0.2, dist); cam.lookAt(0, H * 0.45, 0); }
  function clearItem() {
    if (!item) return; root.remove(item.holder);
    item.holder.traverse((o) => { if (o.isMesh) { o.geometry?.dispose?.(); const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach((m) => { if (!m?.userData?.shared) m?.dispose?.(); }); } });
    item = null;
  }
  /** mostra um dragão: { id, kind:'bb'|'boss', height (m), cor:{base,escuro,brilho} } */
  function show(d) {
    clearItem();
    const kind = d.kind === 'boss' ? 'boss' : 'mini';
    H = Math.max(0.6, d.height || (kind === 'boss' ? 6.4 : 1.05));
    dist = kind === 'boss' ? H * 2.35 + 3 : 3.4; floor.scale.setScalar(kind === 'boss' ? H * 0.42 : 0.8); placeCam();
    const holder = new THREE.Group(); root.add(holder);
    const proc = new THREE.Group(); holder.add(proc);
    const palette = { base: hexNum(d.cor?.base), dark: hexNum(d.cor?.escuro), glow: hexNum(d.cor?.brilho) };
    floor.material.color.setHex(palette.glow);
    info.id = d.id; info.kind = d.kind; info.status = 'carregando'; info.height = H;
    const ctl = attachDragonGlb(holder, proc, kind, { height: kind === 'boss' ? H * 0.97 : H, palette, preview: true, onReady: () => { info.status = 'pronto'; } });
    item = { holder, ctl, kind, palette };
    const t0 = performance.now();
    const chk = setInterval(() => {
      if (!alive || item?.holder !== holder) { clearInterval(chk); return; }
      if (ctl.status === 'fallback') {
        clearInterval(chk);
        if (kind === 'boss') { const v = createBossDragon({ height: H }); holder.add(v.root); item.view = v; info.status = 'procedural'; } else info.status = 'indisponivel';
      } else if (ctl.status === 'ready') { info.status = 'pronto'; clearInterval(chk); }
      else if (performance.now() - t0 > 12000) clearInterval(chk);
    }, 120);
  }
  const ptrs = new Map();
  canvas.style.touchAction = 'none';
  const onDown = (e) => { ptrs.set(e.pointerId, e.clientX); canvas.setPointerCapture?.(e.pointerId); };
  const onMove = (e) => { if (!ptrs.has(e.pointerId)) return; spin += (e.clientX - ptrs.get(e.pointerId)) * 0.012; ptrs.set(e.pointerId, e.clientX); touched = true; autoSpin = 0; e.preventDefault(); };
  const onUp = (e) => { ptrs.delete(e.pointerId); };
  canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointermove', onMove); canvas.addEventListener('pointerup', onUp); canvas.addEventListener('pointercancel', onUp);
  function size() { const w = canvas.clientWidth || 300; const h = canvas.clientHeight || 260; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
  function frame(now) {
    if (!alive) return;
    if (!canvas.isConnected) { api.dispose(); return; }
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (canvas.width !== Math.round((canvas.clientWidth || 300) * renderer.getPixelRatio()) || canvas.height !== Math.round((canvas.clientHeight || 260) * renderer.getPixelRatio())) size();
    spin += autoSpin * dt; root.rotation.y = spin;
    if (item?.ctl?.status === 'ready') item.ctl.update(dt, { state: 'IDLE', progress: 0, speed: 0, charge: 0.1 });
    info.meshes = item?.ctl?.glbMeshes?.() || 0;
    renderer.render(scene, cam);
  }
  size(); placeCam(); raf = requestAnimationFrame(frame);
  const api = {
    show, info: () => ({ ...info, yaw: +(((root.rotation.y % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)).toFixed(3), touched, palette: item?.palette || null }),
    dispose() {
      if (!alive) return; alive = false; cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointermove', onMove); canvas.removeEventListener('pointerup', onUp); canvas.removeEventListener('pointercancel', onUp);
      clearItem(); renderer.dispose(); renderer.forceContextLoss?.();
    }
  };
  return api;
}
