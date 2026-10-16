# Local build API

The local gateway exposes one same-origin, JSON-only build API. It is not a
general compiler interface and accepts no command, path, package, board URL or
compiler option from the caller.

## Submit

`POST /api/build` requires `Content-Type: application/json`, an exact `Origin`
matching the gateway and `X-Teach-Lab-Build: 1`.

```json
{
  "schema": "teach-lab-build-request@1",
  "board": "board.atmega328p-16mhz-v1",
  "files": [{ "name": "main.ino", "content": "void setup(){} void loop(){}" }]
}
```

Only `main.ino` plus bounded project-local `.h`, `.hpp`, `.c` and `.cpp` names
are accepted: at most eight files, 128 KiB source and the fixed board profile.
The `202` response returns a 24-hex-character job ID, an independent unguessable
capability and the complete input identity.

The same endpoint also accepts the exact
`intent-mcu-rp2040-source-build-request@1` contract for
`board.rp2040-pico-v1`. It requires one `main.c` file matching the documented
three-call grammar: GPIO0 level `0` or `1`, 1–24 uppercase UART0 characters,
and halt. No caller-selected include, path, flag, linker, MMIO, package or
output format is accepted.

## Read and cancel

`GET /api/build/{jobId}` and `DELETE /api/build/{jobId}` require
`Authorization: Bearer {capability}` from the same origin identity. DELETE also
requires the submit mutation headers. A job ID without its capability returns
the same not-found response as an absent job.

Terminal states are `succeeded`, `failed`, `cancelled` and `timeout`. AVR
success contains checksummed ELF/HEX output. Pico success contains a strict
canonical-base64, checksummed and source-bound UF2 plus compiler-contract
identity. Both contain sanitized diagnostics, an artifact identity and
worker-isolation readback. Source and capabilities are never logged. Failed or
cancelled jobs never produce a runnable artifact.

## Health

- `GET /healthz`: gateway process is serving.
- `GET /readyz`: both exact image-ID-locked compiler images are available.

The implementation and stable error codes are in `compiler/`. Resource,
retention and recovery behavior is documented in `LOCAL-OPERATIONS.md`.
