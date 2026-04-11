#!/bin/zsh
# ── KAPTURO — Script de arranque ─────────────────────────────────────────────
# Uso: ./start.sh
# Mata puertos ocupados y levanta backend + frontend automáticamente.

BACKEND_DIR="/Users/catalinakarstulovic/Desktop/KAPTURO/backend"
FRONTEND_DIR="/Users/catalinakarstulovic/Desktop/KAPTURO/frontend"
UVICORN="$BACKEND_DIR/venv/bin/uvicorn"

echo ""
echo "🚀  Iniciando KAPTURO..."
echo ""

# ── 1. Liberar puertos ────────────────────────────────────────────────────────
for PORT in 8000 5173 5174; do
  PID=$(lsof -ti :$PORT 2>/dev/null)
  if [[ -n "$PID" ]]; then
    echo "   Liberando puerto $PORT (PID $PID)..."
    kill -9 $PID 2>/dev/null
  fi
done
sleep 1

# ── 2. Backend (FastAPI) ──────────────────────────────────────────────────────
echo "   Iniciando backend  →  http://localhost:8000"
cd "$BACKEND_DIR"
$UVICORN main:app --reload --port 8000 > /tmp/kapturo_backend.log 2>&1 &
BACKEND_PID=$!

# Esperar a que arranque
for i in {1..10}; do
  sleep 1
  if grep -q "Application startup complete" /tmp/kapturo_backend.log 2>/dev/null; then
    echo "   ✅  Backend listo"
    break
  fi
  if [[ $i -eq 10 ]]; then
    echo "   ❌  Backend tardó demasiado. Revisa /tmp/kapturo_backend.log"
    cat /tmp/kapturo_backend.log
  fi
done

# ── 3. Frontend (Vite) ────────────────────────────────────────────────────────
echo "   Iniciando frontend →  http://localhost:5173"
cd "$FRONTEND_DIR"
npm run dev > /tmp/kapturo_frontend.log 2>&1 &
FRONTEND_PID=$!

# Esperar a que arranque
for i in {1..15}; do
  sleep 1
  if grep -q "ready in" /tmp/kapturo_frontend.log 2>/dev/null; then
    URL=$(grep "Local:" /tmp/kapturo_frontend.log | awk '{print $NF}')
    echo "   ✅  Frontend listo  →  $URL"
    break
  fi
  if [[ $i -eq 15 ]]; then
    echo "   ❌  Frontend tardó demasiado. Revisa /tmp/kapturo_frontend.log"
  fi
done

# ── 4. Listo ──────────────────────────────────────────────────────────────────
echo ""
echo "────────────────────────────────────────────────────"
echo "  KAPTURO corriendo 🟢"
FRONTEND_URL=$(grep "Local:" /tmp/kapturo_frontend.log | awk '{print $NF}')
echo "  App:     ${FRONTEND_URL:-http://localhost:5173}"
echo "  API:     http://localhost:8000/docs"
echo "  Logs:    /tmp/kapturo_backend.log"
echo "           /tmp/kapturo_frontend.log"
echo "  Parar:   kill $BACKEND_PID $FRONTEND_PID"
echo "────────────────────────────────────────────────────"
echo ""

# Mantener el script vivo para poder hacer Ctrl+C y matar todo
trap "echo ''; echo 'Deteniendo KAPTURO...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT
wait
