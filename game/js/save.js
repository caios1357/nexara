import { walletSig, verifyWallet } from './mcb.js?v=20261009fast2';
import { getLocalProfile } from './auth.js?v=20261009fast2';

const SAVE_KEY = 'nexara_phase01_save';
const SETTINGS_KEY = 'nexara.settings.v1';
/** Último resultado da conferência da carteira ao carregar (ok | migrado | adulterado). */
export let lastWalletCheck = null;

/** Confere a assinatura da carteira; adulterado → guarda o save ORIGINAL numa chave de backup (nada é apagado). */
export function checkLoadedSave(saved, raw) {
  if (!saved?.player) return saved;
  const r = verifyWallet(saved);
  lastWalletCheck = { ...r, at: new Date().toISOString() };
  if (r.status === 'adulterado') {
    try { localStorage.setItem(`${SAVE_KEY}_backup_${Date.now()}`, raw ?? JSON.stringify(saved)); } catch {}
    console.warn('[save] carteira MCB não confere (save editado?) — MCB/itens do Arsenal rejeitados; backup guardado', r.before);
  }
  return saved;
}

export function saveToLocal(state) {
  const payload = serialize(state);
  localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
  return payload;
}

export function loadFromLocal() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return null;
  try {
    return checkLoadedSave(JSON.parse(raw), raw);
  } catch {
    return null;
  }
}

export function hasSave() {
  return !!localStorage.getItem(SAVE_KEY);
}

export function clearSave() {
  localStorage.removeItem(SAVE_KEY);
}

export function serialize(state) {
  const profile = state.profile?.id ? state.profile : (state.profile = getLocalProfile());
  let settings = null;
  try { settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null'); } catch {}
  const now = new Date().toISOString();
  return {
    profile: { id: profile.id, provider: profile.provider || 'local', createdAt: profile.createdAt },
    playerName: state.player?.name,
    mcb: Math.floor(state.player?.mcb || 0),
    arsenalOwned: (state.player?.arsenal?.owned || []).slice(),
    walletSig: walletSig(state.player, profile.id),
    defeatedBosses: { ...(state.stats || {}) },
    mapProgress: { zoneId: state.zoneId, flags: state.flags, arquivo: state.arquivo },
    settings,
    lastSaved: now,
    version: 3,
    game: 'Nexara',
    phase: '02',
    savedAt: new Date().toISOString(),
    player: state.player,
    inventory: state.inventory,
    equipment: state.equipment,
    quests: state.quests,
    reputation: state.reputation,
    arquivo: state.arquivo,
    flags: state.flags,
    monstersAlive: state.monstersAlive,
    // gp3: passivas (ids) + fila de escolhas + último conjunto oferecido; dragão
    passives: (state.passives?.owned || []).slice(),
    passivePending: state.passives?.pending || 0,
    passiveLastOffer: (state.passives?.lastOffer || []).slice(),
    dragon: { stage: state.dragon?.stage || 1, level: state.dragon?.level || 1 },
    // Bloco 7: estatísticas permanentes (ex.: vitórias contra o GIGANTE VERDE). Nunca o estado temporário da Arena.
    stats: { ...(state.stats || {}) },
    journal: state.journal,
    zoneId: state.zoneId,
    logTail: (state.log || []).slice(-30)
  };
}

export function downloadJson(state) {
  const blob = new Blob([JSON.stringify(serialize(state), null, 2)], {
    type: 'application/json'
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `nexara_save_${state.player?.name || 'player'}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function importJsonFile(file) {
  const text = await file.text();
  return checkLoadedSave(JSON.parse(text), text);
}
