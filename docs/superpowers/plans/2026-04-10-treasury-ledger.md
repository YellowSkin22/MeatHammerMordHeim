# Treasury Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Pro-tier Treasury Ledger to the Progress tab — an append-only log of income, purchases, sells, and other entries, with a running gold balance column, optional treasury mutation on each entry, and per-entry deletion with reversal.

**Architecture:** A new `treasuryLog` array is added to the roster object. Entries store type, description, signed gold/wyrdstone amounts, an `applied` flag, and a date. Running balance is computed on render by walking entries newest-to-oldest from `roster.gold`, so no snapshot storage is needed. Entry creation and deletion both follow the standard mutate → save → re-render pattern. Equipment pre-population in the purchase form uses `DataService.getAllEquipment()` unfiltered.

**Tech Stack:** Vanilla JS, plain HTML, CSS custom properties. No build tools. No automated test suite — verification is manual in the browser via `python3 -m http.server 8000`.

---

## File Map

| File | Change |
|------|--------|
| `js/roster.js` | Add `treasuryLog: []` to `createRoster()`; bump `?v=7` → `?v=8` |
| `index.html` | Add Treasury Ledger section panel + treasury-ledger modal; bump cache versions |
| `css/style.css` | Add ledger entry, type badge, and running balance styles; bump `?v=12` → `?v=13` |
| `js/ui.js` | Add `renderTreasuryLedger()`, `openTreasuryModal()`, `closeTreasuryModal()`, `onTreasuryTypeChange()`, `onTreasuryEquipmentSelect()`, `submitTreasuryEntry()`, `deleteTreasuryEntry(index)`; update `renderProgressTab()`; bump `?v=23` → `?v=24` |

---

## Task 1: Add `treasuryLog` to the roster data model

**Files:**
- Modify: `js/roster.js` (around line 55 — `createRoster` return object)

- [ ] **Step 1: Add `treasuryLog` field to `createRoster()`**

In `js/roster.js`, find the `createRoster` return object and add `treasuryLog: []` after `battleLog: []`:

```js
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
  treasuryLog: [],
  notes: '',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};
```

- [ ] **Step 2: Verify existing rosters won't break**

All rendering code will guard with `roster.treasuryLog || []` — existing saved rosters that lack the field will render an empty ledger rather than crashing. No migration needed.

- [ ] **Step 3: Commit**

```bash
git add js/roster.js
git commit -m "feat: add treasuryLog array to roster model"
```

---

## Task 2: Add HTML — Treasury Ledger section and modal

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add Treasury Ledger section panel to the Progress tab**

In `index.html`, find the closing `</div>` of the Treasury & Resources section panel (around line 184) and insert the new section immediately after it, before the `<!-- Battle Log -->` comment:

```html
        <!-- Treasury Ledger -->
        <div class="section-panel mt-2">
          <div class="section-header" style="display:flex; justify-content:space-between; align-items:center;">
            <h3>Treasury Ledger</h3>
            <button class="btn btn-sm" id="btn-add-treasury-entry" onclick="UI.openTreasuryModal()">+ Add Entry</button>
          </div>
          <div class="section-content">
            <div id="treasury-ledger-entries"></div>
          </div>
        </div>
```

- [ ] **Step 2: Add the treasury-ledger modal**

After the last existing modal in `index.html` (before the closing `</body>` or the `<footer>` — search for `<!-- ===== FOOTER =====` and add before it, or after the last `</div>` closing a modal). Add:

