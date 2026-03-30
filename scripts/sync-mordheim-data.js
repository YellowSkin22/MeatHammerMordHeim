#!/usr/bin/env node
'use strict';

/**
 * sync-mordheim-data.js
 *
 * Nightly sync from Uncle-Mel/JSON-derulo → data/*.json
 *
 * Usage:
 *   node scripts/sync-mordheim-data.js            # normal run
 *   node scripts/sync-mordheim-data.js --dry-run  # transform + validate, no writes/commits
 *   node scripts/sync-mordheim-data.js --force    # ignore cached SHAs, reprocess all files
 *
 * Requires: gh CLI authenticated, NETLIFY_DEPLOY_HOOK env var
 */

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ─── Config ───────────────────────────────────────────────────────────────

const SOURCE_REPO     = 'Uncle-Mel/JSON-derulo';
const ROOT_DIR        = path.resolve(__dirname, '..');
const DATA_DIR        = path.join(ROOT_DIR, 'data');
const SYNC_STATE_PATH = path.join(DATA_DIR, '.sync-state.json');
const NETLIFY_HOOK    = process.env.NETLIFY_DEPLOY_HOOK;

const REQUIRED_STAT_KEYS = ['M', 'WS', 'BS', 'S', 'T', 'W', 'I', 'A', 'Ld'];

// Files to track for change detection (path in source repo → internal key)
const TRACKED_FILES = [
  { key: 'equipment', path: 'data/mergedEquipment.json' },
  { key: 'skills',    path: 'data/skills.json'          },
  { key: 'magic',     path: 'data/magic.json'           },
];
const WARBAND_FOLDER = 'data/warbandFiles';

// ─── GitHub helpers ───────────────────────────────────────────────────────

function ghApi(endpoint) {
  try {
    const out = execSync(`gh api "${endpoint}"`, { encoding: 'utf8' });
    return JSON.parse(out);
  } catch (e) {
    throw new Error(`GitHub API error for ${endpoint}: ${e.message}`);
  }
}

