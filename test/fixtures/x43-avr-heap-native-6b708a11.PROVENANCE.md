# X43 saved AVR ELF fixture provenance

- Purpose: offline parser regression only; this fixture is not loaded by the public application or shipped in the production bundle.
- ELF SHA-256 after base64 decoding: `6b708a11e4687be346885158a410e232b6085548bdf888126af077169eed7f33`.
- Source fixture SHA-256: `14376baf131cd8340b1edcd67a748e73091d9bc326af8459d6d8a2c7ab1a3508`.
- Captured by the single private Build under receipt `desktop-etvt6l5-ct109-lab-x43-canonical-owner-native-20261021-001` using the pinned AVR toolchain and exact project source commit `11dffbbc99e01e0c73f25cf7178e8a44a5526cb4`.
- Toolchain and linked-runtime licensing, source and relinking details remain governed by `THIRD_PARTY_NOTICES.md`, `toolchain/NOTICE.md` and `toolchain/SOURCE-AND-RELINKING.md`.
- The fixture is retained byte-for-byte so CI can exercise the full ELF parser without invoking a compiler or firmware producer.
