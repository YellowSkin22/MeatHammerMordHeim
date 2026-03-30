# Architecture — MeatHammer Mordheim Roster Manager

## Overview

A vanilla JavaScript single-page application for managing Mordheim warbands and campaigns. No build tools, no framework, no npm. Served as static files and hosted on Netlify.

---

## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Frontend | Vanilla JS + HTML + CSS | No build step; deployable as static files |
| Persistence | `localStorage` (primary) + Supabase (cloud sync) | Works offline; cloud sync is optional |
| Auth | Supabase email/password | JWT carries tier claim |
| Hosting | Netlify | Static deploy via CLI |
| Data source | Uncle-Mel/JSON-derulo (GitHub) | Authoritative Mordheim game data |

---

## File Structure

```
index.html          — Main app (single page)
admin.html          — Admin panel (tier management, separate page)
js/
  cloud.js          — Auth, tier system, cloud sync
  data.js           — JSON loading, lookup methods
  storage.js        — localStorage CRUD + cloud sync trigger
  roster.js         — Business logic (create warriors, manage equipment/skills)
  ui.js             — All DOM rendering and event handling
  admin.js          — Admin panel logic
css/
  style.css         — All styles, dark/light mode
data/
  warbands.json     — 53 warband definitions (heroes, henchmen, stats, equipment)
  mergedEquipment.json — 246 equipment items
  skills.json       — Skill categories and descriptions
  magic.json        — Spell lists with warband/fighter access rules
  injuries.json     — Hero and henchman injury tables
  advancement.json  — XP thresholds and max stat values
  hired_swords.json — Hired sword templates (hand-maintained)
  special_rules.json — 130 special rule descriptions for tooltips
scripts/
  sync-mordheim-data.js — Nightly sync from Uncle-Mel/JSON-derulo
supabase/
  migrations/       — Database schema (RLS, tier hooks, notifications)
```

---

## JavaScript Architecture

Five globals loaded in strict order by `index.html`. Each depends on those before it.

```
Cloud → DataService → Storage → RosterModel → UI
```

### 1. Cloud (`js/cloud.js`)
Supabase auth and tier system. Loaded first because all other modules may check `Cloud.canAccess()`.

- **Auth:** email/password via Supabase SDK
- **Tier:** `free` / `standard` / `pro` — read from JWT claim `user_tier` via `refreshTier()`
- **Feature gating:** `Cloud.canAccess(featureName)` compares `TIER_RANK` values
- **Cloud sync:** debounced upsert to Supabase `rosters` table; last-write-wins on `updatedAt`
- Operates in offline mode if Supabase SDK fails to load

### 2. DataService (`js/data.js`)
Loads all JSON from `data/` via `fetch()` and provides typed lookup methods. No direct property access from outside this file.

- All JSON loaded in parallel via `Promise.all()` in `loadAll()`
- Generates slug IDs at runtime for equipment (`slugify(item.name)`)
- Builds `spellAccess` per hero template at load time from `magic.json` (`_buildSpellAccess`)
- `canWarbandAccess(item, warbandName)` handles `permittedWarbands` / `excludedWarbands` for equipment filtering

Key methods: `getWarband`, `getEquipmentItem`, `getEquipmentByCategory`, `getAllEquipment`, `getSkill`, `getSkillsByCategory`, `getSpell`, `getSpellsByList`, `getHiredSwordTemplate`, `getAvailableHiredSwords`, `getSpecialRuleDescription`, `canWarbandAccess`

### 3. Storage (`js/storage.js`)
CRUD over `localStorage` (key: `mordheim_rosters`). Fires `Cloud.enqueueSave()` on every write.

- `saveRoster(roster)` — upsert by ID
- `deleteRoster(id)` — removes locally and triggers cloud delete
- `exportRoster(id)` / `importRoster(json)` — JSON string import/export (standard tier)

### 4. RosterModel (`js/roster.js`)
Pure business logic — no DOM access, no localStorage access.

- `createRoster(name, warbandId)` — initialises roster with warband defaults
- `createWarrior(templateType, isHero, warband)` — bakes in cost/stats/specialRules at creation time
- `addEquipment`, `removeEquipment`, `addSkill`, `addSpell`, `addInjury`
- `modifyStat(warrior, stat, delta)` — enforces min/max bounds
- `getWarbandRating(roster)` — calculates total rating
- `promoteHenchmanToHero(roster, index, skillAccess)` — Lad's Got Talent promotion

### 5. UI (`js/ui.js`)
All DOM rendering and event handling. ~1200 lines. No business logic.

