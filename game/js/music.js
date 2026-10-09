/**
 * NEXARA — ARENA PRINCIPAL · MÚSICA DE FUNDO (faixas reais CC0, OpenGameArt — ver assets/audio/CREDITS.md).
 *  explore: “Another space background track” (yd) — calma, exploração
 *  combat : “Battle Theme A” (cynicmusic.com)     — sobe em crossfade conforme a ameaça
 *  dragon : “Ancient Power Of Serpents” (josepharaoh99) — tema do Território do Dragão
 * Streaming via <audio> (memória baixa no celular: nada de decodificar 2 min de PCM) ligado ao MESMO
 * AudioContext dos efeitos (sfx.js) → volume funciona também no iOS. Sem contexto, cai em element.volume.
 * Faixa com peso ~0 por >3 s é pausada (bateria/CPU). Aba escondida → pausa tudo.
 */
import { getConfig } from './gameplay-config.js?v=20261009perf';
import { getAudioContext } from './sfx.js?v=20261009perf';

const BASE = new URL('../../assets/audio/music/', import.meta.url);
const TRACKS = {
  explore: { file: 'br-explore.mp3', gain: 0.85 },
  combat: { file: 'br-combat.mp3', gain: 0.8 },
  dragon: { file: 'br-dragon.mp3', gain: 0.9 }
};

export function createMusic() {
  const tr = {}; // id → { el, src, g, w, target, idleMs, err }
  let scene = 'off';
  let master = null;
  let ctx = null;
  let combatHoldMs = 0;
  let threatS = 0;
  const st = { starts: 0, errors: 0, crossfades: 0, last: '' };

  function cfg() { const c = getConfig().combat; return { on: c.musicEnabled !== false, vol: Math.max(0, Math.min(1, c.musicVolume ?? 0.45)) }; }
  function wire(id) {
    if (tr[id]) return tr[id];
    const el = new Audio();
    el.loop = true; el.preload = id === 'explore' ? 'auto' : 'metadata';
    el.src = new URL(TRACKS[id].file, BASE).href;
    const t = tr[id] = { el, src: null, g: null, w: 0, target: 0, idleMs: 0, err: false };
    el.addEventListener('error', () => { t.err = true; st.errors++; });
    try {
      ctx = ctx || getAudioContext();
      if (ctx) {
        if (!master) { master = ctx.createGain(); master.connect(ctx.destination); }
        t.src = ctx.createMediaElementSource(el);
        t.g = ctx.createGain(); t.g.gain.value = 0;
        t.src.connect(t.g).connect(master);
      }
    } catch { t.src = null; t.g = null; }
    return t;
  }
  function setScene(s) {
    if (s === scene) return;
    scene = s;
    if (s === 'br') { wire('explore'); wire('combat'); }
    if (s === 'off') for (const t of Object.values(tr)) t.target = 0;
  }
  /** chamado no loop (dt ms). info = { threat: nº de monstros engajados, dragon: no território, near: perto do território } */
  function update(dt, info = {}) {
    const c = cfg();
    const hidden = typeof document !== 'undefined' && document.hidden;
    if (scene === 'br' && info.near) wire('dragon');
    // alvo dos pesos
    let we = 0, wc = 0, wd = 0;
    if (scene === 'br' && c.on && !hidden && !info.ended) {
      if (info.threat > 0) combatHoldMs = 4500; else combatHoldMs = Math.max(0, combatHoldMs - dt);
      const want = info.threat > 0 ? Math.min(1, 0.55 + info.threat * 0.15) : combatHoldMs > 0 ? 0.55 : 0;
      threatS += (want - threatS) * Math.min(1, dt / 900);
      if (info.dragon) { wd = 1; } else { wc = threatS; we = 1 - threatS * 0.85; }
    } else if (scene === 'br' && info.ended && c.on && !hidden) { we = 0.35; }
    const tg = { explore: we, combat: wc, dragon: wd };
    for (const [id, t] of Object.entries(tr)) {
      const was = t.target;
      t.target = tg[id] || 0;
      if ((was > 0.5) !== (t.target > 0.5)) st.crossfades++;
      const k = Math.min(1, dt / (t.target > t.w ? 1400 : 1800));
      t.w += (t.target - t.w) * k;
      if (t.w < 0.004 && t.target === 0) t.w = 0;
      const out = t.w * TRACKS[id].gain;
      if (t.g) { t.g.gain.value = out; if (master) master.gain.value = c.vol; }
      else t.el.volume = Math.max(0, Math.min(1, out * c.vol));
      if (t.target > 0 && t.el.paused && !t.err) {
        const p = t.el.play(); st.starts++; st.last = id;
        if (p && p.catch) p.catch(() => {});
        if (ctx && ctx.state === 'suspended') ctx.resume?.().catch?.(() => {});
      }
      if (t.w === 0 && t.target === 0) { t.idleMs += dt; if (t.idleMs > 3000 && !t.el.paused) t.el.pause(); } else t.idleMs = 0;
    }
  }
  function onEvent(kind) { if (kind === 'boss_down') combatHoldMs = 0; }
  function stats() {
    const o = { scene, enabled: cfg().on, volume: cfg().vol, threat: +threatS.toFixed(2), ctx: !!master, ...st, tracks: {} };
    for (const [id, t] of Object.entries(tr)) o.tracks[id] = { w: +t.w.toFixed(3), target: t.target, playing: !t.el.paused, err: t.err, ready: t.el.readyState, time: +t.el.currentTime.toFixed(1) };
    return o;
  }
  return { setScene, update, onEvent, stats, scene: () => scene };
}
