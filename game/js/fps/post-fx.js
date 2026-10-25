/**
 * NEXARA — pós-processamento (Bloco V): EffectComposer + UnrealBloomPass (brilho neon),
 * correção de cor teal/laranja + vinheta (ShaderPass), OutputPass (ACES Filmic + sRGB).
 * Carregado por import dinâmico: se o CDN dos addons falhar, o jogo segue com render direto
 * (fallback idêntico ao nível 'low'). Bloom em meia resolução no nível 'medium'.
 */
import * as THREE from 'three';
import { getConfig } from '../gameplay-config.js?v=20261025ia';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    amount: { value: 0.5 },
    vignette: { value: 0.45 },
    texel: { value: new THREE.Vector2(1 / 1024, 1 / 512) },
    fxaa: { value: 0 },
    finalOut: { value: 0 },
    exposure: { value: 1 }
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float amount;
    uniform float vignette;
    uniform vec2 texel;
    uniform float fxaa;
    uniform float finalOut;
    uniform float exposure;
    varying vec2 vUv;
    // META-69: ACES Filmic + sRGB DENTRO desta passada (igual ao OutputPass do three r170) → 1 passada de tela cheia a menos
    vec3 nxRRT(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
    vec3 nxACES(vec3 color) {
      const mat3 inM = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
      const mat3 outM = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
      color *= exposure / 0.6; color = inM * color; color = nxRRT(color); color = outM * color; return clamp(color, 0.0, 1.0); }
    vec3 nxSRGB(vec3 v) { return mix(pow(v, vec3(0.41666)) * 1.055 - vec3(0.055), v * 12.92, vec3(lessThanEqual(v, vec3(0.0031308)))); }
    // GRÁFICOS 2: FXAA (luma em espaço comprimido p/ HDR) dentro da MESMA passada da cor — sem render target extra
    float lumaC(vec3 c) { float l = dot(c, vec3(0.299, 0.587, 0.114)); return l / (1.0 + l); }
    vec3 fxaaSample(vec2 uv) {
      vec3 nw = texture2D(tDiffuse, uv + vec2(-1.0, -1.0) * texel).rgb;
      vec3 ne = texture2D(tDiffuse, uv + vec2(1.0, -1.0) * texel).rgb;
      vec3 sw = texture2D(tDiffuse, uv + vec2(-1.0, 1.0) * texel).rgb;
      vec3 se = texture2D(tDiffuse, uv + vec2(1.0, 1.0) * texel).rgb;
      vec3 m = texture2D(tDiffuse, uv).rgb;
      float lNW = lumaC(nw), lNE = lumaC(ne), lSW = lumaC(sw), lSE = lumaC(se), lM = lumaC(m);
      float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
      float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
      if (lMax - lMin < max(0.0312, lMax * 0.125)) return m;
      vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
      float red = max((lNW + lNE + lSW + lSE) * 0.03125, 1.0 / 128.0);
      float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + red);
      dir = clamp(dir * rcp, vec2(-8.0), vec2(8.0)) * texel;
      vec3 a = 0.5 * (texture2D(tDiffuse, uv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(tDiffuse, uv + dir * (2.0 / 3.0 - 0.5)).rgb);
      vec3 b = a * 0.5 + 0.25 * (texture2D(tDiffuse, uv - dir * 0.5).rgb + texture2D(tDiffuse, uv + dir * 0.5).rgb);
      float lB = lumaC(b);
      return (lB < lMin || lB > lMax) ? a : b;
    }
    void main() {
      vec4 tex = texture2D(tDiffuse, vUv);
      vec3 c = fxaa > 0.5 ? fxaaSample(vUv) : tex.rgb;
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
      if (finalOut > 0.5) c = nxSRGB(nxACES(c));
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
  const rtQ = new URLSearchParams(location.search).get('rtType'); const rt8 = rtQ ? rtQ === '8' : g.postRt8 === true;
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: rt8 ? THREE.UnsignedByteType : THREE.HalfFloatType, samples: 0 });
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
  // META-69: com ACES + sRGB a mescla dispensa o OutputPass (só quando o renderer usa ACES Filmic + sRGB; ?postMerge=0 volta ao OutputPass)
  const merged = g.postMergedOutput !== false && !/[?&]postMerge=0\b/.test(location.search) && renderer.toneMapping === THREE.ACESFilmicToneMapping && renderer.outputColorSpace === THREE.SRGBColorSpace;
  if (merged) grade.uniforms.finalOut.value = 1; else composer.addPass(new OutputPass());
  const st = { frames: 0, bloomScale: tier.bloomScale, w: 0, h: 0, pr: 0, fxaa: !!tier.fxaa };
  const fxaaOff = /[?&]fxaa=0\b/.test(location.search); const fxaaOn = /[?&]fxaa=1\b/.test(location.search);

  function syncUniforms() {
    const c = getConfig().graphics;
    grade.uniforms.amount.value = c.gradeAmount;
    grade.uniforms.vignette.value = c.vignette;
    st.fxaa = !fxaaOff && (fxaaOn || (!!tier.fxaa && c.fxaa !== false));
    grade.uniforms.fxaa.value = st.fxaa ? 1 : 0;
    grade.uniforms.exposure.value = renderer.toneMappingExposure;
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
      grade.uniforms.texel.value.set(1 / Math.max(1, Math.round(w * pr)), 1 / Math.max(1, Math.round(h * pr)));
    },
    render(dt) {
      syncUniforms();
      composer.render(dt);
      st.frames++;
    },
    getDebug: () => ({ active: true, bloom: !!bloom, bloomScale: st.bloomScale, frames: st.frames, passes: composer.passes.length, fxaa: st.fxaa, mergedOutput: merged }),
    dispose() { composer.dispose?.(); rt.dispose(); }
  };
}
