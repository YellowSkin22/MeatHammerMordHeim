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
| `alignment` | ⚠️ **NOT PRESENT** in Uncle-Mel. Our field is also empty for all 38 warbands — confirm whether this field should be dropped or populated manually | Faction alignment (Order / Neutral / Undead); currently unused |
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
| `spellAccess[]` (e.g. `["prayers-of-sigmar"]`) | ⚠️ **NOT PRESENT** in Uncle-Mel. This field drives the spell selection UI. Needs to be retained and populated manually or derived from `specialRules` during migration | Spell lists available in the buy-spell modal; only populated for spell-casting heroes |
| `allowedEquipment[]` (inline array per warrior) | referenced indirectly: `equipmentLists[]` IDs on the fighter → warband-level `equipmentLists[].items[]` | Items the warrior is permitted to buy, with their warband-specific costs |
| **— HENCHMAN LEVEL (`henchmen[]` → `fighters[]` where `type == "henchman"`) —** | | |
| `type` | `id` | Internal slug used to identify the henchman type |
| `name` | `name` | Display name shown on the warrior card |
| `cost` | `costGc` | Gold crown cost per model at hire |
| `stats.*` | `statblock.*` (same lowercase conversion as heroes) | Base stat line (same fields as heroes) |
| `specialRules[]` (array of strings) | `specialRules[].rulename` | Special abilities; same role as on heroes |
| `maxGroupSize` | `groupSize.max` | Maximum number of models in a single henchman group |
| ⚠️ **NOT PRESENT** | `groupSize.min` — Uncle-Mel tracks minimum group size; confirm default (assume 0?) | Minimum models required when purchasing this henchman group |
| ⚠️ **NOT PRESENT** | `gainExp` (boolean) — whether henchmen in this group gain experience; confirm if needed | Flags whether this henchman type earns XP after battles |
| ⚠️ **NOT PRESENT** | `promotable` (boolean) — whether a henchman can be promoted ("Lad's Got Talent"); confirm if needed | Flags eligibility for the "Lad's Got Talent" hero promotion |
| `allowedEquipment[]` | same indirect reference via `equipmentLists[]` IDs as heroes | Items the henchman group is permitted to buy |

---

## ⚠️ Unclear / Missing — Action Required

| # | Topic | Detail |
| - | ----- | ------ |
| 1 | `alignment` | Field exists in our schema but is empty for all 38 warbands. Uncle-Mel has no equivalent. Should it be dropped, or do you want to populate it manually (values seen: `Order`, `Neutral`, `Undead`)? |
| 2 | `spellAccess[]` | Uncle-Mel has no spell access field. Our UI relies on it to show spell selection for 23 heroes across 16 warbands. During migration this will need to be retained and either migrated manually or derived from `specialRules` (e.g. a fighter with rulename `"Wizard"` → assign spell list). Confirm approach |
| 3 | `groupSize.min` on henchmen | Uncle-Mel tracks a minimum group size. Our schema only has `maxGroupSize`. Should `groupSize.min` be added to our schema, or ignored? |
| 4 | `gainExp` / `promotable` on henchmen | Uncle-Mel flags whether a henchman group gains XP and is promotable. These are implicit in our current model (all henchmen gain XP; promotion is a UI action). Confirm whether to import and expose these flags |
| 5 | Equipment list structure | Uncle-Mel uses named, reusable equipment lists at warband level (e.g. `"mountainguard-equipment-list"`) referenced by ID on each fighter. Our model inlines `allowedEquipment[]` directly on each warrior. Migration must flatten Uncle-Mel's lists into per-fighter inline arrays. Confirm this is the intended approach |
| 6 | `plural` / `race` / `flavour` / `admonitions` on fighters | Uncle-Mel includes these fields on every fighter; we don't have them. Should any be imported into our schema? |
| 7 | `warbandRules.choiceFluff` | Uncle-Mel includes a human-readable text description of warband composition rules. We have no equivalent. Should it be imported (e.g. as a `compositionNote` field)? |
| 8 | Uncle-Mel grade 1c warbands | Uncle-Mel's `1c/` folder contains warbands not currently in our app (e.g. Battle Monks of Cathay, Black Dwarfs, Night Goblins). Are these in scope for migration? |
| 9 | Duplicate/old files in Uncle-Mel | Uncle-Mel's `1b/` folder contains `pit-fighters-old.json`, `tileans-original.json`, `tomb-guardians-old.json`. Confirm which version to use for each |
| 10 | Core warbands (Reikland, Middenheim, Marienburg) | These three are separate files in our repo but Uncle-Mel merges them under a single `mercenaries.json`. Confirm how to handle the split |
| 18 | Migration scope — warbands | Are we migrating only our existing 38 warbands, or also importing new warbands from Uncle-Mel? Uncle-Mel has 48+ warband files across grades 1a/1b/1c |
| 19 | `lore` HTML rendering | Uncle-Mel's `lore` field contains HTML tags (e.g. `<em>`, `<br />`). Our UI renders `description` as plain text. Decision needed: strip HTML tags on import, or update the UI to render HTML? |
| 20 | Warband-level `specialRules[]` | Uncle-Mel has a `specialRules[]` array at the warband level (distinct from fighter-level rules) representing warband-wide traits. We have no equivalent field. Import and add to schema, or ignore? |
| 21 | `specialSkills` boolean on warbands | Uncle-Mel flags each warband with a `specialSkills` boolean indicating whether it has unique skill categories. We have no equivalent. Import or ignore? |
| 22 | `skillAccess.special` in transform | Uncle-Mel's `skillAccess` object includes a `special` key (boolean) representing access to warband-specific skill categories. Our array-based `skillAccess` uses explicit category IDs. Confirm how `special: true` should be resolved during migration (which category ID does it map to per warband?) |

