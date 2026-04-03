#!/usr/bin/env node
// Server daemon - starts detached standalone Next.js server that survives shell exit
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const ROOT = __dirname;
const LOG = path.join(ROOT, 'dev.log');
const STANDALONE = path.join(ROOT, '.next', 'standalone');
const STATIC_SRC = path.join(ROOT, '.next', 'static');
const STATIC_DST = path.join(STANDALONE, '.next', 'static');

// Kill any existing server
try { process.kill(PORT, 'SIGTERM'); } catch {}

// Copy static files into standalone directory (required by Next.js standalone mode)
try {
  if (fs.existsSync(STATIC_SRC)) {
    fs.rmSync(STATIC_DST, { recursive: true, force: true });
    // Use cp -r for recursive copy (works on Linux)
    execSync(`cp -r "${STATIC_SRC}" "${STATIC_DST}"`);
    console.log('Static files copied to standalone directory');
  }
} catch (e) {
  console.error('Failed to copy static files:', e.message);
}

const logStream = fs.openSync(LOG, 'a');
fs.writeSync(logStream, `\n--- Restarting at ${new Date().toISOString()} ---\n`);

const child = spawn('node', ['server.js', '-p', String(PORT)], {
  cwd: STANDALONE,
  detached: true,
  stdio: ['ignore', logStream, logStream],
  env: { ...process.env, PORT: String(PORT) }
});

child.unref();
console.log(`Started: daemon=${process.pid} server=${child.pid}`);
process.exit(0);
