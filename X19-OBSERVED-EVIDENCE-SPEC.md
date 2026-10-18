# X19 observed output evidence

Receipt: `desktop-etvt6l5-ct109-lab-x19-observed-evidence-20261018-001`

The existing AVR thermostat evaluator already satisfies X19. A physical-output
claim is decided from the executed D13 pin/model snapshot. UART text is retained
as supporting evidence and `mayPassAlone` is false. A matching Serial claim
cannot override an observed D13 mismatch.

The retained integration compiles a correct control and an intentionally
misleading source. The misleading program forces D13 LOW while its executed
UART still emits the otherwise-correct `HEATER=ON STATE=HEAT` record and an
explicit `LED ON` line. The existing evaluator must report failed from D13 LOW
even though Serial corroboration matches. The exact same producer snapshot and
project are evaluated by the browser-owned shared engine and the browser-free
Node path; their observation result must be byte-equivalent apart from caller
provenance outside the observation.

A removed D13 observation remains X18 `indeterminate`, not failed or passed.
Unsupported experiments remain explicit. This acceptance adds no product
variant, generic assertion language, X20/X21 work, runtime, endpoint or
authority.
