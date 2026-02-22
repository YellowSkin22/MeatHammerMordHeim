// Data loading module - loads JSON data files
const DataService = {
  warbands: null,
  equipment: null,
  skills: null,
  injuries: null,
  advancement: null,
  spells: null,

  async loadAll() {
    const [warbands, equipment, skills, injuries, advancement, spells] = await Promise.all([
      this.fetchJSON('data/warbands.json'),
      this.fetchJSON('data/equipment.json'),
      this.fetchJSON('data/skills.json'),
      this.fetchJSON('data/injuries.json'),
      this.fetchJSON('data/advancement.json'),
      this.fetchJSON('data/spells.json'),
    ]);

    this.warbands = warbands.warbands;
    this.equipment = equipment.categories;
    this.skills = skills.skillCategories;
    this.injuries = injuries;
    this.advancement = advancement;
    this.spells = spells.spellLists;
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
  }
};
