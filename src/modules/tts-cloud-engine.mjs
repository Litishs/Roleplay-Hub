import RPHTtsText from './tts-text.mjs';

// tts-cloud-engine.mjs — cloud TTS engine speaking through an
// OpenAI-compatible POST {baseUrl}/audio/speech endpoint. Pure web layer
// (no native plugin): fetch returns mp3 blobs that an HTMLAudioElement
// plays back. Long text is split into sentence-bounded chunks (see
// tts-text.splitSpeechChunks) synthesized and played sequentially, with
// the next chunk prefetched while the current one plays.
//
// The API key lives in settings and is synced in via configure(); it is
// only ever attached to the runtime request header — never logged and
// never persisted by this module.

const FETCH_TIMEOUT_MS = 30000;
const DEFAULT_CHUNK_CHARS = 200;
const PREFETCH_AHEAD = 1;

const state = {
    status: 'idle', // idle | speaking
    checked: true,
    available: false, // provider configured with a base url
    engineLabel: '云端 API',
    error: '',
    currentUtteranceId: null,
    provider: { baseUrl: '', apiKey: '', model: '', format: 'mp3' }
};

const listeners = new Set();

const emit = (payload) => {
    listeners.forEach((cb) => {
        try { cb(payload); } catch (_) { /* listener errors must not break the engine */ }
    });
};

const getStatus = () => ({
    available: state.available,
    engineLabel: state.engineLabel,
    state: state.status,
    currentUtteranceId: state.currentUtteranceId,
    error: state.error,
    checked: state.checked
});

const isAvailable = () => state.available;

const configure = ({ baseUrl, apiKey, model, format } = {}) => {
    state.provider.baseUrl = String(baseUrl || '').trim().replace(/\/+$/, '');
    state.provider.apiKey = String(apiKey || '');
    state.provider.model = String(model || '').trim();
    state.provider.format = String(format || 'mp3').trim() || 'mp3';
    state.available = !!state.provider.baseUrl;
    return getStatus();
};

const refreshStatus = async () => getStatus();

const activeControllers = new Set();
let activeAudio = null;
const liveObjectUrls = new Set();

const releaseUrl = (url) => {
    if (!url || !liveObjectUrls.has(url)) return;
    liveObjectUrls.delete(url);
    try { URL.revokeObjectURL(url); } catch (_) { /* ignore */ }
};

const teardownPlayback = () => {
    activeControllers.forEach((controller) => {
        try { controller.abort(); } catch (_) { /* ignore */ }
    });
    activeControllers.clear();
    if (activeAudio) {
        try { activeAudio.pause(); } catch (_) { /* ignore */ }
        activeAudio.removeAttribute('src');
        activeAudio = null;
    }
    liveObjectUrls.forEach((url) => {
        try { URL.revokeObjectURL(url); } catch (_) { /* ignore */ }
    });
    liveObjectUrls.clear();
};

const requestChunkAudio = async (chunk, voice, speed) => {
    const { baseUrl, apiKey, model, format } = state.provider;
    const controller = new AbortController();
    activeControllers.add(controller);
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const response = await fetch(`${baseUrl}/audio/speech`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {})
            },
            body: JSON.stringify({
                model: model || 'tts-1',
                input: chunk,
                voice: voice || 'alloy',
                speed: Number(speed) || 1,
                response_format: format
            }),
            signal: controller.signal
        });
        if (!response.ok) {
            let detail = '';
            try { detail = (await response.text()).slice(0, 200); } catch (_) { /* ignore */ }
            throw new Error(`HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
        }
        const blob = await response.blob();
        if (!blob.size) throw new Error('Empty audio response');
        const url = URL.createObjectURL(blob);
        liveObjectUrls.add(url);
        return url;
    } finally {
        clearTimeout(timeout);
        activeControllers.delete(controller);
    }
};

const playAudioUrl = (url, utteranceId) => new Promise((resolve, reject) => {
    const audio = new Audio(url);
    activeAudio = audio;
    const cleanup = () => {
        audio.removeEventListener('ended', onEnded);
        audio.removeEventListener('error', onError);
        if (activeAudio === audio) activeAudio = null;
    };
    const onEnded = () => {
        cleanup();
        releaseUrl(url);
        resolve();
    };
    const onError = () => {
        cleanup();
        releaseUrl(url);
        reject(new Error('Audio playback failed'));
    };
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    // A stop() between chunk generations surfaces as an aborted fetch or a
    // paused element; treat a paused element without error as a clean stop.
    audio.play().then(() => {
        if (state.currentUtteranceId !== utteranceId) {
            audio.pause();
        }
    }).catch((error) => {
        cleanup();
        releaseUrl(url);
        reject(error);
    });
});

const speak = async ({ text, voice = '', speed = 1, utteranceId = '', chunkChars = DEFAULT_CHUNK_CHARS } = {}) => {
    if (!state.provider.baseUrl) throw new Error('云端 API 未配置 Base URL');
    const safeText = String(text || '').trim();
    if (!safeText) throw new Error('没有可朗读的文本');
    const chunks = RPHTtsText.splitSpeechChunks(safeText, chunkChars);
    if (!chunks.length) throw new Error('没有可朗读的文本');
    const id = utteranceId || `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

    state.currentUtteranceId = id;
    state.status = 'speaking';
    state.error = '';
    emit({ utteranceId: id, state: 'start' });

    const prefetches = new Map();
    const startPrefetch = (index) => {
        if (index >= chunks.length || prefetches.has(index)) return;
        prefetches.set(index, requestChunkAudio(chunks[index], voice, speed));
    };

    try {
        startPrefetch(0);
        for (let index = 0; index < chunks.length; index += 1) {
            if (state.currentUtteranceId !== id) return id; // stopped
            startPrefetch(index + PREFETCH_AHEAD);
            const url = await prefetches.get(index);
            prefetches.delete(index);
            await playAudioUrl(url, id);
        }
        if (state.currentUtteranceId === id) {
            state.status = 'idle';
            state.currentUtteranceId = null;
            emit({ utteranceId: id, state: 'done' });
        }
    } catch (error) {
        teardownPlayback();
        prefetches.clear();
        const aborted = state.currentUtteranceId !== id;
        state.status = 'idle';
        state.currentUtteranceId = null;
        if (aborted) {
            // stop() already tore playback down and emitted the stop event.
        } else {
            state.error = String(error?.message || error);
            emit({ utteranceId: id, state: 'error', error: state.error });
            throw error;
        }
    }
    return id;
};

const stop = async () => {
    const id = state.currentUtteranceId;
    teardownPlayback();
    state.currentUtteranceId = null;
    state.status = 'idle';
    if (id) emit({ utteranceId: id, state: 'stop' });
};

const __exports = Object.freeze({
    getStatus,
    refreshStatus,
    configure,
    isAvailable,
    speak,
    stop,
    onState: (cb) => {
        if (typeof cb === 'function') listeners.add(cb);
        return () => listeners.delete(cb);
    }
});

export default __exports;
