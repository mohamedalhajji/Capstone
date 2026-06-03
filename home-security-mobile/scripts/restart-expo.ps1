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
  "http://192.168.1.110:5000/api"
}

npx expo start --lan -c
