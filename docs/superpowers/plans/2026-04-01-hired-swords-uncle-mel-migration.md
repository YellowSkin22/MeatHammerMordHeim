# Hired Swords Uncle-Mel Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `data/hired_swords.json` from a hand-maintained file to one fully produced by the nightly sync script from Uncle-Mel's `hiredSwords.json`. No fields are preserved from the old hand-maintained file — everything is derived from Uncle-Mel's data.

**Architecture:** Add a `transformHiredSwords()` function to `scripts/sync-mordheim-data.js` that converts Uncle-Mel's keyed object format into our flat `{ hiredSwords: [] }` array. Wire it into the existing sync pipeline. `js/data.js` requires no changes — it already reads the file and supports `warbandAllowList`.

**Tech Stack:** Node.js, `gh` CLI for GitHub API access, existing `ghRaw()` / `mapStatKeys()` utilities in sync script.

---

## Field mapping: Uncle-Mel → our format

| Uncle-Mel field | Our field | Transformation |
|----------------|-----------|----------------|
| key (e.g. `"dwarf-troll-slayer"`) | `type` | `key.replace(/-/g, '_')` |
| `name` | `name` | as-is |
| `cost` | `cost` | `parseInt(v.cost) \|\| 0` |
| (absent) | `max` | hardcode `1` |
| `statblock` (lowercase keys) | `stats` | `mapStatKeys(v.statblock)` |
| `specialRules[].rulename` | `specialRules` | extract rulename strings |
| (absent) | `startingExp` | hardcode `0` |
| `skillAccess` object | `skillAccess` | extract truthy keys, exclude `"special"` |
| (derived) | `spellAccess` | lookup via `HIRED_SWORD_SPELL_ACCESS_MAP` keyed on the entry key; default `[]` |
| (derived) | `equipmentAccess` | always `["hand_to_hand", "missiles", "armour"]` — Uncle-Mel has no category data |
| `permittedWarbands[]` | `warbandAllowList` | map display names → warband IDs via `HIRED_SWORD_WARBAND_NAME_MAP` |

**Note on `warbandAllowList`:** `DataService.getAvailableHiredSwords()` already checks `warbandAllowList` first. Uncle-Mel's `permittedWarbands` maps directly to this field. The old `warbandRestrictions` deny-list is dropped.

**Note on `spellAccess`:** Uncle-Mel's `skillText` and `specialRules` contain explicit spell list references (e.g. "Lesser Magic", "Norse Runes chart", "Prayers of Sigmar"). These are extracted into a static `HIRED_SWORD_SPELL_ACCESS_MAP`. Only 9 hired swords are casters.

**Note on `equipmentAccess`:** Uncle-Mel's `equipment` field is a text description, not categories. The UI uses `equipmentAccess` to show equipment picker tabs. Defaulting to all three shows everything; the actual items selectable are still constrained by `allowedEquipment` (which hired swords don't use — they use a free-form picker). Defaulting to all three is correct.

---

## Files

- **Modify:** `scripts/sync-mordheim-data.js` — add two maps, `transformHiredSwords()`, `validateHiredSwords()`, processing block in `main()`
- **Replace (via sync):** `data/hired_swords.json` — regenerated; old hand-maintained file is deleted after successful sync

---

## Task 1: Add constants — TRACKED_FILES entry, warband name map, spell access map

**Files:**
- Modify: `scripts/sync-mordheim-data.js`

- [ ] **Step 1: Add `hiredSwords.json` to TRACKED_FILES**

Find `TRACKED_FILES` (line ~32) and add the entry:

```js
const TRACKED_FILES = [
  { key: 'equipment',   path: 'data/mergedEquipment.json' },
  { key: 'skills',      path: 'data/skills.json'          },
  { key: 'magic',       path: 'data/magic.json'           },
  { key: 'hiredSwords', path: 'data/hiredSwords.json'     },
];
```

- [ ] **Step 2: Add `HIRED_SWORD_WARBAND_NAME_MAP` after `WARBAND_SPECIAL_SKILL_CATEGORIES` (line ~139)**