- Two views: **roster list** and **roster editor** (warriors tab + progress tab)
- Full re-render on every state change (see Mutation Pattern below)
- Modal system for equipment, skill, spell, and injury selection
- PDF export via `window.open()` + `document.write()` + `window.print()`

---

## Key Patterns

### Mutation Pattern
Every state change follows the same three-step sequence:

```js
UI.currentRoster.heroes[0].experience += 1;  // 1. mutate in-memory object
UI.saveCurrentRoster();                        // 2. persist to localStorage (+ enqueue cloud sync)
UI.renderRosterEditor();                       // 3. full re-render
```

Exception: `renameWarrior()` does a targeted DOM update on the warrior card header instead of a full re-render.

### Warrior Cost Baked In
`createWarrior()` copies `template.cost` into the warrior object at creation time. Later changes to `warbands.json` only affect newly hired warriors, never existing ones.

### Index-Based Event Handlers
UI event handlers reference warriors by **array index** (`heroes[0]`, `henchmen[2]`), not by ID. Adding or removing a warrior shifts all subsequent indices, making re-renders after mutations critical.

### XSS Escaping
- `UI.esc(str)` — for HTML content
- `UI.escAttr(str)` — for HTML attribute values (also escapes `"`)

All user-controlled strings (warrior names, warband names) must go through one of these before insertion into HTML.

### Cache Busting
Script and CSS tags in `index.html` use `?v=N` query params. Increment after any change to the corresponding file. The `v=N` string at the top of `DataService.loadAll()` applies to all data file fetches.

---

## Tier System

| Feature | Free | Standard | Pro |
|---|---|---|---|
| Roster limit | 3 | 10 | Unlimited |
| Core mechanics | ✓ | ✓ | ✓ |
| Cloud sync | — | ✓ | ✓ |
| Import / export | — | ✓ | ✓ |
| Warrior names | — | ✓ | ✓ |
| Campaign notes | — | ✓ | ✓ |
| Battle log | — | — | ✓ |
| Custom warriors | — | — | ✓ |
| PDF export | — | — | ✓ |

**Rule:** Core game mechanics (warrior management, stats, equipment, skills, injuries, experience, warband rating) must never be gated. Only quality-of-life and convenience features are tiered.

Tier is embedded in the Supabase JWT via a custom access token hook. `Cloud.canAccess(featureName)` is the single gating call — no tier checks outside `cloud.js`.

To force a tier locally for testing: `Cloud._cachedTier = 'pro'` in the browser console.

---

## Data Pipeline

Game data is sourced from [Uncle-Mel/JSON-derulo](https://github.com/Uncle-Mel/JSON-derulo) and synced nightly via `scripts/sync-mordheim-data.js`.

```
Uncle-Mel/JSON-derulo (GitHub)
        │
        │  gh api (authenticated)
        ▼
sync-mordheim-data.js
  ├── mergedEquipment.json  — written as-is (no transform)
  ├── magic.json            — written as-is (no transform)
  ├── skills.json           — transformed: flat array → { skillCategories: {} }
  │                           special skills routed by permittedWarbands
  └── warbands.json         — transformed: per-file → flat array
                              subfactions expanded to separate entries
                              spellAccess cross-referenced from magic.json
        │
        │  git commit + push → Netlify deploy hook
        ▼
  data/*.json  (loaded by DataService at runtime)
```

Files **not** synced from Uncle-Mel (hand-maintained, no equivalent upstream):
- `hired_swords.json` — Uncle-Mel's file lacks stats/skillAccess
- `injuries.json` — no upstream equivalent
- `advancement.json` — no upstream equivalent
- `special_rules.json` — no upstream equivalent

---

## Supabase Backend

| Table | Purpose |
|---|---|
| `rosters` | User rosters, RLS per user |
| `user_profiles` | Tier, admin flag |
| `notifications` | Admin-managed banners shown in app |

- Custom JWT hook injects `user_tier` and `is_admin` claims
- Admin reads use SECURITY DEFINER RPCs to bypass RLS
- Conflict resolution: last-write-wins on `updatedAt`
- Notification dismissal is per-session via `sessionStorage`

---

## Boot Sequence

```
1. Flash-prevention inline script  — applies stored theme before first paint
2. Cloud.init()                    — connects Supabase SDK (or enters offline mode)
3. DataService.loadAll()           — fetches all data/*.json in parallel
4. UI.init()                       — renders roster list, binds global events
5. (if signed in) Cloud.refreshTier() + Cloud.fullSync()
```
