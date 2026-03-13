#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

# Kill any existing Vite instances on port 5174
lsof -ti:5174 | xargs kill -9 2>/dev/null || true

echo "🛠️  Starting Admin..."

# Start Vite dev server in background
npx vite > /tmp/admin-vite.log 2>&1 &
VITE_PID=$!

# Wait for Vite to be ready
echo "   Waiting for dev server..."
for i in $(seq 1 30); do
  if curl -s http://localhost:5174 > /dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

echo "   Launching app..."

# Launch Electron (foreground)
./node_modules/.bin/electron . --dev

# Cleanup Vite when Electron exits
kill $VITE_PID 2>/dev/null || true
echo "   Admin closed."
