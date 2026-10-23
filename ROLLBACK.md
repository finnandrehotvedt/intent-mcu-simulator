# Rollback basis for 1.1.0-rc.114

Rollback is limited to the Lab application container. DNS, Caddy routing, the
Teach apex, classroom, security lab, mail and unrelated containers remain
unchanged.

Retain exact public rc.113 source commit
`2c6c00adf4894421b2c55e5563a4a6a8ab288dea` and VM103 image
`sha256:74428d7e255c70a91dafa9bb26336d23a07065b08122cab4f8d0aee7485a660c`
as the pre-rc.114 app-only recovery basis. If acceptance fails, restore that
exact app image and release directory, recreate only the Lab container and
verify readiness plus the existing Teach-domain URLs.

Rollback removes the reviewed bounded C3 budget owner, parser/router wiring
and rc.114 presentation. It does not alter retained native evidence,
learner-owned files, pinned compiler/runtime images or the rc.113 model data.

Retain exact public rc.112 source commit
`7019cbf49aeb5a801e7f1083a4d0132f6b89bc43` and VM103 image
`sha256:5be8a79691c624f4dd92fabd2b45883d4a1024f60b9243272be5e104c4c64837`
as the pre-rc.113 app-only recovery basis. If acceptance fails, restore that
exact app image and release directory, recreate only the Lab container and
verify readiness plus the existing Teach-domain URLs.

Rollback removes the reviewed Pico budget copy and current Pico owner-proof
implementation. It does not alter the immutable native evidence, learner-owned
files or the rc.112 migration identity.

Retain exact public rc.111 source commit
`4df2a9d1c91ba508e1dc51e81a2e5e589db72cad` and VM103 image
`sha256:80daf713d345921abef35bd743fd342b7986c2b54d23764cffabf2508139f262`
as the pre-rc.112 app-only recovery basis. If acceptance fails, restore that
exact app image and release directory, recreate only the Lab container and
verify readiness plus the existing Teach-domain URLs.

Rollback removes the X48 public control and current presentation closure. It
does not rewrite learner-owned files or reinterpret retained native evidence.

Retain exact public rc.110 source commit
`a37c8915a5ade9b5c46aba9d14060934f8ae3ccb` and VM103 image
`sha256:4d020fd14ecbbce83da15b6bbd17ec22064b60c233be280357157ff64e0da72e`
as the pre-rc.111 app-only recovery basis. If acceptance fails, restore that
exact app image and release directory, recreate only the Lab container and
verify readiness plus the existing Teach-domain URLs.

Rc.111 adds local X57 review evidence and X89 readiness reports only. Rolling
back removes their public guides and tools without rewriting learner-owned
project files or inferring registry, service, runtime or execution authority.

Retain exact public rc.109 source commit
`053915a0b1b8f49ab6a62a86defb462c056bcb18` and VM103 image
`sha256:98e514e9d3c367906ae7aa734188440bff7ba66bff9874a9379a94e6fafbb108`
as the pre-rc.110 app-only recovery basis. If acceptance fails, restore that
exact app image and release directory, recreate only the Lab container and
verify readiness plus the existing Teach-domain URLs.

Rc.110 adds local historical replay and explicit file handover/response data.
Rolling back removes those views without rewriting learner-owned files. Rc.109
must reject newer response data rather than infer project, runtime, verdict or
relationship authority.

Retain exact public rc.108 source commit
`b1df39a7fec365ea427ec9467cdfbfc1b28f8adf` and VM103 image
`sha256:e4f29cd37f4009e369f8e3b42bd570a4c8b1586b8d1e5f067d26d63c26a963ba`
as the pre-rc.109 app-only recovery basis. If acceptance fails, restore that
exact app image and release directory, recreate only the Lab container and
verify readiness plus the existing Teach-domain URLs.

Rc.109 corrects candidate validation and editor integration for the bounded
default-thermostat X66 journey. Rolling back restores rc.108 without rewriting
learner-owned files. Rc.108 must treat the rc.109 model identity as data-only
and must not infer runtime or verdict authority.

