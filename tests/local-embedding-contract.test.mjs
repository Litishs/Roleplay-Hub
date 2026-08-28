import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));

const [html, app, localEmbedding, memoryState] = await Promise.all([
    readFile(new URL('../src/components/views/MemoryPanel.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/modules/app.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/modules/local-embedding.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/composables/useMemorySystem.mjs', import.meta.url), 'utf8')
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


test('src/main.js imports local-embedding.js', () => {
    assert.ok(app.includes('./local-embedding.mjs'));
});
