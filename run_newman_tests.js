import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Start backend server
console.log('Starting backend server for Postman / Newman test suite...');
const serverProcess = spawn('node', ['src/server.js'], {
  cwd: path.join(__dirname, 'backend'),
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, PORT: '5000' }
});

let serverReady = false;

serverProcess.stdout.on('data', (data) => {
  const msg = data.toString();
  process.stdout.write('[Backend] ' + msg);
  if (msg.includes('listening on :5000')) {
    serverReady = true;
  }
});

serverProcess.stderr.on('data', (data) => {
  process.stderr.write('[Backend Err] ' + data.toString());
});

async function waitForServer(timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (serverReady) return true;
    try {
      const res = await fetch('http://localhost:5000/api/health');
      if (res.ok) return true;
    } catch (e) {
      // wait
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

async function run() {
  const ready = await waitForServer();
  if (!ready) {
    console.error('Server failed to start within timeout.');
    serverProcess.kill();
    process.exit(1);
  }
  console.log('\nServer confirmed running! Launching Newman Postman tests...\n');

  const collectionPath = path.join(__dirname, 'postman', 'smart-college-parking.postman_collection.json');

  const newmanCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const newmanArgs = [
    'newman',
    'run',
    collectionPath,
    '--reporters', 'cli,json',
    '--reporter-json-export', path.join(__dirname, 'newman_results.json')
  ];

  const newmanProcess = spawn(newmanCmd, newmanArgs, {
    stdio: 'inherit',
    shell: true,
    env: process.env
  });

  newmanProcess.on('close', (code) => {
    console.log(`\nNewman test process finished with exit code: ${code}`);
    serverProcess.kill();
    process.exit(code);
  });
}

run().catch((err) => {
  console.error(err);
  serverProcess.kill();
  process.exit(1);
});
