/**
 * NEXARA 20261024poder — PODERES DOS BOTS (rivais) + SIMULAÇÃO DE DUELO bot × bot (equilíbrio).
 * O MESMO código decide o uso dos poderes, os multiplicadores (passivas/buffs) e a mitigação no rival de verdade
 * (arena-rivals.js) e na simulação (simDuel) — a tabela de vitórias vem deste código, não de uma conta à parte.
 * Lutador (f): { kit, hp, hpMax, atk, cd{slot:readyAt}, b{buffs}, s{status}, escudo, pend[], tgt (quem ele encara) }
 */
import { KITS, SLOTS, kitFor } from './hero-kits.js?v=20261025vfx';

/** custo em Nexa de cada slot (igual ao do jogador: gameplay-config.specials) e Nexa do NV1 */
export const SLOT_COST = { golpe_poderoso: 10, ataque_area: 18, suprema: 35 };
export const NEXA_NV1 = 40, NEXA_REGEN = 0.5;
export function newFighter(kit, hpMax, atk = 1, now = 0, R = Math.random) {
  return { kit, hp: hpMax, hpMax, atk, nexa: NEXA_NV1, nexaMax: NEXA_NV1, cd: { golpe_poderoso: now + R() * 1000, ataque_area: now + R() * 1000, suprema: now + R() * 1000 }, b: {}, s: {}, escudo: 0, pend: [], uses: { golpe_poderoso: 0, ataque_area: 0, suprema: 0 }, tgt: null, nextTick: 0 };
}
const on = (until, now) => (until || 0) > now;

