/**
 * NEXARA — efeitos sonoros sintetizados (WebAudio) · gp2.
 * Sem arquivos: ruído + osciladores curtos. AudioContext criado sob demanda
 * (primeiro gesto do usuário); buffer de ruído criado uma vez; nós de cada
 * som são descartáveis (padrão WebAudio) e só nascem quando o som toca.
 */
import { getConfig } from './gameplay-config.js?v=20261023conc5';

let ctx = null;
let master = null;
let noiseBuf = null;
let unlocked = false;
let bus = null, verb = null, verbSend = null;
const SFX_URL_OFF = typeof location !== 'undefined' && /[?&]sfx=0\b/.test(location.search); // ?sfx=0 = sem som (testes/diagnóstico)

function ensure() {
  if (ctx) return ctx;
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC();
    master = ctx.createGain();
    // META-69 (som melhor): barramento com COMPRESSOR suave (volume mais uniforme no celular, sem estourar) e envio de REVERB curto
    // (resposta ao impulso gerada aqui — sem arquivo) para os sons grandes (rugido, sopro, chefe)
    try {
      bus = ctx.createDynamicsCompressor(); bus.threshold.value = -16; bus.knee.value = 12; bus.ratio.value = 3.5; bus.attack.value = 0.004; bus.release.value = 0.18;
      master.connect(bus); bus.connect(ctx.destination);
      const n = Math.floor(ctx.sampleRate * 1.1); const ir = ctx.createBuffer(2, n, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.6) * 0.6; }
      verb = ctx.createConvolver(); verb.buffer = ir; verbSend = ctx.createGain(); verbSend.gain.value = 0.32; verbSend.connect(verb); verb.connect(master);
    } catch { bus = null; master.connect(ctx.destination); }
    const len = Math.floor(ctx.sampleRate * 0.25);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  } catch {
    ctx = null;
  }
  return ctx;
}

/** ARENA: contexto compartilhado com a música (mesmo desbloqueio de áudio no mobile). */
export function getAudioContext() { return ensure(); }

/** Chamar num gesto do usuário (pointerdown/keydown) — libera o áudio no mobile. */
export function unlockAudio() {
  if (unlocked) return;
  const c = ensure();
  if (!c) return;
  if (c.state === 'suspended') c.resume().catch(() => {});
  unlocked = true;
  loadSampleBank(); // EVO: sons reais CC0 carregados sob demanda (depois do 1º toque, em segundo plano)
}

/**
 * EVO — BANCO DE AMOSTRAS REAIS (CC0: Kenney.nl + OpenGameArt; ver assets/audio/CREDITS.md).
 * ~44 MP3 mono curtos (~210 KB no total), baixados de forma preguiçosa após o 1º toque.
 * Cada som do jogo procura uma amostra pelo nome (ou pelo prefixo: boss_attack_sopro → boss_attack);
 * se ainda não carregou / falhou, cai no som sintetizado antigo (nunca fica mudo).
 */
