// S3 PROBE ENTRY (Codex round 3) — bundled by answers.mjs with 'react' aliased to react-hook-shim.ts.
//
// The defect: D3 answers (names, counts, the outline, "cutting list checked") were kept by seed and
// survived Back, a new sheet and a re-run; the write checked none of them. The scenario here is the
// one from the review: a two-model, two-sheet PDF — on sheet A confirm everything, Back, pick sheet
// B (same seed numbers, same model name, the outlines moved), regenerate: B's questions must be
// open, and the write must refuse by itself even when sheet A's answers are forced back in.
// Controls: Back and forward over the SAME sheet keeps every answer and the write goes through.
import type {
  CardSize,
  ChainSet,
  FabricAssignment,
  ImportSession,
  PieceFamily,
  ScaleDecision,
  Seed,
  SizeMap,
  SourceFileInfo,
  StageIO,
  StageName,
} from 'lib/pattern-import/types';
import type {
  CardContext,
  ImportClient,
} from 'components/managers/tech-card/components/pattern-import/client';
import { forRun } from 'components/managers/tech-card/components/pattern-import/client';
import {
  fixtureAssemble,
  fixtureChains,
  fixtureExtract,
  fixtureFabrics,
  fixtureFiles,
  fixtureMarks,
  fixtureNames,
  fixturePieces,
  fixtureScale,
  fixtureSemantics,
  fixtureSizes,
  fixtureWrite,
  SOURCE_SIZES,
} from 'components/managers/tech-card/components/pattern-import/fixture';
import {
  stubApplyDraft,
  stubBuildDraft,
} from 'components/managers/tech-card/components/pattern-import/stub-client';
import {
  useImportSession,
  type ImportSessionApi,
} from 'components/managers/tech-card/components/pattern-import/use-import-session';
import {
  answerCtxOf,
  liveAnswers,
  openQuestions,
  questionKey,
  settleAnswers,
  unansweredAtWrite,
  bindDrawnToModel,
  drawnSizesKey,
  liveDrawnSizes,
  pieceRev,
  type Answers,
} from 'components/managers/tech-card/components/pattern-import/answers';
import { mountHook, rerender } from './react-hook-shim';
import { applyLegend } from 'lib/pattern-import/chains/legend';

/** A cutting-list entry as printed (the fixture prints none; the key is what is kept). */
const LIST_ENTRY = '1 - Спинка со сгибом 1 дет.';

let failures = 0;
const check = (ok: boolean, what: string, extra?: unknown) => {
  if (!ok) failures++;
  console.log(
    `${ok ? '  ok ' : '  FAIL'} ${what}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`,
  );
};

