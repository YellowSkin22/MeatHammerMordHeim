# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the App

Serve with any static HTTP server — no build tools, npm, or dependencies:
```bash
python3 -m http.server 8000
# Open http://localhost:8000
```

Must use a server (not `file://`) because DataService uses `fetch()` for JSON. No test suite; testing is manual in the browser. A dev server config exists at `.claude/launch.json` for the Claude Preview tool.

Script and CSS tags in `index.html` use `?v=N` query params for cache busting — increment after changes.

## Deployment

Hosted on Netlify. Deploy with:
```bash
netlify deploy --prod --dir=. --site=37f849ae-7c23-4bcc-99a1-a7fbadc69ef6
```
Live at: https://meathammer-mordheim.netlify.app

## Rules

- **Core game mechanics are always free tier** — features that are fundamental to playing the game (managing warriors, tracking stats, equipment, skills, injuries, experience, warband rating) must never be gated behind `standard` or `pro`. If a request would move a core mechanic behind a tier check, ask for explicit confirmation that this rule is being intentionally broken before proceeding.

- **All changes go through a PR** — never push directly to `main`. Start every piece of work on a feature or fix branch (`feature/short-description` or `fix/short-description`), then open a pull request into `main` when complete. The only exceptions are automated sync commits from `sync-mordheim-data.js` and doc-only typo fixes.

## Architecture

Vanilla JS single-page app with five globals loaded in order by `index.html`:

1. **Cloud** (`js/cloud.js`) — Supabase auth (email/password), tier system (free/standard/pro), and cloud sync. Loaded first. Operates in offline mode if Supabase SDK fails to load.
2. **DataService** (`js/data.js`) — Loads all JSON files from `data/` via `fetch()`, provides lookup methods (`getWarband`, `getEquipmentItem`, `getEquipmentByCategory`, `getAllEquipment`, `getSkill`, `getSkillsByCategory`, `getSpell`, `getSpellsByList`, `getExpThreshold`, `getMaxStat`, `getHiredSwordTemplate`, `getAvailableHiredSwords`, `getSpecialRuleDescription`)
3. **Storage** (`js/storage.js`) — CRUD over localStorage (key: `mordheim_rosters`), plus import/export as JSON strings. On every `saveRoster()`, fires `Cloud.enqueueSave()` for cloud sync.
4. **RosterModel** (`js/roster.js`) — Business logic: create rosters/warriors from templates, manage equipment/skills/spells/injuries, stat modification with bounds, warband rating calculation
5. **UI** (`js/ui.js`) — All DOM rendering and event handling. Two views: roster list and roster editor (warriors tab + progress tab). Modal system for equipment/skill/spell/injury selection.

Bootstrap sequence: `Cloud.init()` → `DataService.loadAll()` → `UI.init()` → if signed in, `Cloud.refreshTier()` + `Cloud.fullSync()`.

**Admin panel** (`admin.html` + `js/admin.js`) — Separate page for managing user tiers. Requires `is_admin` JWT claim. Not loaded by `index.html`.

## Key Design Decisions

- **Warrior cost is baked in at creation time** — `createWarrior()` copies `template.cost` into the warrior object. Changing costs in `warbands.json` only affects newly created warriors.
- **Data-driven game rules** — All warband definitions, equipment, skills, spells, injuries, and advancement tables live in `data/*.json`. Most content is synced from Uncle-Mel/JSON-derulo; only hand-maintained files (`hired_swords.json`, `injuries.json`, `advancement.json`, `special_rules.json`) should be edited directly.
- **Spell access** — `UI.hasSpellAccess()` first checks `template.spellAccess.length > 0` (computed at load time from `magic.json` by `DataService._buildSpellAccess()`). Falls back to checking `warrior.specialRules` for `'Wizard'`, `'Warrior Wizard'`, `'Prayers of Sigmar'`, `'Magic User'`, `'Prayers'`, `'Spellcaster'`, or `'Prayercaster'`. The fallback covers hired swords, custom warriors, and old data.
- **Equipment access** — Heroes and henchmen see items filtered by `DataService.canWarbandAccess(item, warbandName)` against `mergedEquipment.json`'s `permittedWarbands` / `excludedWarbands` fields. Hired swords use the legacy `equipmentAccess` category array from `hired_swords.json`.
- **Lad's Got Talent (promoted henchmen)** — `RosterModel.promoteHenchmanToHero()` creates a hero from a henchman, copying stats/equipment/injuries/experience. The promoted warrior goes into `roster.heroes[]` (not a separate array) with `isPromotedHenchman: true` and a user-chosen `skillAccess: [catId1, catId2]`. `baseStats` is set to match `stats` at promotion time so existing characteristic gains don't show as "modified". Max heroes is validated before promotion using `warband.heroes.reduce((sum, h) => sum + h.max, 0)`.
- **Event propagation** — Warrior add `<select>` dropdowns inside `.section-header` elements carry `onclick="event.stopPropagation()"` to prevent triggering the parent's collapse toggle. The `onchange` handler fires `UI.addWarriorFromSelect()` immediately on selection — there is no separate "Hire" button.

