# Retained AVR thermostat fixture provenance

`avr-thermostat-retained.hex.base64` is an exact base64 transport encoding of
the 7,418-byte Intel HEX artifact generated from this repository's
Apache-2.0-licensed `THERMOSTAT_EXPERIMENT_SOURCE`. It is test data, not a
third-party visual or source asset.

- source SHA-256: `abc65e1212c72aaed7325c059cb785a8872b45fddc7ba67ceb0cb098d2c0da76`
- decoded Intel HEX SHA-256: `15e063cfc10eb127fae0cb87ea57037a388a98db08b099fc7f8da061ed0b0505`
- retained evidence: receipt
  `desktop-etvt6l5-ct109-lab-x47-proven-runner-20261021-001`, source
  `867d0a10b0c8b075fa747dff74222fb7108070d0`
- independent current-toolchain confirmation: the isolated rc.118 AVR image
  `sha256:62e4324594b63e88b17052a17eb9edf52593aff7d907647bc1e9c2fd809fbc74`
  reproduced the same decoded Intel HEX SHA-256 on 2026-10-23

The browser regression decodes these exact bytes without invoking a compiler
producer and runs them only in the existing deterministic browser worker.
