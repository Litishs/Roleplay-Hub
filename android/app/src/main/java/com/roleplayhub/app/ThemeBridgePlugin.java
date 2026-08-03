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
            WindowInsetsControllerCompat controller = new WindowInsetsControllerCompat(
                    getActivity().getWindow(), getActivity().getWindow().getDecorView());
            controller.setAppearanceLightStatusBars(!finalDark);
            controller.setAppearanceLightNavigationBars(!finalDark);
        });
        call.resolve();
    }
}
