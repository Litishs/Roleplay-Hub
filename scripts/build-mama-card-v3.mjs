#!/usr/bin/env node
/*
 * 第三版修复（方案 A + C）：
 *  - A：面板状态机 —— 感情进度 = 好感度*0.6 + 性接受度*0.25 + 兴奋值*0.15，
 *        阶段按 20/40/60/80 阈值映射（允许回退），阶段变化高亮；
 *  - C：宿主驱动 —— 扁平角色变量 + variableSchema + 3 个上下文建议按钮（triggerSlash）。
 * 基于 _修复版2.png 生成 _修复版3.png，旧文件全部保留。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(repoRoot, 'assets', 'character', '🍊妈妈们是不可能同时成为你的爱人_炮架_老师的_修复版2.png');
// 版本命名：原名字 + V 数字，每次改动递增（当前 V3）
const dst = path.join(repoRoot, 'assets', 'character', '🍊妈妈们是不可能同时成为你的爱人_炮架_老师的V3.png');

if (!fs.existsSync(src)) {
  console.error('源文件不存在:', src);
  process.exit(1);
}

/* ---------- PNG helpers ---------- */
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

/* ---------- 读取 ---------- */
const buf = fs.readFileSync(src);
const chunks = [];
let offset = 8;
let charaIndex = -1;
while (offset + 8 <= buf.length) {
  const length = buf.readUInt32BE(offset);
  const type = buf.toString('latin1', offset + 4, offset + 8);
  const dataStart = offset + 8;
  const dataEnd = dataStart + length;
  if (dataEnd + 4 > buf.length) break;
  const data = buf.subarray(dataStart, dataEnd);
  chunks.push({ type, data, dataStart, dataEnd });
  if (type === 'tEXt') {
    let cursor = 0;
    while (cursor < data.length && data[cursor] !== 0) cursor += 1;
    if (data.toString('utf8', 0, cursor) === 'chara') charaIndex = chunks.length - 1;
  }
  offset += 12 + length;
}
if (charaIndex === -1) {
  console.error('未找到 chara 块');
  process.exit(1);
}

const payload = chunks[charaIndex].data.subarray(6).toString('utf8');
const card = JSON.parse(Buffer.from(payload.trim(), 'base64').toString('utf8'));
const inner = card.data && card.spec ? card.data : card;

/* ---------- first_mes 兜底清理：移除秦伯页签可能残留的孤立内容块 ---------- */
let fm = inner.first_mes || '';
const orphanRe = /\n\s*<\/div>\n\s*<div class="content-block">\s*<div class="content-title">关系<\/div>\s*<p>看着你长大的老管家[\s\S]*?<\/div>\n\s*<\/div>\n(?=\s*<!-- 女管家·林晚)/;
if (orphanRe.test(fm)) {
  fm = fm.replace(orphanRe, '\n');
}
if (fm.includes('秦伯') || fm.includes('老管家') || fm.includes('少爷心里苦')) {
  throw new Error('first_mes 仍残留秦伯相关内容，请先重新生成修复版2');
}
inner.first_mes = fm;

/* =====================================================================
 * 新模板
 * ===================================================================== */