// ── a two-sheet fixture client: sheet 1 is the same story drawn 7 mm to the right ─────────────
function twoSheetClient() {
  type S = {
    files: SourceFileInfo[];
    scale: ScaleDecision | null;
    sheet: number;
    classes: StageIO['chains']['out']['classes'];
    card: CardSize[];
    map: SizeMap | null;
    seeds: Seed[];
    families: PieceFamily[];
    semantics: StageIO['semantics']['out'] | null;
    assignment: FabricAssignment | null;
  };
  const sessions = new Map<number, S>();
  let id = 0;
  let last: S | null = null;
  const tokens = (s: S) => new Set(s.card.map((c) => c.token.toLowerCase()));
  const client: ImportClient = {
    kind: 'stub',
    async open(files) {
      const info = fixtureFiles(files);
      const s: S = {
        files: info,
        scale: null,
        sheet: 0,
        classes: [],
        card: [],
        map: null,
        seeds: [],
        families: [],
        semantics: null,
        assignment: null,
      };
      sessions.set(++id, s);
      last = s;
      return { sessionId: id, files: info };
    },
    async run(sessionId, stage: StageName, input) {
      const s = sessions.get(sessionId)!;
      await Promise.resolve();
      const out = ((): StageIO[StageName]['out'] => {
        switch (stage) {
          case 'extract':
            return fixtureExtract(s.files);
          case 'scale':
            s.scale = (input as StageIO['scale']['in']).decision;
            return fixtureScale(s.scale);
          case 'assemble': {
            const i = input as StageIO['assemble']['in'];
            s.sheet = i.sheet ?? 0;
            return fixtureAssemble(i.override);
          }
          case 'chains': {
            const o = fixtureChains((input as StageIO['chains']['in']).legend);
            s.classes = o.classes;
            return o;
          }
          case 'sizes': {
            const i = input as StageIO['sizes']['in'];
            s.card = i.card;
            const o = fixtureSizes(i.card, i.operatorMap, s.classes);
            s.map = o.map;
            return o;
          }
          case 'pieces': {
            const o = fixturePieces(input as StageIO['pieces']['in'], s.map?.entries.length ?? 5);
            const dx = s.sheet === 1 ? 7 : 0;
            s.seeds = o.seeds;
            s.families = o.families.map((f) => ({
              ...f,
              candidates: f.candidates.map((c) => ({
                ...c,
                outer: c.outer.map((p) => ({ x: p.x + dx, y: p.y })),
              })),
            }));
            return { seeds: o.seeds, families: s.families };
          }
          case 'render-som':
            return {
              sheetPng: new Blob([], { type: 'image/png' }),
              crops: [],
              marks: fixtureMarks(s.families),
            };
          case 'semantics': {
            const o = fixtureSemantics({
              input: input as StageIO['semantics']['in'],
              seeds: s.seeds,
              families: s.families,
              map: s.map ?? { entries: [], unmapped: [] },
              sizeTokens: tokens(s),
            });
            s.semantics = o;
            return o;
          }
          case 'fabrics': {
            const o = fixtureFabrics(
              (input as StageIO['fabrics']['in']).bom,
              s.seeds,
              s.semantics?.pieces ?? [],
            );
            s.assignment = o;
            return o;
          }
          case 'write':
            return fixtureWrite({
              input: input as StageIO['write']['in'],
              specs: s.semantics?.pieces ?? [],
              seeds: s.seeds,
              techCardId: 0,
              sizeTokens: tokens(s),
              sources: s.files,
              scale: s.scale,
            });
          default:
            throw new Error(`probe client: ${String(stage)}`);
        }
      })();
      return out as never;
    },
    cancel() {},
    async close(sid) {
      sessions.delete(sid);
    },
  };
  return { client, state: () => last! };
}

// ── the wizard, mounted ─────────────────────────────────────────────────────────────────────
async function mount() {
  const { client, state } = twoSheetClient();
  const card: CardContext = forRun({
    techCardId: 0,
    sizes: SOURCE_SIZES.map((t, rank) => ({ sizeId: 100 + rank, name: t, token: t, rank })),
    scopes: [],
    existingPieces: [],
    styleLabel: 'S3 probe',
  });
  let api!: ImportSessionApi;
  const deps = {
    client,
    card,
    // the first named piece comes back below the auto-accept line: an AI name to confirm
    namer: async () =>
      fixtureNames(state().families, state().seeds).map((n, k) =>
        k === 0 ? { ...n, source: 'ai' as const, autoAccepted: false, confidence: 0.5 } : n,
      ),
    buildDraft: stubBuildDraft,
    applyDraft: stubApplyDraft,
  };
  mountHook(() => {
    api = useImportSession(deps);
  });
  const settle = async () => {
    for (let k = 0; k < 3; k++) await new Promise((r) => setTimeout(r, 0));
    rerender();
  };
  const step = async (f: (a: ImportSessionApi) => Promise<unknown> | unknown) => {
    await f(api);
    await settle();
    if (api.session.error && !/not written/.test(api.session.error))
      throw new Error(`wizard error on ${api.session.step}: ${api.session.error}`);
  };
  return { get: () => api, step };
}

type W = Awaited<ReturnType<typeof mount>>;

