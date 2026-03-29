# Migration Plan: YellowSkin → Uncle-Mel Data Structure

## Principles

1. **Uncle-Mel's data is the source of truth** — we do not reshape his files; we change our app logic to read his structure natively.
2. **Phased delivery** — each phase ends with a fully working, deployable app. No phase leaves the app broken.
3. **Additive before destructive** — new fields are added to the schema before old ones are removed, reducing regression risk.

---

## Phase 1 — Equipment

**Goal:** Switch the app to read equipment directly from Uncle-Mel's `mergedEquipment.json` (246 items, flat array). All equipment display and selection must work correctly after this phase.

### Changes

#### `js/data.js`
- Replace `data/equipment.json` load with `mergedEquipment.json`
- Update `getAllEquipment()` to work with flat array keyed by `type`
- Update `getEquipmentByCategory()` to use Uncle-Mel's type names: `melee`, `missile`, `blackpowder`, `armour`, `misc`, `animal`
- Update `getEquipmentItem()` to look up by `name`/`tags[]` (Uncle-Mel has no explicit slug `id` on items)
- Normalise casing inconsistencies at read time: `Caveat`/`caveat` → `caveat`, `modelCaveat`/`modelcaveat` → `modelCaveat`

#### `js/ui.js`
- Update equipment modal category references from `hand_to_hand`/`missiles` to `melee`/`missile`/`blackpowder`
- Update cost display to read `item.cost.cost` (object) instead of `item.cost` (number); render `costPrefix` and `costSuffix` where present
- Update rules display to read `item.specialRules[]` objects instead of flat `item.rules` string; use `ruleAbbreviated` for tooltip/summary, `ruleFull` for detail
- Add `animal` as a displayable equipment category

#### `scripts/sync-mordheim-data.js`
- Update equipment sync to pull `mergedEquipment.json` directly — no transformation needed

### Definition of Done
- All equipment categories display correctly in the buy-equipment modal
- Cost (including prefix/suffix variants) renders correctly
- Rules text renders correctly
- `animal` items are visible
- No regressions on warrior creation or equipment assignment

### Deploy checkpoint ✅

---

## Phase 2 — Warband Data

**Goal:** Switch the app to read warband data from Uncle-Mel's per-warband files (one JSON per warband across `warbandFiles/1a/`, `1b/`, `1c/`). All warband selection, warrior creation, and roster management must work correctly after this phase.

### Changes

#### `js/data.js`
- Replace `data/warbands.json` load with dynamic loading of all warband files from Uncle-Mel's `warbandFiles/` grade subfolders; skip `*-old.json` and `*-original.json`
- Update `getWarband()` to work with Uncle-Mel's top-level warband structure
- Update `getAvailableHiredSwords()` — defer to Phase 4
- Map field name changes throughout:
  - `warbandRules.startingGc` → used where `startingGold` was read
  - `warbandRules.maxModels` → used where `maxWarband` was read
  - `fighters[]` (split by `type == "hero"` / `type == "henchman"`) → replaces `heroes[]` / `henchmen[]`
  - `id` on fighters → replaces `type`
  - `costGc` → replaces `cost`
  - `startingXp` → replaces `startingExp`
  - `statblock.*` (lowercase) → replaces `stats.*` (uppercase)
  - `maxQty` → replaces `max`; `minQty >= 1` → `required`
  - `groupSize.max` → replaces `maxGroupSize`
  - `specialRules[].rulename` → replaces `specialRules[]` strings (read rulename only for now)
- Store new fields without using them in UI yet: `groupSize.min`, `gainExp`, `promotable`, `plural`, `race`, `flavour`, `admonitions`, `warbandRules.choiceFluff`, warband-level `specialRules[]`, `specialSkills`
- Strip HTML tags from `lore` field; expose as `description`
- Handle `subfactions` — at load time, expand any warband with a `subfactions.options[]` field into one entry per option, each inheriting shared fighters and equipment but using the subfaction name as display name. Covers Reikland / Middenheim / Marienburg and any future subfaction warbands.

#### `js/roster.js`
- Update `createWarrior()` to read from new fighter field names (`costGc`, `startingXp`, `statblock`, `maxQty`, `groupSize.max`)
- Update `getWarbandRating()` and any other methods reading warband/fighter fields

