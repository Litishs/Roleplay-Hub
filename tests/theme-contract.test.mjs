import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('dark mode theme state machine is wired in app.js', async () => {
  const source = await readFile(new URL('../assets/js/app.js', import.meta.url), 'utf8');

  // 默认值声明（loadData 只合并 settings 中已存在的 key，必须先声明）
  assert.match(source, /themeMode:\s*'system'/);

  // 三选一规范化
  assert.match(source, /const THEME_MODES = \['system', 'light', 'dark'\]/);
  assert.match(source, /const normalizeThemeMode = /);
  assert.match(source, /const resolveTheme = /);
  assert.match(source, /const applyTheme = /);

  // 跟随系统：监听 prefers-color-scheme
  assert.match(source, /matchMedia\('\(prefers-color-scheme: dark\)'\)/);
  assert.match(source, /themeMedia\.addEventListener\('change'/);

  // 驱动 CSS 覆盖规则
  assert.match(source, /document\.documentElement\.dataset\.theme = theme/);
  assert.match(source, /document\.documentElement\.style\.colorScheme = theme/);

  // Android 状态栏联动
  assert.match(source, /ThemeBridge\.setDark/);

  // localStorage 双写（供 head 防闪脚本读取）
  assert.match(source, /localStorage\.setItem\('rph_theme_mode'/);

  // watch immediate（setup 阶段先应用一次）
  assert.match(source, /watch\(\(\) => settings\.themeMode, applyTheme, \{\s*immediate: true\s*\}\)/);

  // 三选项供 custom-select 使用
  assert.match(source, /const themeModeOptions = \[/);
  assert.match(source, /value: 'system', label: '跟随系统'/);
  assert.match(source, /value: 'light', label: '浅色'/);
  assert.match(source, /value: 'dark', label: '深色'/);

  // 导出到模板
  assert.match(source, /themeModeOptions,/);
});

test('index.html has head anti-flicker script and settings dropdown', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  // head 内联防闪脚本（Vue 加载前同步设 data-theme）
  assert.match(html, /localStorage\.getItem\('rph_theme_mode'\)/);
  assert.match(html, /document\.documentElement\.dataset\.theme = dark \? 'dark' : 'light'/);

  // 设置页外观主题下拉
  assert.match(html, /v-model="settings\.themeMode" :options="themeModeOptions"/);
  assert.match(html, /外观主题/);
});

test('styles.css has dark override rules driven by data-theme', async () => {
  const css = await readFile(new URL('../assets/css/styles.css', import.meta.url), 'utf8');

  assert.match(css, /\[data-theme='dark'\]/);
  assert.match(css, /color-scheme: dark/);
  // 高频背景类覆盖
  assert.match(css, /\[data-theme='dark'\] \.bg-white\b/);
  assert.match(css, /\[data-theme='dark'\] \.bg-gray-50\b/);
  // 半透明类覆盖（CSS 中斜杠转义为 \/）
  assert.ok(css.includes('.bg-white\\/70'), 'bg-white/70 dark override present');
  // hover/focus 变体覆盖
  assert.match(css, /\.hover\\:bg-gray-50:hover/);
  assert.match(css, /\.focus\\:bg-white:focus/);
  // 侧边栏自带浅色 background 渐变，深色模式必须覆盖整个简写属性，不能只改 background-color
  assert.match(css, /\[data-theme='dark'\] \.app-sidebar\s*\{[\s\S]*?background:\s*linear-gradient[\s\S]*?!important/);
  // 选中项在深蓝底上使用浅色文字，避免沿用 text-primary-700 导致对比度不足
  assert.match(css, /\[data-theme='dark'\] \.sidebar-nav-button\.bg-primary-50\s*\{[\s\S]*?color:\s*#93c5fd\s*!important/);
  // 输入框光标色（深色下不可见需修正）
  assert.match(css, /\[data-theme='dark'\] \.chat-input-box[\s\S]*?caret-color/);

  // 用户消息气泡：bg-blue-50/85 浅蓝底必须被深色覆盖，避免 text-gray-900 白字不可读
  assert.match(css, /\[data-theme='dark'\] \.bg-blue-50\\\/85/);
  // 输入浮岛：深色下不得保留 .input-island 硬编码的白色边框
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
