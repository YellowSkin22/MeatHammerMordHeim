# Post-Game Sequence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a guided post-game wizard (Pro tier) that walks the player through injuries, advancements, exploration, wyrdstone selling, hired sword upkeep, and trading post rolls after each battle.

**Architecture:** A single `PostgameWizard` object in a new `js/postgame.js` file manages wizard state (current step, choices made, undo stack). `UI` calls `PostgameWizard.open(roster)` and the wizard renders into a reusable full-screen modal (`#postgame-modal`). Each step is a pure render function; state mutations happen only when the player confirms a step. Dice animations are self-contained CSS keyframe animations triggered by JS. All game-rule tables (injuries, advancements, income, exploration) live in `data/postgame.json`.

**Tech Stack:** Vanilla JS, CSS keyframe animations for dice, existing `UI.esc/escAttr/toast`, `RosterModel` mutation helpers, `Storage.saveRoster`, `Cloud.canAccess`.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `data/postgame.json` | Create | Income table, exploration chart summary, henchman availability table, trading post table |
| `js/postgame.js` | Create | `PostgameWizard` object — all wizard logic and rendering |
| `index.html` | Modify | Add `#postgame-modal` HTML skeleton, load `postgame.js`, add "Start Postgame Sequence" button in progress tab |
| `js/ui.js` | Modify | Add `openPostgameWizard()` entry point, bump script cache version |
| `css/style.css` | Modify | Dice animation styles, wizard step bar, postgame modal layout |
| `data/version.json` | Modify | Bump version to force cache refresh |

---

## Task 1: Data file and feature gate

**Files:**
- Create: `data/postgame.json`
- Modify: `js/cloud.js` (add `postgame_sequence` feature tier)
- Modify: `data/version.json`

- [ ] **Step 1: Create `data/postgame.json`**

```json
{
  "incomeTable": [
    { "warband": 3,  "gc": 2 },
    { "warband": 4,  "gc": 3 },
    { "warband": 5,  "gc": 4 },
    { "warband": 6,  "gc": 6 },
    { "warband": 7,  "gc": 8 },
    { "warband": 8,  "gc": 10 },
    { "warband": 9,  "gc": 12 },
    { "warband": 10, "gc": 14 },
    { "warband": 11, "gc": 16 },
    { "warband": 12, "gc": 18 },
    { "warband": 13, "gc": 20 },
    { "warband": 14, "gc": 22 },
    { "warband": 15, "gc": 24 }
  ],
  "henchmenAvailabilityTable": [
    { "roll": "2",   "result": "D3 henchmen of any type already in warband" },
    { "roll": "3",   "result": "1 henchman of any type already in warband" },
    { "roll": "4-5", "result": "D3 of the cheapest henchman type available" },
    { "roll": "6",   "result": "1 henchman of any type in the warband list" },
    { "roll": "7-8", "result": "D3 henchmen of any type in the warband list" },
    { "roll": "9",   "result": "D6 of the cheapest henchman type available" },
    { "roll": "10-11","result": "D6 henchmen of any type in the warband list" },
    { "roll": "12",  "result": "2D6 of the cheapest henchman type available" }
  ],
  "tradingPostTable": [
    { "roll": "2",   "item": "Wyrdstone Pendulum", "cost": 30 },
    { "roll": "3",   "item": "Daemonic Rune", "cost": 30 },
    { "roll": "4",   "item": "Lucky Charm", "cost": 10 },
    { "roll": "5",   "item": "Sword", "cost": 10 },
    { "roll": "6",   "item": "Mace/Hammer", "cost": 3 },
    { "roll": "7",   "item": "Dagger", "cost": 2 },
    { "roll": "8",   "item": "Axe", "cost": 5 },
    { "roll": "9",   "item": "Spear", "cost": 10 },
    { "roll": "10",  "item": "Shield", "cost": 5 },
    { "roll": "11",  "item": "Helmet", "cost": 10 },
    { "roll": "12",  "item": "Light Armour", "cost": 20 }
  ]
}
```

- [ ] **Step 2: Add `postgame_sequence` to `FEATURE_TIERS` in `js/cloud.js`**

In `js/cloud.js`, find the `FEATURE_TIERS` block and add:
```js
postgame_sequence: 'pro',
```

- [ ] **Step 3: Bump `data/version.json`**

```json
{ "version": 2 }
```

- [ ] **Step 4: Commit**

```bash
git add data/postgame.json js/cloud.js data/version.json
git commit -m "feat: add postgame data file and feature gate"
```

---

## Task 2: Modal HTML skeleton and CSS

**Files:**
- Modify: `index.html`
- Modify: `css/style.css`

- [ ] **Step 1: Add `#postgame-modal` to `index.html`**

In `index.html`, just before the closing `</body>` tag, add:

```html
<!-- Post-Game Sequence Wizard Modal -->
<div id="postgame-modal" class="modal-overlay" style="display:none;" role="dialog" aria-modal="true" aria-labelledby="postgame-modal-title">
  <div class="modal-box postgame-modal-box">
    <div class="postgame-header">
      <h2 id="postgame-modal-title" class="postgame-title">Post-Game Sequence</h2>
      <button class="modal-close-btn" onclick="PostgameWizard.close()" aria-label="Close">&times;</button>
    </div>
    <div class="postgame-progress-bar" id="postgame-progress-bar">
      <!-- Step indicators rendered by JS -->
    </div>
    <div class="postgame-body" id="postgame-body">
      <!-- Step content rendered by JS -->
    </div>
    <div class="postgame-footer" id="postgame-footer">
      <!-- Navigation buttons rendered by JS -->
    </div>
  </div>
</div>
```

- [ ] **Step 2: Add dice animation and wizard styles to `css/style.css`**

Append to the end of `css/style.css` (before the final dark mode overrides):

