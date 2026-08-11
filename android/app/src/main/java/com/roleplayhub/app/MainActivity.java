package com.roleplayhub.app;

import android.graphics.Color;
import android.os.Bundle;
import android.content.res.Configuration;
import android.os.Build;
import android.view.View;
import android.view.WindowManager;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeStoragePlugin.class);
        registerPlugin(ThemeBridgePlugin.class);
        registerPlugin(TTSSpeechPlugin.class);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        super.onCreate(savedInstanceState);

        // 首屏初始主题：按系统夜间模式决定 DecorView/状态栏/导航栏颜色，
        // 避免 JS 启动前浅色闪烁；JS 启动后由 ThemeBridge 按用户偏好最终修正。
        boolean isDark = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
                == Configuration.UI_MODE_NIGHT_YES;
        int themeColor = isDark ? Color.rgb(17, 24, 39) : Color.rgb(249, 250, 251);
        getWindow().getDecorView().setBackgroundColor(themeColor);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams windowParams = getWindow().getAttributes();
            windowParams.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS;
            getWindow().setAttributes(windowParams);
        }
        WindowInsetsControllerCompat insetsController =
            new WindowInsetsControllerCompat(getWindow(), getWindow().getDecorView());
        insetsController.setAppearanceLightStatusBars(!isDark);
        insetsController.setAppearanceLightNavigationBars(!isDark);
        getWindow().setStatusBarColor(themeColor);
        getWindow().setNavigationBarColor(themeColor);

        View content = findViewById(android.R.id.content);
        ViewCompat.setOnApplyWindowInsetsListener(content, (view, windowInsets) -> {
            boolean landscape = getResources().getConfiguration().orientation == Configuration.ORIENTATION_LANDSCAPE;
            if (landscape) {
                insetsController.hide(WindowInsetsCompat.Type.statusBars());
                insetsController.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            } else {
                insetsController.show(WindowInsetsCompat.Type.statusBars());
                insetsController.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_DEFAULT);
            }
            Insets topInsets = windowInsets.getInsets(
                landscape ? WindowInsetsCompat.Type.displayCutout() : (WindowInsetsCompat.Type.statusBars() | WindowInsetsCompat.Type.displayCutout())
            );
            boolean keyboardVisible = windowInsets.isVisible(WindowInsetsCompat.Type.ime());
            int keyboardBottom = keyboardVisible
                ? windowInsets.getInsets(WindowInsetsCompat.Type.ime()).bottom
                : 0;
            view.setPadding(0, landscape ? 0 : topInsets.top, 0, keyboardBottom);
            return windowInsets;
        });
        ViewCompat.requestApplyInsets(content);
    }
}
