#include <SPI.h>
#include <MFRC522.h>
#include <ESP32Servo.h>
#include <Wire.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <string.h>

#define RELAY_ON  LOW
#define RELAY_OFF HIGH

// -------- Wi-Fi / backend config --------
const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Use the computer LAN IP that runs backend/server.js.
const char* API_BASE_URL = "http://192.168.1.101:5000/api";

// Current database sensor names. Change these only after the DB has matching rows.
const char* SENSOR_MOTION = "motion_living_room";
const char* SENSOR_GAS = "gas_kitchen";
const char* SENSOR_FLAME = "flame_kitchen";
const char* SENSOR_DOOR = "door_main";
const char* SENSOR_VIBRATION = "vibration_window";

const unsigned long REPORT_COOLDOWN_MS = 5000;
const unsigned long WIFI_RETRY_INTERVAL_MS = 10000;
const unsigned long COMMAND_POLL_INTERVAL_MS = 3000;

unsigned long lastMotionReportTime = 0;
unsigned long lastGasReportTime = 0;
unsigned long lastFlameReportTime = 0;
unsigned long lastDoorReportTime = 0;
unsigned long lastVibrationReportTime = 0;
unsigned long lastWifiRetryTime = 0;
unsigned long lastCommandPollTime = 0;

// -------- Servo Pins --------
#define SERVO_PIN    13
const int OPEN_ANGLE = 170;
const int CLOSE_ANGLE = 12;

// -------- Sensor and Actuator Pins --------
#define SMOKE_1_PIN  36
#define FLAME_1_PIN  34  // Analog AO
#define PUMP_1_PIN   25
#define FLAME_2_PIN  35  // Analog AO
#define PUMP_2_PIN   26
#define SMOKE_2_PIN  39
#define PIR_1_PIN    2
#define BUZZER_PIN   14
#define rfid_RST_PIN 4
#define rfid_SS_PIN  5
#define SMOKE_3_PIN  33
#define FLAME_3_PIN  32  // Analog AO
#define PUMP_3_PIN   27
#define PIR_2_PIN    15
#define PCF8574_ADDRESS 0x20

MFRC522 rfid(rfid_SS_PIN, rfid_RST_PIN);
Servo doorServo;

int SMOKE_THRESHOLD = 2000;

// Most flame modules produce a lower analog value when flame/IR is detected.
// Calibrate this from Serial Monitor readings in the real prototype.
int FLAME_THRESHOLD = 4050;
bool FLAME_ACTIVE_LOW_ANALOG = true;

bool systemActive = true;
bool awayMode = false;
bool doorOpen = true;

unsigned long lastPrintTime = 0;
const unsigned long printInterval = 10000;

unsigned long lastSmokeCheckTime = 0;
unsigned long lastFlameCheckTime = 0;
unsigned long lastNFCCheckTime = 0;
unsigned long lastExpanderCheckTime = 0;

unsigned long hallwayPIR_Timer = 0;
unsigned long garagePIR_Timer = 0;
const unsigned long pirDebounceTime = 1000;

bool isIntrusionActive = false;
unsigned long intrusionTimer = 0;
bool isFireActive = false;
unsigned long fireTimer = 0;

bool pump1State = false; unsigned long pump1Timer = 0;
bool pump2State = false; unsigned long pump2Timer = 0;
bool pump3State = false; unsigned long pump3Timer = 0;

bool pendingAwayMode = false;
unsigned long awayModeActivationTimer = 0;

unsigned long lastCardReadTime = 0;
const unsigned long cardCooldown = 1500;
int wrongCardCount = 0;

byte authorizedUID[] = {0xA3, 0x24, 0x0B, 0x07};

bool reed1 = false, reed2 = false, reed3 = false, vibration = false;
int kitchenSmoke = 0, hallwaySmoke = 0, livingSmoke = 0;

int kitchenFlame = 4095;
int room1Flame = 4095;
int room2Flame = 4095;

int reed1Counter = 0;