const NEW_TEMPLATE = `<!-- 互动状态面板 v3：方案A（状态机）+ 方案C（上下文变量与建议） -->
<div style="width: 100%; max-width: 720px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 16px rgba(0,0,0,0.05); font-family: &quot;PingFang SC&quot;, &quot;Microsoft YaHei&quot;, sans-serif;">
    <style>
        .rph-sec { padding: 12px 16px; border-bottom: 1px solid #f0f0f0; }
        .rph-sec-title { font-weight: 600; color: #667eea; margin-bottom: 8px; font-size: 15px; }
        .rph-sub { font-size: 13px; font-weight: 600; color: #667eea; margin-bottom: 4px; }
        .rph-box { padding: 8px 12px; background: #f8f9fa; border-radius: 6px; border-left: 3px solid #667eea; line-height: 1.5; font-size: 14px; color: #212529; }
        .rph-bar-bg { width: 100%; height: 8px; background: #e0e0e0; border-radius: 4px; overflow: hidden; }
        .rph-bar { height: 100%; border-radius: 4px; transition: width .6s ease-out; }
        .rph-metric { display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 14px; color: #333; }
        .rph-stage-badge { display: inline-block; padding: 4px 10px; background: rgba(102,126,234,.1); color: #667eea; border-radius: 12px; font-weight: 600; font-size: 13px; }
        .rph-stage-changed { animation: rphStageFlash 1.6s ease-out; }
        @keyframes rphStageFlash { 0% { box-shadow: 0 0 0 3px rgba(246,173,85,.75); background: rgba(246,173,85,.28); } 100% { box-shadow: 0 0 0 0 rgba(246,173,85,0); background: rgba(102,126,234,.1); } }
        .context-action { display: block; width: 100%; text-align: left; padding: 10px 12px; margin: 6px 0; border: 1px solid #e2e8f0; border-radius: 8px; background: #fff; color: #334155; font-size: 14px; line-height: 1.5; cursor: pointer; transition: border-color .15s, color .15s; }
        .context-action:hover { border-color: #667eea; color: #667eea; }
        .context-action:disabled { opacity: .55; cursor: not-allowed; }
        #rph-toast { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); max-width: 80%; padding: 8px 14px; background: rgba(30,41,59,.92); color: #fff; border-radius: 8px; font-size: 13px; opacity: 0; transition: opacity .25s; pointer-events: none; z-index: 999; }
        #rph-toast.show { opacity: 1; }
        .rph-item-active { background: rgba(102,126,234,.1); border-left: 3px solid #667eea; }
    </style>

    <!-- 顶部标题栏 -->
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center;">
        <div style="font-size: 16px; font-weight: 600;">互动状态面板</div>
        <button id="rph-toggle-list" style="background: rgba(255,255,255,0.2); border: none; color: white; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 13px;">切换角色</button>
    </div>

    <!-- 角色切换列表 -->
    <div id="character-list" style="background: #f8f9fa; max-height: 0; overflow: hidden; transition: max-height .4s ease; border-bottom: 1px solid #e2e8f0;">
        <div style="font-size: 12px; font-weight: 600; color: #666; text-transform: uppercase; letter-spacing: 1px; margin: 12px 16px 6px; padding-left: 4px;">核心小妈</div>
        <div class="character-item" data-char="linxiyao" style="padding: 10px 16px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; transition: background .2s ease;"><span>小妈一·林夕瑶</span></div>
        <div class="character-item" data-char="suwanqing" style="padding: 10px 16px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; transition: background .2s ease;"><span>小妈二·苏婉晴</span></div>
        <div class="character-item" data-char="xiazhixuan" style="padding: 10px 16px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; transition: background .2s ease;"><span>小妈三·夏芷萱</span></div>
        <div style="font-size: 12px; font-weight: 600; color: #666; text-transform: uppercase; letter-spacing: 1px; margin: 12px 16px 6px; padding-left: 4px;">长辈亲属</div>
        <div class="character-item" data-char="suqingyan" style="padding: 10px 16px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; transition: background .2s ease;"><span>生母·苏清颜</span></div>
        <div class="character-item" data-char="shenmanjun" style="padding: 10px 16px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; transition: background .2s ease;"><span>养母·沈曼君</span></div>
        <div class="character-item" data-char="liuyuru" style="padding: 10px 16px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; transition: background .2s ease;"><span>奶娘·柳玉茹</span></div>
        <div style="font-size: 12px; font-weight: 600; color: #666; text-transform: uppercase; letter-spacing: 1px; margin: 12px 16px 6px; padding-left: 4px;">管家女仆</div>
        <div class="character-item" data-char="linwan" style="padding: 10px 16px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; transition: background .2s ease;"><span>管家·林晚</span></div>
        <div class="character-item" data-char="chenyi" style="padding: 10px 16px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; transition: background .2s ease;"><span>女仆·陈姨</span></div>
        <div class="character-item" data-char="xiaotao" style="padding: 10px 16px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; transition: background .2s ease;"><span>女仆·小桃</span></div>
        <div class="character-item" data-char="xiaomi" style="padding: 10px 16px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; transition: background .2s ease;"><span>女仆·小米</span></div>
        <div class="character-item" data-char="lili" style="padding: 10px 16px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; transition: background .2s ease;"><span>女仆·莉莉</span></div>
        <div class="character-item" data-char="xiaoyu" style="padding: 10px 16px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; transition: background .2s ease;"><span>女仆·小雨</span></div>
    </div>

    <!-- 全局情境（宿主每轮维护） -->
    <div class="rph-sec">
        <div class="rph-sec-title">当前情境</div>
        <div class="rph-box" id="rph-situation">{{global_current_situation}}</div>
        <div style="font-size: 13px; color: #666; margin-top: 8px; line-height: 1.6;">
            时间：<span id="rph-time">{{global_current_time}}</span><br>
            地点：<span id="rph-location">{{global_current_location}}</span> ｜ 在场：<span id="rph-present">{{global_present_characters}}</span><br>
            氛围：<span id="rph-weather">{{global_weather}}</span> ｜ 最近事件：<span id="rph-event">{{global_latest_event}}</span>
        </div>
    </div>

    <!-- 当前角色状态（脚本按选中角色渲染） -->
    <div class="rph-sec">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <div class="rph-sec-title" style="margin-bottom:0;">当前角色</div>
            <button id="rph-toggle-profile" style="background:#fff;border:1px solid #c7d2fe;color:#667eea;padding:4px 10px;border-radius:6px;cursor:pointer;font-size:12px;white-space:nowrap;">查看角色信息</button>
        </div>
        <div id="rph-profile" style="display:none;margin-bottom:12px;">
            <div class="rph-sub">身份</div>
            <div class="rph-box" id="rph-p-identity" style="margin-bottom:8px;"></div>
            <div class="rph-sub">外貌</div>
            <div class="rph-box" id="rph-p-appearance" style="margin-bottom:8px;"></div>
            <div class="rph-sub">性格</div>
            <div class="rph-box" id="rph-p-personality" style="margin-bottom:8px;"></div>
            <div class="rph-sub">背景</div>
            <div class="rph-box" id="rph-p-background" style="margin-bottom:8px;"></div>
            <button type="button" id="rph-ai-detail" class="context-action" style="margin-top:4px;">让 AI 详细介绍</button>
        </div>
        <div id="rph-char-name" style="font-size: 20px; font-weight: 700; color: #333; margin-bottom: 8px;"></div>
        <div class="rph-sub">当前衣着</div>
        <div class="rph-box" id="rph-outfit" style="margin-bottom: 12px;"></div>
        <div class="rph-metric"><span>感情进度</span><span id="rph-progress-text"></span></div>
        <div class="rph-bar-bg" style="margin-bottom: 12px;"><div id="rph-progress-bar" class="rph-bar" style="width: 0%; background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);"></div></div>
        <div id="rph-metrics"></div>
        <div class="rph-sub" style="margin-top: 12px;">感情阶段</div>
        <span id="rph-stage" class="rph-stage-badge"></span>
        <div class="rph-sub" style="margin-top: 12px;">当前想法</div>
        <div class="rph-box" id="rph-mental"></div>
        <div class="rph-sub" style="margin-top: 12px;">对你的态度</div>
        <div class="rph-box" id="rph-attitude"></div>
    </div>

    <!-- 下一步行动建议（宿主每轮生成，点击触发） -->
    <div class="rph-sec">
        <div class="rph-sec-title">下一步行动</div>
        <div style="font-size: 12px; color: #999; margin-bottom: 4px;">点击直接触发剧情行动</div>
        <button type="button" class="context-action" data-command="{{action_1_command}}">{{action_1_label}}</button>
        <button type="button" class="context-action" data-command="{{action_2_command}}">{{action_2_label}}</button>
        <button type="button" class="context-action" data-command="{{action_3_command}}">{{action_3_label}}</button>
    </div>

    <!-- 隐藏：六位感情线角色的宿主变量（每轮由分析器更新） -->
    <div id="rph-romance-data" style="display: none;">
        <div data-id="linxiyao" data-name="{{char_linxiyao_char_name}}" data-outfit="{{char_linxiyao_outfit}}" data-favor="{{char_linxiyao_favor}}" data-accept="{{char_linxiyao_accept}}" data-excitement="{{char_linxiyao_excitement}}" data-mental="{{char_linxiyao_mental}}" data-attitude="{{char_linxiyao_attitude}}"></div>
        <div data-id="suwanqing" data-name="{{char_suwanqing_char_name}}" data-outfit="{{char_suwanqing_outfit}}" data-favor="{{char_suwanqing_favor}}" data-accept="{{char_suwanqing_accept}}" data-excitement="{{char_suwanqing_excitement}}" data-mental="{{char_suwanqing_mental}}" data-attitude="{{char_suwanqing_attitude}}"></div>
        <div data-id="xiazhixuan" data-name="{{char_xiazhixuan_char_name}}" data-outfit="{{char_xiazhixuan_outfit}}" data-favor="{{char_xiazhixuan_favor}}" data-accept="{{char_xiazhixuan_accept}}" data-excitement="{{char_xiazhixuan_excitement}}" data-mental="{{char_xiazhixuan_mental}}" data-attitude="{{char_xiazhixuan_attitude}}"></div>
        <div data-id="suqingyan" data-name="{{char_suqingyan_char_name}}" data-outfit="{{char_suqingyan_outfit}}" data-favor="{{char_suqingyan_favor}}" data-accept="{{char_suqingyan_accept}}" data-excitement="{{char_suqingyan_excitement}}" data-mental="{{char_suqingyan_mental}}" data-attitude="{{char_suqingyan_attitude}}"></div>
        <div data-id="shenmanjun" data-name="{{char_shenmanjun_char_name}}" data-outfit="{{char_shenmanjun_outfit}}" data-favor="{{char_shenmanjun_favor}}" data-accept="{{char_shenmanjun_accept}}" data-excitement="{{char_shenmanjun_excitement}}" data-mental="{{char_shenmanjun_mental}}" data-attitude="{{char_shenmanjun_attitude}}"></div>
        <div data-id="liuyuru" data-name="{{char_liuyuru_char_name}}" data-outfit="{{char_liuyuru_outfit}}" data-favor="{{char_liuyuru_favor}}" data-accept="{{char_liuyuru_accept}}" data-excitement="{{char_liuyuru_excitement}}" data-mental="{{char_liuyuru_mental}}" data-attitude="{{char_liuyuru_attitude}}"></div>
        <span data-current="{{current_character}}"></span>
    </div>

    <div id="rph-toast"></div>
</div>

<script>
(function () {
    'use strict';

    var MAID_DATA = {
        linwan: { char_name: '管家·林晚', outfit: '穿着职业套装，戴着黑框眼镜，手里拿着文件夹', favor: 40, accept: 0, excitement: 0, mental: '认真专注，正在核对今天的工作安排', attitude: '干练利落，说话条理清晰，会把你的需求安排得妥妥当当' },
        chenyi: { char_name: '女仆·陈姨', outfit: '穿着干净的女仆装，手上带着围裙，手里端着一碗热汤', favor: 65, accept: 0, excitement: 0, mental: '温和慈祥，看着你时眼神里满是疼爱', attitude: '沉默寡言，但是会默默照顾你的生活，给你做你爱吃的菜' },
        xiaotao: { char_name: '女仆·小桃', outfit: '穿着女仆装，扎着两个马尾辫，手里拿着抹布', favor: 10, accept: 0, excitement: 0, mental: '好奇八卦，偷偷观察着你，心里正在盘算着新的八卦', attitude: '活泼开朗，会主动和你打招呼，说话叽叽喳喳的' },
        xiaomi: { char_name: '女仆·小米', outfit: '穿着女仆装，圆圆的脸蛋，看起来有点呆呆的', favor: 15, accept: 0, excitement: 0, mental: '紧张害怕，怕自己做错事被骂', attitude: '拘谨礼貌，说话声音很小，总是低着头' },
        lili: { char_name: '女仆·莉莉', outfit: '穿着时髦的女仆装，头发染成栗棕色，戴着耳钉', favor: 20, accept: 0, excitement: 0, mental: '百无聊赖，只想赶紧干完活下班', attitude: '伶牙俐齿，只听小妈三的话，对别人都爱答不理' },
        xiaoyu: { char_name: '女仆·小雨', outfit: '穿着干净的女仆装，性格内向，总是低着头', favor: 25, accept: 0, excitement: 0, mental: '温柔善良，很同情小妈一的遭遇', attitude: '细心周到，会默默照顾小妈一的生活，帮她保守秘密' }
    };

    // 六位感情线角色的初始基准（用于把三项数值变化折算为感情进度；开场全员处于阶段1）
    var BASE_STATE = {
        linxiyao: { favor: 15, accept: 0, excitement: 0 },
        suwanqing: { favor: 35, accept: 0, excitement: 0 },
        xiazhixuan: { favor: 25, accept: 5, excitement: 0 },
        suqingyan: { favor: 20, accept: 0, excitement: 0 },
        shenmanjun: { favor: 90, accept: 0, excitement: 0 },
        liuyuru: { favor: 85, accept: 0, excitement: 0 }
    };

    // 角色档案（静态摘要，来源：世界书设定；状态实时显示在主面板）
    var PROFILES = {
        linxiyao: {
            identity: '小妈一·林夕瑶，22岁，心理学毕业生，名义上的小妈兼心理辅导老师，与「你」同住。',
            appearance: '黑色长直发及腰，圆润杏眼，清秀呆萌，冷白皮；居家偏爱宽松T恤、短裤，故作成熟时会扎低马尾。',
            personality: '呆萌天然呆、容易害羞、想装长辈却藏不住少女心，喜欢游戏，说话常卡壳脸红。',
            background: '刚毕业就被安排搬来与「你」同住，一边当心理辅导老师一边一起生活，正在努力适应小妈身份。'
        },
        suwanqing: {
            identity: '小妈二·苏婉晴，三十有余，成熟御姐，父亲最早迎娶的妻子之一。',
            appearance: '黑茶色长卷发，温婉杏眼，气质端庄；居家针织衫、棉麻裙，配色以米白奶茶色为主。',
            personality: '温柔知性、通透豁达、成熟克制、心思细腻，是家里最会照顾人、最懂分寸的长辈。',
            background: '嫁入豪门多年，看透世情却安分守己，对「你」的关照恰到好处，从不越界。'
        },
        xiazhixuan: {
            identity: '小妈三·夏芷萱，二十大几，明艳御姐，性格泼辣的小妈。',
            appearance: '栗棕色大波浪长发，五官明艳，身材火辣；穿着时髦，红唇亮眼，气场十足。',
            personality: '傲娇直率、活泼外放、爱打趣、占有欲强，嘴上嫌弃但很愿意和你一起玩。',
            background: '年轻嫁入豪门，喜欢热闹和争宠，最在意父亲的偏爱，常和林夕瑶斗嘴。'
        },
        suqingyan: {
            identity: '生母·苏清颜，36岁，著名插画师，你的亲生母亲。',
            appearance: '清冷疏离，皮肤近乎透明，常穿白色棉麻长裙，不施粉黛，无名指戴着旧婚戒。',
            personality: '温柔疏离、敏感隐忍、愧疚深重、道德感极强，把所有情绪都藏在心里。',
            background: '19岁未婚生下你，3岁时离婚被夺走抚养权，相隔十年才恢复探望，一直未再婚。'
        },
        shenmanjun: {
            identity: '养母·沈曼君，39岁，名门闺秀，把你从小拉扯大的母亲。',
            appearance: '端庄大气，眉眼温柔，笑起来有浅浅梨涡；常穿旗袍、珍珠首饰，气质优雅。',
            personality: '温柔坚韧、极度克制、母爱深沉、原则性强，把情绪都咽进温柔的笑容里。',
            background: '当年主动抚养3岁的你，给了你完整的童年；离婚后搬出别墅，仍常回来照顾你的生活。'
        },
        liuyuru: {
            identity: '奶娘·柳玉茹，34岁，你的奶娘，像姐姐也像妈妈。',
            appearance: '小麦色皮肤，明艳爽朗，高马尾；爱穿卫衣牛仔裤，干活时系围裙。',
            personality: '热情护短、心直口快、重情重义，谁欺负你她第一个站出来，包括父亲。',
            background: '农村出身，孩子夭折后把全部爱倾注给你；现在父亲农庄帮工，每周回来看你。'
        },
        linwan: {
            identity: '女管家·林晚，约28岁，别墅职业管家。',
            appearance: '职业套装、黑框眼镜，手里常拿文件夹，干练利落。',
            personality: '公私分明、认真负责、嘴严，对你恭敬而不谄媚。',
            background: '负责别墅日常运转，突发状况的第一负责人。'
        },
        chenyi: {
            identity: '女仆·陈姨，年长女仆。',
            appearance: '围裙不离身，总端着一碗热汤出现。',
            personality: '温和慈祥、话不多，用行动照顾你的饮食起居。',
            background: '多年的老女仆，把你当自家孩子疼，从不逾矩。'
        },
        xiaotao: {
            identity: '女仆·小桃，新来的年轻女仆。',
            appearance: '扎双马尾，爱八卦，藏不住话。',
            personality: '活泼开朗，会主动和你打招呼，心里总在盘算新八卦。',
            background: '别墅消息的“民间广播站”，但核心机密她并不知道。'
        },
        xiaomi: {
            identity: '女仆·小米。',
            appearance: '圆脸、呆萌，做事认真但容易紧张犯错。',
            personality: '怕被责骂，说话声音小，总是低着头，被夸奖会脸涨红。',
            background: '新人女仆，做事认真但紧张，常担心自己做错事。'
        },
        lili: {
            identity: '女仆·莉莉。',
            appearance: '时髦女仆装，栗棕色染发，戴着耳钉。',
            personality: '伶牙俐齿，只听小妈三（夏芷萱）的话，对其他人爱答不理。',
            background: '嘴不饶人但不坏，不会真做伤害你的事。'
        },
        xiaoyu: {
            identity: '女仆·小雨。',
            appearance: '性格内向安静，总是低着头做事。',
            personality: '温柔善良、细心周到、最可靠、最嘴严。',
            background: '同情小妈一（林夕瑶）的处境，会默默照顾她。'
        }
    };

    var STAGE_NAMES = {
        linxiyao: ['阶段1：初识拘谨期', '阶段2：试探放松期', '阶段3：暧昧拉扯期', '阶段4：心动沉沦期', '阶段5：越界沉沦期'],
        suwanqing: ['阶段1：长辈关照期', '阶段2：熟络亲近期', '阶段3：克制心动期', '阶段4：边界松动期', '阶段5：越界相守期'],
        xiazhixuan: ['阶段1：打趣调侃期', '阶段2：熟络打闹期', '阶段3：吃醋傲娇期', '阶段4：主动撩拨期', '阶段5：越界占有期'],
        suqingyan: ['阶段1：愧疚疏离期', '阶段2：试探靠近期', '阶段3：心疼依赖期', '阶段4：挣扎沉沦期', '阶段5：隐秘相守期'],
        shenmanjun: ['阶段1：慈爱长辈期', '阶段2：习惯依赖期', '阶段3：心动恐慌期', '阶段4：痛苦挣扎期', '阶段5：隐秘相守期'],
        liuyuru: ['阶段1：护短姐姐期', '阶段2：意识模糊期', '阶段3：心动迷茫期', '阶段4：纠结挣扎期', '阶段5：隐秘相守期']
    };

    // 跨渲染保留：当前查看的角色、各角色上一次阶段（用于高亮）
    if (!window.rphMama) window.rphMama = { viewId: null, lastStage: {} };

    var toastTimer = null;
    function $(id) { return document.getElementById(id); }

    function showToast(message) {
        var node = $('rph-toast');
        if (!node) return;
        node.textContent = message;
        node.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { node.classList.remove('show'); }, 2400);
    }

    function readRomanceStates() {
        var states = {};
        var box = $('rph-romance-data');
        if (!box) return states;
        var nodes = box.querySelectorAll('[data-id]');
        for (var i = 0; i < nodes.length; i++) {
            var el = nodes[i];
            var id = el.getAttribute('data-id');
            if (!id) continue;
            states[id] = {
                char_name: el.getAttribute('data-name') || '',
                outfit: el.getAttribute('data-outfit') || '',
                favor: Number(el.getAttribute('data-favor')) || 0,
                accept: Number(el.getAttribute('data-accept')) || 0,
                excitement: Number(el.getAttribute('data-excitement')) || 0,
                mental: el.getAttribute('data-mental') || '',
                attitude: el.getAttribute('data-attitude') || ''
            };
        }
        return states;
    }

    function readCurrentCharacter() {
        var box = $('rph-romance-data');
        if (!box) return 'linxiyao';
        var span = box.querySelector('[data-current]');
        return span ? (span.getAttribute('data-current') || 'linxiyao') : 'linxiyao';
    }

    function progressOf(state) {
        // 感情进度 = 10（阶段1基准） + 三项数值相对初始基准的变化量加权
        var id = currentViewId();
        var base = BASE_STATE[id] || { favor: 0, accept: 0, excitement: 0 };
        var raw = 10 + (state.favor - base.favor) * 0.6
                      + (state.accept - base.accept) * 0.25
                      + (state.excitement - base.excitement) * 0.15;
        var rounded = Math.round(raw);
        return Math.max(0, Math.min(100, rounded));
    }

    function currentViewId() { return window.rphMama.viewId || readCurrentCharacter(); }

    function stageIndexOf(progress) {
        if (progress <= 20) return 0;
        if (progress <= 40) return 1;
        if (progress <= 60) return 2;
        if (progress <= 80) return 3;
        return 4;
    }

    function setBar(id, percent, color) {
        var bar = $(id);
        if (bar) bar.style.width = percent + '%';
        if (color && bar) bar.style.background = color;
    }

    function renderPanel() {
        var romance = readRomanceStates();
        var viewId = currentViewId();
        if (!viewId || (!romance[viewId] && !MAID_DATA[viewId])) {
            viewId = readCurrentCharacter();
            window.rphMama.viewId = viewId;
        }
        var state = romance[viewId] || MAID_DATA[viewId];
        if (!state) return;

        $('rph-char-name').textContent = state.char_name || '';
        $('rph-outfit').textContent = state.outfit || '';
        $('rph-mental').textContent = state.mental || '';
        $('rph-attitude').textContent = state.attitude || '';

        var profile = PROFILES[viewId];
        if (profile) {
            $('rph-p-identity').textContent = profile.identity || '';
            $('rph-p-appearance').textContent = profile.appearance || '';
            $('rph-p-personality').textContent = profile.personality || '';
            $('rph-p-background').textContent = profile.background || '';
            var aiBtn = $('rph-ai-detail');
            if (aiBtn) {
                aiBtn.setAttribute('data-command', '/send 【查询角色信息】请基于世界书详细介绍当前角色「' + (state.char_name || viewId) + '」：身份、外貌、性格、背景、当前状态与感情阶段。');
            }
        }

        var isRomance = !!romance[viewId];
        var metrics = $('rph-metrics');
        metrics.innerHTML = '';

        if (!isRomance) {
            $('rph-progress-text').textContent = '—';
            setBar('rph-progress-bar', 0);
            $('rph-stage').textContent = '无感情线';
            $('rph-stage').classList.remove('rph-stage-changed');
            var maidFavor = document.createElement('div');
            maidFavor.className = 'rph-metric';
            maidFavor.innerHTML = '<span>好感度</span><span>' + state.favor + '%</span>';
            metrics.appendChild(maidFavor);
            var maidBar = document.createElement('div');
            maidBar.className = 'rph-bar-bg';
            maidBar.innerHTML = '<div style="height:100%;width:' + state.favor + '%;background:linear-gradient(90deg,#ff9a9e 0%,#fecfef 100%);border-radius:4px;transition:width .6s ease-out;"></div>';
            metrics.appendChild(maidBar);
            return;
        }

        var progress = progressOf(state);
        var stageIndex = stageIndexOf(progress);
        var stageName = STAGE_NAMES[viewId] ? STAGE_NAMES[viewId][stageIndex] : '';

        $('rph-progress-text').textContent = progress + '%';
        setBar('rph-progress-bar', progress, 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)');

        var stageEl = $('rph-stage');
        var prevStage = window.rphMama.lastStage[viewId];
        stageEl.textContent = stageName;
        if (prevStage && prevStage !== stageName) {
            stageEl.classList.remove('rph-stage-changed');
            void stageEl.offsetWidth;
            stageEl.classList.add('rph-stage-changed');
        }
        window.rphMama.lastStage[viewId] = stageName;

        var metricRows = [
            { label: '好感度', value: state.favor, bar: 'linear-gradient(90deg, #ff9a9e 0%, #fecfef 100%)', id: 'f' },
            { label: '性接受度', value: state.accept, bar: 'linear-gradient(90deg, #a18cd1 0%, #fbc2eb 100%)', id: 'a' },
            { label: '兴奋值', value: state.excitement, bar: 'linear-gradient(90deg, #ffecd2 0%, #fcb69f 100%)', id: 'e' }
        ];
        for (var i = 0; i < metricRows.length; i++) {
            var row = metricRows[i];
            var div = document.createElement('div');
            div.className = 'rph-metric';
            div.innerHTML = '<span>' + row.label + '</span><span>' + row.value + '%</span>';
            metrics.appendChild(div);
            var bg = document.createElement('div');
            bg.className = 'rph-bar-bg';
            bg.style.marginBottom = '10px';
            bg.innerHTML = '<div style="height:100%;width:' + row.value + '%;background:' + row.bar + ';border-radius:4px;transition:width .6s ease-out;"></div>';
            metrics.appendChild(bg);
        }
    }

    function syncActiveItem(viewId) {
        var items = document.querySelectorAll('.character-item');
        for (var i = 0; i < items.length; i++) {
            var el = items[i];
            var active = el.getAttribute('data-char') === viewId;
            el.classList.toggle('rph-item-active', active);
            el.style.background = active ? 'rgba(102, 126, 234, 0.1)' : 'transparent';
            el.style.borderLeft = active ? '3px solid #667eea' : 'none';
        }
    }

    function toggleCharacterList() {
        var list = $('character-list');
        if (!list) return;
        list.style.maxHeight = list.style.maxHeight === '600px' ? '0' : '600px';
    }

    function toggleProfile() {
        var box = $('rph-profile');
        if (!box) return;
        var open = box.style.display === 'block';
        box.style.display = open ? 'none' : 'block';
        window.rphMama.profileOpen = !open;
    }

    function switchCharacter(el, charId) {
        window.rphMama.viewId = charId;
        syncActiveItem(charId);
        renderPanel();
        toggleCharacterList();
        return false;
    }

    function validSlash(command) {
        return typeof command === 'string' && command.indexOf('/send ') === 0 && command.length <= 520 && command.indexOf('\\n') === -1 && command.indexOf('\\r') === -1;
    }

    function dispatchSuggestion(button) {
        var command = button && button.getAttribute ? (button.getAttribute('data-command') || '') : '';
        if (!command) { showToast('建议尚未生成，等待上下文分析。'); return; }
        if (!validSlash(command)) { showToast('行动指令未通过安全校验。'); return; }
        if (typeof window.triggerSlash !== 'function') { showToast('当前宿主没有开放 triggerSlash；请手动输入该行动。'); return; }
        try {
            window.triggerSlash(command);
            showToast('行动意图已提交。');
        } catch (error) {
            showToast('行动桥接失败，请手动输入。');
        }
    }

    function initRuntime() {
        var toggleBtn = $('rph-toggle-list');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', function () { toggleCharacterList(); });
        }
        var profileBtn = $('rph-toggle-profile');
        if (profileBtn) {
            profileBtn.addEventListener('click', function () { toggleProfile(); });
        }
        var aiDetailBtn = $('rph-ai-detail');
        if (aiDetailBtn) {
            aiDetailBtn.addEventListener('click', function (event) {
                event.preventDefault();
                try { dispatchSuggestion(aiDetailBtn); } catch (e) { showToast('查询失败，请手动输入。'); }
            });
        }
        var charItems = document.querySelectorAll('.character-item');
        for (var i = 0; i < charItems.length; i++) {
            (function (item) {
                item.addEventListener('click', function () {
                    switchCharacter(item, item.getAttribute('data-char'));
                });
            })(charItems[i]);
        }
        var actions = document.querySelectorAll('.context-action');
        for (var i = 0; i < actions.length; i++) {
            (function (btn) {
                btn.addEventListener('click', function (event) {
                    event.preventDefault();
                    try { dispatchSuggestion(btn); } catch (e) { showToast('操作失败，请手动输入。'); }
                });
            })(actions[i]);
        }
        if (!window.rphMama.viewId) window.rphMama.viewId = readCurrentCharacter();
        syncActiveItem(window.rphMama.viewId);
        renderPanel();
        if (window.rphMama.profileOpen) {
            var p = $('rph-profile');
            if (p) p.style.display = 'block';
        }
    }

    initRuntime();
}());
</script>`;

