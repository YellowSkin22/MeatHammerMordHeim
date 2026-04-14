# Warband Picker — Design Spec

**Date:** 2026-04-14
**Status:** Approved (mockup reviewed and accepted by user)

---

## Problem

The Create Warband modal uses a plain `<select>` with 53 warbands listed in alphabetical order. With no grouping or filtering, finding a specific warband requires scrolling through the entire list.

## Goal

Replace the native `<select>` with a custom combobox: a trigger button that opens a dropdown panel containing a live-search input and a grade-grouped scrollable list.

---

## Design

### Interaction

- The field renders as a styled button showing "— Select Warband —" (placeholder) or the selected warband name.
- Clicking the button opens a dropdown panel directly below it, visually connected (trigger loses bottom border-radius when open).
- The panel contains a search input (auto-focused on open) and a scrollable list of warbands grouped by grade.
- Typing in the search filters warbands by name in real time (case-insensitive substring match).
- Clicking a warband selects it, populates the trigger text, closes the panel, and fires the existing `onWarbandSelectChange()` logic (lore preview, starting gold).
- Clicking outside the picker or pressing Escape closes the panel without changing the selection.
- The selected item is visually highlighted when the panel reopens.

### Grouping

Warbands are grouped by their grade from the data (`_grade` field on each warband file). Grade order: `1a → 1b → 1c`. Group headers display as: **Grade 1a**, **Grade 1b**, **Grade 1c**.

When a search is active, only groups with matching results are shown (empty groups are hidden). If nothing matches, a "No warbands match…" message is shown.

Each item shows the warband name (left) and source string (right, dimmed).

---

## Files Changed

### `js/data.js` — `getAllWarbands()`

Add `grade` to each returned entry so the UI can group without additional lookups:

```js
// Before
result.push({ id, name, source });

// After
result.push({ id, name, source, grade: wf._grade });
```

Subfactions inherit their parent file's `_grade`.

### `index.html` — create modal

Replace:
```html
<select id="create-warband-select" class="form-control" onchange="UI.onWarbandSelectChange()">
  <option value="">-- Select Warband --</option>
</select>
```

With the custom picker shell (trigger button + panel div). The panel's list is populated by JS at modal open time (same timing as the old `select` was populated).

Hidden `<input type="hidden" id="create-warband-select">` keeps the existing `submitCreateRoster()` value-reading logic working with zero changes to that function.

### `js/ui.js`

- **`openCreateModal()`** — replace `select.innerHTML = ...` with a call to a new `_renderWarbandPicker()` helper that builds the grouped list HTML and wires up the trigger/panel.
- **`_renderWarbandPicker()`** — new private method. Builds group headers + item rows into `#picker-list`. Sets trigger text to placeholder. Resets search input.
- **`_filterWarbandPicker(query)`** — new private method. Filters the rendered list in-place by showing/hiding items and group headers.
- **`_selectWarband(id)`** — new private method. Sets the hidden input value, updates trigger text, closes panel, calls `onWarbandSelectChange()`.
- Picker open/close state managed via a CSS class (`open`) on the trigger and panel — no JS state variable needed beyond the hidden input value.

### `css/style.css`

New block of CSS rules for the picker (appended before the dark-mode overrides section):
- `.warband-picker` — `position: relative` container
- `.picker-trigger` — styled like `.form-control` but a `<button>`; chevron icon; `open` modifier removes bottom radius
- `.picker-panel` — `position: absolute`, `display: none` / `.open { display: block }`, border matching trigger accent colour, `z-index: 300` (above modal overlay's 200)
- `.picker-search-wrap` / `.picker-search` — search row inside panel
- `.picker-list` — scrollable list, `max-height: 220px`, thin scrollbar
- `.picker-group-header` — sticky grade label, dimmed uppercase
- `.picker-item` — hover + selected states using `--accent` and `--accent-glow`
- `.picker-empty` — italic no-results message

All colours use existing CSS custom properties — no new variables introduced. Dark mode is handled automatically.

---

## Out of Scope

- Keyboard navigation within the list (arrow up/down) — not in this iteration.
- Showing a grade explanation tooltip — grade labels are self-descriptive enough.
- Any changes to the hired sword or custom warrior flows — unaffected.
