import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('dark mode theme state machine is wired in app.js', async () => {
  const source = await readFile(new URL('../src/modules/app.mjs', import.meta.url), 'utf8');

  // 默认值煎０鏄庯紙loadData 鍙悎骞?settings 涓凡瀛樺湪鐨?key锛屽繀椤诲厛澹版槑锛?
  assert.match(source, /themeMode:\s*'system'/);

  // 三选一规范化?
  assert.match(source, /const THEME_MODES = \['system', 'light', 'dark'\]/);
  assert.match(source, /const normalizeThemeMode = /);
  assert.match(source, /const resolveTheme = /);
  assert.match(source, /const applyTheme = /);

  // 跟随系统锛氱洃鍚?prefers-color-scheme
  assert.match(source, /matchMedia\('\(prefers-color-scheme: dark\)'\)/);
  assert.match(source, /themeMedia\.addEventListener\('change'/);

  // 驱动 CSS 覆盖规则
  assert.match(source, /document\.documentElement\.dataset\.theme = theme/);
  assert.match(source, /document\.documentElement\.style\.colorScheme = theme/);

  // Android 状态栏联动
  assert.match(source, /ThemeBridge\.setDark/);

  // localStorage 双写（供 head 防闪脚本读取）?
  assert.match(source, /localStorage\.setItem\('rph_theme_mode'/);

  // watch immediate（setup 阶段先应用一次）
  assert.match(source, /watch\(\(\) => settings\.themeMode, applyTheme, \{\s*immediate: true\s*\}\)/);

  // 涓夐€夐」渚?custom-select 浣跨敤
  assert.match(source, /const themeModeOptions = \[/);
  assert.match(source, /value: 'system', label: '跟随系统'/);
  assert.match(source, /value: 'light', label: '浅色'/);
  assert.match(source, /value: 'dark', label: '深色'/);

  // 导出到模板?
  assert.match(source, /themeModeOptions,/);
});

test('index.html has head anti-flicker script and settings dropdown', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  // head 内联防闪脚本（Vue 加载前同步设 data-theme）?
  assert.match(html, /localStorage\.getItem\('rph_theme_mode'\)/);
  assert.match(html, /document\.documentElement\.dataset\.theme = dark \? 'dark' : 'light'/);

  // 设置页外观主题下拉?
  assert.match(html, /v-model="settings\.themeMode" :options="themeModeOptions"/);
  assert.match(html, /外观主题/);
});

test('styles.css has dark override rules driven by data-theme', async () => {
  const css = await readFile(new URL('../assets/css/styles.css', import.meta.url), 'utf8');

  assert.match(css, /\[data-theme='dark'\]/);
  assert.match(css, /color-scheme: dark/);
  // 楂橀鑳屾櫙绫昏鐩?
  assert.match(css, /\[data-theme='dark'\] \.bg-white\b/);
  assert.match(css, /\[data-theme='dark'\] \.bg-gray-50\b/);
  // 鍗婇€忔槑绫昏鐩栵紙CSS 涓枩鏉犺浆涔変负 \/锛?
  assert.ok(css.includes('.bg-white\\/70'), 'bg-white/70 dark override present');
  // hover/focus 鍙樹綋瑕嗙洊
  assert.match(css, /\.hover\\:bg-gray-50:hover/);
  assert.match(css, /\.focus\\:bg-white:focus/);
  // 渚ц竟鏍忚嚜甯︽祬鑹?background 娓愬彉锛屾繁鑹叉ā寮忓繀椤昏鐩栨暣涓畝鍐欏睘鎬э紝涓嶈兘鍙敼 background-color
  assert.match(css, /\[data-theme='dark'\] \.app-sidebar\s*\{[\s\S]*?background:\s*linear-gradient[\s\S]*?!important/);
  // 閫変腑椤瑰湪娣辫摑搴曚笂浣跨敤浅色鏂囧瓧锛岄伩鍏嶆部鐢?text-primary-700 瀵艰嚧瀵规瘮搴︿笉瓒?
  assert.match(css, /\[data-theme='dark'\] \.sidebar-nav-button\.bg-primary-50\s*\{[\s\S]*?color:\s*#93c5fd\s*!important/);
  // 杈撳叆妗嗗厜鏍囪壊锛堟繁鑹蹭笅涓嶅彲瑙侀渶淇锛?
  assert.match(css, /\[data-theme='dark'\] \.chat-input-box[\s\S]*?caret-color/);

  // 鐢ㄦ埛娑堟伅姘旀场锛歜g-blue-50/85 娴呰摑搴曞繀椤昏深色瑕嗙洊锛岄伩鍏?text-gray-900 鐧藉瓧涓嶅彲璇?
  assert.match(css, /\[data-theme='dark'\] \.bg-blue-50\\\/85/);
  // 杈撳叆娴矝锛氭繁鑹蹭笅涓嶅緱淇濈暀 .input-island 纭紪鐮佺殑鐧借壊杈规
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
