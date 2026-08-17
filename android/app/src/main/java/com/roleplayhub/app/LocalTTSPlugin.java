package com.roleplayhub.app;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.media.PlaybackParams;
import android.net.Uri;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.k2fsa.sherpa.onnx.GenerationConfig;
import com.k2fsa.sherpa.onnx.OfflineTts;
import com.k2fsa.sherpa.onnx.OfflineTtsConfig;
import com.k2fsa.sherpa.onnx.OfflineTtsModelConfig;
import com.k2fsa.sherpa.onnx.OfflineTtsVitsModelConfig;
import com.k2fsa.sherpa.onnx.OfflineTtsZipVoiceModelConfig;

import org.apache.commons.compress.archivers.tar.TarArchiveEntry;
import org.apache.commons.compress.archivers.tar.TarArchiveInputStream;
import org.apache.commons.compress.compressors.bzip2.BZip2CompressorInputStream;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.DigestOutputStream;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import kotlin.jvm.functions.Function1;

/**
 * LocalTTSPlugin -- on-device neural TTS (P2) backed by sherpa-onnx (onnxruntime).
 *
 * Voice models (VITS tar.bz2 bundles) are downloaded at runtime into
 * filesDir/tts-models/<voiceId>/ and never ship inside the APK. The OfflineTts
 * session is kept alive across utterances to avoid re-loading the model.
 *
 * JS counterpart: assets/js/tts-local-engine.js (RPHLocalTts).
 * Playback events reuse the "tts-state" event name and payload shape of
 * TTSSpeechPlugin so both engines look identical to the JS side.
 */
@CapacitorPlugin(name = "LocalTTS")
public class LocalTTSPlugin extends Plugin {

    private static final String EVENT_STATE = "tts-state";
    private static final String EVENT_MODEL = "tts-model";
    private static final int CONNECT_TIMEOUT_MS = 15000;
    private static final int READ_TIMEOUT_MS = 30000;
    private static final int PROGRESS_CHUNK_BYTES = 512 * 1024;

    private final Object ttsLock = new Object();
    private OfflineTts tts;
    private String loadedVoiceId;

    private final ExecutorService speakExecutor = Executors.newSingleThreadExecutor();
    private final ExecutorService downloadExecutor = Executors.newSingleThreadExecutor();

    // Playback state (touched by speak executor thread + bridge threads)
    private volatile boolean stopRequested;
    private volatile AudioTrack currentTrack;
    private volatile String currentUtteranceId;

    // Audio focus
    private AudioManager audioManager;
    private AudioFocusRequest focusRequest;

    // Download state
    private volatile boolean downloadCancelRequested;
    private volatile String activeDownloadVoice;

    // Reference clip cache for clone voices (decoded once per uri, reused across utterances)
    private final Object referenceLock = new Object();
    private String cachedReferenceUri;
    private float[] cachedReferenceSamples;
    private int cachedReferenceSampleRate;

    /** One downloadable file of a voice bundle. kind: "archive" (tar.bz2) or "raw" (single file). */
    private static class DownloadItem {
        final String url;
        final String mirrorUrl;
        final String kind;
        final String name;
        final String sha256;

        DownloadItem(String url, String mirrorUrl, String kind, String name, String sha256) {
            this.url = url;
            this.mirrorUrl = mirrorUrl;
            this.kind = kind;
            this.name = name;
            this.sha256 = sha256;
        }
    }

    private File modelsRoot() {
        Context context = getContext();
        if (context == null) return null;
        File root = new File(context.getFilesDir(), "tts-models");
        if (!root.exists()) root.mkdirs();
        return root;
    }

    private List<File> installedVoiceDirs() {
        List<File> dirs = new ArrayList<>();
        File root = modelsRoot();
        if (root == null) return dirs;
        File[] entries = root.listFiles(File::isDirectory);
        if (entries == null) return dirs;
        Arrays.sort(entries);
        for (File entry : entries) {
            if (entry.getName().endsWith(".tmp")) continue;
            if (new File(entry, "model.onnx").exists()) {
                dirs.add(entry);
            } else if (findOnnxFile(entry, "encoder") != null && findOnnxFile(entry, "decoder") != null) {
                dirs.add(entry);
            }
        }
        return dirs;
    }

    private File resolveVoiceDir(String voiceId) {
        File root = modelsRoot();
        if (root == null) return null;
        if (voiceId != null && !voiceId.trim().isEmpty()) {
            File dir = new File(root, voiceId.trim());
            if (new File(dir, "model.onnx").exists()) return dir;
            if (findOnnxFile(dir, "encoder") != null && findOnnxFile(dir, "decoder") != null) return dir;
            return null;
        }
        List<File> dirs = installedVoiceDirs();
        return dirs.isEmpty() ? null : dirs.get(0);
    }