```html
  <!-- ===== TREASURY LEDGER MODAL ===== -->
  <div id="treasury-ledger-modal" class="modal-overlay">
    <div class="modal">
      <div class="modal-header">
        <h3>Add Treasury Entry</h3>
        <button class="btn btn-icon" onclick="UI.closeTreasuryModal()">&#10005;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>Entry Type</label>
          <select id="treasury-type-select" class="form-control" onchange="UI.onTreasuryTypeChange()">
            <option value="income">Income</option>
            <option value="purchase">Purchase</option>
            <option value="sell">Sell</option>
            <option value="other">Other</option>
          </select>
        </div>

        <!-- Equipment picker — shown for Purchase only -->
        <div class="form-group" id="treasury-equipment-group" style="display:none;">
          <label>Equipment (pre-fill)</label>
          <select id="treasury-equipment-select" class="form-control" onchange="UI.onTreasuryEquipmentSelect()">
            <option value="">— select to pre-fill —</option>
          </select>
        </div>

        <div class="form-group">
          <label id="treasury-description-label">Description</label>
          <input type="text" id="treasury-description-input" class="form-control" placeholder="e.g. Post-battle loot">
        </div>

        <div class="form-group">
          <label id="treasury-gold-label">Gold (gc)</label>
          <input type="number" id="treasury-gold-input" class="form-control" min="0" value="0">
        </div>

        <!-- Wyrdstone — shown for Income and Other only -->
        <div class="form-group" id="treasury-wyrdstone-group">
          <label>Wyrdstone Shards</label>
          <input type="number" id="treasury-wyrdstone-input" class="form-control" min="0" value="0">
        </div>

        <div class="form-group">
          <label>
            <input type="checkbox" id="treasury-apply-checkbox" checked>
            <span id="treasury-apply-label">Add to treasury</span>
          </label>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn" onclick="UI.closeTreasuryModal()">Cancel</button>
        <button class="btn btn-primary" onclick="UI.submitTreasuryEntry()">Add Entry</button>
      </div>
    </div>
  </div>
```

- [ ] **Step 3: Bump cache versions in index.html**

Update the `?v=` query params on the changed files:
```html
<link rel="stylesheet" href="css/style.css?v=13">
...
<script src="js/roster.js?v=8"></script>
<script src="js/ui.js?v=24"></script>
```

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: add treasury ledger section and modal HTML"
```

---

## Task 3: Add CSS styles for the ledger

**Files:**
- Modify: `css/style.css`

- [ ] **Step 1: Add ledger styles**

Find `/* ===== BATTLE LOG ===== */` in `css/style.css` and add the following block immediately before it:

```css
/* ===== TREASURY LEDGER ===== */
.treasury-ledger-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.78rem;
}

.treasury-ledger-table th {
  text-align: left;
  color: var(--text-dim);
  font-weight: 500;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 0.3rem 0.4rem;
  border-bottom: 1px solid var(--border);
}

.treasury-ledger-table td {
  padding: 0.35rem 0.4rem;
  border-bottom: 1px solid var(--bg-dark);
  vertical-align: middle;
}

.treasury-ledger-table tr:last-child td {
  border-bottom: none;
}

.treasury-type-badge {
  display: inline-block;
  font-size: 0.65rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 0.1rem 0.4rem;
  border-radius: 3px;
}

.treasury-type-badge--income,
.treasury-type-badge--sell {
  background: rgba(124, 185, 168, 0.15);
  color: #7cb9a8;
}

.treasury-type-badge--purchase {
  background: rgba(200, 124, 124, 0.15);
  color: #c87c7c;
}

.treasury-type-badge--other {
  background: rgba(180, 180, 180, 0.1);
  color: var(--text-dim);
}

.treasury-amount--positive {
  color: #7cb9a8;
  font-weight: 600;
}

.treasury-amount--negative {
  color: #c87c7c;
  font-weight: 600;
}

.treasury-balance {
  color: var(--accent);
  font-weight: 600;
}

.treasury-delete-btn {
  background: none;
  border: none;
  color: var(--text-dim);
  cursor: pointer;
  font-size: 0.85rem;
  padding: 0 0.2rem;
  line-height: 1;
  opacity: 0.5;
}

.treasury-delete-btn:hover {
  color: #c87c7c;
  opacity: 1;
}

