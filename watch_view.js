const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:9222/devtools/page/71051DF8C30E693DD9DDF095DA13BA6B');
ws.on('open', () => {
  setInterval(() => {
    ws.send(JSON.stringify({id:2, method:'Runtime.evaluate', params:{expression:'document.querySelector("#app").__vue_app__._instance.proxy.currentView', returnByValue:true}}));
  }, 2000);
});
ws.on('message', (d) => {
  const m = JSON.parse(d.toString());
  if (m.id === 2) {
    console.log('view:', m.result?.result?.value);
  }
});
setTimeout(() => process.exit(0), 20000);
