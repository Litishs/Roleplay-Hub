// 生成「界面材质回归测试卡」——可导入的角色卡文件（2026-11-26）。
//
// 产物（输出到 documents/，该目录不入库）：
//   documents/material-test-card.png   PNG 角色卡（tEXt chunk key = chara，base64 的 V2 JSON）
//   documents/material-test-card.json  JSON 角色卡（同一个 V2 结构，便于 diff / 手工改）
//
// 这张卡是纯全年龄测试内容：不写剧情、不写 NSFW，只负责把角色回复的每条渲染
// 路径铺满，方便在应用里导入后肉眼验收深色/浅色可读性。
//
// 用法：node scripts/build-material-test-card.mjs
//
// 卡内包含：
//   - 角色级正则 4 条（台词 / 动作 / 说话人 / 内心独白），注入 .rph-style-* span
//   - 角色级 UI 模板 1 个（顶部状态条，含 {{变量}} 与 {{#each}} 循环）
//   - 角色书（character_book）1 条，验证角色级世界书随卡装载
//   - first_mes 即完整的四路径演示正文
//
// 覆盖的渲染路径：
//   A 纯文本          -> .msg-bubble-glass 背景 + 继承色
//   B 正则美化 span    -> .rph-style-dialogue / -action / -speaker / -inner
//   C Markdown 块     -> code / pre / blockquote / table / th / td / a / hr
//   D HTML 卡片       -> iframe.executable-html-frame + 卡片文档浅色基线
//   E 错误文本        -> .response-error-text
//   F 用户气泡        -> bg-blue-50/85
//
// 图标是程序生成的纯色渐变 PNG（无外部素材、无版权问题），只为让卡片在列表里
// 有个可辨认的缩略图。

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---- 四路径演示正文（Markdown 源码）------------------------------------------
//
// 结构约束（来自 useTemplateRenderer 的整篇文档检测）：只要正文里出现 ``` 围栏，
// `containsHtmlDoc && !trimmed.includes('```')` 就不成立，完整 HTML 文档不会被
// 拆进 iframe。所以代码块用原生 <pre><code> 写，既避开围栏、又同样命中
// `.markdown-body pre` / `pre code` 两条样式（要验的就是这两条）。
//
// 正文被拆成三段：preText（Markdown）→ iframe（HTML 卡片）→ postText。
const FIRST_MES = [
    '## 一、纯文本与正则',
    '',
    '这是一段纯文本，用来检查气泡底色与文字色。',
    '',
    '「这是一句被正则高亮的台词」然后（这是一个被正则灰显的动作描述）。',
    '',
    '萧寒：这是剧本体的说话人行。',
    '',
    '『这是轻小说体的内心独白』',
    '',
    '## 二、Markdown 元素',
    '',
    '有 **粗体**、*斜体*、`行内代码`、~~删除线~~，还有 [一个链接](https://example.com)。',
    '',
    '> 这是一个引用块。它有自己的左边框与文字色。',
    '',
    '| 表头 A | 表头 B | 表头 C |',
    '| --- | --- | --- |',
    '| 单元格 1 | 单元格 2 | 单元格 3 |',
    '| 单元格 4 | 单元格 5 | 单元格 6 |',
    '',
    '<pre><code>// 代码块：检查 pre 背景、pre code 文字色、边框',
    'const greeting = "你好，世界";',
    'function test() {',
    '  return greeting.repeat(2);',
    '}</code></pre>',
    '',
    '---',
    '',
    '### 三级标题',
    '',
    '1. 有序列表第一项',
    '2. 有序列表第二项',
    '',
    '- 无序列表第一项',
    '- 无序列表第二项',
    '',
    '<div style="padding:10px;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc;color:#0f172a">',
    '  <b>内联 HTML 块</b>：这段是气泡内的 HTML（非 iframe），检查深色下是否可读。',
    '</div>',
    '',
    '## 三、错误文本',
    '',
    '<div class="response-error-text">-- 这是一条错误提示文本（检查深色对比度）--</div>',
    '',
    '## 四、HTML 卡片',
    '',
    '下面这条是完整 HTML 文档，会走沙箱 iframe：',
    '',
    '<!DOCTYPE html>',
    '<html>',
    '<head>',
    '<meta charset="utf-8">',
    '<style>',
    '  body { font-family: system-ui, sans-serif; padding: 12px; }',
    '  .panel { border: 1px solid #d9dde2; border-radius: 10px; overflow: hidden; }',
    '  .head { background: #f1f5f9; padding: 10px 12px; font-weight: 700; color: #0f172a; }',
    '  .row { display: flex; justify-content: space-between; padding: 8px 12px; border-top: 1px solid #e8ecf1; color: #334155; }',
    '  .val { font-weight: 600; color: #1d4ed8; }',
    '  .bar { height: 6px; background: #e2e8f0; border-radius: 3px; margin-top: 8px; }',
    '  .bar > i { display: block; height: 100%; width: 68%; background: #3b82f6; border-radius: 3px; }',
    '</style>',
    '</head>',
    '<body>',
    '  <div class="panel">',
    '    <div class="head">状态面板（HTML 卡片 / iframe）</div>',
    '    <div class="row"><span>地点</span><span class="val">云梦泽 · 渡口</span></div>',
    '    <div class="row"><span>时辰</span><span class="val">子时</span></div>',
    '    <div class="row"><span>体力</span><span class="val">68 / 100</span></div>',
    '    <div class="bar"><i></i></div>',
    '  </div>',
    '  <p style="margin:12px 0 0;color:#64748b;font-size:12px">',
    '    这张卡片没有设置 body 背景色，靠应用的浅色基线保证可读。',
    '  </p>',
    '</body>',
    '</html>',
    '',
    '上面卡片之后的正文（postText）也要能正常渲染。'
].join('\n');

