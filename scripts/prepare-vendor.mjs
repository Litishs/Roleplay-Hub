import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const target = path.join(root, 'assets', 'vendor');
await mkdir(path.join(target, 'fonts'), { recursive: true });

const files = [
  // vue.global.prod.js is not loaded by the main page (the Vite bundle ships
  // its own Vue) but character/index.html still needs the UMD global.
  ['node_modules/vue/dist/vue.global.prod.js', 'vue.global.prod.js'],
  ['node_modules/marked/lib/marked.umd.js', 'marked.umd.js'],
  ['node_modules/dompurify/dist/purify.min.js', 'purify.min.js'],
  ['node_modules/sortablejs/Sortable.min.js', 'Sortable.min.js'],
  // jquery is injected at runtime into executable HTML frames (utils.mjs).
  ['node_modules/jquery/dist/jquery.min.js', 'jquery.min.js'],
  ['node_modules/@fontsource-variable/lora/files/lora-latin-wght-normal.woff2', 'fonts/lora-latin-wght-normal.woff2'],
  ['node_modules/@fontsource-variable/lora/files/lora-latin-wght-italic.woff2', 'fonts/lora-latin-wght-italic.woff2']
];

for (const [source, destination] of files) {
  await copyFile(path.join(root, source), path.join(target, destination));
}
