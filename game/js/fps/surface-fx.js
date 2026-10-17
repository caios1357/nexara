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

// ————————————————————————— GRÁFICOS 3 —————————————————————————
/** relógio global (s) dos shaders animados (membrana/água/paredes) — atualizado 1× por quadro pelo renderer */
export const sfxTime = { value: 0 };
let dragonOn = true; /** preset: membrana/escamas novas nos dragões procedurais (LOW = desligado) */
export function setDragonDetail(on) { dragonOn = !!on; }
export const dragonDetailOn = () => dragonOn && !(typeof location !== 'undefined' && /[?&]dragonDetail=0\b/.test(location.search));
export function tickSurfaceFx(nowMs) { sfxTime.value = (nowMs % 3600000) / 1000; }
const NOISE = /* glsl */`
float sfxHash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float sfxN3(vec3 x) { vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(sfxHash3(i), sfxHash3(i + vec3(1,0,0)), f.x), mix(sfxHash3(i + vec3(0,1,0)), sfxHash3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(sfxHash3(i + vec3(0,0,1)), sfxHash3(i + vec3(1,0,1)), f.x), mix(sfxHash3(i + vec3(0,1,1)), sfxHash3(i + vec3(1,1,1)), f.x), f.y), f.z); }
float sfxHash2(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float sfxN2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(sfxHash2(i), sfxHash2(i + vec2(1, 0)), f.x), mix(sfxHash2(i + vec2(0, 1)), sfxHash2(i + vec2(1, 1)), f.x), f.y); }`;

/**
 * MEMBRANA DE ASA (dragões procedurais): translucidez de contra-luz (borda/fresnel acende na cor do elemento),
 * VEIAS radiais a partir da raiz da asa com PULSO de energia correndo para a ponta, e borda de fuga mais clara.
 * Não precisa de UV: usa a posição no objeto (asa em leque a partir da origem, plano XZ). o.span = comprimento da asa.
 */
