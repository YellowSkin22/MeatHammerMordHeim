## Purpose of this document

This mapping exists to support migrating the app from its own hand-maintained data files to sourcing directly from Uncle-Mel's data structure. **Uncle-Mel's files are the target — we do not reshape his data.** Instead, this document identifies what our app logic, schema, and UI need to change so they can read Uncle-Mel's structure natively. All decisions and action items should be framed from that perspective.

---

### Warbands
## General Comments
1. Every Warband has their own file
2. The items in the warband files relate to the warband specific allowed items

## Mapping

| YellowSkin Repo | Uncle-Mel Repo | Purpose |
| ------------- | ------------- | ------- |
| **— WARBAND LEVEL —** | | |
| `id` | `id` | Unique slug used as primary key and in URL routing |
| `name` | `name` | Display name shown in the UI |
| `source` | `source` | Publication the warband originates from (e.g. Town Cryer issue) |
| `description` | `lore` (Uncle-Mel's value is HTML-formatted) | Flavour text shown to the player |
| `startingGold` | `warbandRules.startingGc` | Gold crowns available at warband creation |
| `maxWarband` | `warbandRules.maxModels` | Hard cap on total number of warriors |
| `choiceFluff` (to be added) | `warbandRules.choiceFluff` | Human-readable warband composition rules. **Decision: import and store now, do not display in UI yet.** |
| ~~`alignment`~~ | Not present in Uncle-Mel. **Decision: drop this field.** | Faction alignment; was unused — will not be migrated |
| `equipmentAccess` (category-level per heroes/henchmen) | ⚠️ **STRUCTURAL DIFFERENCE** — Uncle-Mel does not use equipment categories. Each fighter references named equipment lists by ID (`equipmentLists: ["list-id"]`), and the actual items live in warband-level `equipmentLists[].items[]`. See Equipment section below | Controls which equipment categories are available in the buy-equipment modal |
| **— HERO LEVEL (`heroes[]` → `fighters[]` where `type == "hero"`) —** | | |
| `type` | `id` | Internal slug used to identify the warrior type (e.g. `captain`) |
| `name` | `name` | Display name shown on the warrior card |
| `max` | `maxQty` | Maximum number of this hero type allowed in the warband |
| `required` | derived: `minQty >= 1` evaluates to `true` | Whether the warband must include at least one of this type |
| `cost` | `costGc` | Gold crown cost baked into the warrior at creation |
| `stats.M` | `statblock.m` (Uncle-Mel uses lowercase stat keys) | Movement |
| `stats.WS` | `statblock.ws` | Weapon Skill |
| `stats.BS` | `statblock.bs` | Ballistic Skill |
| `stats.S` | `statblock.s` | Strength |
| `stats.T` | `statblock.t` | Toughness |
| `stats.W` | `statblock.w` | Wounds |
| `stats.I` | `statblock.i` | Initiative |
| `stats.A` | `statblock.a` | Attacks |
| `stats.Ld` | `statblock.ld` | Leadership |
| `specialRules[]` (array of strings, e.g. `["Leader"]`) | `specialRules[].rulename` (array of objects `{flavour, rulename, ruleFull}`) | Special abilities and traits; drive tooltip descriptions and UI gating (e.g. spell access checks for `"Wizard"`) |
| `startingExp` | `startingXp` | Experience points the warrior begins with at hire |
| `skillAccess[]` (array of strings, e.g. `["combat","shooting"]`) | `skillAccess` (object with boolean values, e.g. `{combat: true, shooting: true, special: false}`) | Skill categories available when the hero gains an advancement |
| `spellAccess[]` (e.g. `["prayers-of-sigmar"]`) | derived from `magic.json` → `spellLists[listId].permittedWarbands[]` where `{warband, fighter}` matches the current warband and fighter name | Spell lists available in the buy-spell modal; only populated for spell-casting heroes |
| `allowedEquipment[]` (inline array per warrior) | referenced indirectly: `equipmentLists[]` IDs on the fighter → warband-level `equipmentLists[].items[]` | Items the warrior is permitted to buy, with their warband-specific costs |
| **— HENCHMAN LEVEL (`henchmen[]` → `fighters[]` where `type == "henchman"`) —** | | |
| `type` | `id` | Internal slug used to identify the henchman type |
| `name` | `name` | Display name shown on the warrior card |
| `cost` | `costGc` | Gold crown cost per model at hire |
| `stats.*` | `statblock.*` (same lowercase conversion as heroes) | Base stat line (same fields as heroes) |
| `specialRules[]` (array of strings) | `specialRules[].rulename` | Special abilities; same role as on heroes |
| `maxGroupSize` | `groupSize.max` | Maximum number of models in a single henchman group |
| `groupSize.min` (to be added) | `groupSize.min` | Minimum models required when purchasing this henchman group. **Decision: import and store the field now, but do not use it in the UI yet.** |
| `gainExp` (to be added) | `gainExp` | Flags whether this henchman type earns XP after battles. **Decision: import and store now, do not use in UI yet.** |
| `promotable` (to be added) | `promotable` | Flags eligibility for the "Lad's Got Talent" hero promotion. **Decision: import and store now, do not use in UI yet.** |
| `allowedEquipment[]` | same indirect reference via `equipmentLists[]` IDs as heroes | Items the henchman group is permitted to buy |

---

## ⚠️ Unclear / Missing — Action Required

| # | Topic | Detail |
| - | ----- | ------ |
| ~~1~~ | ~~`alignment`~~ | ✅ **Decision: drop.** Field was empty for all 38 warbands and unused in the UI. Will not be migrated. |
| ~~2~~ | ~~`spellAccess[]`~~ | ✅ **Decision: derive from `magic.json`.** Each spell list in `spellLists[listId].permittedWarbands[]` contains `{warband, fighter}` entries. During migration, iterate all spell lists and map matching entries to the relevant fighter's `spellAccess[]`. |
| ~~3~~ | ~~`groupSize.min` on henchmen~~ | ✅ **Decision: import and store now, use later.** Add `groupSize.min` to the henchman schema during migration but leave it unused in the UI until needed. |
| ~~4~~ | ~~`gainExp` / `promotable` on henchmen~~ | ✅ **Decision: import and store now, use later.** Add both fields to the henchman schema during migration but leave them unused in the UI until needed. |
| 5 | Equipment list structure | Uncle-Mel uses named, reusable equipment lists at warband level referenced by ID on each fighter. Our app currently inlines `allowedEquipment[]` per warrior. **App logic must change** to resolve equipment by looking up the fighter's `equipmentLists[]` IDs against the warband-level `equipmentLists[]` array. `equipmentAccess` category filtering will also need to be reworked to derive from these lists instead. |
| ~~6~~ | ~~`plural` / `race` / `flavour` / `admonitions` on fighters~~ | ✅ **Decision: import and store now, use later.** Add all four fields to the fighter schema during migration but do not use in the UI yet. |
| ~~7~~ | ~~`warbandRules.choiceFluff`~~ | ✅ **Decision: import and store now, use later.** Add to schema during migration but do not display in the UI yet. |
| ~~8~~ | ~~Uncle-Mel grade 1c warbands~~ | ✅ **Decision: in scope.** All grade 1c warbands from Uncle-Mel will be included in the migration. |
| ~~9~~ | ~~Duplicate/old files in Uncle-Mel~~ | ✅ **Decision: ingest all available warbands.** Use the current (non-old, non-original) versions where duplicates exist (`pit-fighters.json`, `tileans.json`, `tomb-guardians.json`). Skip `*-old.json` and `*-original.json` files. |
| ~~10~~ | ~~Core warbands (Reikland, Middenheim, Marienburg)~~ | ✅ **Decision: follow Uncle-Mel's structure.** Ingest `mercenaries.json` as-is. Our three separate warband files will be replaced by this single file. App logic must adapt accordingly. |
| ~~18~~ | ~~Migration scope — warbands~~ | ✅ **Decision: ingest all warbands from Uncle-Mel** across grades 1a, 1b, and 1c. Resolved by items 8 and 9. |
| ~~19~~ | ~~`lore` HTML rendering~~ | ✅ **Decision: strip HTML tags.** Strip tags from `lore` when reading the data, keeping plain text only. No UI changes required. |
| ~~20~~ | ~~Warband-level `specialRules[]`~~ | ✅ **Decision: import and store now, use later.** Add to warband schema during migration but do not use in the UI yet. |
| ~~21~~ | ~~`specialSkills` boolean on warbands~~ | ✅ **Decision: import and store now, use later.** Add to warband schema during migration but do not use in the UI yet. |
| ~~22~~ | ~~`skillAccess.special` in transform~~ | ✅ **Decision: amend app logic.** Update our skill access logic to read Uncle-Mel's `skillAccess` object (boolean per category) directly, including the `special` key, rather than our current array of category ID strings. |

---

### Equipment
## Mapping

| YellowSkin Repo | Uncle-Mel Repo | Purpose |
| ------------- | ------------- | ------- |
| **— CATEGORY LEVEL (`categories.*`) —** | | |
| `hand_to_hand` (category key) | `type: "melee"` | Hand-to-hand combat weapons |
| ~~`missiles`~~ → `missile` + `blackpowder` | `type: "missile"` and `type: "blackpowder"` | **Decision: follow Uncle-Mel's structure.** Our single `missiles` category is replaced by two. App logic must handle both. |
| `armour` (category key) | `type: "armour"` | Protective equipment |
| `miscellaneous` (category key) | `type: "misc"` | All other equipment |
| `animal` (to be added) | `type: "animal"` (14 items) | Mounts and ridden animals. **Decision: in scope.** Add as a new category; app logic must handle `statblock[]` on these items. |
| `categories.[id].name` | derived from `type` | Human-readable category label shown in the equipment modal |
| **— ITEM LEVEL —** | | |
| `id` | derived: slugified `name` or `tags[0]` | Unique item key used for lookups and `allowedEquipment` references |
| `name` | `name` | Display name shown on warrior card and in equipment modal |
| ~~`cost` (plain number)~~ → `cost` object | `cost` object `{cost, costPrefix?, costSuffix?}` | Base gold crown price with optional conditional pricing. **Decision: adopt Uncle-Mel's structure.** App logic and UI must be updated. |
| `range` | `range` | Weapon range shown in equipment tooltip (e.g. `"Close Combat"`, `"24\""`) |
| `strength` | `strength` | Weapon strength shown in equipment tooltip (e.g. `"As user"`, `"3"`) |
| ~~`rules` (plain string)~~ → `specialRules[]` | `specialRules[]` array of objects `{rulename, ruleAbbreviated, ruleFull}` | Rules text shown as description. **Decision: follow Uncle-Mel's structure.** App logic and UI must be updated to read the structured format. |
| `category` | derived from `type` | Back-reference to the category this item belongs to |
| ⚠️ **NOT PRESENT** | `availability` (number, 0 = common) | Rarity value used for trading post rolls |
| ⚠️ **NOT PRESENT** | `grade` | Which campaign grade introduces this item (e.g. `"core"`, `"1b"`) |
| ⚠️ **NOT PRESENT** | `permittedWarbands` (`"all"` or array of names) | Which warbands may purchase this item globally |
| ⚠️ **NOT PRESENT** | `excludedWarbands` (array of names) | Warbands explicitly barred from this item |
| ⚠️ **NOT PRESENT** | `source` | Publication the item originates from |
| ⚠️ **NOT PRESENT** | `flavour` | Flavour text describing the item |
| ⚠️ **NOT PRESENT** | `tags[]` | Name aliases used for search/matching (e.g. `["axe", "axes"]`) |
| ⚠️ **NOT PRESENT** | `save` | Armour save value; only present on armour-type items |
| ⚠️ **NOT PRESENT** | `statblock[]` | Stat profile; only present on animal-type items |
| ⚠️ **NOT PRESENT** | `caveat` / `modelCaveat` | Usage restriction notes (e.g. `"Pirates only"`, `"Warhorses only"`) — ⚠️ Uncle-Mel has inconsistent casing (`Caveat`/`caveat`, `modelCaveat`/`modelcaveat`) across items |
| ⚠️ **NOT PRESENT** | `warbandRarityOverride[]` | Per-warband rarity overrides (e.g. Amazons get a lower rarity on certain items) |
| ⚠️ **NOT PRESENT** | `purchaseLimit` | Maximum number of this item a warrior may carry |
| ⚠️ **NOT PRESENT** | `link` | URL to the item's page on mordheimer.net |

---

## ⚠️ Unclear / Missing — Action Required

| # | Topic | Detail |
| - | ----- | ------ |
| ~~11~~ | ~~`missiles` category split~~ | ✅ **Decision: follow Uncle-Mel's structure.** Replace our single `missiles` category with Uncle-Mel's two separate types: `missile` and `blackpowder`. App logic must be updated to handle both. |
| ~~12~~ | ~~`animal` type~~ | ✅ **Decision: in scope.** Add `animal` as a new equipment category. App logic must be updated to handle the `statblock[]` field present on animal items. |
| ~~13~~ | ~~`cost` structure~~ | ✅ **Decision: adopt Uncle-Mel's structure.** Replace our plain `cost` number with Uncle-Mel's `cost` object `{cost, costPrefix?, costSuffix?}`. App logic and UI must be updated to handle the richer structure. |
| ~~14~~ | ~~`rules` vs `specialRules[]`~~ | ✅ **Decision: follow Uncle-Mel's structure.** Replace our flat `rules` string with Uncle-Mel's `specialRules[]` array of objects `{rulename, ruleAbbreviated, ruleFull}`. App logic and UI must be updated to read the structured format. |
| ~~15~~ | ~~`permittedWarbands` / `excludedWarbands`~~ | ✅ **Decision: change the app.** Our `equipmentAccess` category logic will be replaced. App must read `permittedWarbands` and `excludedWarbands` directly from Uncle-Mel's item data to determine availability per warband. |
| ~~16~~ | ~~`availability` (rarity)~~ | ✅ **Decision: import and store now, use later.** Add `availability` to the item schema during migration but do not use in the UI yet. |
| ~~17~~ | ~~Casing inconsistencies in Uncle-Mel~~ | ✅ **Decision: handle in app and report upstream.** App will normalise both casing variants (`Caveat`/`caveat`, `modelCaveat`/`modelcaveat`) at read time. Uncle-Mel will be informed of the inconsistency so it can be fixed in the source data. |
| ~~23~~ | ~~Migration scope — equipment~~ | ✅ **Decision: import all.** All 246 items from Uncle-Mel's `mergedEquipment.json` will be ingested across all types. |

###
