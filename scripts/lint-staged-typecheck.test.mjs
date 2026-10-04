// Unit tests for scripts/lint-staged-typecheck.mjs
//
//   node --test scripts/lint-staged-typecheck.test.mjs
//
// The routing tests cover the part that cannot be verified by just running
// the hook: a mis-routed file would silently skip a workspace, and a
// mis-resolved tsconfig would silently check nothing. Both are gates that
// pass while doing no work, so they get pinned here.

import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";

import {
  affectedWorkspaces,
  discoverWorkspaces,
  isInside,
  resolveProjects,
} from "./lint-staged-typecheck.mjs";

const ROOT = join(import.meta.dirname, "..");

test("isInside accepts descendants and rejects siblings and parents", () => {
  const dir = join(ROOT, "frontend");
  assert.equal(isInside(dir, join(dir, "src", "app", "x.ts")), true);
  assert.equal(isInside(dir, join(ROOT, "backend", "src", "x.ts")), false);
  assert.equal(isInside(dir, ROOT), false);
  assert.equal(isInside(dir, join(dir, "..", "frontend-old", "x.ts")), false);
});

test("discoverWorkspaces finds the npm workspaces that own a tsconfig", () => {
  const names = discoverWorkspaces(ROOT).map((w) => w.name);
  assert.ok(names.includes("frontend"), "frontend workspace is discovered");
  assert.ok(names.includes("backend"), "backend workspace is discovered");
  assert.ok(!names.includes("node_modules"), "node_modules is skipped");
});

test("every discovered workspace has at least one checkable project", () => {
  for (const workspace of discoverWorkspaces(ROOT)) {
    assert.ok(
      workspace.projects.length > 0,
      `${workspace.name} resolves a project`,
    );
    assert.ok(workspace.compiler.endsWith(join("typescript", "bin", "tsc")));
  }
});

test("a solution-style tsconfig resolves to its referenced projects", () => {
  // frontend/tsconfig.json has "files": [] plus references. Checking it
  // directly type-checks nothing and exits 0, which is the bug this guards.
  const projects = resolveProjects(join(ROOT, "frontend", "tsconfig.json"));
  const names = projects.map((p) => p.split(/[\\/]/).pop());
  assert.ok(
    !names.includes("tsconfig.json"),
    "the solution file itself is not checked",
  );
  assert.ok(
    names.includes("tsconfig.app.json"),
    "the referenced app project is checked",
  );
});

test("configs outside the declared project graph are not silently added", () => {
  // frontend/tsconfig.spec.json exists but is not referenced by the solution
  // file. The gate follows what the workspace declares rather than guessing,
  // so an unreferenced config is never checked behind the owner's back.
  const names = resolveProjects(join(ROOT, "frontend", "tsconfig.json")).map(
    (p) => p.split(/[\\/]/).pop(),
  );
  assert.ok(!names.includes("tsconfig.spec.json"));
});

test("a plain tsconfig resolves to itself", () => {
  const backend = join(ROOT, "backend", "tsconfig.json");
  assert.deepEqual(resolveProjects(backend), [backend]);
});

test("a frontend source file routes to the frontend workspace only", () => {
  const workspaces = discoverWorkspaces(ROOT);
  const affected = affectedWorkspaces(workspaces, [
    "frontend/src/app/app.component.ts",
  ]);
  assert.deepEqual(
    affected.map((w) => w.name),
    ["frontend"],
  );
});

test("a backend source file routes to the backend workspace only", () => {
  const workspaces = discoverWorkspaces(ROOT);
  const affected = affectedWorkspaces(workspaces, ["backend/src/main.ts"]);
  assert.deepEqual(
    affected.map((w) => w.name),
    ["backend"],
  );
});

test("source files from both workspaces route to both", () => {
  const workspaces = discoverWorkspaces(ROOT);
  const affected = affectedWorkspaces(workspaces, [
    "frontend/src/app/app.component.ts",
    "backend/src/main.ts",
  ]);
  assert.deepEqual(affected.map((w) => w.name).sort(), ["backend", "frontend"]);
});

test("non-source staged files route to nothing", () => {
  const workspaces = discoverWorkspaces(ROOT);
  assert.deepEqual(
    affectedWorkspaces(workspaces, [
      "README.md",
      "docs/phase-rc/release-candidate-remediation-report.md",
      "frontend/angular.json",
      "backend/package.json",
    ]),
    [],
  );
});

test("a repo-root script is not routed into a workspace", () => {
  const workspaces = discoverWorkspaces(ROOT);
  assert.deepEqual(
    affectedWorkspaces(workspaces, ["scripts/lint-staged-typecheck.mjs"]),
    [],
  );
});

test("renamed .ts source files still route by extension", () => {
  const workspaces = discoverWorkspaces(ROOT);
  assert.deepEqual(
    affectedWorkspaces(workspaces, ["frontend/src/legacy-name.ts"]).map(
      (w) => w.name,
    ),
    ["frontend"],
  );
});
