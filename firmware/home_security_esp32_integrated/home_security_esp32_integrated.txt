#include <SPI.h>
#include <MFRC522.h>
#include <ESP32Servo.h>
#include <Wire.h>
#define ENABLE_BLE 0
#if ENABLE_BLE
#include <BLEDevice.h> 
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#endif
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <WebServer.h>
#include <Preferences.h> 
#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"
#include <string.h>

#define RELAY_ON  LOW
#define RELAY_OFF HIGH

// --- Emergency Provisioning Web Settings ---
const char* ap_ssid = "Home Security System";       
const char* ap_password = "";                    
const String SYSTEM_ADMIN_PASSWORD = "12345678"; 

// --- Backend / Mobile App Integration ---
// Production cloud backend. The ESP32 can be on any Wi-Fi as long as it has internet.
const char* API_BASE_URL = "https://capstone-msv5.onrender.com/api";

const char* SENSOR_MOTION_HALLWAY = "motion_hallway";
const char* SENSOR_MOTION_GARAGE = "motion_garage";
const char* SENSOR_SMOKE_KITCHEN = "smoke_kitchen";
const char* SENSOR_SMOKE_HALLWAY = "smoke_hallway";
const char* SENSOR_SMOKE_LIVING_ROOM = "smoke_living_room";
const char* SENSOR_FLAME_KITCHEN = "flame_kitchen";
const char* SENSOR_FLAME_ROOM_1 = "flame_room_1";
const char* SENSOR_FLAME_ROOM_2 = "flame_room_2";
const char* SENSOR_WINDOW_1 = "window_1_reed";
const char* SENSOR_WINDOW_2 = "window_2_reed";
const char* SENSOR_WINDOW_3 = "window_3_reed";
const char* SENSOR_VIBRATION_GARAGE_DOOR = "vibration_garage_door";

const unsigned long REPORT_COOLDOWN_MS = 5000;
const unsigned long COMMAND_POLL_INTERVAL_MS = 5000;
const unsigned long WIFI_CONNECT_TIMEOUT_MS = 20000;
const unsigned long WIFI_RETRY_INTERVAL_MS = 30000;
const unsigned long WIFI_RETRY_ATTEMPT_TIMEOUT_MS = 10000;
const unsigned long WIFI_SCAN_CACHE_MS = 60000;
const unsigned long WIFI_LOST_TO_SETUP_MS = 30000;
const unsigned long API_FLUSH_INTERVAL_MS = 100;
const unsigned long API_FAILURE_BACKOFF_MS = 5000;
const unsigned long AWAY_ARM_DELAY_MS = 500;
const unsigned long ALARM_BURST_DURATION_MS = 5000;
const unsigned long ALARM_CHIRP_ON_MS = 80;
const unsigned long ALARM_CHIRP_OFF_MS = 90;
const unsigned long ALARM_BURST_PAUSE_MS = 420;
const unsigned long WRONG_CARD_BEEP_ON_MS = 70;
const unsigned long WRONG_CARD_BEEP_OFF_MS = 70;
const unsigned long CONNECTED_BEEP_ON_MS = 55;
const unsigned long CONNECTED_BEEP_OFF_MS = 65;
const int ALARM_CHIRPS_PER_BURST = 3;
const int WRONG_CARD_BEEP_STEPS = 4;
const int CONNECTED_BEEP_STEPS = 4;
const int MAX_WRONG_CARD_ATTEMPTS = 5;
const int MAX_PENDING_API_REQUESTS = 12;
const uint16_t HTTP_CONNECT_TIMEOUT_MS = 2000;
const uint16_t HTTP_READ_TIMEOUT_MS = 3000;

struct SensorReportCooldown {
  const char* sensorName;
  unsigned long lastReportTime;
};

SensorReportCooldown sensorReportCooldowns[] = {
  { SENSOR_MOTION_HALLWAY, 0 },
  { SENSOR_MOTION_GARAGE, 0 },
  { SENSOR_SMOKE_KITCHEN, 0 },
  { SENSOR_SMOKE_HALLWAY, 0 },
  { SENSOR_SMOKE_LIVING_ROOM, 0 },
  { SENSOR_FLAME_KITCHEN, 0 },
  { SENSOR_FLAME_ROOM_1, 0 },
  { SENSOR_FLAME_ROOM_2, 0 },
  { SENSOR_WINDOW_1, 0 },
  { SENSOR_WINDOW_2, 0 },
  { SENSOR_WINDOW_3, 0 },
  { SENSOR_VIBRATION_GARAGE_DOOR, 0 },
};

unsigned long lastCommandPollTime = 0;
unsigned long lastWifiScanTime = 0;
unsigned long wifiDisconnectedSince = 0;
unsigned long lastWifiRetryAttemptTime = 0;
unsigned long wifiRetryAttemptStartedAt = 0;
unsigned long lastApiFlushTime = 0;
unsigned long lastApiFailureTime = 0;
int consecutiveApiFailures = 0;
int wifiRetryAttemptNumber = 0;

struct PendingApiRequest {
  String path;
  String body;
};

PendingApiRequest pendingApiRequests[MAX_PENDING_API_REQUESTS];
int pendingApiHead = 0;
int pendingApiCount = 0;

WebServer server(80);
Preferences preferences;
IPAddress setupApIp(192, 168, 4, 1);
IPAddress setupApGateway(192, 168, 4, 1);
IPAddress setupApSubnet(255, 255, 255, 0);

String webDashboardHTML = "";
String configPageHTML = "";
String saved_ssid = "";
String saved_password = "";
bool wifiConnected = false;
bool isConfigModeActive = false;
bool isAdminAuthenticated = false;
bool wifiRetryInProgress = false;
bool serverRoutesConfigured = false;
bool ignoreNextResetWifiCommand = false;
bool ignoredRecentResetWifiCommand = false;
String provisionedSsidGuard = "";

// Variables for keeping discovered networks globally to avoid crashes
int discoveredNetworksCount = 0;
String scannedNetworksOptions = "";

// --- BLE Configuration ---
#define SERVICE_UUID           "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
#define RX_CHARACTERISTIC_UUID "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"
#define TX_CHARACTERISTIC_UUID "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"

bool deviceConnected = false; 
bool bleActive = false; 
String bleIncomingCommand = "";
#if ENABLE_BLE
BLEServer *pServer = nullptr;
BLECharacteristic *pTxCharacteristic = nullptr;
#endif

// --- Smart 5-Minute Timer Variables ---
unsigned long wifiConnectSuccessTime = 0; 
const unsigned long bleTimeoutDuration = 300000; // 300,000 ms = 5 Minutes
bool bleTimeoutTriggered = false;

// --- Servo Configuration ---
#define SERVO_PIN    13
const int OPEN_ANGLE = 170;       
const int CLOSE_ANGLE = 12;       
const unsigned long SERVO_SETTLE_MS = 650;

// --- Sensor & Actuator Pin Mapping ---
#define SMOKE_1_PIN  36  
#define FLAME_1_PIN  34  
#define PUMP_1_PIN   25
#define FLAME_2_PIN  35  
#define PUMP_2_PIN   26
#define SMOKE_2_PIN  39  
#define PIR_1_PIN    2
#define BUZZER_PIN   14
#define rfid_RST_PIN 4
#define rfid_SS_PIN  5
#define SMOKE_3_PIN  33  
#define FLAME_3_PIN  32  
#define PUMP_3_PIN   27
#define PIR_2_PIN    15  
#define PCF8574_ADDRESS 0x20

MFRC522 rfid(rfid_SS_PIN, rfid_RST_PIN);
Servo doorServo;

int SMOKE_THRESHOLD = 900;  
int HALLWAY_SMOKE_THRESHOLD = 1080;
int FLAME_THRESHOLD = 3200;  
const unsigned long GAS_SAMPLE_INTERVAL_MS = 100;
const unsigned long FLAME_SAMPLE_INTERVAL_MS = 120;
const unsigned long PUMP_RUN_MS = 6000;
const unsigned long FIRE_SENSOR_HOLD_MS = 2500;
const unsigned long LOCAL_FIRE_ECHO_IGNORE_MS = 30000;
const int FIRE_CONFIRM_SAMPLES = 4;
const int GAS_CONFIRM_SAMPLES = 6;
const int HALLWAY_GAS_CONFIRM_SAMPLES = 14;
const int REED_CONFIRM_SAMPLES = 4;
const int VIBRATION_CONFIRM_SAMPLES = 1;
const int FLAME_CLEAR_MARGIN = 80;
const int GAS_CLEAR_MARGIN = 120;

bool systemActive = true; 
bool awayMode = false; 
bool doorOpen = true; 

unsigned long lastPrintTime = 0;
const unsigned long printInterval = 10000; 

unsigned long lastSmokeCheckTime = 0; 
unsigned long lastFlameCheckTime = 0; 
unsigned long lastNFCCheckTime = 0; 
unsigned long lastNfcIdleRefreshTime = 0;
unsigned long lastExpanderCheckTime = 0; 
unsigned long lastThreatLogRefreshTime = 0;
unsigned long lastContinuousAlertTime = 0;
bool backendBuzzerLatched = false;
bool backendSprinklerLatched = false;
bool feedbackBuzzerActive = false;
unsigned long feedbackBuzzerUntil = 0;
bool wrongCardBeepActive = false;
bool triggerAlarmAfterWrongCardBeeps = false;
unsigned long lastWrongCardBeepToggle = 0;
int wrongCardBeepStep = 0;
bool connectedBeepActive = false;
unsigned long lastConnectedBeepToggle = 0;
int connectedBeepStep = 0;
bool alarmBuzzerOutput = false;
unsigned long lastAlarmBuzzerToggle = 0;
int alarmBurstChirpCount = 0;

unsigned long hallwayPIR_Timer = 0;
unsigned long garagePIR_Timer = 0;
const unsigned long pirDebounceTime = 900;
const unsigned long PIR_PULSE_LATCH_MS = 0;
volatile bool hallwayPIR_Pulse = false;
volatile bool garagePIR_Pulse = false;
unsigned long hallwayPIR_LatchUntil = 0;
unsigned long garagePIR_LatchUntil = 0;

bool isIntrusionActive = false;
unsigned long intrusionTimer = 0;
bool isFireActive = false;
unsigned long fireTimer = 0;
bool fireConditionLatched = false;
bool gasConditionLatched = false;
bool kitchenGasReported = false;
bool hallwayGasReported = false;
bool livingGasReported = false;

bool pump1State = false; unsigned long pump1Timer = 0;
bool pump2State = false; unsigned long pump2Timer = 0;
bool pump3State = false; unsigned long pump3Timer = 0;
unsigned long kitchenFireLastSeen = 0;
unsigned long room1FireLastSeen = 0;
unsigned long room2FireLastSeen = 0;
unsigned long lastLocalFireTriggerTime = 0;
int kitchenFlameCounter = 0;
int room1FlameCounter = 0;
int room2FlameCounter = 0;
int kitchenGasCounter = 0;
int hallwayGasCounter = 0;
int livingGasCounter = 0;

