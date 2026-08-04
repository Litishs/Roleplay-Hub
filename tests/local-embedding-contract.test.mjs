import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));

const [html, app, localEmbedding] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../assets/js/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../assets/js/local-embedding.js', import.meta.url), 'utf8')
]);

test('local-embedding.js exposes RPHLocalEmbedding with model registry', () => {
    assert.match(localEmbedding, /globalThis\.RPHLocalEmbedding = Object\.freeze\(\{/);
    assert.match(localEmbedding, /'bge-small-zh-v1\.5'/);
    assert.match(localEmbedding, /embedTexts/);
    assert.match(localEmbedding, /ensureReady/);
    assert.match(localEmbedding, /env\.localModelPath/);
    assert.match(localEmbedding, /env\.backends\.onnx\.wasm\.wasmPaths/);
});

test('index.html loads local-embedding.js before app.js', () => {
    const appIdx = html.indexOf('assets/js/app.js');
    const localIdx = html.indexOf('assets/js/local-embedding.js');
    assert.ok(appIdx > 0 && localIdx > 0 && localIdx < appIdx);
});

test('app.js wires embeddingBackend local routing and classic->vector migration', () => {
    assert.match(app, /embeddingBackend: 'api'/);
    assert.match(app, /localEmbeddingModel: 'bge-small-zh-v1\.5'/);
    assert.match(app, /if \(memorySettings\.embeddingBackend === 'local'\)/);
    assert.match(app, /globalThis\.RPHLocalEmbedding/);
    assert.match(app, /const migrateClassicMemoriesToVectors = async \(\) => \{/);
    assert.match(app, /const chunkId = `classic:\$\{memory\.turn\}`;/);
    assert.match(app, /localEmbeddingStatus, refreshLocalEmbeddingStatus, preloadLocalEmbedding, migrateClassicMemoriesToVectors/);
});

test('memory settings UI exposes backend selector and migration actions', () => {
    assert.match(html, /嵌入后端/);
    assert.match(html, /memorySettings\.embeddingBackend === 'local'/);
    assert.match(html, /migrateClassicMemoriesToVectors\(\)/);
    assert.match(html, /总结模式即将弃用/);
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
