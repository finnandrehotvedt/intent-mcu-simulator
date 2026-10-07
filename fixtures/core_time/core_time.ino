// Original project fixture: monotonic Arduino core time over USART0.
void setup() {
  Serial.begin(115200);
}

void loop() {
  uint32_t m = millis();
  uint32_t u = micros();
  Serial.write((uint8_t *)&m, sizeof(m));
  Serial.write((uint8_t *)&u, sizeof(u));
  delay(10);
}
