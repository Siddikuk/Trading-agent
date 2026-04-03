#!/usr/bin/env node
// Server daemon - keeps the Next.js dev server alive by restarting it when it dies
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const ROOT = __dirname;
const LOG = path.join(ROOT, 'dev.log');

// Kill any existing server on port 3000
try { process.kill(PORT, 'SIGTERM'); } catch {}

const logStream = fs.openSync(LOG, 'a');
fs.writeSync(logStream, `\n--- Daemon starting at ${new Date().toISOString()} ---\n`);

function startServer() {
  fs.writeSync(logStream, `[${new Date().toISOString()}] Spawning bun run dev...\n`);

  const child = spawn('bun', ['run', 'dev'], {
    cwd: ROOT,
    detached: true,
    stdio: ['ignore', logStream, logStream],
    env: { ...process.env, PORT: String(PORT) }
  });

  child.on('exit', (code, signal) => {
    fs.writeSync(logStream, `[${new Date().toISOString()}] Server exited (code=${code}, signal=${signal}). Restarting in 2s...\n`);
    setTimeout(startServer, 2000);
  });

  child.on('error', (err) => {
    fs.writeSync(logStream, `[${new Date().toISOString()}] Server error: ${err.message}. Restarting in 2s...\n`);
    setTimeout(startServer, 2000);
  });

  child.unref();
  fs.writeSync(logStream, `[${new Date().toISOString()}] Started: daemon=${process.pid} server=${child.pid}\n`);
}

startServer();
// Keep daemon alive briefly to log startup, then detach
setTimeout(() => process.exit(0), 1000);