/** sheet step → details for `model`, the regions that do not close dropped as "not a piece". */
async function sheetToDetails(w: W, model: string, drawn?: number) {
  await w.step((a) => a.next()); // sheet → sizes
  if (drawn != null) await w.step((a) => a.setDrawnSizes(drawn)); // H1: "sizes drawn: n"
  await w.step((a) => a.next()); // sizes → pieces (first run: every model)
  await w.step((a) => a.dispatch({ type: 'variant', variant: model }));
  const open = (w.get().session.pieces?.families ?? []).filter((f) =>
    f.candidates.some((c) => c.outcome !== 'closed'),
  );
  for (const f of open) await w.step((a) => a.editPieces({ kind: 'not-a-piece', seed: f.seed }));
  await w.step((a) => a.next()); // pieces → details (names, semantics)
}

/** What the operator does on details: grainlines, the outline, "confirm all as shown", the list. */
async function answerDetails(w: W) {
  const sem = w.get().session.semantics!;
  for (const b of sem.blocked.filter((x) => x.reason === 'no-grain')) {
    const i = w.get().inputs;
    const operatorGrain = {
      ...i.operatorGrain,
      [b.seed]: { a: { x: 0, y: 0 }, b: { x: 0, y: 100 } },
    };
    await w.step((a) =>
      a.dispatch({ type: 'semantics', input: a.semanticsInput({ ...i, operatorGrain }) }),
    );
  }
  await w.step((a) => a.answerOutline('seam', 10));
  await w.step((a) => a.confirmShown());
  const i = w.get().inputs;
  await w.step((a) =>
    a.dispatch({
      type: 'semantics',
      input: a.semanticsInput({ ...i, foldListChecked: [LIST_ENTRY] }),
    }),
  );
}

const openOf = (a: ImportSessionApi) =>
  openQuestions(a.session.semantics, a.session.names, a.inputs, a.answersNow);

async function writeFromDetails(w: W) {
  await w.step((a) => a.next()); // details → fabrics (next() itself does not read the footer)
  await w.step((a) => a.dispatch({ type: 'write' }));
  const s = w.get().session;
  return { error: s.error, written: !!s.draft, step: s.step };
}