.treasury-ledger-empty {
  color: var(--text-dim);
  font-size: 0.85rem;
  padding: 0.5rem 0;
}
```

- [ ] **Step 2: Commit**

```bash
git add css/style.css
git commit -m "feat: add treasury ledger CSS styles"
```

---

## Task 4: Add `renderTreasuryLedger()` and wire into `renderProgressTab()`

**Files:**
- Modify: `js/ui.js`

- [ ] **Step 1: Add `renderTreasuryLedger()` method**

Find `renderBattleLog()` in `js/ui.js` (around line 1237) and add the following method immediately before it:

```js
renderTreasuryLedger() {
  const r = this.currentRoster;
  const container = document.getElementById('treasury-ledger-entries');
  const canPro = (typeof Cloud !== 'undefined') ? Cloud.canAccess('battle_log') : false;
  const canView = (typeof Cloud !== 'undefined') ? (Cloud.TIER_RANK[Cloud.getTier()] >= Cloud.TIER_RANK['standard']) : false;

  // Gate the Add Entry button
  const addBtn = document.getElementById('btn-add-treasury-entry');
  if (addBtn) addBtn.style.display = canPro ? '' : 'none';

  if (!canView) {
    container.innerHTML = '<div class="locked-message"><span class="lock-icon">&#128274;</span> Treasury Ledger requires <strong>Standard</strong> tier or above. <a class="tier-link" onclick="UI.showTierOverview()">View Plans</a></div>';
    return;
  }

  const log = (r.treasuryLog || []);

  if (log.length === 0) {
    container.innerHTML = '<p class="treasury-ledger-empty">No entries yet.</p>';
    return;
  }

  // Compute running balance newest→oldest from roster.gold
  const chronological = [...log].sort((a, b) => new Date(a.date) - new Date(b.date));
  const balanceAfter = {};
  let running = r.gold;
  for (let i = chronological.length - 1; i >= 0; i--) {
    const e = chronological[i];
    if (e.applied) {
      balanceAfter[e.id] = running;
      running -= e.gold;
      running -= (e.wyrdstone || 0) === 0 ? 0 : 0; // wyrdstone shown separately, not in gc balance
    }
  }

  // Render newest first
  const reversed = [...log].reverse();
  container.innerHTML = `
    <table class="treasury-ledger-table">
      <thead>
        <tr>
          <th>Type</th>
          <th>Description</th>
          <th>Amount</th>
          <th>Balance</th>
          <th>Date</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${reversed.map((e, displayIdx) => {
          const realIdx = log.length - 1 - displayIdx;
          const sign = e.gold >= 0 ? '+' : '';
          const amountClass = e.gold >= 0 ? 'treasury-amount--positive' : 'treasury-amount--negative';
          const balance = balanceAfter[e.id] != null ? `<span class="treasury-balance">${balanceAfter[e.id]} gc</span>` : '<span class="text-dim">—</span>';
          const wyrdstoneStr = (e.wyrdstone && e.wyrdstone !== 0) ? ` / ${e.wyrdstone > 0 ? '+' : ''}${e.wyrdstone} ⬡` : '';
          const canDelete = canPro;
          return `
            <tr>
              <td><span class="treasury-type-badge treasury-type-badge--${e.type}">${e.type}</span></td>
              <td>${this.esc(e.description)}</td>
              <td class="${amountClass}">${sign}${e.gold} gc${wyrdstoneStr}</td>
              <td>${balance}</td>
              <td class="text-dim" style="font-size:0.7rem;">${new Date(e.date).toLocaleDateString()}</td>
              <td>${canDelete ? `<button class="treasury-delete-btn" onclick="UI.deleteTreasuryEntry(${realIdx})" title="Remove entry">&#10005;</button>` : ''}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
},
```

- [ ] **Step 2: Wire into `renderProgressTab()`**

Find `renderProgressTab()` in `js/ui.js` (around line 1190). After the line that calls `this.renderBattleLog()` (or after the battle log section of the method), add a call to `this.renderTreasuryLedger()`:

The existing `renderProgressTab()` ends with the notes section. Find where `renderBattleLog()` is called (inside the `if (canViewBattleLog)` block around line 1217) and add `this.renderTreasuryLedger();` at the end of `renderProgressTab()`, just before the closing `},`:

```js
  renderProgressTab() {
    // ... existing code unchanged ...

    // Treasury Ledger
    this.renderTreasuryLedger();
  },
