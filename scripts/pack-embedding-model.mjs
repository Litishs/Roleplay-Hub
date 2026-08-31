// pack-embedding-model — build-time helper to produce the bge-small-zh-v1.5
// model archive for distribution via a GitHub Release asset.
//
// The embedding model is NOT tracked by git (assets/vendor/ is ignored). To
// make CI / offline builds fetch it from a stable GitHub URL instead of
// huggingface.co, pack the local model into a single .tar.gz and upload it to
// a release asset (see prepare-local-embedding.mjs for the expected URL).
//
// Usage:
//   node scripts/pack-embedding-model.mjs
//   gh release upload embedding-model dist/embedding-model/bge-small-zh-v1.5.tar.gz
//
// Env:
//   EMBEDDING_MODEL_OUT_DIR   output directory (default: dist/embedding-model)

import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { create as createTar } from 'tar';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modelsDir = path.join(root, 'assets', 'vendor', 'transformers', 'models');
const outDir = process.env.EMBEDDING_MODEL_OUT_DIR
    ? path.resolve(process.env.EMBEDDING_MODEL_OUT_DIR)
    : path.join(root, 'dist', 'embedding-model');

mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'bge-small-zh-v1.5.tar.gz');

await createTar({
    gzip: true,
    file: outFile,
    cwd: modelsDir,
    portable: true
}, ['bge-small-zh-v1.5']);

console.log(`[pack-embedding-model] wrote ${outFile}`);
console.log('[pack-embedding-model] upload it as a release asset, e.g.:');
console.log('  gh release upload embedding-model ' + outFile);
