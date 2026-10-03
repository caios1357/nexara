/**
 * NEXARA — pós-processamento (Bloco V): EffectComposer + UnrealBloomPass (brilho neon),
 * correção de cor teal/laranja + vinheta (ShaderPass), OutputPass (ACES Filmic + sRGB).
 * Carregado por import dinâmico: se o CDN dos addons falhar, o jogo segue com render direto
 * (fallback idêntico ao nível 'low'). Bloom em meia resolução no nível 'medium'.
 */
import * as THREE from 'three';
import { getConfig } from '../gameplay-config.js?v=20261003m10c';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    amount: { value: 0.5 },
    vignette: { value: 0.45 }
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float amount;
    uniform float vignette;
    varying vec2 vUv;
    void main() {
      vec4 tex = texture2D(tDiffuse, vUv);
      vec3 c = tex.rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      // split-toning: sombras → azul-petróleo, luzes → âmbar (HDR linear, antes do ACES)
      vec3 shadowTint = vec3(-0.012, 0.018, 0.03);
      vec3 highTint = vec3(0.05, 0.012, -0.03);
      float k = smoothstep(0.02, 0.9, l);
      c += mix(shadowTint, highTint * max(l, 0.2), k) * amount;
      // leve saturação e contraste
      float l2 = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l2), c, 1.0 + 0.18 * amount);
      c = max(c, 0.0);
      // vinheta suave
      vec2 d = vUv - 0.5;
      float v = smoothstep(0.85, 0.25, length(d * vec2(1.0, 1.15)));
      c *= mix(1.0, v, vignette);
      gl_FragColor = vec4(c, tex.a);
    }`
};

/**
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene} scene
 * @param {THREE.Camera} camera
 * @param {{ bloom:boolean, bloomScale:number }} tier
 */
export async function createPostFx(renderer, scene, camera, tier) {
  const base = 'three/addons/postprocessing/';
  const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }, { ShaderPass }, { OutputPass }] = await Promise.all([
    import(base + 'EffectComposer.js'),
    import(base + 'RenderPass.js'),
    import(base + 'UnrealBloomPass.js'),
    import(base + 'ShaderPass.js'),
    import(base + 'OutputPass.js')
  ]);
  const g = getConfig().graphics;
  const size = renderer.getSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 0 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  let bloom = null;
  if (tier.bloom) {
    bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), g.bloomStrength, g.bloomRadius, g.bloomThreshold);
    const scale = Math.max(0.25, Math.min(1, tier.bloomScale || 1));
    const origSetSize = bloom.setSize.bind(bloom);
    bloom.setSize = (w, h) => origSetSize(Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale)));
    composer.addPass(bloom);
  }
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  composer.addPass(new OutputPass());
  const st = { frames: 0, bloomScale: tier.bloomScale, w: 0, h: 0, pr: 0 };

  function syncUniforms() {
    const c = getConfig().graphics;
    grade.uniforms.amount.value = c.gradeAmount;
    grade.uniforms.vignette.value = c.vignette;
    if (bloom) { bloom.strength = c.bloomStrength; bloom.radius = c.bloomRadius; bloom.threshold = c.bloomThreshold; }
  }
  return {
    composer,
    bloom,
    setSize(w, h, pr) {
      if (w === st.w && h === st.h && pr === st.pr) return;
      st.w = w; st.h = h; st.pr = pr;
      composer.setPixelRatio(pr);
      composer.setSize(w, h);
    },
    render(dt) {
      syncUniforms();
      composer.render(dt);
      st.frames++;
    },
    getDebug: () => ({ active: true, bloom: !!bloom, bloomScale: st.bloomScale, frames: st.frames, passes: composer.passes.length }),
    dispose() { composer.dispose?.(); rt.dispose(); }
  };
}
