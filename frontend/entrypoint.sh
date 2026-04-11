#!/bin/sh
set -e

# Sustituye PORT en nginx config (Railway inyecta $PORT)
export PORT="${PORT:-80}"
envsubst '$PORT' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf

# Sustituye la URL del backend en los JS compilados
API_URL="${VITE_API_URL:-}"
if [ -n "$API_URL" ]; then
    find /usr/share/nginx/html -name "*.js" -exec sed -i "s|RUNTIME_API_URL_PLACEHOLDER|$API_URL|g" {} \;
    echo "API URL set to: $API_URL on port $PORT"
else
    echo "Warning: VITE_API_URL not set, using relative /api/v1"
fi

nginx -g "daemon off;"