```css
/* ===== POST-GAME WIZARD ===== */
.postgame-modal-box {
  width: min(96vw, 680px);
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  padding: 0;
  overflow: hidden;
}
.postgame-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem 0.75rem;
  border-bottom: 1px solid var(--border);
}
.postgame-title {
  margin: 0;
  font-size: 1.1rem;
}
.postgame-progress-bar {
  display: flex;
  gap: 0;
  padding: 0.5rem 1.25rem;
  background: var(--bg-dark);
  border-bottom: 1px solid var(--border);
  overflow-x: auto;
}
.postgame-step-indicator {
  flex: 1;
  min-width: 60px;
  text-align: center;
  font-size: 0.65rem;
  color: var(--text-dim);
  position: relative;
  padding-bottom: 0.4rem;
}
.postgame-step-indicator::after {
  content: '';
  display: block;
  height: 3px;
  background: var(--border);
  margin-top: 0.25rem;
  border-radius: 2px;
}
.postgame-step-indicator.is-done::after  { background: var(--primary); }
.postgame-step-indicator.is-active { color: var(--primary); font-weight: 700; }
.postgame-step-indicator.is-active::after { background: var(--primary); }
.postgame-body {
  flex: 1;
  overflow-y: auto;
  padding: 1rem 1.25rem;
}
.postgame-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 0.75rem 1.25rem;
  border-top: 1px solid var(--border);
  background: var(--bg-dark);
}

/* Dice */
.dice-tray {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  justify-content: center;
  margin: 1rem 0;
}
.die {
  width: 52px;
  height: 52px;
  border: 2px solid var(--primary);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.4rem;
  font-weight: 700;
  background: var(--bg-card);
  cursor: pointer;
  user-select: none;
  transition: transform 0.1s, box-shadow 0.1s;
}
.die:hover { transform: scale(1.06); box-shadow: 0 2px 8px rgba(0,0,0,0.25); }
.die.is-rolling { animation: diceRoll 0.5s ease-out; }
.die.is-locked { border-color: var(--success, #4caf50); opacity: 0.7; }
@keyframes diceRoll {
  0%   { transform: rotate(0deg) scale(1); }
  25%  { transform: rotate(-15deg) scale(1.1); }
  50%  { transform: rotate(12deg) scale(0.95); }
  75%  { transform: rotate(-8deg) scale(1.05); }
  100% { transform: rotate(0deg) scale(1); }
}

/* Warrior checklist */
.postgame-warrior-list { list-style: none; padding: 0; margin: 0; }
.postgame-warrior-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--border);
}
.postgame-warrior-item:last-child { border-bottom: none; }
.postgame-warrior-item label { flex: 1; cursor: pointer; }
.postgame-advancement-result {
  background: var(--bg-dark);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.75rem 1rem;
  margin-top: 0.5rem;
}
```

- [ ] **Step 3: Add "Start Postgame Sequence" button in `index.html` progress tab**

Find the battle log section header in `index.html` (look for `id="battle-log-entries"`) and add the button just above the `<!-- BATTLE LOG -->` section comment or at the top of the progress-tab content:

```html
<div id="postgame-btn-container" style="margin-bottom:1rem;">
  <button class="btn btn-primary" id="btn-start-postgame" onclick="UI.openPostgameWizard()">
    &#9876; Start Post-Game Sequence
  </button>
</div>
```

- [ ] **Step 4: Load `postgame.js` in `index.html`**

After the `<script src="js/ui.js?v=41">` tag, add:
```html
<script src="js/postgame.js?v=1"></script>
```

- [ ] **Step 5: Commit**

```bash
git add index.html css/style.css
git commit -m "feat: add postgame modal skeleton, dice animation CSS, and trigger button"
```

---

## Task 3: PostgameWizard core (state machine + step 1 — Out of Action)

**Files:**
- Create: `js/postgame.js`

The wizard holds state in `PostgameWizard._state`, which is a plain object that is reset on each `open()` call. Steps are numbered 1–7. Navigation calls `_renderStep(n)`.

- [ ] **Step 1: Create `js/postgame.js` with core structure and Step 1**

```js
// Post-Game Sequence Wizard
// Guides the player through injuries, advancements, exploration, wyrdstone,
// hired sword upkeep, henchman availability, and trading post rolls.
const PostgameWizard = {
  _state: null,

  STEPS: [
    'Out of Action',
    'Injuries',
    'Advancements',
    'Exploration',
    'Hired Swords',
    'Henchmen',
    'Trading Post',
  ],

  open(roster) {
    this._state = {
      roster,
      outOfAction: [],      // warrior objects taken OOA
      injuryResults: [],    // [{ warrior, rolls, injuries }]
      advancementResults: [],// [{ warrior, rolls, result }]
      explorationDice: [],  // final die values
      wyrdstoneEarned: 0,
      undoStack: [],        // [snapshot of roster state as JSON string]
    };
    document.getElementById('postgame-modal').style.display = '';
    this._renderStep(1);
  },

  close() {
    document.getElementById('postgame-modal').style.display = 'none';
    this._state = null;
  },

  _pushUndo() {
    const r = this._state.roster;
    this._state.undoStack.push(JSON.stringify({
      gold: r.gold, wyrdstone: r.wyrdstone,
      heroes: r.heroes, henchmen: r.henchmen, hiredSwords: r.hiredSwords,
      treasuryLog: r.treasuryLog,
    }));
  },

  _undo() {
    if (!this._state.undoStack.length) return;
    const snapshot = JSON.parse(this._state.undoStack.pop());
    const r = this._state.roster;
    Object.assign(r, snapshot);
    Storage.saveRoster(r);
    UI.renderRosterEditor();
    UI.toast('Undone.', 'info');
  },

  // ── Rendering ──────────────────────────────────────────────────────────────

  _renderProgressBar(activeStep) {
    const bar = document.getElementById('postgame-progress-bar');
    bar.innerHTML = this.STEPS.map((label, i) => {
      const n = i + 1;
      let cls = 'postgame-step-indicator';
      if (n < activeStep) cls += ' is-done';
      if (n === activeStep) cls += ' is-active';
      return `<div class="${cls}">${n}. ${UI.esc(label)}</div>`;
    }).join('');
  },

  _setFooter(html) {
    document.getElementById('postgame-footer').innerHTML = html;
  },

  _setBody(html) {
    document.getElementById('postgame-body').innerHTML = html;
  },

  _renderStep(n) {
    this._renderProgressBar(n);
    switch (n) {
      case 1: this._renderStep1(); break;
      case 2: this._renderStep2(); break;
      case 3: this._renderStep3(); break;
      case 4: this._renderStep4(); break;
      case 5: this._renderStep5(); break;
      case 6: this._renderStep6(); break;
      case 7: this._renderStep7(); break;
    }
  },

  // ── Step 1: Out of Action ─────────────────────────────────────────────────

  _renderStep1() {
    const r = this._state.roster;
    // Expand henchmen groups into one entry per model so each model
    // can be independently checked as OOA (a group of 3 can have 2 OOA).
    const allWarriors = [
      ...r.heroes.map(w => ({ w, listType: 'heroes', modelIndex: null })),
      ...(r.hiredSwords || []).map(w => ({ w, listType: 'hiredSwords', modelIndex: null })),
      ...r.henchmen.flatMap(w =>
        Array.from({ length: w.groupSize || 1 }, (_, mi) => ({ w, listType: 'henchmen', modelIndex: mi }))
      ),
    ];
    this._setBody(`
      <p>Check the warriors who were <strong>taken out of action</strong> this battle.
         Henchmen groups are listed per individual model.</p>
      <ul class="postgame-warrior-list" id="ooa-list">
        ${allWarriors.map(({ w, listType, modelIndex }, i) => {
          const isHenchman = listType === 'henchmen';
          const modelLabel = isHenchman ? `${UI.esc(w.typeName)} #${modelIndex + 1}` : UI.esc(w.name);
          const subLabel = isHenchman ? `<span class="text-dim">(Henchman · ${w.experience} XP)</span>` : `<span class="text-dim">(${UI.esc(w.typeName)})</span>`;
          return `<li class="postgame-warrior-item">
            <input type="checkbox" id="ooa-${i}" data-idx="${i}">
            <label for="ooa-${i}">${modelLabel} ${subLabel}</label>
          </li>`;
        }).join('')}
      </ul>
      <p class="text-dim" style="margin-top:0.75rem; font-size:0.82rem;">
        Heroes not taken out of action contribute exploration dice in Step 4.
      </p>
    `);
    this._setFooter(`
      <button class="btn btn-secondary" onclick="PostgameWizard.close()">Cancel</button>
      <button class="btn btn-primary" onclick="PostgameWizard._confirmStep1()">Next &rsaquo;</button>
    `);
  },

  _confirmStep1() {
    const r = this._state.roster;
    const allWarriors = [
      ...r.heroes.map(w => ({ w, listType: 'heroes', modelIndex: null })),
      ...(r.hiredSwords || []).map(w => ({ w, listType: 'hiredSwords', modelIndex: null })),
      ...r.henchmen.flatMap(w =>
        Array.from({ length: w.groupSize || 1 }, (_, mi) => ({ w, listType: 'henchmen', modelIndex: mi }))
      ),
    ];
    const checked = [...document.querySelectorAll('#ooa-list input:checked')].map(el => {
      return allWarriors[parseInt(el.dataset.idx)];
    });
    this._state.outOfAction = checked;
    this._renderStep(2);
  },
};
```

