#!/usr/bin/env node
// Server daemon - starts detached standalone Next.js server that survives shell exit
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const LOG = path.join(__dirname, 'dev.log');

// Kill any existing server
try { process.kill(PORT, 'SIGTERM'); } catch {}

const logStream = fs.openSync(LOG, 'a');
fs.writeSync(logStream, `\n--- Restarting at ${new Date().toISOString()} ---\n`);

const child = spawn('node', ['server.js', '-p', String(PORT)], {
  cwd: path.join(__dirname, '.next', 'standalone'),
  detached: true,
  stdio: ['ignore', logStream, logStream],
  env: { ...process.env, PORT: String(PORT) }
});

child.unref();
console.log(`Started: daemon=${process.pid} server=${child.pid}`);
process.exit(0);
