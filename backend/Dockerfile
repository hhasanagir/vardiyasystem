# ─── VardiyaOS Backend Production Build ─────────────────────────────────
# Multi-stage: builder → production
# Uses distroless-like minimal Node.js image with non-root user

FROM node:20-alpine AS builder

LABEL stage="builder"
LABEL org.opencontainers.image.description="VardiyaOS Backend — build stage"

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts && npm rebuild bcrypt --build-from-source

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig*.json ./
COPY src ./src
RUN npm run build && \
    npm prune --omit=dev && \
    npm cache clean --force && \
    rm -rf /root/.npm /tmp/*

# Stage 2: Production
FROM node:20-alpine

LABEL vendor="VardiyaOS"
LABEL org.opencontainers.image.title="VardiyaOS Backend"
LABEL org.opencontainers.image.description="Radyoloji Vardiya Yönetim Sistemi — Backend API"
LABEL org.opencontainers.image.url="https://github.com/anomalyco/vardiyasystem"
LABEL org.opencontainers.image.source="https://github.com/anomalyco/vardiyasystem"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.base.name="node:20-alpine"

RUN apk add --no-cache tini curl ca-certificates openssl libssl3 libcrypto3 && \
    addgroup -S vardiya && \
    adduser -S vardiya -G vardiya && \
    mkdir -p /var/log/vardiya && \
    chown -R vardiya:vardiya /var/log/vardiya

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    LOG_DIR=/var/log/vardiya \
    NODE_OPTIONS="--max-old-space-size=512"

COPY --from=builder --chown=vardiya:vardiya /app/node_modules ./node_modules
COPY --from=builder --chown=vardiya:vardiya /app/dist ./dist
COPY --from=builder --chown=vardiya:vardiya /app/node_modules/.prisma ./node_modules/.prisma
COPY --chown=vardiya:vardiya prisma ./prisma

USER vardiya

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -sf http://localhost:3000/api/v1/health/live || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/src/main"]
