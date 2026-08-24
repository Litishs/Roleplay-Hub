const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:9222/devtools/page/71051DF8C30E693DD9DDF095DA13BA6B');
ws.on('open', () => {
  ws.send(JSON.stringify({id:1, method:'Runtime.evaluate', params:{expression:'var el=document.querySelector("#app");var keys=[];for(var k in el){if(k.indexOf('__vue')>=0)keys.push(k)};JSON.stringify(keys)', returnByValue:true}}));
});
ws.on('message', (d) => {
  var m = JSON.parse(d.toString());
  if (m.id === 1) console.log('r:', m.result?.result?.value);
  ws.close();
  process.exit(0);
});
setTimeout(function(){process.exit(0)},5000);
