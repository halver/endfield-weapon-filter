param (
    [Parameter(Mandatory=$true)]
    [string]$VersionName
)

# Extract version number components
# e.g., "1.0.5" -> versionCode = 5
if ($VersionName -match '^(\d+)\.(\d+)\.(\d+)$') {
    $major = [int]$Matches[1]
    $minor = [int]$Matches[2]
    $patch = [int]$Matches[3]
    
    $versionCode = $patch
    if ($patch -eq 0 -and $minor -gt 0) {
        $versionCode = $minor * 10
    }
} else {
    Write-Error "Invalid version name format. Expected format: X.Y.Z (e.g., 1.0.5)"
    exit 1
}

Write-Host "Creating version branch $VersionName with versionCode $versionCode..." -ForegroundColor Cyan

# 1. Checkout main and pull latest
git checkout main
git pull origin main --no-rebase

# 2. Create and checkout new branch
git checkout -b $VersionName

# 3. Update app/build.gradle.kts
$gradlePath = "app/build.gradle.kts"
$gradleContent = Get-Content $gradlePath -Raw
$gradleContent = $gradleContent -replace 'versionCode\s*=\s*\d+', "versionCode = $versionCode"
$gradleContent = $gradleContent -replace 'versionName\s*=\s*"[^"]+"', "versionName = `"$VersionName`""
Set-Content -Path $gradlePath -Value $gradleContent -NoNewline

# 4. Update update.json
$jsonPath = "update.json"
$jsonContent = @"
{
  "latest_version_code": $versionCode,
  "latest_version_name": "$VersionName",
  "apk_url": "https://github.com/halver/endfield-weapon-filter/releases/download/$VersionName/endfield-weapon-filter-debug.apk"
}
"@
Set-Content -Path $jsonPath -Value $jsonContent -NoNewline

# 5. Git Commit & Push
git add $gradlePath $jsonPath
git commit -m "bump: initialize build version config for $VersionName (versionCode $versionCode)"
git push -u origin $VersionName

Write-Host "Version branch $VersionName successfully created with updated build configs!" -ForegroundColor Green
