param(
  [Parameter(Mandatory = $true)]
  [string]$ApiUrl
)

$root = Split-Path -Parent $PSScriptRoot
$base = $ApiUrl.TrimEnd("/")
$api = $base

if (-not $api.EndsWith("/api")) {
  $api = "$api/api"
}

if ($base.EndsWith("/api")) {
  $base = $base.Substring(0, $base.Length - 4)
}

$mobileEnv = Join-Path $root "home-security-mobile\.env"
$easJson = Join-Path $root "home-security-mobile\eas.json"
$mobileClient = Join-Path $root "home-security-mobile\src\api\client.ts"
$frontendEnv = Join-Path $root "frontend\.env.production"
$frontendApp = Join-Path $root "frontend\src\App.jsx"
$firmware = Join-Path $root "firmware\home_security_esp32_integrated\home_security_esp32_integrated.ino"

Set-Content -LiteralPath $mobileEnv -Value "EXPO_PUBLIC_API_URL=$api"

$eas = Get-Content -LiteralPath $easJson -Raw
$eas = $eas -replace '"EXPO_PUBLIC_API_URL":\s*"[^"]+"', "`"EXPO_PUBLIC_API_URL`": `"$api`""
Set-Content -LiteralPath $easJson -Value $eas

$client = Get-Content -LiteralPath $mobileClient -Raw
$client = $client -replace "'https://[^']+(?:/api)?'", "'$api'"
Set-Content -LiteralPath $mobileClient -Value $client

Set-Content -LiteralPath $frontendEnv -Value "VITE_API_URL=$base"

$frontend = Get-Content -LiteralPath $frontendApp -Raw
$frontend = $frontend -replace '"https://[^"]+"', "`"$base`""
Set-Content -LiteralPath $frontendApp -Value $frontend

$fw = Get-Content -LiteralPath $firmware -Raw
$fw = $fw -replace 'const char\* API_BASE_URL = "[^"]+";', "const char* API_BASE_URL = `"$api`";"
Set-Content -LiteralPath $firmware -Value $fw

Write-Host "Production API set to $api"
Write-Host "Production base set to $base"
