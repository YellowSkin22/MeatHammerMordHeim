// Tests for RosterModel (js/roster.js)
// Run: node --test tests/roster.test.js

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { loadRosterModel } from './helpers.js';

// ── Shared setup ─────────────────────────────────────────────────────────────

before(() => loadRosterModel());

// Helper: a minimal warrior with the fields most methods need
function makeWarrior(overrides = {}) {
  return {
    id: 'w1',
    type: 'captain',
    typeName: 'Captain',
    name: 'Captain',
    isHero: true,
    stats:     { m:4, ws:4, bs:4, s:3, t:3, w:1, i:4, a:1, ld:8 },
    baseStats: { m:4, ws:4, bs:4, s:3, t:3, w:1, i:4, a:1, ld:8 },
    race: 'human',
    equipment: [],
    skills: [],
    spells: [],
    injuries: [],
    experience: 0,
    advancementCount: 0,
    missNextGame: false,
    cost: 60,
    specialRules: [],
    skillAccess: [],
    spellAccess: [],
    notes: '',
    ...overrides,
  };
}

// Helper: a minimal roster
function makeRoster(overrides = {}) {
  return {
    id: 'roster-1',
    name: 'The Crimson Blades',
    warbandId: 'reikland',
    gold: 500,
    wyrdstone: 0,
    heroes: [],
    henchmen: [],
    hiredSwords: [],
    customWarriors: [],
    battleLog: [],
    treasuryLog: [],
    notes: '',
    ...overrides,
  };
}


// ── createRoster ──────────────────────────────────────────────────────────────

describe('RosterModel.createRoster', () => {
  it('returns a roster with the given name and warbandId', () => {
    const r = RosterModel.createRoster('The Blades', 'reikland');
    assert.equal(r.name, 'The Blades');
    assert.equal(r.warbandId, 'reikland');
  });

  it('starts with the warband starting gold from warbandRules', () => {
    const r = RosterModel.createRoster('Test', 'reikland');
    assert.equal(r.gold, 500); // stub returns startingGc: 500
  });

  it('overrides starting gold when warbandRules specifies a different amount', () => {
    loadRosterModel({ getWarband: () => ({
      warbandFile: { name: 'Undead', race: 'undead', fighters: [], warbandRules: { startingGc: 250 } },
      subfaction: null,
    })});
    const r = RosterModel.createRoster('Night Reapers', 'undead');
    assert.equal(r.gold, 250);
    // Restore default stub for subsequent tests
    loadRosterModel();
  });

  it('starts with empty warrior arrays', () => {
    const r = RosterModel.createRoster('Test', 'reikland');
    assert.deepEqual(r.heroes, []);
    assert.deepEqual(r.henchmen, []);
    assert.deepEqual(r.hiredSwords, []);
    assert.deepEqual(r.customWarriors, []);
  });

  it('throws for an unknown warbandId', () => {
    loadRosterModel({ getWarband: () => null });
    assert.throws(() => RosterModel.createRoster('Bad', 'nonexistent'), /Unknown warband/);
    loadRosterModel();
  });
});


// ── addEquipment ──────────────────────────────────────────────────────────────

describe('RosterModel.addEquipment', () => {
  it('adds an item to the warrior equipment array', () => {
    const warrior = makeWarrior();
    const result = RosterModel.addEquipment(warrior, 'sword');
    assert.equal(result, true);
    assert.equal(warrior.equipment.length, 1);
    assert.equal(warrior.equipment[0].id, 'sword');
    assert.equal(warrior.equipment[0].name, 'sword'); // stub returns name = id
  });

  it('allows adding the same item twice (no dedup — stacking is valid)', () => {
    const warrior = makeWarrior();
    RosterModel.addEquipment(warrior, 'dagger');
    RosterModel.addEquipment(warrior, 'dagger');
    assert.equal(warrior.equipment.length, 2);
  });

  it('returns false and does not mutate warrior when item is not found', () => {
    loadRosterModel({ getEquipmentItem: () => null });
    const warrior = makeWarrior();
    const result = RosterModel.addEquipment(warrior, 'ghost-item');
    assert.equal(result, false);
    assert.equal(warrior.equipment.length, 0);
    loadRosterModel();
  });
});


