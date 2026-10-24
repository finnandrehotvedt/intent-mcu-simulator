// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Finn Andre Hotvedt and IntentForce

export const API_SESSION_PROTOCOL_URL = 'https://lab.teachthecompany.com/api/session/v1/protocol.txt';
export const API_SESSION_CLIENT_URL = 'https://lab.teachthecompany.com/api/session/v1/client.mjs';

export const CODEX_PAIRING_INSTRUCTIONS = `Work with my open Intent MCU Simulator project through its temporary browser-session API.

Lab: https://lab.teachthecompany.com/
Protocol v1: ${API_SESSION_PROTOCOL_URL}
Reference client: ${API_SESSION_CLIENT_URL}

Safety and authority:
- First read the versioned protocol and download the reference client from those public URLs. Do not invent an SDK, endpoint, command, pin, component ID, net ID, revision, or scope.
- The only endpoint is same-origin POST /api/session/v1 using schema intent-mcu-browser-session-request@1.
- Discover before editing: inspect capabilities, project, components, component catalogue, named pins, nets, revision, and validation.
- Read-only scopes are discover and read_project. edit_circuit is a separate explicit opt-in and works only for the ATmega328P 16 MHz (AVR) profile. Pico, ESP32-C3 and STM32 are read-only.
- There is no Build, Run, compile, upload, device, native-runtime, worker, filesystem, or deployment authority.
- Use named pins and one atomic edit.batch of no more than 16 operations. Bind every request to the returned session ID, project ID, increasing sequence, and exact latest revision.
- Keep the server-returned transaction ID. Undo or redo only that exact transaction at the current history head. On stale revision, conflict, expiry, reload, revoke, project/profile change, or API_* error, stop, inspect again, and ask me to re-pair when required. Never guess or silently retry a mutation.
- Pairings are one-use and temporary. The tab owner may revoke them, and reload or project replacement invalidates them.

Secret handling:
- Never ask me to paste the one-time pairing secret into chat.
- Never place it in a prompt, command argument, URL, log, file, source control, or generated script.
- Prepare the local client first. Then tell me to enter the secret only in my own terminal through hidden/local stdin. Keep it in memory only and clear the shell variable immediately.

Local setup and run:
1. Create a new private local directory and download the reference client as client.mjs from the public client URL.
2. Verify that Node.js 20 or newer is available. Do not install packages; the client uses only Node built-ins.
3. Ask me to open the Lab, choose the AVR profile, open API access, tick the separate AVR editing checkbox only if editing is intended, and click Enable and create pairing.
4. Give me this local-terminal pattern without filling in the secret:
   read -rsp "Pairing secret: " PAIRING_SECRET; printf '\\n'; printf '%s\\n' "$PAIRING_SECRET" | node ./client.mjs https://lab.teachthecompany.com/; unset PAIRING_SECRET
5. The reference journey discovers the live project, atomically draws a board, resistor and LED with three named wires (D13 to resistor A, resistor B to LED ANODE, LED CATHODE to GND1), inspects the result, and undoes only its own transaction.
6. Report only non-secret result codes, revisions, component IDs, named pins, net IDs, transaction ID, and Undo outcome. If access expires or is revoked, tell me to create a fresh pairing; never reuse the old secret.

Do not claim that this chat itself has the API tool. Create or download the local script, explain the local secret-entry step, and wait for me to run that step when human input is required.`;

