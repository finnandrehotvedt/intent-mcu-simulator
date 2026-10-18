# X07/X08 external client contract

The production adapter transport is local stdio only and its browser origin is
fixed. A loopback origin override exists only when `NODE_ENV=test`, accepts
only `http://127.0.0.1:<port>`, and is not client input.

Input is either one unchanged `intent-mcu-bounded-action-request@1` for the
seven existing actions or one exact cancellation envelope. The adapter passes
the original action JSON unchanged to the page router, so duplicate-key,
payload, profile, generation, TTL and result-budget checks remain the same as
the visible UI path. Client data is never used as JavaScript or a command.

The ready event declares `applyAuthority:false`, `genericCommand:false`,
`externalEndpoint:false` and `durableServerProject:false`. These values are
acceptance boundaries, not feature flags.

Action responses are projected through the additive X11 result envelope. The
original bounded-action response remains unchanged in `authoritativeResult`;
the projection grants no additional action or authority.
