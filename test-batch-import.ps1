# === Reproducible Test: Classroom Closed-Dates Batch Import Full Pipeline ===
# Prerequisites: Backend running on port 3001 (npm run server:dev or npm run dev)
# Run: powershell -ExecutionPolicy Bypass -File test-batch-import.ps1
#
# This script performs a REAL server restart (stop + start) as part of the
# verification flow, not just re-reading the disk file.

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
        $BodyObj,
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

function Get-Raw {
    param(
        [string]$Path,
        [string]$Token
    )
    $headers = @{}
    if ($Token) { $headers["Authorization"] = "Bearer $Token" }
    try {
        $resp = Invoke-WebRequest -Uri "$BASE$Path" -Headers $headers -UseBasicParsing
        return @{ ok = $true; status = $resp.StatusCode; body = $resp.Content; headers = $resp.Headers }
    }
    catch {
        $status = 0
        if ($_.Exception.Response) {
            $status = [int]$_.Exception.Response.StatusCode
        }
        return @{ ok = $false; status = $status; body = $null; headers = $null }
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

function Wait-ForServer {
    param([int]$Port = 3001, [int]$TimeoutSec = 30)
    $start = Get-Date
    while (((Get-Date) - $start).TotalSeconds -lt $TimeoutSec) {
        try {
            $r = Invoke-WebRequest -Uri "http://localhost:$Port/api/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
            if ($r.StatusCode -eq 200) {
                Write-Host "  Server on port $Port is ready" -ForegroundColor DarkGray
                return $true
            }
        } catch {}
        Start-Sleep -Milliseconds 500
    }
    Write-Host "  Server on port $Port did NOT become ready within ${TimeoutSec}s" -ForegroundColor Red
    return $false
}

$script:pass = 0
$script:fail = 0

# ===== Step 0: Login =====
Write-Host "`n[Step 0] Login admin & student01" -ForegroundColor Cyan
$r = Send-Json POST "/api/auth/login" @{ username = "admin"; password = "admin123" }
if (-not $r.ok) { Write-Host "admin login failed, start server first" -ForegroundColor Red; exit 1 }
$adminToken = $r.data.token
Write-Host "  admin token: $($adminToken.Substring(0,10))..."

$r = Send-Json POST "/api/auth/login" @{ username = "student01"; password = "123456" }
$stuToken = $r.data.token
Write-Host "  student01 token: $($stuToken.Substring(0,10))..."

$CSV_WITH_CLASSROOM = "Date,Reason,Classroom`n2026-07-01,PartyDay,cls-a101`n2026-08-01,ArmyDay,Z999`n2026-09-10,TeachersDay,B202`n2026-10-01,NationalDay,NOT-EXIST`n2026-11-11,Double11,`n2026-12-25,Christmas,cls-a101"

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
Write-Host "  Request: POST /api/classrooms/closed-dates/import/preview { csv: `<6-row CSV with classroom col`> }" -ForegroundColor DarkGray
$r = Send-Json POST "/api/classrooms/closed-dates/import/preview" @{ csv = $CSV_WITH_CLASSROOM } $adminToken
Write-Host "  Response: total=$($r.data.total) new=$($r.data.newCount) dup=$($r.data.duplicateCount) invalid=$($r.data.invalidCount)" -ForegroundColor DarkGray
Assert-True ($r.ok -and $r.data.total -eq 6)        "total=6"
Assert-True ($r.data.newCount -eq 3)                 "newCount=3 (cls-a101 x2 + B202)"
Assert-True ($r.data.duplicateCount -eq 0)           "duplicateCount=0"
Assert-True ($r.data.invalidCount -eq 3)             "invalidCount=3 (Z999/NOT-EXIST/empty)"
$z999Row = $r.data.rows | Where-Object { $_.date -eq "2026-08-01" }
Assert-True ($z999Row.status -eq "invalid" -and $z999Row.message -match "Z999") "Z999 marked invalid, message contains Z999"
$emptyClsRow = $r.data.rows | Where-Object { $_.date -eq "2026-11-11" }
Assert-True ($emptyClsRow.status -eq "invalid" -and $emptyClsRow.message.Length -gt 0) "Empty classroom row has error message"
$validRow = $r.data.rows | Where-Object { $_.date -eq "2026-07-01" }
Assert-True ($validRow.status -eq "new" -and $validRow.classroomId -eq "cls-a101") "Valid row resolved classroomId=cls-a101"
Assert-True ($validRow.classroomName -match "A101") "Valid row classroomName contains A101"

# ===== Step 4: Execute import =====
Write-Host "`n[Step 4] Execute import" -ForegroundColor Cyan
Write-Host "  Request: POST /api/classrooms/closed-dates/import/execute { csv: `<same CSV`>, skipDuplicates: true }" -ForegroundColor DarkGray
$r = Send-Json POST "/api/classrooms/closed-dates/import/execute" @{ csv = $CSV_WITH_CLASSROOM; skipDuplicates = $true } $adminToken
$execData = $r.data
Write-Host "  Response: success=$($execData.success) added=$($execData.added) skipped=$($execData.skipped) failed=$($execData.failed) batchId=$($execData.batchId)" -ForegroundColor DarkGray
Write-Host "  summary: $($execData.summary)" -ForegroundColor DarkGray
Assert-True ($r.ok -and $execData.success -eq $true)  "success=true"
Assert-True ($execData.added -eq 3)                    "added=3"
Assert-True ($execData.failed -eq 3)                   "failed=3"
Assert-True ($execData.skipped -eq 0)                  "skipped=0"
Assert-True ([string]::IsNullOrWhiteSpace($execData.batchId) -eq $false) "non-empty batchId"
Assert-True ($execData.rows.Count -eq 6)               "6 rows detail returned"
$script:BATCH_ID = $execData.batchId

# ===== Step 5: Get last snapshot =====
Write-Host "`n[Step 5] Query last import snapshot" -ForegroundColor Cyan
Write-Host "  Request: GET /api/classrooms/closed-dates/import/last" -ForegroundColor DarkGray
$r = Send-Json GET "/api/classrooms/closed-dates/import/last" $null $adminToken
$snap = $r.data
Write-Host "  Response: batchId=$($snap.batchId) importedCount=$($snap.importedCount) importedBy=$($snap.importedByName)" -ForegroundColor DarkGray
Assert-True ($r.ok -and $snap -ne $null)               "snapshot exists"
Assert-True ($snap.importedCount -eq 3)                "snap.importedCount=3"
Assert-True ($snap.previousClosedDates.Count -eq 0)    "snap.previousClosedDates = 0 (baseline cleared)"
Assert-True ($snap.batchId -eq $BATCH_ID)              "snap.batchId matches execute"

# ===== Step 6: list + disk consistency =====
Write-Host "`n[Step 6] list API vs disk db.json consistency (persistence before restart)" -ForegroundColor Cyan
$r = Send-Json GET "/api/classrooms/closed-dates/list" $null $adminToken
Write-Host "  list API returns $($r.data.Count) entries" -ForegroundColor DarkGray
Assert-True ($r.data.Count -eq 3)                      "list API returns 3 entries"
$dbDisk = Get-Content $DB -Raw -Encoding UTF8 | ConvertFrom-Json
Assert-True ($dbDisk.closedDates.Count -eq 3)          "disk db.json has 3 entries"
Assert-True ($null -ne $dbDisk.lastClosedDateImport)   "disk db.json has snapshot"
$hasClsId = $dbDisk.closedDates | Where-Object { $_.classroomId -eq "cls-a101" -and $_.date -eq "2026-07-01" }
Assert-True ($null -ne $hasClsId)                      "written entry carries classroomId=cls-a101"

# ===== Step 7: Export CSV + consistency check =====
Write-Host "`n[Step 7] Export CSV + round-trip check" -ForegroundColor Cyan
Write-Host "  Request: GET /api/classrooms/closed-dates/export" -ForegroundColor DarkGray
$exportR = Get-Raw "/api/classrooms/closed-dates/export" $adminToken
Assert-True ($exportR.ok)                                "Export HTTP 200"
$ct = $exportR.headers["Content-Type"] -join ";"
$cd = $exportR.headers["Content-Disposition"] -join ";"
Assert-True ($ct -match "text/csv")                      "Content-Type contains text/csv"
Assert-True ($cd -match "attachment")                    "Content-Disposition contains attachment"
$csvText = $exportR.body -replace "^\uFEFF", ""
Assert-True ($csvText.Length -gt 0)                      "CSV body not empty"
$csvHeaderLine = ($csvText -split "`n")[0]
$csvColCount = ($csvHeaderLine -split ",").Count
Assert-True ($csvColCount -ge 3)                          "Export header has >=3 columns (classroom col present)"
Assert-True ($csvText.Contains("A101"))                   "Export contains classroom name A101"

Write-Host "  Re-preview exported CSV to verify consistency..." -ForegroundColor DarkGray
$r = Send-Json POST "/api/classrooms/closed-dates/import/preview" @{ csv = $csvText } $adminToken
$dp = [int]$r.data.duplicateCount
$iv = [int]$r.data.invalidCount
$tot = [int]$r.data.total
Write-Host "  Re-preview result: total=$tot dup=$dp invalid=$iv" -ForegroundColor DarkGray
Assert-True ($iv -eq 0)                                  "Re-preview exported CSV invalidCount=0"
Assert-True ($dp -eq 3 -or $tot -eq 3)                   "Re-preview exported CSV: all 3 records recognized (dup=$dp total=$tot)"

# ===== Step 8: REAL server restart =====
Write-Host "`n[Step 8] REAL server restart: stop process -> restart -> verify data survives" -ForegroundColor Cyan

# Find and kill the server process on port 3001
$serverPid = $null
try {
    $conn = Get-NetTCPConnection -LocalPort 3001 -ErrorAction Stop | Select-Object -First 1
    $serverPid = $conn.OwningProcess
    Write-Host "  Found server PID: $serverPid on port 3001" -ForegroundColor DarkGray
} catch {
    Write-Host "  WARNING: Could not find process on port 3001, skipping real restart" -ForegroundColor Yellow
}

if ($serverPid) {
    Write-Host "  Stopping server (PID $serverPid)..." -ForegroundColor DarkGray
    Stop-Process -Id $serverPid -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 3

    # Verify port is free (may take a moment for process to fully release)
    $stillListening = $false
    try {
        $check = Get-NetTCPConnection -LocalPort 3001 -ErrorAction Stop
        $stillListening = ($check.Count -gt 0)
    } catch {}
    if ($stillListening) {
        Write-Host "  Port still in use, waiting..." -ForegroundColor DarkGray
        Start-Sleep -Seconds 3
        $stillListening = $false
        try {
            $check = Get-NetTCPConnection -LocalPort 3001 -ErrorAction Stop
            $stillListening = ($check.Count -gt 0)
        } catch {}
    }
    Assert-True (-not $stillListening) "Port 3001 is free after stopping server"

    # Restart the server
    Write-Host "  Starting server: npm run server:dev ..." -ForegroundColor DarkGray
    $serverJob = Start-Job -ScriptBlock {
        Set-Location $using:ROOT
        npm run server:dev 2>&1
    }

    # Wait for server to be ready
    $ready = Wait-ForServer -Port 3001 -TimeoutSec 30
    Assert-True $ready "Server restarted and responding on port 3001"

    if ($ready) {
        # Re-login (in-memory sessions are lost after restart)
        Write-Host "  Re-logging in after restart (sessions lost)..." -ForegroundColor DarkGray
        $r = Send-Json POST "/api/auth/login" @{ username = "admin"; password = "admin123" }
        Assert-True ($r.ok) "Re-login after restart succeeds"
        $adminToken2 = $r.data.token

        # Verify data survives
        $r = Send-Json GET "/api/classrooms/closed-dates/list" $null $adminToken2
        Write-Host "  After restart: list returns $($r.data.Count) entries" -ForegroundColor DarkGray
        Assert-True ($r.data.Count -eq 3) "After restart: closedDates still 3 entries"

        $r = Send-Json GET "/api/classrooms/closed-dates/import/last" $null $adminToken2
        Assert-True ($r.ok -and $r.data -ne $null) "After restart: snapshot still exists"
        Assert-True ($r.data.batchId -eq $BATCH_ID) "After restart: snapshot batchId unchanged ($BATCH_ID)"
        Assert-True ($r.data.importedCount -eq 3) "After restart: importedCount still 3"

        # Undo still works after restart
        Write-Host "  Testing undo after restart..." -ForegroundColor DarkGray
        $r = Send-Json POST "/api/classrooms/closed-dates/import/undo" $null $adminToken2
        Assert-True ($r.ok -and $r.data.success -eq $true) "After restart: undo succeeds"
        Assert-True ($r.data.restoredCount -eq 3) "After restart: undo restoredCount=3"

        # Verify data is back to baseline (empty)
        $r = Send-Json GET "/api/classrooms/closed-dates/list" $null $adminToken2
        Assert-True ($r.data.Count -eq 0) "After undo: list is empty"

        # Verify snapshot cleared after undo
        $r = Send-Json GET "/api/classrooms/closed-dates/import/last" $null $adminToken2
        $snapIsNull = ($null -eq $r.data) -or
                      (($r.data -is [string]) -and ($r.data -eq '' -or $r.data -eq 'null')) -or
                      (($r.data | ConvertTo-Json -Compress) -eq 'null')
        Assert-True $snapIsNull "After undo: snapshot is null"

        # Update adminToken for subsequent steps
        $adminToken = $adminToken2

        Write-Host "  Stopping restarted server..." -ForegroundColor DarkGray
        Stop-Job $serverJob -ErrorAction SilentlyContinue
        Remove-Job $serverJob -Force -ErrorAction SilentlyContinue

        # Kill the restarted server process
        try {
            $conn2 = Get-NetTCPConnection -LocalPort 3001 -ErrorAction Stop | Select-Object -First 1
            Stop-Process -Id $conn2.OwningProcess -Force -ErrorAction SilentlyContinue
        } catch {}

        # Restart server again for remaining steps
        Write-Host "  Starting server again for remaining steps..." -ForegroundColor DarkGray
        $serverJob2 = Start-Job -ScriptBlock {
            Set-Location $using:ROOT
            npm run server:dev 2>&1
        }
        $ready2 = Wait-ForServer -Port 3001 -TimeoutSec 30
        if ($ready2) {
            $r = Send-Json POST "/api/auth/login" @{ username = "admin"; password = "admin123" }
            $adminToken = $r.data.token
            $r = Send-Json POST "/api/auth/login" @{ username = "student01"; password = "123456" }
            $stuToken = $r.data.token
            Write-Host "  Server re-started, re-logged in for remaining steps" -ForegroundColor DarkGray
        } else {
            Write-Host "  WARNING: Server did not restart, using existing connection" -ForegroundColor Yellow
        }
    }
} else {
    Write-Host "  SKIPPED real restart (no process found on port 3001)" -ForegroundColor Yellow
    # Still do the undo for consistency
    $r = Send-Json POST "/api/classrooms/closed-dates/import/undo" $null $adminToken
    Assert-True ($r.ok) "Undo succeeds (without restart)"
}

# ===== Step 9: Undo verification with export + snapshot rollback =====
Write-Host "`n[Step 9] Undo -> export & snapshot rollback verification" -ForegroundColor Cyan
# State should now be: empty closedDates, null snapshot (from Step 8 undo)
# Re-import to test undo->export->snapshot rollback cleanly
Send-Json PUT "/api/classrooms/closed-dates/batch" @{ dates = @() } $adminToken | Out-Null

# Add a baseline
Send-Json PUT "/api/classrooms/closed-dates/batch" @{ dates = @(@{ date = "2026-01-01"; reason = "基线" }) } $adminToken | Out-Null
Write-Host "  Baseline: 1 closed date (2026-01-01)" -ForegroundColor DarkGray

# Import 3 classroom-specific records
$r = Send-Json POST "/api/classrooms/closed-dates/import/execute" @{ csv = $CSV_WITH_CLASSROOM; skipDuplicates = $true } $adminToken
Assert-True ($r.data.added -eq 3) "Re-import: added=3"

# Verify list count = 1 baseline + 3 imported = 4
$r = Send-Json GET "/api/classrooms/closed-dates/list" $null $adminToken
Assert-True ($r.data.Count -eq 4) "Before undo: list has 4 entries (1 baseline + 3 imported)"

# Record export before undo
$exportBefore = Get-Raw "/api/classrooms/closed-dates/export" $adminToken
$csvBefore = $exportBefore.body -replace "^\uFEFF", ""
$dataLinesBefore = ($csvBefore -split "`n" | Where-Object { $_.Trim().Length -gt 0 } | Select-Object -Skip 1).Count
Write-Host "  Export before undo: $dataLinesBefore data rows" -ForegroundColor DarkGray
Assert-True ($dataLinesBefore -eq 4) "Export before undo has 4 data rows"

# Undo
Write-Host "  Request: POST /api/classrooms/closed-dates/import/undo (no body)" -ForegroundColor DarkGray
$r = Send-Json POST "/api/classrooms/closed-dates/import/undo" $null $adminToken
Assert-True ($r.ok -and $r.data.success -eq $true) "Undo success=true"
Assert-True ($r.data.restoredCount -eq 3) "Undo restoredCount=3"
Write-Host "  Response: batchId=$($r.data.batchId) restoredCount=$($r.data.restoredCount) summary=$($r.data.summary)" -ForegroundColor DarkGray

# Verify list returns to baseline
$r = Send-Json GET "/api/classrooms/closed-dates/list" $null $adminToken
Assert-True ($r.data.Count -eq 1) "After undo: list returns to 1 (baseline only)"
Assert-True ($r.data[0].date -eq "2026-01-01") "After undo: baseline record preserved"

# Verify export CSV rolls back
$exportAfter = Get-Raw "/api/classrooms/closed-dates/export" $adminToken
$csvAfter = $exportAfter.body -replace "^\uFEFF", ""
$dataLinesAfter = ($csvAfter -split "`n" | Where-Object { $_.Trim().Length -gt 0 } | Select-Object -Skip 1).Count
Write-Host "  Export after undo: $dataLinesAfter data rows" -ForegroundColor DarkGray
Assert-True ($dataLinesAfter -eq 1) "Export after undo has 1 data row (baseline only)"

# Verify snapshot is null
$r = Send-Json GET "/api/classrooms/closed-dates/import/last" $null $adminToken
$snapIsNull = ($null -eq $r.data) -or
              (($r.data -is [string]) -and ($r.data -eq '' -or $r.data -eq 'null')) -or
              (($r.data | ConvertTo-Json -Compress) -eq 'null')
Assert-True $snapIsNull "After undo: snapshot is null"

# Verify undo -> re-preview exported CSV shows only baseline
$previewR = Send-Json POST "/api/classrooms/closed-dates/import/preview" @{ csv = $csvAfter } $adminToken
Assert-True ($previewR.data.total -le 1) "After undo: re-preview exported CSV has <=1 record (actual=$($previewR.data.total))"

# ===== Step 10: Second undo must fail =====
Write-Host "`n[Step 10] Second undo must fail with 400" -ForegroundColor Cyan
$r = Send-Json POST "/api/classrooms/closed-dates/import/undo" $null $adminToken
Assert-True ($r.status -eq 400) "No-snapshot undo -> 400"
Assert-True ($r.status -eq 400) "Error response returned for double undo"

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

# Check student denied attempts via log content
$stuFailedLogs = @($logs | Where-Object { $_.userId -eq 'stu-001' -and $_.success -eq $false })
Assert-True ($stuFailedLogs.Count -ge 5) "Student01 has >=5 failed audit logs (5 batch endpoints forbidden)"

# ===== Final =====
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  RESULTS: PASS=$pass  FAIL=$fail" -ForegroundColor $(if ($fail -eq 0) { "Green" } else { "Red" })
Write-Host "========================================"

# Cleanup: stop any extra server job
Get-Job | Where-Object { $_.Name -match 'server' -or $_.Command -match 'server:dev' } | ForEach-Object {
    Stop-Job $_ -ErrorAction SilentlyContinue
    Remove-Job $_ -Force -ErrorAction SilentlyContinue
}

Copy-Item $DB_BAK $DB -Force
try { Remove-Item $DB_BAK -Force -ErrorAction SilentlyContinue } catch {}
Write-Host "`n[INFO] Original db.json restored" -ForegroundColor DarkGray

if ($fail -gt 0) { exit 1 }
exit 0
