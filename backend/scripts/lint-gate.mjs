#!/usr/bin/env node
// VardiyaOS backend lint gate.
//
// The backend tree predates a working lint setup, so enabling ESLint's
// type-checked rules surfaced thousands of pre-existing findings. Failing on
// them would make the pipeline permanently red, which is the same dead end as
// the previously broken `ng lint` entry point.
//
// Instead this gate records the current error count and fails only when the
// count grows: existing debt stays visible and measurable, while newly
// introduced errors block the release.
//
//   node scripts/lint-gate.mjs           # check (CI entry point)
//   node scripts/lint-gate.mjs --update  # re-baseline after paying debt down
//   node scripts/lint-gate.mjs --strict  # no baseline, report raw eslint exit code

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const backendDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const baselinePath = join(backendDir, 'eslint-baseline.json');
const args = new Set(process.argv.slice(2));
const strict = args.has('--strict');
const update = args.has('--update');

const eslint = spawnSync(
  process.execPath,
  [
    join(backendDir, 'node_modules', 'eslint', 'bin', 'eslint.js'),
    'src/',
    '--format',
    'json',
  ],
  { cwd: backendDir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
);

if (eslint.error) {
  console.error(`lint gate: failed to execute eslint: ${eslint.error.message}`);
  process.exit(2);
}

// Windows editors and PowerShell add a UTF-8 BOM, which JSON.parse rejects.
const readJson = (path) =>
  JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));

let results;
try {
  results = JSON.parse((eslint.stdout || '[]').replace(/^\uFEFF/, ''));
} catch {
  console.error('lint gate: could not parse eslint JSON output');
  console.error((eslint.stderr || '').slice(0, 2000));
  process.exit(2);
}

let errorCount = 0;
let warningCount = 0;
const byRule = new Map();

for (const file of results) {
  errorCount += file.errorCount;
  warningCount += file.warningCount;
  for (const msg of file.messages) {
    if (msg.severity !== 2) continue;
    const rule = msg.ruleId ?? 'parse-error';
    byRule.set(rule, (byRule.get(rule) ?? 0) + 1);
  }
}

const topRules = [...byRule.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

console.log('lint gate summary');
console.log(`  errors:   ${errorCount}`);
console.log(`  warnings: ${warningCount}`);
for (const [rule, count] of topRules) {
  console.log(`    ${String(count).padStart(5)}  ${rule}`);
}

if (strict) {
  console.log(`\nstrict mode: eslint exit ${eslint.status}`);
  process.exit(eslint.status ?? 1);
}

if (update || !existsSync(baselinePath)) {
  writeFileSync(
    baselinePath,
    `${JSON.stringify({ maxErrors: errorCount, updatedAt: new Date().toISOString() }, null, 2)}\n`,
  );
  console.log(`\nbaseline written: maxErrors=${errorCount} (${baselinePath})`);
  process.exit(0);
}

let baseline;
try {
  baseline = readJson(baselinePath);
} catch (error) {
  console.error(`lint gate: could not read ${baselinePath}: ${error.message}`);
  console.error('Delete the file to re-baseline, or repair it by hand.');
  process.exit(2);
}
console.log(
  `\nbaseline maxErrors: ${baseline.maxErrors} (recorded ${baseline.updatedAt})`,
);

if (errorCount > baseline.maxErrors) {
  const delta = errorCount - baseline.maxErrors;
  console.error(
    `\nFAIL: ${delta} new lint error(s) above the recorded baseline.`,
  );
  console.error(
    'Fix them, or re-baseline deliberately with --update after paying debt down.',
  );
  process.exit(1);
}

if (errorCount < baseline.maxErrors) {
  const delta = baseline.maxErrors - errorCount;
  console.log(
    `\nPASS: ${delta} fewer error(s) than the baseline. Re-baseline with --update.`,
  );
  process.exit(0);
}

console.log('\nPASS: no lint regression against the baseline.');
