import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('dark mode theme state machine is wired in app.js', async () => {
  const source = await readFile(new URL('../src/modules/app.mjs', import.meta.url), 'utf8');
  const settingsState = await readFile(new URL('../src/composables/useSettingsState.mjs', import.meta.url), 'utf8');

  // Default value must be declared first, since loadData only merges existing settings keys.
  assert.match(settingsState, /themeMode:\s*'system'/);

  // Three-way normalization.
  assert.match(settingsState, /const THEME_MODES = \['system', 'light', 'dark'\]/);
  assert.match(settingsState, /const normalizeThemeMode = /);
  assert.match(settingsState, /const resolveTheme = /);
  assert.match(source, /const applyTheme = /);

  // Follow system: listen to prefers-color-scheme.
  assert.match(settingsState, /matchMedia\('\(prefers-color-scheme: dark\)'\)/);
  assert.match(source, /themeMedia\.addEventListener\('change'/);

  // Drive the CSS override rules.
  assert.match(source, /document\.documentElement\.dataset\.theme = theme/);
  assert.match(source, /document\.documentElement\.style\.colorScheme = theme/);

  // Keep Android status bar in sync.
  assert.match(source, /ThemeBridge\.setDark/);

  // Dual-write to localStorage (read by the head anti-flicker script).
  assert.match(source, /localStorage\.setItem\('rph_theme_mode'/);

  // watch immediate (apply once during setup phase).
  assert.match(source, /watch\(\(\) => settings\.themeMode, applyTheme, \{\s*immediate: true\s*\}\)/);

  // Three-way options rendered with custom-select.
  assert.match(settingsState, /const themeModeOptions = \[/);
  assert.match(settingsState, /value: 'system', label: '跟随系统'/);
  assert.match(settingsState, /value: 'light', label: '浅色'/);
  assert.match(settingsState, /value: 'dark', label: '深色'/);

  // Exposed to the template.
  assert.match(source, /themeModeOptions,/);
});

test('index.html has head anti-flicker script and settings dropdown', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const advancedSettingsHtml = await readFile(new URL('../src/components/settings/AdvancedSettings.vue', import.meta.url), 'utf8');

  // Head anti-flicker script (sync data-theme before Vue loads).
  assert.match(html, /localStorage\.getItem\('rph_theme_mode'\)/);
  assert.match(html, /document\.documentElement\.dataset\.theme = dark \? 'dark' : 'light'/);

  // Appearance theme dropdown on the settings page.
  assert.match(advancedSettingsHtml, /v-model="settings\.themeMode" :options="themeModeOptions"/);
  assert.match(advancedSettingsHtml, /外观主题/);
});

test('styles.css has dark override rules driven by data-theme', async () => {
  const css = await readFile(new URL('../assets/css/styles.css', import.meta.url), 'utf8');

  assert.match(css, /\[data-theme='dark'\]/);
  assert.match(css, /color-scheme: dark/);
  // High-priority background class override.
  assert.match(css, /\[data-theme='dark'\] \.bg-white\b/);
  assert.match(css, /\[data-theme='dark'\] \.bg-gray-50\b/);
  // Semi-transparent class override (in CSS the slash is escaped as \/).
  assert.ok(css.includes('.bg-white\\/70'), 'bg-white/70 dark override present');
  // hover/focus state overrides.
  assert.match(css, /\.hover\\:bg-gray-50:hover/);
  assert.match(css, /\.focus\\:bg-white:focus/);
  // The sidebar carries its own light gradient background; in dark mode it must
  // override the entire shorthand property, not just background-color.
  assert.match(css, /\[data-theme='dark'\] \.app-sidebar\s*\{[\s\S]*?background:\s*linear-gradient[\s\S]*?!important/);
  // Selected item uses light text on dark blue; avoid inheriting text-primary-700
  // which would drop contrast.
  assert.match(css, /\[data-theme='dark'\] \.sidebar-nav-button\.bg-primary-50\s*\{[\s\S]*?color:\s*#93c5fd\s*!important/);
  // Input caret color (invisible in dark mode, needs fixing).
  assert.match(css, /\[data-theme='dark'\] \.chat-input-box[\s\S]*?caret-color/);

  // User message bubble: bg-blue-50/85 light-blue must be covered in dark mode,
  // avoid white-invisible text from text-gray-900.
  assert.match(css, /\[data-theme='dark'\] \.bg-blue-50\\\/85/);
  // Input island: dark mode must not keep .input-island's hardcoded white border.
  assert.match(css, /\[data-theme='dark'\] \.input-island[\s\S]*?border-color/);
});

test('Android ThemeBridge plugin and values-night fallback exist', async () => {
  const java = await readFile(
    new URL('../android/app/src/main/java/com/roleplayhub/app/ThemeBridgePlugin.java', import.meta.url),
    'utf8'
  );
  assert.match(java, /@CapacitorPlugin\(name = "ThemeBridge"\)/);
  assert.match(java, /public void setDark\(PluginCall call\)/);
  assert.match(java, /setStatusBarColor/);
  assert.match(java, /setAppearanceLightStatusBars/);

  const main = await readFile(
    new URL('../android/app/src/main/java/com/roleplayhub/app/MainActivity.java', import.meta.url),
    'utf8'
  );
  assert.match(main, /registerPlugin\(ThemeBridgePlugin\.class\)/);
  assert.match(main, /UI_MODE_NIGHT_MASK/);

  const night = await readFile(
    new URL('../android/app/src/main/res/values-night/styles.xml', import.meta.url),
    'utf8'
  );
  assert.match(night, /#111827/);
  assert.match(night, /windowLightStatusBar">false/);
});
test('application theme and MainActivity prevent the title bar from showing on OEM skins', async () => {
  const manifest = await readFile(
    new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url),
    'utf8'
  );
  const main = await readFile(
    new URL('../android/app/src/main/java/com/roleplayhub/app/MainActivity.java', import.meta.url),
    'utf8'
  );

  // The application-wide theme must be a NoActionBar variant; relying solely on
  // the per-activity SplashScreen theme leaves a window on HarmonyOS where the
  // default DarkActionBar application theme renders a white title bar.
  assert.match(manifest, /android:theme="@style\/AppTheme\.NoActionBar"/);
  assert.ok(!manifest.includes('android:theme="@style/AppTheme"'), 'AppTheme should not be applied application-wide');

  // Defensive fallback in case the theme is ignored by an OEM skin.
  assert.ok(main.includes('ActionBar actionBar = getSupportActionBar();'));
  assert.ok(main.includes('if (actionBar != null) {'));
  assert.ok(main.includes('actionBar.hide();'));
});

test('HarmonyOS compat layer is opted out of the auto EMUI title bar', async () => {
  const manifest = await readFile(
    new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url),
    'utf8'
  );
  const main = await readFile(
    new URL('../android/app/src/main/java/com/roleplayhub/app/MainActivity.java', import.meta.url),
    'utf8'
  );

  // hwc-theme metadata: tells the HarmonyOS (ArkUI) compatibility layer not to
  // auto-wrap the APK in its system-drawn EMUI title bar, which sits outside the
  // WebView DOM and cannot be removed with web CSS alone.
  assert.match(manifest, /android:name="hwc-theme"/);
  assert.match(manifest, /android:value="false" \/>/);

  // FEATURE_NO_TITLE must be requested before setContentView() (i.e. before
  // super.onCreate()), otherwise HarmonyOS/OEM skins may still show a title bar.
  assert.match(main, /import android\.view\.Window;/);
  const featureIdx = main.indexOf('supportRequestWindowFeature(Window.FEATURE_NO_TITLE)');
  const superIdx = main.indexOf('super.onCreate(savedInstanceState);');
  assert.ok(featureIdx !== -1, 'MainActivity requests the no-title window feature');
  assert.ok(superIdx !== -1, 'MainActivity calls super.onCreate()');
  assert.ok(featureIdx < superIdx, 'FEATURE_NO_TITLE is requested before super.onCreate()/setContentView()');
});