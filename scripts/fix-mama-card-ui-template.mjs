#!/usr/bin/env node
/*
 * 修复 🍊妈妈们是不可能同时成为你的爱人_炮架_老师的.png 内嵌 UI 模板的脚本：
 *   - onclick 改为显式传 this（不再依赖裸 event.currentTarget，兼容 Shadow DOM 委托渲染）
 *   - 去掉 window.location 赋值（会触发整页跳转）
 *   - 去掉 window.refreshUI 依赖，改为模板脚本直接刷新面板 DOM
 * 输出为 _修复版.png，原文件保持不变。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(repoRoot, 'assets', 'character', '🍊妈妈们是不可能同时成为你的爱人_炮架_老师的.png');
const dst = path.join(repoRoot, 'assets', 'character', '🍊妈妈们是不可能同时成为你的爱人_炮架_老师的_修复版.png');

if (!fs.existsSync(src)) {
  console.error('源文件不存在:', src);
  process.exit(1);
}

/* ---------- PNG chunk helpers ---------- */
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i += 1) {
  let c = i;
  for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  crcTable[i] = c;
}
const crc32 = (bytes) => {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i += 1) crc = (crc >>> 8) ^ crcTable[(crc ^ bytes[i]) & 0xFF];
  return (crc ^ 0xFFFFFFFF) >>> 0;
};
const createTextChunk = (key, value) => {
  const type = Buffer.from('tEXt', 'latin1');
  const keyData = Buffer.from(key, 'utf8');
  const valueData = Buffer.from(value, 'utf8');
  const chunkData = Buffer.concat([keyData, Buffer.from([0]), valueData]);
  const crc = crc32(Buffer.concat([type, chunkData]));
  const header = Buffer.alloc(4);
  header.writeUInt32BE(chunkData.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc, 0);
  return Buffer.concat([header, type, chunkData, crcBuf]);
};

/* ---------- helper: replace with occurrence assertion ---------- */
const replaceAll = (text, from, to, expected = 1, label = '') => {
  const count = text.split(from).length - 1;
  if (count !== expected) {
    throw new Error(`替换断言失败 ${label || ''}: 期望 ${expected} 处, 实际 ${count} 处 -> ${JSON.stringify(String(from).slice(0, 80))}`);
  }
  return text.split(from).join(to);
};

/* ---------- read + decode ---------- */
const buf = fs.readFileSync(src);
const chunks = [];
let offset = 8;
let charaChunk = null;
while (offset + 8 <= buf.length) {
  const length = buf.readUInt32BE(offset);
  const type = buf.toString('latin1', offset + 4, offset + 8);
  const dataStart = offset + 8;
  const dataEnd = dataStart + length;
  if (dataEnd + 4 > buf.length) break;
  const data = buf.subarray(dataStart, dataEnd);
  chunks.push({ type, data, dataStart, dataEnd });
  if (type === 'tEXt' || type === 'iTXt') {
    let cursor = 0;
    while (cursor < data.length && data[cursor] !== 0) cursor += 1;
    const key = data.toString('utf8', 0, cursor);
    if (key === 'chara') charaChunk = { index: chunks.length - 1, key };
  }
  offset += 12 + length;
}
if (!charaChunk) {
  console.error('未找到 chara tEXt 块');
  process.exit(1);
}

const payload = chunks[charaChunk.index].data
  .subarray(5) // 'chara\0'
  .toString('utf8');
const card = JSON.parse(Buffer.from(payload.trim(), 'base64').toString('utf8'));
const inner = card.data && card.spec ? card.data : card;

const templates = [
  ...(Array.isArray(inner.uiTemplates) ? inner.uiTemplates : []),
  ...(inner.extensions && Array.isArray(inner.extensions.rp_hub_ui_templates)
    ? inner.extensions.rp_hub_ui_templates
    : [])
];
if (templates.length === 0) {
  console.error('未找到 uiTemplates');
  process.exit(1);
}

/* ---------- build fixed htmlTemplate ---------- */
let html = templates[0].htmlTemplate || '';
if (!html) {
  console.error('模板 htmlTemplate 为空');
  process.exit(1);
}

// 1) onclick: 显式传 this
for (const id of ['linxiyao', 'suwanqing', 'xiazhixuan', 'suqingyan', 'shenmanjun', 'liuyuru',
  'qinbo', 'linwan', 'chenyi', 'xiaotao', 'xiaomi', 'lili', 'xiaoyu']) {
  html = replaceAll(html, `onclick="switchCharacter('${id}')"`, `onclick="switchCharacter(this,'${id}')"`, 1, `onclick ${id}`);
}