```js
// Maps Uncle-Mel permittedWarbands display names → our warband IDs (data/warbands.json)
const HIRED_SWORD_WARBAND_NAME_MAP = {
  'Arabian Tomb Raiders':             'arabian-tomb-raiders',
  'Averlanders':                      'averlander-mercenaries',
  'Battle Monks of Cathay':           'battle-monks-of-cathay',
  'Beastmen Raiders':                 'beastmen-raiders',
  'Black Dwarfs':                     'black-dwarfs',
  'Black Orcs':                       'black-orcs',
  'Bretonnian Chapel Guard':          'bretonnian-chapel-guard',
  'Bretonnian Knights':               'bretonnians',
  'Carnival of Chaos':                'carnival-of-chaos',
  'Cult of the Possessed':            'cult-of-the-possessed',
  'Dark Elves':                       'dark-elves',
  'Dreamwalkers, Cult Of Morr':       'the-restless-dead',
  'Druchii':                          'dark-elves',
  'Dwarf Rangers':                    'dwarf-rangers',
  'Dwarf Slayer Cult':                'dwarf-treasure-hunters',
  'Dwarf Treasure Hunters':           'dwarf-treasure-hunters',
  'Forest Goblins':                   'forest-goblins',
  'Grave Robbers':                    'arabian-tomb-raiders',
  'Gunnery School of Nuln':           'gunnery-school-of-nuln',
  'Hochland Bandits':                 'hochland-bandits',
  'Horned Hunters':                   'horned-hunters',
  'Imperial Outriders':               'imperial-outriders',
  'Kislevites':                       'kislevites',
  'Lizardmen':                        'lizardmen',
  'Lustrian Reavers':                 'lustrian-reavers',
  'Maneaters':                        'maneaters',
  'Marauders of Chaos':               'the_kurgan',
  'Marienburgers':                    'marienburg_mercenaries',
  'Merchant Caravans':                'merchant-caravans',
  'Middenheimers':                    'middenheim_mercenaries',
  'Miragleans':                       'miragleans',
  'Mootlanders':                      'mootlanders',
  'Night Goblins':                    'night-goblins',
  'Night Goblins (web)':              'night-goblins',
  'Nipponese Expedition':             'battle-monks-of-cathay',
  'Norse Explorers':                  'norse-explorers',
  'Orc Mob':                          'orc-mob',
  'Ostermarkers':                     'ostlander-mercenaries',
  'Ostlanders':                       'ostlander-mercenaries',
  'Outlaws of Stirwood Forest, The':  'outlaws-of-stirwood-forest',
  'Pirates':                          'pirates',
  'Pit Fighters':                     'pit-fighters',
  'Reiklanders':                      'reikland_mercenaries',
  'Remasens':                         'remasens',
  'Shadow Warriors':                  'shadow-warriors',
  'Sisters of Sigmar':                'sisters-of-sigmar',
  'Skaven':                           'skaven-of-clan-eshin',
  'Skaven of Clan Pestilens':         'skaven-of-clan-pestilens',
  'Sons of Hashut:':                  'the-sons-of-hashut',
  'The Restless Dead':                'the-restless-dead',
  'The Sons of Hashut':               'the-sons-of-hashut',
  'Tileans':                          'trantios',
  'Tomb Guardians':                   'tomb-guardians',
  'Trantios':                         'trantios',
  'Undead':                           'undead',
  'Witch Hunters':                    'witch-hunters',
  'Mazzalupo':                        'miragleans',
};
```

- [ ] **Step 3: Add `HIRED_SWORD_SPELL_ACCESS_MAP` immediately after the warband name map**

Casters identified from Uncle-Mel's `skillText` and `specialRules`. Non-casters get `[]` by default.

