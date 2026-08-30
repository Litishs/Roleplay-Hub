package com.roleplayhub.app;

import android.content.pm.ApplicationInfo;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 构建信息桥：向 JS 暴露当前安装包是 release 还是 debug 构建。
 * 判断依据是 APK 的 debuggable 标志（FLAG_DEBUGGABLE）：release 签名包为
 * false、debug 包为 true，运行期确定，不依赖 BuildConfig（AGP 默认关闭
 * buildConfig 生成）。
 * 用于设置页底部版本号显示，便于真机区分调试包与正式包。
 */
@CapacitorPlugin(name = "BuildInfo")
public class BuildInfoPlugin extends Plugin {

    @PluginMethod
    public void getBuildType(PluginCall call) {
        boolean debuggable = (getContext().getApplicationInfo().flags
            & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        JSObject result = new JSObject();
        result.put("buildType", debuggable ? "debug" : "release");
        call.resolve(result);
    }
}
