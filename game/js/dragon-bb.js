/**
 * NEXARA — DRAGON BERÇO · filhotes de dragão (BB) — LÓGICA pura (sem Three.js, sem DOM de jogo).
 *
 * Dados em data/dragoes.json (IDs novos; nada do que já existia muda):
 *   bebes[]  → bb_azul (Mini Dragão ORIGINAL do jogador) + 6 novos (fogo, gelo, raio, veneno, sombra, nexa), cada um com cor,
 *              elemento e 1 habilidade de apoio (cuspe | raio | nuvem | escudo | cura | veu);
 *   chefes[] → GIGANTE VERDE (os números reais vêm de gameplay-config arenaBoss).
 *
 * Quem usa:
 *   · RIVAIS (BOT) da Arena: cada herói rival tem seu BB (arena-rivals.js); a habilidade ajuda o rival;
 *   · JOGADOR: pode ESCOLHER o visual/elemento do companheiro no DRAGON BERÇO (escolha em localStorage 'nexara.berco.v1',
 *     só ids existentes; o save permanente não é tocado). As habilidades marcadas apoioJogador:true funcionam também para ele
 *     nas partidas da Arena Principal/FAST; as demais = EM DESENVOLVIMENTO para o jogador (aparece assim na tela).
 *   O companheiro NUNCA é jogável.
 *
 * O "motor" abaixo resolve UMA habilidade por vez através de um adaptador `io` (quem é o dono: rival ou herói):
 *   io.foe(range)            → { x, y, d, hit(n) } do inimigo mais próximo do dono (ou null)
 *   io.near(x, y, r, max)    → [{ x, y, hit(n) }] inimigos num raio
 *   io.threat()              → true se há inimigo perto (escudo/véu só disparam sob ameaça)
 *   io.hpFrac()              → 0..1 · io.heal(frac) · io.shield(ms, reducao) · io.veil(ms)
 *   io.base()                → dano base do dono (rival: ataque do rival · herói: ataque do herói)
 *   io.emit(kind, info)      → eventos p/ visual/teste
 */
export const BB_KEY = 'nexara.berco.v1';
export const BB_WINDUP_MS = 450;

export const bbList = (data) => data?.dragoes?.bebes || [];
export const bbById = (data, id) => bbList(data).find((b) => b.id === id) || null;
export const bbDefault = (data) => data?.dragoes?.escolhaPadrao || 'bb_azul';

/** escolha persistida do jogador (whitelist: só ids que existem no data; qualquer outra coisa → padrão) */
export function getChosenBB(data) {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(BB_KEY) : null;
    const id = raw ? JSON.parse(raw)?.bb : null;
    if (typeof id === 'string' && bbById(data, id)) return id;
  } catch { /* storage indisponível/corrompido → padrão */ }
  return bbDefault(data);
}
export function setChosenBB(data, id) {
  if (!bbById(data, id)) return false;
  try { localStorage.setItem(BB_KEY, JSON.stringify({ v: 1, bb: id })); } catch { return false; }
  return true;
}
/** primeira habilidade de apoio ATIVA (tipo conhecido) de um BB — null para o original (usa o sistema do mini-dragão) */
export const bbAbility = (def) => (def?.habilidades || []).find((h) => h.tipo) || null;
/** o jogador consegue usar a habilidade deste BB? */
export const bbPlayerSupported = (def) => !!bbAbility(def)?.apoioJogador;

export function hexNum(h) { return parseInt(String(h || '#ffffff').replace('#', ''), 16) || 0xffffff; }

/** estado de recarga de 1 dono */
export function newBBState(firstDelayMs = 0, clock = 0) { return { nextAt: clock + firstDelayMs, pending: null, cloud: null, fired: 0, lastFireAt: -1e9, lastKind: null, shields: 0, heals: 0, veils: 0 }; }

/**
 * Avança a habilidade (chamar com o relógio de jogo). Devolve 'fire' | 'pulse' | 'resolve' | null.
 * Cuspe/raio/nuvem têm AVISO (windup 450 ms: a boca do BB acende) → o herói pode esquivar do dano.
 */
