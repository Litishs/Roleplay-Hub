import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (p) => readFile(new URL(p, import.meta.url), 'utf8');

test('main interface import preserves external card fields for lossless round-trip', async () => {
  const source = await read('../src/modules/app.mjs');
  const importRegion = source.slice(
    source.indexOf('const importCharacter = (event) => {'),
    source.indexOf('const buildCharacterExportData')
  );

  // The old destructive cleanup must be gone.
  assert.doesNotMatch(importRegion, /discardRemovedCardFields/);
  assert.doesNotMatch(importRegion, /delete target\.extensions\.world/);

  // The preserved field list is kept on the character object.
  for (const field of [
    'mes_example',
    'system_prompt',
    'post_history_instructions',
    'alternate_greetings',
    'tags',
    'creator',
    'character_version',
    'spec',
    'spec_version'
  ]) {
    assert.match(importRegion, new RegExp(`'${field}'`));
    assert.match(importRegion, new RegExp(`preservedCardFields\\.${field}`));
  }
  assert.match(importRegion, /rawExtensions: preservedCardFields\.rawExtensions/);
  assert.match(importRegion, /collectPreservedCardFields\(rawData\)/);
  assert.match(importRegion, /collectPreservedCardFields\(rawData\.data\)/);
  assert.match(importRegion, /collectPreservedCardFields\(charData\)/);
});