    @PluginMethod
    public void ttsLocalStatus(PluginCall call) {
        List<File> dirs = installedVoiceDirs();
        JSArray voices = new JSArray();
        for (File dir : dirs) voices.put(dir.getName());
        JSObject result = new JSObject();
        result.put("available", true);
        result.put("ready", !dirs.isEmpty());
        result.put("voices", voices);
        synchronized (ttsLock) {
            result.put("voiceId", loadedVoiceId == null ? "" : loadedVoiceId);
        }
        call.resolve(result);
    }

    @PluginMethod
    public void ttsLocalListVoices(PluginCall call) {
        JSArray voices = new JSArray();
        for (File dir : installedVoiceDirs()) {
            JSObject item = new JSObject();
            item.put("id", dir.getName());
            item.put("sizeBytes", dirSize(dir));
            voices.put(item);
        }
        JSObject result = new JSObject();
        result.put("voices", voices);
        call.resolve(result);
    }

    @PluginMethod
    public void ttsLocalInit(PluginCall call) {
        String voiceId = call.getString("voiceId", "");
        downloadExecutor.execute(() -> {
            try {
                ensureSession(voiceId);
                call.resolve();
            } catch (Exception error) {
                call.reject("Local TTS init failed: " + error.getMessage(), error);
            }
        });
    }

    @PluginMethod
    public void ttsLocalDownload(PluginCall call) {
        String voiceId = call.getString("voiceId");
        if (voiceId == null || voiceId.trim().isEmpty()) {
            call.reject("voiceId is required");
            return;
        }
        List<DownloadItem> items = new ArrayList<>();
        JSArray files = call.getArray("files", null);
        if (files != null) {
            try {
                for (int i = 0; i < files.length(); i++) {
                    JSONObject file = files.getJSONObject(i);
                    String url = file.optString("url", "");
                    if (url.trim().isEmpty()) {
                        call.reject("every files entry needs a url");
                        return;
                    }
                    items.add(new DownloadItem(
                            url.trim(),
                            file.optString("mirrorUrl", "").trim(),
                            file.optString("kind", "archive"),
                            file.optString("name", "").trim(),
                            file.optString("sha256", "").trim()));
                }
            } catch (Exception error) {
                call.reject("Invalid files payload: " + error.getMessage(), error);
                return;
            }
        } else {
            String url = call.getString("url");
            if (url == null || url.trim().isEmpty()) {
                call.reject("url or files is required");
                return;
            }
            items.add(new DownloadItem(
                    url.trim(),
                    call.getString("mirrorUrl", "").trim(),
                    "archive",
                    "",
                    call.getString("sha256", "").trim()));
        }
        if (items.isEmpty()) {
            call.reject("files must not be empty");
            return;
        }
        if (activeDownloadVoice != null) {
            call.reject("Another voice download is already running");
            return;
        }
        downloadExecutor.execute(() -> downloadJob(voiceId.trim(), items));
        JSObject result = new JSObject();
        result.put("started", true);
        call.resolve(result);
    }

    @PluginMethod
    public void ttsLocalDownloadCancel(PluginCall call) {
        downloadCancelRequested = true;
        call.resolve();
    }

    @PluginMethod
    public void ttsLocalDelete(PluginCall call) {
        String voiceId = call.getString("voiceId");
        if (voiceId == null || voiceId.trim().isEmpty()) {
            call.reject("voiceId is required");
            return;
        }
        String trimmed = voiceId.trim();
        downloadExecutor.execute(() -> {
            try {
                synchronized (ttsLock) {
                    if (trimmed.equals(loadedVoiceId)) releaseSessionLocked();
                }
                deleteRecursive(new File(modelsRoot(), trimmed));
                deleteRecursive(new File(modelsRoot(), trimmed + ".tmp"));
                call.resolve();
            } catch (Exception error) {
                call.reject("Delete failed: " + error.getMessage(), error);
            }
        });
    }

    @PluginMethod
    public void ttsLocalSpeak(PluginCall call) {
        String text = call.getString("text");
        if (text == null || text.trim().isEmpty()) {
            call.reject("text is required");
            return;
        }
        String voiceId = call.getString("voiceId", "");
        String utteranceId = call.getString("utteranceId");
        if (utteranceId == null || utteranceId.trim().isEmpty()) {
            utteranceId = UUID.randomUUID().toString();
        }
        float speed = clampFloat(call.getDouble("speed", 1.0), 0.25f, 4.0f);
        float pitch = clampFloat(call.getDouble("pitch", 1.0), 0.5f, 2.0f);
        String referenceUri = call.getString("referenceUri", "");
        String referenceText = call.getString("referenceText", "");

        // Interrupt any active playback first (QUEUE_FLUSH semantics).
        stopRequested = true;
        AudioTrack track = currentTrack;
        if (track != null) {
            try { track.pause(); track.flush(); } catch (Exception ignored) { }
        }

        final String finalText = text;
        final String finalVoiceId = voiceId;
        final String finalUtteranceId = utteranceId;
        final float finalSpeed = speed;
        final float finalPitch = pitch;
        final String finalReferenceUri = referenceUri;
        final String finalReferenceText = referenceText;
        speakExecutor.execute(() -> speakJob(finalText, finalVoiceId, finalSpeed, finalPitch, finalUtteranceId,
                finalReferenceUri, finalReferenceText));

        JSObject result = new JSObject();
        result.put("utteranceId", utteranceId);
        call.resolve(result);
    }

