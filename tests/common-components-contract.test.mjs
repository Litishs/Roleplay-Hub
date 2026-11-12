import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const COMMON_DIR = new URL("../src/components/common/", import.meta.url);

test("index.html mounts the extracted common components", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  for (const tag of ["toast-notification", "side-nav", "confirm-dialog", "modal-dialog"]) {
    assert.match(html, new RegExp(`<${tag}></${tag}>`), `index.html must mount <${tag}>`);
  }
});

test("app.mjs imports and registers the mounted common components in both casing forms", async () => {
  const app = await readFile(new URL("../src/modules/app.mjs", import.meta.url), "utf8");
  for (const name of ["SideNav", "ToastNotification", "ConfirmDialog", "ModalDialog"]) {
    const kebab = name.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase()).replace(/^-/, "");
    assert.match(
      app,
      new RegExp(`import ${name} from '../components/common/${name}\\.vue';`),
      `app.mjs must import ${name}.vue`
    );
    assert.match(app, new RegExp(`['"]${kebab}['"]\\s*:\\s*${name}`), `createApp components must map ${kebab}`);
  }
  // Phase 1.6 (2026-08-28): the app.component global-registration workaround is
  // gone — consuming SFCs declare their shared dependencies locally, and only
  // the root index.html runtime template resolves through createApp({ components }).
  assert.ok(!app.includes("__app.component("), "global registration workaround must stay removed");
});

test("extracted SFCs read the shared appContext and are exported from index.js", async () => {
  const indexJs = await readFile(new URL("../src/components/index.js", import.meta.url), "utf8");
  for (const name of ["SideNav", "ToastNotification", "ConfirmDialog", "ModalDialog"]) {
    const vue = await readFile(new URL(`./${name}.vue`, COMMON_DIR), "utf8");
    assert.match(vue, /inject\("appContext"\)/, `${name}.vue must read the shared app context`);
    assert.match(indexJs, new RegExp(`import ${name} from './common/${name}\\.vue';`), "index.js must import it");
  }
  assert.match(
    indexJs,
    new RegExp(`export \\{[^}]*SideNav, ToastNotification, ConfirmDialog, ModalDialog, LoadingSpinner[^}]*\\}`),
    "index.js must export all Phase 1.5 components"
  );
});

test("LoadingSpinner stays standalone with a size prop", async () => {
  const vue = await readFile(new URL("./LoadingSpinner.vue", COMMON_DIR), "utf8");
  assert.match(vue, /props:\s*\{/);
  assert.match(vue, /size:\s*\{\s*type:\s*Number/);
  assert.match(vue, /animate-spin/);
});

test("story branch modal keeps referencing the head svg sprite in index.html", async () => {
  const [html, modal] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("./ModalDialog.vue", COMMON_DIR), "utf8"),
  ]);
  assert.match(modal, /#icon-story-branch/, "ModalDialog.vue must use the story branch icon");
  assert.match(html, /<symbol id="icon-story-branch"/, "index.html must keep the sprite symbol");
});

test("SideNav collapse width is controlled only by the dynamic class", async () => {
  const vue = await readFile(new URL("./SideNav.vue", COMMON_DIR), "utf8");
  assert.match(
    vue,
    /:class="\[isSidebarCollapsed \? 'md:w-16' : 'md:w-72'\]"/,
    "SideNav.vue must switch width when collapsed"
  );
  const sidebarTag = vue.match(/class="app-sidebar[^"]*"/)?.[0] ?? "";
  assert.ok(!/md:w-72/.test(sidebarTag), "static sidebar class must not hardcode md:w-72");
});

test("SideNav user profile click opens the user setup modal", async () => {
  const vue = await readFile(new URL("./SideNav.vue", COMMON_DIR), "utf8");
  assert.match(vue, /@click="showUserSetupModal = true"/, "profile block must open user setup on click");
  assert.match(vue, /showUserSetupModal = true/, "must reference the exposed showUserSetupModal");
});

