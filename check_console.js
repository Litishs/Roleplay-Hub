
const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:9222/devtools/page/71051DF8C30E693DD9DDF095DA13BA6B');
ws.on('open', () => {
  ws.send(JSON.stringify({id: 1, method: 'Console.enable'}));
  ws.send(JSON.stringify({id: 2, method: 'Runtime.evaluate', params: {
    expression: 'document.querySelector("#app").__vue_app__._instance.proxy.currentView',
    returnByValue: true
  }}));
});
let count = 0;
ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  count++;
  if (msg.method === 'Console.messageAdded') {
    console.log('CONSOLE:', JSON.stringify(msg.params.message));
  }
  if (msg.id === 2) {
    console.log('VIEW:', JSON.stringify(msg.result));
  }
  if (count > 30) { ws.close(); process.exit(0); }
});
ws.on('error', (e) => { console.error('ERR:', e.message); process.exit(1); });
setTimeout(() => process.exit(0), 3000);
