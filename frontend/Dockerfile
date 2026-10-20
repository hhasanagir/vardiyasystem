# ─── VardiyaOS Frontend Production Build ───────────────────────────────
# Multi-stage: builder → nginx
# Serves pre-built Angular SPA with custom nginx config

FROM node:26-alpine AS builder

LABEL stage="builder"
LABEL org.opencontainers.image.description="VardiyaOS Frontend — build stage"

WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts && \
    npm cache clean --force

COPY . .
RUN npm run build -- --configuration production && \
    rm -rf /root/.npm /tmp/* /app/node_modules

# Stage 2: Serve with nginx
FROM nginx:1.27-alpine

LABEL vendor="VardiyaOS"
LABEL org.opencontainers.image.title="VardiyaOS Frontend"
LABEL org.opencontainers.image.description="Radyoloji Vardiya Yönetim Sistemi — Frontend SPA"
LABEL org.opencontainers.image.url="https://github.com/anomalyco/vardiyasystem"
LABEL org.opencontainers.image.source="https://github.com/anomalyco/vardiyasystem"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.base.name="nginx:1.27-alpine"

RUN addgroup -S vardiya && \
    adduser -S vardiya -G vardiya && \
    rm -f /etc/nginx/conf.d/default.conf && \
    mkdir -p /var/cache/nginx /var/run && \
    touch /var/run/nginx.pid && \
    chown -R vardiya:vardiya /var/cache/nginx /var/run/nginx.pid /etc/nginx

COPY --from=builder /app/dist/frontend/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

RUN chown -R vardiya:vardiya /usr/share/nginx/html && \
    chmod -R 755 /usr/share/nginx/html && \
    chmod -R 755 /etc/nginx/conf.d

USER vardiya

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:80/ || exit 1

STOPSIGNAL SIGQUIT

CMD ["nginx", "-g", "daemon off;"]
