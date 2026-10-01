# Production Readiness Checklist

## Environment Variables

| Variable            | Required | Status       | Notes                        |
| ------------------- | -------- | ------------ | ---------------------------- |
| `DATABASE_URL`      | ✅       | ⬜ Verify    | PostgreSQL connection string |
| `JWT_SECRET`        | ✅       | ⬜ Verify    | 256-bit minimum              |
| `JWT_EXPIRES_IN`    | ✅       | ⬜ Verify    | e.g. `8h`                    |
| `VAPID_PUBLIC_KEY`  | ✅       | ⬜ Verify    | Push notifications           |
| `VAPID_PRIVATE_KEY` | ✅       | ⬜ Verify    | Push notifications           |
| `REDIS_URL`         | ⚠️       | ⬜ Verify    | WebSocket/rate-limit         |
| `VAULT_ADDR`        | 🔶       | ⬜ Optional  | Secret management            |
| `VAULT_TOKEN`       | 🔶       | ⬜ Optional  | Secret management            |
| `NODE_ENV`          | ✅       | `production` | Set                          |

## Build & Deploy

- [ ] Set all env vars in production environment
- [ ] Run `npx prisma generate` — regenerates Prisma client
- [ ] Run `npx prisma migrate deploy` — applies pending migrations
- [ ] Build backend: `npm run build`
- [ ] Build frontend: `ng build --configuration production`
- [ ] Configure reverse proxy (nginx/Caddy) for API + static files
- [ ] Enable HTTPS with auto-renewing certs
- [ ] Set up Redis for production (WebSocket, rate-limit)
- [ ] Configure log shipping (ELK / Grafana Loki)
- [ ] Set up health check endpoint monitoring

## Security Hardening

- [ ] Rate limiting on auth endpoints (already configured)
- [ ] CORS restricted to production domain
- [ ] Helmet.js headers enabled
- [ ] Input validation on all DTOs (class-validator already in place)
- [ ] CSRF protection for cookie-based auth

## Monitoring

- [ ] OpenTelemetry traces shipping to collector
- [ ] Winston logs → stdout for containerized deployment
- [ ] Health check endpoint (`GET /health`)
- [ ] CPU/memory alerts configured

## Performance

- [ ] Redis caching for frequently queried endpoints
- [ ] Pagination on list endpoints (already implemented)
- [ ] DB connection pool tuned for 500 concurrent users