function ghRaw(filePath) {
  // Use the authenticated GitHub API to fetch file contents (works for private repos)
  try {
    const meta = ghApi(`repos/${SOURCE_REPO}/contents/${encodeURIComponent(filePath)}`);
    if (meta.encoding !== 'base64' || !meta.content) {
      throw new Error(`Unexpected content format for ${filePath}`);
    }
    const decoded = Buffer.from(meta.content, 'base64').toString('utf8');
    return JSON.parse(decoded);
  } catch (e) {
    throw new Error(`Failed to fetch ${filePath}: ${e.message}`);
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[''']/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function stripHtml(str) {
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
}

function mapStatKeys(statblock) {
  if (!statblock) return null;
  return {
    M:  statblock.m  ?? statblock.M  ?? 4,
    WS: statblock.ws ?? statblock.WS ?? 3,
    BS: statblock.bs ?? statblock.BS ?? 3,
    S:  statblock.s  ?? statblock.S  ?? 3,
    T:  statblock.t  ?? statblock.T  ?? 3,
    W:  statblock.w  ?? statblock.W  ?? 1,
    I:  statblock.i  ?? statblock.I  ?? 3,
    A:  statblock.a  ?? statblock.A  ?? 1,
    Ld: statblock.ld ?? statblock.Ld ?? 7,
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

// ─── Equipment ────────────────────────────────────────────────────────────
//
// Source: mergedEquipment.json — flat array, types: melee/missile/blackpowder/armour/misc/animal
// Stored as-is to data/mergedEquipment.json — no transformation needed.
// App reads Uncle Mel's structure directly (Phase 1 migration).
//
// EQUIP_TYPE_MAP is still used by the warband transformer to resolve allowedEquipment category IDs.

const EQUIP_TYPE_MAP = {
  melee:       'hand_to_hand',
  missile:     'missiles',
  blackpowder: 'missiles',
  armour:      'armour',
  misc:        'miscellaneous',
  animal:      null,
};

// Maps warband ID → special skill category IDs (for fighters with skillAccess.special === true)
const WARBAND_SPECIAL_SKILL_CATEGORIES = {
  'dark-elves':               ['dark_elf_special'],
  'dwarf-treasure-hunters':   ['dwarf_special', 'troll_slayer_special'],
  'beastmen-raiders':         ['beastmen_special'],
  'orc-mob':                  ['orc_special'],
  'shadow-warriors':          ['shadow_warrior_special'],
  'pit-fighters':             ['pit_fighter_special'],
  'skaven-of-clan-eshin':     ['skaven_special'],
  'skaven-of-clan-pestilens': ['clan_pestilens_special'],
  'bretonnians':              ['bretonnian_special'],
  'horned-hunters':           ['horned_hunter_special'],
};

// ─── Skills transformer ───────────────────────────────────────────────────
//
// Source: skills.json — flat array with subtype field
// Ours:   skills.json — { skillCategories: { combat: { skills: [] }, ... } }
//
// Subtype mapping:
//   "Combat Skill"   → combat
//   "Shooting Skill" → shooting
//   "Academic Skill" → academic
//   "Strength Skill" → strength
//   "Speed Skill"    → speed
//   "Special Skill"  → SKIP (warband-specific, managed manually)
//   "Cavalry Skill"  → SKIP

const SKILL_SUBTYPE_MAP = {
  'Combat Skill':   'combat',
  'Shooting Skill': 'shooting',
  'Academic Skill': 'academic',
  'Strength Skill': 'strength',
  'Speed Skill':    'speed',
};

function transformSkills(sourceItems, existing) {
  // Seed with existing categories (preserves category names and any custom categories)
  const result = { skillCategories: {} };
  for (const [catId, cat] of Object.entries(existing.skillCategories || {})) {
    result.skillCategories[catId] = { name: cat.name, skills: [] };
  }

  const existingById = {};
  for (const cat of Object.values(existing.skillCategories || {})) {
    for (const skill of (cat.skills || [])) {
      existingById[skill.id] = skill;
    }
  }

  const seenIds = new Set();
  const added = [], updated = [];

  for (const src of sourceItems) {
    const catKey = SKILL_SUBTYPE_MAP[src.subtype];
    if (!catKey) continue;

    if (!result.skillCategories[catKey]) {
      result.skillCategories[catKey] = {
        name:   src.subtype.replace(' Skill', ' Skills'),
        skills: [],
      };
    }

    const id   = slugify(src.name);
    const prev = existingById[id];

    const description = stripHtml(
      (src.Rules?.[0]?.ruleAbbreviated) ||
      (src.Rules?.[0]?.ruleFull)        ||
      prev?.description                 ||
      ''
    );

    seenIds.add(id);

    if (prev) {
      if (description !== prev.description || src.name !== prev.name) updated.push(id);
    } else {
      added.push(id);
    }

    result.skillCategories[catKey].skills.push({ id, name: src.name, description });
  }

  // Preserve existing skills not in source
  for (const [catId, cat] of Object.entries(existing.skillCategories || {})) {
    if (!result.skillCategories[catId]) continue;
    for (const skill of (cat.skills || [])) {
      if (seenIds.has(skill.id)) continue;
      result.skillCategories[catId].skills.push(skill);
    }
  }

  return { data: result, added, updated };
}

// ─── Spells transformer ───────────────────────────────────────────────────
//
// Source: magic.json — { spellLists: { [id]: { name, permittedWarbands, spells[] } } }
// Ours:   spells.json — { spellLists: { [id]: { name, spells[] } } }
//
// Both share the same top-level structure — closest match of all four files.

function transformSpells(sourceData, existing) {
  const result = { spellLists: { ...(existing.spellLists || {}) } };
  const added = [], updated = [];

  for (const [listId, srcList] of Object.entries(sourceData.spellLists || {})) {
    const existingSpells = {};
    for (const sp of (existing.spellLists?.[listId]?.spells || [])) {
      existingSpells[sp.id] = sp;
    }

    const spells = [];
    for (const src of (srcList.spells || [])) {
      // Some source entries lack an id — generate one from the name
      const id          = src.id || slugify(src.name);
      const prev        = existingSpells[id];
      const description = stripHtml(src.ruleFull || src.ruleAbbreviated || prev?.description || '');

      if (prev) {
        if (description !== prev.description || src.name !== prev.name) {
          updated.push(`${listId}/${id}`);
        }
      } else {
        added.push(`${listId}/${id}`);
      }

      spells.push({
        id,
        name:        src.name,
        difficulty:  src.difficulty,
        description,
      });
    }

    // Preserve spells not in source
    for (const [id, sp] of Object.entries(existingSpells)) {
      if (!spells.some(s => s.id === id)) spells.push(sp);
    }

    result.spellLists[listId] = { name: srcList.name, spells };
  }

  return { data: result, added, updated };
}

// ─── Warbands transformer ─────────────────────────────────────────────────
//
// Source: individual warbandFiles/{grade}/{id}.json files
// Ours:   warbands.json — { warbands: [] }
//
// Key field mappings:
//   warbandRules.startingGc → startingGold
//   warbandRules.maxModels  → maxWarband
//   fighters[type=hero]     → heroes[]
//     minQty >= 1           → required
//     maxQty                → max
//     costGc                → cost
//     statblock (lowercase) → stats (uppercase M/WS/BS/S/T/W/I/A/Ld)
//     startingXp            → startingExp
//     skillAccess (object or subfaction array) → skillAccess (array of truthy keys, excluding "special")
//     specialRules[].rulename → specialRules[] (flat string array)
//   fighters[type=henchman] → henchmen[]
//     groupSize.max         → maxGroupSize
//
// spellAccess: cross-referenced from magic.json permittedWarbands by warband name + fighter name
// allowedEquipment: resolved from fighter.equipmentLists → warband.equipmentLists items, cross-ref'd against equipment.json
// equipmentAccess: defaults to all three categories for both heroes and henchmen

function buildEquipmentNameLookup(equipmentItems) {
  // equipmentItems: flat array from mergedEquipment.json
  // Returns: { "lowercase item name" → { id, category } }
  const map = {};
  for (const item of (equipmentItems || [])) {
    const catId = EQUIP_TYPE_MAP[item.type];
    if (!catId) continue;
    const id = slugify(item.name);
    map[item.name.toLowerCase()] = { id, category: catId };
  }
  return map;
}

function buildSpellAccessMap(magicData) {
  // Returns: { "Warband Name": { "Fighter Name": ["spell-list-id", ...] } }
  const map = {};
  for (const [listId, list] of Object.entries(magicData.spellLists || {})) {
    for (const entry of (list.permittedWarbands || [])) {
      const wbName = entry.warband || '';
      const ftName = entry.fighter || '';
      if (!map[wbName]) map[wbName] = {};
      if (!map[wbName][ftName]) map[wbName][ftName] = [];
      map[wbName][ftName].push(listId);
    }
  }
  return map;
}

function findSpellAccess(spellMap, warbandName, fighterName) {
  // Try exact match first, then case-insensitive partial match on warband name
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
}

function resolveAllowedEquipment(fighter, src, equipmentLookup) {
  const allowedEquipment = [];
  for (const listId of (fighter.equipmentLists || [])) {
    const list = (src.equipmentLists || []).find(l => l.id === listId);
    if (!list) continue;
    for (const item of (list.items || [])) {
      const nameLower = item.name.toLowerCase();
      // Fallback: strip parenthetical suffix (e.g. "dagger (free)" → "dagger")
      const baseNameLower = nameLower.replace(/\s*\([^)]*\)\s*$/, '').trim();
      const match = equipmentLookup[nameLower] || equipmentLookup[baseNameLower];
      if (!match) continue; // skip items not in our equipment.json
      if (allowedEquipment.some(e => e.id === match.id)) continue; // deduplicate
      const entry = { id: match.id, name: item.name, cost: item.cost?.cost ?? 0 };
      if (item.cost?.costPrefix) entry.costPrefix = item.cost.costPrefix;
      allowedEquipment.push(entry);
    }
  }
  return allowedEquipment;
}

function resolveSkillAccess(fighter, subfaction, warbandId) {
  // skillAccess is either:
  //   - an object: { combat: true, shooting: false, ..., special: true }  (non-subfaction warbands)
  //   - an array:  [{ subfaction: "Name", skills: { ... } }, ...]  (subfaction warbands)
  let skillsObj;
  if (Array.isArray(fighter.skillAccess)) {
    const entry = subfaction
      ? fighter.skillAccess.find(e => e.subfaction === subfaction)
      : fighter.skillAccess[0];
    skillsObj = entry?.skills || {};
  } else {
    skillsObj = fighter.skillAccess || {};
  }

  const result = Object.entries(skillsObj)
    .filter(([k, v]) => v && k !== 'special')
    .map(([k]) => k);

  // Append warband-specific skill categories when fighter has special: true
  if (skillsObj.special && warbandId) {
    for (const catId of (WARBAND_SPECIAL_SKILL_CATEGORIES[warbandId] || [])) {
      if (!result.includes(catId)) result.push(catId);
    }
  }

  return result;
}

function transformOneWarband(src, spellMap, equipmentLookup, subfaction = null) {
  const warbandName = subfaction || src.name;
  const warbandId   = subfaction ? slugify(subfaction) : src.id;
  const heroes      = [];
  const henchmen    = [];

  for (const fighter of (src.fighters || [])) {
    const stats            = mapStatKeys(fighter.statblock);
    const specialRules     = (fighter.specialRules || []).map(r => r.rulename).filter(Boolean);
    const skillAccess      = resolveSkillAccess(fighter, subfaction, src.id);
    const allowedEquipment = resolveAllowedEquipment(fighter, src, equipmentLookup);

    if (fighter.type === 'hero') {
      const spellAccess = findSpellAccess(spellMap, warbandName, fighter.name);
      heroes.push({
        type:             fighter.id,
        name:             fighter.name,
        max:              fighter.maxQty  ?? 1,
        required:         (fighter.minQty ?? 0) >= 1,
        cost:             fighter.costGc  ?? 0,
        stats,
        specialRules,
        startingExp:      fighter.startingXp ?? 0,
        skillAccess,
        spellAccess,
        allowedEquipment,
      });
    } else if (fighter.type === 'henchman') {
      henchmen.push({
        type:             fighter.id,
        name:             fighter.name,
        cost:             fighter.costGc ?? 0,
        stats,
        specialRules,
        maxGroupSize:     fighter.groupSize?.max ?? 5,
        allowedEquipment,
      });
    }
  }

  const description = stripHtml(
    src.lore || src.warbandRules?.choiceFluff || ''
  ).replace(/\s+/g, ' ').slice(0, 300);

  return {
    id:           warbandId,
    name:         warbandName,
    source:       src.source || '',
    description,
    startingGold: src.warbandRules?.startingGc ?? 500,
    maxWarband:   src.warbandRules?.maxModels  ?? 15,
    alignment:    '',
    heroes,
    henchmen,
    equipmentAccess: {
      heroes:   ['hand_to_hand', 'missiles', 'armour'],
      henchmen: ['hand_to_hand', 'missiles', 'armour'],
    },
  };
}

function transformWarbands(warbandFiles, existing, magicData, equipmentLookup) {
  const spellMap = buildSpellAccessMap(magicData);

  // Build lookup of existing warbands to preserve hand-tuned fields
  const existingById = {};
  for (const w of (existing.warbands || [])) {
    existingById[w.id] = w;
  }

  const result  = { warbands: [] };
  const added   = [];
  const updated = [];

  for (const src of warbandFiles) {
    if (!src.id || !src.fighters) continue;

    // Expand subfaction warbands (e.g. Mercenaries → Reikland / Middenheim / Marienburg)
    const subfactionOptions = src.subfactions?.options;
    const expansions = subfactionOptions
      ? subfactionOptions.map(opt => ({ subfaction: opt }))
      : [{ subfaction: null }];

    for (const { subfaction } of expansions) {
      const transformed = transformOneWarband(src, spellMap, equipmentLookup, subfaction);
      const prev        = existingById[transformed.id];

      if (prev) {
        if (prev.alignment)       transformed.alignment       = prev.alignment;
        if (prev.description)     transformed.description     = prev.description;
        if (prev.equipmentAccess) transformed.equipmentAccess = prev.equipmentAccess;
        updated.push(transformed.id);
      } else {
        added.push(transformed.id);
      }

      result.warbands.push(transformed);
    }
  }

  // Per project decision: do NOT preserve warbands absent from source
  // (core warbands are intentionally removed to align with Uncle-Mel repo)

  return { data: result, added, updated };
}

// ─── Validators ───────────────────────────────────────────────────────────

function validateWarbands(data) {
  if (!Array.isArray(data.warbands)) throw new Error('Missing warbands array');
  if (data.warbands.length === 0)    throw new Error('Warbands array is empty');
  for (const w of data.warbands) {
    if (!w.id)                       throw new Error(`Warband missing id`);
    if (!w.name)                     throw new Error(`Warband ${w.id} missing name`);
    if (!Array.isArray(w.heroes))    throw new Error(`Warband ${w.id} missing heroes array`);
    if (!Array.isArray(w.henchmen))  throw new Error(`Warband ${w.id} missing henchmen array`);
    if (!w.heroes.length && !w.henchmen.length) {
      throw new Error(`Warband ${w.id} has no fighters`);
    }
    for (const f of [...w.heroes, ...w.henchmen]) {
      if (!f.stats) throw new Error(`Fighter ${f.type} in ${w.id} missing stats`);
      for (const key of REQUIRED_STAT_KEYS) {
        if (f.stats[key] == null) {
          throw new Error(`Fighter ${f.type} in ${w.id} missing stat ${key}`);
        }
      }
    }
  }
}

function validateEquipment(data) {
  if (!Array.isArray(data)) throw new Error('Equipment must be a flat array');
  if (data.length === 0)    throw new Error('Equipment array is empty');
  for (const item of data) {
    if (!item.name) throw new Error(`Equipment item missing name`);
    if (!item.type) throw new Error(`Equipment "${item.name}" missing type`);
  }
}

function validateSkills(data) {
  if (!data.skillCategories) throw new Error('Missing skillCategories object');
  for (const [catId, cat] of Object.entries(data.skillCategories)) {
    for (const skill of (cat.skills || [])) {
      if (!skill.id)   throw new Error(`Skill missing id in ${catId}`);
      if (!skill.name) throw new Error(`Skill ${skill.id} missing name`);
    }
  }
}

function validateSpells(data) {
  if (!data.spellLists) throw new Error('Missing spellLists object');
  for (const [listId, list] of Object.entries(data.spellLists)) {
    for (const spell of (list.spells || [])) {
      if (!spell.id)                throw new Error(`Spell missing id in ${listId}`);
      if (!spell.name)              throw new Error(`Spell ${spell.id} missing name`);
      if (spell.difficulty == null) throw new Error(`Spell ${spell.id} missing difficulty`);
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  const args    = process.argv.slice(2);
  const dryRun  = args.includes('--dry-run');
  const forceAll = args.includes('--force');

  const timestamp = new Date().toISOString();
  console.log(`\n🔄  Mordheim Data Sync — ${timestamp}`);
  console.log(`    Source: ${SOURCE_REPO}`);
  console.log(`    Mode:   ${dryRun ? 'DRY RUN' : 'LIVE'}${forceAll ? ' + FORCE' : ''}\n`);

  // ── Load sync state ──────────────────────────────────────────────────────
  let syncState = { lastChecked: null, files: {} };
  if (fs.existsSync(SYNC_STATE_PATH)) {
    syncState = readJson(SYNC_STATE_PATH);
  }

  // ── Fetch repo tree once (used for warband folder SHA + file list) ───────
  console.log('Fetching source repo tree...');
  const treeData = ghApi(`repos/${SOURCE_REPO}/git/trees/main?recursive=1`);

  // ── Detect changes ───────────────────────────────────────────────────────
  console.log('Checking for changes...');
  const changes = {};

  // Individual files
  for (const file of TRACKED_FILES) {
    const commits  = ghApi(`repos/${SOURCE_REPO}/commits?path=${encodeURIComponent(file.path)}&per_page=1`);
    const latestSha = commits[0]?.sha;
    const storedSha = syncState.files[file.path]?.sha;

    if (forceAll || latestSha !== storedSha) {
      console.log(`  ✓ ${file.path} — changed (${storedSha?.slice(0,7) ?? 'new'} → ${latestSha?.slice(0,7)})`);
      changes[file.key] = { repoPath: file.path, sha: latestSha };
    } else {
      console.log(`  — ${file.path} — up to date`);
    }
  }

  // Warband folder (compare tree SHA of the folder node)
  const warbandFolderNode = treeData.tree.find(n => n.path === WARBAND_FOLDER && n.type === 'tree');
  const warbandFolderSha  = warbandFolderNode?.sha;
  const storedWarbandSha  = syncState.files[WARBAND_FOLDER]?.sha;

  if (forceAll || warbandFolderSha !== storedWarbandSha) {
    console.log(`  ✓ ${WARBAND_FOLDER} — changed`);
    changes.warbands = { repoPath: WARBAND_FOLDER, sha: warbandFolderSha };
  } else {
    console.log(`  — ${WARBAND_FOLDER} — up to date`);
  }

  if (Object.keys(changes).length === 0) {
    console.log('\n✅  No updates found. Nothing to sync.\n');
    syncState.lastChecked = timestamp;
    if (!dryRun) writeJson(SYNC_STATE_PATH, syncState);
    return;
  }

  // ── Fetch magic data upfront (needed for warband spellAccess cross-ref) ──
  // Always fetch magic even if it hasn't changed, so warband cross-ref works
  let magicData = { spellLists: {} };
  try {
    magicData = ghRaw('data/magic.json');
  } catch (e) {
    console.warn(`  ⚠  Could not fetch magic.json for spell cross-ref: ${e.message}`);
  }

  // ── Process changes ──────────────────────────────────────────────────────
  console.log(`\n📥  Processing ${Object.keys(changes).length} changed file(s)...\n`);

  const summary = { added: {}, updated: {}, errors: [] };

  // Equipment — write Uncle Mel's file directly, no transformation
  if (changes.equipment) {
    const label = 'equipment';
    try {
      process.stdout.write('  equipment... ');
      const src = ghRaw('data/mergedEquipment.json');
      validateEquipment(src);
      if (!dryRun) writeJson(path.join(DATA_DIR, 'mergedEquipment.json'), src);
      summary.added[label]   = [];
      summary.updated[label] = [];
      console.log(`${src.length} items ✓`);
    } catch (err) {
      summary.errors.push(`Equipment: ${err.message}`);
      console.log(`FAILED: ${err.message}`);
    }
  }

  // Skills
  if (changes.skills) {
    const label = 'skills';
    try {
      process.stdout.write('  skills... ');
      const src      = ghRaw('data/skills.json');
      const existing = readJson(path.join(DATA_DIR, 'skills.json'));
      const { data, added, updated } = transformSkills(src, existing);
      validateSkills(data);
      if (!dryRun) writeJson(path.join(DATA_DIR, 'skills.json'), data);
      summary.added[label]   = added;
      summary.updated[label] = updated;
      console.log(`+${added.length} added, ~${updated.length} updated ✓`);
    } catch (err) {
      summary.errors.push(`Skills: ${err.message}`);
      console.log(`FAILED: ${err.message}`);
    }
  }

  // Spells / magic
  if (changes.magic) {
    const label = 'spells';
    try {
      process.stdout.write('  spells... ');
      // Save raw magic.json for Phase 3 — data.js loads it directly
      if (!dryRun) writeJson(path.join(DATA_DIR, 'magic.json'), magicData);
      // Also transform to spells.json (kept until Phase 4 cleanup)
      const existing = readJson(path.join(DATA_DIR, 'spells.json'));
      const { data, added, updated } = transformSpells(magicData, existing);
      validateSpells(data);
      if (!dryRun) writeJson(path.join(DATA_DIR, 'spells.json'), data);
      summary.added[label]   = added;
      summary.updated[label] = updated;
      console.log(`${Object.keys(magicData.spellLists || {}).length} lists, +${added.length} new spells ✓`);
    } catch (err) {
      summary.errors.push(`Spells: ${err.message}`);
      console.log(`FAILED: ${err.message}`);
    }
  }

  // Warbands
  if (changes.warbands) {
    const label = 'warbands';
    try {
      process.stdout.write('  warbands... ');

      // Collect all warband JSON files from the tree
      const warbandBlobs = treeData.tree.filter(n =>
        n.path.startsWith(WARBAND_FOLDER + '/') &&
        n.path.endsWith('.json') &&
        n.type === 'blob' &&
        !n.path.includes('reference') &&
        !n.path.includes('test') &&
        !/-old\.json$/.test(n.path) &&
        !/-original\.json$/.test(n.path) &&
        !/-web\.json$/.test(n.path)
      );

      const warbandDocs = [];
      for (const blob of warbandBlobs) {
        try {
          const doc = ghRaw(blob.path);
          if (doc.id && Array.isArray(doc.fighters)) warbandDocs.push(doc);
        } catch (e) {
          console.warn(`\n    ⚠  Skipping ${blob.path}: ${e.message}`);
        }
      }

      process.stdout.write(`(${warbandDocs.length} files) `);

      const existing          = readJson(path.join(DATA_DIR, 'warbands.json'));
      const existingEquipment = readJson(path.join(DATA_DIR, 'mergedEquipment.json'));
      const equipmentLookup   = buildEquipmentNameLookup(existingEquipment);
      const { data, added, updated } = transformWarbands(warbandDocs, existing, magicData, equipmentLookup);
      validateWarbands(data);
      if (!dryRun) writeJson(path.join(DATA_DIR, 'warbands.json'), data);
      summary.added[label]   = added;
      summary.updated[label] = updated;
      console.log(`+${added.length} added, ~${updated.length} updated, total: ${data.warbands.length} ✓`);
    } catch (err) {
      summary.errors.push(`Warbands: ${err.message}`);
      console.log(`FAILED: ${err.message}`);
    }
  }

  // ── Abort on errors (before committing) ─────────────────────────────────
  if (summary.errors.length > 0) {
    console.error('\n❌  Validation errors — aborting (no files committed):\n');
    for (const e of summary.errors) console.error(`    • ${e}`);
    process.exit(1);
  }

  if (dryRun) {
    console.log('\n✅  Dry run complete. Files NOT written. Summary:');
    printSummary(summary);
    return;
  }

  // ── Update sync state ────────────────────────────────────────────────────
  for (const [key, change] of Object.entries(changes)) {
    syncState.files[change.repoPath] = { sha: change.sha, syncedAt: timestamp };
  }
  syncState.lastChecked = timestamp;
  writeJson(SYNC_STATE_PATH, syncState);

  // ── Commit & push ────────────────────────────────────────────────────────
  console.log('\n📝  Committing...');
  try {
    execSync('git add data/', { cwd: ROOT_DIR, stdio: 'pipe' });
    const staged = execSync('git diff --cached --name-only', { cwd: ROOT_DIR, encoding: 'utf8' }).trim();

    if (!staged) {
      console.log('    No file changes to commit (content identical after transform).');
    } else {
      const date = timestamp.slice(0, 10);
      execSync(
        `git commit -m "chore: sync data from JSON-derulo [${date}]"`,
        { cwd: ROOT_DIR, stdio: 'pipe' }
      );
      execSync('git push origin main', { cwd: ROOT_DIR, stdio: 'pipe' });
      console.log('    ✓ Committed and pushed');

      // ── Trigger Netlify redeploy ─────────────────────────────────────────
      if (NETLIFY_HOOK) {
        console.log('\n🚀  Triggering Netlify redeploy...');
        execSync(`curl -sf -X POST "${NETLIFY_HOOK}"`, { stdio: 'pipe' });
        console.log('    ✓ Deploy triggered');
      } else {
        console.warn('    ⚠  NETLIFY_DEPLOY_HOOK not set — skipping redeploy');
      }
    }
  } catch (err) {
    console.error(`\n❌  Git/deploy error: ${err.message}`);
    process.exit(1);
  }

  console.log('\n✅  Sync complete!');
  printSummary(summary);
}

function printSummary(summary) {
  const lines = [];
  for (const type of Object.keys({ ...summary.added, ...summary.updated })) {
    const a = summary.added[type]?.length   ?? 0;
    const u = summary.updated[type]?.length ?? 0;
    if (a || u) lines.push(`    ${type}: +${a} new, ~${u} updated`);
  }
  if (lines.length) {
    console.log('\n    Summary:');
    for (const l of lines) console.log(l);
  }
  console.log();
}

main().catch(err => {
  console.error('\n❌  Fatal:', err.message);
  process.exit(1);
});