Retain exact accepted rc.107 source commit
`7bf39458c24249ae1d74717864f4f35f9b3311e4` and VM103 image
`sha256:9eae80137ab0dbcee9ec639bc4e1022ecbfebb686aaff29b7287e39e4ffac366`
as the pre-rc.108 app-only recovery basis. If acceptance fails, restore that
exact app image and release directory, recreate only the Lab container and
verify readiness plus the existing Teach-domain URLs.

Rc.108 publishes the bounded AVR subcircuit owner and X66 original-criterion
closure. Rolling back removes subcircuit authoring but never rewrites
learner-owned files. Rc.107 must reject or migrate newer data without inferring
connectivity, runtime or execution authority.

Retain exact accepted rc.106 source commit
`5b8c19b0b460f3ef20685c34f171baabd44d871b` and VM103 image
`sha256:85def40775576cb96c3a53216e52dace0f28f70e0e42044395445649a7d5ff5a`
as the pre-rc.107 app-only recovery basis. If acceptance fails, restore that
exact app image and release directory, recreate only the Lab container and
verify readiness plus the existing Teach-domain URLs.

Rc.107 publishes existing-canonical-net labels and published-v1 annotation
migration. Rolling back removes label UI but never rewrites learner-owned
files. Rc.106 must not infer connectivity, runtime or execution authority from
newer annotation or model-library identities.

Retain exact accepted rc.105 source commit
`9dc5b470e53171e7fa201741b1d66b9601ba3e9f` and VM103 image
`sha256:188aac9022eaec6e1cb098bd20138f2868cfdab4ac05767de61abfd1757bc26b`
as the pre-rc.106 app-only recovery basis. If acceptance fails, restore that
exact app image and release directory, recreate only the Lab container and
verify readiness plus the existing Teach-domain URLs.

Rc.106 publishes partial X66 notes/groups, X68 frozen presentation, X71 local
AVR exercise and corrected synthetic X92 proof. Rolling back removes those UI
surfaces but never rewrites learner-owned downloaded files. Rc.105 must not
infer electrical, runtime, budget or verdict authority from newer files.

Retain exact accepted rc.104 source commit
`bb6e49f9fc72c36461434469db236f5e507648e1` and VM103 image
`sha256:ae64726d75a0d71a4084a719a4c128a20839c511469fd864d6873cd9955db4f8`
as the pre-rc.105 app-only recovery basis. If acceptance fails, restore that
exact app image and release directory, recreate only the Lab container and
verify readiness plus the existing Teach-domain URLs.

Rc.105 publishes the partial bounded X92 AVR experiment budget. Rolling back
removes its transient current-tab session UI and execution gate without
rewriting learner-owned files. Inert X92 review downloads remain data only and
must never be interpreted by rc.104 as runtime or action authority.

Retain exact accepted rc.103 source commit
`ab23ec70d478d02633254f10708357065b7ba7ab` and VM103 image
`sha256:38587e814e3dc72565cbde88fd1bd2523cf88976d44fe2111865d84feceebc93`
as the pre-rc.104 app-only recovery basis. If acceptance fails, restore that
exact app image and release directory, recreate only the Lab container and
verify health plus the existing Teach-domain URLs.

Rc.104 publishes the reviewed partial X55 split editor, no-op Apply fix and
corrected model Preview/Apply wording. Rolling back restores rc.103 without
rewriting learner-owned files. A file carrying the rc.104 model identity stays
learner-owned and must not be relabeled by rc.103 with executable/runtime
authority.

Retain exact accepted rc.102 source commit
`d69e243894788b074bf59d4bb42d6d97a6481296` and VM103 image
`sha256:e5630d6b7087ec6a6d910a4b26d5c2d0bd43ff58e98cba5621f4b1accd7fd0a8`
as the pre-rc.103 app-only recovery basis. If acceptance fails, restore that
exact app image and release directory, recreate only the Lab container and
verify health plus the existing Teach-domain URLs.