// ---- 角色级正则 --------------------------------------------------------------
const REGEX_SCRIPTS = [
    {
        name: '[材质测试] 台词高亮',
        findRegex: '「([^」]{1,200})」',
        replaceString: '<span class="rph-style-dialogue">「$1」</span>',
        regexFlags: 'g',
        disabled: false,
        placement: [1, 2],
        markdownOnly: true,
        promptOnly: false,
        runOnEdit: false
    },
    {
        name: '[材质测试] 动作灰显',
        findRegex: '（([^（）]{1,160})）',
        replaceString: '<span class="rph-style-action">（$1）</span>',
        regexFlags: 'g',
        disabled: false,
        placement: [1, 2],
        markdownOnly: true,
        promptOnly: false,
        runOnEdit: false
    },
    {
        name: '[材质测试] 说话人加粗',
        findRegex: '^([^\\s：:「」]{1,12}[：:])(.*)$',
        replaceString: '<span class="rph-style-speaker">$1</span>$2',
        regexFlags: 'gm',
        disabled: false,
        placement: [1, 2],
        markdownOnly: true,
        promptOnly: false,
        runOnEdit: false
    },
    {
        name: '[材质测试] 内心独白',
        findRegex: '『([^』]{1,200})』',
        replaceString: '<span class="rph-style-inner">『$1』</span>',
        regexFlags: 'g',
        disabled: false,
        placement: [1, 2],
        markdownOnly: true,
        promptOnly: false,
        runOnEdit: false
    }
];

// ---- 角色级 UI 模板（顶部状态条，含变量与 #each）------------------------------
const UI_TEMPLATES = [
    {
        id: 'material-test-ui',
        name: '[材质测试] 状态条',
        enabled: true,
        scope: 'character',
        order: 100,
        placement: 'top',
        htmlTemplate: [
            '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:8px 10px;border-radius:10px;border:1px solid #cbd5e1;background:#f8fafc;color:#0f172a;font-size:12px">',
            '  <b>UI 模板变量：</b>',
            '  <span>地点 = {{location}}</span>',
            '  <span>时辰 = {{time}}</span>',
            '  <span>体力 = {{stats.hp}}</span>',
            '  <span style="display:flex;gap:4px">',
            '    {{#each tags as tag}}<i style="font-style:normal;padding:1px 6px;border-radius:999px;background:#e0e7ff;color:#3730a3">{{tag}}</i>{{/each}}',
            '  </span>',
            '</div>'
        ].join('\n'),
        initialVariableState: {
            location: '云梦泽 · 渡口',
            time: '子时',
            stats: { hp: 68 },
            tags: ['雨夜', '渡船', '陌生人']
        },
        variableSchema: '{"location":"string","time":"string","stats":{"hp":"number"},"tags":["string"]}',
        changeLog: []
    }
];

// ---- 角色书（character_book）-------------------------------------------------
const CHARACTER_BOOK = {
    name: '材质测试卡',
    entries: [
        {
            keys: ['云梦泽'],
            content: '云梦泽是测试卡里的虚构地点，用于确认角色级世界书随卡装载。',
            enabled: false,
            insertion_order: 0,
            comment: '[材质测试] 云梦泽',
            selective: false,
            position: 'before_char'
        }
    ]
};