## Tier System & Cloud Sync

Three tiers: `free`, `standard`, `pro`. Tier is embedded in the Supabase JWT via a custom access token hook (`supabase/migrations/`). Feature gating uses `Cloud.canAccess(featureName)` against `Cloud.FEATURE_TIERS`.

| Feature | Required Tier |
|---------|--------------|
| `campaign_notes` | standard |
| `cloud_sync` | standard |
| `import_export` | standard |
| `warrior_names` | standard |
| `battle_log` | pro |
| `custom_warriors` | pro |
| `pdf_export` | pro |

Roster limits: free=3, standard=10, pro=unlimited.

Cloud sync uses **last-write-wins** conflict resolution based on `updatedAt` timestamps. `Storage.saveRoster()` fires `Cloud.enqueueSave()` which debounces (2s) then upserts to Supabase `rosters` table. Full bidirectional sync runs on sign-in via `Cloud.fullSync()`.

## Supabase Backend

Migrations are in `supabase/migrations/`. Key tables: `rosters` (RLS per user), `user_profiles` (tier, admin flag), `notifications` (admin-managed banners). A custom JWT hook injects `user_tier` and `is_admin` claims into access tokens.

Admin checks use `public.is_admin(auth.uid())` — a SECURITY DEFINER function that bypasses RLS to avoid recursion. Admin-only reads use SECURITY DEFINER RPCs (`get_all_notifications`, `get_all_users`) to bypass RLS. Admin writes (INSERT/UPDATE/DELETE) use direct table access with RLS policies that check `is_admin()`.

**Notifications:** Public SELECT policy filters `is_active = true` (no auth required). An additional admin SELECT policy allows admins to read all notifications — this is required because PostgreSQL applies SELECT USING as implicit WITH CHECK on UPDATE new rows, so without it admins can't set `is_active = false`. Notification dismissal is per-session via `sessionStorage` key `dismissed_notif_{id}`.

Push migrations with: `supabase db push --linked`

## Mutation Pattern

Every state change in the UI follows this sequence:
1. Mutate the in-memory `UI.currentRoster` object directly
2. Call `this.saveCurrentRoster()` to persist to localStorage
3. Call `this.renderRosterEditor()` to re-render the full editor

The one exception is `renameWarrior()`, which does a targeted DOM update on the warrior card header instead of a full re-render.

## Warrior Object Shape

Warriors stored across four arrays: `roster.heroes[]`, `roster.henchmen[]`, `roster.hiredSwords[]`, `roster.customWarriors[]`.

```js
{
  id,           // generated ID (Storage.generateId())
  type,         // template type string (e.g. 'captain')
  typeName,     // display name from template
  name,         // user-editable name (starts as typeName)
  isHero,       // boolean
  stats,        // { M, WS, BS, S, T, W, I, A, Ld } — current values
  baseStats,    // same shape — original template values, used to detect modifications
  equipment,    // [{ id, name }]
  skills,       // [{ id, name }]
  spells,       // [{ id, name }]
  injuries,     // [{ name, gameNumber }]
  experience,
  advancementCount,
  missNextGame,
  cost,         // baked in at creation
  specialRules, // [...strings]
  groupSize,    // henchmen only
  // Type flags (at most one is true):
  isHiredSword,       // hired swords — skill/spell/equipment access from hired_swords.json template
  isCustom,           // custom warriors (Pro tier) — full access to all skills/spells/equipment
  isPromotedHenchman, // Lad's Got Talent — skill access from warrior.skillAccess[], no spell access
  skillAccess,        // promoted henchmen only — [catId1, catId2] chosen at promotion
}
```

Stats highlighted as modified in the UI when `stats[x] !== baseStats[x]`.

**Type flag routing:** `openSkillModal()`, `openSpellModal()`, and `openEquipmentModal()` each branch on these flags to determine which categories to show. When adding a new warrior type or flag, update all three modals.

## UI Indexing

UI event handlers reference warriors by **array index** (`heroes[0]`, `henchmen[2]`), not by ID. Adding or removing a warrior shifts all subsequent indices, so re-renders after mutations are critical.

## XSS Escaping

- `UI.esc(str)` — escapes `<`, `>`, `&` via `div.textContent → div.innerHTML`. Use for inserting user-controlled strings into HTML content.
- `UI.escAttr(str)` — extends `esc()` to also escape `"` as `&quot;`. Use for inserting into HTML attribute values (e.g. `data-tooltip="..."`).

## Theme System

Dark/light mode is controlled via `data-theme="dark"` on `<html>`. The active theme is stored in `localStorage` under key `mordheim_theme`. A flash-prevention inline script in `<head>` applies the theme before first paint by reading `localStorage` and falling back to `window.matchMedia('(prefers-color-scheme: dark)')`.

