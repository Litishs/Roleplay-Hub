import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// 2026-11-10: release versioning switched to SemVer three-segment tags
// (vX.Y.Z).  The CI workflow is the single source of truth that maps a tag to
// the Android versionCode; this contract keeps the derivation explicit so the
// formula cannot silently regress or break monotonicity.
const releaseWorkflow = await readFile(new URL("../.github/workflows/release.yml", import.meta.url), "utf8");

test("CI derives monotonic versionCode from three-segment release tags", () => {
    assert.match(releaseWorkflow, /PATCH=\$\(echo "\$TAG" \| cut -d\. -f3\)/, "PATCH segment must be parsed from the tag");
    assert.match(releaseWorkflow, /PATCH=\$\{PATCH:-0\}/, "two-segment tags must map PATCH to 0 (v2.71 == v2.71.0)");
    assert.match(
        releaseWorkflow,
        /\(MAJOR - 1\) \* 100000 \+ MINOR \* 1000 \+ PATCH/,
        "versionCode = (X-1)*100000 + Y*1000 + Z keeps release codes >= 100000 and monotonic in every segment"
    );
    assert.ok(
        !/\(MAJOR - 1\) \* 100 \+ MINOR /.test(releaseWorkflow),
        "legacy two-segment (X-1)*100+Y formula must not come back"
    );
});
