$ErrorActionPreference = 'SilentlyContinue'

Write-Output "== Killing listener on 3001 if exists =="
$conn = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($conn) {
  try { Stop-Process -Id $conn.OwningProcess -Force; Write-Output ("Killed " + $conn.OwningProcess) } catch {}
} else {
  Write-Output "No listener on 3001"
}

Write-Output "== Starting server on PORT=3002 =="
$env:PORT = '3002'
Start-Process -FilePath "node" -ArgumentList "app.js" -WorkingDirectory (Get-Location) -WindowStyle Hidden
Start-Sleep -Seconds 2

Write-Output "== GET /api/history?mode=cv&limit=3 =="
try {
  (Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:3002/api/history?mode=cv&limit=3').Content | Write-Output
} catch { Write-Error $_ }

Write-Output "== GET /api/history/stats?mode=cv =="
try {
  (Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:3002/api/history/stats?mode=cv').Content | Write-Output
} catch { Write-Error $_ }


