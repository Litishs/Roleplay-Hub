import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [html, app, modal] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/modules/app.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/common/ModalDialog.vue', import.meta.url), 'utf8'),
]);

test('Android IME input cannot leave the setup action permanently disabled', () => {
    assert.match(modal, /ref="userSetupNameInput"/);
    assert.match(modal, /@compositionend="syncUserSetupName"/);
    assert.match(modal, /@pointerdown="syncUserSetupName"\s+@click="saveUserSetup"/);
    assert.doesNotMatch(modal, /:disabled="!tempUserSetup\.name/);
});

test('index.html mounts the user setup modal via ModalDialog', () => {
    assert.match(html, /<modal-dialog><\/modal-dialog>/);
});

test('setup saves the live input value and description', () => {
    assert.match(app, /const userSetupNameInput = ref\(null\)/);
    assert.match(app, /syncUserSetupName\(\);\s+const name = String\(tempUserSetup\.name \|\| ''\)\.trim\(\)/);
    assert.match(app, /user\.description = tempUserSetup\.description/);
});
