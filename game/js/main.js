import { loadAllData } from './data-loader.js?v=20261003m10c';
import { heroStyleOf, equipmentVisual } from './hero-styles.js?v=20261003m10c';
import { mountHeroStyleEditor } from './hero-style-ui.js?v=20261003m10c';
import { addToInventory } from '../../rules/loot.js?v=20261003m10c';
import { createNewGame, applySave, pushLog, getEquippedStats, xpForLevel } from './state.js?v=20261003m10c';
import { rollLoot } from '../../rules/loot.js?v=20261003m10c';
import { isWalkable } from './map.js?v=20261003m10c';
import { hasSave, loadFromLocal, saveToLocal } from './save.js?v=20261003m10c';
import { createUI, bindRenderer } from './ui.js?v=20261003m10c';
import {
  tryMove, applyPlayerHit, applyDamageToMonster, monsterAttackPlayer, interactAdjacent, talkNpc, maybeRespawn,
  setPlayerDefenseHook, setPlayerAbsorbHook, setPlayerDeathHook, setBossKillHook, equipItem, setMonsterKillHook
} from './actions.js?v=20261003m10c';
import { bindArsenalConfig, creditKill, mcbStats, ensureWallet, rewardFor, priceOf, basePriceOf, isTestPricing, applyTestGrant, testGrantConfig } from './mcb.js?v=20261003m10c';
import { createMcbUi } from './mcb-ui.js?v=20261003m10c';
import { createVestiario } from './vestiario.js?v=20261003m10c';
import { refreshEquipment, getEquipTotals, weaponClassOf, weaponFamilyOf } from './equipment.js?v=20261003m10c';
import { createWeaponProjectiles } from './weapon-projectiles.js?v=20261003m10c';
import { getLocalProfile, authProviders } from './auth.js?v=20261003m10c';
import { lastWalletCheck } from './save.js?v=20261003m10c';
import { maybeTrigger0217 } from './events.js?v=20261003m10c';
import { createRenderer } from './renderer.js?v=20261003m10c';
import { createFpsRenderer } from './fps/fps-renderer.js?v=20261003m10c';
import { spawnDamage, spawnArc, spawnImpact, spawnLootGlow } from './vfx.js?v=20261003m10c';
import { itemRarity } from './sprites.js?v=20261003m10c';
import { createArenaState, isArenaState } from './arena.js?v=20261003m10c';
import { createMobileControls } from './mobile-controls.js?v=20261003m10c';
import { preloadAssets, assetsReady, spriteCount } from './assets.js?v=20261003m10c';
import {
  forceAiTick, tickEnemyAi, getTokenStats, setAiEnabled, grantAiGrace, clearAiGrace, getBodies, getMonsterPos,
  onMonsterHit, aiDebug, placeMonster, getAiEvents, clearAiEvents, debugResetMonster, getAiClock,
  graceRemainingMs, resetAttackTokens, getAttackTokenHolders, getThreatsToPlayer, isTargetingPlayer,
  isAttackingPlayer, monBodyRadius, getBossView, debugBossAttack,
  addPosture, isPostureBroken, getPosture, setPostureEnabled, alertMonster, resetMonsterRuntime, clearEnemyHazards, debugBossPhase
} from './enemy-ai.js?v=20261003m10c';
import { getPlayerSlow, getHazardStats } from './enemy-behaviors.js?v=20261003m10c';
import { createArenaRun } from './arena-run.js?v=20261003m10c';
import { createCampo, createCampoState, CAMPO_ZONE_ID } from './campo-ascensao.js?v=20261003m10c';
// ARENA PRINCIPAL (BR PvE): corrida, HUD/minimapa/bolsa/mercado, itens com raridade
import { createBrState, createArenaBr, brEnabled } from './arena-br.js?v=20261003m10c';
import { createArenaBrUi } from './arena-br-ui.js?v=20261003m10c';
import { createMusic } from './music.js?v=20261003m10c';
import { hydrateBrItems, addLootToBag, sellFromBag, bagCount, bagCap, bagEntries, brItemStats } from './br-items.js?v=20261003m10c';
import { getAiLodStats } from './enemy-ai.js?v=20261003m10c';
import { createBossHud } from './boss-hud.js?v=20261003m10c';
import { getStat, addModifier, clearModifiers, listModifiers, STATS } from './modifiers.js?v=20261003m10c';
import { createPlayerMotion } from './player-motion.js?v=20261003m10c';
import { createPlayerCombat } from './player-combat.js?v=20261003m10c';
import { createPlayerActions, SPECIAL_IDS } from './player-actions.js?v=20261003m10c';
import {
  unlockAudio, sfxEnemyGrowl, sfxHit, sfxSwing, sfxHurt, sfxWarn, sfxWhiff, sfxDragonWhoosh, sfxDragonCharge, sfxDragonBlast, sfxDragonImpact,
  sfxDodge, sfxBlock, sfxDenied, sfxCharge, sfxSpecial,
  sfxComboHit, sfxCrit, sfxPerfectDodge, sfxBreak, sfxEnemyDeath, sfxLevelUp, sfxLoot, sfxEliteSpawn,
  sfxBossRoar, sfxBossWarn, sfxBossAttack, getSfxStats
} from './sfx.js?v=20261003m10c';
import {
  registerPassivesFromData, bindPassiveState, rollOffer, choosePassive, getPassive, listPassives, getTotals,
  availablePool, weightedPick, ensurePassiveState, applyDerivedStats, getBuildSynergy, buildOfPassive
} from './passives.js?v=20261003m10c';
import { createPassiveUi } from './passives-ui.js?v=20261003m10c';
import { createSettingsMenu } from './settings-menu.js?v=20261003m10c';
import { createPassiveProcs, describeProc } from './passive-procs.js?v=20261003m10c';
import { createPassiveHud } from './passive-hud.js?v=20261003m10c';
import { createDragon } from './companion-dragon.js?v=20261003m10c';
import { createFullscreenUi } from './fullscreen.js?v=20261003m10c';
import { hasLineOfSight, wrapAngle } from './collision.js?v=20261003m10c';
import { getConfig, setOverrides, resetOverrides, getOverrides, detectTouchMode, detectQualityTier, isSoftwareGL, DEG } from './gameplay-config.js?v=20261003m10c';

let DATA = null;
let state = null;
/** Snapshot do save do mundo enquanto a arena está ativa (não sobrescreve). */
let worldBackup = null;
let ui = null;
/** ARSENAL MCB: HUD da moeda + tela do Arsenal. */
let mcbUi = null;
let vestiario = null;
/** Bloco 6b: tela inteira (Fullscreen API / dica do iPhone). */
let fullscreenUi = null;
let busy = false;
let mobile = null;
/** Bloco 5: menu Configurações → Controles + editor de layout (criado sob demanda). */
let settingsMenu = null;
function getSettingsMenu() {
  if (!settingsMenu && ui && mobile) {
    settingsMenu = createSettingsMenu({
      ui, mobile,
      isGameVisible: () => !!state && isGameVisible(),
      openGameSettings: () => ui.openSettings(),
      openHeroStyle: () => openHeroStyleModal(),
      onChange: (id) => settingsLog.push({ id, at: Math.round(performance.now()) })
    });
  }
  return settingsMenu;
}
const settingsLog = [];

/** Default play camera = FPS. Iso only with ?iso=1 debug. */
const useIso = new URLSearchParams(location.search).get('iso') === '1';
const renderer = useIso ? createRenderer() : createFpsRenderer();
/** gp1: único dono do movimento (contínuo) — ticado pelo rAF do renderer ativo. */
const motion = createPlayerMotion();

let zoneCacheMain = null;
function zoneOf(s) {
  if (!s) return null;
  if (zoneCacheMain && zoneCacheMain.id === s.zoneId) return zoneCacheMain;
  zoneCacheMain = s._data.zones.zones.find((z) => z.id === s.zoneId) || null;
  return zoneCacheMain;
}

/**
 * gp2: ataque básico em tempo real — QUANDO (frame de impacto) e QUEM (cone +
 * visão) decididos em player-combat; o DANO continua em actions.applyPlayerHit.
 */
const weaponAreaLog = [];
const combat = createPlayerCombat({
  getZone: zoneOf,
  getMonsterPos,
  bodyRadius: (m) => monBodyRadius(m),
  isRanged: (s) => !!getEquippedStats(s).ranged,
  applyHit: (s, mon, info) => applyPlayerHit(s, mon, { dmgMult: info.dmgMult }),
  onHit: (result, mon, info) => onPlayerHit(result, mon, info),
  onSwing: (info) => sfxSwing(info.comboIndex),
  // ARSENAL: arco/cajado disparam projétil real (weapon-projectiles); espada = combo corpo a corpo de sempre
  weaponClass: (s) => weaponClassOf(s),
  weaponCfg: (wc) => DATA?.arsenal?.armas?.[wc] || null,
  getLockTarget: () => { const uid = validLockOn(); return uid == null ? null : state?.monstersAlive.find((m) => m.uid === uid) || null; },
  fireWeapon: (s, wc, target, shot, pc, range) => fireHeroShot(s, wc, target, shot, pc, range)
});
/** ARSENAL: projéteis do herói (flecha / raio) — relógio do jogo, mira assistida, dano pelo caminho do golpe. */
const heroShots = createWeaponProjectiles({
  getState: () => state,
  getZone: zoneOf,
  getMonsterPos,
  bodyRadius: (m) => monBodyRadius(m)
});
function familyColor(s) {
  const fam = weaponFamilyOf(s);
  return DATA?.arsenal?.familias?.[fam]?.vfx ?? (weaponClassOf(s) === 'cajado' ? 0x8a6cff : 0xffe2a0);
}
function fireHeroShot(s, wc, target, shot, pc, range) {
  const color = familyColor(s);
  const bow = wc === 'arco';
  const p = motion.getPos();
  heroShots.fire({
    x: p.x + Math.sin(shot.yaw) * 0.35, y: p.y - Math.cos(shot.yaw) * 0.35, yaw: shot.yaw, target,
    kind: bow ? 'arrow' : 'bolt', speed: pc.velocidade || (bow ? 22 : 15), range: range + 0.6, radius: pc.raio || 0.35,
    color, family: weaponFamilyOf(s),
    onHit: (mon, pr) => combat.applyProjectileHit(s, mon, shot, pr.x, pr.y, 1),
    splash: !bow && pc.splashRaio ? { radius: pc.splashRaio, onSplash: (mon, pr) => combat.applyProjectileHit(s, mon, shot, pr.x, pr.y, pc.splashMult ?? 0.5) } : null
  });
}

/**
 * Bloco 4: esquiva / defesa / especiais + prioridade de comandos (player-actions).
 * Dano dos especiais = applyPlayerHit({ ability:true }) → applyDamageToMonster (XP/loot/quests).
 */
const actions = createPlayerActions({
  combat,
  motion,
  getZone: zoneOf,
  getMonsterPos,
  bodyRadius: (m) => monBodyRadius(m),
  getNexa: (s) => (s || state)?.player?.nexa ?? 0,
  spendNexa: (s, n) => {
    const st = s || state;
    if (!st) return;
    st.player.nexa = Math.max(0, st.player.nexa - n);
    ui?.refresh();
  },
  hitSpecial: (s, mon, id, info) => hitSpecial(s, mon, id, info),
  // ARSENAL: GOLPE/ÁREA/SUPREMA viram TIRO CARREGADO / CHUVA DE FLECHAS / … com arco ou cajado (mesmos botões, custo e recarga)
  weaponSpecial: (id) => {
    const wc = weaponClassOf(state);
    return wc === 'espada' ? null : DATA?.arsenal?.armas?.[wc]?.especiais?.[id] || null;
  },
  fireSpecialShot: (s, id, target, yaw, v, hit) => {
    const bow = weaponClassOf(s) === 'arco';
    const p = motion.getPos();
    heroShots.fire({
      x: p.x + Math.sin(yaw) * 0.35, y: p.y - Math.cos(yaw) * 0.35, yaw, target, kind: bow ? 'charged' : 'arcane',
      speed: bow ? 26 : 17, range: v.range + 0.6, radius: 0.5, color: familyColor(s), family: weaponFamilyOf(s), pierce: bow ? 2 : 0,
      onHit: (m, pr) => hit(m, pr.x, pr.y, 1),
      splash: !bow && v.splashRaio ? { radius: v.splashRaio, onSplash: (m, pr) => hit(m, pr.x, pr.y, 0.5) } : null
    });
  },
  onWeaponArea: (id, cx, cy, v) => {
    const col = familyColor(state);
    heroShots.burst(cx, cy, v.radius, col, 'area', id === 'suprema' ? 900 : 650);
    weaponAreaLog.push({ id, x: +cx.toFixed(2), y: +cy.toFixed(2), r: v.radius, nome: v.nome, at: Math.round(performance.now()) });
    if (weaponAreaLog.length > 20) weaponAreaLog.shift();
  },
  getLockTarget: () => {
    const uid = validLockOn();
    return uid == null ? null : state.monstersAlive.find((m) => m.uid === uid) || null;
  },
  onEvent: (type, d) => onActionEvent(type, d)
});
setPlayerDefenseHook((s, mon) => actions.resolveIncoming(s, mon));

/**
 * Bloco 6: PASSIVAS AUTOMÁTICAS — procs visíveis (buff + aura + ícone no HUD + texto flutuante).
 * Mesmos ids de data/passives.json (saves antigos: a passiva já escolhida ganha o efeito novo).
 */
const passiveHud = createPassiveHud();
const procLabels = { at: 0, n: 0 };
const procs = createPassiveProcs({
  getState: () => state,
  getLockUid: () => validLockOn(),
  isMonAlive: (uid) => !!state && state.monstersAlive.some((m) => m.uid === uid && m.alive && m.zone === state.zoneId),
  onNexa: () => ui?.refresh(),
  onProc: (id, info) => onPassiveProc(id, info)
});
// EVO: libera o WebAudio no PRIMEIRO toque/tecla em qualquer lugar (política de autoplay do mobile)
for (const ev of ['pointerdown', 'touchstart', 'keydown']) window.addEventListener(ev, () => unlockAudio(), { capture: true, passive: true });
setPlayerAbsorbHook((s, dmg) => {
  const hadShield = !!procs.getView().shield;
  const a = procs.absorb(s, dmg);
  // EVO: assinatura do Núcleo Reforçado — escudo nasce inteiro; cada golpe absorvido racha células
  if (a > 0) renderer.passiveSig?.(hadShield ? 'absorb' : 'shield_up', {});
  return a;
});
function onPassiveProc(id, info) {
  if (renderer.mode !== 'fps') return; // iso legado: efeito vale, sem aura/texto 3D
  const now = performance.now();
  procLabels.n = now - procLabels.at < 500 ? procLabels.n + 1 : 0;
  procLabels.at = now;
  const pc = getConfig().passiveProcs;
  renderer.spawnFloatText?.(`${info.label}!`, info.color, { size: 18, ms: pc.labelMs, dy: -26 - procLabels.n * 24, cls: 'nx-proc-label' });
  renderer.passiveFx?.('proc', { color: parseInt(String(info.color).replace('#', ''), 16) || 0xffffff });
  pushButtonInfo(1); // HUD na hora
}
/**
 * gp2: SIMULAÇÃO ÚNICA por frame (chamada pelo rAF do renderer ativo):
 * movimento (tempo real, nunca congelado) → ataque → IA/física dos inimigos.
 * Hit-stop e modal/drawer congelam só o relógio de jogo (ataque + inimigos),
 * nunca o controle de câmera/movimento. Objetos reutilizados (sem alocação).
 */
let hitStopUntil = 0;
/** gp3: tela de passivas (congela combate/IA/dragão/projéteis) + Mini Dragão. */
const passiveUi = createPassiveUi();
/** Lock-on (Bloco 4): uid do alvo travado; null = sem trava. Toque/dragão respeitam. */
let lockOnTarget = null;
const dragon = createDragon({
  getZone: zoneOf,
  getMonsterPos,
  isAttackingPlayer,
  isEngagingPlayer: isTargetingPlayer,
  recentlyAttackedPlayer: (m) => recentlyAttackedPlayer(m),
  // alvo do herói = lock-on, ou o último monstro que ele acertou há pouco (memória curta, configurável)
  getPlayerTargetUid: () => validLockOn() ?? (playerTarget.uid != null && getAiClock() - playerTarget.at <= getConfig().dragon.heroTargetMemoryMs ? playerTarget.uid : null),
  damage: (mon, amount, o) => dragonDamageProxy(mon, amount, o),
  onCharge: (id, ms) => { if (id === 'chama_concentrada') sfxDragonCharge(ms); },
  onFire: (id) => { if (id === 'chama_concentrada') sfxDragonBlast(); else sfxDragonWhoosh(); },
  onImpact: (kind, x, y, big) => sfxDragonImpact(big),
  // Bloco 6: MODO DIVINO (Núcleo Divino) — recarga dos ataques menor + brilho/escala no visual
  getCooldownMult: () => procs.dragonCooldownMult(),
  getDivine: () => (procs.isDivine() ? 1 : 0),
  onEvolve: () => {
    passiveUi.showBanner('<b>MINI DRAGÃO EVOLUIU</b>CHAMA AZUL CONCENTRADA DESBLOQUEADA', 3600);
    if (state) pushLog(state, 'Mini Dragão evoluiu: Chama Azul Concentrada desbloqueada.', 'sys');
    safeSave();
  }
});
/**
 * Bloco 7: TENTATIVA DA ARENA (GIGANTE VERDE + poderes temporários). Personagem da Arena =
 * cópia do PERMANENTE (mundo em memória ou save); sem personagem → Testador (recompensa não salva).
 */
let arenaPermCache = null;
function resolvePermanent() {
  if (worldBackup && !isArenaState(worldBackup)) {
    return { state: worldBackup, source: 'memoria', persist: (s) => saveToLocal(s) };
  }
  if (!arenaPermCache && hasSave()) {
    try {
      const saved = loadFromLocal();
      if (saved?.player) arenaPermCache = loadSaved(saved);
    } catch (e) {
      console.warn('[arena] save inválido para a Arena', e);
      arenaPermCache = null;
    }
  }
  if (arenaPermCache) return { state: arenaPermCache, source: 'save', persist: (s) => saveToLocal(s) };
  return { state: null, source: 'testador', persist: () => {} };
}
/**
 * SAVE (Caio): a evolução do herói ganha no CAMPO DE ASCENSÃO é PERMANENTE — nível, XP, passivas,
 * itens/equipamento, estilo do herói e dragão vão para o personagem salvo (mundo em memória ou save local).
 * Só os poderes temporários da corrida (arena-run) ficam de fora (pilhas zeradas durante o cálculo).
 * Sem personagem salvo: cria um herói permanente agora (antes o Campo era uma cópia descartável → "NV 1" sempre).
 */
