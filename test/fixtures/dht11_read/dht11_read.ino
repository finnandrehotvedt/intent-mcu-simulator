const byte DHT_DATA = 4;

bool waitForDhtLevel(byte level, unsigned long timeoutMicros) {
  unsigned long waitStart = micros();
  while (digitalRead(DHT_DATA) != level) {
    if (micros() - waitStart > timeoutMicros) return false;
  }
  return true;
}

bool readDht11(byte &temperatureC, byte &humidityPercent) {
  byte data[5] = {0, 0, 0, 0, 0};
  pinMode(DHT_DATA, OUTPUT);
  digitalWrite(DHT_DATA, LOW);
  delay(20);
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
  if (data[1] != 0 || data[3] != 0 || checksum != data[4]) return false;
  humidityPercent = data[0];
  temperatureC = data[2];
  return true;
}

void setup() {
  pinMode(DHT_DATA, INPUT_PULLUP);
  Serial.begin(115200);
}

void loop() {
  byte temperatureC = 0;
  byte humidityPercent = 0;
  if (readDht11(temperatureC, humidityPercent)) {
    Serial.print("TEMP_C=");
    Serial.print(temperatureC);
    Serial.print(" HUMIDITY_RH=");
    Serial.print(humidityPercent);
    Serial.println(" CHECKSUM=OK");
  } else {
    Serial.println("DHT11 READ ERROR");
  }
  delay(1500);
}
