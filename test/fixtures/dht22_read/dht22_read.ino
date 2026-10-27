const byte DHT_DATA = 5;

bool waitForDhtLevel(byte level, unsigned long timeoutMicros) {
  unsigned long waitStart = micros();
  while (digitalRead(DHT_DATA) != level) {
    if (micros() - waitStart > timeoutMicros) return false;
  }
  return true;
}

bool readDht22(int16_t &temperatureTenths, uint16_t &humidityTenths) {
  byte data[5] = {0, 0, 0, 0, 0};
  pinMode(DHT_DATA, OUTPUT);
  digitalWrite(DHT_DATA, LOW);
  delay(2);
  pinMode(DHT_DATA, INPUT_PULLUP);
  if (!waitForDhtLevel(LOW, 250)) return false;
  if (!waitForDhtLevel(HIGH, 150)) return false;
  if (!waitForDhtLevel(LOW, 150)) return false;
  for (byte bit = 0; bit < 40; bit++) {
    if (!waitForDhtLevel(HIGH, 120)) return false;
    delayMicroseconds(40);
    data[bit / 8] = (data[bit / 8] << 1) | (digitalRead(DHT_DATA) == HIGH ? 1 : 0);
    if (!waitForDhtLevel(LOW, 120)) return false;
  }
  byte checksum = byte(data[0] + data[1] + data[2] + data[3]);
  if (checksum != data[4]) return false;
  humidityTenths = (uint16_t(data[0]) << 8) | data[1];
  int16_t magnitude = (int16_t(data[2] & 0x7f) << 8) | data[3];
  temperatureTenths = (data[2] & 0x80) ? -magnitude : magnitude;
  return humidityTenths <= 1000 && temperatureTenths >= -400 && temperatureTenths <= 800;
}

void setup() {
  pinMode(DHT_DATA, INPUT_PULLUP);
  Serial.begin(115200);
}

void loop() {
  int16_t temperatureTenths = 0;
  uint16_t humidityTenths = 0;
  if (readDht22(temperatureTenths, humidityTenths)) {
    Serial.print("TEMP_C=");
    Serial.print(temperatureTenths / 10.0, 1);
    Serial.print(" HUMIDITY_RH=");
    Serial.print(humidityTenths / 10.0, 1);
    Serial.println(" CHECKSUM=OK");
  } else {
    Serial.println("DHT22 READ ERROR");
  }
  delay(2000);
}
