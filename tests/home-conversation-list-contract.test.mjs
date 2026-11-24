import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
    buildConversationEntry,
    hasUnreadConversation,
    markConversationRead,
    mergeConversationEntry,
    sortConversations
} from "../src/modules/conversation-summary.mjs";

// 2026-11-12: the home screen is a conversation list (QQ-style) and the chat is
// a detail view. The list must not read every chat, so each character keeps a
// tiny summary record; these tests pin the record's behaviour plus the wiring.

const read = (relative) => readFile(new URL(relative, import.meta.url), "utf8");

test("buildConversationEntry picks the newest speakable line", () => {
    const entry = buildConversationEntry([
        { id: 'u1', role: 'user', content: '你好' },
        { id: 'a1', role: 'assistant', content: '<think>内部思考</think>真正的回复' },
        { id: 'a2', role: 'assistant', content: '   \n  ' },
        { id: 's1', role: 'system', content: '系统提示' }
    ], 1000);
    assert.equal(entry.messageId, 'a1', 'empty assistant rows and system rows are skipped');
    assert.equal(entry.preview, '真正的回复', 'the CoT envelope never becomes the preview');
    assert.equal(entry.at, 1000);
});

test("buildConversationEntry returns null when there is nothing to preview", () => {
    assert.equal(buildConversationEntry([]), null);
    assert.equal(buildConversationEntry(null), null);
    assert.equal(buildConversationEntry([{ id: 's', role: 'system', content: '系统' }]), null);
});

test("buildConversationEntry truncates long lines", () => {
    const entry = buildConversationEntry([{ id: 'a', role: 'assistant', content: 'x'.repeat(400) }], 1);
    assert.equal(entry.preview.length, 80);
});

test("mergeConversationEntry only stamps readAt when the chat is being read", () => {
    const first = { messageId: 'm1', at: 100, preview: 'hi' };
    const background = mergeConversationEntry({}, 'c1', first, { read: false });
    assert.equal(background.c1.readAt, 0, 'a background save must not clear the unread dot');

    const read = mergeConversationEntry(background, 'c1', first, { read: true });
    assert.equal(read.c1.readAt, 100, 'opening the chat stamps readAt');

    // Same entry + no read stamp -> same object reference, so callers skip writes.
    assert.equal(mergeConversationEntry(read, 'c1', first, { read: false }), read);
});

test("markConversationRead never moves the stamp backwards", () => {
    const summaries = { c1: { messageId: 'm1', at: 100, preview: 'hi', readAt: 500 } };
    assert.equal(markConversationRead(summaries, 'c1', 200), summaries);
    assert.equal(markConversationRead(summaries, 'missing', 200), summaries);
    assert.equal(markConversationRead(summaries, 'c1', 600).c1.readAt, 600);
});

test("hasUnreadConversation compares the newest line against the read stamp", () => {
    assert.equal(hasUnreadConversation({ at: 200, readAt: 100 }), true);
    assert.equal(hasUnreadConversation({ at: 100, readAt: 100 }), false);
    assert.equal(hasUnreadConversation({ at: 100, readAt: 0 }), true);
    assert.equal(hasUnreadConversation(null), false);
});

test("sortConversations puts recent conversations first and keeps store order for the rest", () => {
    const characters = [
        { uuid: 'a', name: 'A' },
        { uuid: 'b', name: 'B' },
        { uuid: 'c', name: 'C' },
        { uuid: 'd', name: 'D' }
    ];
    const summaries = {
        a: { at: 100 },
        c: { at: 300 }
    };
    const sorted = sortConversations(characters, summaries);
    assert.deepEqual(sorted.map(item => item.char.name), ['C', 'A', 'B', 'D']);
    assert.deepEqual(sorted.map(item => item.index), [2, 0, 1, 3]);
    assert.equal(sorted[0].summary.at, 300);
    assert.equal(sorted[2].summary, null);
});

test("home screen wiring: landing view, dual pane, back navigation and persistence", async () => {
    const [indexHtml, uiState, app, list, panel] = await Promise.all([
        read('../index.html'),
        read('../src/composables/useUiState.mjs'),
        read('../src/modules/app.mjs'),
        read('../src/components/chat/ConversationList.vue'),
        read('../src/components/views/CharacterPanel.vue')
    ]);

    // Landing view is the conversation list; the chat is a detail view.
    assert.match(uiState, /const currentView = ref\('home'\)/);
    assert.match(indexHtml, /<div v-show="currentView === 'home'"/);
    assert.match(indexHtml, /<conversation-list><\/conversation-list>/, 'home screen renders the list');

    // Wide screens keep the list beside the open chat.
    assert.match(indexHtml, /class="chat-dual-pane hidden md:flex[^"]*"/);
    assert.match(indexHtml, /<conversation-list compact><\/conversation-list>/);
    assert.match(indexHtml, /v-show="!isChatFullscreen"/, 'full screen chat hides the side list');

    // Back from the chat returns to the page it was opened from (the list)
    // instead of minimizing; the other tabs fall back to the list
    // (tab shell, 2026-11-23 — rules in src/modules/tab-navigation.mjs).
    assert.match(app, /else if \(!isTabRoot\(currentView\.value\)\) \{[\s\S]{0,240}goBack\(\);[\s\S]{0,240}switchTab\('home'\);/);

    // Summaries live in their own KV key and are exposed to templates.
    assert.match(app, /setStoredValue\('chat_summaries'/);
    assert.match(app, /getStoredValue\('chat_summaries'\)/);
    assert.match(app, /const sortedConversations = computed\(\(\) => sortConversations/);
    assert.match(app, /sortedConversations, conversationSummaries/);

    // Rows open the chat; management lives in the home header. The header's
    // primary action imports a card (.png/.json via importCharacter) instead
    // of creating a blank one — creation stays in the management view's add menu.
    assert.match(list, /ctx\.selectCharacter\(item\.index\)/);
    assert.match(list, /@click="currentView = 'characters'"/);
    assert.match(list, /@click="importInputRef\?\.click\(\)"/);
    assert.match(list, /accept="\.png,\.json"/);
    assert.match(list, /@change="importCharacter\(\$event\)"/);
    assert.ok(!list.includes('createNewCharacter'), 'the home header no longer creates blank cards');
    // A thumbnail is always rendered: card image, gray placeholder, and on a
    // broken image the letter-circle fallback (never a blank white disc).
    assert.match(list, /@error="markAvatarFailed\(item\)"/, 'broken avatars fall back to the letter circle');
    assert.match(list, /v-if="item\.char\.avatar && !avatarFailed\(item\)"/);

    // The characters view returns to the page it was opened from (the list, or
    // the chat's empty state) through the shared Back helper of the tab shell.
    assert.match(panel, /@click="goBack"/, 'characters header back button uses the shared Back helper');
    assert.doesNotMatch(panel, /@click="currentView = 'home'"/, 'it no longer jumps straight to the list');
});
