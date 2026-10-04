#!/usr/bin/env node
// VardiyaOS staged typecheck.
//
// Runs `tsc --noEmit` for exactly the workspaces that the staged TypeScript
// files belong to, and fails the commit when any project reports an error.
// Zero dependencies on purpose: it has to run from a bare checkout.
//
//   node scripts/lint-staged-typecheck.mjs                     # route from argv
//   node scripts/lint-staged-typecheck.mjs --verbose           # print the plan
//   node scripts/lint-staged-typecheck.mjs --workspace frontend # force one
//
// lint-staged calls this with the staged file paths appended, so the routing
// is derived from what is actually being committed.
//
// Why this exists instead of a shell one-liner:
//
// lint-staged executes every task string with `shell: false`. It splits the
// string on whitespace and spawns the first token as a program, so a task of
// `cd frontend && npx tsc` tried to execute a program literally named `cd`,
// which is a cmd.exe builtin with no binary on disk, and died with
// ERROR_INVALID_NAME before any compiler ran.
//
// This script removes the shell from the equation entirely. It resolves the
// compiler from each workspace's own node_modules, so the compiler version
// always matches the version that workspace declares, instead of whatever
// happens to be hoisted into the repository root.
//
// It also refuses to check a project that cannot fail. `tsc -p` on a
// solution-style tsconfig whose "files" is empty type-checks nothing and
// exits 0, which is how `npx tsc --noEmit` came to pass while real type
// errors sat in frontend/src. Such a root config is treated as a solution
// file and its referenced projects are checked instead.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const SOURCE_FILE = /\.(?:[cm]?ts|tsx|[cm]?js)$/i;

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

/**
 * Strip comments and trailing commas so a JSONC tsconfig can be parsed.
 * String literals are preserved, so a "//" inside a path stays intact.
 */
export const stripJsonComments = (raw) => {
  let out = "";
  let inString = false;
  let inLine = false;
  let inBlock = false;

  for (let i = 0; i < raw.length; i += 1) {
    const char = raw[i];
    const next = raw[i + 1];

    if (inLine) {
      if (char === "\n") {
        inLine = false;
        out += char;
      }
      continue;
    }

    if (inBlock) {
      if (char === "*" && next === "/") {
        inBlock = false;
        i += 1;
      }
      continue;
    }

    if (inString) {
      out += char;
      if (char === "\\") {
        out += next ?? "";
        i += 1;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      out += char;
      continue;
    }
    if (char === "/" && next === "/") {
      inLine = true;
      i += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      inBlock = true;
      i += 1;
      continue;
    }

    out += char;
  }

  // Remove trailing commas that JSONC permits but JSON does not.
  return out.replace(/,(\s*[}\]])/g, "$1");
};

/** Parse a tsconfig, tolerating JSONC the same way tsc does. */
const readTsconfig = (path) =>
  JSON.parse(stripJsonComments(readFileSync(path, "utf8")));

/** True when `file` lives inside `dir` (not `dir` itself). */
export const isInside = (dir, file) => {
  const rel = relative(dir, file);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
};

/**
 * A root tsconfig with empty "files" plus "references" is a solution file:
 * `tsc -p` on it checks nothing and exits 0. Resolve the real projects.
 */
export const resolveProjects = (tsconfigPath) => {
  const config = readTsconfig(tsconfigPath);
  const declaredFiles = Array.isArray(config.files) ? config.files : [];
  const references = Array.isArray(config.references) ? config.references : [];

  if (declaredFiles.length === 0 && references.length > 0) {
    return references
      .map((reference) => resolve(dirname(tsconfigPath), reference.path))
      .map((path) => (path.endsWith(".json") ? path : `${path}.json`))
      .filter((path) => existsSync(path));
  }

  return [tsconfigPath];
};

/**
 * A workspace is a top-level directory with a package.json, a tsconfig.json
 * and its own TypeScript installation. Discovery runs against the filesystem
 * so a new workspace cannot silently escape the gate.
 */
