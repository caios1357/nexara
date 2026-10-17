/**
 * NEXARA GRÁFICOS 2 — detalhe de superfície por SHADER (sem texturas/UV, funciona nos GLB low-poly):
 *  • addScales(mat, {...})  → ESCAMAS procedurais em espaço do objeto (pose de ligação: grudam na pele
 *    mesmo com animação de esqueleto), relevo (bump por derivadas), sulcos escuros e brilho na borda.
 *  • addArmorDetail(mat, {...}) → armadura do herói clássico: linhas de painel + micro-arranhões +
 *    borda (fresnel) na cor do brilho — o boneco se destaca do fundo escuro.
 * Encadeia com onBeforeCompile que já exista (ex.: rim do hero-glb) e usa cache key própria.
 */
import * as THREE from 'three';

const stats = { scales: 0, armor: 0, compiled: 0 };
export const surfaceFxStats = () => ({ ...stats });

function chain(mat, key, fn) {
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey?.bind(mat);
  mat.onBeforeCompile = (sh, r) => { if (prev && prev !== THREE.Material.prototype.onBeforeCompile) prev.call(mat, sh, r); fn(sh); stats.compiled++; };
  mat.customProgramCacheKey = () => (prevKey ? prevKey() : '') + '|' + key;
  mat.needsUpdate = true;
}

const VARY_V = `varying vec3 vSfxObjPos;\nvarying vec3 vSfxObjN;\n`;
const VARY_F = `varying vec3 vSfxObjPos;\nvarying vec3 vSfxObjN;\n`;
function injectVertex(sh) {
  if (sh.vertexShader.includes('vSfxObjPos')) return;
  sh.vertexShader = VARY_V + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vSfxObjPos = position; vSfxObjN = normal;');
}
const BUMP = /* glsl */`
vec3 sfxBump(vec3 n, float h, float k) {
  vec3 dpx = dFdx(-vViewPosition); vec3 dpy = dFdy(-vViewPosition);
  float hx = dFdx(h); float hy = dFdy(h);
  vec3 r1 = cross(dpy, n); vec3 r2 = cross(n, dpx);
  float det = dot(dpx, r1);
  vec3 grad = sign(det) * (hx * r1 + hy * r2);
  return normalize(abs(det) * n - grad * k);
}`;

/** fish-scale: célula circular ancorada embaixo, fileiras alternadas. Retorna (altura, sulco). */
const SCALES = /* glsl */`
vec2 sfxScale2(vec2 p) {
  vec2 g = p; float row = floor(g.y); g.x += mod(row, 2.0) * 0.5;
  vec2 f = fract(g) - vec2(0.5, 0.0);
  float d = length(f * vec2(1.0, 1.25));
  float h = clamp(1.0 - d, 0.0, 1.0);
  float crease = smoothstep(0.78, 0.98, d);
  return vec2(h, crease);
}
vec2 sfxScales(vec3 p, vec3 n) {
  vec3 a = abs(normalize(n)); a = pow(a, vec3(4.0)); a /= (a.x + a.y + a.z + 1e-4);
  vec2 sx = sfxScale2(p.zy); vec2 sy = sfxScale2(p.xz); vec2 sz = sfxScale2(p.xy);
  return sx * a.x + sy * a.y + sz * a.z;
}`;

/**
 * @param {THREE.MeshStandardMaterial} mat
 * @param {{freq:number, bump?:number, crease?:number, rim?:THREE.ColorRepresentation, rimK?:number}} o
 */