async function scenario() {
  console.log('S3 · scenario: sheet A answered, Back, sheet B, regenerate');
  const w = await mount();
  await w.step((a) =>
    a.dispatch({
      type: 'files',
      files: [new File([new Uint8Array(64)], 'coat-2models.pdf', { type: 'application/pdf' })],
    }),
  );
  await w.step((a) => a.next()); // files → scale
  await w.step((a) => a.next()); // scale → sheet
  check(w.get().session.step === 'sheet', 'on the sheet step', w.get().session.step);

  // ── sheet A ──
  await sheetToDetails(w, 'MOD. 125', 5);
  check(w.get().session.step === 'meaning', 'sheet A: on details', w.get().session.step);
  const before = openOf(w.get());
  check(
    before.total > 0 && before.allowance.length > 0,
    'sheet A: D3 questions are asked before any answer',
    { total: before.total, allowance: before.allowance.length },
  );
  await answerDetails(w);
  const a = w.get();
  const openA = openOf(a);
  check(openA.total === 0 && openA.allowance.length === 0, 'sheet A: all answered', {
    total: openA.total,
    allowance: openA.allowance.length,
  });
  const answersA = {
    confirmedNames: [...a.inputs.confirmedNames],
    confirmedQuantities: { ...a.inputs.confirmedQuantities },
    fileAllowance: a.inputs.fileAllowance,
    foldListChecked: a.inputs.foldListChecked,
    answerCtx: a.inputs.answerCtx,
    drawnSizes: a.inputs.drawnSizes,
  };
  check(
    answersA.foldListChecked.includes(LIST_ENTRY) &&
      answersA.fileAllowance?.origin === 'operator' &&
      Object.keys(answersA.confirmedQuantities).length > 0 &&
      answersA.confirmedNames.length > 0,
    'sheet A: answers recorded (names, counts, outline, list)',
    {
      names: answersA.confirmedNames.length,
      qty: Object.keys(answersA.confirmedQuantities).length,
    },
  );

  // ── control: same sheet, Back and forward without changes ──
  await w.step((x) => x.dispatch({ type: 'back', to: 'sheet' }));
  check(!w.get().session.semantics, 'Back to sheet drops the outputs after it');
  await w.step((x) => x.next()); // sheet → sizes
  await w.step((x) => x.next()); // sizes → pieces (model kept)
  await w.step((x) => x.next()); // pieces → details
  const k = w.get();
  const openK = openOf(k);
  check(
    k.session.step === 'meaning' && openK.total === 0 && openK.allowance.length === 0,
    'control: same sheet Back → forward keeps every answer (nothing re-asked)',
    { step: k.session.step, total: openK.total, allowance: openK.allowance.length },
  );
  check(
    JSON.stringify(k.inputs.confirmedQuantities) === JSON.stringify(answersA.confirmedQuantities) &&
      k.inputs.confirmedNames.length === answersA.confirmedNames.length &&
      k.inputs.foldListChecked.includes(LIST_ENTRY) &&
      k.inputs.fileAllowance?.origin === 'operator',
    'control: the kept answers are the same answers',
  );
  check(
    k.inputs.drawnSizes === 5 && answersA.drawnSizes === 5,
    'control: the drawn-size answer of this sheet is kept',
    k.inputs.drawnSizes,
  );
  check(k.blocker === null, 'control: details footer is clear', k.blocker);
  const wA = await writeFromDetails(w);
  check(wA.written && !wA.error && wA.step === 'check', 'control: the write goes through', wA);

  // ── sheet B ──
  await w.step((x) => x.dispatch({ type: 'back', to: 'sheet' }));
  await w.step((x) => x.dispatch({ type: 'sheet', sheet: 1 }));
  await sheetToDetails(w, 'MOD. 125');
  const b = w.get();
  check(b.session.step === 'meaning', 'sheet B: on details', b.session.step);
  const seedsA = new Set(Object.keys(answersA.answerCtx?.revs ?? {}).map(Number));
  const seedsB = (b.session.pieces?.families ?? []).map((f) => f.seed);
  check(
    seedsB.some((s) => seedsA.has(s)),
    'sheet B re-uses sheet A seed numbers (the trap is armed)',
    seedsB,
  );
  check(
    b.inputs.confirmedNames.length === 0 &&
      Object.keys(b.inputs.confirmedQuantities).length === 0 &&
      b.inputs.fileAllowance === null &&
      b.inputs.foldListChecked.length === 0 &&
      b.inputs.drawnSizes === null,
    'sheet B: sheet A answers were dropped when the pieces settled',
    {
      names: b.inputs.confirmedNames,
      qty: b.inputs.confirmedQuantities,
      allowance: b.inputs.fileAllowance?.origin ?? null,
      list: b.inputs.foldListChecked,
      drawn: b.inputs.drawnSizes,
    },
  );
  const openB = openOf(b);
  check(
    openB.total > 0 && openB.allowance.length > 0,
    'sheet B: its questions are open (not silently answered)',
    { total: openB.total, quantity: openB.quantity.length, allowance: openB.allowance.length },
  );
  check(!!b.blocker, 'sheet B: the details footer says what is open', b.blocker);

  // ── the write refuses by itself (1): sheet A answers forced back in, a settle missed ──
  await answerGrainOnly(w);
  const ctxB = w.get().answersNow;
  w.get().patchInputs({
    confirmedNames: answersA.confirmedNames,
    confirmedQuantities: answersA.confirmedQuantities,
    fileAllowance: answersA.fileAllowance,
    foldListChecked: [LIST_ENTRY],
    answerCtx: answersA.answerCtx,
  });
  await w.step(() => undefined);
  const wB = await writeFromDetails(w);
  check(
    !wB.written &&
      /not written/.test(wB.error ?? '') &&
      /outline/.test(wB.error ?? '') &&
      /quantit/.test(wB.error ?? '') &&
      /name/.test(wB.error ?? ''),
    'sheet B: the write refuses on its own with sheet A answers injected (typed error in the footer)',
    wB,
  );
  check(
    wB.step === 'fabrics' && w.get().blocker === null,
    'the refusal is the write transition itself (the fabrics footer had nothing to say)',
  );

  // ── (2): sheet A counts re-stamped with B's fingerprint still are not B's answers ──
  await w.step((x) => x.dispatch({ type: 'back', to: 'meaning' }));
  w.get().patchInputs({
    confirmedNames: [],
    confirmedQuantities: answersA.confirmedQuantities,
    fileAllowance: null,
    foldListChecked: [],
    answerCtx: ctxB,
  });
  await w.step(() => undefined);
  await answerGrainOnly(w);
  const q2 = openOf(w.get());
  check(
    q2.quantity.length > 0,
    'a count key from sheet A does not match the same seed on sheet B (the key carries the outline)',
    q2.quantity.map((u) => u.seed),
  );

  // ── and answering B for real lets it through ──
  await answerDetails(w);
  const ok = openOf(w.get());
  check(
    ok.total === 0 && !w.get().blocker,
    'sheet B answered: details footer clear',
    w.get().blocker,
  );
  const wB2 = await writeFromDetails(w);
  check(wB2.written && !wB2.error, 'sheet B answered: the write goes through', wB2);
}