/** multiplicador de saída: passiva + buffs do atacante × estado do alvo (marca/maldição/fraqueza) */
export function outMult(a, d, now, o = {}) {
  if (!a) return 1;
  const k = a.kit; let m = (k?.atk ?? 1);
  if (on(a.b.dmgUntil, now)) m *= 1 + (a.b.dmg || 0);
  const P = k?.passiva;
  if (P) {
    if (P.tipo === 'longe' && (o.dist ?? 0) >= P.dist) m *= 1 + P.mult;
    else if (P.tipo === 'costas' && d && d.tgt !== a) m *= 1 + P.mult;
    else if (P.tipo === 'execucao' && d && d.hp < d.hpMax * P.abaixo) m *= 1 + P.mult;
    else if (P.tipo === 'furia') m *= 1 + P.max * Math.max(0, 1 - a.hp / Math.max(1, a.hpMax));
  }
  if (on(a.s.fracoUntil, now)) m *= 1 - (a.s.fraco || 0);
  if (d) { let v = 0; if (on(d.s.vulnUntil, now)) v += d.s.vuln || 0; if (on(d.s.marcaUntil, now)) v += d.s.marca || 0; m *= 1 + v; }
  return m;
}
/** mitigação no defensor: { n, refl } (refl = dano devolvido ao atacante — Postura) */
export function mitigate(d, n, a, kind, now) {
  if (!d) return { n, refl: 0 };
  if (on(d.b.iframeUntil, now)) return { n: 0, refl: 0, why: 'iframe' };
  if (on(d.b.muralhaUntil, now) && kind !== 'melee') return { n: 0, refl: 0, why: 'muralha' };
  if (on(d.b.posturaUntil, now)) { d.b.posturaUntil = 0; return { n: 0, refl: Math.round(n * (d.b.refl || 2)), why: 'postura' }; }
  let x = n * (d.kit?.dmgTaken ?? 1);
  if (d.kit?.passiva?.tipo === 'frontal' && a && d.tgt === a) x *= 1 - d.kit.passiva.red;
  x = Math.max(1, Math.round(x));
  if (d.escudo > 0) { const ab = Math.min(d.escudo, x); d.escudo -= ab; x -= ab; }
  if (on(d.b.imortalUntil, now) && d.hp - x < 1) x = Math.max(0, d.hp - 1);
  return { n: x, refl: 0 };
}
/** efeitos ao acertar (golpe ou poder): escudo, veneno, queima, cura da Fera */
export function onHitFx(a, d, dealt, now) {
  if (!a || dealt <= 0) return;
  const k = a.kit; const P = k?.passiva;
  if (P?.tipo === 'escudo_acerto') a.escudo = Math.min(a.hpMax * P.teto, a.escudo + a.hpMax * P.frac);
  if (d) {
    const ven = P?.tipo === 'veneno' ? P : k?.var?.veneno;
    if (ven) { d.s.venenoUntil = now + ven.dur; d.s.venenoDps = ven.dps; }
    if (k?.var?.queima) { d.s.queimaUntil = now + k.var.queima.dur; d.s.queimaDps = k.var.queima.dps; }
  }
  if (on(a.b.curaUntil, now)) a.hp = Math.min(a.hpMax, a.hp + Math.max(1, Math.round(a.hpMax * (a.b.cura || 0))));
}
/** DoT (veneno/queima) e golpes agendados (meteoro, chuva, giro): devolve [{ alvo, n, kind }] a aplicar */
export function tick(f, now, out) {
  if (now >= f.nextTick) {
    f.nextTick = now + 1000;
    f.nexa = Math.min(f.nexaMax, f.nexa + NEXA_REGEN * (f.kit?.passiva?.tipo === 'nexa_regen' ? 1 + f.kit.passiva.mult : 1));
    let dot = 0; if (on(f.s.venenoUntil, now)) dot += f.s.venenoDps || 0; if (on(f.s.queimaUntil, now)) dot += f.s.queimaDps || 0;
    if (dot > 0) out.push({ alvo: f, n: dot, kind: 'dot' });
  }
  for (let i = f.pend.length - 1; i >= 0; i--) { const p = f.pend[i]; if (now >= p.at) { f.pend.splice(i, 1); out.push(p); } }
  return out;
}
/** decide e usa UM poder (o 1º pronto que faz sentido). api: { hit(alvo, n, kind, extra), self, R, nearFoes() } — devolve o slot usado ou null */
export function botPower(f, foe, dist, now, api) {
  if (on(f.s.stunUntil, now)) return null;
  for (const slot of ['suprema', 'golpe_poderoso', 'ataque_area']) {
    if (now < (f.cd[slot] || 0) || f.nexa < SLOT_COST[slot]) continue;
    const p = f.kit.poderes[slot]; if (!want(f, p, foe, dist, now)) continue;
    f.cd[slot] = now + p.cd; f.nexa -= SLOT_COST[slot];
    f.uses[slot]++; use(f, p, foe, dist, now, api); return slot;
  }
  return null;
}
function want(f, p, foe, dist, now) {
  const t = p.tipo; const hpF = f.hp / f.hpMax;
  if (['muralha', 'postura', 'invisivel', 'teleporte', 'salto_tras'].includes(t)) return !!foe && dist <= 3 && (hpF < 0.8 || t === 'postura' || t === 'muralha');
  if (t === 'buff') return !!foe && dist <= 3.5 && (!p.imortal || hpF < 0.45); // Fúria de Lava: o bot guarda para quando está ferido
  if (!foe) return false;
  const reach = p.alcance ?? p.raio ?? 2.5;
  return dist <= reach;
}
function use(f, p, foe, dist, now, api) {
  const t = p.tipo; const kv = f.kit.var || {};
  const hit = (n, kind = 'proj', extra) => api.hit(foe, n, kind, extra);
  switch (t) {
    case 'projetil': {
      if (p.id === 'corte_azul' && kv.corteSalta) { hit(p.dano, 'proj', { salta: kv.corteSalta }); break; }
      hit(p.dano, 'proj', p.puxa ? { puxa: true } : null); break; }
    case 'leque': for (let i = 0; i < p.n; i++) hit(p.dano, 'proj'); break;
    case 'cone': hit(p.dano, 'melee'); break;
    case 'investida': hit(p.dano, 'melee', { stunMs: p.stunMs }); break;
    case 'maldicao': hit(p.dano, 'proj', { lento: p.lento, vuln: p.vuln, dur: p.dur }); break;
    case 'dreno': { const dealt = hit(p.dano, 'proj'); f.hp = Math.min(f.hpMax, f.hp + (dealt > 0 ? p.cura : 0)); break; }
    case 'linha': hit(p.dano, 'area'); break;
    case 'area_self': hit(p.dano, 'melee', { stunMs: p.stunMs, area: p.raio }); break;
    case 'salto': hit(p.dano, 'melee', { stunMs: p.stunMs, area: p.raio }); break;
    case 'portal': f.pend.push({ at: now + p.atrasoMs, alvo: foe, n: p.dano, kind: 'area', from: f }); break;
    case 'area_alvo': {
      if (p.ticks) { const per = Math.round(p.dano / p.ticks); for (let i = 0; i < p.ticks; i++) f.pend.push({ at: now + (i + 1) * (p.durMs / p.ticks), alvo: foe, n: per, kind: 'area', from: f }); }
      else f.pend.push({ at: now + (p.atrasoMs || 0), alvo: foe, n: p.dano, kind: 'area', from: f });
      break; }
    case 'giro': { const per = Math.round(p.dano / p.ticks); for (let i = 0; i < p.ticks; i++) f.pend.push({ at: now + i * (p.durMs / p.ticks), alvo: foe, n: per, kind: 'melee', from: f, raio: p.raio }); break; }
    case 'mil_cortes': { const per = Math.round(p.dano / p.alvos); for (let i = 0; i < p.alvos; i++) f.pend.push({ at: now + i * 120, alvo: foe, n: per, kind: 'melee', from: f }); f.b.iframeUntil = now + p.alvos * 120; break; }
    case 'buff':
      if (p.dmg) { f.b.dmg = p.dmg; f.b.dmgUntil = now + p.dur; }
      if (p.imortal) f.b.imortalUntil = now + p.dur;
      if (p.curaAcerto) { f.b.cura = p.curaAcerto; f.b.curaUntil = now + p.dur; }
      if (p.vel) { f.b.vel = p.vel; f.b.velUntil = now + p.dur; }
      if (p.id === 'grito_guerra' && kv.gritoEnfraquece && foe && dist <= kv.gritoEnfraquece.raio) { foe.s.fraco = kv.gritoEnfraquece.mult; foe.s.fracoUntil = now + kv.gritoEnfraquece.dur; }
      break;
    case 'muralha': f.b.muralhaUntil = now + p.dur; break;
    case 'postura': f.b.posturaUntil = now + p.dur; f.b.refl = p.refl; break;
    case 'invisivel': f.b.hiddenUntil = now + p.dur; api.hide?.(f, p.dur); break;
    case 'teleporte': f.b.iframeUntil = now + p.iframeMs; f.b.kiteUntil = now + 1200; break;
    case 'salto_tras': f.b.kiteUntil = now + 1200; hit(p.armadilha.dano, 'area', { lento: p.armadilha.lento, dur: p.armadilha.dur }); break;
    case 'marca': if (foe) { foe.s.marca = p.mult; foe.s.marcaUntil = now + p.dur; } break;
    default: break;
  }
}
/** aplica status de controle vindos de um poder (lentidão/vulnerável/atordoado) no lutador alvo */
export function applyExtra(d, extra, now) {
  if (!d || !extra) return;
  if (extra.stunMs) d.s.stunUntil = Math.max(d.s.stunUntil || 0, now + extra.stunMs);
  if (extra.lento) { d.s.lento = extra.lento; d.s.lentoUntil = now + (extra.dur || 2000); }
  if (extra.vuln) { d.s.vuln = extra.vuln; d.s.vulnUntil = now + (extra.dur || 2000); }
}

