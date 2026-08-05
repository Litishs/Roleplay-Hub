// 真机调试辅助：重载 WebView 页面并收集启动期 JS 错误/控制台错误。
// 用法: node scripts/cdp-reload-check.mjs <wsUrl> [等待毫秒]
const wsUrl = process.argv[2];
const waitMs = Number(process.argv[3] || 8000);
if (!wsUrl) {
  console.error('usage: node scripts/cdp-reload-check.mjs <wsUrl> [waitMs]');
  process.exit(1);
}

const ws = new WebSocket(wsUrl);
let msgId = 0;
const pending = new Map();
const errors = [];

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
    return;
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    errors.push({
      kind: 'exception',
      text: String(msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text || '').slice(0, 500)
    });
  }
  if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'assert'].includes(msg.params.type)) {
    errors.push({
      kind: 'console.' + msg.params.type,
      text: (msg.params.args || []).map(a => a.value ?? a.description ?? '').join(' ').slice(0, 500)
    });
  }
  if (msg.method === 'Log.entryAdded' && msg.params.entry?.level === 'error') {
    errors.push({
      kind: 'log.error',
      text: String(msg.params.entry.text || '').slice(0, 500)
    });
  }
};

const send = (method, params) => new Promise((resolve) => {
  const id = ++msgId;
  pending.set(id, resolve);
  ws.send(JSON.stringify({ id, method, params }));
});

ws.onopen = async () => {
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  await send('Page.reload', { ignoreCache: true });
  await new Promise((resolve) => setTimeout(resolve, waitMs));
  console.log(JSON.stringify({ collectedErrors: errors.length, errors }, null, 2));
  ws.close();
  process.exit(0);
};