bool pendingAwayMode = false;
unsigned long awayModeActivationTimer = 0;

const unsigned long NFC_KEEPALIVE_MS = 250;
const unsigned long NFC_IDLE_REFRESH_MS = 1000;
const unsigned long NFC_RELEASE_MS = 350;
const unsigned long NFC_HELD_STUCK_MS = 900;
const unsigned long LOCAL_DOOR_OVERRIDE_MS = 5000;
const unsigned long LOCAL_MODE_OVERRIDE_MS = 8000;
const unsigned long NFC_ARM_SETTLE_MS = 5000;
const unsigned long NFC_MOTION_IGNORE_MS = 1500;
const unsigned long REED_MOTION_COOLDOWN_MS = 1000;
const unsigned long SENSOR_CHANGE_SETTLE_MS = 1500;
int wrongCardCount = 0; 
bool nfcCardHeld = false;
unsigned long nfcLastSeenTime = 0;
unsigned long localDoorOverrideUntil = 0;
unsigned long localModeOverrideUntil = 0;
unsigned long ignoreIntrusionUntil = 0;
unsigned long ignoreMotionReportUntil = 0;

byte authorizedUID[] = {0xA3, 0x24, 0x0B, 0x07}; 

bool reed1 = false, reed2 = false, reed3 = false, vibration = false;
int kitchenSmoke = 0, hallwaySmoke = 0, livingSmoke = 0;

int kitchenFlame = 4095;
int room1Flame = 4095;
int room2Flame = 4095;

int reed1Counter = 0;
int reed2Counter = 0;
int reed3Counter = 0;
int vibrationCounter = 0;

bool hallwayPIR_Raw = false;
bool garagePIR_Raw = false;
bool hallwayPIR_Triggered = false;
bool garagePIR_Triggered = false;
bool lastPhysicalVibrationTriggered = false;
bool lastHallwayPIRTriggered = false;
bool lastGaragePIRTriggered = false;
bool lastReed1Triggered = false;
bool lastReed2Triggered = false;
bool lastReed3Triggered = false;

String activeThreatLog = "";

void startEmergencySystems();
void stopBLEHardware();
void configureServerRoutes();
void serviceSavedWifiConnection();
void beginSavedWifiRetry(bool force);
void onSavedWifiConnected();

void sendBLE(String text) {
#if ENABLE_BLE
  if (bleActive && deviceConnected && pTxCharacteristic != nullptr) {
    pTxCharacteristic->setValue(text.c_str());
    pTxCharacteristic->notify();
    delay(15); 
  }
#else
  (void)text;
#endif
}

void IRAM_ATTR onHallwayPIRRise() {
  hallwayPIR_Pulse = true;
}

void IRAM_ATTR onGaragePIRRise() {
  garagePIR_Pulse = true;
}

// --- Cross-Path Instant Telemetry Broadcaster ---
void broadcastAlert(String message) {
  Serial.print(message);
  if (bleActive && deviceConnected) { sendBLE(message); }
}

void reconnectSavedWifiAfterApiFailures() {
  if (saved_ssid.length() == 0 || isConfigModeActive) return;

  Serial.println("\n[API]: Backend still failing. Keeping Wi-Fi connected; will retry commands.");
  ignoredRecentResetWifiCommand = false;
  lastCommandPollTime = millis();
}

bool localIoNeedsPriority() {
  return isIntrusionActive ||
         isFireActive ||
         pump1State ||
         pump2State ||
         pump3State;
}

void noteApiSuccess() {
  consecutiveApiFailures = 0;
}

void noteApiFailure(String label, int code, HTTPClient& http) {
  consecutiveApiFailures++;
  lastApiFailureTime = millis();
  if (consecutiveApiFailures == 1 || consecutiveApiFailures >= 3) {
    Serial.printf("\n[API] %s -> %d (failure %d)\n", label.c_str(), code, consecutiveApiFailures);
    if (code < 0) Serial.println(http.errorToString(code));
  }

  if (consecutiveApiFailures >= 5) {
    consecutiveApiFailures = 0;
    reconnectSavedWifiAfterApiFailures();
  }
}

bool postJson(String path, String body) {
  if (WiFi.status() != WL_CONNECTED || isConfigModeActive) return false;

  HTTPClient http;
  String url = String(API_BASE_URL) + path;
  WiFiClientSecure secureClient;
  bool secure = url.startsWith("https://");

  if (secure) {
    secureClient.setInsecure();
    secureClient.setHandshakeTimeout(15);
    http.begin(secureClient, url);
  } else {
    http.begin(url);
  }

  http.setConnectTimeout(HTTP_CONNECT_TIMEOUT_MS);
  http.setTimeout(HTTP_READ_TIMEOUT_MS);
  http.setReuse(false);
  http.addHeader("Content-Type", "application/json");
  int code = http.POST(body);
  String response = http.getString();
  http.end();

  Serial.printf("\n[API] POST %s -> %d\n", path.c_str(), code);
  if (response.length() > 0) Serial.println(response);

  if (code >= 200 && code < 300) {
    noteApiSuccess();
    return true;
  }

  noteApiFailure(String("POST ") + path, code, http);
  return false;
}

bool enqueuePostJson(String path, String body) {
  for (int i = 0; i < pendingApiCount; i++) {
    int index = (pendingApiHead + i) % MAX_PENDING_API_REQUESTS;
    if (pendingApiRequests[index].path == path && pendingApiRequests[index].body == body) {
      return true;
    }
  }

  int insertIndex;
  if (pendingApiCount >= MAX_PENDING_API_REQUESTS) {
    insertIndex = pendingApiHead;
    pendingApiHead = (pendingApiHead + 1) % MAX_PENDING_API_REQUESTS;
    pendingApiCount--;
    Serial.println("\n[API]: Queue full. Dropping oldest telemetry update.");
  } else {
    insertIndex = (pendingApiHead + pendingApiCount) % MAX_PENDING_API_REQUESTS;
  }

  pendingApiRequests[insertIndex].path = path;
  pendingApiRequests[insertIndex].body = body;
  pendingApiCount++;
  return true;
}

void processPendingApiRequests() {
  if (pendingApiCount == 0 || WiFi.status() != WL_CONNECTED || isConfigModeActive) return;
  if (localIoNeedsPriority()) return;
  if (millis() - lastApiFlushTime < API_FLUSH_INTERVAL_MS) return;
  if (consecutiveApiFailures >= 3 && millis() - lastApiFailureTime < API_FAILURE_BACKOFF_MS) return;

  lastApiFlushTime = millis();
  PendingApiRequest request = pendingApiRequests[pendingApiHead];
  if (postJson(request.path, request.body)) {
    pendingApiHead = (pendingApiHead + 1) % MAX_PENDING_API_REQUESTS;
    pendingApiCount--;
  }
}

unsigned long* reportTimerForSensor(const char* sensorName) {
  for (size_t i = 0; i < sizeof(sensorReportCooldowns) / sizeof(sensorReportCooldowns[0]); i++) {
    if (strcmp(sensorName, sensorReportCooldowns[i].sensorName) == 0) {
      return &sensorReportCooldowns[i].lastReportTime;
    }
  }

  return nullptr;
}

void reportSensorEvent(const char* sensorName) {
  unsigned long* lastReportTime = reportTimerForSensor(sensorName);
  if (lastReportTime == nullptr) return;
  if (*lastReportTime != 0 && millis() - *lastReportTime < REPORT_COOLDOWN_MS) return;

  *lastReportTime = millis();
  String body = String("{\"sensor_name\":\"") + sensorName + "\"}";
  enqueuePostJson("/esp/sensor-event", body);
}

void reportNfcAccess(bool authorized) {
  String uid = "";

  for (byte i = 0; i < rfid.uid.size; i++) {
    if (rfid.uid.uidByte[i] < 0x10) uid += "0";
    uid += String(rfid.uid.uidByte[i], HEX);
  }

  String body = String("{\"authorized\":") +
                (authorized ? "true" : "false") +
                ",\"nfc_uid\":\"" + uid +
                "\",\"user_name\":\"" +
                (authorized ? "Authorized User" : "Unknown User") +
                "\"}";

  enqueuePostJson("/esp/nfc-access", body);
}

void reportSystemMode(String mode) {
  String body = String("{\"mode\":\"") + mode + "\"}";
  enqueuePostJson("/esp/system-state", body);
}

void reportEspState(String mode, bool doorLocked) {
  (void)mode;
  String body = String("{\"door_locked\":") + (doorLocked ? "true" : "false") +
                ",\"buzzer_on\":" + ((isIntrusionActive || isFireActive) ? "true" : "false") +
                ",\"sprinkler_on\":" + ((pump1State || pump2State || pump3State) ? "true" : "false") +
                "}";

  enqueuePostJson("/esp/system-state", body);
}

void startFeedbackBuzzer(unsigned long durationMs) {
  feedbackBuzzerActive = true;
  wrongCardBeepActive = false;
  feedbackBuzzerUntil = millis() + durationMs;
  digitalWrite(BUZZER_PIN, RELAY_ON);
}

void startWrongCardBeeps(bool triggerAlarmAfterBeeps = false) {
  if (isIntrusionActive || isFireActive) return;
  feedbackBuzzerActive = false;
  wrongCardBeepActive = true;
  triggerAlarmAfterWrongCardBeeps = triggerAlarmAfterBeeps;
  wrongCardBeepStep = 0;
  lastWrongCardBeepToggle = millis();
  digitalWrite(BUZZER_PIN, RELAY_ON);
}

void startConnectedBeeps() {
  if (isIntrusionActive || isFireActive || wrongCardBeepActive) return;
  feedbackBuzzerActive = false;
  connectedBeepActive = true;
  connectedBeepStep = 0;
  lastConnectedBeepToggle = millis();
  digitalWrite(BUZZER_PIN, RELAY_ON);
}

