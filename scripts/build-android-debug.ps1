$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$localJdk = Get-ChildItem -LiteralPath (Join-Path $projectRoot '.toolchains\jdk') -Directory |
    Sort-Object Name -Descending |
    Select-Object -First 1

# 始终优先项目本地 JDK（JDK 21），避免全局 JAVA_HOME 指向低版本
# 导致 Gradle 工具链（languageVersion=21）匹配失败。
if ($localJdk) {
    $env:JAVA_HOME = $localJdk.FullName
}
if (-not $env:JAVA_HOME) {
    throw 'JAVA_HOME is not set and no project-local JDK was found.'
}
$env:GRADLE_USER_HOME = Join-Path $projectRoot '.toolchains\gradle-home'

# --- Debug version scheme (2026-09-06) ---
# Debug builds no longer touch android/version.properties: the old "+1 per
# build, versionName derived from versionCode" rule inflated the tracked file
# far past the actual release line (2.69-local vs released v2.43) and dirtied
# the repo on every build.  Instead each debug build reads the release
# baseline from version.properties and builds with gradle -P overrides:
#   versionCode = 10000 + N   (release line caps at v9.99 = code 999, so the
#                             two ranges never collide)
#   versionName = "<baseline>-debug.<N>"
# N persists in debug_apk\build-counter.txt (untracked).  Starting above the
# highest legacy auto-bumped code (169) means new debug APKs still upgrade
# over any previously installed debug build.
$versionFile = Join-Path $projectRoot 'android\version.properties'
$versionProps = @{}
if (Test-Path -LiteralPath $versionFile) {
    Get-Content -LiteralPath $versionFile | ForEach-Object {
        if ($_ -match '^\s*([^#=]+)=(.+)$') {
            $versionProps[$matches[1].Trim()] = $matches[2].Trim()
        }
    }
}
$baselineVersionName = if ($versionProps.ContainsKey('versionName')) { $versionProps['versionName'] } else { '0.0' }
$debugApkDir = Join-Path $projectRoot 'debug_apk'
New-Item -ItemType Directory -Force -Path $debugApkDir | Out-Null
$buildCounterFile = Join-Path $debugApkDir 'build-counter.txt'
$nextVersionCode = 10001
if (Test-Path -LiteralPath $buildCounterFile) {
    $parsed = 0
    if ([int]::TryParse((Get-Content -LiteralPath $buildCounterFile -Raw).Trim(), [ref]$parsed) -and $parsed -ge 10001) {
        $nextVersionCode = $parsed + 1
    }
}
$nextVersionName = '{0}-debug.{1}' -f $baselineVersionName, ($nextVersionCode - 10000)
Set-Content -LiteralPath $buildCounterFile -Value $nextVersionCode -Encoding ASCII
Write-Host "Building debug version $nextVersionName (versionCode $nextVersionCode, baseline $baselineVersionName)"

Push-Location (Join-Path $projectRoot 'android')
try {
    $localGradle = Get-ChildItem -LiteralPath (Join-Path $projectRoot '.toolchains\gradle') -Directory |
        Sort-Object Name -Descending |
        Select-Object -First 1
    $gradleCommand = if ($localGradle) {
        Join-Path $localGradle.FullName 'bin\gradle.bat'
    } else {
        Join-Path (Get-Location) 'gradlew.bat'
    }
    & $gradleCommand assembleDebug "-PrphVersionCode=$nextVersionCode" "-PrphVersionName=$nextVersionName"
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
    Pop-Location
}

$builtApk = Join-Path $projectRoot 'android\app\build\outputs\apk\debug\app-debug.apk'
$deliveryApk = Join-Path $debugApkDir "Roleplay-Hub-$nextVersionName.apk"
if (-not (Test-Path -LiteralPath $builtApk)) {
    throw "Debug APK was not produced at $builtApk"
}
Copy-Item -LiteralPath $builtApk -Destination $deliveryApk -Force
Write-Host "Debug APK copied to $deliveryApk"