Rc.103 publishes the reviewed partial X55 bounded body editor. Rolling back
restores rc.102 without rewriting learner-owned files. A file carrying the
rc.103 model identity remains learner-owned and must not be relabeled by
rc.102 with executable/runtime authority.

Retain exact accepted rc.101 source commit
`287a74834e993eb1f765db2518835f2e9e671002` and VM103 image
`sha256:e5f69eb8b38d5d7773d940606c9b75616903e76fc7c21820e004e973637b2e3b`
as the pre-rc.102 app-only recovery basis. If acceptance fails, restore that
exact app image and release directory, recreate only the Lab container and
verify health plus the existing Teach-domain URLs.

Rc.102 publishes the reviewed partial X55 LED-outline increment. Rolling back
restores rc.101 without rewriting learner-owned files. A file carrying the
rc.102 current model identity must be retained unchanged and must not be
relabeled by rc.101 with executable/runtime authority.

Retain exact accepted rc.100 source commit
`30d77396d06e37ef7f723727d0085c2b16c8dbb0` and VM103 image
`sha256:30192ee2094393435f8d37482528f5ea563c38017964c4ba01db171bcd915a4d`
as the pre-rc.101 app-only recovery basis. If release acceptance fails,
restore that exact app image and release directory, recreate only the Lab
container, wait for health, and verify Lab plus the existing Teach-domain URLs.

Rc.101 publishes the reviewed partial X55 all-profile resistor-appearance
increment. Rolling back restores rc.100 without rewriting or deleting
learner-owned files. A file carrying the rc.101 current model identity must be
retained unchanged and opened in rc.101 or a later compatible release; rc.100
must not relabel it or infer executable/runtime authority.

Retain exact accepted rc.99 source commit
`2352c278013f49a7f0c47682ea50e15709f977fc` and VM103 image
`sha256:75ee53f53879a6c5e0163de89b82bf39d9455c077b57e40e68d680ef06149611`
as the pre-rc.100 app-only recovery basis.
If release acceptance fails, restore that exact app image and files, recreate
only the Lab container, wait for health and verify Lab plus the existing
Teach-domain URLs.

Rc.100 corrects release/status metadata only. Rolling back restores rc.99's
stale X43 partial label and count without rewriting learner-owned projects or
changing runtime, compiler, worker or model behavior.

Rc.99 publishes the reviewed complete bounded AVR X47 input sequence and the
accepted current model identity. Rolling back restores rc.98 without rewriting
or deleting learner-owned projects. Finite previews, seeds, schedules, receipts
and pending events are transient and are not restored. A file carrying the
rc.99 model identity must be retained unchanged and opened in rc.99 or a later
compatible release; rc.98 must not relabel it or infer executable authority.

Rc.98 publishes the reviewed AVR observed-stack address-depth slice and its
current model identity. Rolling back restores rc.97 without rewriting or
deleting learner-owned projects. A file carrying the rc.98 model identity must
be retained unchanged and opened in rc.98 or a later compatible release; rc.97
must not relabel it or infer executable/runtime authority.

Rc.97 changes only Support wording and coherent release identity. Rolling back
restores rc.96 wording without rewriting or deleting learner-owned projects,
recovery data, local history or downloaded files and without changing runtime,
compiler, worker or model behavior.

Rc.96 publishes only the reviewed presentation and navigation refinement plus
its immutable model-library identity transition. Rolling back restores rc.95
without rewriting or deleting learner-owned projects, recovery data, local
history or downloaded files. A file carrying the rc.96 current model identity
must be retained unchanged and opened in rc.96 or a later compatible release;
rc.95 must not relabel it or infer executable authority.

Rc.95 publishes the reviewed partial AVR-only X55 fixed-resistor appearance
editor and AVR quick-control restoration. Rolling back restores rc.94 without
rewriting or deleting learner-owned files. A file containing the new bounded
appearance field must be retained unchanged and opened in rc.95 or a later
compatible release; rc.94 must not relabel it or infer executable authority.
The prior X55 model identity remains migration-only and is never made current
by rollback.