void serviceBuzzer(bool alarmRequested) {
  unsigned long now = millis();

  if (feedbackBuzzerActive) {
    if ((long)(now - feedbackBuzzerUntil) < 0) {
      digitalWrite(BUZZER_PIN, RELAY_ON);
      return;
    }
    feedbackBuzzerActive = false;
  }

  if (wrongCardBeepActive) {
    bool beepOn = (wrongCardBeepStep % 2) == 0;
    unsigned long waitMs = beepOn ? WRONG_CARD_BEEP_ON_MS : WRONG_CARD_BEEP_OFF_MS;

    if (now - lastWrongCardBeepToggle >= waitMs) {
      lastWrongCardBeepToggle = now;
      wrongCardBeepStep++;

      if (wrongCardBeepStep >= WRONG_CARD_BEEP_STEPS) {
        wrongCardBeepActive = false;
        digitalWrite(BUZZER_PIN, RELAY_OFF);
        if (triggerAlarmAfterWrongCardBeeps) {
          triggerAlarmAfterWrongCardBeeps = false;
          startAlarmBurst();
          reportEspState(awayMode ? "away" : "disarmed", !doorOpen);
        }
      } else {
        digitalWrite(BUZZER_PIN, ((wrongCardBeepStep % 2) == 0) ? RELAY_ON : RELAY_OFF);
      }
    }
    return;
  }

  if (connectedBeepActive) {
    bool beepOn = (connectedBeepStep % 2) == 0;
    unsigned long waitMs = beepOn ? CONNECTED_BEEP_ON_MS : CONNECTED_BEEP_OFF_MS;

    if (now - lastConnectedBeepToggle >= waitMs) {
      lastConnectedBeepToggle = now;
      connectedBeepStep++;

      if (connectedBeepStep >= CONNECTED_BEEP_STEPS) {
        connectedBeepActive = false;
        digitalWrite(BUZZER_PIN, RELAY_OFF);
      } else {
        digitalWrite(BUZZER_PIN, ((connectedBeepStep % 2) == 0) ? RELAY_ON : RELAY_OFF);
      }
    }
    return;
  }

  if (alarmRequested) {
    unsigned long waitMs = alarmBuzzerOutput
      ? ALARM_CHIRP_ON_MS
      : (alarmBurstChirpCount >= ALARM_CHIRPS_PER_BURST ? ALARM_BURST_PAUSE_MS : ALARM_CHIRP_OFF_MS);

    if (now - lastAlarmBuzzerToggle >= waitMs) {
      lastAlarmBuzzerToggle = now;
      alarmBuzzerOutput = !alarmBuzzerOutput;

      if (!alarmBuzzerOutput) {
        alarmBurstChirpCount++;
      } else if (alarmBurstChirpCount >= ALARM_CHIRPS_PER_BURST) {
        alarmBurstChirpCount = 0;
      }

      digitalWrite(BUZZER_PIN, alarmBuzzerOutput ? RELAY_ON : RELAY_OFF);
    }
    return;
  }

  alarmBuzzerOutput = false;
  alarmBurstChirpCount = 0;
  digitalWrite(BUZZER_PIN, RELAY_OFF);
}

void startAlarmBurst() {
  isIntrusionActive = true;
  intrusionTimer = millis();
  backendBuzzerLatched = true;
  feedbackBuzzerActive = false;
  wrongCardBeepActive = false;
  triggerAlarmAfterWrongCardBeeps = false;
  alarmBuzzerOutput = true;
  alarmBurstChirpCount = 0;
  lastAlarmBuzzerToggle = millis();
  digitalWrite(BUZZER_PIN, RELAY_ON);
}

bool debounceDigitalHigh(bool rawHigh, unsigned long& highSince, unsigned long holdMs) {
  if (!rawHigh) {
    highSince = 0;
    return false;
  }

  if (highSince == 0) highSince = millis();
  return millis() - highSince >= holdMs;
}

bool readSensitivePIR(bool rawHigh, bool pulseSeen, unsigned long& highSince, unsigned long& latchUntil) {
  unsigned long now = millis();
  if (pulseSeen) latchUntil = now + PIR_PULSE_LATCH_MS;

  bool latchedHigh = (long)(now - latchUntil) < 0;
  return debounceDigitalHigh(rawHigh || latchedHigh, highSince, pirDebounceTime);
}

bool confirmLowDanger(int value, int threshold, int clearMargin, int requiredSamples, int& counter) {
  if (value < threshold) {
    if (counter < requiredSamples) counter++;
  } else if (value > threshold + clearMargin) {
    counter = 0;
  }

  return counter >= requiredSamples;
}

bool confirmHighDanger(int value, int threshold, int clearMargin, int requiredSamples, int& counter) {
  if (value > threshold) {
    if (counter < requiredSamples) counter++;
  } else if (value < threshold - clearMargin) {
    counter = 0;
  }

  return counter >= requiredSamples;
}

bool debounceExpanderHigh(bool rawHigh, int& counter, int requiredSamples) {
  if (rawHigh) {
    if (counter < requiredSamples) counter++;
  } else {
    counter = 0;
  }

  return counter >= requiredSamples;
}

void holdPumpWhileFire(bool fireConfirmed, bool& pumpState, unsigned long& pumpTimer, unsigned long& fireLastSeen, int flameValue, const char* label, unsigned long now) {
  if (!fireConfirmed) return;

  fireLastSeen = now;
  if (!pumpState) {
    Serial.printf("\n[FLAME]: %s confirmed. Value=%d Threshold=%d\n", label, flameValue, FLAME_THRESHOLD);
  }
  pumpState = true;
  pumpTimer = now;
  lastLocalFireTriggerTime = now;
}

void stopPumpAfterFireClears(bool& pumpState, unsigned long pumpTimer, unsigned long fireLastSeen, int& flameCounter, unsigned long now) {
  if (!pumpState) return;
  if (now - pumpTimer < PUMP_RUN_MS) return;
  if (now - fireLastSeen < FIRE_SENSOR_HOLD_MS) return;

  pumpState = false;
  flameCounter = 0;
  if (!pump1State && !pump2State && !pump3State) {
    reportEspState(awayMode ? "away" : "disarmed", !doorOpen);
  }
}

void resetSecurityEdges() {
  lastPhysicalVibrationTriggered = false;
  hallwayPIR_Timer = 0;
  garagePIR_Timer = 0;
  hallwayPIR_LatchUntil = 0;
  garagePIR_LatchUntil = 0;
  lastHallwayPIRTriggered = false;
  lastGaragePIRTriggered = false;
  lastReed1Triggered = false;
  lastReed2Triggered = false;
  lastReed3Triggered = false;
  reed1Counter = 0;
  reed2Counter = 0;
  reed3Counter = 0;
  vibrationCounter = 0;
}

void extendCooldown(unsigned long& cooldownUntil, unsigned long durationMs) {
  unsigned long nextUntil = millis() + durationMs;
  if ((long)(nextUntil - cooldownUntil) > 0) {
    cooldownUntil = nextUntil;
  }
}

void suppressSecurityInputs(unsigned long durationMs) {
  extendCooldown(ignoreIntrusionUntil, durationMs);
  extendCooldown(ignoreMotionReportUntil, durationMs);
  resetSecurityEdges();
}

void refreshNfcReader() {
  rfid.PCD_Init();
  rfid.PCD_SetAntennaGain(rfid.RxGain_max);
  rfid.PCD_AntennaOn();
  lastNFCCheckTime = millis();
  lastNfcIdleRefreshTime = millis();
}

void triggerSecurityAlarm(const char* sensorName) {
  reportSensorEvent(sensorName);

  if (!isIntrusionActive) {
    startAlarmBurst();
    reportEspState("away", !doorOpen);
  }
}

void moveDoorServo(int angle) {
  doorServo.attach(SERVO_PIN);
  doorServo.write(angle);
  delay(SERVO_SETTLE_MS);
  doorServo.detach();
}

void openDoorLocal() {
  suppressSecurityInputs(SENSOR_CHANGE_SETTLE_MS);
  doorOpen = true;
  moveDoorServo(OPEN_ANGLE);
  localDoorOverrideUntil = millis() + LOCAL_DOOR_OVERRIDE_MS;
  suppressSecurityInputs(SENSOR_CHANGE_SETTLE_MS);
}

void closeDoorLocal() {
  suppressSecurityInputs(SENSOR_CHANGE_SETTLE_MS);
  doorOpen = false;
  moveDoorServo(CLOSE_ANGLE);
  localDoorOverrideUntil = millis() + LOCAL_DOOR_OVERRIDE_MS;
  suppressSecurityInputs(SENSOR_CHANGE_SETTLE_MS);
}

void clearActiveOutputs() {
  backendBuzzerLatched = false;
  backendSprinklerLatched = false;
  feedbackBuzzerActive = false;
  wrongCardBeepActive = false;
  connectedBeepActive = false;
  triggerAlarmAfterWrongCardBeeps = false;
  alarmBuzzerOutput = false;
  alarmBurstChirpCount = 0;
  isIntrusionActive = false;
  isFireActive = false;
  pendingAwayMode = false;
  wrongCardCount = 0;
  localModeOverrideUntil = 0;
  ignoreIntrusionUntil = 0;
  ignoreMotionReportUntil = 0;
  pump1State = false;
  pump2State = false;
  pump3State = false;
  lastLocalFireTriggerTime = 0;
  fireConditionLatched = false;
  gasConditionLatched = false;
  kitchenGasReported = false;
  hallwayGasReported = false;
  livingGasReported = false;
  kitchenFireLastSeen = 0;
  room1FireLastSeen = 0;
  room2FireLastSeen = 0;
  kitchenFlameCounter = 0;
  room1FlameCounter = 0;
  room2FlameCounter = 0;
  kitchenGasCounter = 0;
  hallwayGasCounter = 0;
  livingGasCounter = 0;
  digitalWrite(BUZZER_PIN, RELAY_OFF);
  digitalWrite(PUMP_1_PIN, RELAY_OFF);
  digitalWrite(PUMP_2_PIN, RELAY_OFF);
  digitalWrite(PUMP_3_PIN, RELAY_OFF);
}

