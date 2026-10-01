# Helm Deployment Guide

## Prerequisites

- Kubernetes cluster 1.28+
- Helm 3.12+
- cert-manager (for TLS certificates)
- Istio 1.21+ (for service mesh)
- Argo Rollouts 1.6+ (for blue-green/canary deployments)
- Prometheus Operator (for ServiceMonitor/PrometheusRule CRDs)

## Installation Order

### 1. Install CRDs and Operators

```bash
# cert-manager (TLS certificates)
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.14.5/cert-manager.yaml
kubectl wait --for=condition=Available deployment/cert-manager -n cert-manager --timeout=120s

# Istio (service mesh)
istioctl install -y --set profile=production --set meshConfig.accessLogFile=/dev/stdout
kubectl label namespace default istio-injection=enabled

# Argo Rollouts (progressive delivery)
kubectl create namespace argo-rollouts
kubectl apply -n argo-rollouts -f https://github.com/argoproj/argo-rollouts/releases/latest/download/install.yaml

# Prometheus Operator (monitoring CRDs)
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm upgrade --install prometheus prometheus-community/kube-prometheus-stack \
  --namespace monitoring --create-namespace

# ArgoCD (GitOps)
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
```

### 2. ClusterIssuer and TLS Certificates

```bash
kubectl create namespace cert-manager
kubectl apply -f infra/cert-manager/cluster-issuers.yaml
kubectl apply -f infra/cert-manager/certificates.yaml
```

### 3. Sealed Secrets

```bash
helm repo add sealed-secrets https://bitnami-labs.github.io/sealed-secrets
helm install sealed-secrets sealed-secrets/sealed-secrets -n kube-system
```

### 4. Vardiya Platform (Helm Umbrella Chart)

```bash
# Production
helm upgrade --install vardiya-platform ./infra/helm/vardiya-platform \
  --namespace vardiya --create-namespace \
  --values ./infra/helm/vardiya-platform/values/production.yaml

# Staging
helm upgrade --install vardiya-platform ./infra/helm/vardiya-platform \
  --namespace vardiya-staging --create-namespace \
  --values ./infra/helm/vardiya-platform/values/staging.yaml
```

### 5. Service Mesh Resources

```bash
kubectl apply -f infra/service-mesh/istio/gateway.yaml
kubectl apply -f infra/service-mesh/istio/destination-rules.yaml
kubectl apply -f infra/service-mesh/istio/peer-authentication.yaml
kubectl apply -f infra/service-mesh/istio/service-entries.yaml
kubectl apply -f infra/service-mesh/istio/telemetry.yaml
```

### 6. Networking Policies

```bash
kubectl apply -f infra/networking/network-policies.yaml
kubectl apply -f infra/networking/pod-security-admission.yaml
kubectl apply -f infra/networking/resource-quotas.yaml
```

### 7. OpenTelemetry Collector

```bash
kubectl apply -f infra/opentelemetry/otel-collector-deployment.yaml
```

### 8. Feature Flags (Unleash)

```bash
kubectl apply -f infra/feature-flags/unleash/unleash-deployment.yaml
```

### 9. ArgoCD Applications (GitOps)

```bash
kubectl apply -f infra/argocd/projects/vardiya-project.yaml
kubectl apply -f infra/argocd/applications/
```

### 10. Argo Rollouts (after GitOps syncs)

```bash
kubectl apply -f infra/rollouts/backend-bluegreen.yaml
kubectl apply -f infra/rollouts/frontend-canary.yaml
kubectl apply -f infra/rollouts/analysis-templates.yaml
```

This will trigger the initial rollout via Argo Rollouts.

## Rollback

```bash
# Rollback via Helm
helm rollback vardiya-platform 1 --namespace vardiya

# Rollback via ArgoCD (manual sync to previous revision)
argocd app rollback vardiya-platform 1

# Rollback via Argo Rollouts (abort analysis)
kubectl argo rollouts abort rollout/vardiya-backend -n vardiya
kubectl argo rollouts abort rollout/vardiya-frontend -n vardiya

# Rollback via Istio (redirect all traffic to stable)
kubectl apply -f infra/service-mesh/istio/gateway.yaml
```

## Troubleshooting

| Issue                          | Check                                                          | Fix                          |
| ------------------------------ | -------------------------------------------------------------- | ---------------------------- |
| Pods stuck in CrashLoopBackOff | `kubectl logs -n vardiya <pod>`                                | Check ConfigMap/Secret refs  |
| TLS certificate not issued     | `kubectl describe certificate -n vardiya vardiya-tls`          | Verify DNS and ClusterIssuer |
| ArgoCD sync failing            | `argocd app get vardiya-platform`                              | Check Helm values syntax     |
| Rollout stuck                  | `kubectl argo rollouts get rollout vardiya-backend -n vardiya` | Promote or abort             |
| High latency                   | `istioctl dashboard kiali -n istio-system`                     | Check traffic routing        |
| OOMKilled                      | `kubectl top pod -n vardiya`                                   | Adjust resources in values   |
