$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$appDir = Join-Path $root 'app'
$androidDir = Join-Path $appDir 'android'
$bundledJdk = Join-Path $root 'tools\jdk-26'
$studioJbr = 'C:\Program Files\Android\Android Studio\jbr'
$bundledSdk = Join-Path $root 'android-sdk'
$gradleHome = Join-Path $root '.gradle'

if (-not (Test-Path $androidDir)) {
  throw "Android project not found: $androidDir"
}

if (Test-Path $studioJbr) {
  $env:JAVA_HOME = $studioJbr
  $env:PATH = "$($env:JAVA_HOME)\bin;$($env:PATH)"
} elseif (Test-Path $bundledJdk) {
  $env:JAVA_HOME = $bundledJdk
  $env:PATH = "$($env:JAVA_HOME)\bin;$($env:PATH)"
}

if (-not $env:JAVA_HOME -and -not (Get-Command java -ErrorAction SilentlyContinue)) {
  throw "JAVA_HOME or java is required. You can place a bundled JDK at $bundledJdk"
}

if (-not $env:ANDROID_HOME -and -not $env:ANDROID_SDK_ROOT -and (Test-Path $bundledSdk)) {
  $env:ANDROID_SDK_ROOT = $bundledSdk
  $env:ANDROID_HOME = $bundledSdk
  $env:PATH = "$($bundledSdk)\platform-tools;$($bundledSdk)\cmdline-tools\latest\bin;$($env:PATH)"
}

if (-not $env:ANDROID_HOME -and -not $env:ANDROID_SDK_ROOT) {
  throw "ANDROID_HOME or ANDROID_SDK_ROOT is required. You can place a bundled SDK at $bundledSdk"
}

Write-Host '[1/3] Sync web assets into Android project...'
if (-not (Test-Path $gradleHome)) {
  New-Item -ItemType Directory -Path $gradleHome | Out-Null
}
$env:GRADLE_USER_HOME = $gradleHome
Push-Location $appDir
try {
  & 'C:\Program Files\nodejs\npx.cmd' cap sync android
} finally {
  Pop-Location
}

Write-Host '[2/3] Build debug APK...'
Push-Location $androidDir
try {
  & '.\gradlew.bat' assembleDebug
} finally {
  Pop-Location
}

$apk = Join-Path $androidDir 'app\build\outputs\apk\debug\app-debug.apk'
if (Test-Path $apk) {
  Write-Host '[3/3] Build complete'
  Write-Host $apk
} else {
  throw "APK not found after build."
}
