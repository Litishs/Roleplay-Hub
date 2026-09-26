package com.roleplayhub.app;

import org.json.JSONObject;

import java.io.File;
import java.io.FileWriter;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Writes the minimal last-crash record (diagnostics 4-layer plan, L1-A3).
 *
 * Privacy contract (AGENTS.md §2.4): type + truncated message + app version +
 * wall-clock time + uptime ONLY — no stack trace, no thread dump, no business
 * data.  Called right before process death, so every step is best-effort and
 * must never throw.
 */
final class CrashFileWriter {
    static final String FILE_NAME = "last-crash.json";
    static final String RENDER_PROCESS_GONE = "webview_render_process_gone";
    private static final int MESSAGE_MAX = 500;
    // Real app-start base, noted from MainActivity.onCreate.  Java initializes
    // statics lazily, so a class-load-time base would measure "time since the
    // first crash write" (observed as appUptimeMs=1 on device), not uptime.
    private static volatile Long startEpochMs;
    private static final Object START_LOCK = new Object();

    private CrashFileWriter() { }

    static void noteAppStart() {
        synchronized (START_LOCK) {
            if (startEpochMs == null) {
                startEpochMs = System.currentTimeMillis();
            }
        }
    }

    static void write(File filesDir, String type, String message,
                      String versionName, int versionCode) {
        try {
            long base = startEpochMs != null ? startEpochMs : System.currentTimeMillis();
            JSONObject json = new JSONObject();
            json.put("type", type == null ? "unknown" : type);
            String safeMessage = message == null ? "" : message;
            json.put("message", safeMessage.substring(0, Math.min(safeMessage.length(), MESSAGE_MAX)));
            json.put("versionName", versionName == null ? "" : versionName);
            json.put("versionCode", versionCode);
            json.put("occurredAt", new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(new Date()));
            json.put("appUptimeMs", System.currentTimeMillis() - base);
            File out = new File(filesDir, FILE_NAME);
            FileWriter writer = new FileWriter(out);
            writer.write(json.toString());
            writer.close();
        } catch (Throwable ignored) {
            // Crash bookkeeping must never throw, especially not during a crash.
        }
    }
}
