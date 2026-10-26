// node --experimental-strip-types scripts/finding-seen-check.ts
//
// The client's share of the «seen» rule (finding-seen.ts): which findings leave the list and the
// count, and what the badges show for a server that does or does not send unseen_count.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { TechCardAnalysisFinding } from '../src/api/proto-http/admin/index.ts';
import {
  canMarkSeen,
  isSeen,
  openFindingCount,
  seenByLine,
  splitBySeen,
} from '../src/components/managers/tech-card/components/finding-seen.ts';

const FP = '0123456789abcdef';

function finding(over: Partial<TechCardAnalysisFinding>): TechCardAnalysisFinding {
  return {
    source: 'machine',
    severity: 'warning',
    category: 'route',
    title: 't',
    detail: '',
    suggestion: '',
    refs: [],
    evidence: [],
    insertAfter: undefined,
    confidence: '',
    code: 'smv_missing',
    key: 'smv_missing@opfp:aaaaaaaa',
    fingerprint: FP,
    seen: false,
    seenBy: undefined,
    seenAt: undefined,
    ...over,
  } as TechCardAnalysisFinding;
}

test('only a keyed finding with a well-formed fingerprint can be marked', () => {
  assert.equal(canMarkSeen(finding({})), true);
  assert.equal(canMarkSeen(finding({ key: '' })), false, 'model / old server: no key');
  assert.equal(canMarkSeen(finding({ key: '   ' })), false);
  assert.equal(canMarkSeen(finding({ fingerprint: undefined })), false);
  assert.equal(canMarkSeen(finding({ fingerprint: 'ABCDEF0123456789' })), false);
  assert.equal(canMarkSeen(finding({ fingerprint: '0123' })), false);
});

test('seen needs both the server flag and a markable finding', () => {
  assert.equal(isSeen(finding({ seen: true })), true);
  assert.equal(isSeen(finding({ seen: false })), false);
  assert.equal(isSeen(finding({ seen: undefined })), false);
  assert.equal(isSeen(finding({ seen: true, key: '' })), false);
});

test('split keeps the server order on both sides', () => {
  const a = finding({ key: 'a@card', seen: false });
  const b = finding({ key: 'b@card', seen: true });
  const c = finding({ key: 'c@card', seen: false });
  const d = finding({ key: 'd@card', seen: true });
  const { open, seen } = splitBySeen([a, b, c, d]);
  assert.deepEqual(
    open.map((f) => f.key),
    ['a@card', 'c@card'],
  );
  assert.deepEqual(
    seen.map((f) => f.key),
    ['b@card', 'd@card'],
  );
  assert.deepEqual(splitBySeen(undefined), { open: [], seen: [] });
});

test('the badge prefers the server count and falls back to counting', () => {
  const findings = [finding({ seen: true }), finding({ seen: false }), finding({ seen: false })];
  assert.equal(openFindingCount({ findings, unseenCount: 2 }), 2);
  // A server older than the marks sends no unseen_count and no seen: everything is open.
  assert.equal(openFindingCount({ findings, unseenCount: undefined }), 2);
  assert.equal(
    openFindingCount({ findings: [finding({ key: '' }), finding({})], unseenCount: undefined }),
    2,
  );
  // Zero is a real answer, not a missing one.
  assert.equal(openFindingCount({ findings, unseenCount: 0 }), 0);
  assert.equal(openFindingCount(undefined), 0);
});

test('the seen title names who and when', () => {
  const line = seenByLine(finding({ seen: true, seenBy: 'anna', seenAt: '2026-10-26T09:30:00Z' }));
  assert.match(line, /^seen · anna · /);
  assert.match(line, /2026/);
  assert.equal(
    seenByLine(finding({ seen: true, seenBy: '', seenAt: undefined })),
    'seen · unknown',
  );
  assert.equal(
    seenByLine(finding({ seen: true, seenBy: 'boris', seenAt: 'nope' })),
    'seen · boris',
  );
});
