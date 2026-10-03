/** Nexara — reputation (base numbers only in Phase 01) */
export function initReputation(factions) {
  const rep = {};
  for (const f of factions) {
    rep[f.id] = f.reputation_start ?? 0;
  }
  return rep;
}

export function addReputation(rep, factionId, amount) {
  if (!(factionId in rep)) rep[factionId] = 0;
  rep[factionId] += amount;
  return rep[factionId];
}