const bank = new Map(); // nome → AudioBuffer[]
const bankStats = { state: 'idle', files: 0, loaded: 0, failed: 0, bytes: 0, plays: 0 };
const BANK_URL = new URL('../../assets/audio/sfx/', import.meta.url);
async function loadSampleBank() {
  if (bankStats.state !== 'idle' || getConfig().combat.sfxSamples === false) return;
  bankStats.state = 'loading';
  try {
    const man = await (await fetch(new URL('manifest.json', BANK_URL))).json();
    const jobs = [];
    for (const [name, files] of Object.entries(man)) {
      for (const f of files) {
        bankStats.files++;
        jobs.push(fetch(new URL(f, BANK_URL)).then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
          .then((ab) => { bankStats.bytes += ab.byteLength; return new Promise((res, rej) => ctx.decodeAudioData(ab, res, rej)); })
          .then((buf) => { if (!bank.has(name)) bank.set(name, []); bank.get(name).push(buf); bankStats.loaded++; })
          .catch(() => { bankStats.failed++; }));
      }
    }
    await Promise.all(jobs);
    bankStats.state = 'ready';
  } catch { bankStats.state = 'failed'; }
}
function sampleFor(name) {
  if (!name || !bank.size) return null;
  let l = bank.get(name);
  if (!l && name.includes('_')) l = bank.get(name.slice(0, name.lastIndexOf('_')));
  if (!l && /^combo_/.test(name)) l = bank.get('swing');
  return l && l.length ? l[(Math.random() * l.length) | 0] : null;
}
/** Toca a amostra (com leve variação de tom) — true se tocou. */
/** M10 passo 2 — mixagem por categoria (aviso/loot comum mais baixos; marcos do rival/vitória por cima). */
const CAT_GAIN = [[/^tele_/, 0.75], [/^loot_comum/, 0.7], [/^loot_incomum/, 0.8], [/^loot_(epico|lendario)/, 1.0], [/^hit_(arco|cajado)/, 0.9], [/^(rival_|champion_|victory)/, 1.0]];
function catGain(name) { for (const [re, g] of CAT_GAIN) if (re.test(name)) return g; return 1; }
function playSample(c, name, gainMul = 1) {
  gainMul *= catGain(name);
  const buf = sampleFor(name);
  if (!buf) return false;
  const src = c.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = 0.94 + Math.random() * 0.12;
  const g = c.createGain();
  g.gain.value = 0.9 * gainMul;
  src.connect(g).connect(master);
  src.start();
  bankStats.plays++;
  return true;
}
export function getSampleBankStats() { return { ...bankStats, names: [...bank.keys()] }; }
/** Rosnado de inimigo ao preparar ataque (amostra real; sem síntese de fallback). */
export function sfxEnemyGrowl() {
  if (!bank.has('enemy_growl')) return;
  const c = ready('enemy_growl', 0.9);
  if (c) playSample(c, 'enemy_growl', 0.6);
}

/** EVO: vozes ativas (teto combat.sfxMaxVoices) + contagem por som (e2e / diagnóstico). */
let voices = 0;
const stats = { played: {}, dropped: 0, muted: 0, peakVoices: 0 };
let curName = '';
function ready(name = '', durS = 0.25) {
  const cfg = getConfig().combat;
  curName = name;
  if (SFX_URL_OFF || !cfg.sfxEnabled || cfg.sfxVolume <= 0) { stats.muted++; return null; }
  const c = ensure();
  if (!c || c.state !== 'running') return null;
  const cap = cfg.sfxMaxVoices || 10;
  if (voices >= cap) { stats.dropped++; return null; }
  voices++;
  stats.peakVoices = Math.max(stats.peakVoices, voices);
  setTimeout(() => { voices = Math.max(0, voices - 1); }, Math.max(60, durS * 1000));
  if (name) stats.played[name] = (stats.played[name] || 0) + 1;
  master.gain.value = cfg.sfxVolume;
  if (name !== 'enemy_growl' && playSample(c, name)) { stats.samples = (stats.samples || 0) + 1; return null; }
  return c;
}
/** e2e: sons tocados por nome, descartados pelo teto, pico de vozes, estado do contexto. */
export function getSfxStats() {
  return { ...stats, bus: !!bus, reverb: !!verb, urlOff: SFX_URL_OFF, dragon: { ...dragonStats }, played: { ...stats.played }, voices, state: ctx ? ctx.state : 'none', unlocked, bank: getSampleBankStats() };
}

function noiseBurst(c, t, dur, freq, q, gain, type = 'bandpass') {
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t);
  src.stop(t + dur + 0.02);
  return f;
}

