// Original project fixture: all six ADC channels are reported over USART0.
void setup() {
  Serial.begin(115200);
}

void loop() {
  for (uint8_t channel = 0; channel < 6; channel++) {
    uint16_t value = analogRead(A0 + channel);
    Serial.write(channel);
    Serial.write(value >> 8);
    Serial.write(value & 0xff);
  }
  delay(20);
}
