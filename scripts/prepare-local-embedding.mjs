import { existsSync, statSync } from 'node:fs';
import { createWriteStream } from 'node:fs';
import { copyFile, mkdir, rm } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { x as extractTar } from 'tar';

const root = process.cwd();
const target = path.join(root, 'assets', 'vendor', 'transformers');
await mkdir(target, { recursive: true });

// 1) Transformers.js browser ESM build (v3)
const libPairs = [
  ['node_modules/@huggingface/transformers/dist/transformers.min.js', 'transformers.min.js'],
  // 2) onnxruntime-web wasm glue + binaries (jsep = single-threaded, no SharedArrayBuffer needed)
  ['node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.mjs'],
  ['node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm', 'ort-wasm-simd-threaded.jsep.wasm'],
  ['node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.mjs'],
  ['node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.wasm']
];

let copied = 0;
for (const [source, destination] of libPairs) {
  if (!existsSync(path.join(root, source))) continue;
  await copyFile(path.join(root, source), path.join(target, destination));
  copied++;
}

// 2) Bundled embedding model (bge-small-zh-v1.5). Not present in node_modules
// and not tracked by git. It is fetched at build time, preferring a stable
// GitHub Release asset (packed by scripts/pack-embedding-model.mjs) and
// falling back to Hugging Face per-file downloads, so the released APK is
// offline-ready. Exact sizes guard against truncated downloads.
//
// Env overrides:
//   EMBEDDING_MODEL_URL      full archive URL override (highest priority)
//   HF_MIRROR_URL            Hugging Face mirror origin (fallback path)
//   RPH_EMBEDDING_OFFLINE=1  skip download and only warn (fully offline builds)
const MODEL_REPO = 'Xenova/bge-small-zh-v1.5';
const MODEL_FILES = [
  'config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'special_tokens_map.json',
  'vocab.txt',
  'onnx/model_quantized.onnx'
];
const EXPECTED_SIZES = {
  'config.json': 716,
  'special_tokens_map.json': 125,
  'tokenizer.json': 439125,
  'tokenizer_config.json': 367,
  'vocab.txt': 109540,
  'onnx/model_quantized.onnx': 24010842
};

const modelsDir = path.join(target, 'models');
const modelDir = path.join(modelsDir, 'bge-small-zh-v1.5');

const defaultArchiveUrl = () => (
  'https://github.com/Litishs/Roleplay-Hub/releases/download/embedding-model/bge-small-zh-v1.5.tar.gz'
);
const resolveArchiveUrl = () => process.env.EMBEDDING_MODEL_URL || defaultArchiveUrl();

const resolveHfBaseUrl = () => {
  const mirror = process.env.HF_MIRROR_URL;
  return mirror ? String(mirror).replace(/\/+$/, '') : 'https://huggingface.co';
};

const modelFileOk = (name) => {
  const full = path.join(modelDir, name);
  if (!existsSync(full)) return false;
  const size = statSync(full).size;
  const expected = EXPECTED_SIZES[name];
  return Number.isFinite(expected) ? size === expected : size > 0;
};

const modelFilesOk = () => MODEL_FILES.every(modelFileOk);

const downloadTo = async (url, dest) => {
  console.log(`[prepare-local-embedding] downloading ${url}`);
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok || !response.body) {
    throw new Error(`download failed: HTTP ${response.status} for ${url}`);
  }
  await pipeline(response.body, createWriteStream(dest));
};

// Fetch the packed model archive from a GitHub Release asset and extract it.
const restoreFromArchive = async (url) => {
  const tmpPath = path.join(tmpdir(), `rph-embedding-${Date.now()}.tar.gz`);
  try {
    await downloadTo(url, tmpPath);
    await mkdir(modelsDir, { recursive: true });
    await extractTar({ file: tmpPath, cwd: modelsDir });
    if (!modelFilesOk()) {
      throw new Error(`archive extracted but files are incomplete or size-mismatched`);
    }
    console.log('[prepare-local-embedding] model restored from archive (offline ready).');
  } finally {
    await rm(tmpPath, { force: true }).catch(() => { });
  }
};

// Hugging Face per-file fallback (the original implementation).
const restoreFromHf = async () => {
  const baseUrl = resolveHfBaseUrl();
  console.log(`[prepare-local-embedding] falling back to per-file download from ${baseUrl}`);
  for (const name of MODEL_FILES) {
    if (modelFileOk(name)) continue;
    const url = `${baseUrl}/${MODEL_REPO}/resolve/main/${name}`;
    const full = path.join(modelDir, name);
    await mkdir(path.dirname(full), { recursive: true });
    await downloadTo(url, full);
    const size = statSync(full).size;
    const expected = EXPECTED_SIZES[name];
    if (Number.isFinite(expected) && size !== expected) {
      await rm(full, { force: true });
      throw new Error(`downloaded file has unexpected size ${size} (expected ${expected}) for ${name}`);
    }
  }
  console.log('[prepare-local-embedding] model restored from Hugging Face (offline ready).');
};

const ensureEmbeddingModel = async () => {
  if (modelFilesOk()) {
    console.log('[prepare-local-embedding] bge-small-zh-v1.5 model present (offline ready).');
    return;
  }
  if (process.env.RPH_EMBEDDING_OFFLINE === '1') {
    console.warn(
      `[prepare-local-embedding] model incomplete (missing: ${MODEL_FILES.filter(name => !modelFileOk(name)).join(', ')}) ` +
      `but RPH_EMBEDDING_OFFLINE=1 — skipping download. Vector memory retrieval will fail at runtime.`
    );
    return;
  }

  const archiveUrl = resolveArchiveUrl();
  console.log(`[prepare-local-embedding] bge-small-zh-v1.5 model incomplete, trying archive: ${archiveUrl}`);
  try {
    await restoreFromArchive(archiveUrl);
    return;
  } catch (error) {
    console.warn(`[prepare-local-embedding] archive download failed: ${error.message}`);
  }

  try {
    await restoreFromHf();
    return;
  } catch (error) {
    console.error(`[prepare-local-embedding] ERROR: ${error.message}`);
    console.error(
      '[prepare-local-embedding] upload the packed model to a release asset and set EMBEDDING_MODEL_URL, ' +
      'or set HF_MIRROR_URL=https://hf-mirror.com and retry, ' +
      'or drop the model files manually under assets/vendor/transformers/models/bge-small-zh-v1.5/.'
    );
    process.exit(1);
  }
};

await ensureEmbeddingModel();
console.log(`[prepare-local-embedding] copied ${copied} library/wasm files to ${target}`);
