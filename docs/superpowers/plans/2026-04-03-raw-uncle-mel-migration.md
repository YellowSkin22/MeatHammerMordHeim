# Raw Uncle-Mel Data Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all transformed/merged data files with verbatim Uncle-Mel/JSON-derulo copies stored in the same directory structure, and update the full app chain (sync → DataService → Storage → RosterModel → UI) to work with the raw format natively.

**Architecture:** The sync script becomes a pure file downloader. DataService stores raw Uncle-Mel objects and exposes them through updated getter methods. RosterModel and UI are updated to speak Uncle-Mel's field names and lowercase stat keys throughout.

**Tech Stack:** Vanilla JS, Node.js (sync script), GitHub CLI (`gh`), localStorage, Supabase (unaffected by this change).

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `scripts/sync-mordheim-data.js` | **Rewrite** | Pure file downloader; dynamic grade discovery; generates `index.json` |
| `data/advancement.json` | **Edit** | Remove `maxStats` block |
| `js/data.js` | **Rewrite** | Load raw files; expose raw Uncle-Mel objects via updated getters |
| `js/storage.js` | **Edit** | One-time migration: uppercase stats → lowercase; old skillAccess IDs → subtypes |
| `js/roster.js` | **Edit** | `createWarrior`/`createHiredSword`/`modifyStat` use raw Uncle-Mel fields |
| `js/ui.js` | **Edit (many hunks)** | Stat keys lowercase; warband picker; equipment modal on-the-fly; skill modal subtype-based |
| `index.html` | **Edit** | Bump `?v=N` cache-bust on `data.js` |

---

## Task 1: Create feature branch

**Files:** none

- [ ] **Step 1: Create and switch to feature branch**

```bash
git checkout -b feature/raw-uncle-mel-data
```

- [ ] **Step 2: Verify branch**

```bash
git branch --show-current
```

Expected output: `feature/raw-uncle-mel-data`

- [ ] **Step 3: Commit**

No files changed yet — nothing to commit.

---

## Task 2: Rewrite sync script

**Files:**
- Rewrite: `scripts/sync-mordheim-data.js`

The new script is ~200 lines. It discovers grade folders dynamically, downloads each warband file and the five flat files verbatim, generates `data/warbandFiles/index.json`, and removes the old merged files on first run.

- [ ] **Step 1: Replace `scripts/sync-mordheim-data.js` with the following**

