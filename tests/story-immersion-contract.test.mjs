// 故事感/对话感增强套件的契约测试：前情提要、导演提示、正则美化模板包、
// 分角色 TTS、剧情时间线。行为能测的测行为（模板正则必须过 ReDoS 防护），
// 依赖宿主装配的部分用源码契约锁住接线。
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [sender, app, messageList, worldInfoPanel, memoryPanel, regexPanel] = await Promise.all([
    readFile(new URL('../src/composables/useMessageSender.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/modules/app.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/chat/MessageList.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/views/WorldInfoPanel.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/views/MemoryPanel.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/views/RegexPanel.vue', import.meta.url), 'utf8')
]);

test('导演提示：角色字段每轮注入 [Story Direction]', () => {
    // 注入点在 [Character] 定义块内（含示例对话之后）
    assert.match(sender, /const storyDirector = String\(currentCharacter\?\.value\?\.storyDirector \|\| ''\)\.trim\(\);/);
    assert.match(sender, /charDefinitionParts\.push\(`\[Story Direction\]\\n\$\{storyDirector\}`\);/);
    assert.ok(sender.indexOf('[Story Direction]') > sender.indexOf('[Character]'), '注入在角色定义之后');
});

test('前情提要：MessageList 顶部卡片读滚动总结并可折叠', () => {
    assert.match(messageList, /const chatRecapText = computed\(\(\) => \{/, 'recap 数据源是 computed');
    assert.match(messageList, /summaries\?\.short \|\| summaries\?\.long/, 'short 优先、long 兜底');
    assert.match(messageList, /v-if="currentCharacter && chatRecapText && !recapDismissed"/, '有角色且未关闭才显示');
    assert.match(messageList, /recapExpanded = !recapExpanded/, '可展开/收起');
});

test('正则美化模板包：三套模板、全局 display-only、去重后持久化', () => {
    assert.match(app, /const REGEX_STYLE_PACKS = \[/);
    for (const pack of ['小说体', '剧本体', '轻小说体']) {
        assert.ok(app.includes(`label: '${pack}'`), `包含 ${pack}`);
    }
    // 入列脚本：全局作用域 + 仅显示层（不进提示词），重名去重
    assert.match(app, /scope: 'global',/);
    assert.match(app, /markdownOnly: true,/);
    assert.match(app, /if \(regexScripts\.value\.some\(item => item\.name === script\.name\)\) return;/);
    assert.match(app, /if \(added > 0 && typeof saveData === 'function'\) saveData\(\);/);
    // RegexPanel 有一键按钮
    assert.match(regexPanel, /applyRegexStylePack\(pack\.id\)/);
});

test('分角色 TTS：编辑器暴露音色选择，绑定角色字段', () => {
    assert.match(worldInfoPanel, /v-model="editingCharacter\.data\.ttsVoice"/);
    assert.match(worldInfoPanel, /<option value="">跟随全局设置<\/option>/);
    assert.match(worldInfoPanel, /ctx\.settings\?\.ttsService === 'cloud'/, '按服务切换音色来源');
    // 宿主侧读取端存在（角色音色优先于全局设置）
    assert.match(app, /const characterVoice = currentCharacter\.value\?\.ttsVoice;/);
    // 宿主提供系统音色候选加载
    assert.match(app, /const loadTtsVoiceChoices = async \(\) => \{/);
});

test('剧情时间线：MemoryPanel 展示总结批次/剧情线/人物档案', () => {
    assert.match(memoryPanel, /剧情时间线/);
    assert.match(memoryPanel, /memoryProfile\?\.openPlots/);
    assert.match(memoryPanel, /memoryProfile\?\.characters/);
    assert.match(memoryPanel, /\.some\(b => b\.status === 'done'\)/, '至少有一批完成总结才展示');
});

test('行为：美化模板包的正则全部通过 ReDoS 防护', async () => {
    const { useRegexPipeline } = await import('../src/composables/useRegexPipeline.mjs');
    const { containsCatastrophicQuantifier } = useRegexPipeline({ regexScripts: { value: [] } });

    // 与 app.mjs REGEX_STYLE_PACKS 保持一致的四个模式
    const packPatterns = [
        '「([^」]{1,200})」',
        '（([^（）]{1,160})）',
        '^([^\\s：:]{1,12}[：:])(.*)$',
        '『([^』]{1,200})』'
    ];
    for (const pattern of packPatterns) {
        assert.equal(containsCatastrophicQuantifier(pattern), false, `不应误杀: ${pattern}`);
    }
});
