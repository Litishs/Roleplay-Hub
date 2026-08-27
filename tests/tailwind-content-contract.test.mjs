import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("tailwind main config scans src Vue SFCs so their utility classes compile", async () => {
  const config = await readFile(new URL("../tailwind.main.config.cjs", import.meta.url), "utf8");
  assert.match(config, /content: \[/);
  assert.match(config, /\.\/index\.html/);
  assert.match(config, /\.\/src\/\*\*\/\*\.\{vue,js,mjs\}/, "tailwind content must scan src SFC files");
});
