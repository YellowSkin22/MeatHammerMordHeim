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

  // Maps legacy category IDs (used in hired_swords.json until Phase 4) to Uncle Mel types
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

  _stripHtml(str) {
    if (!str) return '';
    return str
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s{2,}/g, ' ')
      .trim();
  },

  async loadAll() {
    const v = 'v=10';
    const [warbands, equipment, skills, injuries, advancement, magic, hiredSwords, specialRules] = await Promise.all([
      this.fetchJSON('data/warbands.json?' + v),
      this.fetchJSON('data/mergedEquipment.json?' + v),
      this.fetchJSON('data/skills.json?' + v),
      this.fetchJSON('data/injuries.json?' + v),
      this.fetchJSON('data/advancement.json?' + v),
      this.fetchJSON('data/magic.json?' + v),
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
    // Process spells from magic.json (Uncle Mel's raw format)
    this.spells = this._processSpellLists(magic.spellLists || {});
    // Build spellAccess per warband hero at load time
    this._buildSpellAccess(magic);
    this.hiredSwords = hiredSwords.hiredSwords;
    this.specialRules = specialRules.specialRules;
  },

  _processSpellLists(spellLists) {
    const result = {};
    for (const [listId, list] of Object.entries(spellLists)) {
      const spells = (list.spells || []).map(s => {
        const id = s.id || this.slugify(s.name);
        const description = this._stripHtml(s.ruleAbbreviated || s.ruleFull || '');
        return { id, name: s.name, difficulty: s.difficulty, description };
      });
      result[listId] = { name: list.name, spells };
    }
    return result;
  },

  _buildSpellAccess(magic) {
    // Build lookup: { "Warband Name": { "Fighter Name": ["list-id", ...] } }
    const spellMap = {};
    for (const [listId, list] of Object.entries(magic.spellLists || {})) {
      for (const entry of (list.permittedWarbands || [])) {
        const wb = entry.warband || '';
        const ft = entry.fighter || '';
        if (!spellMap[wb]) spellMap[wb] = {};
        if (!spellMap[wb][ft]) spellMap[wb][ft] = [];
        spellMap[wb][ft].push(listId);
      }
    }
    // Apply computed spellAccess to each warband hero template
    for (const warband of (this.warbands || [])) {
      for (const hero of warband.heroes) {
        hero.spellAccess = this._findSpellAccess(spellMap, warband.name, hero.name);
      }
    }
  },

  _findSpellAccess(spellMap, warbandName, fighterName) {
    const wbKeys = Object.keys(spellMap);
    const wbKey = wbKeys.find(k => k === warbandName)
      || wbKeys.find(k => k.toLowerCase() === warbandName.toLowerCase())
      || wbKeys.find(k => warbandName.toLowerCase().includes(k.toLowerCase()))
      || wbKeys.find(k => k.toLowerCase().includes(warbandName.toLowerCase()));
    if (!wbKey) return [];

    const ftMap = spellMap[wbKey];
    const ftKeys = Object.keys(ftMap);
    const ftKey = ftKeys.find(k => k === fighterName)
      || ftKeys.find(k => k.toLowerCase() === fighterName.toLowerCase())
      || ftKeys.find(k => fighterName.toLowerCase().includes(k.toLowerCase()))
      || ftKeys.find(k => k.toLowerCase().includes(fighterName.toLowerCase()));
    if (!ftKey) return [];

    return ftMap[ftKey];
  },

  canWarbandAccess(item, warbandName) {
    const permitted = item.permittedWarbands;
    const excluded  = item.excludedWarbands;

    // Check exclusions first
    if (Array.isArray(excluded) && excluded.includes(warbandName)) return false;

    // Check permissions
    if (!permitted || (Array.isArray(permitted) && permitted.length === 0) || permitted === 'all') {
      return true;
    }
    if (Array.isArray(permitted)) {
      return permitted.includes(warbandName);
    }
    // Single string warband name
    return permitted === warbandName;
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