function tone(c, t, dur, f0, f1, gain, type = 'sine') {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** Golpe acertou: estalo metálico + baque grave. heavy = golpe 3. */
export function sfxHit(heavy = false) {
  const c = ready(heavy ? 'hit_heavy' : 'hit');
  if (!c) return;
  const t = c.currentTime;
  noiseBurst(c, t, heavy ? 0.12 : 0.08, heavy ? 1800 : 2600, 1.2, heavy ? 0.9 : 0.7);
  tone(c, t, heavy ? 0.14 : 0.09, heavy ? 160 : 210, 55, heavy ? 0.8 : 0.55);
}

/** Lâmina cortando o ar (golpe no vazio ou antes do acerto). */
export function sfxSwing(comboIndex = 0) {
  const c = ready('swing');
  if (!c) return;
  const t = c.currentTime;
  const f = noiseBurst(c, t, 0.11, 900 + comboIndex * 250, 0.9, 0.22);
  f.frequency.exponentialRampToValueAtTime(3200 + comboIndex * 300, t + 0.1);
}

/** Herói tomou dano. */
export function sfxHurt() {
  const c = ready('hurt');
  if (!c) return;
  const t = c.currentTime;
  tone(c, t, 0.18, 220, 70, 0.55, 'sawtooth');
  noiseBurst(c, t, 0.1, 600, 0.7, 0.35, 'lowpass');
}

/** Aviso de ataque inimigo (início do telegraph). */
export function sfxWarn() {
  const c = ready('warn');
  if (!c) return;
  const t = c.currentTime;
  tone(c, t, 0.16, 520, 980, 0.18, 'square');
}

/** Golpe inimigo errou (whiff). */
export function sfxWhiff() {
  const c = ready('whiff');
  if (!c) return;
  const t = c.currentTime;
  noiseBurst(c, t, 0.14, 500, 0.8, 0.18);
}

// ——— gp3: Mini Dragão ———
/** Rajada: "whoosh" curto e agudo por bola. */
export function sfxDragonWhoosh() {
  const c = ready('dragon_shot');
  if (!c) return;
  const t = c.currentTime;
  const f = noiseBurst(c, t, 0.09, 1400, 1.4, 0.16);
  f.frequency.exponentialRampToValueAtTime(4200, t + 0.08);
  tone(c, t, 0.07, 900, 1500, 0.05, 'triangle');
}

/** Carga da Chama Concentrada: zumbido subindo. */
export function sfxDragonCharge(durMs = 800) {
  const c = ready('dragon_charge');
  if (!c) return;
  const t = c.currentTime;
  const d = Math.max(0.1, durMs / 1000);
  const o = c.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(90, t);
  o.frequency.exponentialRampToValueAtTime(420, t + d);
  const g = c.createGain();
  g.gain.setValueAtTime(0.001, t);
  g.gain.exponentialRampToValueAtTime(0.12, t + d * 0.9);
  g.gain.exponentialRampToValueAtTime(0.001, t + d + 0.05);
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 1200;
  o.connect(f).connect(g).connect(master);
  o.start(t);
  o.stop(t + d + 0.08);
}

/** Disparo da Chama Concentrada: explosão grave e longa (diferente da rajada). */
export function sfxDragonBlast() {
  const c = ready('dragon_flame');
  if (!c) return;
  const t = c.currentTime;
  tone(c, t, 0.35, 140, 38, 0.8, 'sine');
  noiseBurst(c, t, 0.3, 380, 0.6, 0.6, 'lowpass');
  noiseBurst(c, t + 0.02, 0.18, 1800, 0.8, 0.2);
}

/** Impacto da chama (pequeno / grande). */
export function sfxDragonImpact(big = false) {
  const c = ready('dragon_impact');
  if (!c) return;
  const t = c.currentTime;
  noiseBurst(c, t, big ? 0.22 : 0.07, big ? 700 : 2200, 0.9, big ? 0.55 : 0.18);
  if (big) tone(c, t, 0.25, 110, 40, 0.6);
}

// ——— gp4: esquiva / defesa / especiais ———
/** Esquiva: whoosh grave e curto. */
export function sfxDodge() {
  const c = ready('dodge');
  if (!c) return;
  const t = c.currentTime;
  const f = noiseBurst(c, t, 0.2, 380, 0.8, 0.32);
  f.frequency.exponentialRampToValueAtTime(1900, t + 0.18);
}

/** Bloqueio: clank metálico. */
export function sfxBlock() {
  const c = ready('block');
  if (!c) return;
  const t = c.currentTime;
  tone(c, t, 0.16, 1250, 900, 0.32, 'square');
  tone(c, t, 0.22, 2350, 1800, 0.14, 'triangle');
  noiseBurst(c, t, 0.06, 4200, 2.5, 0.45);
}

/** Ação negada (sem Nexa / recarga). */
export function sfxDenied() {
  const c = ready('denied');
  if (!c) return;
  const t = c.currentTime;
  tone(c, t, 0.12, 180, 140, 0.25, 'square');
}

/** Carga de especial (golpe poderoso / suprema). */
export function sfxCharge(durMs = 300) {
  const c = ready('charge');
  if (!c) return;
  const t = c.currentTime;
  const d = Math.max(0.08, durMs / 1000);
  const o = c.createOscillator();
  o.type = 'triangle';
  o.frequency.setValueAtTime(260, t);
  o.frequency.exponentialRampToValueAtTime(1100, t + d);
  const g = c.createGain();
  g.gain.setValueAtTime(0.001, t);
  g.gain.exponentialRampToValueAtTime(0.14, t + d * 0.85);
  g.gain.exponentialRampToValueAtTime(0.001, t + d + 0.04);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + d + 0.06);
}

