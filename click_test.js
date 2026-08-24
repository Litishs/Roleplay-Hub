const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:9222/devtools/page/71051DF8C30E693DD9DDF095DA13BA6B');
ws.on('open', () => {
  ws.send(JSON.stringify({id:1, method:'Runtime.evaluate', params:{expression:'var buttons=document.querySelectorAll("button");var result=[];for(var i=0;i<buttons.length;i++){var b=buttons[i];if(b.textContent.includes("用量")){result.push(b.outerHTML.substring(0,200));b.click();break}}JSON.stringify(result)', returnByValue:true}}));
});
ws.on('message', (d) => {
  var m = JSON.parse(d.toString());
  if (m.id === 1) console.log('result:', m.result?.result?.value);
  ws.close();
  process.exit(0);
});
setTimeout(function(){process.exit(0)},5000);
