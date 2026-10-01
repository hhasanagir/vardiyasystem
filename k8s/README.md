# K8s Manifests — VardiyaOS

## Quick Start (existing)

```bash
kubectl apply -k k8s/
```

This deploys the base stack: namespace, configs, backend+frontend deployments
(with HPA/PDB/services inlined), PostgreSQL StatefulSet + PgBouncer, Redis, and
Ingress.

`k8s/secrets.yaml` is **not** applied by `kubectl apply -k k8s/`: it only holds
empty placeholders, and applying it would create a `vardiya-secrets` object with
blank credentials that fails at runtime. Provision the real Secret out of band —
prefer the Sealed Secrets in `infra/sealed-secrets/`, or:

```bash
kubectl -n vardiya create secret generic vardiya-secrets \
  --from-literal=db_password="$DB_PASSWORD" \
  --from-literal=jwt_access_secret="$JWT_ACCESS" \
  --from-literal=jwt_refresh_secret="$JWT_REFRESH" \
  --from-literal=slack_webhook="$SLACK_WEBHOOK"
```

The backend pod runs `prisma migrate deploy` in an `initContainer` named
`migrate` before the app container starts, so the migration always runs ahead of
the rollout. If you hand-apply this directory, run the migration before exposing
the new pods.

## Enhanced Manifests (opt-in)

The following files extend the base stack and are NOT included in `kustomization.yaml`. Apply them individually after the base deployment:

```bash
# Exporters (Prometheus metrics)
kubectl apply -f k8s/postgres-exporter.yaml
kubectl apply -f k8s/redis-exporter.yaml

# Redis Sentinel HA (3 replicas)
kubectl apply -f k8s/redis-sentinel.yaml

# NetworkPolicy (default-deny)
kubectl apply -f k8s/network-policy.yaml

# ResourceQuota + LimitRange
kubectl apply -f k8s/resource-quota.yaml

# ServiceMonitor (Prometheus Operator CRDs)
kubectl apply -f k8s/backend-service-monitor.yaml
```

Or add them to your own overlay kustomization:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: vardiya
resources:
  - ../base # or the existing k8s/ directory
  - postgres-exporter.yaml
  - redis-exporter.yaml
  - network-policy.yaml
```

## Files Overview

| File                           | Type                          | Description                                                                                       |
| ------------------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------- |
| `namespace.yaml`               | Namespace                     | `vardiya` with production label                                                                   |
| `configmap.yaml`               | ConfigMap                     | App env vars + nginx config                                                                       |
| `secrets.yaml`                 | Secret                        | Empty placeholder — NOT in kustomization; provision via Sealed Secrets or `kubectl create secret` |
| `backend-deployment.yaml`      | Deployment+HPA+PDB+Service    | NestJS API, 2-6 pods, 70% CPU HPA, `prisma migrate deploy` initContainer                          |
| `frontend-deployment.yaml`     | Deployment+HPA+PDB+Service    | Angular SPA, 2-4 pods, 70% CPU HPA                                                                |
| `postgres-statefulset.yaml`    | StatefulSet+Service           | PostgreSQL 15 + PgBouncer deployment                                                              |
| `redis-deployment.yaml`        | Deployment+Service+PVC        | Redis 7 standalone                                                                                |
| `ingress.yaml`                 | Ingress                       | nginx ingress, TLS via cert-manager                                                               |
| `kustomization.yaml`           | Kustomization                 | Lists all 9 base resources                                                                        |
| `service-account.yaml`         | SA+RBAC                       | Backend/frontend SAs, ClusterRole, bindings                                                       |
| `postgres-exporter.yaml`       | Deployment+Service            | PG metrics on :9187                                                                               |
| `redis-exporter.yaml`          | Deployment+Service            | Redis metrics on :9121                                                                            |
| `redis-sentinel.yaml`          | StatefulSet+ConfigMap+Service | 3-node Sentinel for Redis HA                                                                      |
| `network-policy.yaml`          | NetworkPolicy                 | Default-deny + per-service ingress rules                                                          |
| `resource-quota.yaml`          | ResourceQuota+LimitRange      | Compute/storage quotas                                                                            |
| `backend-service-monitor.yaml` | ServiceMonitor+PrometheusRule | Prometheus Operator CRDs                                                                          |

## Architecture

Backend pod runs a `migrate` initContainer (`prisma migrate deploy`) against the
PgBouncer direct connection before app pods start.

```
Internet
  └─► Ingress (nginx) ──┬──► Frontend (:80)
                         └──► Backend  (:3000) — migrate initContainer first
                                ├──► PgBouncer (:6432) ──► PostgreSQL (:5432)
                                └──► Redis     (:6379)
                                       └── Sentinel (:26379) [optional HA]

Metrics:
  Backend  :3000/metrics  ◄── Prometheus
  PG Exporter :9187       ◄── Prometheus
  Redis Exporter :9121    ◄── Prometheus
```

## Security

- NetworkPolicy enforces default-deny. Only explicitly allowed connections work.
- PodSecurityContext: all containers run as non-root (UID 100, matching the
  `adduser` uid inside the alpine images), fsGroup 100, no privilege escalation.
- Backend runs its migration in an initContainer before the app starts; the
  image executes `npx prisma migrate deploy` over the direct Postgres service.
- ServiceAccount `vardiya-backend` has minimal RBAC (get/list/watch pods, services, endpoints, configmaps, secrets).
- Frontend ServiceAccount has no automount (no cluster access needed).
- Secrets are placeholders — provision with Sealed Secrets or `kubectl create secret`; never commit them.