```javascript
#!/usr/bin/env node
'use strict';

/**
 * sync-mordheim-data.js
 *
 * Downloads Uncle-Mel/JSON-derulo data files verbatim — no transformation.
 *
 * Usage:
 *   node scripts/sync-mordheim-data.js            # normal run
 *   node scripts/sync-mordheim-data.js --dry-run  # preview changes without writing
 *   node scripts/sync-mordheim-data.js --force    # re-download all files even if SHA unchanged
 */

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SOURCE_REPO     = 'Uncle-Mel/JSON-derulo';
const ROOT_DIR        = path.resolve(__dirname, '..');
const DATA_DIR        = path.join(ROOT_DIR, 'data');
const SYNC_STATE_PATH = path.join(DATA_DIR, '.sync-state.json');
const WARBAND_FOLDER  = 'data/warbandFiles';
const NETLIFY_HOOK    = process.env.NETLIFY_DEPLOY_HOOK;

// Flat files to download verbatim (source path in Uncle-Mel → local path)
const VERBATIM_FILES = [
  { src: 'data/equipment.json',   dest: 'data/equipment.json'   },
  { src: 'data/skills.json',      dest: 'data/skills.json'      },
  { src: 'data/magic.json',       dest: 'data/magic.json'       },
  { src: 'data/hiredSwords.json', dest: 'data/hiredSwords.json' },
  { src: 'data/maxStats.json',    dest: 'data/maxStats.json'    },
];

// Warband files matching these patterns are skipped (non-canonical variants)
const SKIP_PATTERNS = [/-old\.json$/, /-original\.json$/, /reference/, /test\.ps1/];

// ─── GitHub helpers ───────────────────────────────────────────────────────

function ghApi(endpoint) {
  try {
    return JSON.parse(execSync(`gh api "${endpoint}"`, { encoding: 'utf8' }));
  } catch (e) {
    throw new Error(`GitHub API error for ${endpoint}: ${e.message}`);
  }
}

function downloadJson(srcPath) {
  const meta = ghApi(`repos/${SOURCE_REPO}/contents/${encodeURIComponent(srcPath)}`);
  if (!meta.content) throw new Error(`No content for ${srcPath}`);
  return {
    data: JSON.parse(Buffer.from(meta.content, 'base64').toString('utf8')),
    sha:  meta.sha,
  };
}

// ─── Utilities ────────────────────────────────────────────────────────────

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

function loadSyncState() {
  try { return readJson(SYNC_STATE_PATH); } catch { return { files: {} }; }
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  const dryRun  = process.argv.includes('--dry-run');
  const force   = process.argv.includes('--force');
  const timestamp = new Date().toISOString();

  console.log(`\n🔄  Mordheim Data Sync — ${timestamp}`);
  console.log(`    Source: ${SOURCE_REPO}`);
  console.log(`    Mode:   ${dryRun ? 'DRY RUN' : 'LIVE'}${force ? ' + FORCE' : ''}\n`);

  const state   = loadSyncState();
  let   changed = false;

  // ── Remove old merged files (one-time cleanup) ─────────────────────────
  for (const old of ['data/warbands.json', 'data/mergedEquipment.json', 'data/hired_swords.json']) {
    const p = path.join(ROOT_DIR, old);
    if (fs.existsSync(p)) {
      console.log(`  Removing old file: ${old}`);
      if (!dryRun) { fs.unlinkSync(p); changed = true; }
    }
  }

  // ── Flat verbatim files ────────────────────────────────────────────────
  for (const { src, dest } of VERBATIM_FILES) {
    const meta = ghApi(`repos/${SOURCE_REPO}/contents/${encodeURIComponent(src)}`);
    if (!force && state.files[src] === meta.sha) {
      console.log(`  Skipping unchanged: ${dest}`);
      continue;
    }
    const { data } = downloadJson(src);
    console.log(`  Downloading: ${dest}`);
    if (!dryRun) {
      writeJson(path.join(ROOT_DIR, dest), data);
      state.files[src] = meta.sha;
      changed = true;
    }
  }

  // ── Warband files (dynamic grade discovery) ────────────────────────────
  const gradeItems = ghApi(`repos/${SOURCE_REPO}/contents/${WARBAND_FOLDER}`);
  const grades     = gradeItems.filter(i => i.type === 'dir').map(i => i.name);
  const indexEntries = [];

  for (const grade of grades) {
    const fileItems = ghApi(`repos/${SOURCE_REPO}/contents/${WARBAND_FOLDER}/${grade}`);
    const jsonFiles = fileItems.filter(
      i => i.type === 'file' && i.name.endsWith('.json') &&
           !SKIP_PATTERNS.some(p => p.test(i.name))
    );

    for (const file of jsonFiles) {
      const srcPath  = `${WARBAND_FOLDER}/${grade}/${file.name}`;
      const destPath = `data/warbandFiles/${grade}/${file.name}`;
      indexEntries.push({ grade, path: destPath });

      if (!force && state.files[srcPath] === file.sha) {
        console.log(`  Skipping unchanged: ${destPath}`);
        continue;
      }
      const { data } = downloadJson(srcPath);
      console.log(`  Downloading: ${destPath}`);
      if (!dryRun) {
        writeJson(path.join(ROOT_DIR, destPath), data);
        state.files[srcPath] = file.sha;
        changed = true;
      }
    }
  }

  // ── Write index.json ───────────────────────────────────────────────────
  const indexPath = path.join(ROOT_DIR, 'data/warbandFiles/index.json');
  console.log(`  Writing: data/warbandFiles/index.json (${indexEntries.length} entries)`);
  if (!dryRun) {
    writeJson(indexPath, indexEntries);
    changed = true;
  }

  if (dryRun) {
    console.log('\n✅  Dry run complete. Files NOT written.\n');
    return;
  }

  state.lastChecked = timestamp;
  writeJson(SYNC_STATE_PATH, state);

  // ── Commit & push ──────────────────────────────────────────────────────
  if (changed) {
    console.log('\n📝  Committing...');
    try {
      execSync('git add data/', { cwd: ROOT_DIR, stdio: 'pipe' });
      const staged = execSync('git diff --cached --name-only', { cwd: ROOT_DIR, encoding: 'utf8' }).trim();

      if (!staged) {
        console.log('    No file changes to commit.');
      } else {
        const date = timestamp.slice(0, 10);
        execSync(
          `git commit -m "chore: sync data from JSON-derulo [${date}]"`,
          { cwd: ROOT_DIR, stdio: 'pipe' }
        );
        execSync('git push origin feature/raw-uncle-mel-data', { cwd: ROOT_DIR, stdio: 'pipe' });
        console.log('    ✓ Committed and pushed');

        if (NETLIFY_HOOK) {
          execSync(`curl -sf -X POST "${NETLIFY_HOOK}"`, { stdio: 'pipe' });
          console.log('    ✓ Netlify deploy triggered');
        }
      }
    } catch (err) {
      console.error(`\n❌  Git/deploy error: ${err.message}`);
      process.exit(1);
    }
  }

  console.log('\n✅  Sync complete!\n');
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Verify the script runs (dry run)**

```bash
node scripts/sync-mordheim-data.js --dry-run
```

Expected: lists files it would download, no errors, ends with "Dry run complete."

- [ ] **Step 3: Run the sync for real**

```bash
node scripts/sync-mordheim-data.js
```

Expected: downloads warband files into `data/warbandFiles/1a/`, `1b/`, `1c/`, downloads `equipment.json`, `skills.json`, `magic.json`, `hiredSwords.json`, `maxStats.json`, writes `data/warbandFiles/index.json`, removes `warbands.json`, `mergedEquipment.json`, `hired_swords.json`, commits.

- [ ] **Step 4: Verify data directory**

```bash
ls data/warbandFiles/
ls data/warbandFiles/1a/ | head -5
ls data/ | grep -v warbandFiles
```

Expected: grade subdirectories plus `index.json` in `warbandFiles/`; `equipment.json`, `skills.json`, `magic.json`, `hiredSwords.json`, `maxStats.json` in `data/`.

---

## Task 3: Update `data/advancement.json`

**Files:**
- Edit: `data/advancement.json`

Remove the `maxStats` block — it's now in `data/maxStats.json`.

- [ ] **Step 1: Edit `data/advancement.json` — remove the `maxStats` key**

The file currently ends with:
```json
  "maxStats": {
    "note": "Maximum characteristic values for stat increases",
    "M": 10,
    "WS": 10,
    "BS": 10,
    "S": 7,
    "T": 7,
    "W": 5,
    "I": 10,
    "A": 5,
    "Ld": 10
  }
}
```

Remove that entire `"maxStats"` key so the file ends after `"experienceRewards": { ... }`.

- [ ] **Step 2: Validate**

```bash
node -e "JSON.parse(require('fs').readFileSync('data/advancement.json','utf8')); console.log('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add data/advancement.json
git commit -m "chore: remove maxStats block from advancement.json (now in maxStats.json)"
```

---

## Task 4: Rewrite `js/data.js`

**Files:**
- Rewrite: `js/data.js`

DataService now stores raw Uncle-Mel objects. Key changes:
- Loads `warbandFiles/index.json` then each warband file in parallel
- `this.warbandFiles` = array of raw warband file objects (with `_grade` attached)
- `this.equipment` = raw flat array (with slugified `id` added for lookups)
- `this.skills` = raw flat array
- `this.magic` = raw `{ spellLists: {} }`
- `this.hiredSwords` = raw keyed object `{ "key": { ... } }`
- `this.maxStats` = raw array `[{ race, warband: [{ warband, maxStats: {} }] }]`

- [ ] **Step 1: Replace `js/data.js` entirely**

```javascript
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
    const v = 'v=12';

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
  canWarbandAccess(item, warbandName) {
    const permitted = item.permittedWarbands;
    const excluded  = item.excludedWarbands;
    if (Array.isArray(excluded) && excluded.includes(warbandName)) return false;
    if (!permitted || (Array.isArray(permitted) && permitted.length === 0) || permitted === 'all') return true;
    if (Array.isArray(permitted)) return permitted.includes(warbandName);
    return permitted === warbandName;
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
      return this.skills.filter(s =>
        s.subtype === 'Special Skill' &&
        Array.isArray(s.permittedWarbands) &&
        s.permittedWarbands.includes(warbandName)
      );
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

  // warbandName is the display name (e.g. "Averlanders"), not an ID.
  // Uncle-Mel permittedWarbands contains display names.
  getAvailableHiredSwords(warbandName) {
    return Object.entries(this.hiredSwords)
      .filter(([, hs]) => {
        const permitted = hs.permittedWarbands || [];
        return permitted.length === 0 || permitted.includes(warbandName);
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
```

- [ ] **Step 2: Verify JSON is valid and the script is parseable**

```bash
node -e "require('./js/data.js'); console.log('parse OK')"
```

Expected: `parse OK` (DataService is a global constant — no exports needed)

- [ ] **Step 3: Commit**

```bash
git add js/data.js
git commit -m "feat: rewrite DataService to load raw Uncle-Mel files"
```

---

## Task 5: Add localStorage migration to `js/storage.js`

**Files:**
- Edit: `js/storage.js`

Add a `_migrateRosters()` method called from `getAllRosters()`. Converts uppercase stat keys to lowercase and old skill category IDs to Uncle-Mel subtype strings.

- [ ] **Step 1: Add `_migrateRosters` and call it from `getAllRosters`**

Replace the existing `getAllRosters()` with:

```javascript
getAllRosters() {
  const data = localStorage.getItem(this.ROSTERS_KEY);
  if (!data) return [];
  const rosters = JSON.parse(data);
  const migrated = rosters.map(r => this._migrateRoster(r));
  // Re-save if any roster changed
  if (JSON.stringify(migrated) !== JSON.stringify(rosters)) {
    localStorage.setItem(this.ROSTERS_KEY, JSON.stringify(migrated));
  }
  return migrated;
},
```

Add the following method to the Storage object (before the closing `};`):

```javascript
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
    stats:      migrateStats(w.stats),
    baseStats:  migrateStats(w.baseStats),
    skillAccess: migrateSkillAccess(w.skillAccess),
  });

  return {
    ...roster,
    heroes:        (roster.heroes        || []).map(migrateWarrior),
    henchmen:      (roster.henchmen      || []).map(migrateWarrior),
    hiredSwords:   (roster.hiredSwords   || []).map(migrateWarrior),
    customWarriors:(roster.customWarriors|| []).map(migrateWarrior),
  };
},
```

- [ ] **Step 2: Verify parse is clean**

```bash
node -e "require('./js/storage.js'); console.log('parse OK')"
```

Expected: `parse OK`

- [ ] **Step 3: Commit**

```bash
git add js/storage.js
git commit -m "feat: add localStorage migration for lowercase stats and skill subtype strings"
```

---

## Task 6: Update `js/roster.js`

**Files:**
- Edit: `js/roster.js`

Update `createRoster`, `createWarrior`, `createHiredSword`, `modifyStat` to use raw Uncle-Mel field names and lowercase stats.

- [ ] **Step 1: Replace `createRoster`**

```javascript
createRoster(name, warbandId) {
  const result = DataService.getWarband(warbandId);
  if (!result) throw new Error('Unknown warband: ' + warbandId);
  const { warbandFile } = result;

  return {
    id: Storage.generateId(),
    name,
    warbandId,
    gold: warbandFile.warbandRules?.startingGc ?? 500,
    wyrdstone: 0,
    heroes: [],
    henchmen: [],
    hiredSwords: [],
    customWarriors: [],
    battleLog: [],
    notes: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
},
```

- [ ] **Step 2: Replace `createWarrior`**

The signature changes to accept a raw Uncle-Mel fighter object, the warband file, and the subfaction display name.

```javascript
// fighter: raw Uncle-Mel fighter object from warbandFile.fighters[]
// warbandFile: raw warband file object
// subfaction: display name string or null
createWarrior(fighter, warbandFile, subfaction) {
  const isHero    = fighter.type === 'hero';
  const stats     = this._mapStats(fighter.statblock);
  const specialRules = (fighter.specialRules || []).map(r => r.rulename).filter(Boolean);
  const skillAccess  = DataService.resolveSkillAccess(fighter, subfaction);
  const warbandName  = subfaction || warbandFile.name;
  const spellAccess  = isHero ? DataService.getSpellAccess(warbandName, fighter.name) : [];

  const warrior = {
    ...this._baseWarrior(
      Storage.generateId(), fighter.id, fighter.name,
      stats, fighter.costGc ?? 0, specialRules,
      isHero ? (fighter.startingXp ?? 0) : 0
    ),
    isHero,
    race: warbandFile.race || 'human',
  };

  if (!isHero) warrior.groupSize = 1;
  if (isHero)  {
    warrior.skillAccess = skillAccess;
    warrior.spellAccess = spellAccess;
  }

  return warrior;
},
```

- [ ] **Step 3: Add `_mapStats` helper**

Add this method to `RosterModel` (before the closing `};`):

```javascript
// Converts Uncle-Mel lowercase statblock to warrior stats object.
_mapStats(statblock) {
  if (!statblock) return { m:4, ws:3, bs:3, s:3, t:3, w:1, i:3, a:1, ld:7 };
  return {
    m:  statblock.m  ?? 4,
    ws: statblock.ws ?? 3,
    bs: statblock.bs ?? 3,
    s:  statblock.s  ?? 3,
    t:  statblock.t  ?? 3,
    w:  statblock.w  ?? 1,
    i:  statblock.i  ?? 3,
    a:  statblock.a  ?? 1,
    ld: statblock.ld ?? 7,
  };
},
```

- [ ] **Step 4: Replace `createHiredSword`**

```javascript
// templateKey: the Uncle-Mel hiredSwords object key (e.g. 'dwarf-troll-slayer')
createHiredSword(templateKey) {
  const hs = DataService.getHiredSwordTemplate(templateKey);
  if (!hs) return null;

  const stats        = this._mapStats(hs.statblock);
  const specialRules = (hs.specialRules || []).map(r => r.rulename).filter(Boolean);
  const skillAccess  = Object.entries(hs.skillAccess || {})
    .filter(([k, v]) => v && DataService.SKILL_KEY_TO_SUBTYPE[k])
    .map(([k]) => DataService.SKILL_KEY_TO_SUBTYPE[k]);
  const parsedCost   = parseInt(hs.cost);

  return {
    ...this._baseWarrior(
      Storage.generateId(), templateKey, hs.name,
      stats, isNaN(parsedCost) ? 0 : parsedCost, specialRules, 0
    ),
    isHero: true,
    isHiredSword: true,
    skillAccess,
    spellAccess: [],  // hired sword spell access handled by specialRules fallback in hasSpellAccess()
  };
},
```

- [ ] **Step 5: Replace `modifyStat`**

```javascript
modifyStat(warrior, stat, delta) {
  const maxVal = DataService.getMaxStat(stat, warrior.race || 'human');
  const newVal = warrior.stats[stat] + delta;
  if (newVal < 0 || newVal > maxVal) return false;
  warrior.stats[stat] = newVal;
  return true;
},
```

- [ ] **Step 6: Verify parse**

```bash
node -e "require('./js/roster.js'); console.log('parse OK')"
```

Expected: `parse OK`

- [ ] **Step 7: Commit**

```bash
git add js/roster.js
git commit -m "feat: update RosterModel to use raw Uncle-Mel fighter fields and lowercase stats"
```

---

## Task 7: Update `js/ui.js` — stat key arrays

**Files:**
- Edit: `js/ui.js`

There are four places in ui.js where the stat key array `['M','WS','BS','S','T','W','I','A','Ld']` appears. Replace all with lowercase.

- [ ] **Step 1: Find all occurrences**

```bash
grep -n "M.*WS.*BS.*S.*T.*W.*I.*A.*Ld" js/ui.js
```

Expected: 4 lines (approximately lines 480, 696, 1114, 1320).

- [ ] **Step 2: Replace all four occurrences**

Change every instance of:
```javascript
['M','WS','BS','S','T','W','I','A','Ld']
```
to:
```javascript
['m','ws','bs','s','t','w','i','a','ld']
```

Also find the PDF export stat header row (around line 1356):
```html
<tr><th>M</th><th>WS</th><th>BS</th><th>S</th><th>T</th><th>W</th><th>I</th><th>A</th><th>Ld</th></tr>
```
This is a display-only header, **do not change** — these are column labels shown to the user, not stat key references.

- [ ] **Step 3: Fix the custom warrior stat input loop (around line 696)**

The loop currently reads `document.getElementById('custom-stat-' + stat)`. The input IDs in the HTML also use uppercase. Find where those inputs are generated and update them to use lowercase IDs too.

Search for:
```bash
grep -n "custom-stat-" js/ui.js
```

Every occurrence of `'custom-stat-' + stat` (or template literal equivalent) will now produce lowercase IDs (e.g. `custom-stat-m`) since `stat` is now lowercase. The input element IDs in the HTML must match — find the `renderCustomWarriorForm` or equivalent section and ensure the input `id` attributes also iterate over the lowercase array.

- [ ] **Step 4: Verify no remaining uppercase stat key references in code**

```bash
grep -n "stats\['M'\]\|stats\['WS'\]\|stats\['BS'\]\|stats\['Ld'\]\|\['M','WS'" js/ui.js
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add js/ui.js
git commit -m "fix: switch UI stat key arrays to lowercase to match Uncle-Mel format"
```

---

## Task 8: Update `js/ui.js` — warband picker and roster creation

**Files:**
- Edit: `js/ui.js`

Three areas: the warband picker select options, the warband description preview, and `createRoster`.

- [ ] **Step 1: Update the warband options select (around line 258)**

Replace:
```javascript
DataService.warbands.map(w => `<option value="${w.id}">${w.name} (${w.source})</option>`).join('');
```
with:
```javascript
DataService.getAllWarbands()
  .sort((a, b) => a.name.localeCompare(b.name))
  .map(w => `<option value="${w.id}">${this.esc(w.name)} (${this.esc(w.source)})</option>`)
  .join('');
