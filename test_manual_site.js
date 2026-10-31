import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9222;

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  console.log('Launching Edge with remote debugging...');
  const edgeProc = spawn(EDGE_PATH, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1440,900',
    `--user-data-dir=${path.join(process.env.TEMP, 'edge_manual_test')}`
  ]);

  await sleep(1500);

  // Get debug target
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  const targets = await res.json();
  const pageTarget = targets.find(t => t.type === 'page') || targets[0];
  console.log('Target WebSocket:', pageTarget.webSocketDebuggerUrl);

  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);

  let id = 1;
  const callbacks = new Map();
  const consoleMessages = [];

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id && callbacks.has(data.id)) {
      callbacks.get(data.id)(data.result);
      callbacks.delete(data.id);
    }
    if (data.method === 'Runtime.consoleAPICalled') {
      const args = data.params.args.map(a => a.value || a.description || '').join(' ');
      consoleMessages.push(`[${data.params.type}] ${args}`);
    }
    if (data.method === 'Log.entryAdded') {
      consoleMessages.push(`[${data.params.entry.level}] ${data.params.entry.text}`);
    }
  };

  await new Promise(r => ws.onopen = r);

  function send(method, params = {}) {
    const msgId = id++;
    return new Promise(resolve => {
      callbacks.set(msgId, resolve);
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');

  console.log('Navigating to http://127.0.0.1:5173/ ...');
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/' });
  await sleep(2500);

  // Take screenshot of Login page
  async function takeScreenshot(fileName) {
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(__dirname, fileName), Buffer.from(data, 'base64'));
    console.log(`Saved screenshot: ${fileName}`);
  }

  await takeScreenshot('screenshot_01_login_page.png');

  // Click Student Demo button
  console.log('Clicking Student Demo button...');
  const clickStudentResult = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const btn = btns.find(b => b.innerText && b.innerText.includes('Student Demo'));
        if (btn) {
          btn.click();
          return 'Student Demo clicked';
        }
        return 'Student Demo button not found';
      })()
    `
  });
  console.log('Click result:', clickStudentResult.result.value);
  await sleep(2000);
  await takeScreenshot('screenshot_02_student_dashboard.png');

  // Navigate to Parking Lot Map in Student view
  console.log('Navigating to Parking Lot Map tab...');
  await send('Runtime.evaluate', {
    expression: `
      (() => {
        const tabs = Array.from(document.querySelectorAll('button, nav a, [role="tab"]'));
        const tab = tabs.find(t => t.innerText && (t.innerText.includes('Parking Map') || t.innerText.includes('Parking Layout')));
        if (tab) {
          tab.click();
          return 'Parking Map tab clicked';
        }
        return 'Tab not found';
      })()
    `
  });
  await sleep(1500);
  await takeScreenshot('screenshot_03_parking_map.png');

  // Sign out
  console.log('Signing out...');
  await send('Runtime.evaluate', {
    expression: `
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const signoutBtn = btns.find(b => b.innerText && (b.innerText.includes('Sign Out') || b.innerText.includes('Logout')));
        if (signoutBtn) {
          signoutBtn.click();
          return 'Signed out';
        }
        return 'Sign out button not found';
      })()
    `
  });
  await sleep(1500);

  // Click Admin Demo button
  console.log('Clicking Admin Demo button...');
  await send('Runtime.evaluate', {
    expression: `
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const btn = btns.find(b => b.innerText && b.innerText.includes('Admin Demo'));
        if (btn) {
          btn.click();
          return 'Admin Demo clicked';
        }
        return 'Admin Demo button not found';
      })()
    `
  });
  await sleep(2000);
  await takeScreenshot('screenshot_04_admin_dashboard.png');

  // Switch to Gate Ingress / ANPR Entry tab
  console.log('Clicking Gate Pass Scanner / Entry tab...');
  await send('Runtime.evaluate', {
    expression: `
      (() => {
        const tabs = Array.from(document.querySelectorAll('button, [role="tab"]'));
        const tab = tabs.find(t => t.innerText && (t.innerText.includes('Vehicle Entry') || t.innerText.includes('Gate') || t.innerText.includes('Scanner')));
        if (tab) {
          tab.click();
          return 'Entry tab clicked';
        }
        return 'Entry tab not found';
      })()
    `
  });
  await sleep(1500);
  await takeScreenshot('screenshot_05_admin_gate_entry.png');

  // Switch to Admin Payments view
  console.log('Clicking Admin Payments tab...');
  await send('Runtime.evaluate', {
    expression: `
      (() => {
        const tabs = Array.from(document.querySelectorAll('button, [role="tab"]'));
        const tab = tabs.find(t => t.innerText && (t.innerText.includes('Payment') || t.innerText.includes('Payments')));
        if (tab) {
          tab.click();
          return 'Payments tab clicked';
        }
        return 'Payments tab not found';
      })()
    `
  });
  await sleep(1500);
  await takeScreenshot('screenshot_06_admin_payments.png');

  // Save collected console messages to json for fault analysis
  fs.writeFileSync(path.join(__dirname, 'browser_console_logs.json'), JSON.stringify(consoleMessages, null, 2));
  console.log(`Captured ${consoleMessages.length} console messages.`);

  ws.close();
  edgeProc.kill();
  console.log('Edge testing completed successfully.');
}

run().catch(err => {
  console.error('Error during Edge testing:', err);
  process.exit(1);
});