- [ ] **Step 2: Verify the modal opens and Step 1 renders (manual test)**

Open the app, navigate to the Progress tab, click "Start Post-Game Sequence". Verify:
- Modal appears with progress bar showing Step 1 active
- All warriors from heroes/henchmen/hiredSwords appear as checkboxes
- "Next" button advances (may not render Step 2 yet — that's OK for this task)

- [ ] **Step 3: Commit**

```bash
git add js/postgame.js
git commit -m "feat: postgame wizard core — step 1 out-of-action checklist"
```

---

## Task 4: Step 2 — Injury rolls

**Files:**
- Modify: `js/postgame.js`

Injury rules from `data/injuries.json`: heroes roll 2D6 on `heroInjuries` table; henchmen roll 1D6 on `henchmenInjuries` table. "Multiple Injuries" (roll 16-21) means roll D6 more times on the serious injury table.

Dice are shown as animated tiles. Player clicks "Roll for me" per warrior OR enters manually. Player must confirm before the injury is applied. Applying "Dead" removes the warrior. Applying "Misses Next Game" sets `warrior.missNextGame = true`. Stat-reducing injuries (Leg Wound, Arm Wound etc.) call `RosterModel.modifyStat()`.

- [ ] **Step 1: Add `_renderStep2()` to `PostgameWizard`**

Add inside the `PostgameWizard` object after `_confirmStep1`:

```js
// ── Step 2: Injuries ──────────────────────────────────────────────────────

_renderStep2() {
  const ooa = this._state.outOfAction;
  if (ooa.length === 0) {
    this._setBody('<p>No warriors were taken out of action — skip to advancements.</p>');
    this._setFooter(`
      <button class="btn btn-secondary" onclick="PostgameWizard._renderStep(1)">&lsaquo; Back</button>
      <button class="btn btn-primary" onclick="PostgameWizard._renderStep(3)">Next &rsaquo;</button>
    `);
    return;
  }

  // Build per-warrior injury panels, cycling through each OOA warrior
  this._state._injuryIdx = this._state._injuryIdx ?? 0;
  const idx = this._state._injuryIdx;
  if (idx >= ooa.length) {
    this._renderStep(3);
    return;
  }
  const { w, listType } = ooa[idx];
  const isHero = listType === 'heroes' || listType === 'hiredSwords' || listType === 'customWarriors';
  const diceCount = isHero ? 2 : 1;
  const dice = this._state._injuryDice || Array(diceCount).fill(null);

  this._setBody(`
    <p><strong>${UI.esc(w.name)}</strong> was taken out of action.
    Roll ${isHero ? '2D6 on the hero injury table' : '1D6 on the henchman injury table'}.</p>
    <div class="dice-tray" id="injury-dice-tray">
      ${dice.map((v, i) => `
        <div class="die${v === null ? '' : ''}" id="injury-die-${i}" onclick="PostgameWizard._rerollInjuryDie(${i})">
          ${v === null ? '?' : v}
        </div>
      `).join('')}
    </div>
    <div id="injury-result-display"></div>
    <p class="text-dim" style="font-size:0.8rem; margin-top:0.5rem;">Click a die to reroll it. Click "Roll All" to roll all dice.</p>
  `);

  this._setFooter(`
    <button class="btn btn-secondary" onclick="PostgameWizard._renderStep(1)">&lsaquo; Back</button>
    <button class="btn btn-secondary" onclick="PostgameWizard._rollAllInjuryDice()">&#127922; Roll All</button>
    ${dice.every(v => v !== null) ? `<button class="btn btn-primary" onclick="PostgameWizard._confirmInjury()">Apply &amp; Next &rsaquo;</button>` : ''}
  `);
},

_rollAllInjuryDice() {
  const ooa = this._state.outOfAction;
  const { w, listType } = ooa[this._state._injuryIdx];
  const isHero = listType === 'heroes' || listType === 'hiredSwords' || listType === 'customWarriors';
  const count = isHero ? 2 : 1;
  this._state._injuryDice = Array.from({ length: count }, () => Math.floor(Math.random() * 6) + 1);
  this._animateDice('injury-dice-tray', this._state._injuryDice, () => this._renderStep2());
},

_rerollInjuryDie(i) {
  if (!this._state._injuryDice) this._state._injuryDice = [null, null];
  this._state._injuryDice[i] = Math.floor(Math.random() * 6) + 1;
  this._animateDice('injury-dice-tray', this._state._injuryDice, () => this._renderStep2());
},

_animateDice(trayId, values, callback) {
  const tray = document.getElementById(trayId);
  if (!tray) { callback(); return; }
  tray.querySelectorAll('.die').forEach((el, i) => {
    el.classList.add('is-rolling');
    el.textContent = values[i] ?? '?';
  });
  setTimeout(() => {
    tray.querySelectorAll('.die').forEach(el => el.classList.remove('is-rolling'));
    callback();
  }, 550);
},

_resolveInjuryRoll(dice, isHero) {
  const injuries = DataService.injuries;
  const total = dice.reduce((a, b) => a + b, 0);
  const table = isHero ? injuries.heroInjuries : injuries.henchmenInjuries;
  for (const row of table) {
    const range = row.roll.toString();
    if (range.includes('-')) {
      const [lo, hi] = range.split('-').map(Number);
      if (total >= lo && total <= hi) return row;
    } else if (parseInt(range) === total) {
      return row;
    }
  }
  return null;
},

_confirmInjury() {
  const ooa = this._state.outOfAction;
  const idx = this._state._injuryIdx;
  const { w, listType } = ooa[idx];
  const isHero = listType === 'heroes' || listType === 'hiredSwords' || listType === 'customWarriors';
  const dice = this._state._injuryDice;
  const total = dice.reduce((a, b) => a + b, 0);
  const row = this._resolveInjuryRoll(dice, isHero);
  if (!row) { UI.toast('Could not resolve injury roll.', 'error'); return; }

  this._pushUndo();
  this._applyInjury(w, listType, row, total, isHero);
  Storage.saveRoster(this._state.roster);
  UI.renderRosterEditor();

  this._state.injuryResults.push({ warrior: w, dice, injury: row });
  this._state._injuryIdx = idx + 1;
  this._state._injuryDice = null;
  this._renderStep2();
},

_applyInjury(w, listType, row, total, isHero) {
  const r = this._state.roster;
  switch (row.name) {
    case 'Dead':
      if (listType === 'henchmen') {
        // Reduce group size by 1; remove group only when it reaches 0
        w.groupSize = (w.groupSize || 1) - 1;
        if (w.groupSize <= 0) r.henchmen.splice(r.henchmen.indexOf(w), 1);
        UI.toast(`${w.typeName} #${(w.groupSize || 0) + 1} died.`, 'error');
      } else {
        // Heroes and hired swords: mark dead, keep in roster so player can see
        // and choose when to replace. Dead heroes do NOT count toward hero cap,
        // warband rating, or member count.
        w.isDead = true;
        w.missNextGame = false; // irrelevant now
        UI.toast(`${w.name} is dead.`, 'error');
      }
      break;
    case 'Full Recovery':
      // Nothing to apply
      break;
    case 'Misses Next Game':
    case 'Deep Wound':
      w.missNextGame = true;
      RosterModel.addInjury(w, row.name);
      break;
    case 'Leg Wound':
    case 'Smashed Leg':
      RosterModel.modifyStat(w, 'm', -1);
      RosterModel.addInjury(w, row.name);
      break;
    case 'Arm Wound':
    case 'Hand Injury':
      RosterModel.modifyStat(w, 'ws', -1);
      RosterModel.addInjury(w, row.name);
      break;
    case 'Chest Wound':
      RosterModel.modifyStat(w, 't', -1);
      RosterModel.addInjury(w, row.name);
      break;
    case 'Blinded in One Eye':
      RosterModel.modifyStat(w, 'bs', -1);
      RosterModel.addInjury(w, row.name);
      break;
    case 'Nervous Condition':
      RosterModel.modifyStat(w, 'i', -1);
      RosterModel.addInjury(w, row.name);
      break;
    case 'Sold to the Pits':
      RosterModel.addExperience(w, Math.floor(Math.random() * 6) + 1);
      RosterModel.addInjury(w, row.name);
      break;
    case 'Survives Against the Odds':
      RosterModel.addExperience(w, 1);
      break;
    case 'Robbed':
      w.equipment = [];
      RosterModel.addInjury(w, row.name);
      break;
    default:
      RosterModel.addInjury(w, row.name);
      break;
  }
},
```

- [ ] **Step 2: Verify Step 2 manually**

Open the wizard, check one hero OOA, click Next. Verify:
- Hero injury panel appears with 2 animated dice tiles
- "Roll All" triggers animation and shows result
- Clicking a die rerolls just that die
- "Apply & Next" cycles to the next OOA warrior, then advances to Step 3

- [ ] **Step 3: Commit**

```bash
git add js/postgame.js
git commit -m "feat: postgame step 2 — injury rolls with dice animation and apply"
```

---

## Task 5: Step 3 — Advancements

**Files:**
- Modify: `js/postgame.js`

Rules from `data/advancement.json`: heroes roll 2D6 on `heroAdvancement.advanceRoll`; henchmen roll 2D6 on `henchmenAdvancement.advanceRoll`. A warrior only rolls if they have enough XP for their next threshold. "Roll Again (Two Stats)" means roll twice and apply both (not the same result twice). If the result is "New Skill", show the skill picker immediately. Max stat check via `DataService.getMaxStat()` blocks over-max stat grants. Player can reroll once by clicking a die.

- [ ] **Step 1: Add `_renderStep3()` and helpers**

Add inside `PostgameWizard` after the Step 2 methods:

```js
// ── Step 3: Advancements ──────────────────────────────────────────────────

