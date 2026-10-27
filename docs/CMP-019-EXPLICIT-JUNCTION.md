# CMP-019 — explicit junction point

CMP-019 is a graph operation, not a component model. A junction joins three or
more named endpoints in one declared net. A route from a different net can pass
through the same drawing coordinate without becoming electrically connected.

## Profile representation

| Profile | Stored representation | Canonical example authority |
| --- | --- | --- |
| ATmega328P 16 MHz | First-class `{ id, net }` junction record plus a multi-endpoint net | The topology participates only after a fresh project-specific Build; the junction grants no independent runtime authority |
| RP2040 Pico | Validated net with three or more endpoints; the dot is derived from that net | Authoring-only example; executable projection unavailable |
| ESP32-C3 | Validated net with three or more endpoints; the dot is derived from that net | Authoring-only example; executable projection unavailable |
| STM32F429ZI | Validated net with three or more endpoints; the dot is derived from that net | Authoring-only example; executable projection unavailable |

The narrow profiles deliberately do not fabricate AVR's first-class junction
identity. Their canonical examples fail closed with
`MODEL_LIBRARY_COMPONENT_UNAVAILABLE` because the helper ground reference is
authoring-only. CMP-019 does not complete or broaden the separate CMP-020
ground/power-symbol requirement.

## Canonical topology

Every profile example contains:

- one junction net with at least three exact named endpoints;
- one different net whose route reaches the same normalized drawing point;
- no endpoint shared between those two nets;
- deterministic route-family data and a canonical project hash;
- Save/Open data only—never restored build or runtime authority.

The AVR example stores an explicit junction ID. The other three store the
branched net itself and derive the visible junction dot from its endpoint
count. Crossing geometry is presentation; net and endpoint identities remain
the electrical source of truth.

## Explicit limits

This contract does not model contact resistance, current capacity, voltage
drop, heating, parasitics, arcing, insulation, safety certification or
physical hardware. It does not add an ideal-wire solver or make a project
executable. Existing profile-specific Build validation remains authoritative.
