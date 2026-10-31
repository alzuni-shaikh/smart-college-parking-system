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
    `--user-data-dir=${path.join(process.env.TEMP, 'edge_err_test')}`
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

  await send('Page.navigate', { url: 'http://127.0.0.1:5173/' });
  await new Promise(r => setTimeout(r, 1200));

  const evalRes = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const emailInput = document.querySelector('#login-email');
        const passInput = document.querySelector('#login-password');
        const submitBtn = document.querySelector('button[type="submit"]');
        if (emailInput && passInput && submitBtn) {
          emailInput.value = 'test@college.edu';
          emailInput.dispatchEvent(new Event('input', { bubbles: true }));
          passInput.value = 'password123';
          passInput.dispatchEvent(new Event('input', { bubbles: true }));
          submitBtn.click();
          return 'Form Submitted';
        }
        return 'Inputs not found';
      })()
    `
  });
  console.log('Submission status:', evalRes.result.value);

  await new Promise(r => setTimeout(r, 3000));

  const alertRes = await send('Runtime.evaluate', {
    expression: `
      (() => {
        const alert = document.querySelector('.auth-alert.error');
        return alert ? alert.innerText : 'No alert element found';
      })()
    `
  });
  console.log('Displayed Alert Error:', alertRes.result.value);

  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshot_login_error.png', Buffer.from(data, 'base64'));
  console.log('Saved screenshot_login_error.png');

  ws.close();
  edgeProc.kill();
}

run().catch(console.error);
