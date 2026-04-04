// LocalStorage persistence module
const Storage = {
  ROSTERS_KEY: 'mordheim_rosters',

  getAllRosters() {
    const data = localStorage.getItem(this.ROSTERS_KEY);
    if (!data) return [];
    const rosters = JSON.parse(data);
    const migrated = rosters.map(r => this._migrateRoster(r));
    // Re-save only if something actually changed
    if (JSON.stringify(migrated) !== JSON.stringify(rosters)) {
      localStorage.setItem(this.ROSTERS_KEY, JSON.stringify(migrated));
    }
    return migrated;
  },

  saveAllRosters(rosters) {
    localStorage.setItem(this.ROSTERS_KEY, JSON.stringify(rosters));
  },

  getRoster(id) {
    return this.getAllRosters().find(r => r.id === id) || null;
  },

  saveRoster(roster) {
    const rosters = this.getAllRosters();
    const idx = rosters.findIndex(r => r.id === roster.id);
    if (idx >= 0) {
      rosters[idx] = roster;
    } else {
      rosters.push(roster);
    }
    this.saveAllRosters(rosters);

    // Cloud sync (fire-and-forget)
    if (typeof Cloud !== 'undefined') Cloud.enqueueSave(roster);
  },

  deleteRoster(id) {
    const rosters = this.getAllRosters().filter(r => r.id !== id);
    this.saveAllRosters(rosters);

    // Cloud sync (fire-and-forget)
    if (typeof Cloud !== 'undefined') Cloud.deleteRoster(id);
  },

  exportRoster(id) {
    const roster = this.getRoster(id);
    if (!roster) return null;
    return JSON.stringify(roster, null, 2);
  },

  importRoster(jsonString) {
    const roster = JSON.parse(jsonString);
    if (!roster.id || !roster.name || !roster.warbandId) {
      throw new Error('Invalid roster format');
    }
    roster.id = this.generateId(); // assign new id to avoid conflicts
    if (!roster.hiredSwords) roster.hiredSwords = [];
    if (!roster.customWarriors) roster.customWarriors = [];
    this.saveRoster(roster);
    return roster;
  },

  generateId() {
    return 'r_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 6);
  },

  _migrateRoster(roster) {
    const STAT_UP_TO_LOW = { M:'m', WS:'ws', BS:'bs', S:'s', T:'t', W:'w', I:'i', A:'a', Ld:'ld' };
    const SKILL_ID_TO_SUBTYPE = {
      combat:   'Combat Skill',
      shooting: 'Shooting Skill',
      academic: 'Academic Skill',
      strength: 'Strength Skill',
      speed:    'Speed Skill',
    };

    const migrateStats = (stats) => {
      if (!stats || typeof stats !== 'object') return stats;
      // Detect uppercase keys
      if (!Object.keys(stats).some(k => STAT_UP_TO_LOW[k])) return stats;
      const result = {};
      for (const [k, v] of Object.entries(stats)) {
        result[STAT_UP_TO_LOW[k] || k] = v;
      }
      return result;
    };

    const migrateSkillAccess = (skillAccess) => {
      if (!Array.isArray(skillAccess)) return skillAccess;
      return skillAccess.map(s => SKILL_ID_TO_SUBTYPE[s] || s);
    };

    const migrateWarrior = (w) => ({
      ...w,
      stats:       migrateStats(w.stats),
      baseStats:   migrateStats(w.baseStats),
      skillAccess: migrateSkillAccess(w.skillAccess),
    });

    return {
      ...roster,
      heroes:         (roster.heroes         || []).map(migrateWarrior),
      henchmen:       (roster.henchmen       || []).map(migrateWarrior),
      hiredSwords:    (roster.hiredSwords    || []).map(migrateWarrior),
      customWarriors: (roster.customWarriors || []).map(migrateWarrior),
    };
  }
};
