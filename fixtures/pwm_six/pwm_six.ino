// Original project fixture: exercise every supported PWM output.
const uint8_t pwmPins[] = {3, 5, 6, 9, 10, 11};

void setup() {
  for (uint8_t i = 0; i < sizeof(pwmPins); i++) {
    analogWrite(pwmPins[i], 64 + i * 24);
  }
}

void loop() {}
