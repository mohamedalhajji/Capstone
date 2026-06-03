# Remote Access Setup

The local lab setup works like this:

```text
ESP32 -> Laptop backend -> PostgreSQL
Phone -> Laptop backend
```

That only works when every device can reach the laptop over the same Wi-Fi.
True remote access needs a backend URL that is reachable from outside the local
network.

## Recommended Final Architecture

```text
ESP32 -> Public Backend + PostgreSQL <- Mobile App
```

Deploy the Express backend and PostgreSQL to a cloud provider, then point both
clients to the public API:

- ESP32 `API_BASE_URL`
- Expo `EXPO_PUBLIC_API_URL`

Example:

```text
https://home-security-api.example.com/api
```

## Temporary Demo Tunnel

For short testing sessions, a tunnel can expose the local backend:

```powershell
cd backend
npm start
```

Then, in another terminal:

```powershell
npx localtunnel --port 5000
```

If it prints a URL like:

```text
https://some-name.loca.lt
```

use:

```text
https://some-name.loca.lt/api
```

Set Expo:

```powershell
$env:EXPO_PUBLIC_API_URL='https://some-name.loca.lt/api'
npm run restart:lan
```

Set ESP32 firmware:

```cpp
const char* API_BASE_URL = "https://some-name.loca.lt/api";
```

Then upload the firmware.

## Important Limits

- A tunnel URL is temporary and may change every time.
- A laptop tunnel only works while the laptop and backend are running.
- The ESP32 hotspot is local-only. It is for Wi-Fi setup/reconfiguration, not
  remote control.
- For final presentation, a real cloud backend is more stable than a temporary
  tunnel.
