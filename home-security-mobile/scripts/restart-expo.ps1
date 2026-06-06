$ErrorActionPreference = "Stop"

$connections = Get-NetTCPConnection -LocalPort 8082 -ErrorAction SilentlyContinue
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

$wifiAddress = Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias "Wi-Fi*" -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -notlike "127.*" -and $_.AddressState -eq "Preferred" } |
  Select-Object -ExpandProperty IPAddress -First 1

if ($wifiAddress) {
  $env:REACT_NATIVE_PACKAGER_HOSTNAME = $wifiAddress
  Write-Host "Using Wi-Fi address for Expo LAN: $wifiAddress"
}

npx expo start --lan -c --port 8082
