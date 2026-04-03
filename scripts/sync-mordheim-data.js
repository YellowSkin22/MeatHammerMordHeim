#!/usr/bin/env node
'use strict';

/**
 * sync-mordheim-data.js
 *
 * Downloads Uncle-Mel/JSON-derulo data files verbatim — no transformation.
 *
 * Usage:
 *   node scripts/sync-mordheim-data.js            # normal run
 *   node scripts/sync-mordheim-data.js --dry-run  # preview changes without writing
 *   node scripts/sync-mordheim-data.js --force    # re-download all files even if SHA unchanged
 */

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SOURCE_REPO     = 'Uncle-Mel/JSON-derulo';
const ROOT_DIR        = path.resolve(__dirname, '..');
const DATA_DIR        = path.join(ROOT_DIR, 'data');
const SYNC_STATE_PATH = path.join(DATA_DIR, '.sync-state.json');
const WARBAND_FOLDER  = 'data/warbandFiles';
const NETLIFY_HOOK    = process.env.NETLIFY_DEPLOY_HOOK;

// Flat files to download verbatim (source path in Uncle-Mel → local path)
const VERBATIM_FILES = [
  { src: 'data/equipment.json',   dest: 'data/equipment.json'   },
  { src: 'data/skills.json',      dest: 'data/skills.json'      },
  { src: 'data/magic.json',       dest: 'data/magic.json'       },
  { src: 'data/hiredSwords.json', dest: 'data/hiredSwords.json' },
  { src: 'data/maxStats.json',    dest: 'data/maxStats.json'    },
];

// Warband files matching these patterns are skipped (non-canonical variants)
const SKIP_PATTERNS = [/-old\.json$/, /-original\.json$/, /reference/, /test\.ps1/];

// ─── GitHub helpers ───────────────────────────────────────────────────────

function ghApi(endpoint) {
  try {
    return JSON.parse(execSync(`gh api "${endpoint}"`, { encoding: 'utf8' }));
  } catch (e) {
    throw new Error(`GitHub API error for ${endpoint}: ${e.message}`);
  }
}

function downloadJson(srcPath) {
  const meta = ghApi(`repos/${SOURCE_REPO}/contents/${encodeURIComponent(srcPath)}`);
  if (!meta.content) throw new Error(`No content for ${srcPath}`);
  return {
    data: JSON.parse(Buffer.from(meta.content, 'base64').toString('utf8')),
    sha:  meta.sha,
  };
}

// ─── Utilities ────────────────────────────────────────────────────────────

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

function loadSyncState() {
  try { return readJson(SYNC_STATE_PATH); } catch { return { files: {} }; }
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  const dryRun  = process.argv.includes('--dry-run');
  const force   = process.argv.includes('--force');
  const timestamp = new Date().toISOString();

  console.log(`\n🔄  Mordheim Data Sync — ${timestamp}`);
  console.log(`    Source: ${SOURCE_REPO}`);
  console.log(`    Mode:   ${dryRun ? 'DRY RUN' : 'LIVE'}${force ? ' + FORCE' : ''}\n`);

  const state   = loadSyncState();
  let   changed = false;

  // ── Remove old merged files (one-time cleanup) ─────────────────────────
  for (const old of ['data/warbands.json', 'data/mergedEquipment.json', 'data/hired_swords.json']) {
    const p = path.join(ROOT_DIR, old);
    if (fs.existsSync(p)) {
      console.log(`  Removing old file: ${old}`);
      if (!dryRun) { fs.unlinkSync(p); changed = true; }
    }
  }

  // ── Flat verbatim files ────────────────────────────────────────────────
  for (const { src, dest } of VERBATIM_FILES) {
    const meta = ghApi(`repos/${SOURCE_REPO}/contents/${encodeURIComponent(src)}`);
    if (!force && state.files[src] === meta.sha) {
      console.log(`  Skipping unchanged: ${dest}`);
      continue;
    }
    const { data } = downloadJson(src);
    console.log(`  Downloading: ${dest}`);
    if (!dryRun) {
      writeJson(path.join(ROOT_DIR, dest), data);
      state.files[src] = meta.sha;
      changed = true;
    }
  }

  // ── Warband files (dynamic grade discovery) ────────────────────────────
  const gradeItems = ghApi(`repos/${SOURCE_REPO}/contents/${WARBAND_FOLDER}`);
  const grades     = gradeItems.filter(i => i.type === 'dir').map(i => i.name);
  const indexEntries = [];

  for (const grade of grades) {
    const fileItems = ghApi(`repos/${SOURCE_REPO}/contents/${WARBAND_FOLDER}/${grade}`);
    const jsonFiles = fileItems.filter(
      i => i.type === 'file' && i.name.endsWith('.json') &&
           !SKIP_PATTERNS.some(p => p.test(i.name))
    );

    for (const file of jsonFiles) {
      const srcPath  = `${WARBAND_FOLDER}/${grade}/${file.name}`;
      const destPath = `data/warbandFiles/${grade}/${file.name}`;
      indexEntries.push({ grade, path: destPath });

      if (!force && state.files[srcPath] === file.sha) {
        console.log(`  Skipping unchanged: ${destPath}`);
        continue;
      }
      const { data } = downloadJson(srcPath);
      console.log(`  Downloading: ${destPath}`);
      if (!dryRun) {
        writeJson(path.join(ROOT_DIR, destPath), data);
        state.files[srcPath] = file.sha;
        changed = true;
      }
    }
  }

  // ── Write index.json ───────────────────────────────────────────────────
  const indexPath = path.join(ROOT_DIR, 'data/warbandFiles/index.json');
  console.log(`  Writing: data/warbandFiles/index.json (${indexEntries.length} entries)`);
  if (!dryRun) {
    writeJson(indexPath, indexEntries);
    changed = true;
  }

  if (dryRun) {
    console.log('\n✅  Dry run complete. Files NOT written.\n');
    return;
  }

  state.lastChecked = timestamp;
  writeJson(SYNC_STATE_PATH, state);

  // ── Commit & push ──────────────────────────────────────────────────────
  if (changed) {
    console.log('\n📝  Committing...');
    try {
      execSync('git add data/', { cwd: ROOT_DIR, stdio: 'pipe' });
      const staged = execSync('git diff --cached --name-only', { cwd: ROOT_DIR, encoding: 'utf8' }).trim();

      if (!staged) {
        console.log('    No file changes to commit.');
      } else {
        const date = timestamp.slice(0, 10);
        execSync(
          `git commit -m "chore: sync data from JSON-derulo [${date}]"`,
          { cwd: ROOT_DIR, stdio: 'pipe' }
        );
        execSync('git push origin feature/raw-uncle-mel-data', { cwd: ROOT_DIR, stdio: 'pipe' });
        console.log('    ✓ Committed and pushed');

        if (NETLIFY_HOOK) {
          execSync(`curl -sf -X POST "${NETLIFY_HOOK}"`, { stdio: 'pipe' });
          console.log('    ✓ Netlify deploy triggered');
        }
      }
    } catch (err) {
      console.error(`\n❌  Git/deploy error: ${err.message}`);
      process.exit(1);
    }
  }

  console.log('\n✅  Sync complete!\n');
}

main().catch(err => { console.error(err); process.exit(1); });
