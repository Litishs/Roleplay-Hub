const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:9222/devtools/page/71051DF8C30E693DD9DDF095DA13BA6B');
ws.on('open',()=>{
  setInterval(()=>{
    ws.send(JSON.stringify({id:2,method:'Runtime.evaluate',params:{expression:'document.querySelectorAll(".management-view").length',returnByValue:true}}));
  },2000);
});
ws.on('message',(d)=>{
  var m = JSON.parse(d.toString());
  if(m.id===2) console.log('mv:', m.result?.result?.value);
});
setTimeout(()=>process.exit(0),30000);
