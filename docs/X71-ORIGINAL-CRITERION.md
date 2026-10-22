# X71 original-criterion closure

Original criterion:

> Lærer kan distribuere lokale startfiler, krav og kjente feil uten elevkontoer.

The public rc.106 teaching-exercise bundle satisfies that bounded criterion:

- the teacher can download and distribute one local data-only lesson bundle;
- the bundle contains two complete validated start projects: `correct` and `known-bad-equality`;
- it carries explicit lesson instructions and three named requirements;
- the known-bad start project carries an explicit, visible description of its equality fault;
- a learner can inspect and open either start project locally without an account or network storage;
- both embedded projects are parsed and validated before the bundle replaces the last accepted lesson;
- opening a selected start project is a trusted human UI action protected by the existing unsaved-change guard;
- importing the bundle restores no Apply, Build, Run, scenario, runtime or verdict authority.

The original criterion does not require an exercise marketplace, arbitrary profiles, an authoring service, accounts or a generic package catalogue. The fixed AVR thermostat pair is sufficient evidence because it demonstrates the complete requested distribution journey with plural start files, requirements and a known fault.

Evidence is provided by `test/x71-teaching-exercise-package.test.mjs`, `test/x71-teaching-exercise-browser.cjs`, and the independently accepted public rc.106 journey. This closes X71 against its original wording while keeping the current package deliberately bounded to the reviewed AVR thermostat exercise.
