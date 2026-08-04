(() => {
    'use strict';

    /**
     * RPHLocalEmbedding — 手机本地端侧向量 embedding 原型(方案 C1)
     *
     * 运行时: Transformers.js(v3, WASM 单线程) + onnxruntime-web jsep wasm。
     * 依赖(已 vendored 到 assets/vendor/transformers/):
     *   - transformers.min.js        (ESM, 浏览器构建)
     *   - ort-wasm-simd-threaded.jsep.wasm / ort-wasm-simd-threaded.wasm
     *   - models/<modelId>/          (config.json + tokenizer.json + model_quantized.onnx 等)
     *
     * 说明: 未使用 Web Worker(原型阶段, 主线程分批处理并在每批间让出事件循环);
     *      若后续发现卡顿, 可整体迁入 DedicatedWorker。
     */

    const MODELS = Object.freeze({
        'bge-small-zh-v1.5': {
            id: 'bge-small-zh-v1.5',
            label: 'BGE Small (中文, 512 维)',
            dims: 512,
            sizeMb: 24,
            bundled: true
        },
        'gte-small': {
            id: 'gte-small',
            label: 'GTE Small (多语言, 384 维)',
            dims: 384,
            sizeMb: 23,
            bundled: false
        },
        'multilingual-e5-small': {
            id: 'multilingual-e5-small',
            label: 'multilingual-e5-small (100+ 语言, 384 维)',
            dims: 384,
            sizeMb: 140,
            bundled: false
        }
    });

    const VENDOR_BASE = 'assets/vendor/transformers/';
    const MODELS_BASE = VENDOR_BASE + 'models/';

    const state = {
        status: 'idle',      // idle | loading | ready | error | unavailable
        error: '',
        progress: 0,         // 0-100
        modelId: '',
        pipeline: null,
        loading: null        // in-flight promise
    };

    const createAbortError = () => {
        if (typeof DOMException === 'function') return new DOMException('Aborted', 'AbortError');
        const error = new Error('Aborted');
        error.name = 'AbortError';
        return error;
    };

    const resolveUrl = (path) => {
        const base = document.baseURI || (globalThis.location && globalThis.location.href) || 'https://localhost/';
        return new URL(path, base).href;
    };

    const getLibrary = async () => {
        if (globalThis.transformers) return globalThis.transformers;
        const url = resolveUrl(VENDOR_BASE + 'transformers.min.js');
        const module = await import(url);
        const lib = module.default || module;
        if (!lib || typeof lib.pipeline !== 'function') {
            throw new Error('Transformers.js 加载失败: 未找到 pipeline 导出');
        }
        globalThis.transformers = lib;
        return lib;
    };

    const configureEnv = (lib, modelId) => {
        const env = lib.env;
        env.allowLocalModels = true;
        env.allowRemoteModels = false;   // 全部走本地 assets, 避免回退 HF 远程被墙卡死
        env.localModelPath = resolveUrl(MODELS_BASE);
        env.backends.onnx.wasm.wasmPaths = resolveUrl(VENDOR_BASE);
        if (env.backends.onnx.wasm) env.backends.onnx.wasm.numThreads = 1;
        env.useBrowserCache = true;
        state.env = env;
    };

    const ensureReady = async (modelId = 'bge-small-zh-v1.5') => {
        const spec = MODELS[modelId] || MODELS['bge-small-zh-v1.5'];
        if (state.pipeline && state.modelId === spec.id && state.status === 'ready') {
            return state.pipeline;
        }
        if (state.loading) return state.loading;

        state.loading = (async () => {
            state.status = 'loading';
            state.progress = 0;
            state.error = '';
            state.modelId = spec.id;
            try {
                const lib = await getLibrary();
                configureEnv(lib, spec.id);
                const pipeline = await lib.pipeline('feature-extraction', spec.id, {
                    quantized: true,
                    progress_callback: (event) => {
                        if (!event) return;
                        const value = Number(event.progress ?? event.loaded ?? 0);
                        state.progress = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
                    }
                });
                state.pipeline = pipeline;
                state.status = 'ready';
                state.progress = 100;
                return pipeline;
            } catch (error) {
                state.status = 'error';
                state.error = String((error && error.message) || error);
                console.error('[RPHLocalEmbedding] init failed:', error);
                throw error;
            } finally {
                state.loading = null;
            }
        })();
        return state.loading;
    };

    const yieldToBrowser = () => new Promise(resolve => setTimeout(resolve, 0));

    /**
     * 批量计算文本向量(均值池化 + L2 归一化)。
     * @param {string[]} texts
     * @param {AbortSignal} [signal]
     * @returns {Promise<number[][]>} 每个输入一行 Float32 数组
     */
    const embedTexts = async (texts, signal) => {
        const input = (Array.isArray(texts) ? texts : [texts]).map(value => String(value || '').trim());
        if (input.some(value => !value)) throw new Error('嵌入内容不能为空');
        const pipeline = await ensureReady();
        const vectors = [];
        for (let i = 0; i < input.length; i++) {
            if (signal && signal.aborted) throw createAbortError();
            const output = await pipeline(input[i], { pooling: 'mean', normalize: true });
            const data = output && output.data;
            if (!data || !data.length) throw new Error('嵌入接口返回的数据不完整');
            vectors.push(Array.from(data));
            if (i % 2 === 1) await yieldToBrowser();
        }
        return vectors;
    };

    const clearCache = async () => {
        try {
            if (globalThis.caches && typeof globalThis.caches.keys === 'function') {
                const keys = await globalThis.caches.keys();
                await Promise.all(keys.map(key => globalThis.caches.delete(key)));
            }
        } catch (error) {
            console.warn('[RPHLocalEmbedding] cache clear failed:', error);
        }
        state.pipeline = null;
        state.status = 'idle';
        state.progress = 0;
        state.modelId = '';
        state.loading = null;
    };

    const getStatus = () => ({
        status: state.status,
        error: state.error,
        progress: state.progress,
        modelId: state.modelId,
        ready: state.status === 'ready'
    });

    globalThis.RPHLocalEmbedding = Object.freeze({
        MODELS,
        getStatus,
        ensureReady,
        embedTexts,
        clearCache,
        isAvailable: () => state.status === 'ready' || state.status === 'loading'
    });
})();
