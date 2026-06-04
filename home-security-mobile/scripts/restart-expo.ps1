$ErrorActionPreference = "Stop"

$connections = Get-NetTCPConnection -LocalPort 8081 -ErrorAction SilentlyContinue
$pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique

foreach ($processId in $pids) {
  if ($processId -and $processId -ne $PID) {
    Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
  }
}

$env:EXPO_PUBLIC_API_URL = if ($env:EXPO_PUBLIC_API_URL) {
  $env:EXPO_PUBLIC_API_URL
} else {
  "https://capstone-msv5.onrender.com/api"
}

npx expo start --lan -c
