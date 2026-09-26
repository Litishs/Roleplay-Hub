package com.roleplayhub.app;

import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;

import java.io.File;

/**
 * Writes the last-crash file when the WebView render process dies, then
 * returns false to keep the system's default termination behavior — the
 * render content is gone either way, so the app exits and the next launch
 * shows the "abnormal exit" notice (4-layer diagnostics plan, L1-A4).
 *
 * Every other callback is inherited untouched so Capacitor's URL routing and
 * iframe handling stay exactly as shipped.
 */
public class CrashReportingWebViewClient extends BridgeWebViewClient {
    private final File filesDir;
    private final String versionName;
    private final int versionCode;

    public CrashReportingWebViewClient(Bridge bridge, File filesDir,
                                       String versionName, int versionCode) {
        super(bridge);
        this.filesDir = filesDir;
        this.versionName = versionName;
        this.versionCode = versionCode;
    }

    @Override
    public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
        String message = detail != null && detail.didCrash()
                ? "WebView render process crashed"
                : "WebView render process was killed by the system";
        CrashFileWriter.write(filesDir, CrashFileWriter.RENDER_PROCESS_GONE, message, versionName, versionCode);
        return false;
    }
}