#### `scripts/sync-mordheim-data.js`
- Update warband sync to pull all files from `warbandFiles/` grade subfolders directly

### Definition of Done
- All warbands (including new 1c additions and merged mercenaries) appear in the warband selector
- Warrior creation works correctly for all fighter types
- Stats, costs, and experience all initialise correctly
- No regressions on existing rosters (saved warriors retain their baked-in values)

### Deploy checkpoint ✅

---

## Phase 3 — Access Logic

**Goal:** Replace our three category-based access systems (skill, spell, equipment) with Uncle-Mel's native structures. The buy-skill, buy-spell, and buy-equipment modals must all work correctly after this phase.

### Changes

#### `js/data.js`
- Add `magic.json` load (Uncle-Mel's spell lists)
- Update `getSpell()` / `getSpellsByList()` to read from `magic.json` `spellLists` structure
- Build `spellAccess[]` per fighter at load time by iterating `spellLists[listId].permittedWarbands[]` and matching `{warband, fighter}`

#### `js/ui.js`
- **Skill access:** Update `openSkillModal()` to read `skillAccess` as a boolean object (`{combat: true, shooting: false, ...}`) instead of an array of strings; include `special` key for warband-specific categories
- **Spell access:** Update `hasSpellAccess()` and `openSpellModal()` to use `spellAccess[]` derived from `magic.json` (Phase 3 data layer above)
- **Equipment access:** Remove `equipmentAccess` category filtering; replace with `permittedWarbands`/`excludedWarbands` check per item against the current warband name

#### `scripts/sync-mordheim-data.js`
- Add `magic.json` to sync

### Definition of Done
- Skill modal shows correct categories per hero type including warband-specific skills
- Spell modal shows correct spell lists for all 23 spell-casting heroes
- Equipment modal correctly includes/excludes items based on `permittedWarbands`/`excludedWarbands`
- No regressions on existing rosters

### Deploy checkpoint ✅

---

## Phase 4 — Skills & Remaining Data Sources

**Goal:** Switch skills and any remaining data sources (hired swords) to Uncle-Mel's files. After this phase all data is sourced from Uncle-Mel.

### Changes

#### `js/data.js`
- Replace `data/skills.json` load with Uncle-Mel's `skills.json` (flat array, `subtype` as category)
- Update `getSkill()` / `getSkillsByCategory()` to work with flat array and `subtype` field
- Replace `data/hired_swords.json` load with Uncle-Mel's `hiredSwords.json`; update `getHiredSwordTemplate()` / `getAvailableHiredSwords()` accordingly
- Evaluate `special_rules.json`, `injuries.json`, `advancement.json` against Uncle-Mel equivalents (`maxStats.json`); carry over any unmapped files as-is if no Uncle-Mel equivalent exists

#### `scripts/sync-mordheim-data.js`
- Add `skills.json` and `hiredSwords.json` to sync; remove pulls for any of our old hand-maintained files that are now fully replaced

### Definition of Done
- Skill selection modal works correctly from Uncle-Mel's skills data
- Hired swords are selectable and display correctly
- All data files sourced from Uncle-Mel where an equivalent exists
- Old hand-maintained data files that are fully replaced are removed from `data/`
- No regressions across the full app

### Deploy checkpoint ✅

---

## Open Items to Resolve Before Starting

| # | Item |
| - | ---- |
| A | Confirm whether `injuries.json` and `advancement.json` have Uncle-Mel equivalents, or whether they remain hand-maintained |
| B | Raise casing inconsistencies (`Caveat`/`caveat`, `modelCaveat`/`modelcaveat`) with Uncle-Mel before Phase 1 ships |
| ~~C~~ | ~~Confirm how `mercenaries.json` distinguishes Reikland / Middenheim / Marienburg internally~~ | ✅ **Decision: expand subfactions into separate selectable warbands.** Uncle-Mel uses a `subfactions` object (`{default, options[]}`) on the warband. At load time, `DataService` must detect this field and generate one warband entry per subfaction option, each inheriting the shared fighters and equipment lists but using the subfaction name as its display name. This pattern must be applied generically in case other warbands use `subfactions` in the future. |
