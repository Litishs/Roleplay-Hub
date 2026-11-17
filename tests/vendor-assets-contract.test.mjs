import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { stripSourceMapComment } from "../scripts/lib/strip-source-map.mjs";

// 2026-11-12: vendored bundles (marked / dompurify) carry a
// trailing `sourceMappingURL` comment while their .map files are never copied.
// Vite's dev server honoured the comment, failed the read and printed
// "Failed to load source map ... ENOENT" on every page load, which buried real
// errors in the console. The copy helpers now drop the reference.

const read = (relative) => readFile(new URL(relative, import.meta.url), "utf8");

test("stripSourceMapComment removes only the trailing map reference", () => {
    assert.equal(stripSourceMapComment("var a=1;\n//# sourceMappingURL=a.js.map\n"), "var a=1;\n",
        "the line ending before the comment survives");
    assert.equal(stripSourceMapComment("var a=1;\n//# sourceMappingURL=a.js.map"), "var a=1;\n");
    assert.equal(stripSourceMapComment("var a=1;\n/*# sourceMappingURL=a.js.map */"), "var a=1;\n");
    assert.equal(stripSourceMapComment("var a=1;"), "var a=1;", "a bundle without the comment is untouched");
    // A mid-file reference is data, not the trailing pointer: leave it alone.
    const inline = "var a=1;\n//# sourceMappingURL=a.js.map\nvar b=2;";
    assert.equal(stripSourceMapComment(inline), inline);
});

test("the vendor copy script strips the reference while copying", async () => {
    const source = await read("../scripts/prepare-vendor.mjs");
    assert.match(source, /import \{ copyWithoutSourceMap \} from '\.\/lib\/strip-source-map\.mjs';/,
        "the script must use the shared copy helper");
    assert.match(source, /await copyWithoutSourceMap\(/, "the copy loop must go through the helper");
    assert.doesNotMatch(source, /await copyFile\(/, "no raw copyFile may bypass the stripper");
});