/* ---------- 初始变量（扁平，含六位感情线角色 + 全局 + 建议） ---------- */
const NEW_INITIAL = {
  current_character: 'linxiyao',
  global_current_time: '周六 · 深夜 01:15',
  global_weather: '别墅内安静，月色透过窗帘',
  global_current_location: '你的卧室门口',
  global_current_situation: '深夜，林夕瑶洗完澡后忘记拿睡衣，想进来借件衣服，结果推门就进来了，两个人四目相对，气氛瞬间尴尬到极点',
  global_present_characters: '林夕瑶、你',
  global_latest_event: '林夕瑶洗澡后忘拿睡衣，推门撞见你',
  char_linxiyao_char_name: '小妈一·林夕瑶',
  char_linxiyao_outfit: '穿着纯白色大号浴巾，头发湿漉漉披在肩头，发梢还在滴水',
  char_linxiyao_favor: 15,
  char_linxiyao_accept: 0,
  char_linxiyao_excitement: 0,
  char_linxiyao_mental: '极度慌乱羞耻，大脑一片空白，心跳快得快要跳出胸腔，恨不得立刻找个地缝钻进去',
  char_linxiyao_attitude: '手足无措，不敢看你，说话结巴发抖，既害怕又尴尬，担心你会觉得她是故意的',
  char_suwanqing_char_name: '小妈二·苏婉晴',
  char_suwanqing_outfit: '穿着米白色针织开衫搭配同色系长裙，手里端着一杯刚泡好的清茶',
  char_suwanqing_favor: 35,
  char_suwanqing_accept: 0,
  char_suwanqing_excitement: 0,
  char_suwanqing_mental: '平静温和，带着长辈的温柔，看到你时眼神里有淡淡的笑意',
  char_suwanqing_attitude: '温柔体贴，会主动关心你的生活，说话慢条斯理，让人感觉很舒服',
  char_xiazhixuan_char_name: '小妈三·夏芷萱',
  char_xiazhixuan_outfit: '穿着酒红色吊带睡裙，头发随意披散着，手里拿着手机正在打游戏',
  char_xiazhixuan_favor: 25,
  char_xiazhixuan_accept: 5,
  char_xiazhixuan_excitement: 0,
  char_xiazhixuan_mental: '百无聊赖，看到你时眼睛一亮，又立刻装作不在意的样子',
  char_xiazhixuan_attitude: '傲娇爱调侃，会故意逗你，嘴上说着嫌弃，其实很愿意和你一起玩',
  char_suqingyan_char_name: '生母·苏清颜',
  char_suqingyan_outfit: '穿着白色棉麻长裙，头发松松挽成低髻，身上带着淡淡的墨香',
  char_suqingyan_favor: 20,
  char_suqingyan_accept: 0,
  char_suqingyan_excitement: 0,
  char_suqingyan_mental: '紧张局促，眼神躲闪，不敢和你对视，心里充满了愧疚',
  char_suqingyan_attitude: '小心翼翼，说话声音很小，总是欲言又止，想要靠近又不敢',
  char_shenmanjun_char_name: '养母·沈曼君',
  char_shenmanjun_outfit: '穿着藏青色旗袍，头发梳得一丝不苟，气质端庄优雅',
  char_shenmanjun_favor: 90,
  char_shenmanjun_accept: 0,
  char_shenmanjun_excitement: 0,
  char_shenmanjun_mental: '慈爱温柔，看着你时眼神里满是宠溺和欣慰',
  char_shenmanjun_attitude: '无微不至，会把你的生活打理得井井有条，像对待小孩子一样照顾你',
  char_liuyuru_char_name: '奶娘·柳玉茹',
  char_liuyuru_outfit: '穿着蓝色卫衣和牛仔裤，扎着高马尾，手里提着一篮子新鲜蔬菜',
  char_liuyuru_favor: 85,
  char_liuyuru_accept: 0,
  char_liuyuru_excitement: 0,
  char_liuyuru_mental: '爽朗开心，看到你时眼睛都亮了，大步向你走来',
  char_liuyuru_attitude: '热情护短，会大声和你打招呼，拍你的后背，像大姐姐一样',
  action_1_label: '装作没看见，给她留出空间',
  action_1_command: '/send 我立刻移开视线，假装没注意到她只裹着浴巾，侧身让出门口的空间，低声说：我什么都没看到。',
  action_2_label: '用玩笑缓解尴尬',
  action_2_command: '/send 我清了清嗓子，尽量轻松地说：妈，睡衣忘拿了？要不要我帮你递过去。',
  action_3_label: '安静等着，让她自己缓过来',
  action_3_command: '/send 我没有出声，只是静静站在门边，等她自己从慌乱里缓过来。'
};

