import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure test_results directory exists
const testResultsDir = path.join(__dirname, 'test_results');
if (!fs.existsSync(testResultsDir)) {
  fs.mkdirSync(testResultsDir, { recursive: true });
}

console.log('1. Starting Backend API Server on port 5000...');
const serverProc = spawn('node', ['src/server.js'], {
  cwd: path.join(__dirname, 'backend'),
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, PORT: '5000' }
});

let serverReady = false;
serverProc.stdout.on('data', (d) => {
  const s = d.toString();
  if (s.includes('listening on :5000')) {
    serverReady = true;
  }
});

async function waitForServer(timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (serverReady) return true;
    try {
      const res = await fetch('http://localhost:5000/api/health');
      if (res.ok) return true;
    } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
  return false;
}

async function main() {
  const ready = await waitForServer();
  if (!ready) {
    console.error('Backend server failed to start within timeout.');
    serverProc.kill();
    process.exit(1);
  }
  console.log('✓ Backend server confirmed online.\n');

  console.log('2. Executing Newman Postman Collection for Website & API...');
  const collectionPath = path.join(__dirname, 'postman', 'smart-college-parking-website-and-api.postman_collection.json');
  const jsonReportPath = path.join(testResultsDir, 'postman_website_api_results.json');
  const htmlReportPath = path.join(testResultsDir, 'postman_htmlextra_report.html');

  const newmanCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const newmanArgs = [
    'newman',
    'run',
    collectionPath,
    '--reporters', 'cli,json,htmlextra',
    '--reporter-json-export', jsonReportPath,
    '--reporter-htmlextra-export', htmlReportPath,
    '--reporter-htmlextra-title', 'Smart College Parking - Postman Website and API Test Report'
  ];

  const newmanProc = spawn(newmanCmd, newmanArgs, {
    stdio: 'inherit',
    shell: true,
    env: process.env
  });

  newmanProc.on('close', (code) => {
    console.log(`\nNewman process finished with code: ${code}`);
    serverProc.kill();
    process.exit(code);
  });
}

main().catch(err => {
  console.error(err);
  serverProc.kill();
  process.exit(1);
});