export function addScales(mat, o) {
  if (!mat || mat.userData.sfxScales) return mat;
  mat.userData.sfxScales = true; stats.scales++;
  const u = { sfxFreq: { value: o.freq }, sfxBumpK: { value: o.bump ?? 0.9 }, sfxCrease: { value: o.crease ?? 0.55 }, sfxRim: { value: new THREE.Color(o.rim ?? 0x66ff99) }, sfxRimK: { value: o.rimK ?? 0.35 } };
  mat.userData.sfxUniforms = u;
  chain(mat, 'sfxScales', (sh) => {
    Object.assign(sh.uniforms, u);
    injectVertex(sh);
    sh.fragmentShader = VARY_F + sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float sfxFreq; uniform float sfxBumpK; uniform float sfxCrease; uniform vec3 sfxRim; uniform float sfxRimK;\n' + BUMP + SCALES)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n vec3 sfxP = vSfxObjPos * sfxFreq; float sfxAA = 1.0 - smoothstep(0.18, 0.55, length(fwidth(sfxP))); vec2 sfxS = sfxScales(sfxP, vSfxObjN); normal = sfxBump(normal, sfxS.x * 0.035 * sfxAA, sfxBumpK);')
      .replace('#include <color_fragment>', '#include <color_fragment>\n { vec3 sfxP2 = vSfxObjPos * sfxFreq; float sfxAA2 = 1.0 - smoothstep(0.18, 0.55, length(fwidth(sfxP2))); vec2 sfxC = sfxScales(sfxP2, vSfxObjN); diffuseColor.rgb *= mix(1.0, mix(1.0, 0.55, sfxC.y * sfxCrease) * (0.9 + 0.16 * sfxC.x), sfxAA2); }')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n { float sfxF = 1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0); totalEmissiveRadiance += sfxRim * pow(sfxF, 3.0) * sfxRimK; }');
  });
  return mat;
}

/**
 * @param {THREE.MeshStandardMaterial} mat
 * @param {{rim?:THREE.ColorRepresentation, rimK?:number, panel?:number, scratch?:number}} o
 */
export function addArmorDetail(mat, o = {}) {
  if (!mat || mat.userData.sfxArmor) return mat;
  mat.userData.sfxArmor = true; stats.armor++;
  const u = { sfxRim: { value: new THREE.Color(o.rim ?? 0x39f0ff) }, sfxRimK: { value: o.rimK ?? 0.5 }, sfxPanel: { value: o.panel ?? 9.0 }, sfxScratch: { value: o.scratch ?? 0.5 } };
  mat.userData.sfxUniforms = u;
  chain(mat, 'sfxArmor', (sh) => {
    Object.assign(sh.uniforms, u);
    injectVertex(sh);
    sh.fragmentShader = VARY_F + sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 sfxRim; uniform float sfxRimK; uniform float sfxPanel; uniform float sfxScratch;\n' + BUMP + /* glsl */`
float sfxHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float sfxNoise(vec3 x) { vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(sfxHash(i), sfxHash(i + vec3(1,0,0)), f.x), mix(sfxHash(i + vec3(0,1,0)), sfxHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(sfxHash(i + vec3(0,0,1)), sfxHash(i + vec3(1,0,1)), f.x), mix(sfxHash(i + vec3(0,1,1)), sfxHash(i + vec3(1,1,1)), f.x), f.y), f.z); }
float sfxPanelLine(vec3 p) { vec3 q = abs(fract(p * sfxPanel) - 0.5); vec3 a = abs(normalize(vSfxObjN));
  float lx = smoothstep(0.47, 0.5, q.x), ly = smoothstep(0.47, 0.5, q.y), lz = smoothstep(0.47, 0.5, q.z);
  return max(max(ly * (1.0 - a.y), lx * (1.0 - a.x)), lz * (1.0 - a.z)) ; }
`)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n float sfxH = sfxNoise(vSfxObjPos * 60.0) * 0.004 * sfxScratch - sfxPanelLine(vSfxObjPos) * 0.012; normal = sfxBump(normal, sfxH, 1.0);')
      .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= 1.0 - 0.35 * sfxPanelLine(vSfxObjPos);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = clamp(roughnessFactor + (sfxNoise(vSfxObjPos * 23.0) - 0.5) * 0.25 * sfxScratch, 0.04, 1.0);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n { float sfxF = 1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0); totalEmissiveRadiance += sfxRim * (pow(sfxF, 3.0) * sfxRimK + sfxPanelLine(vSfxObjPos) * 0.55 * sfxRimK); }');
  });
  return mat;
}
