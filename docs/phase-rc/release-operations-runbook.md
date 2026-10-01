# VardiyaOS — Production Release Operations Runbook (P4.4 closeout)

Operators in the real production environment execute the P4.4 REPORT §9 items here.
Every step ships with the exact command and a verification gate. **Fails closed**: stop
and roll back (§7) at the first failed gate.

> Scope: release operations only — no new feature development.
> These steps are **ENVIRONMENT-BLOCKED** in the P4.4 development environment (no older
> runner, no registry, no cluster) and are the only unexecuted release lane.

---

## 0. Preconditions & repository integrity gate

Because the git repository was initialized with a thin seed commit, the release must
**verify committed content == validated working tree** before anything runs.

```bash
cd /c/Users/Hasan/OneDrive/Belgeler/GitHub/vardiyasystem   # THE repository (single source of truth)

# 0.1 working tree clean except intentionally untracked? (release must be committed first)
git status --porcelain | wc -l

# 0.2 no secrets, no .env, no runtime artifacts tracked
git ls-files | grep -E '(^|/)(\.env|.*\.secret|\.env\.production$)' && echo 'FAIL: secret tracked' || echo 'ok: no secrets'
git ls-files | grep -E '(dump\.rdb|server_log\.txt|query$|backend/static/)' && echo 'FAIL: stray artifact tracked' || echo 'ok: no stray artifacts'

# 0.3 gates a production release before the pipeline even runs
node scripts/release-preflight.test.mjs                 # preflight test suite (32)
SKIP_ENVIRONMENT_CHECKS=1 node scripts/release-preflight.mjs   # release invariants (17/18 local, 17/17 CI)
bash scripts/release-dry-run.sh --ci                    # render + schema + parity, fails closed
# actionlint on all four workflows must pass
for f in .github/workflows/*.yml; do actionlint "$f" || exit 1; done
```

Result: working tree committed, `git status --porcelain` empty (apart from ignored files),
preflight + dry-run green. Gate 0 failing → stop, fix the repo, do not publish.

---

## 1. Real GitHub Actions run

```bash
gh auth status
# Push the release commit on the intended branch:
git push -u origin main            # triggers ci.yml / pr-validation.yml / security-scan.yml
gh run list --limit 5
gh run watch <run-id>
# Both "ci" and "security-scan" workflows must show success before proceeding.
gh run view <run-id> --log-failed
```

Verify: all jobs green (unit 1172, e2e 85, frontend vitest 153, preflight, GoDryRun).
Security-scan gates (gitleaks, dependency audit) green.

---

## 2. GHCR image publish + digest verification

```bash
# authenticating (PAT with `packages:write`)
echo "$GHCR_TOKEN" | docker login ghcr.io -u hhasanagir --password-stdin

docker build -t ghcr.io/anomalyco/vardiyasystem/backend:p44 -f backend/Dockerfile backend
docker build -t ghcr.io/anomalyco/vardiyasystem/frontend:p44 -f frontend/Dockerfile frontend
docker push ghcr.io/anomalyco/vardiyasystem/backend:p44
docker push ghcr.io/anomalyco/vardiyasystem/frontend:p44

# capture manifest digests (release log)
docker buildx imagetools inspect ghcr.io/anomalyco/vardiyasystem/backend:p44 --format '{{json .Manifest.Digest}}'
docker buildx imagetools inspect ghcr.io/anomalyco/vardiyasystem/frontend:p44 --format '{{json .Manifest.Digest}}'
```

Verification:

- Pushed tags are pinned (`:p44`), **no `:latest`** anywhere in the release manifests (preflight enforces this).
- Record both digests in the release log; deploy only by digest or by the pinned tag used by helm values.

---

## 3. kube-prometheus CRD installation

Install the operator CRDs on the cluster **before** helm so `ServiceMonitor`/`PrometheusRule`/`PodMonitor` resources validate.

```bash
kubectl apply --server-side -f kube-prometheus/manifests/setup/   # CRDs + namespace (or your pinned kube-prometheus release)
kubectl apply --server-side -f kube-prometheus/manifests/         # operator, prometheus, alertmanager, grafana stack
kubectl -n monitoring wait --for=condition=Ready pod -l app.kubernetes.io/name=prometheus-operator --timeout=300s
```

