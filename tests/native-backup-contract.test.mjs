import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('backup contract includes hashes and clears secrets only after integrity validation', async () => {
  const source = await readFile(
    new URL('../android/app/src/main/java/com/roleplayhub/app/NativeStoragePlugin.java', import.meta.url),
    'utf8'
  );

  assert.match(source, /manifest\.put\("hashes", hashes\)/);
  assert.match(source, /verifyHashes\(restoreRoot, manifest\.getJSONObject\("hashes"\)\)/);
  assert.match(source, /if \(!database\.integrityCheck\(\)\).*\n\s*clearSecretsAfterRestore\(\)/);
  const backupMethod = source.slice(
    source.indexOf('private void createBackup'),
    source.indexOf('private String addFileToZip')
  );
  assert.doesNotMatch(backupMethod, /SECRET_PREFERENCES|getSecretPreferences|KEY_ALIAS/);
});