// 2) 给面板数值元素加 id，便于脚本直接刷新
html = replaceAll(html, '<span>今天：{{weekday}}</span>', '<span id="rph-weekday">今天：{{weekday}}</span>', 1, 'weekday');
html = replaceAll(html, '<span>位置：{{location}}</span>', '<span id="rph-location">位置：{{location}}</span>', 1, 'location');
html = replaceAll(
  html,
  '<div style="font-size: 20px; font-weight: 700; color: #333; margin-bottom: 8px;">{{char_name}}</div>',
  '<div id="rph-char-name" style="font-size: 20px; font-weight: 700; color: #333; margin-bottom: 8px;">{{char_name}}</div>',
  1, 'char_name'
);
html = replaceAll(
  html,
  '<div style="padding: 8px 12px; background: #f8f9fa; border-radius: 6px; border-left: 3px solid #667eea; line-height: 1.5; font-size: 14px; color: #212529;">{{outfit}}</div>',
  '<div id="rph-outfit" style="padding: 8px 12px; background: #f8f9fa; border-radius: 6px; border-left: 3px solid #667eea; line-height: 1.5; font-size: 14px; color: #212529;">{{outfit}}</div>',
  1, 'outfit'
);
html = replaceAll(html, '<span>{{favor}}%</span>', '<span id="rph-favor">{{favor}}%</span>', 1, 'favor text');
html = replaceAll(
  html,
  '<div style="height: 100%; width: {{favor}}%; background: linear-gradient(90deg, #ff9a9e 0%, #fecfef 100%); border-radius: 4px; transition: width 0.8s ease-out;"></div>',
  '<div id="rph-favor-bar" style="height: 100%; width: {{favor}}%; background: linear-gradient(90deg, #ff9a9e 0%, #fecfef 100%); border-radius: 4px; transition: width 0.8s ease-out;"></div>',
  1, 'favor bar'
);
html = replaceAll(html, '<span>{{accept}}%</span>', '<span id="rph-accept">{{accept}}%</span>', 1, 'accept text');
html = replaceAll(
  html,
  '<div style="height: 100%; width: {{accept}}%; background: linear-gradient(90deg, #a18cd1 0%, #fbc2eb 100%); border-radius: 4px; transition: width 0.8s ease-out;"></div>',
  '<div id="rph-accept-bar" style="height: 100%; width: {{accept}}%; background: linear-gradient(90deg, #a18cd1 0%, #fbc2eb 100%); border-radius: 4px; transition: width 0.8s ease-out;"></div>',
  1, 'accept bar'
);
html = replaceAll(html, '<span>{{excitement}}%</span>', '<span id="rph-excitement">{{excitement}}%</span>', 1, 'excitement text');
html = replaceAll(
  html,
  '<div style="height: 100%; width: {{excitement}}%; background: linear-gradient(90deg, #ffecd2 0%, #fcb69f 100%); border-radius: 4px; transition: width 0.8s ease-out;"></div>',
  '<div id="rph-excitement-bar" style="height: 100%; width: {{excitement}}%; background: linear-gradient(90deg, #ffecd2 0%, #fcb69f 100%); border-radius: 4px; transition: width 0.8s ease-out;"></div>',
  1, 'excitement bar'
);
html = replaceAll(
  html,
  '<span style="display: inline-block; padding: 4px 10px; background: rgba(102, 126, 234, 0.1); color: #667eea; border-radius: 12px; font-weight: 600; font-size: 13px;">{{stage}}</span>',
  '<span id="rph-stage" style="display: inline-block; padding: 4px 10px; background: rgba(102, 126, 234, 0.1); color: #667eea; border-radius: 12px; font-weight: 600; font-size: 13px;">{{stage}}</span>',
  1, 'stage'
);
html = replaceAll(
  html,
  '<div style="padding: 8px 12px; background: #f8f9fa; border-radius: 6px; border-left: 3px solid #667eea; line-height: 1.5; font-size: 14px; color: #212529;">{{mental}}</div>',
  '<div id="rph-mental" style="padding: 8px 12px; background: #f8f9fa; border-radius: 6px; border-left: 3px solid #667eea; line-height: 1.5; font-size: 14px; color: #212529;">{{mental}}</div>',
  1, 'mental'
);
html = replaceAll(
  html,
  '<div style="padding: 8px 12px; background: #f8f9fa; border-radius: 6px; border-left: 3px solid #667eea; line-height: 1.5; font-size: 14px; color: #212529;">{{attitude}}</div>',
  '<div id="rph-attitude" style="padding: 8px 12px; background: #f8f9fa; border-radius: 6px; border-left: 3px solid #667eea; line-height: 1.5; font-size: 14px; color: #212529;">{{attitude}}</div>',
  1, 'attitude'
);

