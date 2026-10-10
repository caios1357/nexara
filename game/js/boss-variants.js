/**
 * NEXARA — DRAGON BERÇO · 6 DRAGÕES GIGANTES (um por distrito) — variantes DATA-DRIVEN do chefe da Arena.
 *
 * Os 6 gigantes usam o MESMO motor de IA/telegraph do GIGANTE VERDE (todo golpe: aviso no chão → preparo → impacto → recuperação),
 * mas cada um tem em data/dragoes.json (chefes[].poder) seus próprios números: escala, corpo, velocidade, ritmo, multiplicadores por ataque,
 * ataques liberados por fase e valores absolutos (ex.: nº de poças, nº de anéis). Aqui só se DERIVA a config final (pura, sem Three.js/DOM).
 *
 *   poder = { corpo, velocidade, intervalo, ataques: { golpe: { range: 1.1, telegraphMs: 0.9, ... }, ... }, definir: { pocas: { count: 5 } }, fases: [ [..ataques fase1..], ... ] }
 *   (ataques[x][campo] = MULTIPLICADOR do campo numérico; definir[x][campo] = valor absoluto)
 * O dano segue a regra da Arena: atkScale do chefe (= 2,5× o dano BASE) × atkMult do ataque — o telegraph/tempo de aviso NUNCA é encurtado abaixo do piso.
 */
export const TELEGRAPH_MIN_MS = 700; // piso de aviso: o herói sempre pode reagir (esquiva dura ~0,3 s)

const cache = new Map();

/** config final do chefe para este monstro (base = gameplay-config.arenaBoss); sem variante → a própria base (nada muda para o GIGANTE VERDE) */
export function bossCfgFor(mon, base) {
  const P = mon && mon.dragonPoder;
  if (!P || !base) return base;
  const key = mon.dragonId || 'x'; const hit = cache.get(key);
  if (hit && hit.base === base) return hit.cfg;
  const cfg = deriveBossCfg(base, P);
  cache.set(key, { base, cfg });
  return cfg;
}

export function deriveBossCfg(base, P) {
  const c = JSON.parse(JSON.stringify(base));
  if (P.corpo > 0) c.bodyRadius = +(c.bodyRadius * P.corpo).toFixed(3);
  if (P.altura > 0) c.visualHeight = +(c.visualHeight * P.altura).toFixed(3);
  if (P.velocidade > 0) c.walkSpeed = +(c.walkSpeed * P.velocidade).toFixed(3);
  if (P.intervalo > 0 && Array.isArray(c.attackGapMs)) c.attackGapMs = c.attackGapMs.map((v) => Math.round(v * P.intervalo));
  if (P.aggroRange > 0) c.aggroRange = P.aggroRange;
  const all = { ...c.attacks, ...c.extraAttacks };
  for (const [id, mods] of Object.entries(P.ataques || {})) {
    const A = c.attacks[id] || c.extraAttacks[id]; if (!A) continue;
    for (const [f, k] of Object.entries(mods)) if (typeof A[f] === 'number' && k > 0) A[f] = +(A[f] * k).toFixed(3);
  }
  for (const [id, vals] of Object.entries(P.definir || {})) { const A = c.attacks[id] || c.extraAttacks[id]; if (A) Object.assign(A, vals); }
  // piso do aviso (telegraph) em todos os ataques com dano
  for (const A of [...Object.values(c.attacks), ...Object.values(c.extraAttacks)]) if (typeof A.telegraphMs === 'number' && (A.atkMult || 0) > 0) A.telegraphMs = Math.max(TELEGRAPH_MIN_MS, A.telegraphMs);
  if (Array.isArray(P.fases)) P.fases.forEach((list, i) => { if (c.phases[i] && Array.isArray(list)) c.phases[i].attacks = list.filter((a) => all[a]); });
  if (P.gapFinal > 0) { const f = c.phases[c.phases.length - 1]; if (f) f.gapScale = P.gapFinal; }
  c._variante = P.id || true;
  return c;
}

/** resumo LEGÍVEL dos poderes (para a tela do Berço), com os números reais da config derivada */
export function describeBoss(base, chefe) {
  const mon = { dragonId: chefe.id, dragonPoder: chefe.poder };
  const c = chefe.poder ? bossCfgFor(mon, base) : base;
  const NAMES = { golpe: 'GOLPE PESADO', cauda: 'CAUDA', investida: 'INVESTIDA', sopro: 'SOPRO', area: 'ATAQUE DE ÁREA', aneis: 'ANÉIS DE IMPACTO', pocas: 'POÇAS', rugido: 'RUGIDO' };
  const A = { ...c.attacks, ...c.extraAttacks };
  const used = new Set(); (c.phases || []).forEach((p) => p.attacks.forEach((a) => used.add(a)));
  const out = [];
  for (const id of used) {
    const a = A[id]; if (!a) continue; const L = [`aviso ${a.telegraphMs} ms (marcador no chão)`];
    if (a.range) L.push(`alcance ${a.range} tiles`); if (a.radius) L.push(`raio ${a.radius} tiles`); if (a.maxDistance) L.push(`avanço ${a.maxDistance} tiles`);
    if (a.rings) L.push(`${a.rings} anéis`); if (a.count) L.push(`${a.count} poças`); if (a.atkMult) L.push(`dano ×${a.atkMult}`);
    const fase = (c.phases || []).findIndex((p) => p.attacks.includes(id)) + 1;
    out.push({ id, nome: a.nome || NAMES[id] || id, fase, linhas: L });
  }
  return { cfg: c, ataques: out, fases: (c.phases || []).map((p) => ({ nome: p.nome, em: Math.round(p.at * 100), ataques: p.attacks })), corpo: c.bodyRadius, altura: c.visualHeight, velocidade: c.walkSpeed };
}
