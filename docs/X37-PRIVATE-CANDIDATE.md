# X37 private source/compiler candidate

X37 remains planned. This feature branch contains private, default-disarmed source preparation only; it is not active in the public workbench or public compiler route.

The candidate adds:

- the reviewed inert two-participant scheduler contract;
- a private runtime adapter and existing-runtime seams with live generation checks, atomic per-driver net state, retained-history loss detection and contract-derived causal ticks;
- one exact finite RP2040 source form that reads modeled GPIO1 and reflects it to GPIO0 for 4096 iterations;
- a separate private RP2040 compiler manifest/setup path and source-bound producer worker guarded by a parent-process 75-second kill/reap watchdog.

The legacy public RP2040 constant-output/UART/halt grammar remains the only form activated by the public workbench. Existing compiler image locks, public releases and retained rc.124/rc.128 files are unchanged.

No actual X37 firmware build or coupled MCU execution is part of this source candidate. A new private compiler image identity must be built and independently reviewed before the separately budgeted two-firmware producer run.
