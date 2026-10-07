// Original project fixture: drive Arduino core counters through uint32 wrap.
extern volatile unsigned long timer0_millis;
extern volatile unsigned long timer0_overflow_count;

bool sent = false;

void setup() {
  Serial.begin(115200);
  noInterrupts();
  timer0_millis = 0xfffffffeUL;
  timer0_overflow_count = 0x003ffffeUL;
  interrupts();
}

void loop() {
  if (sent) return;
  sent = true;
  for (uint8_t i = 0; i < 4; i++) {
    uint32_t m = millis();
    uint32_t u = micros();
    Serial.write((uint8_t *)&m, sizeof(m));
    Serial.write((uint8_t *)&u, sizeof(u));
    delay(2);
  }
}
