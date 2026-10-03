/**
 * NEXARA — atmosfera (Bloco V): mapa de ambiente PMREM de uma "sala neon" procedural
 * (metais e chão molhado refletem luzes), máscara de poças (roughness), chuva leve em
 * shader (1 draw call, animada na GPU) e névoa/neblina à deriva (billboards aditivos).
 * Tudo decorativo — nenhuma colisão / regra de jogo.
 */
import * as THREE from 'three';

/** Env map: caixa escura com painéis emissivos ciano/magenta/âmbar → PMREM (1× por sessão). */
export function createNeonEnvironment(renderer) {
  const pm = new THREE.PMREMGenerator(renderer);
  const s = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(20, 10, 20), new THREE.MeshBasicMaterial({ color: 0x06090d, side: THREE.BackSide }));
  s.add(room);
  const panel = (w, h, color, x, y, z, ry, k = 1) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.rotation.y = ry; s.add(m);
  };
  panel(6, 0.6, 0x39f0ff, 0, 2.5, -9.8, 0, 6);
  panel(4, 1.4, 0xff3fb4, -9.8, 3.5, 2, Math.PI / 2, 4);
  panel(5, 0.8, 0xffa040, 9.8, 1.8, -3, -Math.PI / 2, 5);
  panel(3, 3, 0x2a6cff, 4, 4.5, 9.8, Math.PI, 3);
  panel(8, 0.3, 0x39f0ff, -3, 0.6, 9.8, Math.PI, 5);
  const top = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x1a2a3a).multiplyScalar(1.6) }));
  top.rotation.x = Math.PI / 2; top.position.y = 4.9; s.add(top);
  const rt = pm.fromScene(s, 0.035);
  s.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
  pm.dispose();
  return rt.texture;
}

/** Máscara de poças para roughnessMap (verde = roughness): poças lisas (escuro) sobre metal fosco. */
export function createPuddleRoughness(seed = 7) {
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const c = cv.getContext('2d');
  c.fillStyle = 'rgb(160,160,160)';
  c.fillRect(0, 0, S, S);
  let r = seed;
  const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 34; i++) {
    const x = rnd() * S, y = rnd() * S, rad = 10 + rnd() * 30;
    for (const [ox, oy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) {
      const gr = c.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
      gr.addColorStop(0, 'rgba(60,60,60,0.85)');
      gr.addColorStop(0.55, 'rgba(90,90,90,0.55)');
      gr.addColorStop(1, 'rgba(160,160,160,0)');
      c.fillStyle = gr;
      c.beginPath(); c.ellipse(x + ox, y + oy, rad * (0.7 + rnd() * 0.6), rad * (0.5 + rnd() * 0.4), rnd() * 3, 0, Math.PI * 2); c.fill();
    }
  }
  // riscos finos (desgaste)
  c.strokeStyle = 'rgba(200,200,200,0.25)';
  for (let i = 0; i < 60; i++) { c.beginPath(); const x = rnd() * S, y = rnd() * S; c.moveTo(x, y); c.lineTo(x + (rnd() - 0.5) * 30, y + (rnd() - 0.5) * 6); c.stroke(); }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

/** Chuva: segmentos de linha caindo num volume que segue a câmera (animação no vertex shader). */
export function createRain(count) {
  const n = Math.max(0, count | 0);
  const pos = new Float32Array(n * 2 * 3);
  const seed = new Float32Array(n * 2);
  const end = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const x = (Math.random() - 0.5) * 26, y = Math.random() * 14, z = (Math.random() - 0.5) * 26;
    for (let k = 0; k < 2; k++) {
      pos.set([x, y, z], (i * 2 + k) * 3);
      seed[i * 2 + k] = Math.random();
      end[i * 2 + k] = k;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uOrigin: { value: new THREE.Vector3() }, uColor: { value: new THREE.Color(0x9fdcff) } },
    vertexShader: /* glsl */`
      attribute float aSeed; attribute float aEnd;
      uniform float uTime; uniform vec3 uOrigin;
      varying float vA;
      void main() {
        vec3 p = position;
        float speed = 11.0 + aSeed * 5.0;
        float y = mod(p.y - uTime * speed, 14.0);
        vec3 w = vec3(mod(p.x - uOrigin.x + 13.0, 26.0) - 13.0 + uOrigin.x, y, mod(p.z - uOrigin.z + 13.0, 26.0) - 13.0 + uOrigin.z);
        w.y += aEnd * 0.34; w.x += aEnd * 0.05;
        vA = (1.0 - aEnd) * 0.55 + 0.1;
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; varying float vA;
      void main() { gl_FragColor = vec4(uColor * 0.55, vA * 0.35); }`
  });
  const lines = new THREE.LineSegments(geo, mat);
  lines.frustumCulled = false;
  lines.name = 'rain';
  lines.renderOrder = 5;
  return {
    object: lines,
    count: n,
    update(t, camPos) { mat.uniforms.uTime.value = t; mat.uniforms.uOrigin.value.set(camPos.x, 0, camPos.z); }
  };
}

let hazeTex = null;
function hazeTexture() {
  if (hazeTex) return hazeTex;
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const c = cv.getContext('2d');
  for (let i = 0; i < 9; i++) {
    const x = 30 + Math.random() * 68, y = 40 + Math.random() * 48, r = 26 + Math.random() * 30;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.22)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, S, S);
  }
  hazeTex = new THREE.CanvasTexture(cv);
  hazeTex.colorSpace = THREE.SRGBColorSpace;
  return hazeTex;
}

/** Neblina à deriva: poucos sprites grandes e translúcidos perto do chão. */
export function createHaze(count, bounds, color = 0x5a8a9a) {
  const group = new THREE.Group();
  group.name = 'haze';
  const items = [];
  const mat = new THREE.SpriteMaterial({ map: hazeTexture(), color, transparent: true, opacity: 0.16, depthWrite: false, fog: false });
  for (let i = 0; i < count; i++) {
    const sp = new THREE.Sprite(mat);
    const s = 7 + Math.random() * 7;
    sp.scale.set(s, s * 0.45, 1);
    sp.position.set(bounds.x0 + Math.random() * (bounds.x1 - bounds.x0), 0.7 + Math.random() * 0.9, bounds.z0 + Math.random() * (bounds.z1 - bounds.z0));
    group.add(sp);
    items.push({ sp, vx: (Math.random() - 0.5) * 0.25, vz: (Math.random() - 0.5) * 0.18 });
  }
  return {
    object: group,
    update(dt) {
      for (const it of items) {
        it.sp.position.x += it.vx * dt; it.sp.position.z += it.vz * dt;
        if (it.sp.position.x < bounds.x0) it.sp.position.x = bounds.x1; else if (it.sp.position.x > bounds.x1) it.sp.position.x = bounds.x0;
        if (it.sp.position.z < bounds.z0) it.sp.position.z = bounds.z1; else if (it.sp.position.z > bounds.z1) it.sp.position.z = bounds.z0;
      }
    },
    dispose() { mat.dispose(); }
  };
}