export const discoverWorkspaces = (root = ROOT) => {
  const workspaces = [];

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;

    const dir = join(root, entry.name);
    const manifestPath = join(dir, "package.json");
    const tsconfigPath = join(dir, "tsconfig.json");
    if (!existsSync(manifestPath) || !existsSync(tsconfigPath)) continue;

    const manifest = readJson(manifestPath);
    workspaces.push({
      name: entry.name,
      dir,
      projects: resolveProjects(tsconfigPath),
      compiler: join(dir, "node_modules", "typescript", "bin", "tsc"),
      declared:
        manifest.devDependencies?.typescript ??
        manifest.dependencies?.typescript ??
        null,
    });
  }

  return workspaces;
};

/** Workspaces touched by the given staged files, in stable order. */
export const affectedWorkspaces = (workspaces, files) =>
  workspaces.filter((workspace) =>
    files.some(
      (file) => SOURCE_FILE.test(file) && isInside(workspace.dir, file),
    ),
  );

/** Run one project's typecheck. Returns the child exit code. */
export const typecheckProject = (workspace, project, verbose) => {
  if (!existsSync(workspace.compiler)) {
    // Fail loudly: a missing compiler must never be mistaken for a pass.
    process.stderr.write(
      `lint-staged-typecheck: ${workspace.name} has no TypeScript installed at ` +
        `${relative(ROOT, workspace.compiler)}\n` +
        `lint-staged-typecheck: run "npm ci" in ${workspace.name} and retry\n`,
    );
    return 1;
  }

  if (verbose) {
    const declared = workspace.declared ?? "undeclared";
    process.stderr.write(
      `lint-staged-typecheck: ${workspace.name} -> tsc --noEmit -p ` +
        `${relative(ROOT, project)} (typescript ${declared})\n`,
    );
  }

  // process.execPath runs node directly, so nothing depends on PATH
  // resolution or on a shell interpreting the command.
  const result = spawnSync(
    process.execPath,
    [workspace.compiler, "--noEmit", "--pretty", "-p", project],
    { cwd: workspace.dir, stdio: "inherit" },
  );

  if (result.error) {
    process.stderr.write(
      `lint-staged-typecheck: failed to start tsc for ${workspace.name}: ${result.error.message}\n`,
    );
    return 1;
  }

  return result.status ?? 1;
};

/** Run every project of every workspace, collecting the failures. */
export const runGate = (workspaces, verbose) => {
  const failures = [];

  for (const workspace of workspaces) {
    if (workspace.projects.length === 0) {
      process.stderr.write(
        `lint-staged-typecheck: ${workspace.name} has no checkable tsconfig project\n`,
      );
      failures.push(workspace.name);
      continue;
    }

    for (const project of workspace.projects) {
      if (typecheckProject(workspace, project, verbose) !== 0) {
        failures.push(`${workspace.name} (${relative(ROOT, project)})`);
      }
    }
  }

  return failures;
};

const main = (argv) => {
  const verbose = argv.includes("--verbose");
  const forced = argv.includes("--workspace")
    ? argv[argv.indexOf("--workspace") + 1]
    : null;

  const workspaces = discoverWorkspaces();

  let selected;
  if (forced) {
    selected = workspaces.filter((workspace) => workspace.name === forced);
    if (selected.length === 0) {
      process.stderr.write(
        `lint-staged-typecheck: unknown workspace "${forced}"\n`,
      );
      return 1;
    }
  } else {
    const files = argv
      .filter((arg) => !arg.startsWith("--") && arg !== forced)
      .map((file) => resolve(ROOT, file));
    selected = affectedWorkspaces(workspaces, files);
  }

  if (selected.length === 0) {
    process.stderr.write(
      "lint-staged-typecheck: no staged source files, skipping\n",
    );
    return 0;
  }

  const failures = runGate(selected, verbose);

  if (failures.length > 0) {
    process.stderr.write(
      `lint-staged-typecheck: failed for ${failures.join(", ")}\n`,
    );
    return 1;
  }

  process.stderr.write(
    `lint-staged-typecheck: ok for ${selected.map((w) => w.name).join(", ")}\n`,
  );
  return 0;
};

// Only run when invoked directly, so the test file can import the helpers.
if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  process.exit(main(process.argv.slice(2)));
}
