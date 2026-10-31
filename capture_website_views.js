import fs from 'fs';
import { spawn } from 'child_process';
import path from 'path';

async function run() {
  const EDGE_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
  const edgeProc = spawn(EDGE_PATH, [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--disable-gpu',
    '--no-first-run',
    '--window-size=1440,900',
    `--user-data-dir=${path.join(process.env.TEMP, 'edge_demo_test')}`
  ]);
  await new Promise(r => setTimeout(r, 1500));

  const list = await (await fetch('http://127.0.0.1:9222/json')).json();
  const page = list.find(t => t.type === 'page') || list[0];
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);

  let id = 1;
  const send = (method, params = {}) => new Promise(res => {
    const msgId = id++;
    const handler = (evt) => {
      const data = JSON.parse(evt.data);
      if (data.id === msgId) {
        ws.removeEventListener('message', handler);
        res(data.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });

  const capturedConsole = [];
  ws.addEventListener('message', (evt) => {
    const d = JSON.parse(evt.data);
    if (d.method === 'Runtime.consoleAPICalled') {
      capturedConsole.push(d.params.args.map(a => a.value || a.description || '').join(' '));
    }
  });

  await send('Page.enable');
  await send('Runtime.enable');

  // 1. First navigate to load domain and set localStorage
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/' });
  await new Promise(r => setTimeout(r, 1500));

  console.log('Injecting demo_user_session for Student into localStorage...');
  await send('Runtime.evaluate', {
    expression: `
      localStorage.setItem('demo_user_session', JSON.stringify({
        uid: 'demo-student-uid-101',
        displayName: 'Rahul Sharma (Student)',
        email: 'rahul.sharma@college.edu',
        role: 'Student',
        rollNumber: 'CS-2026-44',
        vehicleType: 'scooty',
        vehiclePlate: 'MH12AB1234'
      }));
      sessionStorage.setItem('soc_intro_played', 'true');
    `
  });

  // Reload page so App.jsx picks up the session
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/' });
  await new Promise(r => setTimeout(r, 2000));

  // Capture Student Dashboard
  let sc = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshot_website_student.png', Buffer.from(sc.data, 'base64'));
  console.log('Saved screenshot_website_student.png');

  // Navigate to Parking Lot Map
  await send('Runtime.evaluate', {
    expression: `
      (() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const mapBtn = buttons.find(b => b.innerText && (b.innerText.includes('Parking Map') || b.innerText.includes('View Map') || b.innerText.includes('Interactive Map')));
        if (mapBtn) mapBtn.click();
      })()
    `
  });
  await new Promise(r => setTimeout(r, 1500));

  sc = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshot_website_map.png', Buffer.from(sc.data, 'base64'));
  console.log('Saved screenshot_website_map.png');

  // Now inject Admin demo session
  console.log('Injecting demo_user_session for Security Admin into localStorage...');
  await send('Runtime.evaluate', {
    expression: `
      localStorage.setItem('demo_user_session', JSON.stringify({
        uid: 'R2eyVR9vzOUb6rwv9gNCPWcuoGr1',
        displayName: 'Alzuni Shaikh (Security Admin)',
        email: 'shaikhalzuni123@gmail.com',
        role: 'Security Admin',
        campusId: 'ADM-01'
      }));
    `
  });

  await send('Page.navigate', { url: 'http://127.0.0.1:5173/' });
  await new Promise(r => setTimeout(r, 2000));

  sc = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshot_website_admin.png', Buffer.from(sc.data, 'base64'));
  console.log('Saved screenshot_website_admin.png');

  fs.writeFileSync('demo_console_logs.json', JSON.stringify(capturedConsole, null, 2));

  ws.close();
  edgeProc.kill();
  console.log('All screenshots captured successfully.');
}

run().catch(console.error);

