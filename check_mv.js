const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:9222/devtools/page/71051DF8C30E693DD9DDF095DA13BA6B');
ws.on('open', () => {
  ws.send(JSON.stringify({id:1, method:'Runtime.evaluate', params:{expression:'document.querySelectorAll(".management-view").length + " management views, visible:" + (document.querySelector(".management-view") ? document.querySelector(".management-view").style.display : "no element")', returnByValue:true}}));
});
ws.on('message', (d) => {
  var m = JSON.parse(d.toString());
  if (m.id === 1) console.log('result:', m.result?.result?.value);
  ws.close();
  process.exit(0);
});
setTimeout(function(){process.exit(0)},5000);
