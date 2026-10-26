// yarn check:finding-seen  (node --experimental-strip-types --test scripts/finding-seen-check.ts)
//
// The client's share of the «seen» rule (finding-seen.ts): which findings leave the list and the
// count, and what the badges show for a server that does or does not send unseen_count.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { TechCardAnalysisFinding } from '../src/api/proto-http/admin/index.ts';
import {
  assignFindingKeys,
  findingFingerprint,
  findingKey,
  isValidFindingKey,
  opKeyTokens,
} from '../src/components/managers/tech-card/components/finding-key.ts';
import {
  canMarkSeen,
  isSeen,
  openFindingCount,
  resolveClientFindings,
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

// THE SAME VECTORS AS THE SERVER (grbpwr-manager TestFindingKeyGoldenVectors). The browser mints
// the keys of its own findings; one byte of disagreement and a mark never matches.
test('keys and fingerprints match the server byte for byte', () => {
  const opFingerprints = { '10': 'aaaaaaaa', '20': 'bbbbbbbb', '30': 'bbbbbbbb' };
  const tokens = opKeyTokens(opFingerprints);
  const vectors: [string, string][] = [
    [
      findingKey('pdf_sa_missing', ['seam:side', 'op:10', 'seam:hem', 'op:10'], { opFingerprints }),
      'pdf_sa_missing@opfp:aaaaaaaa,seam:hem,seam:side',
    ],
    [findingKey('pdf_sa_missing', ['op:20'], { tokens }), 'pdf_sa_missing@op:20'],
    [
      findingKey('pdf_sa_missing', ['op:010', 'op:+10'], { tokens }),
      'pdf_sa_missing@opfp:aaaaaaaa',
    ],
    [
      findingKey('pdf_sa_missing', ['op:x', 'op:99999999999'], { tokens }),
      'pdf_sa_missing@op:99999999999,op:x',
    ],
    [findingKey('pdf_x', ['card'], { subject: 'front', tokens }), 'pdf_x@card#front'],
    [findingKey('pdf_x', [], { tokens }), 'pdf_x@'],
    [
      findingKey('pdf_x', ['unit:😀', 'unit:\uE000', 'unit:é', 'unit:z'], { tokens }),
      'pdf_x@unit:z,unit:é,unit:\uE000,unit:😀',
    ],
    [
      findingKey('unit_key_case_collision', ['unit:' + 'ю'.repeat(400)]),
      'unit_key_case_collision@sha256:e6a9631642ae8f89e851d719927f7f76',
    ],
    [
      findingFingerprint(
        'Seam allowance missing',
        'Side seam has no SA',
        ['op:20', 'op:10', 'seam:hem'],
        {
          '10': 'bbbbbbbb',
          '20': 'aaaaaaaa',
        },
      ),
      'c13246480eda69ca',
    ],
    [findingFingerprint('Нет припуска', ''), 'c3de5ec904f08a99'],
  ];
  vectors.forEach(([got, want], i) => assert.equal(got, want, `vector ${i}`));
  assert.deepEqual(
    assignFindingKeys([
      { code: 'c', title: 'A', refs: ['card'] },
      { code: 'c', title: 'B', refs: ['card'] },
      { code: 'c', title: 'B', refs: ['card'] },
    ]),
    ['c@card~559aead0', 'c@card~df7e70e5', 'c@card~df7e70e5.2'],
  );
  assert.equal(isValidFindingKey('pdf_sa_missing@seam:hem'), true);
  assert.equal(isValidFindingKey('Pdf@card'), false);
  assert.equal(isValidFindingKey('card'), false);
});

test('a client finding is seen only when the stored mark matches key and fingerprint', () => {
  const opFingerprints = { '10': 'aaaaaaaa' };
  const gap = {
    code: 'pdf_sa_missing',
    refs: ['op:10', 'seam:hem'],
    title: 'no SA',
    detail: 'hem',
  };
  const key = 'pdf_sa_missing@opfp:aaaaaaaa,seam:hem';
  const fp = findingFingerprint('no SA', 'hem', ['op:10', 'seam:hem'], opFingerprints);

  const [unmarked] = resolveClientFindings([gap], {
    operationFingerprints: opFingerprints,
    seenMarks: [],
  });
  assert.equal(unmarked.key, key);
  assert.equal(unmarked.fingerprint, fp);
  assert.equal(unmarked.source, 'client');
  assert.equal(canMarkSeen(unmarked), true);
  assert.equal(isSeen(unmarked), false);

  const mark = { key, fingerprint: fp, seenBy: 'anna', seenAt: '2026-10-26T09:30:00Z' };
  const [seen] = resolveClientFindings([gap], {
    operationFingerprints: opFingerprints,
    seenMarks: [mark],
  });
  assert.equal(isSeen(seen), true);
  assert.equal(seen.seenBy, 'anna');

  // The text moved since the mark: unseen again.
  const [moved] = resolveClientFindings([{ ...gap, detail: 'hem and cuff' }], {
    operationFingerprints: opFingerprints,
    seenMarks: [mark],
  });
  assert.equal(isSeen(moved), false);
  assert.equal(moved.seenBy, undefined);

  // No audit yet: every client finding is open, still markable.
  const [noAudit] = resolveClientFindings([gap], undefined);
  assert.equal(isSeen(noAudit), false);
  assert.equal(canMarkSeen(noAudit), true);

  // A code the server would refuse gets no key: shown, never markable.
  const [bad] = resolveClientFindings([{ code: 'PDF gap', title: 'x' }], undefined);
  assert.equal(bad.key, '');
  assert.equal(canMarkSeen(bad), false);

  assert.deepEqual(resolveClientFindings(undefined, undefined), []);
});

test('the count adds the unseen client findings to the server count', () => {
  const opFingerprints = { '10': 'aaaaaaaa' };
  const gaps = [
    { code: 'pdf_sa_missing', refs: ['seam:hem'], title: 'no SA' },
    { code: 'pdf_sa_missing', refs: ['seam:side'], title: 'no SA' },
  ];
  const fp = findingFingerprint('no SA', '', ['seam:hem'], opFingerprints);
  const client = resolveClientFindings(gaps, {
    operationFingerprints: opFingerprints,
    seenMarks: [
      { key: 'pdf_sa_missing@seam:hem', fingerprint: fp, seenBy: 'anna', seenAt: undefined },
    ],
  });
  const server = [finding({ seen: false }), finding({ seen: false }), finding({ seen: true })];
  assert.equal(openFindingCount({ findings: server, unseenCount: 2 }, client), 3);
  assert.equal(openFindingCount({ findings: server, unseenCount: undefined }, client), 3);
  // No audit at all (failed): the client findings alone.
  assert.equal(openFindingCount(undefined, client), 1);
  assert.equal(openFindingCount(undefined), 0);
});