// 3) 脚本：switchCharacter 用传入的元素，去掉裸 event / window.location / window.refreshUI
html = replaceAll(html, 'function switchCharacter(charId) {', 'function switchCharacter(el, charId) {', 1, 'signature');
html = replaceAll(html, "event.currentTarget.classList.add('active');", "el.classList.add('active');", 1, 'classList');
html = replaceAll(html, "event.currentTarget.style.background = 'rgba(102, 126, 234, 0.1)';", "el.style.background = 'rgba(102, 126, 234, 0.1)';", 1, 'bg');
html = replaceAll(html, "event.currentTarget.style.borderLeft = '3px solid #667eea';", "el.style.borderLeft = '3px solid #667eea';", 1, 'border');
html = replaceAll(html, 'event.currentTarget.appendChild(span);', 'el.appendChild(span);', 1, 'append');
html = replaceAll(html, 'window.location = globalState.location;', '// 已移除：对 window.location 赋值会触发整页跳转（位置显示由 refreshPanel 直接更新）', 1, 'location');
html = replaceAll(html, 'window.refreshUI && window.refreshUI();', 'refreshPanel(data);', 1, 'refreshUI');

// 4) 新增 refreshPanel：直接刷新面板 DOM（数据在模板自己的 characterDatabase 里）
const refreshPanelFn = `
// 刷新面板数值（切换角色后直接更新面板，兼容 Shadow DOM 渲染；不再依赖 window.refreshUI）
function refreshPanel(d) {
    var setText = function(id, text) {
        var el = document.getElementById(id);
        if (el) el.textContent = text;
    };
    setText('rph-weekday', globalState.weekday);
    setText('rph-location', globalState.location);
    setText('rph-char-name', d.char_name);
    setText('rph-outfit', d.outfit);
    setText('rph-favor', d.favor + '%');
    setText('rph-accept', d.accept + '%');
    setText('rph-excitement', d.excitement + '%');
    setText('rph-stage', d.stage);
    setText('rph-mental', d.mental);
    setText('rph-attitude', d.attitude);
    var favorBar = document.getElementById('rph-favor-bar');
    if (favorBar) favorBar.style.width = d.favor + '%';
    var acceptBar = document.getElementById('rph-accept-bar');
    if (acceptBar) acceptBar.style.width = d.accept + '%';
    var excitementBar = document.getElementById('rph-excitement-bar');
    if (excitementBar) excitementBar.style.width = d.excitement + '%';
}
`;
html = replaceAll(html, '// 初始化hover效果', refreshPanelFn + '\n// 初始化hover效果', 1, 'insert refreshPanel');

// 5) 自检：修复后不应再出现裸 event.currentTarget
if (html.includes('event.currentTarget')) {
  throw new Error('自检失败：仍存在 event.currentTarget');
}
if (!html.includes("switchCharacter(this,'")) {
  throw new Error('自检失败：onclick 未传 this');
}
if (!html.includes('function refreshPanel(d)')) {
  throw new Error('自检失败：refreshPanel 未注入');
}

/* ---------- 写回两个模板副本（顶层 uiTemplates + extensions.rp_hub_ui_templates） ---------- */
const templateRefs = [];
if (Array.isArray(inner.uiTemplates) && inner.uiTemplates.length) templateRefs.push(inner.uiTemplates[0]);
if (inner.extensions && Array.isArray(inner.extensions.rp_hub_ui_templates) && inner.extensions.rp_hub_ui_templates.length) {
  templateRefs.push(inner.extensions.rp_hub_ui_templates[0]);
}
for (const t of templateRefs) t.htmlTemplate = html;

/* ---------- 重建 PNG（只替换 chara 块，其余字节原样保留） ---------- */
const newPayload = Buffer.from(JSON.stringify(card), 'utf8').toString('base64');
const outParts = [buf.subarray(0, 8)];
let pos = 8;
let replaced = false;
while (pos + 8 <= buf.length) {
  const length = buf.readUInt32BE(pos);
  const type = buf.toString('latin1', pos + 4, pos + 8);
  const dataStart = pos + 8;
  const dataEnd = dataStart + length;
  if (type === 'tEXt') {
    let cursor = dataStart;
    while (cursor < dataEnd && buf[cursor] !== 0) cursor += 1;
    const key = buf.toString('utf8', dataStart, cursor);
    if (key === 'chara') {
      outParts.push(createTextChunk('chara', newPayload));
      replaced = true;
      pos = dataEnd + 4;
      continue;
    }
  }
  outParts.push(buf.subarray(pos, dataEnd + 4));
  pos = dataEnd + 4;
}
if (!replaced) {
  console.error('重建 PNG 时未替换 chara 块');
  process.exit(1);
}
const out = Buffer.concat(outParts);
fs.writeFileSync(dst, out);

/* ---------- 摘要 ---------- */
console.log('已生成修复版:', dst);
console.log('原文件保留:', src);
console.log('chara 载荷: ', payload.length, '->', newPayload.length, 'bytes(base64)');
console.log('模板长度:   ', (templates[0].htmlTemplate || '').length, '->', html.length);
console.log('onclick 传 this 的选项数:', (html.match(/onclick="switchCharacter\(this,/g) || []).length);
console.log('剩余 event.currentTarget 数:', (html.match(/event.currentTarget/g) || []).length);
console.log('refreshPanel 引用数:', (html.match(/refreshPanel/g) || []).length);
