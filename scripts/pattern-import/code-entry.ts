// PATTERN-IMPORT · CODE lane probe — the piece codes the wizard's "name N pieces" gives (bulk-names.ts)
// and the label side the dictionary reads (synonyms.ts bare side).
//
//   1 · dictionary: «… HEM BAND (FRONT)» / «(BACK)» read F / B; a placement («(back neck)»), both
//       sides, a body noun beside a noun never give a side
//   2 · bulkNames on crafted input: one code per seed, a drawn pair ONE code with both hands, a lone
//       hand dropped, taken identities and size tokens skipped, the same answer for any input order
//   3 · corpus (the real pipeline through the e2e harness, run TWICE): no two different pieces share
//       an identity, every bulk code is written on its own seed(s) only, a pair code on exactly the
//       two hands of one drawn pair, and both runs give every piece the same code
//
//   node scripts/pattern-import/code.mjs            (yarn patimport:code)
//   PATIMPORT_REPORTS / E2E_OUT / PATIMPORT_E2E_OUT = where the two e2e runs write (scratch)
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

import { readPieceText } from 'lib/pattern-import/dictionary';
import type { BoxMm, SemanticsOutput } from 'lib/pattern-import/types';
import {
  bulkNames,
  codeBlocked,
} from 'components/managers/tech-card/components/pattern-import/bulk-names';

type Blocked = SemanticsOutput['blocked'][number];

let bad = 0;
const ck = (ok: boolean, what: string, detail?: unknown) => {
  if (!ok) bad++;
  console.log(
    `${ok ? '✓' : '✗'} ${what}${!ok && detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`,
  );
};

/** The corpus cases with code questions: DXF numbered / unnamed, PDF duplicates (pairs among them). */
const CORPUS = [
  'dxf:blazer',
  'dxf:POCKETS',
  'dxf:RC28-RC28-001-test-2',
  'kombinezon-A',
  'polupalto-sheetA',
];

