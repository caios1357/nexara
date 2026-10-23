/**
 * NEXARA GRÁFICOS 3 — céu e névoa (foco MOBILE MEDIUM):
 *  • createSkyDome(): cúpula de céu em shader (1 draw call, sem textura): gradiente topo→meio→horizonte (o horizonte
 *    acompanha a cor da névoa da região), estrelas cintilando, LUA com halo, faixa de AURORA neon lenta e nuvens finas
 *    perto do horizonte. Segue a câmera, fog:false, sem escrever profundidade.
 *  • installHeightFog(): NÉVOA DE ALTURA — a névoa exponencial ganha uma camada rente ao chão (bruma baixa que engrossa
 *    com a distância). Patch global nos trechos de fog do three (vale p/ todos os materiais com fog), instalado 1× antes
 *    de compilar shaders. Constantes por preset (sem uniform extra → sem custo de CPU).
 */
import * as THREE from 'three';

let fogInstalled = null;
export function installHeightFog(o = {}) {
  if (fogInstalled) return fogInstalled;
  const k = +(o.k ?? 0.3), base = +(o.base ?? 0.0), fall = +(o.fall ?? 1.0), reach = +(o.reach ?? 0.04);
  const f = (n) => (Number.isFinite(n) ? n : 0).toFixed(4);
  const C = THREE.ShaderChunk;
  C.fog_pars_vertex = '#ifdef USE_FOG\n varying float vFogDepth;\n varying float vFogWorldY;\n#endif';
  C.fog_vertex = '#ifdef USE_FOG\n vFogDepth = - mvPosition.z;\n vFogWorldY = ((mvPosition.xyz - viewMatrix[3].xyz) * mat3(viewMatrix)).y;\n#endif';
  C.fog_pars_fragment = C.fog_pars_fragment.replace('varying float vFogDepth;', 'varying float vFogDepth;\n varying float vFogWorldY;');
  C.fog_fragment = C.fog_fragment.replace('gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );',
    `float nxHf = exp( - max( vFogWorldY - ${f(base)}, 0.0 ) * ${f(fall)} ) * ( 1.0 - exp( - vFogDepth * ${f(reach)} ) );
	fogFactor = clamp( fogFactor + ( 1.0 - fogFactor ) * nxHf * ${f(k)}, 0.0, 1.0 );
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );`);
  fogInstalled = { k, base, fall, reach, ok: C.fog_fragment.includes('nxHf') };
  return fogInstalled;
}
export const heightFogInfo = () => fogInstalled;

