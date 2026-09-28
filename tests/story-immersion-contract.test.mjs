// Contract tests for the story/dialogue immersion kit: story recap, story
// director, regex style packs, per-character TTS, story timeline. Behavior is
// tested where testable (style-pack regexes must pass the ReDoS guard); host
// assembly wiring is locked down with source contracts.
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

test('story director: character field injects [Story Direction] every turn', () => {
    // The injection point sits inside the [Character] definition block (after the example dialogue)
    assert.match(sender, /const storyDirector = String\(currentCharacter\?\.value\?\.storyDirector \|\| ''\)\.trim\(\);/);
    assert.match(sender, /charDefinitionParts\.push\(`\[Story Direction\]\\n\$\{storyDirector\}`\);/);
    assert.ok(sender.indexOf('[Story Direction]') > sender.indexOf('[Character]'), 'injected after the character definition');
});

test('story recap: MessageList top card reads rolling summaries and collapses', () => {
    assert.match(messageList, /const chatRecapText = computed\(\(\) => \{/, 'recap data source is a computed');
    assert.match(messageList, /summaries\?\.short \|\| summaries\?\.long/, 'short first, long as fallback');
    assert.match(messageList, /v-if="currentCharacter && chatRecapText && !recapDismissed"/, 'shown only with a character and not dismissed');
    assert.match(messageList, /recapExpanded = !recapExpanded/, 'expandable/collapsible');
});

test('regex style packs: three packs, global display-only, deduped then persisted', () => {
    assert.match(app, /const REGEX_STYLE_PACKS = \[/);
    for (const pack of ['小说体', '剧本体', '轻小说体']) {
        assert.ok(app.includes(`label: '${pack}'`), `includes ${pack}`);
    }
    // Enqueued scripts: global scope + display layer only (never in the prompt), deduped by name
    assert.match(app, /scope: 'global',/);
    assert.match(app, /markdownOnly: true,/);
    assert.match(app, /if \(regexScripts\.value\.some\(item => item\.name === script\.name\)\) return;/);
    assert.match(app, /if \(added > 0 && typeof saveData === 'function'\) saveData\(\);/);
    // RegexPanel has the one-click buttons
    assert.match(regexPanel, /applyRegexStylePack\(pack\.id\)/);
});

test('per-character TTS: editor exposes the voice picker bound to the character field', () => {
    assert.match(worldInfoPanel, /v-model="editingCharacter\.data\.ttsVoice"/);
    assert.match(worldInfoPanel, /<option value="">跟随全局设置<\/option>/);
    assert.match(worldInfoPanel, /ctx\.settings\?\.ttsService === 'cloud'/, 'voice source switches with the service');
    // The host-side read path exists (character voice wins over the global setting)
    assert.match(app, /const characterVoice = currentCharacter\.value\?\.ttsVoice;/);
    // The host provides system voice candidate loading
    assert.match(app, /const loadTtsVoiceChoices = async \(\) => \{/);
});

test('story timeline: MemoryPanel shows summary batches/plot lines/character profiles', () => {
    assert.match(memoryPanel, /剧情时间线/);
    assert.match(memoryPanel, /memoryProfile\?\.openPlots/);
    assert.match(memoryPanel, /memoryProfile\?\.characters/);
    assert.match(memoryPanel, /\.some\(b => b\.status === 'done'\)/, 'shown only when at least one summary batch is done');
});

test('behavior: all style-pack regexes pass the ReDoS guard', async () => {
    const { useRegexPipeline } = await import('../src/composables/useRegexPipeline.mjs');
    const { containsCatastrophicQuantifier } = useRegexPipeline({ regexScripts: { value: [] } });

    // The four patterns kept in sync with REGEX_STYLE_PACKS in app.mjs
    const packPatterns = [
        '「([^」]{1,200})」',
        '（([^（）]{1,160})）',
        '^([^\\s：:]{1,12}[：:])(.*)$',
        '『([^』]{1,200})』'
    ];
    for (const pattern of packPatterns) {
        assert.equal(containsCatastrophicQuantifier(pattern), false, `should not be killed: ${pattern}`);
    }
});