Then apply the product selectors/monitors:

```bash
kubectl apply -n vardiya -f infra/prometheus-operator/service-monitors.yaml
kubectl -n monitoring get servicemonitors	# confirms selection
```

Verification: CRDs present (`kubectl get crd servicemonitors.monitoring.coreos.com`), no apply errors,
operator pod Ready.

---

## 4. Helm install / upgrade

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts   # only if using bundled prometheus
helm -n vardiya upgrade --install vardiya infra/helm/vardiya-platform \
  -f infra/helm/vardiya-platform/values/production.yaml \
  --atomic --timeout 10m        # needs .env / sealed secrets present; see preflight gate 0.2
helm -n vardiya status vardiya
kubectl -n vardiya get pods -o wide
kubectl -n vardiya rollout status deploy/vardiya-backend --timeout=5m
```

Values notes (validated in P4.4):

- `serviceMonitor.path: /api/v1/metrics` (backend exposes metrics here, unauthenticated).
- pgbouncer pods get a `pgbouncer-exporter` sidecar (`:9127`) — do NOT tip pgbouncer to expose port 9127 itself.
- redis args include `--maxmemory 128mb --maxmemory-policy noeviction`.

Verification: `helm status` DEPLOYED, `--atomic` guarantees rollback on failure, all Deployments Ready.

---

## 5. Post-install smoke test

Re-run the exact P4.4 live probe battery against the cluster:

| Check                   | Command                                                                                                                                       |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Backend live/ready      | `curl -f http://<ingress>/api/v1/health/live; curl -f http://<ingress>/api/v1/health/ready`                                                   |
| Metrics scrape endpoint | `curl -f http://<backend-svc>:3000/api/v1/metrics                                                                                             | head`(expect`vardiya\_\*` series) |
| Prometheus targets      | `curl -f http://prometheus.monitoring/api/v1/targets` — all `up`, `pgbouncer` job = exporter pod:9127                                         |
| Alert rules             | `curl -f 'prometheus.../api/v1/rules'` — all 9 rules present, all `inactive`                                                                  |
| Loki ready              | `curl -f http://loki.monitoring:3100/ready` → 200                                                                                             |
| Tempo ready             | `curl -f http://tempo.monitoring:3200/ready` → 200                                                                                            |
| Grafana auth            | `curl -u admin:$(cat /run/secrets/grafana_admin_password) http://grafana.../api/orgs` → 200 (basic auth; login form is brute-force protected) |
| Dashboard               | `/api/search?type=dash-db` shows "VardiyaOS — Production Monitoring"                                                                          |

Also confirm **negative** behavior: stop a backend pod → `BackendDown` fires in ≤2m; restore → resolves.
This proves alerting is not silently broken.

---

## 6. Post-deployment verification (production)

- Grafana: Prometheus datasource default and connected; Loki + Tempo connected; dashboard renders live data.
- Generate real traffic (k6 scenarios in `k6/`) for ≥15 min; verify `HighErrorRate`/`HighLatency` stay silent
  and baseline metrics pinned in the release log.
- Verify PgBouncer exporter shows `pgbouncer_stats_queries_pooled_total > 0` climbing under load.
- Confirm ingress TLS cert validation, auth flow from the public URL.

---

## 7. Rollback drill

`scripts/rollback.sh` backs up state and reinstates the previous image tag. Exercise BEFORE an incident.

```bash
# live rollback procedure (drill on staging-equivalent first):
bash scripts/rollback.sh --container backend --target <previous-tag>   # reads current tag from docker inspect
bash scripts/verify-backup.sh                                          # backup/restore/verify chain
```

Drill acceptance:

- backend returns Healthy within one rollback run;
- no data loss (verify database backup hash + row counts before/after).

Decision rule: **any failed gate in steps 1–6 → do not go live; run rollback drill step 7 in staging,
fix, re-run dry-run gate 0, and advance only after a green re-run.**

---

## 8. Closeout

After §1–§7 all green on the real environment:

- Record: GH Actions run IDs, image digests (`sha256:...`), helm revision, smoke results into `docs/phase-rc/`.
- Mirror the decision back into this repo (marking each item `[x]` + date/operator).
- Do not begin new feature development until every gate is `[x]` and the repository is committed cleanly
  (`git status --porcelain` empty).