```

- [ ] **Step 3: Manual verification**

Start the server: `python3 -m http.server 8000`

Open http://localhost:8000, open any roster, go to the Progress tab. Confirm:
- "Treasury Ledger" section is visible between Treasury & Resources and Battle Log
- Shows "No entries yet."
- Free/standard users see the locked message (or no Add Entry button for standard)
- Pro users see the `+ Add Entry` button

- [ ] **Step 4: Commit**

```bash
git add js/ui.js
git commit -m "feat: add renderTreasuryLedger() and wire into renderProgressTab()"
```

---

## Task 5: Add modal open/close and form adaptation methods

**Files:**
- Modify: `js/ui.js`

- [ ] **Step 1: Add `openTreasuryModal()`, `closeTreasuryModal()`, `onTreasuryTypeChange()`, `onTreasuryEquipmentSelect()`**

Find the `// === CLOSE MODALS ===` section in `js/ui.js` (around line 1669) and add the following methods in the `// === EXPERIENCE ===` region or just before `addBattle()`. Place them together as a `// === TREASURY LEDGER ===` block:

```js
// === TREASURY LEDGER ===
openTreasuryModal() {
  if (typeof Cloud !== 'undefined' && !Cloud.canAccess('battle_log')) {
    return this.toast('Treasury Ledger requires Pro tier.', 'error');
  }

  // Reset form
  document.getElementById('treasury-type-select').value = 'income';
  document.getElementById('treasury-description-input').value = '';
  document.getElementById('treasury-gold-input').value = '0';
  document.getElementById('treasury-wyrdstone-input').value = '0';
  document.getElementById('treasury-apply-checkbox').checked = true;

  // Populate equipment dropdown
  const equipSelect = document.getElementById('treasury-equipment-select');
  const allEquip = DataService.getAllEquipment();
  const grouped = {};
  allEquip.forEach(item => {
    const cat = item.type || 'misc';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(item);
  });
  const catOrder = ['melee', 'missile', 'blackpowder', 'armour', 'misc', 'animal'];
  const cats = [...new Set([...catOrder, ...Object.keys(grouped)])].filter(c => grouped[c]);
  equipSelect.innerHTML = '<option value="">— select to pre-fill —</option>' +
    cats.map(cat => {
      const label = DataService.getEquipmentCategoryName(cat);
      const options = grouped[cat]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(item => {
          const cost = item.cost?.cost ?? 0;
          return `<option value="${this.escAttr(item.name)}" data-cost="${cost}">${this.esc(item.name)} (${cost} gc)</option>`;
        }).join('');
      return `<optgroup label="${this.escAttr(label)}">${options}</optgroup>`;
    }).join('');

  this.onTreasuryTypeChange();
  document.getElementById('treasury-ledger-modal').classList.add('active');
},

closeTreasuryModal() {
  this.closeModal('treasury-ledger-modal');
},

onTreasuryTypeChange() {
  const type = document.getElementById('treasury-type-select').value;
  const equipGroup = document.getElementById('treasury-equipment-group');
  const wyrdstoneGroup = document.getElementById('treasury-wyrdstone-group');
  const applyLabel = document.getElementById('treasury-apply-label');
  const goldLabel = document.getElementById('treasury-gold-label');
  const descLabel = document.getElementById('treasury-description-label');

  equipGroup.style.display = type === 'purchase' ? '' : 'none';
  wyrdstoneGroup.style.display = (type === 'income' || type === 'other') ? '' : 'none';

  if (type === 'income') {
    goldLabel.textContent = 'Gold Earned (gc)';
    descLabel.textContent = 'Description';
    applyLabel.textContent = 'Add to treasury';
  } else if (type === 'purchase') {
    goldLabel.textContent = 'Cost (gc)';
    descLabel.textContent = 'Item Name';
    applyLabel.textContent = 'Deduct from treasury';
  } else if (type === 'sell') {
    goldLabel.textContent = 'Gold Received (gc)';
    descLabel.textContent = 'Item Sold';
    applyLabel.textContent = 'Add to treasury';
  } else {
    goldLabel.textContent = 'Gold (gc) — use negative for expense';
    descLabel.textContent = 'Description';
    applyLabel.textContent = 'Apply to treasury';
  }
},

onTreasuryEquipmentSelect() {
  const select = document.getElementById('treasury-equipment-select');
  const opt = select.options[select.selectedIndex];
  if (!opt || !opt.value) return;
  document.getElementById('treasury-description-input').value = opt.value;
  document.getElementById('treasury-gold-input').value = opt.dataset.cost || '0';
},
```

- [ ] **Step 2: Manual verification**

