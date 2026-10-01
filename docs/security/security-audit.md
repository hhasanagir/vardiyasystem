# Security Audit

**Date:** 2026-08-20

## Secret Detection Summary

| Category                               | Count     | Severity |
| -------------------------------------- | --------- | -------- |
| Secrets in `backend/.env`              | 7         | CRITICAL |
| Secrets in `.env.example` (VAPID keys) | 2         | HIGH     |
| Hardcoded defaults in config code      | 5         | HIGH     |
| Hardcoded passwords in seed files      | 6         | HIGH     |
| Hardcoded passwords in e2e tests       | 10+ files | MEDIUM   |
| Hardcoded secrets in CI workflows      | 7         | MEDIUM   |

## Critical Secrets

| #   | Type                          | Location        | Status          |
| --- | ----------------------------- | --------------- | --------------- |
| 1   | ENCRYPTION_MASTER_KEY         | `backend/.env`  | SECRET_DETECTED |
| 2   | DATABASE_URL (with password)  | `backend/.env`  | SECRET_DETECTED |
| 3   | JWT_ACCESS_TOKEN_SECRET       | `backend/.env`  | SECRET_DETECTED |
| 4   | JWT_REFRESH_TOKEN_SECRET      | `backend/.env`  | SECRET_DETECTED |
| 5   | SEED_ADMIN_PASSWORD           | `backend/.env`  | SECRET_DETECTED |
| 6   | VAPID_PRIVATE_KEY             | `.env.example`  | SECRET_DETECTED |
| 7   | VAPID keys in config defaults | `env.config.ts` | SECRET_DETECTED |

## Authentication Assessment

| Aspect                 | Current                    | Risk                  |
| ---------------------- | -------------------------- | --------------------- |
| Token Storage          | localStorage               | HIGH — XSS vulnerable |
| Token Rotation         | Yes (refresh tokens)       | OK                    |
| Token Blacklist        | Yes (Redis)                | OK                    |
| Session Management     | Yes                        | OK                    |
| Brute Force Protection | Yes (progressive lockout)  | OK                    |
| CSRF Protection        | Yes (double-submit cookie) | OK                    |
| Rate Limiting          | Yes                        | OK                    |
| Password Hashing       | bcrypt                     | OK                    |

## Recommendations

### Immediate

1. Rotate ENCRYPTION_MASTER_KEY
2. Rotate VAPID keys, remove from source
3. Rotate JWT secrets in production
4. Set NODE_ENV=production in all prod deployments

### Short-term

5. Add `.env` to `frontend/.gitignore`
6. Remove password fallbacks from seed files
7. Migrate token storage from localStorage to httpOnly cookies
8. Use `${{ secrets.* }}` in CI workflows

### Medium-term

9. Per-user unique passwords in seed
10. CI secret scanning pre-commit hook
11. Secret rotation schedule (90 days)
12. Bind Redis to localhost in docker-compose.yml
