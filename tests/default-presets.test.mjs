// Runtime (ESM import) tests for src/modules/default-presets.mjs and
// src/modules/tts-text.mjs. Pure data / pure text-processing modules that
// previously had zero runtime coverage.
import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_PRESET_DEFINITIONS, DEFAULT_PRESET_DEFINITIONS_VERSION } from '../src/modules/default-presets.mjs';
import ttsText from '../src/modules/tts-text.mjs';

test('default preset definitions are a well-formed, versioned set', () => {
    assert.ok(Number.isInteger(DEFAULT_PRESET_DEFINITIONS_VERSION));
    assert.ok(DEFAULT_PRESET_DEFINITIONS.length >= 8, 'full default set is seeded');
    const names = new Set();
    for (const preset of DEFAULT_PRESET_DEFINITIONS) {
        assert.equal(typeof preset.name, 'string');
        assert.ok(preset.name.length > 0, 'every preset has a name');
        assert.ok(names.has(preset.name) === false, `duplicate preset name: ${preset.name}`);
        names.add(preset.name);
        assert.ok(['system', 'user', 'assistant'].includes(preset.role), `valid role: ${preset.role}`);
        assert.equal(typeof preset.content, 'string');
        assert.ok(preset.content.length > 0, `non-empty content: ${preset.name}`);
    }
    // Structural anchors of the user-persona presets (role must follow persona setting).
    for (const name of ['第二人称', '第三人称']) {
        assert.ok(names.has(name), `${name} persona preset exists`);
    }
    const preinject = DEFAULT_PRESET_DEFINITIONS.filter(p => p.name.startsWith('破限预注入 · User'));
    assert.ok(preinject.every(p => p.role === 'user'), 'user preinject presets keep the user role');
    const preinjectAi = DEFAULT_PRESET_DEFINITIONS.filter(p => p.name.startsWith('破限预注入 · AI'));
    assert.ok(preinjectAi.every(p => p.role === 'assistant'), 'AI preinject presets keep the assistant role');
});

test('tts extractSpeakText strips markup and extracts dialogue', () => {
    const { extractSpeakText } = ttsText;
    assert.equal(typeof extractSpeakText, 'function');

    // Code fences and HTML documents are dropped before speaking.
    assert.equal(
        extractSpeakText('正文开始\n```js\nconst x = 1;\n```\n正文结束'),
        '正文开始 正文结束'
    );
    assert.equal(extractSpeakText('<!doctype html><html><body>卡片</body></html> spoken'), 'spoken');

    // Reasoning blocks are removed, including unclosed ones.
    assert.equal(extractSpeakText('<think>chain of thought</think>answer text'), 'answer text');

    // dialogueOnly keeps only quoted speech (「」『』“” "").
    assert.equal(extractSpeakText('叙述句。\n她「你好呀」我“嗯”', { dialogueOnly: true }), '你好呀 嗯');

    // skipActions removes standalone *action* lines.
    assert.equal(extractSpeakText('说话内容\n*转身离开*', { skipActions: true }), '说话内容');

    // Truncation prefers a sentence boundary.
    const truncated = extractSpeakText('第一句。'.repeat(20), { maxChars: 10 });
    assert.ok(truncated.length <= 10);
    assert.ok(truncated.endsWith('。'));

    assert.equal(extractSpeakText(''), '');
});
