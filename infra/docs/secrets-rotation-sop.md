# Secrets Rotation SOP

## Overview

All secrets are managed as Bitnami Sealed Secrets. The Sealed Secrets controller in the cluster holds the private key; encrypted secrets are safe to commit to git.

## Rotation Schedule

| Secret Type          | Rotate Every      | Method                     | Automation   |
| -------------------- | ----------------- | -------------------------- | ------------ |
| JWT signing keys     | 90 days           | Regenerate + re-encrypt    | Manual (SOP) |
| Database passwords   | 90 days           | pgpass update + re-encrypt | Manual (SOP) |
| Redis passwords      | 90 days           | AUTH change + re-encrypt   | Manual (SOP) |
| SMTP credentials     | 180 days          | Provider rotation          | Manual (SOP) |
| TLS certificates     | Auto (720h renew) | cert-manager               | Automatic    |
| Slack webhooks       | 180 days          | Revoke + recreate          | Manual (SOP) |
| Feature flag tokens  | 180 days          | Unleash Admin UI           | Manual (SOP) |
| Cloudflare API token | 180 days          | Cloudflare dashboard       | Manual (SOP) |

## Rotation Procedure

### 1. Generate new secret value

```bash
# Generate a 64-byte random key
openssl rand -base64 64 > new-secret.txt

# Or generate a readable password (24 chars)
openssl rand -base64 24
```

### 2. Update the raw Secret

```bash
# Create temporary secret with new value
kubectl create secret generic temp-secret \
  --namespace vardiya \
  --from-literal=JWT_SECRET=$(openssl rand -base64 64) \
  --dry-run=client -o yaml > temp-secret.yaml
```

### 3. Encrypt with kubeseal

```bash
kubeseal --format yaml \
  --controller-name sealed-secrets \
  --controller-namespace kube-system \
  < temp-secret.yaml > sealed-secret.yaml

# Verify
diff <(kubeseal --validate < sealed-secret.yaml 2>&1) <(echo "SealedSecret is valid")
```

### 4. Commit to git

```bash
cp sealed-secret.yaml infra/sealed-secrets/backend-secrets.yaml
git add infra/sealed-secrets/backend-secrets.yaml
git commit -m "chore: rotate JWT secrets [90-day rotation]"
git push
```

### 5. Sync via ArgoCD

```bash
argocd app sync vardiya-infrastructure --resource "sealedsecrets.bitnami.com/v1alpha1:SealedSecret:vardiya-backend-secrets"
```

### 6. Roll pods to pick up new secrets

```bash
kubectl rollout restart -n vardiya deployment/vardiya-backend
```

### 7. Verify

```bash
# Check pod logs for auth errors
kubectl logs -n vardiya -l app.kubernetes.io/component=backend --tail=50 | grep -i "jwt\|token\|auth"

# Check rollout status
kubectl argo rollouts get rollout vardiya-backend -n vardiya
```

## Emergency Rotation

If a secret is compromised:

```bash
# 1. Immediately rotate ALL secrets (not just the compromised one)
# 2. Restart all pods to invalidate old sessions
kubectl delete pods -n vardiya -l app.kubernetes.io/component=backend --force

# 3. Revoke all JWTs (if JWT secret compromised)
# Update JWT_SECRET → all existing tokens become invalid
# Users will need to re-login

# 4. If DB password compromised:
# - Update password via psql
# - Rotate PgBouncer password
# - Restart backend + pgbouncer pods

# 5. Notify team via incident response process
# See docs/enterprise/incident-response.md
```

## Backup

The Sealed Secrets controller private key must be backed up securely:

```bash
kubectl get secret -n kube-system sealed-secrets-key -o yaml > /backup/sealed-secrets-key.yaml
# Store in encrypted offsite backup (e.g., Bitwarden, 1Password, HashiCorp Vault)
```

Without this key, secrets CANNOT be decrypted in a new cluster.