/**
 * DUELO 1×1 bot × bot (mesmas regras do rival na arena): golpe básico na cadência do rival (900 ms × personalidade),
 * dano do golpe = ataque 13 × 1,6 × (0,8–1,2) × 0,6 (entre rivais) × personalidade; poderes pelo botPower.
 * Lutadores colados (distância 1,4). Afastamento (Teleporte/Salto pra trás) = 1,2 s sem golpe básico de quem foi despistado
 * e só poderes de alcance >= 3 de quem afastou (o que um bot de longe ganharia). Empate em 120 s → quem tem mais % de vida.
 */
export function simDuel(kA, kB, o = {}) {
  const R = o.R || Math.random; const C = o.C || {}; const dt = 100; const persoA = o.persoA || {}; const persoB = o.persoB || {};
  const A = newFighter(kA, kA.hp, 1, 0, R); const B = newFighter(kB, kB.hp, 1, 0, R);
  A.tgt = B; B.tgt = A; A.nextSwing = R() * 600; B.nextSwing = R() * 600; A.perso = persoA; B.perso = persoB;
  const swing = (f) => Math.round((C.ataqueBot ?? 13) * 1.6 * (C.danoMult ?? 1) * (0.8 + R() * 0.4) * (C.danoEntreRivais ?? 0.6) * (f.perso.danoRivalMult || 1));
  const deal = (att, def, n, kind, extra, now) => {
    if (!def || def.hp <= 0) return 0;
    if (att && kind !== 'dot' && on(att.b.hiddenUntil, now)) att.b.hiddenUntil = 0; // atacar revela (Bomba de Fumaça)
    if (on(def.b.hiddenUntil, now) && kind !== 'dot' && kind !== 'area') return 0;
    const raw = kind === 'dot' ? n : Math.max(1, Math.round(n * (att ? outMult(att, def, now, { dist: on(att.b.kiteUntil, now) || on(def.b.kiteUntil, now) ? 5 : 1.4 }) : 1)));
    const m = kind === 'dot' ? { n: raw, refl: 0 } : mitigate(def, raw, att, kind, now);
    def.hp -= m.n; if (m.refl && att) { const r2 = mitigate(att, m.refl, def, 'melee', now); att.hp -= r2.n; }
    if (m.n > 0 && att && kind !== 'dot') { onHitFx(att, def, m.n, now); applyExtra(def, extra, now); }
    if (extra?.salta) { /* duelo 1×1: o salto não tem outro alvo */ }
    return m.n;
  };
  let now = 0; const T = o.maxMs || 120000; const tmp = [];
  while (now < T && A.hp > 0 && B.hp > 0) {
    now += dt;
    for (const [f, g] of [[A, B], [B, A]]) {
      if (f.hp <= 0 || g.hp <= 0) continue;
      tmp.length = 0; tick(f, now, tmp);
      for (const e of tmp) { if (e.alvo === f) { f.hp -= e.n; if (on(f.b.imortalUntil, now) && f.hp < 1) f.hp = 1; } else deal(e.from || g, e.alvo, e.n, e.kind, null, now); }
      if (on(f.s.stunUntil, now)) continue;
      const kiting = on(g.b.kiteUntil, now) || on(f.b.kiteUntil, now); const dist = kiting ? 5 : 1.4;
      botPower(f, on(g.b.hiddenUntil, now) ? null : g, dist, now, { hit: (alvo, n, kind, extra) => deal(f, alvo, n, kind, extra, now), hide: () => {} });
      if (now >= f.nextSwing && !kiting && !on(g.b.hiddenUntil, now)) {
        f.nextSwing = now + (C.cadenciaMs ?? 900) * (f.perso.cadMult || 1) * (0.85 + R() * 0.3);
        deal(f, g, swing(f), 'melee', null, now);
      }
    }
  }
  const fa = A.hp / A.hpMax, fb = B.hp / B.hpMax;
  const win = A.hp > 0 && B.hp <= 0 ? 'A' : B.hp > 0 && A.hp <= 0 ? 'B' : fa === fb ? (R() < 0.5 ? 'A' : 'B') : fa > fb ? 'A' : 'B';
  return { win, ms: now, hpA: Math.max(0, Math.round(A.hp)), hpB: Math.max(0, Math.round(B.hp)), usesA: A.uses, usesB: B.uses, timeout: now >= T };
}
/** todos os kits jogáveis (9 heróis; o Guerreiro nas 6 variantes) */
export function allKits() {
  const out = [];
  for (const id of Object.keys(KITS)) {
    if (id === 'cavaleiro') for (const v of ['azul', 'fogo', 'raio', 'veneno', 'terra', 'vento']) out.push(kitFor(id, v));
    else out.push(kitFor(id));
  }
  return out;
}
export { SLOTS };
