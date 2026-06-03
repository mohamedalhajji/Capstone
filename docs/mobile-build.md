# Mobile App Build

The Expo app is configured for EAS builds.

## Current API Mode

The preview build uses:

```text
https://bias-customized-specific-profit.trycloudflare.com/api
```

This URL is a temporary Cloudflare tunnel. If the tunnel changes, update:

- `home-security-mobile/.env`
- `home-security-mobile/eas.json`

## Login

```powershell
cd home-security-mobile
npx eas login
```

## iPhone Build

For a physical iPhone, use:

```powershell
npx eas build --platform ios --profile preview
```

EAS may ask for Apple account access and device registration. This is normal for
installing an iOS app outside the App Store/TestFlight.

## Android Build

For Android APK testing:

```powershell
npx eas build --platform android --profile preview
```

This creates an installable APK link.

## Notes

- Expo Go is a development shell and needs Metro. It is not a packaged app.
- A preview EAS build includes the JavaScript bundle in the installed app.
- The installed app can work over cellular as long as the backend API URL is
  public and reachable.
