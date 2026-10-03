/** Nexara — loot rolls */
export function rollLoot(lootTable) {
  const drops = [];
  if (!lootTable) return drops;
  for (const entry of lootTable) {
    if (Math.random() <= entry.chance) {
      const [lo, hi] = entry.qty;
      const qty = lo + Math.floor(Math.random() * (hi - lo + 1));
      if (qty > 0) drops.push({ item_id: entry.item_id, qty });
    }
  }
  return drops;
}

export function addToInventory(inv, itemDef, qty) {
  if (!itemDef) return false;
  if (itemDef.stackable) {
    const existing = inv.find((i) => i.item_id === itemDef.id);
    if (existing) {
      existing.qty = Math.min(itemDef.max_stack, existing.qty + qty);
      return true;
    }
  }
  inv.push({ item_id: itemDef.id, qty, equipped: false });
  return true;
}

export function removeFromInventory(inv, itemId, qty = 1) {
  const idx = inv.findIndex((i) => i.item_id === itemId);
  if (idx < 0) return false;
  inv[idx].qty -= qty;
  if (inv[idx].qty <= 0) inv.splice(idx, 1);
  return true;
}

export function countItem(inv, itemId) {
  return inv.filter((i) => i.item_id === itemId).reduce((s, i) => s + i.qty, 0);
}