async function answerGrainOnly(w: W) {
  const sem = w.get().session.semantics!;
  for (const b of sem.blocked.filter((x) => x.reason === 'no-grain')) {
    const i = w.get().inputs;
    const operatorGrain = {
      ...i.operatorGrain,
      [b.seed]: { a: { x: 0, y: 0 }, b: { x: 0, y: 100 } },
    };
    await w.step((a) =>
      a.dispatch({ type: 'semantics', input: a.semanticsInput({ ...i, operatorGrain }) }),
    );
  }
}

// ── unit controls on answers.ts ─────────────────────────────────────────────────────────────
/** T6: "sizes drawn" answered before a model is picked belongs to the first model picked. */
async function modelScenario() {
  console.log('S3 · T6: a drawn-size answer and a model switch');
  const w = await mount();
  await w.step((a) =>
    a.dispatch({
      type: 'files',
      files: [new File([new Uint8Array(64)], 'coat-2models.pdf', { type: 'application/pdf' })],
    }),
  );
  await w.step((a) => a.next()); // files → scale
  await w.step((a) => a.next()); // scale → sheet
  await w.step((a) => a.next()); // sheet → sizes
  await w.step((a) => a.setDrawnSizes(5)); // no model picked yet
  await w.step((a) => a.next()); // sizes → pieces (every model)
  await w.step((a) => a.dispatch({ type: 'variant', variant: 'MOD. 125' }));
  const a1 = w.get();
  check(
    a1.inputs.drawnSizes === 5 &&
      a1.session.step === 'pieces' &&
      /MOD\. 125/.test(a1.inputs.drawnSizesAt ?? ''),
    'model A picked: the answer is kept and bound to A',
    a1.inputs.drawnSizesAt,
  );
  await w.step((a) => a.dispatch({ type: 'variant', variant: 'MOD. 125' }));
  check(w.get().inputs.drawnSizes === 5, 'model A picked again: still answered');
  await w.step((a) => a.dispatch({ type: 'variant', variant: 'MOD. 126' }));
  const b1 = w.get();
  check(
    b1.inputs.drawnSizes === null && b1.session.step === 'sizes',
    "model B picked: the count is asked again on the sizes step (A's answer is not B's)",
    { drawn: b1.inputs.drawnSizes, step: b1.session.step },
  );
  await w.step((a) => a.setDrawnSizes(3));
  await w.step((a) => a.next()); // sizes → pieces (model B)
  const b2 = w.get();
  check(
    b2.inputs.drawnSizes === 3 && b2.session.variant === 'MOD. 126',
    'model B answered on its own: kept for B',
    { drawn: b2.inputs.drawnSizes, variant: b2.session.variant },
  );
}

