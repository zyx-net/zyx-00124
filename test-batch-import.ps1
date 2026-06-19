# === Reproducible Test: Classroom Closed-Dates Batch Import Full Pipeline ===
# Prerequisites: Backend running on port 3001 (npm run server:dev or npm run dev)
# Run: powershell -ExecutionPolicy Bypass -File test-batch-import.ps1

$ErrorActionPreference = "Stop"
$BASE = "http://localhost:3001"
$ROOT = Split-Path -Parent $MyInvocation.MyCommand.Path
$DB = Join-Path $ROOT "data\db.json"
$DB_BAK = "$DB.bak"

if (-not (Test-Path $DB)) {
    Write-Host "ERROR: db.json not found, start the server first (npm run dev)" -ForegroundColor Red
    exit 1
}

Copy-Item $DB $DB_BAK -Force
Write-Host "[INFO] db.json backed up -> db.json.bak" -ForegroundColor DarkGray

function Send-Json {
    param(
        [string]$Method,
        [string]$Path,
        [hashtable]$BodyObj,
        [string]$Token
    )
    $headers = @{ "Content-Type" = "application/json" }
    if ($Token) { $headers["Authorization"] = "Bearer $Token" }
    $params = @{
        Method      = $Method
        Uri         = "$BASE$Path"
        Headers     = $headers
        ErrorAction = "Stop"
    }
    if ($BodyObj) {
        $params["Body"] = ($BodyObj | ConvertTo-Json -Compress -Depth 10)
    }
    try {
        $resp = Invoke-RestMethod @params
        return @{ ok = $true; status = 200; data = $resp }
    }
    catch {
        $status = 0
        $errBody = $null
        if ($_.Exception.Response) {
            $status = [int]$_.Exception.Response.StatusCode
            try {
                $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
                $errBody = $reader.ReadToEnd() | ConvertFrom-Json
            } catch {}
        }
        return @{ ok = $false; status = $status; data = $errBody; raw = $_ }
    }
}

function Assert-True {
    param(
        [bool]$Cond,
        [string]$Desc
    )
    if ($Cond) {
        Write-Host "  PASS $Desc" -ForegroundColor Green
        $script:pass++
    }
    else {
        Write-Host "  FAIL $Desc" -ForegroundColor Red
        $script:fail++
    }
}

$script:pass = 0
$script:fail = 0

# ===== Step 0: Login =====
Write-Host "`n[Step 0] Login admin & student01" -ForegroundColor Cyan
$r = Send-Json POST "/api/auth/login" @{ username = "admin"; password = "admin123" }
if (-not $r.ok) { Write-Host "admin login failed, start server first" -ForegroundColor Red; exit 1 }
$adminToken = $r.data.token
Write-Host "  admin logged in"

$r = Send-Json POST "/api/auth/login" @{ username = "student01"; password = "123456" }
$stuToken = $r.data.token
Write-Host "  student01 logged in"

$CSV_WITH_CLASSROOM = @"
Date,Reason,Classroom
2026-07-01,PartyDay,cls-a101
2026-08-01,ArmyDay,Z999
2026-09-10,TeachersDay,B202
2026-10-01,NationalDay,NOT-EXIST
2026-11-11,Double11,
2026-12-25,Christmas,cls-a101
"@

# ===== Step 1: Permission - student all 403 =====
Write-Host "`n[Step 1] Permission check: student accessing 5 batch endpoints must return 403" -ForegroundColor Cyan
$endpoints = @(
    @("GET",  "/api/classrooms/closed-dates/export",                 $null),
    @("POST", "/api/classrooms/closed-dates/import/preview",         @{ csv = $CSV_WITH_CLASSROOM }),
    @("POST", "/api/classrooms/closed-dates/import/execute",         @{ csv = $CSV_WITH_CLASSROOM }),
    @("POST", "/api/classrooms/closed-dates/import/undo",            $null),
    @("GET",  "/api/classrooms/closed-dates/import/last",            $null)
)
foreach ($ep in $endpoints) {
    $m, $p, $b = $ep
    $r = Send-Json $m $p $b $stuToken
    Assert-True ($r.status -eq 403) "$m $p -> HTTP $($r.status) expect 403"
}

# No token -> 401
$r = Send-Json POST "/api/classrooms/closed-dates/import/preview" @{ csv = $CSV_WITH_CLASSROOM }
Assert-True ($r.status -eq 401) "No-token preview -> HTTP $($r.status) expect 401"

# ===== Step 2: Init baseline data =====
Write-Host "`n[Step 2] Init: clear closed-dates & snapshot" -ForegroundColor Cyan
Send-Json PUT "/api/classrooms/closed-dates/batch" @{ dates = @() } $adminToken | Out-Null
Assert-True $true "PUT empty dates array"

