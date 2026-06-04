# Final Integration Test Plan

This checklist maps the final demo tests to the capstone objectives:
intrusion detection, fire/gas detection, NFC access control, remote monitoring,
event history, user authentication, cloud database persistence, and reliable
ESP32 operation.

## System Setup

1. Confirm the Render backend health:

   ```text
   https://capstone-msv5.onrender.com/api/health
   ```

2. Confirm the mobile app API is:

   ```text
   https://capstone-msv5.onrender.com/api
   ```

3. Upload the integrated ESP32 firmware:

   ```text
   C:\Users\moham\سطح المكتب\Capstone\firmware\home_security_esp32_integrated\home_security_esp32_integrated.ino
   ```

4. Confirm the ESP32 Serial Monitor shows successful backend requests:

   ```text
   [API] ... -> 200
   ```

## Scenario Tests

| Test | Action | Expected Hardware Result | Expected App/Backend Result |
| --- | --- | --- | --- |
| Signup/login | Create account, close app, reopen | No hardware action | Session is remembered; user data saved in Neon |
| Remote command | Use app on cellular or different Wi-Fi | ESP32 receives command through Render | State updates in the app |
| Arm away | Set mode to Away | ESP32 enters armed mode | System mode changes to away |
| Disarm/reset | Press Clear/Reset | Buzzer, pump, and active outputs stop | System clears active alarm state |
| Authorized NFC | Scan authorized card | Door opens/disarms, buzzer clears | Access log granted |
| Unauthorized NFC | Scan wrong card | Warning/alarm behavior triggers | Access log denied and event recorded |
| PIR intrusion | Arm Away, trigger PIR | Buzzer alarm | Motion event appears in Activity |
| Door/reed intrusion | Arm Away, open door | Buzzer alarm | Door event appears in Activity |
| Vibration intrusion | Trigger vibration | Buzzer alarm | Vibration event appears in Activity |
| Flame detection | Trigger flame sensor carefully | Pump activates and buzzer alarms | Flame event appears in Activity |
| Smoke/gas detection | Trigger MQ/smoke sensor | Buzzer alarm | Gas event appears in Activity |
| Wi-Fi setup | Request ESP32 Wi-Fi setup while ESP32 is online | ESP32 starts setup portal | App shows command sent |

## Evidence To Capture

- Mobile login/signup screenshots.
- Activity tab showing physical sensor events.
- Access log after NFC tests.
- Serial Monitor showing successful Render API calls.
- Short video of remote app command controlling the physical house.
- Photo/video of alarm and pump behavior.