function units() {
  console.log('S3 · units: liveAnswers / settleAnswers');
  const fam = (seed: number, dx: number): PieceFamily => ({
    seed,
    monotone: true,
    candidates: [0, 1].map((rank) => ({
      seed,
      rank,
      outer: [
        { x: dx, y: 0 },
        { x: dx + 100 + rank, y: 0 },
        { x: dx + 100 + rank, y: 200 },
      ],
      walls: [],
      inside: [],
      textsInside: [],
      outcome: 'closed' as const,
      areaMm2: 1,
      bbox: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
      sourceCoverage: 1,
      p95Mm: 0,
    })),
  });
  const at = { sheetIndex: 0, gridOverride: undefined, variant: 'A' };
  const ctx = answerCtxOf(at, [fam(1, 0), fam(2, 300)]);
  const answers: Answers = {
    fileAllowance: { meaning: 'cut', allowanceMm: 0, origin: 'operator', evidence: [] },
    foldListChecked: ['1 - Back on fold'],
    confirmedNames: [1, 2],
    editedNames: [2],
    confirmedQuantities: {
      1: questionKey({ seed: 1, kind: 'quantity', shown: '×2', detail: 'x' }, ctx),
      2: questionKey({ seed: 2, kind: 'quantity', shown: '×1', detail: 'x' }, ctx),
    },
    overrides: { 1: { piecesPerGarment: 2 }, 2: { code: 'BP' } },
    operatorGrain: { 2: { a: { x: 0, y: 0 }, b: { x: 0, y: 1 } } },
    operatorFold: {},
    assignment: null,
    answerCtx: ctx,
  };
  const same = liveAnswers(answers, answerCtxOf(at, [fam(1, 0), fam(2, 300)]));
  check(
    same.confirmedNames.length === 2 &&
      same.foldListChecked.length === 1 &&
      !!same.fileAllowance &&
      Object.keys(same.overrides).length === 2,
    'recomputed identical pieces keep every answer',
  );
  const moved = liveAnswers(answers, answerCtxOf(at, [fam(1, 0), fam(2, 305)]));
  check(
    moved.confirmedNames.join() === '1' &&
      moved.editedNames.length === 0 &&
      Object.keys(moved.confirmedQuantities).join() === '1' &&
      Object.keys(moved.overrides).join() === '1' &&
      Object.keys(moved.operatorGrain).length === 0 &&
      moved.foldListChecked.length === 0 &&
      !!moved.fileAllowance,
    'a piece whose outline moved loses only its own answers (+ the list check); the outline answer stays',
  );
  const otherModel = liveAnswers(
    answers,
    answerCtxOf({ ...at, variant: 'B' }, [fam(1, 0), fam(2, 300)]),
  );
  check(
    otherModel.confirmedNames.length === 0 &&
      !otherModel.fileAllowance &&
      Object.keys(otherModel.overrides).length === 0,
    'another model (same outlines, same seeds): nothing is live',
  );
  const otherSheet = liveAnswers(
    answers,
    answerCtxOf({ ...at, sheetIndex: 1 }, [fam(1, 0), fam(2, 300)]),
  );
  check(
    otherSheet.confirmedNames.length === 0 && !otherSheet.fileAllowance,
    'another sheet (same outlines, same seeds): nothing is live',
  );
  const none = liveAnswers({ ...answers, answerCtx: null }, ctx);
  check(none.confirmedNames.length === 0 && !none.fileAllowance, 'no fingerprint = nothing live');
  const settled = settleAnswers(answers, answerCtxOf(at, [fam(1, 0), fam(2, 305)]));
  check(
    settled.answerCtx?.revs[2] !== ctx.revs[2] && settled.confirmedNames.join() === '1',
    'settle re-stamps the survivors with the new fingerprint',
  );
  const sem = {
    pieces: [{ seed: 1 }, { seed: 2 }] as unknown as StageIO['semantics']['out']['pieces'],
    unproven: [
      { seed: 1, kind: 'quantity' as const, shown: '×2', detail: 'x' },
      { seed: 2, kind: 'quantity' as const, shown: '×3', detail: 'x' },
    ],
  };
  const listSem = {
    ...sem,
    unproven: [],
    foldList: { entries: ['1 - Back on fold', '2 - Collar on fold'], unfolded: 0, bound: [] },
  } as unknown as Parameters<typeof unansweredAtWrite>[0];
  const w1 = unansweredAtWrite(listSem, [], answers, ctx);
  check(
    w1.join() === '1 cutting-list entry to check',
    'write: a new unbound entry is open, the checked one is not',
    w1,
  );
  const w2 = unansweredAtWrite(listSem, [], answers, answerCtxOf(at, [fam(1, 0), fam(2, 305)]));
  check(
    w2.join() === '2 cutting-list entries to check',
    'write: a checked entry stops counting once a piece moved',
    w2,
  );
  const atA = { sheetIndex: 0, gridOverride: undefined, variant: 'MOD. 125' };
  const drawnA = { drawnSizes: 3, drawnSizesAt: drawnSizesKey(atA) };
  const drawnAll = { drawnSizes: 3, drawnSizesAt: drawnSizesKey({ ...atA, variant: null }) };
  check(
    liveDrawnSizes(drawnA, atA) === 3 &&
      liveDrawnSizes(drawnA, { ...atA, variant: 'MOD. 126' }) === null &&
      liveDrawnSizes(drawnA, { ...atA, sheetIndex: 1 }) === null &&
      liveDrawnSizes(drawnA, { ...atA, gridOverride: { rows: 2 } }) === null &&
      liveDrawnSizes(drawnAll, { ...atA, variant: 'MOD. 126' }) === null &&
      liveDrawnSizes(drawnAll, { ...atA, variant: null }) === 3 &&
      liveDrawnSizes({ drawnSizes: 3, drawnSizesAt: null }, atA) === null,
    'drawn sizes: live on the same sheet + model only (a no-model answer is no wildcard)',
  );
  // T6: an answer given before a model was picked is the first picked model's, no wildcard
  const bound = bindDrawnToModel(drawnAll, atA);
  check(
    liveDrawnSizes({ ...drawnAll, drawnSizesAt: bound }, atA) === 3 &&
      liveDrawnSizes({ ...drawnAll, drawnSizesAt: bound }, { ...atA, variant: 'MOD. 126' }) ===
        null &&
      bindDrawnToModel({ ...drawnAll, drawnSizesAt: bound }, { ...atA, variant: 'MOD. 126' }) ===
        bound &&
      bindDrawnToModel(drawnAll, { ...atA, sheetIndex: 1 }) === drawnAll.drawnSizesAt,
    'drawn sizes: a no-model answer binds to the first model; another model does not inherit it',
  );
  // T2: the revision is the outline itself, not a 32-bit hash of it — find a 32-bit collision
  // between two different rectangles and show their revisions still differ
  const fnv32 = (t: string) => {
    let h = 0x811c9dc5;
    for (let k = 0; k < t.length; k++) {
      h ^= t.charCodeAt(k);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  };
  const rect = (w: number, h: number): PieceFamily => ({
    ...fam(1, 0),
    candidates: [
      {
        ...fam(1, 0).candidates[0],
        outer: [
          { x: 0, y: 0 },
          { x: w / 100, y: 0 },
          { x: w / 100, y: h / 100 },
          { x: 0, y: h / 100 },
        ],
      },
    ],
  });
  const canon = (f: PieceFamily) =>
    f.candidates
      .map(
        (c) =>
          `${c.rank}:${c.outcome}:${c.outer.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')}`,
      )
      .join('|');
  const seen = new Map<number, [number, number]>();
  let pair: [PieceFamily, PieceFamily] | null = null;
  for (let w = 1000; w < 4000 && !pair; w++)
    for (let h = 1000; h < 1200 && !pair; h++) {
      const k = fnv32(canon(rect(w, h)));
      const hit = seen.get(k);
      if (hit) pair = [rect(...hit), rect(w, h)];
      else seen.set(k, [w, h]);
    }
  check(
    !!pair && pieceRev(pair[0]) !== pieceRev(pair[1]),
    'two rectangles that collide in 32-bit FNV keep different revisions',
    pair ? pair.map((f) => f.candidates[0].outer[2]) : 'no collision found',
  );
  // T3: an untouched low-confidence legend row stays a question
  const set: ChainSet = {
    chains: [],
    bundles: [],
    orphans: [],
    warnings: [],
    classes: [
      {
        id: 0,
        role: 'size',
        sizeLabel: '44',
        chains: [],
        totalLengthMm: 0,
        evidence: [],
        confidence: 0.9,
      },
      {
        id: 1,
        role: 'ignore',
        sizeLabel: null,
        chains: [],
        totalLengthMm: 0,
        evidence: [],
        confidence: 0.4,
      },
    ],
  };
  const l1 = applyLegend(set, [
    { classId: 0, role: 'size', sizeLabel: '46' },
    { classId: 1, role: 'ignore', sizeLabel: null },
  ]);
  check(
    l1.classes[0].confidence === 1 && l1.classes[1].confidence === 0.4,
    'legend: a row sent back as built keeps its low confidence; the changed row is answered',
    l1.classes.map((c) => c.confidence),
  );
  const l2 = applyLegend(set, [{ classId: 1, role: 'common', sizeLabel: null }]);
  check(
    l2.classes[1].confidence === 1 && l2.classes[0].confidence === 0.9,
    'legend: changing the grey row answers it and leaves the others as they were',
    l2.classes.map((c) => c.confidence),
  );
  // A2 (Codex): a legend answer is bound to the row's signature — a rebuild that renumbers the rows
  // (a clean edit, a grid change) hands it to the same row, and a row that is gone takes it along
  const signed = {
    ...set,
    classes: set.classes.map((c, i) => ({ ...c, sig: i === 0 ? 'size44' : 'grey' })),
  };
  const renumbered = {
    ...signed,
    classes: [...signed.classes].reverse().map((c, i) => ({ ...c, id: i })),
  };
  const l3 = applyLegend(renumbered, [
    { classId: 1, role: 'common', sizeLabel: null, sig: 'grey' },
  ]);
  check(
    l3.classes.find((c) => c.sig === 'grey')?.role === 'common' &&
      l3.classes.find((c) => c.sig === 'size44')?.role === 'size',
    'legend: an answer bound to a row signature follows the row when the rows are renumbered',
    l3.classes.map((c) => [c.id, c.sig, c.role]),
  );
  const gone = { ...signed, classes: signed.classes.filter((c) => c.sig !== 'grey') };
  const l4 = applyLegend(gone, [{ classId: 0, role: 'ignore', sizeLabel: null, sig: 'grey' }]);
  check(
    l4.classes[0].role === 'size',
    'legend: an answer whose row is gone answers no other row (same number, other signature)',
    l4.classes.map((c) => [c.id, c.sig, c.role]),
  );
  const q = openQuestions(sem, [], answers, ctx);
  check(
    q.quantity.map((u) => u.seed).join() === '2',
    'a count confirmed as ×1 does not answer the same piece shown as ×3',
  );
}

export async function main(): Promise<number> {
  units();
  await scenario();
  await modelScenario();
  console.log(failures ? `S3 · ${failures} FAILED` : 'S3 · all checks passed');
  return failures;
}

export type { ImportSession };
