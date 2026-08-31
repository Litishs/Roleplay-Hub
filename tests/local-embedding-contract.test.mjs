import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));

const [html, app, localEmbedding, memoryState, prepareScript, packScript] = await Promise.all([
    readFile(new URL('../src/components/views/MemoryPanel.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/modules/app.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/modules/local-embedding.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/composables/useMemorySystem.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../scripts/prepare-local-embedding.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../scripts/pack-embedding-model.mjs', import.meta.url), 'utf8')
]);
    const mainJs = await readFile(new URL("../src/main.js", import.meta.url), "utf8");

test('local-embedding.js exposes RPHLocalEmbedding with model registry', () => {
    assert.match(localEmbedding, /const RPHLocalEmbedding = Object\.freeze\(\{/);
    assert.match(localEmbedding, /'bge-small-zh-v1\.5'/);
    assert.match(localEmbedding, /embedTexts/);
    assert.match(localEmbedding, /ensureReady/);
    assert.match(localEmbedding, /env\.localModelPath/);
    assert.match(localEmbedding, /env\.backends\.onnx\.wasm\.wasmPaths/);
});


test('app.js wires embeddingBackend local routing and classic->vector migration', () => {
    // memorySettings defaults moved to src/composables/useMemorySystem.mjs (Phase 2)
    assert.match(memoryState, /embeddingBackend: 'api'/);
    assert.match(memoryState, /localEmbeddingModel: 'bge-small-zh-v1\.5'/);
    assert.match(app, /if \(memorySettings\.embeddingBackend === 'local'\)/);
    assert.match(app, /\bRPHLocalEmbedding\b/);
    assert.match(app, /const migrateClassicMemoriesToVectors = async \(\) => \{/);
    assert.match(app, /const chunkId = `classic:\$\{memory\.turn\}`;/);
    assert.match(app, /localEmbeddingStatus, refreshLocalEmbeddingStatus, preloadLocalEmbedding, migrateClassicMemoriesToVectors/);
});

test('memory settings UI exposes backend selector and migration actions', () => {
    assert.match(html, /嵌入后端/);
    assert.match(html, /memorySettings\.embeddingBackend === 'local'/);
    assert.match(html, /localEmbeddingStatusLabel/);
});

test('vendored transformers library, wasm and bge-small-zh model files exist', () => {
    const vendor = path.join(root, 'assets/vendor/transformers');
    assert.ok(existsSync(path.join(vendor, 'transformers.min.js')), 'transformers.min.js');
    assert.ok(existsSync(path.join(vendor, 'ort-wasm-simd-threaded.jsep.wasm')), 'jsep wasm');
    const modelDir = path.join(vendor, 'models/bge-small-zh-v1.5');
    assert.ok(existsSync(path.join(modelDir, 'config.json')), 'config.json');
    assert.ok(existsSync(path.join(modelDir, 'tokenizer.json')), 'tokenizer.json');
    assert.ok(existsSync(path.join(modelDir, 'onnx', 'model_quantized.onnx')), 'onnx/model_quantized.onnx');
});

test('prepare-local-embedding script restores the model from a GitHub Release archive, falls back to HF and fails closed', () => {
    // The embedding model is NOT tracked by git; the prepare script must fetch
    // it at build time so the released APK is offline-ready. A warn-and-continue
    // script silently ships a broken vector memory feature (regression 2.42).
    assert.match(prepareScript, /EMBEDDING_MODEL_URL/);
    assert.match(prepareScript, /releases\/download\/embedding-model\/bge-small-zh-v1\.5\.tar\.gz/);
    assert.match(prepareScript, /extractTar\(\{ file: tmpPath, cwd: modelsDir \}\)/);
    assert.match(prepareScript, /HF_MIRROR_URL/);
    assert.match(prepareScript, /Xenova\/bge-small-zh-v1\.5/);
    assert.match(prepareScript, /onnx\/model_quantized\.onnx/);
    assert.match(prepareScript, /EXPECTED_SIZES/);
    assert.match(prepareScript, /size !== expected/);
    assert.match(prepareScript, /process\.exit\(1\)/);
    assert.match(prepareScript, /RPH_EMBEDDING_OFFLINE/);
});

test('pack-embedding-model script packs the model into a gzip archive for release upload', () => {
    assert.match(packScript, /create as createTar/);
    assert.match(packScript, /createTar\(\{/);
    assert.match(packScript, /gzip: true/);
    assert.match(packScript, /bge-small-zh-v1\.5\.tar\.gz/);
    assert.match(packScript, /gh release upload/);
});


test('src/main.js imports local-embedding.js', () => {
    assert.ok(app.includes('./local-embedding.mjs'));
});