const SYNC_PLAYER_SKIP = new Set(['x', 'y', 'hp', 'nexa']);
let campoSyncSig = '';
let campoSyncAt = 0;
const campoSyncStats = { count: 0, last: null, created: 0 };
function progressSig(s) {
  const pl = s?.player || {};
  return [pl.nivel, pl.xp, pl.heroStyle || '', JSON.stringify(pl.heroCustom || {}), (s?.passives?.owned || []).length, s?.passives?.pending || 0,
    (s?.inventory || []).map((i) => `${i.item_id}:${i.qty}:${i.equipped ? 1 : 0}`).join(','),
    JSON.stringify(s?.equipment || {}), s?.dragon?.stage || 1, s?.dragon?.level || 1].join('|');
}
/** ARENA PRINCIPAL: corridas que gravam a evolução no permanente na hora (Campo e Arena Principal). */
const isRunPersist = (s) => !!(s?.campoMode || s?.brMode);
/** Carrega um save e registra as instâncias de itens da Arena (raridade) no índice de itens. */
function loadSaved(saved) { const s = applySave(DATA, saved); try { hydrateBrItems(s); } catch (e) { console.warn('[br] hydrate', e); } return s; }
function syncCampoProgress(s, reason = 'tick') {
  if (!isRunPersist(s) || !s.player) return false;
  let perm = resolvePermanent();
  if (!perm.state) {
    const fresh = createNewGame(DATA, { name: s.player.name && s.player.name !== 'Testador' ? s.player.name : 'Herói', raceId: s.player.raceId || 'humano' });
    arenaPermCache = fresh;
    campoSyncStats.created++;
    perm = resolvePermanent();
    if (!perm.state) return false;
  }
  const t = perm.state;
  const src = JSON.parse(JSON.stringify({ player: s.player, inventory: s.inventory, equipment: s.equipment, passives: s.passives, dragon: s.dragon, arquivo: s.arquivo }));
  for (const [k, v] of Object.entries(src.player)) if (!SYNC_PLAYER_SKIP.has(k) && !(k === 'name' && v === 'Testador')) t.player[k] = v;
  if (Array.isArray(src.inventory)) t.inventory = src.inventory;
  if (src.equipment) t.equipment = src.equipment;
  if (!t.passives) t.passives = { owned: [], pending: 0, lastOffer: [], offer: null };
  t.passives.owned = (src.passives?.owned || []).slice();
  t.passives.pending = src.passives?.pending || 0;
  t.passives.offer = null;
  if (src.dragon) t.dragon = { stage: Math.max(1, src.dragon.stage || 1), level: Math.max(1, src.dragon.level || 1) };
  if (src.arquivo && Object.keys(src.arquivo).length) t.arquivo = src.arquivo;
  try { hydrateBrItems(t); } catch {} // ARENA PRINCIPAL: instâncias de loot com raridade
  // HP máximo salvo = nível + passivas permanentes (sem VIGOR etc. da corrida)
  campoRun.withoutPowers(() => { t.player.hpMax = t.player.hpMaxBase || t.player.hpMax; applyDerivedStats(t); });
  t.player.hp = Math.min(Math.max(1, t.player.hp || t.player.hpMax), t.player.hpMax);
  if (t.player.nexa > t.player.nexaMax) t.player.nexa = t.player.nexaMax;
  try { perm.persist(t); } catch (e) { console.warn('[campo] sync save', e); return false; }
  campoSyncSig = progressSig(s);
  campoSyncAt = performance.now();
  campoSyncStats.count++;
  campoSyncStats.last = { reason, nivel: t.player.nivel, xp: t.player.xp, passives: t.passives.owned.length, source: perm.source, at: Date.now() };
  return true;
}
/** M3D: estilo do herói + equipamento → modelo 3D (só quando muda). */
let heroLookSig = '';
let portraitSeenV = 0;
let equipSigState = null;
let equipSig = '';
/** CRÉDITO DE TESTE de MCB (arsenal.json testGrantMcb) — 1× por perfil; grava logo (assinatura nova). */
let grantChecked = '';
let lastGrant = null;
function maybeTestGrant() {
  const g = testGrantConfig();
  if (!g || !mcbUi || !vestiario) return null;
  if (navigator.webdriver && !window.__NEXARA_ALLOW_GRANT__) return null; // suítes de teste: só quando pedem
  const s = state || resolvePermanent().state;
  if (!s?.player) return null;
  const sig = `${g.id}|${s === state ? 'a' : 'p'}|${s.player.name}`;
  if (grantChecked === sig) return null;
  grantChecked = sig;
  const mirrors = (isArenaState(s) && !isRunPersist(s)) ? (() => { const perm = resolvePermanent(); return perm.state ? [perm.state, s] : [s]; })() : [s];
  const r = applyTestGrant(mirrors, getLocalProfile().id);
  lastGrant = { ...r, at: Date.now() };
  if (r.applied) {
    const msg = `CRÉDITO DE TESTE: +${r.n.toLocaleString('pt-BR')} MCB (${r.id}) — saldo ${r.mcb.toLocaleString('pt-BR')}`;
    console.info('[mcb]', msg);
    for (const m of mirrors) try { pushLog(m, msg, 'sys'); } catch {}
    if (isRunPersist(s)) syncCampoProgress(s, 'test-grant');
    else if (isArenaState(s)) { const perm = resolvePermanent(); if (perm.state) try { perm.persist(perm.state); } catch {} }
    else if (s === state) safeSave();
    else { const perm = resolvePermanent(); try { perm.persist(s); } catch {} }
    mcbUi.pop(`+${r.n} MCB · CRÉDITO DE TESTE`, 'chefe');
    mcbUi.resetHud(); mcbUi.updateHud(s);
    ui?.showToast?.(msg);
  }
  return r;
}
function syncHeroLook(s) {
  if (!s?.player) return;
  if (s === state) maybeTestGrant();
  // ARSENAL: atributos do equipamento → modificadores reais (recalcula só quando muda/troca de estado)
  const es = JSON.stringify(s.equipment || {});
  if (s !== equipSigState || es !== equipSig) { equipSigState = s; equipSig = es; refreshEquipment(s); applyDerivedStats(s); }
  mcbUi?.updateHud(s);
  const sig = `${s.player.heroStyle || ''}|${JSON.stringify(s.equipment || {})}|${JSON.stringify(s.player.heroCustom || {})}`;
  if (sig === heroLookSig) return;
  heroLookSig = sig;
  renderer.setHeroStyle?.(heroStyleOf(s).id, { equip: equipmentVisual(s), custom: s.player.heroCustom || {} });
}
/** Retrato 3D do HUD em presets sem pós-processo: foto num contexto WebGL temporário (cache por estilo+cores). */
function portraitSnap(styleId, custom) {
  if (/[?&](models|portrait)=0\b/.test(location.search)) return;
  import('./fps/hero-preview.js?v=20261003m10c').then((m) => m.makePortraitSnapshot(styleId || 'cavaleiro', custom || {})).catch(() => {});
}
/** Chamado a cada quadro no Campo: grava quando algo da evolução mudou (no máx. 2×/s; eventos fortes forçam). */
function maybeSyncCampo(s) {
  if (performance.now() - campoSyncAt < 500) return;
  if (progressSig(s) !== campoSyncSig) syncCampoProgress(s, 'change');
}
function buildArenaAttemptState() {
  const perm = resolvePermanent();
  const bc = getConfig().arenaBoss;
  const st = createArenaState(DATA, { name: 'Testador', raceId: 'humano', from: perm.state, boss: bc.enabled ? bc : null });
  try { hydrateBrItems(st); } catch {}
  return { state: st, source: perm.source };
}
const arenaRun = createArenaRun({
  getData: () => DATA,
  buildAttemptState: buildArenaAttemptState,
  getPermanent: () => resolvePermanent(),
  applyDerived: (s) => applyDerivedStats(s),
  onEnd: (kind, info) => onArenaAttemptEnd(kind, info)
});
/**
 * EVO: CAMPO DE ASCENSÃO — 2ª instância da mesma camada temporária (poderes/chefe/recompensa real),
 * com o estado da corrida do Campo (createCampoState) e recompensa extra de data/recompensas.json.
 */
function buildCampoAttemptState() {
  const perm = resolvePermanent();
  const bc = getConfig().arenaBoss;
  const st = createCampoState(DATA, { from: perm.state, boss: bc.enabled ? bc : null });
  try { hydrateBrItems(st); } catch {}
  mcbRunLog.push({ start: Date.now(), mcb: 0, kills: {}, startBalance: st.player.mcb || 0 });
  if (mcbRunLog.length > 20) mcbRunLog.shift();
  return { state: st, source: perm.source };
}
const campoRun = createArenaRun({
  getData: () => DATA,
  buildAttemptState: buildCampoAttemptState,
  getPermanent: () => resolvePermanent(),
  applyDerived: (s) => applyDerivedStats(s),
  syncProgress: (s, why) => syncCampoProgress(s, why),
  extraReward: (def) => {
    const t = DATA?.recompensas?.tabelas?.[def.tier || 'chefe'];
    return t ? { xp: t.xpBonus || 0, drops: rollLoot(t.drops || []) } : null;
  },
  onEnd: (kind, info) => onArenaAttemptEnd(kind, info)
});
const campo = createCampo({
  getData: () => DATA,
  run: campoRun,
  getPos: () => motion.getPos(),
  applyDerived: (s) => { bindPassiveState(s); applyDerivedStats(s); },
  presetCap: () => renderer.getGraphics?.()?.caps?.activeEnemies || 10,
  teleport: (s, x, y) => {
    s.player.x = x; s.player.y = y;
    motion.stopNow();
    motion.snapToTile(s);
    combat.cancel();
    actions.reset();
    lockOnTarget = null;
    resetAttackTokens();
    const p0 = motion.getPos();
    dragon.reset(p0.x, p0.y, renderer.getYaw?.() ?? 0, renderer.fpsCam?.camera?.aspect || 1.6);
    dragonCtx.state = s;
    grantAiGrace();
    lastNivel = s.player.nivel;
  },
  onEvent: (kind, info) => onCampoEvent(kind, info)
});
/** ARENA PRINCIPAL: estado da corrida (cópia do permanente; evolução/loot sincronizados na hora). */
function buildBrAttemptState() {
  const perm = resolvePermanent();
  const bc = getConfig().arenaBoss;
  const st = createBrState(DATA, { from: perm.state, boss: bc.enabled ? bc : null });
  try { hydrateBrItems(st); } catch {}
  mcbRunLog.push({ start: Date.now(), mcb: 0, kills: {}, startBalance: st.player.mcb || 0, br: true });
  if (mcbRunLog.length > 20) mcbRunLog.shift();
  return { state: st, source: perm.source };
}
/** Camada de chefe da Arena Principal (HP do GIGANTE VERDE pelo HP do herói + recompensa real). Sem poderes temporários. */
const brRun = createArenaRun({
  getData: () => DATA,
  buildAttemptState: buildBrAttemptState,
  getPermanent: () => resolvePermanent(),
  applyDerived: (s) => applyDerivedStats(s),
  syncProgress: (s, why) => syncCampoProgress(s, why),
  extraReward: (def) => {
    const t = DATA?.recompensas?.tabelas?.[def.tier || 'chefe'];
    return t ? { xp: t.xpBonus || 0, drops: rollLoot(t.drops || []) } : null;
  },
  onEnd: () => {}
});
let brSummaryShown = false;
const arenaBr = createArenaBr({
  getData: () => DATA,
  getPos: () => motion.getPos(),
  presetName: () => renderer.getGraphics?.()?.tier || 'medium',
  onEvent: (kind, info) => onBrEvent(kind, info),
  onPickup: (drop) => brPickup(drop),
  credit: (n, why) => brCredit(n, why),
  damageHero: (n, why) => brDamageHero(n, why),
  armBoss: () => { try { brRun.armBoss(); } catch (e) { console.warn('[br] armBoss', e); } }
});
let brUi = null;
/** Tentativa ativa: Arena Principal, Campo (se o estado é do Campo) ou Arena de Teste. */
function curRun() { return state?.brMode ? brRun : state?.campoMode ? campoRun : arenaRun; }
function exitAllRuns() { heroShots.clear(); if (campo.isActive() && state?.campoMode) syncCampoProgress(state, 'exit'); if (state?.brMode && arenaBr.getStateRef() === state) syncCampoProgress(state, 'exit'); arenaRun.exit(); campoRun.exit(); brRun.exit(); campo.stop(); campoUi.hide(); arenaBr.stop(); brUi?.hide(); }

