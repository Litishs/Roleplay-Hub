import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Android exports use the system create-document picker', async () => {
  const source = await readFile(
    new URL('../android/app/src/main/java/com/roleplayhub/app/NativeStoragePlugin.java', import.meta.url),
    'utf8'
  );
  const exportMethod = source.slice(
    source.indexOf('public void exportFile'),
    source.indexOf('public void exportBackup')
  );

  assert.match(exportMethod, /Intent\.ACTION_CREATE_DOCUMENT/);
  assert.match(exportMethod, /Intent\.EXTRA_TITLE/);
  assert.match(exportMethod, /openOutputStream\(uri, "wt"\)/);
  assert.match(exportMethod, /result\.put\("saved", false\)/);
});

test('regular exports no longer write to the app cache or open the share sheet', async () => {
  const source = await readFile(new URL('../src/modules/card-utils.mjs', import.meta.url), 'utf8');
  const downloadMethod = source.slice(
    source.indexOf('const downloadBlob = async'),
    source.indexOf('window.RPHubCardUtils')
  );

  assert.match(downloadMethod, /nativeStorage\.exportFile/);
  assert.doesNotMatch(downloadMethod, /filesystem\.writeFile|share\.share|directory:\s*['"]CACHE['"]/);
});

test('export success messages wait for a confirmed save result', async () => {
  // 2026-08-29 (Phase 2.2): character export functions moved to useDataIO
  const source = await readFile(new URL('../src/composables/useDataIO.mjs', import.meta.url), 'utf8');

  assert.match(source, /const result = await cardUtils\.downloadBlob\(blob, \(char\.name \|\| 'character'\) \+ '\.json'\)/);
  assert.match(source, /if \(result\.saved\) showToast\('角色卡 JSON 导出成功'/);
  assert.match(source, /const result = await cardUtils\.downloadBlob\(chatBlob/);
  assert.match(source, /if \(result\.saved\) showToast\('聊天记录导出成功'/);
});

test('iframe exports delegate to the parent frame via postMessage to dodge the ActivityCallback dead-end (ESM)', async () => {
  // The character-card workshop iframe reaches the native bridge through
  // window.parent.Capacitor, but the SAF picker's startActivityForResult
  // ActivityCallback never resolves back across the frame boundary, so a direct
  // exportFileStart() call hangs silently. downloadBlob() must hand the blob to
  // the parent frame via postMessage and let the parent run the native export.
  const source = await readFile(new URL('../src/modules/card-utils.mjs', import.meta.url), 'utf8');
  assert.match(source, /const downloadBlobViaParentFrame =/);
  assert.match(source, /const installIframeExportBridge =/);
  assert.match(source, /installIframeExportBridge\(\);/);
  assert.match(source, /'rph:export-blob'/);
  assert.match(source, /'rph:export-blob-ack'/);
  assert.match(source, /'rph:export-blob-result'/);
  // The delegation must run before the direct native bridge call so the iframe
  // never reaches the hanging exportFileStart path.
  const downloadMethod = source.slice(
    source.indexOf('const downloadBlob = async'),
    source.indexOf('installIframeExportBridge();') + 'installIframeExportBridge();'.length
  );
  assert.match(downloadMethod, /if \(window\.parent !== window\)/);
  assert.match(downloadMethod, /downloadBlobViaParentFrame\(blob, filename, options\)/);
  // Parent-side listener only answers same-origin child frames.
  const bridge = source.slice(
    source.indexOf('const installIframeExportBridge'),
    source.indexOf('const downloadBlob = async')
  );
  assert.match(bridge, /event\.origin !== window\.location\.origin/);
  assert.match(bridge, /event\.source/);
});

test('iframe export bridge is mirrored to the UMD card-utils loaded by character/index.html', async () => {
  const source = await readFile(new URL('../assets/js/card-utils.js', import.meta.url), 'utf8');
  assert.match(source, /const downloadBlobViaParentFrame =/);
  assert.match(source, /const installIframeExportBridge =/);
  assert.match(source, /installIframeExportBridge\(\);/);
  assert.match(source, /'rph:export-blob'/);
  assert.match(source, /'rph:export-blob-result'/);
  const downloadMethod = source.slice(
    source.indexOf('const downloadBlob = async'),
    source.indexOf('installIframeExportBridge();') + 'installIframeExportBridge();'.length
  );
  assert.match(downloadMethod, /if \(window\.parent !== window\)/);
  assert.match(downloadMethod, /downloadBlobViaParentFrame\(blob, filename, options\)/);
});