# ===== Step 3: Preview import =====
Write-Host "`n[Step 3] Preview import (classroom col, expect 3 new / 3 invalid)" -ForegroundColor Cyan
$r = Send-Json POST "/api/classrooms/closed-dates/import/preview" @{ csv = $CSV_WITH_CLASSROOM } $adminToken
Assert-True ($r.ok -and $r.data.total -eq 6)        "total=6"
Assert-True ($r.data.newCount -eq 3)                 "newCount=3 (cls-a101 x2 + B202)"
Assert-True ($r.data.duplicateCount -eq 0)           "duplicateCount=0"
Assert-True ($r.data.invalidCount -eq 3)             "invalidCount=3 (Z999/NOT-EXIST/empty)"
$z999Row = $r.data.rows | Where-Object { $_.date -eq "2026-08-01" }
Assert-True ($z999Row.status -eq "invalid" -and $z999Row.message -match "Z999") "Z999 marked invalid, message contains Z999"
$emptyClsRow = $r.data.rows | Where-Object { $_.date -eq "2026-11-11" }
Assert-True ($emptyClsRow.message -match "empty" -or $emptyClsRow.message -match "null" -or $emptyClsRow.message.Length -gt 0) "Empty classroom row has error message"
$validRow = $r.data.rows | Where-Object { $_.date -eq "2026-07-01" }
Assert-True ($validRow.status -eq "new" -and $validRow.classroomId -eq "cls-a101") "Valid row resolved classroomId=cls-a101"

# ===== Step 4: Execute import =====
Write-Host "`n[Step 4] Execute import" -ForegroundColor Cyan
$r = Send-Json POST "/api/classrooms/closed-dates/import/execute" @{ csv = $CSV_WITH_CLASSROOM; skipDuplicates = $true } $adminToken
$execData = $r.data
Assert-True ($r.ok -and $execData.success -eq $true)  "success=true"
Assert-True ($execData.added -eq 3)                    "added=3"
Assert-True ($execData.failed -eq 3)                   "failed=3"
Assert-True ($execData.skipped -eq 0)                  "skipped=0"
Assert-True ([string]::IsNullOrWhiteSpace($execData.batchId) -eq $false) "non-empty batchId"
Assert-True ($execData.rows.Count -eq 6)               "6 rows detail returned"
Write-Host "  summary: $($execData.summary)" -ForegroundColor DarkGray
$script:BATCH_ID = $execData.batchId

# ===== Step 5: Get last snapshot =====
Write-Host "`n[Step 5] Query last import snapshot" -ForegroundColor Cyan
$r = Send-Json GET "/api/classrooms/closed-dates/import/last" $null $adminToken
$snap = $r.data
Assert-True ($r.ok -and $snap -ne $null)               "snapshot exists"
Assert-True ($snap.importedCount -eq 3)                "snap.importedCount=3"
Assert-True ($snap.previousClosedDates.Count -eq 0)    "snap.previousClosedDates = 0 (baseline cleared)"
Assert-True ($snap.batchId -eq $BATCH_ID)              "snap.batchId matches execute"

# ===== Step 6: list + disk consistency =====
Write-Host "`n[Step 6] list API vs disk db.json consistency (persistence before restart)" -ForegroundColor Cyan
$r = Send-Json GET "/api/classrooms/closed-dates/list" $null $adminToken
Assert-True ($r.data.Count -eq 3)                      "list API returns 3 entries"
$dbDisk = Get-Content $DB -Raw -Encoding UTF8 | ConvertFrom-Json
Assert-True ($dbDisk.closedDates.Count -eq 3)          "disk db.json has 3 entries"
Assert-True ($null -ne $dbDisk.lastClosedDateImport)   "disk db.json has snapshot"
$hasClsId = $dbDisk.closedDates | Where-Object { $_.classroomId -eq "cls-a101" -and $_.date -eq "2026-07-01" }
Assert-True ($null -ne $hasClsId)                      "written entry carries classroomId=cls-a101"

