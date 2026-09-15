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

test("SideNav groups 角色卡生成 and 万相广场 behind a collapsible 在线 nav", async () => {
  const vue = await readFile(new URL("./SideNav.vue", COMMON_DIR), "utf8");
  // trigger: globe icon + chevron, active when either child view is current
  assert.match(vue, /class="online-nav"/, "online nav wrapper must exist");
  assert.match(vue, /@click="toggleOnlineNav"/, "trigger must toggle the online nav");
  assert.match(vue, /title="在线"/, "trigger label must be 在线");
  assert.match(vue, /\[\s*'generator',\s*'square'\s*\]\.includes\(currentView\)/, "trigger highlights when generator or square is active");
  assert.match(vue, /aria-controls="online-nav-panel"/, "trigger must reference the panel");
  // children live inside the panel and navigate to their views
  const panelIdx = vue.indexOf('id="online-nav-panel"');
  const genIdx = vue.indexOf("currentView = 'generator'");
  const sqIdx = vue.indexOf("currentView = 'square'");
  assert.ok(panelIdx > 0, "online nav panel must exist");
  assert.ok(genIdx > panelIdx && sqIdx > genIdx, "generator and square buttons must live inside the panel, after the panel opens");
  // the old top-level standalone buttons are gone (no direct generator/square buttons outside the panel)
  const standalone = /<button[^>]*@click="currentView = 'generator'; closeMobileMenu\(\)"\s*\n\s*title="角色卡生成"/;
  assert.ok(!standalone.test(vue), "generator must not be a standalone top-level button anymore");
  assert.match(vue, /<span>角色卡生成<\/span>/, "generator child item keeps its label");
  assert.match(vue, /<span>万相广场<\/span>/, "square child item keeps its label");
});

test("subnav child items are indented under their group with a tree guide line", async () => {
  const css = await readFile(new URL("../assets/css/styles.css", import.meta.url), "utf8");
  // shared list for both 在线 and 高级 groups: indented from the parent trigger icon column
  const listIdx = css.indexOf(".advanced-nav-list {");
  assert.ok(listIdx > 0, "advanced-nav-list rule must exist");
  const listBlock = css.slice(listIdx, css.indexOf("}", listIdx));
  assert.match(listBlock, /margin:\s*[^;]*1\.375rem/, "subnav list must be indented under the parent icon column");
  assert.match(listBlock, /padding-left:\s*0\.5rem/, "subnav list keeps inner padding for the guide line");
  // tree guide line drawn by the list itself
  assert.match(css, /\.advanced-nav-list::before[\s\S]*?background:\s*linear-gradient/, "subnav list draws a vertical guide line");
  // child items are visually smaller than top-level entries
  const itemIdx = css.indexOf(".advanced-nav-item {");
  assert.ok(itemIdx > 0, "advanced-nav-item rule must exist");
  const itemBlock = css.slice(itemIdx, css.indexOf("}", itemIdx));
  assert.match(itemBlock, /font-size:\s*0\.9375rem/, "subnav items render one step smaller than top-level nav");
  // dark mode keeps the guide line visible but muted
  assert.match(css, /\[data-theme='dark'\] \.advanced-nav-list::before/, "dark mode overrides the guide line color");
});