// ---- 卡片正文（V2 spec）------------------------------------------------------
const CARD = {
    spec: 'chara_card_v2',
    spec_version: '2.0',
    data: {
        name: '材质测试卡',
        description: '界面材质与深色模式回归测试卡。不做剧情，只把角色回复的每条渲染路径铺满，用来肉眼验收深色/浅色可读性。',
        personality: '沉默寡言，只负责展示样式。',
        scenario: '一张用于视觉回归的测试卡。',
        first_mes: FIRST_MES,
        mes_example: '',
        creator_notes: '全年龄测试卡。导入后在「会话」里点开本卡，首条消息即包含：纯文本、正则美化、Markdown 各元素、内联 HTML、错误文本、完整 HTML 卡片。切换深浅主题对照即可。',
        system_prompt: '',
        post_history_instructions: '',
        alternate_greetings: [],
        tags: ['测试', '材质', '界面'],
        creator: 'RoleplayHub',
        character_version: '1.0.0',
        extensions: {
            rp_hub_watermark: 'rp-hub',
            regex_scripts: REGEX_SCRIPTS,
            rp_hub_ui_templates: UI_TEMPLATES
        },
        uiTemplates: UI_TEMPLATES,
        character_book: CHARACTER_BOOK
    }
};

// ---- 图标：程序生成的渐变 PNG（无外部素材）------------------------------------
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i += 1) {
        let c = i;
        for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        table[i] = c >>> 0;
    }
    return table;
})();

const crc32 = (bytes) => {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i += 1) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[i]) & 0xFF];
    return (crc ^ 0xFFFFFFFF) >>> 0;
};

const chunk = (type, data) => {
    const typeBytes = Buffer.from(type, 'ascii');
    const body = Buffer.concat([typeBytes, data]);
    const out = Buffer.alloc(8 + data.length + 4);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), 8 + data.length);
    return out;
};

// 64x64 对角渐变 + 中间一个浅色圆点，缩略图上能认出来即可。
const buildIconPng = (size = 64) => {
    const raw = Buffer.alloc((size * 4 + 1) * size);
    for (let y = 0; y < size; y += 1) {
        const rowStart = y * (size * 4 + 1);
        raw[rowStart] = 0; // filter: none
        for (let x = 0; x < size; x += 1) {
            const t = (x + y) / (2 * (size - 1));
            // #2563eb -> #7c3aed
            const r = Math.round(0x25 + (0x7c - 0x25) * t);
            const g = Math.round(0x63 + (0x3a - 0x63) * t);
            const b = Math.round(0xeb + (0xed - 0xeb) * t);
            const cx = x - size / 2 + 0.5;
            const cy = y - size / 2 + 0.5;
            const inside = Math.hypot(cx, cy) < size * 0.16;
            const i = rowStart + 1 + x * 4;
            raw[i] = inside ? 0xf8 : r;
            raw[i + 1] = inside ? 0xfa : g;
            raw[i + 2] = inside ? 0xfc : b;
            raw[i + 3] = 0xff;
        }
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0);
    ihdr.writeUInt32BE(size, 4);
    ihdr[8] = 8;   // bit depth
    ihdr[9] = 6;   // colour type: RGBA
    ihdr[10] = 0;  // compression
    ihdr[11] = 0;  // filter
    ihdr[12] = 0;  // interlace
    return Buffer.concat([
        PNG_SIGNATURE,
        chunk('IHDR', ihdr),
        chunk('IDAT', deflateSync(raw, { level: 9 })),
        chunk('IEND', Buffer.alloc(0))
    ]);
};

// ---- 写入 PNG 的 tEXt 块（key = chara，值为 base64 的 JSON）--------------------
const injectTextChunk = (png, key, value) => {
    const chunkData = Buffer.concat([
        Buffer.from(key, 'latin1'),
        Buffer.from([0]),
        Buffer.from(value, 'latin1')
    ]);
    const textChunk = chunk('tEXt', chunkData);
    // 插在 IHDR 之后：IHDR 是签名(8) + 长度(4) + 类型(4) + 数据(13) + CRC(4) = 33 字节
    return Buffer.concat([png.subarray(0, 33), textChunk, png.subarray(33)]);
};

const png = injectTextChunk(
    buildIconPng(),
    'chara',
    Buffer.from(JSON.stringify(CARD), 'utf8').toString('base64')
);

const pngPath = join(ROOT, 'documents', 'material-test-card.png');
const jsonPath = join(ROOT, 'documents', 'material-test-card.json');
writeFileSync(pngPath, png);
writeFileSync(jsonPath, JSON.stringify(CARD, null, 2) + '\n', 'utf8');

console.log('已生成：');
console.log('  ' + pngPath + '  (' + png.length + ' 字节)');
console.log('  ' + jsonPath + '  (' + Buffer.byteLength(JSON.stringify(CARD)) + ' 字节)');
console.log('');
console.log('导入：应用 → 会话 → 右上角「+」→ 从文件导入角色卡，选 material-test-card.png');
console.log('验收：点开「材质测试卡」，首条消息即铺满四路径；切深浅主题对照可读性。');
