/**
 * NEXARA FPS WebGL renderer (Three.js) — cybergrunge HD pass.
 * Floor/walls textured; enemies/NPCs enriched low-poly 3D (feet on floor).
 * Bloco V: câmera padrão em 3ª PESSOA sobre o ombro (herói procedural animado, braço-mola).
 * ?fp=1 mantém a 1ª pessoa antiga (braços/lâmina do viewmodel, sem corpo do herói).
 * Presentation only — game state remains tile-authoritative.
 * gp1: um único rAF — player-motion (movimento contínuo) → IA → câmera suavizada → render.
 * gp2: a simulação (movimento + ataque + IA + hit-stop) vive em main.simulate
 *      (hooks.simulate); aqui ficam só os visuais: telegraph dos inimigos,
 *      faíscas (pool), vinheta de dano, aviso de borda e pose da lâmina.
 */
import * as THREE from 'three';
import { creatureMaps, lathe, limb, floorTex, skyTex, addRim, setKitDetail } from './creature-kit.js?v=20261009fast2';
import { buildArenaDressing } from './arena-dressing.js?v=20261009fast2';
import { createFpsCamera, TILE, EYE_HEIGHT, VIEW_MODE, setBossFraming } from './fps-camera.js?v=20261009fast2';
import { createHeroModel } from './hero-model.js?v=20261009fast2';
import { attachEnemyGlb, getEnemyGlbStats } from './enemy-glb.js?v=20261009fast2';
import { attachHeroGlb } from './hero-glb.js?v=20261009fast2';
import { getModelStats, setPresetModels, modelsEnabled } from './model-lib.js?v=20261009fast2';
import { getDragonGlbStats, setPresetDragons } from './dragon-glb.js?v=20261009fast2';
import { createActionVfx } from './action-vfx.js?v=20261009fast2';
import { createPassiveVfx } from './passive-vfx.js?v=20261009fast2';
import { createFpsControls } from './fps-controls.js?v=20261009fast2';
import { createViewmodel } from './viewmodel.js?v=20261009fast2';
import { createDragonView } from './dragon-view.js?v=20261009fast2';
import { getTileType, monstersInZone, isWalkable } from '../map.js?v=20261009fast2';
import { getSprite } from '../assets.js?v=20261009fast2';
import { getAiView, getAiClock, AI_STATES, getBossView, getPosture } from '../enemy-ai.js?v=20261009fast2';
import { createBossDragon } from './boss-dragon-view.js?v=20261009fast2';
import { mergeStaticParts } from './merge-util.js?v=20261009fast2';
import { projectiles as enemyProjectiles, hazards as enemyHazardList } from '../enemy-behaviors.js?v=20261009fast2';
import { heroProjectiles, heroBursts, heroFxNow } from '../weapon-projectiles.js?v=20261009fast2';
import { getConfig, DEG, detectQualityTier, detectTouchMode, isSoftwareGL } from '../gameplay-config.js?v=20261009fast2';
import { createPostFx } from './post-fx.js?v=20261009fast2';
import { portraitKey, getPortraitSnapshot } from './hero-preview.js?v=20261009fast2';
import { createNeonEnvironment, createPuddleRoughness, createRain, createHaze } from './atmosphere.js?v=20261009fast2';
import { buildCity, ZONE_ACCENTS } from './city.js?v=20261009fast2';
import { groundAt, setGroundFn } from './ground.js?v=20261009fast2';
import { buildBrTerrain } from './br-terrain.js?v=20261009fast2';
import { brHeightAt, BR_SOLID } from '../br-map.js?v=20261009fast2';
/** ARENA PRINCIPAL: escala do relevo (unidades do mundo por unidade de altura do mapa). */
const BR_RELIEF = 1.2;

const TEX_BASE = new URL('../../assets/textures/', import.meta.url);
const FLOOR_COLORS = {
  g6: 0x8a9aaa,
  e4: 0x4a5868,
  ar: 0x7a8a9a,
  ca: 0x6c7c78
};
const WALL_COLORS = {
  g6: 0x8a7060,
  e4: 0x4a5564,
  ar: 0x6a7888,
  ca: 0x4c5c58
};
const ACCENT = 0x3ecfbf;
const AMBER = 0xffb040;
/** EVO: cores/escala por arquétipo (silhuetas distintas e legíveis à distância). */
const ARCH_LOOK = {
  A: { body: 0x7a2e2a, armor: 0xc04a40, eye: 0xff3a2a, glow: 0xff4a2a, scale: 1.0 },
  B: { body: 0x5a6a18, armor: 0xc8d040, eye: 0xfff04a, glow: 0xf0ff40, scale: 0.82 },
  C: { body: 0x2a3a7a, armor: 0x5a7ad0, eye: 0x6ad8ff, glow: 0x4ad8ff, scale: 0.98 },
  D: { body: 0x4a4038, armor: 0xa87838, eye: 0xffa030, glow: 0xff9a20, scale: 1.32, hpScale: 1.2 },
  E: { body: 0x3a1a5a, armor: 0x8a48c8, eye: 0xff4af0, glow: 0xff3ae8, scale: 1.0 },
  F: { body: 0x24242a, armor: 0xd4a020, eye: 0xffe070, glow: 0xffc830, scale: 1.15, hpScale: 1.25 },
  G: { body: 0x3a0e1c, armor: 0x9a1e3e, eye: 0xff2050, glow: 0xff2a6a, scale: 1.65, hpScale: 1.5 },
  // EVO: variantes (data/monsters.json → visual): mesmo arquétipo de IA, visual próprio
  A2: { arch: 'A', body: 0x2a0a12, armor: 0x8a1030, eye: 0xff2050, glow: 0xff1a40, scale: 1.08 },
  B2: { arch: 'B', body: 0x1a1030, armor: 0x5a3aa8, eye: 0xc89aff, glow: 0x9a6aff, scale: 0.86 },
  C2: { arch: 'C', body: 0x10302a, armor: 0x2a8a68, eye: 0x7affc8, glow: 0x5affb0, scale: 1.02 }
};

function zoneKey(zone) {
  if (!zone) return 'g6';
  if (zone.code === 'E4') return 'e4';
  if (zone.code === 'AR') return 'ar';
  if (zone.code === 'CA') return 'ca';
  return 'g6';
}

