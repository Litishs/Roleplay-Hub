import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [html, app] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/modules/app.mjs', import.meta.url), 'utf8'),
]);

test('Android IME input cannot leave the setup action permanently disabled', () => {
    assert.match(html, /ref="userSetupNameInput"/);
    assert.match(html, /@compositionend="syncUserSetupName"/);
    assert.match(html, /@pointerdown="syncUserSetupName"\s+@click="saveUserSetup"/);
    assert.doesNotMatch(html, /:disabled="!tempUserSetup\.name/);
});

test('setup saves the live input value and description', () => {
    assert.match(app, /const userSetupNameInput = ref\(null\)/);
    assert.match(app, /syncUserSetupName\(\);\s+const name = String\(tempUserSetup\.name \|\| ''\)\.trim\(\)/);
    assert.match(app, /user\.description = tempUserSetup\.description/);
});
