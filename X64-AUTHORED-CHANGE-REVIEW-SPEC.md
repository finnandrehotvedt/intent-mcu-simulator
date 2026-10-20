# X64 authored change review

Status: private candidate; planned pending independent acceptance.

X64 extends the existing X05 current/candidate project-patch review. A valid
proposal for one of the four public board profiles receives two read-only
projections bound to its current and candidate project SHA-256 identities:

- a deterministic human summary owned by validated component, net, layout and
  test-expectation fields; and
- a complete literal source-file difference for every changed source file.

The source view treats text as text. It does not parse or infer source meaning,
and it has no Apply, Build, Run or verdict authority. The existing X05 Apply
control and stale-base lifecycle remain the only mutation path. If X64 cannot
produce its bounded optional projection, it reports a typed unavailable state;
it never rejects or changes an otherwise valid X05 review or Apply decision.

Diffing uses bounded line-based Myers comparison. If its fixed work budget is
reached, X64 emits a complete remove/add replacement and labels it explicitly
as non-minimal. Accepted AVR projects are bounded to eight files and 128 KiB of
source with a 640 KiB complete diff budget. Each narrow-board project is bound
to its one validated 4 KiB source file and a 24 KiB diff budget. The semantic
summary is capped at 512 rows. Rendering uses DOM `textContent`; source text is
never interpreted as markup.

Required private acceptance covers AVR, RP2040 Pico, ESP32-C3 and STM32F429ZI
through the visible X05 keyboard journey. It verifies exact source text,
typed-owner summaries, identity binding, focus movement, no pre-Apply mutation,
and invalidation when proposal text changes. X64 does not change firmware,
workers, compilers, public deployment or release counts.