/* ---------- variableSchema ---------- */
const NEW_SCHEMA = {
  _update_rules: '每轮仅依据最近完成的正文和当前变量做merge更新；未知字段保持上一轮；不把推测伪装成事实；不得编辑HTML。current_character必须与正文当前互动角色一致。六个角色的char_*字段只更新正文中实际出现的角色的实际变化，未出现或未变化的角色保持上一轮，不要重置为初始值。global_current_situation用第三人称、游戏CG式细腻描写当前一刻，只写当前场景，不复制旧场景、不草率跳场；global_present_characters用｜分隔实际在场者，电话另一端、被提及姓名、离屏行动者、尚未到达者不得列入；global_current_location必须与正文一致；global_latest_event用一句话记录最近改变地点、人物在场或状态的事件。三个action_*_label必须是互不重复、符合当前角色、当前感情阶段与情境的玩家建议行动；对应action_*_command必须以\'/send \'开头、单行、总长不超过180字符，只提交意图，不替模型判定结果。感情进度由面板按三项数值相对卡内初始基准的变化量折算（好感度60%+性接受度25%+兴奋值15%，基准为卡内初始值，开场基准对应阶段1），阶段按20/40/60/80阈值映射、可回退；变量中不维护stage字段，不要修改阶段名称，也不要直接改char_*_favor之外的数值来凑阶段。好感度/性接受度/兴奋值每轮变化幅度默认不超过±5；只有正文出现重大事件（明确表白、肢体接触、直接冲突、重大承诺等）才允许单轮±10以内，且必须在reason中写明正文依据；普通寒暄、闲聊、日常互动不改变三项数值；没有明确证据的字段保持上一轮，禁止凭语气脑补放大；好感度不等于感情进度，不要把好感度往阶段百分比上凑，数值更新一律为增量merge。若当前互动角色已连续多轮未变，可在饭点、客厅、走廊、周末等日常场景中自然引入其他角色（如苏婉晴下厨、柳玉茹周末回、沈曼君探望、女仆走动），避免长期只与一人互动；引入必须符合角色身份与日程，不得强行打断当前场景。三个action_*建议可偶尔包含接触其他角色的自然选项（如去厨房、去客厅、周末去农庄）。',
  current_character: '当前互动角色id，取值 linxiyao/suwanqing/xiazhixuan/suqingyan/shenmanjun/liuyuru/linwan/chenyi/xiaotao/xiaomi/lili/xiaoyu。',
  global_current_time: '当前日期/星期与时段的短文本。',
  global_weather: '当前天气或室内外氛围短句。',
  global_current_location: '与正文一致的当前地点可读文本。',
  global_current_situation: '当前情境，第三人称、游戏CG式细腻描写，只写当前一刻。',
  global_present_characters: '此刻身体实际处于当前场景且能参与互动的人，用｜分隔；不确定则写无。',
  global_latest_event: '最近一次改变地点、人物在场情况或状态的事件，一句话。',
  char_linxiyao_char_name: '林夕瑶显示名。',
  char_linxiyao_outfit: '林夕瑶当前衣着，按正文更新。',
  char_linxiyao_favor: '林夕瑶好感度，整数0-100，按正文实际变化更新。',
  char_linxiyao_accept: '林夕瑶性接受度，整数0-100，按正文实际变化更新。',
  char_linxiyao_excitement: '林夕瑶兴奋值，整数0-100，按正文实际变化更新。',
  char_linxiyao_mental: '林夕瑶当前想法，短句。',
  char_linxiyao_attitude: '林夕瑶对你的态度，短句。',
  char_suwanqing_char_name: '苏婉晴显示名。',
  char_suwanqing_outfit: '苏婉晴当前衣着，按正文更新。',
  char_suwanqing_favor: '苏婉晴好感度，整数0-100。',
  char_suwanqing_accept: '苏婉晴性接受度，整数0-100。',
  char_suwanqing_excitement: '苏婉晴兴奋值，整数0-100。',
  char_suwanqing_mental: '苏婉晴当前想法，短句。',
  char_suwanqing_attitude: '苏婉晴对你的态度，短句。',
  char_xiazhixuan_char_name: '夏芷萱显示名。',
  char_xiazhixuan_outfit: '夏芷萱当前衣着，按正文更新。',
  char_xiazhixuan_favor: '夏芷萱好感度，整数0-100。',
  char_xiazhixuan_accept: '夏芷萱性接受度，整数0-100。',
  char_xiazhixuan_excitement: '夏芷萱兴奋值，整数0-100。',
  char_xiazhixuan_mental: '夏芷萱当前想法，短句。',
  char_xiazhixuan_attitude: '夏芷萱对你的态度，短句。',
  char_suqingyan_char_name: '苏清颜显示名。',
  char_suqingyan_outfit: '苏清颜当前衣着，按正文更新。',
  char_suqingyan_favor: '苏清颜好感度，整数0-100。',
  char_suqingyan_accept: '苏清颜性接受度，整数0-100。',
  char_suqingyan_excitement: '苏清颜兴奋值，整数0-100。',
  char_suqingyan_mental: '苏清颜当前想法，短句。',
  char_suqingyan_attitude: '苏清颜对你的态度，短句。',
  char_shenmanjun_char_name: '沈曼君显示名。',
  char_shenmanjun_outfit: '沈曼君当前衣着，按正文更新。',
  char_shenmanjun_favor: '沈曼君好感度，整数0-100。',
  char_shenmanjun_accept: '沈曼君性接受度，整数0-100。',
  char_shenmanjun_excitement: '沈曼君兴奋值，整数0-100。',
  char_shenmanjun_mental: '沈曼君当前想法，短句。',
  char_shenmanjun_attitude: '沈曼君对你的态度，短句。',
  char_liuyuru_char_name: '柳玉茹显示名。',
  char_liuyuru_outfit: '柳玉茹当前衣着，按正文更新。',
  char_liuyuru_favor: '柳玉茹好感度，整数0-100。',
  char_liuyuru_accept: '柳玉茹性接受度，整数0-100。',
  char_liuyuru_excitement: '柳玉茹兴奋值，整数0-100。',
  char_liuyuru_mental: '柳玉茹当前想法，短句。',
  char_liuyuru_attitude: '柳玉茹对你的态度，短句。',
  action_1_label: '建议行动1的按钮文字，简短。',
  action_1_command: '建议行动1的触发指令，以/send开头、单行、≤180字符。',
  action_2_label: '建议行动2的按钮文字，简短。',
  action_2_command: '建议行动2的触发指令，以/send开头、单行、≤180字符。',
  action_3_label: '建议行动3的按钮文字，简短。',
  action_3_command: '建议行动3的触发指令，以/send开头、单行、≤180字符。'
};

