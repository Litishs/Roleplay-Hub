package com.roleplayhub.app;

import android.graphics.Color;
import android.os.Bundle;
import android.view.View;

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
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        super.onCreate(savedInstanceState);

        getWindow().getDecorView().setBackgroundColor(Color.rgb(249, 250, 251));
        WindowInsetsControllerCompat insetsController =
            new WindowInsetsControllerCompat(getWindow(), getWindow().getDecorView());
        insetsController.setAppearanceLightStatusBars(true);
        insetsController.setAppearanceLightNavigationBars(true);

        View content = findViewById(android.R.id.content);
        ViewCompat.setOnApplyWindowInsetsListener(content, (view, windowInsets) -> {
            Insets topInsets = windowInsets.getInsets(
                WindowInsetsCompat.Type.statusBars() | WindowInsetsCompat.Type.displayCutout()
            );
            boolean keyboardVisible = windowInsets.isVisible(WindowInsetsCompat.Type.ime());
            int keyboardBottom = keyboardVisible
                ? windowInsets.getInsets(WindowInsetsCompat.Type.ime()).bottom
                : 0;
            view.setPadding(0, topInsets.top, 0, keyboardBottom);
            return windowInsets;
        });
        ViewCompat.requestApplyInsets(content);
    }
}
