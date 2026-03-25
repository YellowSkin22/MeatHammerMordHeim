Run the Mordheim data sync from Uncle-Mel/JSON-derulo.

Execute the sync script and report results:

```bash
cd /Users/mimobru/Apps/MeatHammerMordHeim && node scripts/sync-mordheim-data.js
```

After running, report:
- How many items were added/updated per file (equipment, skills, spells, warbands)
- Whether the commit and Netlify deploy triggered successfully
- Any errors or warnings that occurred

If the script exits with an error:
1. Show the full error message
2. Identify whether it's a validation failure, GitHub API issue, or git/deploy problem
3. For validation failures: read the relevant data file and the source to diagnose the mismatch
4. For GitHub API issues: check `gh auth status` and retry once
5. For git errors: check `git status` and resolve before retrying

Do not retry more than once automatically — surface the error to the user if it persists.
