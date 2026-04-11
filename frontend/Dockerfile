FROM node:20-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Build con URL placeholder - se reemplaza en runtime
ENV VITE_API_URL=RUNTIME_API_URL_PLACEHOLDER

RUN npm run build

# ── Serve con nginx ──────────────────────────────────────────────────────────
FROM nginx:alpine

RUN apk add --no-cache bash

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Script que reemplaza el placeholder con la URL real al iniciar
RUN echo '#!/bin/sh' > /docker-entrypoint-custom.sh && \
    echo 'set -e' >> /docker-entrypoint-custom.sh && \
    echo 'API_URL="${VITE_API_URL:-}"' >> /docker-entrypoint-custom.sh && \
    echo 'if [ -n "$API_URL" ]; then' >> /docker-entrypoint-custom.sh && \
    echo '  find /usr/share/nginx/html -name "*.js" -exec sed -i "s|RUNTIME_API_URL_PLACEHOLDER|$API_URL|g" {} \;' >> /docker-entrypoint-custom.sh && \
    echo '  echo "API URL set to: $API_URL"' >> /docker-entrypoint-custom.sh && \
    echo 'fi' >> /docker-entrypoint-custom.sh && \
    echo 'nginx -g "daemon off;"' >> /docker-entrypoint-custom.sh && \
    chmod +x /docker-entrypoint-custom.sh

EXPOSE 80

CMD ["/docker-entrypoint-custom.sh"]
