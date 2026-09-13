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

# 4.5. Sync live Google Sheets data into app/src/main/assets/data.js as offline initial dataset
Write-Host "Syncing live Google Sheets data into app/src/main/assets/data.js..." -ForegroundColor Cyan
try {
    $wc = New-Object System.Net.WebClient
    $wc.Encoding = [System.Text.Encoding]::UTF8
    $spreadsheetId = '1dZGyJHG_oK9u5ocKmpHjThh76qvFk0knys9LYsR5Koo'
    $masterCsvText = $wc.DownloadString("https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=332980878")
    $areaCsvText = $wc.DownloadString("https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=142181474")

    # Simple CSV parser inline
    function parseCSVText($csvText) {
        $lines = @()
        $curLine = [System.Collections.Generic.List[string]]::new()
        $curToken = ""
        $inQuotes = $false
        for ($i = 0; $i -lt $csvText.Length; $i++) {
            $c = $csvText[$i]
            $nextC = if ($i + 1 -lt $csvText.Length) { $csvText[$i + 1] } else { "" }
            if ($c -eq '"') {
                if ($inQuotes -and $nextC -eq '"') { $curToken += '"'; $i++ } else { $inQuotes = -not $inQuotes }
            } elseif ($c -eq ',' -and (-not $inQuotes)) {
                $curLine.Add($curToken.Trim())
                $curToken = ""
            } elseif (($c -eq "`r" -or $c -eq "`n") -and (-not $inQuotes)) {
                if ($c -eq "`r" -and $nextC -eq "`n") { $i++ }
                $curLine.Add($curToken.Trim())
                if ($curLine.Count -gt 0 -and ($curLine | Where-Object { $_.Length -gt 0 })) { $lines += ,($curLine.ToArray()) }
                $curLine = [System.Collections.Generic.List[string]]::new()
                $curToken = ""
            } else { $curToken += $c }
        }
        if ($curToken.Length -gt 0 -or $curLine.Count -gt 0) {
            $curLine.Add($curToken.Trim())
            if ($curLine.Count -gt 0 -and ($curLine | Where-Object { $_.Length -gt 0 })) { $lines += ,($curLine.ToArray()) }
        }
        return $lines
    }

    function parseEffectTokens($str) {
        if (-not $str) { return @() }
        return ($str -split '[;,；,、\.\n\r]') | ForEach-Object { $_.Trim() } | Where-Object { $_.Length -gt 0 }
    }

    $masterRows = parseCSVText $masterCsvText
    $areaRows = parseCSVText $areaCsvText

    $areaMap = @{}
    for ($i = 1; $i -lt $areaRows.Count; $i++) {
        $row = $areaRows[$i]
        if ($row.Count -lt 1) { continue }
        $areaName = $row[0].Trim()
        if (-not $areaName) { continue }
        if (-not $areaMap.ContainsKey($areaName)) {
            $areaMap[$areaName] = @{ Area = $areaName; Bases = [System.Collections.Generic.HashSet[string]]::new(); Extras = [System.Collections.Generic.HashSet[string]]::new(); Skills = [System.Collections.Generic.HashSet[string]]::new() }
        }
        $entry = $areaMap[$areaName]
        if ($row.Count -gt 1) { parseEffectTokens $row[1] | ForEach-Object { $entry.Bases.Add($_) | Out-Null } }
        if ($row.Count -gt 2) { parseEffectTokens $row[2] | ForEach-Object { $entry.Extras.Add($_) | Out-Null } }
        if ($row.Count -gt 3) { parseEffectTokens $row[3] | ForEach-Object { $entry.Skills.Add($_) | Out-Null } }
    }

    $weapons = @()
    for ($i = 1; $i -lt $masterRows.Count; $i++) {
        $row = $masterRows[$i]
        if ($row.Count -lt 7) { continue }
        $wName = $row[0].Trim()
        if (-not $wName) { continue }
        $wType = $row[1].Trim()
        $wRarity = 5
        if ($row[2] -match '\d+') { $wRarity = [int]$matches[0] }
        $wChar = $row[3].Trim(); $wBase = $row[4].Trim(); $wExtra = $row[5].Trim(); $wSkill = $row[6].Trim()
        $exactAreas = @(); $partialAreas = @()
        foreach ($kv in $areaMap.GetEnumerator()) {
            $ae = $kv.Value
            $isBaseMatch = (-not $wBase) -or ($ae.Bases | Where-Object { $_ -eq $wBase -or $wBase.Contains($_) -or $_.Contains($wBase) })
            $isExtraMatch = (-not $wExtra) -or ($ae.Extras | Where-Object { $_ -eq $wExtra -or $wExtra.Contains($_) -or $_.Contains($wExtra) })
            $isSkillMatch = (-not $wSkill) -or ($ae.Skills | Where-Object { $_ -eq $wSkill -or $wSkill.Contains($_) -or $_.Contains($wSkill) })
            if ($isBaseMatch -and $isExtraMatch -and $isSkillMatch) { $exactAreas += $ae.Area }
            $hasAnyMatch = ($wBase -and ($ae.Bases | Where-Object { $_ -eq $wBase -or $wBase.Contains($_) -or $_.Contains($wBase) })) -or ($wExtra -and ($ae.Extras | Where-Object { $_ -eq $wExtra -or $wExtra.Contains($_) -or $_.Contains($wExtra) })) -or ($wSkill -and ($ae.Skills | Where-Object { $_ -eq $wSkill -or $wSkill.Contains($_) -or $_.Contains($wSkill) }))
            if ($hasAnyMatch) { $partialAreas += $ae.Area }
        }
        $finalAreas = if ($exactAreas.Count -gt 0) { $exactAreas } elseif ($partialAreas.Count -gt 0) { $partialAreas } else { @() }
        $wObj = [ordered]@{ id = "w_$i"; weapon_name = $wName; weapon_type = $wType; rarity = $wRarity; character = $wChar; base_effect = $wBase; extra_effect = $wExtra; skill_effect = $wSkill; areas = ($finalAreas | Select-Object -Unique) }
        $weapons += $wObj
    }
    $utf8Encoding = New-Object System.Text.UTF8Encoding($false)
    $jsContent = "const WEAPONS_DATA = " + ($weapons | ConvertTo-Json -Depth 5) + ";"
    [System.IO.File]::WriteAllText("app/src/main/assets/data.js", $jsContent, $utf8Encoding)
    Write-Host "Updated data.js with $($weapons.Count) items from spreadsheet!" -ForegroundColor Green
} catch {
    Write-Warning "Could not fetch live spreadsheet data to update data.js: $_"
}

# 5. Git Commit & Push
git add $gradlePath $jsonPath app/src/main/assets/data.js
git commit -m "bump: initialize build version config and update offline data.js for $VersionName (versionCode $versionCode)"
git push -u origin $VersionName

Write-Host "Version branch $VersionName successfully created with updated build configs!" -ForegroundColor Green
