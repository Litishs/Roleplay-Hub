const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:9222/devtools/page/71051DF8C30E693DD9DDF095DA13BA6B');
ws.on('open', () => {
  ws.send(JSON.stringify({id:1, method:'Runtime.evaluate', params:{expression:'var app=document.querySelector("#app").__vue_app__;var root=app._instance;var proxy=root.proxy;var keys=Object.keys(proxy).filter(function(k){return k.includes("current")||k.includes("View")});JSON.stringify(keys)',returnByValue:true}}));
});
ws.on('message', (d) => {
  var m = JSON.parse(d.toString());
  if (m.id === 1) console.log('keys:', m.result?.result?.value);
  ws.close();
  process.exit(0);
});
setTimeout(function(){process.exit(0)},5000);