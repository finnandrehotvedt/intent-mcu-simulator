# X68 original-criterion closure

Original criterion:

> Utvalgte instrumenter, steg og forklaringer kan vises ryddig uten å endre underliggende eksperiment.

The public rc.106 implementation satisfies that bounded criterion:

- a teacher selects one or more registered instruments;
- the teacher authors ordered plain-text steps and explanations and moves through them manually;
- the presentation renders the selected instrument cards and current step in a dedicated view;
- opening, navigating and closing the view preserve the project, source, profile, lifecycle, artifact, runtime, worker count and experiment budget;
- the observation shown during a presentation is one explicit frozen capture, so later UI text cannot silently change the lesson;
- the presentation owner has no Apply, Build, Run, scenario, runtime or verdict authority.

The original criterion does not require a live dashboard. Requiring live updates would weaken the demonstrated experiment-preservation boundary and would add scope that is absent from the criterion. A new presentation must be started to capture newer observations.

Evidence is provided by `test/x68-presentation-view.test.mjs`, `test/x68-presentation-view-browser.cjs`, and the independently accepted public rc.106 journey. This closes X68 against its original wording; it does not claim live observation, runtime control, persistence, physical truth or verdict authority.
