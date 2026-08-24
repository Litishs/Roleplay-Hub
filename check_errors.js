const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:9222/devtools/page/71051DF8C30E693DD9DDF095DA13BA6B');
ws.on('open', () => {
  ws.send(JSON.stringify({id:1, method:'Console.enable'}));
  ws.send(JSON.stringify({id:2, method:'Runtime.evaluate', params:{expression:'var x=document.querySelectorAll("button").length;console.log("BUTTONS:"+x);"OK"', returnByValue:true}}));
});
var count = 0;
ws.on('message', (d) => {
  var m = JSON.parse(d.toString());
  count++;
  if (m.method === 'Console.messageAdded') {
    var msg = m.params.message;
    console.log('[' + msg.level + ']', msg.text);
  }
  if (m.id === 2) {
    console.log('Eval result:', m.result?.result?.value);
  }
  if (count > 50) { ws.close(); process.exit(0); }
});
setTimeout(function(){process.exit(0)}, 8000);