_renderStep3() {
  const r = this._state.roster;
  // Collect warriors who have crossed a new threshold since last advancementCount
  // (advancement is triggered if level > advancementCount — simplified: show all)
  const eligible = [
    ...r.heroes.map(w => ({ w, listType: 'heroes' })),
    ...(r.hiredSwords || []).map(w => ({ w, listType: 'hiredSwords' })),
    ...r.henchmen.map(w => ({ w, listType: 'henchmen' })),
  ].filter(({ w, listType }) => {
    const isHero = listType !== 'henchmen';
    const level = isHero
      ? RosterModel.getHeroLevel(w.experience)
      : RosterModel.getHenchmanLevel(w.experience);
    return level > (w.advancementCount || 0);
  });

  this._state._advIdx = this._state._advIdx ?? 0;
  const idx = this._state._advIdx;
  if (idx >= eligible.length) {
    this._setBody(eligible.length === 0
      ? '<p>No warriors are due for an advancement roll.</p>'
      : '<p>All advancements processed.</p>');
    this._setFooter(`
      <button class="btn btn-secondary" onclick="PostgameWizard._renderStep(2)">&lsaquo; Back</button>
      <button class="btn btn-primary" onclick="PostgameWizard._renderStep(4)">Next &rsaquo;</button>
    `);
    return;
  }

  const { w, listType } = eligible[idx];
  const isHero = listType !== 'henchmen';
  const dice = this._state._advDice || [null, null];
  const total = dice.every(v => v !== null) ? dice[0] + dice[1] : null;
  const advRow = total !== null ? this._resolveAdvancementRoll(total, isHero, w) : null;

  this._setBody(`
    <p><strong>${UI.esc(w.name)}</strong> is due for an advancement (${w.experience} XP).
    Roll 2D6 on the ${isHero ? 'hero' : 'henchman'} advancement table.</p>
    <div class="dice-tray" id="adv-dice-tray">
      ${dice.map((v, i) => `<div class="die" id="adv-die-${i}" onclick="PostgameWizard._rerollAdvDie(${i})">${v === null ? '?' : v}</div>`).join('')}
    </div>
    ${advRow ? `
      <div class="postgame-advancement-result">
        <strong>${UI.esc(advRow.name)}</strong>
        <p style="margin:0.25rem 0 0; font-size:0.85rem;">${UI.esc(advRow.description)}</p>
        ${advRow.name === 'New Skill' ? this._renderSkillPicker(w) : ''}
      </div>
    ` : ''}
  `);

  this._setFooter(`
    <button class="btn btn-secondary" onclick="PostgameWizard._renderStep(2)">&lsaquo; Back</button>
    <button class="btn btn-secondary" onclick="PostgameWizard._rollAllAdvDice()">&#127922; Roll All</button>
    ${advRow ? `<button class="btn btn-primary" onclick="PostgameWizard._confirmAdvancement()">Apply &amp; Next &rsaquo;</button>` : ''}
  `);
},

_rollAllAdvDice() {
  this._state._advDice = [Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1];
  this._animateDice('adv-dice-tray', this._state._advDice, () => this._renderStep3());
},

