import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('backup contract includes hashes and clears secrets only after integrity validation', async () => {
  const source = await readFile(
    new URL('../android/app/src/main/java/com/roleplayhub/app/NativeStoragePlugin.java', import.meta.url),
    'utf8'
  );
  // Line endings may be CRLF or LF depending on checkout; normalize so regexes are stable.
  const normalized = source.replace(/\r\n/g, '\n');

  assert.match(normalized, /manifest\.put\("hashes", hashes\)/);
  assert.match(normalized, /verifyHashes\(restoreRoot, manifest\.getJSONObject\("hashes"\)\)/);
  assert.match(normalized, /if \(!database\.integrityCheck\(\)\).*\n\s*clearSecretsAfterRestore\(\)/);
  const backupMethod = normalized.slice(
    normalized.indexOf('private void createBackup'),
    normalized.indexOf('private String addFileToZip')
  );
  assert.doesNotMatch(backupMethod, /SECRET_PREFERENCES|getSecretPreferences|KEY_ALIAS/);
});
