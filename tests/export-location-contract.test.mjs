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
  const source = await readFile(new URL('../assets/js/card-utils.js', import.meta.url), 'utf8');
  const downloadMethod = source.slice(
    source.indexOf('const downloadBlob = async'),
    source.indexOf('window.RPHubCardUtils')
  );

  assert.match(downloadMethod, /nativeStorage\.exportFile/);
  assert.doesNotMatch(downloadMethod, /filesystem\.writeFile|share\.share|directory:\s*['"]CACHE['"]/);
});

test('export success messages wait for a confirmed save result', async () => {
  const source = await readFile(new URL('../assets/js/app.js', import.meta.url), 'utf8');

  assert.match(source, /const result = await cardUtils\.downloadBlob\(blob, \(char\.name \|\| 'character'\) \+ '\.json'\)/);
  assert.match(source, /if \(result\.saved\) showToast\('角色卡 JSON 导出成功'/);
  assert.match(source, /const result = await cardUtils\.downloadBlob\(chatBlob/);
  assert.match(source, /if \(result\.saved\) showToast\('聊天记录导出成功'/);
});