With the server running, open a Pro-tier roster's Progress tab. Click `+ Add Entry`:
- Modal opens with type = Income
- Wyrdstone field is visible; equipment picker is hidden
- Switch to Purchase: equipment picker appears, wyrdstone field hides
- Select an equipment item: description and cost fields auto-fill
- Switch to Other: gold label says "Gold (gc) — use negative for expense"
- Cancel closes the modal

- [ ] **Step 3: Commit**

```bash
git add js/ui.js
git commit -m "feat: add treasury modal open/close and form adaptation"
```

---

## Task 6: Add `submitTreasuryEntry()`

**Files:**
- Modify: `js/ui.js`

- [ ] **Step 1: Add `submitTreasuryEntry()` method**

Add the following method immediately after `onTreasuryEquipmentSelect()`:

```js
submitTreasuryEntry() {
  const type = document.getElementById('treasury-type-select').value;
  const description = document.getElementById('treasury-description-input').value.trim();
  const rawGold = parseFloat(document.getElementById('treasury-gold-input').value) || 0;
  const rawWyrdstone = parseInt(document.getElementById('treasury-wyrdstone-input').value) || 0;
  const apply = document.getElementById('treasury-apply-checkbox').checked;

  if (!description) return this.toast('Enter a description.', 'error');

  // Sign convention: income/sell = positive, purchase = negative, other = as-entered
  let gold, wyrdstone;
  if (type === 'income') {
    gold = Math.abs(rawGold);
    wyrdstone = Math.abs(rawWyrdstone);
  } else if (type === 'purchase') {
    gold = -Math.abs(rawGold);
    wyrdstone = 0;
  } else if (type === 'sell') {
    gold = Math.abs(rawGold);
    wyrdstone = 0;
  } else {
    // 'other' — signed as entered
    gold = rawGold;
    wyrdstone = rawWyrdstone;
  }

  const entry = {
    id: Storage.generateId(),
    type,
    description,
    gold,
    wyrdstone,
    applied: apply,
    date: new Date().toISOString(),
  };

  this.currentRoster.treasuryLog = this.currentRoster.treasuryLog || [];
  this.currentRoster.treasuryLog.push(entry);

  if (apply) {
    this.currentRoster.gold = (this.currentRoster.gold || 0) + gold;
    this.currentRoster.wyrdstone = (this.currentRoster.wyrdstone || 0) + wyrdstone;
    // Keep gold non-negative (clamp at 0)
    this.currentRoster.gold = Math.max(0, this.currentRoster.gold);
    this.currentRoster.wyrdstone = Math.max(0, this.currentRoster.wyrdstone);
  }

  this.saveCurrentRoster();
  this.closeTreasuryModal();
  this.renderProgressTab();
  // Sync the gold input field to reflect any change
  document.getElementById('gold-input').value = this.currentRoster.gold;
  document.getElementById('wyrdstone-input').value = this.currentRoster.wyrdstone;
  this.toast('Entry added.', 'success');
},
```

- [ ] **Step 2: Manual verification**

With server running:

1. Open a Pro roster → Progress tab → `+ Add Entry`
2. **Income test:** Type=Income, Description="Post-battle loot", Gold=20, Wyrdstone=2, Apply checked → Add Entry. Confirm:
   - Entry appears in the ledger (newest first)
   - `roster.gold` increased by 20 (gold input reflects it)
   - `roster.wyrdstone` increased by 2
   - Balance column shows the new gold total
3. **Purchase test:** Type=Purchase, select "Sword" from equipment dropdown (auto-fills), Apply checked → Add Entry. Confirm:
   - Entry shows negative amount in red
   - Gold total decreased by sword cost
   - Balance column updated
4. **No-apply test:** Add an Income entry with Apply **unchecked** → Confirm gold total does NOT change, but entry appears with `—` in the Balance column
5. **Other negative test:** Type=Other, Gold=-15 (typed negative), Apply checked → gold decreases by 15

- [ ] **Step 3: Commit**

```bash
git add js/ui.js
git commit -m "feat: add submitTreasuryEntry() with optional treasury mutation"
```

---

## Task 7: Add `deleteTreasuryEntry()`

**Files:**
- Modify: `js/ui.js`

- [ ] **Step 1: Add `deleteTreasuryEntry()` method**

Add immediately after `submitTreasuryEntry()`:

