#!/bin/bash
cd /home/z/my-project
while true; do
  echo "[$(date)] Starting dev server..."
  node_modules/.bin/next dev -p 3000 >> /home/z/my-project/dev.log 2>&1
  echo "[$(date)] Server crashed, restarting in 3s..."
  sleep 3
done
