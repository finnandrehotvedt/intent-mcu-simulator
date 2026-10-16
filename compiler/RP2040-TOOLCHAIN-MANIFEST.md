# RP2040 bounded compiler identity

- Image: `local/intent-mcu-rp2040-toolchain:1.1.0-rc.4`
- Image ID: `sha256:e2c3fd002439eddb24d50e05a47bfcb1d395a3183186b5bf001fd47523ac7bbe`
- Tracked manifest (`compiler/rp2040-toolchain-manifest.json`) SHA-256: `520437f447b24772e9c66231d3efad86070f9dfb65051a44f42b2d138be937ea`
- Arm GNU Toolchain archive SHA-256: `8f6903f8ceb084d9227b9ef991490413014d991874a1e34074443c2a72b14dbd`
- Arm GNU Toolchain source: `https://developer.arm.com/-/media/Files/downloads/gnu/14.3.rel1/binrel/arm-gnu-toolchain-14.3.rel1-x86_64-arm-none-eabi.tar.xz`
- Arm GNU Toolchain terms: bundled upstream `license.txt`; archive and built image are not distributed by this source repository
- Worker SHA-256: `672a38f11ac031757d8634d53c429048cce506903bc5594470584f80013d4c14`
- Startup SHA-256: `a3d84e1c121e6a6365517c38993493b694f7ba85b9bc8db136ac00194ebe5897`
- Linker SHA-256: `189e4add83c2ec9fd6d6eca275f55043a92b5b50b8ab68d082a47c91927710d7`
- Runtime header SHA-256: `0888bdeee8bb920ece126baa1085614c3bc0c099f6d8c1faddb7111fa508f6ba`

The tracked JSON manifest is the machine-readable toolchain identity used by
the image lock and reproducible setup script.

The public request can choose only GPIO0 level `0` or `1` and an uppercase
UART0 message of 1–24 characters inside the exact project-owned source
template. The caller cannot choose flags, paths, headers, startup, linker,
image, mounts, target, output format or runtime engine.
