/**
 * NEXARA M3D — HERÓI GLB (KayKit Knight, CC0) por cima do herói procedural.
 * O procedural continua sendo a "lógica" (estado/getDebug/rastro do golpe/escudo); quando o GLB carrega,
 * o corpo procedural some e o modelo animado (AnimationMixer) assume. Falha → fica o procedural.
 * Visual da ref. do Caio: armadura escura, NÚCLEO azul no peito, espada com brilho azul.
 */
import * as THREE from 'three';
import { loadModel, getLoaded, cloneSkinned, findNode, fitHeight, createAnimator } from './model-lib.js?v=20261009leve';
import { heroStyleOf } from '../hero-styles.js?v=20261009leve';
import { getConfig } from '../gameplay-config.js?v=20261009leve';

const HERO_H = 1.66;
/** Proporções (só visual; hitbox/tempos intactos): herói mais ALTO e mais MAGRO que o KayKit chibi.
 *  ?heroProp=0 volta às proporções originais do modelo. */
const PROP_OFF = typeof location !== 'undefined' && /[?&]heroProp=0\b/.test(location.search);
/** Caixa da CABEÇA (vértices pesados no osso da cabeça) em metros, eixos do corpo, origem no osso. Cache por modelo. */
const headBoxCache = new Map();
function headBoxOf(model, hb, key) {
  if (headBoxCache.has(key)) return headBoxCache.get(key).clone();
  model.updateMatrixWorld(true);
  const hp = hb.getWorldPosition(new THREE.Vector3());
  const mqi = model.getWorldQuaternion(new THREE.Quaternion()).invert();
  const box = new THREE.Box3(); const v = new THREE.Vector3();
  model.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const bi = o.skeleton.bones.indexOf(hb); if (bi < 0) return;
    o.skeleton.update();
    const si = o.geometry.attributes.skinIndex; const sw = o.geometry.attributes.skinWeight; if (!si || !sw) return;
    for (let i = 0; i < si.count; i++) {
      let w = 0; for (let k = 0; k < 4; k++) if (si.getComponent(i, k) === bi) w += sw.getComponent(i, k);
      if (w < 0.5) continue;
      o.getVertexPosition(i, v); o.localToWorld(v); v.sub(hp).applyQuaternion(mqi); box.expandByPoint(v);
    }
  });
  if (box.isEmpty()) box.set(new THREE.Vector3(-0.16, 0, -0.16), new THREE.Vector3(0.16, 0.34, 0.16));
  headBoxCache.set(key, box.clone());
  return box;
}
const HERO_PROP = PROP_OFF ? { height: HERO_H, width: 1, head: 1 } : { height: 1.82, width: 0.78, head: 0.72 };
const CLIPS = {
  idle: 'Idle', walk: 'Walking_A', run: 'Running_A',
  attack1: '1H_Melee_Attack_Slice_Diagonal', attack2: '1H_Melee_Attack_Slice_Horizontal', attack3: '1H_Melee_Attack_Chop',
  dodgeF: 'Dodge_Forward', dodgeB: 'Dodge_Backward', dodgeL: 'Dodge_Left', dodgeR: 'Dodge_Right',
  guard: 'Blocking', hurt: 'Hit_A', power: '2H_Melee_Attack_Chop', spin: '2H_Melee_Attack_Spin', dash: '1H_Melee_Attack_Stab',
  suprema: '2H_Melee_Attack_Chop', death: 'Death_A'
};
// fração do clipe em que cai o impacto (STARTUP termina aqui; ACTIVE vai até hitEnd)
const HIT = { attack1: [0.28, 0.5], attack2: [0.3, 0.52], attack3: [0.35, 0.55], power: [0.38, 0.55], spin: [0.15, 0.75], dash: [0.25, 0.5], suprema: [0.35, 0.55] };