bool hallwayPIR_Raw = false;
bool garagePIR_Raw = false;
bool hallwayPIR_Triggered = false;
bool garagePIR_Triggered = false;

void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  Serial.print("\n[WiFi] Connecting to ");
  Serial.println(WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 8000) {
    delay(250);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("\n[WiFi] Connected. IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\n[WiFi] Not connected yet. System will keep running locally.");
  }
}

void maintainWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  if (millis() - lastWifiRetryTime >= WIFI_RETRY_INTERVAL_MS) {
    lastWifiRetryTime = millis();
    connectWiFi();
  }
}

bool postJson(String path, String body) {
  if (WiFi.status() != WL_CONNECTED) return false;

  HTTPClient http;
  String url = String(API_BASE_URL) + path;

  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  int code = http.POST(body);
  String response = http.getString();
  http.end();

  Serial.printf("\n[API] POST %s -> %d\n", path.c_str(), code);
  if (response.length() > 0) Serial.println(response);

  return code >= 200 && code < 300;
}

unsigned long* reportTimerForSensor(const char* sensorName) {
  if (strcmp(sensorName, SENSOR_MOTION) == 0) return &lastMotionReportTime;
  if (strcmp(sensorName, SENSOR_GAS) == 0) return &lastGasReportTime;
  if (strcmp(sensorName, SENSOR_FLAME) == 0) return &lastFlameReportTime;
  if (strcmp(sensorName, SENSOR_DOOR) == 0) return &lastDoorReportTime;
  if (strcmp(sensorName, SENSOR_VIBRATION) == 0) return &lastVibrationReportTime;

  return &lastGasReportTime;
}

void reportSensorEvent(const char* sensorName) {
  unsigned long* lastReportTime = reportTimerForSensor(sensorName);
  if (*lastReportTime != 0 && millis() - *lastReportTime < REPORT_COOLDOWN_MS) return;

  *lastReportTime = millis();
  String body = String("{\"sensor_name\":\"") + sensorName + "\"}";
  postJson("/esp/sensor-event", body);
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

  postJson("/esp/nfc-access", body);
}

void pollBackendCommands() {
  if (WiFi.status() != WL_CONNECTED) return;
  if (millis() - lastCommandPollTime < COMMAND_POLL_INTERVAL_MS) return;

  lastCommandPollTime = millis();

  HTTPClient http;
  String url = String(API_BASE_URL) + "/esp/commands";
  http.begin(url);
  int code = http.GET();
  String response = http.getString();
  http.end();

  if (code < 200 || code >= 300) {
    Serial.printf("\n[API] GET /esp/commands -> %d\n", code);
    return;
  }

  bool backendAway = response.indexOf("\"mode\":\"away\"") >= 0;
  bool backendHome = response.indexOf("\"mode\":\"home\"") >= 0;
  bool backendDisarmed = response.indexOf("\"mode\":\"disarmed\"") >= 0;
  bool backendDoorLocked = response.indexOf("\"door_locked\":true") >= 0;
  bool backendDoorUnlocked = response.indexOf("\"door_locked\":false") >= 0;

  if (backendAway) awayMode = true;
  if (backendHome || backendDisarmed) awayMode = false;
  if (backendDoorLocked && doorOpen) {
    doorServo.write(CLOSE_ANGLE);
    doorOpen = false;
  }
  if (backendDoorUnlocked && !doorOpen) {
    doorServo.write(OPEN_ANGLE);
    doorOpen = true;
  }
}

bool isFlameDetected(int analogValue) {
  if (FLAME_ACTIVE_LOW_ANALOG) {
    return analogValue < FLAME_THRESHOLD;
  }
  return analogValue > FLAME_THRESHOLD;
}

void playCorrectCardSound() {
  digitalWrite(BUZZER_PIN, RELAY_ON); delay(100);
  digitalWrite(BUZZER_PIN, RELAY_OFF); delay(50);
  digitalWrite(BUZZER_PIN, RELAY_ON); delay(100);
  digitalWrite(BUZZER_PIN, RELAY_OFF);
}

