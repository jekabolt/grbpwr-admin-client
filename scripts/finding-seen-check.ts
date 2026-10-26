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
  findingIdentity,
  findingKey,
  isClientFindingCode,
  isValidFindingKey,
  maskOpNumbers,
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
      'pdf_sa_missing@opfp:aaaaaaaa.1,seam:hem,seam:side',
    ],
    [findingKey('pdf_sa_missing', ['op:20'], { tokens }), 'pdf_sa_missing@opfp:bbbbbbbb.1'],
    [findingKey('pdf_sa_missing', ['op:30'], { tokens }), 'pdf_sa_missing@opfp:bbbbbbbb.2'],
    [
      findingKey('pdf_sa_missing', ['op:010', 'op:+10'], { tokens }),
      'pdf_sa_missing@opfp:aaaaaaaa.1',
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
    // Step numbers in the text are masked: the same defect under new numbers hashes alike.
    [
      findingFingerprint('Operation 20: no SA', 'Ops 10, 20 — шаг 10.', ['op:20', 'op:10'], {
        '10': 'bbbbbbbb',
        '20': 'aaaaaaaa',
      }),
      '9129f8c1af5d3ffa',
    ],
    [
      findingFingerprint('Operation 7: no SA', 'Ops 3, 7 — шаг 3.', ['op:7', 'op:3'], {
        '3': 'bbbbbbbb',
        '7': 'aaaaaaaa',
      }),
      '9129f8c1af5d3ffa',
    ],
    [
      maskOpNumbers('Operation 20, op:10, a20, 20.5, 1,20, Шаг20 (20)', [
        'op:20',
        'op:010',
        'card',
      ]),
      'Operation #, op:#, a20, 20.5, 1,20, Шаг# (#)',
    ],
    [findingIdentity('c', '', 'T', ['bom:A'], new Map()), '7730bec869d428a5'],
  ];
  vectors.forEach(([got, want], i) => assert.equal(got, want, `vector ${i}`));
  assert.deepEqual(
    assignFindingKeys([
      { code: 'c', title: 'A', refs: ['card'] },
      { code: 'c', title: 'B', refs: ['card'] },
      { code: 'c', title: 'B', refs: ['card'] },
    ]),
    ['c@card~b3a895749906c3c2', 'c@card~30179dd4f82ce934', 'c@card~30179dd4f82ce934.2'],
  );
  // A ref that spells the net's own suffix: the plain key is reserved, the twins step around it.
  assert.deepEqual(
    assignFindingKeys([
      { code: 'c', title: 'T', refs: ['bom:A'] },
      { code: 'c', title: 'T', refs: ['bom:A'] },
      { code: 'c', title: 'T', refs: ['bom:A~7730bec869d428a5'] },
    ]),
    ['c@bom:A~7730bec869d428a5.2', 'c@bom:A~7730bec869d428a5.3', 'c@bom:A~7730bec869d428a5'],
  );
  assert.equal(isValidFindingKey('pdf_sa_missing@seam:hem'), true);
  assert.equal(isValidFindingKey('Pdf@card'), false);
  assert.equal(isValidFindingKey('card'), false);
});

test('a step token does not depend on other steps', () => {
  const alone = opKeyTokens({ '10': 'aaaaaaaa' }).get(10);
  assert.equal(alone, 'opfp:aaaaaaaa.1');
  const others: Record<string, string>[] = [
    { '10': 'aaaaaaaa', '20': 'aaaaaaaa' },
    { '10': 'aaaaaaaa', '20': 'bbbbbbbb' },
    { '5': 'cccccccc', '10': 'aaaaaaaa', '20': 'cccccccc' },
    { '10': 'aaaaaaaa', '30': 'aaaaaaaa', '40': 'dddddddd' },
  ];
  for (const more of others) {
    assert.equal(opKeyTokens(more).get(10), alone, JSON.stringify(more));
  }
  // Ordinals go by operation number.
  assert.equal(opKeyTokens({ '100': 'aaaaaaaa', '9': 'aaaaaaaa' }).get(9), 'opfp:aaaaaaaa.1');
});

test('only pdf_* and asm_* are client codes', () => {
  for (const ok of ['pdf_sa_missing', 'asm_edge_missing', 'pdf_']) {
    assert.equal(isClientFindingCode(ok), true, ok);
  }
  for (const bad of ['', 'k', 'edge_missing', 'smv_missing', 'pdfx_a', 'PDF_x', 'pdf', 'asm-x']) {
    assert.equal(isClientFindingCode(bad), false, bad);
  }
});

test('a client finding is seen only when the stored mark matches key and fingerprint', () => {
  const opFingerprints = { '10': 'aaaaaaaa' };
  const gap = {
    code: 'pdf_sa_missing',
    refs: ['op:10', 'seam:hem'],
    title: 'no SA',
    detail: 'hem',
  };
  const key = 'pdf_sa_missing@opfp:aaaaaaaa.1,seam:hem';
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

  // Outside pdf_* / asm_*: no key either, and it does not push a real one into the collision net.
  const [bare, real] = resolveClientFindings(
    [
      { code: 'edge_missing', refs: ['card'], title: 'x' },
      { code: 'pdf_x', refs: ['card'], title: 'x' },
    ],
    undefined,
  );
  assert.equal(bare.key, '');
  assert.equal(canMarkSeen(bare), false);
  assert.equal(real.key, 'pdf_x@card');

  // Renumbered steps (same shapes, same order): the mark still holds.
  const [renumbered] = resolveClientFindings(
    [{ code: 'pdf_sa_missing', refs: ['op:15', 'seam:hem'], title: 'no SA', detail: 'hem' }],
    { operationFingerprints: { '15': 'aaaaaaaa' }, seenMarks: [mark] },
  );
  assert.equal(renumbered.key, key);
  assert.equal(isSeen(renumbered), true);

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