void pollBackendCommands() {
  if (WiFi.status() != WL_CONNECTED || isConfigModeActive) return;
  if (localIoNeedsPriority()) return;
  if (millis() - lastCommandPollTime < COMMAND_POLL_INTERVAL_MS) return;
  if (consecutiveApiFailures >= 3 && millis() - lastApiFailureTime < API_FAILURE_BACKOFF_MS) return;

  lastCommandPollTime = millis();

  HTTPClient http;
  String url = String(API_BASE_URL) + "/esp/commands";
  WiFiClientSecure secureClient;
  bool secure = url.startsWith("https://");

  if (secure) {
    secureClient.setInsecure();
    secureClient.setHandshakeTimeout(15);
    http.begin(secureClient, url);
  } else {
    http.begin(url);
  }

  http.setConnectTimeout(HTTP_CONNECT_TIMEOUT_MS);
  http.setTimeout(HTTP_READ_TIMEOUT_MS);
  http.setReuse(false);
  int code = http.GET();
  String response = http.getString();
  http.end();

  if (code < 200 || code >= 300) {
    noteApiFailure("GET /esp/commands", code, http);
    return;
  }

  noteApiSuccess();

  bool backendAway = response.indexOf("\"mode\":\"away\"") >= 0;
  bool backendHome = response.indexOf("\"mode\":\"home\"") >= 0;
  bool backendDisarmed = response.indexOf("\"mode\":\"disarmed\"") >= 0;
  bool backendBuzzerOn = response.indexOf("\"buzzer_on\":true") >= 0;
  bool backendBuzzerOff = response.indexOf("\"buzzer_on\":false") >= 0;
  bool backendSprinklerOn = response.indexOf("\"sprinkler_on\":true") >= 0;
  bool backendSprinklerOff = response.indexOf("\"sprinkler_on\":false") >= 0;
  bool backendResetWifi = response.indexOf("\"command\":\"RESETWIFI\"") >= 0;
  bool backendResetOutputs = response.indexOf("\"command\":\"RESETOUTPUTS\"") >= 0;

  if (backendResetWifi) {
    Serial.println("\n[APP]: Wi-Fi reset/provisioning requested from mobile/web app.");
    processCommand("RESETWIFI");
    return;
  }

  if (backendResetOutputs) {
    clearActiveOutputs();
    Serial.println("\n[APP]: Clear/reset command received. Outputs forced off.");
  }

  bool allowBackendModeActuation = (long)(millis() - localModeOverrideUntil) >= 0;

  if (allowBackendModeActuation && backendAway && !awayMode) {
    clearActiveOutputs();
    awayMode = true;
    pendingAwayMode = false;
    resetSecurityEdges();
    closeDoorLocal();
    playSecurityActivatedSound();
    reportEspState("away", true);
    Serial.println("\n[APP]: Security enabled from mobile/web app. Door closed.");
  }

  if (allowBackendModeActuation && (backendHome || backendDisarmed) && awayMode) {
    clearActiveOutputs();
    awayMode = false;
    pendingAwayMode = false;
    openDoorLocal();
    playSecurityDeactivatedSound();
    reportEspState("disarmed", false);
    Serial.println("\n[APP]: Security disabled from mobile/web app. Door opened.");
  }

  if (backendBuzzerOn && !backendBuzzerLatched) {
    backendBuzzerLatched = true;
    Serial.println("\n[APP]: Backend buzzer state observed; physical alarm remains local-only.");
  }

  if (backendBuzzerOff) {
    backendBuzzerLatched = false;
  }

  bool ignoreBackendSprinklerEcho = lastLocalFireTriggerTime > 0 && millis() - lastLocalFireTriggerTime < LOCAL_FIRE_ECHO_IGNORE_MS;

  if (backendSprinklerOn && !backendSprinklerLatched && !ignoreBackendSprinklerEcho) {
    backendSprinklerLatched = true;
    pump1State = true;
    pump2State = true;
    pump3State = true;
    pump1Timer = millis();
    pump2Timer = millis();
    pump3Timer = millis();
    isFireActive = true;
    fireTimer = millis();
    Serial.println("\n[APP]: Backend sprinkler state triggered pump test.");
  } else if (backendSprinklerOn && ignoreBackendSprinklerEcho) {
    backendSprinklerLatched = true;
    Serial.println("\n[APP]: Ignored backend sprinkler echo after local fire event.");
  }

  if (backendSprinklerOff) {
    backendSprinklerLatched = false;
    isFireActive = false;
    pump1State = false;
    pump2State = false;
    pump3State = false;
    digitalWrite(PUMP_1_PIN, RELAY_OFF);
    digitalWrite(PUMP_2_PIN, RELAY_OFF);
    digitalWrite(PUMP_3_PIN, RELAY_OFF);
  }
}

void processCommand(String command) {
  command.trim();
  if (command.length() == 0) return;
  
  if (command.equalsIgnoreCase("IP")) {
    String currentIP = WiFi.localIP().toString();
    String ipMessage = "\nðŸŒ [SYSTEM INFO]: Wi-Fi IP Address:\nhttp://" + currentIP + "\n";
    Serial.print(ipMessage);
    if (bleActive && deviceConnected) { sendBLE(ipMessage); }
    return; 
  }

  // ðŸŽ¯ RESETWIFI Feature
  if (command.equalsIgnoreCase("RESETWIFI")) {
    String alertMsg = "\nâš ï¸ [WIFI RESET]: Clearing stored credentials & activating Provisioning AP...\n";
    Serial.print(alertMsg);
    if (bleActive && deviceConnected) { sendBLE(alertMsg); }
    
    preferences.begin("wifi-gate", false);
    preferences.clear();
    preferences.end();
    
    WiFi.disconnect(true, true);
    wifiConnected = false;
    saved_ssid = "";
    saved_password = "";
    wifiRetryInProgress = false;
    wifiRetryAttemptNumber = 0;
    isConfigModeActive = false;
    
    startEmergencySystems();
    return;
  }

  if (command.equalsIgnoreCase("RESETOUTPUTS")) {
    clearActiveOutputs();
    Serial.println("\n[APP]: Outputs reset from backend command.");
    if (bleActive && deviceConnected) { sendBLE("\n[APP]: Outputs reset from backend command.\n"); }
    return;
  }

  if (command.equalsIgnoreCase("AWAY")) {
    processCommand("ON");
    return;
  }

  if (command.equalsIgnoreCase("HOME") || command.equalsIgnoreCase("DISARMED")) {
    processCommand("OFF");
    return;
  }
  
  if (command.equalsIgnoreCase("STOP")) {
    systemActive = false;
    digitalWrite(PUMP_1_PIN, RELAY_OFF); digitalWrite(PUMP_2_PIN, RELAY_OFF);
    digitalWrite(PUMP_3_PIN, RELAY_OFF); digitalWrite(BUZZER_PIN, RELAY_OFF);
    pump1State = false; pump2State = false; pump3State = false; 
    isIntrusionActive = false; isFireActive = false; pendingAwayMode = false; wrongCardCount = 0;
    Serial.println("\nðŸ›‘ SYSTEM STOPPED");
    if (bleActive && deviceConnected) { sendBLE("ðŸ›‘ SYSTEM STOPPED\n"); }
  } 
  else if (command.equalsIgnoreCase("START")) { 
    systemActive = true; 
    Serial.println("\nðŸŸ¢ SYSTEM RUNNING"); 
    if (bleActive && deviceConnected) { sendBLE("ðŸŸ¢ SYSTEM RUNNING\n"); } 
  } 
  else if (command.equalsIgnoreCase("ON")) { 
    awayMode = true; 
    pendingAwayMode = false; 
    resetSecurityEdges();
    closeDoorLocal(); 
    playSecurityActivatedSound(); 
    reportSystemMode("away");
    reportEspState("away", true);
    Serial.println("\n[SECURITY]: ENABLED. Door closed."); 
    if (bleActive && deviceConnected) { sendBLE("[SECURITY]: ENABLED. Door closed.\n"); } 
  } 
  else if (command.equalsIgnoreCase("OFF")) { 
    clearActiveOutputs();
    awayMode = false; 
    pendingAwayMode = false; 
    openDoorLocal(); 
    playSecurityDeactivatedSound(); 
    reportSystemMode("disarmed");
    reportEspState("disarmed", false);
    Serial.println("\n[SECURITY]: DISABLED. Door opened."); 
    if (bleActive && deviceConnected) { sendBLE("[SECURITY]: DISABLED. Door opened.\n"); } 
  } 
  else if (command.equalsIgnoreCase("OPEN")) { 
    openDoorLocal(); 
    reportEspState(awayMode ? "away" : "disarmed", false);
    Serial.println("\nðŸ”“ DOOR: OPENED"); 
    if (bleActive && deviceConnected) { sendBLE("ðŸ”“ DOOR: OPENED\n"); } 
  } 
  else if (command.equalsIgnoreCase("CLOSE")) { 
    closeDoorLocal(); 
    reportEspState(awayMode ? "away" : "disarmed", true);
    Serial.println("\nðŸ”’ DOOR: CLOSED"); 
    if (bleActive && deviceConnected) { sendBLE("ðŸ”’ DOOR: CLOSED\n"); } 
  }
}

void safeScanNetworks() {
  if (lastWifiScanTime > 0 && millis() - lastWifiScanTime < WIFI_SCAN_CACHE_MS) {
    Serial.println("\n[WIFI SETUP]: Using cached Wi-Fi scan results.");
    return;
  }

  WiFi.scanDelete();

  if (isConfigModeActive) {
    WiFi.mode(WIFI_AP_STA);
    delay(200);
  } else {
    WiFi.mode(WIFI_STA);
    WiFi.disconnect();
    delay(100);
  }

  Serial.println("\n[WIFI SETUP]: Scanning nearby routers...");
  discoveredNetworksCount = WiFi.scanNetworks(false, true, false, 120);
  lastWifiScanTime = millis();
  Serial.printf("[WIFI SETUP]: Scan result count = %d\n", discoveredNetworksCount);
  scannedNetworksOptions = "";
  if (discoveredNetworksCount <= 0) {
    scannedNetworksOptions = "<option value=''>No networks found!</option>";
  } else {
    for (int i = 0; i < discoveredNetworksCount; ++i) {
      Serial.printf("[WIFI SETUP]: %d) %s RSSI=%d %s\n", i + 1, WiFi.SSID(i).c_str(), WiFi.RSSI(i), encryptionLabel(WiFi.encryptionType(i)).c_str());
      scannedNetworksOptions += "<option value='" + WiFi.SSID(i) + "'>" + WiFi.SSID(i) + " (" + String(WiFi.RSSI(i)) + " dBm)</option>";
    }
  }
}

String jsonEscape(String value) {
  value.replace("\\", "\\\\");
  value.replace("\"", "\\\"");
  value.replace("\n", "\\n");
  value.replace("\r", "\\r");
  value.replace("\t", "\\t");
  return value;
}

String textEscape(String value) {
  value.replace("\r", " ");
  value.replace("\n", " ");
  value.replace("|", " ");
  return value;
}

String encryptionLabel(wifi_auth_mode_t encryptionType) {
  return encryptionType == WIFI_AUTH_OPEN ? "open" : "secured";
}

void handleAppWifiNetworks() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type");

  if (server.method() == HTTP_OPTIONS) {
    server.send(204);
    return;
  }

  safeScanNetworks();

  if (discoveredNetworksCount < 0) {
    server.send(200, "application/json", "{\"success\":false,\"error\":\"ESP32 scan failed. Try Refresh again.\"}");
    return;
  }

  String json = "{\"success\":true,\"networks\":[";
  bool first = true;

  for (int i = 0; i < discoveredNetworksCount; ++i) {
    String ssid = WiFi.SSID(i);
    if (ssid.length() == 0) continue;

    bool duplicate = false;
    for (int j = 0; j < i; ++j) {
      if (WiFi.SSID(j) == ssid) {
        duplicate = true;
        break;
      }
    }
    if (duplicate) continue;

    if (!first) json += ",";
    first = false;
    json += "{\"ssid\":\"" + jsonEscape(ssid) + "\",";
    json += "\"rssi\":" + String(WiFi.RSSI(i)) + ",";
    json += "\"security\":\"" + encryptionLabel(WiFi.encryptionType(i)) + "\"}";
  }

  json += "]}";
  server.send(200, "application/json", json);
}

void handleAppWifiNetworksText() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type");

  if (server.method() == HTTP_OPTIONS) {
    server.send(204);
    return;
  }

  safeScanNetworks();

  if (discoveredNetworksCount < 0) {
    server.send(200, "text/plain", "ERROR|ESP32 scan failed. Try Refresh again.\n");
    return;
  }

  String text = "";
  for (int i = 0; i < discoveredNetworksCount; ++i) {
    String ssid = WiFi.SSID(i);
    if (ssid.length() == 0) continue;

    bool duplicate = false;
    for (int j = 0; j < i; ++j) {
      if (WiFi.SSID(j) == ssid) {
        duplicate = true;
        break;
      }
    }
    if (duplicate) continue;

    text += textEscape(ssid) + "|" + String(WiFi.RSSI(i)) + "|" + encryptionLabel(WiFi.encryptionType(i)) + "\n";
  }

  server.send(200, "text/plain", text);
}

