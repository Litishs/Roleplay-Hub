package com.roleplayhub.app;

import java.io.File;

/**
 * Minimal uncaught-exception bookkeeping: write last-crash.json, then defer to
 * the previous handler so the default crash behavior is untouched.
 */
public class CrashReporter implements Thread.UncaughtExceptionHandler {
    private final Thread.UncaughtExceptionHandler previous;
    private final File filesDir;
    private final String versionName;
    private final int versionCode;

    public CrashReporter(Thread.UncaughtExceptionHandler previous, File filesDir,
                         String versionName, int versionCode) {
        this.previous = previous;
        this.filesDir = filesDir;
        this.versionName = versionName;
        this.versionCode = versionCode;
    }

    @Override
    public void uncaughtException(Thread thread, Throwable throwable) {
        CrashFileWriter.write(filesDir, throwable.getClass().getName(),
                throwable.getMessage(), versionName, versionCode);
        if (previous != null) {
            previous.uncaughtException(thread, throwable);
        }
    }
}
