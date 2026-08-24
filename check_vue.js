
const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:9222/devtools/page/71051DF8C30E693DD9DDF095DA13BA6B');
ws.on('open', () => {
  ws.send(JSON.stringify({id: 1, method: 'Runtime.evaluate', params: {
    expression: 'document.querySelector("#app").__vue_app__ ? "VUE_OK" : "NO_VUE"',
    returnByValue: true
  }}));
});
ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.id === 1) {
    console.log(JSON.stringify(msg.result));
    ws.close();
    process.exit(0);
  }
});
ws.on('error', (err) => {
  console.error('WS Error:', err.message);
  process.exit(1);
});
setTimeout(() => { console.log('Timeout'); process.exit(1); }, 5000);