```

- [ ] **Step 2: Update the warband description preview (around line 271)**

Replace:
```javascript
const warband = DataService.getWarband(id);
desc.textContent = warband ? `${warband.description} Starting gold: ${warband.startingGold} gc.` : '';
```
with:
```javascript
const result = DataService.getWarband(id);
if (result) {
  const { warbandFile } = result;
  const lore = DataService._stripHtml(warbandFile.lore || warbandFile.warbandRules?.choiceFluff || '')
    .replace(/\s+/g, ' ').trim().slice(0, 300);
  desc.textContent = `${lore} Starting gold: ${warbandFile.warbandRules?.startingGc ?? 500} gc.`;
} else {
  desc.textContent = '';
}
```

- [ ] **Step 3: Update the roster card warband name lookup (around line 223)**

Replace:
```javascript
const warband = DataService.getWarband(r.warbandId);
```
```javascript
<div class="roster-card-warband">${warband ? warband.name : r.warbandId}</div>
```
with:
```javascript
const warbandResult = DataService.getWarband(r.warbandId);
const warbandName = warbandResult
  ? (warbandResult.subfaction || warbandResult.warbandFile.name)
  : r.warbandId;
```
```javascript
<div class="roster-card-warband">${this.esc(warbandName)}</div>
```

- [ ] **Step 4: Update editor warband type display (around line 308-315)**

Replace:
```javascript
const warband = DataService.getWarband(r.warbandId);
```
and:
```javascript
document.getElementById('editor-warband-type').textContent = warband ? warband.name : r.warbandId;
```
with:
```javascript
const warbandResult = DataService.getWarband(r.warbandId);
const warbandDisplayName = warbandResult
  ? (warbandResult.subfaction || warbandResult.warbandFile.name)
  : r.warbandId;
