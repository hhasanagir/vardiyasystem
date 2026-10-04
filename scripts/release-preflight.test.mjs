// Tests for the release preflight.
//
// Each case builds a minimal repository fixture that satisfies every invariant,
// then breaks exactly one thing and asserts that the responsible check fails.
// A gate that cannot be shown to go red is not a gate.
//
//   node --test scripts/release-preflight.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";

import { runChecks } from "./release-preflight.mjs";

const files = {
  ".nvmrc": "20\n",
  ".gitignore": "node_modules/\n.env\nbackend/.env\nsecrets/*.txt\n",
  "package.json": JSON.stringify(
    { name: "vardiyasystem", private: true },
    null,
    2,
  ),
  "docker-compose.prod.yml": [
    "services:",
    "  backend:",
    "    image: ${BACKEND_IMAGE:?set an immutable tag}",
    "  frontend:",
    "    image: ${FRONTEND_IMAGE:?set an immutable tag}",
    "  grafana:",
    "    image: grafana/grafana:11.3.0",
    "  postgres:",
    "    image: postgres:15-alpine",
    "  pgbouncer:",
    "    image: bitnamilegacy/pgbouncer:1.24.1-debian-12-r10",
    "secrets:",
    "  db_password:",
    "    file: ./secrets/db_password.txt",
    "  grafana_admin_password:",
    "    file: ./secrets/grafana_admin_password.txt",
    "  slack_webhook:",
    "    file: ./secrets/slack_webhook.txt",
    "",
  ].join("\n"),
  "backend/package.json": JSON.stringify(
    {
      name: "backend",
      scripts: { lint: "node scripts/lint-gate.mjs", test: "vitest run" },
    },
    null,
    2,
  ),
  "frontend/package.json": JSON.stringify(
    { name: "frontend", scripts: { lint: "eslint .", test: "vitest run" } },
    null,
    2,
  ),
  "backend/eslint-baseline.json": JSON.stringify({ maxErrors: 4075 }, null, 2),
  "backend/Dockerfile": "FROM node:20-alpine AS builder\nFROM node:20-alpine\n",
  "backend/src/main.ts":
    "app.setGlobalPrefix('api');\napp.enableVersioning({\n  type: VersioningType.URI,\n  defaultVersion: '1',\n  prefix: 'v',\n});\n",
  "backend/src/modules/health/health.controller.ts":
    "@Controller('health')\nexport class HealthController {\n  @Get('live')\n  live() {}\n  @Get('ready')\n  ready() {}\n}\n",
  "frontend/Dockerfile": "FROM node:20-alpine\n",
  "frontend/nginx.conf":
    'server {\n  location = /health {\n    return 200 "ok";\n  }\n}\n',
  "k8s/kustomization.yaml":
    "resources:\n  - service-account.yaml\n  - backend-deployment.yaml\n  - frontend-deployment.yaml\n",
  "k8s/service-account.yaml":
    "kind: ServiceAccount\nmetadata:\n  name: vardiya-backend\n---\nkind: ServiceAccount\nmetadata:\n  name: vardiya-frontend\n",
  "k8s/backend-deployment.yaml":
    "spec:\n  serviceAccountName: vardiya-backend\n  containers:\n    - name: backend\n      image: ghcr.io/anomalyco/vardiyasystem/backend:v1.0.0\n      livenessProbe:\n        httpGet:\n          path: /api/v1/health/live\n      readinessProbe:\n        httpGet:\n          path: /api/v1/health/ready\n",
  "k8s/frontend-deployment.yaml":
    "spec:\n  serviceAccountName: vardiya-frontend\n  containers:\n    - name: frontend\n      image: ghcr.io/anomalyco/vardiyasystem/frontend:v1.0.0\n",
  "k8s/secrets.yaml":
    'kind: Secret\nstringData:\n  db_password: ""\n  jwt_access_secret: ""\n  grafana_admin_password: ""\n',
  "secrets/README.md":
    "Required secret files: db_password.txt, jwt_access_secret.txt, cookie_secret.txt, encryption_master_key.txt, grafana_admin_password.txt, slack_webhook.txt\n",
  "scripts/rollback.sh": "#!/usr/bin/env bash\necho rollback\n",
  "docs/devops/rollback.md": "# Rollback\n",
  "k8s/postgres-statefulset.yaml":
    "spec:\n  containers:\n    - name: postgres\n      image: postgres:15-alpine\n---\napiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: vardiya-pgbouncer\nspec:\n  template:\n    spec:\n      containers:\n        - name: pgbouncer\n          image: bitnamilegacy/pgbouncer:1.24.1-debian-12-r10\n",
  "infra/helm/vardiya-platform/values.yaml": [
    "postgres:",
    '  version: "15"',
    "  image:",
    "    repository: postgres",
    "    tag: 15-alpine",
    "pgbouncer:",
    "  image:",
    "    repository: bitnamilegacy/pgbouncer",
    "    tag: 1.24.1-debian-12-r10",
    "backend:",
    "  existingSecret: vardiya-backend-secrets",
    "redis-cluster:",
    "  existingSecret: vardiya-redis-secrets",
    "monitoring:",
    "  grafana:",
    "    adminPasswordSecret: vardiya-monitoring-secrets",
    "  alertmanager:",
    "    existingSecret: vardiya-monitoring-secrets",
    "",
  ].join("\n"),
  "infra/sealed-secrets/backend-secrets.yaml": [
    "apiVersion: bitnami.com/v1alpha1",
    "kind: SealedSecret",
    "metadata:",
    "  name: vardiya-backend-secrets",
    "  namespace: vardiya",
    "spec:",
    "  template:",
    "    metadata:",
    "      name: vardiya-backend-secrets",
    "      namespace: vardiya",
    "    type: Opaque",
    "  encryptedData:",
    "    database_url: AgAA...",
    "    database_direct_url: AgAA...",
    "    jwt_access_secret: AgAA...",
    "    jwt_refresh_secret: AgAA...",
    "    cookie_secret: AgAA...",
    "    vapid_public_key: AgAA...",
    "    vapid_private_key: AgAA...",
    "    encryption_master_key: AgAA...",
    "    redis_url: AgAA...",
    "---",
    "apiVersion: bitnami.com/v1alpha1",
    "kind: SealedSecret",
    "metadata:",
    "  name: vardiya-db-secrets",
    "  namespace: vardiya",
    "spec:",
    "  template:",
    "    metadata:",
    "      name: vardiya-db-secrets",
    "      namespace: vardiya",
    "    type: Opaque",
    "  encryptedData:",
    "    postgres_password: AgAA...",
    "---",
    "apiVersion: bitnami.com/v1alpha1",
    "kind: SealedSecret",
    "metadata:",
    "  name: vardiya-monitoring-secrets",
    "  namespace: vardiya",
    "spec:",
    "  template:",
    "    metadata:",
    "      name: vardiya-monitoring-secrets",
    "      namespace: vardiya",
    "    type: Opaque",
    "  encryptedData:",
    "    admin_password: AgAA...",
    "    slack_webhook: AgAA...",
    "---",
    "apiVersion: bitnami.com/v1alpha1",
    "kind: SealedSecret",
    "metadata:",
    "  name: vardiya-redis-secrets",
    "  namespace: vardiya",
    "spec:",
    "  template:",
    "    metadata:",
    "      name: vardiya-redis-secrets",
    "      namespace: vardiya",
    "    type: Opaque",
    "  encryptedData:",
    "    redis_password: AgAA...",
    "    redis_sentinel_password: AgAA...",
    "",
  ].join("\n"),
  "scripts/backup-db.sh":
    "#!/bin/bash\npg_dump --format=custom --compress=9 --file=latest.dump\ngzip -f latest.dump && mv latest.dump.gz latest.sql.gz\n",
  "scripts/restore-db.sh":
    '#!/bin/bash\ngunzip -c "$BACKUP_FILE" | pg_restore --dbname=vardiyasystem --no-owner --no-acl\n',
  "scripts/restore-db.ps1":
    "param([string]\$BackupFile)\nif (\$BackupFile -match '\\.gz$') { \$tmp = \"\$env:TEMP\\dump\" }\n& pg_restore --dbname=vardiyasystem --no-owner --no-acl\n",
  "scripts/verify-backup.sh":
    '#!/bin/bash\ngzip -t "$1" || exit 1\nTMP="$(mktemp)"\ngzip -dc "$1" > "$TMP"\npg_restore --list "$TMP" > /dev/null\n',
  "scripts/restore-check.sh":
    '#!/usr/bin/env bash\nPG_IMAGE="${RESTORE_CHECK_IMAGE:-postgres:15-alpine}"\ngunzip -c "$1" | pg_restore --exit-on-error --dbname=vardiyasystem\npsql -c "SELECT count(*) FROM _prisma_migrations;"\n',
  ".github/workflows/pr-validation.yml": [
    "name: PR",
    "env:",
    "  NODE_VERSION: '20'",
    "jobs:",
    "  unit-tests:",
    "    steps:",
    "      - run: npm ci",
    "        working-directory: backend",
    "      - run: npm run test",
    "        working-directory: backend",
    "",
  ].join("\n"),
  ".github/workflows/deploy.yml": [
    "name: Deploy",
    "env:",
    "  NODE_VERSION: '20'",
    "jobs:",
    "  integration-test:",
    "    steps:",
    "      - run: curl -sf http://127.0.0.1:3000/api/v1/health/ready",
    "",
  ].join("\n"),
};

