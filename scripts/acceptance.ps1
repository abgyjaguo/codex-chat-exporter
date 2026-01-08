$ErrorActionPreference = "Stop"

function Write-Section($title) {
  Write-Host ""
  Write-Host "== $title ==" -ForegroundColor Cyan
}

function Assert-True($condition, $message) {
  if (-not $condition) {
    throw $message
  }
}

function Get-FreeTcpPort {
  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
  try {
    $listener.Start()
    return $listener.LocalEndpoint.Port
  } finally {
    $listener.Stop()
  }
}

function Invoke-BridgeJson($BaseUrl, $method, $path, $body = $null, $timeoutSec = 20) {
  $uri = "$BaseUrl$path"
  if ($null -eq $body) {
    return Invoke-RestMethod -Method $method -Uri $uri -TimeoutSec $timeoutSec
  }
  $json = $body | ConvertTo-Json -Depth 20
  return Invoke-RestMethod -Method $method -Uri $uri -ContentType "application/json" -Body $json -TimeoutSec $timeoutSec
}

function Read-TextFile($path) {
  return [string](Get-Content -LiteralPath $path -Raw)
}

function Assert-Contains($text, $needle, $label) {
  Assert-True ($text -like "*$needle*") "$label: expected to contain '$needle'"
}

function Assert-NotContains($text, $needle, $label) {
  Assert-True (-not ($text -like "*$needle*")) "$label: expected NOT to contain '$needle'"
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$bridgeDir = Join-Path $repoRoot "bridge"

Assert-True (Test-Path $bridgeDir) "Missing bridge dir: $bridgeDir"

$fixturePath = Join-Path $bridgeDir "test\\fixtures\\mixed.jsonl"
Assert-True (Test-Path $fixturePath) "Missing fixture: $fixturePath"

$runId = Get-Date -Format "yyyyMMdd-HHmmss"
$tempRoot = [System.IO.Path]::GetTempPath()
$runDir = Join-Path $tempRoot "cce-acceptance-$runId"
$null = New-Item -ItemType Directory -Force $runDir

$dbPath = Join-Path $runDir "bridge.db"
$exportsDir = Join-Path $runDir "exports"
$fsRoot = Join-Path $runDir "open-notebook-fs"
$null = New-Item -ItemType Directory -Force $exportsDir
$null = New-Item -ItemType Directory -Force $fsRoot

$port = Get-FreeTcpPort
$baseUrl = "http://127.0.0.1:$port"

$savedEnv = @{
  BRIDGE_HOST = $env:BRIDGE_HOST
  BRIDGE_PORT = $env:BRIDGE_PORT
  BRIDGE_DB_PATH = $env:BRIDGE_DB_PATH
  BRIDGE_EXPORTS_DIR = $env:BRIDGE_EXPORTS_DIR
  BRIDGE_PUBLIC_BASE_URL = $env:BRIDGE_PUBLIC_BASE_URL
  OPEN_NOTEBOOK_FS_ROOT = $env:OPEN_NOTEBOOK_FS_ROOT
}

$env:BRIDGE_HOST = "127.0.0.1"
$env:BRIDGE_PORT = "$port"
$env:BRIDGE_DB_PATH = $dbPath
$env:BRIDGE_EXPORTS_DIR = $exportsDir
$env:BRIDGE_PUBLIC_BASE_URL = $baseUrl
$env:OPEN_NOTEBOOK_FS_ROOT = $fsRoot

$stdoutLog = Join-Path $runDir "bridge-stdout.log"
$stderrLog = Join-Path $runDir "bridge-stderr.log"

$proc = $null
try {
  Write-Section "Start Bridge"
  if (-not (Test-Path (Join-Path $bridgeDir "node_modules\\express\\package.json"))) {
    Write-Host "bridge/node_modules missing; running npm install..." -ForegroundColor Yellow
    Push-Location $bridgeDir
    try {
      npm install
    } finally {
      Pop-Location
    }
  }

  $proc = Start-Process -FilePath node -ArgumentList "src\\server.js" -WorkingDirectory $bridgeDir -PassThru -NoNewWindow -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog

  $ready = $false
  for ($i = 0; $i -lt 40; $i++) {
    try {
      $health = curl.exe -sS --max-time 1 "$baseUrl/bridge/v1/health"
      if ($health -eq "ok") { $ready = $true; break }
    } catch {}
    Start-Sleep -Milliseconds 250
  }
  if (-not $ready) {
    $stderr = ""
    if (Test-Path $stderrLog) { $stderr = Get-Content $stderrLog -Raw }
    throw "Bridge did not become ready on $baseUrl. stderr=`n$stderr"
  }

  Write-Host "Bridge ok: $baseUrl" -ForegroundColor Green

  Write-Section "Import (default privacy)"
  $fixture = Read-TextFile $fixturePath
  Assert-True ($fixture.Length -gt 0) "Fixture is empty: $fixturePath"

  $project = @{ name = "acceptance"; cwd = "D:\\acceptance" }
  $respDefault = Invoke-BridgeJson $baseUrl "POST" "/bridge/v1/import/codex-chat" @{
    project = $project
    session = @{ name = "fixture-default" }
    exported_at = (Get-Date).ToString("o")
    codex = @{ jsonl_text = $fixture }
  } 30

  Assert-True ($respDefault.message_count -eq 2) "Expected message_count=2 for default import, got $($respDefault.message_count)"
  Write-Host "default import ok: project_id=$($respDefault.project_id) session_id=$($respDefault.session_id) message_count=$($respDefault.message_count)" -ForegroundColor Green

  Write-Section "Import (opt-in sensitive content)"
  $respOpt = Invoke-BridgeJson $baseUrl "POST" "/bridge/v1/import/codex-chat" @{
    project = $project
    session = @{ name = "fixture-optin" }
    exported_at = (Get-Date).ToString("o")
    codex = @{
      jsonl_text = $fixture
      include_tool_outputs = $true
      include_environment_context = $true
    }
  } 30

  Assert-True ($respOpt.message_count -eq 4) "Expected message_count=4 for opt-in import, got $($respOpt.message_count)"
  Write-Host "opt-in import ok: project_id=$($respOpt.project_id) session_id=$($respOpt.session_id) message_count=$($respOpt.message_count)" -ForegroundColor Green

  Write-Section "Replay (anchors)"
  $htmlDefault = Read-TextFile (Join-Path $runDir "replay-default.html")
  $htmlOpt = Read-TextFile (Join-Path $runDir "replay-optin.html")

  curl.exe -sS --max-time 5 "$baseUrl/replay/projects/$($respDefault.project_id)/sessions/$($respDefault.session_id)" | Set-Content -Encoding UTF8 (Join-Path $runDir "replay-default.html")
  curl.exe -sS --max-time 5 "$baseUrl/replay/projects/$($respOpt.project_id)/sessions/$($respOpt.session_id)" | Set-Content -Encoding UTF8 (Join-Path $runDir "replay-optin.html")

  $htmlDefault = Read-TextFile (Join-Path $runDir "replay-default.html")
  $htmlOpt = Read-TextFile (Join-Path $runDir "replay-optin.html")
  $defaultAnchorCount = [regex]::Matches($htmlDefault, 'id="m-\d{6}"').Count
  $optAnchorCount = [regex]::Matches($htmlOpt, 'id="m-\d{6}"').Count
  Assert-True ($defaultAnchorCount -eq 2) "Expected 2 anchors in default replay HTML, got $defaultAnchorCount"
  Assert-True ($optAnchorCount -eq 4) "Expected 4 anchors in opt-in replay HTML, got $optAnchorCount"
  Write-Host "replay anchors ok: default=$defaultAnchorCount opt-in=$optAnchorCount" -ForegroundColor Green

  Write-Section "Export ZIP (default vs opt-in raw filtering)"
  $expDefault = Invoke-BridgeJson $baseUrl "POST" "/bridge/v1/exports" @{
    scope = @{ project_id = $respDefault.project_id; session_id = $respDefault.session_id }
    includes = @{ sessions = $true }
    include_raw_jsonl = $true
    version = "v0.3.4"
  } 60

  $zipDefault = Join-Path $runDir "export-$($expDefault.export_id)-default.zip"
  Invoke-WebRequest -Uri "$baseUrl$($expDefault.download_url)" -OutFile $zipDefault -TimeoutSec 60
  $outDefault = Join-Path $runDir "export-$($expDefault.export_id)-default"
  Expand-Archive -Force $zipDefault $outDefault
  Assert-True (Test-Path (Join-Path $outDefault "00_Index.md")) "Export missing 00_Index.md (default)"
  Assert-True (Test-Path (Join-Path $outDefault "manifest.json")) "Export missing manifest.json (default)"
  Assert-True (Test-Path (Join-Path $outDefault "Sessions")) "Export missing Sessions/ (default)"

  $rawDefaultPath = Join-Path $outDefault ("Sessions\\{0}.jsonl" -f $respDefault.session_id)
  Assert-True (Test-Path $rawDefaultPath) "Export missing Sessions/$($respDefault.session_id).jsonl (default)"
  $rawDefault = Read-TextFile $rawDefaultPath
  Assert-NotContains $rawDefault "function_call_output" "default raw_jsonl"
  Assert-NotContains $rawDefault "<environment_context>" "default raw_jsonl"
  Write-Host "default export ok (raw filtered)" -ForegroundColor Green

  $expOpt = Invoke-BridgeJson $baseUrl "POST" "/bridge/v1/exports" @{
    scope = @{ project_id = $respOpt.project_id; session_id = $respOpt.session_id }
    includes = @{ sessions = $true }
    include_raw_jsonl = $true
    version = "v0.3.4"
  } 60

  $zipOpt = Join-Path $runDir "export-$($expOpt.export_id)-optin.zip"
  Invoke-WebRequest -Uri "$baseUrl$($expOpt.download_url)" -OutFile $zipOpt -TimeoutSec 60
  $outOpt = Join-Path $runDir "export-$($expOpt.export_id)-optin"
  Expand-Archive -Force $zipOpt $outOpt
  $rawOptPath = Join-Path $outOpt ("Sessions\\{0}.jsonl" -f $respOpt.session_id)
  Assert-True (Test-Path $rawOptPath) "Export missing Sessions/$($respOpt.session_id).jsonl (opt-in)"
  $rawOpt = Read-TextFile $rawOptPath
  Assert-Contains $rawOpt "function_call_output" "opt-in raw_jsonl"
  Assert-Contains $rawOpt "<environment_context>" "opt-in raw_jsonl"
  Write-Host "opt-in export ok (raw preserved)" -ForegroundColor Green

  Write-Section "Sync OpenNotebook (filesystem adapter)"
  $sync = Invoke-BridgeJson $baseUrl "POST" "/bridge/v1/projects/$($respOpt.project_id)/sync/open-notebook" @{
    session_id = $respOpt.session_id
    targets = @("sources", "notes")
  } 60

  $notebookId = $sync.notebook.notebook_id
  Assert-True ($notebookId) "sync did not return notebook_id"
  $nbDir = Join-Path $fsRoot ("notebooks\\{0}" -f $notebookId)
  Assert-True (Test-Path $nbDir) "Notebook dir missing: $nbDir"

  $sourcePath = Join-Path $nbDir ("sources\\{0}.md" -f $sync.source_id)
  Assert-True (Test-Path $sourcePath) "Source file missing: $sourcePath"
  $sourceMd = Read-TextFile $sourcePath
  Assert-Contains $sourceMd '<a id="m-000001"></a>' "OpenNotebook source"
  Assert-NotContains $sourceMd "sk-test" "OpenNotebook source redaction"
  Write-Host "open-notebook sources ok (anchors + redaction)" -ForegroundColor Green

  $noteIds = $sync.notes
  $notePaths = @()
  foreach ($kind in @("summary", "study-pack", "milestones")) {
    if ($noteIds.$kind) {
      $notePaths += (Join-Path $nbDir ("notes\\{0}.md" -f $noteIds.$kind))
    }
  }
  Assert-True ($notePaths.Count -ge 1) "Expected at least one note file id"
  foreach ($p in $notePaths) {
    Assert-True (Test-Path $p) "Note file missing: $p"
    $noteMd = Read-TextFile $p
    Assert-Contains $noteMd "Open in Replay" "OpenNotebook note"
    Assert-Contains $noteMd "$baseUrl/replay/projects/$($respOpt.project_id)/sessions/$($respOpt.session_id)#m-000001" "OpenNotebook note"
  }
  Write-Host "open-notebook notes ok (Open in Replay links)" -ForegroundColor Green

  Write-Section "PASS"
  Write-Host "Artifacts: $runDir" -ForegroundColor Green
} finally {
  if ($proc -and -not $proc.HasExited) {
    try { Stop-Process -Id $proc.Id -Force } catch {}
  }

  foreach ($k in $savedEnv.Keys) {
    $v = $savedEnv[$k]
    if ($null -eq $v) { Remove-Item "Env:$k" -ErrorAction SilentlyContinue } else { $env:$k = $v }
  }
}

