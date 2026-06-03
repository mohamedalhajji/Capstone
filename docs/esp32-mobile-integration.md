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

## Remote access outside the local Wi-Fi

For off-site control, the backend must be reachable from the internet. The
recommended architecture is:

```text
ESP32 -> Cloud Backend + PostgreSQL <- Mobile App
```

The ESP32 and mobile app should both talk to the same public backend URL, for
example:

```text
https://your-capstone-api.example.com/api
```

Recommended options:

- Deploy the Express backend and PostgreSQL to a cloud host.
- Update `API_BASE_URL` in the ESP32 firmware to the public HTTPS API URL.
- Set `EXPO_PUBLIC_API_URL` in the mobile app to the same public API URL.
- Keep the ESP32 provisioning hotspot only for local Wi-Fi setup/recovery.

Avoid relying on the ESP32 access point for remote control. The AP is local only:
it is useful when standing near the prototype, but it cannot be reached from
outside the house/lab.

See `docs/remote-access.md` for the temporary tunnel and final deployment
workflow.

## Database and demo fallback

The real persistence layer is PostgreSQL. The schema and seed data live at:

```text
backend/db/schema.sql
```

After PostgreSQL is installed and the `home_security_db` database exists, run:

```powershell
cd backend
npm run db:init
```

For live prototype testing when PostgreSQL is not installed or not running, the
backend falls back to an in-memory store. In that mode, the ESP32/app demo still
works, but events and access logs disappear when the backend process restarts.

You can check which storage mode is active at:

```text
GET /api/storage-status
```

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

In the integrated firmware, the ESP32 uses this response to:

- Arm/disarm and move the servo door from app-selected mode changes.
- Open/close the servo door from `door_locked`.
- Pulse the buzzer from `buzzer_on`.
- Run the pump/sprinkler outputs from `sprinkler_on`.
- Run a provisioning reset when `command` is `RESETWIFI`.

### Request ESP32 provisioning hotspot

```http
POST /api/esp/request-wifi-reset
```

This stores a one-time `RESETWIFI` command. On the next ESP32 poll, the backend
returns:

```json
{
  "command": "RESETWIFI"
}
```

The ESP32 clears saved Wi-Fi credentials and starts the `ESP32_Config_Safe`
access point. After this, the normal app/backend connection stops until the ESP32
is provisioned onto Wi-Fi again.

### Physical ESP32 state sync

```http
POST /api/esp/system-state
Content-Type: application/json
```

```json
{
  "mode": "away",
  "door_locked": true,
  "buzzer_on": false,
  "sprinkler_on": false
}
```

The integrated firmware uses this endpoint after local hardware actions such as
NFC arm/disarm, door open/close, alarm activation, and pump clearing. This keeps
the app database aligned with the physical prototype while the ESP32 remains the
authority for immediate safety behavior.

## Firmware options in this repo

The real hardware baseline copied from the attached working code is preserved at:

```text
firmware/home_security_esp32_hardware_baseline.ino
```

The recommended integrated firmware for the final prototype is:

```text
firmware/home_security_esp32_integrated/home_security_esp32_integrated.ino
```

It keeps the working BLE, emergency Wi-Fi provisioning, local web dashboard,
RFID, pumps, buzzer, servo, and sensor logic, then adds backend/mobile
integration.

The older HTTP-only firmware draft remains at:

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

For the integrated firmware, update the backend URL before uploading:

```cpp
const char* API_BASE_URL = "http://192.168.1.102:5000/api";
```

Wi-Fi credentials are configured through the ESP32 emergency provisioning portal
from the real hardware firmware. If no credentials are saved, or if connection
fails, the ESP32 starts the `ESP32_Config_Safe` access point.

If the backend computer gets a different local IP address, change
`API_BASE_URL`.

## Flame sensor analog calibration

The integrated firmware currently uses the threshold from the working hardware
code:

```cpp
int FLAME_THRESHOLD = 4050;
```

The flame modules are treated as active-low analog sensors: lower readings mean
more flame/IR detected. The exact threshold still depends on the sensor module,
wiring, distance, and ambient light. During testing, open Serial Monitor and
compare the printed flame analog values for:

- no flame / normal lighting
- flame close to the sensor
- flame at the expected detection distance

Then set `FLAME_THRESHOLD` between the safe and danger readings.

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
