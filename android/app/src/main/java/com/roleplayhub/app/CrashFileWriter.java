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
 * Privacy contract (AGENTS.md §2.4): type + reason + truncated message + app
 * version + wall-clock time + uptime ONLY — no stack trace, no thread dump,
 * no business data.  Called right before process death or renderer recovery,
 * so every step is best-effort and must never throw.
 */
final class CrashFileWriter {
    static final String FILE_NAME = "last-crash.json";
    static final String RENDER_PROCESS_GONE = "webview_render_process_gone";
    /** Renderer died inside its own code (a real bug) — surfaced via modal. */
    static final String REASON_CRASH = "crash";
    /** Android reclaimed the renderer of a backgrounded app (memory pressure) — not a bug; surfaced via toast. */
    static final String REASON_SYSTEM_KILL = "system_kill";
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
        write(filesDir, type, REASON_CRASH, message, versionName, versionCode);
    }

    static void write(File filesDir, String type, String reason, String message,
                      String versionName, int versionCode) {
        try {
            long base = startEpochMs != null ? startEpochMs : System.currentTimeMillis();
            JSONObject json = new JSONObject();
            json.put("type", type == null ? "unknown" : type);
            json.put("reason", reason == null ? REASON_CRASH : reason);
            String safeMessage = message == null ? "" : message;
            json.put("message", safeMessage.substring(0, Math.min(safeMessage.length(), MESSAGE_MAX)));
            json.put("versionName", versionName == null ? "" : versionName);
            json.put("versionCode", versionCode);
            json.put("occurredAt", new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(new Date()));
            json.put("appUptimeMs", System.currentTimeMillis() - base);
            // Atomic replace (temp file + rename): the recovery path relaunches
            // the activity right after this write, and a torn file would make
            // readLastCrash reject the whole record.
            File out = new File(filesDir, FILE_NAME);
            File tmp = new File(filesDir, FILE_NAME + ".tmp");
            FileWriter writer = new FileWriter(tmp);
            writer.write(json.toString());
            writer.close();
            if (!tmp.renameTo(out)) {
                out.delete();
                tmp.renameTo(out);
            }
        } catch (Throwable ignored) {
            // Crash bookkeeping must never throw, especially not during a crash.
        }
    }
}
