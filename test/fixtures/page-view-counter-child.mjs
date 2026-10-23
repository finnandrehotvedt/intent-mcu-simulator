// SPDX-License-Identifier: Apache-2.0
import { AggregatePageViewCounter } from '../../src/page-view-counter.mjs';

const [file, countSource] = process.argv.slice(2);
const count = Number(countSource);
if (!file || !Number.isSafeInteger(count) || count < 1 || count > 100) process.exit(2);
const counter = new AggregatePageViewCounter({ file, now: () => new Date('2026-10-23T12:00:00.000Z') });
for (let index = 0; index < count; index += 1) await counter.increment();