function makeFixture(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), "vardiya-preflight-"));
  const merged = { ...files, ...overrides };
  for (const [rel, content] of Object.entries(merged)) {
    if (content === null) continue;
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content, "utf8");
  }
  return root;
}

function run(root, options) {
  return runChecks(root, options).reduce(
    (acc, r) => ({ ...acc, [r.id]: r }),
    {},
  );
}

const failsOn = (root, id) => {
  const r = run(root)[id];
  return r.status === "fail" ? r.failures : [];
};

test("a consistent repository passes every check", () => {
  const root = makeFixture();
  try {
    const results = runChecks(root);
    const failed = results.filter((r) => r.status !== "pass");
    assert.deepEqual(
      failed.map((f) => `${f.id}: ${f.failures.join("; ")}`),
      [],
    );
    assert.equal(results.length, 18);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("node-version: a workflow pinned to a different major is caught", () => {
  const root = makeFixture({
    ".github/workflows/pr-validation.yml": files[
      ".github/workflows/pr-validation.yml"
    ].replace("NODE_VERSION: '20'", "NODE_VERSION: '22'"),
  });
  try {
    assert.match(failsOn(root, "node-version").join(), /NODE_VERSION 22/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("node-version: a Dockerfile on a different base is caught", () => {
  const root = makeFixture({ "backend/Dockerfile": "FROM node:18-alpine\n" });
  try {
    assert.match(failsOn(root, "node-version").join(), /node:18/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("compose-prod-images: a :latest fallback is rejected", () => {
  const root = makeFixture({
    "docker-compose.prod.yml":
      "services:\n  backend:\n    image: ${BACKEND_IMAGE:-ghcr.io/anomalyco/vardiyasystem/backend:latest}\n",
  });
  try {
    const failures = failsOn(root, "compose-prod-images").join();
    assert.match(failures, /fallback value/);
    assert.match(failures, /:latest/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("compose-prod-syntax: an obsolete version key is caught", () => {
  const root = makeFixture({
    "docker-compose.prod.yml": `version: '3.8'\n${files["docker-compose.prod.yml"]}`,
  });
  try {
    assert.match(
      failsOn(root, "compose-prod-syntax").join(),
      /obsolete top-level version/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("k8s-images: a floating tag is caught, third-party images are not flagged", () => {
  const root = makeFixture({
    "k8s/backend-deployment.yaml": files["k8s/backend-deployment.yaml"].replace(
      "backend:v1.0.0",
      "backend:latest",
    ),
  });
  try {
    assert.match(failsOn(root, "k8s-images").join(), /immutable tag/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  const ok = makeFixture({
    "k8s/extra.yaml":
      "containers:\n  - image: postgres:15-alpine\n  - image: bitnami/pgbouncer:1.23\n",
  });
  try {
    assert.deepEqual(failsOn(ok, "k8s-images"), []);
  } finally {
    rmSync(ok, { recursive: true, force: true });
  }
});

test("k8s-service-accounts: a workload naming an undeclared account is caught", () => {
  const root = makeFixture({
    "k8s/frontend-deployment.yaml": files[
      "k8s/frontend-deployment.yaml"
    ].replace("vardiya-frontend", "vardiya-web"),
  });
  try {
    assert.match(failsOn(root, "k8s-service-accounts").join(), /vardiya-web/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("k8s-service-accounts: dropping service-account.yaml from kustomization is caught", () => {
  const root = makeFixture({
    "k8s/kustomization.yaml": "resources:\n  - backend-deployment.yaml\n",
  });
  try {
    assert.match(
      failsOn(root, "k8s-service-accounts").join(),
      /service-account\.yaml/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("k8s-secret-template: applying secrets.yaml is caught", () => {
  const root = makeFixture({
    "k8s/kustomization.yaml":
      files["k8s/kustomization.yaml"] + "  - secrets.yaml\n",
  });
  try {
    assert.match(
      failsOn(root, "k8s-secret-template").join(),
      /applies secrets\.yaml/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("k8s-secret-template: a committed secret value is caught", () => {
  const root = makeFixture({
    "k8s/secrets.yaml": files["k8s/secrets.yaml"].replace(
      'db_password: ""',
      "db_password: hunter2",
    ),
  });
  try {
    assert.match(
      failsOn(root, "k8s-secret-template").join(),
      /non-empty value for db_password/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("health-endpoints: a probe path the backend does not serve is caught", () => {
  const root = makeFixture({
    "k8s/backend-deployment.yaml": files["k8s/backend-deployment.yaml"].replace(
      "/api/v1/health/ready",
      "/api/v2/health/ready",
    ),
  });
  try {
    assert.match(
      failsOn(root, "health-endpoints").join(),
      /\/api\/v2\/health\/ready/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("health-endpoints: dropping the version prefix from main.ts invalidates the probe", () => {
  const root = makeFixture({
    "backend/src/main.ts": files["backend/src/main.ts"].replace(
      "prefix: 'v',",
      "",
    ),
  });
  try {
    assert.match(
      failsOn(root, "health-endpoints").join(),
      /probes \/api\/v1\/health\/live/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("health-endpoints: a frontend without an exact /health location is caught", () => {
  const root = makeFixture({
    "frontend/nginx.conf":
      "server {\n  location / {\n    try_files $uri /index.html;\n  }\n}\n",
  });
  try {
    assert.match(
      failsOn(root, "health-endpoints").join(),
      /frontend\/nginx\.conf/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("workflows-have-jobs: a job-less workflow is caught", () => {
  const root = makeFixture({
    ".github/workflows/ci.yml": "# All logic moved to pr-validation.yml\n",
  });
  try {
    assert.match(
      failsOn(root, "workflows-have-jobs").join(),
      /ci\.yml declares no jobs/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("workflow-scripts-exist: calling a removed script is caught", () => {
  const root = makeFixture({
    ".github/workflows/pr-validation.yml": [
      "name: PR",
      "jobs:",
      "  e2e:",
      "    steps:",
      "      - run: npm run test:e2e",
      "        working-directory: frontend",
      "",
    ].join("\n"),
  });
  try {
    assert.match(
      failsOn(root, "workflow-scripts-exist").join(),
      /has no such script/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("workflow-scripts-exist: a matrix working directory is not false-flagged", () => {
  const root = makeFixture({
    ".github/workflows/pr-validation.yml": [
      "name: PR",
      "jobs:",
      "  unit:",
      "    steps:",
      "      - run: npm run lint",
      "        working-directory: ${{ matrix.workspace }}",
      "",
    ].join("\n"),
  });
  try {
    assert.deepEqual(failsOn(root, "workflow-scripts-exist"), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("no-committed-secrets: a tracked .env is caught but an ignored one is not", () => {
  // ".env" without a slash matches at any depth, exactly as git behaves, so the
  // ignored case is the working-tree file a developer already has.
  const ignored = makeFixture({
    "backend/.env": "DATABASE_URL=postgres://x\n",
  });
  try {
    assert.deepEqual(failsOn(ignored, "no-committed-secrets"), []);
  } finally {
    rmSync(ignored, { recursive: true, force: true });
  }
  const tracked = makeFixture({
    "config/service.env": "DATABASE_URL=postgres://x\n",
  });
  try {
    assert.match(
      failsOn(tracked, "no-committed-secrets").join(),
      /config\/service\.env/,
    );
  } finally {
    rmSync(tracked, { recursive: true, force: true });
  }
});

test("no-committed-secrets: .env.example is allowed, secret files are not", () => {
  const root = makeFixture({
    ".gitignore": "node_modules/\n.env\n",
    ".env.example": "POSTGRES_USER=vardiya\n",
    "secrets/db_password.txt": "oops\n",
    "secrets/.gitkeep": "",
  });
  try {
    const failures = failsOn(root, "no-committed-secrets");
    assert.equal(failures.length, 1);
    assert.match(failures[0], /secrets\/db_password\.txt/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("no-committed-secrets: key material is caught", () => {
  const root = makeFixture({
    "certs/server.key": "-----BEGIN PRIVATE KEY-----\n",
  });
  try {
    assert.match(
      failsOn(root, "no-committed-secrets").join(),
      /certs\/server\.key/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("secret-contract: an undocumented secret file is caught", () => {
  const root = makeFixture({
    "secrets/README.md":
      "Required secret files: db_password.txt, grafana_admin_password.txt\n",
  });
  try {
    const failures = failsOn(root, "secret-contract");
    assert.equal(failures.length, 1);
    assert.match(failures[0], /does not document slack_webhook\.txt/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("lint-baseline: a corrupt or missing baseline is caught", () => {
  const corrupt = makeFixture({ "backend/eslint-baseline.json": "{ not json" });
  try {
    assert.match(failsOn(corrupt, "lint-baseline").join(), /not valid JSON/);
  } finally {
    rmSync(corrupt, { recursive: true, force: true });
  }
  const missing = makeFixture({ "backend/eslint-baseline.json": null });
  try {
    assert.match(failsOn(missing, "lint-baseline").join(), /not valid JSON/);
  } finally {
    rmSync(missing, { recursive: true, force: true });
  }
});

test("lint-baseline: a lint script that bypasses the gate is caught", () => {
  const root = makeFixture({
    "backend/package.json": JSON.stringify(
      { scripts: { lint: "eslint src/" } },
      null,
      2,
    ),
  });
  try {
    assert.match(
      failsOn(root, "lint-baseline").join(),
      /no longer runs the baseline gate/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rollback-script: a documented but missing executable is caught", () => {
  const root = makeFixture({ "scripts/rollback.sh": null });
  try {
    assert.match(
      failsOn(root, "rollback-script").join(),
      /scripts\/rollback\.sh is missing/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("postgres-version-aligned: a stray PG major in one layer is caught", () => {
  const root = makeFixture({
    "k8s/postgres-statefulset.yaml":
      "spec:\n  containers:\n    image: postgres:17-alpine\n",
  });
  try {
    assert.match(failsOn(root, "postgres-version-aligned").join(), /17/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("postgres-version-aligned: no pinned postgres anywhere is caught", () => {
  const root = makeFixture({
    "docker-compose.prod.yml":
      "services:\n  postgres:\n    image: some-other-db:9\n",
    "k8s/postgres-statefulset.yaml":
      "spec:\n  containers:\n    image: some-other-db:9\n",
    "scripts/restore-check.sh":
      "#!/usr/bin/env bash\necho no postgres image pinned here\n",
    "infra/helm/vardiya-platform/values.yaml":
      "postgres:\n  enabled: true\n  image:\n    repository: postgres\n    tag: <unset>\n",
  });
  try {
    const failures = failsOn(root, "postgres-version-aligned");
    assert.ok(failures.length > 0);
    assert.match(failures.join(), /postgres/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("infra-image-parity: a pgbouncer drift between compose and helm is caught", () => {
  const root = makeFixture({
    "docker-compose.prod.yml": files["docker-compose.prod.yml"].replace(
      "1.24.1-debian-12-r10",
      "1.23",
    ),
  });
  try {
    assert.match(
      failsOn(root, "infra-image-parity").join(),
      /pgbouncer mismatch/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("sealed-secret-contract: a missing sealed key is caught", () => {
  const root = makeFixture({
    "infra/sealed-secrets/backend-secrets.yaml": files[
      "infra/sealed-secrets/backend-secrets.yaml"
    ].replace("    database_direct_url: AgAA...\n", ""),
  });
  try {
    assert.match(
      failsOn(root, "sealed-secret-contract").join(),
      /database_direct_url/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("sealed-secret-contract: a secret name the chart references but does not seal is caught", () => {
  const root = makeFixture({
    "infra/helm/vardiya-platform/values.yaml": files[
      "infra/helm/vardiya-platform/values.yaml"
    ].replace("vardiya-backend-secrets", "vardiya-app-backend-secrets"),
  });
  try {
    assert.match(
      failsOn(root, "sealed-secret-contract").join(),
      /vardiya-app-backend-secrets/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("workflow-image-tags: an unpinned workflow image is caught", () => {
  const root = makeFixture({
    ".github/workflows/ci.yml":
      "name: CI\njobs:\n  test:\n    runs-on: ubuntu-24.04\n    services:\n      postgres:\n        image: postgres\n",
  });
  try {
    assert.match(
      failsOn(root, "workflow-image-tags").join(),
      /unpinned service image "postgres"/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("restore-scripts: a restore path that drops pg_restore is caught", () => {
  const root = makeFixture({
    "scripts/restore-db.sh":
      '#!/bin/bash\ngunzip -c "$BACKUP_FILE" | psql --dbname=vardiyasystem\n',
  });
  try {
    assert.match(
      failsOn(root, "restore-scripts").join(),
      /does not restore via pg_restore/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("restore-scripts: a missing restore chain member is caught", () => {
  const root = makeFixture({ "scripts/restore-check.sh": null });
  try {
    assert.match(
      failsOn(root, "restore-scripts").join(),
      /restore-check\.sh is missing/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a check that reads a missing file reports an error rather than crashing", () => {
  const root = makeFixture({ "docker-compose.prod.yml": null });
  try {
    const results = runChecks(root);
    const compose = results.find((r) => r.id === "compose-prod-images");
    assert.equal(compose.status, "error");
    assert.match(compose.failures.join(), /ENOENT|no such file/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