/** EVO: avisos do Campo (onda, elite, mini-chefe, portão, entrada do dragão). */
function onCampoEvent(kind, info) {
  // SAVE: marcos da corrida gravam a evolução na hora (além da gravação contínua em maybeSyncCampo)
  if (kind === 'wave_clear' || kind === 'death' || kind === 'prep_enter' || kind === 'tier_reward' || kind === 'gate_open') syncCampoProgress(campo.getStateRef(), kind);
  const v = campo.view();
  const big = (html, ms = 2200) => passiveUi.showBanner(html, ms);
  if (kind === 'wave_start') {
    // EVO: anúncio de onda — "ONDA N", total de inimigos e carta de cada VILÃO NOVO (1ª aparição)
    const ARCH_TXT = { A: 'CORPO A CORPO', B: 'RÁPIDO · FLANCO', C: 'À DISTÂNCIA', D: 'TANQUE', E: 'CONTROLE', F: 'ELITE', G: 'MINI-CHEFE' };
    const esc = (t) => String(t || '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
    const cards = (info.novos || []).map((q) => `<span class="cw-vil" data-id="${q.id}" style="--cw:${q.cor}"><span class="cw-ico">${esc(q.icone)}</span><span class="cw-txt"><b>${esc(q.name)}</b><small>NOVO VILÃO · ${ARCH_TXT[q.arch] || ''}</small><i>${esc(q.lore)}</i></span></span>`).join('');
    const sub = info.name.replace(/^ONDA\s*\d+\s*—\s*/, '');
    const tags = `${info.elite ? '<span class="cw-tag cw-elite">ELITE</span>' : ''}${info.miniBoss ? '<span class="cw-tag cw-mini">MINI-CHEFE</span>' : ''}${info.final ? '<span class="cw-tag cw-final">DESAFIO FINAL</span>' : ''}`;
    const waves = info.waves || 10;
    const html = `<span class="cw-wave" data-wave="${info.n}"><span class="cw-n">ONDA ${info.n}<em>/${waves}</em></span><span class="cw-sub">${esc(sub)}</span><span class="cw-count"><b>${info.total}</b> INIMIGOS${info.total > (info.maxActive || 99) ? ` · entram em grupos de até ${info.maxActive}` : ''}</span>${tags ? `<span class="cw-tags">${tags}</span>` : ''}${cards ? `<span class="cw-new">${cards}</span>` : ''}</span>`;
    lastWaveBannerAt = performance.now();
    big(html, cards ? 3400 : 2000);
    evoAnnounce('wave', info.name);
    evoStats.waveBanners.push({ n: info.n, total: info.total, novos: (info.novos || []).map((q) => q.id), html: html.length });
    if (evoStats.waveBanners.length > 20) evoStats.waveBanners.shift();
  } else if (kind === 'elite_spawn') {
    if (renderer.mode === 'fps') renderer.spawnFloatText?.(`ELITE: ${info.name}!`, '#ffd34a', { size: 20, dy: 40 });
    sfxEliteSpawn();
    renderer.shake?.(0.35);
    sfxWarn();
    evoAnnounce('elite', info.name);
  } else if (kind === 'miniboss_spawn') {
    // na onda final o anúncio da onda já apresenta o mini-chefe: não sobrescreve o cartão
    if (performance.now() - lastWaveBannerAt > 3000) big(`<b>MINI-CHEFE: ${info.name.toUpperCase()}</b>Fases: golpes → INVESTIDA → ONDA`, 2200);
    else if (renderer.mode === 'fps') renderer.spawnFloatText?.(`MINI-CHEFE: ${info.name}!`, '#ff6ad5', { size: 20, dy: 40 });
    renderer.shake?.(0.6);
    evoAnnounce('miniboss', info.name);
  } else if (kind === 'wave_clear') {
    if (renderer.mode === 'fps') renderer.spawnFloatText?.(`${info.name.split('—')[0].trim()} LIMPA!`, '#5dff6a', { size: 18, dy: 34 });
  } else if (kind === 'tier_reward') {
    const names = (info.drops || []).map((d) => state?._items?.[d.item_id]?.name || d.item_id).join(' · ');
    if (renderer.mode === 'fps') renderer.spawnFloatText?.(`RECOMPENSA +${info.xpBonus} XP ${names ? '· ' + names : ''}`, info.tier === 'elite' ? '#ffd34a' : '#ff6ad5', { size: 15, dy: 50 });
    evoAnnounce('reward', info.tier);
  } else if (kind === 'gate_open') {
    big(`<b>PORTÃO DO DRAGÃO ABERTO</b>Vá para leste. Nível recomendado: ${info.recommended} (você: ${info.nivel})`, 2600);
    evoAnnounce('gate', 'open');
  } else if (kind === 'prep_enter') {
    campoUi.showPortao();
  } else if (kind === 'prep_leave') {
    campoUi.hidePortao();
  } else if (kind === 'gate_enter') {
    campoUi.hidePortao();
    big(`<b>O COVIL SE ABRE</b>GIGANTE VERDE: ${Number(info.bossHp || 0).toLocaleString('pt-BR')} HP (${info.heroHpMax} × ${info.multiplier})`, 2000);
  } else if (kind === 'boss_intro') {
    // Entrada do dragão: tremor forte + flash verde + aviso grande + rugido do chefe
    renderer.shake?.(1.2);
    campoUi.flash('#2cff6a');
    big('<b style="color:#5dff6a">GIGANTE VERDE DESPERTOU</b>O covil fechou. Leia os avisos no chão — esquive e quebre a postura.', 3200);
    sfxBossRoar();
    renderer.playBossIntro?.();
    evoAnnounce('dragon', 'spawn');
    const boss = curRun().bossMon();
    if (boss) setLock(boss.uid, 'auto');
  } else if (kind === 'death') {
    passiveUi.close();
    bindPassiveState(state);
    passiveHud.clear();
    heroDamaged.clear();
    lastThreatAt.clear();
    renderer.resetVis?.();
    big(info.checkpoint === 'boss'
      ? '<b>DERROTADO PELO DRAGÃO</b>De volta ao PORTÃO — herói e poderes como estavam ao entrar. Save intocado.'
      : `<b>VOCÊ CAIU</b>Recomeçando a ONDA ${v.wave} — herói e poderes como no início dela. Save intocado.`, 2800);
    ui.refresh();
  } else if (kind === 'boss_victory') {
    evoAnnounce('victory', String(info.ms));
  }
}

/** EVO: painel do Campo (onda / restantes) + painel do PORTÃO (nível recomendado, build, ENTRAR). */
const campoUi = (() => {
  let hud = null;
  let gate = null;
  let flashEl = null;
  let lastKey = '';
  function host() { return document.getElementById('canvas-wrap') || document.getElementById('game-screen'); }
  function ensure() {
    if (hud && hud.isConnected) return;
    hud = document.createElement('div');
    hud.id = 'campo-hud';
    hud.className = 'campo-hud hidden';
    host().appendChild(hud);
  }
  function update() {
    ensure();
    const on = !!(state?.campoMode && campo.isActive() && isGameVisible());
    hud.classList.toggle('hidden', !on);
    if (!on) return;
    const v = campo.view();
    let line;
    if (v.phase === 'wave' || v.phase === 'intro') line = `<b>ONDA ${v.wave}/${v.waves}</b><span>${v.phase === 'intro' ? 'PREPARE-SE…' : `${v.alive + v.queue} restantes`}</span>`;
    else if (v.phase === 'gate_open') line = '<b>PORTÃO ABERTO</b><span>vá para leste ▶</span>';
    else if (v.phase === 'portao') line = '<b>PORTÃO DO DRAGÃO</b><span>preparação</span>';
    else if (v.phase === 'boss_enter' || v.phase === 'boss') line = '<b>COVIL</b><span>GIGANTE VERDE</span>';
    else line = `<b>${v.phase}</b>`;
    const key = `${line}|${state.player.nivel}`;
    if (key === lastKey) return;
    lastKey = key;
    hud.innerHTML = `${line}<em>NV ${state.player.nivel}</em>`;
    hud.dataset.phase = v.phase;
  }
  function buildSummary() {
    const syn = getBuildSynergy();
    const owned = state?.passives?.owned || [];
    const builds = getConfig().progression?.builds || {};
    const rows = Object.keys(builds).map((b) => {
      const n = syn.count?.[b] || 0;
      const act = (syn.active || []).filter((a) => a.build === b).map((a) => `SINERGIA ${a.nivel}`).join(' + ');
      return `<li style="--c:${builds[b].cor}"><b>${builds[b].nome}</b> ${n} passiva(s)${act ? ` · <i>${act}</i>` : ''}</li>`;
    }).join('');
    const pw = campoRun.view().powers;
    const pws = Object.entries(pw).map(([id, n]) => `${campoRun.powerDef(id)?.nome || id} ×${n}`).join(' · ') || 'nenhum';
    const names = owned.map((id) => getPassive(id)?.nome || id).join(' · ') || 'nenhuma';
    return `<ul class="cp-builds">${rows}</ul><p><small>PASSIVAS:</small> ${names}</p><p><small>PODERES TEMPORÁRIOS:</small> ${pws}</p>`;
  }
  function showPortao() {
    if (!gate || !gate.isConnected) {
      gate = document.createElement('div');
      gate.id = 'campo-portao';
      gate.className = 'campo-portao hidden';
      host().appendChild(gate);
    }
    const rec = DATA.campo_ascensao?.regras?.recommendedLevel || 1;
    const nv = state?.player?.nivel || 1;
    const bc = getConfig().arenaBoss;
    const mult = campoRun.effectiveMultiplier();
    gate.innerHTML = `<div class="cp-title">PORTÃO DO DRAGÃO</div>
      <div class="cp-sub">Além deste portão: <b>GIGANTE VERDE</b></div>
      <div class="cp-lvl ${nv >= rec ? 'ok' : 'low'}">NÍVEL RECOMENDADO <b>${rec}</b> · VOCÊ <b>${nv}</b>${nv >= rec ? ' ✓' : ' — arriscado'}</div>
      <div class="cp-stats">HP ${state.player.hpMax} · NEXA ${state.player.nexaMax} · ATK ${state.player.ataque} · DEF ${state.player.defesa} · Chefe ≈ ${(state.player.hpMax * mult).toLocaleString('pt-BR')} HP</div>
      <details class="cp-build"><summary>REVISAR BUILD</summary>${buildSummary()}</details>
      <div class="cp-btns"><button type="button" id="btn-campo-entrar" class="primary">ENTRAR NO COVIL</button></div>
      <div class="cp-tip">Ataques do dragão: garra · cauda · investida · sopro · anéis · poças. Todos têm aviso no chão.</div>`;
    gate.querySelector('#btn-campo-entrar').onclick = () => { campo.enterBoss(); };
    gate.classList.remove('hidden');
    void bc;
  }
  function hidePortao() { if (gate) gate.classList.add('hidden'); }
  function flash(color) {
    if (!flashEl || !flashEl.isConnected) { flashEl = document.createElement('div'); flashEl.className = 'campo-flash'; host().appendChild(flashEl); }
    flashEl.style.background = `radial-gradient(circle, transparent 30%, ${color}88 100%)`;
    flashEl.classList.remove('go'); void flashEl.offsetWidth; flashEl.classList.add('go');
  }
  function hide() { if (hud) hud.classList.add('hidden'); hidePortao(); lastKey = ''; }
  return { update, showPortao, hidePortao, flash, hide, isPortaoShown: () => !!(gate && !gate.classList.contains('hidden')) };
})();

/** Banner de fim de tentativa + reset do lado do main (movimento, combate, dragão, lock…). */
function onArenaAttemptEnd(kind, info) {
  passiveUi.close();
  bindPassiveState(state);
  motion.stopNow();
  if (state) motion.snapToTile(state);
  combat.cancel();
  actions.reset();
  procs.reset();
  passiveHud.clear();
  heroDamaged.clear();
  lastThreatAt.clear();
  lockOnTarget = null;
  resetAttackTokens();
  lastNivel = state ? state.player.nivel : null;
  if (state) {
    const p0 = motion.getPos();
    dragon.reset(p0.x, p0.y, renderer.getYaw?.() ?? 0, renderer.fpsCam?.camera?.aspect || 1.6);
    dragonCtx.state = state;
  }
  grantAiGrace();
  renderer.resetVis();
  const v = curRun().view();
  const ms = getConfig().arenaBoss.endBannerMs;
  // EVO: vitória no Campo → nova corrida (estado recriado pela arena-run a partir do permanente)
  if (state?.campoMode) {
    campo.start(state);
    campoUi.hide();
  }
  if (kind === 'victory') {
    const loot = (info?.drops || []).map((d) => `${state?._items?.[d.item_id]?.name || d.item_id} ×${d.qty}`).join(' · ');
    const saved = info?.persisted ? 'Recompensa salva no seu personagem.' : 'Sem personagem salvo: recompensa não guardada.';
    passiveUi.showBanner(`<b>VITÓRIA! GIGANTE VERDE DERROTADO</b>+${info?.xp || 0} XP · ${loot}<br><small>${saved} Poderes zerados — TENTATIVA ${v.attempt}</small>`, ms + 1400);
  } else if (kind === 'reset') {
    passiveUi.showBanner(`<b>NOVA TENTATIVA</b>Poderes temporários zerados — TENTATIVA ${v.attempt}`, ms);
  } else {
    passiveUi.showBanner(`<b>DERROTADO</b>Poderes temporários zerados.<br><small>Nada permanente foi perdido — TENTATIVA ${v.attempt}</small>`, ms);
  }
  sfxSpecial?.();
  ui.refresh();
}
/** Escolha 1 de 3 PODERES DA ARENA (mesma UI de cartas da evolução, modo arena). */
function openArenaPowerChoice() {
  const arenaRun = curRun();
  const offer = arenaRun.nextOffer();
  if (!offer || !offer.length) return;
  motion.stopNow();
  mobile?.releaseAll?.();
  combat.setHeld(false);
  if (renderer.mode === 'fps') renderer.controls?.()?.exitLock?.();
  const v = arenaRun.view();
  passiveUi.show(offer, {
    mode: 'arena',
    level: v.attempt,
    stacks: (id) => arenaRun.powerStacks(id),
    onPick: (id) => {
      const def = arenaRun.pickPower(id);
      if (def) ui.refresh();
      return def;
    },
    onClosed: () => { ui.refresh(); }
  });
}
const bossHud = createBossHud();
const bossHudView = { visible: false, hp: 0, max: 1, attempt: 0, powers: 0, locked: false, telegraph: '' };
function updateBossHud(s) {
  const v = bossHudView;
  v.visible = false;
  const arenaRun = curRun();
  if (s && isArenaState(s) && arenaRun.isActive() && isGameVisible()) {
    const boss = arenaRun.bossMon();
    if (boss && boss.alive) {
      const bv = getBossView(boss);
      const p = motion.getPos();
      const bc = getConfig().arenaBoss;
      const locked = validLockOn() === boss.uid;
      const engaged = bv && bv.state !== 'IDLE' && bv.state !== 'RETURN';
      const minX = Number.isFinite(boss.territoryMinX) ? boss.territoryMinX : bc.territoryMinX;
      v.visible = !!(engaged || locked || (s.brMode ? !!s.br?.inDragon : p.x >= minX - 1.5)); // ARENA PRINCIPAL: só no território do dragão
      // EVO: fase + postura do chefe
      v.phase = bv ? (bv.phase ?? 0) + 1 : 1;
      v.phaseName = bv?.phaseName || '';
      const pst = getPosture(boss);
      v.posture = pst.posture; v.postureMax = pst.max; v.broken = pst.broken;
      v.hp = boss.hp;
      v.max = boss.hpMax;
      v.locked = locked;
      v.telegraph = bv && bv.state === 'ATTACK_PREPARE' && bv.attack ? `${(bc.attacks[bv.attack] || bc.extraAttacks?.[bv.attack])?.nome || bv.attack.toUpperCase()}!` : ''; // EVO: ataques novos vivem em extraAttacks
      const rv = arenaRun.view();
      v.attempt = rv.attempt;
      v.powers = Object.values(rv.powers).reduce((a, b) => a + b, 0);
    }
  }
  bossHud.update(v);
}
function checkArena(s) {
  updateBossHud(s);
  campoUi.update();
  if (s?.brMode) return; // ARENA PRINCIPAL: sem poderes temporários/reinício automático (fim = resumo)
  const arenaRun = curRun();
  if (!s || !isArenaState(s) || !arenaRun.isActive() || arenaRun.getStateRef() !== s) return;
  arenaRun.update();
  if (arenaRun.hasPendingOffer() && !passiveUi.isOpen() && !busy && !isModalOpen() && !isDrawerOpen() && isGameVisible()) {
    openArenaPowerChoice();
  }
}
setPlayerDeathHook((s, mon) => (s?.brMode ? arenaBr.onPlayerDeath(s, mon) : s?.campoMode ? campo.onPlayerDeath(s, mon) : isArenaState(s) ? arenaRun.onPlayerDeath(s, mon) : false));
/** MCB: recompensa por morte (1× por morte — mcb.js) + popup + grava já (mundo: save · Campo: sync · Arena: permanente). */
const mcbRunLog = [];
setMonsterKillHook((s, mon, def) => {
  if (s?.brMode) { try { arenaBr.onKill(mon, def); } catch (e) { console.warn('[br] kill', e); } }
  const r = creditKill(s, mon, def);
  if (!r) return;
  mcbUi?.pop(r.text, r.tier);
  mcbUi?.updateHud(s);
  if (isRunPersist(s)) {
    const run = mcbRunLog[mcbRunLog.length - 1];
    if (run && !run.end) { run.mcb += r.n; run.kills[r.tier] = (run.kills[r.tier] || 0) + 1; }
    if (s.brMode) arenaBr.addMcb(r.n);
    if (!def.boss) syncCampoProgress(s, 'mcb'); // chefe: o onBossKilled logo depois já sincroniza (com o saldo)
  } else if (isArenaState(s)) {
    // ARENA DE TESTE: bots de treino valem só na sessão (a Arena nunca grava o save — Bloco 7);
    // o CHEFE (GIGANTE VERDE) é recompensa real → vai ao personagem permanente, como o XP/loot do arena-run
    if (def.boss) {
      const perm = resolvePermanent();
      if (perm.state && perm.state !== s) { ensureWallet(perm.state); perm.state.player.mcb += r.n; perm.state.player.mcbTotal += r.n; try { perm.persist(perm.state); } catch {} }
    }
  } else safeSave();
});
setBossKillHook((s, mon, def) => {
  if (s?.brMode) { arenaBr.onBossKilled(); return brRun.onBossKilled(s, mon, def); }
  if (s?.campoMode) { campo.onBossVictory(); return campoRun.onBossKilled(s, mon, def); }
  return arenaRun.onBossKilled(s, mon, def);
});

let dragonVfxScale = 1;
let lastNivel = null;
let nexaAcc = 0;
/** Correção suave de mira do toque (rad restantes / ms restantes). */
const aimNudge = { rad: 0, ms: 0 };
function validLockOn() {
  if (lockOnTarget == null || !state) return null;
  const m = state.monstersAlive.find((x) => x.uid === lockOnTarget);
  if (m && m.alive && m.zone === state.zoneId) return m.uid;
  releaseLock(m && m.zone === state.zoneId ? 'morto' : 'fora_da_zona');
  return null;
}
function dragonActive() {
  return !!state && renderer.mode === 'fps' && getConfig().dragon.enabled && !state.flags?.event_0217_playing && !busy;
}
/** Alvo atual do herói = último inimigo atingido (Bloco 3: lock-on / companheiro). */
const playerTarget = { uid: null, at: 0 };
/** Bloco 4 (dragão): uids que o HERÓI já feriu; último instante (relógio da IA) em que cada uid atacou o herói. */
const heroDamaged = new Set();
const lastThreatAt = new Map();
const dragonGuard = { skipped: 0, clamped: 0 };
function recentlyAttackedPlayer(m) {
  const t = lastThreatAt.get(m.uid);
  return t != null && getAiClock() - t <= getConfig().dragon.killGuardAttackMemoryMs;
}
function threatNow(m) { return isAttackingPlayer(m) || recentlyAttackedPlayer(m); }
let regenAcc = 0;
/** Escala do relógio de jogo (debug/screenshots: 0 congela ataque+inimigos). */
let debugTimeScale = 1;
let currentOnMoved = null;
const simMotionOpts = { busy: false, facingFromCamera: true, onMoved: (info) => currentOnMoved?.(info), bodies: null };
const combatCtx = { state: null, px: 0, py: 0, yaw: 0, noStart: false };
const actionCtx = { state: null, yaw: 0, critical: false };
/**
 * Mira de golpes/especiais: câmera (3ª/1ª pessoa) ou facing (iso). Com LOCK-ON e o alvo
 * perto o bastante, a mira vai no alvo travado (ataques priorizam o travado).
 */
function aimYaw(s, fps, camYaw) {
  const base = fps ? camYaw : motion.getFacing();
  const uid = validLockOn();
  if (uid == null) return base;
  const m = s.monstersAlive.find((x) => x.uid === uid);
  if (!m) return base;
  const p = motion.getPos();
  const mp = getMonsterPos(m);
  const d = Math.hypot(mp.x - p.x, mp.y - p.y);
  const cc = getConfig().combat;
  const reach = Math.max(cc.attackRange + getConfig().enemyAi.bodyRadius + 0.8, getConfig().specials.golpe_poderoso.range + 0.6);
  return d <= reach ? Math.atan2(mp.x - p.x, -(mp.y - p.y)) : base;
}
let lastGrowlAt = 0;
const simDiag = { n: 0, dt: 0, blocked: false, frozen: false, gdt: 0 };
const aiCtx = { px: 0, py: 0, playerRadius: 0.3, think: true };
const dragonCtx = { state: null, px: 0, py: 0, yaw: 0, aspect: 1.6 };
function simulate(s, dt, yaw) {
  if (!s) return;
  const blocked = busy || isInputBlocked();
  const fps = renderer.mode === 'fps';
  simMotionOpts.busy = blocked;
  simMotionOpts.facingFromCamera = fps;
  simMotionOpts.bodies = getBodies();
  // Bloco 4: árbitro de ações (esquiva/especial/defesa) decide o movimento deste frame
  actionCtx.state = s;
  actionCtx.yaw = aimYaw(s, fps, yaw);
  actionCtx.critical = passiveUi.isOpen();
  const mo = actions.update(blocked ? 0 : dt * 1000 * debugTimeScale, actionCtx);
  simMotionOpts.dash = mo.dash;
  simMotionOpts.dashThrough = mo.dashThrough;
  // EVO: zonas de estática (arquétipo E / poças do dragão) deixam o herói lento
  simMotionOpts.speedMult = mo.speedMult * getPlayerSlow();
  simMotionOpts.noRun = mo.noRun;
  motion.update(s, dt, yaw, simMotionOpts);
  const frozen = performance.now() < hitStopUntil;
  const gdt = blocked || frozen ? 0 : dt * debugTimeScale;
  simDiag.n++; simDiag.dt = dt; simDiag.blocked = blocked; if (blocked) simDiag.why = { busy: !!busy, modal: isModalOpen(), drawer: isDrawerOpen(), cards: passiveUi.isOpen(), editor: !!settingsMenu?.isEditorOpen() }; simDiag.frozen = frozen; simDiag.gdt = gdt;
  const p = motion.getPos();
  combatCtx.state = s;
  combatCtx.px = p.x;
  combatCtx.py = p.y;
  combatCtx.yaw = actionCtx.yaw;
  combatCtx.noStart = actions.blocksAttackStart();
  if (blocked) combat.setHeld(false);
  combat.update(gdt, combatCtx);
  heroShots.update(gdt);
  procs.update(gdt * 1000, s);
  aiCtx.px = p.x;
  aiCtx.py = p.y;
  aiCtx.playerRadius = getConfig().movement.playerRadius;
  aiCtx.yaw = actionCtx.yaw; // EVO: o arquétipo B flanqueia pelas costas do herói
  // IA completa no FPS (modo padrão). Iso: só física (knockback), IA opcional como antes.
  aiCtx.think = fps;
  const r = tickEnemyAi(s, gdt, aiCtx);
  // Bloco 4: memória de quem ataca o herói (dragão / killStealGuard) + lock-on automático
  if (gdt > 0) {
    const mons = s.monstersAlive;
    const now = getAiClock();
    for (let i = 0; i < mons.length; i++) {
      const m = mons[i];
      if (m.alive && isAttackingPlayer(m)) {
        if (!lastThreatAt.has(m.uid) || now - lastThreatAt.get(m.uid) > 400) {
          if (getConfig().lockOn.mode === 'automatico' && validLockOn() == null && fps) setLock(m.uid, 'auto');
        }
        lastThreatAt.set(m.uid, now);
      }
    }
  }
  updateLockOn(s, dt, fps);
  // Regeneração (base combat.hpRegenPerSec = 0; passivas somam via modifiers)
  if (gdt > 0) {
    const regen = getStat(STATS.HP_REGEN, getConfig().combat.hpRegenPerSec);
    if (regen > 0 && s.player.hp < s.player.hpMax) {
      regenAcc += regen * gdt;
      if (regenAcc >= 1) {
        const whole = Math.floor(regenAcc);
        regenAcc -= whole;
        s.player.hp = Math.min(s.player.hpMax, s.player.hp + whole);
      }
    } else regenAcc = 0;
  }
  // gp3: Mini Dragão (relógio de jogo: congela com passivas/modal/hit-stop/evento)
  if (dragonActive()) {
    dragonCtx.state = s;
    dragonCtx.px = p.x;
    dragonCtx.py = p.y;
    dragonCtx.yaw = combatCtx.yaw;
    dragonCtx.aspect = renderer.fpsCam?.camera?.aspect || 1.6;
    dragon.update(gdt, dragonCtx);
  }
  dragonVfxScale = gdt > 0 ? debugTimeScale : 0;
  // gp3: regeneração de Nexa (base combat.nexaRegenPerSec × passivas)
  if (gdt > 0) {
    const nregen = getStat(STATS.NEXA_REGEN, getConfig().combat.nexaRegenPerSec);
    if (nregen > 0 && s.player.nexa < s.player.nexaMax) {
      nexaAcc += nregen * gdt;
      if (nexaAcc >= 1) {
        const whole = Math.floor(nexaAcc);
        nexaAcc -= whole;
        s.player.nexa = Math.min(s.player.nexaMax, s.player.nexa + whole);
        ui.refresh();
      }
    } else nexaAcc = 0;
  }
  // gp3: correção suave de mira do toque (nunca enquanto arrasta a câmera)
  if (aimNudge.ms > 0 && fps) {
    const step = Math.min(1, (dt * 1000) / aimNudge.ms);
    const d = aimNudge.rad * step;
    renderer.fpsCam?.addYaw?.(d);
    aimNudge.rad -= d;
    aimNudge.ms -= dt * 1000;
    if (aimNudge.ms <= 0) { aimNudge.ms = 0; aimNudge.rad = 0; }
  }
  if (r.bossPhase) sfxBossRoar();
  else if (r.bossTele) { if (r.bossTele === 'rugido') sfxBossRoar(); else sfxBossWarn(r.bossTele); }
  else if (r.prepares) { sfxWarn(); const nw = performance.now(); if (nw - lastGrowlAt > 1400 && Math.random() < 0.55) { lastGrowlAt = nw; sfxEnemyGrowl(); } }
  if (r.bossHit && r.bossHit !== 'rugido') sfxBossAttack(r.bossHit);
  if (r.whiffs) sfxWhiff();
  for (let i = 0; i < r.attacks.length; i++) onEnemyAttack(r.attacks[i]);
  pushButtonInfo(dt);
  if (s.campoMode && campo.isActive() && campo.getStateRef() === s) { campo.update(gdt * 1000, p); maybeSyncCampo(s); }
  if (s.brMode && arenaBr.getStateRef() === s) { arenaBr.update(gdt * 1000, p); maybeSyncCampo(s); brUi?.update(); checkBrEnd(s); }
  syncHeroLook(s);
  // retrato 3D novo (modelo pronto / estilo trocado) → redesenha o HUD uma vez
  { const pv = renderer.getHeroPortrait?.()?.version || 0; if (pv !== portraitSeenV) { portraitSeenV = pv; ui?.refresh(); } }
  checkArena(s);
  checkProgression(s);
}

/**
 * gp3: subiu de nível → evolução do dragão + fila de escolhas de passiva.
 * A tela abre sozinha assim que nada mais estiver na frente (modal/diálogo/evento).
 */
function checkProgression(s) {
  if (!s || !s.player) return;
  if (lastNivel == null) lastNivel = s.player.nivel;
  if (s.player.nivel !== lastNivel) {
    const up = s.player.nivel > lastNivel;
    lastNivel = s.player.nivel;
    if (up) {
      sfxLevelUp();
      dragon.checkEvolution(s);
      if (s.passives?.pending > 0) passiveUi.showNotice();
      ui.refresh();
    }
  }
  if (s.passives?.pending > 0 && !passiveUi.isOpen() && !busy && !isModalOpen() && !isDrawerOpen() && isGameVisible()) {
    openPassiveChoice(s);
  }
}

function openPassiveChoice(s) {
  const ps = ensurePassiveState(s);
  const cfg = getConfig().passives;
  const offer = ps.offer && ps.offer.every((id) => getPassive(id)) ? ps.offer : rollOffer(s, cfg.choices, { attempts: cfg.rerollAttempts });
  if (!offer.length) {
    // pool esgotado: não concede nada e segue o jogo
    ps.pending = 0;
    ps.offer = null;
    pushLog(s, 'Todas as passivas disponíveis já foram obtidas.', 'sys');
    ui.refresh();
    safeSave();
    return;
  }
  ps.offer = offer;
  motion.stopNow();
  mobile?.releaseAll?.();
  combat.setHeld(false);
  if (renderer.mode === 'fps') renderer.controls?.()?.exitLock?.();
  passiveUi.show(offer.map((id) => getPassive(id)), {
    level: s.player.nivel,
    // EVO: etiqueta BUILD + progresso da sinergia
    buildCount: (b) => getBuildSynergy().count?.[b] || 0,
    owned: (id) => (s.passives?.owned || []).includes(id),
    onPick: (id) => {
      const def = choosePassive(s, id);
      if (!def) return null;
      pushLog(s, `Passiva adquirida: ${def.nome} — ${def.descricao}`, 'sys');
      ui.refresh();
      safeSave();
      return def;
    },
    onClosed: () => { ui.refresh(); }
  });
}

/** Bloco 4: dano do dragão com killStealGuard — não finaliza quem o herói ainda não feriu
 *  (exceto se o inimigo estiver atacando/preparando golpe no herói, ou atacou há pouco). */
function dragonDamageProxy(mon, amount, o = {}) {
  if (!mon) return null;
  // Bloco 6: MODO DIVINO ×dano, marca do Caçador +dano
  let amt = Math.max(1, Math.round((Number(amount) || 0) * procs.dragonDamageMult(mon)));
  // Bloco 7: poder temporário FÚRIA DRACÔNICA (modificador DRAGON_DAMAGE; base 1 = sem efeito)
  amt = Math.max(1, Math.round(amt * getStat(STATS.DRAGON_DAMAGE, 1)));
  const dc = getConfig().dragon;
  if (dc.killStealGuard && mon.alive && !heroDamaged.has(mon.uid) && !threatNow(mon) && amt >= mon.hp) {
    amt = mon.hp - 1;
    if (amt <= 0) { dragonGuard.skipped++; return null; }
    dragonGuard.clamped++;
  }
  const res = damageMonsterFrom('dragon', mon, amt, {
    label: 'Mini Dragão', fromX: o.fromX, fromY: o.fromY, heavy: o.heavy, noSparks: true,
    knockbackScale: o.knockbackScale, noStun: o.noStun
  });
  if (res?.killed) procs.onKill(mon);
  else if (res) { const pc = getConfig().posture; if (pc) postureHit(mon, pc.dragonHit); }
  return res;
}

/**
 * EVO: POSTURA (stagger). Golpes enchem a barra; cheia → QUEBRA: atordoado, janela de dano bônus
 * (modificador DAMAGE abaixo), Nexa extra. Números em gameplay-config.posture.
 */
const evoStats = { hitStops: 0, lastHitStopMs: 0, breaks: 0, perfectDodges: 0, lastBreak: null, announcements: [], waveBanners: [] };
let lastWaveBannerAt = -1e9;
let testUidNext = 15000;
/** EVO: conjunto das passivas obtidas (cache por assinatura da lista; usado pelas assinaturas visuais). */
let ownedSetKey = '';
let ownedSetCache = new Set();
function ownedPassiveSet() {
  const o = state?.passives?.owned || [];
  const k = o.join(',');
  if (k !== ownedSetKey) { ownedSetKey = k; ownedSetCache = new Set(o); }
  return ownedSetCache;
}
/** Vizinho vivo mais próximo de um inimigo (arco em cadeia da Fagulha). */
function nearestOther(mon, maxD = 4.5) {
  let best = null, bd = maxD;
  for (const m of state?.monstersAlive || []) { if (!m.alive || m === mon || m.zone !== state.zoneId) continue; const d = Math.hypot(m.x - mon.x, m.y - mon.y); if (d < bd) { bd = d; best = m; } }
  return best ? { x: best.x + 0.5, y: best.y + 0.5 } : null;
}
function evoAnnounce(kind, text) {
  evoStats.announcements.push({ kind, text, at: Math.round(performance.now()) });
  if (evoStats.announcements.length > 30) evoStats.announcements.shift();
}
function postureHit(mon, amount) {
  if (!state || !mon || !mon.alive) return null;
  const amt = amount * getStat(STATS.POSTURE_DAMAGE, 1);
  const res = addPosture(state, mon, amt);
  if (res.broke) {
    const c = getConfig();
    evoStats.breaks++;
    evoStats.lastBreak = { uid: mon.uid, id: mon.id, at: Math.round(performance.now()) };
    hitStopUntil = Math.max(hitStopUntil, performance.now() + (c.feel?.hitStopBreakMs || 0));
    state.player.nexa = Math.min(state.player.nexaMax, state.player.nexa + (c.posture.breakNexa || 0));
    renderer.shake?.(0.5);
    sfxBreak();
    renderer.passiveSig?.('break', { x: mon.x + 0.5, y: mon.y + 0.5 });
    if (renderer.mode === 'fps') {
      const mp = getMonsterPos(mon);
      renderer.spawnFloatText?.('QUEBRA!', '#ffd34a', { size: 22, dy: 30 });
      renderer.spawnSparks?.(mp.x, mp.y, true);
    }
    pushLog(state, `${state._monsters[mon.id]?.name || 'Inimigo'}: POSTURA QUEBRADA — dano bônus!`, 'sys');
  }
  return res;
}
// Dano bônus em inimigo QUEBRADO (contexto do golpe traz o monstro)
addModifier(STATS.DAMAGE, (v, ctx) => (ctx && ctx.mon && isPostureBroken(ctx.mon)
  ? v * getStat(STATS.BREAK_DAMAGE, getConfig().posture?.breakDamageMult || 1) : v));

function onPlayerHit(result, mon, info) {
  const cfg = getConfig().combat;
  playerTarget.uid = mon.uid;
  playerTarget.at = getAiClock();
  heroDamaged.add(mon.uid);
  if (!mon.alive) { heroDamaged.delete(mon.uid); lastThreatAt.delete(mon.uid); }
  onMonsterHit(mon, info); // knockback / flash / interrupção do preparo
  hitStopUntil = performance.now() + (info.heavy ? Math.max(cfg.hitStopMs, getConfig().feel?.hitStopHeavyMs || 0) : cfg.hitStopMs);
  evoStats.hitStops++; evoStats.lastHitStopMs = Math.round(hitStopUntil - performance.now());
  { const pc = getConfig().posture; if (pc) postureHit(mon, info.heavy ? pc.finisherHit : pc.basicHit); }
  renderer.shake(cfg.hitShake);
  // EVO: som próprio por golpe do combo (1/2/3 sobem; 3º mais pesado) + crítico + abate
  sfxComboHit(info.comboIndex | 0, !!result.crit);
  renderer.passiveSig?.('hit', { x: info.x, y: info.y, crit: !!result.crit, near: result.crit ? nearestOther(mon) : null });
  if (result.crit) sfxCrit();
  if (result.killed) sfxEnemyDeath(mon.tier === 'elite' || mon.tier === 'mini_chefe' || !!mon.boss);
  if (result.killed && result.drops && result.drops.length) sfxLoot(result.drops.some((d) => ['raro', 'epico', 'lendario'].includes(itemRarity(state._items[d.item_id]))));
  procs.onHeroHit(mon, result);
  // ARSENAL: espada de família → faísca/anel na cor da família no ponto do golpe
  if (!info.ranged && weaponFamilyOf(state)) heroShots.burst(info.x, info.y, info.heavy ? 0.9 : 0.6, familyColor(state), 'spark', 260);
  if (renderer.mode === 'fps') {
    renderer.spawnSparks?.(info.x, info.y, info.heavy);
    heroDamageFx(mon, result, info);
    if (state?.brMode) renderer.hitMarker?.(result.killed ? 'kill' : result.crit ? 'crit' : 'hit'); // ARENA: marcador de acerto
  } else {
    spawnDamage(renderer.vfx, mon.x, mon.y, result.dmgOut, 'out');
    spawnImpact(renderer.vfx, mon.x, mon.y);
    renderer.setPlayerAnim('attack', 0.3);
    if (result.killed && result.drops) {
      for (const d of result.drops) {
        const it = state._items[d.item_id];
        spawnLootGlow(renderer.vfx, mon.x, mon.y, itemRarity(it), it?.name || d.item_id);
      }
    }
  }
  ui.refresh();
  if (!isArenaState(state)) maybeAuto0217();
}

/**
 * Dano de fonte NÃO-herói (companheiro/dragão, projétil, efeito) com o mesmo
 * feedback e as mesmas recompensas (XP/loot/quests via applyDamageToMonster).
 * @param {string} source ex.: 'companion'
 * @param {object} mon
 * @param {number} amount
 * @param {{ label?:string, fromX?:number, fromY?:number, heavy?:boolean }} opts
 */
const extHitInfo = { fromX: 0, fromY: 0, heavy: false, x: 0, y: 0, comboIndex: -1, knockbackScale: 1, noStun: false };
function damageMonsterFrom(source, mon, amount, opts = {}) {
  if (!state || !mon) return null;
  const res = applyDamageToMonster(state, mon, amount, { source, label: opts.label });
  if (!res) return null;
  if (res.killed) { heroDamaged.delete(mon.uid); lastThreatAt.delete(mon.uid); }
  const p = motion.getPos();
  const mp = getMonsterPos(mon);
  extHitInfo.fromX = Number.isFinite(opts.fromX) ? opts.fromX : p.x;
  extHitInfo.fromY = Number.isFinite(opts.fromY) ? opts.fromY : p.y;
  extHitInfo.heavy = !!opts.heavy;
  extHitInfo.x = mp.x;
  extHitInfo.y = mp.y;
  extHitInfo.knockbackScale = Number.isFinite(opts.knockbackScale) ? opts.knockbackScale : 1;
  extHitInfo.noStun = !!opts.noStun;
  onMonsterHit(mon, extHitInfo);
  if (!opts.noSparks) sfxHit(false);
  if (res && res.killed) sfxEnemyDeath(mon.tier === 'elite' || mon.tier === 'mini_chefe' || !!mon.boss);
  if (renderer.mode === 'fps') {
    if (!opts.noSparks) renderer.spawnSparks?.(mp.x, mp.y, false);
    renderer.spawnFloatDamage?.(mon.x, mon.y, res.dmgOut, 'out', mp.x, mp.y);
  } else {
    spawnDamage(renderer.vfx, mon.x, mon.y, res.dmgOut, 'out');
  }
  ui.refresh();
  if (!isArenaState(state)) maybeAuto0217();
  return res;
}

/**
 * Bloco 4: dano de ESPECIAL num monstro — mesmo caminho do golpe (applyPlayerHit, agora como
 * habilidade: Núcleo Divino +15%) → applyDamageToMonster (XP/loot/quests). Knockback/atordoamento
 * próprios do especial.
 */
const spHitInfo = { fromX: 0, fromY: 0, heavy: false, x: 0, y: 0, comboIndex: -1, knockbackScale: 1, noStun: false, forceStunMs: 0 };
function hitSpecial(s, mon, id, info) {
  if (!s || !mon) return null;
  const res = applyPlayerHit(s, mon, { dmgMult: info.dmgMult, ability: true });
  if (!res) return null;
  playerTarget.uid = mon.uid;
  playerTarget.at = getAiClock();
  heroDamaged.add(mon.uid);
  if (!mon.alive) { heroDamaged.delete(mon.uid); lastThreatAt.delete(mon.uid); }
  spHitInfo.fromX = info.fromX;
  spHitInfo.fromY = info.fromY;
  spHitInfo.heavy = !!info.heavy;
  spHitInfo.x = info.x;
  spHitInfo.y = info.y;
  spHitInfo.knockbackScale = info.knockbackScale ?? 1;
  spHitInfo.noStun = !info.stunMs;
  spHitInfo.forceStunMs = info.stunMs || 0;
  onMonsterHit(mon, spHitInfo);
  { const pc = getConfig().posture; if (pc) postureHit(mon, pc.specials?.[id] || pc.basicHit); }
  const cfg = getConfig().combat;
  hitStopUntil = Math.max(hitStopUntil, performance.now() + cfg.hitStopMs * (info.heavy ? 1.4 : 1));
  sfxHit(!!info.heavy);
  renderer.passiveSig?.('hit', { x: mon.x + 0.5, y: mon.y + 0.5, crit: !!res?.crit, near: res?.crit ? nearestOther(mon) : null });
  if (res && res.killed) sfxEnemyDeath(mon.tier === 'elite' || mon.tier === 'mini_chefe' || !!mon.boss);
  procs.onHeroHit(mon, res);
  if (renderer.mode === 'fps') {
    renderer.spawnSparks?.(info.x, info.y, true);
    heroDamageFx(mon, res, info);
  } else {
    spawnDamage(renderer.vfx, mon.x, mon.y, res.dmgOut, 'out');
    spawnImpact(renderer.vfx, mon.x, mon.y);
  }
  ui.refresh();
  if (!isArenaState(state)) maybeAuto0217();
  return res;
}

/** Número de dano do herói; com Mira Neural o crítico vira número grande dourado + clarão. */
function heroDamageFx(mon, res, info) {
  const mira = res.crit && (state?.passives?.owned || []).includes('mira_neural') && getConfig().passiveProcs.enabled;
  renderer.spawnFloatDamage?.(mon.x, mon.y, res.dmgOut, mira ? 'crit' : 'out', info.x, info.y);
  if (mira) renderer.passiveFx?.('crit', { x: info.x, y: info.y });
}

/** Bloco 4: feedback (som/VFX/toast) dos eventos do árbitro de ações. */
const SPECIAL_SFX = { golpe_poderoso: 'strike', ataque_area: 'spin', dash: 'dash', suprema: 'suprema' };
let deniedToastAt = 0;
function onActionEvent(type, d) {
  const fps = renderer.mode === 'fps';
  if (type === 'dodge') {
    sfxDodge();
    renderer.passiveSig?.('dodge', {});
    if (fps) renderer.actionVfx?.('dodge', d);
    procs.onDodge();
  } else if (type === 'dash_strike') {
    // Bloco 6: ESQUIVA no combo virou INVESTIDA (antigo botão DASH)
    if (fps) renderer.spawnFloatText?.('INVESTIDA', '#5fb4ff', { size: 16, dy: -10 });
    procs.onDodge();
  } else if (type === 'special') {
    procs.onSpecial(d.id);
    { const pp = motion.getPos(); const near = (state?.monstersAlive || []).filter((m) => m.alive && m.zone === state.zoneId && Math.hypot(m.x + 0.5 - pp.x, m.y + 0.5 - pp.y) < 5).map((m) => ({ x: m.x + 0.5, y: m.y + 0.5 })); renderer.passiveSig?.('special', { id: d.id, near }); }
    const c = getConfig().specials[d.id];
    if (d.id === 'golpe_poderoso' || d.id === 'suprema') sfxCharge(c.windupMs);
    if (fps) renderer.actionVfx?.('special_start', { id: d.id });
    mobile?.flashButton?.(d.id, 'ok');
  } else if (type === 'special_end') {
    if (fps) renderer.actionVfx?.('special_end', { id: d.id, why: d.why });
  } else if (type === 'special_active') {
    sfxSpecial(SPECIAL_SFX[d.id]);
    const p = motion.getPos();
    const c = getConfig().specials[d.id];
    const wsp = weaponClassOf(state) !== 'espada' ? DATA?.arsenal?.armas?.[weaponClassOf(state)]?.especiais?.[d.id] : null;
    if (wsp) { if (fps) { renderer.spawnFloatText?.(wsp.nome, '#' + familyColor(state).toString(16).padStart(6, '0'), { size: 16, dy: -12 }); renderer.actionVfx?.('special_end', { id: d.id }); } } // VIL: arco/cajado também solta a coluna da suprema (antes ficava presa no herói)
    else if (fps) renderer.actionVfx?.('special_impact', { id: d.id, x: p.x, y: p.y, radius: c.radius || c.range || 1.5, yaw: actionCtx.yaw });
    renderer.shake(d.id === 'suprema' ? 9 : d.id === 'golpe_poderoso' ? 5 : 3);
  } else if (type === 'denied') {
    if (d.cmd === 'attack' || d.cmd === 'dodge') return;
    sfxDenied();
    mobile?.flashButton?.(d.cmd, 'denied');
    if (d.why === 'nexa') {
      const now = performance.now();
      if (now - deniedToastAt > getConfig().buttons.deniedToastMs) {
        deniedToastAt = now;
        ui.showToast('NEXA INSUFICIENTE');
      }
    }
  } else if (type === 'defend') {
    if (fps) renderer.actionVfx?.('guard', {});
  }
}

function onEnemyAttack(result) {
  applyAiVfx(result);
  ui.refresh();
}

/** Comando de ATAQUE (botão, Espaço, clique com mouse travado, API). */
function attackPress() {
  if (!state || busy || !isGameVisible() || isInputBlocked()) return null;
  unlockAudio();
  const r = actions.pressAttack();
  if (r === 'started' || r === 'buffered') combat.setHeld(true);
  return r;
}
function attackRelease() {
  combat.setHeld(false);
}
/** Bloco 4: comandos das novas ações (botões, teclas e API usam o mesmo caminho). */
function canCommand() {
  return !!state && !busy && isGameVisible() && !isInputBlocked();
}
function dodgePress() {
  if (!canCommand()) return null;
  unlockAudio();
  return actions.pressDodge();
}
function defendSet(v) {
  if (!v) { actions.setDefend(false); return 'released'; }
  if (!canCommand()) return null;
  unlockAudio();
  combat.setHeld(false);
  actions.setDefend(true);
  return 'held';
}
function specialPress(id) {
  if (!canCommand()) return null;
  unlockAudio();
  return actions.pressSpecial(id);
}

function isGameVisible() {
  return !document.getElementById('game-screen')?.classList.contains('hidden');
}
let modalEl = null;
function isModalOpen() {
  modalEl = modalEl || document.getElementById('modal-overlay');
  return !!modalEl && !modalEl.classList.contains('hidden');
}
/** Movimento bloqueado: modal/diálogo aberto ou drawer ☰ aberto. */
function isInputBlocked() {
  return isModalOpen() || isDrawerOpen() || passiveUi.isOpen() || !!settingsMenu?.isEditorOpen() || !!brUi?.isPanelOpen();
}

/**
 * gp3: TOQUE no analógico direito = 1 ataque básico (mesmo caminho do botão:
 * buffer + filtro de duplicados). Alvo: lock-on (se houver) senão o inimigo
 * mais perto da mira dentro do alcance; gira a câmera um pouco, suave.
 */
function tapAttack() {
  if (!state || busy || !isGameVisible() || isInputBlocked()) return null;
  const target = renderer.mode === 'fps' ? pickTapTarget() : null;
  const r = attackPress();
  attackRelease();
  if (target && r && r !== 'dup') startAimNudge(target.diff);
  lastTap.result = r;
  lastTap.target = target ? target.uid : null;
  lastTap.at = performance.now();
  return { command: r, target: target ? target.uid : null };
}
const lastTap = { result: null, target: null, at: 0 };
function pickTapTarget() {
  const rs = getConfig().rightStick;
  const cc = getConfig().combat;
  const p = motion.getPos();
  const yaw = renderer.getYaw?.() ?? 0;
  const zone = zoneOf(state);
  const ranged = !!getEquippedStats(state).ranged;
  const range = (ranged ? cc.rangedRange : cc.attackRange) + getConfig().enemyAi.bodyRadius + rs.autoTargetRangeExtra;
  const lock = validLockOn();
  if (lock != null) {
    const m = state.monstersAlive.find((x) => x.uid === lock);
    const mp = getMonsterPos(m);
    return { uid: m.uid, diff: wrapAngle(Math.atan2(mp.x - p.x, -(mp.y - p.y)) - yaw) };
  }
  if (!rs.autoTarget) return null;
  let best = null;
  for (const m of state.monstersAlive) {
    if (!m.alive || m.zone !== state.zoneId) continue;
    const mp = getMonsterPos(m);
    const mx = mp.x;
    const my = mp.y;
    const d = Math.hypot(mx - p.x, my - p.y);
    if (d > range) continue;
    const diff = wrapAngle(Math.atan2(mx - p.x, -(my - p.y)) - yaw);
    if (Math.abs(diff) > rs.autoTargetMaxAngleDeg * DEG) continue;
    if (!hasLineOfSight(zone, p.x, p.y, mx, my)) continue;
    if (!best || Math.abs(diff) < Math.abs(best.diff)) best = { uid: m.uid, diff };
  }
  return best;
}
function startAimNudge(diff) {
  const rs = getConfig().rightStick;
  const maxDeg = rs.aimNudgeMaxDeg[rs.aimAssist] ?? 0;
  if (maxDeg <= 0 || !Number.isFinite(diff)) return;
  const lim = maxDeg * DEG;
  aimNudge.rad = Math.max(-lim, Math.min(lim, diff));
  aimNudge.ms = Math.max(1, rs.aimNudgeMs);
}
function cancelAimNudge() {
  aimNudge.rad = 0;
  aimNudge.ms = 0;
}

// ——— Bloco 4: LOCK-ON (opcional, nunca forçado) ———
const lockSt = { since: 0, losLostAt: 0, reason: '', switches: 0, releases: [] };
function setLock(uid, reason = 'manual') {
  lockOnTarget = uid ?? null;
  lockSt.since = performance.now();
  lockSt.losLostAt = 0;
  lockSt.reason = reason;
  mobile?.setLockActive?.(lockOnTarget != null);
  return lockOnTarget;
}
function releaseLock(why) {
  if (lockOnTarget == null) return;
  lockSt.releases.push(why);
  if (lockSt.releases.length > 20) lockSt.releases.shift();
  setLock(null, why);
}
/** Candidatos ordenados pela distância angular até a mira (dentro do alcance, com visão). */
function lockCandidates() {
  if (!state) return [];
  const c = getConfig().lockOn;
  const p = motion.getPos();
  const yaw = renderer.getYaw?.() ?? 0;
  const zone = zoneOf(state);
  const out = [];
  for (const m of state.monstersAlive) {
    if (!m.alive || m.zone !== state.zoneId) continue;
    const mp = getMonsterPos(m);
    const d = Math.hypot(mp.x - p.x, mp.y - p.y);
    if (d > c.range) continue;
    const diff = wrapAngle(Math.atan2(mp.x - p.x, -(mp.y - p.y)) - yaw);
    if (Math.abs(diff) > c.maxAngleDeg * DEG && d > 1.6) continue;
    if (!hasLineOfSight(zone, p.x, p.y, mp.x, mp.y)) continue;
    out.push({ uid: m.uid, diff, d, score: Math.abs(diff) + d * 0.04 });
  }
  out.sort((a, b) => a.score - b.score);
  return out;
}
/** Tab / deslize (Bloco 6: sem botão ALVO): sem trava → trava o mais perto da mira; com trava → próximo; sem outro → solta. */
function lockToggle(dir = 0) {
  if (!state || renderer.mode !== 'fps') return null;
  const cur = validLockOn();
  const cands = lockCandidates();
  if (cur == null) {
    if (!cands.length) { ui.showToast('Nenhum alvo no alcance'); return null; }
    return setLock(cands[0].uid, 'manual');
  }
  const others = cands.filter((x) => x.uid !== cur);
  if (!others.length) { releaseLock('botao'); return null; }
  let pick = others[0];
  if (dir !== 0) {
    const side = others.filter((x) => Math.sign(x.diff) === Math.sign(dir));
    if (side.length) pick = side.sort((a, b) => Math.abs(a.diff) - Math.abs(b.diff))[0];
  } else {
    // "próximo mais perto" do herói entre os outros
    pick = others.slice().sort((a, b) => a.d - b.d)[0];
  }
  lockSt.switches++;
  return setLock(pick.uid, 'troca');
}
/**
 * Bloco 6: TOCAR PARA TRAVAR. (clientX, clientY) → inimigo projetado mais perto do toque dentro de
 * lockOn.tapRadiusPx (corpo inteiro: pés→cabeça). Inimigo novo = trava; o já travado = solta;
 * toque no vazio = solta. Retorna { action, uid, distPx }.
 */
const tapLockSt = { last: null, count: 0 };
function tapLockAt(clientX, clientY) {
  const c = getConfig().lockOn;
  const out = { action: 'none', uid: null, distPx: null };
  if (!state || renderer.mode !== 'fps' || !c.tapLock || !canCommand()) { tapLockSt.last = out; return out; }
  const canvas = document.getElementById('game-canvas');
  const r = canvas.getBoundingClientRect();
  const px = clientX - r.left;
  const py = clientY - r.top;
  const p = motion.getPos();
  let best = null;
  for (const m of state.monstersAlive) {
    if (!m.alive || m.zone !== state.zoneId) continue;
    const mp = getMonsterPos(m);
    if (Math.hypot(mp.x - p.x, mp.y - p.y) > c.releaseRange) continue;
    // Bloco 7: o GIGANTE VERDE é enorme — segmento pés→peito maior e alvo mais largo
    const bossTop = m.boss ? getConfig().arenaBoss.visualHeight * 0.72 : 1.7;
    const a = renderer.projectMonster?.(m.uid, 0.2);
    const b = renderer.projectMonster?.(m.uid, bossTop);
    if (!a || !b) continue;
    // distância do toque ao segmento pés→cabeça na tela
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const L2 = vx * vx + vy * vy || 1;
    const t = Math.max(0, Math.min(1, ((px - a.x) * vx + (py - a.y) * vy) / L2));
    const d = Math.hypot(px - (a.x + vx * t), py - (a.y + vy * t));
    const rad = m.boss ? c.tapRadiusPx * 2.2 : c.tapRadiusPx;
    if (d <= rad && (!best || d < best.d)) best = { uid: m.uid, d };
  }
  const cur = validLockOn();
  if (best && best.uid !== cur) {
    setLock(best.uid, 'toque');
    Object.assign(out, { action: 'lock', uid: best.uid, distPx: Math.round(best.d) });
  } else if (cur != null) {
    releaseLock(best ? 'toque_mesmo' : 'toque_vazio');
    Object.assign(out, { action: 'release', uid: cur, distPx: best ? Math.round(best.d) : null });
  }
  tapLockSt.last = out;
  tapLockSt.count++;
  return out;
}
function updateLockOn(s, dt, fps) {
  if (lockOnTarget == null) return;
  const m = s.monstersAlive.find((x) => x.uid === lockOnTarget);
  if (!m || !m.alive || m.zone !== s.zoneId) { releaseLock('morto'); return; }
  if (!fps) return;
  const c = getConfig().lockOn;
  const p = motion.getPos();
  const mp = getMonsterPos(m);
  const d = Math.hypot(mp.x - p.x, mp.y - p.y);
  if (d > c.releaseRange) { releaseLock('fora_de_alcance'); return; }
  const now = performance.now();
  if (!hasLineOfSight(zoneOf(s), p.x, p.y, mp.x, mp.y)) {
    if (!lockSt.losLostAt) lockSt.losLostAt = now;
    else if (now - lockSt.losLostAt > c.lostLosMs) { releaseLock('sem_visao'); return; }
  } else lockSt.losLostAt = 0;
  // câmera segue suave (o jogador ainda pode girar; espera nudgeHoldMs após um giro manual)
  const cam = renderer.fpsCam;
  if (!cam || c.trackStrength <= 0 || dt <= 0) return;
  if (now - (cam.getLastLookAt?.() ?? -1e9) < c.nudgeHoldMs) return;
  const want = Math.atan2(mp.x - p.x, -(mp.y - p.y));
  const cur = cam.getTargetYaw ? cam.getTargetYaw() : (renderer.getYaw?.() ?? 0);
  const diff = wrapAngle(want - cur);
  if (Math.abs(diff) < 0.004) return;
  cam.addYaw(diff * (1 - Math.exp(-c.trackStrength * dt)));
}

/** Bloco 4: estado dos botões (recarga/Nexa) → controles móveis (~10 Hz). */
let btnInfoAcc = 0;
function pushButtonInfo(dt) {
  btnInfoAcc += dt;
  if (btnInfoAcc < 0.09 || !mobile?.updateActionButtons || !state) return;
  btnInfoAcc = 0;
  mobile.updateActionButtons(actions.getButtonsInfo(state));
  if (isGameVisible()) passiveHud.update(procs.getBuffs(), { firstPerson: renderer.mode === 'fps' && renderer.viewMode === 'first' });
}

function preloadModelList() {
  const q = (k) => { try { return new URLSearchParams(location.search).get(k); } catch { return null; } };
  if (useIso || q('models') === '0') return [];
  let soft = false;
  try { const c = document.createElement('canvas'); const gl = c.getContext('webgl2') || c.getContext('webgl'); soft = gl ? !!isSoftwareGL(gl) : false; gl?.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* sem GL */ }
  const tierName = detectQualityTier(detectTouchMode(), { softwareGL: soft });
  const tier = getConfig().graphics.tiers[tierName] || {};
  if (tier.models === false && q('models') !== '1') return [];
  const list = ['hero-knight', 'hero-props'];
  if ((tier.enemyModels !== false || q('enemyModels') === '1') && q('enemyModels') !== '0') {
    // VIL: vilões novos (Quaternius CC0) por arquétipo; KayKit só p/ patrulha/base (ou tudo com ?vil=0)
    if (q('vil') === '0') list.push('vilao-warrior', 'vilao-rogue', 'vilao-mage', 'vilao-minion');
    else list.push('mon-esqueleto', 'mon-demonio', 'mon-caveira', 'mon-lobo', 'mon-robo', 'mon-drone', 'mon-yeti', 'mon-zumbi', 'mon-demonio-azul', 'mon-orc', 'vilao-minion');
  }
  if ((tier.dragonModels !== false || q('dragonModels') === '1') && q('dragonModels') !== '0') list.push('boss-dragon', 'mini-dragon');
  return list;
}

async function boot() {
  preloadAssets({ timeoutMs: 6000, only: useIso ? null : (id) => id.startsWith('player-') });
  try {
    DATA = await loadAllData();
    // M3D: baixa/decodifica os GLB já na tela de título (prontos antes de entrar → sem troca no meio do combate)
    // só os GLB que o preset vai usar (LOW: nenhum; MEDIUM: herói; HIGH: todos) — decodificar GLB que não
    // aparece custava CPU justo na entrada do jogo (1º gesto perdia quadros)
    import('./fps/model-lib.js?v=20261003m10c').then((m) => { for (const n of preloadModelList()) m.loadModel(n); })
      .catch(() => {});
  } catch (e) {
    document.body.innerHTML = `<div class="screen"><p style="color:#e85d4c">Erro ao carregar data/: ${e.message}</p>
      <p style="color:#7a8899;margin-top:1rem">Sirva a partir de /workspace/nexara (raiz) para ../data funcionar.</p></div>`;
    throw e;
  }
  bindRenderer(renderer);
  bindArsenalConfig(DATA);
  registerPassivesFromData(DATA.passives);
  ui = createUI(
    () => state,
    (s) => { state = s; },
    {
      onDialogClosed: async (result) => {
        if (result?.trigger0217 && !isArenaState(state)) {
          busy = true;
          await maybeTrigger0217(state, ui);
          busy = false;
          safeSave();
        }
      },
      onImport: (saved) => {
        if (isArenaState(state)) {
          ui.showToast('Saia da Arena antes de importar save.');
          return;
        }
        exitAllRuns();
        state = loadSaved(saved);
        showGame();
        ui.refresh();
      }
    }
  );
  mcbUi = createMcbUi({
    ui,
    getState: () => state || resolvePermanent().state,
    mirrors: () => {
      const s = state || resolvePermanent().state;
      if (!s) return [];
      if (isArenaState(s) && !isRunPersist(s)) { const perm = resolvePermanent(); return perm.state ? [perm.state, s] : [s]; } // Arena: o saldo de referência é o SALVO (bots de treino não contam)
      return [s];
    },
    commit: (reason) => {
      const s = state || resolvePermanent().state;
      if (!s) return;
      if (isRunPersist(s)) syncCampoProgress(s, 'arsenal-' + reason);
      else if (isArenaState(s)) { const perm = resolvePermanent(); if (perm.state) try { perm.persist(perm.state); } catch {} }
      else if (s === state) safeSave();
      else { const perm = resolvePermanent(); try { perm.persist(s); } catch {} }
    },
    onEquipChange: () => { ui?.refresh?.(); },
    // popups de MCB não cobrem menus abertos (modal/drawer/cartas/editor) — ficam na fila
    isMenuOpen: () => isModalOpen() || isDrawerOpen() || passiveUi.isOpen() || !!settingsMenu?.isEditorOpen()
  });
  // VESTIÁRIO: mesmo estado/espelhos/gravação do Arsenal; equipar = mcbUi.act (mesmo caminho)
  vestiario = createVestiario({
    ui,
    getState: () => state || resolvePermanent().state,
    mirrors: () => {
      const s = state || resolvePermanent().state;
      if (!s) return [];
      if (isArenaState(s) && !isRunPersist(s)) { const perm = resolvePermanent(); return perm.state ? [perm.state, s] : [s]; }
      return [s];
    },
    commit: (reason) => {
      const s = state || resolvePermanent().state;
      if (!s) return;
      if (isRunPersist(s)) syncCampoProgress(s, 'vest-' + reason);
      else if (isArenaState(s)) { const perm = resolvePermanent(); if (perm.state) try { perm.persist(perm.state); } catch {} }
      else if (s === state) safeSave();
      else { const perm = resolvePermanent(); try { perm.persist(s); } catch {} }
    },
    act: (kind, id, slot) => mcbUi.act(kind, id, slot),
    openArsenal: () => mcbUi.open(),
    onLook: () => { ui?.refresh?.(); if (state) portraitSnap(heroStyleOf(state).id, state.player.heroCustom || {}); }
  });
  // ARENA PRINCIPAL: HUD/minimapa/bolsa/mercado negro/resumo
  brUi = createArenaBrUi({
    getState: () => (state?.brMode ? state : brTargetState()),
    getView: () => arenaBr.view(),
    getYaw: () => renderer.getYaw?.() ?? 0,
    getPos: () => motion.getPos(),
    equip: (id) => brEquip(id),
    sell: (id) => brSell(id),
    openArsenal: () => mcbUi.open(),
    toast: (t) => ui.showToast(t),
    onPopupAction: (a, cur) => {
      if (a === 'equip') return brEquip(cur.uid);
      if (a === 'sell') return brSell(cur.uid);
      return { ok: true, msg: 'Guardado na bolsa.' };
    }
  });
  {
    const prof = getLocalProfile();
    const pl = document.getElementById('profile-line');
    if (pl) pl.textContent = `Perfil local · ${prof.id.slice(0, 16)}… (salvo neste navegador)`;
  }
  // SAVE periódico (mundo) — além dos saves por evento
  setInterval(() => { if (state && !isArenaState(state) && isGameVisible()) safeSave(); else if (state?.campoMode && campo.isActive()) syncCampoProgress(state, 'periodic'); else if (state?.brMode && arenaBr.isActive()) syncCampoProgress(state, 'periodic'); }, 30000);
  setupMenus();
  // Bloco 6b: TELA INTEIRA — ⛶ no HUD, opção no menu inicial e automática no 1º toque em JOGAR/Continuar/Arena
  fullscreenUi = createFullscreenUi({ toast: (m, ms) => ui.showToast(m, ms) });
  fullscreenUi.bind(document.getElementById('btn-fullscreen'));
  fullscreenUi.bind(document.getElementById('btn-fullscreen-menu'), { text: true });
  fullscreenUi.bindAuto(['btn-start', 'btn-continuar', 'btn-arena']);
  document.getElementById('btn-continuar').disabled = !hasSave();

  motion.bindKeyboard(() => !!state && !busy && isGameVisible() && !isInputBlocked());

  mobile = createMobileControls({
    getState: () => state,
    getBusy: () => busy,
    /** Joystick → movementInput (zero imediato ao soltar). */
    onStick: (x, y, active) => {
      if (active) motion.setStick(x, y);
      else motion.clearStick();
    },
    onLookDelta: (dx, dy) => {
      if (renderer.mode !== 'fps') return;
      const k = getConfig().rightStick.sensitivity;
      renderer.applyTouchLook?.(dx * k, dy * k);
    },
    /** gp3: gesto virou ARRASTO (câmera) → cancela correção de mira em curso. */
    onLookDragStart: () => cancelAimNudge(),
    /** gp3: TOQUE rápido no analógico direito = ataque. */
    onLookTap: () => tapAttack(),
    /** gp3: dedo começou no ATAQUE e arrastou → câmera; cancela o golpe se ainda no preparo. */
    onAttackDragCancel: () => {
      cancelAimNudge();
      if (combat.getView().phase === 'STARTUP') combat.cancel();
      combat.setHeld(false);
    },
    onAttackPress: () => attackPress(),
    onAttackRelease: () => attackRelease(),
    // Bloco 4: ESQUIVA / DEFESA (segurar) / ESPECIAIS / LOCK-ON
    onDodge: () => dodgePress(),
    onDefend: (v) => defendSet(v),
    onSpecial: (id) => specialPress(id),
    // Bloco 6: sem botão ALVO — tocar no inimigo trava; nele de novo ou no vazio solta
    onWorldTap: (x, y) => tapLockAt(x, y),
    onLookSwipe: (dir) => { if (validLockOn() != null) lockToggle(dir); },
    onInteract: (result) => {
      if (renderer.mode === 'fps') renderer.setPlayerAnim?.('interact', 0.35);
      if (result) ui.showDialog(result);
      ui.refresh();
    },
    onToast: (msg) => ui.showToast(msg)
  });

  const artInfo = await assetsReady;
  if (useIso && (artInfo?.timedOut || (artInfo && artInfo.ok < artInfo.total))) {
    ui.showToast(`Sprites: ${spriteCount()}/${artInfo?.total ?? '?'} (fallback procedural ativo)`);
  }

  window.__NEXARA__ = {
    getState: () => state,
    /** ARSENAL MCB (testes/diagnóstico): carteira, compra/equipamento pelo MESMO caminho da tela, recompensas. */
    /** ARENA PRINCIPAL (testes/diagnóstico) */
    br: {
      enter: () => enterArenaBr(),
      view: () => arenaBr.view(),
      stats: () => arenaBr.stats(),
      summary: () => arenaBr.summary(),
      ui: () => brUi.stats(),
      lod: () => getAiLodStats(),
      items: () => brItemStats(),
      gfx: () => renderer.getGraphics?.()?.br || null,
      bag: () => { const s = brTargetState(); return s ? { n: bagCount(s), cap: bagCap(s), list: bagEntries(s).map((e) => ({ id: e.item_id, qty: e.qty, name: s._items[e.item_id]?.name, rarity: s._items[e.item_id]?.rarity || null })) } : null; },
      addLoot: (loot) => { const s = state?.brMode ? state : null; if (!s || !navigator.webdriver) return null; const r = addLootToBag([s], loot); if (r.ok) { arenaBr.recordItem(r.def); syncCampoProgress(s, 'test-loot'); } return { ok: r.ok, reason: r.reason, uid: r.uid || null, name: r.def?.name || null }; },
      pickup: (loot) => (state?.brMode && navigator.webdriver ? brPickup({ loot }) : null),
      sell: (id) => brSell(id),
      equip: (id) => brEquip(id),
      openBag: () => brUi.openBag(),
      openMarket: () => brUi.openMarket(),
      closePanel: () => brUi.closePanel(),
      bigMap: (on) => brUi.toggleBigMap(on),
      debug: navigator.webdriver ? arenaBr.debug : null,
      finish: (kind) => (navigator.webdriver ? arenaBr.finish(kind || 'extraido', {}) : null),
      teleport: (x, y) => { if (!navigator.webdriver || !state?.brMode) return false; state.player.x = x; state.player.y = y; motion.stopNow(); motion.snapToTile(state); return true; },
      /** M10: coordenada do mapa de PROJETO (100×76) → tile andável mais próximo no mapa escalado */
      at: (dx, dy) => {
        const m = (state?._data || DATA)?.zones?.zones?.find((z) => z.brMap)?.brMap; const S = DATA.arena_br?._escala || 1; if (!m) return null;
        const tx = Math.min(m.W - 2, Math.max(1, Math.round(dx * S + (S - 1) / 2))), ty = Math.min(m.H - 2, Math.max(1, Math.round(dy * S + (S - 1) / 2)));
        for (let r = 0; r < 30; r++) for (let yy = ty - r; yy <= ty + r; yy++) for (let xx = tx - r; xx <= tx + r; xx++) {
          if (Math.max(Math.abs(xx - tx), Math.abs(yy - ty)) !== r || xx < 0 || yy < 0 || xx >= m.W || yy >= m.H) continue;
          if (m.reachable[xx + yy * m.W]) return { x: xx, y: yy };
        }
        return { x: tx, y: ty };
      },
      teleportD: (dx, dy) => { const p = window.__NEXARA__?.br?.at(dx, dy); return p ? window.__NEXARA__.br.teleport(p.x, p.y) : false; },
      escala: () => DATA.arena_br?._escala || 1,
      bossHud: () => ({ ...bossHudView }),
      hitMarkers: () => renderer.getHitMarkerStats?.() || null,
      actionVfx: () => renderer.getActionVfx?.() || null,
      beamsNear: (r) => renderer.getBrBeamsNear?.(r) || null,
      music: () => music.stats(),
      config: () => DATA.arena_br
    },
    /** VESTIÁRIO (testes/debug) */
    vest: {
      open: (tab) => vestiario.open(tab),
      close: () => vestiario.close(),
      isOpen: () => vestiario.isOpen(),
      info: () => vestiario.info(),
      equip: (id) => vestiario.equip(id),
      unequip: (slot) => vestiario.unequip(slot),
      selectSlot: (k) => vestiario.selectSlot(k),
      selectItem: (id) => vestiario.selectItem(id),
      hoverItem: (id) => vestiario.hoverItem(id),
      tab: (t) => vestiario.tab(t),
      saveLoadout: (i, n) => vestiario.saveLoadout(i, n),
      applyLoadout: (i) => vestiario.applyLoadout(i),
      sheet: (eq) => vestiario.statSheet(eq),
      setYaw: (r) => vestiario.preview()?.setYaw(r),
      front: () => vestiario.preview()?.front(),
      zoom: (d) => vestiario.preview()?.zoom(d)
    },
    mcb: {
      balance: () => Math.floor(state?.player?.mcb || 0),
      permanent: () => { const p = resolvePermanent().state; return p ? { mcb: p.player.mcb, mcbTotal: p.player.mcbTotal, owned: (p.player.arsenal?.owned || []).slice(), equipment: { ...p.equipment } } : null; },
      owned: () => (state?.player?.arsenal?.owned || []).slice(),
      stats: () => mcbStats(),
      runs: () => JSON.parse(JSON.stringify(mcbRunLog)),
      pops: () => mcbUi.popLog(),
      lastMessage: () => mcbUi.lastMessage(),
      rewardFor: (monId) => rewardFor(DATA.monsters.monsters.find((m) => m.id === monId)),
      buy: (id) => mcbUi.act('buy', id),
      equip: (id) => mcbUi.act('equip', id),
      unequip: (slot) => mcbUi.act('unequip', null, slot),
      open: (tab) => mcbUi.open(tab),
      price: (id) => { const s = state || resolvePermanent().state; const it = s?._items?.[id]; return it ? { price: priceOf(it), base: basePriceOf(it), testMode: isTestPricing() } : null; },
      totals: () => { if (state) { refreshEquipment(state); } return getEquipTotals(); },
      walletCheck: () => lastWalletCheck,
      shots: () => heroShots.stats(),
      liveShots: () => heroShots.live(),
      areas: () => weaponAreaLog.slice(),
      weaponClass: () => weaponClassOf(state),
      /** teste: 1 golpe do herói pela rota real de dano (applyPlayerHit, dmgMult 1) → dano causado */
      heroHitForTest: (uid) => { const m = state?.monstersAlive.find((q) => q.uid === uid); if (!m) return null; const r = applyPlayerHit(state, m, { dmgMult: 1 }); return r ? r.dmgOut : null; },
      profile: () => getLocalProfile(),
      auth: () => authProviders.map((p) => ({ id: p.id, available: p.available, label: p.label })),
      /** só testes: credita MCB direto (simula ganhos para testar compra). */
      testGrant: () => ({ cfg: testGrantConfig(), last: lastGrant, run: () => { grantChecked = ''; return maybeTestGrant(); } }),
      grantForTest: (n) => { if (!state?.player || !navigator.webdriver) return 0; ensureWallet(state); state.player.mcb += n; state.player.mcbTotal += n; if (isRunPersist(state)) syncCampoProgress(state, 'test'); else safeSave(); return state.player.mcb; }
    },
    tileToScreen: (x, y) => renderer.tileToScreen(x, y),
    screenToTile: (x, y) => renderer.screenToTile(x, y),
    renderer,
    mode: () => (renderer.mode === 'fps' ? 'fps' : 'iso'),
    /** Bloco V: 'third' (padrão) | 'first' (?fp=1) | 'iso'. */
    cameraMode: () => (renderer.mode === 'fps' ? renderer.viewMode : 'iso'),
    hero: () => renderer.getHero?.() ?? null,
    models: () => renderer.getModelInfo?.() ?? null,
    camArm: () => renderer.getCamArm?.() ?? null,
    graphics: () => renderer.getGraphics?.() ?? null,
    debugThree: () => renderer.debugThree?.() ?? null,
    spriteCount: () => spriteCount(),
    isArena: () => isArenaState(state),
    startArena: () => enterArena(),
    exitArena: () => exitArenaToMenu(),
    /** Bloco 7: tentativa da Arena / GIGANTE VERDE (debug + e2e). */
    arena: {
      run: () => curRun().view(),
      config: () => ({ ...getConfig().arenaBoss, effectiveMultiplier: curRun().effectiveMultiplier() }),
      boss: () => {
        const m = curRun().bossMon();
        if (!m) return null;
        const v = getBossView(m);
        const p = getMonsterPos(m);
        return { uid: m.uid, id: m.id, hp: m.hp, hpMax: m.hpMax, alive: m.alive, boss: !!m.boss, x: p.x, y: p.y,
          view: v ? JSON.parse(JSON.stringify(v)) : null, def: state?._monsters?.[m.id] ? { tier: state._monsters[m.id].tier, xp: state._monsters[m.id].xp, name: state._monsters[m.id].name } : null };
      },
      /** Força um ataque do chefe AGORA (telegraph real → impacto real). */
      bossAttack: (atk) => {
        const m = curRun().bossMon();
        if (!m || !state) return false;
        const p = motion.getPos();
        return debugBossAttack(state, m.uid, atk, { px: p.x, py: p.y });
      },
      /** SOMENTE TESTE: sobrescreve o HP atual do chefe (a fórmula continua valendo no início de cada tentativa). */
      testSetBossHp: (hp) => {
        const m = curRun().bossMon();
        if (!m) return null;
        m.hp = Math.max(1, Math.min(m.hpMax, Math.round(hp)));
        return m.hp;
      },
      queueOffer: (n = 1) => curRun().debugQueueOffer(n),
      /** Escolhe um poder pelo caminho REAL (curRun().pickPower → modifiers). */
      pickPower: (id) => { const d = curRun().pickPower(id); ui.refresh(); return d ? d.id : null; },
      stacks: (id) => curRun().powerStacks(id),
      snapshot: () => curRun().snapshotStats(),
      rollOffer: (n = 3) => curRun().rollOffer(n).map((d) => d.id),
      powers: () => (DATA?.arena_powers?.poderes || []).map((p) => ({ id: p.id, nome: p.nome, maxStacks: p.maxStacks, efeitos: p.efeitos })),
      hud: () => bossHud.read(),
      /** Personagem permanente (resumo) que a Arena copiou. */
      permanent: () => {
        const pm = resolvePermanent();
        const st = pm.state;
        return st ? { source: pm.source, nivel: st.player.nivel, xp: st.player.xp, hpMax: st.player.hpMax, inventory: JSON.parse(JSON.stringify(st.inventory)), passives: (st.passives?.owned || []).slice(), stats: { ...(st.stats || {}) } } : { source: pm.source };
      },
      phaseDebug: (idx) => { const m = curRun().bossMon(); return m && state ? debugBossPhase(state, m.uid, idx) : false; },
      armBoss: () => curRun().armBoss(),
      resetAttempt: (why = 'teste') => { curRun().resetAttempt(why); onArenaAttemptEnd('reset', {}); return curRun().view().attempt; }
    },
    /**
     * EVO (perf/e2e): coloca n inimigos REAIS (dados do Campo, arquétipos A–E em rodízio) em
     * volta do herói, no sistema normal (IA/combate/XP). ids opcional = lista de monster ids.
     */
    spawnTestEnemies: (n = 10, ids = null, opts = {}) => {
      if (!state) return 0;
      const list = ids && ids.length ? ids : ['mon_ca_lamina', 'mon_ca_vespa', 'mon_ca_atirador', 'mon_ca_couraca', 'mon_ca_tecelao'];
      const z = state._data.zones.zones.find((q) => q.id === state.zoneId);
      const p = motion.getPos();
      let made = 0;
      let uid = Math.max(15000, testUidNext, ...state.monstersAlive.map((q) => q.uid + 1)); // EVO: nunca reaproveita uid (runtime antigo)
      for (let i = 0; i < n * 6 && made < n; i++) {
        const a = (made / Math.max(1, n)) * Math.PI * 2 + i * 0.37;
        const d = (opts.radius || 3.5) + (i % 3) * 0.9;
        const x = Math.floor(p.x + Math.cos(a) * d);
        const y = Math.floor(p.y + Math.sin(a) * d);
        if (!z || !isWalkable(z, x, y) || state.monstersAlive.some((m) => m.alive && m.x === x && m.y === y)) continue;
        const id = list[made % list.length];
        const def = state._monsters[id];
        if (!def) continue;
        const m = { uid: uid++, id, zone: state.zoneId, x, y, homeX: x, homeY: y, hp: def.hp, hpMax: def.hp, alive: true, arch: def.arquetipo || null, tier: def.tier || 'comum', testSpawn: true, campo: !!state.campoMode, _wasAlive: true, arenaLabel: def.name };
        state.monstersAlive.push(m);
        testUidNext = uid;
        if (opts.alert !== false) alertMonster(m);
        made++;
      }
      return made;
    },
    /** EVO: Campo de Ascensão (e2e/debug). */
    startCampo: () => enterCampo(),
    campo: () => campo.view(),
    campoApi: {
      enterBoss: () => campo.enterBoss(),
      skipTo: (n) => campo.debugSkipTo(n),
      portaoShown: () => campoUi.isPortaoShown(),
      runView: () => campoRun.view(),
      /** SAVE: estatísticas da gravação contínua da evolução do Campo */
      syncStats: () => JSON.parse(JSON.stringify(campoSyncStats)),
      /** TESTE: mesma rota do gancho de morte real (actions.setPlayerDeathHook → campo.onPlayerDeath) */
      forceDeath: () => (state?.campoMode ? campo.onPlayerDeath(state) : false)
    },
    evo: {
      passiveSig: (k, d) => { renderer.passiveSig?.(k, d || {}); return renderer.getPassiveSig?.() ?? null; },
      simDiag: () => ({ ...simDiag }),
      tokens: () => getTokenStats(),
      feel: () => ({ hitStops: evoStats.hitStops, lastHitStopMs: evoStats.lastHitStopMs }),
      sigCounts: () => renderer.getPassiveSig?.() ?? null,
      stats: () => JSON.parse(JSON.stringify(evoStats)),
      sfx: () => getSfxStats(),
      bossIntro: () => ({ active: !!renderer.bossIntroActive?.() }),
      playBossIntro: () => !!renderer.playBossIntro?.(),
      freeze: () => ({ busy: !!busy, modal: isModalOpen(), drawer: isDrawerOpen(), cards: passiveUi.isOpen(), editor: !!settingsMenu?.isEditorOpen(), hitStopLeftMs: Math.round(hitStopUntil - performance.now()), timeScale: debugTimeScale, visible: isGameVisible() }),
      posture: (uid) => { const m = state?.monstersAlive.find((q) => q.uid === uid); return m ? getPosture(m) : null; },
      addPosture: (uid, n) => { const m = state?.monstersAlive.find((q) => q.uid === uid); return m ? { ...postureHit(m, n) } : null; },
      hazards: () => getHazardStats(),
      slow: () => getPlayerSlow(),
      setPosture: (v) => setPostureEnabled(!!v),
      synergy: () => getBuildSynergy(),
      xpForLevel: (n) => xpForLevel(n),
      buildOf: (id) => buildOfPassive(id)
    },
    mobile: () => mobile,
    /**
     * API de teste/debug: mira no inimigo vivo mais próximo (se houver) e
     * comanda UM golpe pelo mesmo caminho do botão. O dano só sai no frame de
     * impacto e só se o alvo estiver na hitbox (cone + alcance + visão).
     */
    attackNearest: () => {
      if (!state || busy) return null;
      const p = motion.getPos();
      let best = null;
      let bestD = Infinity;
      for (const m of state.monstersAlive) {
        if (!m.alive || m.zone !== state.zoneId) continue;
        const mp = getMonsterPos(m);
        const d = Math.hypot(mp.x - p.x, mp.y - p.y);
        if (d < bestD) { bestD = d; best = { uid: m.uid, x: mp.x, y: mp.y }; }
      }
      if (best) {
        const yaw = Math.atan2(best.x - p.x, -(best.y - p.y));
        if (renderer.mode === 'fps') renderer.fpsCam?.setYawInstant(yaw);
        else motion.setFacing(yaw);
      }
      const r = attackPress();
      attackRelease(); // toque único (sem segurar)
      return { command: r, target: best ? best.uid : null, dist: best ? +bestD.toFixed(3) : null };
    },
    // —— Ganchos para o Bloco 3 (lock-on, companheiro, passivas) ——
    /** Último inimigo atingido pelo herói (uid) se ainda vivo na zona. */
    playerTarget: () => {
      if (!state || playerTarget.uid == null) return null;
      const m = state.monstersAlive.find((x) => x.uid === playerTarget.uid);
      return m && m.alive && m.zone === state.zoneId ? { uid: m.uid, hitAgoMs: Math.round(getAiClock() - playerTarget.at) } : null;
    },
    /** uids com a ficha de ataque (preparando/atacando o herói). */
    tokenHolders: () => getAttackTokenHolders().slice(),
    /** Ameaças ordenadas: atacando → engajados → demais (por distância). */
    threats: () => {
      if (!state) return [];
      const p = motion.getPos();
      return getThreatsToPlayer(state, p.x, p.y).map((m) => ({ uid: m.uid, attacking: isAttackingPlayer(m), engaged: isTargetingPlayer(m) }));
    },
    /** Dano genérico de fonte não-herói (XP/loot/quests garantidos). */
    damageMonster: (uid, amount, source = 'companion', opts = {}) => {
      if (!state) return null;
      const m = state.monstersAlive.find((x) => x.uid === uid);
      return damageMonsterFrom(source, m, amount, opts);
    },
    modifiers: { getStat, addModifier, clearModifiers, list: listModifiers, STATS },
    // —— gp3: analógico direito / passivas / dragão ——
    tapAttack: () => tapAttack(),
    lastTap: () => ({ ...lastTap }),
    aimNudge: () => ({ ...aimNudge }),
    setLockOn: (uid) => { setLock(uid ?? null, 'api'); return validLockOn(); },
    lockOn: () => validLockOn(),
    // —— Bloco 4: esquiva / defesa / especiais / lock-on ——
    dodge: () => dodgePress(),
    defend: (v = true) => defendSet(!!v),
    special: (id) => specialPress(id),
    specialIds: () => SPECIAL_IDS.slice(),
    actions: () => actions.getDebug(),
    actionEvents: () => actions.getEvents(),
    clearActionEvents: () => actions.clearEvents(),
    actionView: () => actions.getView(),
    buttonsInfo: () => (state ? actions.getButtonsInfo(state) : null),
    resetActions: () => { actions.reset(); return true; },
    clearPlayerTarget: () => { playerTarget.uid = null; playerTarget.at = 0; heroDamaged.clear(); lastThreatAt.clear(); return true; },
    setNexa: (n) => { if (!state) return null; state.player.nexa = Math.max(0, Math.min(state.player.nexaMax, n)); ui.refresh(); return state.player.nexa; },
    lockToggle: (dir = 0) => lockToggle(dir),
    /** Bloco 6: tocar para travar (coordenadas de tela) + onde cada inimigo aparece na tela. */
    tapLock: (x, y) => tapLockAt(x, y),
    tapLockDebug: () => ({ ...tapLockSt, last: tapLockSt.last ? { ...tapLockSt.last } : null }),
    monsterScreen: (uid, h = 1) => {
      const q = renderer.projectMonster?.(uid, h);
      if (!q) return null;
      const r = document.getElementById('game-canvas').getBoundingClientRect();
      return { x: Math.round(q.x + r.left), y: Math.round(q.y + r.top) };
    },
    lockRelease: () => { releaseLock('api'); return validLockOn(); },
    lockDebug: () => ({ uid: validLockOn(), reason: lockSt.reason, switches: lockSt.switches, releases: lockSt.releases.slice(), candidates: lockCandidates().map((c) => c.uid), marker: renderer.getLockMarker?.() ?? null }),
    dragonGuard: () => ({ ...dragonGuard, heroDamaged: [...heroDamaged] }),
    dragonDamage: (uid, amount) => {
      // e2e: mesmo caminho do dano do dragão (com killStealGuard)
      if (!state) return null;
      const m = state.monstersAlive.find((x) => x.uid === uid);
      return dragonDamageProxy(m, amount);
    },
    /** XP pelo caminho real (addXp → nível → fila de passivas). */
    grantXp: async (n) => {
      if (!state) return null;
      const { addXp } = await import('./state.js?v=20261003m10c');
      addXp(state, n);
      ui.refresh();
      return { nivel: state.player.nivel, xp: state.player.xp, pending: state.passives?.pending || 0 };
    },
    /** Bloco 6: passivas automáticas (procs) — estado, buffs do HUD, auras e eventos. */
    /** Bloco 6b: tela inteira. */
    fullscreen: {
      debug: () => fullscreenUi?.debug() ?? null,
      toggle: () => fullscreenUi?.toggle(),
      tip: () => fullscreenUi?.tip()
    },
    procs: {
      debug: () => procs.getDebug(),
      buffs: () => procs.getBuffs(),
      view: () => ({ ...procs.getView() }),
      events: () => procs.getEvents(),
      clearEvents: () => procs.clearEvents(),
      hud: () => passiveHud.snapshot(),
      vfx: () => renderer.getPassiveVfx?.() ?? null,
      describe: (id) => describeProc(id),
      reset: () => { procs.reset(); passiveHud.clear(); return true; },
      debugActivate: (id) => procs.debugActivate(id),
      /** Debug/screenshot: congela textos flutuantes (usar junto com setTimeScale(0)). */
      freezeFloats: () => renderer.freezeFloats?.() ?? 0
    },
    passives: {
      list: () => listPassives().map((d) => ({ id: d.id, nome: d.nome, raridade: d.raridade, maxStacks: d.maxStacks, build: buildOfPassive(d.id) })),
      owned: () => (state?.passives?.owned || []).slice(),
      pending: () => state?.passives?.pending || 0,
      offer: () => (state?.passives?.offer || null),
      lastOffer: () => (state?.passives?.lastOffer || []).slice(),
      totals: () => getTotals(),
      isOpen: () => passiveUi.isOpen(),
      showActive: () => passiveUi.showActive((state?.passives?.owned || []).map((id) => getPassive(id)).filter(Boolean)),
      isLocked: () => passiveUi.isLocked(),
      cards: () => passiveUi.getCards(),
      picks: () => passiveUi.getPicks(),
      /** Estatística do sorteio ponderado (1 carta por rolagem, pool atual). */
      rollStats: (n = 2000, k = 1) => {
        const pool = availablePool(state);
        const freq = {};
        for (let i = 0; i < n; i++) for (const d of weightedPick(pool, k)) freq[d.id] = (freq[d.id] || 0) + 1;
        return freq;
      },
      /** Oferta simulada (sem abrir tela) — teste de "sem duplicatas / sem obtidas". */
      simulateOffer: () => (state ? rollOffer(state, getConfig().passives.choices) : []),
      /** Teste: concede uma passiva pelo caminho real (choosePassive) sem abrir a tela. */
      grant: (id) => {
        if (!state) return null;
        const ps = ensurePassiveState(state);
        const prev = ps.offer;
        ps.offer = [id];
        const d = choosePassive(state, id);
        ps.offer = prev && prev.length ? prev : null;
        ui.refresh();
        return d ? d.id : null;
      },
      /** Teste: zera as passivas da partida ATIVA (arena) e recalcula. */
      reset: () => {
        if (!state) return false;
        passiveUi.close();
        state.passives = { owned: [], pending: 0, lastOffer: [], offer: null };
        bindPassiveState(state);
        return true;
      }
    },
    dragon: {
      debug: () => dragon.getDebug(),
      events: () => dragon.getEvents(),
      clearEvents: () => dragon.clearEvents(),
      forceStage: (n = 2) => {
        if (!state) return null;
        if (!state.dragon) state.dragon = { stage: 1, level: 1 };
        state.dragon.stage = Math.max(1, n | 0);
        dragon.resetCooldowns();
        safeSave();
        return state.dragon.stage;
      },
      stage: () => state?.dragon?.stage || 1,
      setEnabled: (v) => dragon.setEnabled(v),
      place: (x, y) => dragon.place(x, y),
      resetCooldowns: () => dragon.resetCooldowns(),
      debugFire: (id, x, y, yaw) => dragon.debugFire(id, x, y, yaw),
      counts: () => renderer.getDragonCounts?.() || null,
      onScreen: () => renderer.dragonOnScreen?.() || null
    },
    /** Toque/solta de ATAQUE (mesmo caminho do botão). */
    attackPress: () => attackPress(),
    attackRelease: () => attackRelease(),
    combat: () => combat.getDebug(),
    combatEvents: () => combat.getEvents(),
    clearCombatEvents: () => combat.clearEvents(),
    hitbox: (idx, ranged) => combat.describeHitbox(idx, ranged),
    ai: () => aiDebug(state),
    aiEvents: () => getAiEvents(),
    clearAiEvents: () => clearAiEvents(),
    aiClock: () => getAiClock(),
    graceRemaining: () => graceRemainingMs(),
    placeMonster: (uid, fx, fy) => (state ? placeMonster(state, uid, fx, fy) : false),
    resetMonster: (uid, opts) => (state ? debugResetMonster(state, uid, opts) : false),
    resetAttackTokens: () => resetAttackTokens(),
    /** Posiciona o herói (float, coords de tile) — e2e. */
    placePlayer: (fx, fy) => {
      if (!state) return false;
      state.player.x = Math.floor(fx);
      state.player.y = Math.floor(fy);
      motion.snapToTile(state);
      const pos = motion.getPos();
      pos.x = fx;
      pos.y = fy;
      return true;
    },
    setYaw: (y) => { renderer.fpsCam?.setYawInstant(y); },
    /** Debug: escala do relógio de jogo (0 = congela golpes/inimigos para screenshot). */
    setTimeScale: (k) => { debugTimeScale = Math.max(0, Math.min(4, Number(k) || 0)); },
    telegraphs: () => renderer.getTelegraphs?.() || { uids: [], threatVisible: false },
    sparkCount: () => renderer.getSparkCount?.() ?? 0,
    viewmodelAttack: () => renderer.getViewmodelAttack?.() ?? null,
    fov: () => renderer.getFov?.() ?? null,
    baseFov: () => renderer.getBaseFov?.() ?? getConfig().camera.fovDeg,
    pitchLimitsDeg: () => renderer.getPitchLimitsDeg?.() ?? [getConfig().camera.pitchMinDeg, getConfig().camera.pitchMaxDeg],
    /** Vetor analógico direto (teste/debug) — mesmo caminho do joystick. */
    setJoystick: (x, y) => {
      mobile?.api.setVector(x, y);
    },
    motion: () => motion,
    movementInput: () => ({ x: motion.movementInput.x, y: motion.movementInput.y }),
    playerPos: () => {
      const p = motion.getPos();
      return { x: p.x, y: p.y, speed: motion.getSpeed(), running: motion.isRunning(), facing: motion.getFacing() };
    },
    camera: () => {
      const c = renderer.fpsCam?.state;
      if (!c) return null;
      return { yaw: c.yaw, pitch: c.pitch, targetYaw: c.targetYaw, targetPitch: c.targetPitch };
    },
    config: () => getConfig(),
    settings: {
      get: () => getOverrides(), set: (o) => setOverrides(o), reset: () => resetOverrides(),
      // Bloco 5: menu / editor
      open: () => { getSettingsMenu().open(); return true; },
      openHeroStyle: () => openHeroStyleModal(),
      heroStyleValue: () => heroStyleEditor?.value() || null,
      heroStylePreview: () => heroStyleEditor?.previewInfo() || null,
      openEditor: () => { getSettingsMenu().openEditor(); return getSettingsMenu().isEditorOpen(); },
      closeEditor: (save) => { getSettingsMenu()?.closeEditor(save); return !getSettingsMenu()?.isEditorOpen(); },
      editor: () => getSettingsMenu()?.editorDebug() || null,
      log: () => settingsLog.slice(-50),
      layoutItems: () => mobile?.getLayoutItems() || null,
      stored: () => { try { return JSON.parse(localStorage.getItem('nexara.settings.v1') || 'null'); } catch { return null; } }
    },
    isTouchMode: () => !!mobile?.isVisible?.(),
    tryMove: (dx, dy) => {
      if (!state || busy) return false;
      const ok = tryMove(state, dx, dy);
      if (ok) {
        maybeRespawn(state);
        ui.refresh();
      }
      return ok;
    },
    openDrawer: () => openHudDrawer(),
    closeDrawer: () => closeHudDrawer(),
    isDrawerOpen: () => isDrawerOpen(),
    /** Force enemy AI tick (e2e: enemy damages without player attacking). */
    tickAi: () => {
      if (!state) return { attacks: [] };
      const p = motion.getPos();
      const r = forceAiTick(state, { px: p.x, py: p.y, playerRadius: getConfig().movement.playerRadius });
      for (const a of r.attacks) applyAiVfx(a);
      ui.refresh();
      return r;
    },
    monsterAttackPlayer: (uid) => {
      if (!state) return null;
      const r = monsterAttackPlayer(state, uid);
      if (r) applyAiVfx(r);
      ui.refresh();
      return r;
    },
    getYaw: () => renderer.getYaw?.() ?? 0,
    getPitch: () => renderer.getPitch?.() ?? 0,
    lookDir: () => renderer.lookDirFlat?.() ?? { x: 0, z: -1 },
    saveNow: () => { safeSave(); return !!state && !isArenaState(state); },
    setAiEnabled: (v) => setAiEnabled(v),
    grantAiGrace: (ms) => grantAiGrace(ms),
    clearAiGrace: () => clearAiGrace(),
    healPlayer: () => { if (state) { state.player.hp = state.player.hpMax; } },
    /** TESTE/itens: coloca um item de data/items.json no inventário (mesmo addToInventory do loot) */
    giveItem: (id, qty = 1) => { if (!state || !state._items[id]) return false; addToInventory(state.inventory, state._items[id], qty); ui.refresh(); return true; },
    equipItem: (id) => { if (!state) return null; equipItem(state, id); return { ...state.equipment }; },
    openInventory: () => { ui.openInventory(); return !!document.getElementById('inv2'); }
  };
}

function safeSave() {
  if (!state || isArenaState(state)) return;
  saveToLocal(state);
}

function isDrawerOpen() {
  return !!document.getElementById('hud-drawer')?.classList.contains('open');
}

function openHudDrawer() {
  const d = document.getElementById('hud-drawer');
  if (!d) return;
  motion.stopNow();
  mobile?.releaseAll?.();
  d.classList.add('open');
  d.setAttribute('aria-hidden', 'false');
  // Release pointer lock when opening drawer
  if (renderer.mode === 'fps') renderer.controls?.()?.exitLock?.();
}

function closeHudDrawer() {
  const d = document.getElementById('hud-drawer');
  if (!d) return;
  d.classList.remove('open');
  d.setAttribute('aria-hidden', 'true');
}

function toggleHudDrawer() {
  if (isDrawerOpen()) closeHudDrawer();
  else openHudDrawer();
}

function setupMenus() {
  document.getElementById('btn-novo').onclick = () => showCreate();
  document.getElementById('btn-continuar').onclick = () => {
    const saved = loadFromLocal();
    if (!saved) {
      ui.showToast('Nenhum save.');
      return;
    }
    worldBackup = null;
    exitAllRuns();
    state = loadSaved(saved);
    showGame();
    ui.refresh();
  };
  document.getElementById('btn-arena').onclick = () => enterArena();
  // ARENA PRINCIPAL: menu com 4 entradas; os modos antigos ficam em ARENA → Outros modos (nada removido).
  // Suítes antigas (webdriver) abrem os painéis direto para os ids de sempre continuarem clicáveis; ?menu=novo testa o menu novo.
  {
    const ap = document.getElementById('arena-panel');
    const mo = document.getElementById('menu-outros');
    const bo = document.getElementById('btn-outros-modos');
    const legacy = navigator.webdriver && !/[?&]menu=novo\b/.test(location.search);
    ap?.classList.toggle('hidden', !legacy);
    mo?.classList.toggle('hidden', !legacy);
    bo?.setAttribute('aria-expanded', legacy ? 'true' : 'false');
    const bm = document.getElementById('btn-main-arena');
    if (bm) bm.onclick = () => { ap.classList.toggle('hidden'); };
    if (bo) bo.onclick = () => { const open = mo.classList.toggle('hidden') === false; bo.setAttribute('aria-expanded', open ? 'true' : 'false'); bo.textContent = open ? 'Outros modos ▾' : 'Outros modos ▸'; };
    const be = document.getElementById('btn-br-entrar');
    if (be) { if (!brEnabled(DATA)) { be.textContent = 'ARENA PRINCIPAL — EM DESENVOLVIMENTO'; be.disabled = true; } be.onclick = () => enterArenaBr(); }
    const bmn = document.getElementById('btn-main-mercado');
    if (bmn) bmn.onclick = () => brUi.openMarket();
  }
  // EVO: CAMPO DE ASCENSÃO (modo de teste, como a Arena)
  const bCampo = document.getElementById('btn-campo');
  if (bCampo) bCampo.onclick = () => enterCampo();
  document.getElementById('btn-menu-personagem').onclick = () => ui.showToast('EM DESENVOLVIMENTO — use Novo Jogo');
  document.getElementById('btn-menu-inv').onclick = () => ui.showToast('EM DESENVOLVIMENTO — disponível in-game (I)');
  document.getElementById('btn-menu-arsenal').onclick = () => {
    if (!state && !resolvePermanent().state) { ui.showToast('Crie um personagem (Novo Jogo ou Campo) para usar o Arsenal.'); return; }
    maybeTestGrant();
    mcbUi.open();
  };
  const bVestM = document.getElementById('btn-menu-vestiario');
  if (bVestM) bVestM.onclick = () => {
    if (!state && !resolvePermanent().state) { ui.showToast('Crie um personagem (Novo Jogo ou Campo) para usar o Vestiário.'); return; }
    maybeTestGrant();
    vestiario.open();
  };
  document.getElementById('btn-google-login').onclick = () => ui.showToast('Entrar com Google — Em desenvolvimento');
  document.getElementById('btn-menu-quests').onclick = () => ui.showToast('EM DESENVOLVIMENTO — disponível in-game (L)');
  document.getElementById('btn-menu-skills').onclick = () => ui.showToast('EM DESENVOLVIMENTO — disponível in-game (K)');
  document.getElementById('btn-menu-arquivo').onclick = () => ui.showToast('EM DESENVOLVIMENTO — disponível in-game (A)');
  document.getElementById('btn-menu-cfg').onclick = () => {
    getSettingsMenu().open();
  };
}

function enterArena() {
  if (state && !isArenaState(state)) {
    worldBackup = state;
  }
  exitAllRuns();
  arenaPermCache = null;
  const built = buildArenaAttemptState();
  state = built.state;
  showGame({ arena: true });
  // Bloco 7: 1ª tentativa — HP do chefe calculado com o HP máximo real (passivas já ligadas no showGame)
  arenaRun.startAttempt(state, 'enter');
  ui.refresh();
  ui.showToast(built.source === 'testador'
    ? 'Arena sem personagem salvo: use Novo Jogo para guardar as recompensas do GIGANTE VERDE.'
    : 'Joystick esq. move · arraste à direita para olhar · ATAQUE · a leste: GIGANTE VERDE');
  mobile?.setForceVisible(true);
  mobile?.updateVisibility();
}

/** EVO: entra no CAMPO DE ASCENSÃO (estado da corrida a partir do permanente; evolução volta ao save — syncCampoProgress). */
function enterCampo() {
  if (state && !isArenaState(state)) worldBackup = state;
  exitAllRuns();
  arenaPermCache = null;
  const built = buildCampoAttemptState();
  state = built.state;
  showGame({ arena: true });
  campoRun.startAttempt(state, 'enter');
  campo.start(state);
  ui.refresh();
  // SAVE: sem personagem salvo → cria o herói permanente já na entrada (nível/XP do Campo nunca se perdem)
  if (built.source === 'testador') syncCampoProgress(state, 'enter');
  ui.showToast(`CAMPO DE ASCENSÃO — 10 ondas até o PORTÃO DO DRAGÃO. Evolução salva (NV ${state.player.nivel}).`);
  mobile?.setForceVisible(true);
  mobile?.updateVisibility();
}

/** ARENA PRINCIPAL: entra na corrida (cópia do permanente; tudo que ganhar é salvo na hora). */
function enterArenaBr() {
  if (!brEnabled(DATA)) { ui.showToast('ARENA PRINCIPAL — EM DESENVOLVIMENTO (arena_br.enabled = false).'); return false; }
  if (state && !isArenaState(state)) worldBackup = state;
  exitAllRuns();
  arenaPermCache = null;
  const built = buildBrAttemptState();
  state = built.state;
  showGame({ arena: true });
  brRun.startAttempt(state, 'enter');
  arenaBr.start(state);
  brSummaryShown = false;
  brUi.show();
  ui.refresh();
  if (built.source === 'testador') syncCampoProgress(state, 'enter');
  ui.showToast('ARENA PRINCIPAL — 6 regiões, loot por risco, zona segura com aviso. Seta = objetivo · M = mapa.', 3800);
  mobile?.setForceVisible(true);
  mobile?.updateVisibility();
  return true;
}
function checkBrEnd(s) {
  const v = arenaBr.view();
  if (!v?.ended || brSummaryShown) return;
  brSummaryShown = true;
  syncCampoProgress(s, v.ended.kind);
  const run = mcbRunLog[mcbRunLog.length - 1]; if (run && run.br && !run.end) run.end = Date.now();
  combat.cancel(); motion.stopNow();
  brUi.showSummary(arenaBr.summary(), { onAgain: () => enterArenaBr(), onMenu: () => exitArenaToMenu() });
}
/** Crédito de MCB da corrida (bônus de caçada / extração) — vale na hora, salvo pela sincronização. */
function brCredit(n, why) {
  const s = state; if (!s?.brMode || !(n > 0)) return;
  ensureWallet(s);
  s.player.mcb += n; s.player.mcbTotal += n;
  arenaBr.addMcb(why === 'extracao' ? 0 : n);
  mcbUi?.pop(`+${n} MCB · ${why === 'extracao' ? 'EXTRAÇÃO' : 'CAÇADA'}`, 'elite');
  mcbUi?.updateHud(s);
  syncCampoProgress(s, 'br-' + why);
}
function brDamageHero(n) {
  const s = state; if (!s?.brMode || !s.player) return;
  s.player.hp = Math.max(0, s.player.hp - n);
  renderer.spawnFloatText?.(`−${n} ZONA`, '#ff4a8a', { size: 15, dy: 10 });
  renderer.flashDamage?.(0.35);
  if (s.player.hp <= 0) arenaBr.onPlayerDeath(s);
}
/** Coleta de drop: entra na BOLSA (bolsa cheia → fica no chão). Equipamento → popup de comparação. */
let brFullToastAt = 0;
function brPickup(drop) {
  const s = state; if (!s?.brMode) return false;
  const r = addLootToBag([s], drop.loot);
  if (!r.ok) {
    const nw = performance.now();
    if (nw - brFullToastAt > 2500) { brFullToastAt = nw; ui.showToast(r.reason || 'Bolsa cheia.'); renderer.spawnFloatText?.('Bolsa cheia.', '#ff8a7a', { size: 15, dy: 30 }); }
    return false;
  }
  arenaBr.recordItem(r.def);
  const rc = { comum: '#c8d4d0', incomum: '#4aa0ff', raro: '#ffc24a', epico: '#b36bff', lendario: '#ffd34a' }[r.def?.rarity] || '#8fd8c8';
  renderer.spawnFloatText?.(`+ ${r.def?.name || 'item'}${drop.loot.kind === 'mat' ? ` ×${drop.loot.qty}` : ''}`, rc, { size: drop.loot.kind === 'equip' ? 17 : 13, dy: 26 });
  brSfx('pickup', drop.loot.kind === 'equip' ? r.def?.rarity : 'mat');
  if (drop.loot.kind === 'equip') brUi.lootPopup({ def: r.def, uid: r.uid });
  syncCampoProgress(s, 'loot');
  return true;
}
/** Estado de referência + gravação para BOLSA/VENDER fora da corrida (menu → Mercado Negro). */
function brTargetState() { return state || resolvePermanent().state; }
function brCommit(s, reason) {
  if (!s) return;
  if (isRunPersist(s)) syncCampoProgress(s, reason);
  else if (isArenaState(s)) { const perm = resolvePermanent(); if (perm.state) try { perm.persist(perm.state); } catch {} }
  else if (s === state) safeSave();
  else { const perm = resolvePermanent(); try { perm.persist(s); } catch {} }
}
function brSell(id) {
  const s = brTargetState(); if (!s) return { ok: false, msg: 'Sem personagem.' };
  const mirrors = isArenaState(s) && !isRunPersist(s) ? [resolvePermanent().state, s].filter(Boolean) : [s];
  const r = sellFromBag(mirrors, id);
  if (r.ok) { brCommit(s, 'venda'); mcbUi?.updateHud(s); r.msg = `VENDIDO: +${r.price} MCB (saldo ${Math.floor(r.mcb)})`; brSfx('sell'); }
  else r.msg = r.reason;
  ui?.refresh?.();
  return r;
}
function brEquip(id) {
  const r = mcbUi.act('equip', id) || { ok: false };
  r.msg = r.ok ? `EQUIPADO: ${brTargetState()?._items?.[id]?.name || id}` : (r.reason || 'Não foi possível equipar.');
  if (r.ok) brCommit(brTargetState(), 'equip'); // ARENA: equipar da bolsa grava na hora (sobrevive ao reload)
  ui?.refresh?.();
  return r;
}
/** Avisos da Arena Principal (região, zona segura, eventos, extração, dragão). */
function onBrEvent(kind, info) {
  const big = (html, ms = 2400) => passiveUi.showBanner(html, ms);
  const ft = (t, c, o = {}) => renderer.spawnFloatText?.(t, c, { size: 18, dy: 50, ...o });
  if (kind === 'region') {
    if (info.first) big(`<b>${info.nome.toUpperCase()}</b>RISCO ${'●'.repeat(info.risco)}${'○'.repeat(5 - info.risco)}${info.risco >= 4 ? ' · loot alto, monstros fortes' : info.risco <= 1 ? ' · região inicial' : ''}`, 2000);
  } else if (kind === 'zone_warn') { big(`<b>⚠ ZONA SEGURA</b>Fecha em ${Math.round(info.inMs / 1000)} s (fase ${info.stage}) — veja o círculo tracejado no mapa`, 2600); brSfx('warn'); }
  else if (kind === 'zone_shrink') { ft('A ZONA ESTÁ FECHANDO', '#4ad8ff'); }
  else if (kind === 'zone_outside') { ft('FORA DA ZONA SEGURA!', '#ff4a8a'); brSfx('warn'); }
  else if (kind === 'event_start') { big(`<b>${info.kind === 'cacada' ? '🎯' : '📦'} EVENTO: ${info.nome}</b>${info.kind === 'cacada' ? 'Um ELITE marcado apareceu — derrote-o para o bônus.' : 'Suprimentos raros caíram no mapa — siga a seta.'}`, 2800); brSfx('event'); }
  else if (kind === 'hunt_done') { ft(`CAÇADA CONCLUÍDA +${info.bonus} MCB`, '#ffd34a'); }
  else if (kind === 'extract_open') { big('<b>EXTRAÇÃO LIBERADA</b>Fique 5 s num ponto de extração para sair com bônus de MCB.', 2600); }
  else if (kind === 'dragon_territory') { big(`<b>🐉 TERRITÓRIO DO DRAGÃO</b>O GIGANTE VERDE está no covil. Enfrente — ou desvie pela borda.`, 3000); brSfx('dragon'); }
  else if (kind === 'secret') { ft('LOCAL SECRETO!', '#ffd34a', { size: 20 }); }
  else if (kind === 'ambush') { big('<b>⚠ EMBOSCADA!</b>Inimigos saíram do esconderijo — recue para um corredor.', 1800); brSfx('warn'); }
  else if (kind === 'rare_spawn') { ft('UM MONSTRO RARO ESTÁ POR PERTO', '#ffd34a', { size: 18 }); }
  else if (kind === 'secret_area') { ft(info.kind === 'atalho' ? 'ATALHO SECRETO!' : info.kind === 'esconderijo' ? 'ESCONDERIJO ENCONTRADO!' : 'LOCAL SECRETO!', '#ffd34a', { size: 20 }); brSfx('chest'); }
  else if (kind === 'loot_open') { brSfx('chest', info.loot); renderer.shake?.(info.kind === 'bau' ? 0.12 : 0.06); }
  else if (kind === 'boss_down') { big('<b>GIGANTE VERDE DERROTADO!</b>Recompensa real salva no seu personagem. A corrida continua — extraia para o bônus.', 3200); }
  music?.onEvent?.(kind, info);
}
const music = createMusic();
/** música da ARENA PRINCIPAL: tick próprio (200 ms) — crossfade por ameaça, tema do dragão, fade no fim/saída. */
let musicLast = performance.now();
setInterval(() => {
  const now = performance.now(); const dt = Math.min(1000, now - musicLast); musicLast = now;
  const s = state;
  const inBr = !!(s?.brMode && arenaBr.isActive?.() && isGameVisible());
  music.setScene(inBr || (s?.brMode && arenaBr.view()?.ended) ? 'br' : 'off');
  if (music.scene() === 'off') { music.update(dt, {}); return; }
  const v = arenaBr.view(); const p = motion.getPos();
  let threat = 0; try { threat = getThreatsToPlayer(s, p.x, p.y).length; } catch {}
  const dc = DATA.arena_br?.dragao?.territorio;
  const SKm = DATA.arena_br?._escala || 1; const near = !!dc && p.x > dc.x0 - 14 * SKm && p.y < dc.y1 + 14 * SKm;
  music.update(dt, { threat, dragon: !!v?.inDragon, near, ended: !!v?.ended });
}, 200);
function brSfx(kind, extra) {
  try {
    if (kind === 'pickup') { if (extra === 'lendario' || extra === 'epico') sfxEliteSpawn(); else sfxLoot(); }
    else if (kind === 'warn') sfxWarn();
    else if (kind === 'event') sfxEliteSpawn();
    else if (kind === 'dragon') sfxBossRoar();
    else if (kind === 'chest') sfxLoot();
    else if (kind === 'sell') sfxLoot();
  } catch { /* som opcional */ }
}

function exitArenaToMenu() {
  // Bloco 7: nada temporário da Arena vaza para o mundo (poderes removidos dos modificadores)
  exitAllRuns();
  arenaPermCache = null;
  if (worldBackup) {
    state = worldBackup;
    worldBackup = null;
  } else {
    state = null;
  }
  mobile?.setForceVisible(false);
  mobile?.hide();
  showTitle();
}

/**
 * ESTILO DO HERÓI (menu ☰ → Estilo do herói): troca estilo/cores/peças de um save existente SEM mexer no
 * progresso (só player.heroStyle/heroCustom). No Campo vai ao permanente pela sincronização normal.
 */
let heroStyleEditor = null;
function openHeroStyleModal() {
  if (!state) return false;
  heroStyleEditor?.dispose();
  ui.openModal('Estilo do herói', '<div id="hero-style-box" class="hse-modal-box"></div>', [
    { label: 'Cancelar', onClick: () => { heroStyleEditor?.dispose(); heroStyleEditor = null; } },
    { label: 'Salvar estilo', primary: true, onClick: () => {
      const v = heroStyleEditor?.value();
      heroStyleEditor?.dispose(); heroStyleEditor = null;
      if (!v || !state) return;
      state.player.heroStyle = v.styleId;
      state.player.heroCustom = v.custom;
      if (isRunPersist(state)) syncCampoProgress(state, 'style'); else safeSave();
      ui.refresh();
      ui.showToast(`Estilo: ${heroStyleOf(v.styleId).name}`);
    } }
  ]);
  document.getElementById('modal-overlay')?.querySelector('.modal')?.classList.add('nx-hse-modal');
  heroStyleEditor = mountHeroStyleEditor(document.getElementById('hero-style-box'), { styleId: state.player.heroStyle, custom: state.player.heroCustom || {}, equip: equipmentVisual(state) });
  return true;
}

function showCreate() {
  hideAll();
  document.getElementById('create-screen').classList.remove('hidden');
  const box = document.getElementById('race-list');
  box.innerHTML = '';
  let selected = 'humano';
  for (const r of DATA.races.races) {
    const div = document.createElement('div');
    div.className = 'race-card' + (r.playable ? '' : ' disabled') + (r.id === selected ? ' selected' : '');
    let bonusLine = '';
    if (r.playable && r.skill_bonuses) {
      const parts = Object.entries(r.skill_bonuses)
        .filter(([, v]) => v)
        .map(([id, v]) => `${id}+${v}`);
      const attrs = r.base_attrs
        ? `HP ${r.base_attrs.hp} · Nexa ${r.base_attrs.nexa} · ATK ${r.base_attrs.ataque}`
        : '';
      bonusLine = `<br><small style="color:var(--accent2)">${attrs}</small>` +
        (parts.length ? `<br><small style="color:var(--nexa)">Skills: ${parts.join(', ')}</small>` : '');
    }
    div.innerHTML = `<strong>${r.name}</strong>${r.playable ? '' : ' (não jogável)'}<br><small>${r.description}</small>${bonusLine}`;
    if (r.playable) {
      div.onclick = () => {
        selected = r.id;
        box.querySelectorAll('.race-card').forEach((c) => c.classList.remove('selected'));
        div.classList.add('selected');
      };
    }
    box.appendChild(div);
  }
  heroStyleEditor?.dispose();
  heroStyleEditor = mountHeroStyleEditor(document.getElementById('create-style-box'), { styleId: 'cavaleiro' });
  document.getElementById('btn-start').onclick = () => {
    const name = document.getElementById('char-name').value.trim() || 'Viajante';
    const look = heroStyleEditor?.value() || { styleId: 'cavaleiro', custom: {} };
    heroStyleEditor?.dispose(); heroStyleEditor = null;
    worldBackup = null;
    exitAllRuns();
    state = createNewGame(DATA, { name, raceId: selected });
    state.player.heroStyle = look.styleId;
    state.player.heroCustom = look.custom;
    if (selected === 'mago') {
      state.inventory.push({ item_id: 'item_frasco_nexa', qty: 1, equipped: false });
    } else if (selected === 'humano') {
      state.inventory.push({ item_id: 'item_pistola_parafuso', qty: 1, equipped: false });
    } else {
      state.inventory.push({ item_id: 'item_lamina_sucata', qty: 1, equipped: false });
    }
    saveToLocal(state);
    showGame();
    ui.refresh();
    ui.showToast('Joystick esq. move · arraste à direita para olhar · ATAQUE');
  };
  document.getElementById('btn-create-back').onclick = () => { heroStyleEditor?.dispose(); heroStyleEditor = null; showTitle(); };
}

function showTitle() {
  hideAll();
  renderer.stop();
  mobile?.hide();
  document.getElementById('title-screen').classList.remove('hidden');
  document.getElementById('btn-continuar').disabled = !hasSave();
}

function showGame(opts = {}) {
  hideAll();
  const gs = document.getElementById('game-screen');
  gs.classList.remove('hidden');
  gs.classList.add('hud-mmorpg', 'mobile-compact');
  gs.classList.toggle('arena-mode', !!(opts.arena || isArenaState(state)));
  closeHudDrawer();
  // Controles primeiro: nenhum erro de render/UI pode escondê-los (causa do bug hd1)
  mobile?.setForceVisible(!!(opts.arena || isArenaState(state)));
  mobile?.updateVisibility();
  motion.stopNow();
  if (state) motion.snapToTile(state);
  combat.cancel();
  actions.reset();
  procs.reset();
  passiveHud.clear();
  heroDamaged.clear();
  lastThreatAt.clear();
  lockOnTarget = null;
  resetAttackTokens();
  // gp3: passivas da partida ativa (mundo/arena) + dragão ao lado do herói.
  // Tela de escolha de outra partida fecha (a oferta fica em state.passives.offer e reabre).
  passiveUi.close();
  bindPassiveState(state);
  lastNivel = state ? state.player.nivel : null;
  cancelAimNudge();
  if (state) {
    const p0 = motion.getPos();
    dragon.reset(p0.x, p0.y, renderer.getYaw?.() ?? 0, renderer.fpsCam?.camera?.aspect || 1.6);
    dragonCtx.state = state;
    dragon.checkEvolution(state);
  }
  // gp2: carência de spawn (enemyAi.spawnGraceMs ≥ 1,5 s) — sem ataques ao entrar
  grantAiGrace();
  renderer.resetVis();
  const onMoved = ({ zoneChanged, teleported }) => {
    if (zoneChanged || teleported) {
      renderer.resetVis();
      if (zoneChanged) {
        combat.cancel();
        grantAiGrace();
      }
      // gp3: dragão acompanha na troca de zona / teleporte
      const pz = motion.getPos();
      dragon.reset(pz.x, pz.y, renderer.getYaw?.() ?? 0, renderer.fpsCam?.camera?.aspect || 1.6);
    }
    ui.refresh();
  };
  currentOnMoved = onMoved;
  if (renderer.mode === 'fps') {
    renderer.start(() => state, {
      getBusy: () => busy,
      isInputBlocked,
      /** Pointer-lock só faz sentido com mouse: desliga em aparelho touch real. */
      isTouchUi: () => detectTouchMode(),
      motion,
      onMoved,
      simulate,
      getCombatView: () => combat.getView(),
      getActionView: () => actions.getView(),
      getAimYaw: () => actionCtx.yaw,
      getLockOnUid: () => validLockOn(),
      getTargetUid: () => (playerTarget.uid != null && state?.monstersAlive.some((m) => m.uid === playerTarget.uid && m.alive) ? playerTarget.uid : null),
      getOwnedPassives: () => ownedPassiveSet(),
      getHeroStats: () => (state ? state.player : null),
      getDragonView: () => (dragonActive() ? dragon.getView() : null),
      getPassiveView: () => procs.getView(),
      getDragonVfxScale: () => dragonVfxScale,
      getVfxTimeScale: () => debugTimeScale,
      isDrawerOpen,
      getEquippedStats
    });
  } else {
    renderer.start(() => state, { getBusy: () => busy, isInputBlocked, motion, onMoved, simulate });
  }
  wireGameControls();
  try {
    ui.refresh();
  } catch (e) {
    console.error('[showGame] ui.refresh', e);
  }
}

function hideAll() {
  closeHudDrawer();
  motion.stopNow();
  document.querySelectorAll('.screen, #game-screen').forEach((el) => el.classList.add('hidden'));
}

function applyAiVfx(result) {
  if (!result) return;
  if (result.dodged) {
    if (renderer.mode === 'fps') renderer.spawnFloatText?.('ESQUIVOU', '#8ffcff');
    // EVO: ESQUIVA PERFEITA (golpe no começo da janela de invencibilidade) → Nexa + destaque
    if (result.perfect && state) {
      const f = getConfig().feel || {};
      evoStats.perfectDodges++;
      sfxPerfectDodge();
      renderer.passiveSig?.('dodge', { perfect: true });
      state.player.nexa = Math.min(state.player.nexaMax, state.player.nexa + (f.perfectDodgeNexa || 0));
      if (renderer.mode === 'fps') renderer.spawnFloatText?.(`PERFEITA! +${f.perfectDodgeNexa || 0} NEXA`, '#c9a0ff', { size: 16, dy: 26 });
      ui.refresh();
    }
    return;
  }
  if (result.absorbed && renderer.mode === 'fps') renderer.spawnFloatText?.(`ESCUDO -${result.absorbed}`, '#5ff0ff', { size: 15, dy: 18 });
  if (result.dmgIn > 0) procs.onHeroDamaged(result.dmgIn);
  if (result.blocked) {
    sfxBlock();
    if (renderer.mode === 'fps') {
      renderer.spawnFloatText?.('BLOQUEIO', '#7fdcff');
      renderer.actionVfx?.('block_spark', { front: result.front });
      renderer.spawnFloatDamage?.(state.player.x, state.player.y, result.dmgIn, 'in');
    } else {
      spawnDamage(renderer.vfx, state.player.x, state.player.y, result.dmgIn, 'in');
    }
    renderer.shake(getConfig().defense.blockShake * 20);
    return;
  }
  if (result.dmgIn) {
    actions.onHeroHit(result.dmgIn);
    sfxHurt();
    renderer.passiveSig?.('hurt', {});
    if (renderer.mode === 'fps') {
      renderer.spawnFloatDamage?.(state.player.x, state.player.y, result.dmgIn, 'in');
      renderer.hitFlash?.(); // vinheta vermelha
      renderer.setPlayerAnim('hurt', 0.35);
      renderer.shake(4);
    } else {
      spawnDamage(renderer.vfx, state.player.x, state.player.y, result.dmgIn, 'in');
      renderer.setPlayerAnim('hurt', 0.35);
      renderer.shake(7);
    }
  }
}

let controlsWired = false;
function wireGameControls() {
  const canvas = document.getElementById('game-canvas');

  // FPS: click requests pointer lock (handled in fps-controls). Also attack on click if locked & target in front.
  // Iso: click tile to attack/talk (legacy).
  canvas.onclick = (e) => {
    if (busy || !state) return;
    if (e.target.closest?.('#mobile-controls')) return;

    if (renderer.mode === 'fps') {
      // Mouse travado: clique = comando de ataque (tempo/hitbox no player-combat)
      if (document.pointerLockElement === canvas) {
        attackPress();
        attackRelease();
      } else if (mobile?.isVisible?.()) {
        // Bloco 6: toque na metade esquerda (fora do joystick) = tocar no inimigo para travar
        tapLockAt(e.clientX, e.clientY);
      }
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const cssX = e.clientX - rect.left;
    const cssY = e.clientY - rect.top;
    const { x, y } = renderer.screenToTile(cssX, cssY);
    const mon = state.monstersAlive.find((m) => m.alive && m.zone === state.zoneId && m.x === x && m.y === y);
    if (mon) {
      // Iso: vira o corpo para o alvo clicado e comanda o golpe (mesma hitbox)
      const p = motion.getPos();
      const mp = getMonsterPos(mon);
      motion.setFacing(Math.atan2(mp.x - p.x, -(mp.y - p.y)));
      attackPress();
      attackRelease();
      return;
    }
    const npc = state._data.npcs.npcs.find((n) => n.zone === state.zoneId && n.x === x && n.y === y);
    if (npc) {
      const dist = Math.abs(npc.x - state.player.x) + Math.abs(npc.y - state.player.y);
      if (dist <= 1) {
        const r = talkNpc(state, npc);
        ui.showDialog(r);
        ui.refresh();
      } else {
        pushLog(state, 'Chegue mais perto (adjacente).', 'warn');
        ui.refresh();
      }
    }
  };

  window.onkeydown = async (e) => {
    if (!state || document.getElementById('game-screen').classList.contains('hidden')) return;
    if (busy) return;
    const k = e.key.toLowerCase();
    if (k === ' ' || e.code === 'Space') {
      // Bloco 4: Espaço = ESQUIVA (ataque: clique com o mouse travado / E / botão ATAQUE)
      if (isInputBlocked()) return; // modal aberto: Espaço continua ativando botões
      e.preventDefault();
      if (!e.repeat) dodgePress();
      return;
    }
    if (e.code === 'Tab' || k === 'tab') {
      if (isInputBlocked()) return;
      e.preventDefault();
      if (!e.repeat) lockToggle(0);
      return;
    }
    if (!isInputBlocked() && !e.repeat) {
      if (k === 'q') { defendSet(true); return; }
      if (k === 'e') { attackPress(); return; }
      if (k === '1') { specialPress('golpe_poderoso'); return; }
      if (k === '2') { specialPress('ataque_area'); return; }
      if (k === '3') { specialPress('dash'); return; }
      if (k === 'r') { specialPress('suprema'); return; }
    }
    if (k === 'q' || k === 'e' || k === 'r' || k === '1' || k === '2' || k === '3') return;
    if (k === 'i') { ui.openInventory(); return; }
    if (k === 'c') { ui.openCharacter(); return; }
    if (k === 'l') { ui.openQuests(); return; }
    if (k === 'k') { ui.openSkills(); return; }
    if (k === 'j') { ui.openArquivo(); return; }
    if (k === 'f') {
      const npc = interactAdjacent(state);
      if (npc) {
        if (renderer.mode === 'fps') renderer.setPlayerAnim?.('interact', 0.35);
        const r = talkNpc(state, npc);
        ui.showDialog(r);
        ui.refresh();
      } else {
        pushLog(state, 'Ninguém por perto.', 'warn');
        ui.refresh();
      }
      return;
    }
    if (k === 'escape') {
      if (isDrawerOpen()) {
        closeHudDrawer();
        return;
      }
      // FPS: Esc releases pointer lock first
      if (renderer.mode === 'fps' && document.pointerLockElement) {
        document.exitPointerLock?.();
        return;
      }
      if (isArenaState(state)) {
        exitArenaToMenu();
      } else {
        safeSave();
        showTitle();
      }
      return;
    }

    // Movimento (WASD/setas/Shift) = player-motion (contínuo) em FPS e iso.
  };
  window.onkeyup = (e) => {
    const k = (e.key || '').toLowerCase();
    if (k === 'e') attackRelease();
    if (k === 'q') defendSet(false);
  };
  // Bloco 4: botão DIREITO do mouse = DEFESA (segurar)
  canvas.oncontextmenu = (e) => { if (renderer.mode === 'fps') e.preventDefault(); };
  canvas.onpointerdown = (e) => { if (e.button === 2 && renderer.mode === 'fps' && state) { e.preventDefault(); defendSet(true); } };
  canvas.onpointerup = (e) => { if (e.button === 2) defendSet(false); };
  window.addEventListener('blur', () => defendSet(false));

  if (controlsWired) return;
  controlsWired = true;

  document.getElementById('btn-hud-menu')?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleHudDrawer();
  });
  document.getElementById('btn-hud-drawer-close')?.addEventListener('click', () => closeHudDrawer());
  document.getElementById('hud-drawer-backdrop')?.addEventListener('click', () => closeHudDrawer());

  const afterOpen = (fn) => () => {
    closeHudDrawer();
    fn();
  };

  document.getElementById('btn-inv').onclick = afterOpen(() => ui.openInventory());
  document.getElementById('btn-arsenal').onclick = afterOpen(() => mcbUi.open());
  { const bv = document.getElementById('btn-vestiario'); if (bv) bv.onclick = afterOpen(() => vestiario.open()); }
  document.getElementById('btn-char').onclick = afterOpen(() => ui.openCharacter());
  document.getElementById('btn-quests').onclick = afterOpen(() => ui.openQuests());
  document.getElementById('btn-skills').onclick = afterOpen(() => ui.openSkills());
  document.getElementById('btn-arquivo').onclick = afterOpen(() => ui.openArquivo());
  // Bloco V: painel "PASSIVAS ATIVAS" (passivas obtidas, com os efeitos reais)
  document.getElementById('btn-passivas').onclick = afterOpen(() => passiveUi.showActive((state?.passives?.owned || []).map((id) => getPassive(id)).filter(Boolean)));
  document.getElementById('btn-cfg').onclick = afterOpen(() => getSettingsMenu().open());
  document.getElementById('btn-save').onclick = () => {
    if (busy) {
      ui.showToast('Aguarde o evento terminar.');
      return;
    }
    if (isArenaState(state)) {
      ui.showToast('Arena não grava no save do mundo.');
      return;
    }
    saveToLocal(state);
    ui.showToast('Progresso salvo.');
  };
  document.getElementById('btn-menu').onclick = () => {
    if (busy) {
      ui.showToast('Aguarde o evento terminar.');
      return;
    }
    closeHudDrawer();
    if (isArenaState(state)) {
      exitArenaToMenu();
      return;
    }
    safeSave();
    showTitle();
  };
}

async function maybeAuto0217() {
  if (isArenaState(state)) return;
  if (state.flags.event_0217_ready && !state.flags.event_0217_done && state.quests.completed.includes('G6-Q01')) {
    busy = true;
    await maybeTrigger0217(state, ui);
    busy = false;
    safeSave();
  }
}

boot();
