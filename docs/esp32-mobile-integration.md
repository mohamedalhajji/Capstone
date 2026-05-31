# ESP32 and Android App Integration Notes

## Computer engineering scope from the report

The report assigns the Computer Engineering side to the web/mobile notification
interface, Wi-Fi communication, database-backed event history, and integration
support between the ESP32 hardware and the monitoring application.

The app should support:

- System modes: `disarmed`, `home`, and `away`.
- Live sensor status for motion, gas/smoke, flame, magnetic door, vibration,
  and NFC/access events.
- Event history and notification records.
- User controls for arming/disarming.
- Testing paths for hardware events before the sensors are physically available.

## Current software architecture

Android app -> Express API -> PostgreSQL database

ESP32 -> Express API -> PostgreSQL database -> Android app

The ESP32 should not connect directly to the mobile app or database. It should
send HTTP requests to the Express backend over Wi-Fi. The backend owns the
database writes, alarm rules, notification records, and app-facing responses.

## Backend address

The backend now listens on the port configured in `backend/.env`. In the
current local setup this is:

```text
http://<computer-lan-ip>:5000
```

For an Android emulator, the Expo app defaults to:

```text
http://192.168.1.101:5000/api
```

For a real Android phone, start Expo with:

```powershell
$env:EXPO_PUBLIC_API_URL='http://<computer-lan-ip>:5000/api'
npm start
```

The phone and computer must be on the same Wi-Fi network.

## ESP32 endpoints

### Sensor event

```http
POST /api/esp/sensor-event
Content-Type: application/json
```

```json
{
  "sensor_name": "motion_living_room"
}
```

Accepted `sensor_name` values must match the existing `sensors.sensor_name`
records in the database, for example:

- `motion_living_room`
- `gas_kitchen`
- `flame_kitchen`
- `door_main`
- `vibration_window`

### NFC access

```http
POST /api/esp/nfc-access
Content-Type: application/json
```

```json
{
  "authorized": true,
  "nfc_uid": "123ABC",
  "user_name": "Authorized User"
}
```

Use `authorized: false` for unknown/denied tags.

### Commands for ESP32

```http
GET /api/esp/commands
```

Response:

```json
{
  "mode": "away",
  "buzzer_on": true,
  "sprinkler_on": false,
  "door_locked": true,
  "updated_at": "2026-05-31T12:00:00.000Z"
}
```

The ESP32 can poll this endpoint to learn the latest app-selected mode and
actuator state.

## Firmware option in this repo

I added an HTTP-based firmware draft at:

```text
firmware/home_security_esp32_http/home_security_esp32_http.ino
```

This is based on the tested ESP32 code from the hardware team, with these
changes:

- Adds `WiFi.h` and `HTTPClient.h`.
- Sends sensor alarms to `POST /api/esp/sensor-event`.
- Sends NFC access results to `POST /api/esp/nfc-access`.
- Polls `GET /api/esp/commands` so app mode changes can reach the ESP32.
- Changes flame sensors from `digitalRead()` to `analogRead()`.

Before uploading, update:

```cpp
const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* API_BASE_URL = "http://192.168.1.102:5000/api";
```

If the backend computer gets a different local IP address, change
`API_BASE_URL`.

## Flame sensor analog calibration

The new firmware uses:

```cpp
int FLAME_THRESHOLD = 1200;
bool FLAME_ACTIVE_LOW_ANALOG = true;
```

Most flame modules output a lower analog value when flame/IR is detected, but
the exact threshold depends on the sensor module, wiring, distance, and ambient
light. During testing, open Serial Monitor and compare the printed flame analog
values for:

- no flame / normal lighting
- flame close to the sensor
- flame at the expected detection distance

Then set `FLAME_THRESHOLD` between the safe and danger readings. If their module
works in the opposite direction, set `FLAME_ACTIVE_LOW_ANALOG` to `false`.

## HTTP vs MQTT recommendation

For this capstone, HTTP is the better first choice:

- One ESP32 device is sending simple events.
- The backend and PostgreSQL database already exist.
- The Android app already reads from the backend.
- HTTP is easier for the hardware team to test with Serial Monitor and simple
  backend logs.
- It avoids needing a separate MQTT broker, topic design, retained messages,
  broker credentials, and broker deployment.

MQTT would make sense if the project grows into many ESP32 boards, needs very
low-latency two-way messaging, or needs a dedicated IoT broker. In that version,
the backend would subscribe to MQTT topics and write events into PostgreSQL;
the Android app should still talk to the backend, not directly to the ESP32.

## Testing before hardware is available

The Android app has a Simulation tab. Those buttons call the simulation
endpoints, which run the same backend rules used by the ESP32 sensor endpoint.
This lets the software side test dashboard updates, event history, and mode
logic without the physical sensors.