export function stepBB(def, S, clock, io) {
  const ab = bbAbility(def); if (!ab || !S) return null;
  let out = null;
  // nuvem tóxica em andamento
  if (S.cloud && clock >= S.cloud.nextAt) {
    const c = S.cloud; c.nextAt = clock + ab.pulsoMs; c.left--;
    for (const t of io.near(c.x, c.y, ab.raio, 4)) t.hit(Math.max(1, Math.round(io.base() * ab.danoMult)));
    io.emit('bb_pulse', { id: def.id, x: c.x, y: c.y }); out = 'pulse';
    if (c.left <= 0) S.cloud = null;
  }
  // golpe com aviso → resolve
  if (S.pending && clock >= S.pending.at) {
    const P = S.pending; S.pending = null; out = 'resolve';
    if (ab.tipo === 'cuspe') { const f = io.foe(ab.alcance + 1.5); if (f) f.hit(Math.max(1, Math.round(io.base() * ab.danoMult))); io.emit('bb_hit', { id: def.id, kind: 'cuspe', x: f?.x ?? P.x, y: f?.y ?? P.y }); }
    else if (ab.tipo === 'raio') {
      const first = io.foe(ab.alcance + 1.5); const hits = [];
      if (first) { hits.push(first); for (const t of io.near(first.x, first.y, 4, ab.saltos + 1)) if (hits.length < ab.saltos && !hits.some((h) => h.x === t.x && h.y === t.y)) hits.push(t); }
      for (const h of hits) h.hit(Math.max(1, Math.round(io.base() * ab.danoMult)));
      io.emit('bb_hit', { id: def.id, kind: 'raio', n: hits.length, x: first?.x ?? P.x, y: first?.y ?? P.y });
    } else if (ab.tipo === 'nuvem') {
      const f = io.foe(ab.alcance + 1.5) || { x: P.x, y: P.y };
      S.cloud = { x: f.x, y: f.y, left: ab.pulsos, nextAt: clock };
      io.emit('bb_hit', { id: def.id, kind: 'nuvem', x: f.x, y: f.y });
    }
    return out;
  }
  if (clock < S.nextAt || S.pending) return out;
  const t = ab.tipo;
  if (t === 'cuspe' || t === 'raio' || t === 'nuvem') {
    const f = io.foe(ab.alcance); if (!f) return out;
    S.pending = { at: clock + BB_WINDUP_MS, x: f.x, y: f.y }; S.nextAt = clock + ab.cooldownMs; S.fired++; S.lastFireAt = clock; S.lastKind = t;
    io.emit('bb_windup', { id: def.id, kind: t, x: f.x, y: f.y }); return 'fire';
  }
  if (t === 'escudo') { if (!io.threat()) return out; io.shield(ab.duracaoMs, ab.reducao); S.nextAt = clock + ab.cooldownMs; S.fired++; S.shields++; S.lastFireAt = clock; S.lastKind = t; io.emit('bb_buff', { id: def.id, kind: t }); return 'fire'; }
  if (t === 'veu') { if (!io.threat()) return out; io.veil(ab.duracaoMs); S.nextAt = clock + ab.cooldownMs; S.fired++; S.veils++; S.lastFireAt = clock; S.lastKind = t; io.emit('bb_buff', { id: def.id, kind: t }); return 'fire'; }
  if (t === 'cura') { if (io.hpFrac() > 0.86) return out; io.heal(ab.curaFrac); S.nextAt = clock + ab.cooldownMs; S.fired++; S.heals++; S.lastFireAt = clock; S.lastKind = t; io.emit('bb_buff', { id: def.id, kind: t }); return 'fire'; }
  return out;
}

/** BB do rival de índice `idx` (ciclo da lista data.dragoes.rivais.atribuicao) */
export function bbForRivalIndex(data, idx) {
  const a = data?.dragoes?.rivais?.atribuicao || [];
  return bbById(data, a.length ? a[idx % a.length] : bbDefault(data));
}

/** texto das habilidades de um BB, com números REAIS (dados do data / config de jogo) */
export function describeAbilities(def, cfg) {
  const out = [];
  for (const h of def?.habilidades || []) {
    if (h.fonte === 'gameplay.dragon.attacks') {
      const a = cfg?.dragon?.attacks?.[h.id]; if (!a) continue;
      out.push({ id: h.id, nome: a.nome, tipo: 'ataque', linhas: [`dano ${a.damage}${a.count > 1 ? ` × ${a.count} projéteis` : ''}`, `preparo ${a.windupMs} ms`, `recarga ${(a.cooldownMs / 1000).toFixed(1)} s`, `alcance ${a.maxRange} tiles`, h.id === 'chama_concentrada' ? 'libera no nível 3 do herói' : 'estágio 1'], jogador: true });
    } else {
      const L = [`recarga ${(h.cooldownMs / 1000).toFixed(1)} s`];
      if (h.danoMult) L.push(`dano ${Math.round(h.danoMult * 100)}% do ataque do dono`);
      if (h.alcance) L.push(`alcance ${h.alcance} tiles`);
      if (h.saltos) L.push(`${h.saltos} alvos`);
      if (h.pulsos) L.push(`${h.pulsos} pulsos de ${h.pulsoMs} ms · raio ${h.raio}`);
      if (h.reducao) L.push(`−${Math.round(h.reducao * 100)}% dano por ${(h.duracaoMs / 1000).toFixed(1)} s`);
      if (h.curaFrac) L.push(`cura ${Math.round(h.curaFrac * 100)}% do HP máx.`);
      if (h.tipo === 'veu') L.push(`evasivo ${(h.duracaoMs / 1000).toFixed(1)} s + recarrega a esquiva`);
      if (['cuspe', 'raio', 'nuvem'].includes(h.tipo)) L.push(`aviso ${BB_WINDUP_MS} ms (esquivável)`);
      out.push({ id: h.id, nome: h.nome, tipo: h.tipo, texto: h.descricao, linhas: L, jogador: !!h.apoioJogador });
    }
  }
  return out;
}
