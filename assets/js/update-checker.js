(function (root, factory) {
    if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.RPHUpdateChecker = factory();
    }
}(typeof self !== "undefined" ? self : this, function () {
    "use strict";

    var GITHUB_REPO = "Litishs/Roleplay-Hub";
    var API_URL = "https://api.github.com/repos/" + GITHUB_REPO + "/releases/latest";
    var RELEASES_PAGE_URL = "https://github.com/" + GITHUB_REPO + "/releases/latest";

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
                body: data.body || ""
            };
        } catch (e) {
            return null;
        }
    }

    async function checkForUpdate(currentVersion) {
        var release = await fetchLatestRelease();
        if (!release || !release.tag_name) {
            return { hasUpdate: false, release: null, error: "Unable to fetch release info" };
        }
        var latestVersion = release.tag_name.replace(/^v/i, "");
        return { hasUpdate: compareVersions(latestVersion, currentVersion) > 0, release: release, error: null };
    }

    async function downloadApk(progressCallback) {
        var release = await fetchLatestRelease();
        if (!release || !release.tag_name) return { error: "Cannot fetch release info" };

        var tag = release.tag_name.replace(/^v/i, "");
        var downloadUrl = "https://github.com/" + GITHUB_REPO + "/releases/download/v" + tag + "/Roleplay-Hub-" + tag + "-release.apk";

        try {
            var response = await fetch(downloadUrl);
            if (!response.ok) return { error: "Download failed: HTTP " + response.status };
            var reader = response.body.getReader();
            var contentLength = Number(response.headers.get("Content-Length")) || 0;
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
            var allChunks = new Uint8Array(receivedLength);
            var position = 0;
            for (var i = 0; i < chunks.length; i++) {
                allChunks.set(chunks[i], position);
                position += chunks[i].length;
            }
            return { data: allChunks, tag: tag, error: null };
        } catch (e) {
            return { error: "Download failed: " + e.message };
        }
    }

    function arrayBufferToBase64(buffer) {
        var binary = "";
        var bytes = new Uint8Array(buffer);
        for (var i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
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
            return { error: "Installation failed: " + e.message };
        }
    }

    return {
        compareVersions: compareVersions,
        checkForUpdate: checkForUpdate,
        fetchLatestRelease: fetchLatestRelease,
        downloadApk: downloadApk,
        saveAndInstallApk: saveAndInstallApk,
        GITHUB_REPO: GITHUB_REPO,
        RELEASES_PAGE_URL: RELEASES_PAGE_URL
    };
}));
