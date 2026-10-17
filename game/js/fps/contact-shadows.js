/**
 * NEXARA GRÁFICOS 2 — SOMBRAS DE CONTATO (blob) sob herói, monstros, rivais e dragão montado.
 * Só quando o mapa de sombras está DESLIGADO (presets baixo/médio = celular): 1 InstancedMesh,
 * 1 draw call, blending multiplicativo (escurece o chão, nunca clareia), some com a altura
 * (voo/salto) e ignora o que está invisível. Nada de regra de jogo.
 */
import * as THREE from 'three';

const VS = /* glsl */`
  varying vec2 vUv; varying float vK;
  void main() {
    vUv = uv;
    #ifdef USE_INSTANCING_COLOR
      vK = instanceColor.r;
    #else
      vK = 0.6;
    #endif
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }`;
const FS = /* glsl */`
  varying vec2 vUv; varying float vK;
  void main() {
    float r = length(vUv - 0.5) * 2.0;
    float t = 1.0 - smoothstep(0.15, 1.0, r);
    t = t * t * (3.0 - 2.0 * t);
    gl_FragColor = vec4(vec3(1.0 - vK * t), 1.0);
  }`;

export function createContactShadows(scene, max = 48) {
  const geo = new THREE.PlaneGeometry(2, 2); geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, depthTest: true,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.ZeroFactor, blendDst: THREE.SrcColorFactor,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, fog: false, toneMapped: false
  });
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.name = 'contactShadows';
  mesh.frustumCulled = false; mesh.renderOrder = 1; mesh.count = 0;
  const col = new THREE.Color();
  for (let i = 0; i < max; i++) mesh.setColorAt(i, col.setRGB(0, 0, 0));
  scene.add(mesh);
  const m4 = new THREE.Matrix4(); const q = new THREE.Quaternion(); const p = new THREE.Vector3(); const s = new THREE.Vector3();
  const st = { n: 0, enabled: true, frames: 0, skippedHigh: 0, first: null };
  let n = 0;
  return {
    mesh,
    begin() { n = 0; st.first = null; },
    /** x/z do mundo, gy = chão, h = altura acima do chão, r = raio (m), k = intensidade 0..1 */
    add(x, z, gy, h, r, k = 0.55) {
      if (n >= max) return;
      const hh = Math.max(0, h);
      const fade = 1 - Math.min(1, hh / 4.5);
      if (fade <= 0.04) { st.skippedHigh++; return; }
      const rr = r * (1 + Math.min(1.2, hh * 0.18));
      p.set(x, gy + 0.035, z); s.set(rr, 1, rr * 0.92);
      m4.compose(p, q, s); mesh.setMatrixAt(n, m4);
      mesh.setColorAt(n, col.setRGB(k * fade, 0, 0));
      if (n === 0) st.first = [+x.toFixed(2), +z.toFixed(2), +(k * fade).toFixed(2)];
      n++;
    },
    end(on) {
      st.enabled = !!on;
      mesh.visible = !!on && n > 0;
      mesh.count = on ? n : 0;
      st.n = mesh.count; st.frames++;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
    stats: () => ({ ...st, max }),
    dispose() { scene.remove(mesh); geo.dispose(); mat.dispose(); mesh.dispose?.(); }
  };
}
