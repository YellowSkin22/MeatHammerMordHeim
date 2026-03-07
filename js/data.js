// Data loading module - loads JSON data files
const DataService = {
  warbands: null,
  equipment: null,
  skills: null,
  injuries: null,
  advancement: null,
  spells: null,
  hiredSwords: null,
  specialRules: null,

  async loadAll() {
    const v = 'v=7';
    const [warbands, equipment, skills, injuries, advancement, spells, hiredSwords, specialRules] = await Promise.all([
      this.fetchJSON('data/warbands.json?' + v),
      this.fetchJSON('data/equipment.json?' + v),
      this.fetchJSON('data/skills.json?' + v),
      this.fetchJSON('data/injuries.json?' + v),
      this.fetchJSON('data/advancement.json?' + v),
      this.fetchJSON('data/spells.json?' + v),
      this.fetchJSON('data/hired_swords.json?' + v),
      this.fetchJSON('data/special_rules.json?' + v),
    ]);

    this.warbands = warbands.warbands;
    this.equipment = equipment.categories;
    this.skills = skills.skillCategories;
    this.injuries = injuries;
    this.advancement = advancement;
    this.spells = spells.spellLists;
    this.hiredSwords = hiredSwords.hiredSwords;
    this.specialRules = specialRules.specialRules;
  },

  async fetchJSON(path) {
    const resp = await fetch(path);
    if (!resp.ok) throw new Error(`Failed to load ${path}`);
    return resp.json();
  },

  getWarband(id) {
    return this.warbands.find(w => w.id === id);
  },

  getEquipmentItem(itemId) {
    for (const cat of Object.values(this.equipment)) {
      const item = cat.items.find(i => i.id === itemId);
      if (item) return item;
    }
    return null;
  },

  getEquipmentByCategory(categoryId) {
    return this.equipment[categoryId]?.items || [];
  },

  getAllEquipment() {
    const all = [];
    for (const cat of Object.values(this.equipment)) {
      all.push(...cat.items);
    }
    return all;
  },

  getSkill(skillId) {
    for (const cat of Object.values(this.skills)) {
      const skill = cat.skills.find(s => s.id === skillId);
      if (skill) return skill;
    }
    return null;
  },

  getSkillsByCategory(categoryId) {
    return this.skills[categoryId]?.skills || [];
  },

  getExpThreshold(level) {
    const thresholds = this.advancement.heroAdvancement.expThresholds;
    return level < thresholds.length ? thresholds[level] : thresholds[thresholds.length - 1] + (level - thresholds.length + 1) * 10;
  },

  getMaxStat(stat) {
    return this.advancement.maxStats[stat] || 10;
  },

  getSpell(spellId) {
    for (const list of Object.values(this.spells)) {
      const spell = list.spells.find(s => s.id === spellId);
      if (spell) return spell;
    }
    return null;
  },

  getSpellsByList(listId) {
    return this.spells[listId]?.spells || [];
  },

  getHiredSwordTemplate(type) {
    return this.hiredSwords.find(hs => hs.type === type);
  },

  getSpecialRuleDescription(ruleName) {
    return this.specialRules?.[ruleName] || '';
  },

  getAvailableHiredSwords(warbandId) {
    return this.hiredSwords.filter(hs => {
      if (hs.warbandAllowList && hs.warbandAllowList.length > 0) {
        return hs.warbandAllowList.includes(warbandId);
      }
      return !hs.warbandRestrictions || !hs.warbandRestrictions.includes(warbandId);
    });
  }
};
