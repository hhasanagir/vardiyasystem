# Rollouts Strategy

## Architecture

```
Argo Rollouts Controller
  ├── vardiya-backend    → Blue-Green deployment
  │    ├── active service  (receives production traffic)
  │    └── preview service (smoke tests before promotion)
  └── vardiya-frontend   → Canary deployment
       └── Istio VirtualService (weighted traffic split)
```

## Backend: Blue-Green

### Flow

1. New revision creates preview ReplicaSet (1 pod)
2. Smoke tests run against preview service (`rollout-analysis-smoke`)
3. If smoke passes → promotion creates full active ReplicaSet (3 pods)
4. Success-rate analysis monitors for 5 minutes (`rollout-analysis-success-rate`)
5. If analysis passes → old ReplicaSet scaled down after 5-minute delay
6. If analysis fails → automatic rollback to previous revision

### Promotion

```bash
# Manually promote (autoPromotionEnabled: false)
kubectl argo rollouts promote rollout/vardiya-backend -n vardiya

# Abort failed rollout
kubectl argo rollouts abort rollout/vardiya-backend -n vardiya

# Restart rollout
kubectl argo rollouts restart rollout/vardiya-backend -n vardiya
```

### Rollback

```bash
# Manual rollback to revision N
kubectl argo rollouts rollback rollout/vardiya-backend -n vardiya -r N

# Automatic rollback: AnalysisTemplate failure triggers abort
# Then previous stable revision continues serving
```

## Frontend: Canary

### Flow

1. New revision starts with 0% traffic
2. Canary weight steps: 10% → 30% → 50% → 70% → 100%
3. Between each step: 5-10 minute pause + success-rate analysis
4. If analysis fails at any step → canary aborts, 100% traffic stays on stable

### Istio Traffic Routing

```
VirtualService → Weighted split between stable/canary subsets
  ├── vardiya-frontend-stable  (version=stable,  default 100%)
  └── vardiya-frontend-canary  (version=canary,  default 0%)
```

Argo Rollouts dynamically updates the VirtualService weight as the canary progresses.

### Approval Gate

For critical releases, add manual approval between steps:

```yaml
steps:
  - setWeight: 50
  - pause: {} # Wait for manual approval
```

Then:

```bash
kubectl argo rollouts promote rollout/vardiya-frontend -n vardiya
```

## Analysis Templates

### success-rate

| Metric       | Threshold | Failure Limit | Interval | Count |
| ------------ | --------- | ------------- | -------- | ----- |
| Success rate | ≥ 95%     | 3             | 1m       | 5     |
| Error rate   | ≤ 5%      | 3             | 1m       | 5     |
| p95 latency  | ≤ 2000ms  | 3             | 1m       | 5     |

Failure limit = 3 means the analysis stops after 3 consecutive failures.

### smoke

| Test                 | Expected |
| -------------------- | -------- |
| /api/v1/health/live  | HTTP 200 |
| /api/v1/health/ready | HTTP 200 |

## Monitoring Rollouts

```bash
# Watch rollout status
kubectl argo rollouts get rollout vardiya-backend -n vardiya --watch

# UI dashboard
kubectl argo rollouts dashboard -n vardiya
# Open http://localhost:3100

# With Kiali (visual traffic split)
istioctl dashboard kiali
```

## Rollout Notifications

Configure Slack notifications via Argo Rollouts notifications:

```bash
kubectl apply -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: argo-rollouts-notification-config
  namespace: argo-rollouts
data:
  service.slack: |
    apiURL: https://slack.com/api
    token: $SLACK_TOKEN
  template.rollout-updated: |
    message: |
      Rollout {{.rollout.metadata.name}} updated:
      - Revision: {{.rollout.status.currentPodHash}}
      - Status: {{.rollout.status.phase}}
EOF
```

## Production Considerations

- **Blue-green** for backend: minimizes risk for DB-mutating services
- **Canary** for frontend: zero-downtime traffic shifting with real user validation
- Both strategies use PodAntiAffinity to spread across nodes
- Analysis runs separately for stable and canary to compare metrics
- ScaleDownDelay of 300s (5 min) for blue-green allows quick rollback if issues surface after full promotion