test('card export writes preserved fields and foreign extensions back', async () => {
  const source = await read('../src/modules/card-utils.mjs');
  const builder = source.slice(
    source.indexOf('const buildCharacterCardData'),
    source.indexOf('const crc32Table')
  );

  assert.match(builder, /preservedCardFields\.map/);
  assert.match(builder, /includeCardFieldIfPresent/);
  assert.match(builder, /character\.rawExtensions/);
  // The preserved field list lives above the builder and must cover all nine fields.
  assert.match(source, /const preservedCardFields = Object\.freeze\(\[/);
  for (const field of ['mes_example', 'system_prompt', 'post_history_instructions', 'alternate_greetings', 'tags', 'creator', 'character_version', 'spec', 'spec_version']) {
    assert.match(source, new RegExp(`'${field}'`));
  }
});

test('main interface accepts .json files even when the provider returns an empty MIME', async () => {
  const source = await read('../src/modules/app.mjs');
  const importRegion = source.slice(
    source.indexOf('const importCharacter = (event) => {'),
    source.indexOf('const buildCharacterExportData')
  );
  assert.match(importRegion, /file\.type === 'application\/json' \|\| file\.name\.toLowerCase\(\)\.endsWith\('\.json'\)/);
  assert.match(importRegion, /file\.type === 'image\/png' \|\| file\.name\.toLowerCase\(\)\.endsWith\('\.png'\)/);
});

test('chat jsonl import validates messages and asks before overwrite/append', async () => {
  const source = await read('../src/modules/app.mjs');
  const importRegion = source.slice(
    source.indexOf('const importCharacter = (event) => {'),
    source.indexOf('const buildCharacterExportData')
  );

  assert.match(importRegion, /file\.name\.toLowerCase\(\)\.endsWith\('\.jsonl'\)/);
  assert.match(importRegion, /missing role\/content/);
  assert.match(importRegion, /chatImportDialog\.value = \{/);
  assert.match(importRegion, /mode === 'append'/);
  assert.match(importRegion, /showChatImportDialog\.value = true/);
  assert.match(importRegion, /if \(currentCharacterIndex\.value < 0\)/);
});

test('chat import dialog is exposed to the template with overwrite/append/cancel handlers', async () => {
  const source = await read('../src/modules/app.mjs');
  assert.match(source, /const showChatImportDialog = ref\(false\);/);
  assert.match(source, /const confirmChatImportOverwrite = async \(\) =>/);
  assert.match(source, /const confirmChatImportAppend = async \(\) =>/);
  assert.match(source, /const cancelChatImport = \(\) =>/);
  assert.match(source, /showChatImportDialog, chatImportDialog, confirmChatImportOverwrite, confirmChatImportAppend, cancelChatImport,/);
});

test('preset/regex/worldbook imports dedupe by content fingerprint and show a preview', async () => {
  const source = await read('../src/modules/app.mjs');
  assert.match(source, /const stableJsonStringify = \(value\) =>/);
  assert.match(source, /const importItemFingerprint = \(item, fields\) =>/);
  assert.match(source, /importItemFingerprint\(p, \['role', 'content'\]\)/);
  assert.match(source, /importItemFingerprint\(script, \['name', 'regex', 'flags', 'replacement'\]\)/);
  assert.match(source, /importItemFingerprint\(entry, \['keys', 'content'\]\)/);
  assert.match(source, /title: '导入预设'/);
  assert.match(source, /title: '导入正则脚本'/);
  assert.match(source, /title: '导入世界书'/);
  assert.match(source, /importPreview\.value = \{/);
  assert.match(source, /showImportPreview\.value = true/);
  assert.match(source, /showImportPreview, importPreview, confirmImportPreview, cancelImportPreview,/);
});

test('workshop import preserves the same external fields', async () => {
  const source = await read('../character/index.html');
  const importFn = source.slice(
    source.indexOf('const buildCharacterFromImport = (rawData, avatarUrl = null) => {'),
    source.indexOf('const applyImportedCharacter')
  );
  assert.match(importFn, /alternate_greetings: Array\.isArray\(data\.alternate_greetings\)/);
  assert.match(importFn, /creator: data\.creator \|\| ''/);
  assert.match(importFn, /character_version: data\.character_version \|\| ''/);
  assert.match(importFn, /spec: data\.spec \|\| ''/);
  assert.match(importFn, /spec_version: data\.spec_version \|\| ''/);
  assert.match(importFn, /rawExtensions: \(\(\) => \{/);
});

test('Android full backup picker suggests a .rphub-backup.zip filename', async () => {
  const source = await read('../android/app/src/main/java/com/roleplayhub/app/NativeStoragePlugin.java');
  const backupMethod = source.slice(
    source.indexOf('public void exportBackup'),
    source.indexOf('private void exportBackupResult')
  );
  assert.match(backupMethod, /"roleplay-hub-" \+ timestamp \+ "\.rphub-backup\.zip"/);
});

test('chat import and import preview modals exist in the main template', async () => {
  const source = await read('../index.html');
  assert.match(source, /v-if="showChatImportDialog"/);
  assert.match(source, /@click="confirmChatImportOverwrite"/);
  assert.match(source, /@click="confirmChatImportAppend"/);
  assert.match(source, /v-if="showImportPreview"/);
  assert.match(source, /@click="confirmImportPreview"/);
});



test('native plugin streams large exports in chunks (exportFileStart/Write/End)', async () => {
  const source = await read('../android/app/src/main/java/com/roleplayhub/app/NativeStoragePlugin.java');
  const chunkRegion = source.slice(
    source.indexOf('public void exportFileStart'),
    source.indexOf('public void exportBackup')
  );
  assert.match(chunkRegion, /startActivityForResult\(call, intent, "exportFileStartResult"\)/);
  assert.match(chunkRegion, /pendingExports\.put\(sessionId, new PendingExport\(output, uri\)\)/);
  assert.match(chunkRegion, /pending\.output\.write\(Base64\.decode\(chunk, Base64\.DEFAULT\)\)/);
  assert.match(chunkRegion, /pendingExports\.remove\(sessionId\)/);
  assert.match(chunkRegion, /result\.put\("saved", true\)/);
});

test('web bridge prefers chunked export and falls back to whole-file base64', async () => {
  const source = await read('../src/modules/card-utils.mjs');
  const downloadMethod = source.slice(
    source.indexOf('const safeExportName = (filename)'),
    source.indexOf('window.RPHubCardUtils')
  );
  assert.match(downloadMethod, /const downloadBlobChunked = async/);
  assert.match(downloadMethod, /nativeStorage\.exportFileStart\(\{ sessionId, fileName: safeName, mimeType \}\)/);
  assert.match(downloadMethod, /nativeStorage\.exportFileWrite\(\{ sessionId, chunk \}\)/);
  assert.match(downloadMethod, /nativeStorage\.exportFileEnd\(\{ sessionId \}\)/);
  assert.match(downloadMethod, /512 \* 1024/);
  // Whole-file base64 path is retained as a fallback.
  assert.match(downloadMethod, /nativeStorage\.exportFile\(\{/);
});

