package com.roleplayhub.app;

import android.content.Context;
import android.media.AudioAttributes;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;

import java.util.Locale;
import java.util.Set;
import java.util.UUID;

/**
 * TTS 语音朗读插件（P0：Android 系统 TextToSpeech）。
 * 仅使用系统引擎，本地发音，无需联网与密钥。
 * JS 侧对应 assets/js/tts-engine.js（RPHTts）。
 */
@CapacitorPlugin(name = "TTSSpeech")
public class TTSSpeechPlugin extends Plugin implements TextToSpeech.OnInitListener {

    private static final String EVENT_STATE = "tts-state";

    private final Object initLock = new Object();
    private TextToSpeech tts;
    private boolean initialized = false;
    private boolean initFailed = false;

    @Override
    public void load() {
        super.load();
        ensureTts();
    }

    private void ensureTts() {
        synchronized (initLock) {
            if (tts != null) return;
            Context context = getContext();
            if (context == null) return;
            tts = new TextToSpeech(context.getApplicationContext(), this);
        }
    }

    private TextToSpeech readyTts() {
        synchronized (initLock) {
            return (initialized && !initFailed) ? tts : null;
        }
    }

    @PluginMethod
    public void ttsIsAvailable(PluginCall call) {
        JSObject result = new JSObject();
        boolean available = initialized && !initFailed && tts != null;
        result.put("available", available);
        result.put("engineLabel", available ? "系统 TTS" : "");
        result.put("pending", tts != null && !initialized && !initFailed);
        call.resolve(result);
    }

    @PluginMethod
    public void ttsGetVoices(PluginCall call) {
        JSONArray voices = new JSONArray();
        TextToSpeech engine = readyTts();
        if (engine != null) {
            try {
                Set<Voice> voiceSet = engine.getVoices();
                if (voiceSet != null) {
                    for (Voice voice : voiceSet) {
                        JSObject item = new JSObject();
                        item.put("id", voice.getName());
                        item.put("name", voice.getName());
                        Locale locale = voice.getLocale();
                        item.put("locale", locale != null ? locale.toLanguageTag() : "");
                        item.put("quality", voice.getQuality());
                        item.put("latency", voice.getLatency());
                        item.put("isNetwork", voice.isNetworkConnectionRequired());
                        voices.put(item);
                    }
                }
            } catch (Exception ignored) {
                // 部分引擎不暴露语音列表，返回空数组即可
            }
        }
        JSObject result = new JSObject();
        result.put("voices", voices);
        call.resolve(result);
    }

    @PluginMethod
    public void ttsSpeak(PluginCall call) {
        String text = call.getString("text");
        if (text == null || text.trim().isEmpty()) {
            call.reject("text is required");
            return;
        }
        TextToSpeech engine = readyTts();
        if (engine == null) {
            call.reject("系统语音引擎不可用或尚未初始化");
            return;
        }
        String utteranceId = call.getString("utteranceId");
        if (utteranceId == null || utteranceId.trim().isEmpty()) {
            utteranceId = UUID.randomUUID().toString();
        }
        float rate = clampFloat(call.getDouble("rate", 1.0), 0.1f, 2.0f);
        float pitch = clampFloat(call.getDouble("pitch", 1.0), 0.1f, 2.0f);
        String voiceName = call.getString("voice");
        try {
            engine.setSpeechRate(rate);
            engine.setPitch(pitch);
            if (voiceName != null && !voiceName.trim().isEmpty()) {
                Voice matched = findVoice(engine, voiceName.trim());
                if (matched != null) engine.setVoice(matched);
            }
            int result = engine.speak(text, TextToSpeech.QUEUE_FLUSH, null, utteranceId);
            if (result == TextToSpeech.ERROR) {
                call.reject("朗读启动失败");
                return;
            }
            JSObject ok = new JSObject();
            ok.put("utteranceId", utteranceId);
            call.resolve(ok);
        } catch (Exception error) {
            call.reject("TTS speak failed", error);
        }
    }

    @PluginMethod
    public void ttsStop(PluginCall call) {
        TextToSpeech engine = readyTts();
        if (engine != null) {
            try {
                engine.stop();
            } catch (Exception ignored) {
            }
        }
        call.resolve();
    }

    private Voice findVoice(TextToSpeech engine, String voiceName) {
        try {
            Set<Voice> voiceSet = engine.getVoices();
            if (voiceSet != null) {
                for (Voice voice : voiceSet) {
                    if (voiceName.equals(voice.getName())) return voice;
                }
                for (Voice voice : voiceSet) {
                    if (voice.getName() != null && voice.getName().contains(voiceName)) return voice;
                }
            }
        } catch (Exception ignored) {
        }
        return null;
    }

    private static float clampFloat(double value, float min, float max) {
        if (Double.isNaN(value)) return min;
        float v = (float) value;
        return Math.max(min, Math.min(max, v));
    }

    @Override
    public void onInit(int status) {
        synchronized (initLock) {
            if (status == TextToSpeech.SUCCESS) {
                initialized = true;
                initFailed = false;
                if (tts != null) {
                    tts.setAudioAttributes(new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_MEDIA)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                            .build());
                    tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                        @Override
                        public void onStart(String utteranceId) {
                            notifyState(utteranceId, "start", null);
                        }

                        @Override
                        public void onDone(String utteranceId) {
                            notifyState(utteranceId, "done", null);
                        }

                        @Override
                        @SuppressWarnings("deprecation")
                        public void onError(String utteranceId) {
                            notifyState(utteranceId, "error", "speech error");
                        }

                        @Override
                        public void onError(String utteranceId, int errorCode) {
                            notifyState(utteranceId, "error", "speech error code " + errorCode);
                        }

                        @Override
                        public void onStop(String utteranceId, boolean interrupted) {
                            notifyState(utteranceId, "stop", null);
                        }
                    });
                }
            } else {
                initialized = false;
                initFailed = true;
            }
        }
    }

    private void notifyState(String utteranceId, String state, String error) {
        if (utteranceId == null) return;
        JSObject payload = new JSObject();
        payload.put("utteranceId", utteranceId);
        payload.put("state", state);
        if (error != null) payload.put("error", error);
        notifyListeners(EVENT_STATE, payload);
    }

    @Override
    protected void handleOnDestroy() {
        synchronized (initLock) {
            if (tts != null) {
                try {
                    tts.stop();
                    tts.shutdown();
                } catch (Exception ignored) {
                }
                tts = null;
            }
            initialized = false;
            initFailed = false;
        }
        super.handleOnDestroy();
    }
}
