// Roster model and logic
const RosterModel = {

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
      id: Storage.generateId(),
      type: template.type,
      typeName: template.name,
      name: template.name,
      isHero,
      stats: { ...template.stats },
      baseStats: { ...template.stats },
      equipment: [],
      skills: [],
      spells: [],
      injuries: [],
      experience: isHero ? (template.startingExp || 0) : 0,
      advancementCount: 0,
      missNextGame: false,
      cost: template.cost,
      specialRules: [...(template.specialRules || [])],
    };

    if (!isHero) {
      warrior.groupSize = 1;
    }

    return warrior;
  },

  createHiredSword(templateType) {
    const template = DataService.getHiredSwordTemplate(templateType);
    if (!template) return null;

    return {
      id: Storage.generateId(),
      type: template.type,
      typeName: template.name,
      name: template.name,
      isHero: true,
      isHiredSword: true,
      stats: { ...template.stats },
      baseStats: { ...template.stats },
      equipment: [],
      skills: [],
      spells: [],
      injuries: [],
      experience: template.startingExp || 0,
      advancementCount: 0,
      missNextGame: false,
      cost: template.cost,
      specialRules: [...(template.specialRules || [])],
    };
  },

  createCustomWarrior(name, cost, stats, specialRules) {
    return {
      id: Storage.generateId(),
      type: 'custom',
      typeName: name,
      name: name,
      isHero: true,
      isCustom: true,
      stats: { ...stats },
      baseStats: { ...stats },
      equipment: [],
      skills: [],
      spells: [],
      injuries: [],
      experience: 0,
      advancementCount: 0,
      missNextGame: false,
      cost: cost,
      specialRules: [...specialRules],
    };
  },

  promoteHenchmanToHero(henchman, skillAccess) {
    return {
      id: Storage.generateId(),
      type: henchman.type,
      typeName: henchman.typeName,
      name: henchman.name,
      isHero: true,
      isPromotedHenchman: true,
      stats: { ...henchman.stats },
      baseStats: { ...henchman.stats },
      equipment: JSON.parse(JSON.stringify(henchman.equipment)),
      skills: [],
      spells: [],
      injuries: JSON.parse(JSON.stringify(henchman.injuries)),
      experience: henchman.experience,
      advancementCount: 0,
      missNextGame: false,
      cost: henchman.cost,
      specialRules: [...henchman.specialRules],
      skillAccess: skillAccess,
      notes: henchman.notes || '',
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

  calculateWarbandRating(roster) {
    let rating = 0;
    // heroes: 5 per experience point + 5 base
    for (const h of roster.heroes) {
      rating += 5 + (h.experience * 1);
      rating += h.equipment.length * 5;
    }
    // hired swords: same as heroes
    for (const hs of (roster.hiredSwords || [])) {
      rating += 5 + (hs.experience * 1);
      rating += hs.equipment.length * 5;
    }
    // custom warriors: same as heroes
    for (const cw of (roster.customWarriors || [])) {
      rating += 5 + (cw.experience * 1);
      rating += cw.equipment.length * 5;
    }
    // henchmen: 5 per member
    for (const hg of roster.henchmen) {
      const groupCount = hg.groupSize || 1;
      rating += groupCount * 5;
      rating += hg.experience * groupCount;
    }
    return rating;
  },

  calculateTotalCost(roster) {
    let total = 0;
    for (const h of roster.heroes) {
      total += h.cost;
      for (const eq of h.equipment) {
        const item = DataService.getEquipmentItem(eq.id);
        if (item) total += item.cost;
      }
    }
    for (const hs of (roster.hiredSwords || [])) {
      total += hs.cost;
      for (const eq of hs.equipment) {
        const item = DataService.getEquipmentItem(eq.id);
        if (item) total += item.cost;
      }
    }
    for (const cw of (roster.customWarriors || [])) {
      total += cw.cost;
      for (const eq of cw.equipment) {
        const item = DataService.getEquipmentItem(eq.id);
        if (item) total += item.cost;
      }
    }
    for (const hg of roster.henchmen) {
      const groupCount = hg.groupSize || 1;
      total += hg.cost * groupCount;
      for (const eq of hg.equipment) {
        const item = DataService.getEquipmentItem(eq.id);
        if (item) total += item.cost * groupCount;
      }
    }
    return total;
  },

  getMemberCount(roster) {
    let count = roster.heroes.length;
    count += (roster.hiredSwords || []).length;
    count += (roster.customWarriors || []).length;
    for (const hg of roster.henchmen) {
      count += hg.groupSize || 1;
    }
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
