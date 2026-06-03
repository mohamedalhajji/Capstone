# Final Integration Test Plan

This checklist maps the final demo tests to the capstone report objectives:
intrusion detection, fire/gas detection, NFC access control, remote monitoring,
event history, and reliable ESP32 operation after USB disconnection.

## System Setup

1. Start the backend:

   ```powershell
   cd backend
   npm start
   ```

2. Confirm backend health:

   ```text
   http://<computer-lan-ip>:5000/api/health
   ```

   If PostgreSQL is not running, the backend returns `memory-fallback`. This is
   acceptable for prototype demo testing, but final persistent database testing
   should use PostgreSQL.

3. Open the ESP32 local dashboard:

   ```text
   http://<esp32-ip>
   ```

4. Open the web dashboard:

   ```powershell
   cd frontend
   npm run dev
   ```

5. For the mobile app, set the backend URL to the computer LAN IP:

   ```powershell
   cd home-security-mobile
   $env:EXPO_PUBLIC_API_URL='http://<computer-lan-ip>:5000/api'
   npm start
   ```

## Database Setup

Install PostgreSQL, create the database named in `backend/.env`, then run:

```powershell
cd backend
npm run db:init
```

The schema creates:

- `system_state`
- `sensors`
- `events`
- `notifications`
- `access_logs`

It also seeds the sensor names used by the ESP32 firmware.

## Scenario Tests

| Test | Action | Expected Local Hardware Result | Expected Backend/App Result |
| --- | --- | --- | --- |
| Backend command polling | Set mode to Away in app/web | ESP32 enters armed mode | `/api/esp/commands` returns `mode: away` |
| Authorized NFC | Scan authorized card | Door opens/disarms, buzzer clears | Access log granted, event/notification recorded |
| Unauthorized NFC | Scan wrong card | Buzzer warning; alarm after repeated failures | Access log denied, unauthorized event recorded |
| PIR intrusion | Arm Away, trigger PIR | Buzzer alarm | Motion event with high severity |
| Reed/vibration intrusion | Arm Away, open reed or trigger vibration | Buzzer alarm | Door/vibration event recorded |
| Flame detection | Trigger flame sensor carefully | Correct pump activates, buzzer alarm | Flame critical event, sprinkler state active |
| Smoke/gas detection | Trigger MQ/smoke sensor | Buzzer alarm | Gas high-severity event |
| Reset | Press Reset in app/web | Buzzer/sprinkler state clears | `system_state` outputs reset |
| USB removal | Run from external power | System continues reading sensors | ESP32 remains accessible by Wi-Fi |

## Evidence To Capture

- Serial Monitor showing `[API] POST ... -> 200`.
- ESP32 local dashboard screenshot.
- Web/mobile dashboard screenshot with event history.
- Access log screenshot after NFC tests.
- Photo/video of pump activation from flame test.
- Short note confirming operation from external power after USB disconnect.
