// Contract tests for the upstream STA1N sync (2026-09-06):
// - vision model (识图模型) selector in ApiConfig + 'visionModel' picker target
// - chat input image attachments: pick → compress → vision recognition →
//   <user_image_context> description injection → bubble thumbnails
// - 生图设置 section keeps its accordion and drops the 生成参数 label
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [apiConfigHtml, app, messageInput, messageList, sender, settingsState] = await Promise.all([
    readFile(new URL('../src/components/settings/ApiConfig.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/modules/app.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/chat/MessageInput.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/chat/MessageList.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/composables/useMessageSender.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/composables/useSettingsState.mjs', import.meta.url), 'utf8'),
]);

test('settings state declares the vision model', () => {
    assert.match(settingsState, /visionModel: '',\s*\/\/ 识图模型/,
        "settings.visionModel defaults to '' next to chatProviderId");
});

test('ApiConfig.vue adds the vision model selector and renames the accordion to 生图设置', () => {
    // Vision selector sits next to the chat-slot selector and opens the picker
    assert.match(apiConfigHtml, /openModelSelector\('visionModel'\)/,
        '识图模型 card opens the model picker with the visionModel target');
    assert.match(apiConfigHtml, />识图模型</, 'the 识图模型 label exists');
    assert.match(apiConfigHtml, /\{\{ settings\.visionModel \|\| '请选择模型' \}\}/,
        'the card shows the configured vision model name');
    // Accordion style preserved, label renamed
    assert.match(apiConfigHtml, /<span>生图设置<\/span>/, 'the section is renamed 生图设置');
    assert.ok(!apiConfigHtml.includes('生成参数'), 'the old 生成参数 label is gone');
    assert.match(apiConfigHtml, /genSectionOpen \? '1fr' : '0fr'/,
        'the 生图设置 section still collapses via the grid-rows accordion');
});

test('app.mjs vision target does not rebind the chat provider', () => {
    assert.match(app, /if \(modelSelectionTarget\.value === 'visionModel'\) \{\s*\/\/ Vision model rides the chat request path \(upstream parity\):\s*\/\/ picking one must NOT rebind the chat provider or a slot\.\s*settings\.visionModel = modelId;/,
        'selectModel assigns visionModel and returns before chatProviderId binding');
});

test('app.mjs owns the chat image attachment pipeline', () => {
    assert.match(app, /const MAX_CHAT_IMAGES = 3;/, 'max 3 images per message (upstream parity)');
    assert.match(app, /const CHAT_IMAGE_MAX_BYTES = 20 \* 1024 \* 1024;/, 'per-image 20 MB cap');
    assert.match(app, /const pendingChatImages = ref\(\[\]\);/);
    assert.match(app, /const isRecognizingImages = computed\(/, 'recognition busy flag is derived');
    // Recognition calls the vision model through the chat provider endpoint
    assert.match(app, /model: settings\.visionModel,/, 'recognition requests the configured vision model');
    assert.match(app, /type: 'image_url',\s*image_url: \{ url: image\.dataUrl, detail: 'high' \}/,
        'images are sent as high-detail image_url content parts');
    assert.match(app, /'<user_image_context>'/, 'descriptions are wrapped in the user_image_context block');
    assert.match(app, /compressImage\(await readFileAsDataUrl\(file\), 1600, 0\.86\)/,
        'images are compressed before upload (upstream parameters)');
    // Lifecycle
    assert.match(app, /clearPendingChatImages\(\);\s*resetChatRenderWindow\(\)/,
        'clearing the chat also drops pending attachments');
    assert.match(app, /const imageAttachments = pendingChatImages\.value\.map\(\(\{ dataUrl, description \}\) => \(\{ dataUrl, description \}\)\);/,
        'sendMessage snapshots ready attachments into the user message');
    assert.match(app, /if \(isConversationBusy\.value \|\| isRecognizingImages\.value\) return;/,
        'sendMessage refuses to run while recognition is pending');
    assert.match(app, /if \(!content && pendingChatImages\.value\.length === 0\) return;/,
        'sendMessage allows image-only sends');
    // Exposed to the template layer
    assert.match(app, /pendingChatImages, pendingChatImageReadCount, isRecognizingImages, requestChatImageSelection, handleChatImageSelection, removePendingChatImage,/);
});

test('MessageInput.vue hosts the send-image button and pending strip', () => {
    assert.match(messageInput, /@click="requestChatImageSelection\(\$refs\.chatImageInput\)"/,
        'the paperclip button opens the file picker');
    assert.match(messageInput, /ref="chatImageInput" type="file" accept="image\/\*" multiple/,
        'hidden multi-image file input');
    assert.match(messageInput, /:title="`发送图片（\$\{pendingChatImages\.length \+ pendingChatImageReadCount\}\/3）`"/,
        'button title shows the attachment counter');
    assert.match(messageInput, /v-for="image in pendingChatImages"/, 'pending attachments render as a strip');
    assert.match(messageInput, /removePendingChatImage\(image\.id\)/, 'strip items can be removed');
    assert.match(messageInput,
        /:disabled="isRecognizingImages \|\| pendingChatImages\.some\(image => image\.status !== 'ready'\)"/,
        'send is disabled while recognizing or when failed attachments remain');
    assert.match(messageInput, /class="relative w-full max-w-lg pointer-events-auto p-2\.5/,
        'input island is the absolute anchor for the pending strip');
});

test('MessageList.vue renders user message image thumbnails', () => {
    assert.match(messageList, /v-if="msg\.role === 'user' && Array\.isArray\(msg\.imageAttachments\) && msg\.imageAttachments\.length"/,
        'user bubbles render attached images');
    assert.match(messageList, /:src="image\.dataUrl"/, 'thumbnails use the stored dataUrl');
});

test('useMessageSender injects image descriptions at request-build time', () => {
    assert.match(sender, /appendMessageImageDescriptions,\n\s*isGenerating,/,
        'the description helper is injected as a dep');
    assert.match(sender, /content: appendMessageImageDescriptions\(message, message\.content\)/,
        'apiMessages mapping appends the vision descriptions');
    assert.match(sender, /\/\/ chatHistory\b/, 'chatHistory stays available for _sourceIndexes resolution');
});
