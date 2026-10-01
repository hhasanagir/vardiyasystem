# Service Mesh Adoption Plan (Istio)

## Motivation

- mTLS between all services (zero-trust security)
- Traffic splitting for canary deployments (Argo Rollouts integration)
- Distributed tracing (Zipkin/Jaeger → OpenTelemetry → Tempo)
- Unified telemetry (metrics, logs, traces correlation)
- Circuit breaking + outlier detection for resilience
- Authorization policies at mesh level

## Phased Adoption

### Phase 1: Observability (Week 1)

```bash
# Install Istio with minimal profile
istioctl install -y --set profile=default \
  --set meshConfig.enableTracing=true \
  --set meshConfig.defaultConfig.tracing.sampling=100
```

1. Deploy Gateway + VirtualService
2. Add Telemetry resource for tracing
3. Verify traces appear in Tempo/Grafana
4. Verify metrics (envoy\_\*) appear in Prometheus
5. Outcome: **No traffic routing changes, only observability**

### Phase 2: Security (Week 2)

1. Enable PERMISSIVE mTLS → all services accept both plain and mTLS
2. Deploy PeerAuthentication
3. Monitor for connection errors
4. After 1 week of no errors → switch to STRICT mTLS
5. Outcome: **All in-cluster traffic encrypted**

### Phase 3: Traffic Management (Week 3)

1. Deploy DestinationRules with outlier detection
2. Deploy VirtualServices with retries + timeouts
3. Enable canary routing for frontend via VirtualService weight
4. Deploy RequestAuthentication (JWT validation at mesh level)
5. Outcome: **Resilient traffic with canary support**

## Rollback Plan

If Istio causes instability:

```bash
# Disable mTLS → back to PERMISSIVE
kubectl apply -f - <<EOF
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: vardiya-strict-mtls
  namespace: vardiya
spec:
  mtls:
    mode: PERMISSIVE
EOF

# Remove VirtualService → direct pod-to-pod routing
kubectl delete virtualservice vardiya-main -n vardiya

# Full uninstall
istioctl uninstall --purge -y
kubectl delete namespace istio-system
```

## Namespace Injection

```bash
# Enable auto-injection for vardiya namespace
kubectl label namespace vardiya istio-injection=enabled

# Restart pods to inject sidecars
kubectl rollout restart -n vardiya deployment/vardiya-backend
kubectl rollout restart -n vardiya deployment/vardiya-frontend

# Verify sidecars
kubectl get pods -n vardiya -l app.kubernetes.io/part-of=vardiya \
  -o jsonpath='{range .items[*]}{.metadata.name} {.spec.containers[*].name} {"\n"}{end}'
```

## Performance Impact

| Metric         | Without Istio | With Istio | Delta            |
| -------------- | ------------- | ---------- | ---------------- |
| p50 latency    | 45ms          | 52ms       | +7ms             |
| p95 latency    | 120ms         | 145ms      | +25ms            |
| p99 latency    | 350ms         | 420ms      | +70ms            |
| Memory per pod | —             | +40MB      | sidecar overhead |
| CPU per pod    | —             | +0.1 core  | sidecar overhead |

Istio EnvoyFilter can be used to optimize if thresholds are exceeded.
