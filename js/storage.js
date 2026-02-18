// LocalStorage persistence module
const Storage = {
  ROSTERS_KEY: 'mordheim_rosters',

  getAllRosters() {
    const data = localStorage.getItem(this.ROSTERS_KEY);
    return data ? JSON.parse(data) : [];
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
  },

  deleteRoster(id) {
    const rosters = this.getAllRosters().filter(r => r.id !== id);
    this.saveAllRosters(rosters);
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
    this.saveRoster(roster);
    return roster;
  },

  generateId() {
    return 'r_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 6);
  }
};
