# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the App

Serve with any static HTTP server — no build tools, npm, or dependencies:
```bash
python3 -m http.server 8000
# Open http://localhost:8000
```

No test suite exists. Testing is manual in the browser.

## Architecture

Vanilla JS single-page app with four modules loaded in order by `index.html`:

1. **DataService** (`js/data.js`) — Loads all JSON files from `data/` via `fetch()`, provides lookup methods (`getWarband`, `getEquipmentItem`, `getSkill`, `getSpell`, `getExpThreshold`)
2. **Storage** (`js/storage.js`) — CRUD over localStorage (key: `mordheim_rosters`), plus import/export as JSON strings
3. **RosterModel** (`js/roster.js`) — Business logic: create rosters/warriors from templates, manage equipment/skills/spells/injuries, stat modification with bounds, warband rating calculation
4. **UI** (`js/ui.js`) — All DOM rendering and event handling. Full re-render on state change. Two views: roster list and roster editor (warriors tab + progress tab). Modal system for equipment/skill/spell/injury selection.

Bootstrap sequence: `DataService.loadAll()` → `UI.init()` → render roster list from localStorage.

## Key Design Decisions

- **Warrior cost is baked in at creation time** — `createWarrior()` copies `template.cost` into the warrior object. Changing costs in `warbands.json` only affects newly created warriors; existing warriors in localStorage keep their original cost.
- **Data-driven game rules** — All warband definitions, equipment, skills, spells, injuries, and advancement tables live in `data/*.json`. Add new content by editing JSON, not JS.
- **Spell access** — Heroes with the "Wizard" special rule have a `spellAccess` array on their template in `warbands.json` referencing spell list IDs in `data/spells.json`.
- **Equipment access** — Controlled per-warband via `equipmentAccess.heroes` and `equipmentAccess.henchmen` arrays of category IDs.
- **Event propagation** — Add warrior buttons inside `.section-header` elements use `event.stopPropagation()` to prevent triggering the parent's collapse toggle.

## Data Files

| File | Purpose |
|------|---------|
| `data/warbands.json` | Warband definitions with hero/henchman templates, stat lines, skill access, equipment restrictions |
| `data/equipment.json` | Equipment catalog across 5 categories (hand_to_hand, missiles, armour, miscellaneous, rare) |
| `data/skills.json` | 5 skill categories with 6 skills each |
| `data/spells.json` | Spell lists (prayers_of_sigmar, necromancy, necromancy_restless_dead, chaos_rituals, eshin_sorcery) |
| `data/injuries.json` | Hero and henchman injury tables |
| `data/advancement.json` | Experience thresholds, max stat values, advancement rules |

## Warbands

Core: Reikland, Middenheim, Marienburg, Witch Hunters, Sisters of Sigmar, Undead, Cult of the Possessed, Skaven.
Expansion: Restless Dead (Border Town Burning).
