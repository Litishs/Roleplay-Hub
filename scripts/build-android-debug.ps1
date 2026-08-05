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

# --- 版本号自动递增 (2026-08-05) ---
# 每次构建前把 android/version.properties 的 versionCode/versionName +1：
# 1.9 -> 1.10 -> 1.11 -> 1.12 ...，便于区分各次构建的 APK。
$versionFile = Join-Path $projectRoot 'android\version.properties'
$versionProps = @{}
if (Test-Path -LiteralPath $versionFile) {
    Get-Content -LiteralPath $versionFile | ForEach-Object {
        if ($_ -match '^\s*([^#=]+)=(.+)$') {
            $versionProps[$matches[1].Trim()] = $matches[2].Trim()
        }
    }
}
$currentVersionCode = if ($versionProps.ContainsKey('versionCode')) { [int]$versionProps['versionCode'] } else { 9 }
$currentVersionName = if ($versionProps.ContainsKey('versionName')) { $versionProps['versionName'] } else { '1.9' }
$nextVersionCode = $currentVersionCode + 1
$nameParts = $currentVersionName.Split('.')
if ($nameParts.Length -gt 0 -and [int]::TryParse($nameParts[-1], [ref]$null)) {
    $nameParts[-1] = [string]([int]$nameParts[-1] + 1)
}
$nextVersionName = $nameParts -join '.'
$versionFileContent = "versionCode=$nextVersionCode`nversionName=$nextVersionName`n"
Set-Content -LiteralPath $versionFile -Value $versionFileContent -Encoding ASCII
Write-Host "Building version $nextVersionName (versionCode $nextVersionCode)"

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
    & $gradleCommand assembleDebug
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
    Pop-Location
}

$builtApk = Join-Path $projectRoot 'android\app\build\outputs\apk\debug\app-debug.apk'
$deliveryApk = Join-Path $projectRoot "Roleplay-Hub-$nextVersionName-debug.apk"
if (-not (Test-Path -LiteralPath $builtApk)) {
    throw "Debug APK was not produced at $builtApk"
}
Copy-Item -LiteralPath $builtApk -Destination $deliveryApk -Force
Write-Host "Debug APK copied to $deliveryApk"
