import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('MessageInput hosts the inline quick-settings panel bound to existing settings', async () => {
  const messageInput = await readFile(new URL('../src/components/chat/MessageInput.vue', import.meta.url), 'utf8');

  // Trigger button next to the send button
  assert.match(messageInput, /@click\.stop="showChatModelSelector = !showChatModelSelector"/);
  assert.match(messageInput, /title="快速设置"/);
  // Trigger lives in the top toolbar row (above the send key, level with the story-branch button)
  assert.ok(
    messageInput.indexOf('title="快速设置"') < messageInput.indexOf('ref="inputBox"'),
    'quick-settings trigger should sit in the toolbar row above the input textarea',
  );
  const sendRow = messageInput.match(/<div class="flex-shrink-0 flex items-center gap-1">[\s\S]*?<\/div>\r?\n/)?.[0] || '';
  assert.ok(sendRow.includes('sendMessage') && !sendRow.includes('showChatModelSelector'),
    'send/stop row should not contain the quick-settings trigger');

  // Popover panel anchored above-right of the trigger
  assert.match(messageInput, /v-if="showChatModelSelector"/);
  assert.match(messageInput, /absolute bottom-full right-0 mb-3 z-50/);
  assert.match(messageInput, /@click\.stop\s+class="bg-white\/95 backdrop-blur-xl/);

  // Model slots wired to the app-level computed/select pair
  assert.match(messageInput, /v-for="\(slot, slotIndex\) in chatModelSlots"/);
  assert.match(messageInput, /@click="selectChatModelSlot\(slot\)"/);
  assert.match(messageInput, /:disabled="!slot\.model"/);
  assert.match(messageInput, /modelMode === slot\.mode && slot\.model/);

  // Temperature slider and toggles bind to existing settings fields
  assert.match(messageInput, /v-model\.number="settings\.temperature" type="range" min="0"\s*\n\s*max="1" step="0\.01"/);
  assert.match(messageInput, /v-model="settings\.stream"[\s\S]*?settings-toggle--compact settings-toggle--solid/);
  assert.match(messageInput, /v-model="settings\.immersiveMode"[\s\S]*?settings-toggle--compact settings-toggle--solid/);
});

test('app.mjs defines and exposes chatModelSlots and selectChatModelSlot', async () => {
  const source = await readFile(new URL('../src/modules/app.mjs', import.meta.url), 'utf8');

  // Slots derived from the three configured slot models
  assert.match(source, /const chatModelSlots = computed\(\(\) => \[[\s\S]*?mode: 'quality', model: settings\.qualityModel \|\| ''[\s\S]*?mode: 'balanced', model: settings\.balancedModel \|\| ''[\s\S]*?mode: 'fast', model: settings\.fastModel \|\| ''[\s\S]*?\]\);/);

  // Selection delegates to modelMode, whose setter syncs settings.model
  assert.match(source, /const selectChatModelSlot = \(slot\) => \{\s*if \(!slot \|\| !slot\.model\) return;\s*modelMode\.value = slot\.mode;\s*\};/);

  // Exposed to appContext so MessageInput.vue (full ctx passthrough) can use them
  assert.match(source, /modelMode, chatModelSlots, selectChatModelSlot, showNoMemoryNeededModal/);
});
