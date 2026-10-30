import { existsSync, readFileSync } from 'node:fs';

import type { AssemblyInput } from './derive-assembly';

export const CARD81_REAL_INPUT =
  '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/techpack-pdf-v3/data/card81/card81-asm-input.json';

type EncodedMap = { __map: [unknown, unknown][] };
type EncodedSet = { __set: unknown[] };

function revive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(revive);
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray((value as EncodedMap).__map))
    return new Map((value as EncodedMap).__map.map(([key, item]) => [revive(key), revive(item)]));
  if (Array.isArray((value as EncodedSet).__set))
    return new Set((value as EncodedSet).__set.map(revive));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, revive(item)]),
  );
}

export const card81RealFixtureAvailable = () => existsSync(CARD81_REAL_INPUT);

/** The untrimmed 2 MB card 81 capture; tests skip on checkouts without the shared golden corpus. */
export function card81RealFixture(): AssemblyInput {
  return revive(JSON.parse(readFileSync(CARD81_REAL_INPUT, 'utf8'))) as AssemblyInput;
}
