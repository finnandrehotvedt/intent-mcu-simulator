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
- Never place it in a prompt, command argument, URL, log, source control, or generated script.
- The Lab-generated .intentpair ticket is the only permitted secret-bearing file. It is short-lived, one-use, local, and must never be shared or committed. The client deletes it immediately after strict parsing and keeps capabilities in memory only.

Local setup and run:
1. Create a new private local directory and download the reference client as client.mjs from the public client URL.
2. Verify that Node.js 20 or newer is available. Do not install packages; the client uses only Node built-ins.
3. Translate my requested circuit change into a NONSECRET plan.json using schema intent-mcu-browser-session-plan@1 and only the exact operation shapes documented by Protocol v1. Never add a component.remove unless I explicitly requested removal; the client rejects removal by default.
4. Before asking me to create a pairing, prepare one genuinely persistent local process invocation with a writable stdin and a reusable process/session handle. A plain shell command whose stdin is closed is not a session. Do not launch --session through a fire-and-forget command, command substitution, or an exec call that cannot send later lines. The client now rejects that launch as API_SESSION_STDIN_REQUIRED before it reads or deletes the ticket.
5. Ask me to open the Lab, choose the intended profile, open API access, leave AVR editing unchecked for inspection or tick it only for requested AVR edits, click Enable and create pairing, then Download pairing ticket. One ticket is claimed once. Start exactly one keep-open process and wait for its first JSON line with mode "session" before reporting that pairing succeeded. Retain that same process handle across later chat turns; never launch client.mjs again for the same ticket.
6. Ongoing JSONL session on Windows PowerShell: node .\\client.mjs --session .\\intent-mcu-pairing.intentpair
   Ongoing JSONL session on POSIX: node ./client.mjs --session ./intent-mcu-pairing.intentpair
   Send one JSON object per line: {"command":"inspect"}; {"command":"apply","plan":{...}}; {"command":"undo","transaction_id":"server-returned exact ID"}; or {"command":"close"}. Never place a secret in these lines.
   One-shot read-only on Windows PowerShell: node .\\client.mjs --ticket .\\intent-mcu-pairing.intentpair
   Prepared edit on Windows PowerShell: node .\\client.mjs --ticket .\\intent-mcu-pairing.intentpair plan.json
   One-shot read-only on POSIX: node ./client.mjs --ticket ./intent-mcu-pairing.intentpair
   Prepared edit on POSIX: node ./client.mjs --ticket ./intent-mcu-pairing.intentpair plan.json
   The client deletes the short-lived ticket after reading it. If no ticket is supplied, the legacy command still asks for the secret without echoing it.
7. The client discovers the live project, IDs, catalogue, named pins, nets, revision and validation before any requested mutation. A plan is one atomic batch and preserves all unrelated existing components, properties and nets.
8. Session mode prints one safe JSON result per line and stays open for another command. Use the retained process handle's stdin/stdout for every later turn. It performs Undo only after a separate explicit undo command with the exact returned transaction ID. One-shot edit mode still waits for the exact word UNDO. Never auto-undo.
9. Report only non-secret result codes, revisions, component IDs, named pins, net IDs, transaction ID, and explicit Undo outcome. If access expires or is revoked, tell me to create a fresh pairing; never reuse the old secret.

Lifetime truth: session mode sends a quiet authenticated heartbeat every 60 seconds from the same memory-only client process. Each accepted heartbeat renews the 120-second idle lease and its bounded 15-minute renewal horizon only while the original browser owner tab is also alive and heartbeating. This provides browser-session-style continuity across normal AI chat turns without cookies, accounts, disk capabilities or a daemon. Closing the client, closing or reloading the owner tab, Revoke, two missed client heartbeats, or authority loss still fails closed and requires a fresh pairing. One-shot mode never renews a lease.

Do not claim that this chat itself has the API tool. Prepare a task-specific nonsecret plan only after discovery, explain the local ticket step, and wait for me to run that step when human input is required.`;