_rerollAdvDie(i) {
  if (!this._state._advDice) this._state._advDice = [null, null];
  this._state._advDice[i] = Math.floor(Math.random() * 6) + 1;
  this._animateDice('adv-dice-tray', this._state._advDice, () => this._renderStep3());
},

_resolveAdvancementRoll(total, isHero, w) {
  const table = isHero
    ? DataService.advancement.heroAdvancement.advanceRoll
    : DataService.advancement.henchmenAdvancement.advanceRoll;
  for (const [range, row] of Object.entries(table)) {
    if (range.includes('-')) {
      const [lo, hi] = range.split('-').map(Number);
      if (total >= lo && total <= hi) return row;
    } else if (parseInt(range) === total) {
      return row;
    }
  }
  return null;
},

_renderSkillPicker(w) {
  if (!w.skillAccess || !w.skillAccess.length) return '<p class="text-dim">No skill access defined.</p>';
  const sections = w.skillAccess.map(subtype => {
    const skills = DataService.getSkillsBySubtype(subtype, null)
      .filter(s => !w.skills.find(es => es.id === DataService.slugify(s.name)));
    if (!skills.length) return '';
    return `<optgroup label="${UI.escAttr(subtype)}">
      ${skills.map(s => `<option value="${UI.escAttr(DataService.slugify(s.name))}">${UI.esc(s.name)}</option>`).join('')}
    </optgroup>`;
  }).join('');
  return `<div style="margin-top:0.5rem;">
    <label>Select skill:</label>
    <select id="adv-skill-select" class="form-control" style="margin-top:0.25rem;">${sections}</select>
  </div>`;
},

_confirmAdvancement() {
  const r = this._state.roster;
  const eligible = [
    ...r.heroes.map(w => ({ w, listType: 'heroes' })),
    ...(r.hiredSwords || []).map(w => ({ w, listType: 'hiredSwords' })),
    ...r.henchmen.map(w => ({ w, listType: 'henchmen' })),
  ].filter(({ w, listType }) => {
    const isHero = listType !== 'henchmen';
    const level = isHero ? RosterModel.getHeroLevel(w.experience) : RosterModel.getHenchmanLevel(w.experience);
    return level > (w.advancementCount || 0);
  });

  const idx = this._state._advIdx;
  const { w, listType } = eligible[idx];
  const isHero = listType !== 'henchmen';
  const dice = this._state._advDice;
  const total = dice[0] + dice[1];
  const advRow = this._resolveAdvancementRoll(total, isHero, w);
  if (!advRow) return;

  this._pushUndo();

  if (advRow.name === 'New Skill') {
    const sel = document.getElementById('adv-skill-select');
    if (sel && sel.value) RosterModel.addSkill(w, sel.value);
  } else if (advRow.name === 'Roll Again (Two Stats)') {
    // Roll twice more — recurse into a sub-roll (simplified: apply both in sequence)
    UI.toast('Roll Again: roll twice more on the table and apply each result.', 'info');
  } else {
    // Apply stat boost
    const statMap = {
      '+1 Strength': ['s', 1], '+1 Attack': ['a', 1], '+1 BS': ['bs', 1],
      '+1 WS': ['ws', 1], '+1 Initiative': ['i', 1], '+1 Leadership': ['ld', 1],
      '+1 Wound': ['w', 1],
    };
    const [stat, delta] = statMap[advRow.name] || [null, 0];
    if (stat) {
      const applied = RosterModel.modifyStat(w, stat, delta);
      if (!applied) UI.toast(`${w.name} is already at max ${stat.toUpperCase()}.`, 'warning');
    }
  }

  w.advancementCount = (w.advancementCount || 0) + 1;
  Storage.saveRoster(r);
  UI.renderRosterEditor();

  this._state.advancementResults.push({ warrior: w, dice, result: advRow });
  this._state._advIdx = idx + 1;
  this._state._advDice = null;
  this._renderStep3();
},
```

- [ ] **Step 2: Verify Step 3 manually**

Artificially give a hero enough XP to trigger advancement in the JSON (edit localStorage). Open wizard, reach Step 3. Verify:
- Warrior name and XP shown
- Dice animate
- Result label appears after roll
- If "New Skill", dropdown appears with available skills
- "Apply & Next" applies the advancement and shows next warrior

- [ ] **Step 3: Commit**

```bash
git add js/postgame.js
git commit -m "feat: postgame step 3 — advancement rolls with skill picker"
```

---

## Task 6: Step 4 — Exploration

**Files:**
- Modify: `js/postgame.js`
- Modify: `data/postgame.json` (no changes needed — income table already there)

Rules: Only heroes not taken out of action contribute an exploration die each. +1 die for winning the scenario. Player may add extra dice manually. Player can lock dice (keep) and reroll the rest. Final result: sum all dice; identify highest number of doubles (or triples). Confirm result. Add wyrdstone shards to `roster.wyrdstone` via treasury log. Then show income table: compute warband size excluding hired swords + dramatis personae (warriors with `isHiredSword: true`), look up GC from `postgame.incomeTable`, offer to sell all wyrdstone at that rate.

- [ ] **Step 1: Add `_renderStep4()` and helpers**

Add inside `PostgameWizard` after Step 3 methods:

```js
// ── Step 4: Exploration ───────────────────────────────────────────────────

_renderStep4() {
  const r = this._state.roster;
  const ooa = this._state.outOfAction.map(e => e.w);
  const activeHeroes = r.heroes.filter(h => !ooa.includes(h));
  const baseDiceCount = activeHeroes.length;

  if (!this._state._exploreSetup) {
    this._state._exploreSetup = {
      extraDice: 0,
      wonScenario: false,
      dice: null,        // array of { value, locked }
      confirmed: false,
    };
  }
  const setup = this._state._exploreSetup;
  const totalDice = baseDiceCount + (setup.wonScenario ? 1 : 0) + setup.extraDice;

  const diceHtml = setup.dice
    ? setup.dice.map((d, i) => `
        <div class="die${d.locked ? ' is-locked' : ''}" onclick="PostgameWizard._toggleExploreLock(${i})" title="${d.locked ? 'Locked — click to unlock' : 'Click to lock'}">
          ${d.value}
        </div>`).join('')
    : Array(totalDice).fill(0).map((_, i) => `<div class="die" id="ed-${i}">?</div>`).join('');

  const doublesInfo = setup.dice ? this._analyzeExploreDice(setup.dice.map(d => d.value)) : null;

  this._setBody(`
    <p><strong>Exploration</strong> — ${activeHeroes.length} active hero(es) = ${baseDiceCount} base dice.</p>
    <div style="display:flex; gap:1rem; align-items:center; flex-wrap:wrap; margin-bottom:0.75rem;">
      <label><input type="checkbox" id="explore-won" ${setup.wonScenario ? 'checked' : ''}
        onchange="PostgameWizard._toggleWon()"> Won the scenario (+1 die)</label>
      <label>Extra dice:
        <input type="number" id="explore-extra" value="${setup.extraDice}" min="0" max="10" style="width:50px; margin-left:0.25rem;"
          onchange="PostgameWizard._setExtraDice(this.value)">
      </label>
    </div>
    <p class="text-dim" style="font-size:0.8rem;">Total dice: <strong>${totalDice}</strong>.
      Click a die after rolling to lock/unlock it for rerolling.</p>
    <div class="dice-tray" id="explore-dice-tray">${diceHtml}</div>
    ${doublesInfo ? `<div class="postgame-advancement-result">
      <strong>Total: ${doublesInfo.total}</strong>
      ${doublesInfo.triples.length ? `<br>Triples: ${doublesInfo.triples.join(', ')}` : ''}
      ${doublesInfo.doubles.length ? `<br>Doubles: ${doublesInfo.doubles.join(', ')}` : ''}
    </div>` : ''}
  `);

  this._setFooter(`
    <button class="btn btn-secondary" onclick="PostgameWizard._renderStep(3)">&lsaquo; Back</button>
    <button class="btn btn-secondary" onclick="PostgameWizard._rollExploreDice()">&#127922; Roll Unlocked</button>
    ${doublesInfo ? `<button class="btn btn-primary" onclick="PostgameWizard._confirmExploration()">Confirm Exploration &rsaquo;</button>` : ''}
  `);
},