export function createFpsRenderer() {
  const fpsCam = createFpsCamera();
  let renderer = null;
  let scene = null;
  let worldRoot = null;
  let entityRoot = null;
  let viewmodel = null;
  let controls = null;
  let canvas = null;
  let wrap = null;
  let getState = () => null;
  let running = false;
  let raf = 0;
  let lastT = performance.now();
  let builtZoneId = null;
  let builtBrMap = null; // NEXARA FAST: mesmo id de zona, mapa novo a cada partida → reconstrói
  let hooks = {};
  let floatLayer = null;
  let flashEl = null;
  let crosshair = null;
  let sceneLights = { amb: null, hemi: null };
  let lastSize = { w: 0, h: 0, pr: 0 };
  /** Resolução adaptativa (gameplay-config.graphics). */
  const adaptiveOff = new URLSearchParams(location.search).get('adaptive') === '0';
  const perf = { pr: 0, emaMs: 16.7, lastAdjust: 0, samples: 0 };
  const liveKeys = new Set();
  const keyCache = new Map();
  let lastFrameError = '';
  /** Opções reusadas do player-motion (fallback sem hooks.simulate). */
  const motionOpts = { busy: false, facingFromCamera: true, onMoved: (info) => hooks.onMoved?.(info) };
  /** gp2: indicadores de ameaça / faíscas / vinheta. */
  let threatEl = null;
  let sparks = null;
  const tmpV3 = new THREE.Vector3();
  const shared = { alertMat: null, dangerMat: null, ringMat: null, ringGeo: null };
  const telegraphUids = [];
  /** gp3: visual do Mini Dragão (lógica em companion-dragon.js). */
  let dragonView = null;
  /** Bloco V: herói em 3ª pessoa. */
  let hero = null;
  let heroStyleId = 'cavaleiro';
  let heroExtra = {};
  const modelReadyAt = {};
  const heroSt = { yaw: 0, init: false };
  /** Bloco 4: VFX das ações (pool) + posição visual do herói para eles. */
  let actionVfx = null;
  /** Bloco 6: auras das passivas automáticas. */
  let passiveVfx = null;
  const sigExt = { owned: new Set(), aimPos: null, hpFrac: 1, nexaFrac: 0, camRight: { x: 1, z: 0 } };
  const markPosV = { x: 0, z: 0 };
  const heroVis = { x: 0, z: 0, yaw: 0 };
  const lockPosV = { x: 0, z: 0 };
  /** Bloco V: qualidade gráfica, pós-processamento, atmosfera, cidade. */
  let tierName = 'medium';
  let tierAuto = 'medium'; // o que o automático escolheria numa GPU real (toque → medium, desktop → high)
  let softwareGL = '';
  let tier = null;
  let postFx = null;
  let postFxError = '';
  let postFxPending = false;
  let vignetteEl = null;
  let rain = null;
  let haze = null;
  let city = null;
  let dressing = null; // EVO: cenário procedural do Campo/Arena
  let brWorld = null; // ARENA PRINCIPAL: terreno instanciado + marcadores
  let brDir = null; let brLights = []; let brLightAt = 0;
  const brFogTint = { id: null, at: 0, last: 0, target: new THREE.Color() };
  const dragonFx = { pts: null, vel: null, on: false, k: 0, el: null, n: 0, last: 0 };
  const brLod = { hidden: 0, shown: 0 };
  let puddleTex = null;
  let atmoT = 0;
  const frameStats = { calls: 0, tris: 0, ms: 16.7 };

  const entityMeshes = new Map(); // key → { mesh, kind, uid, mats }
  /** EVO: pool de bots por visual (arquétipo / patrulha / base). */
  const botPool = Object.create(null);
  const teleSeen = Object.create(null);
  /** EVO: barreiras dos portões do Campo de Ascensão (visíveis enquanto fechados). */
  const gateMeshes = [];
  const textureCache = new Map();

  const vfx = { floats: [], arcs: [], impacts: [], loots: [], sparks: [], time: 0 };

  function ensureDom() {
    wrap = document.getElementById('canvas-wrap');
    canvas = document.getElementById('game-canvas');
    if (!wrap || !canvas) return false;

    if (!renderer) {
      // EVO: descobre o preset ANTES de criar o renderer (antialias só no DESKTOP; no celular o bloom/ACES já suaviza)
      const touch = !!hooks.isTouchUi?.() || detectTouchMode();
      try {
        const probe = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl');
        softwareGL = probe ? isSoftwareGL(probe) : '';
        probe?.getExtension('WEBGL_lose_context')?.loseContext();
      } catch { softwareGL = ''; }
      tierName = detectQualityTier(touch, { softwareGL: !!softwareGL });
      tierAuto = detectQualityTier(touch, { softwareGL: false });
      const tierPre = getConfig().graphics.tiers[tierName];
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: tierPre?.antialias !== false,
        alpha: false,
        powerPreference: 'high-performance'
      });
      if (!softwareGL) softwareGL = isSoftwareGL(renderer.getContext());
      // GPU por software: começa na resolução mínima (a adaptativa sobe se sobrar fôlego)
      if (softwareGL && !adaptiveOff && getConfig().graphics.adaptiveResolution) perf.pr = getConfig().graphics.minPixelRatio;
      tier = getConfig().graphics.tiers[tierName];
      setPresetDragons(tier?.dragonModels !== false);
      setPresetModels(tier?.models !== false); // M3D: preset sem GLB → procedural (FPS ≥ build evoc)
      setKitDetail(tierName === 'high' ? 1 : tierName === 'medium' ? 0.75 : 0.5);
      renderer.setPixelRatio(Math.min(maxPr(), window.devicePixelRatio || 1));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      // Sombras só no nível 'high' (1 direcional, PCF barato)
      renderer.shadowMap.enabled = !!tier.shadows;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = getConfig().graphics.exposure;
      renderer.info.autoReset = false; // o composer renderiza várias passadas por quadro
    }

    if (!scene) {
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x121820);
      scene.fog = new THREE.Fog(0x121820, 14, 52);

      const amb = new THREE.AmbientLight(0x6a8090, 0.42);
      scene.add(amb);
      const hemi = new THREE.HemisphereLight(0x5a7898, 0x3a3020, 0.7);
      scene.add(hemi);
      sceneLights.amb = amb;
      sceneLights.hemi = hemi;

      worldRoot = new THREE.Group();
      worldRoot.name = 'world';
      scene.add(worldRoot);

      entityRoot = new THREE.Group();
      entityRoot.name = 'entities';
      scene.add(entityRoot);

      scene.add(fpsCam.camera);
      if (tier.envMap) {
        try { scene.environment = createNeonEnvironment(renderer); } catch (e) { console.warn('[fps-renderer] env map', e); }
      }
      if (tier.rain > 0) {
        rain = createRain(tier.rain);
        scene.add(rain.object);
      }
      if (tier.composer && !postFx && !postFxPending) {
        postFxPending = true;
        createPostFx(renderer, scene, fpsCam.camera, tier).then((fx) => {
          postFx = fx;
          postFxPending = false;
          lastSize = { w: 0, h: 0, pr: 0 }; // força setSize do composer
        }).catch((e) => {
          postFxPending = false;
          postFxError = String(e?.message || e);
          console.warn('[fps-renderer] pós-processamento indisponível — render direto:', postFxError);
          ensureVignette();
        });
      } else if (!tier.composer) ensureVignette();
      if (VIEW_MODE === 'third') {
        // M3D: modelo GLB animado (KayKit) carrega preguiçoso; até lá (ou se falhar) fica o procedural
        hero = createHeroModel({ styleId: heroStyleId, onGlbReady: (rig, sync) => { modelReadyAt.hero = performance.now(); if (!sync) { try { renderer.compile(scene, fpsCam.camera); } catch { /* sem compile */ } } } });
        scene.add(hero.root);
        hero.glb?.setStyle(heroStyleId, heroExtra);
      } else {
        viewmodel = createViewmodel(fpsCam.camera);
      }
      actionVfx = createActionVfx(scene);
      passiveVfx = createPassiveVfx(scene);
    }

    if (!floatLayer) {
      floatLayer = document.createElement('div');
      floatLayer.id = 'fps-float-layer';
      floatLayer.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:6;';
      wrap.appendChild(floatLayer);
    }
    if (!flashEl) {
      flashEl = document.createElement('div');
      flashEl.id = 'fps-hit-flash';
      // gp2: vinheta vermelha nas bordas (centro limpo) ao tomar dano
      flashEl.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:5;opacity:0;background:radial-gradient(ellipse at center,transparent 45%,rgba(200,30,20,0.28) 70%,rgba(200,20,10,0.62) 100%);transition:opacity 0.22s ease-out;';
      wrap.appendChild(flashEl);
    }
    if (!threatEl) {
      // Aviso direcional na borda da HUD: atacante preparando golpe fora da tela
      threatEl = document.createElement('div');
      threatEl.id = 'fps-threat';
      threatEl.setAttribute('aria-hidden', 'true');
      threatEl.style.cssText = 'position:absolute;left:0;top:0;width:34px;height:34px;margin:-17px 0 0 -17px;pointer-events:none;z-index:8;display:none;';
      threatEl.innerHTML = '<svg width="34" height="34" viewBox="0 0 34 34"><circle cx="17" cy="17" r="15" fill="rgba(60,0,0,0.45)" stroke="#ff3b30" stroke-width="2"/><path d="M17 5 L26 20 H20 V28 H14 V20 H8 Z" fill="#ff3b30"/></svg>';
      wrap.appendChild(threatEl);
    }
    if (!crosshair) {
      crosshair = document.createElement('div');
      crosshair.id = 'fps-crosshair';
      crosshair.style.cssText = 'position:absolute;left:50%;top:50%;width:14px;height:14px;margin:-7px 0 0 -7px;pointer-events:none;z-index:7;opacity:0.55;';
      crosshair.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="2" fill="none" stroke="#3ecfbf" stroke-width="1.2"/><path d="M7 1v3M7 10v3M1 7h3M10 7h3" stroke="#3ecfbf" stroke-width="1.2"/></svg>`;
      wrap.appendChild(crosshair);
    }
    return true;
  }

  function maxPr() {
    const g = getConfig().graphics;
    return Math.min(g.maxPixelRatio, tier?.maxPixelRatio ?? g.maxPixelRatio);
  }
  /** Nível 'low' / fallback: vinheta em CSS (sem custo de GPU extra). */
  function ensureVignette() {
    if (vignetteEl || !wrap) return;
    vignetteEl = document.createElement('div');
    vignetteEl.id = 'fps-vignette';
    vignetteEl.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:4;background:radial-gradient(ellipse at center,transparent 55%,rgba(0,6,10,0.55) 100%);';
    wrap.appendChild(vignetteEl);
  }

  /** Só redimensiona quando o tamanho muda (setSize por frame realoca o buffer). */
  // EVO: tamanho do wrap via ResizeObserver (sem ler layout a cada frame)
  const wrapSize = { w: 0, h: 0, ro: null };
  function wrapDims() {
    if (!wrapSize.ro && typeof ResizeObserver !== 'undefined') {
      wrapSize.ro = new ResizeObserver(() => { wrapSize.w = wrap.clientWidth; wrapSize.h = wrap.clientHeight; });
      wrapSize.ro.observe(wrap);
      wrapSize.w = wrap.clientWidth; wrapSize.h = wrap.clientHeight;
    }
    if (!wrapSize.ro) { wrapSize.w = wrap.clientWidth; wrapSize.h = wrap.clientHeight; }
    return wrapSize;
  }
  function resize() {
    if (!ensureDom()) return;
    const ws = wrapDims();
    const cssW = Math.max(40, ws.w);
    const cssH = Math.max(40, ws.h);
    const g = getConfig().graphics;
    const devPr = Math.min(maxPr(), window.devicePixelRatio || 1);
    if (!perf.pr) perf.pr = devPr;
    const pr = Math.min(devPr, perf.pr);
    if (cssW === lastSize.w && cssH === lastSize.h && pr === lastSize.pr) return;
    lastSize = { w: cssW, h: cssH, pr };
    renderer.setPixelRatio(pr);
    renderer.setSize(cssW, cssH, false);
    postFx?.setSize(cssW, cssH, pr);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    fpsCam.resize(cssW, cssH);
  }

  /** Mede o frame (EMA) e ajusta o pixel ratio com histerese — no máx. 1× por intervalo. */
  function adaptResolution(frameMs, now) {
    const g = getConfig().graphics;
    if (adaptiveOff || !g.adaptiveResolution) return;
    if (frameMs > 250) return; // aba voltou do background — ignora
    // EVO: aquecimento após trocar de zona (link de shaders/texturas) não conta — senão o adaptativo cortava luzes já no
    // 1º segundo, e cortar luz RECOMPILA todos os materiais iluminados (mais engasgo exatamente na entrada)
    if (perf.warmPending) { perf.warmPending = false; perf.zoneAt = now; perf.samples = 0; perf.emaMs = 16.7; }
    if (now - (perf.zoneAt || 0) < (g.adaptiveWarmupMs ?? 3000)) return;
    perf.emaMs += (frameMs - perf.emaMs) * 0.1;
    perf.samples++;
    if (perf.samples < 12 || now - perf.lastAdjust < g.adjustIntervalMs) return;
    const fps = 1000 / perf.emaMs;
    const devPr = Math.min(maxPr(), window.devicePixelRatio || 1);
    let next = perf.pr || devPr;
    // EVO: primeiro desliga EFEITOS (bloom → env map → luzes → cidade), depois resolução (piso 0,8 numa GPU real)
    // M10 fase 9: na Arena Principal a 1ª alavanca é a DENSIDADE (arena-br); efeitos/resolução só depois dela esgotar
    if (fps < g.downscaleFps && effectGate && !effectGate()) { perf.gated = (perf.gated || 0) + 1; return; }
    if (fps < g.downscaleFps && dropNextEffect(g)) {
      perf.lastAdjust = now;
      perf.samples = 0;
      return;
    }
    const floor = softwareGL ? g.minPixelRatio : Math.max(g.minPixelRatio, g.minPixelRatioHardware ?? 0.8);
    if (fps < g.downscaleFps && next > floor) {
      next = Math.max(floor, next * (fps < g.downscaleFps * 0.5 ? 0.65 : 0.8));
    }
    else if (fps > g.upscaleFps && next < devPr) next = Math.min(devPr, next * 1.1);
    if (Math.abs(next - perf.pr) > 0.01) {
      perf.pr = next;
      perf.lastAdjust = now;
      perf.samples = 0;
    }
  }

  /** EVO: degraus de qualidade adaptativa (efeitos antes da resolução). */
  // M10 fase 9 — escada: inimigos distantes → partículas → efeitos → detalhe de cenário → frequência da IA longe
  const dropped = { enemyLod: false, particles: false, bloom: false, envMap: false, pointLights: false, city: false, rain: false, brDecor: false, aiFar: false };
  let effectGate = null; let aiFarHook = null; let brLodK = 1; let particleK = 1;
  function dropNextEffect(g) {
    for (const step of g.adaptiveLadder || []) {
      if (dropped[step]) continue;
      if (step === 'enemyLod') {
        if (brLodK < 1) { dropped.enemyLod = true; continue; }
        brLodK = getConfig().graphics.adaptiveEnemyLodK ?? 0.75; // inimigos longe somem mais cedo (IA/HUD seguem)
      } else if (step === 'particles') {
        if (particleK < 1 && (!rain?.object || !rain.object.visible)) { dropped.particles = true; continue; }
        particleK = getConfig().graphics.adaptiveParticleK ?? 0.5; if (rain?.object) rain.object.visible = false; dropped.rain = true;
      } else if (step === 'aiFar') {
        if (!aiFarHook) { dropped.aiFar = true; continue; }
        aiFarHook(getConfig().graphics.adaptiveAiLodK ?? 0.7);
      } else if (step === 'bloom') {
        if (!postFx?.bloom || !postFx.bloom.enabled) { dropped.bloom = true; continue; }
        postFx.bloom.enabled = false;
      } else if (step === 'envMap') {
        if (!scene?.environment) { dropped.envMap = true; continue; }
        scene.environment = null;
      } else if (step === 'pointLights') {
        let n = 0;
        // apaga por INTENSIDADE (esconder muda o nº de luzes → recompila todos os materiais = engasgo); na próxima troca
        // de zona elas já nascem escondidas (precompileZone) e o custo some de vez
        worldRoot?.traverse((o) => { if (o.isPointLight && o.visible && o.intensity > 0) { n++; if (n > 2) o.intensity = 0; } });
        if (n <= 2) { dropped.pointLights = true; continue; }
      } else if (step === 'rain') {
        if (!rain?.object || !rain.object.visible) { dropped.rain = true; continue; }
        rain.object.visible = false;
      } else if (step === 'brDecor') {
        // decoração das regiões (fase 8): some por inteiro (instâncias puramente visuais, sem recompilar shader)
        let n = 0; brWorld?.group.traverse((o) => { if (o.isInstancedMesh && /^br-(barrel|stub|fern|shroom|strip|vent|banner|ember)$/.test(o.name) && o.visible) { o.visible = false; n++; } });
        if (!n) { dropped.brDecor = true; continue; }
      } else if (step === 'city') {
        if (!city?.group || !city.group.visible) { dropped.city = true; continue; }
        city.group.visible = false;
      } else continue;
      dropped[step] = true;
      perf.dropLog = (perf.dropLog || []).concat(step);
      return true;
    }
    return false;
  }

  function entKey(prefix, id) {
    const k = prefix + id;
    let v = keyCache.get(k);
    if (!v) { v = `${prefix}:${id}`; keyCache.set(k, v); }
    return v;
  }

  /**
   * Orientação inicial ao entrar numa zona: olha para o corredor mais aberto
   * (evita nascer encarando parede / NPC colado). Só roda na construção da zona.
   */
  function orientAwayFromCrowding(state, zone) {
    const px = state.player.x;
    const py = state.player.y;
    const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    let best = null;
    let bestScore = -Infinity;
    for (const [dx, dy] of dirs) {
      let score = 0;
      for (let i = 1; i <= 6; i++) {
        const tx = px + dx * i;
        const ty = py + dy * i;
        if (!isWalkable(zone, tx, ty)) break;
        score += 1;
      }
      const nx = px + dx;
      const ny = py + dy;
      const npcNear = state._data.npcs.npcs.some((n) => n.zone === zone.id && n.x === nx && n.y === ny);
      const monNear = state.monstersAlive.some((m) => m.alive && m.zone === zone.id && m.x === nx && m.y === ny);
      if (npcNear || monNear) score -= 3;
      if (score > bestScore) {
        bestScore = score;
        best = [dx, dy];
      }
    }
    if (best) fpsCam.setYawInstant(Math.atan2(best[0], -best[1]));
  }

  function clearWorld() {
    if (!worldRoot) return;
    brWorld = null; brDir = null; brLights = []; brFogTint.id = null; brFogTint.at = 0;
    dragonFx.k = 0; dragonFx.last = 0; if (dragonFx.pts) dragonFx.pts.visible = false; if (dragonFx.el) { dragonFx.el.classList.remove('on'); dragonFx.on = false; }
    dressing?.dispose?.();
    dressing = null;
    city?.dispose();
    city = null;
    haze?.dispose();
    haze = null;
    while (worldRoot.children.length) {
      const c = worldRoot.children[0];
      worldRoot.remove(c);
      c.traverse?.((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
          else o.material.dispose();
        }
      });
    }
  }

  function clearEntities() {
    entityMeshes.clear();
    if (!entityRoot) return;
    while (entityRoot.children.length) {
      const c = entityRoot.children[0];
      entityRoot.remove(c);
      c.traverse?.((o) => {
        if (o.geometry && !o.geometry.userData?.shared) o.geometry.dispose();
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
          else if (!o.material.userData?.shared) {
            if (o.material.map && o.material.userData?._owned) o.material.map.dispose();
            o.material.dispose();
          }
        }
      });
    }
  }

  function getTexFromSprite(spriteId) {
    if (textureCache.has(spriteId)) return textureCache.get(spriteId);
    const img = getSprite(spriteId);
    if (!img || !img.complete) return null;
    const tex = new THREE.Texture(img);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    tex.userData = { _owned: true };
    textureCache.set(spriteId, tex);
    return tex;
  }

  function loadHdTex(name, repeatX = 1, repeatY = 1) {
    const key = `hd:${name}:${repeatX}x${repeatY}`;
    if (textureCache.has(key)) return textureCache.get(key);
    const loader = new THREE.TextureLoader();
    const tex = loader.load(new URL(name, TEX_BASE).href);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    tex.anisotropy = 4;
    textureCache.set(key, tex);
    return tex;
  }

  function buildZone(zone) {
    clearWorld();
    clearEntities();
    builtZoneId = zone.id; builtBrMap = zone.brMap || null;
    if (zone.br && zone.brMap) { buildBrWorld(zone); return; }
    setGroundFn(null);
    setTeleOnTop(false);
    // braço-mola da câmera: só paredes (e fora do mapa) bloqueiam
    fpsCam.setBlocker((tx, ty) => getTileType(zone, Math.floor(tx), Math.floor(ty)) === 'wall');
    heroSt.init = false;
    const key = zoneKey(zone);
    const floorCol = FLOOR_COLORS[key];
    const wallCol = WALL_COLORS[key];
    const bg = key === 'e4' ? 0x101820 : 0x141c24;
    const acc = ZONE_ACCENTS[key] || ZONE_ACCENTS.g6;
    scene.background = new THREE.Color(VIEW_MODE === 'third' ? acc.sky : bg);
    // névoa exponencial (neblina de chuva) — densidade por zona no config
    scene.fog = new THREE.FogExp2(VIEW_MODE === 'third' ? new THREE.Color(acc.sky).lerp(new THREE.Color(acc.b), 0.08) : bg, getConfig().graphics.fogDensity[key] ?? 0.022);
    // EVO gráficos: Campo/Arena com céu em GRADIENTE (textura de fundo 4×256, sem luz) e névoa na cor do horizonte
    const evoSky = (key === 'ca' || key === 'ar') && getConfig().graphics?.evoScenery !== false;
    if (evoSky) {
      const horizon = key === 'ca' ? '#0a1e42' : '#1f3550';
      scene.background = skyTex('#010309', key === 'ca' ? '#05112c' : '#0a1428', horizon);
      scene.fog = new THREE.FogExp2(new THREE.Color(horizon).multiplyScalar(0.8), (getConfig().graphics.fogDensity[key] ?? 0.022) * 0.9);
    }

    if (sceneLights.amb) { sceneLights.amb.intensity = key === 'e4' ? 0.38 : 0.48; sceneLights.amb.color.setHex(0x6a8090); }
    if (sceneLights.hemi) { sceneLights.hemi.intensity = key === 'e4' ? 0.58 : 0.72; sceneLights.hemi.color.setHex(0x5a7898); sceneLights.hemi.groundColor.setHex(0x3a3020); }
    if (renderer) renderer.toneMappingExposure = getConfig().graphics.exposure; // ARENA PRINCIPAL usa exposição própria (mais clara)

    const fw = zone.map.width * TILE;
    const fh = zone.map.height * TILE;
    const rx = Math.max(4, zone.map.width / 2);
    const ry = Math.max(4, zone.map.height / 2);

    const floorMap = loadHdTex('floor-metal-wet.png', rx, ry);
    const roughMap = loadHdTex('roughness-generic.png', rx, ry);
    const metalMap = loadHdTex('metalness-generic.png', rx, ry);
    // chão MOLHADO: máscara de poças no roughness (poças quase espelhadas refletem o env map neon)
    if (!puddleTex) puddleTex = createPuddleRoughness(9);
    const puddles = puddleTex.clone();
    puddles.repeat.set(rx * 0.8, ry * 0.8);
    puddles.needsUpdate = true;
    let floorDetail = null;
    if (evoSky) {
      // EVO: piso hexagonal procedural (frisos + trilhas de Nexa claras) no lugar da chapa genérica
      floorDetail = floorTex().clone();
      floorDetail.repeat.set(zone.map.width / 4, zone.map.height / 4);
      floorDetail.needsUpdate = true;
    }
    const floorMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(floorCol).multiplyScalar(floorDetail ? 0.95 : 0.72),
      map: floorDetail || floorMap,
      roughnessMap: puddles,
      metalnessMap: metalMap,
      roughness: 0.9,
      metalness: 0.5,
      envMapIntensity: 0.95
    });
    if (evoSky && key === 'ca') {
      // EVO (ref. do Caio): asfalto/placas MOLHADOS à noite — mais escuro e mais liso (brilho especular das luzes)
      floorMat.color.setHex(0x34404e); floorMat.roughness = 0.42; floorMat.metalness = 0.68;
    }
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(fw, fh), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(fw / 2, 0, fh / 2);
    floor.receiveShadow = true;
    worldRoot.add(floor);

    // Hazard decal strips on floor (visual only)
    const hazTex = loadHdTex('hazard-stripe.png', 8, 1);
    const hazMat = new THREE.MeshStandardMaterial({
      map: hazTex,
      transparent: true,
      opacity: 0.55,
      roughness: 0.7,
      metalness: 0.2,
      depthWrite: false
    });
    for (let i = 0; i < 3; i++) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(fw * 0.35, 0.35), hazMat);
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(fw * (0.25 + i * 0.25), 0.02, fh * (0.3 + (i % 2) * 0.25));
      worldRoot.add(strip);
    }

    const wallMap = loadHdTex('wall-rust.png', 1, 1.3);
    const wallMat = new THREE.MeshStandardMaterial({
      color: wallCol,
      map: wallMap,
      roughnessMap: roughMap,
      roughness: 0.72,
      metalness: 0.28
    });
    const wallGeo = new THREE.BoxGeometry(TILE, 2.8, TILE);

    const metalMat = new THREE.MeshStandardMaterial({
      color: 0x7a8694,
      map: loadHdTex('metal-plate.png', 1, 1),
      roughness: 0.45,
      metalness: 0.65
    });
    const rustMat = new THREE.MeshStandardMaterial({
      color: 0x8a5a40,
      map: loadHdTex('rust-detail.png', 1, 1),
      roughness: 0.85,
      metalness: 0.2
    });

    const propMats = {
      crate: new THREE.MeshStandardMaterial({ color: 0x6a5038, map: loadHdTex('metal-plate.png', 1, 1), roughness: 0.7, metalness: 0.15 }),
      barrel: new THREE.MeshStandardMaterial({ color: 0x4a5a48, roughness: 0.55, metalness: 0.4 }),
      scrap: rustMat,
      lamp: new THREE.MeshStandardMaterial({ color: ACCENT, emissive: ACCENT, emissiveIntensity: 0.7, roughness: 0.35 })
    };

    const wallPos = [];
    const neonPos = [];
    const gatePos = {};
    gateMeshes.length = 0;
    // Collect wall-adjacent walkable edges for props (never block tryMove tiles — offset off-center)
    const lampLights = [];
    for (let y = 0; y < zone.map.height; y++) {
      for (let x = 0; x < zone.map.width; x++) {
        const t = getTileType(zone, x, y);
        const wx = (x + 0.5) * TILE;
        const wz = (y + 0.5) * TILE;

        if (t === 'gate1' || t === 'gate2') {
          (gatePos[t] || (gatePos[t] = [])).push(wx, wz);
          continue;
        }
        if (t === 'wall') {
          // Bloco V: paredes/néons instanciados (1 draw call cada) — mesma geometria/posições
          wallPos.push(wx, wz);
          const h = ((x * 73856093) ^ (y * 19349663)) >>> 0;
          if ((h % 5) === 0) neonPos.push(wx, wz + TILE * 0.48);
          continue;
        }

        // Wall-adjacent clutter on walkable tiles — offset toward wall so tile center stays clear
        let nearWall = false;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (getTileType(zone, x + dx, y + dy) === 'wall') { nearWall = true; break; }
        }

        if (t === 'scrap' || t === 'bot_spawn' || t === 'street' || nearWall) {
          const h = ((x * 73856093) ^ (y * 19349663)) >>> 0;
          if ((h % 5) === 0) {
            const kind = h % 3;
            let prop;
            if (kind === 0) {
              prop = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), propMats.crate);
              prop.position.set(wx + 0.55, 0.28, wz - 0.45);
            } else if (kind === 1) {
              prop = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.55, 10), propMats.barrel);
              prop.position.set(wx - 0.5, 0.28, wz + 0.4);
            } else {
              prop = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.25, 0.35), propMats.scrap);
              prop.position.set(wx + 0.45, 0.14, wz + 0.5);
              prop.rotation.y = 0.4;
            }
            prop.castShadow = true;
            worldRoot.add(prop);
          }
          if ((h % 11) === 0) {
            const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 6), metalMat);
            pole.position.set(wx + 0.7, 0.8, wz - 0.7);
            worldRoot.add(pole);
            const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), propMats.lamp);
            lamp.position.set(wx + 0.7, 1.55, wz - 0.7);
            worldRoot.add(lamp);
            lampLights.push(lamp.position.clone()); // luz real só se sobrar orçamento do nível (tier.pointLights)
          }
        }

        if (t === 'exit_e4' || t === 'exit_g6') {
          const pad = new THREE.Mesh(
            new THREE.CylinderGeometry(0.5, 0.5, 0.08, 20),
            new THREE.MeshStandardMaterial({
              color: ACCENT,
              emissive: ACCENT,
              emissiveIntensity: 0.75,
              roughness: 0.35,
              metalness: 0.5
            })
          );
          pad.position.set(wx, 0.05, wz);
          worldRoot.add(pad);
        }
      }
    }

    {
      const dummy = new THREE.Object3D();
      const walls = new THREE.InstancedMesh(wallGeo, wallMat, wallPos.length / 2);
      for (let i = 0; i < wallPos.length / 2; i++) {
        dummy.position.set(wallPos[i * 2], 1.4, wallPos[i * 2 + 1]);
        dummy.updateMatrix();
        walls.setMatrixAt(i, dummy.matrix);
      }
      walls.instanceMatrix.needsUpdate = true;
      walls.castShadow = true;
      walls.receiveShadow = true;
      walls.name = 'walls';
      worldRoot.add(walls);
      const neonAcc = VIEW_MODE === 'third' ? acc.a : ACCENT;
      const neonMat = new THREE.MeshStandardMaterial({ color: neonAcc, emissive: neonAcc, emissiveIntensity: 1.6, roughness: 0.3 });
      const neons = new THREE.InstancedMesh(new THREE.BoxGeometry(TILE * 0.92, 0.06, 0.04), neonMat, Math.max(1, neonPos.length / 2));
      for (let i = 0; i < neonPos.length / 2; i++) {
        dummy.position.set(neonPos[i * 2], 2.35, neonPos[i * 2 + 1]);
        dummy.updateMatrix();
        neons.setMatrixAt(i, dummy.matrix);
      }
      neons.count = neonPos.length / 2;
      neons.instanceMatrix.needsUpdate = true;
      worldRoot.add(neons);
    }
    // EVO: portões (barreira de energia instanciada por portão)
    for (const [gt, arr] of Object.entries(gatePos)) {
      const dummy = new THREE.Object3D();
      const gmat = new THREE.MeshBasicMaterial({ color: gt === 'gate2' ? 0x5dff6a : 0x39f0ff, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
      const bars = new THREE.InstancedMesh(new THREE.BoxGeometry(TILE * 0.18, 2.6, TILE), gmat, arr.length / 2);
      for (let i = 0; i < arr.length / 2; i++) {
        dummy.position.set(arr[i * 2], 1.3, arr[i * 2 + 1]);
        dummy.updateMatrix();
        bars.setMatrixAt(i, dummy.matrix);
      }
      bars.instanceMatrix.needsUpdate = true;
      bars.userData.gateType = gt;
      bars.name = `gate:${gt}`;
      worldRoot.add(bars);
      gateMeshes.push(bars);
    }
    // EVO: covil do Campo (chão com runas verdes) — 1 mesh
    if (zone.campo && zone.lair) {
      const lx = (zone.lair.x0 + zone.lair.x1 + 1) / 2 * TILE;
      const lz = (zone.lair.y0 + zone.lair.y1 + 1) / 2 * TILE;
      const rr = Math.min(zone.lair.x1 - zone.lair.x0, zone.lair.y1 - zone.lair.y0) * 0.45 * TILE;
      const rune = new THREE.Mesh(new THREE.RingGeometry(rr * 0.82, rr, 6, 1).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0x3dff5a, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
      rune.position.set(lx, 0.03, lz);
      worldRoot.add(rune);
    }
    // EVO gráficos: pilares rúnicos, cabos, placas holo e selos (poucos draw calls, instanciados)
    dressing = null;
    if (evoSky) {
      try {
        dressing = buildArenaDressing(zone, (tx, ty) => getTileType(zone, tx, ty), TILE, { accent: key === 'ca' ? 0x39e8ff : 0x39c6ff, accent2: key === 'ca' ? 0x2cff9a : 0x49c6ff, density: tier?.cityDensity ?? 1, reflections: getConfig().graphics.wetReflections !== false, maxReflections: tierName === 'high' ? 64 : tierName === 'medium' ? 40 : 24, skyDragon: key === 'ca' && tierName !== 'low' && getConfig().graphics.skyDragon !== false, dragonGlow: 0x3aa8ff });
        worldRoot.add(dressing.group);
      } catch (e) { console.warn('[fps-renderer] cenário EVO', e); dressing = null; }
    }
    // Bloco V: cidade neon ao redor (decoração fora dos tiles andáveis) + neblina + cor da chuva
    if (VIEW_MODE === 'third') {
      try {
        city = buildCity(zone, key, TILE, (tx, ty) => getTileType(zone, tx, ty), { density: tier?.cityDensity ?? 1 });
        worldRoot.add(city.group);
      } catch (e) { console.warn('[fps-renderer] cidade', e); city = null; }
    }
    if ((tier?.haze ?? 0) > 0) {
      haze = createHaze(tier.haze, { x0: 0, x1: fw, z0: 0, z1: fh }, (key === 'ca' ? new THREE.Color(0x1f5aa0).lerp(new THREE.Color(0x2a3a5a), 0.5) : new THREE.Color(acc.b).lerp(new THREE.Color(0x6a8a9a), 0.7)));
      worldRoot.add(haze.object);
    }
    if (rain) rain.object.material.uniforms.uColor.value.set(acc.c).lerp(new THREE.Color(0xbfe6ff), 0.6);

    // Local neon + amber point lights (darker sky, brighter accents)
    const lights = [
      [zone.map.spawn.x, zone.map.spawn.y, 3.2, 22, ACCENT],
      [Math.floor(zone.map.width / 2), Math.floor(zone.map.height / 2), 3.0, 24, AMBER],
      [zone.map.width - 3, zone.map.height - 3, 2.4, 18, ACCENT],
      [3, zone.map.height - 3, 2.0, 16, AMBER],
      [zone.map.width - 3, 3, 2.0, 16, ACCENT],
      [Math.floor(zone.map.width / 2), 3, 1.8, 15, AMBER],
      [Math.floor(zone.map.width / 2), zone.map.height - 3, 1.8, 15, ACCENT],
      [Math.floor(zone.map.width / 3), Math.floor(zone.map.height / 3), 1.6, 14, ACCENT],
      [Math.floor(zone.map.width * 2 / 3), Math.floor(zone.map.height * 2 / 3), 1.6, 14, AMBER]
    ];
    // Orçamento de luzes pontuais por nível (cada luz custa em TODO pixel iluminado): zona primeiro, depois postes.
    let lightBudget = tier.pointLights ?? 99;
    for (const [lx, ly, inten, dist, col] of lights) {
      if (lightBudget-- <= 0) break;
      const pl = new THREE.PointLight(col, inten, dist, 1.6);
      pl.position.set((lx + 0.5) * TILE, 2.4, (ly + 0.5) * TILE);
      worldRoot.add(pl);
    }
    for (const lp of lampLights) {
      if (lightBudget-- <= 0) break;
      const pl = new THREE.PointLight(ACCENT, 1.1, 8, 2);
      pl.position.copy(lp);
      worldRoot.add(pl);
    }

    const dir = new THREE.DirectionalLight(key === 'e4' ? 0x667788 : 0xc0d0e0, 0.65);
    dir.position.set(10, 16, 8);
    dir.castShadow = renderer.shadowMap.enabled;
    dir.shadow.mapSize.set(512, 512);
    dir.shadow.camera.near = 1;
    dir.shadow.camera.far = 60;
    dir.shadow.camera.left = -30;
    dir.shadow.camera.right = 30;
    dir.shadow.camera.top = 30;
    dir.shadow.camera.bottom = -30;
    worldRoot.add(dir);

    // 3ª pessoa: céu aberto (skyline da cidade; a câmera sobe acima de 3,5 m ao olhar para baixo)
    if (key !== 'g6' && VIEW_MODE === 'first') {
      const ceil = new THREE.Mesh(
        new THREE.PlaneGeometry(fw, fh),
        new THREE.MeshStandardMaterial({ color: 0x1a222c, roughness: 1, side: THREE.DoubleSide })
      );
      ceil.rotation.x = Math.PI / 2;
      ceil.position.set(fw / 2, 3.5, fh / 2);
      worldRoot.add(ceil);
    }
  }

  /** ARENA PRINCIPAL: mundo grande (mesmo estilo: texturas/néons/névoa existentes), relevo e luzes que seguem o herói. */
  /** ARENA: no relevo o disco de telegraph pode entrar no chão em rampas — desenha por cima (só na Arena Principal). */
  let teleOnTop = false;
  function setTeleOnTop(on) {
    teleOnTop = !!on;
    for (const k of ['teleFillT', 'teleFillW', 'teleEdge']) { const mt = shared[k]; if (mt && mt.depthTest === !!on) { mt.depthTest = !on; mt.needsUpdate = true; } }
  }
  function buildBrWorld(zone) {
    const m = zone.brMap;
    setGroundFn((fx, fy) => brHeightAt(m, fx, fy) * BR_RELIEF);
    setTeleOnTop(true); // ARENA: telegraph sempre legível sobre relevo/arbustos
    fpsCam.setBlocker((tx, ty) => { const t = getTileType(zone, Math.floor(tx), Math.floor(ty)); return t === 'wall' || t === 'pillar'; });
    heroSt.init = false;
    // mesmo céu/névoa do Campo (paleta aprovada), névoa um pouco mais densa para esconder o fim dos blocos
    // MASTER 10 (Caio: "está escuro demais"): ARENA mais clara — exposição, ambiente/hemisfério e névoa mais clara (noite neon mantida)
    const BL = getConfig().graphics?.brLight || {};
    const horizon = BL.horizon || '#1a3866';
    scene.background = skyTex(BL.skyTop || '#03081a', BL.skyMid || '#0c1f48', horizon);
    const fogD = (tierName === 'low' ? 0.026 : tierName === 'medium' ? 0.021 : 0.017) * (BL.fogK ?? 0.88);
    scene.fog = new THREE.FogExp2(new THREE.Color(horizon).multiplyScalar(BL.fogColorK ?? 0.95), fogD);
    renderer.toneMappingExposure = getConfig().graphics.exposure * (BL.exposureK ?? 1.28);
    if (sceneLights.amb) { sceneLights.amb.intensity = BL.amb ?? 1.3; sceneLights.amb.color.setHex(0x8aa2bc); }
    if (sceneLights.hemi) { sceneLights.hemi.intensity = BL.hemi ?? 1.6; sceneLights.hemi.color.setHex(0x86a8d4); sceneLights.hemi.groundColor.setHex(0x4a4232); }
    const cfg = getState()?._data?.arena_br || {};
    const brProps = getConfig().graphics?.brProps !== false && (typeof location === 'undefined' || new URLSearchParams(location.search).get('brProps') !== '0');
    brWorld = buildBrTerrain(zone, cfg, { TILE, ground: groundAt, loadTex: loadHdTex, tierName, props: brProps });
    worldRoot.add(brWorld.group);
    dressing = null; city = null; haze = null;
    // skyline neon da cidade em volta do mapa (mesmo módulo do Campo/mundo; densidade reduzida no mapa grande)
    if (VIEW_MODE === 'third' && getConfig().graphics?.brCity !== false) {
      try { city = buildCity(zone, 'ca', TILE, (tx, ty) => getTileType(zone, tx, ty), { density: (tier?.cityDensity ?? 1) * 0.55 }); worldRoot.add(city.group); } catch (e) { console.warn('[fps-renderer] cidade BR', e); city = null; }
    }
    if (rain) rain.object.material.uniforms.uColor.value.set(0x3ecfbf).lerp(new THREE.Color(0xbfe6ff), 0.6);
    // luzes pontuais: poucas (orçamento do nível), reposicionadas nos postes/POIs MAIS PRÓXIMOS do herói (sem recompilar shader)
    const n = Math.max(0, Math.min(4, tier?.pointLights ?? 2));
    brLights = [];
    for (let i = 0; i < n; i++) { const pl = new THREE.PointLight(i % 2 ? AMBER : ACCENT, 2.2, 16, 1.6); pl.position.set(-99, -99, -99); worldRoot.add(pl); brLights.push(pl); }
    brLightAt = 0;
    brDir = new THREE.DirectionalLight(0xc8d8ea, getConfig().graphics?.brLight?.dir ?? 1.15);
    brDir.castShadow = renderer.shadowMap.enabled;
    brDir.shadow.mapSize.set(tierName === 'high' ? 1024 : 512, tierName === 'high' ? 1024 : 512);
    brDir.shadow.camera.near = 1; brDir.shadow.camera.far = 60;
    brDir.shadow.camera.left = -22; brDir.shadow.camera.right = 22; brDir.shadow.camera.top = 22; brDir.shadow.camera.bottom = -22;
    worldRoot.add(brDir); worldRoot.add(brDir.target);
  }
  /** M10 passo 3 — Território do Dragão: brasas subindo em volta do herói (1 Points, tier × degrau 'particles') + vinheta vermelha pulsando (CSS). */
  function updateDragonFx(inDragon, hx, hz, now) {
    const dt = Math.min(0.1, Math.max(0, (now - (dragonFx.last || now)) / 1000)); dragonFx.last = now;
    dragonFx.k += ((inDragon ? 1 : 0) - dragonFx.k) * Math.min(1, dt / (inDragon ? 1.2 : 0.7));
    if (!inDragon && dragonFx.k < 0.12) dragonFx.k = 0;
    if (!dragonFx.el && typeof document !== 'undefined' && canvas?.parentElement) {
      const el = document.createElement('div'); el.id = 'nx-dragon-vignette'; el.className = 'nx-dragon-vignette'; canvas.parentElement.appendChild(el); dragonFx.el = el;
    }
    if (dragonFx.el) { const vis = dragonFx.k > 0; if (vis !== dragonFx.on) { dragonFx.on = vis; dragonFx.el.classList.toggle('on', vis); } if (vis) dragonFx.el.style.opacity = dragonFx.k.toFixed(2); }
    const want = dragonFx.k > 0 && getConfig().graphics.dragonEmbers !== false;
    if (!want) { if (dragonFx.pts) dragonFx.pts.visible = false; return; }
    if (!dragonFx.pts) {
      const N = Math.max(8, Math.round((tierName === 'low' ? 24 : tierName === 'medium' ? 48 : 80)));
      const pos = new Float32Array(N * 3); dragonFx.vel = new Float32Array(N);
      for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * 24; pos[i * 3 + 1] = Math.random() * 7; pos[i * 3 + 2] = (Math.random() - 0.5) * 24; dragonFx.vel[i] = 0.6 + Math.random() * 1.1; }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({ color: 0xff7a2a, size: 0.14, sizeAttenuation: true, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
      dragonFx.pts = new THREE.Points(geo, mat); dragonFx.pts.frustumCulled = false; dragonFx.pts.renderOrder = 6; scene.add(dragonFx.pts); dragonFx.n = N;
    }
    const P = dragonFx.pts; P.visible = true; P.position.set(hx, groundAt(hx / TILE, hz / TILE), hz);
    const arr = P.geometry.attributes.position.array; const use = Math.max(4, Math.round(dragonFx.n * particleK));
    for (let i = 0; i < dragonFx.n; i++) {
      if (i >= use) { arr[i * 3 + 1] = -50; continue; }
      let y = arr[i * 3 + 1] + dragonFx.vel[i] * dt; if (y > 7 || y < 0) { y = 0; arr[i * 3] = (Math.random() - 0.5) * 24; arr[i * 3 + 2] = (Math.random() - 0.5) * 24; }
      arr[i * 3 + 1] = y; arr[i * 3] += Math.sin(now * 0.001 + i) * 0.25 * dt;
    }
    P.geometry.attributes.position.needsUpdate = true; P.material.opacity = 0.9 * dragonFx.k;
  }
  function updateBrWorld(state, now) {
    if (!brWorld) return;
    const hx = fpsCam.state.visX, hz = fpsCam.state.visZ;
    updateDragonFx(brFogTint.id === 'dragao', hx, hz, now);
    // M10 fase 8: tonalidade da névoa por região (lerp contínuo; troca de alvo a cada 400 ms)
    if (scene.fog && brWorld.regionAt) {
      const BL = getConfig().graphics?.brLight || {};
      if (!brFogTint.at || now - brFogTint.at > 400) { brFogTint.at = now; const rid = brWorld.regionAt(hx / TILE, hz / TILE); if (rid && rid !== brFogTint.id) { brFogTint.id = rid; brFogTint.target.set(BL.regionFog?.[rid] || BL.horizon || '#1a3866').multiplyScalar(BL.fogColorK ?? 0.95); } }
      const dt = Math.min(0.2, Math.max(0, (now - (brFogTint.last || now)) / 1000)); brFogTint.last = now;
      if (brFogTint.id) scene.fog.color.lerp(brFogTint.target, Math.min(1, dt * 1000 / (BL.regionFogMs || 1600) * 3));
    }
    brWorld.update(hx, hz, now, fpsCam.camera.position.x, fpsCam.camera.position.z);
    if (brDir) { brDir.position.set(hx + 10, 18, hz + 8); brDir.target.position.set(hx, 0, hz); }
    if (brLights.length && now - brLightAt > 400) {
      brLightAt = now;
      const pts = brWorld.lampPos.concat(brWorld.markers.map((mk) => new THREE.Vector3(mk.x * TILE, groundAt(mk.x, mk.y) + 2.6, mk.y * TILE)));
      pts.sort((a, b) => Math.hypot(a.x - hx, a.z - hz) - Math.hypot(b.x - hx, b.z - hz));
      brLights.forEach((pl, i) => { const p = pts[i]; if (p && Math.hypot(p.x - hx, p.z - hz) < 40) pl.position.copy(p); else pl.position.set(hx, 3.2, hz + (i ? -6 : 6)); });
    }
    const br = state.br;
    if (br && brWorld._br !== br) { brWorld._br = br; brWorld.resetLoot(); for (const id of br.lootOpened || []) brWorld.setLootOpened(id, true); }
    if (br) brWorld.setExtractionActive(!!br.extractionOpen, now);
    if (br?.lootOpened) for (const id of br.lootOpenedDirty || []) brWorld.setLootOpened(id, true);
    if (br) br.lootOpenedDirty = [];
    brWorld.updateDrops(br?.drops || [], br?.clock || 0, now);
  }

  /**
   * Enriched combat bot — shoulders, visor, antenna, plating, emissive eyes.
   * Feet at y=0, ~1.75m tall, NO billboard. Slight idle anim via syncEntities.
   */
  function makeTextSprite(text, color) {
    const cv = document.createElement('canvas');
    cv.width = 64;
    cv.height = 64;
    const c2 = cv.getContext('2d');
    c2.fillStyle = 'rgba(0,0,0,0.55)';
    c2.beginPath();
    c2.arc(32, 32, 28, 0, Math.PI * 2);
    c2.fill();
    c2.strokeStyle = color;
    c2.lineWidth = 4;
    c2.stroke();
    c2.fillStyle = color;
    c2.font = 'bold 44px system-ui, sans-serif';
    c2.textAlign = 'center';
    c2.textBaseline = 'middle';
    c2.fillText(text, 32, 34);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
    mat.userData.shared = true;
    return mat;
  }

  function ensureSharedMats() {
    if (shared.alertMat) return;
    shared.alertMat = makeTextSprite('!', '#ffc940');
    shared.dangerMat = makeTextSprite('!', '#ff3b30');
    shared.ringMat = new THREE.MeshBasicMaterial({ color: 0xff3020, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide });
    shared.ringMat.userData.shared = true;
    shared.ringGeo = new THREE.RingGeometry(0.55, 0.72, 32);
    shared.ringGeo.userData.shared = true;
    // barra de vida: moldura escura + 3 marcadores vermelhos em cima (textura de canvas compartilhada)
    const cv = document.createElement('canvas');
    cv.width = 128; cv.height = 32;
    const c = cv.getContext('2d');
    c.fillStyle = 'rgba(8,4,6,0.78)'; c.fillRect(2, 12, 124, 14);
    c.strokeStyle = 'rgba(255,70,50,0.9)'; c.lineWidth = 2; c.strokeRect(2, 12, 124, 14);
    c.fillStyle = '#ff3a26';
    for (const x of [44, 58, 72]) c.fillRect(x, 2, 10, 6);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    shared.hpFrameMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
    shared.hpFrameMat.userData.shared = true;
    shared.hpFrameGeo = new THREE.PlaneGeometry(0.72, 0.18);
    shared.hpFrameGeo.userData.shared = true;
    const fg = new THREE.PlaneGeometry(0.66, 0.06);
    fg.translate(0.33, 0, 0); // pivô à esquerda → scale.x = % de vida
    shared.hpFillGeo = fg;
    shared.hpFillGeo.userData.shared = true;
    // EVO: postura / elite / telegraphs de arquétipo
    const mk = (color, o = {}) => { const m = new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, ...o }); m.userData.shared = true; return m; };
    shared.postureMat = mk(new THREE.Color(0xffc24a).multiplyScalar(1.5));
    shared.postureBrokenMat = mk(new THREE.Color(0xffffff).multiplyScalar(2));
    shared.eliteRingMat = mk(0xffc93a, { opacity: 0.85, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    shared.bossRingMat = mk(0xff3a7a, { opacity: 0.85, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    shared.eliteStarMat = makeTextSprite('★', '#ffd24a');
    shared.bossStarMat = makeTextSprite('♛', '#ff5a8a');
    shared.teleFillT = mk(0xff5a1f, { opacity: 0.2, side: THREE.DoubleSide });
    shared.teleFillW = mk(0xff2010, { opacity: 0.42, side: THREE.DoubleSide });
    shared.teleEdge = mk(0xffc23a, { opacity: 0.85, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    for (const k of ['teleFillT', 'teleFillW', 'teleEdge']) shared[k].depthTest = !teleOnTop;
    const disc = new THREE.CircleGeometry(1, 32); disc.rotateX(-Math.PI / 2); disc.userData.shared = true;
    const discEdge = new THREE.RingGeometry(0.9, 1, 40); discEdge.rotateX(-Math.PI / 2); discEdge.userData.shared = true;
    const lane = new THREE.PlaneGeometry(1, 1); lane.translate(0, -0.5, 0); lane.rotateX(-Math.PI / 2); lane.userData.shared = true;
    shared.teleGeo = { disc, discEdge, lane, cones: new Map() };
  }
  function coneGeo(half) {
    const k = Math.round(half * 100);
    let g = shared.teleGeo.cones.get(k);
    if (!g) {
      g = new THREE.RingGeometry(0.15, 1, 24, 1, -Math.PI / 2 - half, half * 2);
      g.rotateX(-Math.PI / 2);
      g.userData.shared = true;
      shared.teleGeo.cones.set(k, g);
    }
    return g;
  }
  /** M10 passo 3 — "!" sobre a cabeça no aviso de golpe (âmbar no telegraph, vermelho no preparo final). 1 sprite/inimigo, materiais compartilhados. */
  const teleMarkStats = { shown: 0 };
  function teleMarkMat(windup) {
    if (!shared.teleMarkT) {
      const c = document.createElement('canvas'); c.width = 64; c.height = 96; const g = c.getContext('2d');
      g.font = '900 84px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      g.lineWidth = 12; g.strokeStyle = '#140400'; g.strokeText('!', 32, 52); g.fillStyle = '#ffffff'; g.fillText('!', 32, 52);
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      shared.teleMarkT = new THREE.SpriteMaterial({ map: tex, color: 0xffb52e, depthTest: false, transparent: true });
      shared.teleMarkW = new THREE.SpriteMaterial({ map: tex, color: 0xff3b24, depthTest: false, transparent: true });
      shared.teleMarkT.userData.shared = true; shared.teleMarkW.userData.shared = true;
    }
    return windup ? shared.teleMarkW : shared.teleMarkT;
  }
  function setTeleMark(entry, parent, on, windup, y, s, now) {
    if (!on || getConfig().graphics.teleMarks === false) { if (entry.teleMark) entry.teleMark.visible = false; return; }
    let sp = entry.teleMark;
    if (!sp) { sp = entry.teleMark = new THREE.Sprite(teleMarkMat(false)); sp.renderOrder = 14; sp.geometry.userData.shared = true; parent.add(sp); } // geometria de Sprite é global no three → nunca descartar
    sp.material = teleMarkMat(windup); sp.visible = true;
    const k = s * (windup ? 0.6 : 0.48) * (1 + 0.14 * Math.sin(now * 0.03));
    sp.scale.set(k * 0.66, k, 1); sp.position.set(0, y, 0);
    teleMarkStats.shown++;
  }
  /** EVO: telegraph do arquétipo (no espaço local do bot; frente = +z). */
  function updateArchTele(entry, v, now) {
    const tele = entry.mesh.userData.tele;
    if (!tele) return;
    const T = v && v.tele;
    const on = !!(T && T.kind && (v.state === AI_STATES.ATTACK_PREPARE || (v.state === AI_STATES.ATTACK && (T.kind === 'lunge' || T.kind === 'charge'))));
    tele.visible = on;
    { const sc0 = 1 / (entry.mesh.scale.x || 1); setTeleMark(entry, entry.mesh, on, on && (T.phase === 'WINDUP' || T.phase === 'ATTACK'), 2.55 * sc0, sc0, now); }
    if (!on) return;
    // pulso do preenchimento (material compartilhado: todos os avisos pulsam juntos — barato)
    shared.teleFillT.opacity = 0.17 + 0.12 * (0.5 + 0.5 * Math.sin(now * 0.02));
    teleSeen[T.kind] = (teleSeen[T.kind] || 0) + 1; // e2e: telegraphs de arquétipo realmente desenhados
    if (!entry.tele || entry.teleKind !== T.kind + T.half) {
      while (tele.children.length) tele.remove(tele.children[0]);
      entry.teleKind = T.kind + T.half;
      const G = shared.teleGeo;
      let fill; let edge;
      if (T.kind === 'cone') { fill = new THREE.Mesh(coneGeo(T.half), shared.teleFillT); edge = null; }
      else if (T.kind === 'lunge' || T.kind === 'charge' || T.kind === 'shot') { fill = new THREE.Mesh(G.lane, shared.teleFillT); edge = null; }
      else { fill = new THREE.Mesh(G.disc, shared.teleFillT); edge = new THREE.Mesh(G.discEdge, shared.teleEdge); }
      fill.renderOrder = 4;
      tele.add(fill);
      if (edge) { edge.renderOrder = 4; tele.add(edge); }
      entry.tele = { fill, edge };
    }
    const { fill, edge } = entry.tele;
    const sc = 1 / entry.mesh.scale.x;
    const windup = T.phase === 'WINDUP' || T.phase === 'ATTACK';
    fill.material = windup ? shared.teleFillW : shared.teleFillT;
    tele.position.set(0, 0.05 * sc, 0);
    tele.rotation.set(0, 0, 0);
    const p = Math.max(0.05, T.progress || 0);
    if (T.kind === 'cone') {
      const R = T.range * TILE * sc;
      fill.scale.set(R, 1, R);
    } else if (T.kind === 'lunge' || T.kind === 'charge' || T.kind === 'shot') {
      const Lm = Math.max(0.5, (T.kind === 'shot' ? Math.min(7, T.len) : T.len)) * TILE * sc;
      fill.scale.set((T.kind === 'shot' ? 0.18 : 0.9) * TILE * sc, 1, Lm * (T.kind === 'shot' ? 1 : 0.35 + 0.65 * p));
    } else {
      // disco: slam/nova em volta do corpo; hazard/roar no ponto mirado (fixo no mundo)
      const R = (T.radius || 1) * TILE * sc;
      fill.scale.set(R * p, 1, R * p);
      if (edge) edge.scale.set(R, 1, R);
      if (T.kind === 'hazard') {
        tmpV3.set(T.x * TILE, 0.05 + groundAt(T.x, T.y), T.y * TILE); // ARENA: relevo
        entry.mesh.worldToLocal(tmpV3);
        tele.position.copy(tmpV3);
        tele.rotation.y = 0;
      }
    }
    if (edge) edge.material.opacity = 0.55 + 0.4 * (0.5 + 0.5 * Math.sin(now * 0.02));
  }

  /** Pool de faíscas (THREE.Points, 1 draw call, sem alocação por frame). */
  function ensureSparks() {
    if (sparks || !scene) return;
    const n = getConfig().combat.sparkPoolSize;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) pos[i * 3 + 1] = -50;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0xffa640, size: 0.17, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.name = 'sparks';
    scene.add(pts);
    sparks = { pts, pos, vel: new Float32Array(n * 3), life: new Float32Array(n), n, next: 0, alive: 0 };
  }

  function spawnSparks(tx, ty, heavy) {
    ensureSparks();
    if (!sparks) return;
    const cfg = getConfig().combat;
    const count = Math.min(sparks.n, Math.max(1, Math.round(cfg.sparkCount * (heavy ? 1.6 : 1) * particleK))); // fase 9: degrau 'particles'
    const wx = tx * TILE;
    const wz = ty * TILE;
    const wy = 1.15 + groundAt(tx, ty); // ARENA: relevo
    // espalha para os lados/para cima, de volta na direção da câmera
    const bx = fpsCam.camera.position.x - wx;
    const bz = fpsCam.camera.position.z - wz;
    const bl = Math.hypot(bx, bz) || 1;
    for (let k = 0; k < count; k++) {
      const i = sparks.next;
      sparks.next = (sparks.next + 1) % sparks.n;
      if (sparks.life[i] <= 0) sparks.alive++;
      const sp = 2.5 + Math.random() * 3.5;
      sparks.pos[i * 3] = wx + (bx / bl) * 0.35;
      sparks.pos[i * 3 + 1] = wy + (Math.random() - 0.5) * 0.3;
      sparks.pos[i * 3 + 2] = wz + (bz / bl) * 0.35;
      sparks.vel[i * 3] = (bx / bl) * sp * 0.5 + (Math.random() - 0.5) * sp;
      sparks.vel[i * 3 + 1] = Math.random() * sp * 0.8 + 0.6;
      sparks.vel[i * 3 + 2] = (bz / bl) * sp * 0.5 + (Math.random() - 0.5) * sp;
      sparks.life[i] = 0.22 + Math.random() * 0.2;
    }
    sparks.pts.geometry.attributes.position.needsUpdate = true;
  }

  function updateSparks(dt) {
    if (!sparks || sparks.alive <= 0) return;
    const { pos, vel, life, n } = sparks;
    let alive = 0;
    for (let i = 0; i < n; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      if (life[i] <= 0) { pos[i * 3 + 1] = -50; continue; }
      alive++;
      vel[i * 3 + 1] -= 9.8 * dt;
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
    }
    sparks.alive = alive;
    sparks.pts.geometry.attributes.position.needsUpdate = true;
  }

  function makeBot3D(opts = {}) {
    const bodyTint = opts.bodyTint ?? 0x8a4540;
    const armorTint = opts.armorTint ?? 0xb06050;
    const eyeTint = opts.eyeTint ?? 0xe85d4c;
    const g = new THREE.Group();
    g.name = 'bot3d';

    // EVO gráficos: placas/costuras (map) + linhas de NEXA (emissiveMap) — texturas procedurais compartilhadas
    const cmaps = creatureMaps(0.5); // linhas de Nexa grossas (legíveis com pixel ratio baixo)
    const lineTint = opts.lineTint ?? eyeTint;
    const matBody = new THREE.MeshStandardMaterial({
      color: bodyTint, roughness: 0.46, metalness: 0.5, map: cmaps.map,
      emissive: lineTint, emissiveMap: cmaps.emissiveMap, emissiveIntensity: 1.5
    });
    const matArmor = new THREE.MeshStandardMaterial({
      color: armorTint, roughness: 0.32, metalness: 0.66, map: cmaps.map,
      emissive: lineTint, emissiveMap: cmaps.emissiveMap, emissiveIntensity: 1.0
    });
    // recorte (fresnel) na cor do arquétipo: silhueta legível mesmo em resolução baixa
    addRim(matBody, lineTint, 0.5, 2.4);
    addRim(matArmor, lineTint, 0.65, 2.2);
    const matDark = new THREE.MeshStandardMaterial({ color: 0x121014, roughness: 0.65, metalness: 0.35 });
    const matEye = new THREE.MeshStandardMaterial({
      color: eyeTint, emissive: eyeTint, emissiveIntensity: 1.15, roughness: 0.25, metalness: 0.2
    });
    const matVisor = new THREE.MeshStandardMaterial({
      color: 0x102028, emissive: eyeTint, emissiveIntensity: 0.35, roughness: 0.3, metalness: 0.7
    });

    // EVO: pernas orgânicas com pivô no QUADRIL (passada real): coxa + canela em cápsula, joelheira e bota
    const thighGeo = limb(0.1, 0.32, 8);
    const shinGeo = limb(0.085, 0.32, 8);
    const kneeGeo = new THREE.SphereGeometry(0.085, 8, 6);
    const bootGeo = new THREE.CapsuleGeometry(0.08, 0.12, 2, 8);
    bootGeo.rotateX(Math.PI / 2);
    function makeLeg(side) {
      const leg = new THREE.Group();
      leg.position.set(side * 0.15, 0.6, 0);
      const th = new THREE.Mesh(thighGeo, matDark); leg.add(th);
      const kn = new THREE.Mesh(kneeGeo, matArmor); kn.position.set(0, -0.31, 0.05); kn.scale.set(1, 1.1, 0.8); leg.add(kn);
      const sh = new THREE.Mesh(shinGeo, matBody); sh.position.set(0, -0.28, 0); leg.add(sh);
      const bt = new THREE.Mesh(bootGeo, matArmor); bt.position.set(0, -0.56, 0.05); bt.scale.set(1.05, 0.8, 1); leg.add(bt);
      g.add(leg);
      return leg;
    }
    const legL = makeLeg(-1); legL.name = 'legL';
    const legR = makeLeg(1); legR.name = 'legR';

    const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.18, 0.3), matArmor);
    pelvis.position.set(0, 0.62, 0);
    g.add(pelvis);

    // Bloco V: tronco hexagonal afunilado (ombros largos → cintura fina) — silhueta de demônio cibernético
    // EVO: tronco orgânico (torno): cintura fina → peito largo → pescoço
    const torso = new THREE.Mesh(lathe([[0.001, 0.6], [0.2, 0.62], [0.22, 0.74], [0.27, 0.92], [0.35, 1.12], [0.37, 1.24], [0.27, 1.34], [0.12, 1.4], [0.001, 1.42]], 12), matBody);
    torso.scale.set(1, 1, 0.64);
    g.add(torso);
    // abdômen segmentado (3 anéis)
    for (let i = 0; i < 3; i++) {
      const ab = new THREE.Mesh(new THREE.TorusGeometry(0.205 + i * 0.02, 0.022, 5, 14), matArmor);
      ab.rotation.x = Math.PI / 2; ab.scale.set(1, 0.64, 1); ab.position.set(0, 0.7 + i * 0.09, 0);
      g.add(ab);
    }
    // costuras de brilho vermelho (bloom) no peito e nas costas — não mudam com o estado da IA
    const matSeam = new THREE.MeshStandardMaterial({ color: 0xff2a1a, emissive: 0xff2a1a, emissiveIntensity: 1.8, roughness: 0.4 });
    for (const [x, y, z, w, h, rz] of [[0, 0.9, 0.2, 0.03, 0.34, 0], [0.09, 1.08, 0.2, 0.16, 0.022, -0.55], [-0.09, 1.08, 0.2, 0.16, 0.022, 0.55], [0, 1.0, -0.2, 0.03, 0.4, 0]]) {
      const seam = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.02), matSeam);
      seam.position.set(x, y, z);
      seam.rotation.z = rz;
      g.add(seam);
    }
    // espinhos dorsais
    for (let i = 0; i < 3; i++) {
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.2 - i * 0.03, 5), matDark);
      sp.position.set(0, 1.2 - i * 0.16, -0.22);
      sp.rotation.x = -0.9;
      g.add(sp);
    }

    // Chest plating
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.35, 0.08), matArmor);
    plate.position.set(0, 1.02, 0.18);
    g.add(plate);

    // EVO: ombreiras em cúpula (meia-esfera) com borda
    const padGeo = new THREE.SphereGeometry(0.17, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    const rimGeo = new THREE.TorusGeometry(0.165, 0.018, 4, 14);
    for (const side of [-1, 1]) {
      const pad = new THREE.Mesh(padGeo, matArmor);
      pad.position.set(side * 0.38, 1.25, 0); pad.scale.set(1, 0.85, 1.05); pad.rotation.z = -side * 0.35;
      g.add(pad);
      const rim = new THREE.Mesh(rimGeo, matDark);
      rim.position.set(side * 0.38, 1.25, 0); rim.rotation.set(Math.PI / 2, side * 0.35, 0); rim.scale.set(1, 1.05, 1);
      g.add(rim);
    }
    // espinhos de ombro
    for (const side of [-1, 1]) {
      for (let i = 0; i < 2; i++) {
        const sp = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22 - i * 0.05, 5), matDark);
        sp.position.set(side * (0.42 + i * 0.07), 1.42, -0.03 + i * 0.08);
        sp.rotation.z = -side * (0.55 + i * 0.2);
        g.add(sp);
      }
    }

    // gp2: braços com pivô no ombro (levantar o braço no telegraph)
    const armL = new THREE.Group();
    armL.position.set(-0.44, 1.19, 0);
    armL.name = 'armL';
    const upperGeo = limb(0.085, 0.3, 8);
    const foreGeo = limb(0.075, 0.32, 8);
    const elbowGeo = new THREE.SphereGeometry(0.08, 8, 6);
    function fillArm(arm) {
      arm.add(new THREE.Mesh(upperGeo, matBody));
      const el = new THREE.Mesh(elbowGeo, matArmor); el.position.y = -0.29; arm.add(el);
      const fo = new THREE.Mesh(foreGeo, matArmor); fo.position.y = -0.27; fo.scale.set(1.1, 1, 1.1); arm.add(fo);
    }
    fillArm(armL);
    g.add(armL);
    const armR = new THREE.Group();
    armR.position.set(0.44, 1.19, 0);
    armR.name = 'armR';
    fillArm(armR);
    const fistGeo = new THREE.SphereGeometry(0.095, 8, 6);
    for (const arm of [armL, armR]) { const fist = new THREE.Mesh(fistGeo, matArmor); fist.position.set(0, -0.62, 0.01); fist.scale.set(1, 0.9, 1.1); arm.add(fist); }
    g.add(armR);
    // garras (3 por mão)
    const clawGeo = new THREE.ConeGeometry(0.022, 0.14, 4);
    for (const arm of [armL, armR]) {
      for (let i = -1; i <= 1; i++) {
        const cl = new THREE.Mesh(clawGeo, matDark);
        cl.position.set(i * 0.055, -0.7, 0.06);
        cl.rotation.x = Math.PI + 0.35;
        arm.add(cl);
      }
    }

    // EVO: elmo arredondado (torno) com crista central
    const head = new THREE.Mesh(lathe([[0.001, -0.17], [0.12, -0.16], [0.17, -0.06], [0.175, 0.04], [0.15, 0.13], [0.08, 0.19], [0.001, 0.2]], 12), matArmor);
    head.position.set(0, 1.52, 0);
    head.scale.set(1, 1, 1.12);
    g.add(head);
    const crest = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.1, 0.3), matDark);
    crest.position.set(0, 1.72, -0.02);
    g.add(crest);
    // mandíbula angular
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.08, 0.14), matDark);
    jaw.position.set(0, 1.36, 0.14);
    jaw.rotation.x = 0.25;
    g.add(jaw);

    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.06), matVisor);
    visor.position.set(0, 1.54, 0.18);
    g.add(visor);

    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), matEye);
    eyeL.position.set(-0.08, 1.54, 0.2);
    g.add(eyeL);
    const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), matEye);
    eyeR.position.set(0.08, 1.54, 0.2);
    eyeR.name = 'eyeCore';
    g.add(eyeR);

    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.28, 6), matDark);
    antenna.position.set(0.1, 1.78, -0.04);
    g.add(antenna);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 6), matEye);
    tip.position.set(0.1, 1.94, -0.04);
    g.add(tip);

    // gp3: CHIFRES curvos (3 segmentos afinando, curvando para trás) + ESCAMAS
    // (placas pequenas sobrepostas e inclinadas em ombros/tronco/braços, InstancedMesh:
    // 1 draw call por grupo, ~12 tris por placa — leve no celular).
    const scaleTint = new THREE.Color(armorTint).lerp(new THREE.Color(0xffffff), 0.18).getHex();
    const matScale = new THREE.MeshStandardMaterial({
      color: scaleTint, roughness: 0.3, metalness: 0.7, emissive: scaleTint, emissiveIntensity: 0.08, flatShading: true
    });
    const matHorn = new THREE.MeshStandardMaterial({ color: 0x9a8e84, roughness: 0.32, metalness: 0.6, emissive: 0x1a1210, flatShading: true });
    // [comprimento, raio base, raio topo, curva X (para trás), abertura Z (para fora)]
    const hornSegs = [[0.17, 0.06, 0.045, -0.15, -0.75], [0.16, 0.045, 0.028, -0.55, -0.2], [0.15, 0.028, 0.003, -0.75, 0.25]];
    for (const side of [-1, 1]) {
      let parent = new THREE.Group();
      parent.position.set(side * 0.12, 1.66, 0.02);
      g.add(parent);
      for (const [len, r0, r1, rx, rz] of hornSegs) {
        const seg = new THREE.Group();
        seg.rotation.set(rx, 0, rz * side);
        parent.add(seg);
        const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, 5), r1 < 0.01 ? matEye : matHorn); // ponta acesa (cor do olho)
        m.position.y = len / 2;
        seg.add(m);
        const next = new THREE.Group();
        next.position.y = len;
        seg.add(next);
        parent = next;
      }
    }
    const scaleGeo = new THREE.BoxGeometry(0.13, 0.09, 0.02);
    const dummy = new THREE.Object3D();
    function scaleField(parent, pts) {
      const im = new THREE.InstancedMesh(scaleGeo, matScale, pts.length);
      pts.forEach(([x, y, z, ry, rx], i) => {
        dummy.position.set(x, y, z);
        dummy.rotation.set(rx, ry, 0);
        dummy.updateMatrix();
        im.setMatrixAt(i, dummy.matrix);
      });
      im.instanceMatrix.needsUpdate = true;
      parent.add(im);
      return im;
    }
    const bodyScales = [];
    // ombros: 3 fileiras sobrepostas descendo
    for (const side of [-1, 1]) {
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 2; col++) {
          bodyScales.push([side * (0.32 + col * 0.1), 1.39 - row * 0.065, 0.16 - row * 0.01, 0, -0.7]);
          bodyScales.push([side * (0.32 + col * 0.1), 1.39 - row * 0.065, -0.16 + row * 0.01, Math.PI, -0.7]);
        }
      }
      // laterais do tronco (frente) em escama de peixe
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 2; col++) {
          const off = row % 2 ? 0.045 : 0;
          bodyScales.push([side * (0.2 - col * 0.085 - off), 0.8 + row * 0.07, 0.178, 0, -0.35]);
        }
      }
    }
    scaleField(g, bodyScales);
    for (const arm of [armL, armR]) {
      const pts = [];
      for (let row = 0; row < 3; row++) {
        pts.push([0, -0.08 - row * 0.12, 0.095, 0, -0.45]);
        pts.push([0, -0.08 - row * 0.12, -0.095, Math.PI, -0.45]);
      }
      const im = scaleField(arm, pts);
      im.scale.set(0.9, 1, 1);
    }

    // EVO: silhueta por arquétipo (peças procedurais extras; tudo mesclado depois)
    const arch = opts.arch || null;
    if (arch) addArchetypeParts(g, arch, { armL, armR, matBody, matArmor, matDark, matEye, matSeam }, opts.variant || null);
    g.userData.flashMats = [matBody, matArmor, matEye, matScale];
    g.userData.baseColors = [bodyTint, armorTint, eyeTint, scaleTint];
    g.userData.eyeMat = matEye;
    g.userData.visorMat = matVisor;
    g.userData.eyeTint = eyeTint;
    g.userData.height = 1.8;
    g.userData.animParts = { armL, armR, legL, legR };
    g.userData.arch = arch;
    g.userData.baseScale = 1.05 * (ARCH_LOOK[opts.variant || arch]?.scale || 1);
    g.scale.setScalar(g.userData.baseScale);
    g.position.y = 0;
    g.rotation.order = 'YXZ'; // yaw primeiro, depois inclinação (lean) relativa à frente
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    // Indicadores (materiais compartilhados — não descartados com o bot)
    ensureSharedMats();
    const mark = new THREE.Sprite(shared.alertMat);
    mark.scale.set(0.42, 0.42, 1);
    mark.position.set(0, 2.3, 0);
    mark.visible = false;
    mark.renderOrder = 10;
    mark.name = 'aiMark';
    g.add(mark);
    const ring = new THREE.Mesh(shared.ringGeo, shared.ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    ring.visible = false;
    ring.name = 'aiRing';
    g.add(ring);
    g.userData.mark = mark;
    g.userData.ring = ring;
    // Bloco V: barra de vida acima da cabeça (moldura com marcadores vermelhos + preenchimento)
    const hp = new THREE.Group();
    hp.name = 'hpBar';
    hp.position.set(0, 2.12, 0);
    const frame = new THREE.Mesh(shared.hpFrameGeo, shared.hpFrameMat);
    frame.renderOrder = 11;
    hp.add(frame);
    const fillMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2a1a).multiplyScalar(1.6), depthWrite: false, transparent: true });
    const fill = new THREE.Mesh(shared.hpFillGeo, fillMat);
    fill.position.z = 0.002;
    fill.renderOrder = 12;
    hp.add(fill);
    g.add(hp);
    g.userData.hpBar = hp;
    g.userData.hpFill = fill;
    // EVO: barra de POSTURA (amarela) sob a vida
    const pfill = new THREE.Mesh(shared.hpFillGeo, shared.postureMat);
    pfill.position.set(-0.33, -0.075, 0.002);
    pfill.scale.set(0.001, 0.6, 1);
    pfill.renderOrder = 12;
    pfill.visible = false;
    hp.add(pfill);
    g.userData.postureFill = pfill;
    if (ARCH_LOOK[arch]?.hpScale) hp.scale.setScalar(ARCH_LOOK[arch].hpScale / (ARCH_LOOK[arch]?.scale || 1));
    // EVO: marcador de ELITE / MINI-CHEFE (anel dourado no chão + estrela acima da vida)
    if (arch === 'F' || arch === 'G') {
      const gr = new THREE.Mesh(shared.ringGeo, arch === 'G' ? shared.bossRingMat : shared.eliteRingMat);
      gr.rotation.x = -Math.PI / 2;
      gr.position.y = 0.03;
      gr.scale.setScalar(arch === 'G' ? 1.25 : 1.05);
      gr.name = 'eliteRing';
      g.add(gr);
      const star = new THREE.Sprite(arch === 'G' ? shared.bossStarMat : shared.eliteStarMat);
      star.scale.set(0.34, 0.34, 1);
      star.position.set(0, 2.42, 0);
      star.renderOrder = 11;
      g.add(star);
      g.userData.eliteRing = gr;
    }
    // EVO: telegraph próprio do arquétipo (disco / cone / faixa no chão) — materiais compartilhados
    const tele = new THREE.Group();
    tele.name = 'archTele';
    tele.visible = false;
    g.add(tele);
    g.userData.tele = tele;
    // EVO: mescla peças estáticas (pivôs animados, marcadores e barras preservados)
    if (getConfig().graphics?.mergeCharacterParts !== false) {
      g.userData.mergeInfo = mergeStaticParts(g, [armL, armR, legL, legR, mark, ring, hp, frame, fill, pfill, tele, ...(g.userData.eliteRing ? [g.userData.eliteRing] : [])]);
    }
    // M3D: vilão GLB (KayKit Skeletons) — o corpo procedural some quando o modelo carrega (fallback se falhar)
    if (getConfig().graphics?.enemyModels !== false && (tier?.enemyModels !== false || /[?&]enemyModels=1\b/.test(location.search)) && !/[?&]enemyModels=0\b/.test(location.search)) {
      const keep = new Set();
      for (const k of [ring, hp, tele, g.userData.eliteRing]) k?.traverse((q) => keep.add(q));
      const bodyMeshes = [];
      g.traverse((q) => { if ((q.isMesh || q.isInstancedMesh) && !keep.has(q)) bodyMeshes.push(q); });
      const gk = opts.glbKey || opts.variant || arch || 'base';
      g.userData.glb = attachEnemyGlb(g, { key: gk, look: ARCH_LOOK[opts.variant || arch] || { body: bodyTint, armor: armorTint, eye: eyeTint, glow: lineTint }, height: 1.78, bodyMeshes });
    }
    return g;
  }

  /** EVO: peças de silhueta por arquétipo (cores vêm de ARCH_LOOK). */
  function addArchetypeParts(g, arch, P, variant = null) {
    const add = (parent, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); parent.add(m); return m;
    };
    const L = ARCH_LOOK[variant || arch] || {};
    const glow = new THREE.MeshStandardMaterial({ color: L.glow || 0xff3a2a, emissive: L.glow || 0xff3a2a, emissiveIntensity: 1.7, roughness: 0.3 });
    g.userData.archGlowMat = glow;
    if (arch === 'A') {
      // LÂMINA: lâmina longa no braço direito + lâmina de antebraço esquerda
      add(P.armR, new THREE.BoxGeometry(0.05, 0.78, 0.14), glow, 0, -0.95, 0.04);
      add(P.armL, new THREE.BoxGeometry(0.03, 0.42, 0.1), glow, -0.09, -0.4, 0.05);
    } else if (arch === 'B') {
      // VESPA: aletas dorsais varridas + ferrão
      for (const sd of [-1, 1]) add(g, new THREE.BoxGeometry(0.04, 0.5, 0.36), glow, sd * 0.2, 1.25, -0.28, -0.5, 0, sd * 0.5);
      add(g, new THREE.ConeGeometry(0.06, 0.45, 5), P.matDark, 0, 0.75, -0.32, -2.2, 0, 0);
      add(g, new THREE.SphereGeometry(0.035, 6, 6), glow, 0, 0.62, -0.52);
    } else if (arch === 'C') {
      // ATIRADOR: canhão no braço direito + mochila com antena-prato
      add(P.armR, new THREE.CylinderGeometry(0.09, 0.11, 0.5, 8), P.matDark, 0, -0.62, 0.02);
      add(P.armR, new THREE.CylinderGeometry(0.06, 0.06, 0.06, 8), glow, 0, -0.88, 0.02);
      add(g, new THREE.BoxGeometry(0.34, 0.4, 0.16), P.matArmor, 0, 1.05, -0.27);
      add(g, new THREE.CylinderGeometry(0.16, 0.02, 0.06, 10), glow, -0.16, 1.5, -0.3, 0.5, 0, 0.4);
    } else if (arch === 'D') {
      // COURAÇA: escudo frontal no braço esquerdo + blocos de ombro enormes
      add(P.armL, new THREE.BoxGeometry(0.12, 0.8, 0.56), P.matArmor, -0.05, -0.42, 0.2);
      add(P.armL, new THREE.BoxGeometry(0.03, 0.6, 0.04), glow, 0.02, -0.42, 0.49);
      for (const sd of [-1, 1]) add(g, new THREE.BoxGeometry(0.36, 0.26, 0.42), P.matArmor, sd * 0.44, 1.4, 0);
      add(g, new THREE.BoxGeometry(0.5, 0.06, 0.06), glow, 0, 1.18, 0.23);
    } else if (arch === 'E') {
      // TECELÃO: anel orbital na cintura + orbe acima da cabeça + cajado
      add(g, new THREE.TorusGeometry(0.45, 0.025, 6, 24), glow, 0, 0.75, 0, Math.PI / 2, 0, 0);
      add(g, new THREE.IcosahedronGeometry(0.11, 0), glow, 0, 2.05, 0);
      add(P.armR, new THREE.CylinderGeometry(0.025, 0.025, 1.1, 6), P.matDark, 0, -0.5, 0.08);
      add(P.armR, new THREE.OctahedronGeometry(0.09, 0), glow, 0, -1.05, 0.08);
    } else if (arch === 'F') {
      // ELITE: coroa de espinhos dourados + friso dourado no peito
      for (let i = -1; i <= 1; i++) add(g, new THREE.ConeGeometry(0.04, 0.26 - Math.abs(i) * 0.06, 5), glow, i * 0.1, 1.8, 0.05, 0, 0, -i * 0.3);
      add(g, new THREE.BoxGeometry(0.44, 0.04, 0.04), glow, 0, 1.2, 0.22);
      add(P.armR, new THREE.BoxGeometry(0.05, 0.6, 0.12), glow, 0, -0.85, 0.04);
    } else if (arch === 'G') {
      // GUARDIÃO: crista de chifres, duas lâminas, núcleo nas costas
      for (const sd of [-1, 1]) {
        add(g, new THREE.ConeGeometry(0.07, 0.5, 6), P.matDark, sd * 0.2, 1.85, -0.05, -0.5, 0, sd * -0.5);
        add(sd < 0 ? P.armL : P.armR, new THREE.BoxGeometry(0.06, 0.9, 0.16), glow, 0, -1.0, 0.04);
      }
      add(g, new THREE.SphereGeometry(0.15, 10, 8), glow, 0, 1.15, -0.28);
      add(g, new THREE.BoxGeometry(0.62, 0.08, 0.36), P.matArmor, 0, 1.47, 0);
    }
    if (variant === 'A2') {
      // CEIFADOR CARMESIM: capuz em cone rasgado, manto (lathe aberto) e 2ª lâmina longa
      add(g, new THREE.ConeGeometry(0.24, 0.42, 9, 1, true), P.matDark, 0, 1.66, -0.04, -0.25, 0, 0);
      const capeGeo = new THREE.LatheGeometry([[0.3, 1.3], [0.36, 1.0], [0.42, 0.62], [0.46, 0.4]].map(([r, y]) => new THREE.Vector2(r, y)), 10, Math.PI * 0.62, Math.PI * 0.76);
      const capeMat = new THREE.MeshStandardMaterial({ color: 0x1a0408, roughness: 0.8, metalness: 0.1, side: THREE.DoubleSide, emissive: 0x400010, emissiveIntensity: 0.4 });
      const cape = add(g, capeGeo, capeMat, 0, 0, -0.06);
      cape.scale.set(1, 1, 0.7);
      add(P.armL, new THREE.BoxGeometry(0.05, 0.78, 0.14), glow, 0, -0.95, 0.04);
      add(g, new THREE.TorusGeometry(0.12, 0.012, 4, 16), glow, 0, 1.6, 0.17);
    } else if (variant === 'B2') {
      // SOMBRA HEXA: asas hexagonais de vidro-sombra + espinha de cristais
      for (const sd of [-1, 1]) {
        add(g, new THREE.CircleGeometry(0.34, 6), glow, sd * 0.36, 1.25, -0.3, 0, sd * 0.9, 0);
        add(g, new THREE.CircleGeometry(0.22, 6), glow, sd * 0.32, 0.88, -0.28, 0, sd * 1.1, 0.4 * sd);
      }
      for (let i = 0; i < 3; i++) add(g, new THREE.OctahedronGeometry(0.06 - i * 0.012, 0), glow, 0, 1.3 - i * 0.18, -0.26);
    } else if (variant === 'C2') {
      // BOMBARDEIRO RÚNICO: morteiro-relicário nas costas + anel rúnico girando no cano
      add(g, new THREE.CylinderGeometry(0.13, 0.16, 0.7, 10), P.matArmor, 0.12, 1.55, -0.3, -0.5, 0, 0.2);
      add(g, new THREE.TorusGeometry(0.15, 0.022, 5, 16), glow, 0.18, 1.86, -0.12, -0.5 + Math.PI / 2, 0, 0.2);
      add(g, new THREE.CylinderGeometry(0.1, 0.1, 0.04, 10), glow, 0.2, 1.88, -0.12, -0.5, 0, 0.2);
    }
  }

  /** Enriched civilian/tech humanoid — feet at y=0, ~1.7m. NOT used for player body. */
  function makeHumanoid(tint = 0x3ecfbf) {
    const g = new THREE.Group();
    g.name = 'humanoid';
    const matCloth = new THREE.MeshStandardMaterial({
      color: tint, roughness: 0.55, metalness: 0.25,
      emissive: tint, emissiveIntensity: 0.12
    });
    const matSkin = new THREE.MeshStandardMaterial({ color: 0xc4a484, roughness: 0.7 });
    const matPants = new THREE.MeshStandardMaterial({ color: 0x2a3038, roughness: 0.75, metalness: 0.15 });
    const matPack = new THREE.MeshStandardMaterial({
      color: 0x3a4550, roughness: 0.4, metalness: 0.5,
      emissive: ACCENT, emissiveIntensity: 0.2
    });

    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.52, 0.19), matPants);
    legL.position.set(-0.13, 0.26, 0);
    g.add(legL);
    const legR = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.52, 0.19), matPants);
    legR.position.set(0.13, 0.26, 0);
    g.add(legR);

    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.27, 0.68, 12), matCloth);
    torso.position.set(0, 0.88, 0);
    g.add(torso);

    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.32, 0.12), matPack);
    pack.position.set(0, 0.95, -0.2);
    g.add(pack);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 12), matSkin);
    head.position.set(0, 1.42, 0);
    g.add(head);

    // Visor band (tech)
    const band = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.06, 0.06),
      new THREE.MeshStandardMaterial({ color: ACCENT, emissive: ACCENT, emissiveIntensity: 0.55 })
    );
    band.position.set(0, 1.44, 0.14);
    g.add(band);

    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.48, 0.13), matCloth);
    armL.position.set(-0.36, 0.88, 0);
    armL.name = 'armL';
    g.add(armL);
    const armR = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.48, 0.13), matCloth);
    armR.position.set(0.36, 0.88, 0);
    armR.name = 'armR';
    g.add(armR);

    g.userData.flashMats = [matCloth];
    g.userData.baseColors = [tint];
    g.userData.height = 1.7;
    g.userData.animParts = { armL, armR };
    g.position.y = 0;
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    return g;
  }

  function setMeshFlash(mesh, on, flashColor = 0xffaaaa) {
    const mats = mesh.userData?.flashMats;
    const bases = mesh.userData?.baseColors;
    if (!mats) return;
    mats.forEach((m, i) => {
      // EVO: guarda o emissivo original (linhas de Nexa) para restaurar depois do flash
      if (m.userData.baseEmissive == null && m.emissive) { m.userData.baseEmissive = m.emissive.getHex(); m.userData.baseEI = m.emissiveIntensity; }
      const rim = m.userData.rim;
      if (rim && rim.baseStrength == null) rim.baseStrength = rim.rimStrength.value;
      if (on) {
        m.color.set(flashColor);
        if (m.emissive) m.emissive.set(flashColor);
        m.emissiveIntensity = m.emissiveMap ? 1.6 : 0.55;
        if (rim) rim.rimStrength.value = 2.2;
      } else if (bases?.[i] != null) {
        m.color.set(bases[i]);
        if (m.emissive) m.emissive.setHex(m.userData.baseEmissive ?? bases[i]);
        m.emissiveIntensity = m.userData.baseEI ?? (i === 0 ? 0.12 : 0.08);
        if (rim) rim.rimStrength.value = rim.baseStrength;
      }
    });
    const eye = mesh.userData?.eyeMat;
    if (eye) eye.emissiveIntensity = on ? 1.6 : 0.95;
  }

  /** Olhos/visor/corpo por estado da IA (só troca materiais quando muda). */
  function applyBotLook(mesh, look) {
    const ud = mesh.userData;
    ud.glb?.setLook(look);
    if (look === 'flash') { setMeshFlash(mesh, true, 0xffb08a); return; }
    setMeshFlash(mesh, false);
    const eye = ud.eyeMat;
    const visor = ud.visorMat;
    if (look === 'danger') {
      eye.color.set(0xff1a10); eye.emissive.set(0xff1a10); eye.emissiveIntensity = 3.2;
      visor.emissive.set(0xff2010); visor.emissiveIntensity = 1.8;
    } else if (look === 'alert') {
      eye.color.set(0xffd040); eye.emissive.set(0xffc030); eye.emissiveIntensity = 2.4;
      visor.emissive.set(ud.eyeTint); visor.emissiveIntensity = 0.9;
    } else if (look === 'dim') {
      eye.color.set(ud.eyeTint); eye.emissive.set(ud.eyeTint); eye.emissiveIntensity = 0.25;
      visor.emissive.set(ud.eyeTint); visor.emissiveIntensity = 0.1;
    } else {
      eye.color.set(ud.eyeTint); eye.emissive.set(ud.eyeTint); eye.emissiveIntensity = 0.95;
      visor.emissive.set(ud.eyeTint); visor.emissiveIntensity = 0.35;
    }
  }

  /** Seta de ameaça na borda quando quem prepara o golpe está fora do campo de visão. */
  function updateThreat(state) {
    if (!threatEl) return;
    let show = false;
    if (telegraphUids.length && canvas) {
      const px = fpsCam.state.visX / TILE;
      const py = fpsCam.state.visZ / TILE;
      const yaw = fpsCam.getYaw();
      const cam = fpsCam.camera;
      const halfH = Math.atan(Math.tan((cam.fov * DEG) / 2) * cam.aspect);
      let bestRel = 0;
      let found = false;
      for (let i = 0; i < telegraphUids.length; i++) {
        const entry = entityMeshes.get(entKey('mon', telegraphUids[i]));
        if (!entry) continue;
        const dx = entry.mesh.position.x / TILE - px;
        const dy = entry.mesh.position.z / TILE - py;
        let rel = Math.atan2(dx, -dy) - yaw;
        rel = Math.atan2(Math.sin(rel), Math.cos(rel));
        if (Math.abs(rel) > halfH * 0.85) { bestRel = rel; found = true; break; }
      }
      if (found) {
        show = true;
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        const x = w / 2 + Math.sin(bestRel) * (w / 2 - 30);
        const y = h / 2 - Math.cos(bestRel) * (h / 2 - 30);
        threatEl.style.transform = `translate(${x.toFixed(0)}px,${y.toFixed(0)}px) rotate(${(bestRel / DEG).toFixed(0)}deg)`;
      }
    }
    const disp = show ? 'block' : 'none';
    if (threatEl.style.display !== disp) threatEl.style.display = disp;
  }

  /** Bloco 7: estado do chefe para HUD/testes (qual telegraph está visível). */
  const bossInfo = { uid: null, telegraph: '', visible: false, x: 0, z: 0, height: 0, framing: 0 };
  let bossFrameK = 0;
  function updateBossEntity(entry, m, now) {
    const v = getBossView(m);
    const bc = getConfig().arenaBoss;
    const dt = Math.min(0.1, Math.max(0, (now - entry.lastNow) / 1000));
    entry.lastNow = now;
    const fx = v ? v.fx : m.x + 0.5;
    const fy = v ? v.fy : m.y + 0.5;
    entry.mesh.position.set(fx * TILE, groundAt(fx, fy), fy * TILE);
    if (v) entry.mesh.rotation.y = Math.PI - v.facing;
    const ai = getAiView(m);
    const flashing = !!(ai && getAiClock() < ai.flashUntil);
    entry.view.update(v, { dt, now, cfg: bc, flashing });
    if (v && (v.state === AI_STATES.ATTACK_PREPARE || v.state === AI_STATES.ATTACK)) telegraphUids.push(m.uid);
    bossInfo.uid = m.uid;
    bossInfo.telegraph = entry.view.getTelegraph();
    bossInfo.visible = entry.mesh.visible;
    bossInfo.x = fx; bossInfo.z = fy;
    bossInfo.height = entry.view.height;
    bossInfo.seen = true;
  }
  /** Câmera: enquadra o chefe (braço mais longo/alto + FOV) quando engajado/travado e perto. */
  function updateBossFraming(state, dt) {
    const bc = getConfig().arenaBoss;
    let want = 0;
    if (bossInfo.seen && bc?.camera) {
      const boss = state.monstersAlive.find((q) => q.boss && q.alive && q.zone === state.zoneId);
      if (boss) {
        const v = getBossView(boss);
        const px = fpsCam.state.visX / TILE;
        const py = fpsCam.state.visZ / TILE;
        const d = v ? Math.hypot(v.fx - px, v.fy - py) : 99;
        const engaged = v && v.state !== AI_STATES.IDLE && v.state !== AI_STATES.RETURN;
        const locked = hooks.getLockOnUid?.() === boss.uid;
        if ((engaged || locked) && d <= bc.camera.engageRange) want = 1;
      }
    }
    const k = 1 - Math.exp(-(bc?.camera?.blendPerSec || 2) * Math.max(0, dt));
    bossFrameK += (want - bossFrameK) * k;
    if (Math.abs(bossFrameK - want) < 0.002) bossFrameK = want;
    setBossFraming(bossFrameK);
    bossInfo.framing = +bossFrameK.toFixed(3);
  }

  // —— RIVAIS (BOTS offline): entidade = hero GLB + etiqueta "NOME · BOT" + barra de vida + anel de aviso ——
  const rivalStats = { made: 0, removed: 0, ready: 0, animSkipped: 0, shown: 0 };
  function rivalTagMat(text, color) {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 48; const c2 = cv.getContext('2d');
    c2.fillStyle = 'rgba(8,4,10,0.72)'; c2.beginPath(); c2.roundRect?.(2, 4, 252, 40, 10); if (!c2.roundRect) c2.rect(2, 4, 252, 40); c2.fill();
    c2.strokeStyle = color; c2.lineWidth = 3; c2.stroke();
    c2.fillStyle = '#fff'; c2.font = 'bold 22px system-ui, sans-serif'; c2.textAlign = 'center'; c2.textBaseline = 'middle'; c2.fillText(text, 128, 25);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    return new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
  }
  function makeRivalEntity(m) {
    const R0 = m.rival; const root = new THREE.Group(); root.rotation.order = 'YXZ';
    const body = new THREE.Group(); root.add(body);
    const own = [];
    // sem GLB (preset baixo desliga modelos, igual ao herói do jogador): humanoide procedural na cor do rival
    const fb = makeHumanoid(new THREE.Color(R0.primary).getHex()); body.add(fb);
    fb.traverse((o) => { if (o.geometry && !o.geometry.userData?.shared) own.push(o.geometry); if (o.material && !o.material.userData?.shared) own.push(o.material); });
    const glb = attachHeroGlb({ root: body, setProceduralBodyVisible(v) { fb.visible = !!v; } }, { styleId: R0.style, custom: { primary: R0.primary, glow: R0.glow } });
    const tagMat = rivalTagMat(`${R0.name} · BOT NV ${R0.level || 1}`, R0.primary);
    const tag = new THREE.Sprite(tagMat); tag.scale.set(1.25, 0.235, 1); tag.position.y = 2.45; tag.renderOrder = 13; root.add(tag);
    // sem barra de vida sobre o rival (pedido do Caio): só números de dano, como inimigos comuns
    // anel no chão (cor do rival; pulsa vermelho no aviso de golpe)
    const rgGeo = new THREE.RingGeometry(0.55, 0.68, 28); rgGeo.rotateX(-Math.PI / 2); const rgMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(R0.primary), transparent: true, opacity: 0.55, depthWrite: false });
    const ring = new THREE.Mesh(rgGeo, rgMat); ring.position.y = 0.04; root.add(ring); own.push(rgGeo, rgMat);
    rivalStats.made++;
    return { mesh: root, body, kind: 'mon', uid: m.uid, rival: true, glb, tag, tagLvl: R0.level || 1, ring, ringMat: rgMat, fb, own, lastNow: 0, animAcc: 0, champ: false, fx: null, fy: null };
  }
  function updateRivalEntity(entry, m, now, aiClock) {
    const v = getAiView(m); const synced = v && v.syncX === m.x && v.syncY === m.y;
    const fx = synced ? v.fx : m.x + 0.5, fy = synced ? v.fy : m.y + 0.5;
    const dt = entry.lastNow ? Math.min(0.1, (now - entry.lastNow) / 1000) : 0.016; entry.lastNow = now;
    const root = entry.mesh;
    root.position.set(fx * TILE, groundAt(fx, fy), fy * TILE);
    if (synced) root.rotation.y = Math.PI - v.facing;
    const sm = m.sizeMult || 1; entry.body.scale.setScalar(sm);
    // etiqueta acompanha o nível (sobe com o herói; CAMPEÃO = +2)
    if ((m.rival.level || 1) !== entry.tagLvl) { const old = entry.tag.material; entry.tag.material = rivalTagMat(`${m.rival.name} · BOT NV ${m.rival.level || 1}`, m.rival.primary); old.map?.dispose(); old.dispose(); entry.tagLvl = m.rival.level || 1; }
    if (m.rival.champion && !entry.champ) { entry.champ = true; entry.ring.scale.setScalar(1.5); entry.tag.position.y = 2.45 * sm + 0.1; }
    const st = synced ? v.state : AI_STATES.IDLE; const stT = synced ? aiClock - v.stateAt : 0;
    const prep = st === AI_STATES.ATTACK_PREPARE;
    entry.ringMat.color.set(m.rival.primary); entry.ringMat.opacity = prep ? 0.6 + 0.35 * Math.sin(now * 0.025) : 0.45; // aviso do golpe: anel pulsa na cor do rival (sem vermelho/sangue)
    setTeleMark(entry, root, prep, prep && stT > 380, 2.85 * sm, 1, now); // M10 passo 3: "!" também no rival (aviso legível)
    // LOD de animação: longe (> 12 tiles) anima 1 a cada 3 quadros
    const d = Math.hypot(fx - fpsCam.state.visX / TILE, fy - fpsCam.state.visZ / TILE);
    if (entry.glb.info.status === 'ready') { if (!entry.ready) { entry.ready = true; rivalStats.ready++; } }
    entry.animAcc += dt; entry.animN = (entry.animN || 0) + 1;
    if (d > 12 && entry.animN % 3 !== 0) { rivalStats.animSkipped++; return; }
    const adt = entry.animAcc; entry.animAcc = 0;
    const speed = synced ? v.speed || 0 : 0; const moveK = Math.min(1, speed / 2.4); const runK = Math.max(0, Math.min(1, (speed - 2.4) / 1.2));
    let action = null; let attacking = false; let attackPhase = 'IDLE'; let attackT = 0;
    const special = v && v.move === 'special';
    if (st === AI_STATES.ATTACK_PREPARE || st === AI_STATES.ATTACK || st === AI_STATES.RECOVERY) {
      attackPhase = st === AI_STATES.ATTACK_PREPARE ? 'STARTUP' : st === AI_STATES.ATTACK ? 'ACTIVE' : 'RECOVERY';
      attackT = Math.min(1, stT / (st === AI_STATES.ATTACK_PREPARE ? 520 : st === AI_STATES.ATTACK ? 150 : 520));
      if (special) action = { kind: 'ataque_area', phase: attackPhase, t: attackT }; else attacking = true;
    } else if (v && aiClock < (v.dodgeUntil || 0)) {
      action = { kind: 'dodge', t: 1 - (v.dodgeUntil - aiClock) / 280, dirX: v.dodgeVx || 0, dirY: v.dodgeVy || 0 };
    } else if (m.rivalSwingAt && performance.now() - m.rivalSwingAt < 520) {
      // golpe contra monstro/rival (simulação da arena)
      attacking = true; const k = (performance.now() - m.rivalSwingAt) / 520;
      attackPhase = k < 0.35 ? 'STARTUP' : k < 0.55 ? 'ACTIVE' : 'RECOVERY'; attackT = k < 0.35 ? k / 0.35 : k < 0.55 ? (k - 0.35) / 0.2 : (k - 0.55) / 0.45;
    }
    const hurtT = 0; // sem tinta vermelha de dano no rival (pedido do Caio) — só os números de dano
    entry.glb.update(adt, { action, attacking, combo: (m.rivalSwingN || 0) % 3, attackPhase, attackT, hurtT, moveK, runK, speed, walkSpeed: 2.4, runSpeed: 3.4, yaw: synced ? v.facing : 0, charge: m.rival.champion ? 0.4 : 0.1, time: now / 1000 });
    rivalStats.shown++;
  }

  function syncEntities(state, zone, now) {
    bossInfo.seen = false;
    bossInfo.telegraph = '';
    const live = liveKeys;
    live.clear();
    const tBob = now * 0.003;

    // Monsters — bots 3D em posição FLOAT da IA (gp2), giro suave, telegraph
    telegraphUids.length = 0;
    const aiClock = getAiClock();
    const ecfg = getConfig().enemyAi;
    const mons = state.monstersAlive;
    for (let i = 0; i < mons.length; i++) {
      const m = mons[i];
      if (!m.alive || m.zone !== zone.id) continue;
      const key = entKey('mon', m.uid);
      live.add(key);
      let entry = entityMeshes.get(key);
      // ARENA PRINCIPAL — LOD visual: longe do herói o bot não é desenhado nem animado (malha fica no lugar, sem recriar)
      if (zone.br && !m.boss) {
        const far = Math.hypot(m.x + 0.5 - fpsCam.state.visX / TILE, m.y + 0.5 - fpsCam.state.visZ / TILE) > (tierName === 'low' ? 20 : tierName === 'medium' ? 23 : 32) * (m.rival ? 1 : brLodK); // fase 9: degrau 'enemyLod' encurta
        if (far) { if (entry) entry.mesh.visible = false; brLod.hidden++; continue; }
        brLod.shown++;
        if (entry && !entry.mesh.visible) entry.mesh.visible = true;
      }
      // ARENA PRINCIPAL — o Gigante Verde mora longe: além da névoa (≥38 tiles) não é desenhado (IA/HUD seguem normais)
      if (zone.br && m.boss && entry) {
        const farB = Math.hypot(m.x + 0.5 - fpsCam.state.visX / TILE, m.y + 0.5 - fpsCam.state.visZ / TILE) > 38;
        if (farB) { entry.mesh.visible = false; brLod.hidden++; continue; }
        if (!entry.mesh.visible) entry.mesh.visible = true;
      }
      // RIVAIS (BOTS offline): herói rival com o MESMO GLB de herói (estilo + cores próprias), nome "BOT" e barra de vida
      if (m.rival) {
        if (!entry) { entry = makeRivalEntity(m); entityRoot.add(entry.mesh); entityMeshes.set(key, entry); }
        updateRivalEntity(entry, m, now, aiClock);
        continue;
      }
      // Bloco 7: GIGANTE VERDE — modelo procedural próprio (dragão inimigo colossal) + telegraphs no chão
      if (m.boss) {
        if (!entry) {
          const bc = getConfig().arenaBoss;
          const view = createBossDragon({ height: bc.visualHeight });
          entityRoot.add(view.root);
          entry = { mesh: view.root, kind: 'mon', uid: m.uid, boss: true, view, lastNow: now, look: '' };
          entityMeshes.set(key, entry);
        }
        updateBossEntity(entry, m, now);
        continue;
      }
      if (!entry) {
        const def = state._monsters[m.id];
        const arch = m.arch || def?.arquetipo || null;
        const patrol = (def?.id || '').includes('patrulha');
        const variant = def?.visual && ARCH_LOOK[def.visual] && def.visual !== arch ? def.visual : null;
        const lookKey = variant || arch || (patrol ? 'patrol' : 'base');
        // EVO: reaproveita bots do pool (sem recriar/descartar materiais → sem recompilar shaders)
        let mesh = botPool[lookKey]?.pop() || null;
        if (!mesh) {
          const L = ARCH_LOOK[variant || arch];
          mesh = makeBot3D({
            arch, variant, glbKey: lookKey, lineTint: L ? L.glow : undefined,
            bodyTint: L ? L.body : patrol ? 0x4a6578 : 0x8a4540,
            armorTint: L ? L.armor : patrol ? 0x6a90a8 : 0xc07060,
            eyeTint: L ? L.eye : patrol ? 0xff7a3a : 0xff3a2a // Bloco V: olhos vermelhos/âmbar (hostis) em todos os bots
          });
          mesh.userData.lookKey = lookKey;
        } else {
          mesh.visible = true;
          mesh.rotation.set(0, 0, 0);
          applyBotLook(mesh, 'base');
        }
        entityRoot.add(mesh);
        entry = { mesh, kind: 'mon', uid: m.uid, bobPhase: Math.random() * Math.PI * 2, walkPhase: 0, look: '', arch };
        entityMeshes.set(key, entry);
      }
      const v = getAiView(m);
      const synced = v && v.syncX === m.x && v.syncY === m.y;
      const fx = synced ? v.fx : m.x + 0.5;
      const fy = synced ? v.fy : m.y + 0.5;
      const st = synced ? v.state : AI_STATES.IDLE;
      const stT = synced ? aiClock - v.stateAt : 0;
      const speed = synced ? v.speed : 0;
      const mesh = entry.mesh;
      const bob = 0.02 + Math.sin(tBob + entry.bobPhase) * 0.015; // pés no chão
      mesh.position.set(fx * TILE, bob + groundAt(fx, fy), fy * TILE);
      if (synced) {
        mesh.rotation.y = Math.PI - v.facing; // facing (0 = -y) → yaw do mesh (frente +z)
      } else {
        const pdx = state.player.x - m.x;
        const pdy = state.player.y - m.y;
        if (pdx !== 0 || pdy !== 0) mesh.rotation.y = Math.atan2(pdx, pdy);
      }
      const ud = mesh.userData;
      const ap = ud.animParts;
      // pernas: passada proporcional à velocidade
      entry.walkPhase += speed * 0.11;
      const legSw = speed > 0.05 ? Math.sin(entry.walkPhase * 6) * 0.45 : 0;
      ap.legL.rotation.x = legSw;
      ap.legR.rotation.x = -legSw;
      // EVO: braços em contra-passada ao andar; parado, respiração (ombros sobem/descem)
      const breath = Math.sin(tBob * 1.6 + entry.bobPhase);
      let armR = speed > 0.05 ? -legSw * 0.7 : breath * 0.07;
      let armL = speed > 0.05 ? legSw * 0.7 : -breath * 0.07;
      let lean = 0;
      let wobble = 0;
      let look = 'base';
      let markMat = null;
      let ringOn = false;
      let ringScale = 1;
      const T = synced && entry.arch ? v.tele : null;
      if (T && (st === AI_STATES.ATTACK_PREPARE || st === AI_STATES.ATTACK)) {
        // EVO: pose por tipo de ataque (TELEGRAPH → WINDUP → ATTACK)
        const p = st === AI_STATES.ATTACK ? 1 : Math.min(1, T.progress || 0);
        const e = 1 - (1 - p) * (1 - p);
        const atk = st === AI_STATES.ATTACK;
        if (T.kind === 'shot') { armR = 1.55 * e; lean = -0.05 * e; }
        else if (T.kind === 'slam' || T.kind === 'nova' || T.kind === 'roar') { armR = atk ? -0.6 : 2.9 * e; armL = atk ? -0.6 : 2.9 * e; lean = atk ? 0.25 : -0.2 * e; }
        else if (T.kind === 'hazard') { armR = 2.2 * e; armL = 2.2 * e; lean = -0.1 * e; }
        else if (T.kind === 'lunge' || T.kind === 'charge') { armR = atk ? 1.4 : 0.6 * e; armL = atk ? 1.4 : 0.6 * e; lean = atk ? 0.42 : -0.12 * e; }
        else { armR = atk ? -0.9 : 2.5 * e; armL = -0.3 * e; lean = atk ? 0.18 : -0.16 * e; }
        look = 'danger';
        markMat = st === AI_STATES.ATTACK_PREPARE ? shared.dangerMat : null;
        telegraphUids.push(m.uid);
      } else if (st === AI_STATES.ATTACK_PREPARE) {
        const p = Math.min(1, stT / ecfg.attackStartupMs);
        const e = 1 - (1 - p) * (1 - p);
        armR = 2.5 * e; // braço sobe para trás
        armL = -0.3 * e;
        lean = -0.16 * e; // inclina para trás
        look = 'danger';
        markMat = shared.dangerMat;
        ringOn = true;
        ringScale = 0.85 + 0.25 * (0.5 + 0.5 * Math.sin(stT * 0.025));
        telegraphUids.push(m.uid);
      } else if (st === AI_STATES.ATTACK) {
        const q = Math.min(1, stT / ecfg.attackActiveMs);
        armR = 2.5 + (-0.9 - 2.5) * q * q;
        lean = 0.18 * q;
        look = 'danger';
        ringOn = true;
        ringScale = 1.15;
        telegraphUids.push(m.uid);
      } else if (st === AI_STATES.RECOVERY) {
        const q = Math.min(1, stT / ecfg.attackRecoveryMs);
        armR = -0.9 * (1 - q);
        lean = 0.14 * (1 - q);
        look = 'dim'; // vulnerável
      } else if (st === AI_STATES.STUN) {
        wobble = Math.sin(stT * 0.045) * 0.16;
        armR = 0.5;
        armL = 0.5;
        look = (Math.floor(stT / 70) % 2) ? 'dim' : 'base';
      } else if (st === AI_STATES.DETECT || st === AI_STATES.ALERT) {
        look = 'alert';
        markMat = shared.alertMat;
      }
      ap.armR.rotation.x = armR;
      ap.armL.rotation.x = armL;
      if (ud.glb && ud.glb.status === 'ready') {
        const dtE = Math.min(0.1, Math.max(0, (now - (entry.glbT || now)) / 1000));
        entry.glbT = now;
        let gph = 'idle'; let gp = 0;
        if (st === AI_STATES.ATTACK_PREPARE) { gph = 'prepare'; gp = T ? Math.min(1, T.progress || 0) : Math.min(1, stT / ecfg.attackStartupMs); }
        else if (st === AI_STATES.ATTACK) { gph = 'attack'; gp = Math.min(1, stT / ecfg.attackActiveMs); }
        else if (st === AI_STATES.RECOVERY) { gph = 'recovery'; gp = Math.min(1, stT / ecfg.attackRecoveryMs); }
        else if (st === AI_STATES.STUN) { gph = 'stun'; gp = stT / 1000; }
        ud.glb.update(dtE, { speed, phase: gph, p: gp, kind: T?.kind || 'melee' });
        lean *= 0.35; // o clipe já inclina o corpo
      }
      mesh.rotation.x = lean;
      mesh.rotation.z = wobble;
      ud.mark.visible = !!markMat;
      if (markMat && ud.mark.material !== markMat) ud.mark.material = markMat;
      ud.ring.visible = ringOn;
      if (ringOn) ud.ring.scale.set(ringScale, ringScale, ringScale);
      const flashing = synced && aiClock < v.flashUntil;
      if (flashing) look = 'flash';
      if (entry.look !== look) {
        entry.look = look;
        applyBotLook(mesh, look);
      }

      const pct = m.hpMax ? m.hp / m.hpMax : 1;
      const s = (0.95 + 0.08 * pct) * ((ud.baseScale || 1.05) / 1.05) * (m.sizeMult || 1);
      mesh.scale.set(s, s * (m.lurking ? 0.62 : 1) * (1 + (speed > 0.05 ? 0 : 0.014 * breath)), s); // M10: predador à espreita fica agachado
      if (entry.arch) updateArchTele(entry, synced ? v : null, now);
      // EVO: barra de postura + QUEBRA (pisca branco)
      if (ud.postureFill && synced) {
        const ps = getPosture(m);
        const pf = ps.max ? ps.posture / ps.max : 0;
        ud.postureFill.visible = pf > 0.01 || ps.broken;
        if (ud.postureFill.visible) {
          ud.postureFill.scale.x = Math.max(0.001, ps.broken ? 1 : pf);
          const mat = ps.broken && (Math.floor(now / 90) % 2) ? shared.postureBrokenMat : shared.postureMat;
          if (ud.postureFill.material !== mat) ud.postureFill.material = mat;
        }
      }
      if (ud.eliteRing) ud.eliteRing.rotation.z = now * 0.0015;
      // barra de vida: preenchimento = % de HP; sempre de frente para a câmera
      if (ud.hpBar) {
        ud.hpFill.scale.x = Math.max(0.001, pct);
        ud.hpFill.position.x = -0.33;
        ud.hpBar.quaternion.copy(mesh.quaternion).invert().multiply(fpsCam.camera.quaternion);
      }
    }
    if (shared.ringMat && telegraphUids.length) shared.ringMat.opacity = 0.55 + 0.35 * (0.5 + 0.5 * Math.sin(now * 0.02));

    // NPCs — 3D humanoids (never render player avatar; skip same-tile overlap)
    for (const n of state._data.npcs.npcs) {
      if (n.zone !== zone.id) continue;
      if (n.x === state.player.x && n.y === state.player.y) continue;
      const key = entKey('npc', n.id);
      live.add(key);
      let entry = entityMeshes.get(key);
      if (!entry) {
        const elder = /rusk|elder|hesh|brak/i.test(n.id + n.name);
        const mesh = makeHumanoid(elder ? 0xc9a227 : 0x3ecfbf);
        entityRoot.add(mesh);
        entry = { mesh, kind: 'npc', id: n.id, bobPhase: Math.random() * Math.PI * 2 };
        entityMeshes.set(key, entry);
      }
      const wx = (n.x + 0.5) * TILE;
      const wz = (n.y + 0.5) * TILE;
      const bob = 0.01 + Math.sin(tBob * 0.7 + entry.bobPhase) * 0.01;
      entry.mesh.position.set(wx, bob, wz);
      const pdx = state.player.x - n.x;
      const pdy = state.player.y - n.y;
      if (pdx !== 0 || pdy !== 0) {
        entry.mesh.rotation.y = Math.atan2(pdx, pdy);
      }
    }

    for (const [key, entry] of entityMeshes) {
      if (live.has(key)) continue;
      entityRoot.remove(entry.mesh);
      // RIVAIS: o GLB do herói compartilha geometria com o cache de modelos → só remove (sem dispose); libera o próprio
      if (entry.rival) { entry.own.forEach((o) => o.dispose?.()); entry.tag.material.map?.dispose(); entry.tag.material.dispose(); entityMeshes.delete(key); rivalStats.removed++; continue; }
      // EVO: bots voltam para o pool (cap por visual) — sem dispose de material compartilhável
      const lk = entry.kind === 'mon' && !entry.boss ? entry.mesh.userData?.lookKey : null;
      if (lk) {
        const pool = botPool[lk] || (botPool[lk] = []);
        if (pool.length < 8) {
          if (entry.mesh.userData.tele) entry.mesh.userData.tele.visible = false;
          pool.push(entry.mesh);
          entityMeshes.delete(key);
          continue;
        }
      }
      entry.mesh.traverse?.((o) => {
        if (o.geometry && !o.geometry.userData?.shared) o.geometry.dispose();
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
          else if (!o.material.userData?.shared) o.material.dispose();
        }
      });
      entityMeshes.delete(key);
    }
  }

  // —— EVO: projéteis / zonas de perigo de inimigos (InstancedMesh: 1–2 draw calls no total) ——
  let enemyFx = null;
  function ensureEnemyFx() {
    if (enemyFx || !scene) return;
    const maxP = getConfig().enemyHazards.maxProjectiles;
    const maxH = getConfig().enemyHazards.maxHazards;
    const pm = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending });
    const proj = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.2, 1), pm, maxP);
    proj.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(maxP * 3), 3);
    proj.count = 0; proj.frustumCulled = false; proj.name = 'enemyProjectiles';
    const hm = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const hg = new THREE.CircleGeometry(1, 36); hg.rotateX(-Math.PI / 2);
    const haz = new THREE.InstancedMesh(hg, hm, maxH);
    haz.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(maxH * 3), 3);
    haz.count = 0; haz.frustumCulled = false; haz.renderOrder = 3; haz.name = 'enemyHazards';
    const em = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const eg = new THREE.RingGeometry(0.9, 1, 40); eg.rotateX(-Math.PI / 2);
    const edge = new THREE.InstancedMesh(eg, em, maxH);
    edge.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(maxH * 3), 3);
    edge.count = 0; edge.frustumCulled = false; edge.renderOrder = 4; edge.name = 'enemyHazardEdges';
    scene.add(proj, haz, edge);
    enemyFx = { proj, haz, edge, dummy: new THREE.Object3D(), col: new THREE.Color() };
  }
  // —— ARSENAL: flechas / raios do herói + áreas (chuva de flechas, nova arcana) na cor da família ——
  let heroFx = null;
  function ensureHeroFx() {
    if (heroFx || !scene) return;
    const mk = (geo, max, opacity, name, order = 0) => {
      const m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
      const im = new THREE.InstancedMesh(geo, m, max);
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
      im.count = 0; im.frustumCulled = false; im.name = name; im.renderOrder = order;
      return im;
    };
    const ag = new THREE.CylinderGeometry(0.035, 0.035, 0.9, 5); ag.rotateX(Math.PI / 2);
    const arrows = mk(ag, 24, 0.95, 'heroArrows');
    const bolts = mk(new THREE.IcosahedronGeometry(0.2, 1), 24, 0.95, 'heroBolts');
    const rg = new THREE.RingGeometry(0.82, 1, 40); rg.rotateX(-Math.PI / 2);
    const rings = mk(rg, 12, 0.85, 'heroBurstRings', 4);
    const dg = new THREE.CircleGeometry(1, 32); dg.rotateX(-Math.PI / 2);
    const discs = mk(dg, 12, 0.35, 'heroBurstDiscs', 3);
    scene.add(arrows, bolts, rings, discs);
    heroFx = { arrows, bolts, rings, discs, dummy: new THREE.Object3D(), col: new THREE.Color() };
  }
  function updateHeroFx(now) {
    if (!heroProjectiles.length && !heroBursts.length && !heroFx) return;
    ensureHeroFx();
    if (!heroFx) return;
    const { arrows, bolts, rings, discs, dummy, col } = heroFx;
    let na = 0; let nb = 0;
    for (const p of heroProjectiles) {
      if (!p.alive) continue;
      const bolt = p.kind === 'bolt' || p.kind === 'arcane';
      const im = bolt ? bolts : arrows;
      const n = bolt ? nb : na;
      if (n >= im.instanceMatrix.count) continue;
      dummy.position.set(p.x * TILE, 1.2 + groundAt(p.x, p.y), p.y * TILE);
      dummy.rotation.set(0, -p.yaw, 0);
      const big = p.kind === 'charged' || p.kind === 'arcane' ? 1.8 : 1;
      if (bolt) dummy.scale.setScalar(big * (1 + 0.2 * Math.sin(now * 0.03 + p.id)) * TILE); else dummy.scale.set(big * TILE, big * TILE, big * TILE);
      dummy.updateMatrix();
      im.setMatrixAt(n, dummy.matrix);
      col.setHex(p.color).multiplyScalar(2.4);
      im.setColorAt(n, col);
      if (bolt) nb++; else na++;
    }
    arrows.count = na; bolts.count = nb;
    let nr = 0;
    const clk = heroFxNow();
    for (const b of heroBursts) {
      if (nr >= rings.instanceMatrix.count) break;
      const life = Math.max(0.0001, b.until - b.born);
      const age = Math.max(0, Math.min(1, (clk - b.born) / life));
      const k = b.kind === 'spark' ? 0.4 + age : 0.55 + 0.45 * Math.min(1, age * 2.2);
      const R = b.r * TILE * k;
      dummy.position.set(b.x * TILE, 0.06 + groundAt(b.x, b.y), b.y * TILE);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(R, 1, R);
      dummy.updateMatrix();
      rings.setMatrixAt(nr, dummy.matrix);
      discs.setMatrixAt(nr, dummy.matrix);
      const fade = 1 - age;
      col.setHex(b.color).multiplyScalar(1.8 * fade);
      rings.setColorAt(nr, col);
      col.setHex(b.color).multiplyScalar(0.8 * fade);
      discs.setColorAt(nr, col);
      nr++;
    }
    rings.count = nr; discs.count = nr;
    for (const im of [arrows, bolts, rings, discs]) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
  }
  function updateEnemyFx(zone, now) {
    if (!enemyProjectiles.length && !enemyHazardList.length && !enemyFx) return;
    ensureEnemyFx();
    const { proj, haz, edge, dummy, col } = enemyFx;
    let n = 0;
    const aiNow = getAiClock();
    for (const p of enemyProjectiles) {
      if (!p.alive || n >= proj.instanceMatrix.count) continue;
      dummy.position.set(p.x * TILE, 1.15 + groundAt(p.x, p.y), p.y * TILE);
      const pulse = 1 + 0.25 * Math.sin(now * 0.03 + n);
      dummy.scale.setScalar((p.r / 0.28) * pulse);
      dummy.rotation.set(0, now * 0.01, 0);
      dummy.updateMatrix();
      proj.setMatrixAt(n, dummy.matrix);
      col.setHex(0x6ad8ff).multiplyScalar(2.2);
      proj.setColorAt(n, col);
      n++;
    }
    proj.count = n;
    proj.instanceMatrix.needsUpdate = true;
    if (proj.instanceColor) proj.instanceColor.needsUpdate = true;
    let h = 0;
    for (const z of enemyHazardList) {
      if (!z.alive || h >= haz.instanceMatrix.count) continue;
      const armed = aiNow >= z.armAt;
      const R = z.r * TILE;
      const k = armed ? 1 : Math.max(0.15, 1 - (z.armAt - aiNow) / 750);
      dummy.position.set(z.x * TILE, 0.04 + groundAt(z.x, z.y), z.y * TILE);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(R * k, 1, R * k);
      dummy.updateMatrix();
      haz.setMatrixAt(h, dummy.matrix);
      const fade = Math.min(1, (z.until - aiNow) / 600);
      if (z.kind === 'boss') col.setHex(armed ? 0x5dff6a : 0x2a6a2a); else col.setHex(armed ? 0xff3ae8 : 0x5a1a50);
      col.multiplyScalar((armed ? 0.55 + 0.15 * Math.sin(now * 0.012 + h) : 0.35) * fade);
      haz.setColorAt(h, col);
      dummy.scale.set(R, 1, R);
      dummy.updateMatrix();
      edge.setMatrixAt(h, dummy.matrix);
      col.setHex(armed ? 0xffffff : 0xffc23a).multiplyScalar(armed ? 0.6 * fade : 0.5 + 0.5 * Math.sin(now * 0.025));
      edge.setColorAt(h, col);
      h++;
    }
    haz.count = h; edge.count = h;
    haz.instanceMatrix.needsUpdate = true; edge.instanceMatrix.needsUpdate = true;
    if (haz.instanceColor) haz.instanceColor.needsUpdate = true;
    if (edge.instanceColor) edge.instanceColor.needsUpdate = true;
    // portões do Campo de Ascensão: barreira visível enquanto fechado
    if (gateMeshes.length) {
      for (const gm of gateMeshes) {
        const closed = !!zone.closed?.[gm.userData.gateType];
        gm.visible = closed;
        if (closed) gm.material.opacity = 0.55 + 0.25 * Math.sin(now * 0.006);
      }
    }
  }

  /**
   * EVO: pré-compila os shaders da zona (inclusive VFX/indicadores ocultos e um bot de cada arquétipo
   * no Campo) — o 1º golpe/telegraph não trava o quadro. Também reaplica degraus já descartados.
   */
  const precompileInfo = { zone: '', ms: 0, async: false, prewarmed: 0, programs: 0 };
  function precompileZone(zone) {
    if (dropped.pointLights) { let n = 0; worldRoot?.traverse((o) => { if (o.isPointLight) { n++; if (n > 2) o.visible = false; } }); }
    if (dropped.city && city?.group) city.group.visible = false;
    if (dropped.rain && rain?.object) rain.object.visible = false;
    if (!getConfig().graphics.precompileShaders || !renderer) return;
    const t0 = performance.now();
    const temp = [];
    if (zone.campo || zone.br) {
      for (const key of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'A2', 'B2', 'C2']) {
        const pool = botPool[key] || (botPool[key] = []);
        if (pool.length) continue;
        const L = ARCH_LOOK[key];
        const arch = L.arch || key;
        const mesh = makeBot3D({ arch, variant: L.arch ? key : null, glbKey: key, lineTint: L.glow, bodyTint: L.body, armorTint: L.armor, eyeTint: L.eye });
        mesh.userData.lookKey = key;
        mesh.position.set(-50, -50, -50);
        entityRoot.add(mesh);
        temp.push(mesh);
      }
      ensureEnemyFx();
    }
    const hidden = [];
    // NUNCA reacender luzes escondidas (orçamento do nível): o nº de luzes faz parte da chave do programa → compilava tudo
    // com N+1 luzes e RECOMPILAVA os ~20 materiais iluminados no 1º quadro real (engasgo de ~0,5–0,8 s ao entrar na zona)
    scene.traverse((o) => { if (!o.visible && !o.isLight) { hidden.push(o); o.visible = true; } });
    try {
      if (renderer.compileAsync) { renderer.compileAsync(scene, fpsCam.camera).catch(() => {}); precompileInfo.async = true; }
      else renderer.compile(scene, fpsCam.camera);
    } catch (e) { console.warn('[fps-renderer] precompile', e); }
    for (const o of hidden) o.visible = false;
    for (const m of temp) { entityRoot.remove(m); botPool[m.userData.lookKey].push(m); }
    perf.warmPending = true; // o aquecimento começa no 1º quadro desenhado da zona nova
    precompileInfo.zone = zone.id;
    precompileInfo.ms = +(performance.now() - t0).toFixed(1);
    precompileInfo.prewarmed = temp.length;
    precompileInfo.programs = renderer.info.programs?.length || 0;
  }

  /** EVO: limita números de dano simultâneos (preset) — o mais antigo sai primeiro. */
  function capFloats() {
    if (!floatLayer) return;
    const cap = tier?.caps?.damageNumbers ?? getConfig().feel?.damageNumberCap ?? 12;
    while (floatLayer.childElementCount > cap) {
      const old = floatLayer.firstElementChild;
      if (!old || old.dataset.frozen) break;
      old.remove();
    }
  }

  let floatSeq = 0; const floatStats = {};
  function spawnFloatDamage(tx, ty, amount, kind, fx, fy) {
    capFloats();
    if (!floatLayer || !renderer) return;
    let left = '50%';
    let top = '42%';
    if (kind !== 'in' && Number.isFinite(fx) && canvas) {
      tmpV3.set(fx * TILE, 1.9 + groundAt(fx, fy), fy * TILE).project(fpsCam.camera);
      if (tmpV3.z < 1) {
        left = `${((tmpV3.x * 0.5 + 0.5) * canvas.clientWidth).toFixed(0)}px`;
        top = `${((-tmpV3.y * 0.5 + 0.5) * canvas.clientHeight).toFixed(0)}px`;
      }
    }
    const el = document.createElement('div');
    // Bloco 6: crítico (Mira Neural) = número grande dourado
    const crit = kind === 'crit';
    // M10 passo 3: leitura — contorno escuro, "pop" de entrada, golpe pesado maior/laranja, ESQUIVA (sem número) no rival,
    // leve deslocamento lateral p/ números seguidos não se sobreporem
    const heavy = kind === 'heavy'; const dodge = kind === 'dodge';
    el.textContent = crit ? `CRÍTICO! -${amount}` : dodge ? 'ESQUIVA' : `-${amount}`;
    el.className = crit ? 'nx-float-crit nx-dmg' : `nx-dmg nx-dmg-${kind}`;
    floatSeq = (floatSeq + 1) % 5; const jx = kind === 'in' ? 0 : (floatSeq - 2) * 14;
    const size = crit ? '900 30px' : heavy ? '900 24px' : dodge ? '800 15px' : kind === 'in' ? '800 19px' : '800 19px';
    const color = kind === 'in' ? '#ff6b5a' : crit ? '#ffd23f' : heavy ? '#ffb347' : dodge ? '#c9d6ff' : '#5ff0dc';
    const shadow = crit ? '0 0 12px #ffb300,0 0 4px #000' : '-1px -1px 0 #061016,1px -1px 0 #061016,-1px 1px 0 #061016,1px 1px 0 #061016,0 0 6px rgba(0,0,0,.8)';
    el.style.cssText = `position:absolute;left:${left};top:${top};transform:translate(calc(-50% + ${jx}px),-50%) scale(${heavy || crit ? 1.45 : 1.25});font:${size} system-ui;color:${color};text-shadow:${shadow};opacity:1;pointer-events:none;white-space:nowrap;letter-spacing:.02em;transition:transform ${crit ? 1.1 : 0.75}s cubic-bezier(.2,.9,.3,1),opacity ${crit ? '0.55s ease-in 0.5s' : '0.45s ease-in 0.3s'};`;
    floatLayer.appendChild(el);
    floatStats[kind] = (floatStats[kind] || 0) + 1;
    requestAnimationFrame(() => {
      el.style.transform = `translate(calc(-50% + ${jx}px),-130%) scale(1)`;
      el.style.opacity = '0';
    });
    setTimeout(() => { if (!el.dataset.frozen) el.remove(); }, crit ? 1150 : 750);
  }

  /** Bloco 4: texto curto flutuante no herói (ESQUIVOU / BLOQUEIO). */
  function spawnFloatText(text, color = '#8ffcff', opts = null) {
    if (!floatLayer || !renderer || !canvas) return;
    capFloats();
    let left = '50%';
    let top = '46%';
    tmpV3.set(fpsCam.state.visX, 2.1, fpsCam.state.visZ).project(fpsCam.camera);
    if (tmpV3.z < 1) {
      left = `${((tmpV3.x * 0.5 + 0.5) * canvas.clientWidth).toFixed(0)}px`;
      top = `${((-tmpV3.y * 0.5 + 0.5) * canvas.clientHeight).toFixed(0)}px`;
    }
    const el = document.createElement('div');
    el.className = 'nx-float-text';
    el.textContent = text;
    const size = opts?.size || 15;
    const ms = opts?.ms || 600;
    const dy = opts?.dy || 0;
    if (opts?.cls) el.classList.add(opts.cls);
    el.style.cssText = `position:absolute;left:${left};top:calc(${top} + ${dy}px);transform:translate(-50%,-50%) scale(0.9);font:800 ${size}px system-ui;letter-spacing:0.12em;color:${color};text-shadow:0 0 8px ${color},0 0 3px #000;opacity:1;pointer-events:none;transition:transform ${ms / 1000}s ease-out,opacity ${(ms * 0.55) / 1000}s ease-in ${(ms * 0.45) / 1000}s;white-space:nowrap;`;
    floatLayer.appendChild(el);
    requestAnimationFrame(() => {
      el.style.transform = 'translate(-50%,-150%) scale(1.05)';
      el.style.opacity = '0';
    });
    setTimeout(() => { if (!el.dataset.frozen) el.remove(); }, ms + 80);
  }

  /** ARENA: marcador de acerto na mira (branco = acerto · dourado = crítico · vermelho = abate). Um único nó reutilizado. */
  let hitMk = null; let hitMkT = 0; const hitMkStats = { hit: 0, crit: 0, kill: 0 };
  function hitMarker(kind = 'hit') {
    if (!wrap) return;
    if (!hitMk) {
      hitMk = document.createElement('div'); hitMk.id = 'br-hitmarker';
      hitMk.style.cssText = 'position:absolute;left:50%;top:50%;width:30px;height:30px;margin:-15px 0 0 -15px;pointer-events:none;z-index:8;opacity:0;';
      hitMk.innerHTML = '<svg width="30" height="30" viewBox="0 0 30 30"><path d="M5 5l6 6M25 5l-6 6M5 25l6-6M25 25l-6-6" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>';
      wrap.appendChild(hitMk);
    }
    hitMkStats[kind] = (hitMkStats[kind] || 0) + 1;
    const col = kind === 'kill' ? '#ff4a5a' : kind === 'crit' ? '#ffd24a' : '#ffffff';
    hitMk.style.color = col; hitMk.style.filter = `drop-shadow(0 0 3px ${col})`;
    hitMk.style.transition = 'none'; hitMk.style.opacity = '1';
    hitMk.style.transform = `scale(${kind === 'kill' ? 1.35 : kind === 'crit' ? 1.15 : 0.9})`;
    clearTimeout(hitMkT);
    hitMkT = setTimeout(() => { if (!hitMk) return; hitMk.style.transition = 'opacity .22s ease-out, transform .22s ease-out'; hitMk.style.opacity = '0'; hitMk.style.transform = 'scale(0.7)'; }, kind === 'kill' ? 160 : 70);
  }
  function hitFlash() {
    if (!flashEl) return;
    flashEl.style.transition = 'none';
    flashEl.style.opacity = '1';
    setTimeout(() => {
      if (!flashEl) return;
      flashEl.style.transition = 'opacity 0.35s ease-out';
      flashEl.style.opacity = '0';
    }, 110);
  }

  function renderFrame() {
    if (!running || !renderer) return;
    const now = performance.now();
    const frameMs = now - lastT;
    const dt = Math.min(0.05, frameMs / 1000);
    /** dt real (limitado a 0.25 s) para movimento/câmera — o player-motion aplica o próprio teto. */
    const simDt = Math.min(0.25, frameMs / 1000);
    lastT = now;
    adaptResolution(frameMs, now);

    resize();
    const state = getState();
    if (!state) {
      renderer.render(scene, fpsCam.camera);
      return;
    }

    const zone = state._data.zones.zones.find((z) => z.id === state.zoneId);
    if (!zone) return;

    if (builtZoneId !== zone.id || (zone.brMap && builtBrMap !== zone.brMap)) {
      buildZone(zone);
      fpsCam.reset();
      hooks.motion?.snapToTile(state);
      fpsCam.syncFromPlayer(state.player.x, state.player.y);
      // Prefer look toward open space (not into adjacent NPC/bot — avoids "third-person body" feel)
      orientAwayFromCrowding(state, zone);
      precompileZone(zone);
    }

    // gp2: simulação única (movimento → ataque → IA → hit-stop) em main.simulate
    const motion = hooks.motion;
    if (hooks.simulate) {
      hooks.simulate(state, simDt, fpsCam.getYaw());
    } else if (motion) {
      motionOpts.busy = !!hooks.getBusy?.() || !!hooks.isInputBlocked?.();
      motion.update(state, simDt, fpsCam.getYaw(), motionOpts);
    }
    const cview = hooks.getCombatView?.();
    if (cview) {
      viewmodel?.setAttack(cview);
      const kick = cview.phase === 'STARTUP' || cview.phase === 'ACTIVE' ? getConfig().combat.attackFovKickDeg : 0;
      fpsCam.setFovKick(kick);
    }

    fpsCam.update(simDt);
    if (motion) {
      const p = motion.getPos();
      fpsCam.setPosition(p.x, p.y);
    } else {
      fpsCam.syncFromPlayer(state.player.x, state.player.y);
    }
    fpsCam.updateCameraTransform(simDt);
    if (hero) updateHero(dt, motion, cview);
    heroVis.x = fpsCam.state.visX;
    heroVis.z = fpsCam.state.visZ;
    heroVis.yaw = hero ? heroSt.yaw : fpsCam.getYaw();

    viewmodel?.setAspect(fpsCam.camera.aspect);
    viewmodel?.setMoving(!!motion?.isMoving());
    viewmodel?.update(dt);

    brLod.hidden = 0; brLod.shown = 0;
    syncEntities(state, zone, now);
    updateBrWorld(state, now);
    { const gy = groundAt(heroVis.x / TILE, heroVis.z / TILE); if (actionVfx?.root) actionVfx.root.position.y = gy; if (passiveVfx?.root) passiveVfx.root.position.y = gy; }
    updateEnemyFx(zone, now);
    updateHeroFx(now);
    updateBossFraming(state, dt);
    updateSparks(dt * (hooks.getVfxTimeScale?.() ?? 1));
    if (actionVfx) {
      const luid = hooks.getLockOnUid?.();
      const le = luid != null ? entityMeshes.get(entKey('mon', luid)) : null;
      let lp = null;
      if (le) { lockPosV.x = le.mesh.position.x; lockPosV.z = le.mesh.position.z; lockPosV.s = le.boss ? getConfig().arenaBoss.bodyRadius * 1.15 : 1; lp = lockPosV; }
      actionVfx.update(dt * (hooks.getVfxTimeScale?.() ?? 1), heroVis, lp);
    }
    if (passiveVfx) {
      const pv = hooks.getPassiveView?.() ?? null;
      const muid = pv?.markUid;
      const me = muid != null ? entityMeshes.get(entKey('mon', muid)) : null;
      let mp = null;
      if (me) { markPosV.x = me.mesh.position.x; markPosV.z = me.mesh.position.z; mp = markPosV; }
      passiveVfx.setFirstPerson?.(!hero);
      // EVO: contexto das assinaturas (passivas obtidas, alvo travado p/ a retícula, HP/Nexa, direita da câmera)
      const luid2 = hooks.getLockOnUid?.() ?? hooks.getTargetUid?.();
      const le2 = luid2 != null ? entityMeshes.get(entKey('mon', luid2)) : null;
      sigExt.owned = hooks.getOwnedPassives?.() || sigExt.owned;
      sigExt.aimPos = le2 ? { x: le2.mesh.position.x, z: le2.mesh.position.z, s: le2.boss ? 2.4 : 1 } : null;
      const hs = hooks.getHeroStats?.();
      sigExt.hpFrac = hs ? hs.hp / Math.max(1, hs.hpMax) : 1;
      sigExt.nexaFrac = hs ? hs.nexa / Math.max(1, hs.nexaMax) : 0;
      { const e = fpsCam.camera.matrixWorld.elements; const l = Math.hypot(e[0], e[2]) || 1; sigExt.camRight.x = e[0] / l; sigExt.camRight.z = e[2] / l; }
      passiveVfx.update(dt * (hooks.getVfxTimeScale?.() ?? 1), heroVis, pv, mp, dragonView && dragonView.root.visible ? dragonView.root : null, fpsCam.camera.position, sigExt);
    }
    const dv = hooks.getDragonView?.();
    if (dv) {
      if (!dragonView) {
        const touch = !!hooks.isTouchUi?.() || (navigator.maxTouchPoints || 0) > 0;
        dragonView = createDragonView(scene, { pointLight: !touch && getConfig().dragon.pointLightDesktop });
      }
      // vfx do dragão acompanham o relógio de jogo (congela com passivas/modal/debug)
      dragonView.update(dv, dt * (hooks.getDragonVfxScale?.() ?? 1), fpsCam.camera);
    } else if (dragonView) dragonView.root.visible = false;
    updateThreat(state);

    atmoT += dt;
    if (rain) rain.update(atmoT, fpsCam.camera.position);
    haze?.update(dt);
    city?.update(dt);
    dressing?.update?.(dt, fpsCam.camera.position);
    renderer.info.reset();
    if (postFx) postFx.render(dt);
    else renderer.render(scene, fpsCam.camera);
    frameStats.calls = renderer.info.render.calls;
    frameStats.tris = renderer.info.render.triangles;
    frameStats.ms += (frameMs - frameStats.ms) * 0.1;
    maybeRenderPortrait();
  }

  /** M3D: RETRATO do HUD = render do modelo 3D atual (rosto, de frente), só quando estilo/equipamento muda. */
  const portrait = { sig: '', version: 0, canvas: null, rt: null, cam: null, wait: 0 };
  function maybeRenderPortrait() {
    const inf = hero?.glb?.info;
    const rig = hero?.glb?.getRig?.();
    if (!inf || inf.status !== 'ready' || !rig || !hero.root.visible) return;
    // PERF: o retrato usa EXATAMENTE a mesma variante de shader do quadro principal (alvo linear do pós-processo, com névoa)
    // → nenhum programa novo é compilado (antes: alvo sRGB + sem névoa recompilava a cena inteira = engasgo de ~1 s).
    // Sem pós-processo (preset baixo) a variante seria outra → fica o retrato 2D (sprite).
    if (/[?&]portrait=0\b/.test(location.search)) return;
    if (!postFx) {
      // sem pós-processo: foto pronta do contexto temporário (hero-preview) — zero compilação aqui
      const k = portraitKey(heroStyleId, heroExtra?.custom);
      const snap = getPortraitSnapshot(k);
      if (snap && portrait.snapKey !== k) { portrait.snapKey = k; portrait.canvas = snap; portrait.version++; portrait.sig = ''; }
      return;
    }
    if (portrait.snapKey) { portrait.snapKey = ''; portrait.canvas = null; }
    const sig = `${inf.style}|${heroStyleId}|${JSON.stringify(heroExtra)}`;
    if (sig === portrait.sig) return;
    if (++portrait.wait < 8) return; // alguns quadros depois do modelo pronto (pose do idle aplicada)
    portrait.wait = 0;
    portrait.sig = sig;
    const S = 96;
    if (!portrait.rt) {
      portrait.rt = new THREE.WebGLRenderTarget(S, S, { type: THREE.HalfFloatType }); // mesmo formato do alvo do pós-processo
      portrait.cam = new THREE.PerspectiveCamera(26, 1, 0.05, 30);
    }
    if (!portrait.canvas) {
      portrait.canvas = document.createElement('canvas');
      portrait.canvas.width = S; portrait.canvas.height = S;
    }
    const head = rig.model.getObjectByName('head') || rig.model;
    const hp = new THREE.Vector3(); head.getWorldPosition(hp);
    const yaw = hero.root.rotation.y;
    const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    portrait.cam.position.copy(hp).addScaledVector(fwd, 1.1).add(new THREE.Vector3(0, 0.22, 0));
    portrait.cam.lookAt(hp.x, hp.y + 0.16, hp.z);
    const prevT = renderer.getRenderTarget();
    renderer.setRenderTarget(portrait.rt);
    renderer.clear();
    renderer.render(scene, portrait.cam);
    const px = new Uint16Array(S * S * 4);
    renderer.readRenderTargetPixels(portrait.rt, 0, 0, S, S, px);
    renderer.setRenderTarget(prevT);
    const ctx = portrait.canvas.getContext('2d');
    const img = ctx.createImageData(S, S);
    // half-float linear → sRGB 8 bits (tone map simples p/ o brilho do bloom não estourar)
    const f16 = THREE.DataUtils.fromHalfFloat;
    const toS = (v) => { v = v / (1 + v * 0.35); v = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055; return Math.max(0, Math.min(255, Math.round(v * 255))); };
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const si = ((S - 1 - y) * S + x) * 4; const di = (y * S + x) * 4;
        img.data[di] = toS(f16(px[si])); img.data[di + 1] = toS(f16(px[si + 1])); img.data[di + 2] = toS(f16(px[si + 2])); img.data[di + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    portrait.version++;
  }

  /** Herói 3ª pessoa: gira rumo ao movimento; ao atacar, rumo à mira (yaw da câmera = cone do golpe). */
  function updateHero(dt, motion, cview) {
    const t = getConfig().thirdPerson;
    const mv = getConfig().movement;
    const attacking = !!cview && cview.phase && cview.phase !== 'IDLE';
    const speed = motion ? motion.getSpeed() : 0;
    const camYaw = fpsCam.getYaw();
    const aimYaw = hooks.getAimYaw?.() ?? camYaw;
    const act = hooks.getActionView?.() || null;
    if (!heroSt.init) { heroSt.yaw = camYaw; heroSt.init = true; }
    let target = heroSt.yaw;
    let turnMul = 1;
    if (act && act.kind === 'dodge') { target = heroSt.yaw; turnMul = 0; } // esquiva: mantém a frente (passo lateral/para trás)
    else if (act && act.kind === 'dash') { target = act.yaw; turnMul = 4; }
    else if (act) { target = act.yaw ?? aimYaw; turnMul = 3; }
    else if (attacking) { target = aimYaw; turnMul = 2.5; }
    else if (motion && speed > 0.08) {
      const v = motion.getVelocity();
      if (Math.hypot(v.x, v.y) > 0.05) target = Math.atan2(v.x, -v.y);
    }
    let d = target - heroSt.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    const maxStep = t.heroTurnSpeedDeg * DEG * turnMul * dt;
    heroSt.yaw += Math.abs(d) <= maxStep ? d : Math.sign(d) * maxStep;
    // M3D: reflexo do herói no chão molhado só no preset ALTO (médio/baixo: nada é criado)
    hero.glb?.setReflection?.(tierName === 'high' && getConfig().graphics.wetReflections !== false && !/[?&]heroRefl=0\b/.test(location.search));
    hero.update(dt, {
      x: fpsCam.state.visX,
      z: fpsCam.state.visZ,
      yaw: heroSt.yaw,
      speed,
      walkSpeed: mv.walkSpeed,
      runSpeed: mv.walkSpeed * mv.runMultiplier,
      attack: cview,
      action: act,
      groundY: groundAt(fpsCam.state.visX / TILE, fpsCam.state.visZ / TILE),
      leapHeight: getConfig().specials.suprema.leapHeight,
      nexa: (() => { const P = getState()?.player; return P && P.nexaMax ? P.nexa / P.nexaMax : 0.5; })()
    });
    const arm = fpsCam.getArm();
    const vis = arm.armLen > t.heroHideDistance;
    if (hero.root.visible !== vis) hero.setVisible(vis);
  }

  /** rAF agendado ANTES do frame: um erro nunca mata o loop (causa do bug hd1). */
  function loop() {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    try {
      renderFrame();
    } catch (e) {
      const msg = String(e?.message || e);
      if (msg !== lastFrameError) {
        lastFrameError = msg;
        console.error('[fps-renderer] frame error:', e);
      }
    }
  }

  function start(gs, opts = {}) {
    getState = gs;
    hooks = opts;
    ensureDom();
    resize();
    if (!controls) {
      controls = createFpsControls({
        fpsCam,
        isTouchUi: () => !!hooks.isTouchUi?.()
      });
    }
    controls.wire(canvas);
    running = true;
    lastT = performance.now();
    builtZoneId = null;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
    controls?.exitLock();
  }

  /** EVO: momento de entrada do GIGANTE VERDE (pose de rugido + asas abertas + núcleo explode em luz). */
  function playBossIntro() {
    for (const e of entityMeshes.values()) if (e.boss && e.view?.playIntro) { e.view.playIntro(); return true; }
    return false;
  }
  function bossIntroActive() {
    for (const e of entityMeshes.values()) if (e.boss && e.view?.introActive) return e.view.introActive();
    return false;
  }
  return {
    /** M10 fase 9: main liga a porta (na Arena: efeitos só depois da densidade esgotar) */
    setEffectGate(fn) { effectGate = typeof fn === 'function' ? fn : null; },
    setAiFarHook(fn) { aiFarHook = typeof fn === 'function' ? fn : null; },
    adaptiveState: () => ({ dropped: { ...dropped }, ladder: (getConfig().graphics.adaptiveLadder || []).slice(), brLodK, particleK, pr: perf.pr, emaFps: perf.emaMs ? +(1000 / perf.emaMs).toFixed(1) : 0, gated: perf.gated || 0, log: (perf.dropLog || []).slice() }),
    playBossIntro, bossIntroActive,
    mode: 'fps',
    cam: fpsCam,
    fpsCam,
    vfx,
    controls: () => controls,
    viewmodel: () => viewmodel,
    start,
    stop,
    /** Kick de frame fora do loop (ui.refresh) — nunca propaga erro para a UI. */
    refresh() {
      if (running) return; // o loop já desenha todo frame
      try { renderFrame(); } catch (e) { console.error('[fps-renderer] refresh error:', e); }
    },
    setPlayerAnim(anim, lock = 0.28) {
      if (anim === 'hurt') hero?.hurt();
      viewmodel?.play(anim === 'attack' ? 'attack' : anim === 'hurt' ? 'hurt' : anim === 'interact' ? 'interact' : 'idle', lock);
    },
    shake(n = 6) {
      fpsCam.shake(n);
    },
    resetVis() {
      fpsCam.reset();
      heroSt.init = false;
      builtZoneId = null;
    },
    /** Bloco V: 'third' | 'first'. */
    viewMode: VIEW_MODE,
    /** M3D: estilo do herói (cosmético) — troca o GLB sem perder o estado */
    hasPostFx: () => !!postFx,
    getHeroPortrait: () => (portrait.version ? { canvas: portrait.canvas, version: portrait.version } : null),
    setHeroStyle: (id, extra) => { heroStyleId = id || 'cavaleiro'; heroExtra = extra || {}; hero?.glb?.setStyle(heroStyleId, heroExtra); },
    getModelInfo: () => ({ hero: hero?.glb ? { ...hero.glb.info } : null, readyAt: { ...modelReadyAt }, enemies: getEnemyGlbStats(), dragons: getDragonGlbStats(), lib: getModelStats(),
      enemyAnims: [...entityMeshes.values()].filter((e) => e.kind === 'mon' && !e.boss && e.mesh.userData.glb).map((e) => ({ uid: e.uid, status: e.mesh.userData.glb.status, model: e.mesh.userData.glb.model, anim: e.mesh.userData.glb.anim, clip: e.mesh.userData.glb.clip, changes: e.mesh.userData.glb.changes })) }),
    getHero: () => (hero ? { ...hero.getDebug(), x: hero.root.position.x / TILE, y: hero.root.position.z / TILE } : null),
    getCamArm: () => ({ ...fpsCam.getArm(), cam: { x: fpsCam.camera.position.x, y: fpsCam.camera.position.y, z: fpsCam.camera.position.z }, inWall: fpsCam.cameraInWall() }),
    tileToScreen(tx, ty) {
      if (!renderer || !canvas) return { x: 0, y: 0 };
      const w = fpsCam.tileToWorld(tx, ty);
      const v = new THREE.Vector3(w.x, EYE_HEIGHT * 0.6, w.z);
      v.project(fpsCam.camera);
      const cssW = canvas.clientWidth;
      const cssH = canvas.clientHeight;
      return {
        x: (v.x * 0.5 + 0.5) * cssW,
        y: (-v.y * 0.5 + 0.5) * cssH
      };
    },
    /** Bloco 6 (tocar para travar): posição na tela (px CSS do canvas) do monstro na altura h (m). */
    projectMonster(uid, h = 1) {
      if (!renderer || !canvas) return null;
      const e = entityMeshes.get(entKey('mon', uid));
      if (!e || !e.mesh.visible) return null;
      tmpV3.set(e.mesh.position.x, h, e.mesh.position.z).project(fpsCam.camera);
      if (tmpV3.z >= 1 || tmpV3.z <= -1) return null;
      return { x: (tmpV3.x * 0.5 + 0.5) * canvas.clientWidth, y: (-tmpV3.y * 0.5 + 0.5) * canvas.clientHeight };
    },
    screenToTile(cssX, cssY) {
      if (!canvas) return { x: 0, y: 0 };
      const cssW = canvas.clientWidth || 1;
      const cssH = canvas.clientHeight || 1;
      const ndc = new THREE.Vector2(
        (cssX / cssW) * 2 - 1,
        -(cssY / cssH) * 2 + 1
      );
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, fpsCam.camera);
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const hit = new THREE.Vector3();
      if (!ray.ray.intersectPlane(plane, hit)) return { x: 0, y: 0 };
      return {
        x: Math.floor(hit.x / TILE),
        y: Math.floor(hit.z / TILE)
      };
    },
    spawnFloatDamage,
    spawnFloatText,
    hitFlash,
    hitMarker,
    getHitMarkerStats: () => ({ ...hitMkStats }),
    spawnSparks,
    /** Bloco 4: VFX de ação (esquiva/especiais/bloqueio) — pool em action-vfx.js. */
    actionVfx: (kind, d) => {
      if (!actionVfx) return;
      heroVis.x = fpsCam.state.visX;
      heroVis.z = fpsCam.state.visZ;
      actionVfx.trigger(kind, d || {}, heroVis);
    },
    getActionVfx: () => actionVfx?.counts() ?? null,
    getBrBeamsNear: (r = 3) => brWorld?.beamsNear(r) ?? null,
    /** Bloco 6: disparo pontual das passivas ('crit' | 'proc') e estado das auras (e2e). */
    passiveFx: (kind, d) => {
      if (!passiveVfx) return;
      heroVis.x = fpsCam.state.visX;
      heroVis.z = fpsCam.state.visZ;
      passiveVfx.burst(kind, d || {}, heroVis);
    },
    getPassiveVfx: () => passiveVfx?.counts() ?? null,
    /** EVO: evento de assinatura de passiva ('hit'|'dodge'|'special'|'break'|'hurt'|'absorb'|'shield_up'). */
    passiveSig: (kind, d) => { if (!passiveVfx) return; heroVis.x = fpsCam.state.visX; heroVis.z = fpsCam.state.visZ; passiveVfx.sigEvent?.(kind, d); },
    getPassiveSig: () => passiveVfx?.sigCounts?.() ?? null,
    /** Debug/screenshot: congela os textos flutuantes no estado atual (como pausar um vídeo). */
    freezeFloats: () => {
      if (!floatLayer) return 0;
      let n = 0;
      for (const el of floatLayer.children) {
        const cs = getComputedStyle(el);
        const op = cs.opacity;
        const tf = cs.transform;
        el.style.transition = 'none';
        el.style.opacity = op;
        el.style.transform = tf;
        el.dataset.frozen = '1';
        n++;
      }
      return n;
    },
    getLockMarker: () => actionVfx?.getLock() ?? null,
    /** e2e: uids com telegraph (anel/!) visível neste frame + estado do aviso de borda. */
    getTelegraphs: () => ({ uids: telegraphUids.slice(), threatVisible: !!threatEl && threatEl.style.display === 'block', boss: bossInfo.telegraph }),
    /** Bloco 7: chefe (telegraph visível, posição, altura do modelo, enquadramento da câmera). */
    getBossInfo: () => ({ ...bossInfo, lockMarker: !!actionVfx?.getLock?.()?.visible, lockScale: +(actionVfx?.root?.getObjectByName?.('lockMarker')?.scale?.x || 1).toFixed(2) }),
    getSparkCount: () => (sparks ? sparks.alive : 0),
    /** Pose da lâmina por fase: viewmodel em 1ª pessoa; em 3ª pessoa, a espada do herói (mesmas fases STARTUP/ACTIVE/RECOVERY). */
    getViewmodelAttack: () => {
      if (viewmodel) return viewmodel.getAttack?.() || null;
      const d = hero?.getDebug();
      return d && d.attackPhase && d.attackPhase !== 'IDLE' ? { phase: d.attackPhase, combo: d.combo, source: 'hero' } : null;
    },
    getFov: () => fpsCam.camera.fov,
    getBaseFov: () => fpsCam.getBaseFov(),
    getPitchLimitsDeg: () => fpsCam.getPitchLimits().map((r) => r * 180 / Math.PI),
    getDragonCounts: () => dragonView?.getCounts() || null,
    /** e2e: posição do dragão na tela (px CSS) e se está dentro do quadro. */
    dragonOnScreen: () => {
      if (!dragonView || !canvas || !dragonView.root.visible) return null;
      dragonView.root.getWorldPosition(tmpV3);
      tmpV3.project(fpsCam.camera);
      return { x: (tmpV3.x * 0.5 + 0.5) * canvas.clientWidth, y: (-tmpV3.y * 0.5 + 0.5) * canvas.clientHeight, inView: tmpV3.z < 1 && Math.abs(tmpV3.x) <= 1 && Math.abs(tmpV3.y) <= 1 };
    },
    setJoystick(x, y, active) {
      if (active) hooks.motion?.setStick(x, y);
      else hooks.motion?.clearStick();
    },
    applyTouchLook(dx, dy) {
      fpsCam.applyLook(dx, dy, 'touch');
    },
    /** Debug/perf (testes): cena + renderer Three.js. */
    debugThree: () => ({ scene, renderer, camera: fpsCam.camera }),
    getPerf: () => ({ pixelRatio: perf.pr, fps: +(1000 / perf.emaMs).toFixed(1) }),
    /** Bloco V: qualidade/pós/atmosfera (e2e). */
    getGraphics: () => ({
      tier: tierName,
      tierIfHardware: tierAuto,
      softwareGL,
      composer: postFx ? postFx.getDebug() : { active: false, pending: postFxPending, error: postFxError },
      shadows: !!renderer?.shadowMap.enabled,
      envMap: !!scene?.environment,
      toneMapping: renderer?.toneMapping === THREE.ACESFilmicToneMapping ? 'ACESFilmic' : String(renderer?.toneMapping),
      outputColorSpace: renderer?.outputColorSpace,
      rain: rain ? rain.count : 0,
      city: !!city,
      vignetteCss: !!vignetteEl,
      drawCalls: frameStats.calls,
      triangles: frameStats.tris,
      frameMs: +frameStats.ms.toFixed(1),
      pixelRatio: perf.pr,
      // EVO
      preset: tier?.label || tierName,
      caps: tier?.caps || null,
      antialias: !!renderer?.getContextAttributes?.()?.antialias,
      adaptiveDropped: (perf.dropLog || []).slice(),
      // M10 passo 3 (e2e): leitura visual
      gfx3: { teleMarks: teleMarkStats.shown, floats: { ...floatStats }, dragonK: +dragonFx.k.toFixed(2), embers: !!dragonFx.pts?.visible, embersN: dragonFx.n, vignette: !!dragonFx.on, heroRimK: hero?.glb?.info?.rimK ?? null, heroGlb: hero?.glb?.info?.status || null },
      pointLights: (() => { let n = 0; scene?.traverse((o) => { if (o.isPointLight && o.visible && o.intensity > 0) n++; }); return n; })(),
      programs: renderer?.info?.programs?.length || 0,
      particles: (sparks ? sparks.alive : 0) + (dragonView?.getCounts?.().trail || 0),
      enemyProjectiles: enemyFx ? enemyFx.proj.count : 0,
      enemyHazards: enemyFx ? enemyFx.haz.count : 0,
      precompile: { ...precompileInfo },
      rivals: { ...rivalStats, modelsOn: modelsEnabled(), live: [...entityMeshes.values()].filter((e) => e.rival).map((e) => ({ uid: e.uid, visible: e.mesh.visible, glb: e.glb.info.status, style: e.glb.info.style })) },
      botPool: Object.fromEntries(Object.entries(botPool).map(([k, v]) => [k, v.length])),
      scenery: dressing ? { ...dressing.stats } : null,
      br: brWorld ? { ...brWorld.stats, chunks: brWorld.chunkCount, visibleChunks: brWorld.visibleChunks, floorChunks: brWorld.floorChunks, visibleFloor: brWorld.visibleFloor, regionProps: brWorld.regionProps?.n || 0, propsByKind: brWorld.regionProps?.byKind, dragonSigns: brWorld.dragonSigns?.n || 0, fogRegion: brFogTint.id, fogColor: scene.fog ? '#' + scene.fog.color.getHexString() : null, treesFaded: brWorld.treesFaded, treeTiles: brWorld.treeTiles, mapW: brWorld.mapW, mapH: brWorld.mapH, lodHidden: brLod.hidden, lodShown: brLod.shown, pointLights: brLights.length, pickFlashes: brWorld.pickFlashes, teleOnTop } : null,
      archTeleSeen: { ...teleSeen },
      merge: { hero: hero?.mergeInfo || null, dragon: dragonView?.mergeInfo || null }
    }),
    lookDirFlat: () => fpsCam.lookDirFlat(),
    getYaw: () => fpsCam.getYaw(),
    getPitch: () => fpsCam.getPitch()
  };
}
