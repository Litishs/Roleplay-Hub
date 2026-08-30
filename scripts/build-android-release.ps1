$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$localJdk = Get-ChildItem -LiteralPath (Join-Path $projectRoot '.toolchains\jdk') -Directory |
    Sort-Object Name -Descending |
    Select-Object -First 1

# Always prefer the project-local JDK (JDK 21) so the Gradle toolchain matches.
if ($localJdk) {
    $env:JAVA_HOME = $localJdk.FullName
}
if (-not $env:JAVA_HOME) {
    throw 'JAVA_HOME is not set and no project-local JDK was found.'
}
$env:GRADLE_USER_HOME = Join-Path $projectRoot '.toolchains\gradle-home'

# --- Release version: advance by +1, mirroring debug builds ---
# Release and debug now share the same versionCode derivation (+1 each build)
# so version.properties stays consistent regardless of which build runs. The
# canonical release version is set by the git tag in CI; this local script only
# produces a release APK for testing the signed-build flow.
$versionFile = Join-Path $projectRoot 'android\version.properties'
$versionProps = @{}
if (Test-Path -LiteralPath $versionFile) {
    Get-Content -LiteralPath $versionFile | ForEach-Object {
        if ($_ -match '^\s*([^#=]+)=(.+)$') {
            $versionProps[$matches[1].Trim()] = $matches[2].Trim()
        }
    }
}
$currentVersionCode = if ($versionProps.ContainsKey('versionCode')) { [int]$versionProps['versionCode'] } else { 0 }
$releaseVersionCode = $currentVersionCode + 1
$releaseMajor = [int]([math]::Floor($releaseVersionCode / 100) + 1)
$releaseMinor = [int]($releaseVersionCode % 100)
$releaseVersionName = '{0}.{1:D2}' -f $releaseMajor, $releaseMinor

# --- Release signing config check ---
$keystorePropsFile = Join-Path $projectRoot 'android\keystore.properties'
if (-not (Test-Path -LiteralPath $keystorePropsFile)) {
    throw 'android\keystore.properties is missing. Generate android\keystore\roleplay-hub-release.keystore and configure it first.'
}

$versionFileContent = "versionCode=$releaseVersionCode`nversionName=$releaseVersionName"
Set-Content -LiteralPath $versionFile -Value $versionFileContent -Encoding ASCII
Write-Host "Building release version $releaseVersionName (versionCode $releaseVersionCode)"

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
    & $gradleCommand assembleRelease
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
    Pop-Location
}

$builtApk = Join-Path $projectRoot 'android\app\build\outputs\apk\release\app-release.apk'
$deliveryApk = Join-Path $projectRoot "Roleplay-Hub-$releaseVersionName-release.apk"
if (-not (Test-Path -LiteralPath $builtApk)) {
    throw "Release APK was not produced at $builtApk"
}
Copy-Item -LiteralPath $builtApk -Destination $deliveryApk -Force
Write-Host "Release APK copied to $deliveryApk"
