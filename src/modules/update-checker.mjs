
    "use strict";

    var GITHUB_REPO = "Litishs/Roleplay-Hub";
    var API_URL = "https://api.github.com/repos/" + GITHUB_REPO + "/releases/latest";
    var RELEASES_PAGE_URL = "https://github.com/" + GITHUB_REPO + "/releases/latest";

    // The in-app APK download/install path was removed on 2026-11-12: WebView
    // fetch cannot read GitHub release assets (the asset host sends no CORS
    // headers), the native installer was handed a file:// URI it cannot open,
    // and the manifest never declared the install permission. The update card
    // opens the release page instead; a native download+install flow is a
    // planned follow-up.

    // Activity Journal integration: wrap check in lightweight records.
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

export { compareVersions, checkForUpdate, fetchLatestRelease, GITHUB_REPO, RELEASES_PAGE_URL };

