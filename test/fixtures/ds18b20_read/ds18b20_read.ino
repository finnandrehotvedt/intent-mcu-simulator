const byte ONE_WIRE_PIN = 3;

void oneWireLow() {
  pinMode(ONE_WIRE_PIN, OUTPUT);
  digitalWrite(ONE_WIRE_PIN, LOW);
}

void oneWireRelease() {
  pinMode(ONE_WIRE_PIN, INPUT_PULLUP);
}

bool oneWireReset() {
  oneWireLow();
  delayMicroseconds(500);
  oneWireRelease();
  delayMicroseconds(70);
  bool present = digitalRead(ONE_WIRE_PIN) == LOW;
  delayMicroseconds(410);
  return present;
}

void oneWireWriteBit(byte value) {
  oneWireLow();
  if (value) {
    delayMicroseconds(6);
    oneWireRelease();
    delayMicroseconds(64);
  } else {
    delayMicroseconds(60);
    oneWireRelease();
    delayMicroseconds(10);
  }
}

byte oneWireReadBit() {
  oneWireLow();
  delayMicroseconds(3);
  oneWireRelease();
  delayMicroseconds(12);
  byte value = digitalRead(ONE_WIRE_PIN) == HIGH;
  delayMicroseconds(55);
  return value;
}

void oneWireWriteByte(byte value) {
  for (byte bit = 0; bit < 8; bit++) {
    oneWireWriteBit((value >> bit) & 1);
  }
}

byte oneWireReadByte() {
  byte value = 0;
  for (byte bit = 0; bit < 8; bit++) {
    value |= oneWireReadBit() << bit;
  }
  return value;
}

byte oneWireCrc8(const byte *data, byte length) {
  byte crc = 0;
  for (byte index = 0; index < length; index++) {
    byte incoming = data[index];
    for (byte bit = 0; bit < 8; bit++) {
      byte mix = (crc ^ incoming) & 1;
      crc >>= 1;
      if (mix) crc ^= 0x8C;
      incoming >>= 1;
    }
  }
  return crc;
}

bool readTemperature(int16_t &rawTemperature) {
  if (!oneWireReset()) return false;
  oneWireWriteByte(0xCC);
  oneWireWriteByte(0x44);
  delay(800);
  if (!oneWireReset()) return false;
  oneWireWriteByte(0xCC);
  oneWireWriteByte(0xBE);
  byte scratchpad[9];
  for (byte index = 0; index < 9; index++) scratchpad[index] = oneWireReadByte();
  if (oneWireCrc8(scratchpad, 8) != scratchpad[8]) return false;
  rawTemperature = (int16_t)((uint16_t)scratchpad[1] << 8 | scratchpad[0]);
  return true;
}

void setup() {
  oneWireRelease();
  Serial.begin(115200);
}

void loop() {
  int16_t rawTemperature = 0;
  if (readTemperature(rawTemperature)) {
    Serial.print("TEMP_C=");
    Serial.print(rawTemperature / 16.0, 4);
    Serial.println(" CRC=OK");
  } else {
    Serial.println("DS18B20 READ ERROR");
  }
  delay(800);
}