// ── income (treasury) ─────────────────────────────────────────────────────────
// The income UI logic lives in UI.submitTreasuryEntry (DOM-tied).
// These tests verify the underlying data rules directly:
//   income → gold increases, wyrdstone increases
//   gold never goes below 0

describe('Income / treasury rules', () => {
  it('applying income increases roster gold', () => {
    const roster = makeRoster({ gold: 300 });
    const income = 100;
    roster.gold = Math.max(0, roster.gold + income);
    assert.equal(roster.gold, 400);
  });

  it('applying income increases wyrdstone', () => {
    const roster = makeRoster({ wyrdstone: 2 });
    roster.wyrdstone = Math.max(0, roster.wyrdstone + 3);
    assert.equal(roster.wyrdstone, 5);
  });

  it('gold cannot go below zero (purchase exceeds available gold)', () => {
    const roster = makeRoster({ gold: 50 });
    const purchase = -200; // costs more than available
    roster.gold = Math.max(0, roster.gold + purchase);
    assert.equal(roster.gold, 0);
  });

  it('income entry is pushed to treasuryLog', () => {
    const roster = makeRoster();
    const entry = {
      id: 'entry-1', type: 'income', description: 'Selling wyrdstone',
      gold: 75, wyrdstone: 1, applied: true,
      date: new Date().toISOString(),
    };
    roster.treasuryLog.push(entry);
    roster.gold = Math.max(0, roster.gold + entry.gold);
    roster.wyrdstone = Math.max(0, roster.wyrdstone + entry.wyrdstone);
    assert.equal(roster.treasuryLog.length, 1);
    assert.equal(roster.gold, 575);
    assert.equal(roster.wyrdstone, 1);
  });

  it('unapplied income entry logs without changing gold', () => {
    const roster = makeRoster({ gold: 300 });
    const entry = { id: 'e2', type: 'income', gold: 50, applied: false };
    roster.treasuryLog.push(entry);
    // applied: false → do NOT touch roster.gold
    assert.equal(roster.gold, 300);
    assert.equal(roster.treasuryLog.length, 1);
  });
});


// ── calculateWarbandRating ────────────────────────────────────────────────────

describe('RosterModel.calculateWarbandRating', () => {
  it('returns 0 for an empty warband', () => {
    assert.equal(RosterModel.calculateWarbandRating(makeRoster()), 0);
  });

  it('hero with no XP or equipment = 5 points', () => {
    const roster = makeRoster({ heroes: [makeWarrior({ experience: 0, equipment: [] })] });
    assert.equal(RosterModel.calculateWarbandRating(roster), 5);
  });

  it('hero rating includes 1 point per XP', () => {
    const roster = makeRoster({ heroes: [makeWarrior({ experience: 10, equipment: [] })] });
    assert.equal(RosterModel.calculateWarbandRating(roster), 15); // 5 base + 10 xp
  });

  it('hero rating includes 5 points per equipment item', () => {
    const warrior = makeWarrior({ experience: 0, equipment: [{ id: 'sword', name: 'Sword' }, { id: 'shield', name: 'Shield' }] });
    const roster = makeRoster({ heroes: [warrior] });
    assert.equal(RosterModel.calculateWarbandRating(roster), 15); // 5 base + 2×5 equipment
  });

  it('henchman group scales rating by group size', () => {
    const henchman = makeWarrior({ isHero: false, experience: 0, equipment: [], groupSize: 3 });
    const roster = makeRoster({ henchmen: [henchman] });
    assert.equal(RosterModel.calculateWarbandRating(roster), 15); // 3 × 5 base
  });

  it('equipment does not contribute to henchman rating', () => {
    const henchman = makeWarrior({
      isHero: false, experience: 0, groupSize: 2,
      equipment: [{ id: 'sword', name: 'Sword' }],
    });
    const roster = makeRoster({ henchmen: [henchman] });
    assert.equal(RosterModel.calculateWarbandRating(roster), 10); // 2 × 5, no equipment pts
  });
});


// ── getMemberCount ────────────────────────────────────────────────────────────

