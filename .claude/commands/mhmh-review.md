---
name: code-review
description: Review staged or recent code changes for this project. Checks correctness, security, project conventions, and tier system compliance.
allowed-tools: Read, Grep, Glob, Bash
---

Review the code changes in this project. Run `git diff HEAD~1` (or `git diff --cached` if there are staged changes) to get the diff, then analyse it against the criteria below.

## What to check

### 1. Mutation pattern
Every state change must follow: mutate `UI.currentRoster` → `saveCurrentRoster()` → `renderRosterEditor()`. Flag any direct DOM mutation that bypasses this, except `renameWarrior()` which intentionally does a targeted update.

### 2. XSS escaping
- User-controlled strings inserted into HTML content must use `UI.esc(str)`
- User-controlled strings in HTML attributes must use `UI.escAttr(str)`
- Flag any raw interpolation of `warrior.name`, `warband.name`, or any user-editable field into HTML without escaping.

### 3. Cache busting
If any JS or CSS file in `index.html` was modified, the corresponding `?v=N` query param must be incremented. Flag if it wasn't.
If any `data/*.json` file is loaded via `fetchJSON` in `data.js`, the `v=N` version string at the top of `loadAll()` must be incremented if the data format changed.

### 4. Tier system
Core game mechanics (managing warriors, stats, equipment, skills, injuries, experience, warband rating) must never be gated behind `standard` or `pro`. Flag any new `Cloud.canAccess()` check that gates a core mechanic.

### 5. Global load order
The five globals must remain loaded in order: Cloud → DataService → Storage → RosterModel → UI. Flag any new script tag that disrupts this.

### 6. Data access pattern
UI code must go through `DataService` methods — never access `DataService.warbands`, `DataService.equipment`, etc. directly. Flag direct property access from outside `data.js`.

### 7. Index-based event handlers
Warriors are referenced by array index, not ID, in UI event handlers. If a new handler passes an ID instead of an index, flag it.

## Output format

For each issue found:
- **Severity:** Critical / Warning / Suggestion
- **File and line:** where the issue is
- **What's wrong:** one clear sentence
- **Fix:** the corrected code or approach

If no issues are found, say so clearly. Keep the review concise — don't pad with praise.

## GitHub issues

After reporting findings, create one GitHub issue per flagged item using `gh issue create`. Use this format for each:

- **Title:** `[<Severity>] <What's wrong>` (e.g. `[Critical] warrior.name interpolated without UI.esc()`)
- **Body:**
  ```
  **File:** <file and line>
  **Severity:** <severity>

  **Problem:** <what's wrong>

  **Fix:** <the corrected code or approach>

  _Flagged by /code-review skill_
  ```
- **Label:** map severity to label — Critical → `bug`, Warning → `enhancement`, Suggestion → `enhancement`

Run `gh issue create --title "..." --body "..." --label "..."` for each issue. If a label doesn't exist yet, omit the `--label` flag rather than erroring.

If no issues were found, do not create any GitHub issues.