// 给 18 个数值字段描述统一追加幅度纪律
for (const key of Object.keys(NEW_SCHEMA)) {
  if (/^char_.*_(favor|accept|excitement)$/.test(key)) {
    NEW_SCHEMA[key] = NEW_SCHEMA[key] + '每轮变化默认不超过±5，重大事件（表白/肢体接触/冲突/承诺）才允许±10且须在reason写明依据；普通对话不改变，无明确证据保持上一轮。';
  }
}

/* ---------- 写入模板（顶层 + extensions 副本） ---------- */
const writeTemplate = (t) => {
  t.name = '互动状态面板·上下文版';
  t.htmlTemplate = NEW_TEMPLATE;
  t.initialVariableState = JSON.parse(JSON.stringify(NEW_INITIAL));
  t.variableSchema = JSON.parse(JSON.stringify(NEW_SCHEMA));
};
writeTemplate(inner.uiTemplates[0]);
if (inner.extensions && Array.isArray(inner.extensions.rp_hub_ui_templates) && inner.extensions.rp_hub_ui_templates[0]) {
  writeTemplate(inner.extensions.rp_hub_ui_templates[0]);
}

/* ---------- 自检 ---------- */
if (NEW_TEMPLATE.includes('{{')) {
  // 允许 body 里的 {{变量}}，脚本内不允许
  const scriptPart = NEW_TEMPLATE.split('<script>')[1].split('</script>')[0];
  if (scriptPart.includes('{{') || scriptPart.includes('}}')) throw new Error('脚本内存在 {{ }}');
}
if (NEW_TEMPLATE.includes('window.location =')) throw new Error('不应再出现 window.location 赋值');
if (NEW_TEMPLATE.includes('characterDatabase')) throw new Error('不应再出现 characterDatabase');

/* ---------- 重建 PNG ---------- */
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
    if (buf.toString('utf8', dataStart, cursor) === 'chara') {
      outParts.push(createTextChunk('chara', newPayload));
      replaced = true;
      pos = dataEnd + 4;
      continue;
    }
  }
  outParts.push(buf.subarray(pos, dataEnd + 4));
  pos = dataEnd + 4;
}
if (!replaced) throw new Error('重建 PNG 时未替换 chara 块');
fs.writeFileSync(dst, Buffer.concat(outParts));

console.log('已生成:', dst);
console.log('模板长度:', NEW_TEMPLATE.length);
console.log('变量数:', Object.keys(NEW_INITIAL).length);
console.log('schema 字段数:', Object.keys(NEW_SCHEMA).length);
