# X23 bounded input-fault contract

X23 adds one deterministic AVR thermostat fault suite to the existing authored
scenario timeline. It does not add a generic fault, bus, or high-impedance
model.

## Supported cases

- `fault.button-bounce-v1` applies the fixed five-transition pattern at 0, 2,
  4, 6, and 8 ms relative to the requested event and records each actual
  producer transition.
- `fault.temperature-stuck-v1` fixes A1 at the requested temperature and
  records both fault application and a later attempted sensor change that was
  held by the fault.
- `fault.button-open-circuit-v1` removes the external D2 drive. The actual pin
  must report `externalDrive: RELEASED` and resolve high through firmware's
  active `INPUT_PULLUP`; injecting an externally driven high is not equivalent.

`fault.bus-response-v1` is explicitly unsupported because the approved
thermostat slice has no response-producing bus peripheral.

## Authority and evidence

The `intent-mcu-scenario-timeline@3` schedule is strict, bounded data. Save and
Open preserve only that authored data; builds, runtime bindings, observations,
and verdicts are never restored. The browser and headless paths compile fresh,
execute the same ordered fault sequence, and evaluate separate requested-fault
and actual-producer logs. Missing producer evidence is X18 indeterminate;
contradictory producer behavior fails. Every actual fault event carries its
requested and applied cycle, and must occur within the observation window.

## Limits

The suite contains exactly three scenarios and one fault event per scenario.
It permits at most five bounce transitions and a 350 ms timeline. It applies
only to `board.atmega328p-16mhz-v1` and the bounded thermostat example.
