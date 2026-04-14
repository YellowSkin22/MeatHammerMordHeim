// Tests for DataService pure utility functions (js/data.js)
// Run: node --test tests/data.test.js

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { loadDataService } from './helpers.js';

before(() => loadDataService());

// ── slugify ───────────────────────────────────────────────────────────────────

describe('DataService.slugify', () => {
  it('lowercases and replaces spaces with underscores', () => {
    assert.equal(DataService.slugify('Witch Hunters'), 'witch_hunters');
  });

  it('removes non-alphanumeric characters (apostrophes stripped, spaces become underscores)', () => {
    assert.equal(DataService.slugify("Lad's Got Talent"), 'lads_got_talent');
  });

  it('collapses multiple spaces into one underscore', () => {
    assert.equal(DataService.slugify('Cult  of  the  Possessed'), 'cult_of_the_possessed');
  });

  it('handles an already-slugified string', () => {
    assert.equal(DataService.slugify('reikland'), 'reikland');
  });

  it('trims leading/trailing whitespace', () => {
    assert.equal(DataService.slugify('  Marienburg  '), 'marienburg');
  });
});


// ── canWarbandAccess ──────────────────────────────────────────────────────────

describe('DataService.canWarbandAccess', () => {
  it('returns true when permittedWarbands is empty (item is universal)', () => {
    const item = { permittedWarbands: [], excludedWarbands: [] };
    assert.equal(DataService.canWarbandAccess(item, 'Reikland'), true);
  });

  it('returns true when warband is in permittedWarbands', () => {
    const item = { permittedWarbands: ['Reikland', 'Middenheim'], excludedWarbands: [] };
    assert.equal(DataService.canWarbandAccess(item, 'Reikland'), true);
  });

  it('returns false when warband is not in a non-empty permittedWarbands', () => {
    const item = { permittedWarbands: ['Middenheim'], excludedWarbands: [] };
    assert.equal(DataService.canWarbandAccess(item, 'Reikland'), false);
  });

  it('returns false when warband is in excludedWarbands', () => {
    const item = { permittedWarbands: [], excludedWarbands: ['Skaven'] };
    assert.equal(DataService.canWarbandAccess(item, 'Skaven'), false);
  });

  it('exclusion takes priority over permission', () => {
    const item = { permittedWarbands: ['Reikland'], excludedWarbands: ['Reikland'] };
    assert.equal(DataService.canWarbandAccess(item, 'Reikland'), false);
  });
});
