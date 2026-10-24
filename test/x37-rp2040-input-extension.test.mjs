import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  normalizeBuildRequestValue, RP2040_BOARD_PROFILE, RP2040_BUILD_REQUEST_SCHEMA,
} from '../compiler/build-protocol.mjs';

const request = (content) => ({ schema: RP2040_BUILD_REQUEST_SCHEMA, board: RP2040_BOARD_PROFILE,
  files: [{ name: 'main.c', content }] });
const constant = `/* Intent MCU Simulator public RP2040 source v1 */
int main(void)
{
  intent_gpio0_output(1u);
  intent_uart0_text("PICO PUBLIC");
  intent_halt();
}
`;
const digest = (value) => createHash('sha256').update(value).digest('hex');
const reflect = `/* Intent MCU Simulator private X37 RP2040 reflect source v1 */
int main(void)
{
  intent_gpio0_reflect_gpio1_4096();
  intent_uart0_text("X37 REFLECT");
  intent_halt();
}
`;
const turnaround = `/* Intent MCU Simulator private X37 RP2040 turnaround source v1 */
int main(void)
{
  intent_x37_turnaround_8192();
  intent_uart0_text("X37 TURNAROUND");
  intent_halt();
}
`;

test('legacy constant-output grammar remains byte-exact and accepted', () => {
  assert.equal(normalizeBuildRequestValue(request(constant)).files[0].content, constant);
});

test('one exact finite GPIO1-to-GPIO0 reflection source is accepted', () => {
  assert.equal(normalizeBuildRequestValue(request(reflect)).files[0].content, reflect);
  assert.equal(normalizeBuildRequestValue(request(turnaround)).files[0].content, turnaround);
});

test('unknown pin, malformed count, loops, includes and extra functions reject', () => {
  for (const source of [
    reflect.replace('gpio1', 'gpio2'),
    reflect.replace('4096', '4095'),
    reflect.replace('intent_gpio0_reflect_gpio1_4096();', 'for (;;) {}'),
    `#include <stdint.h>\n${reflect}`,
    `${reflect}int helper(void) { return 1; }\n`,
    reflect.replace('X37 REFLECT', 'X37  REFLECT'),
  ]) assert.throws(() => normalizeBuildRequestValue(request(source)), { code: 'SOURCE_POLICY_REJECTED' });
});

test('compiler protocol and worker use the same exact reflection template', async () => {
  const worker = await readFile(new URL('../compiler/rp2040-build-worker.mjs', import.meta.url), 'utf8');
  assert(worker.includes('const X37_REFLECT_SOURCE = `'));
  assert(worker.includes(reflect));
  assert.match(worker, /source === X37_REFLECT_SOURCE \|\| source === X37_TURNAROUND_SOURCE/u);
});

test('fixed header performs modeled GPIO1 MMIO read and bounded GPIO0 reflection', async () => {
  const header = await readFile(new URL('../compiler/rp2040-contract/intent_rp2040_runtime.h', import.meta.url), 'utf8');
  assert.match(header, /INTENT_SIO_GPIO_IN\s+0xd0000004u/u);
  assert.match(header, /INTENT_IO_BANK0_GPIO1_CTRL\s+0x4001400cu/u);
  assert.match(header, /INTENT_PADS_BANK0_GPIO1\s+0x4001c008u/u);
  assert.match(header, /INTENT_MMIO32\(INTENT_PADS_BANK0_GPIO1\)[\s\S]*~0x0cu/u);
  assert.match(header, /INTENT_MMIO32\(INTENT_SIO_GPIO_IN\) >> 1u/u);
  assert.match(header, /sample < 4096u/u);
  assert.doesNotMatch(header, /while\s*\([^)]*intent_gpio1_input/u);
  assert.match(header, /INTENT_SIO_GPIO_OE_CLR\s+0xd0000028u/u);
  assert.match(header, /intent_x37_turnaround_8192/u);
  assert.match(header, /sample < maximum_samples/u);
});

test('runtime bridge applies digital-input to the same modeled GPIO pin', async () => {
  const bridge = await readFile(new URL('../expansion-drafts/rp2040-runtime-bridge-adapter-v1.mjs', import.meta.url), 'utf8');
  assert.match(bridge, /const pin = Number\(next\.pin\.slice\(4\)\)/u);
  assert.match(bridge, /this\.machine\.gpio\[pin\]\.setInputValue\(next\.level\)/u);
  assert.match(bridge, /digital-input-applied/u);
});

test('public workbench keeps legacy grammar and does not activate private X37 source', async () => {
  const publicSource = await readFile(new URL('../src/rp2040-public-workbench.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(publicSource, /private X37 RP2040 reflect/u);
  assert.match(publicSource, /intent_gpio0_output/u);
});

test('candidate toolchain identity tracks changed files without relabelling trusted image', async () => {
  const candidate = JSON.parse(await readFile(new URL('./fixtures/x37-producer/candidate-toolchain-identity.json', import.meta.url), 'utf8'));
  const trustedManifest = await readFile(new URL('../compiler/rp2040-toolchain-manifest.json', import.meta.url));
  const trustedLock = JSON.parse(await readFile(new URL('../compiler/rp2040-image-lock.json', import.meta.url), 'utf8'));
  assert.equal(candidate.baseTrustedManifestSha256, digest(trustedManifest));
  assert.equal(candidate.baseTrustedImageId, trustedLock.imageId);
  assert.equal(candidate.candidateImageId, null);
  assert.equal(candidate.imageBuildRequired, true);
  for (const file of candidate.files) {
    const bytes = await readFile(new URL(`../${file.path}`, import.meta.url));
    assert.equal(digest(bytes), file.sha256, file.path);
  }
});