export function addMembrane(mat, o = {}) {
  if (!mat || mat.userData.sfxMem) return mat;
  mat.userData.sfxMem = true; stats.membrane = (stats.membrane || 0) + 1;
  const u = { sfxMemGlow: { value: new THREE.Color(o.glow ?? 0x5dff6a) }, sfxMemK: { value: o.k ?? 1 }, sfxMemSpan: { value: o.span ?? 4.3 }, sfxTime };
  mat.userData.sfxUniforms = u;
  chain(mat, 'sfxMem', (sh) => {
    Object.assign(sh.uniforms, u);
    injectVertex(sh);
    sh.fragmentShader = VARY_F + sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 sfxMemGlow; uniform float sfxMemK; uniform float sfxMemSpan; uniform float sfxTime;\n' + NOISE)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
 { vec2 mp = vSfxObjPos.xz / sfxMemSpan; float r = length(mp); float ang = atan(mp.y, mp.x);
   float nv = sfxN3(vec3(mp * 5.0, 2.0)) * 0.65 + sfxN3(vec3(mp * 11.0, 5.0)) * 0.35;
   float vein = (1.0 - smoothstep(0.0, 0.045, abs(nv - 0.5))) * smoothstep(0.04, 0.2, r);
   float pulse = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(r * 11.0 - sfxTime * 3.2), 3.0);
   float ndv = abs(dot(normal, normalize(vViewPosition)));
   float back = pow(1.0 - ndv, 1.6) * 0.55 + 0.18;            // translucidez: fina e acesa na borda da silhueta
   float edge = smoothstep(0.7, 1.0, r) * 0.35;
   totalEmissiveRadiance += sfxMemGlow * sfxMemK * (back * 0.55 + vein * pulse * 0.9 + edge);
   diffuseColor.rgb *= 1.0 - vein * 0.35; }`);
  });
  return mat;
}

/**
 * PAREDES da Arena (instanciadas, caixa 0..1 em Y): tijolos/painéis em espaço de MUNDO, sujeira/oclusão na base,
 * friso claro no topo, manchas de umidade (ruído) e veios de néon raros na cor da região (instanceColor).
 */
export function addWallDetail(mat, o = {}) {
  if (!mat || mat.userData.sfxWall) return mat;
  mat.userData.sfxWall = true; stats.wall = (stats.wall || 0) + 1;
  const u = { sfxTime, sfxWallK: { value: o.k ?? 1 } };
  chain(mat, 'sfxWall', (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = 'varying vec3 vSfxW; varying float vSfxH;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vSfxH = position.y;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n { vec4 sw = vec4(transformed, 1.0);\n #ifdef USE_INSTANCING\n sw = instanceMatrix * sw;\n #endif\n vSfxW = (modelMatrix * sw).xyz; }');
    sh.fragmentShader = 'varying vec3 vSfxW; varying float vSfxH;\nuniform float sfxTime; uniform float sfxWallK;\n' + sh.fragmentShader.replace('#include <common>', '#include <common>\n' + NOISE + `
float sfxBrick(vec3 w, vec3 n) { vec3 a = abs(n); vec2 p = a.x > a.z ? w.zy : w.xy; p *= vec2(1.05, 2.1); float row = floor(p.y); p.x += mod(row, 2.0) * 0.5;
  vec2 f = abs(fract(p) - 0.5); return max(smoothstep(0.455, 0.5, f.x), smoothstep(0.42, 0.5, f.y)); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
 { vec3 fn = normalize(cross(dFdx(vSfxW), dFdy(vSfxW))); float br = abs(fn.y) > 0.7 ? 0.0 : sfxBrick(vSfxW, fn);
   float stain = sfxN2(vec2(vSfxW.x + vSfxW.z, vSfxW.y * 2.5) * 0.35); float base = 1.0 - smoothstep(0.0, 0.22, vSfxH);
   float topBand = smoothstep(0.93, 0.985, vSfxH);
   diffuseColor.rgb *= mix(1.0, (1.0 - br * 0.38) * (0.78 + stain * 0.36) * (1.0 - base * 0.45), sfxWallK);
   diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.35 + 0.05, topBand * sfxWallK); }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
 { float crack = (vSfxH > 0.25 && vSfxH < 0.9) ? smoothstep(0.92, 0.985, sfxN2(vec2((vSfxW.x - vSfxW.z) * 1.6, vSfxW.y * 0.5))) * smoothstep(0.25, 0.5, vSfxH) * (1.0 - smoothstep(0.75, 0.9, vSfxH)) : 0.0;
   #ifdef USE_COLOR
   vec3 rc = vColor / max(max(vColor.r, vColor.g), max(vColor.b, 0.001)); rc = rc * rc * rc * 1.5;
   #else
   vec3 rc = vec3(0.3, 0.9, 1.0);
   #endif
   totalEmissiveRadiance += rc * crack * (0.7 + 0.3 * sin(sfxTime * 2.0 + vSfxW.x)) * 0.55 * sfxWallK; }`);
  });
  return mat;
}

/**
 * CHÃO da Arena: variação em grande escala (quebra a repetição da textura), juntas de placa em grade de mundo,
 * POÇAS molhadas (rugosidade baixa + leve reflexo do céu/néblina) e grama/musgo onde a cor do vértice é verde.
 */
export function addFloorDetail(mat, o = {}) {
  if (!mat || mat.userData.sfxFloor) return mat;
  mat.userData.sfxFloor = true; stats.floor = (stats.floor || 0) + 1;
  const u = { sfxTime, sfxSky: { value: new THREE.Color(o.sky ?? 0x2a4a7a) }, sfxFloorK: { value: o.k ?? 1 } };
  mat.userData.sfxUniforms = u;
  chain(mat, 'sfxFloor', (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = 'varying vec3 vSfxW;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n vSfxW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = 'varying vec3 vSfxW;\nuniform float sfxTime; uniform vec3 sfxSky; uniform float sfxFloorK;\n' + sh.fragmentShader.replace('#include <common>', '#include <common>\n' + NOISE + '\nfloat sfxWet = 0.0;')
      .replace('#include <color_fragment>', `#include <color_fragment>
 { float macro = sfxN2(vSfxW.xz * 0.045) * 0.6 + sfxN2(vSfxW.xz * 0.19 + 7.3) * 0.4;
   vec2 gq = abs(fract(vSfxW.xz / 4.0) - 0.5); float seam = max(smoothstep(0.485, 0.5, gq.x), smoothstep(0.485, 0.5, gq.y));
   float green = clamp((diffuseColor.g - max(diffuseColor.r, diffuseColor.b)) * 6.0, 0.0, 1.0);
   float moss = green > 0.01 ? sfxN2(vSfxW.xz * 0.9 + 3.1) : 0.5;
   sfxWet = smoothstep(0.62, 0.72, sfxN2(vSfxW.xz * 0.11 + 19.7)) * (1.0 - green);
   diffuseColor.rgb *= mix(1.0, (0.78 + macro * 0.44) * (1.0 - seam * 0.32 * (1.0 - green)) * mix(1.0, 0.75 + moss * 0.5, green) * (1.0 - sfxWet * 0.45), sfxFloorK); }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix(roughnessFactor, 0.12, sfxWet * sfxFloorK);')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
 if (sfxWet > 0.001) { float ndv = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0); float fr = pow(1.0 - ndv, 4.0);
   vec2 rp = vSfxW.xz * 1.7; float rip = 0.5 + 0.5 * sin(length(fract(rp) - 0.5) * 40.0 - sfxTime * 6.0 + floor(rp.x) * 3.1 + floor(rp.y) * 1.7);
   totalEmissiveRadiance += sfxSky * sfxWet * (fr * 0.55 + 0.025 + rip * 0.03) * sfxFloorK; }`);
  });
  return mat;
}

/**
 * Asa em leque SUBDIVIDIDA com BARRIGA entre os dedos (a membrana cede entre os ossos em vez de ser um plano chapado).
 * pts: contorno [[x,z],...] a partir da origem (pts[0] = raiz). tips: pontas dos ossos [[x,z],...]. sag = quanto cede (por unidade de distância ao osso).
 * uvFn(x,z) opcional → atributo uv. Indexada (vértices compartilhados) → normais suaves.
 */
export function fanWingGeometry(pts, tips, { sub = 4, sag = 0.12, cap = 0.6, uvFn = null } = {}) {
  const vmap = new Map(); const pos = []; const uv = []; const idx = [];
  const len = Math.max(...pts.map(([x, z]) => Math.hypot(x, z))) || 1;
  const segD = (px, pz, tx, tz) => { const L2 = tx * tx + tz * tz || 1; const t = Math.max(0, Math.min(1, (px * tx + pz * tz) / L2)); return Math.hypot(px - tx * t, pz - tz * t); };
  const V = (x, z) => {
    const k = `${Math.round(x * 1e4)}|${Math.round(z * 1e4)}`; let i = vmap.get(k); if (i !== undefined) return i;
    let d = Infinity; for (const [tx, tz] of tips) d = Math.min(d, segD(x, z, tx, tz));
    const r = Math.hypot(x, z) / len; const y = -sag * Math.min(d, cap) * Math.min(1, r / 0.25);
    i = pos.length / 3; pos.push(x, y, z); if (uvFn) uv.push(...uvFn(x, z)); vmap.set(k, i); return i;
  };
  const [ox, oz] = pts[0];
  for (let s = 1; s < pts.length - 1; s++) {
    const [ax, az] = pts[s], [bx, bz] = pts[s + 1]; const g = [];
    for (let i = 0; i <= sub; i++) { g.push([]); for (let j = 0; j <= i; j++) { const u = i / sub, v = i ? j / i : 0; const px = ox + (ax - ox) * u + (bx - ax) * u * v, pz = oz + (az - oz) * u + (bz - az) * u * v; g[i].push(V(px, pz)); } }
    for (let i = 0; i < sub; i++) for (let j = 0; j <= i; j++) { idx.push(g[i][j], g[i + 1][j], g[i + 1][j + 1]); if (j < i) idx.push(g[i][j], g[i + 1][j + 1], g[i][j + 1]); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (uvFn) geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx); geo.computeVertexNormals();
  return geo;
}