- `UI.initTheme()` — called at the start of `UI.init()`, syncs the toggle icon and registers a `matchMedia` change listener (only applies when no user preference is stored)
- `UI.toggleTheme()` — flips the theme and writes to `localStorage`
- CSS: all colours are CSS custom properties on `:root`. The `[data-theme="dark"]` selector overrides them. Dark mode component overrides (tag colours, modal overlay, noise texture, transitions) live at the bottom of `css/style.css` under `/* ===== DARK MODE OVERRIDES ===== */`
- The notification banner is intentionally pinned to its parchment colours in dark mode — do not remove the `[data-theme="dark"] .notification-banner` override

## Tooltip System

Tooltips on special rules and equipment tags use a JS-based approach (not CSS pseudo-elements) because parent containers have `overflow: hidden`. Delegated `mouseenter`/`mouseleave` listeners in `bindGlobalEvents()` create a `position: fixed` `.tooltip-popup` element on `<body>`, with viewport boundary clamping. Tooltip text comes from `data-tooltip` attributes rendered onto `.tag` elements.

## PDF Export

`UI.exportPDF()` generates a self-contained HTML string with embedded CSS and opens it in a new window via `window.open()` + `document.write()`, then calls `window.print()` on load. No external PDF library is used.

## Data Files

Synced nightly from Uncle-Mel/JSON-derulo via `scripts/sync-mordheim-data.js`. Hand-maintained files are noted.

| File | Purpose |
|------|---------|
| `data/warbands.json` | 53 warband definitions (synced + subfactions expanded); hero/henchman templates, stat lines, skill/spell access |
| `data/mergedEquipment.json` | 246 equipment items (flat array); `type` field as category, `permittedWarbands`/`excludedWarbands` for access control |
| `data/skills.json` | 16 skill categories: 5 standard (combat, shooting, academic, strength, speed) + 11 warband-specific |
| `data/magic.json` | 30 spell lists; `spellLists[id].permittedWarbands[]` used to build `spellAccess` per fighter at load time |
| `data/injuries.json` | Hero and henchman injury tables — **hand-maintained** (no Uncle-Mel equivalent) |
| `data/advancement.json` | Experience thresholds, max stat values, advancement rules — **hand-maintained** |
| `data/hired_swords.json` | Hired Sword templates with stats and warband allow-lists — **synced** from Uncle-Mel's `hiredSwords.json`. `spellAccess` is derived from `HIRED_SWORD_SPELL_ACCESS_MAP` in the sync script; `equipmentAccess` defaults to all three categories (Uncle-Mel carries no category data). Uses `warbandAllowList` (allow-list), not `warbandRestrictions` (deny-list). |
| `data/special_rules.json` | 130 special rule descriptions keyed by rule name, used for tooltips — **hand-maintained** |

### Validating JSON

After editing any data file:
```bash
node -e "JSON.parse(require('fs').readFileSync('data/FILENAME.json','utf8')); console.log('OK')"
```

## Adding a New Warband

Warbands are synced from Uncle-Mel/JSON-derulo — do not hand-edit `data/warbands.json`. To add content:

1. Contribute the warband JSON to Uncle-Mel's repo and run `scripts/sync-mordheim-data.js` — the sync script handles transformation and subfaction expansion.
2. If the warband needs a new **warband-specific skill category**, add it to `data/skills.json` manually and add an entry to `SPECIAL_SKILL_CATEGORY_MAP` in `sync-mordheim-data.js` so Special Skills route into it.
3. If the warband introduces new **special rules**, add them to `data/special_rules.json` for tooltip descriptions.
4. Spell-casting heroes are detected at load time via `DataService._buildSpellAccess()` — no manual `spellAccess` entries needed if the spell list is in `magic.json`.

## Warbands (53 total)

**Core (8):** Reikland, Middenheim, Marienburg, Witch Hunters, Sisters of Sigmar, Undead, Cult of the Possessed, Skaven.

**Grade 1a (10):** Restless Dead, Dark Elves, Shadow Warriors, Averlanders, Beastmen Raiders, Carnival of Chaos, Dwarf Treasure Hunters, Kislevites, Orc Mob, Ostlanders.

**Grade 1b (20):** Amazons (Lustria), Amazons (Mordheim), Arabian Tomb Raiders, Black Orcs, Bretonnians, Dwarf Rangers, Forest Goblins, Gunnery School of Nuln, Hochland Bandits, Horned Hunters, Imperial Outriders, Lizardmen, Mootlanders, Norse Explorers, Outlaws of Stirwood Forest, Pirates, Pit Fighters, Skaven Pestilens, Tileans, Tomb Guardians.

**Grade 1c (15):** Synced from Uncle-Mel's `warbandFiles/1c/` folder. Subfactions (e.g. Mercenaries → Reikland/Middenheim/Marienburg) are expanded into separate selectable entries at load time.

## Scraping mordheimer.net

mordheimer.net is a Docusaurus SPA — direct URL fetches via `WebFetch` return 404. Must navigate via Chrome browser MCP tools: load any page first, then use SPA internal routing (`document.querySelector('a[href="..."]').click()`) to navigate between pages. The Magic section (`/docs/magic/`) has dedicated pages for each spell list. Warband pages are at `/docs/warbands/grade-{grade}-warbands/{warband-slug}`.
