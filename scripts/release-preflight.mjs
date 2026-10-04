#!/usr/bin/env node
// VardiyaOS release preflight.
//
// Verifies the release invariants that have actually broken in this repository
// so a release cannot be cut against a tree that is known to be inconsistent.
// Zero dependencies on purpose: it has to run on a bare checkout.
//
//   node scripts/release-preflight.mjs            # full check
//   node scripts/release-preflight.mjs --verbose  # list passing checks too
//   node scripts/release-preflight.mjs --only node-version,k8s-images
//
// Exit code 0 means every enabled check passed.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED_IMAGE_PREFIX =
  process.env.EXPECTED_IMAGE_PREFIX ?? "ghcr.io/anomalyco/vardiyasystem";

const read = (root, rel) => readFileSync(join(root, rel), "utf8");
const has = (root, rel) => existsSync(join(root, rel));
const stripBom = (s) => s.replace(/^\uFEFF/, "");

const cleanScalar = (v) =>
  v
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .replace(/^>-\s*$/, "")
    .trim();

function readJson(root, rel) {
  try {
    return JSON.parse(stripBom(read(root, rel)));
  } catch (error) {
    return { __error: error.message };
  }
}

const check = (id, title, fn) => ({ id, title, fn });

const CHECKS = [
  check("node-version", "Node version is aligned", (root) => {
    const failures = [];
    const nvmrc = cleanScalar(read(root, ".nvmrc"));
    if (!/^\d+$/.test(nvmrc))
      failures.push(`.nvmrc is not a bare major version: "${nvmrc}"`);

    const workflows = listFiles(root, ".github/workflows").filter((f) =>
      f.endsWith(".yml"),
    );
    for (const wf of workflows) {
      const text = stripBom(read(root, wf));
      const m = /NODE_VERSION:\s*['"]?([\d.]+)['"]?/.exec(text);
      if (m && cleanScalar(m[1]) !== nvmrc) {
        failures.push(`${wf} pins NODE_VERSION ${m[1]}, .nvmrc says ${nvmrc}`);
      }
    }

    for (const df of ["backend/Dockerfile", "frontend/Dockerfile"]) {
      if (!has(root, df)) continue;
      const text = stripBom(read(root, df));
      const versions = [...text.matchAll(/FROM\s+node:([\d.]+)/g)].map(
        (m) => m[1],
      );
      for (const v of versions) {
        if (v !== nvmrc)
          failures.push(`${df} builds on node:${v}, .nvmrc says ${nvmrc}`);
      }
      if (versions.length === 0) failures.push(`${df} has no node base image`);
    }

    return failures;
  }),

  check(
    "compose-prod-images",
    "Production compose requires immutable images",
    (root) => {
      const failures = [];
      const text = stripBom(read(root, "docker-compose.prod.yml"));
      for (const service of ["BACKEND_IMAGE", "FRONTEND_IMAGE"]) {
        if (!text.includes(`${service}:`)) {
          failures.push(
            `docker-compose.prod.yml does not reference ${service}`,
          );
          continue;
        }
        if (!text.includes(`${service}:?`)) {
          failures.push(
            `${service} has a fallback value; an unpinned deploy must not be possible`,
          );
        }
      }
      if (/image:.*:latest/.test(text)) {
        failures.push(
          "docker-compose.prod.yml still contains a :latest image reference",
        );
      }
      return failures;
    },
  ),

  check(
    "compose-prod-syntax",
    "Production compose has no obsolete keys",
    (root) => {
      const failures = [];
      const text = stripBom(read(root, "docker-compose.prod.yml"));
      if (/^version:/m.test(text)) {
        failures.push(
          "docker-compose.prod.yml still declares an obsolete top-level version key",
        );
      }
      return failures;
    },
  ),

  check(
    "k8s-images",
    "Kubernetes images are pinned and correctly addressed",
    (root) => {
      const failures = [];
      for (const file of listFiles(root, "k8s").filter((f) =>
        f.endsWith(".yaml"),
      )) {
        const text = stripBom(read(root, file));
        for (const m of text.matchAll(/image:\s*(\S+)/g)) {
          const image = m[1];
          if (!image.startsWith(`${EXPECTED_IMAGE_PREFIX}/`)) continue;
          if (image.endsWith(":latest") || !image.includes(":")) {
            failures.push(`${file}: ${image} must use an immutable tag`);
          }
        }
      }
      return failures;
    },
  ),

  check(
    "k8s-service-accounts",
    "Every referenced service account is shipped",
    (root) => {
      const failures = [];
      const kustomization = stripBom(read(root, "k8s/kustomization.yaml"));
      const resources = [
        ...kustomization.matchAll(/^\s+-\s+([\w.-]+\.ya?ml)\s*$/gm),
      ].map((m) => m[1]);

      if (!resources.includes("service-account.yaml")) {
        failures.push(
          "k8s/kustomization.yaml does not include service-account.yaml",
        );
      }

      const saManifest = stripBom(read(root, "k8s/service-account.yaml"));
      const defined = new Set(
        [
          ...saManifest.matchAll(
            /kind:\s*ServiceAccount\s*\n(?:.*\n)*?\s+name:\s*([\w-]+)/g,
          ),
        ].map((m) => m[1]),
      );

      for (const file of listFiles(root, "k8s").filter((f) =>
        f.endsWith(".yaml"),
      )) {
        const text = stripBom(read(root, file));
        for (const m of text.matchAll(/serviceAccountName:\s*([\w-]+)/g)) {
          if (!defined.has(m[1])) {
            failures.push(
              `${file} references service account "${m[1]}" which is not declared`,
            );
          }
        }
      }
      return failures;
    },
  ),

  check(
    "k8s-secret-template",
    "Kubernetes secret template stays empty and unapplied",
    (root) => {
      const failures = [];
      const kustomization = stripBom(read(root, "k8s/kustomization.yaml"));
      const resources = [
        ...kustomization.matchAll(/^\s+-\s+([\w.-]+\.ya?ml)\s*$/gm),
      ].map((m) => m[1]);
      if (resources.includes("secrets.yaml")) {
        failures.push(
          "kustomization.yaml applies secrets.yaml; blank credentials must fail at apply time",
        );
      }
      const text = stripBom(read(root, "k8s/secrets.yaml"));
      for (const m of text.matchAll(/^\s+([\w_]+):\s*"?(.*?)"?\s*$/gm)) {
        const [, key, value] = m;
        if (
          !key.endsWith("_password") &&
          !key.endsWith("_secret") &&
          !key.includes("webhook")
        )
          continue;
        if (value.length > 0)
          failures.push(
            `k8s/secrets.yaml defines a non-empty value for ${key}`,
          );
      }
      return failures;
    },
  ),

  check(
    "health-endpoints",
    "Probes reference endpoints the code actually serves",
    (root) => {
      const failures = [];
      const controller = stripBom(
        read(root, "backend/src/modules/health/health.controller.ts"),
      );
      const main = stripBom(read(root, "backend/src/main.ts"));
      const nginx = stripBom(read(root, "frontend/nginx.conf"));

      const prefix = /setGlobalPrefix\(['"]([^'"]+)['"]\)/.exec(main)?.[1];
      const version = /defaultVersion:\s*['"]?([^,'"}]+)/.exec(main)?.[1];
      if (!prefix)
        failures.push("backend/src/main.ts does not call setGlobalPrefix");
      if (!version)
        failures.push("backend/src/main.ts does not set a defaultVersion");

      // URI versioning can prefix the version segment ("/api/v1/..."), so the
      // option has to be read or every derived path is wrong.
      const versioning =
        /enableVersioning\(\{([\s\S]*?)\}\)/.exec(main)?.[1] ?? "";
      const versionPrefix =
        /prefix:\s*['"]([^'"]*)['"]/.exec(versioning)?.[1] ?? "";

      const live = /@Get\(['"]live['"]\)/.test(controller);
      const ready = /@Get\(['"]ready['"]\)/.test(controller);
      if (!live) failures.push("health controller does not expose live");
      if (!ready) failures.push("health controller does not expose ready");

      const backendPaths = new Set();
      if (prefix && version) {
        const base = `/${prefix}/${versionPrefix}${version}`;
        if (live) backendPaths.add(`${base}/health/live`);
        if (ready) backendPaths.add(`${base}/health/ready`);
      }

      // Collect any versioned API probe, not just /v1, so a probe pointed at a
      // version the API does not serve is actually compared.
      const probes = [];
      for (const file of listFiles(root, "k8s").filter((f) =>
        f.endsWith(".yaml"),
      )) {
        const text = stripBom(read(root, file));
        for (const m of text.matchAll(/path:\s*(\/api\/v\d+\/health\/\w+)/g))
          probes.push([file, m[1]]);
      }
      const deploy = stripBom(read(root, ".github/workflows/deploy.yml"));
      for (const m of deploy.matchAll(
        /127\.0\.0\.1:3000(\/api\/v1\/health\/\w+)/g,
      )) {
        probes.push([".github/workflows/deploy.yml", m[1]]);
      }
      for (const [file, p] of probes) {
        if (!backendPaths.has(p)) {
          failures.push(
            `${file} probes ${p}, which the backend does not serve`,
          );
        }
      }

      if (!/location\s+=\s+\/health\b/.test(nginx)) {
        failures.push(
          "frontend/nginx.conf has no exact /health location for the container healthcheck",
        );
      }
      return failures;
    },
  ),

  check(
    "workflows-have-jobs",
    "Every workflow defines at least one job",
    (root) => {
      const failures = [];
      for (const file of listFiles(root, ".github/workflows").filter((f) =>
        /\.ya?ml$/.test(f),
      )) {
        const text = stripBom(read(root, file));
        const jobKeys = [...text.matchAll(/^ {2}([A-Za-z0-9_-]+):\s*$/gm)].map(
          (m) => m[1],
        );
        if (jobKeys.length === 0) {
          failures.push(
            `${file} declares no jobs; GitHub reports it as an invalid workflow`,
          );
        }
      }
      return failures;
    },
  ),

  check(
    "workflow-scripts-exist",
    "Workflows only call scripts that exist",
    (root) => {
      const failures = [];
      const cache = new Map();
      const scriptsFor = (workspace) => {
        if (!cache.has(workspace)) {
          const pkg = readJson(root, `${workspace}/package.json`);
          cache.set(workspace, pkg?.scripts ?? null);
        }
        return cache.get(workspace);
      };

      // A workflow step is written as "- run: ..." with its "working-directory:"
      // on one of the following lines, so the two have to be paired per step
      // before the script name can be resolved.
      for (const file of listFiles(root, ".github/workflows").filter((f) =>
        f.endsWith(".yml"),
      )) {
        const lines = stripBom(read(root, file)).split(/\r?\n/);
        const steps = [];
        let current = null;
        lines.forEach((line, index) => {
          if (/^\s*-\s+\S/.test(line)) {
            if (current) steps.push(current);
            current = { line: index + 1, text: line, workingDirectory: null };
            return;
          }
          const wd = /^\s*working-directory:\s*(.+?)\s*$/.exec(line);
          if (wd && current) current.workingDirectory = cleanScalar(wd[1]);
        });
        if (current) steps.push(current);

        for (const step of steps) {
          const run = /\bnpm\s+(?:run|run-script)\s+([A-Za-z0-9:_-]+)/.exec(
            step.text,
          );
          if (!run) continue;
          const script = run[1];
          const workspace = step.workingDirectory;
          if (!workspace || workspace.includes("${{")) continue;
          const scripts = scriptsFor(workspace);
          if (scripts === null) {
            failures.push(
              `${file}:${step.line} targets ${workspace}, which has no package.json`,
            );
            continue;
          }
          if (!(script in scripts)) {
            failures.push(
              `${file}:${step.line} runs "${script}" but ${workspace}/package.json has no such script`,
            );
          }
        }
      }
      return failures;
    },
  ),

  check("no-committed-secrets", "No secret material is committed", (root) => {
    const failures = [];
    const tracked = listFiles(root, ".");
    const ignored = has(root, ".gitignore") ? readGitignore(root) : () => false;
    const isNoise = (p) =>
      /(^|[\\/])(node_modules|dist|coverage|\.git|test-results|playwright-report)([\\/]|$)/.test(
        p,
      );

    for (const file of tracked) {
      if (isNoise(file) || ignored(file)) continue;
      const name = file.split(/[\\/]/).pop();
      // Covers `.env`, `.env.production` and `service.env`; templates are fine.
      const isEnvFile = /(^|\.)env$/.test(name) || /^\.env\./.test(name);
      if (isEnvFile && !/\.(example|template|sample)$/.test(name)) {
        failures.push(`${file} looks like committed environment configuration`);
      }
      if (/\.(pem|key|p12|pfx|jks|keystore)$/i.test(name)) {
        failures.push(`${file} looks like committed key material`);
      }
      if (/^id_(rsa|dsa|ecdsa|ed25519)$/.test(name)) {
        failures.push(`${file} looks like a committed private key`);
      }
      // .gitkeep only exists to preserve an empty directory; it holds nothing.
      const inSecretsDir = /^secrets\//.test(file);
      if (inSecretsDir && file !== "secrets/README.md" && name !== ".gitkeep") {
        failures.push(
          `${file} is runtime secret material and must not be committed`,
        );
      }
    }
    return failures;
  }),

  check("secret-contract", "Compose secret files are documented", (root) => {
    const failures = [];
    const compose = stripBom(read(root, "docker-compose.prod.yml"));
    const readme = has(root, "secrets/README.md")
      ? stripBom(read(root, "secrets/README.md"))
      : "";
    if (!readme)
      return [
        "secrets/README.md is missing, so the secret contract is undocumented",
      ];

    const referenced = new Set(
      [...compose.matchAll(/file:\s*\.\/secrets\/([\w.-]+)/g)].map((m) => m[1]),
    );
    if (referenced.size === 0)
      return ["docker-compose.prod.yml references no secret files"];
    for (const name of referenced) {
      if (!readme.includes(name))
        failures.push(`secrets/README.md does not document ${name}`);
    }
    return failures;
  }),

  check(
    "lint-baseline",
    "Backend lint gate has a committed baseline",
    (root) => {
      const failures = [];
      const baseline = readJson(root, "backend/eslint-baseline.json");
      if (baseline.__error)
        return [
          `backend/eslint-baseline.json is not valid JSON: ${baseline.__error}`,
        ];
      if (typeof baseline.maxErrors !== "number") {
        failures.push("backend/eslint-baseline.json has no numeric maxErrors");
      }
      const pkg = readJson(root, "backend/package.json");
      if (pkg?.scripts?.lint && !pkg.scripts.lint.includes("lint-gate")) {
        failures.push('backend "lint" script no longer runs the baseline gate');
      }
      return failures;
    },
  ),

  check("rollback-script", "Rollback procedure is executable", (root) => {
    const failures = [];
    if (!has(root, "scripts/rollback.sh")) {
      failures.push(
        "scripts/rollback.sh is missing but docs/devops/rollback.md documents it",
      );
    }
    if (!has(root, "docs/devops/rollback.md")) {
      failures.push("docs/devops/rollback.md is missing");
    }
    return failures;
  }),

  check(
    "postgres-version-aligned",
    "Every layer runs the same PostgreSQL major",
    (root) => {
      // PG15 is the shipped major (compose dev/prod, helm postgres chart,
      // k8s statefulset). A CI service stuck on a different major was the
      // exact drift that broke this repo, so it gets its own gate.
      const failures = [];
      const majors = new Set();
      // Only actual image declarations count ("image: postgres:15-alpine" and
      // the restore-check default). Connection strings like
      // "@postgres:5432" are ports, not image tags, and must not trip the gate.
      const files = [
        "docker-compose.prod.yml",
        "docker-compose.yml",
        "k8s/postgres-statefulset.yaml",
      ];
      const imageRef = /\bimage:\s*["']?postgres[:/](\d+)/g;
      for (const rel of files) {
        if (!has(root, rel)) continue;
        const text = stripBom(read(root, rel));
        for (const m of text.matchAll(imageRef)) majors.add(m[1]);
      }
      for (const wf of listFiles(root, ".github/workflows").filter((f) =>
        f.endsWith(".yml"),
      )) {
        const text = stripBom(read(root, wf));
        for (const m of text.matchAll(imageRef)) majors.add(m[1]);
      }
      if (has(root, "scripts/restore-check.sh")) {
        const text = stripBom(read(root, "scripts/restore-check.sh"));
        for (const m of text.matchAll(
          /RESTORE_CHECK_IMAGE[^:]*[:=\/-]*postgres[:/](\d+)/g,
        )) {
          majors.add(m[1]);
        }
      }
      const helmRel = "infra/helm/vardiya-platform/values.yaml";
      if (has(root, helmRel)) {
        const block = yamlBlock(stripBom(read(root, helmRel)), "postgres");
        if (block) {
          const tag = /(?:tag|version):\s*["']?(\d+)/.exec(block);
          if (tag) majors.add(tag[1]);
          else
            failures.push(
              `${helmRel} postgres block has no pinned image tag/version`,
            );
        } else {
          failures.push(`${helmRel} has no postgres block`);
        }
      }
      if (failures.length) return failures;
      if (majors.size === 0) {
        return [
          "no pinned postgres image found in any layer; the PG major must be explicit",
        ];
      }
      if (majors.size > 1) {
        return [
          `postgres image majors diverge across layers: ${[...majors].sort().join(", ")}`,
        ];
      }
      return [];
    },
  ),

  check(
    "infra-image-parity",
    "Smoke-tested infra images match the helm chart",
    (root) => {
      // The compose production stack is what the deploy pipeline smoke-tests;
      // the helm chart must run the exact same shared infra images, or the test
      // and the release diverge. pgbouncer is the case in point.
      const failures = [];
      const composeRel = "docker-compose.prod.yml";
      if (!has(root, composeRel)) return [`${composeRel} is missing`];
      const compose = stripBom(read(root, composeRel));
      const composeRef = /([\w./-]*pgbouncer):([\w.-]+)/i.exec(compose);
      if (!composeRef) {
        return [
          `${composeRel} has no pgbouncer image for the smoke test to pin against`,
        ];
      }
      const helmRel = "infra/helm/vardiya-platform/values.yaml";
      if (!has(root, helmRel)) return [`${helmRel} is missing`];
      const block = yamlBlock(stripBom(read(root, helmRel)), "pgbouncer");
      const helmRepo = block
        ? /repository:\s*([\w./-]+)/.exec(block)?.[1]
        : null;
      const helmTag = block ? /tag:\s*([\w.-]+)/.exec(block)?.[1] : null;
      if (!helmRepo || !helmTag)
        return [`${helmRel} pgbouncer block has no repository:tag image`];
      if (`${composeRef[1]}:${composeRef[2]}` !== `${helmRepo}:${helmTag}`) {
        failures.push(
          `pgbouncer mismatch: compose smoke-test is ${composeRef[1]}:${composeRef[2]}, helm renders ${helmRepo}:${helmTag}`,
        );
      }
      // The k8s base overlay has to run the same image too, or the manifest
      // people apply by hand silently diverges from what was tested.
      const k8sRel = "k8s/postgres-statefulset.yaml";
      if (has(root, k8sRel)) {
        const k8sRef = /([\w./-]*pgbouncer):([\w.-]+)/i.exec(
          stripBom(read(root, k8sRel)),
        );
        if (
          k8sRef &&
          `${k8sRef[1]}:${k8sRef[2]}` !== `${helmRepo}:${helmTag}`
        ) {
          failures.push(
            `pgbouncer mismatch: k8s base is ${k8sRef[1]}:${k8sRef[2]}, helm renders ${helmRepo}:${helmTag}`,
          );
        }
      }
      return failures;
    },
  ),

  check(
    "sealed-secret-contract",
    "Helm secrets are all sealed with the right keys",
    (root) => {
      // The sealed manifests are the source of truth for what the cluster gets.
      // The chart reads lowercase keys; a sealed stub that ships different key
      // names fails silently at runtime, so the names are part of the contract.
      const failures = [];
      const sealedRel = "infra/sealed-secrets/backend-secrets.yaml";
      if (!has(root, sealedRel)) return [`${sealedRel} is missing`];
      const sealed = sealedSecrets(root);
      if (sealed.error) return [sealed.error];

      const REQUIRED_KEYS = {
        "vardiya-backend-secrets": [
          "database_url",
          "database_direct_url",
          "jwt_access_secret",
          "jwt_refresh_secret",
          "cookie_secret",
          "vapid_public_key",
          "vapid_private_key",
          "encryption_master_key",
          "redis_url",
        ],
        "vardiya-db-secrets": ["postgres_password"],
        "vardiya-monitoring-secrets": ["admin_password", "slack_webhook"],
        "vardiya-redis-secrets": ["redis_password"],
      };
      for (const [name, keys] of Object.entries(REQUIRED_KEYS)) {
        const entry = sealed.byName.get(name);
        if (!entry) {
          failures.push(`${sealedRel} does not seal ${name}`);
          continue;
        }
        if (entry.namespace !== "vardiya") {
          failures.push(
            `${name} is sealed for namespace "${entry.namespace}", chart deploys into vardiya`,
          );
        }
        for (const key of keys) {
          if (!entry.keys.has(key))
            failures.push(`${name} is missing sealed key "${key}"`);
        }
      }

      // Every secret value the helm values reference must resolve to a sealed
      // Secret, so a references typo fails at preflight instead of at rollout.
      for (const rel of listFiles(root, "infra/helm/vardiya-platform").filter(
        (f) => /(^|[\\/])values(?:[\\/].*)?\.ya?ml$/.test(f),
      )) {
        const text = stripBom(read(root, rel));
        for (const m of text.matchAll(
          /\b(?:existingSecret|adminPasswordSecret|secretName):\s*([\w-]+)/g,
        )) {
          const name = m[1];
          if (!/^vardiya-[\w-]*secrets$/.test(name)) continue;
          if (!sealed.byName.has(name)) {
            failures.push(
              `${rel} references ${name}, which is not sealed in ${sealedRel}`,
            );
          }
        }
      }
      return failures;
    },
  ),

  check(
    "workflow-image-tags",
    "Workflow service images are version pinned",
    (root) => {
      const failures = [];
      for (const wf of listFiles(root, ".github/workflows").filter((f) =>
        f.endsWith(".yml"),
      )) {
        const text = stripBom(read(root, wf));
        for (const m of text.matchAll(/^\s*image:\s*([^\s#]+)/gm)) {
          const image = m[1];
          if (image.startsWith("$") || image.startsWith("-")) continue;
          if (!image.includes(":")) {
            failures.push(
              `${wf} runs the unpinned service image "${image}" (pin a tag or digest)`,
            );
          }
        }
      }
      return failures;
    },
  ),

  check(
    "restore-scripts",
    "Backup and restore scripts stay mutually compatible",
    (root) => {
      const failures = [];
      const expected = [
        "backup-db.sh",
        "restore-db.sh",
        "restore-db.ps1",
        "verify-backup.sh",
        "restore-check.sh",
      ];
      for (const f of expected) {
        if (!has(root, `scripts/${f}`))
          failures.push(`scripts/${f} is missing from the restore chain`);
      }
      if (failures.length) return failures;
      const script = (f) => stripBom(read(root, `scripts/${f}`));
      const backup = script("backup-db.sh");
      const restore = script("restore-db.sh");
      const restorePs = script("restore-db.ps1");
      const verify = script("verify-backup.sh");
      const restoreCheck = script("restore-check.sh");

      // backup-db.sh writes custom-format dumps as .sql.gz; everything else has
      // to agree with that convention or "just works" restore paths break.
      if (!/format=custom/i.test(backup)) {
        failures.push(
          "scripts/backup-db.sh does not produce a custom-format dump (pg_restore incompatible)",
        );
      }
      if (!/\.sql\.gz|\.gz/.test(backup))
        failures.push("scripts/backup-db.sh does not emit .gz archives");
      if (!/pg_restore/.test(restore))
        failures.push("scripts/restore-db.sh does not restore via pg_restore");
      if (!/gunzip|-dc|gz/.test(restore))
        failures.push(
          "scripts/restore-db.sh cannot handle the .sql.gz convention",
        );
      if (!/pg_restore/.test(restorePs))
        failures.push("scripts/restore-db.ps1 does not restore via pg_restore");
      if (!/\.gz/.test(restorePs))
        failures.push(
          "scripts/restore-db.ps1 cannot handle the .sql.gz convention",
        );
      if (!/pg_restore\s+--list/.test(verify)) {
        failures.push(
          "scripts/verify-backup.sh does not validate archives with pg_restore --list",
        );
      }
      if (!/gzip|gunzip/.test(verify))
        failures.push("scripts/verify-backup.sh does not check gzip integrity");
      if (!/_prisma_migrations/.test(restoreCheck)) {
        failures.push(
          "scripts/restore-check.sh does not verify the prisma migration ledger",
        );
      }
      if (!/pg_restore/.test(restoreCheck)) {
        failures.push(
          "scripts/restore-check.sh does not restore via pg_restore",
        );
      }
      return failures;
    },
  ),
];

// Gitignore-aware so a developer's local, correctly ignored .env does not read
// as a committed secret. Patterns are matched on the repository-relative path
// and on the basename, which covers the forms actually used in this repo.
function readGitignore(root) {
  const patterns = stripBom(read(root, ".gitignore"))
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && !l.startsWith("!"))
    .map((l) => l.replace(/^\//, "").replace(/\/$/, ""))
    .map(
      (p) =>
        new RegExp(
          "^" +
            p.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") +
            "$",
        ),
    );

  return (relPath) => {
    const base = relPath.split("/").pop();
    return patterns.some((re) => re.test(relPath) || re.test(base));
  };
}

// Returns the indented block belonging to a top-level YAML key, or null.
function yamlBlock(text, key) {
  const re = new RegExp(
    `(?:^|\\n)${key}:\\s*(?:\\n|$)([\\s\\S]*?)(?=\\n\\S|$)`,
  );
  const m = re.exec(text);
  return m ? m[1] : null;
}

// Parses the sealed secret manifest into name → { namespace, keys }.
function sealedSecrets(root) {
  const byName = new Map();
  for (const doc of stripBom(
    read(root, "infra/sealed-secrets/backend-secrets.yaml"),
  ).split(/\n---\n/)) {
    if (!/\bkind:\s*SealedSecret\b/.test(doc)) continue;
    const name = /^metadata:[\s\S]*?\n\s+name:\s*([\w-]+)/m.exec(doc)?.[1];
    if (!name)
      return {
        error:
          "infra/sealed-secrets/backend-secrets.yaml has a SealedSecret without metadata.name",
      };
    const namespace = /^metadata:[\s\S]*?\n\s+namespace:\s*([\w-]+)/m.exec(
      doc,
    )?.[1];
    const tail = doc.slice(doc.indexOf("encryptedData:"));
    const keys = new Set(
      [...tail.matchAll(/^\s{4}([\w.-]+):\s+\S/gm)].map((m) => m[1]),
    );
    byName.set(name, { namespace, keys });
  }
  if (byName.size === 0) {
    return {
      error:
        "infra/sealed-secrets/backend-secrets.yaml declares no SealedSecret kinds",
    };
  }
  return { byName };
}

function listFiles(root, rel) {
  const abs = join(root, rel);
  if (!existsSync(abs)) return [];
  const out = [];
  const walkDir = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walkDir(full);
      else out.push(relative(root, full).split("\\").join("/"));
    }
  };
  walkDir(abs);
  return out;
}

export function runChecks(root, { only = null, skip = [] } = {}) {
  const selected = only ? CHECKS.filter((c) => only.includes(c.id)) : CHECKS;
  return selected
    .filter((c) => !skip.includes(c.id))
    .map((c) => {
      try {
        const failures = c.fn(root);
        return {
          id: c.id,
          title: c.title,
          status: failures.length ? "fail" : "pass",
          failures,
        };
      } catch (error) {
        return {
          id: c.id,
          title: c.title,
          status: "error",
          failures: [error.message],
        };
      }
    });
}

function main(argv) {
  const verbose = argv.includes("--verbose");
  const onlyIndex = argv.indexOf("--only");
  const only =
    onlyIndex >= 0 ? argv[onlyIndex + 1].split(",").map((s) => s.trim()) : null;
  const skipEnvironment =
    argv.includes("--skip-environment") ||
    /^(1|true|yes)$/i.test(process.env.SKIP_ENVIRONMENT_CHECKS ?? "");
  const skip = skipEnvironment ? ["secret-contract"] : [];

  const results = runChecks(ROOT, { only, skip });
  const failed = results.filter((r) => r.status !== "pass");

  process.stdout.write("VardiyaOS release preflight\n\n");
  for (const r of results) {
    if (r.status === "pass" && !verbose) {
      process.stdout.write(`  PASS  ${r.title}\n`);
      continue;
    }
    process.stdout.write(`  ${r.status.toUpperCase().padEnd(4)} ${r.title}\n`);
    for (const f of r.failures) process.stdout.write(`        - ${f}\n`);
  }

  const passed = results.length - failed.length;
  process.stdout.write(`\n${passed}/${results.length} checks passed\n`);
  if (failed.length) {
    process.stdout.write(
      "\nRelease is BLOCKED until the failures above are resolved.\n",
    );
    process.exit(1);
  }
  process.stdout.write("Preflight clean.\n");
}

if (process.argv[1] && process.argv[1].endsWith("release-preflight.mjs")) {
  main(process.argv.slice(2));
}