    @PluginMethod
    public void ttsLocalStop(PluginCall call) {
        stopRequested = true;
        AudioTrack track = currentTrack;
        if (track != null) {
            try { track.pause(); track.flush(); } catch (Exception ignored) { }
        }
        call.resolve();
    }

    @PluginMethod
    public void ttsLocalClearReference(PluginCall call) {
        invalidateReferenceCache();
        call.resolve();
    }

    // ---------- session management ----------

    private void ensureSession(String voiceId) throws IOException {
        File dir = resolveVoiceDir(voiceId);
        if (dir == null) {
            throw new IOException(voiceId == null || voiceId.trim().isEmpty()
                    ? "No voice model installed" : "Voice not installed: " + voiceId);
        }
        synchronized (ttsLock) {
            if (tts != null && dir.getName().equals(loadedVoiceId)) return;
            releaseSessionLocked();
            tts = createSession(dir);
            loadedVoiceId = dir.getName();
        }
    }

    private OfflineTts createSession(File dir) throws IOException {
        // ZipVoice bundles carry encoder/decoder onnx files; VITS bundles a single model.onnx
        File encoder = findOnnxFile(dir, "encoder");
        File decoder = findOnnxFile(dir, "decoder");
        if (encoder != null && decoder != null) {
            return createZipVoiceSession(dir, encoder, decoder);
        }
        return createVitsSession(dir);
    }

    private static File findOnnxFile(File dir, String... prefixes) {
        File[] files = dir.listFiles((parent, name) -> {
            if (!name.endsWith(".onnx")) return false;
            for (String prefix : prefixes) {
                if (name.startsWith(prefix)) return true;
            }
            return false;
        });
        if (files == null || files.length == 0) return null;
        for (String prefix : prefixes) {
            for (File file : files) {
                if (file.getName().equals(prefix + ".onnx")) return file;
            }
        }
        Arrays.sort(files);
        return files[0];
    }

    private OfflineTts createVitsSession(File dir) throws IOException {
        OfflineTtsVitsModelConfig vits = new OfflineTtsVitsModelConfig();
        vits.setModel(new File(dir, "model.onnx").getAbsolutePath());
        vits.setTokens(new File(dir, "tokens.txt").getAbsolutePath());
        File lexicon = new File(dir, "lexicon.txt");
        if (lexicon.exists()) vits.setLexicon(lexicon.getAbsolutePath());
        File dictDir = new File(dir, "dict");
        if (dictDir.isDirectory()) vits.setDictDir(dictDir.getAbsolutePath());
        File espeakData = new File(dir, "espeak-ng-data");
        if (espeakData.isDirectory()) vits.setDataDir(espeakData.getAbsolutePath());

        OfflineTtsModelConfig model = new OfflineTtsModelConfig();
        model.setVits(vits);
        model.setNumThreads(2);
        model.setDebug(false);
        model.setProvider("cpu");

        OfflineTtsConfig config = new OfflineTtsConfig();
        config.setModel(model);
        File ruleFst = new File(dir, "rule.fst");
        if (ruleFst.exists()) config.setRuleFsts(ruleFst.getAbsolutePath());
        File ruleFar = new File(dir, "rule.far");
        if (ruleFar.exists()) config.setRuleFars(ruleFar.getAbsolutePath());
        // One sentence per callback chunk keeps the first-word latency low.
        config.setMaxNumSentences(1);

        try {
            // null assetManager makes sherpa-onnx resolve paths from the filesystem.
            return new OfflineTts(null, config);
        } catch (Throwable error) {
            throw new IOException("Failed to load voice model: " + error.getMessage(), error);
        }
    }

