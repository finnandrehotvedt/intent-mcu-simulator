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
- Prepare the local client first. Then tell me to enter the secret only into the client's own hidden terminal prompt. The client keeps capabilities in memory only.

Local setup and run:
1. Create a new private local directory and download the reference client as client.mjs from the public client URL.
2. Verify that Node.js 20 or newer is available. Do not install packages; the client uses only Node built-ins.
3. Translate my requested circuit change into a NONSECRET plan.json using schema intent-mcu-browser-session-plan@1 and only the exact operation shapes documented by Protocol v1. Never add a component.remove unless I explicitly requested removal; the client rejects removal by default.
4. Ask me to open the Lab, choose the intended profile, open API access, leave AVR editing unchecked for inspection or tick it only for my requested AVR edit, and click Enable and create pairing.
5. On Windows PowerShell run: node .\\client.mjs https://lab.teachthecompany.com/ [plan.json]. On POSIX run: node ./client.mjs https://lab.teachthecompany.com/ [plan.json]. Omit plan.json for read-only inspection. The client itself asks for the secret without echoing it.
6. The client discovers the live project, IDs, catalogue, named pins, nets, revision and validation before any requested mutation. A plan is one atomic batch and preserves all unrelated existing components, properties and nets.
7. After an edit the client prints the inspected result and waits. It performs Undo only if I separately type the exact word UNDO while that same in-memory session is open; Enter keeps the change. Never auto-undo.
8. Report only non-secret result codes, revisions, component IDs, named pins, net IDs, transaction ID, and explicit Undo outcome. If access expires or is revoked, tell me to create a fresh pairing; never reuse the old secret.

Do not claim that this chat itself has the API tool. Prepare a task-specific nonsecret plan only after discovery, explain the local hidden secret-entry step, and wait for me to run that step when human input is required.`;
