const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:9222/devtools/page/71051DF8C30E693DD9DDF095DA13BA6B');
ws.on('open', () => {
  ws.send(JSON.stringify({id:1, method:'Runtime.evaluate', params:{expression:'JSON.stringify(Object.keys(document.querySelector("#app").__vue_app__._instance.setupState).slice(0,10))', returnByValue:true}}));
});
ws.on('message', (d) => {
  var m = JSON.parse(d.toString());
  if (m.id === 1) console.log('r:', m.result?.result?.value);
  ws.close();
  process.exit(0);
});
setTimeout(function(){process.exit(0)},5000);
