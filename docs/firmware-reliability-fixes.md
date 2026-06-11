# Firmware Reliability Fixes

These changes protect the ESP32 control loop from network stalls and keep local safety actions in charge.

## Problems Fixed

- Cloud blocking: backend calls could hold the main loop long enough to stop sensor reads.
- NFC lockout: the NFC reader was skipped while danger outputs were active, so the master card could not silence an alarm.
- False PIR alarms: short electrical noise pulses could trigger motion because the interrupt path bypassed filtering.
- Buzzer delay: alarm sound could wait behind cloud reporting instead of starting locally.

## Current Behavior

- Cloud telemetry is placed in a small async queue and flushed between sensor passes with short HTTP timeouts and failure backoff.
- The NFC reader is always checked while the system is active. An authorized card calls `clearActiveOutputs()` before changing door/mode state.
- PIR motion must stay high for `1000` ms before it is treated as a breach.
- `startAlarmBurst()` switches the buzzer relay on immediately, then telemetry is queued for the mobile/backend path.

