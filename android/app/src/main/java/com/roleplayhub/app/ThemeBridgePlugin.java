package com.roleplayhub.app;

import android.graphics.Color;

import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 主题桥：JS 侧 applyTheme 在 data-theme 变化时调用 setDark，
 * 同步 Android 状态栏 / 导航栏 / DecorView 背景色与图标明暗。
 * 因 AndroidManifest configChanges 已含 uiMode，系统深浅切换不会重建
 * Activity，onCreate 不重跑，必须经此插件由 JS→原生联动修正。
 */
@CapacitorPlugin(name = "ThemeBridge")
public class ThemeBridgePlugin extends Plugin {

    private static final int COLOR_LIGHT = Color.rgb(249, 250, 251); // #F9FAFB
    private static final int COLOR_DARK = Color.rgb(17, 24, 39);     // #111827 gray-900

    @PluginMethod
    public void setDark(PluginCall call) {
        boolean dark = Boolean.TRUE.equals(call.getBoolean("dark", false));
        final boolean finalDark = dark;
        getActivity().runOnUiThread(() -> {
            int color = finalDark ? COLOR_DARK : COLOR_LIGHT;
            getActivity().getWindow().setStatusBarColor(color);
            getActivity().getWindow().setNavigationBarColor(color);
            getActivity().getWindow().getDecorView().setBackgroundColor(color);
            // Paint the WebView background to match the theme so the status-bar region
            // (and any overscroll gap) never shows the WebView default white. Some
            // systems (e.g. HarmonyOS) ignore Window.setStatusBarColor, so the app
            // must paint this region itself instead of relying on the system bar color.
            if (getBridge() != null) {
                android.webkit.WebView webView = getBridge().getWebView();
                if (webView != null) {
                    webView.setBackgroundColor(color);
                }
            }
            // Paint the content view (android.R.id.content) background so the status-bar
            // inset gap above the WebView matches the theme. Some systems leave this
            // padded region as the default white window background instead of the
            // DecorView color, producing a visible white band at the top.
            android.view.View contentView = getActivity().findViewById(android.R.id.content);
            if (contentView != null) {
                contentView.setBackgroundColor(color);
            }
WindowInsetsControllerCompat controller = new WindowInsetsControllerCompat(
                    getActivity().getWindow(), getActivity().getWindow().getDecorView());
            controller.setAppearanceLightStatusBars(!finalDark);
            controller.setAppearanceLightNavigationBars(!finalDark);
        });
        call.resolve();
    }
}
