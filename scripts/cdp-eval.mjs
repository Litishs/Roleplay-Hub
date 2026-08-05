// 真机调试辅助：通过 Chrome DevTools Protocol 在已连接的 WebView 页面里执行 JS。
// 用法: node scripts/cdp-eval.mjs <wsUrl> "<js表达式>"  或  node scripts/cdp-eval.mjs <wsUrl> - < 表达式文件/stdin
// 需先: adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>
const wsUrl = process.argv[2];
const expressionArg = process.argv[3];
if (!wsUrl || !expressionArg) {
  console.error('usage: node scripts/cdp-eval.mjs <wsUrl> "<expression>"');
  process.exit(1);
}

const readExpression = async () => {
  if (expressionArg !== '-') return expressionArg;
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
};

const expression = await readExpression();

const ws = new WebSocket(wsUrl);
let msgId = 0;
const pending = new Map();

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
};

const send = (method, params) => new Promise((resolve) => {
  const id = ++msgId;
  pending.set(id, resolve);
  ws.send(JSON.stringify({ id, method, params }));
});

const timer = setTimeout(() => {
  console.error('CDP timeout');
  process.exit(1);
}, 20000);

ws.onopen = async () => {
  const res = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true
  });
  clearTimeout(timer);
  if (res.result?.exceptionDetails) {
    console.error('EXCEPTION:', JSON.stringify(res.result.exceptionDetails.exception?.description || res.result.exceptionDetails));
    process.exit(2);
  }
  const value = res.result?.result?.value;
  console.log(typeof value === 'string' ? value : JSON.stringify(value));
  ws.close();
  process.exit(0);
};
