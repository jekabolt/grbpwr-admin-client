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
//   4 · AP-tail: the AUTOPILOT names alike (policy → bulkNames): a crafted drawn pair gets ONE code
//       with both hands, as the "name N pieces" button gives, each answer a recorded assumption
//   5 · AP-tail: a generated code never updates an existing card piece without lineage
//       (`generatedReuse`, run.ts) — crafted drafts: generated → listed; replayed (lineage), from
//       the file, typed over, a new piece → not listed
//   6 · AP-tail: the autopilot over the corpus cases (autopilot.mjs): every autopilot code with a
//       hand has its twin under the same code with the other hand, no identity on two pieces
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
import {
  autopilotAnswer,
  generatedReuse,
  REPLAY_RULE,
  type Assumption,
} from 'components/managers/tech-card/components/pattern-import/autopilot';
import type { CardDraft, ImportSession, NameDecision } from 'lib/pattern-import/types';

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
  'polupalto',
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
  // Codex CODE-1: one hand asked (duplicate), its twin blocked for a grainline only → renamed together
  const lone = bulkNames(
    [
      {
        seed: 3,
        reason: 'duplicate-identity',
        detail: 'SL_L',
        name: { source: 'sleeve', hand: 'L', twin: 5 },
      },
      { seed: 5, reason: 'no-grain', detail: 'no grain' },
    ],
    boxOf,
    taken,
    card,
  );
  ck(
    lone.get(3)?.code != null &&
      lone.get(3)?.code === lone.get(5)?.code &&
      lone.get(3)?.mods[0] === 'L' &&
      lone.get(5)?.mods[0] === 'R',
    'a hand asked alone takes its twin (blocked for a grainline) along: one code, both hands',
    show(lone),
  );
  // a pair whose other hand has no box: neither hand is guessed
  const c = bulkNames(blocked, (sd) => (sd === 5 ? null : boxOf(sd)), taken, card);
  ck(!c.has(3) && !c.has(5), 'a pair with one hand unplaced is left to the operator', show(c));

  // ── 4 · the autopilot names like the button (AP-tail fix 1) ────────────────────────────────
  console.log('— autopilot: crafted drawn pair');
  {
    const fam = (seed: number) => ({
      seed,
      candidates: [{ rank: 0, outcome: 'closed', outer: [], areaMm2: 1, bbox: boxes[seed] }],
    });
    const session = {
      sessionId: 1,
      step: 'meaning',
      files: [],
      pages: [],
      clean: null,
      scale: { candidates: [], decision: null },
      sheet: null,
      chains: null,
      sizes: null,
      pieces: { families: [1, 2, 3, 4, 5, 6].map(fam), seeds: [] },
      names: [] as NameDecision[],
      // the identities already written (the bulk check's `taken`)
      semantics: {
        pieces: taken.map((identity, k) => ({ seed: 20 + k, identity, code: identity })),
        blocked,
        grainProposals: [],
        folds: [],
      },
      fabrics: null,
      variant: null,
      draft: null,
      gate: {},
      busy: null,
      error: null,
    } as unknown as ImportSession;
    const inputs = {
      overrides: {},
      operatorGrain: {},
      operatorFold: {},
      editedNames: [],
      confirmedNames: [],
      autopilot: [],
      assignment: null,
      scaleIndex: 0,
      sheetIndex: 0,
      gridOverride: null,
      cleanEdits: [],
      legend: [],
      legendConfirmed: [],
    };
    const ans = autopilotAnswer({
      session,
      inputs: inputs as never,
      card: { sizes: card.map((token, k) => ({ sizeId: k + 1, token })) } as never,
      question: '6 pieces need a name',
      step: 'meaning',
    });
    const ev = ans.events?.find((e) => e.type === 'names');
    const dec = ev && ev.type === 'names' ? ev.decisions : [];
    const by = new Map(dec.map((d) => [d.seed, d] as const));
    const nm = (sd: number) => {
      const d = by.get(sd);
      return d ? [d.code, ...d.mods].join('_') : '—';
    };
    console.log(`  ${[1, 2, 3, 4, 5, 6].map((sd) => `${sd}:${nm(sd)}`).join(' · ')}`);
    ck(!ans.stop, 'the autopilot answers the code questions', ans.reason);
    ck(
      by.get(3)?.code === by.get(5)?.code &&
        by.get(3)?.mods.join() === 'L' &&
        by.get(5)?.mods.join() === 'R',
      'autopilot: a drawn pair gets ONE code with both hands (never two codes, no hands)',
      [nm(3), nm(5)],
    );
    ck(
      [1, 2, 3, 4, 5, 6].every((sd) => by.get(sd)?.code === a.get(sd)?.code) &&
        [1, 2, 3, 4, 5, 6].every((sd) => by.get(sd)?.mods.join() === a.get(sd)?.mods.join()),
      'autopilot codes = the "name N pieces" codes',
      [1, 2, 3, 4, 5, 6].map(nm),
    );
    const named = (ans.assumptions ?? []).filter((x) => x.kind === 'name-code');
    ck(
      named.length === 6 && named.every((x) => x.seed != null && x.value !== undefined),
      'every autopilot name is a recorded assumption (seed + replayable value)',
      named.map((x) => `${x.seed}:${x.answer}`),
    );
    ck(
      (ans.patch?.editedNames ?? []).length === 6,
      'the names are typed through the names table (as the button does)',
      ans.patch?.editedNames,
    );
  }

  // ── 5 · generated code × existing card piece (AP-tail fix 2) ───────────────────────────────
  console.log('— autopilot: a generated code against the card');
  {
    const sc = {
      target: { scopeKey: 'MAIN', fabricPurpose: 'MAIN', bomLineKey: 'b1', label: 'main' },
      dxfText: '',
      manifest: {
        blocks: [],
        pieces: [
          { identity: 'P01', code: 'P01', mods: [], pairHand: null },
          { identity: 'P02_L', code: 'P02', mods: ['L'], pairHand: 'L' },
          { identity: 'P02_R', code: 'P02', mods: ['R'], pairHand: 'R' },
          { identity: 'FP', code: 'FP', mods: [], pairHand: null },
          { identity: 'P03', code: 'P03', mods: [], pairHand: null },
        ],
      },
    };
    const draft = {
      scopes: [sc],
      pieces: [
        { lineKey: 'k1', name: 'P01', existingLineKey: 'k1', basis: 'name' },
        { lineKey: 'k2', name: 'Sleeve', existingLineKey: 'k2', basis: 'alias' },
        { lineKey: 'k3', name: 'FP', existingLineKey: 'k3', basis: 'name' },
        { lineKey: 'n4', name: 'P03', existingLineKey: null, basis: 'new' },
      ],
      aliases: [
        { scopeKey: 'MAIN', blockName: 'P01', pieceLineKey: 'k1' },
        { scopeKey: 'MAIN', blockName: 'P02_L', pieceLineKey: 'k2' },
        { scopeKey: 'MAIN', blockName: 'P02_R', pieceLineKey: 'k2' },
        { scopeKey: 'MAIN', blockName: 'FP', pieceLineKey: 'k3' },
        { scopeKey: 'MAIN', blockName: 'P03', pieceLineKey: 'n4' },
      ],
    } as unknown as CardDraft;
    const sem = {
      pieces: [
        { seed: 1, identity: 'P01', code: 'P01' },
        { seed: 2, identity: 'P02_L', code: 'P02' },
        { seed: 3, identity: 'P02_R', code: 'P02' },
        { seed: 4, identity: 'FP', code: 'FP' },
        { seed: 5, identity: 'P03', code: 'P03' },
      ],
    } as never;
    const gen = (seed: number, answer: string, rule = 'a deterministic code'): Assumption => ({
      step: 'meaning',
      kind: 'name-code',
      subject: `seed ${seed}`,
      answer,
      rule,
      evidence: [],
      confidence: 0.5,
      strong: false,
      seed,
    });
    const all = [gen(1, 'P01'), gen(2, 'P02_L'), gen(3, 'P02_R'), gen(5, 'P03')];
    const r = generatedReuse(draft, sem, all);
    const show2 = (xs: typeof r) => xs.map((x) => `${x.identity}→«${x.existing}»`).sort();
    console.log(`  ${show2(r).join(' · ')}`);
    ck(
      JSON.stringify(show2(r)) ===
        JSON.stringify(['P01→«P01»', 'P02_L→«Sleeve»', 'P02_R→«Sleeve»']),
      'a generated code that reuses a card piece (by name, by alias) is listed; a new piece is not',
      show2(r),
    );
    ck(
      !r.some((x) => x.identity === 'FP'),
      'a name from the file (no autopilot code) is never listed, though it reuses «FP»',
    );
    const replayed = [
      gen(1, 'P01'),
      { ...gen(1, 'P01', `${REPLAY_RULE} front.dxf · 2026-10-11 21:40`) },
    ];
    ck(
      !generatedReuse(draft, sem, replayed).length,
      'lineage: the replay named the piece (its outline matched the import that wrote it) → reused',
    );
    const typedOver = {
      pieces: [{ seed: 1, identity: 'ZZ', code: 'ZZ' }],
    } as never;
    ck(
      !generatedReuse(draft, typedOver, [gen(1, 'P01')]).length,
      'a generated code typed over by the operator is not the autopilot’s any more',
    );
    ck(!generatedReuse(null, sem, all).length, 'no draft → nothing listed');
    // the previous import drew «P04» and this one does not: a generated NEW piece beside it could
    // be the same piece under a shifted code (a doubled cut)
    const gone = {
      ...draft,
      scopes: [{ ...sc, vanished: [{ blockName: 'P04', pieceLineKey: 'k9', pieceName: 'P04' }] }],
    } as unknown as CardDraft;
    const v = generatedReuse(gone, sem, all).filter((x) => x.kind === 'beside-vanished');
    ck(
      v.length === 1 && v[0].identity === 'P03' && v[0].existing === 'P04',
      'a generated new piece beside a card piece the previous import no longer draws is listed',
      v,
    );
    // a NEW piece named by the file itself (no autopilot code) beside the vanished «P04» is the
    // same doubt (kombinezon-A: a moved piece read «FP» back while «P01» lost its drawing)
    const fileNamed = generatedReuse(gone, sem, [gen(1, 'P01')]).filter(
      (x) => x.kind === 'beside-vanished',
    );
    ck(
      fileNamed.length === 1 && fileNamed[0].identity === 'P03' && fileNamed[0].existing === 'P04',
      'a new piece named by the FILE beside a card piece the previous import no longer draws is listed too',
      fileNamed,
    );
    ck(
      !generatedReuse(gone, sem, []).some((x) => x.kind === 'reuse'),
      'without an autopilot code nothing is listed as a reuse (a file name may reuse its card piece)',
    );
    // Codex AP-tail #1: the previous import of THESE files drew «P02» in another scope that this
    // draft does not write at all — a generated new piece may be it, moved to another fabric
    const src = { files: [{ name: 'a.dxf', sha256: 'aa', bytes: 1, kind: 'dxf', pages: 1 }] };
    const withSrc = {
      ...draft,
      scopes: [{ ...sc, manifest: { ...sc.manifest, source: src } }],
    } as unknown as CardDraft;
    const prior = (sha: string, name = 'old.dxf') => ({
      existingPieces: [{ lineKey: 'k7', name: 'P02' }],
      existingAliases: [{ scopeKey: 'LINING', blockName: 'P02', pieceLineKey: 'k7' }],
      existingPatterns: [
        {
          scopeKey: 'LINING',
          filename: 'x.dxf',
          url: 'mem://x',
          manifest: {
            source: { files: [{ sha256: sha, name }] },
            blocks: [],
            pieces: [{ identity: 'P02' }],
          },
        },
      ],
    });
    const cross = generatedReuse(withSrc, sem, all, prior('aa') as never).filter(
      (x) => x.kind === 'beside-vanished',
    );
    ck(
      cross.some((x) => x.identity === 'P03' && x.existing === 'P02'),
      'a generated new piece while these files’ sheet in an unwritten scope still links «P02» is listed',
      cross,
    );
    ck(
      !generatedReuse(withSrc, sem, all, prior('bb') as never).some(
        (x) => x.kind === 'beside-vanished',
      ),
      'another import’s sheet (other source files) is not ours: not listed',
    );
    ck(
      generatedReuse(withSrc, sem, all, prior('bb', 'A.dxf') as never).some(
        (x) => x.kind === 'beside-vanished' && x.existing === 'P02',
      ),
      'the same source file edited since (another sha256, same file name) is ours: listed',
    );
  }

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
  // ── 6 · the autopilot over the corpus cases (AP-tail fix 1) ────────────────────────────────
  console.log('— corpus: the autopilot names');
  {
    const dir = resolve(base, 'code-probe-autopilot');
    mkdirSync(dir, { recursive: true });
    const r = spawnSync(
      process.execPath,
      [resolve(process.cwd(), 'scripts/pattern-import/autopilot.mjs'), ...CORPUS],
      {
        env: { ...process.env, PATIMPORT_REPORTS: dir, AUTOPILOT_REPORT: 'CODE-AP.json' },
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
      },
    );
    const file = resolve(dir, 'CODE-AP.json');
    if (r.status !== 0 || !existsSync(file)) {
      ck(false, 'autopilot run', (r.stderr || r.stdout).slice(-600));
      return 1;
    }
    const recs = (JSON.parse(readFileSync(file, 'utf8')) as { results: ApRec[] }).results;
    let pairs = 0;
    for (const id of CORPUS) {
      const x = recs.find((y) => y.id === id);
      if (!x?.named) {
        ck(false, `${id}: autopilot ran`, x?.error ?? x?.verdict);
        continue;
      }
      const { pieces, codes } = x.named;
      const bySeeds = new Map<string, Set<number>>();
      for (const p of pieces) {
        const k = p.identity.toLowerCase();
        bySeeds.set(k, new Set([...(bySeeds.get(k) ?? []), p.seed]));
      }
      const shared = [...bySeeds].filter(([, ss]) => ss.size > 1).map(([k]) => k);
      ck(!shared.length, `${id}: no identity written by two pieces (autopilot)`, shared);
      const val = (c: ApCode) =>
        c.value && typeof c.value === 'object' && 'code' in c.value
          ? { code: String(c.value.code), mods: (c.value.mods as string[] | undefined) ?? [] }
          : { code: c.answer.split('_')[0], mods: c.answer.split('_').slice(1) };
      const handed = codes.map((c) => ({ seed: c.seed, ...val(c) })).filter((c) => c.mods.length);
      const orphan = handed.filter(
        (c) =>
          !handed.some(
            (t) =>
              t.seed !== c.seed &&
              t.code === c.code &&
              t.mods.join() === (c.mods.join() === 'L' ? 'R' : 'L'),
          ),
      );
      pairs += handed.length / 2;
      ck(
        !orphan.length,
        `${id}: ${codes.length} autopilot codes, ${handed.length / 2} drawn pairs — every hand has its twin under the same code`,
        orphan,
      );
      const lost = codes.filter((c) => {
        const v = val(c);
        const ps = pieces.filter((p) => p.seed === c.seed);
        return ps.length > 0 && !ps.some((p) => p.code === v.code);
      });
      ck(!lost.length, `${id}: every autopilot code is written on its seed`, lost.slice(0, 4));
    }
    console.log(
      `  drawn pairs named by the autopilot on the corpus: ${pairs}${pairs ? '' : ' (none reach naming — the crafted pair (§4) is the proof)'}`,
    );
  }

  console.log(bad ? `✗ ${bad} check(s) failed` : '✓ code probe passed');
  return bad ? 1 : 0;
}

type ApRec = {
  id: string;
  verdict?: string;
  error?: string;
  named?: {
    pieces: { seed: number; identity: string; code: string; mods: string[] }[];
    codes: ApCode[];
  };
};
type ApCode = { seed: number; answer: string; value: Record<string, unknown> | string | null };

type CaseRec = {
  id: string;
  codeBulk?: { seed: number; pass: number; label: string; code: string; mods: string[] }[];
  semFinal?: { pieceInfo?: { identity: string; seed: number }[] };
  clicks?: { total: number; byKind?: Record<string, number> };
};