_toggleWon() {
  this._state._exploreSetup.wonScenario = document.getElementById('explore-won').checked;
  this._state._exploreSetup.dice = null;
  this._renderStep4();
},

_setExtraDice(val) {
  this._state._exploreSetup.extraDice = Math.max(0, parseInt(val) || 0);
  this._state._exploreSetup.dice = null;
  this._renderStep4();
},

_toggleExploreLock(i) {
  const dice = this._state._exploreSetup.dice;
  if (!dice || dice[i].value === null) return;
  dice[i].locked = !dice[i].locked;
  this._renderStep4();
},

_rollExploreDice() {
  const setup = this._state._exploreSetup;
  const r = this._state.roster;
  const ooa = this._state.outOfAction.map(e => e.w);
  const total = r.heroes.filter(h => !ooa.includes(h)).length
    + (setup.wonScenario ? 1 : 0) + setup.extraDice;

  if (!setup.dice) {
    setup.dice = Array(total).fill(0).map(() => ({ value: null, locked: false }));
  }
  setup.dice.forEach(d => { if (!d.locked) d.value = Math.floor(Math.random() * 6) + 1; });
  const vals = setup.dice.map(d => d.value);
  this._animateDice('explore-dice-tray', vals, () => this._renderStep4());
},

_analyzeExploreDice(values) {
  const counts = {};
  for (const v of values) counts[v] = (counts[v] || 0) + 1;
  const doubles = Object.entries(counts).filter(([, c]) => c === 2).map(([v]) => parseInt(v));
  const triples = Object.entries(counts).filter(([, c]) => c >= 3).map(([v]) => parseInt(v));
  return { total: values.reduce((a, b) => a + b, 0), doubles, triples };
},

_confirmExploration() {
  const setup = this._state._exploreSetup;
  const values = setup.dice.map(d => d.value);
  const { total, doubles, triples } = this._analyzeExploreDice(values);

  // Wyrdstone shards = total (standard Mordheim rule)
  const shards = total;
  this._state.wyrdstoneEarned = shards;

  this._pushUndo();
  const r = this._state.roster;
  r.wyrdstone = (r.wyrdstone || 0) + shards;
  r.treasuryLog = r.treasuryLog || [];
  r.treasuryLog.push({
    id: Storage.generateId(),
    type: 'income',
    description: `Exploration: found ${shards} wyrdstone shard${shards !== 1 ? 's' : ''}`,
    gold: 0,
    wyrdstone: shards,
    applied: true,
    date: new Date().toISOString(),
    actualGoldDelta: 0,
    actualWyrdstoneDelta: shards,
  });

  // Show sell prompt
  this._renderStep4Sell(shards, doubles, triples);
},

_renderStep4Sell(shards, doubles, triples) {
  const r = this._state.roster;
  // Warband size for income table: exclude hired swords and dramatis personae
  const regularMembers = RosterModel.getMemberCount(r) - (r.hiredSwords || []).length;
  const capped = Math.min(Math.max(regularMembers, 3), 15);
  const postgameData = DataService._postgameData;
  const incomeRow = postgameData?.incomeTable?.find(row => row.warband === capped)
    || postgameData?.incomeTable?.[postgameData.incomeTable.length - 1];
  const gcPerShard = incomeRow ? Math.round(incomeRow.gc / capped) : 2;

  this._setBody(`
    <p>Found <strong>${shards} wyrdstone shard${shards !== 1 ? 's' : ''}</strong>.</p>
    ${doubles.length || triples.length ? `<p class="text-dim">Exploration results:
      ${triples.length ? `Triples on <strong>${triples.join(', ')}</strong>` : ''}
      ${doubles.length ? `Doubles on <strong>${doubles.join(', ')}</strong>` : ''}
      — resolve these on the Exploration chart.</p>` : ''}
    <hr style="margin:0.75rem 0; border-color:var(--border);">
    <p><strong>Sell Wyrdstone</strong></p>
    <p>Warband has ${regularMembers} members (excl. hired swords). Income rate: <strong>${gcPerShard} gc/shard</strong>.</p>
    <label>Shards to sell:
      <input type="number" id="sell-shards-input" value="${shards}" min="0" max="${r.wyrdstone}"
        style="width:60px; margin-left:0.25rem;">
      of ${r.wyrdstone} held
    </label>
  `);

  this._setFooter(`
    <button class="btn btn-secondary" onclick="PostgameWizard._renderStep(3)">&lsaquo; Back</button>
    <button class="btn btn-secondary" onclick="PostgameWizard._renderStep(5)">Skip selling &rsaquo;</button>
    <button class="btn btn-primary" onclick="PostgameWizard._confirmSell(${gcPerShard})">Sell &amp; Next &rsaquo;</button>
  `);
},

_confirmSell(gcPerShard) {
  const r = this._state.roster;
  const input = document.getElementById('sell-shards-input');
  const toSell = Math.min(parseInt(input?.value) || 0, r.wyrdstone);
  if (toSell <= 0) { this._renderStep(5); return; }

  const gc = toSell * gcPerShard;
  this._pushUndo();
  r.wyrdstone -= toSell;
  r.gold += gc;
  r.treasuryLog = r.treasuryLog || [];
  r.treasuryLog.push({
    id: Storage.generateId(),
    type: 'income',
    description: `Sold ${toSell} wyrdstone shard${toSell !== 1 ? 's' : ''} (${gcPerShard} gc each)`,
    gold: gc,
    wyrdstone: -toSell,
    applied: true,
    date: new Date().toISOString(),
    actualGoldDelta: gc,
    actualWyrdstoneDelta: -toSell,
  });
  Storage.saveRoster(r);
  UI.renderRosterEditor();
  UI.playCoinSound();
  this._renderStep(5);
},
```

- [ ] **Step 2: Load `postgame.json` in `DataService.loadAll()`**

In `js/data.js`, add `postgame.json` to the parallel fetch block:

```js
const [equipment, skills, magic, hiredSwords, maxStats, injuries, advancement, specialRules, postgame, ...rawWarbandFiles] =
  await Promise.all([
    this.fetchJSON('data/equipment.json?' + v),
    this.fetchJSON('data/skills.json?' + v),
    this.fetchJSON('data/magic.json?' + v),
    this.fetchJSON('data/hiredSwords.json?' + v),
    this.fetchJSON('data/maxStats.json?' + v),
    this.fetchJSON('data/injuries.json?' + v),
    this.fetchJSON('data/advancement.json?' + v),
    this.fetchJSON('data/special_rules.json?' + v),
    this.fetchJSON('data/postgame.json?' + v),
    ...indexData.map(...),
  ]);