Rc.94 publishes the reviewed partial AVR-only X49 baseline 0 versus candidate
+1 °C thermostat comparison. Rolling back restores rc.93 without rewriting or
deleting learner-owned files. X49 authoring, build claim, native worker evidence
and accepted projection are transient and are not restored after rollback.
The model-library identity and project/file schema are unchanged.

Rc.93 publishes the reviewed partial AVR-only X47 D2 pulse preview/runtime
journey and four data-only model migrations. Rolling back restores rc.92
without rewriting or deleting learner-owned files. Files carrying a newly
recognized model identity must be retained unchanged and opened in rc.93 or a
later compatible release; rc.92 must not relabel or infer authority from them.

Rc.92 publishes only the reviewed partial AVR-only X43 interval profile and
release documentation. Rolling back restores rc.91 without converting,
rewriting or deleting learner data or native evidence and without changing
another service.

Rc.91 publishes the reviewed transient AVR-only X42 observer and release
documentation. Rolling back restores rc.90 without converting, rewriting or
deleting any learner project, browser history, runtime evidence or downloaded
file. It removes no native artifact and does not change another service.

Rc.90 adds only the shared session-only Simple/Advanced presentation switch.
Rolling back restores rc.89 without converting, rewriting or deleting any
learner project, browser history, runtime evidence or downloaded file.

Rc.89 corrects the X86 acceptance path for the current dialogs and records the
original offline-matrix criterion closure. Rolling back restores rc.88
application bytes and partial status. It does not add, migrate or delete a
service worker, cache, learner project, browser history or downloaded file.

Rc.88 adds the finite historical demonstration validator and records the
reviewed X70 criterion closure. Rolling back restores rc.87 application bytes
and partial status. It does not rewrite, migrate or delete any preserved
historical SVG, learner project, browser history or downloaded file.

Rc.87 publishes only the reviewed Pico presentation pacing and current-runtime
measurement path in the existing X70 export. Rolling back restores rc.86's
explicit no-current-only public behavior. It does not migrate, rewrite or
delete learner-owned project, history, package or downloaded SVG files.

Rc.86 adds only the local X70 no-current accessible SVG export and compact
nine-tool/status layout correction. Rolling back removes that export and
restores rc.85 without migrating, rewriting or deleting learner-owned data.

Rc.85 changes only the section-bounded sticky presentation of existing
workbench controls. Rolling back restores the rc.84 non-following top controls
without migrating, rewriting or deleting learner-owned data.

Rc.84 adds only the local X75 build-list/netlist export and its Inspector blur
commit correction. Rolling back removes that export action and restores the
rc.83 Inspector event behavior without migrating, rewriting or deleting any
learner-owned project or downloaded export.

Rc.83 changes only presentation and accessible popup ownership. Rolling back
restores the long document layout while preserving learner-owned project files,
named-pin topology, source, local-history records and compiler/runtime images.

Rc.32 writes common envelope v3. Before an app rollback, retain the learner's
v3 file unchanged; rc.31 cannot open its added criterion reference fields.
Preserve an rc.31-compatible version-2 copy only through a separately verified
conversion that intentionally omits code/test references. Rc.31 writes common
envelope v2; rc.30 cannot open its added brief field. Export or preserve an
rc.30-compatible version-1 copy only through a separately verified conversion
that intentionally omits the brief. An rc.22 through rc.30 file that contains
narrow-profile `wireRoutes` should be retained as the learner's original, then
opened in rc.21 only through an rc.21-compatible copy if strict older nested
validation rejects the added layout field. The existing **Legacy copy** remains
available for a further rollback to rc.16 and contains no executable/runtime
authority.

Native file handles are session-only browser objects and do not survive an app
container rollback or page reload. Learner-owned files remain unchanged; use
ordinary Open after rollback and Build fresh.