    private OfflineTts createZipVoiceSession(File dir, File encoder, File decoder) throws IOException {
        File vocoder = findOnnxFile(dir, "vocoder", "vocos");
        if (vocoder == null) {
            throw new IOException("Clone voice bundle is missing the vocoder (vocoder.onnx or vocos_24khz.onnx)");
        }
        OfflineTtsZipVoiceModelConfig zip = new OfflineTtsZipVoiceModelConfig();
        zip.setTokens(new File(dir, "tokens.txt").getAbsolutePath());
        zip.setEncoder(encoder.getAbsolutePath());
        zip.setDecoder(decoder.getAbsolutePath());
        zip.setVocoder(vocoder.getAbsolutePath());
        File espeakData = new File(dir, "espeak-ng-data");
        if (espeakData.isDirectory()) zip.setDataDir(espeakData.getAbsolutePath());
        File lexicon = new File(dir, "lexicon.txt");
        if (lexicon.exists()) zip.setLexicon(lexicon.getAbsolutePath());

        OfflineTtsModelConfig model = new OfflineTtsModelConfig();
        model.setZipvoice(zip);
        model.setNumThreads(2);
        model.setDebug(false);
        model.setProvider("cpu");

        OfflineTtsConfig config = new OfflineTtsConfig();
        config.setModel(model);
        config.setMaxNumSentences(1);

        try {
            return new OfflineTts(null, config);
        } catch (Throwable error) {
            throw new IOException("Failed to load clone voice model: " + error.getMessage(), error);
        }
    }

    private void releaseSessionLocked() {
        if (tts != null) {
            try { tts.release(); } catch (Exception ignored) { }
            tts = null;
        }
        loadedVoiceId = null;
    }

    // ---------- reference audio decoding & cache ----------

    /**
     * Decode an audio file (any format supported by MediaExtractor) into 24 kHz mono
     * PCM float samples. The result is cached under {@code referenceLock}; call
     * {@link #invalidateReferenceCache()} when the uri changes or the clip is deleted.
     */
    private float[] ensureReferenceSamples(String uri) throws IOException {
        synchronized (referenceLock) {
            if (uri.equals(cachedReferenceUri) && cachedReferenceSamples != null) {
                return cachedReferenceSamples;
            }
        }

        File file = null;
        if (!uri.startsWith("content://")) {
            file = resolveContentFile(uri);
            if (file == null || !file.exists()) {
                throw new IOException("Reference audio file not found: " + uri);
            }
        }

        MediaExtractor extractor = null;
        MediaCodec codec = null;
        try {
            extractor = new MediaExtractor();
            if (uri.startsWith("content://")) {
                extractor.setDataSource(getContext(), Uri.parse(uri), null);
            } else {
                extractor.setDataSource(file.getAbsolutePath());
            }

            int trackIndex = -1;
            MediaFormat format = null;
            for (int i = 0; i < extractor.getTrackCount(); i++) {
                MediaFormat fmt = extractor.getTrackFormat(i);
                String mime = fmt.getString(MediaFormat.KEY_MIME);
                if (mime != null && mime.startsWith("audio/")) {
                    trackIndex = i;
                    format = fmt;
                    break;
                }
            }
            if (trackIndex < 0 || format == null) {
                throw new IOException("No audio track found in reference file");
            }

            extractor.selectTrack(trackIndex);

            String mime = format.getString(MediaFormat.KEY_MIME);
            codec = MediaCodec.createDecoderByType(mime);
            codec.configure(format, null, null, 0);
            codec.start();

            ByteArrayOutputStream rawPcm = new ByteArrayOutputStream();
            MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
            int inputSampleRate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE);
            int inputChannels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT);
            int inputBitsPerSample = 16; // default assumption
            if (format.containsKey(MediaFormat.KEY_PCM_ENCODING)) {
                inputBitsPerSample = format.getInteger(MediaFormat.KEY_PCM_ENCODING) & 0xFF;
            }