/** Disparo de especial: kind 'strike' | 'spin' | 'dash' | 'suprema'. */
export function sfxSpecial(kind = 'strike') {
  const c = ready(`special_${kind}`, kind === 'suprema' ? 0.6 : 0.3);
  if (!c) return;
  const t = c.currentTime;
  if (kind === 'spin') {
    const f = noiseBurst(c, t, 0.3, 700, 1.1, 0.4);
    f.frequency.exponentialRampToValueAtTime(3000, t + 0.28);
  } else if (kind === 'dash') {
    const f = noiseBurst(c, t, 0.24, 500, 0.9, 0.45);
    f.frequency.exponentialRampToValueAtTime(3600, t + 0.2);
    tone(c, t, 0.12, 400, 900, 0.1, 'sawtooth');
  } else if (kind === 'suprema') {
    tone(c, t, 0.6, 120, 32, 0.9, 'sine');
    noiseBurst(c, t, 0.5, 300, 0.5, 0.7, 'lowpass');
    noiseBurst(c, t + 0.03, 0.3, 2600, 0.8, 0.3);
  } else {
    tone(c, t, 0.22, 200, 50, 0.8, 'sine');
    noiseBurst(c, t, 0.14, 1600, 1.0, 0.7);
  }
}

// ——— EVO: sons distintos por golpe / evento (todos sintetizados, sem arquivos) ———
/** Acerto do combo 1/2/3: tom sobe a cada golpe; o 3º é mais pesado (grave + estalo largo). */
export function sfxComboHit(idx = 0, crit = false, weaponClass = 'espada') {
  // M10 passo 2: arco/cajado têm acerto próprio (amostra real); espada mantém o combo 1/2/3
  if (weaponClass && weaponClass !== 'espada' && bank.has(`hit_${weaponClass}`)) { ready(`hit_${weaponClass}`, 0.25); if (crit) sfxCrit(); return; }
  const c = ready(`combo_${Math.min(2, idx) + 1}`, 0.18);
  if (!c) return;
  const t = c.currentTime;
  const k = Math.min(2, Math.max(0, idx));
  noiseBurst(c, t, 0.07 + k * 0.03, 2400 + k * 500, 1.3, 0.55 + k * 0.15);
  tone(c, t, 0.08 + k * 0.04, 240 + k * 70, 60, 0.5 + k * 0.12, k === 2 ? 'square' : 'sine');
  if (k === 2) tone(c, t + 0.01, 0.16, 120, 40, 0.6, 'sine');
  if (crit) sfxCrit();
}
/** Crítico: brilho agudo metálico curto. */
export function sfxCrit() {
  const c = ready('crit', 0.14);
  if (!c) return;
  const t = c.currentTime;
  tone(c, t, 0.12, 2400, 3600, 0.16, 'triangle');
  tone(c, t + 0.03, 0.1, 3200, 4800, 0.1, 'sine');
}
/** Esquiva PERFEITA: "ting" cristalino + sopro reverso. */
export function sfxPerfectDodge() {
  const c = ready('perfect_dodge', 0.4);
  if (!c) return;
  const t = c.currentTime;
  tone(c, t, 0.32, 1320, 1980, 0.2, 'sine');
  tone(c, t + 0.05, 0.28, 1760, 2640, 0.12, 'triangle');
  const f = noiseBurst(c, t, 0.25, 3000, 1.5, 0.12);
  f.frequency.exponentialRampToValueAtTime(800, t + 0.24);
}
/** QUEBRA DE POSTURA: estilhaço + queda grave. */
export function sfxBreak() {
  const c = ready('posture_break', 0.45);
  if (!c) return;
  const t = c.currentTime;
  noiseBurst(c, t, 0.35, 3800, 0.7, 0.6, 'highpass');
  tone(c, t, 0.4, 330, 55, 0.55, 'sawtooth');
  tone(c, t + 0.06, 0.2, 990, 440, 0.15, 'square');
}
/** Inimigo destruído: estalo elétrico + descarga (elite/chefe = mais longo). */
export function sfxEnemyDeath(big = false) {
  const c = ready(big ? 'enemy_death_big' : 'enemy_death', big ? 0.6 : 0.3);
  if (!c) return;
  const t = c.currentTime;
  const f = noiseBurst(c, t, big ? 0.5 : 0.22, 1800, 0.9, big ? 0.55 : 0.35);
  f.frequency.exponentialRampToValueAtTime(200, t + (big ? 0.45 : 0.2));
  tone(c, t, big ? 0.5 : 0.2, big ? 180 : 420, 50, 0.35, 'sawtooth');
}
/** Subiu de nível: arpejo ascendente (dó–mi–sol–dó). */
export function sfxLevelUp() {
  const c = ready('level_up', 0.8);
  if (!c) return;
  const t = c.currentTime;
  [523, 659, 784, 1047].forEach((f, i) => tone(c, t + i * 0.09, 0.28, f, f * 1.01, 0.18, 'triangle'));
}
/** Loot / recompensa: duas notas brilhantes (raro = 3). */
export function sfxLoot(rare = false) {
  const c = ready(rare ? 'loot_rare' : 'loot', 0.4);
  if (!c) return;
  const t = c.currentTime;
  tone(c, t, 0.16, 1175, 1180, 0.14, 'sine');
  tone(c, t + 0.08, 0.2, 1568, 1575, 0.14, 'sine');
  if (rare) tone(c, t + 0.16, 0.26, 2093, 2100, 0.12, 'triangle');
}
/** M10 passo 2 — loot por raridade (comum → lendário: moeda → moedas → vidro → acorde → sino + brilho). */
const RAR = ['comum', 'incomum', 'raro', 'epico', 'lendario'];
export function sfxLootRarity(r = 'comum') {
  const k = RAR.includes(r) ? r : 'comum';
  if (bank.has(`loot_${k}`)) { ready(`loot_${k}`, k === 'lendario' ? 0.7 : 0.4); return; }
  sfxLoot(RAR.indexOf(k) >= 2);
}
/** M10 passo 2 — aviso de golpe inimigo por tipo (corpo a corpo / à distância / área / rival BOT); sem amostra → bipe antigo. */
let lastTeleAt = 0;
export function sfxTelegraph(kind = 'melee') {
  const now = performance.now(); if (now - lastTeleAt < 220) return; lastTeleAt = now;
  const name = `tele_${kind}`;
  if (bank.has(name)) { ready(name, 0.4); return; }
  sfxWarn();
}
/** M10 passo 2 — marcos dos rivais/campeão/vitória (amostra real; fallback sintetizado curto). */
export function sfxCue(name) {
  if (bank.has(name)) { ready(name, name === 'champion_intro' ? 1.1 : 0.7); return; }
  const c = ready(name, 0.5); if (!c) return; const t = c.currentTime;
  if (name === 'victory') [523, 659, 784, 1047, 1319].forEach((f, i) => tone(c, t + i * 0.1, 0.3, f, f, 0.16, 'triangle'));
  else if (name === 'champion_intro') { tone(c, t, 0.9, 110, 55, 0.6, 'sawtooth'); tone(c, t + 0.1, 0.6, 880, 440, 0.12, 'triangle'); }
  else tone(c, t, 0.3, 660, name === 'rival_down' ? 330 : 990, 0.16, 'square');
}
/** Elite apareceu: sirene curta dupla. */
export function sfxEliteSpawn() {
  const c = ready('elite_spawn', 0.6);
  if (!c) return;
  const t = c.currentTime;
  tone(c, t, 0.22, 440, 660, 0.18, 'square');
  tone(c, t + 0.25, 0.22, 440, 660, 0.18, 'square');
}
/** Rugido do GIGANTE VERDE (entrada / troca de fase): grave longo com aspereza. */
export function sfxBossRoar() {
  const c = ready('boss_roar', 1.3);
  if (!c) return;
  const t = c.currentTime;
  tone(c, t, 1.2, 95, 48, 0.75, 'sawtooth');
  tone(c, t, 1.1, 142, 70, 0.35, 'square');
  const f = noiseBurst(c, t, 1.0, 420, 0.6, 0.5, 'lowpass');
  f.frequency.exponentialRampToValueAtTime(160, t + 0.9);
}
/** Aviso de ataque do chefe (telegraph): pulso grave pulsante, diferente do aviso comum. */
export function sfxBossWarn(kind = '') {
  const c = ready(`boss_warn${kind ? '_' + kind : ''}`, 0.5);
  if (!c) return;
  const t = c.currentTime;
  tone(c, t, 0.18, 180, 260, 0.3, 'square');
  tone(c, t + 0.2, 0.18, 180, 300, 0.3, 'square');
}
/** Impacto de ataque do chefe (garra/cauda/investida/anéis/poças/sopro). */
export function sfxBossAttack(kind = '') {
  const c = ready(`boss_attack${kind ? '_' + kind : ''}`, 0.5);
  if (!c) return;
  const t = c.currentTime;
  if (kind === 'sopro') { const f = noiseBurst(c, t, 0.6, 900, 0.5, 0.45); f.frequency.exponentialRampToValueAtTime(400, t + 0.55); return; }
  if (kind === 'aneis' || kind === 'pocas') { tone(c, t, 0.45, 260, 90, 0.4, 'triangle'); noiseBurst(c, t, 0.3, 600, 0.7, 0.3, 'lowpass'); return; }
  tone(c, t, 0.35, 110, 36, 0.8, 'sine');
  noiseBurst(c, t, 0.25, 500, 0.6, 0.55, 'lowpass');
}