test("SideNav renders every destination as a flat, sectioned list", async () => {
  const vue = await readFile(new URL("./SideNav.vue", COMMON_DIR), "utf8");
  // 2026-11-12: the collapsible 在线/高级 groups became plain captions. A
  // collapsed rail used to make those 7 children unreachable; flattening keeps
  // every destination one tap away at any width.
  for (const caption of ["常用", "在线", "高级", "系统"]) {
    assert.ok(
      vue.includes(`class="sidebar-nav-caption">${caption}`),
      `missing section caption ${caption}`
    );
  }
  assert.ok(!vue.includes("advanced-nav-trigger"), "no accordion trigger may remain");
  assert.ok(!vue.includes("online-nav-panel"), "no collapsible child panel may remain");
  assert.ok(!vue.includes("toggleOnlineNav"), "the online toggle is gone");

  // 会话 replaces the old separate 聊天 + 角色卡管理 entries.
  assert.match(vue, /currentView = 'home'/, "会话 navigates to the home view");
  assert.match(vue, /\[\s*'home',\s*'chat'\s*\]\.includes\(currentView\)/, "the chat detail view keeps 会话 highlighted");
  assert.ok(!vue.includes("currentView = 'chat'"), "chat is a detail view, not a sidebar destination");
  assert.ok(!vue.includes("currentView = 'characters'"), "character management moved into the home header");

  for (const view of ["memory", "uitemplates", "usage", "generator", "square", "novel",
    "presets", "worldinfo", "regex", "tools", "plugins", "settings"]) {
    assert.ok(vue.includes(`currentView = '${view}'`), `missing destination ${view}`);
  }

  // Captions lead each section and are hidden in the collapsed rail.
  const sections = (vue.match(/class="sidebar-nav-caption"/g) || []).length;
  assert.equal(sections, 4, "one caption per section");
});

test("sidebar section captions and the single active signal exist in styles.css", async () => {
  const css = await readFile(new URL("../assets/css/styles.css", import.meta.url), "utf8");
  assert.match(css, /\.sidebar-nav-caption\s*\{/, "section caption rule must exist");
  assert.match(css, /\[data-theme='dark'\] \.sidebar-nav-caption/, "captions need a dark-mode colour");
  // One active signal: flat tint + left bar. No gradient/ring/shadow stack.
  const activeIdx = css.indexOf(".sidebar-nav-button.bg-primary-50 {");
  assert.ok(activeIdx > 0, "active item rule must exist");
  const activeBlock = css.slice(activeIdx, css.indexOf("}", activeIdx));
  assert.match(activeBlock, /background:\s*rgba\(59, 130, 246, 0\.12\)/, "active row uses a flat tint");
  assert.doesNotMatch(activeBlock, /linear-gradient/, "active row must not stack a gradient");
  assert.doesNotMatch(activeBlock, /box-shadow/, "active row must not stack a shadow");
  // The removed accordion styles must not come back.
  assert.ok(!css.includes(".advanced-nav-list"), "subnav tree guide styles removed");
  assert.ok(!css.includes(".online-nav-panel"), "collapsible panel styles removed");
});

test("management item rows stack name above controls on narrow viewports", async () => {
  const [css, presets, regex, worldinfo, tools] = await Promise.all([
    readFile(new URL("../assets/css/styles.css", import.meta.url), "utf8"),
    readFile(new URL("../src/components/views/PresetsPanel.vue", import.meta.url), "utf8"),
    readFile(new URL("../src/components/views/RegexPanel.vue", import.meta.url), "utf8"),
    readFile(new URL("../src/components/views/WorldInfoPanel.vue", import.meta.url), "utf8"),
    readFile(new URL("../src/components/views/ToolsPanel.vue", import.meta.url), "utf8"),
  ]);
  // all four management panels share the same semantic row markers
  for (const [name, src] of [["PresetsPanel", presets], ["RegexPanel", regex], ["WorldInfoPanel", worldinfo], ["ToolsPanel", tools]]) {
    assert.match(src, /management-item-card/, `${name} marks its item card`);
    assert.match(src, /management-item-name/, `${name} marks the name zone`);
    assert.match(src, /management-item-controls/, `${name} marks the controls zone`);
  }
  // narrow viewports switch the row to a stacked grid: name row on top, controls below
  const mqIdx = css.indexOf("@media (max-width: 639px)");
  assert.ok(mqIdx > 0, "narrow-viewport media query must exist");
  const mqBlock = css.slice(mqIdx, css.indexOf("}", css.indexOf(".management-item-controls", mqIdx)));
  assert.match(mqBlock, /\.management-item-card[\s\S]*?display:\s*grid/, "item card becomes a grid on narrow viewports");
  assert.match(mqBlock, /grid-template-areas:[\s\S]*?"name"[\s\S]*?"controls"/, "name row stacks above the controls row");
  assert.match(mqBlock, /\.management-item-controls[\s\S]*?justify-content:\s*flex-end/, "controls row right-aligns under the name");
  // dark mode keeps the divider visible but muted
  assert.match(css, /\[data-theme='dark'\] \.management-item-controls/, "dark mode overrides the controls divider color");
});