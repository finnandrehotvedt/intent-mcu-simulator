# Third-party notices

Original Intent MCU Simulator source is Apache-2.0. The following packages
retain their own terms.

The optional local compiler image is built by the user from separately
licensed upstream archives. Exact versions, URLs, checksums and licence
classifications are in `toolchain/manifest.json`; notices and the
corresponding-source/relinking boundary are in `toolchain/NOTICE.md` and
`toolchain/SOURCE-AND-RELINKING.md`. The project does not distribute that
image, those archives or compiled learner firmware.

The bounded RP2040 compiler image is likewise built locally from Arm GNU
Toolchain 14.3.Rel1 using the exact URL and SHA-256 recorded in
`compiler/RP2040-TOOLCHAIN-MANIFEST.md`. Its archive, bundled licence file,
built image and compiled learner firmware are not distributed here.

The hosted bounded ESP32-C3 compiler uses Arduino CLI 1.5.1,
Arduino-ESP32 3.3.10, Espressif RISC-V toolchain 2601, esptool 5.3.0 and the
ESP32-C3 3.3.10 libraries under their respective GPL, LGPL, Apache and
permissive terms. The hosted runtime uses Espressif QEMU tag
`esp-develop-9.2.2-20260417` at commit
`40edccac415693c5130f91c01d84176ae6008566`; QEMU is GPL-2.0 as a whole with
compatible per-file and firmware terms. These are server-side tools, not
browser assets or prebuilt source-release artifacts. Exact versions, source
URLs and hashes are recorded in `DEPENDENCIES.md`, `c3/flash-lock.json`,
`compiler/esp32c3-toolchain-manifest.json`, and `c3/runtime-manifest.json`.
Any external image or binary distribution requires a separate source,
licence, notice and relinking review. QEMU is a trademark of Software Freedom
Conservancy; this project claims no affiliation.

The bounded STM32F429ZI compiler uses Arm GNU Toolchain `14.3.rel1`
(`arm-none-eabi-gcc 14.3.1`) from the archive whose SHA-256 is
`8f6903f8ceb084d9227b9ef991490413014d991874a1e34074443c2a72b14dbd`.
GCC, binutils, Newlib and bundled components retain their respective GPL,
LGPL, runtime-exception and permissive terms. The built server-side image and
compiler-generated firmware are not source-release artifacts.

The bounded STM32 runtime uses Renode `v1.17.0` from the official portable
Linux asset with SHA-256
`4ba7c68b59e2447f188ef4b4b112fcccd2802582c460beedceb63b84e5605a5f`.
Renode's root project is MIT and its intact portable package contains
third-party components under their own terms. The package remains a
server-side runtime image asset and is not part of the Apache-2.0 source
distribution. The product claims no affiliation with Arm, STMicroelectronics
or the Renode project; controller and engine names identify compatibility
targets only.

## avr8js 0.21.1

- Source: <https://github.com/wokwi/avr8js/tree/v0.21.1>
- npm integrity: `sha512-lS1vPaB0gB2GXoPrHFQOUG/5CRORjvnmjbs8SiPZdJpt4HkV0+v6HnNeXxo/X9lPqumqphls2Qyql8zsw9rBaw==`
- npm tarball SHA-256: `febfe96e73a840cdb6cc6e583433af2badb8c85421f38545cf5d802802ed35e8`

> The MIT License (MIT)
>
> Copyright (c) 2019-2025 Uri Shaked
>
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in
> all copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
> THE SOFTWARE.

## rp2040js 1.4.0

- Source: <https://github.com/wokwi/rp2040js/tree/v1.4.0>
- npm integrity: `sha512-knEMw0SRP9JPVLvhhYB3rjP4gLQhcWs9UOXKvxFU9Rn5eWvmlPzObMhEjfeLZ6H8FGepd6ZtMAYzGEtCaB9qYg==`

> The MIT License (MIT)
>
> Copyright (c) 2021 Uri Shaked
>
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in
> all copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
> THE SOFTWARE.

## esbuild 0.28.2 and @esbuild/linux-x64 0.28.2

- Source: <https://github.com/evanw/esbuild/tree/v0.28.2>
- npm integrity: `sha512-HKVLS8dvII+xoKW9kmqxbRKrnWEXfJJr/FZhhJmiqIB0e053QNYFqOBouTMO/k5sID4MvCiUCvv8b9M4h32wIA==`
- npm tarball SHA-256: `e045f94c235c7adc50e77ba2a579c7bec41b496b6b47c3a7845f7c1e19959a88`

> MIT License
>
> Copyright (c) 2020 Evan Wallace
>
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in
> all copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
> THE SOFTWARE.
