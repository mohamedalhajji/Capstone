# Production Deploy

Final architecture:

```text
Mobile app / web dashboard -> public backend URL -> cloud PostgreSQL
ESP32 house                -> public backend URL
```

The phone and ESP32 do not need to be on the same network.

The mobile app and web dashboard require a saved user login. The ESP32 uses the
public `/api/esp/*` endpoints so it can keep polling commands independently.

## 1. Create Cloud PostgreSQL

Use Neon or Render Postgres.

Copy the Postgres connection string. It should look like:

```text
postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require
```

## 2. Deploy Backend

Use Render Blueprint from the repository root:

```text
render.yaml
```

Set this environment variable in Render:

```text
DATABASE_URL=<your cloud postgres connection string>
```

Render also generates `JWT_SECRET` from `render.yaml`.

Render will run:

```text
npm install
npm run db:init
npm start
```

## 3. Set The Production API URL

When Render gives the backend URL, run:

```powershell
powershell -ExecutionPolicy Bypass -File "C:\Users\moham\سطح المكتب\Capstone\scripts\set-production-api.ps1" -ApiUrl "https://YOUR-BACKEND.onrender.com"
```

This updates:

- Expo `.env`
- Expo `eas.json`
- mobile API client fallback
- ESP32 integrated firmware `API_BASE_URL`

## 4. Upload Firmware

Upload:

```text
C:\Users\moham\سطح المكتب\Capstone\firmware\home_security_esp32_integrated\home_security_esp32_integrated.ino
```

The ESP32 only needs normal internet Wi-Fi after this.

## 5. Build App

```powershell
cd "C:\Users\moham\سطح المكتب\Capstone\home-security-mobile"
$env:EAS_NO_VCS="1"
npx.cmd eas build --platform android --profile preview
```

Do not build the final app until the production API URL is confirmed and applied.