void buildConfigPage() {
  configPageHTML = "<!DOCTYPE html><html><head><meta charset='UTF-8'><meta name='viewport' content='width=device-width, initial-scale=1.0'><title>Emergency Provisioning Portal</title>";
  configPageHTML += "<style>body{font-family:Arial,sans-serif;background:#f0f2f5;text-align:center;padding:10px;} .card{background:white;padding:20px;border-radius:12px;box-shadow:0 4px 8px rgba(0,0,0,0.1);max-width:450px;margin:20px auto;text-align:left;} h2,h3{text-align:center;color:#333;} input[type=password],select{width:100%;padding:10px;margin:10px 0;box-sizing:border-box;border:1px solid #ccc;border-radius:6px;font-size:15px;} button{width:100%;padding:12px;font-weight:bold;background:#d9534f;color:white;border:none;border-radius:6px;cursor:pointer;font-size:15px;}</style></head><body>";
  if (!isAdminAuthenticated) {
    configPageHTML += "<div class='card'><h2>ðŸ” Administrator Authentication</h2><form action='/auth' method='POST'><label>Enter System Password:</label><input type='password' name='sys_pass' placeholder='Password' required><button type='submit'>Verify Identity ðŸ”“</button></form></div></body></html>";
    return;
  }
  configPageHTML += "<div class='card'><h2>ðŸ“¶ Wi-Fi Provisioning Gateway</h2><p style='color:#d9534f;font-weight:bold;text-align:center;'>Notice: Monitoring hardware and fire mitigation loops remain fully active.</p><form action='/save' method='POST'><label>Select Local Network (SSID):</label><select name='ssid' required>";
  configPageHTML += scannedNetworksOptions;
  configPageHTML += "</select><label>Network Password:</label><input type='password' name='pass' placeholder='Enter Password'><button type='submit' style='background:#5cb85c;margin-top:10px;'>Save & Deploy System ðŸ’¾</button></form></div></body></html>";
}

void handleConfigRoot() {
  buildConfigPage();
  server.send(200, "text/html", configPageHTML);
}
void handleRoot() { server.send(200, "text/html", webDashboardHTML); }
void handleWebCommand() { if (server.hasArg("cmd")) { processCommand(server.arg("cmd")); } server.send(200, "text/plain", "OK"); }
void handleRootRoute() {
  if (isConfigModeActive) {
    handleConfigRoot();
  } else {
    handleRoot();
  }
}
void handleActionRoute() {
  if (isConfigModeActive) {
    server.send(404, "text/plain", "System is in Wi-Fi setup mode");
    return;
  }

  handleWebCommand();
}
void handleAppWifiStatus() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.send(200, "application/json", "{\"success\":true,\"setup_ap\":\"Home Security System\"}");
}

void handleAuth() {
  if (server.hasArg("sys_pass") && server.arg("sys_pass") == SYSTEM_ADMIN_PASSWORD) { isAdminAuthenticated = true; server.send(200, "text/html", "<meta http-equiv='refresh' content='0;url=/'><h2>Identity Confirmed...</h2>"); } 
  else { server.send(200, "text/html", "<h2>âŒ Invalid Security Password.</h2><a href='/'>Go Back</a>"); }
}

void handleSave() {
  if (server.hasArg("ssid")) {
    preferences.begin("wifi-gate", false); preferences.putString("ssid", server.arg("ssid")); preferences.putString("pass", server.arg("pass")); preferences.putBool("just_provisioned", true); preferences.putString("provisioned_ssid", server.arg("ssid")); preferences.end();
    server.send(200, "text/html", "<h2>ðŸ’¾ Parameters saved! Rebooting...</h2>"); delay(2000); ESP.restart();
  }
}

void handleAppWifiSave() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type");

  if (server.method() == HTTP_OPTIONS) {
    server.send(204);
    return;
  }

  String ssid = server.arg("ssid");
  String pass = server.arg("pass");
  String setupCode = server.arg("setup_code");

  ssid.trim();
  setupCode.trim();

  if (ssid.length() == 0) {
    server.send(400, "application/json", "{\"success\":false,\"error\":\"Wi-Fi name is required\"}");
    return;
  }

  if (setupCode != SYSTEM_ADMIN_PASSWORD) {
    server.send(401, "application/json", "{\"success\":false,\"error\":\"Invalid setup code\"}");
    return;
  }

  preferences.begin("wifi-gate", false);
  preferences.putString("ssid", ssid);
  preferences.putString("pass", pass);
  preferences.putBool("just_provisioned", true);
  preferences.putString("provisioned_ssid", ssid);
  preferences.end();

  Serial.print("\n[WIFI SETUP]: New credentials saved from mobile app for SSID: ");
  Serial.println(ssid);
  Serial.println("[WIFI SETUP]: Restarting...");
  server.send(200, "application/json", "{\"success\":true,\"message\":\"Wi-Fi saved. ESP32 restarting.\"}");
  delay(1200);
  ESP.restart();
}

#if ENABLE_BLE
class MyServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) { deviceConnected = true; };
    void onDisconnect(BLEServer* pServer) { deviceConnected = false; if(bleActive) BLEDevice::startAdvertising(); }
};

class MyCallbacks: public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic *pCharacteristic) { String rxValue = pCharacteristic->getValue(); if (rxValue.length() > 0) { bleIncomingCommand = rxValue; } }
};

void startBLEHardware() {
  if (bleActive) return;
  BLEDevice::init("ESP32_SmartHome");
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());
  BLEService *pService = pServer->createService(SERVICE_UUID);
  pTxCharacteristic = pService->createCharacteristic(TX_CHARACTERISTIC_UUID, BLECharacteristic::PROPERTY_NOTIFY);
  pTxCharacteristic->addDescriptor(new BLE2902());
  BLECharacteristic *pRxCharacteristic = pService->createCharacteristic(RX_CHARACTERISTIC_UUID, BLECharacteristic::PROPERTY_WRITE);
  pRxCharacteristic->setCallbacks(new MyCallbacks());
  pService->start();
  pServer->getAdvertising()->start();
  bleActive = true;
  bleTimeoutTriggered = false;
  Serial.println("BLE System Activated Successfully.");
}

void stopBLEHardware() {
  if (!bleActive) return;
  BLEDevice::deinit(true);
  bleActive = false; deviceConnected = false; bleTimeoutTriggered = true;
  Serial.println("BLE System Shut down completely to save memory stack allocation.");
}
#else
void startBLEHardware() {
  bleActive = false;
  deviceConnected = false;
  bleTimeoutTriggered = true;
}

void stopBLEHardware() {
  bleActive = false;
  deviceConnected = false;
  bleTimeoutTriggered = true;
}
#endif

void configureServerRoutes() {
  if (serverRoutesConfigured) return;

  server.on("/", handleRootRoute);
  server.on("/action", handleActionRoute);
  server.on("/auth", handleAuth);
  server.on("/save", handleSave);
  server.on("/api/wifi/status", HTTP_ANY, handleAppWifiStatus);
  server.on("/api/wifi/networks", HTTP_ANY, handleAppWifiNetworks);
  server.on("/api/wifi/networks.txt", HTTP_ANY, handleAppWifiNetworksText);
  server.on("/api/wifi/save", HTTP_ANY, handleAppWifiSave);
  serverRoutesConfigured = true;
}

void applyStableWifiPowerSettings() {
  WiFi.setTxPower(WIFI_POWER_11dBm);
}

void applySetupApWifiPowerSettings() {
  WiFi.setTxPower(WIFI_POWER_19_5dBm);
}

void onSavedWifiConnected() {
  bool wasConnected = wifiConnected && !isConfigModeActive;
  wifiConnected = true;
  wifiRetryInProgress = false;
  wifiDisconnectedSince = 0;
  wifiConnectSuccessTime = millis();

  if (isConfigModeActive) {
    WiFi.softAPdisconnect(true);
    WiFi.mode(WIFI_STA);
    isConfigModeActive = false;
    isAdminAuthenticated = false;
  }

  if (bleActive && !deviceConnected) {
    stopBLEHardware();
  }

  configureServerRoutes();
  server.begin();
  Serial.print("\n[WIFI]: Connected to saved Wi-Fi. IP: ");
  Serial.println(WiFi.localIP());
  Serial.print("[WIFI]: Free heap after connect: ");
  Serial.println(ESP.getFreeHeap());
  if (!wasConnected) {
    startConnectedBeeps();
  }
}

void beginSavedWifiRetry(bool force) {
  if (saved_ssid.length() == 0) return;
  if (WiFi.status() == WL_CONNECTED) {
    onSavedWifiConnected();
    return;
  }
  if (wifiRetryInProgress) return;
  if (!force && millis() - lastWifiRetryAttemptTime < WIFI_RETRY_INTERVAL_MS) return;

  lastWifiRetryAttemptTime = millis();
  wifiRetryAttemptStartedAt = millis();
  wifiRetryInProgress = true;
  wifiRetryAttemptNumber++;

  Serial.printf("\n[WIFI]: Retry %d connecting to saved SSID: %s\n", wifiRetryAttemptNumber, saved_ssid.c_str());
  WiFi.persistent(false);
  WiFi.setSleep(false);
  WiFi.mode(isConfigModeActive ? WIFI_AP_STA : WIFI_STA);
  applyStableWifiPowerSettings();
  WiFi.disconnect(false, false);
  WiFi.begin(saved_ssid.c_str(), saved_password.c_str());
}

void serviceSavedWifiConnection() {
  if (saved_ssid.length() == 0) return;

  if (WiFi.status() == WL_CONNECTED) {
    if (!wifiConnected || isConfigModeActive || wifiRetryInProgress) {
      onSavedWifiConnected();
    }
    return;
  }

  wifiConnected = false;

  if (wifiRetryInProgress) {
    if (millis() - wifiRetryAttemptStartedAt >= WIFI_RETRY_ATTEMPT_TIMEOUT_MS) {
      wifiRetryInProgress = false;
      WiFi.disconnect(false, false);
      WiFi.mode(isConfigModeActive ? WIFI_AP_STA : WIFI_STA);
      Serial.printf("\n[WIFI]: Retry %d timed out. Next retry in %lu ms.\n", wifiRetryAttemptNumber, WIFI_RETRY_INTERVAL_MS);
    }
    return;
  }

  beginSavedWifiRetry(false);
}

