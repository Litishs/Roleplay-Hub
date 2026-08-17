(() => {
    'use strict';

    /**
     * RPHLocalTts -- local neural TTS engine bridge (P2: sherpa-onnx on Android).
     *
     * Mirrors the RPHTts API shape (getStatus/refreshStatus/speak/stop/onState/
     * isAvailable) and adds voice model management: a curated catalog, runtime
     * download with progress (handled natively into app-private storage), and
     * removal. Voice bundles never ship inside the APK.
     *
     * Native counterpart: LocalTTSPlugin.java (Capacitor plugin "LocalTTS").
     * Degrades gracefully without Capacitor (desktop browser / Node tests).
     */

    const factory = () => {
        const getPlugin = () => (globalThis.Capacitor?.Plugins?.LocalTTS) || null;

        // Curated voice catalog. tar.bz2 bundles from the sherpa-onnx release
        // assets; mirrorUrl is tried by the native side when the primary fails.
        const VOICES = [
            {
                id: 'vits-melo-tts-zh_en',
                name: 'Melo',
                desc: 'Natural female, Chinese + English',
                type: 'vits',
                sizeMb: 160,
                url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-melo-tts-zh_en.tar.bz2',
                mirrorUrl: 'https://hf-mirror.com/csukuangfj/vits-melo-tts-zh_en/resolve/main/vits-melo-tts-zh_en.tar.bz2'
            },
            {
                id: 'vits-zh-hf-theresa',
                name: 'Theresa',
                desc: 'Light female, Chinese only',
                type: 'vits',
                sizeMb: 115,
                url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-zh-hf-theresa.tar.bz2',
                mirrorUrl: 'https://hf-mirror.com/csukuangfj/vits-zh-hf-theresa/resolve/main/vits-zh-hf-theresa.tar.bz2'
            },
            {
                id: 'zipvoice-zh-en-emilia',
                name: 'ZipVoice Clone',
                desc: 'Zero-shot voice cloning, Chinese + English',
                type: 'zipvoice',
                sizeMb: 104,
                files: [
                    {
                        url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/sherpa-onnx-zipvoice-distill-int8-zh-en-emilia.tar.bz2',
                        mirrorUrl: 'https://hf-mirror.com/csukuangfj/sherpa-onnx-zipvoice-distill-int8-zh-en-emilia/resolve/main/sherpa-onnx-zipvoice-distill-int8-zh-en-emilia.tar.bz2',
                        kind: 'archive',
                        name: ''
                    },
                    {
                        url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/vocoder-models/vocos_24khz.onnx',
                        mirrorUrl: '',
                        kind: 'raw',
                        name: 'vocos_24khz.onnx'
                    }
                ]
            }
        ];

        const state = {
            status: 'idle', // idle | speaking
            available: false, // native plugin present and responsive
            ready: false, // at least one voice installed
            checked: false,
            engineLabel: 'Local neural TTS',
            error: '',
            currentUtteranceId: null,
            installed: [],
            install: null // { voiceId, phase, received, total } while active
        };

        const listeners = new Set();
        const progressListeners = new Set();

        const emit = (payload) => {
            listeners.forEach((cb) => {
                try { cb(payload); } catch (_) { /* listener errors must not break the engine */ }
            });
        };

        const emitProgress = (payload) => {
            progressListeners.forEach((cb) => {
                try { cb(payload); } catch (_) { /* ignore */ }
            });
        };

        let stateListenerReady = null;
        let progressListenerReady = null;

        const ensureStateListener = () => {
            if (stateListenerReady) return stateListenerReady;
            stateListenerReady = (async () => {
                const plugin = getPlugin();
                if (!plugin?.addListener) return;
                await plugin.addListener('tts-state', (data) => {
                    const payload = data || {};
                    const id = payload.utteranceId;
                    if (id && state.currentUtteranceId && id !== state.currentUtteranceId) return;
                    if (payload.state === 'start') {
                        state.status = 'speaking';
                    } else {
                        state.status = 'idle';
                        if (id) state.currentUtteranceId = null;
                    }
                    if (payload.state === 'error') state.error = String(payload.error || 'Local TTS playback failed');
                    emit(payload);
                });
            })().catch(() => { stateListenerReady = null; });
            return stateListenerReady;
        };

        const ensureProgressListener = () => {
            if (progressListenerReady) return progressListenerReady;
            progressListenerReady = (async () => {
                const plugin = getPlugin();
                if (!plugin?.addListener) return;
                await plugin.addListener('tts-model', (data) => {
                    const payload = data || {};
                    const voiceId = String(payload.voiceId || '');
                    if (!voiceId) return;
                    if (payload.phase === 'done') {
                        state.install = null;
                        if (!state.installed.includes(voiceId)) state.installed.push(voiceId);
                    } else if (payload.phase === 'error' || payload.phase === 'cancelled') {
                        state.install = null;
                        if (payload.phase === 'error') state.error = String(payload.error || 'Voice download failed');
                    } else {
                        state.install = {
                            voiceId,
                            phase: String(payload.phase || 'download'),
                            received: Number(payload.received) || 0,
                            total: Number(payload.total) || 0
                        };
                    }
                    state.ready = state.installed.length > 0;
                    emitProgress({ ...state.install, phase: payload.phase, voiceId, error: payload.error });
                });
            })().catch(() => { progressListenerReady = null; });
            return progressListenerReady;
        };

        const refreshStatus = async () => {
            const plugin = getPlugin();
            if (!plugin?.ttsLocalStatus) {
                state.available = false;
                state.ready = false;
                state.checked = true;
                return { ...state, installed: [...state.installed] };
            }
            try {
                const info = await plugin.ttsLocalStatus();
                state.available = !!info?.available;
                state.installed = Array.isArray(info?.voices) ? info.voices.map(String) : [];
                state.ready = state.available && state.installed.length > 0;
                state.checked = true;
                await Promise.all([ensureStateListener(), ensureProgressListener()]);
            } catch (error) {
                state.available = false;
                state.ready = false;
                state.error = String(error?.message || error);
            }
            return { ...state, installed: [...state.installed] };
        };

        const getStatus = () => ({
            available: state.available,
            ready: state.ready,
            engineLabel: state.engineLabel,
            state: state.status,
            currentUtteranceId: state.currentUtteranceId,
            error: state.error,
            checked: state.checked,
            installed: [...state.installed],
            install: state.install ? { ...state.install } : null
        });

        const voices = () => VOICES.map((voice) => ({
            ...voice,
            installed: state.installed.includes(voice.id)
        }));

        const findVoice = (voiceId) => VOICES.find((voice) => voice.id === voiceId) || null;

        const install = async (voiceId) => {
            const plugin = getPlugin();
            if (!plugin?.ttsLocalDownload) throw new Error('Local TTS plugin unavailable');
            const voice = findVoice(voiceId);
            if (!voice) throw new Error(`Unknown voice: ${voiceId}`);
            if (state.installed.includes(voiceId)) return false;
            if (state.install) throw new Error('Another voice download is already running');
            await ensureProgressListener();
            state.error = '';
            state.install = { voiceId, phase: 'download', received: 0, total: 0 };
            try {
                if (voice.files && voice.files.length > 0) {
                    // Multi-file bundle (e.g. ZipVoice model archive + vocoder)
                    await plugin.ttsLocalDownload({ voiceId: voice.id, files: voice.files });
                } else {
                    await plugin.ttsLocalDownload({
                        voiceId: voice.id,
                        url: voice.url,
                        mirrorUrl: voice.mirrorUrl || ''
                    });
                }
            } catch (error) {
                state.install = null;
                throw error;
            }
            return true;
        };

        const cancelInstall = async () => {
            const plugin = getPlugin();
            if (!plugin?.ttsLocalDownloadCancel || !state.install) return;
            try { await plugin.ttsLocalDownloadCancel({ voiceId: state.install.voiceId }); } catch (_) { /* ignore */ }
        };

        const remove = async (voiceId) => {
            const plugin = getPlugin();
            if (!plugin?.ttsLocalDelete) throw new Error('Local TTS plugin unavailable');
            await plugin.ttsLocalDelete({ voiceId: String(voiceId || '') });
            state.installed = state.installed.filter((id) => id !== voiceId);
            state.ready = state.installed.length > 0;
        };

        const speak = async ({ text, voice = '', rate = 1, pitch = 1, referenceUri = '', referenceText = '' }) => {
            const plugin = getPlugin();
            if (!plugin?.ttsLocalSpeak) throw new Error('Local TTS plugin unavailable');
            const safeText = String(text || '').trim();
            if (!safeText) throw new Error('Nothing to speak');
            if (!state.installed.length) {
                if (!state.checked) await refreshStatus();
                if (!state.installed.length) throw new Error('No local voice installed');
            }
            await ensureStateListener();
            const utteranceId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
            state.currentUtteranceId = utteranceId;
            state.status = 'speaking';
            try {
                const params = {
                    text: safeText,
                    voiceId: String(voice || ''),
                    speed: Number(rate) || 1,
                    pitch: Number(pitch) || 1,
                    utteranceId
                };
                if (referenceUri) params.referenceUri = String(referenceUri);
                if (referenceText) params.referenceText = String(referenceText);
                await plugin.ttsLocalSpeak(params);
            } catch (error) {
                state.status = 'idle';
                state.currentUtteranceId = null;
                throw error;
            }
            emit({ utteranceId, state: 'start' });
            return utteranceId;
        };

        const stop = async () => {
            const plugin = getPlugin();
            const id = state.currentUtteranceId;
            state.currentUtteranceId = null;
            state.status = 'idle';
            if (plugin?.ttsLocalStop) {
                try { await plugin.ttsLocalStop(); } catch (_) { /* ignore stop errors */ }
            }
            if (id) emit({ utteranceId: id, state: 'stop' });
        };

        return Object.freeze({
            VOICES,
            getStatus,
            refreshStatus,
            voices,
            install,
            cancelInstall,
            remove,
            speak,
            stop,
            onState: (cb) => {
                if (typeof cb === 'function') listeners.add(cb);
                return () => listeners.delete(cb);
            },
            onProgress: (cb) => {
                if (typeof cb === 'function') progressListeners.add(cb);
                return () => progressListeners.delete(cb);
            },
            isAvailable: () => state.available
        });
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory();
    } else {
        globalThis.RPHLocalTts = factory();
    }
})();
