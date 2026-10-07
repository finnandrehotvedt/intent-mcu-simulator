// Original project fixture: INT0 increments a counter and toggles D13.
volatile uint8_t interruptCount = 0;

void onEdge() {
  interruptCount++;
  digitalWrite(13, interruptCount & 1);
}

void setup() {
  pinMode(2, INPUT_PULLUP);
  pinMode(13, OUTPUT);
  attachInterrupt(digitalPinToInterrupt(2), onEdge, FALLING);
}

void loop() {}
