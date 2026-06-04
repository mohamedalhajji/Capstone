# Production Deploy

Final architecture:

```text
Mobile app / web dashboard -> Render backend -> Neon PostgreSQL
ESP32 house                -> Render backend
```

The phone and ESP32 do not need to be on the same network.

## Backend

Render deploys the backend from:

```text
C:\Users\moham\سطح المكتب\Capstone\render.yaml
```

Required Render environment variable:

```text
DATABASE_URL=<Neon PostgreSQL connection string>
```

Render also generates `JWT_SECRET` from `render.yaml`.

The deployed backend currently is:

```text
https://capstone-msv5.onrender.com
```

## Apply Production URL

If the backend URL changes, run:

```powershell
powershell -ExecutionPolicy Bypass -File "C:\Users\moham\سطح المكتب\Capstone\scripts\set-production-api.ps1" -ApiUrl "https://YOUR-BACKEND.onrender.com"
```

This updates the Expo environment, EAS profiles, mobile fallback URL, frontend
production URL, and ESP32 integrated firmware URL.

## Upload Firmware

Upload this sketch to the ESP32:

```text
C:\Users\moham\سطح المكتب\Capstone\firmware\home_security_esp32_integrated\home_security_esp32_integrated.ino
```

After upload, the ESP32 only needs normal internet Wi-Fi.

## Build App

```powershell
cd "C:\Users\moham\سطح المكتب\Capstone\home-security-mobile"
$env:EAS_NO_VCS="1"
npx.cmd eas build --platform android --profile preview
```

Do not build the final app until the production API URL and firmware upload are both confirmed.

## Reset Demo Database

Before a final demo, reset old accounts and activity data with:

```powershell
cd "C:\Users\moham\سطح المكتب\Capstone\backend"
npm run db:reset
```

That command resets whichever database is in the current environment. For Neon,
run the SQL in:

```text
C:\Users\moham\سطح المكتب\Capstone\backend\db\reset-demo-db.sql
```