export async function main(): Promise<number> {
  // ── 1 · dictionary ──────────────────────────────────────────────────────────────────────────
  console.log('— dictionary: a bare side segment');
  const side = (t: string) => {
    const r = readPieceText(t);
    return `${r.code}/${r.side}`;
  };
  ck(
    side('J - SKIRT HEM BAND (FRONT)') === 'HB/F',
    'reef «(FRONT)» → HB_F',
    side('J - SKIRT HEM BAND (FRONT)'),
  );
  ck(
    side('I - SKIRT HEM BAND (BACK)') === 'HB/B',
    'reef «(BACK)» → HB_B',
    side('I - SKIRT HEM BAND (BACK)'),
  );
  ck(side('Waistband / front') === 'WB/F', 'bilingual «Waistband / front» → WB_F');
  ck(
    side('COLLAR (BACK NECK)') === 'CLR/null',
    'a placement «(back neck)» gives no side',
    side('COLLAR (BACK NECK)'),
  );
  ck(side('SLEEVE (FRONT AND BACK)') === 'SL/null', '«front and back» gives no side');
  ck(side('POCKET (FRONT) (BACK)') === 'PCK/null', 'two bare sides give none');
  ck(
    side('Kragen / Обтачка / спинка') === 'CLR/null',
    'a body noun segment («спинка») is a piece, not a side',
  );
  ck(side('Front Waistband') === 'WB/F', 'the noun segment’s own side unchanged');

  // ── 2 · bulkNames, crafted ──────────────────────────────────────────────────────────────────
  console.log('— bulkNames: crafted');
  const box = (x: number, y: number): BoxMm => ({ minX: x, minY: y, maxX: x + 100, maxY: y + 100 });
  const boxes: Record<number, BoxMm> = {
    1: box(0, 1000),
    2: box(300, 1000),
    3: box(600, 1000),
    4: box(0, 500),
    5: box(300, 500),
    6: box(600, 500),
  };
  const blocked: Blocked[] = [
    {
      seed: 1,
      reason: 'grammar',
      detail: 'no name',
      name: { source: '3', hand: null, twin: null },
    },
    // a derived pair blocked twice (FP_L and FP_R of ONE seed): one entry
    {
      seed: 2,
      reason: 'duplicate-identity',
      detail: 'FP_L',
      name: { source: 'Front Top', hand: null, twin: null },
    },
    {
      seed: 2,
      reason: 'duplicate-identity',
      detail: 'FP_R',
      name: { source: 'Front Top', hand: null, twin: null },
    },
    // a drawn pair: both hands asked, each naming the other
    {
      seed: 3,
      reason: 'duplicate-identity',
      detail: 'SL_L',
      name: { source: 'sleeve', hand: 'L', twin: 5 },
    },
    {
      seed: 5,
      reason: 'grammar',
      detail: 'its other hand SL_L is blocked',
      name: { source: 'sleeve', hand: 'R', twin: 3 },
    },
    // a lone hand (pocket_l, no twin): the hand is not kept (PCK_L reads as size L)
    {
      seed: 4,
      reason: 'grammar',
      detail: 'PCK_L',
      name: { source: 'pocket_l', hand: null, twin: null },
    },
    { seed: 6, reason: 'grammar', detail: 'no name' },
    // not a code question
    { seed: 7, reason: 'no-grain', detail: 'no grain' },
  ];
  const boxOf = (sd: number) => boxes[sd] ?? null;
  const taken = ['P01', 'FP_L', 'FP_R'];
  const card = ['S', 'M', 'L', 'P03'];
  const a = bulkNames(blocked, boxOf, taken, card);
  const show = (m: typeof a) =>
    [...m]
      .sort((x, y) => x[0] - y[0])
      .map(([sd, n]) => `${sd}:${[n.code, ...n.mods].join('_')}:${n.displayName}`);
  console.log(`  ${show(a).join(' · ')}`);
  ck(codeBlocked(blocked).length === 6, 'one question per seed (a pair blocked twice counts once)');
  ck(a.size === 6, 'every code question answered', show(a));
  ck(
    ![...a.values()].some((n) => n.code === 'P01' || n.code === 'P03'),
    'a taken identity / a size token is skipped',
    show(a),
  );
  ck(
    a.get(3)?.code === a.get(5)?.code && a.get(3)?.mods[0] === 'L' && a.get(5)?.mods[0] === 'R',
    'a drawn pair: ONE code, both hands kept',
    show(a),
  );
  const singles = [1, 2, 4, 6].map((sd) => a.get(sd)?.code);
  ck(
    new Set(singles).size === 4 && !singles.includes(a.get(3)?.code),
    'every other seed its own code (never a merge)',
    singles,
  );
  ck(a.get(4)?.mods.length === 0, 'a lone hand is not kept', a.get(4));
  ck(a.get(1)?.displayName === 'piece 3', 'a bare number reads «piece 3»', a.get(1));
  ck(a.get(2)?.displayName === 'Front Top', 'the source name is kept as the name', a.get(2));
  ck(/^piece \d+$/.test(a.get(6)?.displayName ?? ''), 'nothing to keep → «piece NN»', a.get(6));
  // reading order: top row first (y-up sheet): 1 (top-left) gets the first free code
  ck(
    a.get(1)?.code === 'P02',
    'reading order: the top-left piece takes the first free code',
    a.get(1),
  );
  // the same answer for any input order
  const shuffled = [...blocked].reverse();
  const b = bulkNames(shuffled, boxOf, [...taken].reverse(), card);
  ck(JSON.stringify(show(a)) === JSON.stringify(show(b)), 'stable under input order', show(b));
  // a pair whose other hand has no box: neither hand is guessed
  const c = bulkNames(blocked, (sd) => (sd === 5 ? null : boxOf(sd)), taken, card);
  ck(!c.has(3) && !c.has(5), 'a pair with one hand unplaced is left to the operator', show(c));

  // ── 3 · corpus, twice ───────────────────────────────────────────────────────────────────────
  console.log('— corpus: the e2e harness twice');
  const base = process.env.PATIMPORT_REPORTS ?? resolve(tmpdir(), 'patimport-code-probe');
  const runs: Record<string, CaseRec>[] = [];
  for (const n of [1, 2]) {
    const dir = resolve(base, `code-probe-${n}`);
    mkdirSync(dir, { recursive: true });
    const r = spawnSync(
      process.execPath,
      [resolve(process.cwd(), 'scripts/pattern-import/e2e.mjs'), ...CORPUS],
      {
        env: {
          ...process.env,
          PATIMPORT_REPORTS: dir,
          PATIMPORT_E2E_OUT: resolve(dir, 'out'),
          E2E_OUT: resolve(dir, 'out'),
          E2E_REPORT: 'CODE.json',
        },
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      },
    );
    const file = resolve(dir, 'CODE.json');
    if (r.status !== 0 || !existsSync(file)) {
      ck(false, `e2e run ${n}`, (r.stderr || r.stdout).slice(-600));
      return 1;
    }
    const recs = JSON.parse(readFileSync(file, 'utf8')) as CaseRec[];
    runs.push(Object.fromEntries(recs.map((x) => [x.id, x])));
  }
  for (const id of CORPUS) {
    const r1 = runs[0][id];
    const r2 = runs[1][id];
    if (!r1 || !r2) {
      ck(false, `${id}: ran`);
      continue;
    }
    const bulk = r1.codeBulk ?? [];
    const pieces = r1.semFinal?.pieceInfo ?? [];
    // identity → the seeds that write it: never two
    const bySeeds = new Map<string, Set<number>>();
    for (const p of pieces) {
      const k = p.identity.toLowerCase();
      bySeeds.set(k, new Set([...(bySeeds.get(k) ?? []), p.seed]));
    }
    const shared = [...bySeeds].filter(([, s]) => s.size > 1).map(([k]) => k);
    ck(
      !shared.length,
      `${id}: no identity written by two pieces (${pieces.length} blocks)`,
      shared,
    );
    // a bulk code lands on its own seed(s) only; a shared code = the two hands of one drawn pair
    const seedsOfCode = new Map<string, { seed: number; mods: string[] }[]>();
    for (const x of bulk) seedsOfCode.set(x.code, [...(seedsOfCode.get(x.code) ?? []), x]);
    const wrongShare = [...seedsOfCode].filter(
      ([, xs]) =>
        xs.length > 1 &&
        !(
          xs.length === 2 &&
          xs[0].seed !== xs[1].seed &&
          [xs[0].mods.join(), xs[1].mods.join()].sort().join('|') === 'L|R'
        ),
    );
    ck(
      !wrongShare.length,
      `${id}: ${bulk.length} bulk codes, each on one piece or one drawn pair`,
      wrongShare,
    );
    const written = new Map(pieces.map((p) => [p.seed, p.identity] as const));
    const lost = bulk.filter((x) => {
      const idt = written.get(x.seed);
      return idt != null && !idt.startsWith(x.code);
    });
    ck(!lost.length, `${id}: every bulk-named piece written under its code`, lost.slice(0, 4));
    const key = (r: CaseRec) =>
      JSON.stringify(
        (r.codeBulk ?? [])
          .map((x) => `${x.pass}:${x.seed}:${[x.code, ...x.mods].join('_')}`)
          .sort(),
      );
    ck(key(r1) === key(r2), `${id}: the same codes on both runs`, [
      key(r1).slice(0, 200),
      key(r2).slice(0, 200),
    ]);
    console.log(
      `  ${id}: ${bulk
        .slice(0, 6)
        .map((x) => `${x.label}→${[x.code, ...x.mods].join('_')}`)
        .join(
          ', ',
        )}${bulk.length > 6 ? ` … +${bulk.length - 6}` : ''} · clicks ${r1.clicks?.total} (code ${r1.clicks?.byKind?.code ?? 0}, bulk ${r1.clicks?.byKind?.['code-bulk'] ?? 0})`,
    );
  }
  console.log(bad ? `✗ ${bad} check(s) failed` : '✓ code probe passed');
  return bad ? 1 : 0;
}

type CaseRec = {
  id: string;
  codeBulk?: { seed: number; pass: number; label: string; code: string; mods: string[] }[];
  semFinal?: { pieceInfo?: { identity: string; seed: number }[] };
  clicks?: { total: number; byKind?: Record<string, number> };
};
