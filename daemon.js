#!/usr/bin/env node
// Server daemon — keeps the Next.js dev server alive by restarting it when it dies
// IMPORTANT: This process must STAY RUNNING to monitor the child.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const ROOT = __dirname;
const LOG = path.join(ROOT, 'dev.log');

// Kill any existing server on port 3000
try { process.kill(PORT, 'SIGTERM'); } catch {}
// Also kill any lingering bun/next processes
try { spawn('pkill', ['-f', `next-server`]).on('error', () => {}); } catch {}

const logStream = fs.openSync(LOG, 'a');
const log = (msg) => {
  const ts = new Date().toISOString();
  fs.writeSync(logStream, `[${ts}] ${msg}\n`);
  console.log(`[${ts}] ${msg}`);
};

log(`Daemon starting (pid=${process.pid})`);

function startServer() {
  log('Spawning: bun run dev...');

  const child = spawn('bun', ['run', 'dev'], {
    cwd: ROOT,
    detached: false, // NOT detached — daemon stays alive to monitor
    stdio: ['ignore', logStream, logStream],
    env: { ...process.env, PORT: String(PORT) }
  });

  child.on('exit', (code, signal) => {
    log(`Server exited (code=${code}, signal=${signal}). Restarting in 3s...`);
    setTimeout(startServer, 3000);
  });

  child.on('error', (err) => {
    log(`Server error: ${err.message}. Restarting in 3s...`);
    setTimeout(startServer, 3000);
  });

  log(`Server started (pid=${child.pid})`);
}

startServer();
// Daemon stays alive forever — this is intentional
// The daemon IS the process manager. It must not exit.