```js
deleteTreasuryEntry(index) {
  const r = this.currentRoster;
  const log = r.treasuryLog || [];
  const entry = log[index];
  if (!entry) return;

  if (!confirm('Remove this treasury entry?')) return;

  // Reverse the treasury mutation if it was applied
  if (entry.applied) {
    r.gold = Math.max(0, (r.gold || 0) - entry.gold);
    r.wyrdstone = Math.max(0, (r.wyrdstone || 0) - entry.wyrdstone);
  }

  r.treasuryLog.splice(index, 1);
  this.saveCurrentRoster();
  this.renderProgressTab();
  document.getElementById('gold-input').value = r.gold;
  document.getElementById('wyrdstone-input').value = r.wyrdstone;
  this.toast('Entry removed.', 'success');
},
```

- [ ] **Step 2: Manual verification**

1. Add a few entries (income, purchase) with Apply checked
2. Note the current gold total
3. Click × on the purchase entry → confirm dialog appears → confirm
4. Verify: gold total is restored (purchase amount added back), entry disappears, running balances on remaining entries are correct
5. Click × on an entry that had Apply **unchecked** → gold total should NOT change after deletion

- [ ] **Step 3: Commit**

```bash
git add js/ui.js
git commit -m "feat: add deleteTreasuryEntry() with mutation reversal"
```

---

## Task 8: Final wiring check and cache bust

**Files:**
- Verify: `index.html` (cache versions from Task 2 already bumped)

- [ ] **Step 1: Verify all cache versions were bumped**

Confirm `index.html` has:
```html
<link rel="stylesheet" href="css/style.css?v=13">
<script src="js/roster.js?v=8"></script>
<script src="js/ui.js?v=24"></script>
```

- [ ] **Step 2: End-to-end test**

Full flow:
1. Create a new roster (starts at 500gc)
2. Progress tab → Treasury Ledger section shows "No entries yet."
3. Add Income 20gc + 3 wyrdstone (applied) → balance shows 520gc
4. Add Purchase "Sword" 10gc (applied) → balance shows 510gc
5. Add Sell "Old Dagger" 5gc (applied) → balance shows 515gc
6. Add Other "Hired Sword deposit" -30gc (applied) → balance shows 485gc
7. Add Income 10gc (NOT applied) → entry appears with `—` balance, gold total unchanged
8. Delete the Sell entry → gold drops back to 510gc, running balances recalculate
9. Reload page → ledger persists correctly from localStorage
10. Verify dark mode: entries display correctly with theme colours

- [ ] **Step 3: Final commit**

```bash
git add index.html
git commit -m "chore: verify cache versions bumped for treasury ledger"
```

---

## Self-Review

### Spec Coverage

| Spec requirement | Task |
|-----------------|------|
| `treasuryLog` array on roster | Task 1 |
| Entry shape (id, type, description, gold, wyrdstone, applied, date) | Tasks 1 + 6 |
| Pro tier gate | Task 4 (render) + Task 5 (open modal) |
| Standard can view, free sees locked | Task 4 |
| Section between Treasury & Resources and Battle Log | Task 2 |
| Newest-first display | Task 4 |
| Type badge, amount, balance, date, delete columns | Task 4 |
| Running balance computed on render | Task 4 |
| Colour coding (teal/red) | Task 3 |
| Add Entry modal with type picker | Task 2 + Task 5 |
| Equipment dropdown pre-populated (all 246, grouped by category) | Task 5 |
| Auto-fill name + cost on select | Task 5 |
| Labels adapt by type | Task 5 |
| Optional apply checkbox | Task 2 + Task 6 |
| Sign convention per type | Task 6 |
| Gold non-negative clamp | Task 6 |
| Gold/wyrdstone inputs sync after mutation | Task 6 + Task 7 |
| Delete with confirm | Task 7 |
| Delete reverses mutation if applied | Task 7 |
| Cache versions bumped | Tasks 2 + 8 |

### Placeholder Scan — none found.

### Type Consistency Check

- `entry.gold` — signed number throughout Tasks 4, 6, 7 ✓
- `entry.applied` — boolean, checked consistently ✓
- `r.treasuryLog || []` — guarded in Tasks 4, 6, 7 ✓
- `deleteTreasuryEntry(index)` — real index into `log` array, passed from render in Task 4 ✓
