# X49 partial AVR temperature-offset comparison

Status: public partial implementation in `1.1.0-rc.94`.

X49 is available only for the exact AVR thermostat starter with its accepted
source and graph. Integer offsets may be previewed as an ideal calculation,
but native execution is fixed to baseline 0 versus candidate +1 °C.

One explicit action creates one temporary same-origin isolated compiler job
from an instrumented in-memory copy of the exact source. Two fresh dedicated
browser workers then run the baseline and candidate independently. Acceptance
requires complete source/artifact/model/worker/input-bound evidence at
2,560,000 cycles (160 ms), five retained mailbox writes and zero dropped trace,
ADC or mailbox rows.

The reviewed native evidence is ADC 409/414, firmware 29/30 °C and D13
HIGH/LOW. It is academic emulator evidence only. Physical evidence remains
absent, and the interface makes no claim about hardware tolerances,
probability, damage, calibration or factory behavior.

The comparison is transient and is not saved in project files, browser
recovery or a server project. Source, graph, revision, profile, selected offset,
artifact, model or worker drift retires the accepted projection. Other offsets,
source shapes, graphs, sensors, controller profiles, saved evidence, automatic
replay and general experiment authoring are outside this partial slice.
