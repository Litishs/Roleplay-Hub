package com.roleplayhub.app;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.ViewParent;
import android.view.ViewGroup;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;

import java.io.File;

/**
 * Handles WebView render-process death (diagnostics 4-layer plan, L1-A4).
 *
 * Android kills the renderer of a long-backgrounded app under memory
 * pressure. Returning false (the previous behavior) terminated the whole
 * process and the user faced a blocking "abnormal exit" modal on the next
 * launch. Now the client writes the crash record (with a crash/system_kill
 * reason) and recreates the activity — a fresh Capacitor bridge reloads the
 * app from local storage, restoring the last session in place. A
 * SharedPreferences sliding-window rate limiter stops recovery loops: too
 * many renderer deaths within a short window fall back to the default
 * termination (process death + next-launch notice). Every other callback is
 * inherited untouched so Capacitor's URL routing and iframe handling stay
 * exactly as shipped.
 */
public class CrashReportingWebViewClient extends BridgeWebViewClient {
    private static final String RECOVERY_PREFS = "render_recovery";
    private static final String RECOVERY_TIMESTAMPS = "timestamps";
    /** Recovery attempts allowed inside the sliding window. */
    private static final int MAX_RECOVERIES_IN_WINDOW = 3;
    private static final long RECOVERY_WINDOW_MS = 90_000L;
    /** Delay before recreating the activity; grows with each retry in the window so memory pressure can pass. */
    private static final long RECOVERY_BACKOFF_MS = 1_500L;
    private static final long RECOVERY_BACKOFF_MAX_MS = 5_000L;

    private final File filesDir;
    private final String versionName;
    private final int versionCode;
    private final Activity activity;

    public CrashReportingWebViewClient(Bridge bridge, File filesDir,
                                       String versionName, int versionCode, Activity activity) {
        super(bridge);
        this.filesDir = filesDir;
        this.versionName = versionName;
        this.versionCode = versionCode;
        this.activity = activity;
    }

    @Override
    public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
        boolean crashed = detail != null && detail.didCrash();
        String reason = crashed ? CrashFileWriter.REASON_CRASH : CrashFileWriter.REASON_SYSTEM_KILL;
        String message = crashed
                ? "WebView render process crashed"
                : "WebView render process was killed by the system";
        CrashFileWriter.write(filesDir, CrashFileWriter.RENDER_PROCESS_GONE, reason, message, versionName, versionCode);
        try {
            if (activity == null || activity.isFinishing()) {
                return false;
            }
            int attempts = registerRecoveryAttempt();
            if (attempts < 0) {
                // Recovery would just loop (persistent memory pressure or a
                // crashing page): fall back to process death; the next launch
                // shows the crash notice as before.
                return false;
            }
            // The dead WebView must leave the hierarchy (its renderer is gone);
            // the activity recreation below destroys it with the whole tree.
            ViewParent parent = view.getParent();
            if (parent instanceof ViewGroup) {
                ((ViewGroup) parent).removeView(view);
            }
            long delay = Math.min(Math.max((attempts - 1) * RECOVERY_BACKOFF_MS, 0L), RECOVERY_BACKOFF_MAX_MS);
            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                try {
                    if (!activity.isFinishing()) {
                        activity.recreate();
                    }
                } catch (Throwable ignored) {
                    // Best-effort only: if recreation is impossible, finish so
                    // the user is not stuck on a dead surface.
                    try {
                        activity.finish();
                    } catch (Throwable alsoIgnored) { }
                }
            }, delay);
            return true;
        } catch (Throwable ignored) {
            // Recovery must never behave worse than the default termination.
            return false;
        }
    }

    /**
     * Records this recovery attempt in the sliding window and returns the
     * attempt count (1-based), or -1 when recovery is no longer allowed
     * because the window is exhausted.
     */
    private int registerRecoveryAttempt() {
        SharedPreferences prefs = activity.getSharedPreferences(RECOVERY_PREFS, Context.MODE_PRIVATE);
        long now = SystemClock.elapsedRealtime();
        StringBuilder kept = new StringBuilder();
        int count = 0;
        String raw = prefs.getString(RECOVERY_TIMESTAMPS, "");
        if (raw != null && !raw.isEmpty()) {
            for (String part : raw.split(",")) {
                long stamp;
                try {
                    stamp = Long.parseLong(part.trim());
                } catch (NumberFormatException ignored) {
                    continue;
                }
                if (now - stamp <= RECOVERY_WINDOW_MS) {
                    if (kept.length() > 0) kept.append(',');
                    kept.append(stamp);
                    count++;
                }
            }
        }
        if (count >= MAX_RECOVERIES_IN_WINDOW) {
            return -1;
        }
        if (kept.length() > 0) kept.append(',');
        kept.append(now);
        prefs.edit().putString(RECOVERY_TIMESTAMPS, kept.toString()).apply();
        return count + 1;
    }
}