void startEmergencySystems() {
  if (isConfigModeActive) return;

  Serial.println("\n[WIFI SETUP]: Starting stable provisioning AP...");
  ignoredRecentResetWifiCommand = false;
  server.stop();
  delay(250);
  WiFi.persistent(false);
  WiFi.setSleep(false);
  WiFi.disconnect(false, false);
  delay(250);
  WiFi.mode(WIFI_AP_STA);
  applySetupApWifiPowerSettings();
  WiFi.softAPConfig(setupApIp, setupApGateway, setupApSubnet);
  bool apStarted = WiFi.softAP(ap_ssid, ap_password, 1, 0, 4);
  if (!apStarted) {
    Serial.println("[WIFI SETUP]: First AP start failed, retrying in AP-only mode...");
    WiFi.mode(WIFI_AP);
    delay(250);
    applySetupApWifiPowerSettings();
    WiFi.softAPConfig(setupApIp, setupApGateway, setupApSubnet);
    apStarted = WiFi.softAP(ap_ssid, ap_password, 1, 0, 4);
  }
  delay(500);
  Serial.print("[WIFI SETUP]: AP IP: ");
  Serial.println(WiFi.softAPIP());
  Serial.print("[WIFI SETUP]: AP start result: ");
  Serial.println(apStarted ? "ok" : "failed");
  isConfigModeActive = true;
  configureServerRoutes();
  server.begin();
  startBLEHardware();
}

void playCorrectCardSound() { startFeedbackBuzzer(120); }
void playWrongCardSound() { startFeedbackBuzzer(260); }
void playSecurityActivatedSound() { startFeedbackBuzzer(140); }
void playSecurityDeactivatedSound() { startFeedbackBuzzer(180); }

void setup() {
  Serial.begin(115200);
  delay(100);
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0);
  applyStableWifiPowerSettings();
  delay(1000);
  
  // ZERO-GLITCH BOOT STRATEGY
  pinMode(PUMP_1_PIN, INPUT_PULLUP); pinMode(PUMP_2_PIN, INPUT_PULLUP); pinMode(PUMP_3_PIN, INPUT_PULLUP); pinMode(BUZZER_PIN, INPUT_PULLUP);
  digitalWrite(PUMP_1_PIN, RELAY_OFF); digitalWrite(PUMP_2_PIN, RELAY_OFF); digitalWrite(PUMP_3_PIN, RELAY_OFF); digitalWrite(BUZZER_PIN, RELAY_OFF);
  pinMode(PUMP_1_PIN, OUTPUT); pinMode(PUMP_2_PIN, OUTPUT); pinMode(PUMP_3_PIN, OUTPUT); pinMode(BUZZER_PIN, OUTPUT);

  pinMode(PIR_1_PIN, INPUT); pinMode(PIR_2_PIN, INPUT);
  attachInterrupt(digitalPinToInterrupt(PIR_1_PIN), onHallwayPIRRise, RISING);
  attachInterrupt(digitalPinToInterrupt(PIR_2_PIN), onGaragePIRRise, RISING);
  pinMode(FLAME_1_PIN, INPUT); pinMode(FLAME_2_PIN, INPUT); pinMode(FLAME_3_PIN, INPUT);
  analogSetPinAttenuation(SMOKE_1_PIN, ADC_11db);
  analogSetPinAttenuation(SMOKE_2_PIN, ADC_11db);
  analogSetPinAttenuation(SMOKE_3_PIN, ADC_11db);

  startBLEHardware();
  Serial.println("[BOOT]: Reading stored Wi-Fi credentials...");

  preferences.begin("wifi-gate", true);
  saved_ssid = preferences.getString("ssid", "");
  saved_password = preferences.getString("pass", "");
  ignoreNextResetWifiCommand = preferences.getBool("just_provisioned", false);
  provisionedSsidGuard = preferences.getString("provisioned_ssid", "");
  preferences.end();

  Serial.print("[BOOT]: Provisioning guard active: ");
  Serial.println(ignoreNextResetWifiCommand ? "yes" : "no");
  if (provisionedSsidGuard.length() > 0) {
    Serial.print("[BOOT]: Provisioned SSID guard: ");
    Serial.println(provisionedSsidGuard);
  }
  
  if (saved_ssid == "") {
    Serial.println("\n[WIFI]: No saved SSID. Starting setup AP.");
    startEmergencySystems();
  } else {
    Serial.print("\n[WIFI]: Stored SSID found: ");
    Serial.println(saved_ssid);
    WiFi.persistent(false);
    WiFi.setSleep(false);
    WiFi.mode(WIFI_STA);
    applyStableWifiPowerSettings();
    WiFi.disconnect(false, false);
    delay(500);
    WiFi.begin(saved_ssid.c_str(), saved_password.c_str());

    unsigned long startAttemptTime = millis();
    Serial.println("\n[WIFI]: Connecting to saved Wi-Fi...");
    while (WiFi.status() != WL_CONNECTED && millis() - startAttemptTime < WIFI_CONNECT_TIMEOUT_MS) {
      delay(250);
      Serial.print(".");
    }

    if (WiFi.status() == WL_CONNECTED) {
      onSavedWifiConnected();
    } else {
      Serial.print("\n[WIFI]: Saved Wi-Fi connect failed. WiFi.status() = ");
      Serial.println(WiFi.status());
      Serial.println("[WIFI]: Starting setup AP and continuing saved-Wi-Fi retries.");
      startEmergencySystems();
      beginSavedWifiRetry(true);
    }
  }

  SPI.begin(18, 19, 23, 5); refreshNfcReader(); delay(50);
  Wire.begin(21, 22); Wire.beginTransmission(PCF8574_ADDRESS); Wire.write(0xFF); Wire.endTransmission();
  doorOpen = true;
}