```js
// Maps hired sword entry key → spell list IDs
// Derived from Uncle-Mel skillText links and specialRules.
// Only entries with at least one spell list are included; all others default to [].
const HIRED_SWORD_SPELL_ACCESS_MAP = {
  'warlock':                  ['lesser-magic'],
  'elf-mage':                 ['spells-of-the-djedhi'],
  'norse-shaman':             ['norse-runes'],
  'warrior-priest-of-sigmar': ['prayers-of-sigmar'],
  'witch':                    ['charms-and-hexes'],
  'fallen-sister':            ['lesser-magic'],
  'priest-of-morr':           ['funerary-rites'],
  'wolf-priest-of-ulric':     ['prayers-of-ulric'],
  // dark-mage uses "Dark Magic list" which has no matching entry in magic.json;
  // the UI hasSpellAccess() fallback detects them via the "Wizard" special rule.
};
```

- [ ] **Step 4: Verify the file still parses**

```bash
node -e "require('./scripts/sync-mordheim-data.js'); console.log('OK')" 2>&1 | head -5
```

Expected: `OK` (or the script's normal startup output, not a syntax error)

- [ ] **Step 5: Commit**

```bash
git add scripts/sync-mordheim-data.js
git commit -m "chore: add hiredSwords tracking and name/spell maps to sync script"
```

---

## Task 2: Add `transformHiredSwords()` function

**Files:**
- Modify: `scripts/sync-mordheim-data.js`

- [ ] **Step 1: Add the function after `transformWarbands()` (before `// ─── Validators`)**

```js
// ─── Hired Swords transformer ─────────────────────────────────────────────
//
// Source: hiredSwords.json — keyed object { "dwarf-troll-slayer": { ... } }
// Ours:   hired_swords.json — { hiredSwords: [] }
//
// Key field mappings:
//   key                       → type (hyphens → underscores)
//   cost                      → cost (parseInt)
//   statblock (lowercase)     → stats (uppercase via mapStatKeys)
//   specialRules[].rulename   → specialRules (flat string array)
//   skillAccess { k: bool }   → skillAccess (truthy keys, excluding "special")
//   permittedWarbands[]       → warbandAllowList (via HIRED_SWORD_WARBAND_NAME_MAP)
//   (absent)                  → spellAccess (via HIRED_SWORD_SPELL_ACCESS_MAP; default [])
//   (absent)                  → equipmentAccess (always ["hand_to_hand","missiles","armour"])

function transformHiredSwords(source) {
  const result  = { hiredSwords: [] };
  const added   = [];

  for (const [key, src] of Object.entries(source)) {
    const type         = key.replace(/-/g, '_');
    const stats        = mapStatKeys(src.statblock);
    const specialRules = (src.specialRules || []).map(r => r.rulename).filter(Boolean);
    const skillAccess  = Object.entries(src.skillAccess || {})
      .filter(([k, v]) => v && k !== 'special')
      .map(([k]) => k);

    const warbandAllowList = [];
    for (const wbName of (src.permittedWarbands || [])) {
      const id = HIRED_SWORD_WARBAND_NAME_MAP[wbName];
      if (id && !warbandAllowList.includes(id)) warbandAllowList.push(id);
    }

    result.hiredSwords.push({
      type,
      name:             src.name,
      max:              1,
      cost:             parseInt(src.cost) || 0,
      stats,
      specialRules,
      startingExp:      0,
      skillAccess,
      spellAccess:      HIRED_SWORD_SPELL_ACCESS_MAP[key] || [],
      equipmentAccess:  ['hand_to_hand', 'missiles', 'armour'],
      warbandAllowList,
    });

    added.push(type);
  }

  return { data: result, added };
}
```

- [ ] **Step 2: Verify the file still parses**

```bash
node -e "require('./scripts/sync-mordheim-data.js'); console.log('OK')" 2>&1 | head -5
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add scripts/sync-mordheim-data.js
git commit -m "chore: add transformHiredSwords() to sync script"
```

---

## Task 3: Add `validateHiredSwords()` function

**Files:**
- Modify: `scripts/sync-mordheim-data.js`

- [ ] **Step 1: Add the validator after `validateSkills()` (before `// ─── Main`)**

```js
function validateHiredSwords(data) {
  if (!Array.isArray(data.hiredSwords)) throw new Error('Missing hiredSwords array');
  if (data.hiredSwords.length === 0)    throw new Error('hiredSwords array is empty');
  for (const hs of data.hiredSwords) {
    if (!hs.type)  throw new Error(`Hired sword missing type`);
    if (!hs.name)  throw new Error(`Hired sword ${hs.type} missing name`);
    if (!hs.stats) throw new Error(`Hired sword ${hs.type} missing stats`);
    for (const key of REQUIRED_STAT_KEYS) {
      if (hs.stats[key] == null) {
        throw new Error(`Hired sword ${hs.type} missing stat ${key}`);
      }
    }
  }
}
```

- [ ] **Step 2: Verify the file still parses**

```bash
node -e "require('./scripts/sync-mordheim-data.js'); console.log('OK')" 2>&1 | head -5
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add scripts/sync-mordheim-data.js
git commit -m "chore: add validateHiredSwords() to sync script"
```

---

## Task 4: Wire up hired swords processing in `main()`

**Files:**
- Modify: `scripts/sync-mordheim-data.js`

- [ ] **Step 1: Add the processing block in `main()`**

Find the warbands processing block (around line 678). Add the following **after** the warbands block and **before** `// ── Abort on errors`:

```js
  // Hired Swords
  if (changes.hiredSwords) {
    const label = 'hiredSwords';
    try {
      process.stdout.write('  hiredSwords... ');
      const src = ghRaw('data/hiredSwords.json');
      const { data, added } = transformHiredSwords(src);
      validateHiredSwords(data);
      if (!dryRun) writeJson(path.join(DATA_DIR, 'hired_swords.json'), data);
      summary.added[label]   = added;
      summary.updated[label] = [];
      console.log(`total: ${data.hiredSwords.length} ✓`);
    } catch (err) {
      summary.errors.push(`HiredSwords: ${err.message}`);
      console.log(`FAILED: ${err.message}`);
    }
  }
```

- [ ] **Step 2: Verify the file still parses**

```bash
node -e "require('./scripts/sync-mordheim-data.js'); console.log('OK')" 2>&1 | head -5
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add scripts/sync-mordheim-data.js
git commit -m "chore: wire hired swords into sync main()"
```

---

## Task 5: Dry-run, spot-check output, run live sync

**Files:**
- Replace: `data/hired_swords.json`

- [ ] **Step 1: Run dry-run**

```bash
node scripts/sync-mordheim-data.js --dry-run --force 2>&1
```

Expected: line containing `hiredSwords... total: 72 ✓` and no `FAILED` lines.

- [ ] **Step 2: Preview the transform output for key entries**

```bash
node -e "
const fs = require('fs');
const { execSync } = require('child_process');

// Fetch Uncle-Mel data
const raw = JSON.parse(execSync('gh api \"repos/Uncle-Mel/JSON-derulo/contents/data/hiredSwords.json\"', {encoding:'utf8'}));
const src = JSON.parse(Buffer.from(raw.content, 'base64').toString('utf8'));

// Spot-check warlock
const w = src['warlock'];
console.log('warlock skillAccess:', Object.entries(w.skillAccess||{}).filter(([,v])=>v&&'special'!==true).map(([k])=>k));
console.log('warlock stats:', w.statblock);

// Spot-check troll slayer permittedWarbands
const ts = src['dwarf-troll-slayer'];
console.log('troll slayer permittedWarbands:', ts.permittedWarbands);
console.log('troll slayer statblock:', ts.statblock);
" 2>&1
```

Expected for warlock:
- `skillAccess: ['academic', 'speed']`
- stats present (M/WS/BS/S/T/W/I/A/Ld all lowercase)

Expected for troll slayer:
- `permittedWarbands` includes Averlanders, Reiklanders, etc.
- `statblock: { m: 3, ws: 4, bs: 3, s: 3, t: 4, w: 1, i: 2, a: 1, ld: 9 }`

- [ ] **Step 3: Run the live sync**

```bash
node scripts/sync-mordheim-data.js --force 2>&1
```

Expected: completes without errors, writes `data/hired_swords.json`, commits, and pushes.

- [ ] **Step 4: Verify the output file**

```bash
node -e "
const d = JSON.parse(require('fs').readFileSync('data/hired_swords.json','utf8'));
console.log('Total hired swords:', d.hiredSwords.length);

const warlock = d.hiredSwords.find(h => h.type === 'warlock');
console.log('warlock spellAccess:', warlock?.spellAccess);
console.log('warlock equipmentAccess:', warlock?.equipmentAccess);
console.log('warlock skillAccess:', warlock?.skillAccess);

const troll = d.hiredSwords.find(h => h.type === 'dwarf_troll_slayer');
console.log('troll stats:', troll?.stats);
console.log('troll warbandAllowList length:', troll?.warbandAllowList?.length);

const priest = d.hiredSwords.find(h => h.type === 'priest_of_morr');
console.log('priest spellAccess:', priest?.spellAccess);
"
```

Expected:
- Total: 72
- warlock: `spellAccess: ['lesser-magic']`, `equipmentAccess: ['hand_to_hand','missiles','armour']`, `skillAccess: ['academic','speed']`
- troll stats: `{ M: 3, WS: 4, BS: 3, S: 3, T: 4, W: 1, I: 2, A: 1, Ld: 9 }`, warbandAllowList.length > 5
- priest: `spellAccess: ['funerary-rites']`

- [ ] **Step 5: Validate JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('data/hired_swords.json','utf8')); console.log('OK')"
```

Expected: `OK`

---

## Task 6: Cache-bust and browser test

**Files:**
- Modify: `js/data.js` (version bump)
- Modify: `index.html` (version bump on data.js script tag)

- [ ] **Step 1: Increment version in `js/data.js` line 51**

```js
// Before:
const v = 'v=10';
// After:
const v = 'v=11';
```

- [ ] **Step 2: Find the data.js script tag in `index.html` and increment its `?v=N`**

Search for `data.js?v=` in `index.html` and increment the number by 1.

- [ ] **Step 3: Start local server and test**

```bash
python3 -m http.server 8000
```

Open http://localhost:8000. For a Reikland warband:
1. Click "Hire a Sword" — the Dwarf Troll Slayer should now appear (it wasn't in the old 12-entry file)
2. Open a Warlock's spell modal — it should still show the Lesser Magic list
3. Open a Warrior-Priest of Sigmar's spell modal — should show Prayers of Sigmar

For an Undead warband: verify that the Dwarf Troll Slayer does NOT appear (warbandAllowList filtering works).

- [ ] **Step 4: Commit the cache bust**

```bash
git add js/data.js index.html
git commit -m "chore: bump cache version after hired swords migration to Uncle-Mel sync"
```

---

## Self-Review

**Spec coverage:**
- ✅ Add `hiredSwords.json` to `TRACKED_FILES` — Task 1
- ✅ Write `transformHiredSwords()` mapping Uncle-Mel fields to our shape — Task 2
- ✅ `DataService.loadAll()` unchanged — already reads our format
- ✅ `data/hired_swords.json` is now sync-generated, not hand-maintained — Task 5

**Non-obvious decisions:**
- `equipmentAccess` always defaults to all three categories. Uncle-Mel has no category data. The old hand-maintained file had per-entry tuning (e.g. Warlock: only `hand_to_hand`), but this is dropped in favour of full alignment with Uncle-Mel. The actual selectable items in the modal are still constrained by what the warband's equipment list contains.
- `spellAccess` is driven by a static map (`HIRED_SWORD_SPELL_ACCESS_MAP`) in the sync script rather than auto-derived, because Uncle-Mel's magic.json has no hired sword entries. The map covers all 8 casters; `dark-mage` gets `[]` because its "Dark Magic list" has no match in magic.json (the `UI.hasSpellAccess()` fallback detects them via the "Wizard" special rule).
- Unknown `permittedWarbands` names are silently dropped from `warbandAllowList`. This is acceptable — unmapped warbands are typically those not yet in our app. Add entries to `HIRED_SWORD_WARBAND_NAME_MAP` as new warbands are added.
