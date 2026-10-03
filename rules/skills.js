/** Nexara — skill progression (pure logic) */
export function createSkillsFromRace(skillsDef, race) {
  const out = {};
  for (const s of skillsDef.skills) {
    const bonus = (race.skill_bonuses && race.skill_bonuses[s.id]) || 0;
    out[s.id] = { level: s.base + bonus, xp: 0 };
  }
  return out;
}

export function trainSkill(skills, skillId, skillsDef, amount = 1) {
  if (!skills[skillId]) return { leveled: false };
  skills[skillId].xp += amount;
  let leveled = false;
  const thr = skillsDef.level_up_threshold || 20;
  const max = 100;
  while (skills[skillId].xp >= thr && skills[skillId].level < max) {
    skills[skillId].xp -= thr;
    skills[skillId].level += 1;
    leveled = true;
  }
  return { leveled, skillId, level: skills[skillId].level };
}

export function skillBonusDamage(skillLevel) {
  return Math.floor((skillLevel || 10) / 5);
}
