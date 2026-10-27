#include <Arduino.h>
#include <avr/io.h>

static const uint8_t BME_ADDRESS = 0x76;

struct Calibration {
  uint16_t t1, p1;
  int16_t t2, t3, p2, p3, p4, p5, p6, p7, p8, p9, h2, h4, h5;
  uint8_t h1, h3;
  int8_t h6;
};

static Calibration calibration;
static float tFine = 0;

static void twiWait() { while (!(TWCR & _BV(TWINT))) {} }
static void twiStart(uint8_t addressByte) {
  TWCR = _BV(TWINT) | _BV(TWSTA) | _BV(TWEN); twiWait();
  TWDR = addressByte; TWCR = _BV(TWINT) | _BV(TWEN); twiWait();
}
static void twiWriteByte(uint8_t value) {
  TWDR = value; TWCR = _BV(TWINT) | _BV(TWEN); twiWait();
}
static uint8_t twiReadByte(bool acknowledge) {
  TWCR = _BV(TWINT) | _BV(TWEN) | (acknowledge ? _BV(TWEA) : 0); twiWait();
  return TWDR;
}
static void twiStop() { TWCR = _BV(TWINT) | _BV(TWEN) | _BV(TWSTO); }

static void writeRegister(uint8_t address, uint8_t value) {
  twiStart(BME_ADDRESS << 1); twiWriteByte(address); twiWriteByte(value); twiStop();
}

static void readRegisters(uint8_t address, uint8_t *target, uint8_t length) {
  twiStart(BME_ADDRESS << 1); twiWriteByte(address);
  twiStart((BME_ADDRESS << 1) | 1);
  for (uint8_t index = 0; index < length; index++) {
    target[index] = twiReadByte(index + 1 < length);
  }
  twiStop();
}

static uint16_t readU16(const uint8_t *bytes) {
  return uint16_t(bytes[0]) | (uint16_t(bytes[1]) << 8);
}
static int16_t readS16(const uint8_t *bytes) { return int16_t(readU16(bytes)); }

static void readCalibration() {
  uint8_t primary[26];
  uint8_t humidity[7];
  readRegisters(0x88, primary, sizeof primary);
  readRegisters(0xE1, humidity, sizeof humidity);
  calibration.t1 = readU16(primary + 0); calibration.t2 = readS16(primary + 2); calibration.t3 = readS16(primary + 4);
  calibration.p1 = readU16(primary + 6); calibration.p2 = readS16(primary + 8); calibration.p3 = readS16(primary + 10);
  calibration.p4 = readS16(primary + 12); calibration.p5 = readS16(primary + 14); calibration.p6 = readS16(primary + 16);
  calibration.p7 = readS16(primary + 18); calibration.p8 = readS16(primary + 20); calibration.p9 = readS16(primary + 22);
  calibration.h1 = primary[25]; calibration.h2 = readS16(humidity + 0); calibration.h3 = humidity[2];
  calibration.h4 = (int16_t(int8_t(humidity[3])) << 4) | (humidity[4] & 0x0F);
  calibration.h5 = (int16_t(int8_t(humidity[5])) << 4) | (humidity[4] >> 4);
  calibration.h6 = int8_t(humidity[6]);
}

static float compensateTemperature(uint32_t raw) {
  float first = (float(raw) / 16384.0 - float(calibration.t1) / 1024.0) * float(calibration.t2);
  float second = float(raw) / 131072.0 - float(calibration.t1) / 8192.0;
  tFine = first + second * second * float(calibration.t3);
  return tFine / 5120.0;
}

static float compensatePressure(uint32_t raw) {
  float first = tFine / 2.0 - 64000.0;
  float second = first * first * float(calibration.p6) / 32768.0;
  second += first * float(calibration.p5) * 2.0;
  second = second / 4.0 + float(calibration.p4) * 65536.0;
  first = (float(calibration.p3) * first * first / 524288.0 + float(calibration.p2) * first) / 524288.0;
  first = (1.0 + first / 32768.0) * float(calibration.p1);
  if (first == 0) return 0;
  float pressure = 1048576.0 - float(raw);
  pressure = (pressure - second / 4096.0) * 6250.0 / first;
  first = float(calibration.p9) * pressure * pressure / 2147483648.0;
  second = pressure * float(calibration.p8) / 32768.0;
  return pressure + (first + second + float(calibration.p7)) / 16.0;
}

static float compensateHumidity(uint16_t raw) {
  float humidity = tFine - 76800.0;
  humidity = (float(raw) - (float(calibration.h4) * 64.0 + float(calibration.h5) / 16384.0 * humidity))
    * (float(calibration.h2) / 65536.0 * (1.0 + float(calibration.h6) / 67108864.0
      * humidity * (1.0 + float(calibration.h3) / 67108864.0 * humidity)));
  humidity *= 1.0 - float(calibration.h1) * humidity / 524288.0;
  if (humidity < 0) return 0;
  if (humidity > 100) return 100;
  return humidity;
}

void setup() {
  Serial.begin(115200);
  TWSR = 0; TWBR = 72;
  uint8_t chipId = 0; readRegisters(0xD0, &chipId, 1);
  if (chipId != 0x60) { Serial.println("BME280 CHIP ERROR"); return; }
  readCalibration();
  writeRegister(0xF2, 0x01);
  writeRegister(0xF4, 0x27);
}

void loop() {
  uint8_t data[8]; readRegisters(0xF7, data, sizeof data);
  uint32_t rawPressure = (uint32_t(data[0]) << 12) | (uint32_t(data[1]) << 4) | (data[2] >> 4);
  uint32_t rawTemperature = (uint32_t(data[3]) << 12) | (uint32_t(data[4]) << 4) | (data[5] >> 4);
  uint16_t rawHumidity = (uint16_t(data[6]) << 8) | data[7];
  float temperatureC = compensateTemperature(rawTemperature);
  float pressureHpa = compensatePressure(rawPressure) / 100.0;
  float humidityPercent = compensateHumidity(rawHumidity);
  Serial.print("TEMP_C="); Serial.print(temperatureC, 1);
  Serial.print(" HUMIDITY_RH="); Serial.print(humidityPercent, 1);
  Serial.print(" PRESSURE_HPA="); Serial.print(pressureHpa, 1);
  Serial.println(" CHIP=0x60");
  delay(800);
}