export function attachHeroGlb(hero, opts = {}) {
  const info = { status: 'loading', style: null, anim: null, clip: null, changes: 0, meshes: 0, error: null, weapon: null };
  let rig = null;
  let animator = null;
  let headBone = null; let headBase = null; let headHasScaleTrack = false;
  let wanted = opts.styleId || 'cavaleiro';
  let built = null;
  let flash = 0;
  const glowMats = [];
  const tintMats = [];
  const rimU = { color: { value: new THREE.Color(0x66e6ff) }, k: { value: 0.35 } }; // M10 passo 3: contorno ligado à NEXA

  let buildSeq = 0;
  async function build(styleId, sync = false) {
    const token = ++buildSeq;
    // estilo base + editor do Caio (cor primária, cor do brilho, capacete/chapéu, capa, espada)
    const cu = opts.custom || {};
    const base = heroStyleOf(styleId);
    const style = { ...base, ...(cu.primary != null ? { primary: cu.primary } : {}), ...(cu.glow != null ? { glow: cu.glow } : {}), ...(cu.cape != null ? { capeOn: !!cu.cape } : {}), ...(cu.weapon ? { weapon: cu.weapon, offhand: cu.weapon === base.weapon ? base.offhand : null } : {}), headOn: cu.head != null ? !!cu.head : true };
    const names = ['hero-knight', style.model, 'hero-props'];
    const pre = names.map((n) => getLoaded(n, !!opts.force));
    const [anim, body, props] = pre.every(Boolean) ? pre : await Promise.all(names.map((n) => loadModel(n, !!opts.force)));
    info.sync = pre.every(Boolean);
    if (!anim || !body) { info.status = 'fallback'; info.error = 'glb indisponível'; return; }
    if (token !== buildSeq) return; // pedido mais novo no meio do carregamento
    disposeRig();
    const eq = opts.equip || {};
    const primary = eq.body?.tint ?? style.primary;
    const model = cloneSkinned(body.scene);
    const group = new THREE.Group();
    group.name = 'heroGlb';
    group.add(model);
    // cabeça menor (osso 'head') + altura maior + largura menor → silhueta alta e magra
    headBone = findNode(model, 'head');
    headBase = headBone ? headBone.scale.clone() : null;
    headHasScaleTrack = !!headBone && anim.animations.some((c) => c.tracks.some((t) => t.name.startsWith(`${headBone.name}.`) && t.name.endsWith('.scale')));
    if (headBone) headBone.scale.multiplyScalar(HERO_PROP.head);
    fitHeight(model, HERO_PROP.height);
    model.scale.x *= HERO_PROP.width; model.scale.z *= HERO_PROP.width;
    info.proportions = { ...HERO_PROP, headBone: headBone?.name || null };
    let meshes = 0;
    rimU.color.value.set(style.glow ?? 0x66e6ff);
    model.traverse((o) => {
      if (!o.isMesh) return;
      // props do próprio personagem ficam escondidos (a arma vem de hero-props); capacete/capa conforme o estilo
      if (!o.isSkinnedMesh) {
        const keep = (style.head && style.headOn && !eq.helmet && o.name === style.head) || // capacete do Arsenal substitui o do estilo
           (style.capeOn && o.name === style.cape);
        o.visible = !!keep;
      }
      if (o.visible) meshes++;
      const m = o.material.clone();
      m.color.set(0xffffff).lerp(new THREE.Color(primary), 0.42);
      // LEITURA no escuro (câmera atrás, cena noturna): metal menos espelhado (sem env map ele fica preto)
      // + auto-iluminação leve na cor do estilo → silhueta visível de costas, sem luz extra (mesmo nº de luzes/shaders)
      m.metalness = 0.28; m.roughness = 0.52;
      m.emissive = new THREE.Color(primary).lerp(new THREE.Color(0xffffff), 0.2).multiplyScalar(0.1).add(new THREE.Color(style.glow).multiplyScalar(0.06));
      o.material = m;
      m.userData.baseEmissive = m.emissive.clone();
      // M10 passo 3: contorno (fresnel) na cor do estilo — silhueta legível de costas; força = NEXA atual
      if (getConfig().graphics.heroRim !== false) {
        m.onBeforeCompile = (sh) => {
          sh.uniforms.heroRimColor = rimU.color; sh.uniforms.heroRimK = rimU.k;
          sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 heroRimColor; uniform float heroRimK;')
            .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n{ float rf = 1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0); totalEmissiveRadiance += heroRimColor * (rf * rf * rf) * heroRimK; }');
        };
        m.customProgramCacheKey = () => 'heroRim';
      }
      tintMats.push(m);
      o.castShadow = true;
    });
    // NÚCLEO no peito (esfera emissiva + halo aditivo) — bloom pega o brilho
    const chest = findNode(model, 'chest');
    const glowCol = new THREE.Color(style.glow);
    const coreMat = new THREE.MeshBasicMaterial({ color: glowCol.clone().lerp(new THREE.Color(0xffffff), 0.45) });
    const haloMat = new THREE.MeshBasicMaterial({ color: glowCol, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
    glowMats.push(haloMat);
    if (chest) {
      model.updateMatrixWorld(true);
      const inv = 1 / (chest.getWorldScale(new THREE.Vector3()).x || 1);
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.05 * inv, 10, 8), coreMat);
      core.position.set(0, 0.32 * inv, 0.2 * inv); core.name = 'heroCore';
      const halo = new THREE.Mesh(new THREE.CircleGeometry(0.13 * inv, 16), haloMat);
      halo.position.set(0, 0.32 * inv, 0.215 * inv);
      const haloBack = new THREE.Mesh(new THREE.CircleGeometry(0.1 * inv, 14), haloMat);
      haloBack.position.set(0, 0.3 * inv, -0.2 * inv); haloBack.rotation.y = Math.PI;
      chest.add(core, halo, haloBack);
    }
    // ARMA: prop KayKit na mão direita com brilho (emissivo + aura aditiva)
    // equipamento do inventário (data/items.json → visual) muda arma/placas/acessório no modelo
    const wv = eq.weapon && eq.weapon.model && eq.weapon.model !== 'style' ? eq.weapon : null;
    const weaponName = wv ? wv.model : style.weapon;
    const wGlow = wv?.glow != null ? new THREE.Color(wv.glow) : glowCol;
    const wMesh = attachWeapon(model, props, weaponName, 'r', wGlow);
    if (wv?.spear && wMesh) {
      // lança: ponta de energia no topo do cajado
      const tipMat = new THREE.MeshBasicMaterial({ color: wGlow.clone().lerp(new THREE.Color(0xffffff), 0.3) });
      wMesh.geometry.computeBoundingBox();
      const bb = wMesh.geometry.boundingBox;
      const tip = new THREE.Mesh(new THREE.ConeGeometry((bb.max.x - bb.min.x) * 0.9, (bb.max.y - bb.min.y) * 0.16, 6), tipMat);
      tip.position.set(0, bb.max.y, 0); tip.name = 'spearTip';
      wMesh.add(tip);
    }
    if (!wv && style.offhand) attachWeapon(model, props, style.offhand, 'l', glowCol);
    // ARSENAL: cajado → orbe de energia na ponta (cor da família); arco → corda de luz
    if (wv?.family && wMesh && ['2H_Staff', '1H_Wand', '2H_Crossbow', '1H_Crossbow'].includes(weaponName)) {
      wMesh.geometry.computeBoundingBox();
      const bb = wMesh.geometry.boundingBox;
      const om = new THREE.MeshBasicMaterial({ color: wGlow.clone().lerp(new THREE.Color(0xffffff), 0.35) });
      const sz = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z);
      const orb = new THREE.Mesh(/Staff|Wand/.test(weaponName) ? new THREE.IcosahedronGeometry(sz * 0.38, 1) : new THREE.BoxGeometry(sz * 0.18, (bb.max.y - bb.min.y) * 0.5, sz * 0.18), om);
      orb.position.set(0, /Staff|Wand/.test(weaponName) ? bb.max.y : (bb.max.y + bb.min.y) / 2, 0); orb.name = /Staff|Wand/.test(weaponName) ? 'staffOrb' : 'bowString';
      wMesh.add(orb);
    }
    // armadura: ombreiras (placas) nos braços
    if (eq.armor?.plates) {
      const pm = new THREE.MeshStandardMaterial({ color: eq.armor.color ?? 0x5a6070, metalness: 0.8, roughness: 0.3, emissive: new THREE.Color(eq.armor.glow ?? style.glow), emissiveIntensity: eq.armor.glow ? 0.5 : 0.08 });
      tintMats.push(pm);
      for (const sd of ['l', 'r']) {
        const b = findNode(model, `upperarm${sd}`);
        if (!b) continue;
        model.updateMatrixWorld(true);
        const ws = b.getWorldScale(new THREE.Vector3()).x || 1;
        const pad = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.09, 0.22), pm);
        pad.scale.setScalar(1 / ws); pad.position.set(0, 0.02 / ws, 0); pad.name = 'armorPad';
        b.add(pad);
      }
    }
    // acessório: pingente brilhante no peito
    if (eq.accessory?.glow != null && chest) {
      model.updateMatrixWorld(true);
      const ws = chest.getWorldScale(new THREE.Vector3()).x || 1;
      const am = new THREE.MeshBasicMaterial({ color: new THREE.Color(eq.accessory.glow).lerp(new THREE.Color(0xffffff), 0.25) });
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.035), am);
      gem.scale.setScalar(1 / ws); gem.position.set(0.09 / ws, 0.36 / ws, 0.2 / ws); gem.name = 'accessoryGem';
      chest.add(gem);
    }
    // ARSENAL: capacete (crista/viseira) e calça (grevas) na cor da família
    const famMat = (v) => { const m = new THREE.MeshStandardMaterial({ color: v.color ?? 0x50555e, metalness: 0.75, roughness: 0.32, emissive: new THREE.Color(v.glow ?? style.glow), emissiveIntensity: 0.55 }); tintMats.push(m); return m; };
    let helmetOn = false; let greaves = 0;
    if (eq.helmet) {
      const hb = findNode(model, 'head');
      if (hb) {
        model.updateMatrixWorld(true);
        const ws = hb.getWorldScale(new THREE.Vector3()).x || 1;
        const hm = famMat(eq.helmet);
        // VEST: capacete de verdade — casco medido na CABEÇA do modelo (vértices do osso 'head', em metros,
        // eixos do corpo: y cima, z frente) + viseira + crista/chifres. Grupo preso ao osso → acompanha a animação.
        const hbx = headBoxOf(model, hb, style.model);
        const hq = hb.getWorldQuaternion(new THREE.Quaternion()); const mq = model.getWorldQuaternion(new THREE.Quaternion());
        const hg = new THREE.Group(); hg.name = 'arsenalHelmet';
        hg.quaternion.copy(hq.invert().multiply(mq)); hg.scale.setScalar(1 / ws);
        const c = hbx.getCenter(new THREE.Vector3()); const sz = hbx.getSize(new THREE.Vector3());
        const R = Math.max(sz.x, sz.z) * 0.56;
        const shell = new THREE.Mesh(new THREE.SphereGeometry(R, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), hm);
        shell.scale.set(1, Math.max(0.75, (sz.y * 0.5) / R), 1); shell.position.set(c.x, c.y + sz.y * 0.06, c.z); shell.name = 'helmetShell';
        const brim = new THREE.Mesh(new THREE.TorusGeometry(R * 0.99, R * 0.06, 6, 24), hm);
        brim.rotation.x = Math.PI / 2; brim.position.copy(shell.position); brim.name = 'helmetBrim';
        const topY = c.y + sz.y * 0.06 + Math.max(0.75, (sz.y * 0.5) / R) * R;
        const crest = new THREE.Mesh(eq.helmet.crest === 'horns' ? new THREE.ConeGeometry(R * 0.14, R * 0.6, 5) : new THREE.BoxGeometry(R * 0.14, R * 0.3, R * 1.4), hm);
        crest.position.set(c.x, topY + (eq.helmet.crest === 'horns' ? R * 0.22 : R * 0.05), c.z); crest.name = 'helmetCrest';
        if (eq.helmet.crest === 'horns') {
          for (const sx of [-1, 1]) { const h2 = new THREE.Mesh(new THREE.ConeGeometry(R * 0.12, R * 0.7, 5), hm); h2.position.set(c.x + sx * R * 0.8, c.y + sz.y * 0.3, c.z); h2.rotation.z = -sx * 0.75; h2.name = 'helmetHorn'; hg.add(h2); }
        }
        const visor = new THREE.Mesh(new THREE.BoxGeometry(R * 1.2, R * 0.13, R * 0.12), new THREE.MeshBasicMaterial({ color: new THREE.Color(eq.helmet.glow ?? style.glow).lerp(new THREE.Color(0xffffff), 0.3) }));
        visor.position.set(c.x, c.y + sz.y * 0.1, hbx.max.z + R * 0.02); visor.name = 'helmetVisor';
        if (eq.helmet.crest === 'demon') {
          // INFERNAL: elmo demoníaco/industrial — casco + máscara de metal ESCURO (não tingidos pela família),
          // chifres curvos para trás em 3 gomos, viseira em fenda incandescente, respiro e marcas de calor.
          const gl = new THREE.Color(eq.helmet.glow ?? 0xff3a1e);
          const dark = new THREE.MeshStandardMaterial({ color: 0x34363c, metalness: 0.45, roughness: 0.5 }); // ferro escuro (o brilho fica só nas marcas)
          const hot = new THREE.MeshBasicMaterial({ color: gl.clone().multiplyScalar(1.7) });
          const horn = new THREE.MeshStandardMaterial({ color: 0x3b302b, metalness: 0.35, roughness: 0.6 });
          shell.material = dark; brim.material = dark; crest.visible = false;
          const sy = shell.scale.y;
          // máscara: faixa frontal da esfera abaixo do casco (cobre o rosto)
          const mask = new THREE.Mesh(new THREE.SphereGeometry(R * 1.02, 18, 6, Math.PI / 2 - 1.15, 2.3, Math.PI * 0.5, Math.PI * 0.3), dark);
          mask.scale.set(1, Math.min(1.25, sy), 1); mask.position.copy(shell.position); mask.name = 'helmetMask'; hg.add(mask);
          const fz = c.z + R * 1.04; const by = shell.position.y;
          visor.material = hot; visor.scale.set(0.78, 0.5, 1); visor.position.set(c.x, by - R * 0.2, fz); // fenda incandescente na altura dos olhos
          const vent = new THREE.Mesh(new THREE.BoxGeometry(R * 0.36, R * 0.05, R * 0.06), hot);
          vent.position.set(c.x, by - R * 0.62, fz - R * 0.12); vent.name = 'helmetHeat'; hg.add(vent);
          const vent2 = vent.clone(); vent2.scale.x = 0.7; vent2.position.y -= R * 0.1; hg.add(vent2);
          for (const sx of [-1, 1]) {
            let px = c.x + sx * R * 0.6; let py = by + sy * R * 0.62; let pz = c.z; let rz = -sx * 1.0; let rx = -0.3; let r0 = R * 0.2;
            for (let k = 0; k < 3; k++) {
              const L = R * (0.62 - k * 0.12);
              const seg = new THREE.Mesh(new THREE.CylinderGeometry(r0 * 0.66, r0, L, 7, 1).translate(0, L / 2, 0), k === 2 ? hot : horn);
              seg.position.set(px, py, pz); seg.rotation.set(rx, 0, rz); seg.name = 'helmetHorn'; hg.add(seg);
              const dir = new THREE.Vector3(0, 1, 0).applyEuler(seg.rotation);
              px += dir.x * L * 0.95; py += dir.y * L * 0.95; pz += dir.z * L * 0.95;
              rz += sx * 0.7; rx -= 0.45; r0 *= 0.66;
            }
            const mark = new THREE.Mesh(new THREE.BoxGeometry(R * 0.05, R * 0.34, R * 0.05), hot);
            mark.position.set(c.x + sx * R * 0.34, by + sy * R * 0.4, c.z + R * 0.92); mark.rotation.set(-0.5, 0, sx * 0.3); mark.name = 'helmetHeat'; hg.add(mark);
          }
          const ridge = new THREE.Mesh(new THREE.BoxGeometry(R * 0.1, R * 0.18, R * 1.2), dark);
          ridge.position.set(c.x, topY + R * 0.02, c.z); ridge.name = 'helmetRidge'; hg.add(ridge);
        }
        hg.add(shell, brim, crest, visor); hb.add(hg); helmetOn = true;
      }
    }
    if (eq.pants) {
      const gm = famMat(eq.pants);
      for (const sd of ['l', 'r']) {
        const b = findNode(model, `lowerleg${sd}`);
        if (!b) continue;
        model.updateMatrixWorld(true);
        const ws = b.getWorldScale(new THREE.Vector3()).x || 1;
        const g = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.24, 0.15), gm);
        g.scale.setScalar(1 / ws); g.position.set(0, 0.14 / ws, 0.01 / ws); g.name = 'pantsGreave';
        b.add(g); greaves++;
      }
    }
    info.helmetKind = helmetOn ? (eq.helmet.crest === 'demon' ? 'demon' : eq.helmet.crest === 'horns' ? 'horns' : 'crest') : null;
    info.helmetParts = helmetOn ? (() => { const o = []; findNode(model, 'head')?.traverse((q) => { if (q.isMesh && /^helmet/.test(q.name)) o.push(`${q.name}:${q.material.color?.getHexString()}`); }); return o; })() : [];
    info.helmet = helmetOn; info.greaves = greaves; info.weaponFamily = wv?.family || null;
    animator = createAnimator(model, anim.animations, CLIPS);
    rig = { group, model, style, primary };
    buildReflection(model, primary);
    hero.root.add(group);
    hero.setProceduralBodyVisible(false);
    info.status = 'ready'; info.style = style.id; info.meshes = meshes; info.weapon = weaponName; info.armorPads = !!eq.armor?.plates; info.accessory = eq.accessory?.glow != null; info.bodyTint = primary; info.glow = style.glow; info.headOn = !!(style.head && style.headOn && !eq.helmet); info.capeOn = !!style.capeOn; info.model = style.model;
    opts.onReady?.(rig, info.sync);
  }

  function attachWeapon(model, props, name, side, glowCol) {
    if (!props || !name) return null;
    let src = null;
    props.scene.traverse((o) => { if (!src && o.isMesh && o.name.replace(/^(Knight|Rogue_Hooded|Mage|Barbarian)/, '') === name) src = o; });
    const slot = findNode(model, `handslot${side}`);
    if (!src || !slot) return null;
    const w = src.clone();
    w.position.copy(src.position); w.quaternion.copy(src.quaternion); w.scale.copy(src.scale);
    const m = src.material.clone();
    m.color.set(0xd8ecff); m.emissive = glowCol.clone(); m.emissiveIntensity = 1.6; m.metalness = 0.7; m.roughness = 0.2;
    w.material = m; w.name = `heroWeapon_${side}`;
    glowMats.push(m);
    // aura: cópia levemente maior aditiva
    const auraMat = new THREE.MeshBasicMaterial({ color: glowCol, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false });
    const aura = new THREE.Mesh(w.geometry, auraMat); aura.scale.setScalar(1.12); aura.name = 'heroWeaponAura';
    w.add(aura);
    slot.add(w);
    return w;
  }

  /**
   * REFLEXO no chão molhado (só preset ALTO): cópias das malhas com esqueleto que USAM OS MESMOS OSSOS
   * (bindMode detached + matriz espelho no plano do chão). Transparente, sem luz (MeshBasic), sem sombra.
   * Puramente visual: não toca em hitbox/tempos; desligado → nada é criado/desenhado.
   */
  let refl = null; let reflOn = !!opts.reflection;
  const MIRROR = new THREE.Matrix4(); const TMPM = new THREE.Matrix4(); const TMPV = new THREE.Vector3();
  function buildReflection(model, primary) {
    disposeReflection();
    if (!reflOn || !hero.root.parent) return;
    const g = new THREE.Group(); g.name = 'heroReflection'; g.matrixAutoUpdate = false;
    const col = new THREE.Color(primary).lerp(new THREE.Color(0x9fdcff), 0.55);
    const mats = [];
    model.traverse((o) => {
      if (!o.isSkinnedMesh || !o.visible) return;
      const m = new THREE.MeshBasicMaterial({ map: o.material.map || null, color: col, transparent: true, opacity: 0.2, depthWrite: false, depthTest: false, fog: true });
      mats.push(m);
      const r = new THREE.SkinnedMesh(o.geometry, m);
      r.bindMode = THREE.DetachedBindMode;
      r.bind(o.skeleton, o.bindMatrix);
      r.bindMatrixInverse.identity(); // ossos já em coordenadas de mundo → só a matriz espelho do grupo
      r.frustumCulled = false; r.castShadow = false; r.receiveShadow = false; r.renderOrder = 1;
      r.matrixAutoUpdate = false; r.matrix.identity();
      g.add(r);
    });
    const parent = hero.root.parent;
    if (!parent || !g.children.length) return;
    parent.add(g);
    refl = { group: g, mats, parent };
    info.reflection = g.children.length;
  }
  function disposeReflection() {
    if (!refl) return;
    refl.parent.remove(refl.group);
    for (const m of refl.mats) m.dispose();
    refl = null; info.reflection = 0;
  }
  function updateReflection() {
    if (!refl) return;
    // espelho no plano do chão (y do pé do herói, em coords do pai): T(0,2y,0)·S(1,-1,1)
    // ossos já estão em MUNDO → matriz do grupo = (mundo do pai)⁻¹ · espelho no y de mundo do pé
    hero.root.getWorldPosition(TMPV);
    MIRROR.set(1, 0, 0, 0, 0, -1, 0, 2 * TMPV.y, 0, 0, 1, 0, 0, 0, 0, 1);
    refl.parent.updateWorldMatrix(true, false);
    refl.group.matrix.copy(TMPM.copy(refl.parent.matrixWorld).invert()).multiply(MIRROR);
    refl.group.matrixWorldNeedsUpdate = true;
    refl.group.visible = hero.root.visible && !!rig?.group.visible;
  }
  function setReflection(on) {
    on = !!on;
    if (on !== reflOn) { reflOn = on; if (!on) disposeReflection(); }
    if (reflOn && rig && !refl && hero.root.parent) buildReflection(rig.model, rig.primary);
  }

  function disposeRig() {
    disposeReflection();
    if (!rig) return;
    hero.root.remove(rig.group);
    animator?.mixer.stopAllAction();
    rig = null; animator = null;
    tintMats.length = 0; glowMats.length = 0;
  }

  /** chamado por hero.update depois da lógica procedural */
  function update(dt, v) {
    if (!rig || !animator) return;
    let pose = null; let poseT = 0;
    const ph = (key, phase, t) => {
      const [a, b] = HIT[key] || [0.3, 0.55];
      if (phase === 'STARTUP' || phase === 'WINDUP') return a * t;
      if (phase === 'ACTIVE') return a + (b - a) * t;
      return b + (1 - b) * t;
    };
    const act = v.action;
    if (act) {
      const t = Math.max(0, Math.min(1, act.t || 0));
      if (act.kind === 'dodge') {
        const ly = Math.atan2(act.dirX || 0, -(act.dirY || 0)) - v.yaw;
        const f = Math.cos(ly); const s = Math.sin(ly);
        pose = Math.abs(f) >= Math.abs(s) ? (f >= 0 ? 'dodgeF' : 'dodgeB') : (s > 0 ? 'dodgeR' : 'dodgeL');
        poseT = t;
      } else if (act.kind === 'guard') { pose = 'guard'; poseT = 0.35 + 0.15 * Math.sin(v.time * 3); }
      else if (act.kind === 'golpe_poderoso') { pose = 'power'; poseT = ph('power', act.phase, t); }
      else if (act.kind === 'ataque_area') { pose = 'spin'; poseT = ph('spin', act.phase, t); }
      else if (act.kind === 'dash') { pose = 'dash'; poseT = ph('dash', act.phase, t); }
      else if (act.kind === 'suprema') { pose = 'suprema'; poseT = ph('suprema', act.phase, t); }
    } else if (v.attacking) {
      pose = `attack${Math.max(0, Math.min(2, v.combo)) + 1}`;
      poseT = ph(pose, v.attackPhase, v.attackT);
    } else if (v.hurtT > 0) { pose = 'hurt'; poseT = 1 - v.hurtT / 0.32; }
    const idle = Math.max(0, 1 - v.moveK);
    // VIL: escala da cabeça IDEMPOTENTE — parte da base a cada quadro (o mixer sobrescreve se o clipe animar a escala);
    // antes multiplicava ×0,72 em cima do valor do quadro anterior quando o clipe atual não tinha trilha de escala → cabeça sumia
    if (headBone && headBase) headBone.scale.copy(headBase);
    animator.update(dt, {
      pose, poseT, fade: pose && pose.startsWith('dodge') ? 0.06 : 0.1,
      loco: { idle, walk: v.moveK * (1 - v.runK), run: v.moveK * v.runK },
      locoRate: Math.max(0.6, Math.min(1.6, v.speed / Math.max(0.5, v.runK > 0.5 ? v.runSpeed : v.walkSpeed)))
    });
    updateReflection();
    if (headBone && headBase && HERO_PROP.head !== 1) {
      headBone.scale.multiplyScalar(HERO_PROP.head);
      // trava de segurança: nunca menor que 60% nem maior que 140% do tamanho pretendido
      const want = headBase.x * HERO_PROP.head; const k = headBone.scale.x / (want || 1);
      if (!(k > 0.6 && k < 1.4)) headBone.scale.copy(headBase).multiplyScalar(HERO_PROP.head);
    }
    if (headBone && headBase) {
      info.headScale = +(headBone.scale.x / ((headBase.x * HERO_PROP.head) || 1)).toFixed(3);
      if (((info._hc = (info._hc || 0) + 1) % 20) === 1 || (info.helmet && !info.helmetCheck)) {
        const hg = headBone.getObjectByName('arsenalHelmet');
        if (hg) { hg.updateWorldMatrix(true, true); const bb = new THREE.Box3().setFromObject(hg); const c = bb.getCenter(new THREE.Vector3()); const hp = headBone.getWorldPosition(new THREE.Vector3()); const sz = bb.getSize(new THREE.Vector3()); info.helmetCheck = { dxz: +Math.hypot(c.x - hp.x, c.z - hp.z).toFixed(3), dy: +(c.y - hp.y).toFixed(3), size: +Math.max(sz.x, sz.z).toFixed(3) }; }
        else info.helmetCheck = null;
      }
    }
    info.anim = animator.state; info.clip = animator.clipOf(animator.state); info.changes = animator.changes;
    // carga de especial acende a arma; dano pisca vermelho
    for (const m of glowMats) if (m.emissiveIntensity !== undefined && m.isMeshStandardMaterial) m.emissiveIntensity = 1.6 + v.charge * 4;
    { const G = getConfig().graphics; const nx = v.nexa == null ? 0.5 : Math.max(0, Math.min(1, v.nexa)); rimU.k.value = (G.heroRimBase ?? 0.18) + (G.heroRimNexa ?? 0.42) * nx + (v.charge || 0) * 0.5; info.rimK = +rimU.k.value.toFixed(2); }
    const hurtOn = v.hurtT > 0.12;
    if (hurtOn !== !!flash) {
      flash = hurtOn ? 1 : 0;
      const red = new THREE.Color(0x801010);
      for (const m of tintMats) m.emissive.copy(hurtOn ? red : (m.userData.baseEmissive || red.setHex(0)));
    }
  }

  function setStyle(id, extra = {}) {
    if (extra.equip !== undefined) opts.equip = extra.equip;
    if (extra.custom !== undefined) opts.custom = extra.custom;
    wanted = id || 'cavaleiro';
    const key = `${wanted}|${JSON.stringify(opts.equip || {})}|${JSON.stringify(opts.custom || {})}`;
    if (built === key && (rig || info.status === 'loading')) return;
    built = key;
    info.status = 'loading';
    build(wanted).catch((e) => { info.status = 'fallback'; info.error = String(e?.message || e); console.warn('[hero-glb]', e); hero.setProceduralBodyVisible(true); });
  }
  setStyle(wanted);
  return { update, setStyle, setReflection, info, getRig: () => rig };
}
