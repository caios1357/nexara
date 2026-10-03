/**
 * NEXARA — adaptador de autenticação/persistência.
 * HOJE: só o provedor LOCAL (perfil anônimo com id gerado neste navegador; save em localStorage).
 * "Entrar com Google" NÃO está implementado — o botão aparece desativado ("Em desenvolvimento").
 * Para ligar um provedor real depois: implementar a interface AuthProvider abaixo (signIn/signOut/currentUser)
 * e um PersistenceAdapter remoto (load/save) — e validar MCB/compras NO SERVIDOR (o cliente não é confiável).
 *
 * @typedef {{ id:string, name?:string, provider:'local'|'google', createdAt:string }} Profile
 * @typedef {{ id:string, available:boolean, label:string, signIn():Promise<Profile>, signOut():Promise<void>, currentUser():Profile|null }} AuthProvider
 * @typedef {{ id:string, load():object|null, save(payload:object):void }} PersistenceAdapter
 */
const PROFILE_KEY = 'nexara_profile_v1';

function genId() {
  try { if (crypto?.randomUUID) return 'loc-' + crypto.randomUUID(); } catch {}
  return 'loc-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

/** Perfil local (criado 1× e reaproveitado). Nunca apaga nada. */
export function getLocalProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw) { const p = JSON.parse(raw); if (p?.id) return p; }
  } catch {}
  const p = { id: genId(), provider: 'local', createdAt: new Date().toISOString() };
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch {}
  return p;
}

/** @type {AuthProvider} */
export const localProvider = {
  id: 'local', available: true, label: 'Perfil local',
  async signIn() { return getLocalProfile(); },
  async signOut() {},
  currentUser() { return getLocalProfile(); }
};

/** @type {AuthProvider} — NÃO implementado (precisa de OAuth client id + backend). */
export const googleProvider = {
  id: 'google', available: false, label: 'Entrar com Google — Em desenvolvimento',
  async signIn() { throw new Error('Login com Google em desenvolvimento'); },
  async signOut() {},
  currentUser() { return null; }
};

export const authProviders = [localProvider, googleProvider];
export const currentAuth = () => localProvider;