void playWrongCardSound() {
  digitalWrite(BUZZER_PIN, RELAY_ON); delay(400);
  digitalWrite(BUZZER_PIN, RELAY_OFF);
}

void playSecurityActivatedSound() {
  digitalWrite(BUZZER_PIN, RELAY_ON); delay(80);
  digitalWrite(BUZZER_PIN, RELAY_OFF); delay(80);
  digitalWrite(BUZZER_PIN, RELAY_ON); delay(80);
  digitalWrite(BUZZER_PIN, RELAY_OFF);
}

void playSecurityDeactivatedSound() {
  digitalWrite(BUZZER_PIN, RELAY_ON); delay(150);
  digitalWrite(BUZZER_PIN, RELAY_OFF); delay(50);
  digitalWrite(BUZZER_PIN, RELAY_ON); delay(300);
  digitalWrite(BUZZER_PIN, RELAY_OFF);
}

void setup() {
  Serial.begin(115200);
  delay(100);

  pinMode(PUMP_1_PIN, INPUT_PULLUP);
  pinMode(PUMP_2_PIN, INPUT_PULLUP);
  pinMode(PUMP_3_PIN, INPUT_PULLUP);
  pinMode(BUZZER_PIN, INPUT_PULLUP);

  digitalWrite(PUMP_1_PIN, RELAY_OFF);
  digitalWrite(PUMP_2_PIN, RELAY_OFF);
  digitalWrite(PUMP_3_PIN, RELAY_OFF);
  digitalWrite(BUZZER_PIN, RELAY_OFF);

  pinMode(PUMP_1_PIN, OUTPUT);
  pinMode(PUMP_2_PIN, OUTPUT);
  pinMode(PUMP_3_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(PIR_1_PIN, INPUT);
  pinMode(PIR_2_PIN, INPUT);
  pinMode(FLAME_1_PIN, INPUT);
  pinMode(FLAME_2_PIN, INPUT);
  pinMode(FLAME_3_PIN, INPUT);

  SPI.begin(18, 19, 23, 5);
  rfid.PCD_Init();
  rfid.PCD_SetAntennaGain(rfid.RxGain_max);
  rfid.PCD_AntennaOn();
  delay(50);

  Serial.println("\n==================================");
  Serial.println("   Starting Integrated Security System   ");
  Serial.println("==================================\n");

  Wire.begin(21, 22);
  Wire.beginTransmission(PCF8574_ADDRESS);
  Wire.write(0xFF);
  Wire.endTransmission();

  doorServo.attach(SERVO_PIN);
  doorServo.write(OPEN_ANGLE);

  connectWiFi();
}

void loop() {
  maintainWiFi();
  pollBackendCommands();

  if (Serial.available() > 0) {
    String command = Serial.readStringUntil('\n');
    command.trim();

    if (command.equalsIgnoreCase("STOP")) {
      systemActive = false;
      digitalWrite(PUMP_1_PIN, RELAY_OFF);
      digitalWrite(PUMP_2_PIN, RELAY_OFF);
      digitalWrite(PUMP_3_PIN, RELAY_OFF);
      digitalWrite(BUZZER_PIN, RELAY_OFF);

      pump1State = false;
      pump2State = false;
      pump3State = false;
      isIntrusionActive = false;
      isFireActive = false;
      pendingAwayMode = false;
      wrongCardCount = 0;

      Serial.println("\nSystem stopped");
    }
    else if (command.equalsIgnoreCase("START")) {
      systemActive = true;
      Serial.println("\nSystem started");
    }
    else if (command.equalsIgnoreCase("ON")) {
      awayMode = true;
      pendingAwayMode = false;
      playSecurityActivatedSound();
      Serial.println("\nSecurity mode: [Enabled]");
    }
    else if (command.equalsIgnoreCase("OFF")) {
      awayMode = false;
      pendingAwayMode = false;
      playSecurityDeactivatedSound();
      Serial.println("\nSecurity mode: [Disabled]");
    }
    else if (command.equalsIgnoreCase("OPEN")) {
      doorOpen = true;
      doorServo.write(OPEN_ANGLE);
      Serial.println("\nDoor opened");
    }
    else if (command.equalsIgnoreCase("CLOSE")) {
      doorOpen = false;
      doorServo.write(CLOSE_ANGLE);
      Serial.println("\nDoor closed");
    }
  }

  if (!systemActive) return;

  if (millis() - lastNFCCheckTime >= 1000) {
    lastNFCCheckTime = millis();
    rfid.PCD_Init();
    rfid.PCD_SetAntennaGain(rfid.RxGain_max);
    rfid.PCD_AntennaOn();
  }

  if (rfid.PICC_IsNewCardPresent() && rfid.PICC_ReadCardSerial()) {
    if (millis() - lastCardReadTime >= cardCooldown) {
      lastCardReadTime = millis();

      bool accessGranted = true;

      for (byte i = 0; i < 4; i++) {
        if (rfid.uid.uidByte[i] != authorizedUID[i]) {
          accessGranted = false;
          break;
        }
      }

      reportNfcAccess(accessGranted);

      if (accessGranted) {
        isIntrusionActive = false;
        isFireActive = false;
        wrongCardCount = 0;

        digitalWrite(BUZZER_PIN, RELAY_OFF);

        pump1State = false;
        pump2State = false;
        pump3State = false;

        playCorrectCardSound();

        if (!doorOpen) {
          Serial.println("\n[NFC]: Valid card! Alarms cleared and security disabled.");

          playSecurityDeactivatedSound();

          awayMode = false;
          pendingAwayMode = false;

          doorServo.write(OPEN_ANGLE);
          doorOpen = true;
        }
        else {
          Serial.println("\n[NFC]: Valid card! Closing door and enabling security after 3 seconds.");

          doorServo.write(CLOSE_ANGLE);

          doorOpen = false;
          awayMode = false;
          pendingAwayMode = true;
          awayModeActivationTimer = millis();
        }
      }
      else {
        wrongCardCount++;

        Serial.printf("\n[NFC]: Unauthorized card! Attempt %d/5\n", wrongCardCount);

        playWrongCardSound();

        if (wrongCardCount >= 5) {
          isIntrusionActive = true;
          intrusionTimer = millis();
          wrongCardCount = 0;
        }
      }
    }

    rfid.PICC_HaltA();
  }

  hallwayPIR_Raw = (digitalRead(PIR_1_PIN) == HIGH);
  garagePIR_Raw = (digitalRead(PIR_2_PIN) == HIGH);

  if (hallwayPIR_Raw) {
    if (hallwayPIR_Timer == 0) hallwayPIR_Timer = millis();

    if (millis() - hallwayPIR_Timer >= pirDebounceTime) {
      hallwayPIR_Triggered = true;
    }
  }
  else {
    hallwayPIR_Timer = 0;
    hallwayPIR_Triggered = false;
  }

  if (garagePIR_Raw) {
    if (garagePIR_Timer == 0) garagePIR_Timer = millis();

    if (millis() - garagePIR_Timer >= pirDebounceTime) {
      garagePIR_Triggered = true;
    }
  }
  else {
    garagePIR_Timer = 0;
    garagePIR_Triggered = false;
  }

  if (millis() - lastExpanderCheckTime >= 40) {
    lastExpanderCheckTime = millis();

    Wire.requestFrom(PCF8574_ADDRESS, 1);

    if (Wire.available()) {
      byte expanderData = Wire.read();

      bool rawReed1 = bitRead(expanderData, 0);

      if (rawReed1 == true) {
        reed1Counter++;

        if (reed1Counter >= 5) {
          reed1 = true;
        }
      }
      else {
        reed1Counter = 0;
        reed1 = false;
      }

      reed2 = bitRead(expanderData, 1);
      reed3 = bitRead(expanderData, 2);
      vibration = bitRead(expanderData, 3);
    }
  }

  if (millis() - lastFlameCheckTime >= 80) {
    lastFlameCheckTime = millis();

    kitchenFlame = analogRead(FLAME_1_PIN);
    room1Flame   = analogRead(FLAME_2_PIN);
    room2Flame   = analogRead(FLAME_3_PIN);

    bool currentFireCondition = false;
    String fireSource = "";

    if (isFlameDetected(kitchenFlame)) {
      currentFireCondition = true;
      fireSource += "[Kitchen: Flame] ";

      if (!pump1State) {
        pump1State = true;
        pump1Timer = millis();
      }
    }

    if (isFlameDetected(room1Flame)) {
      currentFireCondition = true;
      fireSource += "[Room 1: Flame] ";

      if (!pump2State) {
        pump2State = true;
        pump2Timer = millis();
      }
    }

    if (isFlameDetected(room2Flame)) {
      currentFireCondition = true;
      fireSource += "[Room 2: Flame] ";

      if (!pump3State) {
        pump3State = true;
        pump3Timer = millis();
      }
    }

    if (currentFireCondition) {
      reportSensorEvent(SENSOR_FLAME);

      if (!isFireActive) {
        Serial.print("\nImmediate Fire Alarm - Analog flame: ");
        Serial.println(fireSource);

        isFireActive = true;
        fireTimer = millis();
      }
    }
  }

  if (millis() - lastSmokeCheckTime >= 500) {
    lastSmokeCheckTime = millis();

    kitchenSmoke = analogRead(SMOKE_1_PIN);
    hallwaySmoke = analogRead(SMOKE_2_PIN);
    livingSmoke  = analogRead(SMOKE_3_PIN);

    bool currentSmokeCondition = false;
    String smokeSource = "";

    if (kitchenSmoke > SMOKE_THRESHOLD) {
      currentSmokeCondition = true;
      smokeSource += "[Kitchen: Smoke] ";
    }

    if (hallwaySmoke > SMOKE_THRESHOLD) {
      currentSmokeCondition = true;
      smokeSource += "[Hallway: Smoke] ";
    }

    if (livingSmoke > SMOKE_THRESHOLD) {
      currentSmokeCondition = true;
      smokeSource += "[Living Room: Smoke] ";
    }

    if (currentSmokeCondition) {
      reportSensorEvent(SENSOR_GAS);

      if (!isFireActive) {
        Serial.print("\nImmediate Fire Alarm - Smoke: ");
        Serial.println(smokeSource);

        isFireActive = true;
        fireTimer = millis();
      }
    }
  }

  if (awayMode) {
    bool intrusionDetected = false;
    String exactLocation = "";
    const char* intrusionSensor = SENSOR_DOOR;

    if (hallwayPIR_Triggered) {
      intrusionDetected = true;
      exactLocation = "Hallway through [PIR Motion]";
      intrusionSensor = SENSOR_MOTION;
    }
    else if (garagePIR_Triggered) {
      intrusionDetected = true;
      exactLocation = "Garage through [PIR Motion]";
      intrusionSensor = SENSOR_MOTION;
    }
    else if (reed1) {
      intrusionDetected = true;
      exactLocation = "Room 1 through [Door/Window Reed Sensor]";
      intrusionSensor = SENSOR_DOOR;
    }
    else if (reed2) {
      intrusionDetected = true;
      exactLocation = "Room 2 through [Door/Window Reed Sensor]";
      intrusionSensor = SENSOR_DOOR;
    }
    else if (reed3) {
      intrusionDetected = true;
      exactLocation = "Living Room through [Door/Window Reed Sensor]";
      intrusionSensor = SENSOR_DOOR;
    }
    else if (vibration) {
      intrusionDetected = true;
      exactLocation = "Garage through [Break/Vibration Sensor]";
      intrusionSensor = SENSOR_VIBRATION;
    }

    if (intrusionDetected) {
      reportSensorEvent(intrusionSensor);

      if (!isIntrusionActive) {
        isIntrusionActive = true;
        intrusionTimer = millis();

        Serial.println("\nIntrusion Alarm: " + exactLocation);
      }
    }
  }

  if (pendingAwayMode && (millis() - awayModeActivationTimer >= 3000)) {
    pendingAwayMode = false;
    awayMode = true;

    Serial.println("\nUpdate: Security mode is now enabled [ON]!");

    playSecurityActivatedSound();
  }

  if (isIntrusionActive && (millis() - intrusionTimer >= 10000)) {
    isIntrusionActive = false;
    Serial.println("\nIntrusion alarm automatically cleared after 10 seconds.");
  }

  if (isFireActive && (millis() - fireTimer >= 10000)) {
    isFireActive = false;
    Serial.println("\nFire alarm automatically cleared after 10 seconds.");
  }

  if (pump1State && (millis() - pump1Timer >= 10000)) {
    pump1State = false;
  }

  if (pump2State && (millis() - pump2Timer >= 10000)) {
    pump2State = false;
  }

  if (pump3State && (millis() - pump3Timer >= 10000)) {
    pump3State = false;
  }

  if (isIntrusionActive || isFireActive) {
    if (millis() % 1000 < 200) {
      digitalWrite(BUZZER_PIN, RELAY_ON);
    }
    else {
      digitalWrite(BUZZER_PIN, RELAY_OFF);
    }
  }
  else {
    if (!pendingAwayMode) {
      digitalWrite(BUZZER_PIN, RELAY_OFF);
    }
  }

  digitalWrite(PUMP_1_PIN, pump1State ? RELAY_ON : RELAY_OFF);
  digitalWrite(PUMP_2_PIN, pump2State ? RELAY_ON : RELAY_OFF);
  digitalWrite(PUMP_3_PIN, pump3State ? RELAY_ON : RELAY_OFF);

  if (millis() - lastPrintTime >= printInterval) {
    lastPrintTime = millis();

    String r1State = reed1 ? "Open" : "Closed";
    String r2State = reed2 ? "Open" : "Closed";
    String r3State = reed3 ? "Open" : "Closed";

    String hPIR = hallwayPIR_Raw ? "Detected" : "Clear";
    String gPIR = garagePIR_Raw  ? "Detected" : "Clear";
    String vib  = vibration      ? "Danger"   : "Normal";

    String kFlameStr  = isFlameDetected(kitchenFlame) ? "Danger" : "Safe";
    String r1FlameStr = isFlameDetected(room1Flame)   ? "Danger" : "Safe";
    String r2FlameStr = isFlameDetected(room2Flame)   ? "Danger" : "Safe";

    Serial.println("\n=============================================");
    Serial.println("          Sensor Dashboard");
    Serial.println("=============================================");
    Serial.printf("| Kitchen     | Smoke: %-4d | Flame analog: %-4d | %s\n", kitchenSmoke, kitchenFlame, kFlameStr.c_str());
    Serial.printf("| Room 1      | Flame analog: %-4d | %s | Window: %s\n", room1Flame, r1FlameStr.c_str(), r1State.c_str());
    Serial.printf("| Room 2      | Flame analog: %-4d | %s | Window: %s\n", room2Flame, r2FlameStr.c_str(), r2State.c_str());
    Serial.printf("| Living Room | Smoke: %-4d | Window: %s\n", livingSmoke, r3State.c_str());
    Serial.printf("| Hallway     | Smoke: %-4d | Motion: %s\n", hallwaySmoke, hPIR.c_str());
    Serial.printf("| Garage      | Motion: %s | Break: %s\n", gPIR.c_str(), vib.c_str());
    Serial.println("---------------------------------------------");
    Serial.printf("| Security System: %s\n", awayMode ? "[Enabled]" : "[Disabled]");
    Serial.printf("| WiFi: %s\n", WiFi.status() == WL_CONNECTED ? "Connected" : "Disconnected");
    Serial.println("=============================================\n");
  }
}
