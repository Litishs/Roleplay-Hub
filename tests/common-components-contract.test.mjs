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
    assert.match(
      app,
      new RegExp(`\\['${name}', ${name}\\],?\\s*\\['${kebab}', ${name}\\]`),
      `global registration must register both ${name} and ${kebab}`
    );
  }
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