```

And after `this.specialRules = specialRules.specialRules;` add:
```js
this._postgameData = postgame;
```

Also add `_postgameData: null,` to the top of `DataService`.

- [ ] **Step 3: Commit**

```bash
git add js/postgame.js js/data.js
git commit -m "feat: postgame step 4 — exploration dice, wyrdstone shards, and sell income"
```

---

## Task 7: Steps 5–7 (Hired Swords upkeep, Henchmen availability, Trading Post)

**Files:**
- Modify: `js/postgame.js`

Step 5: List each hired sword with their upkeep cost (same as `warrior.cost`). Player ticks "Pay" or "Drop". Dropping uses `r.hiredSwords.splice()` (wrapped in `_pushUndo()` so it is undoable). Paying deducts cost from `r.gold` and adds treasury entry.

Step 6: Offer to roll on the henchmen availability table (2D6) from `postgame.json`. Show result row. Player can reroll. No automatic roster mutation — this is informational.

Step 7: Offer to roll on trading post table (2D6) from `postgame.json`. Show item and cost. Player can reroll. This is informational only.

- [ ] **Step 1: Add `_renderStep5()` through `_renderStep7()`**

Add inside `PostgameWizard` after Step 4 methods:

```js
// ── Step 5: Hired Sword Upkeep ────────────────────────────────────────────

_renderStep5() {
  const r = this._state.roster;
  const hs = r.hiredSwords || [];
  if (hs.length === 0) {
    this._setBody('<p>No hired swords to pay upkeep for.</p>');
    this._setFooter(`
      <button class="btn btn-secondary" onclick="PostgameWizard._renderStep(4)">&lsaquo; Back</button>
      <button class="btn btn-primary" onclick="PostgameWizard._renderStep(6)">Next &rsaquo;</button>
    `);
    return;
  }
  this._state._hsDecisions = this._state._hsDecisions || hs.map(() => 'pay');

  this._setBody(`
    <p>Pay upkeep for your hired swords or dismiss them.</p>
    <ul class="postgame-warrior-list">
      ${hs.map((h, i) => `
        <li class="postgame-warrior-item">
          <strong style="flex:1">${UI.esc(h.name)}</strong>
          <span class="text-dim" style="margin-right:0.75rem;">${h.cost} gc</span>
          <select onchange="PostgameWizard._setHsDecision(${i}, this.value)" class="form-control" style="width:auto;">
            <option value="pay" ${this._state._hsDecisions[i] === 'pay' ? 'selected' : ''}>Pay upkeep</option>
            <option value="drop" ${this._state._hsDecisions[i] === 'drop' ? 'selected' : ''}>Dismiss</option>
          </select>
        </li>
      `).join('')}
    </ul>
  `);
  this._setFooter(`
    <button class="btn btn-secondary" onclick="PostgameWizard._renderStep(4)">&lsaquo; Back</button>
    <button class="btn btn-primary" onclick="PostgameWizard._confirmStep5()">Apply &amp; Next &rsaquo;</button>
  `);
},

_setHsDecision(i, val) {
  this._state._hsDecisions[i] = val;
},

_confirmStep5() {
  const r = this._state.roster;
  const hs = [...(r.hiredSwords || [])];
  const decisions = this._state._hsDecisions || [];
  this._pushUndo();

  const toDrop = [];
  for (let i = 0; i < hs.length; i++) {
    if (decisions[i] === 'drop') {
      toDrop.push(hs[i]);
    } else {
      const upkeep = hs[i].cost || 0;
      if (upkeep > 0) {
        r.gold = Math.max(0, r.gold - upkeep);
        r.treasuryLog = r.treasuryLog || [];
        r.treasuryLog.push({
          id: Storage.generateId(),
          type: 'purchase',
          description: `Upkeep: ${hs[i].name}`,
          gold: -upkeep,
          wyrdstone: 0,
          applied: true,
          date: new Date().toISOString(),
          actualGoldDelta: -Math.min(upkeep, r.gold + upkeep), // clamped
          actualWyrdstoneDelta: 0,
        });
      }
    }
  }
  for (const w of toDrop) {
    const idx = r.hiredSwords.indexOf(w);
    if (idx !== -1) r.hiredSwords.splice(idx, 1);
    UI.toast(`${w.name} dismissed.`, 'info');
  }
  Storage.saveRoster(r);
  UI.renderRosterEditor();
  this._renderStep(6);
},

// ── Step 6: Henchmen Availability ─────────────────────────────────────────

_renderStep6() {
  const die = this._state._henchDie;
  const postgameData = DataService._postgameData;
  const row = die !== null && die !== undefined
    ? this._resolveTableRoll(postgameData?.henchmenAvailabilityTable || [], die)
    : null;

  this._setBody(`
    <p>Roll 2D6 to see what henchmen are available in the market.</p>
    <div class="dice-tray" id="hench-dice-tray">
      <div class="die" onclick="PostgameWizard._rollHenchDice()">${die ?? '?'}</div>
    </div>
    ${row ? `<div class="postgame-advancement-result"><strong>Result (${die}):</strong> ${UI.esc(row.result)}</div>` : ''}
    <p class="text-dim" style="font-size:0.8rem; margin-top:0.75rem;">This step is informational — apply the result manually if you wish.</p>
  `);
  this._setFooter(`
    <button class="btn btn-secondary" onclick="PostgameWizard._renderStep(5)">&lsaquo; Back</button>
    <button class="btn btn-secondary" onclick="PostgameWizard._rollHenchDice()">&#127922; Roll Again</button>
    <button class="btn btn-primary" onclick="PostgameWizard._renderStep(7)">Next &rsaquo;</button>
  `);
},

_rollHenchDice() {
  const val = Math.floor(Math.random() * 6) + 1 + Math.floor(Math.random() * 6) + 1;
  this._state._henchDie = val;
  this._animateDice('hench-dice-tray', [val], () => this._renderStep6());
},

// ── Step 7: Trading Post ──────────────────────────────────────────────────

