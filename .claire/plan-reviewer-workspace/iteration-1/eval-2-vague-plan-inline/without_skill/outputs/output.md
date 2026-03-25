# Plan Review: Auto-mark dead warriors

## Overall Assessment

The plan describes a real and reasonable feature for the app but is too vague to act on safely. The issue statement, approach, and definition of done all leave critical decisions unresolved. Before writing any code, the plan needs to answer the questions raised below.

---

## Issue Statement

> Warriors with 0 wounds should be marked as dead automatically

**Problem:** "0 wounds" and "dead" are used loosely here, but the game rules already handle "dead" as a specific post-battle injury outcome, not as a live-game wound-count threshold. Looking at `data/injuries.json`, "Dead" is one of the named injury entries that a user manually applies via the injury modal. The warrior object has `stats.W` (Wounds), tracked as a numeric stat in `stats{}`, but the game never reaches W=0 during roster management — W is a stat value, not a hit-point counter that depletes in the app. The plan does not explain which of these two concepts it is targeting:

- **Option A:** When a user manually adjusts W to 0 via the Adjust Stats modal, automatically flag or remove the warrior.
- **Option B:** When the "Dead" injury is applied, automatically remove the warrior from the roster (mirroring what `injuries.json` says: "Remove from roster").

These are entirely different implementation paths. The plan must pick one and say so explicitly.

---

## Approach

> 1. Update the wound tracking code

There is no dedicated "wound tracking code." Wounds (W) are just one of nine stats managed by `RosterModel.modifyStat()` in `js/roster.js` (line 148) and rendered by the stat line in `renderWarriorCard()` in `js/ui.js` (line 477). The plan needs to name the actual functions it intends to change, not a vague concept.

The most natural hook points are:
- `RosterModel.modifyStat()` — could trigger logic when W reaches 0.
- `UI.modStat()` in `js/ui.js` (line 985) — the UI layer that calls `modifyStat`, where a post-mutation check could trigger a prompt or auto-removal.
- `UI.selectInjury()` in `js/ui.js` (line 942) — where the "Dead" injury is applied; could auto-remove the warrior here instead of waiting for the user to manually click Remove.

> 2. Add some UI to show dead warriors differently

"Some UI" is not a design decision. The plan needs to specify: Is this a visual flag (e.g. a CSS class, greyed-out card, skull icon)? A separate "Dead" section in the roster view? An immediate removal with a toast confirmation? The answer matters because "show dead warriors differently" implies they remain on the roster in a dead state, which conflicts with what `injuries.json` says ("Remove from roster") and with the definition of done ("Warriors at 0 wounds show as dead"). Showing vs. removing are opposites.

> 3. Make sure it saves properly

This is handled automatically by the existing mutation pattern documented in `CLAUDE.md`: mutate `UI.currentRoster`, call `this.saveCurrentRoster()`, call `this.renderRosterEditor()`. There is nothing special to do here unless the plan introduces a new warrior state field (e.g. `warrior.dead = true`), in which case backward-compatibility with existing saved rosters needs to be addressed.

---

## Files Affected

`js/ui.js` and `js/roster.js` are correct — any meaningful change will touch both. However, the plan is probably missing:

- `data/injuries.json` — if the intent is Option B (auto-remove on "Dead" injury), the injury data file is relevant context, though it likely does not need editing.
- `css/style.css` — if dead warriors are visually distinguished, a new CSS class will be needed.

---

## Definition of Done

> - [ ] Warriors at 0 wounds show as dead

This is a single acceptance criterion and it is ambiguous:

1. **"0 wounds"** — does this mean `stats.W === 0` after a stat adjustment, or does it mean the "Dead" injury has been applied? These are different triggers.
2. **"show as dead"** — does this mean a visual indicator on the card, or removal from the roster? The injuries.json description ("Remove from roster. All equipment is lost.") strongly implies removal is the correct game rule behaviour, but the plan says "show."
3. There are no criteria for edge cases:
   - What happens to a henchman group at 0 wounds — does the whole group die, or just one member?
   - Hired swords and custom warriors are stored in separate arrays (`roster.hiredSwords`, `roster.customWarriors`). The `removeWarrior()` function in `ui.js` already handles all four list types via `listType`, so removal should work, but the plan does not confirm this has been considered.
   - Should there be a confirmation prompt before auto-removal (matching the explicit user action pattern in the rest of the app), or should it be silent?
   - What happens to the warband rating and member count if a dead warrior is kept on the roster rather than removed? `RosterModel.calculateWarbandRating()` and `getMemberCount()` iterate all arrays with no filtering.

---

## Specific Recommendations

1. **Clarify the trigger.** Choose between: (a) W stat reaching 0, or (b) the "Dead" injury being applied. State it explicitly.

2. **Clarify the outcome.** Choose between: (a) visual flag + warrior stays on roster, or (b) prompt user to remove the warrior. Given the injury data text ("Remove from roster") and the app's existing Remove button pattern, option (b) is more consistent with the game rules.

3. **Handle henchman groups.** If W=0 is the trigger and a henchman group has groupSize > 1, the plan needs a rule. Most likely: decrement groupSize by 1 (one member dies), and only remove the group entry when groupSize reaches 0.

4. **Add a concrete acceptance criterion per list type.** Heroes, henchmen, hired swords, and custom warriors are all separate arrays. Confirm the feature works for all four.

5. **Consider whether `warrior.dead` needs to be a persisted field.** If warriors are shown-but-flagged rather than removed, a new boolean field on the warrior object must be added, and `calculateWarbandRating()` and `getMemberCount()` in `roster.js` must skip dead warriors, or the rating numbers will be wrong.

---

## What Is Good About the Plan

- The two files named are the correct ones to touch.
- The feature itself is well-scoped and does not require data schema changes to `warbands.json` or other data files.
- The existing `modifyStat` and `removeWarrior` plumbing in the codebase already covers the mechanical needs; this is not a large implementation effort once the design questions are resolved.
