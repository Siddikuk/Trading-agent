#!/usr/bin/env bash
# Keep-alive wrapper for Next.js dev server
cd /home/z/my-project

STARTUP_TIME=$(date +%s)
echo "[$(date)] Starting Next.js dev server keep-alive loop..."

while true; do
  echo "[$(date)] Starting Next.js dev server on port 3000..."
  node_modules/.bin/next dev -p 3000 &
  SERVER_PID=$!
  echo "[$(date)] Server PID: $SERVER_PID"

  # Monitor loop - check every 30 seconds
  while true; do
    sleep 30
    # Check if process is still alive
    if ! kill -0 $SERVER_PID 2>/dev/null; then
      echo "[$(date)] Server process (PID $SERVER_PID) died. Restarting..."
      break
    fi

    # Check if server is responding
    RESPONSE_SIZE=$(curl -s --max-time 3 http://localhost:3000/ 2>/dev/null | wc -c)
    ELAPSED=$(( $(date +%s) - STARTUP_TIME ))

    if [ "$RESPONSE_SIZE" -eq 0 ]; then
      echo "[$(date)] Server not responding (0 bytes). Process alive but unresponsive. Killing and restarting..."
      kill $SERVER_PID 2>/dev/null
      wait $SERVER_PID 2>/dev/null
      break
    fi

    echo "[$(date)] Server healthy - responded with ${RESPONSE_SIZE} bytes. Uptime: ${ELAPSED}s"

    # Report 2-minute status
    if [ "$ELAPSED" -ge 120 ] && [ "$ELAPSED" -lt 155 ]; then
      echo "============================================"
      echo "  2-MINUTE STATUS REPORT"
      echo "  Server PID: $SERVER_PID"
      echo "  Response size: ${RESPONSE_SIZE} bytes"
      echo "  Uptime: ${ELAPSED} seconds"
      echo "  Status: HEALTHY ✓"
      echo "============================================"
    fi
  done

  # Small delay before restart
  sleep 2
done
