// Test helpers: load source files into global scope and provide stub factories.
// Each test file imports what it needs from here.

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Load a JS file that uses `const X = {...}` at the top level into the global
// scope. ES modules run in strict mode where eval() can't promote const to
// global, so we swap the top-level const for a global assignment before
// running it through vm.runInThisContext (which writes vars into global scope).
function loadGlobal(path) {
  const src = readFileSync(path, 'utf8')
    // Rewrite: `const RosterModel = {` → `global.RosterModel = {`
    .replace(/^const\s+(\w+)\s*=/m, 'global.$1 =');
  vm.runInThisContext(src);
}

// ── Stub factories ──────────────────────────────────────────────────────────

export function makeDataServiceStub(overrides = {}) {
  return {
    getWarband: (id) => ({
      warbandFile: {
        name: 'Reikland',
        race: 'human',
        fighters: [],
        warbandRules: { startingGc: 500 },
      },
      subfaction: null,
    }),
    getEquipmentItem: (id) => ({ id, name: id, cost: { cost: 10 } }),
    getSkill: (id) => ({ id, name: id }),
    getSpell: (id) => ({ id, name: id }),
    getMaxStat: (stat, race) => 10,
    resolveSkillAccess: () => [],
    getSpellAccess: () => [],
    advancement: {
      heroAdvancement:    { expThresholds: [2, 4, 6, 8, 10, 12, 14, 16, 18, 20] },
      henchmanAdvancement: { expThresholds: [2, 5, 9, 15] },
    },
    SKILL_KEY_TO_SUBTYPE: {
      combat: 'Combat Skill', shooting: 'Shooting Skill',
      academic: 'Academic Skill', strength: 'Strength Skill', speed: 'Speed Skill',
    },
    ...overrides,
  };
}

let _idCounter = 0;
export function makeStorageStub() {
  return {
    generateId: () => `test-id-${++_idCounter}`,
  };
}

// ── Module loaders ──────────────────────────────────────────────────────────
// Each loader sets up the globals a module needs, then evals the file so the
// object (RosterModel, Storage, etc.) lands in global scope.

export function loadRosterModel(dataServiceOverrides = {}) {
  global.DataService = makeDataServiceStub(dataServiceOverrides);
  global.Storage     = makeStorageStub();
  loadGlobal('js/roster.js');
}

export function loadStorage() {
  // Storage._migrateRoster has no external globals — load it standalone.
  loadGlobal('js/storage.js');
}

export function loadDataService() {
  loadGlobal('js/data.js');
}
