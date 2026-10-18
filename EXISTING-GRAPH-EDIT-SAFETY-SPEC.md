# Existing-graph edit safety contract

This private candidate covers W06, W07, W08 and W10 only for the four current
public graphs and commands. It does not add topology, components, controllers,
runtime models, narrow-profile branches, narrow duplication or arbitrary part
placement.

The AVR editor keeps its existing branched graph, branch-versus-net deletion,
duplication and broad electrical validator. Pico, ESP32-C3 and STM32 keep their
fixed board → resistor → LED → ground graphs, one resistor and one LED.
Unsupported operations are explicit unavailable states, not hidden failures.

Malformed or unsupported commands reject without changing the project.
Electrically invalid drafts may remain editable data, but Run stays blocked and
stale executable authority is retired. Component movement, rotation, wire
colour and route geometry are visual-only and preserve matching executable
authority because they do not change named-pin connectivity. Component,
property and wire changes still require a fresh Build.

Save/Open remains data-only. It never restores history, artifact, runtime,
GPIO/Serial observation or event authority. The four requirements remain
partial until their stated broader gaps are resolved and public acceptance is
completed.
