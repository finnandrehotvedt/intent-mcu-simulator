# Branch editing and transaction acceptance contract

Status: approved implementation contract, 2026-10-18  
Receipt: `desktop-etvt6l5-ct109-lab-complete-remaining-contracts-20261018-001`

## Outcome

Complete W06 and W07 without narrowing their published wording. The AVR
workbench must let a learner select an exact branch, reconnect that branch to a
free named pin, delete only that branch, or delete the whole selected net. An
explicit junction remains the only authority for a same-net branch; a visual
crossing never connects nets.

Every accepted authoring action is one atomic Undo/Redo transaction. Rejected,
stale, malformed, electrically unsafe or endpoint-conflicting actions change
neither project, revision nor history. Undo and Redo restore the complete
authored document for the transaction, including stable component/net/junction
IDs, named endpoints, route family, wire style, properties and layout.

The formerly unsupported candidate-project reconnect path becomes supported
only after source and browser acceptance. It must preserve all unrelated
branches and junctions and must not be claimed merely from the ordinary-v2
implementation.

## Preserved boundaries

- The common local envelope, old project formats and migrations remain
  compatible. Save/Open is still data-only and clears history and executable
  authority.
- Topology edits retire stale runtime/build authority; pure geometry and colour
  remain visual-only.
- Named pins remain the electrical authority. Routes keep exact terminal
  attachment, body avoidance and WIRE-LANE-01 separation after edit,
  Undo/Redo, movement and Save/Open.
- Pico, ESP32-C3 and STM32 retain their truthful fixed two-endpoint profiles in
  this increment. Their existing reconnect/delete/history workflows must not
  regress and do not pretend to contain branches.
- No account, server project, paid service, controller, compiler, runtime,
  mobile/tablet workbench or physical-device capability is added.

## Release-blocking acceptance

1. Candidate-project `wire.reconnect` accepts exactly one existing endpoint and
   one known free named endpoint, preserves net/junction identity and unrelated
   branches, and invalidates executable authority.
2. Unknown, reused, same, missing-net, missing-source, stale-revision and
   electrically unsafe reconnects reject atomically without adding history.
3. Branch add, branch reconnect, branch delete and whole-net delete each Undo
   and Redo as one exact transaction; a new accepted edit clears Redo.
4. A real desktop browser journey performs candidate branch reconnect,
   branch-only delete, Undo, Redo and Save/Open, then confirms named-pin
   attachment, distinct crossing/junction rendering and no component-body or
   positive-length cross-net lane overlap.
5. Ordinary AVR v2 plus the three narrow profiles retain their accepted
   reconnect/delete/history, unsaved guard, parked drafts and fresh-Build
   boundaries. The focused and full source suites pass.
6. Public release records exact commit, image, rollback, HTTPS/security and
   Teach-domain regressions before W06/W07 are marked complete.

## Recovery

Source recovery reverts the final product commit. Public recovery redeploys
accepted image
`sha256:5843452d6e587513e20133ff8001d63adccdbecd0daebf84a696ce149d282aa5`
through the retained rc.26-p1.1 release basis. Recovery changes only the Lab
application container; DNS, Caddy, other services and user-owned local files
remain untouched.