Rc.21 diagnostics are transient and contain no project or runtime authority.
Rc.22 route geometry and cable colour are authored layout only. Rollback removes
the new route controls and crossing key; it does not change source, firmware or
the physical/electrical topology recorded by named endpoints.

Rc.23 changes only shared canvas presentation, deterministic automatic AVR
lane placement, acceptance coverage and routing guidance. Rolling back restores
the rc.22 cream narrow-profile canvases and earlier automatic AVR lane choice;
it does not migrate or discard learner-owned data.

Rc.24 adds only validated authored-data examples and their visible cards.
Rolling back removes those cards and the second AVR PWM lesson; it does not
alter learner-owned files, controller runtimes or electrical topology.

Rc.25 adds only the derived compatibility matrix, documentation and acceptance
tests. Rolling back removes that presentation without changing learner files,
catalogue definitions, compiler/runtime behavior or electrical topology.

Rc.27 adds strict candidate-v3 branch reconnect and completes the existing
branch-versus-whole-net transaction controls. Rolling back removes reconnect
authority but does not migrate learner files or alter their named-pin graph;
open the retained file in the older release and Build fresh.

Rc.28 adds AVR placement, disconnected duplication and visible automatic-route
branch selectors. Rolling back removes those controls without converting or
discarding learner-owned files; open the retained file in rc.27 and Build
fresh. Narrow-profile graphs are unchanged.

Rc.29 adds actionable fault classification and documentation without changing
the project envelope. Rolling back restores rc.28 diagnostic copy; learner
files and named-pin topology need no conversion. Open the retained file and
Build fresh.

Rc.30 adds only source-bound runtime trace projection and visible viewer state.
Rolling back removes the shared viewer without converting learner files. Trace
records and selection are transient and are not restored after rollback.

Rc.74 adds a separate local evidence-package review action and visible
measurement identity/coordinate metadata without changing project files,
compiler/runtime producers or stored authority. Rolling back removes that
report surface only. Learner-owned project and evidence files remain unchanged.

Rc.75 adds the Connections text projection and keyboard operations without
changing project files or graph authority. Rolling back removes that alternate
editing surface only; the authored named-pin topology remains unchanged.

Rc.76 adds transient current-project search without changing project files,
graph authority, Build or runtime state. Rolling back removes the search
disclosure only; learner-owned files and authored topology remain unchanged.

Rc.77 adds a typed authored-fact summary and complete literal source-file
difference to the existing X05 proposal review. Rolling back removes only that
additional transient detail. It does not migrate learner files, change the X05
parser or Apply lifecycle, or alter compiler/runtime authority.

Rc.78 adds only opt-in first-party browser-local version history. Rolling back
removes its controls and access but does not delete or migrate learner-owned
downloaded files. Browser-managed IndexedDB records may remain inaccessible to
the older app; preserve needed work as a downloaded canonical project before a
manual rollback. No server-side project store exists.

Rc.80 adds only a strict static machine-readable release-delta document and
its discovery links. Rolling back removes that metadata file and copy. It does
not migrate, rewrite or delete learner projects, packages, browser history,
firmware or runtime evidence, and no new server state exists.

Rc.81 adds only the strict current-tab manual physical-verification checklist,
its local file/print workflow and discovery links. Rolling back removes that
surface without deleting projects or files. Rc.81 checklist files are
release-bound and rc.80 does not accept them; retain the learner-owned file
unchanged rather than rewriting or presenting it as physical proof.

Rc.79 adds only transient local comparison of two retained strict-v3 experiment
packages. Rolling back removes the comparison disclosure and its in-tab state;
it does not delete, rewrite or migrate either learner-owned package or project
file. No package bytes or comparison authority are stored by the server.

Browser recovery and learner-owned files are never deleted by deployment or
rollback. Do not change DNS, shared Caddy configuration, compiler/runtime
images or unrelated services. After rollback verify `/`, `/healthz`,
`/readyz`, `/controllers.html`, all four bounded Build/Run paths and the apex,
www, agent and security domain suite.
