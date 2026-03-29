// Data loading module - loads JSON data files
const DataService = {
  warbands: null,
  equipment: null, // flat array from mergedEquipment.json
  skills: null,
  injuries: null,
  advancement: null,
  spells: null,
  hiredSwords: null,
  specialRules: null,

  CATEGORY_NAMES: {
    melee:       'Hand-to-Hand Combat Weapons',
    missile:     'Missile Weapons',
    blackpowder: 'Blackpowder Weapons',
    armour:      'Armour',
    misc:        'Miscellaneous Equipment',
    animal:      'Animals',
  },

  // Maps legacy category IDs (used in warbands.json until Phase 3) to Uncle Mel types
  LEGACY_CATEGORY_MAP: {
    hand_to_hand:  ['melee'],
    missiles:      ['missile', 'blackpowder'],
    armour:        ['armour'],
    miscellaneous: ['misc'],
  },

  slugify(str) {
    return str
      .toLowerCase()
      .replace(/[''']/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
  },

  async loadAll() {
    const v = 'v=9';
    const [warbands, equipment, skills, injuries, advancement, spells, hiredSwords, specialRules] = await Promise.all([
      this.fetchJSON('data/warbands.json?' + v),
      this.fetchJSON('data/mergedEquipment.json?' + v),
      this.fetchJSON('data/skills.json?' + v),
      this.fetchJSON('data/injuries.json?' + v),
      this.fetchJSON('data/advancement.json?' + v),
      this.fetchJSON('data/spells.json?' + v),
      this.fetchJSON('data/hired_swords.json?' + v),
      this.fetchJSON('data/special_rules.json?' + v),
    ]);

    this.warbands = warbands.warbands;
    // Process flat array: generate slug id, flatten specialRules to rules string, normalise casing
    this.equipment = equipment.map(item => {
      const id = this.slugify(item.name);
      const rules = (item.specialRules || [])
        .map(r => (r.ruleAbbreviated || r.ruleFull || '').replace(/<[^>]+>/g, '').trim())
        .filter(Boolean)
        .join(' ');
      const caveat = item.caveat ?? item.Caveat ?? '';
      const modelCaveat = item.modelCaveat ?? item.modelcaveat ?? '';
      return { ...item, id, rules, caveat, modelCaveat };
    });
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
    return this.equipment.find(i => i.id === itemId) || null;
  },

  getEquipmentByCategory(categoryId) {
    const types = this.LEGACY_CATEGORY_MAP[categoryId] || [categoryId];
    return this.equipment.filter(i => types.includes(i.type));
  },

  getAllEquipment() {
    return this.equipment;
  },

  getEquipmentCategoryName(typeOrCategoryId) {
    if (this.CATEGORY_NAMES[typeOrCategoryId]) return this.CATEGORY_NAMES[typeOrCategoryId];
    const types = this.LEGACY_CATEGORY_MAP[typeOrCategoryId];
    if (types?.length === 1) return this.CATEGORY_NAMES[types[0]] || typeOrCategoryId;
    if (types?.length > 1) return types.map(t => this.CATEGORY_NAMES[t] || t).join(' / ');
    return typeOrCategoryId;
  },

  getEquipmentTypes() {
    return [...new Set(this.equipment.map(i => i.type))];
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
