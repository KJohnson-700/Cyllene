#!/bin/bash
# Cyllene launcher — starts proxy + ngrok tunnel
# Run this whenever you want to use Cyllene from Telegram

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV="$HOME/.hermes/hermes-agent/venv/bin/python"
PYTHON="${VENV:-python3}"

echo "🔮 Starting Cyllene..."

# 1. Start local proxy (merges :8642 + :9119 → :8080)
echo "  → Starting proxy on :8080"
"$PYTHON" "$SCRIPT_DIR/proxy.py" &
PROXY_PID=$!
sleep 1

# Confirm proxy is up
if ! curl -s http://localhost:8080/health > /dev/null 2>&1; then
  echo "  ⚠ Proxy started (Hermes may not be running yet — that's ok)"
fi

# 2. Start ngrok tunnel
echo "  → Starting ngrok tunnel"
ngrok start cyllene &
NGROK_PID=$!
sleep 2

echo ""
echo "✅ Cyllene is live"
echo "   MiniApp:  https://cyllene-three.vercel.app"
echo "   Tunnel:   check ngrok dashboard or ~/.config/ngrok/ngrok.yml for your domain"
echo ""
echo "Press Ctrl+C to stop"

# Cleanup on exit
trap "kill $PROXY_PID $NGROK_PID 2>/dev/null; echo 'Cyllene stopped.'" EXIT
wait
