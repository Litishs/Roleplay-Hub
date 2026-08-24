
    'use strict';

    /**
     * RPHLocalEmbedding 鈥?鎵嬫満鏈湴绔晶鍚戦噺 embedding 鍘熷瀷(鏂规 C1)
     *
     * 杩愯鏃? Transformers.js(v3, WASM 鍗曠嚎绋? + onnxruntime-web jsep wasm銆?     * 渚濊禆(宸?vendored 鍒?assets/vendor/transformers/):
     *   - transformers.min.js        (ESM, 娴忚鍣ㄦ瀯寤?
     *   - ort-wasm-simd-threaded.jsep.wasm
     *   - models/<modelId>/          (config.json + tokenizer.json + model_quantized.onnx 绛?
     *
     * 璇存槑: 鏈娇鐢?Web Worker(鍘熷瀷闃舵, 涓荤嚎绋嬪垎鎵瑰鐞嗗苟鍦ㄦ瘡鎵归棿璁╁嚭浜嬩欢寰幆);
     *      鑻ュ悗缁彂鐜板崱椤? 鍙暣浣撹縼鍏?DedicatedWorker銆?     */

    const MODELS = Object.freeze({
        'bge-small-zh-v1.5': {
            id: 'bge-small-zh-v1.5',
            label: 'BGE Small (涓枃, 512 缁?',
            dims: 512,
            sizeMb: 24,
            bundled: true
        },
        'gte-small': {
            id: 'gte-small',
            label: 'GTE Small (澶氳瑷€, 384 缁?',
            dims: 384,
            sizeMb: 23,
            bundled: false
        },
        'multilingual-e5-small': {
            id: 'multilingual-e5-small',
            label: 'multilingual-e5-small (100+ 璇█, 384 缁?',
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
            throw new Error('Transformers.js 鍔犺浇澶辫触: 鏈壘鍒?pipeline 瀵煎嚭');
        }
        globalThis.transformers = lib;
        return lib;
    };

    const configureEnv = (lib, modelId) => {
        const env = lib.env;
        env.allowLocalModels = true;
        env.allowRemoteModels = false;   // 鍏ㄩ儴璧版湰鍦?assets, 閬垮厤鍥為€€ HF 杩滅▼琚鍗℃
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
     * 鎵归噺璁＄畻鏂囨湰鍚戦噺(鍧囧€兼睜鍖?+ L2 褰掍竴鍖?銆?     * @param {string[]} texts
     * @param {AbortSignal} [signal]
     * @returns {Promise<number[][]>} 姣忎釜杈撳叆涓€琛?Float32 鏁扮粍
     */
    const embedTexts = async (texts, signal) => {
        const input = (Array.isArray(texts) ? texts : [texts]).map(value => String(value || '').trim());
        if (input.some(value => !value)) throw new Error('宓屽叆鍐呭涓嶈兘涓虹┖');
        const pipeline = await ensureReady();
        const vectors = [];
        for (let i = 0; i < input.length; i++) {
            if (signal && signal.aborted) throw createAbortError();
            const output = await pipeline(input[i], { pooling: 'mean', normalize: true });
            const data = output && output.data;
            if (!data || !data.length) throw new Error('宓屽叆鎺ュ彛杩斿洖鐨勬暟鎹笉瀹屾暣');
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

    const RPHLocalEmbedding = Object.freeze({
        MODELS,
        getStatus,
        ensureReady,
        embedTexts,
        clearCache,
        isAvailable: () => state.status === 'ready' || state.status === 'loading'
    });

export { RPHLocalEmbedding };


globalThis.RPHLocalEmbedding = RPHLocalEmbedding;
if (typeof window !== "undefined") window.RPHLocalEmbedding = RPHLocalEmbedding;
