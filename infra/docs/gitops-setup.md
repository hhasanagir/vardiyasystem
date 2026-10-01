# GitOps Setup with ArgoCD

## Architecture

```
GitHub (source of truth)
  └─► ArgoCD (sync engine in cluster)
       ├── vardiya-platform       → Helm umbrella chart
       ├── vardiya-infrastructure → Networking, cert-manager, sealed-secrets, OTEL
       ├── vardiya-service-mesh   → Istio Gateway, DestinationRules, mTLS
       ├── vardiya-rollouts       → Argo Rollouts (blue-green backend, canary frontend)
       ├── vardiya-feature-flags  → Unleash deployment
       └── vardiya-prometheus-operator → ServiceMonitors, PrometheusRules
```

## Bootstrap ArgoCD

```bash
# Install ArgoCD
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Get initial admin password
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d

# Install argocd CLI
curl -sSL -o argocd https://github.com/argoproj/argo-cd/releases/latest/download/argocd-linux-amd64
chmod +x argocd && sudo mv argocd /usr/local/bin/

# Login
argocd login argocd.vardiya.example.com --username admin
```

## Repository Setup

```bash
# Add git repository (SSH deploy key recommended)
argocd repo add git@github.com:anomalyco/vardiyasystem.git \
  --ssh-private-key-path ~/.ssh/id_ed25519 \
  --project vardiya

# Or use the repo secrets defined in infra/argocd/applications/
kubectl apply -f infra/argocd/applications/secrets-repo.yaml
```

## Deploy Applications

```bash
# Create project first
kubectl apply -f infra/argocd/projects/vardiya-project.yaml

# Deploy all applications
kubectl apply -f infra/argocd/applications/
```

## Sync Policy

All applications use automated sync with:

- `Prune: true` — removes resources not in git
- `SelfHeal: true` — corrects manual changes automatically
- `ServerSideApply: true` — avoids annotation drift
- `PruneLast: true` — prunes after sync to minimize downtime

## Secrets Management

Secrets are managed via Sealed Secrets (Bitnami):

```bash
# Encrypt a secret
kubeseal \
  --controller-name sealed-secrets \
  --controller-namespace kube-system \
  --format yaml \
  < secret.yaml > sealed-secret.yaml

# The SealedSecret can be committed to git safely
# Only the Sealed Secrets controller in the cluster can decrypt it
```

### Rotation Policy

- Backend secrets: rotate every 90 days (`sealedsecrets.bitnami.com/rotate: "90d"`)
- Database secrets: rotate every 90 days
- Monitoring secrets: rotate every 180 days
- TLS certificates: auto-renew at 720h (30 days before expiry) via cert-manager

## Disaster Recovery

### Full cluster restore

```bash
# 1. Recreate cluster
# 2. Install ArgoCD
# 3. Re-add repository
# 4. Apply all Application manifests
argocd app sync vardiya-platform
argocd app sync vardiya-infrastructure
argocd app sync vardiya-service-mesh
argocd app sync vardiya-feature-flags
argocd app sync vardiya-prometheus-operator
```

### Secret recovery

If the cluster is lost and Sealed Secrets controller private key is lost:

1. Restore from the Sealed Secrets controller backup (`kubectl get secret -n kube-system sealed-secrets-key -o yaml > backup.yaml`)
2. Re-encrypt all secrets with new keys

## Observability

Sync status is exposed via ArgoCD metrics. Add to Prometheus:

```yaml
# Prometheus scrape config
- job_name: argocd
  metrics_path: /metrics
  static_configs:
    - targets: ["argocd-metrics.argocd.svc.cluster.local:8082"]
```

ArgoCD notifications can be configured for sync failures via Slack/Email.
