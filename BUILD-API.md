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

## Read and cancel

`GET /api/build/{jobId}` and `DELETE /api/build/{jobId}` require
`Authorization: Bearer {capability}` from the same origin identity. DELETE also
requires the submit mutation headers. A job ID without its capability returns
the same not-found response as an absent job.

Terminal states are `succeeded`, `failed`, `cancelled` and `timeout`. Success
contains checksummed ELF/HEX output, sanitized diagnostics, an artifact
identity and worker-isolation readback. Source and capabilities are never
logged. Failed or cancelled jobs never produce a runnable artifact.

## Health

- `GET /healthz`: gateway process is serving.
- `GET /readyz`: the exact image-ID-locked local compiler is available.

The implementation and stable error codes are in `compiler/`. Resource,
retention and recovery behavior is documented in `LOCAL-OPERATIONS.md`.
