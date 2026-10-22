# X74 original-criterion implementation

Original criterion:

> Fil/repository-basert samarbeid eller annen eksplisitt valgt metode; ingen skjult prosjektlagring.

The private implementation provides an explicit local-file collaboration loop:

1. A sender opens or creates one canonical strict-v3 experiment package and
   explicitly downloads an exact handover copy.
2. A recipient explicitly opens that file and chooses review-only or the
   existing guarded authored-project Open action.
3. The recipient writes a bounded plain-text note, selects `reviewed` or
   `changes-requested`, and explicitly downloads a strict response file.
4. The sender explicitly opens the response against the original handover and
   sees the exact parent digest, relationship, disposition and note.

The minimal response schema is `intent-mcu-recipient-response@1`. It carries
only exact parent package/project/report/manifest identities, one finite
disposition, one bounded data-only note, false authority fields and fixed
limitations. It contains no executable, runtime command, patch, credentials,
sender identity claim or automatic Apply authority.

Malformed, noncanonical, unknown-field, markup, authority-bearing, oversized,
wrong-parent, stale-parent and duplicate responses fail closed. The existing
unsaved-change guard owns the optional project replacement, including Cancel.
The review-only path changes no active project, runtime, budget or history.

All transfer is manual through a channel selected by the users. The Lab makes
no upload, account, repository, email, endpoint or server-storage request.
Digest integrity binds exact bytes only; it does not establish sender identity
or the truth of claims.

Evidence is provided by `test/x74-recipient-file-exchange.test.mjs` and the
two-context actual-download journey in
`test/x74-recipient-file-exchange-browser.cjs`. Status remains
`implemented/tested_private` pending the later reviewed public release and
independent public verification required by the release packet.

