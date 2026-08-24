
        const getPlugin = () => (globalThis.Capacitor?.Plugins?.TTSSpeech) || null;

        const state = {
            status: 'idle',
            available: false,
            checked: false,
            engineLabel: '',
            error: '',
            currentUtteranceId: null,
            voices: [],
            voicesLoaded: false
        };

        const listeners = new Set();

        const emit = (payload) => {
            listeners.forEach((cb) => {
                try { cb(payload); } catch (_) { /* listener 异常不影响引擎 */ }
            });
        };

        let listenerReady = null;

        const ensureListener = () => {
            if (listenerReady) return listenerReady;
            listenerReady = (async () => {
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
                    if (payload.state === 'error') state.error = String(payload.error || '朗读失败');
                    emit(payload);
                });
            })().catch(() => { listenerReady = null; });
            return listenerReady;
        };

        const refreshStatus = async () => {
            const plugin = getPlugin();
            if (!plugin?.ttsIsAvailable) {
                state.available = false;
                state.engineLabel = '';
                state.checked = true;
                return { ...state };
            }
            try {
                const info = await plugin.ttsIsAvailable();
                state.available = !!info?.available;
                state.engineLabel = info?.engineLabel || '';
                state.checked = true;
                if (state.available) await ensureListener();
            } catch (error) {
                state.available = false;
                state.error = String(error?.message || error);
            }
            return { ...state };
        };

        const getStatus = () => ({
            available: state.available,
            engineLabel: state.engineLabel,
            state: state.status,
            currentUtteranceId: state.currentUtteranceId,
            error: state.error,
            checked: state.checked
        });

        const getVoices = async (force = false) => {
            const plugin = getPlugin();
            if (!plugin?.ttsGetVoices) return [];
            if (state.voicesLoaded && !force) return state.voices;
            const info = await plugin.ttsGetVoices();
            state.voices = Array.isArray(info?.voices) ? info.voices : [];
            state.voicesLoaded = true;
            return state.voices;
        };

        const speak = async ({ text, voice = '', rate = 1, pitch = 1 }) => {
            const plugin = getPlugin();
            if (!plugin?.ttsSpeak) throw new Error('TTS 原生插件不可用');
            const safeText = String(text || '').trim();
            if (!safeText) throw new Error('没有可朗读的文本');
            await ensureListener();
            const utteranceId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
            state.currentUtteranceId = utteranceId;
            state.status = 'speaking';
            try {
                await plugin.ttsSpeak({
                    text: safeText,
                    voice: String(voice || ''),
                    rate: Number(rate) || 1,
                    pitch: Number(pitch) || 1,
                    utteranceId
                });
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
            if (plugin?.ttsStop) {
                try { await plugin.ttsStop(); } catch (_) { /* 忽略停止异常 */ }
            }
            if (id) emit({ utteranceId: id, state: 'stop' });
        };

        const __exports = Object.freeze({
            getStatus,
            refreshStatus,
            getVoices,
            speak,
            stop,
            onState: (cb) => {
                if (typeof cb === 'function') listeners.add(cb);
                return () => listeners.delete(cb);
            },
            isAvailable: () => state.available
        });
    

export default __exports;


