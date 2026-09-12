# build_and_upload.ps1
# Android APKの自動ビルド & Googleドライブ（または指定出力先）への全自動同期スクリプト

$ErrorActionPreference = "Stop"

Write-Host "🔨 [1/3] Android APK のビルドを開始します..." -ForegroundColor Cyan
.\gradlew.bat assembleDebug

$apkSource = "app\build\outputs\apk\debug\app-debug.apk"
$apkOutputName = "endfield-weapon-filter-debug.apk"

if (-not (Test-Path $apkSource)) {
    Write-Error "ビルド失敗: APKファイルが見つかりません。"
    exit 1
}

# ローカルリポジトリルートに最新APKを更新
Copy-Item -Path $apkSource -Destination $apkOutputName -Force
Write-Host "✅ [2/3] ローカルAPKを更新しました: $apkOutputName" -ForegroundColor Green

# Google Drive for Desktop の一般的なマウントパスを自動検索
$drivePaths = @(
    "G:\マイドライブ",
    "G:\My Drive",
    "$env:USERPROFILE\Google Drive",
    "$env:USERPROFILE\Google ドライブ"
)

$targetDrive = $null
foreach ($path in $drivePaths) {
    if (Test-Path $path) {
        $targetDrive = $path
        break
    }
}

if ($targetDrive) {
    $uploadDir = Join-Path $targetDrive "EndfieldApps"
    if (-not (Test-Path $uploadDir)) {
        New-Item -ItemType Directory -Path $uploadDir | Out-Null
    }
    $destinationPath = Join-Path $uploadDir $apkOutputName
    Copy-Item -Path $apkSource -Destination $destinationPath -Force
    Write-Host "🚀 [3/3] Googleドライブへ自動同期完了!" -ForegroundColor Yellow
    Write-Host "   保存先: $destinationPath" -ForegroundColor Gray
} else {
    Write-Host "ℹ️ Google Drive for Desktop の自動マウントパスが見つかりませんでした。" -ForegroundColor Gray
    Write-Host "   手動でGoogleドライブのパスを設定する場合はスクリプト内の `$drivePaths` を編集してください。" -ForegroundColor Gray
}
