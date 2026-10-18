# Existing-graph edit safety contract

This public contract covers W06, W07, W08 and W10 for the four controller
workflows, including ordinary AVR v2 and candidate-v3 graphs. It does not add
components, controllers, runtime models, narrow-profile branches or narrow
duplication.

The AVR editors expose explicit junction branches, branch reconnect and
branch-versus-net deletion. Candidate-v3 reconnect passes the same strict
validation and complete-document history boundary as its other graph commands.
Pico, ESP32-C3 and STM32 keep their
fixed board → resistor → LED → ground graphs, one resistor and one LED.
Unsupported operations are explicit unavailable states, not hidden failures.

Malformed or unsupported commands reject without changing the project.
Electrically invalid drafts may remain editable data, but Run stays blocked and
stale executable authority is retired. Component movement, rotation, wire
colour and route geometry are visual-only and preserve matching executable
authority because they do not change named-pin connectivity. Component,
property and wire changes still require a fresh Build.

Save/Open remains data-only. It never restores history, artifact, runtime,
GPIO/Serial observation or event authority. W06, W07, W08 and W10 are complete
after public source and browser acceptance. W08 includes every selectable
AVR model: click and drag placement, disconnected duplication with a fresh
stable ID, pointer and keyboard movement, rotation and deletion. Narrow-profile
fixed-graph limits remain explicit.

W10 covers every fault representable by those exact profiles: named supply to
ground shorts, known opposing AVR output levels, declared 5 V supply-role
mismatch, missing ground, LED polarity, required series resistance and bounded
ideal LED overcurrent. The narrow 3.3 V profiles retain fixed graphs and cannot
represent arbitrary rail mixing or multiple outputs. The product does not
claim a general circuit solver, physical damage prediction or safety
certification.
