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

# --- Release version: round the current version up to the next multiple of 10 ---
# e.g. 1.24 -> 1.30; if already a multiple of 10 (e.g. 1.30) it stays unchanged.
$versionFile = Join-Path $projectRoot 'android\version.properties'
$versionProps = @{}
if (Test-Path -LiteralPath $versionFile) {
    Get-Content -LiteralPath $versionFile | ForEach-Object {
        if ($_ -match '^\s*([^#=]+)=(.+)$') {
            $versionProps[$matches[1].Trim()] = $matches[2].Trim()
        }
    }
}
$currentVersionName = if ($versionProps.ContainsKey('versionName')) { $versionProps['versionName'] } else { '1.0' }
$nameParts = $currentVersionName.Split('.')
if ($nameParts.Length -lt 1 -or -not [int]::TryParse($nameParts[-1], [ref]$null)) {
    throw "Unexpected versionName format: $currentVersionName"
}
$currentMinor = [int]$nameParts[-1]
$releaseMinor = [math]::Ceiling($currentMinor / 10.0) * 10
$nameParts[-1] = [string]$releaseMinor
$releaseVersionName = $nameParts -join '.'
$releaseVersionCode = $releaseMinor

# --- Release signing config check ---
$keystorePropsFile = Join-Path $projectRoot 'android\keystore.properties'
if (-not (Test-Path -LiteralPath $keystorePropsFile)) {
    throw 'android\keystore.properties is missing. Generate android\keystore\roleplay-hub-release.keystore and configure it first.'
}

$versionFileContent = "versionCode=$releaseVersionCode`nversionName=$releaseVersionName`n"
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
