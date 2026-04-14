// Tests for Storage._migrateRoster (js/storage.js)
// Run: node --test tests/storage.test.js

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { loadStorage } from './helpers.js';

before(() => loadStorage());

// ── _migrateRoster ────────────────────────────────────────────────────────────

describe('Storage._migrateRoster', () => {

  describe('stat key migration (uppercase → lowercase)', () => {
    it('converts uppercase stat keys to lowercase', () => {
      const roster = {
        heroes: [{ stats: { M:4, WS:3, BS:3, S:3, T:3, W:1, I:3, A:1, Ld:7 }, baseStats: { M:4, WS:3 }, skillAccess: [] }],
        henchmen: [], hiredSwords: [], customWarriors: [],
      };
      const result = Storage._migrateRoster(roster);
      const stats = result.heroes[0].stats;
      assert.equal(stats.m, 4);
      assert.equal(stats.ws, 3);
      assert.equal(stats.ld, 7);
      assert.equal(stats.M, undefined);
      assert.equal(stats.WS, undefined);
    });

    it('leaves already-lowercase stats unchanged', () => {
      const original = { m:4, ws:3, bs:3, s:3, t:3, w:1, i:3, a:1, ld:7 };
      const roster = {
        heroes: [{ stats: { ...original }, baseStats: { ...original }, skillAccess: [] }],
        henchmen: [], hiredSwords: [], customWarriors: [],
      };
      const result = Storage._migrateRoster(roster);
      assert.deepEqual(result.heroes[0].stats, original);
    });

    it('migrates baseStats as well as stats', () => {
      const roster = {
        heroes: [{
          stats:     { M:4, WS:3, BS:3, S:3, T:3, W:1, I:3, A:1, Ld:7 },
          baseStats: { M:4, WS:3, BS:3, S:3, T:3, W:1, I:3, A:1, Ld:7 },
          skillAccess: [],
        }],
        henchmen: [], hiredSwords: [], customWarriors: [],
      };
      const result = Storage._migrateRoster(roster);
      assert.equal(result.heroes[0].baseStats.ws, 3);
      assert.equal(result.heroes[0].baseStats.WS, undefined);
    });

    it('migrates warriors in all four arrays', () => {
      const oldStats = { M:4, WS:3, BS:3, S:3, T:3, W:1, I:3, A:1, Ld:7 };
      const warrior  = { stats: { ...oldStats }, baseStats: { ...oldStats }, skillAccess: [] };
      const roster = {
        heroes:         [{ ...warrior }],
        henchmen:       [{ ...warrior }],
        hiredSwords:    [{ ...warrior }],
        customWarriors: [{ ...warrior }],
      };
      const result = Storage._migrateRoster(roster);
      for (const arr of ['heroes', 'henchmen', 'hiredSwords', 'customWarriors']) {
        assert.equal(result[arr][0].stats.ws, 3, `${arr}[0].stats.ws should be 3`);
      }
    });
  });

  describe('skillAccess migration (old id strings → subtype strings)', () => {
    it('converts old skill id strings to subtype strings', () => {
      const roster = {
        heroes: [{ stats: {}, baseStats: {}, skillAccess: ['combat', 'shooting'] }],
        henchmen: [], hiredSwords: [], customWarriors: [],
      };
      const result = Storage._migrateRoster(roster);
      assert.deepEqual(result.heroes[0].skillAccess, ['Combat Skill', 'Shooting Skill']);
    });

    it('leaves already-migrated subtype strings unchanged', () => {
      const roster = {
        heroes: [{ stats: {}, baseStats: {}, skillAccess: ['Combat Skill', 'Speed Skill'] }],
        henchmen: [], hiredSwords: [], customWarriors: [],
      };
      const result = Storage._migrateRoster(roster);
      assert.deepEqual(result.heroes[0].skillAccess, ['Combat Skill', 'Speed Skill']);
    });

    it('passes through unknown skill ids unchanged', () => {
      const roster = {
        heroes: [{ stats: {}, baseStats: {}, skillAccess: ['Special Skill', 'combat'] }],
        henchmen: [], hiredSwords: [], customWarriors: [],
      };
      const result = Storage._migrateRoster(roster);
      assert.deepEqual(result.heroes[0].skillAccess, ['Special Skill', 'Combat Skill']);
    });
  });

  describe('missing warrior arrays', () => {
    it('handles roster with missing hiredSwords / customWarriors arrays', () => {
      const roster = { heroes: [], henchmen: [] }; // old roster shape
      const result = Storage._migrateRoster(roster);
      assert.deepEqual(result.hiredSwords, []);
      assert.deepEqual(result.customWarriors, []);
    });
  });

  describe('idempotency', () => {
    it('migrating twice produces the same result as migrating once', () => {
      const roster = {
        heroes: [{ stats: { M:4, WS:3, BS:3, S:3, T:3, W:1, I:3, A:1, Ld:7 }, baseStats: {}, skillAccess: ['combat'] }],
        henchmen: [], hiredSwords: [], customWarriors: [],
      };
      const once  = Storage._migrateRoster(roster);
      const twice = Storage._migrateRoster(once);
      assert.deepEqual(once.heroes[0].stats, twice.heroes[0].stats);
      assert.deepEqual(once.heroes[0].skillAccess, twice.heroes[0].skillAccess);
    });
  });
});