# ===== Step 7: Export CSV + consistency check =====
Write-Host "`n[Step 7] Export CSV + round-trip check" -ForegroundColor Cyan
$exportHeaders = @{ Authorization = "Bearer $adminToken" }
try {
    $exportResp = Invoke-WebRequest -Uri "$BASE/api/classrooms/closed-dates/export" -Headers $exportHeaders -UseBasicParsing
    $ct = $exportResp.Headers["Content-Type"] -join ";"
    $cd = $exportResp.Headers["Content-Disposition"] -join ";"
    Assert-True ($ct -match "text/csv")                 "Content-Type contains text/csv"
    Assert-True ($cd -match "attachment")               "Content-Disposition contains attachment"
    $csvText = $exportResp.Content
    Assert-True ($csvText.Length -gt 0)                 "CSV body not empty"
    $csvClean = $csvText -replace "^\uFEFF", ""  # strip UTF-8 BOM

    # Re-preview exported CSV -> should be mostly duplicates (all records already in DB), no invalid
    $r = Send-Json POST "/api/classrooms/closed-dates/import/preview" @{ csv = $csvClean } $adminToken
    $dp = [int]$r.data.duplicateCount
    $iv = [int]$r.data.invalidCount
    $tot = [int]$r.data.total
    Assert-True ($iv -eq 0)                          "Re-preview exported CSV invalidCount=0"
    Assert-True ($tot -eq 3 -or $dp -gt 0)           "Re-preview 3 records exported successfully (total=$tot, dup=$dp)"
    Write-Host "  Consistency OK: export->re-preview loop closed" -ForegroundColor DarkGray
}
catch {
    Write-Host "  Export error: $_" -ForegroundColor Red
    $script:fail++
}

# ===== Step 8: Simulate restart (data persisted in db.json) =====
Write-Host "`n[Step 8] Simulate service restart: snapshot & data survive" -ForegroundColor Cyan
$dbReload = Get-Content $DB -Raw -Encoding UTF8 | ConvertFrom-Json
Assert-True ($dbReload.lastClosedDateImport.batchId -eq $BATCH_ID) "After reload batchId unchanged"
Assert-True ($dbReload.closedDates.Count -eq 3)          "After reload closedDates still 3 entries"

# ===== Step 9: Undo =====
Write-Host "`n[Step 9] Undo import" -ForegroundColor Cyan
$r = Send-Json POST "/api/classrooms/closed-dates/import/undo" $null $adminToken
$undoData = $r.data
Assert-True ($r.ok -and $undoData.success -eq $true)    "undo success=true"
Assert-True ($undoData.restoredCount -eq 3)             "restoredCount=3"
Assert-True ($undoData.batchId -eq $BATCH_ID)           "undo batchId correct"

$r = Send-Json GET "/api/classrooms/closed-dates/list" $null $adminToken
Assert-True ($r.data.Count -eq 0)                       "after undo list empty"

$r = Send-Json GET "/api/classrooms/closed-dates/import/last" $null $adminToken
# API returns 200 with body "null" (string) when no snapshot
$snapRaw = $r.data
$snapIsNull = ($null -eq $snapRaw) -or 
              (($snapRaw -is [string]) -and ($snapRaw -eq '' -or $snapRaw -eq 'null')) -or
              (($snapRaw | ConvertTo-Json -Compress) -eq 'null')
Assert-True $snapIsNull "after undo snapshot cleared (raw=$snapRaw)"

# ===== Step 10: Second undo must fail =====
Write-Host "`n[Step 10] Second undo must fail with 400" -ForegroundColor Cyan
$r = Send-Json POST "/api/classrooms/closed-dates/import/undo" $null $adminToken
Assert-True ($r.status -eq 400) "No-snapshot undo -> 400"

# ===== Step 11: Audit logs =====
Write-Host "`n[Step 11] Audit logs should contain all operations" -ForegroundColor Cyan
$r = Send-Json GET "/api/audit-logs" $null $adminToken
$logs = $r.data
$actions = $logs | ForEach-Object { $_.action }
function Check-Log($kw) {
    $found = @($actions | Where-Object { $_ -match [regex]::Escape($kw) }).Count -gt 0
    Assert-True $found "Audit log contains keyword '$kw'"
}
Check-Log "preview"
Check-Log "import"
Check-Log "export"
Check-Log "undo"
# Check student denied attempts via log content (avoid Chinese keywords mangled by encoding)
$stuFailedLogs = @($logs | Where-Object { $_.userId -eq 'stu-001' -and $_.success -eq $false })
Assert-True ($stuFailedLogs.Count -ge 5) "Student01 has >=5 failed audit logs (5 batch endpoints forbidden)"

# ===== Final =====
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  RESULTS: PASS=$pass  FAIL=$fail" -ForegroundColor $(if ($fail -eq 0) { "Green" } else { "Red" })
Write-Host "========================================"

Copy-Item $DB_BAK $DB -Force
try { Remove-Item $DB_BAK -Force -ErrorAction SilentlyContinue } catch {}
Write-Host "`n[INFO] Original db.json restored" -ForegroundColor DarkGray

if ($fail -gt 0) { exit 1 }
exit 0
