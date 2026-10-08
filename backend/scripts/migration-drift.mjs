#!/usr/bin/env node
// VardiyaOS migration drift gate (release gate 26).
//
// Proves that `prisma/schema.prisma` and the applied `prisma/migrations/`
// history agree. Prisma replays the full migration history into a shadow
// database and diffs the resulting schema against the one the datamodel
// implies. Anything that remains after filtering the known-benign extension
// statements is real drift and fails the gate.
//
//   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/vardiyasystem_test npm run check:migration-drift
//
// The shadow URL must point at a reachable server that may create databases;
// the migration history is replayed there from scratch on every run.
//
// Exit code 0 means migrations and datamodel agree.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BACKEND = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS_DIR = join(BACKEND, 'prisma', 'migrations');
const SCHEMA_FILE = join(BACKEND, 'prisma', 'schema.prisma');

// The extension objects live only on the migrated side: `schema.prisma` has
// no way to express them, so `migrate diff` always reports them as an
// addition. They are idempotent (`IF NOT EXISTS`) and the only lines that
// survive on a clean tree.
const BENIGN_LINE = /^CREATE EXTENSION IF NOT EXISTS /;

function fail(message) {
  console.error(`migration-drift: ${message}`);
  process.exit(1);
}

function resolvePrisma() {
  const asJs = join(BACKEND, 'node_modules', 'prisma', 'build', 'index.js');
  if (existsSync(asJs)) return [process.execPath, asJs];
  return ['npx', 'prisma'];
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  fail(
    'DATABASE_URL is required (a reachable Postgres that may create databases)',
  );
}
if (!existsSync(MIGRATIONS_DIR)) {
  fail(`migrations directory not found: ${MIGRATIONS_DIR}`);
}
if (!existsSync(SCHEMA_FILE)) {
  fail(`schema file not found: ${SCHEMA_FILE}`);
}

const [command, ...commandArgs] = resolvePrisma();
const result = spawnSync(
  command,
  [
    ...commandArgs,
    'migrate',
    'diff',
    '--from-migrations',
    MIGRATIONS_DIR,
    '--to-schema-datamodel',
    SCHEMA_FILE,
    '--shadow-database-url',
    databaseUrl,
    '--script',
  ],
  { encoding: 'utf8', cwd: BACKEND },
);

const stdout = String(result.stdout ?? '');
const stderr = String(result.stderr ?? '');

if (result.error) {
  fail(`could not launch prisma (${result.error.message})`);
}
if (result.status !== 0) {
  console.error(stderr.trim());
  fail(`prisma migrate diff exited ${result.status}`);
}

const drift = stdout
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(
    (line) =>
      line.length > 0 && !line.startsWith('--') && !BENIGN_LINE.test(line),
  );

if (drift.length > 0) {
  console.error(
    `Migration drift detected between prisma/migrations and prisma/schema.prisma:` +
      `\n\n${drift.join('\n')}` +
      `\n\nSchema and migration history must agree before release.`,
  );
  process.exit(1);
}

console.log(
  `migration-drift: clean — ${stdout.split(/\r?\n/).filter((l) => BENIGN_LINE.test(l)).length} benign extension statement(s) only`,
);
