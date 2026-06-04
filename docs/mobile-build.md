# Mobile App Build

The Expo preview build is configured to use the production Render backend.

## Current API

```text
https://capstone-msv5.onrender.com/api
```

This is set in:

- `home-security-mobile/.env`
- `home-security-mobile/eas.json`
- `home-security-mobile/src/api/client.ts`

## Build Android Preview APK

```powershell
cd "C:\Users\moham\سطح المكتب\Capstone\home-security-mobile"
$env:EAS_NO_VCS="1"
npx.cmd eas build --platform android --profile preview
```

The result is an installable APK link from Expo.

## Build iPhone Preview

```powershell
cd "C:\Users\moham\سطح المكتب\Capstone\home-security-mobile"
$env:EAS_NO_VCS="1"
npx.cmd eas build --platform ios --profile preview
```

iOS preview builds may ask for Apple account access and device registration.

## Notes

- Expo Go is only for development.
- A preview EAS build includes the JavaScript bundle in the installed app.
- The installed app works over cellular or any Wi-Fi as long as the Render backend is reachable.
