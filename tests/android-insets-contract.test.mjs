import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [activity, manifest] = await Promise.all([
    readFile(new URL('../android/app/src/main/java/com/roleplayhub/app/MainActivity.java', import.meta.url), 'utf8'),
    readFile(new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8'),
]);

test('Android content respects status bar, cutout, and keyboard insets', () => {
    assert.match(activity, /Type\.statusBars\(\) \| WindowInsetsCompat\.Type\.displayCutout\(\)/);
    assert.match(activity, /isVisible\(WindowInsetsCompat\.Type\.ime\(\)\)/);
    assert.match(activity, /view\.setPadding\(0, landscape \? 0 : topInsets\.top, 0, keyboardBottom\)/);
});

test('Android hides the notch area in landscape', () => {
    assert.match(activity, /layoutInDisplayCutoutMode = WindowManager\.LayoutParams\.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS/);
    assert.match(activity, /landscape\) \{[\s\S]*?insetsController\.hide\(WindowInsetsCompat\.Type\.statusBars\(\)\)/);
    assert.match(activity, /ORIENTATION_LANDSCAPE/);
});

test('Android explicitly requests keyboard resize behavior', () => {
    assert.match(manifest, /android:windowSoftInputMode="adjustResize"/);
});
