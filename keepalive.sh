#!/bin/bash
cd /home/z/my-project
while true; do
  echo "Starting server at $(date)"
  bun run dev >> dev.log 2>&1
  echo "Server died at $(date), restarting in 2s..."
  sleep 2
done
