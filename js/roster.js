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
    const result = DataService.getWarband(warbandId);
    if (!result) throw new Error('Unknown warband: ' + warbandId);
    const { warbandFile } = result;

    return {
      id: Storage.generateId(),
      name,
      warbandId,
      gold: warbandFile.warbandRules?.startingGc ?? 500,
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

  // fighter: raw Uncle-Mel fighter object from warbandFile.fighters[]
  // warbandFile: raw warband file object
  // subfaction: display name string or null
  createWarrior(fighter, warbandFile, subfaction) {
    const isHero    = fighter.type === 'hero';
    const stats     = this._mapStats(fighter.statblock);
    const specialRules = (fighter.specialRules || []).map(r => r.rulename).filter(Boolean);
    const skillAccess  = DataService.resolveSkillAccess(fighter, subfaction);
    const warbandName  = subfaction || warbandFile.name;
    const spellAccess  = isHero ? DataService.getSpellAccess(warbandName, fighter.name) : [];

    const warrior = {
      ...this._baseWarrior(
        Storage.generateId(), fighter.id, fighter.name,
        stats, fighter.costGc ?? 0, specialRules,
        isHero ? (fighter.startingXp ?? 0) : 0
      ),
      isHero,
      race: fighter.race || warbandFile.race || 'human',
    };

    if (!isHero) warrior.groupSize = 1;
    if (isHero)  {
      warrior.skillAccess = skillAccess;
      warrior.spellAccess = spellAccess;
    }

    return warrior;
  },

  // templateKey: the Uncle-Mel hiredSwords object key (e.g. 'dwarf-troll-slayer')
  createHiredSword(templateKey) {
    const hs = DataService.getHiredSwordTemplate(templateKey);
    if (!hs) return null;

    const stats        = this._mapStats(hs.statblock);
    const specialRules = (hs.specialRules || []).map(r => r.rulename).filter(Boolean);
    const skillAccess  = Object.entries(hs.skillAccess || {})
      .filter(([k, v]) => v && DataService.SKILL_KEY_TO_SUBTYPE[k])
      .map(([k]) => DataService.SKILL_KEY_TO_SUBTYPE[k]);
    const parsedCost   = parseInt(hs.cost);

    return {
      ...this._baseWarrior(
        Storage.generateId(), templateKey, hs.name,
        stats, isNaN(parsedCost) ? 0 : parsedCost, specialRules, 0
      ),
      isHero: true,
      isHiredSword: true,
      race: hs.race || 'human',
      skillAccess,
      spellAccess: [],  // hired sword spell access handled by specialRules fallback in hasSpellAccess()
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
    const maxVal = DataService.getMaxStat(stat, warrior.race || 'human');
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
        if (item) {
          const cost = item.cost?.cost;
          if (typeof cost !== 'number') console.warn(`calculateTotalCost: no numeric cost for "${item.name}" (${JSON.stringify(item.cost)})`);
          total += cost ?? 0;
        }
      }
    }
    for (const hg of roster.henchmen) {
      const n = hg.groupSize || 1;
      total += hg.cost * n;
      for (const eq of hg.equipment) {
        const item = DataService.getEquipmentItem(eq.id);
        if (item) {
          const cost = item.cost?.cost;
          if (typeof cost !== 'number') console.warn(`calculateTotalCost: no numeric cost for "${item.name}" (${JSON.stringify(item.cost)})`);
          total += (cost ?? 0) * n;
        }
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
  },

  // Converts Uncle-Mel lowercase statblock to warrior stats object.
  _mapStats(statblock) {
    if (!statblock) return { m:4, ws:3, bs:3, s:3, t:3, w:1, i:3, a:1, ld:7 };
    return {
      m:  statblock.m  ?? 4,
      ws: statblock.ws ?? 3,
      bs: statblock.bs ?? 3,
      s:  statblock.s  ?? 3,
      t:  statblock.t  ?? 3,
      w:  statblock.w  ?? 1,
      i:  statblock.i  ?? 3,
      a:  statblock.a  ?? 1,
      ld: statblock.ld ?? 7,
    };
  },
};