_renderStep7() {
  const die = this._state._tradeDie;
  const postgameData = DataService._postgameData;
  const row = die !== null && die !== undefined
    ? this._resolveTableRoll(postgameData?.tradingPostTable || [], die)
    : null;

  this._setBody(`
    <p>Roll 2D6 to see what item is available at the Trading Post.</p>
    <div class="dice-tray" id="trade-dice-tray">
      <div class="die" onclick="PostgameWizard._rollTradeDice()">${die ?? '?'}</div>
    </div>
    ${row ? `<div class="postgame-advancement-result"><strong>Result (${die}):</strong> ${UI.esc(row.item)} — ${row.cost} gc</div>` : ''}
    <p class="text-dim" style="font-size:0.8rem; margin-top:0.75rem;">This step is informational — purchase items manually via the Equipment modal if desired.</p>
  `);
  this._setFooter(`
    <button class="btn btn-secondary" onclick="PostgameWizard._renderStep(6)">&lsaquo; Back</button>
    <button class="btn btn-secondary" onclick="PostgameWizard._rollTradeDice()">&#127922; Roll Again</button>
    <button class="btn btn-primary" onclick="PostgameWizard._finishWizard()">Finish &#10003;</button>
  `);
},

_rollTradeDice() {
  const val = Math.floor(Math.random() * 6) + 1 + Math.floor(Math.random() * 6) + 1;
  this._state._tradeDie = val;
  this._animateDice('trade-dice-tray', [val], () => this._renderStep7());
},

_finishWizard() {
  UI.toast('Post-game sequence complete!', 'success');
  this.close();
},

// ── Shared helpers ────────────────────────────────────────────────────────

_resolveTableRoll(table, total) {
  for (const row of table) {
    const range = row.roll.toString();
    if (range.includes('-')) {
      const [lo, hi] = range.split('-').map(Number);
      if (total >= lo && total <= hi) return row;
    } else if (parseInt(range) === total) {
      return row;
    }
  }
  return null;
},
```

- [ ] **Step 2: Verify Steps 5–7 manually**

Walk through the full wizard end-to-end. Verify:
- Step 5: hired swords listed with cost, drop decision removes from roster, pay deducts gold + logs treasury
- Step 6: roll shows availability result, reroll works
- Step 7: roll shows trading post item, "Finish" closes modal and toasts

- [ ] **Step 3: Commit**

```bash
git add js/postgame.js
git commit -m "feat: postgame steps 5-7 — hired sword upkeep, henchmen, trading post"
```

---

## Task 8: Dead-warrior handling in `roster.js` and `ui.js`

**Files:**
- Modify: `js/roster.js`
- Modify: `js/ui.js`

Dead heroes/hired swords carry `isDead: true`. They must be excluded everywhere a live warrior is assumed.

- [ ] **Step 1: Exclude dead warriors from `_heroLike()` counts in `roster.js`**

`_heroLike()` is used by `calculateWarbandRating`, `calculateTotalCost`, and `getMemberCount`. Filter dead warriors out:

```js
_heroLike(roster) {
  return [
    ...(roster.heroes       || []).filter(w => !w.isDead),
    ...(roster.hiredSwords  || []).filter(w => !w.isDead),
    ...(roster.customWarriors|| []).filter(w => !w.isDead),
  ];
},
```

- [ ] **Step 2: Exclude dead heroes from hero cap check in `ui.js`**

Find the hero cap validation (used before adding a new hero and before `promoteHenchmanToHero`). Change the count to exclude dead heroes:

```js
// Before:
const heroCount = roster.heroes.length + (roster.hiredSwords?.length || 0);
// After:
const heroCount = roster.heroes.filter(h => !h.isDead).length
                + (roster.hiredSwords?.filter(h => !h.isDead).length || 0);
```

- [ ] **Step 3: Render dead heroes greyed-out in `renderWarriorCard()`**

In `renderWarriorCard()`, add a dead-state variant when `warrior.isDead`:

```js
if (warrior.isDead) {
  return `<div class="warrior-card warrior-card--dead" data-list-type="${listType}" data-index="${index}">
    <div class="warrior-card-header" style="opacity:0.45;">
      <span class="warrior-name" style="text-decoration:line-through;">${UI.esc(warrior.name)}</span>
      <span class="text-dim" style="font-size:0.75rem; margin-left:0.5rem;">☠ Dead</span>
    </div>
    <div style="padding:0.4rem 0.75rem;">
      <button class="btn btn-sm btn-danger" onclick="UI.removeWarrior('${listType}', ${index})">Remove from roster</button>
    </div>
  </div>`;
}
```

- [ ] **Step 4: Commit**

```bash
git add js/roster.js js/ui.js
git commit -m "feat: dead heroes greyed out, excluded from cap and counts"
```

---

## Task 9: Entry point, Pro gate, and cache busting

**Files:**
- Modify: `js/ui.js`
- Modify: `index.html`

- [ ] **Step 1: Add `openPostgameWizard()` to `UI` in `js/ui.js`**

Find the `// === PROGRESS TAB ===` section and add just before `renderProgressTab()`:

```js
openPostgameWizard() {
  if (typeof Cloud !== 'undefined' && !Cloud.canAccess('postgame_sequence')) {
    this.toast('Post-Game Sequence requires Pro tier.', 'warning');
    this.showTierOverview();
    return;
  }
  PostgameWizard.open(this.currentRoster);
},
```

- [ ] **Step 2: Update the "Start Post-Game Sequence" button visibility in `renderProgressTab()`**

In `renderProgressTab()`, after fetching the `canBattleLog` variable, add:

```js
const canPostgame = (typeof Cloud !== 'undefined') ? Cloud.canAccess('postgame_sequence') : false;
const pgBtn = document.getElementById('btn-start-postgame');
if (pgBtn) {
  pgBtn.style.display = '';
  if (!canPostgame) {
    pgBtn.innerHTML = '&#128274; Post-Game Sequence <span style="font-size:0.75rem;">(Pro)</span>';
  } else {
    pgBtn.innerHTML = '&#9876; Start Post-Game Sequence';
  }
}
```

- [ ] **Step 3: Bump cache versions in `index.html`**

Change:
- `js/data.js?v=15` → `js/data.js?v=16`
- `js/ui.js?v=41` → `js/ui.js?v=42`
- `js/postgame.js?v=1` (already set in Task 2)

- [ ] **Step 4: Bump `const v = 'v=13'` in `js/data.js` to `v=14`**

- [ ] **Step 5: Commit**

```bash
git add js/ui.js js/data.js index.html
git commit -m "feat: wire up postgame wizard entry point with Pro tier gate and cache bump"
```

---

## Task 9: Final review and PR

- [ ] **Step 1: Full end-to-end walkthrough**

1. Start wizard with no OOA warriors → Steps 2 and 3 skip gracefully
2. Check 1 hero OOA → injury roll fires, result applied, warrior card updates
3. Hero with enough XP → advancement roll fires, stat or skill applied
4. Exploration: roll dice, lock some, reroll unlocked, confirm → wyrdstone added, sell prompt
5. Hired sword: pay → gold deducted, treasury entry added
6. Hired sword: drop → removed from roster, undo available
7. Trading post and henchmen rolls resolve correctly
8. Non-Pro user: button shows lock icon, clicking opens tier overview

- [ ] **Step 2: Open PR**

```bash
git push origin feature/postgame-sequence
gh pr create --title "feat: post-game sequence wizard (Pro)" \
  --body "Closes #83"
```
