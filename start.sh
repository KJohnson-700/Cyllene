#!/bin/bash
# Cyllene launcher — brings up the FULL local stack behind the ngrok tunnel.
# Run this whenever you want to use Cyllene from Telegram.
#
# Stack:
#   :8642  Hermes gateway      (chat / /v1 / SSE)              — launchd (ai.hermes.gateway)
#   :9119  Hermes dashboard    (/api/jobs,/status,/sessions)   — started here if down
#   :8080  Cyllene proxy.py    (merges the two, + /obsidian, + /api/psb/status)
#   ngrok  cyllene tunnel      (reserved domain → :8080)
#
# Idempotent: skips anything already listening so re-running is safe.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PYTHON="$HOME/.hermes/hermes-agent/venv/bin/python"
[ -x "$PYTHON" ] || PYTHON="python3"

up() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }

echo "🔮 Starting Cyllene stack..."

# 0. Hermes gateway (:8642) is launchd-managed; just report it.
up 8642 && echo "  ✓ gateway :8642 up" || echo "  ⚠ gateway :8642 DOWN — run: hermes gateway run --replace"

# 1. Hermes dashboard (:9119) — serves the /api/* admin endpoints (crons, status, sessions).
if up 9119; then
  echo "  ✓ dashboard :9119 up"
else
  echo "  → starting dashboard :9119"
  nohup hermes dashboard --port 9119 --no-open > /tmp/hermes_dashboard.log 2>&1 &
  disown
  sleep 3
fi

# 2. Cyllene proxy (:8080). /api → :9119, /v1+/health → :8642.
if up 8080; then
  echo "  ✓ proxy :8080 up"
else
  echo "  → starting proxy :8080"
  HERMES_API_PORT=8642 HERMES_WEB_PORT=9119 nohup "$PYTHON" "$SCRIPT_DIR/proxy.py" > /tmp/cyllene_proxy.log 2>&1 &
  disown
  sleep 2
fi

# 3. ngrok tunnel (reserved domain → :8080).
if pgrep -f "ngrok start cyllene" >/dev/null 2>&1; then
  echo "  ✓ ngrok tunnel up"
else
  echo "  → starting ngrok tunnel"
  nohup ngrok start cyllene > /tmp/cyllene_ngrok.log 2>&1 &
  disown
  sleep 4
fi

echo ""
echo "✅ Cyllene is live"
echo "   MiniApp:  https://cyllene-three.vercel.app"
echo "   Tunnel:   https://hesitatively-unforcible-latanya.ngrok-free.dev → :8080"
echo ""
# quick end-to-end probe
for ep in /health /api/status /api/psb/status; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -H "ngrok-skip-browser-warning: true" "http://127.0.0.1:8080$ep" 2>/dev/null)
  echo "   :8080$ep → $code"
done