export function createSkyDome(o = {}) {
  const u = {
    uTop: { value: new THREE.Color(o.top || '#03081a') }, uMid: { value: new THREE.Color(o.mid || '#0c1f48') }, uHor: { value: new THREE.Color(o.horizon || '#1a3866') },
    uTime: { value: 0 }, uMoon: { value: new THREE.Vector3(-0.55, 0.42, -0.72).normalize() }, uMoonCol: { value: new THREE.Color(o.moon || 0xcfe6ff) },
    uAur: { value: new THREE.Color(o.aurora || 0x2cffc8) }, uAur2: { value: new THREE.Color(o.aurora2 || 0x8a5aff) }, uStars: { value: o.stars ?? 1 }, uAurK: { value: o.auroraK ?? 1 },
    uTexA: { value: null }, uTexB: { value: null }, uTexK: { value: 0 }, uNight: { value: 0 } // 20261023: céu da arte do Caio (anoitecer → noite)
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: u, side: THREE.BackSide, depthWrite: false, depthTest: true, depthFunc: THREE.LessEqualDepth, fog: false, toneMapped: false,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
    fragmentShader: /* glsl */`
uniform vec3 uTop, uMid, uHor, uMoonCol, uAur, uAur2, uMoon; uniform float uTime, uStars, uAurK, uTexK, uNight; uniform sampler2D uTexA, uTexB; varying vec3 vDir;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float n21(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
void main(){
  vec3 d = normalize(vDir); float e = d.y; float az = atan(d.z, d.x);
  vec3 col = mix(uHor, uMid, smoothstep(-0.03, 0.28, e)); col = mix(col, uTop, smoothstep(0.28, 0.9, e));
  // nuvens finas perto do horizonte (iluminadas de baixo pela cidade)
  float cl = n21(vec2(az * 3.0 + uTime * 0.004, e * 14.0)) * n21(vec2(az * 9.0 - uTime * 0.006, e * 30.0));
  col = mix(col, uHor * 1.6 + 0.02, smoothstep(0.18, 0.5, cl) * smoothstep(0.32, 0.04, e) * smoothstep(-0.05, 0.05, e) * 0.55);
  // estrelas (só acima do horizonte), cintilando
  vec2 sp = vec2(az * 60.0, e * 95.0); vec2 si = floor(sp); float sh = h21(si);
  float star = step(0.985, sh) * smoothstep(0.42, 0.0, length(fract(sp) - 0.5)) * (0.55 + 0.45 * sin(uTime * (1.5 + sh * 4.0) + sh * 80.0));
  col += vec3(0.75, 0.85, 1.0) * star * smoothstep(0.06, 0.3, e) * uStars * (1.0 - cl);
  // aurora neon (faixa ondulada, lenta)
  float band = e - (0.36 + 0.07 * sin(az * 3.0 + uTime * 0.05) + 0.03 * sin(az * 7.0 - uTime * 0.09));
  float aur = exp(-band * band * 260.0) * (0.45 + 0.55 * n21(vec2(az * 14.0 + uTime * 0.12, 3.0))) * smoothstep(0.12, 0.3, e);
  float rays = exp(min(band, 0.0) * 9.0) * step(band, 0.0) * smoothstep(0.12, 0.32, e) * (0.5 + 0.5 * sin(az * 40.0 + uTime * 0.4)) * 0.25;
  vec3 aurC = mix(vec3(0.15, 1.0, 0.5), vec3(0.55, 0.3, 1.0), 0.5 + 0.5 * sin(az * 2.0 + uTime * 0.03)) * (aur + rays * (0.4 + aur));
  col += aurC * 0.32 * uAurK;
  // lua + halo
  float md = dot(d, uMoon); float moon = smoothstep(0.99935, 0.9996, md); float halo = pow(max(md, 0.0), 220.0) * 0.5 + pow(max(md, 0.0), 18.0) * 0.12;
  float crater = n21(d.xy * 900.0) * 0.25;
  col = mix(col, uMoonCol * (1.05 - crater), moon) + uMoonCol * halo * (1.0 - moon);
  if (uTexK > 0.001) { // céu pintado: espelhado no azimute (sem emenda), base = horizonte; abaixo do horizonte = faixa de baixo
    float u = 1.0 - abs(1.0 - 2.0 * fract(az / 6.2831853 + 0.5)); float v = clamp(e / 0.8, 0.004, 0.996);
    vec3 ta = texture2D(uTexA, vec2(u, v)).rgb; vec3 tb = texture2D(uTexB, vec2(u, v)).rgb;
    vec3 tc = mix(ta, tb, uNight); tc = pow(tc, vec3(2.2)); // sRGB → linear (o colorspace_fragment volta)
    col = mix(col, tc * mix(1.0, 0.75, smoothstep(0.0, -0.2, e)), uTexK);
    col += aurC * uTexK * (0.25 + 0.75 * uNight) * 0.9; // CONCEITO: aurora verde/roxa por cima do céu pintado
  }
  { // CONCEITO: skyline da cidade no horizonte (prédios em silhueta, janelas acesas, torres néon roxas) — procedural
    float ax = az * 26.0; float bi = floor(ax); float bh = 0.018 + h21(vec2(bi, 7.0)) * 0.07 + step(0.93, h21(vec2(bi, 3.0))) * 0.09;
    float spire = step(0.9, h21(vec2(bi, 5.0))) * smoothstep(0.08, 0.0, abs(fract(ax) - 0.5)) * 0.06;
    float top = bh + spire; float inB = step(e, top) * step(-0.02, e);
    float wl = step(0.35, fract(ax * 6.0)) * step(fract(ax * 6.0), 0.75) * step(0.3, fract(e * 140.0)) * step(fract(e * 140.0), 0.7) * step(0.55, h21(floor(vec2(ax * 6.0, e * 140.0))));
    vec3 bcol = vec3(0.025, 0.02, 0.06) + vec3(1.0, 0.62, 0.3) * wl * 0.55 + vec3(0.7, 0.2, 1.0) * step(0.001, spire) * step(top - 0.006, e) * 3.0;
    col = mix(col, bcol, inB * (0.6 + 0.4 * uNight));
    col += vec3(0.55, 0.2, 0.9) * exp(-max(e, 0.0) * 40.0) * 0.12 * step(-0.02, e);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(200, 24, 16), mat);
  const art = { tex: 0, night: 0, t0: performance.now(), dur: o.nightMs || 420000, force: null };
  try { const q = new URLSearchParams(location.search).get('ceu'); if (q === 'noite') art.force = 1; else if (q === 'tarde') art.force = 0; } catch { /* */ }
  if (o.texA && o.texB && !/[?&]ceuArte=0\b/.test(typeof location !== 'undefined' ? location.search : '')) {
    const L = new THREE.TextureLoader(); let n = 0;
    const done = () => { if (++n === 2) { u.uTexK.value = 1; art.tex = 1; } };
    for (const [k, url] of [['uTexA', o.texA], ['uTexB', o.texB]]) L.load(url, (t) => { t.colorSpace = THREE.NoColorSpace; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.generateMipmaps = true; u[k].value = t; done(); }, undefined, () => {});
  }
  mesh.name = 'nx-sky-dome'; mesh.frustumCulled = false; mesh.renderOrder = 50; // desenhado DEPOIS do cenário opaco: o teste de profundidade descarta os pixels cobertos (só o céu visível paga o shader)
  return {
    object: mesh, uniforms: u,
    update(cam, nowMs, fogColor) {
      mesh.position.copy(cam.position); u.uTime.value = (nowMs % 3600000) / 1000;
      if (fogColor) u.uHor.value.copy(fogColor).multiplyScalar(1.05);
      art.night = art.force ?? Math.min(1, Math.max(0, 0.55 + 0.45 * (performance.now() - art.t0) / art.dur)); u.uNight.value = art.night; // ENTARDECER → NOITE ao longo da partida
    },
    info: () => ({ tex: art.tex, night: +art.night.toFixed(3) }),
    dispose() { mesh.geometry.dispose(); mat.dispose(); u.uTexA.value?.dispose?.(); u.uTexB.value?.dispose?.(); }
  };
}