---

### Equipment
## Mapping

| YellowSkin Repo | Uncle-Mel Repo | Purpose |
| ------------- | ------------- | ------- |
| **— CATEGORY LEVEL (`categories.*`) —** | | |
| `hand_to_hand` (category key) | `type: "melee"` | Hand-to-hand combat weapons |
| `missiles` (category key) | `type: "missile"` **+** `type: "blackpowder"` | ⚠️ **SPLIT** — Uncle-Mel separates ranged into two types; our single category maps to both |
| `armour` (category key) | `type: "armour"` | Protective equipment |
| `miscellaneous` (category key) | `type: "misc"` | All other equipment |
| ⚠️ **NOT PRESENT** | `type: "animal"` (14 items) | Mounts and ridden animals; no equivalent in our schema |
| `categories.[id].name` | derived from `type` | Human-readable category label shown in the equipment modal |
| **— ITEM LEVEL —** | | |
| `id` | derived: slugified `name` or `tags[0]` | Unique item key used for lookups and `allowedEquipment` references |
| `name` | `name` | Display name shown on warrior card and in equipment modal |
| `cost` (plain number) | `cost.cost` (nested object `{cost: N}`) | Base gold crown price; Uncle-Mel also has optional `cost.costPrefix` (e.g. `"1st free/"`) and `cost.costSuffix` for conditional pricing |
| `range` | `range` | Weapon range shown in equipment tooltip (e.g. `"Close Combat"`, `"24\""`) |
| `strength` | `strength` | Weapon strength shown in equipment tooltip (e.g. `"As user"`, `"3"`) |
| `rules` (single plain-text string) | `specialRules[]` (array of objects `{rulename, ruleAbbreviated, ruleFull}`) | Rules text shown as description; Uncle-Mel's structured format also includes full and abbreviated variants |
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
| 11 | `missiles` category split | Uncle-Mel separates ranged weapons into `missile` and `blackpowder`. Should our schema adopt this split, or keep a single category and map both to it? |
| 12 | `animal` type | Uncle-Mel has 14 mount/animal items (Chaos Steed, Warhorse, etc.) with full statblocks. We have no equivalent category. Are animals in scope? |
| 13 | `cost` structure | Uncle-Mel's `cost` is an object with optional `costPrefix`/`costSuffix` (e.g. `"1st free/"`, `"(Bergjaeger only)"`). Our cost is a plain number. Should we adopt the richer structure to support conditional pricing? |
| 14 | `rules` vs `specialRules[]` | Uncle-Mel stores rules as structured objects with full and abbreviated text. Our `rules` is a single flat string. Should we adopt the structured format, or flatten Uncle-Mel's data into our existing string field? |
| 15 | `permittedWarbands` / `excludedWarbands` | Uncle-Mel tracks global item availability per warband directly on the item. We control this at the warband level via `allowedEquipment`. Confirm whether to import these fields or continue relying on warband-level lists |
| 16 | `availability` (rarity) | Uncle-Mel tracks rarity numbers for trading post rules. We don't. Should this be imported for future trading post feature support? |
| 17 | Casing inconsistencies in Uncle-Mel | `Caveat`/`caveat` and `modelCaveat`/`modelcaveat` appear with inconsistent casing in `mergedEquipment.json`. Migration script will need to handle both variants |
| 23 | Migration scope — equipment | Are we migrating only our existing 79 items, or importing all 246 items from Uncle-Mel's `mergedEquipment.json`? Uncle-Mel has 3x more items across all types |

###