            long timeoutUs = 10000L;
            while (true) {
                int inputIdx = codec.dequeueInputBuffer(timeoutUs);
                if (inputIdx >= 0) {
                    int sampleFlags = extractor.getSampleFlags();
                    int size = (int) extractor.getSampleSize();
                    if (size <= 0) {
                        codec.queueInputBuffer(inputIdx, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM);
                    } else {
                        java.nio.ByteBuffer buf = codec.getInputBuffer(inputIdx);
                        if (buf != null) {
                            buf.clear();
                            int read = extractor.readSampleData(buf, 0);
                            long pts = extractor.getSampleTime();
                            codec.queueInputBuffer(inputIdx, 0, read, pts,
                                    ((sampleFlags & MediaExtractor.SAMPLE_FLAG_LAST_SAMPLE) != 0
                                            ? MediaCodec.BUFFER_FLAG_END_OF_STREAM : 0));
                        }
                        extractor.advance();
                    }
                }

                int outputIdx = codec.dequeueOutputBuffer(info, timeoutUs);
                if (outputIdx >= 0) {
                    if ((info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) {
                        java.nio.ByteBuffer buf = codec.getOutputBuffer(outputIdx);
                        if (buf != null && info.size > 0) {
                            byte[] chunk = new byte[info.size];
                            buf.position(info.offset);
                            buf.get(chunk);
                            rawPcm.write(chunk);
                        }
                        codec.releaseOutputBuffer(outputIdx, false);
                        break;
                    }
                    if (info.size > 0) {
                        java.nio.ByteBuffer buf = codec.getOutputBuffer(outputIdx);
                        if (buf != null) {
                            byte[] chunk = new byte[info.size];
                            buf.position(info.offset);
                            buf.get(chunk);
                            rawPcm.write(chunk);
                        }
                    }
                    codec.releaseOutputBuffer(outputIdx, false);
                } else if (outputIdx == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                    MediaFormat outFormat = codec.getOutputFormat();
                    if (outFormat.containsKey(MediaFormat.KEY_SAMPLE_RATE)) {
                        inputSampleRate = outFormat.getInteger(MediaFormat.KEY_SAMPLE_RATE);
                    }
                    if (outFormat.containsKey(MediaFormat.KEY_CHANNEL_COUNT)) {
                        inputChannels = outFormat.getInteger(MediaFormat.KEY_CHANNEL_COUNT);
                    }
                    if (outFormat.containsKey(MediaFormat.KEY_PCM_ENCODING)) {
                        inputBitsPerSample = outFormat.getInteger(MediaFormat.KEY_PCM_ENCODING) & 0xFF;
                    }
                }
            }

            codec.stop();
            codec.release();
            codec = null;
            extractor.release();
            extractor = null;

            byte[] rawBytes = rawPcm.toByteArray();
            int bytesPerSample = inputBitsPerSample <= 8 ? 1 : 2;

            // Convert raw PCM bytes to float array [-1, 1]
            float[] samples;
            if (bytesPerSample == 1) {
                samples = new float[rawBytes.length];
                for (int i = 0; i < rawBytes.length; i++) {
                    samples[i] = ((rawBytes[i] & 0xFF) - 128) / 128.0f;
                }
            } else {
                // 16-bit signed little-endian (most common PCM output)
                samples = new float[rawBytes.length / 2];
                for (int i = 0; i < samples.length; i++) {
                    int lo = rawBytes[i * 2] & 0xFF;
                    int hi = rawBytes[i * 2 + 1] & 0xFF;
                    samples[i] = ((hi << 8 | lo) < 0 ? (short)(hi << 8 | lo) : (short)(hi << 8 | lo)) / 32768.0f;
                }
            }

            // Mix down to mono if multi-channel
            if (inputChannels > 1) {
                int frames = samples.length / inputChannels;
                float[] mono = new float[frames];
                for (int i = 0; i < frames; i++) {
                    float sum = 0;
                    for (int ch = 0; ch < inputChannels; ch++) {
                        sum += samples[i * inputChannels + ch];
                    }
                    mono[i] = sum / inputChannels;
                }
                samples = mono;
            }

            // Resample to 24 kHz using linear interpolation
            float[] resampled = resample24k(samples, inputSampleRate);

            synchronized (referenceLock) {
                cachedReferenceUri = uri;
                cachedReferenceSamples = resampled;
                cachedReferenceSampleRate = 24000;
            }
            return resampled;
        } catch (IOException error) {
            throw error;
        } catch (Exception error) {
            throw new IOException("Failed to decode reference audio: " + error.getMessage(), error);
        } finally {
            if (codec != null) {
                try { codec.stop(); codec.release(); } catch (Exception ignored) { }
            }
            if (extractor != null) {
                try { extractor.release(); } catch (Exception ignored) { }
            }
        }
    }

    /** Simple linear-interpolation resampler targeting 24 kHz. */
    private static float[] resample24k(float[] samples, int fromRate) {
        if (fromRate <= 0) fromRate = 1;
        if (fromRate == 24000) return samples;
        double ratio = 24000.0 / fromRate;
        int outLen = (int) Math.ceil(samples.length * ratio);
        float[] out = new float[outLen];
        for (int i = 0; i < outLen; i++) {
            double srcIdx = i / ratio;
            int lo = (int) Math.floor(srcIdx);
            int hi = Math.min(lo + 1, samples.length - 1);
            float frac = (float) (srcIdx - lo);
            out[i] = samples[lo] + frac * (samples[hi] - samples[lo]);
        }
        return out;
    }

    /** Resolve a uri string (file:// or relative media path) to a File. */
    private File resolveContentFile(String uri) {
        if (uri.startsWith("file://")) {
            return new File(Uri.parse(uri).getPath());
        }
        // Treat as a relative path under filesDir/media/
        File mediaDir = new File(getContext().getFilesDir(), "media");
        return new File(mediaDir, uri);
    }

    /** Invalidate the cached reference audio (e.g. when the clip is deleted or uri changes). */
    private void invalidateReferenceCache() {
        synchronized (referenceLock) {
            cachedReferenceUri = null;
            cachedReferenceSamples = null;
            cachedReferenceSampleRate = 0;
        }
    }

    // ---------- playback ----------

    private void speakJob(String text, String voiceId, float speed, float pitch, String utteranceId,
                          String referenceUri, String referenceText) {
        currentUtteranceId = utteranceId;
        stopRequested = false;
        AudioTrack track = null;
        boolean focusGranted = false;
        try {
            ensureSession(voiceId);
            OfflineTts session;
            synchronized (ttsLock) {
                session = tts;
            }
            if (session == null) throw new IOException("TTS session unavailable");

            // Clone voices need the reference clip + exact transcript per call.
            GenerationConfig generationConfig = null;
            if (referenceUri != null && !referenceUri.trim().isEmpty()) {
                if (referenceText == null || referenceText.trim().isEmpty()) {
                    throw new IOException("Reference transcript is required for clone voice");
                }
                float[] reference = ensureReferenceSamples(referenceUri.trim());
                generationConfig = new GenerationConfig();
                generationConfig.setSpeed(speed);
                generationConfig.setReferenceAudio(reference);
                generationConfig.setReferenceSampleRate(cachedReferenceSampleRate);
                generationConfig.setReferenceText(referenceText.trim());
                generationConfig.setNumSteps(4);
                Map<String, String> extra = new HashMap<>();
                extra.put("min_char_in_sentence", "10");
                generationConfig.setExtra(extra);
            }

            int sampleRate = session.sampleRate();
            int minBytes = AudioTrack.getMinBufferSize(sampleRate, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_FLOAT);
            track = new AudioTrack.Builder()
                    .setAudioAttributes(new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_MEDIA)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                            .build())
                    .setAudioFormat(new AudioFormat.Builder()
                            .setEncoding(AudioFormat.ENCODING_PCM_FLOAT)
                            .setSampleRate(sampleRate)
                            .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                            .build())
                    .setTransferMode(AudioTrack.MODE_STREAM)
                    .setBufferSizeInBytes(Math.max(minBytes * 2, sampleRate * 4))
                    .build();
            currentTrack = track;
            focusGranted = requestFocus();
            track.setVolume(1f);

            final AudioTrack finalTrack = track;
            final float finalPitch = pitch;
            Function1<float[], Integer> callback = samples -> {
                if (stopRequested) return 1;
                if (samples == null || samples.length == 0) return 0;
                try {
                    if (finalTrack.getPlayState() != AudioTrack.PLAYSTATE_PLAYING) {
                        finalTrack.play();
                        if (Math.abs(finalPitch - 1f) > 0.01f) {
                            PlaybackParams params = finalTrack.getPlaybackParams();
                            params.setPitch(clampFloat(finalPitch, 0.5f, 2.0f));
                            finalTrack.setPlaybackParams(params);
                        }
                    }
                    int offset = 0;
                    while (offset < samples.length) {
                        if (stopRequested) return 1;
                        int written = finalTrack.write(samples, offset, samples.length - offset, AudioTrack.WRITE_BLOCKING);
                        if (written < 0) return 1;
                        offset += written;
                    }
                } catch (Exception ignored) {
                    return 1;
                }
                return stopRequested ? 1 : 0;
            };

            notifyState(utteranceId, "start", null);
            if (generationConfig != null) {
                session.generateWithConfigAndCallback(text, generationConfig, callback);
            } else {
                session.generateWithCallback(text, 0, speed, callback);
            }

            if (stopRequested) {
                notifyState(utteranceId, "stop", null);
            } else {
                try { track.stop(); } catch (Exception ignored) { } // drain remaining buffered audio
                notifyState(utteranceId, "done", null);
            }
        } catch (Throwable error) {
            notifyState(utteranceId, "error", String.valueOf(error.getMessage()));
        } finally {
            if (track != null) {
                try { track.release(); } catch (Exception ignored) { }
            }
            if (currentTrack == track) currentTrack = null;
            if (focusGranted) abandonFocus();
            if (utteranceId.equals(currentUtteranceId)) currentUtteranceId = null;
        }
    }

    private boolean requestFocus() {
        try {
            if (audioManager == null) {
                audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
            }
            if (audioManager == null) return false;
            if (focusRequest == null) {
                focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                        .setAudioAttributes(new AudioAttributes.Builder()
                                .setUsage(AudioAttributes.USAGE_MEDIA)
                                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                                .build())
                        .build();
            }
            return audioManager.requestAudioFocus(focusRequest) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
        } catch (Exception ignored) {
            return false;
        }
    }

    private void abandonFocus() {
        try {
            if (audioManager != null && focusRequest != null) {
                audioManager.abandonAudioFocusRequest(focusRequest);
            }
        } catch (Exception ignored) { }
    }

    // ---------- download & extraction ----------

    private void downloadJob(String voiceId, List<DownloadItem> items) {
        activeDownloadVoice = voiceId;
        downloadCancelRequested = false;
        File tmpRoot = new File(modelsRoot(), voiceId + ".tmp");
        try {
            deleteRecursive(tmpRoot);
            if (!tmpRoot.mkdirs()) throw new IOException("Cannot create temp dir");
            File finalDir = new File(tmpRoot, "final");
            if (!finalDir.mkdirs()) throw new IOException("Cannot create staging dir");

            // Progress is cumulative across files so the UI bar stays monotonic.
            long baseBytes = 0;
            for (DownloadItem item : items) {
                boolean isRaw = "raw".equalsIgnoreCase(item.kind);
                String fileName = isRaw
                        ? (item.name.isEmpty() ? nameFromUrl(item.url) : item.name)
                        : "download.tar.bz2";
                File downloaded = new File(tmpRoot, fileName);
                boolean ok = downloadTo(item.url, voiceId, downloaded, item.sha256, baseBytes);
                if (!ok && !downloadCancelRequested && !item.mirrorUrl.isEmpty()) {
                    ok = downloadTo(item.mirrorUrl, voiceId, downloaded, item.sha256, baseBytes);
                }
                if (!ok) {
                    if (downloadCancelRequested) {
                        notifyModel(voiceId, "cancelled", 0, 0, null);
                        return;
                    }
                    throw new IOException("Download failed: " + item.url);
                }
                baseBytes += downloaded.length();

                if (isRaw) {
                    copyFile(downloaded, new File(finalDir, downloaded.getName()));
                } else {
                    notifyModel(voiceId, "extract", baseBytes, baseBytes, null);
                    File extractDir = new File(tmpRoot, "extract-" + fileName);
                    if (!extractDir.mkdirs()) throw new IOException("Cannot create extract dir");
                    extractTarBz2(downloaded, extractDir);
                    File modelRoot = resolveModelRoot(extractDir);
                    File[] entries = modelRoot.listFiles();
                    if (entries == null || entries.length == 0) {
                        throw new IOException("Archive is empty: " + item.url);
                    }
                    for (File entry : entries) {
                        File target = new File(finalDir, entry.getName());
                        if (target.exists()) deleteRecursive(target);
                        if (!entry.renameTo(target)) {
                            throw new IOException("Cannot move extracted file: " + entry.getName());
                        }
                    }
                }
            }

            boolean hasVits = new File(finalDir, "model.onnx").exists();
            boolean hasZipVoice = findOnnxFile(finalDir, "encoder") != null
                    && findOnnxFile(finalDir, "decoder") != null
                    && findOnnxFile(finalDir, "vocoder", "vocos") != null;
            if (!hasVits && !hasZipVoice) {
                throw new IOException("Downloaded bundle contains no voice model");
            }
            File target = new File(modelsRoot(), voiceId);
            deleteRecursive(target);
            if (!finalDir.renameTo(target)) {
                throw new IOException("Cannot move extracted model into place");
            }
            deleteRecursive(tmpRoot);
            notifyModel(voiceId, "done", 0, 0, null);
        } catch (Exception error) {
            deleteRecursive(tmpRoot);
            if (downloadCancelRequested) {
                notifyModel(voiceId, "cancelled", 0, 0, null);
            } else {
                notifyModel(voiceId, "error", 0, 0, String.valueOf(error.getMessage()));
            }
        } finally {
            activeDownloadVoice = null;
            downloadCancelRequested = false;
        }
    }

    /** @return true when the file was fully downloaded (and hash-verified when given). */
    private boolean downloadTo(String url, String voiceId, File target, String expectedSha256, long baseBytes) {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(url).openConnection();
            connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
            connection.setReadTimeout(READ_TIMEOUT_MS);
            connection.setInstanceFollowRedirects(true);
            int status = connection.getResponseCode();
            if (status != HttpURLConnection.HTTP_OK) {
                return false;
            }
            long contentLength = connection.getContentLengthLong();
            long total = contentLength > 0 ? baseBytes + contentLength : 0;
            MessageDigest digest = (expectedSha256 == null || expectedSha256.isEmpty())
                    ? null : MessageDigest.getInstance("SHA-256");
            long received = baseBytes;
            long lastNotify = baseBytes;
            OutputStream sink = new FileOutputStream(target);
            DigestOutputStream digestOut = (digest != null)
                    ? new DigestOutputStream(sink, digest)
                    : new DigestOutputStream(sink, MessageDigest.getInstance("SHA-256"));
            try (InputStream input = connection.getInputStream()) {
                byte[] buffer = new byte[64 * 1024];
                int read;
                while ((read = input.read(buffer)) != -1) {
                    if (downloadCancelRequested) {
                        return false;
                    }
                    digestOut.write(buffer, 0, read);
                    received += read;
                    if (received - lastNotify >= PROGRESS_CHUNK_BYTES) {
                        lastNotify = received;
                        notifyModel(voiceId, "download", received, total, null);
                    }
                }
                notifyModel(voiceId, "download", received, received, null);
            } finally {
                try { digestOut.flush(); digestOut.close(); } catch (Exception ignored) { }
            }
            if (digest != null) {
                String actual = toHex(digest.digest());
                if (!actual.equalsIgnoreCase(expectedSha256.trim())) {
                    return false;
                }
            }
            return true;
        } catch (Exception error) {
            return false;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private void extractTarBz2(File archive, File targetDir) throws IOException {
        try (TarArchiveInputStream input = new TarArchiveInputStream(
                new BZip2CompressorInputStream(new BufferedInputStream(new FileInputStream(archive))))) {
            String rootPath = targetDir.getCanonicalPath() + File.separator;
            TarArchiveEntry entry;
            while ((entry = input.getNextTarEntry()) != null) {
                File outFile = new File(targetDir, entry.getName());
                if (!outFile.getCanonicalPath().startsWith(rootPath)) {
                    throw new IOException("Blocked archive entry outside target dir: " + entry.getName());
                }
                if (entry.isDirectory()) {
                    outFile.mkdirs();
                } else {
                    outFile.getParentFile().mkdirs();
                    try (OutputStream output = new FileOutputStream(outFile)) {
                        input.transferTo(output);
                    }
                }
            }
        }
    }

    /** Bundles usually contain a single top-level dir; unwrap it when present. */
    private File resolveModelRoot(File extractDir) throws IOException {
        File[] entries = extractDir.listFiles();
        if (entries != null && entries.length == 1 && entries[0].isDirectory()) {
            return entries[0];
        }
        return extractDir;
    }

    // ---------- events & helpers ----------

    private void notifyState(String utteranceId, String state, String error) {
        if (utteranceId == null) return;
        JSObject payload = new JSObject();
        payload.put("utteranceId", utteranceId);
        payload.put("state", state);
        if (error != null) payload.put("error", error);
        notifyListeners(EVENT_STATE, payload);
    }

    private void notifyModel(String voiceId, String phase, long received, long total, String error) {
        if (voiceId == null) return;
        JSObject payload = new JSObject();
        payload.put("voiceId", voiceId);
        payload.put("phase", phase);
        payload.put("received", received);
        payload.put("total", total);
        if (error != null) payload.put("error", error);
        notifyListeners(EVENT_MODEL, payload);
    }

    private static void deleteRecursive(File file) {
        if (file == null || !file.exists()) return;
        File[] children = file.listFiles();
        if (children != null) {
            for (File child : children) deleteRecursive(child);
        }
        //noinspection ResultOfMethodCallIgnored
        file.delete();
    }

    private static long dirSize(File dir) {
        long size = 0;
        File[] children = dir.listFiles();
        if (children == null) return 0;
        for (File child : children) {
            size += child.isDirectory() ? dirSize(child) : child.length();
        }
        return size;
    }

    private static String toHex(byte[] bytes) {
        StringBuilder builder = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) {
            builder.append(Character.forDigit((b >> 4) & 0xF, 16));
            builder.append(Character.forDigit(b & 0xF, 16));
        }
        return builder.toString();
    }

    private static float clampFloat(double value, float min, float max) {
        if (Double.isNaN(value)) return min;
        float v = (float) value;
        return Math.max(min, Math.min(max, v));
    }

    private static String nameFromUrl(String url) {
        int slash = url.lastIndexOf('/');
        String candidate = (slash >= 0 ? url.substring(slash + 1) : url);
        int query = candidate.indexOf('?');
        return (query >= 0 ? candidate.substring(0, query) : candidate);
    }

    private static void copyFile(File src, File dst) throws IOException {
        try (InputStream in = new FileInputStream(src); OutputStream out = new FileOutputStream(dst)) {
            byte[] buf = new byte[64 * 1024];
            int read;
            while ((read = in.read(buf)) != -1) out.write(buf, 0, read);
        }
    }

    @Override
    protected void handleOnDestroy() {
        stopRequested = true;
        AudioTrack track = currentTrack;
        if (track != null) {
            try { track.pause(); track.release(); } catch (Exception ignored) { }
            currentTrack = null;
        }
        synchronized (ttsLock) {
            releaseSessionLocked();
        }
        abandonFocus();
        speakExecutor.shutdownNow();
        downloadExecutor.shutdownNow();
        try {
            speakExecutor.awaitTermination(2, TimeUnit.SECONDS);
        } catch (InterruptedException ignored) {
            Thread.currentThread().interrupt();
        }
        super.handleOnDestroy();
    }
}
