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

# envsubst viene con gettext
RUN apk add --no-cache gettext

COPY --from=builder /app/dist /usr/share/nginx/html

# nginx.conf como template (usa $PORT)
COPY nginx.conf /etc/nginx/conf.d/default.conf.template

# Script de inicio
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 80

CMD ["/entrypoint.sh"]