// ——— META-69: SONS DO DRAGÃO (síntese WebAudio, sem arquivo; respeitam ?sfx=0, liga/desliga e volume dos EFEITOS) ———
const dragonStats = { roar: 0, flap: 0, breath: 0, lastRoar: null };
function noiseLoop(c, t, dur) { const src = c.createBufferSource(); src.buffer = noiseBuf; src.loop = true; src.start(t); src.stop(t + dur + 0.05); return src; }
function toVerb(node, k = 1) { if (verbSend) { const g = ctx.createGain(); g.gain.value = k; node.connect(g).connect(verbSend); } }
/** RUGIDO: grave rasgado (serra + modulação de amplitude ~28 Hz = aspereza da garganta), formante de ruído descendo e sub-grave.
 *  size: 'gigante' (mais longo/grave) | 'montaria' | 'mini' (agudo e curto). */
export function sfxDragonRoar(size = 'montaria') {
  const big = size === 'gigante', mini = size === 'mini';
  const dur = big ? 1.6 : mini ? 0.55 : 1.15;
  const c = ready('dragon_roar' + (big ? '' : '_' + size), dur);
  if (!c) return; dragonStats.roar++; dragonStats.lastRoar = size;
  const t = c.currentTime; const f0 = big ? 105 : mini ? 330 : 150;
  const out = c.createGain(); out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(mini ? 0.45 : 0.85, t + 0.09); out.gain.setValueAtTime(mini ? 0.4 : 0.8, t + dur * 0.55); out.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  out.connect(master); toVerb(out, big ? 1 : 0.7);
  const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f0 * 1.25, t); o.frequency.exponentialRampToValueAtTime(f0, t + 0.18); o.frequency.exponentialRampToValueAtTime(f0 * 0.55, t + dur);
  const o2 = c.createOscillator(); o2.type = 'square'; o2.frequency.setValueAtTime(f0 * 1.51, t); o2.frequency.exponentialRampToValueAtTime(f0 * 0.8, t + dur);
  const am = c.createGain(); am.gain.value = 0.55; const lfo = c.createOscillator(); lfo.frequency.value = big ? 24 : 31; const lg = c.createGain(); lg.gain.value = 0.45; lfo.connect(lg).connect(am.gain);
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(mini ? 2600 : 1500, t); lp.frequency.exponentialRampToValueAtTime(mini ? 900 : 380, t + dur); lp.Q.value = 2.2;
  const g2 = c.createGain(); g2.gain.value = 0.35; o.connect(am); o2.connect(g2).connect(am); am.connect(lp).connect(out);
  const n = noiseLoop(c, t, dur); const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.6; bp.frequency.setValueAtTime(mini ? 2400 : 1100, t); bp.frequency.exponentialRampToValueAtTime(mini ? 900 : 260, t + dur); const ng = c.createGain(); ng.gain.value = mini ? 0.35 : 0.6; n.connect(bp).connect(ng).connect(out);
  if (!mini) { const sub = c.createOscillator(); sub.type = 'sine'; sub.frequency.setValueAtTime(f0 * 0.5, t); sub.frequency.exponentialRampToValueAtTime(f0 * 0.3, t + dur); const sg = c.createGain(); sg.gain.value = 0.5; sub.connect(sg).connect(out); sub.start(t); sub.stop(t + dur + 0.05); }
  for (const x of [o, o2, lfo]) { x.start(t); x.stop(t + dur + 0.05); }
}
/** BATER DE ASAS: baque abafado (ruído grave com ataque rápido) + "fwoosh" de ar; k = força (decolagem > cruzeiro). */
export function sfxDragonFlap(k = 1) {
  const c = ready('dragon_flap', 0.3);
  if (!c) return; dragonStats.flap++;
  const t = c.currentTime; const out = c.createGain(); out.connect(master);
  out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(0.5 * k, t + 0.035); out.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
  const n = noiseLoop(c, t, 0.28); const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(420, t); lp.frequency.exponentialRampToValueAtTime(110, t + 0.24); lp.Q.value = 0.9; n.connect(lp).connect(out);
  const n2 = noiseLoop(c, t, 0.22); const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(650, t); bp.frequency.exponentialRampToValueAtTime(1500, t + 0.18); bp.Q.value = 0.7; const g2 = c.createGain(); g2.gain.value = 0.22; n2.connect(bp).connect(g2).connect(out);
}
/** SOPRO / FOGO: rugido de chama (ruído com estalos — ganho modulado por ruído lento), grave de combustão e chiado agudo. ~0,6 s */
export function sfxDragonBreath(el = 'fogo') {
  const dur = 0.62; const c = ready('dragon_breath', dur);
  if (!c) return; dragonStats.breath++;
  const t = c.currentTime; const out = c.createGain(); out.connect(master); toVerb(out, 0.5);
  out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(0.75, t + 0.05); out.gain.setValueAtTime(0.7, t + dur * 0.6); out.gain.exponentialRampToValueAtTime(0.001, t + dur);
  const ice = el === 'gelo', zap = el === 'raio';
  const n = noiseLoop(c, t, dur); const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.8; bp.frequency.setValueAtTime(ice ? 2600 : zap ? 3200 : 900, t); bp.frequency.exponentialRampToValueAtTime(ice ? 1600 : zap ? 1800 : 1400, t + dur);
  const crk = c.createGain(); crk.gain.value = 0.6; const cn = noiseLoop(c, t, dur); const clp = c.createBiquadFilter(); clp.type = 'lowpass'; clp.frequency.value = ice ? 6 : 18; const cg = c.createGain(); cg.gain.value = 2.2; cn.connect(clp).connect(cg).connect(crk.gain);
  n.connect(bp).connect(crk).connect(out);
  const r = c.createOscillator(); r.type = zap ? 'square' : 'sawtooth'; r.frequency.setValueAtTime(zap ? 120 : 72, t); r.frequency.exponentialRampToValueAtTime(zap ? 60 : 48, t + dur); const rl = c.createBiquadFilter(); rl.type = 'lowpass'; rl.frequency.value = 260; const rg = c.createGain(); rg.gain.value = 0.45; r.connect(rl).connect(rg).connect(out); r.start(t); r.stop(t + dur + 0.05);
  const h = noiseLoop(c, t, dur * 0.7); const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 4500; const hg = c.createGain(); hg.gain.value = 0.12; h.connect(hp).connect(hg).connect(out);
}
