/**
 * NEXARA sprite asset loader — original art under assets/sprites/.
 * Preloads PNGs; getSprite(id) returns HTMLImageElement or null.
 * Procedural fallbacks live in sprites.js when image missing.
 */
const SPRITE_BASE = new URL('../assets/sprites/', import.meta.url);

/** @type {Record<string, string>} id → filename */
export const SPRITE_MANIFEST = {
  'tile-g6': 'tile-g6.png',
  'tile-e4': 'tile-e4.png',
  'wall-g6': 'wall-g6.png',
  'prop-crate': 'prop-crate.png',
  'prop-barrel': 'prop-barrel.png',
  'prop-scrap': 'prop-scrap.png',
  'prop-lamp': 'prop-lamp.png',
  'player-humano': 'player-humano.png',
  'player-orc': 'player-orc.png',
  'player-mago': 'player-mago.png',
  'player-hibrido': 'player-hibrido.png',
  'bot-combate': 'bot-combate.png',
  'bot-patrulha': 'bot-patrulha.png',
  'npc-tech': 'npc-tech.png',
  'npc-elder': 'npc-elder.png'
};

/** @type {Map<string, HTMLImageElement>} */
const cache = new Map();
let readyResolve;
let readySettled = false;

export const assetsReady = new Promise((resolve) => {
  readyResolve = resolve;
});

function loadOne(id, file) {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    const done = (ok) => {
      if (ok) cache.set(id, img);
      resolve(ok);
    };
    img.onload = () => done(true);
    img.onerror = () => done(false);
    img.src = new URL(file, SPRITE_BASE).href;
  });
}

/**
 * Start preload (idempotent). Resolves assetsReady when done or on timeout.
 * @param {{ timeoutMs?: number }} [opts]
 */
export function preloadAssets(opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 8000;
  if (readySettled) return assetsReady;

  // EVO: no modo 3D só o retrato do herói (HUD) usa sprite — não baixa os ~2,4 MB do iso (?iso=1)
  const entries = Object.entries(SPRITE_MANIFEST).filter(([id]) => !opts.only || opts.only(id));
  const work = Promise.all(entries.map(([id, file]) => loadOne(id, file))).then((results) => {
    const ok = results.filter(Boolean).length;
    return { ok, total: entries.length };
  });

  const timed = Promise.race([
    work,
    new Promise((resolve) => setTimeout(() => resolve({ ok: cache.size, total: entries.length, timedOut: true }), timeoutMs))
  ]);

  timed.then((info) => {
    if (!readySettled) {
      readySettled = true;
      readyResolve(info);
    }
  });

  return assetsReady;
}

/** @param {string} id */
export function getSprite(id) {
  return cache.get(id) || null;
}

export function hasSprite(id) {
  return cache.has(id);
}

export function spriteCount() {
  return cache.size;
}
