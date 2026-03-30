// Roster model and logic
const RosterModel = {

  // Returns shared base fields for every warrior object.
  // Callers MUST spread this and at minimum override `isHero` (defaults false).
  // `name` defaults to `typeName`; callers preserving an existing warrior's name
  // (e.g. promoteHenchmanToHero) must also override `name`.
  // `equipment`, `skills`, `spells`, `injuries`, and `notes` are fresh empty
  // values; callers carrying over existing data must override those fields
  // (use deep clones for arrays).
  // Throws TypeError if `specialRules` is not an array — callers passing
  // external/synced data should normalise with `|| []` before calling.
  _baseWarrior(id, type, typeName, stats, cost, specialRules, experience) {
    if (!Array.isArray(specialRules)) {
      throw new TypeError(
        `_baseWarrior: expected specialRules to be an array, got ${typeof specialRules} for type "${type}"`
      );
    }
    return {
      id,
      type,
      typeName,
      name: typeName,
      isHero: false,
      stats: { ...stats },
      baseStats: { ...stats },
      equipment: [],
      skills: [],
      spells: [],
      injuries: [],
      experience: experience ?? 0,
      advancementCount: 0,
      missNextGame: false,
      cost,
      specialRules: [...specialRules],
      notes: '',
    };
  },

  createRoster(name, warbandId) {
    const warband = DataService.getWarband(warbandId);
    if (!warband) throw new Error('Unknown warband: ' + warbandId);

    return {
      id: Storage.generateId(),
      name,
      warbandId,
      gold: warband.startingGold,
      wyrdstone: 0,
      heroes: [],
      henchmen: [],
      hiredSwords: [],
      customWarriors: [],
      battleLog: [],
      notes: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  },

  createWarrior(templateType, isHero, warband) {
    const templates = isHero ? warband.heroes : warband.henchmen;
    const template = templates.find(t => t.type === templateType);
    if (!template) return null;

    const warrior = {
      ...this._baseWarrior(
        Storage.generateId(), template.type, template.name,
        template.stats, template.cost, template.specialRules || [],
        isHero ? (template.startingExp || 0) : 0
      ),
      isHero,
    };

    if (!isHero) warrior.groupSize = 1;

    return warrior;
  },

  createHiredSword(templateType) {
    const template = DataService.getHiredSwordTemplate(templateType);
    if (!template) return null;

    return {
      ...this._baseWarrior(
        Storage.generateId(), template.type, template.name,
        template.stats, template.cost, template.specialRules || [],
        template.startingExp || 0
      ),
      isHero: true,
      isHiredSword: true,
    };
  },

  createCustomWarrior(name, cost, stats, specialRules) {
    return {
      ...this._baseWarrior(
        Storage.generateId(), 'custom', name,
        stats, cost, specialRules, 0
      ),
      isHero: true,
      isCustom: true,
    };
  },

  promoteHenchmanToHero(henchman, skillAccess) {
    if (!Array.isArray(henchman.specialRules)) {
      console.warn(
        `promoteHenchmanToHero: henchman "${henchman.name}" (${henchman.type}) has no specialRules array (got ${typeof henchman.specialRules}). Defaulting to [].`
      );
    }
    if (henchman.experience == null) {
      console.warn(
        `promoteHenchmanToHero: henchman "${henchman.name}" (${henchman.type}) has no experience value. Defaulting to 0.`
      );
    }
    return {
      ...this._baseWarrior(
        Storage.generateId(), henchman.type, henchman.typeName,
        henchman.stats, henchman.cost, henchman.specialRules || [],
        henchman.experience
      ),
      name: henchman.name,
      isHero: true,
      isPromotedHenchman: true,
      equipment: JSON.parse(JSON.stringify(henchman.equipment || [])),
      injuries: JSON.parse(JSON.stringify(henchman.injuries || [])),
      notes: henchman.notes || '',
      skillAccess,
    };
  },

  addEquipment(warrior, itemId) {
    const item = DataService.getEquipmentItem(itemId);
    if (!item) return false;
    warrior.equipment.push({ id: itemId, name: item.name });
    return true;
  },

  removeEquipment(warrior, index) {
    warrior.equipment.splice(index, 1);
  },

  addSkill(warrior, skillId) {
    const skill = DataService.getSkill(skillId);
    if (!skill) return false;
    if (warrior.skills.find(s => s.id === skillId)) return false;
    warrior.skills.push({ id: skillId, name: skill.name });
    return true;
  },

  removeSkill(warrior, index) {
    warrior.skills.splice(index, 1);
  },

  addSpell(warrior, spellId) {
    const spell = DataService.getSpell(spellId);
    if (!spell) return false;
    if (!warrior.spells) warrior.spells = [];
    if (warrior.spells.find(s => s.id === spellId)) return false;
    warrior.spells.push({ id: spellId, name: spell.name });
    return true;
  },

  removeSpell(warrior, index) {
    if (!warrior.spells) return;
    warrior.spells.splice(index, 1);
  },

  addInjury(warrior, injuryName) {
    warrior.injuries.push({ name: injuryName, gameNumber: 0 });
  },

  removeInjury(warrior, index) {
    warrior.injuries.splice(index, 1);
  },

  modifyStat(warrior, stat, delta) {
    const maxVal = DataService.getMaxStat(stat);
    const newVal = warrior.stats[stat] + delta;
    if (newVal < 0 || newVal > maxVal) return false;
    warrior.stats[stat] = newVal;
    return true;
  },

  addExperience(warrior, amount) {
    warrior.experience += amount;
  },

  getHeroLevel(experience) {
    const thresholds = DataService.advancement.heroAdvancement.expThresholds;
    let level = 0;
    for (let i = 0; i < thresholds.length; i++) {
      if (experience >= thresholds[i]) level = i + 1;
      else break;
    }
    return level;
  },

  getNextThreshold(experience) {
    const thresholds = DataService.advancement.heroAdvancement.expThresholds;
    for (const t of thresholds) {
      if (experience < t) return t;
    }
    return experience + 10;
  },

  // Returns heroes, hiredSwords, and customWarriors as a single flat array.
  // Henchmen are kept separate because they represent groups and scale by
  // groupSize — their cost, rating, and member count all multiply by groupSize,
  // which hero-like warriors never do.
  // || [] guards handle legacy rosters saved before hiredSwords/customWarriors
  // arrays were introduced.
  _heroLike(roster) {
    return [...(roster.heroes || []), ...(roster.hiredSwords || []), ...(roster.customWarriors || [])];
  },

  calculateWarbandRating(roster) {
    let rating = 0;
    // Hero-like: 5 base + 1 per XP + 5 per equipment item.
    // NOTE: uses 1 pt/XP as a simplification; official Mordheim rules use 5 pts/XP.
    for (const w of this._heroLike(roster)) {
      rating += 5 + Number(w.experience) + w.equipment.length * 5;
    }
    // Henchmen: (5 + experience per model) × groupSize. Equipment not rated for henchmen.
    for (const hg of roster.henchmen) {
      const n = hg.groupSize || 1;
      rating += n * 5 + Number(hg.experience) * n;
    }
    return rating;
  },

  calculateTotalCost(roster) {
    let total = 0;
    for (const w of this._heroLike(roster)) {
      total += w.cost;
      for (const eq of w.equipment) {
        const item = DataService.getEquipmentItem(eq.id);
        if (item) total += item.cost?.cost ?? 0;
      }
    }
    for (const hg of roster.henchmen) {
      const n = hg.groupSize || 1;
      total += hg.cost * n;
      for (const eq of hg.equipment) {
        const item = DataService.getEquipmentItem(eq.id);
        if (item) total += (item.cost?.cost ?? 0) * n;
      }
    }
    return total;
  },

  getMemberCount(roster) {
    let count = this._heroLike(roster).length;
    for (const hg of roster.henchmen) count += hg.groupSize || 1;
    return count;
  },

  addBattle(roster, result, notes) {
    roster.battleLog.push({
      number: roster.battleLog.length + 1,
      result,
      notes: notes || '',
      date: new Date().toISOString(),
    });
  }
};
