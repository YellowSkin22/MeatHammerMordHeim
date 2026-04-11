// Data loading module — stores raw Uncle-Mel/JSON-derulo objects
const DataService = {
  warbandFiles: null,  // array of raw warband file objects (with _grade attached)
  equipment: null,     // raw flat array with slugified id added
  skills: null,        // raw flat array
  magic: null,         // raw { spellLists: { id: { name, spells, permittedWarbands } } }
  hiredSwords: null,   // raw keyed object { "key": { name, cost, statblock, ... } }
  maxStats: null,      // raw array [{ race, warband: [{ warband, maxStats: {m,ws,...} }] }]
  injuries: null,
  advancement: null,
  specialRules: null,

  _spellMap: null, // built lazily by getSpellAccess()

  CATEGORY_NAMES: {
    melee:       'Hand-to-Hand Combat Weapons',
    missile:     'Missile Weapons',
    blackpowder: 'Blackpowder Weapons',
    armour:      'Armour',
    misc:        'Miscellaneous Equipment',
    animal:      'Animals',
  },

  SKILL_KEY_TO_SUBTYPE: {
    combat:   'Combat Skill',
    shooting: 'Shooting Skill',
    academic: 'Academic Skill',
    strength: 'Strength Skill',
    speed:    'Speed Skill',
    cavalry:  'Cavalry Skill',
  },

  // Maps Uncle-Mel permittedWarbands/excludedWarbands names to our warband display names.
  // Uncle-Mel uses historical/alternate names; our warband files use different display names.
  HS_NAME_MAP: {
    'Averlanders':                     ['Averlander Mercenaries'],
    'Bretonnian Knights':              ['Bretonnians'],
    'Druchii':                         ['Dark Elves'],
    'Marauders of Chaos':              ['The Norse', 'The Kurgan', 'The Hung'],
    'Marienburgers':                   ['Marienburg Mercenaries'],
    'Mercenaries':                     ['Reikland Mercenaries', 'Middenheim Mercenaries', 'Marienburg Mercenaries'],
    'Middenheimers':                   ['Middenheim Mercenaries'],
    'Night Goblins (web)':             ['Night Goblins'],
    'Night Goblins web':               ['Night Goblins'],
    'Ostlanders':                      ['Ostlander Mercenaries'],
    'Outlaws of Stirwood Forest, The': ['Outlaws of Stirwood Forest'],
    'Reiklanders':                     ['Reikland Mercenaries'],
    'Sons of Hashut:':                 ['The Sons of Hashut'],
    'Tileans':                         ['Miragleans', 'Remasens', 'Trantios'],
  },

  // Returns a set of all Uncle-Mel permittedWarbands names that identify warbandName,
  // including alternate names from HS_NAME_MAP.
  _namesForWarband(warbandName) {
    const names = new Set([warbandName]);
    for (const [umName, ourNames] of Object.entries(this.HS_NAME_MAP)) {
      if (ourNames.includes(warbandName)) names.add(umName);
    }
    return names;
  },

  slugify(str) {
    return str
      .toLowerCase()
      .replace(/[''']/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
  },

  // Used by UI to strip HTML from Uncle-Mel lore, spell descriptions, etc.
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
    const v = 'v=13';

    // Fetch warband index first, then all warband files in parallel
    const indexData = await this.fetchJSON('data/warbandFiles/index.json?' + v);

    const [equipment, skills, magic, hiredSwords, maxStats, injuries, advancement, specialRules, ...rawWarbandFiles] =
      await Promise.all([
        this.fetchJSON('data/equipment.json?' + v),
        this.fetchJSON('data/skills.json?' + v),
        this.fetchJSON('data/magic.json?' + v),
        this.fetchJSON('data/hiredSwords.json?' + v),
        this.fetchJSON('data/maxStats.json?' + v),
        this.fetchJSON('data/injuries.json?' + v),
        this.fetchJSON('data/advancement.json?' + v),
        this.fetchJSON('data/special_rules.json?' + v),
        ...indexData.map(entry =>
          this.fetchJSON(entry.path + '?' + v).catch(err => {
            console.warn(`Warning: failed to load ${entry.path}: ${err.message}`);
            return null; // excluded below
          })
        ),
      ]);

    // Attach grade from index; drop any warband files that failed to load
    this.warbandFiles = rawWarbandFiles
      .map((wf, i) => wf ? { ...wf, _grade: indexData[i].grade } : null)
      .filter(Boolean);

    // Add slugified id to each equipment item for lookups
    this.equipment = equipment.map(item => ({ ...item, id: this.slugify(item.name) }));

    this.skills      = skills;       // raw flat array
    this.magic       = magic;        // raw { spellLists: {} }
    this.hiredSwords = hiredSwords;  // raw keyed object
    this.maxStats    = maxStats;     // raw array
    this.injuries    = injuries;
    this.advancement = advancement;
    this.specialRules = specialRules.specialRules;
  },

  async fetchJSON(path) {
    const resp = await fetch(path);
    if (!resp.ok) throw new Error(`Failed to load ${path}: ${resp.status}`);
    return resp.json();
  },

  // ── Warbands ─────────────────────────────────────────────────────────────

  // Returns { warbandFile, subfaction } or null.
  // subfaction is the display-name string (e.g. "Reikland Mercenaries") or null.
  // The id parameter is a slugified subfaction name or the warband file id.
  getWarband(id) {
    if (!this.warbandFiles) return null;
    for (const wf of this.warbandFiles) {
      if (wf.id === id) return { warbandFile: wf, subfaction: null };
      const opts = wf.subfactions?.options || [];
      const match = opts.find(s => this.slugify(s) === id);
      if (match) return { warbandFile: wf, subfaction: match };
    }
    return null;
  },

  // Returns flat list of picker entries — one per subfaction (or one for non-subfaction warbands).
  // Each entry: { id, name, source }
  getAllWarbands() {
    const result = [];
    for (const wf of this.warbandFiles) {
      const opts = wf.subfactions?.options;
      if (opts && opts.length > 0) {
        for (const sub of opts) {
          result.push({ id: this.slugify(sub), name: sub, source: wf.source || '' });
        }
      } else {
        result.push({ id: wf.id, name: wf.name, source: wf.source || '' });
      }
    }
    return result;
  },

  // Resolves a fighter's skillAccess object (or subfaction-specific entry) to
  // an array of Uncle-Mel subtype strings (e.g. ['Combat Skill', 'Speed Skill']).
  // Pass subfaction=null for non-subfaction warbands.
  resolveSkillAccess(fighter, subfaction) {
    let skillsObj;
    if (Array.isArray(fighter.skillAccess)) {
      const entry = subfaction
        ? fighter.skillAccess.find(e => e.subfaction === subfaction)
        : fighter.skillAccess[0];
      skillsObj = entry?.skills || {};
    } else {
      skillsObj = fighter.skillAccess || {};
    }

    const result = [];
    for (const [key, val] of Object.entries(skillsObj)) {
      if (!val) continue;
      if (key === 'special') {
        result.push('Special Skill');
      } else if (this.SKILL_KEY_TO_SUBTYPE[key]) {
        result.push(this.SKILL_KEY_TO_SUBTYPE[key]);
      }
    }
    return result;
  },

  // ── Equipment ─────────────────────────────────────────────────────────────

  getEquipmentItem(itemId) {
    return this.equipment.find(i => i.id === itemId) || null;
  },

  // Returns all equipment items of a given Uncle-Mel type (e.g. 'melee', 'armour').
  getEquipmentByType(type) {
    return this.equipment.filter(i => i.type === type);
  },

  getAllEquipment() {
    return this.equipment;
  },

  getEquipmentCategoryName(type) {
    return this.CATEGORY_NAMES[type] || type;
  },

  // item.permittedWarbands can be an array, a single string, or absent/empty (= all warbands).
  // Uses _namesForWarband() to resolve Uncle-Mel alternate names (e.g. "Reiklanders" → "Reikland Mercenaries").
  canWarbandAccess(item, warbandName) {
    const permitted = item.permittedWarbands;
    const excluded  = item.excludedWarbands;
    const names = this._namesForWarband(warbandName);
    if (Array.isArray(excluded) && excluded.some(e => names.has(e))) return false;
    if (!permitted || (Array.isArray(permitted) && permitted.length === 0) || permitted === 'all') return true;
    if (Array.isArray(permitted)) return permitted.some(p => names.has(p));
    return names.has(permitted);
  },

  // Resolves a fighter's equipmentLists references to a flat list of items.
  // Returns [{ id, name, cost, costPrefix? }]
  resolveAllowedEquipment(fighter, warbandFile) {
    const result = [];
    for (const listId of (fighter.equipmentLists || [])) {
      const list = (warbandFile.equipmentLists || []).find(l => l.id === listId);
      if (!list) continue;
      for (const item of (list.items || [])) {
        const nameLower = item.name.toLowerCase();
        const baseNameLower = nameLower.replace(/\s*\([^)]*\)\s*$/, '').trim();
        const match = this.equipment.find(e => e.name.toLowerCase() === nameLower)
                   || this.equipment.find(e => e.name.toLowerCase() === baseNameLower);
        if (!match) continue;
        if (result.some(r => r.id === match.id)) continue;
        const entry = { id: match.id, name: item.name, cost: item.cost?.cost ?? 0 };
        if (item.cost?.costPrefix) entry.costPrefix = item.cost.costPrefix;
        result.push(entry);
      }
    }
    return result;
  },

  // ── Skills ────────────────────────────────────────────────────────────────

  // Returns skills matching the given Uncle-Mel subtype string.
  // For 'Special Skill', optionally filters by permittedWarbands.
  getSkillsBySubtype(subtype, warbandName) {
    if (subtype === 'Special Skill' && warbandName) {
      return this.skills.filter(s => {
        if (s.subtype !== 'Special Skill') return false;
        const p = s.permittedWarbands;
        if (Array.isArray(p)) return p.includes(warbandName);
        if (typeof p === 'string') return p === warbandName;
        return false;
      });
    }
    return this.skills.filter(s => s.subtype === subtype);
  },

  getSkill(skillId) {
    return this.skills.find(s => this.slugify(s.name) === skillId) || null;
  },

  // ── Spells ────────────────────────────────────────────────────────────────

  getSpellsByList(listId) {
    return this.magic.spellLists?.[listId]?.spells || [];
  },

  getSpell(spellId) {
    for (const list of Object.values(this.magic.spellLists || {})) {
      const spell = (list.spells || []).find(s => (s.id || this.slugify(s.name)) === spellId);
      if (spell) return spell;
    }
    return null;
  },

  // Returns spell list IDs available to a given warband+fighter combination.
  // Result is stored on warrior.spellAccess at creation time.
  getSpellAccess(warbandName, fighterName) {
    if (!this._spellMap) {
      this._spellMap = {};
      for (const [listId, list] of Object.entries(this.magic.spellLists || {})) {
        for (const entry of (list.permittedWarbands || [])) {
          const wb = entry.warband || '';
          const ft = entry.fighter || '';
          if (!this._spellMap[wb]) this._spellMap[wb] = {};
          if (!this._spellMap[wb][ft]) this._spellMap[wb][ft] = [];
          this._spellMap[wb][ft].push(listId);
        }
      }
    }
    return this._findSpellAccess(this._spellMap, warbandName, fighterName);
  },

  _findSpellAccess(spellMap, warbandName, fighterName) {
    const wbKeys = Object.keys(spellMap);
    const wbKey  = wbKeys.find(k => k === warbandName)
                || wbKeys.find(k => k.toLowerCase() === warbandName.toLowerCase())
                || wbKeys.find(k => warbandName.toLowerCase().includes(k.toLowerCase()))
                || wbKeys.find(k => k.toLowerCase().includes(warbandName.toLowerCase()));
    if (!wbKey) return [];
    const ftMap  = spellMap[wbKey];
    const ftKeys = Object.keys(ftMap);
    const ftKey  = ftKeys.find(k => k === fighterName)
                || ftKeys.find(k => k.toLowerCase() === fighterName.toLowerCase())
                || ftKeys.find(k => fighterName.toLowerCase().includes(k.toLowerCase()))
                || ftKeys.find(k => k.toLowerCase().includes(fighterName.toLowerCase()));
    if (!ftKey) return [];
    return ftMap[ftKey];
  },

  // ── Hired Swords ─────────────────────────────────────────────────────────

  // Key in Uncle-Mel uses hyphens (e.g. "dwarf-troll-slayer").
  // Old warriors stored underscore types — handle both.
  getHiredSwordTemplate(typeOrKey) {
    if (this.hiredSwords[typeOrKey]) return this.hiredSwords[typeOrKey];
    const hyphenated = typeOrKey.replace(/_/g, '-');
    return this.hiredSwords[hyphenated] || null;
  },

  // warbandName is our display name (e.g. "Averlander Mercenaries").
  // Uses _namesForWarband() to match Uncle-Mel's alternate names (e.g. "Averlanders").
  getAvailableHiredSwords(warbandName) {
    const names = this._namesForWarband(warbandName);
    return Object.entries(this.hiredSwords)
      .filter(([, hs]) => {
        const permitted = hs.permittedWarbands || [];
        return permitted.length === 0 || permitted.some(p => names.has(p));
      })
      .map(([key, hs]) => ({ key, ...hs }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  // ── Max Stats ─────────────────────────────────────────────────────────────

  // race: Uncle-Mel race string (e.g. 'human', 'elf', 'dwarf').
  // stat: lowercase key (e.g. 'm', 'ws').
  // Falls back to the first race entry if race not found.
  getMaxStat(stat, race) {
    const entry = (this.maxStats || []).find(r => r.race === race)
               || (this.maxStats || [])[0];
    if (!entry) return 10;
    // Uncle-Mel has warband-specific overrides; use the null-warband (default) entry
    const warbandEntry = (entry.warband || []).find(w => w.warband === null) || entry.warband?.[0];
    return warbandEntry?.maxStats?.[stat] ?? 10;
  },

  // ── Advancement / Injuries / Special Rules ────────────────────────────────

  getExpThreshold(level) {
    const thresholds = this.advancement.heroAdvancement.expThresholds;
    return level < thresholds.length
      ? thresholds[level]
      : thresholds[thresholds.length - 1] + (level - thresholds.length + 1) * 10;
  },

  getSpecialRuleDescription(ruleName) {
    return this.specialRules?.[ruleName] || '';
  },
};