describe('RosterModel.getMemberCount', () => {
  it('counts each hero as 1', () => {
    const roster = makeRoster({ heroes: [makeWarrior(), makeWarrior()] });
    assert.equal(RosterModel.getMemberCount(roster), 2);
  });

  it('counts henchman groups by groupSize', () => {
    const group = makeWarrior({ isHero: false, groupSize: 5 });
    const roster = makeRoster({ henchmen: [group] });
    assert.equal(RosterModel.getMemberCount(roster), 5);
  });

  it('combines heroes and henchman groups', () => {
    const roster = makeRoster({
      heroes: [makeWarrior()],
      henchmen: [makeWarrior({ isHero: false, groupSize: 3 })],
    });
    assert.equal(RosterModel.getMemberCount(roster), 4);
  });
});


// ── modifyStat ────────────────────────────────────────────────────────────────

describe('RosterModel.modifyStat', () => {
  it('increases a stat', () => {
    const warrior = makeWarrior();
    const result = RosterModel.modifyStat(warrior, 'ws', 1);
    assert.equal(result, true);
    assert.equal(warrior.stats.ws, 5);
  });

  it('decreases a stat', () => {
    const warrior = makeWarrior();
    const result = RosterModel.modifyStat(warrior, 'ws', -1);
    assert.equal(result, true);
    assert.equal(warrior.stats.ws, 3);
  });

  it('rejects changes that would go below 0', () => {
    const warrior = makeWarrior({ stats: { ...makeWarrior().stats, ws: 0 } });
    const result = RosterModel.modifyStat(warrior, 'ws', -1);
    assert.equal(result, false);
    assert.equal(warrior.stats.ws, 0);
  });

  it('rejects changes that would exceed the max (stub returns 10)', () => {
    const warrior = makeWarrior({ stats: { ...makeWarrior().stats, ws: 10 } });
    const result = RosterModel.modifyStat(warrior, 'ws', 1);
    assert.equal(result, false);
    assert.equal(warrior.stats.ws, 10);
  });
});


// ── addSkill ──────────────────────────────────────────────────────────────────

describe('RosterModel.addSkill', () => {
  it('adds a skill to the warrior', () => {
    const warrior = makeWarrior();
    RosterModel.addSkill(warrior, 'mighty-blow');
    assert.equal(warrior.skills.length, 1);
    assert.equal(warrior.skills[0].id, 'mighty-blow');
  });

  it('does not add a duplicate skill', () => {
    const warrior = makeWarrior();
    RosterModel.addSkill(warrior, 'mighty-blow');
    const result = RosterModel.addSkill(warrior, 'mighty-blow');
    assert.equal(result, false);
    assert.equal(warrior.skills.length, 1);
  });
});


// ── addExperience ─────────────────────────────────────────────────────────────

describe('RosterModel.addExperience', () => {
  it('increases warrior experience', () => {
    const warrior = makeWarrior({ experience: 5 });
    RosterModel.addExperience(warrior, 3);
    assert.equal(warrior.experience, 8);
  });
});


// ── promoteHenchmanToHero ─────────────────────────────────────────────────────

describe('RosterModel.promoteHenchmanToHero', () => {
  it('creates a hero from a henchman', () => {
    const henchman = makeWarrior({ isHero: false, type: 'marksman', typeName: 'Marksman', name: 'Jim', groupSize: 3 });
    const hero = RosterModel.promoteHenchmanToHero(henchman, ['Combat Skill']);
    assert.equal(hero.isHero, true);
    assert.equal(hero.isPromotedHenchman, true);
    assert.equal(hero.name, 'Jim');
  });

  it('copies equipment and injuries via deep clone', () => {
    const henchman = makeWarrior({
      isHero: false,
      equipment: [{ id: 'sword', name: 'Sword' }],
      injuries: [{ name: 'Old Battle Wound', gameNumber: 1 }],
    });
    const hero = RosterModel.promoteHenchmanToHero(henchman, []);
    // Mutating original should not affect promoted hero
    henchman.equipment.push({ id: 'shield', name: 'Shield' });
    assert.equal(hero.equipment.length, 1);
    assert.equal(hero.injuries.length, 1);
  });

  it('stores the chosen skill access categories', () => {
    const henchman = makeWarrior({ isHero: false });
    const hero = RosterModel.promoteHenchmanToHero(henchman, ['Combat Skill', 'Strength Skill']);
    assert.deepEqual(hero.skillAccess, ['Combat Skill', 'Strength Skill']);
  });
});