void loop() {
  server.handleClient();
  serviceSavedWifiConnection();

  if (WiFi.status() == WL_CONNECTED) {
    wifiConnected = true;
    wifiDisconnectedSince = 0;
    if (bleActive && !deviceConnected) {
      stopBLEHardware();
    }
    if (ignoreNextResetWifiCommand && wifiConnectSuccessTime > 0 && millis() - wifiConnectSuccessTime > 120000) {
      ignoreNextResetWifiCommand = false;
      ignoredRecentResetWifiCommand = false;
      provisionedSsidGuard = "";
      preferences.begin("wifi-gate", false);
      preferences.putBool("just_provisioned", false);
      preferences.remove("provisioned_ssid");
      preferences.end();
      Serial.println("\n[WIFI]: Provisioning reset guard expired.");
    }
    
    if (bleActive && !bleTimeoutTriggered && (millis() - wifiConnectSuccessTime >= bleTimeoutDuration)) {
      stopBLEHardware();
    }
  } else {
    wifiConnected = false;
    if (!isConfigModeActive) {
      if (wifiDisconnectedSince == 0) {
        wifiDisconnectedSince = millis();
        Serial.println("\n[WIFI]: Connection lost. Local alarms remain active while Wi-Fi retries.");
      } else if (millis() - wifiDisconnectedSince >= WIFI_LOST_TO_SETUP_MS) {
        Serial.println("\n[WIFI]: Still disconnected. Starting setup AP and continuing saved-Wi-Fi retries.");
        startEmergencySystems();
        beginSavedWifiRetry(true);
      }
    }
  }

  if (Serial.available() > 0) { String command = Serial.readStringUntil('\n'); processCommand(command); }
  if (bleActive && bleIncomingCommand.length() > 0) { processCommand(bleIncomingCommand); bleIncomingCommand = ""; }

  if (!systemActive) {
    serviceBuzzer(false);
    pollBackendCommands();
    processPendingApiRequests();
    return;
  }

  // ðŸ›¡ï¸ [Sensor Matrix Engine Loops]
  if (millis() - lastNFCCheckTime >= NFC_KEEPALIVE_MS) {
    lastNFCCheckTime = millis();
    rfid.PCD_AntennaOn();
  }

  if (!nfcCardHeld && !feedbackBuzzerActive && !wrongCardBeepActive && millis() - lastNfcIdleRefreshTime >= NFC_IDLE_REFRESH_MS) {
    refreshNfcReader();
  }

  bool nfcCardReady = rfid.PICC_IsNewCardPresent();
  bool nfcCardPresent = nfcCardReady && rfid.PICC_ReadCardSerial();

  if (!nfcCardPresent && nfcCardHeld && millis() - nfcLastSeenTime >= NFC_RELEASE_MS) {
      nfcCardHeld = false;
  }

  if (nfcCardHeld && millis() - nfcLastSeenTime >= NFC_HELD_STUCK_MS) {
      nfcCardHeld = false;
      refreshNfcReader();
      Serial.println("\n[NFC]: Reader hold latch recovered.");
  }

  if (nfcCardPresent) {
      nfcLastSeenTime = millis();
      bool accessGranted = true;
      for (byte i = 0; i < 4; i++) { if (rfid.uid.uidByte[i] != authorizedUID[i]) { accessGranted = false; break; } }
      bool canProcessCard = !nfcCardHeld;
      bool nfcCardHandled = false;

      if (canProcessCard) { 
        nfcCardHandled = true;
        nfcCardHeld = true;
        suppressSecurityInputs(NFC_MOTION_IGNORE_MS);
        resetSecurityEdges();
        if (accessGranted) {
          reportNfcAccess(true);
          wrongCardCount = 0;
          clearActiveOutputs();
          playCorrectCardSound();

          if (doorOpen) {
            closeDoorLocal();
            awayMode = true;
            pendingAwayMode = false;
            localModeOverrideUntil = millis() + LOCAL_MODE_OVERRIDE_MS;
            suppressSecurityInputs(NFC_ARM_SETTLE_MS);
            reportSystemMode("away");
            reportEspState("away", true);
            Serial.println("\n[NFC]: Authorized Card. Door closed, away mode armed.");
            if (bleActive && deviceConnected) { sendBLE("\n[NFC]: Authorized Card. Door closed, away mode armed.\n"); }
          } else {
            openDoorLocal();
            awayMode = false;
            pendingAwayMode = false;
            localModeOverrideUntil = millis() + LOCAL_MODE_OVERRIDE_MS;
            ignoreIntrusionUntil = 0;
            suppressSecurityInputs(SENSOR_CHANGE_SETTLE_MS);
            reportSystemMode("disarmed");
            reportEspState("disarmed", false);
            Serial.println("\n[NFC]: Authorized Card. Door opened, system disarmed.");
            if (bleActive && deviceConnected) { sendBLE("\n[NFC]: Authorized Card. Door opened, system disarmed.\n"); }
          }
        } else {
          wrongCardCount++;
          bool tooManyWrongCards = wrongCardCount >= MAX_WRONG_CARD_ATTEMPTS;
          reportNfcAccess(false);
          startWrongCardBeeps(tooManyWrongCards);
          Serial.printf("\n[NFC]: Unauthorized card rejected. Attempt %d/%d.\n", wrongCardCount, MAX_WRONG_CARD_ATTEMPTS);
          if (bleActive && deviceConnected) {
            sendBLE("\n[NFC]: Unauthorized card rejected.\n");
          }

          if (tooManyWrongCards) {
            wrongCardCount = 0;
            Serial.println("\n[NFC]: Too many unauthorized cards. Intrusion alarm will trigger after warning beeps.");
            if (bleActive && deviceConnected) {
              sendBLE("\n[NFC]: Too many unauthorized cards. Intrusion alarm will trigger after warning beeps.\n");
            }
          }
        }
      }
      if (nfcCardHandled) {
        rfid.PICC_HaltA();
        rfid.PCD_StopCrypto1();
      }
  }

  bool hallwayPIR_Interrupt = hallwayPIR_Pulse;
  bool garagePIR_Interrupt = garagePIR_Pulse;
  hallwayPIR_Pulse = false;
  garagePIR_Pulse = false;

  hallwayPIR_Raw = (digitalRead(PIR_1_PIN) == HIGH);
  garagePIR_Raw = (digitalRead(PIR_2_PIN) == HIGH);
  hallwayPIR_Triggered = readSensitivePIR(hallwayPIR_Raw, hallwayPIR_Interrupt, hallwayPIR_Timer, hallwayPIR_LatchUntil);
  garagePIR_Triggered = readSensitivePIR(garagePIR_Raw, garagePIR_Interrupt, garagePIR_Timer, garagePIR_LatchUntil);

  if (hallwayPIR_Triggered && !lastHallwayPIRTriggered) {
    Serial.println("\n[PIR]: Hallway motion detected.");
  }

  if (garagePIR_Triggered && !lastGaragePIRTriggered) {
    Serial.println("\n[PIR]: Garage motion detected.");
  }

  if (millis() - lastExpanderCheckTime >= 20) {
    lastExpanderCheckTime = millis();
    Wire.requestFrom(PCF8574_ADDRESS, 1);
    if (Wire.available()) { 
      byte expanderData = Wire.read(); 
      reed1 = debounceExpanderHigh(bitRead(expanderData, 0), reed1Counter, REED_CONFIRM_SAMPLES);
      reed2 = debounceExpanderHigh(bitRead(expanderData, 1), reed2Counter, REED_CONFIRM_SAMPLES);
      reed3 = debounceExpanderHigh(bitRead(expanderData, 2), reed3Counter, REED_CONFIRM_SAMPLES);
      vibration = debounceExpanderHigh(bitRead(expanderData, 3), vibrationCounter, VIBRATION_CONFIRM_SAMPLES);
    }
  }

  bool physicalVibrationTriggered = vibration;
  bool hallwayMotionEdge = hallwayPIR_Triggered && !lastHallwayPIRTriggered;
  bool garageMotionEdge = garagePIR_Triggered && !lastGaragePIRTriggered;
  bool physicalDoorEdge = (reed1 && !lastReed1Triggered) ||
                          (reed2 && !lastReed2Triggered) ||
                          (reed3 && !lastReed3Triggered);

  if (physicalDoorEdge) {
    extendCooldown(ignoreMotionReportUntil, REED_MOTION_COOLDOWN_MS);
    hallwayPIR_Timer = 0;
    garagePIR_Timer = 0;
    hallwayPIR_LatchUntil = 0;
    garagePIR_LatchUntil = 0;
    lastHallwayPIRTriggered = hallwayPIR_Triggered;
    lastGaragePIRTriggered = garagePIR_Triggered;
  }

  bool fireOutputsActive = isFireActive || pump1State || pump2State || pump3State;
  bool securitySensorsEnabled = awayMode || pendingAwayMode;
  bool intrusionInputsAllowed = securitySensorsEnabled && !fireOutputsActive && (long)(millis() - ignoreIntrusionUntil) >= 0;
  bool motionReportsAllowed = securitySensorsEnabled && !fireOutputsActive && (long)(millis() - ignoreMotionReportUntil) >= 0;

  if (motionReportsAllowed) {
    if (hallwayMotionEdge) {
      reportSensorEvent(SENSOR_MOTION_HALLWAY);
      if (awayMode && intrusionInputsAllowed) {
        triggerSecurityAlarm(SENSOR_MOTION_HALLWAY);
      }
    }

    if (garageMotionEdge) {
      reportSensorEvent(SENSOR_MOTION_GARAGE);
      if (awayMode && intrusionInputsAllowed) {
        triggerSecurityAlarm(SENSOR_MOTION_GARAGE);
      }
    }
  }

  if (intrusionInputsAllowed) {
    if (reed1 && !lastReed1Triggered) {
      if (awayMode) {
        triggerSecurityAlarm(SENSOR_WINDOW_1);
      } else {
        reportSensorEvent(SENSOR_WINDOW_1);
      }
    }

    if (reed2 && !lastReed2Triggered) {
      if (awayMode) {
        triggerSecurityAlarm(SENSOR_WINDOW_2);
      } else {
        reportSensorEvent(SENSOR_WINDOW_2);
      }
    }

    if (reed3 && !lastReed3Triggered) {
      if (awayMode) {
        triggerSecurityAlarm(SENSOR_WINDOW_3);
      } else {
        reportSensorEvent(SENSOR_WINDOW_3);
      }
    }
  }

  if (awayMode && intrusionInputsAllowed && physicalVibrationTriggered && !lastPhysicalVibrationTriggered) {
    triggerSecurityAlarm(SENSOR_VIBRATION_GARAGE_DOOR);
  }

  lastHallwayPIRTriggered = hallwayPIR_Triggered;
  lastGaragePIRTriggered = garagePIR_Triggered;
  lastReed1Triggered = reed1;
  lastReed2Triggered = reed2;
  lastReed3Triggered = reed3;
  lastPhysicalVibrationTriggered = physicalVibrationTriggered;

  if (millis() - lastFlameCheckTime >= FLAME_SAMPLE_INTERVAL_MS) {
    lastFlameCheckTime = millis();
    kitchenFlame = analogRead(FLAME_1_PIN); room1Flame = analogRead(FLAME_2_PIN); room2Flame = analogRead(FLAME_3_PIN); 
    unsigned long now = millis();
    bool kitchenFire = confirmLowDanger(kitchenFlame, FLAME_THRESHOLD, FLAME_CLEAR_MARGIN, FIRE_CONFIRM_SAMPLES, kitchenFlameCounter);
    bool room1Fire = confirmLowDanger(room1Flame, FLAME_THRESHOLD, FLAME_CLEAR_MARGIN, FIRE_CONFIRM_SAMPLES, room1FlameCounter);
    bool room2Fire = confirmLowDanger(room2Flame, FLAME_THRESHOLD, FLAME_CLEAR_MARGIN, FIRE_CONFIRM_SAMPLES, room2FlameCounter);
    bool currentFireCondition = kitchenFire || room1Fire || room2Fire;

    holdPumpWhileFire(kitchenFire, pump1State, pump1Timer, kitchenFireLastSeen, kitchenFlame, "Kitchen", now);
    holdPumpWhileFire(room1Fire, pump2State, pump2Timer, room1FireLastSeen, room1Flame, "Room 1", now);
    holdPumpWhileFire(room2Fire, pump3State, pump3Timer, room2FireLastSeen, room2Flame, "Room 2", now);

    if (kitchenFire && pump1State) reportSensorEvent(SENSOR_FLAME_KITCHEN);
    if (room1Fire && pump2State) reportSensorEvent(SENSOR_FLAME_ROOM_1);
    if (room2Fire && pump3State) reportSensorEvent(SENSOR_FLAME_ROOM_2);

    if (currentFireCondition && (pump1State || pump2State || pump3State)) {
      if (!isFireActive && !fireConditionLatched) {
        isFireActive = true;
        fireTimer = millis();
        fireConditionLatched = true;
        reportEspState(awayMode ? "away" : "disarmed", !doorOpen);
      }
    } else {
      fireConditionLatched = false;
    }
  }

  if (millis() - lastSmokeCheckTime >= GAS_SAMPLE_INTERVAL_MS) {
    lastSmokeCheckTime = millis();
    kitchenSmoke = analogRead(SMOKE_1_PIN); hallwaySmoke = analogRead(SMOKE_2_PIN); livingSmoke = analogRead(SMOKE_3_PIN);
    bool kitchenGas = confirmHighDanger(kitchenSmoke, SMOKE_THRESHOLD, GAS_CLEAR_MARGIN, GAS_CONFIRM_SAMPLES, kitchenGasCounter);
    bool hallwayGas = confirmHighDanger(hallwaySmoke, HALLWAY_SMOKE_THRESHOLD, GAS_CLEAR_MARGIN, HALLWAY_GAS_CONFIRM_SAMPLES, hallwayGasCounter);
    bool livingGas = confirmHighDanger(livingSmoke, SMOKE_THRESHOLD, GAS_CLEAR_MARGIN, GAS_CONFIRM_SAMPLES, livingGasCounter);

    if (kitchenGas || hallwayGas || livingGas) {
      if (kitchenGas && !kitchenGasReported) reportSensorEvent(SENSOR_SMOKE_KITCHEN);
      if (hallwayGas && !hallwayGasReported) reportSensorEvent(SENSOR_SMOKE_HALLWAY);
      if (livingGas && !livingGasReported) reportSensorEvent(SENSOR_SMOKE_LIVING_ROOM);
      kitchenGasReported = kitchenGasReported || kitchenGas;
      hallwayGasReported = hallwayGasReported || hallwayGas;
      livingGasReported = livingGasReported || livingGas;
      if (!kitchenGas) kitchenGasReported = false;
      if (!hallwayGas) hallwayGasReported = false;
      if (!livingGas) livingGasReported = false;
      if (!isFireActive && !gasConditionLatched) {
        isFireActive = true;
        fireTimer = millis();
        gasConditionLatched = true;
        reportEspState(awayMode ? "away" : "disarmed", !doorOpen);
        Serial.printf("\n[GAS]: Alarm. Kitchen=%d Hallway=%d Living=%d Threshold=%d\n", kitchenSmoke, hallwaySmoke, livingSmoke, SMOKE_THRESHOLD);
      }
    } else {
      gasConditionLatched = false;
      kitchenGasReported = false;
      hallwayGasReported = false;
      livingGasReported = false;
    }
  }

  if (pendingAwayMode && (millis() - awayModeActivationTimer >= AWAY_ARM_DELAY_MS)) { pendingAwayMode = false; awayMode = true; suppressSecurityInputs(SENSOR_CHANGE_SETTLE_MS); reportSystemMode("away"); reportEspState("away", !doorOpen); playSecurityActivatedSound(); }
  if (isIntrusionActive && (millis() - intrusionTimer >= ALARM_BURST_DURATION_MS)) { isIntrusionActive = false; reportEspState(awayMode ? "away" : "disarmed", !doorOpen); }
  if (isFireActive && (millis() - fireTimer >= ALARM_BURST_DURATION_MS)) { isFireActive = false; reportEspState(awayMode ? "away" : "disarmed", !doorOpen); } 

  unsigned long pumpCheckNow = millis();
  stopPumpAfterFireClears(pump1State, pump1Timer, kitchenFireLastSeen, kitchenFlameCounter, pumpCheckNow);
  stopPumpAfterFireClears(pump2State, pump2Timer, room1FireLastSeen, room1FlameCounter, pumpCheckNow);
  stopPumpAfterFireClears(pump3State, pump3Timer, room2FireLastSeen, room2FlameCounter, pumpCheckNow);

  // ðŸŽ¯ Direct, Real-time Buzzer Override for Armed Security Breaches
  bool shouldAlarmBeActive = (isIntrusionActive || isFireActive);
  serviceBuzzer(shouldAlarmBeActive);

  digitalWrite(PUMP_1_PIN, pump1State ? RELAY_ON : RELAY_OFF); digitalWrite(PUMP_2_PIN, pump2State ? RELAY_ON : RELAY_OFF); digitalWrite(PUMP_3_PIN, pump3State ? RELAY_ON : RELAY_OFF);

  if (!shouldAlarmBeActive) {
    pollBackendCommands();
    processPendingApiRequests();
  }

  // ðŸŽ¯ NEW FEATURE: Dynamic Continuous Alerts Generation Module
  if (millis() - lastThreatLogRefreshTime >= 250) {
    lastThreatLogRefreshTime = millis();
    String temporaryThreatBuffer = "";
    if (kitchenFlameCounter >= FIRE_CONFIRM_SAMPLES) temporaryThreatBuffer += "[CRITICAL]: FIRE FLAME DETECTED IN KITCHEN! ðŸ”¥\n";
    if (room1FlameCounter >= FIRE_CONFIRM_SAMPLES)   temporaryThreatBuffer += "[CRITICAL]: FIRE FLAME DETECTED IN ROOM 1! ðŸ”¥\n";
    if (room2FlameCounter >= FIRE_CONFIRM_SAMPLES)   temporaryThreatBuffer += "[CRITICAL]: FIRE FLAME DETECTED IN ROOM 2! ðŸ”¥\n";
    if (kitchenGasCounter >= GAS_CONFIRM_SAMPLES) temporaryThreatBuffer += "[WARNING]: DENSE SMOKE DETECTED IN KITCHEN! ðŸ’¨\n";
    if (hallwayGasCounter >= GAS_CONFIRM_SAMPLES) temporaryThreatBuffer += "[WARNING]: DENSE SMOKE DETECTED IN HALLWAY! ðŸ’¨\n";
    if (livingGasCounter >= GAS_CONFIRM_SAMPLES)  temporaryThreatBuffer += "[WARNING]: DENSE SMOKE DETECTED IN LIVING ROOM! ðŸ’¨\n";

    if (awayMode) {
      if (hallwayPIR_Triggered) temporaryThreatBuffer += "[BREACH]: INTRUSION MOVEMENT INSIDE THE HALLWAY! ðŸš¨\n";
      if (garagePIR_Triggered)  temporaryThreatBuffer += "[BREACH]: INTRUSION MOVEMENT INSIDE THE GARAGE! ðŸš¨\n";
      if (reed1) temporaryThreatBuffer += "[BREACH]: PERIMETER SECURITY BREACHED ON WINDOW 1! ðŸš¨\n";
      if (reed2) temporaryThreatBuffer += "[BREACH]: PERIMETER SECURITY BREACHED ON WINDOW 2! ðŸš¨\n";
      if (reed3) temporaryThreatBuffer += "[BREACH]: PERIMETER SECURITY BREACHED ON WINDOW 3! ðŸš¨\n";
      if (vibration) temporaryThreatBuffer += "[WARNING]: HIGH STRUCTURAL SHOCK / VIBRATION RECORDED! âš ï¸\n";
    }
    activeThreatLog = temporaryThreatBuffer; // Synchronizes threats live for the IP Web Interface
  }

  // Dispatch continuous logs asynchronously every 2000 milliseconds over Serial and BLE lines
  if (activeThreatLog != "" && (millis() - lastContinuousAlertTime >= 2000)) {
    lastContinuousAlertTime = millis();
    Serial.print("\nâš ï¸ --- LIVE THREAT BROADCAST --- âš ï¸\n" + activeThreatLog);
    if (bleActive && deviceConnected) {
      sendBLE("\nâš ï¸ --- LIVE THREAT BROADCAST --- âš ï¸\n" + activeThreatLog);
    }
  }

  if (millis() - lastPrintTime >= printInterval) {
    lastPrintTime = millis();
    
    String r1State = reed1 ? "OPEN âš ï¸" : "CLOSED ðŸ”’"; String r2State = reed2 ? "OPEN âš ï¸" : "CLOSED ðŸ”’"; String r3State = reed3 ? "OPEN âš ï¸" : "CLOSED ðŸ”’";
    String hPIR = hallwayPIR_Raw ? "MOVE ðŸƒ " : "CLEAR  "; String gPIR = garagePIR_Raw ? "MOVE ðŸƒ " : "CLEAR  "; String vib = vibration ? "SHAKE âš ï¸" : "NORMAL ";
    
    int kFlamePct = map(constrain(kitchenFlame, 0, 4095), 4095, 3000, 0, 100);
    int r1FlamePct = map(constrain(room1Flame, 0, 4095), 4095, 3000, 0, 100);
    int r2FlamePct = map(constrain(room2Flame, 0, 4095), 4095, 3000, 0, 100);
    if(kFlamePct < 0) kFlamePct = 0; if(r1FlamePct < 0) r1FlamePct = 0; if(r2FlamePct < 0) r2FlamePct = 0;

    String kFlameStatus = (kitchenFlameCounter >= FIRE_CONFIRM_SAMPLES) ? "DANGER!ðŸ”¥" : "SAFE  ";
    String r1FlameStatus = (room1FlameCounter >= FIRE_CONFIRM_SAMPLES) ? "DANGER!ðŸ”¥" : "SAFE  ";
    String r2FlameStatus = (room2FlameCounter >= FIRE_CONFIRM_SAMPLES) ? "DANGER!ðŸ”¥" : "SAFE  ";

    String currentSystemMode = awayMode ? "[AWAY MODE ðŸ”’]" : "[NIGHT/HOME MODE ðŸ ]";

    String dataMatrix = "";
    char buf[128];
    dataMatrix += "\n=============================================\n";
    dataMatrix += " ðŸ›¡ï¸ OPERATIONAL STATUS: " + currentSystemMode + "\n"; 
    dataMatrix += "=============================================\n";
    sprintf(buf, "| ðŸ³ Kitchen | Smoke: %-4d   | Flame: %d%% (%s)\n", kitchenSmoke, kFlamePct, kFlameStatus.c_str()); dataMatrix += buf;
    sprintf(buf, "| ðŸ›ï¸ Room 1  | Flame: %d%% (%s) | Window: %s\n", r1FlamePct, r1FlameStatus.c_str(), r1State.c_str()); dataMatrix += buf;
    sprintf(buf, "| ðŸ›ï¸ Room 2  | Flame: %d%% (%s) | Window: %s\n", r2FlamePct, r2FlameStatus.c_str(), r2State.c_str()); dataMatrix += buf;
    sprintf(buf, "| ðŸ›‹ï¸ Living  | Smoke: %-4d   | Window: %s\n", livingSmoke, r3State.c_str()); dataMatrix += buf;
    sprintf(buf, "| ðŸš¶ Hallway | Smoke: %-4d   | Motion: %s\n", hallwaySmoke, hPIR.c_str()); dataMatrix += buf;
    sprintf(buf, "| ðŸš— Garage  | Motion: %s | Shock: %s\n", gPIR.c_str(), vib.c_str()); dataMatrix += buf;
    dataMatrix += "---------------------------------------------\n";

    if (wifiConnected && !isConfigModeActive) {
      webDashboardHTML = "<!DOCTYPE html><html><head><meta charset='UTF-8'><meta name='viewport' content='width=device-width, initial-scale=1.0'><title>Smart Home Control</title>";
      webDashboardHTML += "<style>body{font-family:Arial,sans-serif;background:#f0f2f5;text-align:center;padding:10px;} .card{background:white;padding:20px;border-radius:12px;box-shadow:0 4px 8px rgba(0,0,0,0.1);max-width:500px;margin:20px auto;text-align:left;} h2{text-align:center;color:#333;} pre{background:#222;color:#00ff00;padding:15px;border-radius:8px;font-size:14px;overflow-x:auto;} .btn-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:15px;} button{padding:12px;font-size:14px;font-weight:bold;border:none;border-radius:8px;cursor:pointer;color:white;} .btn-stop{background:#d9534f;} .btn-start{background:#5cb85c;} .btn-on{background:#0275d8;} .btn-off{background:#f0ad4e;} .btn-open{background:#5bc0de;} .btn-close{background:#292b2c;} .btn-reset{background:#ff3333;grid-column: span 2;} .danger-banner{background:#ffcccc;color:#cc0000;padding:10px;border-radius:8px;font-weight:bold;margin-bottom:15px;white-space:pre-line;border:2px solid #cc0000;}</style>";
      webDashboardHTML += "<script>setInterval(function(){ fetch('/').then(response => response.text()).then(html => {  let parser = new DOMParser(); let doc = parser.parseFromString(html, 'text/html'); document.getElementById('telemetry').innerHTML = doc.getElementById('telemetry').innerHTML; let alertBox = doc.getElementById('liveAlerts'); if(alertBox) { document.getElementById('liveAlerts').innerHTML = alertBox.innerHTML; document.getElementById('liveAlerts').style.display = 'block'; } else { document.getElementById('liveAlerts').style.display = 'none'; } }); }, 2000); ";
      webDashboardHTML += "function sendCmd(cmd){ fetch('/action?cmd='+cmd); }</script></head><body>";
      webDashboardHTML += "<div class='card'><h2>ðŸ“Š LIVE TELEMETRY MATRIX</h2>";
      
      // Dynamic Injector for Live Danger Banners on the browser screen
      if (activeThreatLog != "") {
        webDashboardHTML += "<div id='liveAlerts' class='danger-banner'>âš ï¸ LIVE WARNING THREATS ACTIVE:\n" + activeThreatLog + "</div>";
      } else {
        webDashboardHTML += "<div id='liveAlerts' class='danger-banner' style='display:none;'></div>";
      }

      webDashboardHTML += "<div id='telemetry'><pre>";
      webDashboardHTML += dataMatrix;
      webDashboardHTML += "</pre></div>";
      webDashboardHTML += "<h3>ðŸŽ® WIRELESS CONTROL INTERFACE</h3><div class='btn-grid'>";
      webDashboardHTML += "<button class='btn-start' onclick='sendCmd(\"START\")'>ðŸŸ¢ START SYSTEM</button><button class='btn-stop' onclick='sendCmd(\"STOP\")'>ðŸ›‘ STOP SYSTEM</button>";
      webDashboardHTML += "<button class='btn-on' onclick='sendCmd(\"ON\")'>ðŸ”’ SECURITY ARMED</button><button class='btn-off' onclick='sendCmd(\"OFF\")'>ðŸ”“ SECURITY DISARMED</button>";
      webDashboardHTML += "<button class='btn-open' onclick='sendCmd(\"OPEN\")'>ðŸ”“ ACTUATE DOOR OPEN</button><button class='btn-close' onclick='sendCmd(\"CLOSE\")'>ðŸ”’ ACTUATE DOOR CLOSED</button>";
      webDashboardHTML += "</div></div></body></html>";
    }
  }
}


