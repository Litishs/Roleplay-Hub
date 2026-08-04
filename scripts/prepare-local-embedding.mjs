import { existsSync } from 'node:fs';
import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

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

// 3) bundled embedding model (bge-small-zh-v1.5). Not present in node_modules;
// download once from a mirror (e.g. HF_MIRROR_URL env) or drop files manually.
const modelId = 'bge-small-zh-v1.5';
const modelDir = path.join(target, 'models', modelId);
const modelPresent = existsSync(path.join(modelDir, 'onnx', 'model_quantized.onnx'));
if (!modelPresent) {
  console.warn(
    `[prepare-local-embedding] model "${modelId}" not found under ${modelDir}. ` +
    `Download it once (config.json / tokenizer.json / tokenizer_config.json / special_tokens_map.json / vocab.txt / onnx/model_quantized.onnx) ` +
    `or set HF_MIRROR_URL=https://hf-mirror.com and rerun.`
  );
} else {
  console.log(`[prepare-local-embedding] model "${modelId}" present (offline ready).`);
}
console.log(`[prepare-local-embedding] copied ${copied} library/wasm files to ${target}`);
