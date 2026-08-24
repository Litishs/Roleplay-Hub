import { cp, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const output = path.join(root, 'dist');

// Vite has already created dist/ with index.html + assets/xxx.js + assets/xxx.css.
// We only need to copy assets that Vite doesn't handle.

// Helper: copy a directory from source to dist if it exists
const copyToDist = async (relativePath) => {
  const src = path.join(root, relativePath);
  const dst = path.join(output, relativePath);
  if (existsSync(src)) {
    await mkdir(path.dirname(dst), { recursive: true });
    await cp(src, dst, { recursive: true });
  }
};

// Copy vendor scripts (Vue, marked, purify, Sortable) referenced by index.html
await copyToDist('assets/vendor');

// Copy UMD fallback JS (card-utils.js, ui-select.js) needed by character workshop iframe
await copyToDist('assets/js');

// Copy CSS assets needed by character workshop page (fonts.css, character.css)
await copyToDist('assets/css');
await copyToDist('assets/generated');

// Copy character workshop page (separate entry, not processed by Vite)
const charSrc = path.join(root, 'character');
const charDst = path.join(output, 'character');
if (existsSync(charSrc)) {
  await cp(charSrc, charDst, { recursive: true });
}

// Copy LICENSE
const licenseSrc = path.join(root, 'LICENSE');
const licenseDst = path.join(output, 'LICENSE');
if (existsSync(licenseSrc)) {
  await cp(licenseSrc, licenseDst);
}

// Clean up assets that shouldn't be in the APK
await rm(path.join(output, 'assets', 'backup'), { recursive: true, force: true });
await rm(path.join(output, 'assets', 'character'), { recursive: true, force: true });