```
```javascript
document.getElementById('editor-warband-type').textContent = warbandDisplayName;
```

- [ ] **Step 5: Commit**

```bash
git add js/ui.js
git commit -m "fix: update warband picker and roster display to use raw Uncle-Mel warband files"
```

---

## Task 9: Update `js/ui.js` — hero/henchman add dropdowns and `addWarrior`

**Files:**
- Edit: `js/ui.js`

The hero/henchman add dropdowns and `addWarrior`/`addWarriorFromSelect` use `warband.heroes` and `warband.henchmen` which no longer exist. Replace with `warbandFile.fighters.filter(...)`.

- [ ] **Step 1: Update hero/henchman section rendering (around line 332-393)**

The section that renders the "Add hero" and "Add henchman" dropdowns calls `warband.heroes.map(ht => ...)` and `warband.henchmen.map(ht => ...)`.

Replace the top of that block:
```javascript
const warband = DataService.getWarband(r.warbandId);
```
with:
```javascript
const warbandResult = DataService.getWarband(r.warbandId);
const { warbandFile, subfaction } = warbandResult || { warbandFile: null, subfaction: null };
const warbandName = subfaction || warbandFile?.name || '';
const heroes   = (warbandFile?.fighters || []).filter(f => f.type === 'hero');
const henchmen = (warbandFile?.fighters || []).filter(f => f.type === 'henchman');
```

Then replace all `warband.heroes` references in this block with `heroes`, and `warband.henchmen` with `henchmen`.

For `maxHeroes`:
```javascript
const maxHeroes = heroes.reduce((sum, h) => sum + (h.maxQty || 0), 0);
```

For the options in the hero select:
```javascript
${heroes.map(ht => {
  const count = r.heroes.filter(h => h.type === ht.id).length;
  const atMax = count >= (ht.maxQty || 1);
  return `<option value="${ht.id}" ${atMax ? 'disabled' : ''}>${this.esc(ht.name)} (${ht.costGc ?? 0} gc)</option>`;
}).join('')}
```

For the henchmen select:
```javascript
${henchmen.map(ht => {
  return `<option value="${ht.id}">${this.esc(ht.name)} (${ht.costGc ?? 0} gc)</option>`;
}).join('')}
```

For hired swords, `getAvailableHiredSwords` now takes a display name:
```javascript
const availableHiredSwords = DataService.getAvailableHiredSwords(warbandName);
```
Each hired sword in the result now has a `key` field. Update the option:
```javascript
${availableHiredSwords.map(hs => `<option value="${hs.key}">${this.esc(hs.name)} (${parseInt(hs.cost) || 0} gc)</option>`).join('')}
```

- [ ] **Step 2: Update `addWarrior` (around line 593)**

Replace:
```javascript
addWarrior(type, isHero) {
  const r = this.currentRoster;
  const warband = DataService.getWarband(r.warbandId);

  // Validate limits
  if (isHero) {
    const template = warband.heroes.find(h => h.type === type);
    const currentCount = r.heroes.filter(h => h.type === type).length;
    if (currentCount >= template.max) {
      return this.toast(`Maximum ${template.name}s reached (${template.max}).`, 'error');
    }
    // Total hero cap (includes promoted henchmen)
```
with:
```javascript
addWarrior(type, isHero) {
  const r = this.currentRoster;
  const warbandResult = DataService.getWarband(r.warbandId);
  if (!warbandResult) return;
  const { warbandFile, subfaction } = warbandResult;
  const fighters = warbandFile.fighters || [];

  if (isHero) {
    const fighter = fighters.find(f => f.id === type && f.type === 'hero');
    const currentCount = r.heroes.filter(h => h.type === type).length;
    if (currentCount >= (fighter?.maxQty ?? 1)) {
      return this.toast(`Maximum ${fighter?.name ?? type}s reached (${fighter?.maxQty ?? 1}).`, 'error');
    }
    // Total hero cap (includes promoted henchmen)
```

Continue updating the rest of `addWarrior`: wherever `warband.heroes`, `warband.henchmen` appear, replace with the corresponding `fighters.filter(...)` lookup. Wherever `template.max` appears, use `fighter.maxQty`. Wherever `warband` is passed to `RosterModel.createWarrior`, pass the fighter, warbandFile, and subfaction instead:

```javascript
const warrior = RosterModel.createWarrior(fighter, warbandFile, subfaction);
```

- [ ] **Step 3: Update `addWarriorFromSelect` (around line 658)**

This method reads the select value and calls `addWarrior`. It also handles hired swords:

```javascript
addWarriorFromSelect(section) {
  const selectId = section === 'heroes'      ? 'hero-add-select'
                 : section === 'henchmen'    ? 'henchmen-add-select'
                 : section === 'hiredSwords' ? 'hired-swords-add-select'
                 : null;
  if (!selectId) return;
  const select = document.getElementById(selectId);
  const type = select?.value;
  if (!type) return;
  select.value = '';

  if (section === 'hiredSwords') {
    this.addHiredSword(type);
  } else {
    this.addWarrior(type, section === 'heroes');
  }
},
```

- [ ] **Step 4: Update `addHiredSword` to use templateKey**

Find the method that calls `RosterModel.createHiredSword(...)` and ensure it passes the hired sword key (hyphenated, as returned by `getAvailableHiredSwords`):

```javascript
addHiredSword(key) {
  const r = this.currentRoster;
  const warrior = RosterModel.createHiredSword(key);
  if (!warrior) return this.toast('Unknown hired sword.', 'error');
  r.hiredSwords.push(warrior);
  this.saveCurrentRoster();
  this.renderRosterEditor();
  this.toast(`${warrior.name} hired!`, 'success');
},
```

- [ ] **Step 5: Update warband max size lookups (around lines 1262, 1268)**

Replace:
```javascript
const warband = DataService.getWarband(roster.warbandId);
return warband ? warband.maxWarband : 15;
```
with:
```javascript
const result = DataService.getWarband(roster.warbandId);
return result ? (result.warbandFile.warbandRules?.maxModels ?? 15) : 15;
```

- [ ] **Step 6: Commit**

```bash
git add js/ui.js
git commit -m "fix: update hero/henchman dropdowns and addWarrior to use raw Uncle-Mel fighters"
```

---

## Task 10: Update `js/ui.js` — equipment modal

**Files:**
- Edit: `js/ui.js`

`openEquipmentModal` currently reads `template.allowedEquipment` (a pre-resolved list). Now it resolves on-the-fly using `DataService.resolveAllowedEquipment`.

- [ ] **Step 1: Replace the equipment modal setup block (around line 827)**

Replace from `openEquipmentModal(listType, index) {` through the end of the "warbandAllowedEquipment" resolution block with:

```javascript
openEquipmentModal(listType, index) {
  const r = this.currentRoster;
  const warrior = r[listType][index];
  const warbandResult = DataService.getWarband(r.warbandId);
  const { warbandFile, subfaction } = warbandResult || { warbandFile: null, subfaction: null };
  const warbandName = subfaction || warbandFile?.name || '';

  let warbandAllowedEquipment = null; // null = no Warband Equipment dropdown

  if (listType === 'hiredSwords') {
    // Hired swords: show all equipment (Uncle-Mel has no category restriction data)
    warbandAllowedEquipment = null;
  } else if (listType !== 'customWarriors') {
    // Heroes / henchmen: resolve from warband file
    const fighter = (warbandFile?.fighters || []).find(f => f.id === warrior.type);
    if (fighter) {
      warbandAllowedEquipment = DataService.resolveAllowedEquipment(fighter, warbandFile);
    }
  }
```

The rest of the modal HTML generation (grouping by type, the "All Equipment" dropdown filtered by `canWarbandAccess`) stays the same. For hired swords, the "All Equipment" dropdown should show all items (no `canWarbandAccess` filter):

```javascript
  let allItems;
  if (listType === 'customWarriors' || listType === 'hiredSwords') {
    allItems = DataService.getAllEquipment();
  } else {
    allItems = DataService.getAllEquipment()
      .filter(item => DataService.canWarbandAccess(item, warbandName));
  }
```

- [ ] **Step 2: Verify the equipment category name helper still works**

`DataService.getEquipmentCategoryName(type)` is still present and returns `CATEGORY_NAMES[type]`. No change needed.

- [ ] **Step 3: Commit**

```bash
git add js/ui.js
git commit -m "fix: resolve equipment on-the-fly in equipment modal using raw warband files"
```

---

## Task 11: Update `js/ui.js` — skill modal, spell modal, and `hasSpellAccess`

**Files:**
- Edit: `js/ui.js`

- [ ] **Step 1: Replace `hasSpellAccess` (around line 558)**

```javascript
hasSpellAccess(warrior) {
  if ((warrior.spellAccess || []).length > 0) return true;
  const wizardRules = ['Wizard', 'Warrior Wizard', 'Prayers of Sigmar', 'Magic User', 'Prayers', 'Spellcaster', 'Prayercaster'];
  return (warrior.specialRules || []).some(r => wizardRules.includes(r));
},
```

- [ ] **Step 2: Update spell description in `renderSpellSection` (around line 575)**

Replace:
```javascript
const desc = spellData ? this.esc(spellData.description) : '';
```
with:
```javascript
const desc = spellData
  ? this.esc(DataService._stripHtml(spellData.ruleAbbreviated || spellData.ruleFull || ''))
  : '';
```

- [ ] **Step 3: Replace `openSkillModal` (around line 949)**

```javascript
openSkillModal(listType, index) {
  const warrior = this.currentRoster[listType][index];
  const warbandResult = DataService.getWarband(this.currentRoster.warbandId);
  const { warbandFile, subfaction } = warbandResult || { warbandFile: null, subfaction: null };
  const warbandName = subfaction || warbandFile?.name || '';

  let accessSubtypes; // array of Uncle-Mel subtype strings

  if (warrior.isPromotedHenchman) {
    accessSubtypes = warrior.skillAccess || [];
  } else if (listType === 'customWarriors') {
    accessSubtypes = Object.values(DataService.SKILL_KEY_TO_SUBTYPE).concat(['Special Skill']);
  } else if (listType === 'hiredSwords') {
    accessSubtypes = warrior.skillAccess || [];
  } else {
    // Regular hero: resolve from warband file
    const fighter = (warbandFile?.fighters || []).find(f => f.id === warrior.type);
    accessSubtypes = fighter ? DataService.resolveSkillAccess(fighter, subfaction) : [];
  }

  const modal = document.getElementById('skill-modal');
  const body  = document.getElementById('skill-modal-body');
  let html = '';

  for (const subtype of accessSubtypes) {
    const skills = DataService.getSkillsBySubtype(subtype, warbandName);
    if (skills.length === 0) continue;
    html += `<h4 class="text-accent mb-1 mt-2" style="font-size:0.85rem; text-transform:uppercase;">${this.esc(subtype)}</h4>`;
    for (const skill of skills) {
      const skillId = DataService.slugify(skill.name);
      const alreadyHas = warrior.skills.find(s => s.id === skillId);
      const disabled = alreadyHas ? 'disabled' : '';
      const desc = DataService._stripHtml(skill.Rules?.[0]?.ruleAbbreviated || skill.Rules?.[0]?.ruleFull || '');
      html += `<button class="btn btn-sm mb-1" ${disabled} onclick="UI.selectSkill('${listType}', ${index}, '${skillId}')" title="${this.escAttr(desc)}">${this.esc(skill.name)}</button> `;
    }
  }

  body.innerHTML = html;
  modal.classList.add('active');
},
```

- [ ] **Step 4: Update `selectSkill` to use `DataService.getSkill`**

`DataService.getSkill(skillId)` now searches the flat array by slugified name. The call in `selectSkill` is unchanged — just verify it returns `{ name, ... }` correctly. The `addSkill` in RosterModel calls `DataService.getSkill(skillId)` to get the name.

Update `RosterModel.addSkill` to use the new format:

```javascript
addSkill(warrior, skillId) {
  const skill = DataService.getSkill(skillId);
  if (!skill) return false;
  if (warrior.skills.find(s => s.id === skillId)) return false;
  warrior.skills.push({ id: skillId, name: skill.name });
  return true;
},
```

No change needed to the method signature — just confirm `skill.name` exists on raw Uncle-Mel skill objects (it does).

- [ ] **Step 5: Replace `openSpellModal` (around line 1005)**

```javascript
openSpellModal(listType, index) {
  const warrior = this.currentRoster[listType][index];
  const warbandResult = DataService.getWarband(this.currentRoster.warbandId);
  const { warbandFile, subfaction } = warbandResult || { warbandFile: null, subfaction: null };
  const warbandName = subfaction || warbandFile?.name || '';

  let spellListIds;
  if (warrior.isPromotedHenchman) {
    spellListIds = [];
  } else if (listType === 'customWarriors') {
    spellListIds = Object.keys(DataService.magic.spellLists || {});
  } else {
    spellListIds = warrior.spellAccess || [];
  }

  const modal = document.getElementById('spell-modal');
  const body  = document.getElementById('spell-modal-body');
  let html = '';

  for (const listId of spellListIds) {
    const list   = DataService.magic.spellLists?.[listId];
    if (!list) continue;
    const spells = list.spells || [];
    if (spells.length === 0) continue;
    html += `<h4 class="text-accent mb-1 mt-2" style="font-size:0.85rem; text-transform:uppercase;">${this.esc(list.name || listId)}</h4>`;
    for (const spell of spells) {
      const spellId = spell.id || DataService.slugify(spell.name);
      const alreadyHas = (warrior.spells || []).find(s => s.id === spellId);
      const disabled = alreadyHas ? 'disabled' : '';
      const diff = spell.difficulty === 'Auto' ? 'Auto' : `Diff: ${spell.difficulty}`;
      const desc = DataService._stripHtml(spell.ruleAbbreviated || spell.ruleFull || '');
      html += `<button class="btn btn-sm mb-1" ${disabled} onclick="UI.selectSpell('${listType}', ${index}, '${spellId}')" title="${this.escAttr(diff + '. ' + desc)}">${this.esc(spell.name)}</button> `;
    }
  }

  body.innerHTML = html;
  modal.classList.add('active');
},
```

- [ ] **Step 6: Update `promoteHenchmanToHero` UI section (around line 714)**

The promotion modal builds a list of skill categories. Replace:
```javascript
const allSkillLists = [...new Set(warband.heroes.flatMap(h => h.skillAccess || []))];
```
with:
```javascript
const warbandResult = DataService.getWarband(r.warbandId);
const { warbandFile, subfaction } = warbandResult || { warbandFile: null, subfaction: null };
const heroes = (warbandFile?.fighters || []).filter(f => f.type === 'hero');
const allSkillLists = [...new Set(
  heroes.flatMap(h => DataService.resolveSkillAccess(h, subfaction))
)];
```

- [ ] **Step 7: Update `hasSpellAccess` template lookup in `addWarrior` validation**

Search for any remaining `warband.heroes.find(h => h.type` or `warband.henchmen.find` patterns and replace with the appropriate `warbandFile.fighters.find(f => f.id === warrior.type)` equivalent.

```bash
grep -n "warband\.heroes\|warband\.henchmen\|warband\.maxWarband\|warband\.startingGold\|warband\.name\b" js/ui.js
```

Fix any remaining occurrences following the same pattern established in Tasks 8-11.

- [ ] **Step 8: Commit**

```bash
git add js/ui.js
git commit -m "feat: update skill modal, spell modal, and hasSpellAccess for raw Uncle-Mel data"
```

---

## Task 12: Bump cache version and smoke test

**Files:**
- Edit: `js/data.js` (version bump already done in Task 4 as `v=12`)
- Edit: `index.html` (bump `?v=N` on `data.js` script tag)

- [ ] **Step 1: Bump `data.js` version in `index.html`**

Find the script tag for `js/data.js?v=N` and increment the version by 1.

```bash
grep -n "data.js" index.html
```

Change `?v=11` (or whatever the current value is) to `?v=12` on that line.

- [ ] **Step 2: Start the dev server**

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000` in browser.

- [ ] **Step 3: Smoke test — warband creation**

- Open the app, click "New Roster"
- The warband picker should show all warbands (subfactions expanded: Reikland Mercenaries, Middenheim Mercenaries, Marienburg Mercenaries as separate entries)
- Select a warband (e.g. "Averlander Mercenaries"), enter a name, click Create
- Roster should appear in the list

- [ ] **Step 4: Smoke test — hero and henchman**

- Open the roster, add a hero from the dropdown
- Verify the hero card shows correct stats (lowercase keys rendering correctly)
- Add a henchman, verify groupSize works
- Open equipment modal — verify "Warband Equipment" section shows items with costs
- Open skill modal — verify skill categories appear and skills are clickable
- Modify a stat — verify it highlights as modified (stat !== baseStats comparison working)

- [ ] **Step 5: Smoke test — hired swords**

- Add a hired sword from the dropdown
- Verify the hired sword appears with correct name and stats
- Open skill modal on hired sword — verify correct skill subtypes
- Open equipment modal on hired sword — verify all equipment visible

- [ ] **Step 6: Smoke test — spell access**

- Pick a warband with a spellcaster hero (e.g. Undead — Necromancer)
- Add the hero
- Verify the Spells section appears on the warrior card
- Click "+ Add" on spells — verify spell list modal opens with correct spells

- [ ] **Step 7: Smoke test — existing roster migration**

If you have existing saved rosters in localStorage (from before this migration):
- Open browser DevTools → Application → Local Storage
- Verify that warrior stats now show lowercase keys after first load
- Verify the roster still renders correctly

- [ ] **Step 8: Commit**

```bash
git add index.html
git commit -m "chore: bump data.js cache-bust version to v=12"
```

---

## Task 13: Open Pull Request

**Files:** none

- [ ] **Step 1: Push branch**

```bash
git push origin feature/raw-uncle-mel-data
```

- [ ] **Step 2: Open PR**

```bash
gh pr create \
  --title "feat: adopt raw Uncle-Mel data structure end-to-end" \
  --body "$(cat <<'EOF'
## Summary

- Sync script rewritten as a pure file downloader (~200 lines, down from ~700)
- All warband data now stored verbatim in `data/warbandFiles/{grade}/` mirroring json-derulo
- `data/mergedEquipment.json` → `data/equipment.json`, `data/hired_swords.json` → `data/hiredSwords.json`, `data/maxStats.json` added
- DataService updated to load raw Uncle-Mel objects and expose them through updated getters
- Warrior stats use lowercase keys (`m`, `ws`, `bs`…) throughout — matches Uncle-Mel format
- Automatic localStorage migration converts existing rosters on first load
- Equipment modal resolves allowed items on-the-fly from warband file equipment lists
- Skill modal uses Uncle-Mel subtype strings; spell modal reads `magic.spellLists` directly

## Test plan

- [ ] Warband picker shows all warbands (subfactions expanded)
- [ ] Creating a new roster with a subfaction warband works
- [ ] Adding heroes and henchmen with correct costs and stats
- [ ] Equipment modal shows Warband Equipment section with correct items
- [ ] Skill modal shows correct skill categories per fighter
- [ ] Spell modal works for spellcaster heroes
- [ ] Stat modification respects race-based max stats
- [ ] Existing saved rosters migrate silently (lowercase stats)
- [ ] Hired swords available and functional
- [ ] PDF export shows correct stat values

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Notes

- `data/advancement.json` keeps `heroAdvancement`, `henchmenAdvancement`, and `experienceRewards` — only `maxStats` was moved to Uncle-Mel's `maxStats.json`
- Max stat lookups are now race-aware. The `warrior.race` field is set at creation from `warbandFile.race`. Default is `'human'` for any warrior without a race.
- The `SKILL_KEY_TO_SUBTYPE` map lives on `DataService` and is also used by `RosterModel` — no duplication.
- Future grade folders (e.g. `2a`) are automatically discovered by the sync script — no code changes needed.
- The `.sync-state.json` now tracks individual warband file SHAs rather than the folder tree SHA, enabling per-file change detection.
