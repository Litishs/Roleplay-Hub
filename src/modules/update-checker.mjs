
    "use strict";

    var GITHUB_REPO = "Litishs/Roleplay-Hub";
    var API_URL = "https://api.github.com/repos/" + GITHUB_REPO + "/releases/latest";
    var RELEASES_PAGE_URL = "https://github.com/" + GITHUB_REPO + "/releases/latest";
    var DOWNLOAD_TIMEOUT_MS = 120000;
    var MIN_APK_SIZE = 5 * 1024 * 1024;

    // Activity Journal integration: wrap check/download in lightweight records.
    // Imported lazily with a safety fallback so the module still loads when
    // request-diagnostics isn't available (e.g. character/index.html UMD scope).
    function activityBegin(category, action) {
        try {
            var D = (typeof globalThis !== "undefined" && globalThis.RPHRequestDiagnostics)
                || (typeof window !== "undefined" && window.RPHRequestDiagnostics);
            if (D && typeof D.begin === "function") {
                return D.begin({ category: category, action: action });
            }
        } catch (_) { /* no-op */ }
        return {
            input: function () { }, behavior: function () { }, output: function () { },
            stage: function () { }, complete: function () { }, fail: function () { }
        };
    }
    function behaviorChars(text) { return String(text || "").length; }

    // 校验下载到的 APK 字节与 .sha256 sidecar 是否一致。sidecar 是 sha256sum 的
    // 标准输出（"<hex>  <文件名>"），只取第一个 64 位十六进制串。返回值带 ok 标志与
    // 双方摘要，便于日志定位是文件损坏还是 sidecar 缺失/格式错误。
    async function verifyApkChecksum(bytes, sha256Text) {
        var match = String(sha256Text || "").match(/([0-9a-fA-F]{64})/);
        if (!match) {
            return { ok: false, expected: "", actual: "", reason: "malformed checksum file" };
        }
        var expected = match[1].toLowerCase();
        var digest = await crypto.subtle.digest("SHA-256", bytes);
        var actual = Array.prototype.map.call(
            new Uint8Array(digest),
            function (byte) { return ("0" + byte.toString(16)).slice(-2); }
        ).join("");
        return { ok: actual === expected, expected: expected, actual: actual };
    }

    function compareVersions(a, b) {
        var partsA = String(a).split(".").map(Number);
        var partsB = String(b).split(".").map(Number);
        var len = Math.max(partsA.length, partsB.length);
        for (var i = 0; i < len; i++) {
            var numA = partsA[i] || 0;
            var numB = partsB[i] || 0;
            if (numA > numB) return 1;
            if (numA < numB) return -1;
        }
        return 0;
    }

    async function fetchLatestRelease() {
        try {
            var response = await fetch(API_URL, {
                headers: { "Accept": "application/vnd.github.v3+json" },
                signal: AbortSignal.timeout(8000)
            });
            if (!response.ok) return null;
            var data = await response.json();
            return {
                tag_name: data.tag_name || "",
                html_url: data.html_url || RELEASES_PAGE_URL,
                body: data.body || "",
                // 资产清单用于下载后校验（见 verifyApkChecksum）：发版工作流会随 APK
                // 附带 .sha256 sidecar，老版本 Release 没有该文件，校验按缺失跳过。
                assets: Array.isArray(data.assets)
                    ? data.assets.map(function (asset) {
                        return { name: asset.name || "", url: asset.browser_download_url || "" };
                    })
                    : []
            };
        } catch (e) {
            return null;
        }
    }

    async function checkForUpdate(currentVersion) {
        var journal = activityBegin("update", "check");
        journal.input({
            kind: "current_version",
            chars: String(currentVersion || "").length,
            summary: "current v" + String(currentVersion || "")
        });
        try {
            var release = await fetchLatestRelease();
            if (!release || !release.tag_name) {
                journal.behavior({
                    name: "fetch_latest_release",
                    result: "failed",
                    summary: "Unable to fetch release info"
                });
                var errRes = { hasUpdate: false, release: null, error: "Unable to fetch release info" };
                journal.fail(new Error(errRes.error));
                return errRes;
            }
            var latestVersion = release.tag_name.replace(/^v/i, "");
            var hasUpdate = compareVersions(latestVersion, currentVersion) > 0;
            journal.behavior({
                name: "compare_versions",
                result: hasUpdate ? "ok" : "skipped",
                meta: {
                    currentVersion: String(currentVersion || ""),
                    latestVersion: latestVersion,
                    hasUpdate: hasUpdate
                }
            });
            journal.output({ contentChars: behaviorChars(release.body) });
            journal.complete();
            return { hasUpdate: hasUpdate, release: release, error: null };
        } catch (err) {
            journal.fail(err);
            throw err;
        }
    }

    async function downloadApk(progressCallback) {
        var journal = activityBegin("update", "download_apk");
        try {
            var release = await fetchLatestRelease();
            if (!release || !release.tag_name) {
                var noRel = { error: "Cannot fetch release info" };
                journal.fail(new Error(noRel.error));
                return noRel;
            }

            var tag = release.tag_name.replace(/^v/i, "");
            var downloadUrl = "https://github.com/" + GITHUB_REPO + "/releases/download/v" + tag + "/Roleplay-Hub-" + tag + "-release.apk";
            journal.input({
                kind: "release_download",
                summary: "v" + tag
            });

            var controller = new AbortController();
            var timeoutId = setTimeout(function () { controller.abort(); }, DOWNLOAD_TIMEOUT_MS);

            try {
                var response = await fetch(downloadUrl, { signal: controller.signal });
                clearTimeout(timeoutId);
                if (!response.ok) {
                    var hint = response.status === 404 ? "APK not found for this version" : "HTTP " + response.status;
                    journal.fail(new Error(hint));
                    return { error: hint };
                }
                var contentLength = Number(response.headers.get("Content-Length")) || 0;
                journal.behavior({
                    name: "download_started",
                    result: "ok",
                    meta: { expectedBytes: contentLength }
                });
                if (contentLength > 0 && contentLength < MIN_APK_SIZE) {
                    var smallResp = { error: "Server response too small (" + Math.round(contentLength / 1024) + "KB), aborting" };
                    journal.fail(new Error(smallResp.error));
                    return smallResp;
                }

                var reader = response.body.getReader();
                var receivedLength = 0;
                var chunks = [];

                while (true) {
                    var result = await reader.read();
                    if (result.done) break;
                    chunks.push(result.value);
                    receivedLength += result.value.length;
                    if (progressCallback && contentLength) {
                        progressCallback(receivedLength / contentLength);
                    }
                }

                if (contentLength > 0 && receivedLength !== contentLength) {
                    var incomplete = { error: "Download incomplete: " + Math.round(receivedLength / 1024) + "KB of " + Math.round(contentLength / 1024) + "KB" };
                    journal.fail(new Error(incomplete.error));
                    return incomplete;
                }
                if (receivedLength < MIN_APK_SIZE) {
                    var tinyFile = { error: "Downloaded file too small (" + Math.round(receivedLength / 1024) + "KB)" };
                    journal.fail(new Error(tinyFile.error));
                    return tinyFile;
                }

                var allChunks = new Uint8Array(receivedLength);
                var position = 0;
                for (var i = 0; i < chunks.length; i++) {
                    allChunks.set(chunks[i], position);
                    position += chunks[i].length;
                }
                journal.behavior({
                    name: "download_finished",
                    result: "ok",
                    meta: { receivedBytes: receivedLength }
                });

                // 完整性校验：Release 带 .sha256 sidecar 时强制比对，不一致视为下载损坏，
                // 绝不进入安装；sidecar 缺失（v2.64 之前的 Release）或拉取失败时跳过并留痕，
                // 不因此挡住更新。
                var checksumAsset = (release.assets || []).find(function (asset) {
                    return asset.name === "Roleplay-Hub-" + tag + "-release.apk.sha256";
                });
                if (checksumAsset && checksumAsset.url) {
                    try {
                        var shaResponse = await fetch(checksumAsset.url, { signal: AbortSignal.timeout(15000) });
                        if (shaResponse.ok) {
                            var verify = await verifyApkChecksum(allChunks, await shaResponse.text());
                            if (!verify.ok) {
                                var mismatch = { error: "Checksum mismatch: expected " + verify.expected + ", got " + verify.actual };
                                journal.fail(new Error(mismatch.error));
                                return mismatch;
                            }
                            journal.behavior({ name: "checksum_verified", result: "ok" });
                        } else {
                            journal.behavior({ name: "checksum_verify", result: "skipped", summary: "sidecar HTTP " + shaResponse.status });
                        }
                    } catch (shaErr) {
                        journal.behavior({ name: "checksum_verify", result: "skipped", summary: "sidecar fetch failed" });
                    }
                } else {
                    journal.behavior({ name: "checksum_verify", result: "skipped", summary: "no sidecar asset" });
                }

                journal.output({ totalChars: 0 }); // no "chars" for binary
                journal.complete();
                return { data: allChunks, tag: tag, error: null };
            } catch (e) {
                clearTimeout(timeoutId);
                journal.fail(e);
                if (e && e.name === "AbortError") {
                    return { error: "Download timed out after " + (DOWNLOAD_TIMEOUT_MS / 1000) + "s" };
                }
                return { error: "Download failed: " + ((e && e.message) || "unknown error") };
            }
        } catch (outer) {
            journal.fail(outer);
            return { error: "Release info fetch failed: " + String((outer && outer.message) || outer || "unknown error") };
        }
    }

    function arrayBufferToBase64(buffer) {
        // 分块转换：APK 动辄数十 MB，逐字节拼接字符串会触发数千次字符串再分配，
        // 内存峰值与耗时都不可接受。按 0x8000 分块与 utils.mjs 的 bytesToBase64
        // 保持一致，每块一次 String.fromCharCode.apply + 一次 btoa 输入拼接。
        var bytes = new Uint8Array(buffer);
        var binary = "";
        var chunkSize = 0x8000;
        for (var i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
        }
        return btoa(binary);
    }

    async function cleanOldApkFiles(Filesystem) {
        try {
            var result = await Filesystem.readdir({ path: "", directory: "CACHE" });
            var files = result.files || [];
            for (var i = 0; i < files.length; i++) {
                if (files[i].name && files[i].name.indexOf("Roleplay-Hub-") === 0 && files[i].name.indexOf("-release.apk") > 0) {
                    await Filesystem.deleteFile({ path: files[i].name, directory: "CACHE" });
                }
            }
        } catch (e) {
            // Silently ignore cleanup errors
        }
    }

    async function saveAndInstallApk(bytes, tag) {
        var Capacitor = window.Capacitor;
        if (!Capacitor) return { error: "Capacitor not available" };

        var Filesystem = Capacitor.Plugins.Filesystem;
        var NativeStorage = Capacitor.Plugins.NativeStorage;
        if (!Filesystem || !NativeStorage) return { error: "Required plugins not available" };

        var b64 = arrayBufferToBase64(bytes);
        var fileName = "Roleplay-Hub-" + tag + "-release.apk";

        try {
            // Clean up any stale APK files before writing new one
            await cleanOldApkFiles(Filesystem);

            var result = await Filesystem.writeFile({
                path: fileName,
                data: b64,
                directory: "CACHE"
            });
            var filePath = result.uri;
            if (!filePath) {
                var uriResult = await Filesystem.getUri({ path: fileName, directory: "CACHE" });
                filePath = uriResult.uri;
            }
            await NativeStorage.installApk({ filePath: filePath });
            return { error: null };
        } catch (e) {
            // Clean up the partial file on failure
            try {
                await Filesystem.deleteFile({ path: fileName, directory: "CACHE" });
            } catch (cleanupErr) {}
            return { error: "Installation failed: " + (e.message || "unknown error") };
        }
    }

    

export { compareVersions, checkForUpdate, fetchLatestRelease, downloadApk, saveAndInstallApk, verifyApkChecksum, GITHUB_REPO, RELEASES_PAGE_URL };


