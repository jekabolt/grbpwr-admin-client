// The wizard's state machine (08-CONTRACT §4.2). One session per run; every field of
// `ImportSession` is the latest stage output, and `inputs` are what the operator decided — kept
// across `back`, so re-entering a step re-runs it with the previous answers (contract: "back{to}
// re-enters a step with its previous inputs; outputs after it are dropped").
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AllowanceDecision,
  ApplyResult,
  CardSize,
  ImportErrorCode,
  ChainRole,
  ClassId,
  FabricAssignment,
  GridOverride,
  ImportSession,
  NameDecision,
  PieceEdit,
  PtMm,
  ScaleDecision,
  Seed,
  SeedId,
  SizeMap,
  SizeMapEntry,
  StageIO,
  StageName,
  WizardEvent,
  WizardStep,
} from 'lib/pattern-import/types';
import { AI_AUTO_ACCEPT_T } from 'lib/pattern-import/ai/threshold';
import {
  nameOriginOf,
  overridesFromNames as namesToOverrides,
  planNaming,
  withAiNames,
} from 'lib/pattern-import/ai/dxf-names';
import { isKnownCode } from 'lib/pattern-import/dictionary/codes';
import { PATIMPORT } from 'lib/pattern-import/types';
import {
  buildErrorReport,
  checkFilesBeforeReading,
  downloadErrorReport,
  ImportWorkerError,
  importErrorCode,
  type ErrorReport,
  type ImportLogEvent,
} from 'lib/pattern-import/worker/client';
import { anisotropyOf, squareSidesOf } from './formats';
import type {
  ApplyDraftFn,
  ApplyProgress,
  CardContext,
  DraftBuilder,
  ImportClient,
  NameSuggester,
} from './client';
import { identitiesOf, identityProblem, sizeTokenTest } from 'lib/pattern-import/manifest';
import { aiFabricHintsOf } from 'lib/pattern-import/fabrics/propose';
import { fusedSeeds, planScopes } from 'lib/pattern-import/fabrics/scope';
import {
  answerCtxOf,
  countWords,
  liveAnswers,
  openQuestions,
  questionKey,
  settleAnswers,
  UnansweredQuestionsError,
  unansweredAtWrite,
  type AnswerCtx,
} from './answers';

export const STEPS: { id: WizardStep; label: string }[] = [
  { id: 'files', label: 'files' },
  { id: 'scale', label: 'scale' },
  { id: 'sheet', label: 'sheet' },
  { id: 'sizes', label: 'sizes' },
  { id: 'pieces', label: 'pieces' },
  { id: 'meaning', label: 'details' },
  { id: 'fabrics', label: 'fabrics' },
  { id: 'check', label: 'check' },
  { id: 'apply', label: 'apply' },
];
export const stepIndex = (s: WizardStep) => STEPS.findIndex((x) => x.id === s);

export type LegendEdit = { classId: ClassId; role: ChainRole; sizeLabel: string | null };
export type PieceOverride = NonNullable<StageIO['semantics']['in']['pieceOverrides'][SeedId]>;

/** What the operator decided. Survives `back`; cleared only by `reset`. */
export type Inputs = {
  fileList: File[];
  scaleIndex: number;
  /** Measured length of the test square when the operator overrides the detection, mm. */
  manualMeasuredMm: number | null;
  scaleConfirmed: boolean;
  gridOverride: GridOverride | undefined;
  /** The tile sheet being assembled (a Burda file carries several). */
  sheetIndex: number;
  /** Loop-closure residuals over the limit, looked at and accepted by the operator. */
  residualsAccepted: boolean;
  legend: LegendEdit[];
  /** Low-confidence legend rows the operator has looked at and accepted. */
  legendConfirmed: ClassId[];
  sizeMap: SizeMapEntry[] | null;
  /** H1: the operator's "sizes drawn on this sheet" (null = the card's run decides). */
  drawnSizes: number | null;
  variant: string | null;
  /** Seeds the operator added by clicking (appended to the text seeds of the first run). */
  clickSeeds: Seed[];
  edits: PieceEdit[];
  fileAllowance: AllowanceDecision | null;
  overrides: StageIO['semantics']['in']['pieceOverrides'];
  operatorGrain: Partial<Record<SeedId, { a: PtMm; b: PtMm }>>;
  /** Fold edges the operator picked (E1a); "not a fold" lives in `overrides[seed].unfoldedFold`. */
  operatorFold: Partial<Record<SeedId, { a: PtMm; b: PtMm }>>;
  /** The operator checked the cutting list's fold pieces against the sheet. */
  foldListChecked: boolean;
  /** Names the operator confirmed or typed (AI suggestions below the threshold need one of the two). */
  confirmedNames: SeedId[];
  /** Names the operator TYPED (code or display name) — their `nameOrigin` is 'operator'. */
  editedNames: SeedId[];
  /**
   * D3: quantities the operator confirmed AS SHOWN, keyed by the question (`questionKey`: the
   * piece's revision, kind, what was shown, why): a count that changes afterwards (a fold, a pair
   * answer, another sheet or outline) is a new question.
   */
  confirmedQuantities: Partial<Record<SeedId, string>>;
  assignment: FabricAssignment | null;
  /**
   * S3: the fingerprint (sheet, grid, model, each piece's outline) the answers above were given
   * against. Settled after every pieces run; an answer whose piece or sheet moved is dropped, and
   * every reader goes through `liveAnswers`, so a stale one never counts (answers.ts).
   */
  answerCtx: AnswerCtx | null;
};

const EMPTY_INPUTS: Inputs = {
  fileList: [],
  scaleIndex: 0,
  manualMeasuredMm: null,
  scaleConfirmed: false,
  gridOverride: undefined,
  sheetIndex: 0,
  residualsAccepted: false,
  legend: [],
  legendConfirmed: [],
  sizeMap: null,
  drawnSizes: null,
  variant: null,
  clickSeeds: [],
  edits: [],
  fileAllowance: null,
  overrides: {},
  operatorGrain: {},
  operatorFold: {},
  foldListChecked: false,
  confirmedNames: [],
  editedNames: [],
  confirmedQuantities: {},
  assignment: null,
  answerCtx: null,
};

const EMPTY_SESSION: ImportSession = {
  sessionId: null,
  step: 'files',
  files: [],
  pages: [],
  scale: { candidates: [], decision: null },
  sheet: null,
  chains: null,
  sizes: null,
  pieces: null,
  names: [],
  semantics: null,
  fabrics: null,
  variant: null,
  draft: null,
  gate: {},
  busy: null,
  error: null,
};

/** Fields each step OWNS — dropped when the operator goes back to an earlier step. */
function dropAfter(s: ImportSession, to: WizardStep): ImportSession {
  const at = stepIndex(to);
  const next = { ...s, step: to, error: null };
  if (at < stepIndex('scale')) next.scale = { ...next.scale, decision: null };
  if (at < stepIndex('sheet')) next.sheet = null;
  if (at < stepIndex('sizes')) {
    next.chains = null;
    next.sizes = null;
  }
  if (at < stepIndex('pieces')) next.pieces = null;
  if (at < stepIndex('meaning')) {
    next.names = [];
    next.semantics = null;
  }
  if (at < stepIndex('fabrics')) next.fabrics = null;
  if (at < stepIndex('check')) {
    next.draft = null;
    next.gate = {};
  }
  return next;
}

/** What extract said besides the contract's session fields (warnings, DXF fast path, scans). */
export type ExtractInfo = Pick<
  StageIO['extract']['out'],
  'warnings' | 'presegmented' | 'calibrations'
>;
const NO_EXTRACT: ExtractInfo = { warnings: [] };

/** A best scale candidate the operator does not need to look at (DXF with declared units). */
const certainScale = (c: StageIO['extract']['out']['scale'][number] | undefined) =>
  !!c && c.confidence >= 0.9 && Math.abs(c.factor - 1) <= PATIMPORT.scaleWarnRatio;

export type ApplyState =
  | { phase: 'idle' }
  | { phase: 'running'; progress: Record<string, ApplyProgress['state']> }
  | { phase: 'done'; result: ApplyResult; progress: Record<string, ApplyProgress['state']> };

export function useImportSession(deps: {
  client: ImportClient;
  card: CardContext;
  namer: NameSuggester;
  buildDraft: DraftBuilder;
  applyDraft: ApplyDraftFn;
}) {
  const { client, card, namer, buildDraft, applyDraft } = deps;
  const [session, setSession] = useState<ImportSession>(EMPTY_SESSION);
  const [inputs, setInputs] = useState<Inputs>(EMPTY_INPUTS);
  const [apply, setApply] = useState<ApplyState>({ phase: 'idle' });
  /**
   * MF-C (M4): per scope, what to do with the previous import's sheet the draft found
   * (`DraftScope.replaces`). Absent = 'replace', the default. Read at apply time.
   */
  const [sheetModes, setSheetModes] = useState<Record<string, 'replace' | 'add'>>({});
  const modesRef = useRef(sheetModes);
  modesRef.current = sheetModes;
  const [extracted, setExtracted] = useState<ExtractInfo>(NO_EXTRACT);
  const [errorCode, setErrorCode] = useState<ImportErrorCode | null>(null);
  /** The latest Set-of-Mark render (what the AI was shown), kept to draw it on the details step. */
  const [som, setSom] = useState<StageIO['render-som']['out'] | null>(null);
  /**
   * Something the operator should know that is not a failure of the run — the AI namer could not
   * be reached (not logged in, offline): the pieces are named by hand instead.
   */
  const [notice, setNotice] = useState<string | null>(null);
  const exRef = useRef(extracted);
  exRef.current = extracted;
  // Text seeds of the FIRST pieces run (all models visible): click seeds are appended to these,
  // because `pieces.in.seeds` replaces the whole list (no 'add' edit kind in the contract).
  const baseSeeds = useRef<Seed[] | null>(null);
  /**
   * The names on screen when the operator last went back past details (`dropAfter` clears them):
   * a name confirmed for a piece that did not move comes back as it was confirmed, not re-asked
   * of the AI (S3). A piece that moved lost its confirmation when the answers settled.
   */
  const heldNames = useRef<NameDecision[]>([]);
  const sRef = useRef(session);
  sRef.current = session;
  const iRef = useRef(inputs);
  iRef.current = inputs;

  // The ref follows every patch at once: transitions read `sRef.current` between awaits, before
  // React re-renders (a stale ref put a finished stage's `busy` back with `dropAfter`).
  const patch = useCallback((p: Partial<ImportSession>) => {
    sRef.current = { ...sRef.current, ...p };
    setSession((s) => ({ ...s, ...p }));
  }, []);
  const patchInputs = useCallback(
    (p: Partial<Inputs> | ((i: Inputs) => Partial<Inputs>)) =>
      setInputs((i) => ({ ...i, ...(typeof p === 'function' ? p(i) : p) })),
    [],
  );

  // Close the worker session — and end the worker — when the wizard unmounts.
  useEffect(
    () => () => {
      const id = sRef.current.sessionId;
      if (id != null) void client.close(id);
      client.dispose?.();
    },
    [client],
  );

  async function run<S extends StageName>(stage: S, input: StageIO[S]['in']) {
    const id = sRef.current.sessionId;
    if (id == null) throw new Error('no session — read the files first');
    patch({ busy: { stage, done: 0, total: 1 }, error: null });
    setErrorCode(null);
    failureRef.current = null;
    try {
      return await client.run(id, stage, input, (p) =>
        patch({ busy: { stage, done: p.done, total: p.total, note: p.note } }),
      );
    } finally {
      patch({ busy: null });
    }
  }

  /** The last failure, kept for the error report (M5): which stage, which code, what it said. */
  const failureRef = useRef<{
    stage: StageName | null;
    code: ImportErrorCode | null;
    message: string;
  } | null>(null);

  const fail = (e: unknown) => {
    const message = e instanceof Error ? e.message : String(e);
    const code = importErrorCode(e);
    failureRef.current = {
      stage:
        e instanceof ImportWorkerError
          ? e.stage ?? sRef.current.busy?.stage ?? null
          : sRef.current.busy?.stage ?? null,
      code,
      message,
    };
    setErrorCode(code);
    const id = sRef.current.sessionId;
    // The worker was restarted (a stage that would not stop, a crash): its session is gone, so
    // the run starts over from the files — still staged on the files step.
    if (id != null && client.alive && !client.alive(id)) {
      baseSeeds.current = null;
      setSom(null);
      setApply({ phase: 'idle' });
      setExtracted(NO_EXTRACT);
      const next = {
        ...EMPTY_SESSION,
        error: /read the files again/.test(message) ? message : `${message} — read the files again`,
      };
      sRef.current = next;
      setSession(next);
      return;
    }
    patch({ busy: null, error: message });
  };

  // ── derived inputs ───────────────────────────────────────────────────────────────────────
  const scaleDecision = (i: Inputs = iRef.current): ScaleDecision | null => {
    const c = sRef.current.scale.candidates[i.scaleIndex];
    if (!c) return null;
    if (i.manualMeasuredMm && c.declaredMm)
      return {
        factor: c.declaredMm / i.manualMeasuredMm,
        method: 'manual',
        operatorConfirmed: true,
      };
    return { factor: c.factor, method: c.method, operatorConfirmed: i.scaleConfirmed };
  };

  const piecesInput = (i: Inputs = iRef.current): StageIO['pieces']['in'] => ({
    seeds:
      i.clickSeeds.length && baseSeeds.current
        ? [...baseSeeds.current, ...i.clickSeeds]
        : undefined,
    edits: i.edits,
    opts: {
      cellMm: PATIMPORT.fillCellMm,
      snapMm: PATIMPORT.snapMm,
      variant: i.variant,
      // H1: the fill refuses graded pieces it cannot prove against this count
      ...(sRef.current.sizes?.expected ? { expectedSizes: sRef.current.sizes.expected } : {}),
    },
  });

  /** S3: the fingerprint of what is on screen now — the sheet, its grid, the model, the pieces. */
  const answersNow = (s: ImportSession = sRef.current, i: Inputs = iRef.current): AnswerCtx =>
    answerCtxOf(
      { sheetIndex: i.sheetIndex, gridOverride: i.gridOverride, variant: s.variant },
      s.pieces?.families,
    );
  /** S3: after the pieces changed, drop the answers whose question moved and re-stamp the rest. */
  const settleToPieces = () => {
    const now = answersNow();
    iRef.current = settleAnswers(iRef.current, now);
    setInputs((i) => settleAnswers(i, now));
  };

  // Only LIVE answers reach semantics (S3): one given on another sheet, model or outline is not one.
  const semanticsInput = (raw: Inputs = iRef.current): StageIO['semantics']['in'] => {
    const i = liveAnswers(raw, answersNow(sRef.current, raw));
    return semanticsInputOf(i);
  };
  const semanticsInputOf = (i: Inputs): StageIO['semantics']['in'] => ({
    fileAllowance: i.fileAllowance ?? {
      meaning: 'seam',
      allowanceMm: PATIMPORT.defaultAllowanceMm,
      origin: 'default',
      evidence: [],
    },
    pieceOverrides: i.overrides,
    operatorGrain: i.operatorGrain,
    aiQuantity: aiQuantityOf(sRef.current.names, i.editedNames),
    operatorFold: i.operatorFold,
    foldListChecked: i.foldListChecked,
    // the AI read "on fold" off the drawing (the sheet's words may be curves): asked, not unfolded
    foldHints: sRef.current.names.filter((n) => n.suggestion?.onFold).map((n) => n.seed),
  });

  // ── events (08-CONTRACT WizardEvent) ─────────────────────────────────────────────────────
  async function dispatch(ev: WizardEvent): Promise<void> {
    try {
      switch (ev.type) {
        case 'files': {
          patchInputs({ ...EMPTY_INPUTS, fileList: ev.files });
          baseSeeds.current = null;
          heldNames.current = [];
          setSom(null);
          setExtracted(NO_EXTRACT);
          const old = sRef.current.sessionId;
          if (old != null) await client.close(old);
          // M6: too many files / bytes are refused before a single byte is read.
          checkFilesBeforeReading(ev.files);
          setSession({ ...EMPTY_SESSION, busy: { stage: 'extract', done: 0, total: 1 } });
          const bytes = await Promise.all(
            ev.files.map(async (f) => ({ name: f.name, bytes: await f.arrayBuffer() })),
          );
          const opened = await client.open(bytes);
          patch({ sessionId: opened.sessionId, files: opened.files });
          sRef.current = { ...sRef.current, sessionId: opened.sessionId };
          const out = await run('extract', {
            opts: { sagittaMm: PATIMPORT.sagittaMm, keepFills: true },
          });
          // The best candidate is preselected; the operator confirms on the scale step.
          const best = out.scale.reduce(
            (b, c, i) => (c.confidence > out.scale[b].confidence ? i : b),
            0,
          );
          patchInputs({ scaleIndex: best });
          setExtracted({
            warnings: out.warnings,
            presegmented: out.presegmented,
            calibrations: out.calibrations,
          });
          exRef.current = {
            warnings: out.warnings,
            presegmented: out.presegmented,
            calibrations: out.calibrations,
          };
          patch({
            files: out.files,
            pages: out.pages,
            scale: { candidates: out.scale, decision: null },
          });
          return;
        }
        case 'scale': {
          await run('scale', { decision: ev.decision });
          patch({ scale: { ...sRef.current.scale, decision: ev.decision } });
          if (exRef.current.presegmented) return await fastPath();
          const out = await run('assemble', {
            sheet: iRef.current.sheetIndex,
            override: iRef.current.gridOverride,
          });
          patch({ sheet: out, step: 'sheet' });
          return;
        }
        case 'sheet': {
          // S3: another sheet of the file is another drawing — its legend, size map, model, seeds
          // and piece edits are asked again; the first pieces run shows every model on it again.
          // (Answers on the pieces are settled against the new sheet after its pieces run.)
          const other = ev.sheet !== iRef.current.sheetIndex;
          const sheetInputs: Partial<Inputs> = other
            ? {
                legend: [],
                legendConfirmed: [],
                sizeMap: null,
                drawnSizes: null,
                variant: null,
                clickSeeds: [],
                edits: [],
              }
            : {};
          if (other) {
            baseSeeds.current = null;
            heldNames.current = [];
          }
          patchInputs({
            gridOverride: ev.override,
            sheetIndex: ev.sheet,
            residualsAccepted: false,
            ...sheetInputs,
          });
          iRef.current = {
            ...iRef.current,
            gridOverride: ev.override,
            sheetIndex: ev.sheet,
            ...sheetInputs,
          };
          const out = await run('assemble', { sheet: ev.sheet, override: ev.override });
          patch(dropAfter({ ...sRef.current, sheet: out }, 'sheet'));
          return;
        }
        case 'legend': {
          patchInputs({ legend: ev.edits });
          const chains = await run('chains', {
            opts: chainOpts(),
            legend: ev.edits,
          });
          const sizes = await run('sizes', {
            card: card.sizes,
            drawnSizes: iRef.current.drawnSizes ?? undefined,
          });
          patchInputs({ sizeMap: null });
          patch({ chains, sizes });
          return;
        }
        case 'size-map': {
          patchInputs({ sizeMap: ev.entries });
          const sizes = await run('sizes', {
            card: card.sizes,
            operatorMap: ev.entries,
            drawnSizes: iRef.current.drawnSizes ?? undefined,
          });
          patch({ sizes });
          return;
        }
        case 'drawn-sizes': {
          // H1: how many sizes the sheet draws re-reads the run; the operator's map starts over
          patchInputs({ drawnSizes: ev.n, sizeMap: null });
          iRef.current = { ...iRef.current, drawnSizes: ev.n, sizeMap: null };
          const sizes = await run('sizes', { card: card.sizes, drawnSizes: ev.n ?? undefined });
          patch({ sizes });
          return;
        }
        case 'variant': {
          patchInputs({ variant: ev.variant });
          iRef.current = { ...iRef.current, variant: ev.variant };
          const out = await run('pieces', piecesInput(iRef.current));
          patch({ pieces: out, variant: ev.variant });
          settleToPieces();
          return;
        }
        case 'piece-edits': {
          const next = { ...iRef.current, edits: ev.edits };
          patchInputs({ edits: ev.edits });
          const out = await run('pieces', piecesInput(next));
          patch({ pieces: out });
          settleToPieces();
          return;
        }
        case 'names': {
          // Names travel to the writer through the semantics overrides (I1): display name,
          // nameOrigin (incl. 'ai-auto') and aiConfidence end up in PieceSpec and the manifest.
          patch({ names: ev.decisions });
          const overrides = overridesFromNames(ev.decisions, iRef.current.overrides);
          const next = { ...iRef.current, overrides };
          iRef.current = next;
          patchInputs({ overrides });
          if (sRef.current.semantics) {
            const out = await run('semantics', semanticsInput(next));
            patch({ semantics: out });
          }
          return;
        }
        case 'semantics': {
          patchInputs({
            fileAllowance: ev.input.fileAllowance,
            overrides: ev.input.pieceOverrides,
            operatorGrain: ev.input.operatorGrain,
            operatorFold: ev.input.operatorFold ?? iRef.current.operatorFold,
            foldListChecked: ev.input.foldListChecked ?? iRef.current.foldListChecked,
          });
          const out = await run('semantics', ev.input);
          patch({ semantics: out });
          return;
        }
        case 'fabrics':
          patchInputs({ assignment: ev.assignment });
          patch({ fabrics: ev.assignment });
          return;
        case 'write': {
          const a = sRef.current.fabrics;
          const sizes = sRef.current.sizes;
          let sem = sRef.current.semantics;
          if (!a || !sizes || !sem) return;
          // `fused` is decided on the fabrics step (interlining not in BOM → the flag, decision 14)
          // but is a PieceSpec field: hand it to semantics as an override, so the manifest, the
          // draft and the card read the same flag.
          const fused = fusedSeeds(a, card.scopes);
          if (sem.pieces.some((p) => p.fused !== fused.has(p.seed))) {
            const overrides = { ...iRef.current.overrides };
            for (const sd of new Set(sem.pieces.map((p) => p.seed)))
              overrides[sd] = { ...(overrides[sd] ?? {}), fused: fused.has(sd) };
            const next = { ...iRef.current, overrides };
            iRef.current = next;
            patchInputs({ overrides });
          }
          // S3: the write does not trust what the details step showed. Semantics runs again on the
          // LIVE answers only (the worker writes from its last run), and every question it still
          // asks — folds, the cutting list, the outline, counts, names — refuses the write.
          sem = await run('semantics', semanticsInput(iRef.current));
          patch({ semantics: sem });
          const open = unansweredAtWrite(sem, sRef.current.names, iRef.current, answersNow());
          if (open.length) throw new UnansweredQuestionsError(open);
          const out = await run('write', {
            scopes: card.scopes,
            assignment: a,
            sizes: sizes.map.entries.flatMap((e) =>
              e.card
                ? [
                    {
                      token: e.card.token,
                      sizeId: e.card.sizeId,
                      name: e.card.name,
                      sourceLabel: e.source.label,
                      rank: e.source.rank,
                    },
                  ]
                : [],
            ),
            dialect: 'r12',
            generator: `grbpwr-admin pattern-import (${client.kind})`,
          });
          const draft = buildDraft(out, { card, semantics: sem });
          patch({ draft, gate: out.gate, step: 'check' });
          return;
        }
        case 'apply': {
          const built = sRef.current.draft;
          // a download-only run has no BOM line to bind a file to: nothing is applied
          if (!built || card.downloadOnly) return;
          // The operator's replace/add answer rides on the draft the card receives (MF-C, M4).
          const draft = {
            ...built,
            scopes: built.scopes.map((sc) =>
              sc.replaces
                ? { ...sc, sheetMode: modesRef.current[sc.target.scopeKey] ?? 'replace' }
                : sc,
            ),
          };
          const progress: Record<string, ApplyProgress['state']> = {};
          setApply({ phase: 'running', progress });
          const result = await applyDraft(draft, (p) => {
            progress[p.scopeKey] = p.state;
            setApply({ phase: 'running', progress: { ...progress } });
          });
          // the apply step's "download report" carries what the card refused (M5)
          if (!result.ok)
            failureRef.current = {
              stage: null,
              code: null,
              message: `apply: ${result.failedScope}: ${result.message}`,
            };
          setApply({ phase: 'done', result, progress: { ...progress } });
          return;
        }
        case 'download': {
          for (const d of sRef.current.draft?.downloads ?? []) downloadText(d.filename, d.dxfText);
          return;
        }
        case 'back':
          if (sRef.current.names.length) heldNames.current = sRef.current.names;
          setApply({ phase: 'idle' });
          setNotice(null);
          setErrorCode(null);
          patch(dropAfter(sRef.current, ev.to));
          return;
        case 'reset': {
          const old = sRef.current.sessionId;
          if (old != null) await client.close(old);
          baseSeeds.current = null;
          heldNames.current = [];
          setSom(null);
          setNotice(null);
          setExtracted(NO_EXTRACT);
          iRef.current = EMPTY_INPUTS;
          setInputs(EMPTY_INPUTS);
          setApply({ phase: 'idle' });
          setSession(EMPTY_SESSION);
          return;
        }
      }
    } catch (e) {
      fail(e);
    }
  }

  /**
   * pieces → details: the SoM render (worker), the AI names (main thread), then semantics. The
   * step moves to details as soon as the pieces are named, so a stage that is not built yet
   * (semantics, F5) fails ON the details step, where the operator can see what was found.
   */
  async function toDetails() {
    const fams = sRef.current.pieces?.families ?? [];
    // E3 (D3): a piece its DXF block names is named — never sent to the AI, so the AI cannot
    // outrank it; only unnamed / numeric / placeholder blocks are asked. Nothing to ask = no call.
    const plan = planNaming(
      fams,
      card.sizes.map((c) => c.token),
    );
    let names: NameDecision[] = [];
    let namerError: string | null = null;
    if (plan.ask.length) {
      const out = await run('render-som', { seeds: plan.ask, dpi: 72 });
      setSom(out);
      patch({ busy: { stage: 'render-som', done: 1, total: 2, note: 'asking the AI for names' } });
      try {
        names = await namer(out, { card, threshold: AI_AUTO_ACCEPT_T });
      } catch (e) {
        namerError = `AI names unavailable (${e instanceof Error ? e.message : String(e)}) — type the codes by hand`;
      }
    } else setSom(null);
    names = mergeNames(withAiNames(plan, names));
    patch({ busy: null, names, step: 'meaning' });
    const overrides = overridesFromNames(names, iRef.current.overrides);
    patchInputs({ overrides });
    iRef.current = { ...iRef.current, overrides };
    const sem = await run('semantics', semanticsInput({ ...iRef.current, overrides }));
    patch({ semantics: sem });
    setNotice(namerError);
  }

  /**
   * DXF fast path (F8): the blocks already are pieces × sizes, so assemble / chains / pieces are
   * answered from the segmentation and the wizard lands on details. The steps in between show as
   * passed; going back to one of them re-enters it with the DXF's own answers.
   */
  async function fastPath() {
    const sheet = await run('assemble', { sheet: 0 });
    patch({ sheet });
    const chains = await run('chains', { opts: chainOpts() });
    patch({ chains });
    // The DXF knows its sizes (block names); they are mapped to the card's run here, before any
    // block name is written (owner decision 6). Going back to "sizes" edits this map.
    const sizes = await run('sizes', {
      card: card.sizes,
      operatorMap: iRef.current.sizeMap ?? undefined,
      drawnSizes: iRef.current.drawnSizes ?? undefined,
    });
    patch({ sizes });
    const pieces = await run('pieces', piecesInput({ ...iRef.current, variant: null }));
    baseSeeds.current = pieces.seeds;
    patch({ pieces, variant: null });
    sRef.current = { ...sRef.current, sheet, chains, sizes, pieces };
    settleToPieces();
    // A guessed match, or a size the card does not carry, stops on the sizes step: the gate
    // refuses an exported size without a card id, so the operator answers it first.
    if (sizeMapOpen(sizes.map)) {
      patch({ step: 'sizes' });
      return;
    }
    await toDetails();
  }

  const chainOpts = () => ({
    joinGapMm: PATIMPORT.joinGapMm,
    joinAngleDeg: PATIMPORT.joinAngleDeg,
    joinLateralMm: PATIMPORT.joinLateralMm,
  });

  /** Seed names from the namer, keeping what the operator already decided for surviving seeds. */
  function mergeNames(fresh: NameDecision[]): NameDecision[] {
    const prev = new Map(
      [...heldNames.current, ...sRef.current.names].map((n) => [n.seed, n] as const),
    );
    // only LIVE confirmations (S3): a piece that moved since is a new question
    const kept = new Set(liveAnswers(iRef.current, answersNow()).confirmedNames);
    return fresh.map((n) => (kept.has(n.seed) && prev.get(n.seed) ? prev.get(n.seed)! : n));
  }

  /**
   * Every name as a semantics override, so the writer spells what the table shows AND the
   * manifest says where the name came from (owner decision 11: auto-accepted AI names stay flagged).
   * A DXF-named piece nobody typed over gets none: semantics reads its block, pair included (E3).
   */
  function overridesFromNames(names: NameDecision[], base: Inputs['overrides']) {
    return namesToOverrides(names, base, new Set(iRef.current.editedNames));
  }

  // ── forward transitions: run what the NEXT step shows, then move ────────────────────────
  async function next(): Promise<void> {
    const s = sRef.current;
    try {
      switch (s.step) {
        case 'files': {
          // A garment DXF with declared units has nothing to ask on the scale step: confirm it
          // and go straight to the pieces it already carries.
          const best = s.scale.candidates[iRef.current.scaleIndex];
          if (exRef.current.presegmented && certainScale(best)) {
            await dispatch({
              type: 'scale',
              decision: { factor: best.factor, method: best.method, operatorConfirmed: false },
            });
            return;
          }
          patch({ step: 'scale' });
          return;
        }
        case 'scale': {
          const d = scaleDecision();
          if (d) await dispatch({ type: 'scale', decision: d });
          return;
        }
        case 'sheet': {
          const chains = await run('chains', { opts: chainOpts(), legend: iRef.current.legend });
          const sizes = await run('sizes', {
            card: card.sizes,
            operatorMap: iRef.current.sizeMap ?? undefined,
            drawnSizes: iRef.current.drawnSizes ?? undefined,
          });
          patch({ chains, sizes, step: 'sizes' });
          return;
        }
        case 'sizes': {
          // The first run shows every model on the sheet: the variant is picked on the pieces step.
          const first = !baseSeeds.current;
          const out = await run(
            'pieces',
            piecesInput(first ? { ...iRef.current, variant: null } : iRef.current),
          );
          if (first) baseSeeds.current = out.seeds;
          patch({ pieces: out, variant: first ? null : iRef.current.variant, step: 'pieces' });
          settleToPieces();
          return;
        }
        case 'pieces':
          await toDetails();
          return;
        case 'meaning': {
          setNotice(null);
          // The AI's fabric calls ride along; the worker uses them only where the sheet is silent,
          // only for names auto-accepted at T and never for a name the operator typed (C7).
          const aiHints = aiFabricHintsOf(s.names, iRef.current.editedNames);
          const out = await run('fabrics', { bom: card.scopes, aiHints });
          // An assignment the operator already edited survives a round trip through `back`.
          const a = iRef.current.assignment ?? out;
          patch({ fabrics: a, step: 'fabrics' });
          return;
        }
        case 'fabrics':
          await dispatch({ type: 'write' });
          return;
        case 'check':
          patch({ step: 'apply' });
          return;
        default:
          return;
      }
    } catch (e) {
      fail(e);
    }
  }

  const sizeTokens = useMemo(
    () => new Set(card.sizes.map((c) => c.token.toLowerCase())),
    [card.sizes],
  );

  // ── what blocks "next" — said in words, in the footer, before the click ─────────────────
  const blocker = useMemo((): string | null => {
    const s = session;
    if (s.busy) return null;
    switch (s.step) {
      case 'files':
        if (!s.files.length) return 'drop the pattern files and read them';
        if (!s.scale.candidates.length) return 'the files are not read yet';
        return null;
      case 'scale': {
        const c = s.scale.candidates[inputs.scaleIndex];
        if (!c) return 'pick how the scale is known';
        const d = scaleDecision(inputs);
        const off = d ? Math.abs(d.factor - 1) : 0;
        const sides = squareSidesOf(c.evidence?.text);
        const needsHuman =
          c.confidence < 0.9 ||
          off > PATIMPORT.scaleWarnRatio ||
          (!!sides && anisotropyOf(sides) > PATIMPORT.scaleWarnRatio);
        if (needsHuman && !inputs.scaleConfirmed && !inputs.manualMeasuredMm)
          return sides && anisotropyOf(sides) > PATIMPORT.scaleWarnRatio
            ? 'the test square is not square in the file — measure it on paper or confirm'
            : 'confirm the scale — the detection is not certain';
        return null;
      }
      case 'sheet': {
        const miss = s.sheet?.sheet.missing.length ?? 0;
        if (miss) return `${miss} pages are missing — set the grid by hand`;
        const worst = Math.max(0, ...(s.sheet?.sheet.poses.map((p) => p.residualMm) ?? [0]));
        if (worst > PATIMPORT.registrationMaxResidualMm && !inputs.residualsAccepted)
          return `tiles do not close: ${worst.toFixed(2)} mm > ${PATIMPORT.registrationMaxResidualMm} mm — check the seams, then accept or set the grid`;
        return null;
      }
      case 'sizes': {
        if (!card.sizes.length) return 'the card has no size range — set it on the card first';
        const pending = (s.chains?.classes ?? []).filter(
          (c) => c.confidence < 0.6 && !inputs.legendConfirmed.includes(c.id),
        );
        if (pending.length)
          return `${pending.length} legend ${pending.length === 1 ? 'row' : 'rows'} to confirm`;
        const entries = s.sizes?.map.entries ?? [];
        if (!entries.some((e) => e.card)) return 'map at least one size to the card';
        const ids = entries.flatMap((e) => (e.card ? [e.card.sizeId] : []));
        if (new Set(ids).size !== ids.length) return 'two source sizes point at one card size';
        const guesses = guessedSizes(entries);
        if (guesses.length)
          return `${guesses.length} size ${guesses.length === 1 ? 'match is a guess' : 'matches are guesses'} — confirm or change ${guesses.length === 1 ? 'it' : 'them'}`;
        return null;
      }
      case 'pieces': {
        const fams = s.pieces?.families ?? [];
        const variants = variantsOf(s.pieces?.seeds ?? [], baseSeeds.current, s.pieces?.variants);
        if (variants.length > 1 && !s.variant) return 'pick the model — one run imports one model';
        // Only the sizes that are exported must close: an unmapped size is never written.
        const mapped = exportedRanks(s.sizes?.map);
        const open = fams.filter((f) =>
          f.candidates.some((c) => (!mapped || mapped.has(c.rank)) && c.outcome !== 'closed'),
        );
        if (!fams.length) return 'no pieces — click inside a piece to seed it';
        // H1: a region whose sizes were held back has no gap to close — say why instead
        const held = open.filter((f) =>
          f.candidates.some((c) => (!mapped || mapped.has(c.rank)) && c.outcome === 'refused'),
        );
        if (held.length) {
          const why = held
            .flatMap((f) => f.candidates)
            .find((c) => c.outcome === 'refused')?.gradeRefusal;
          return `${held.length} ${held.length === 1 ? 'region has' : 'regions have'} sizes held back — ${
            why === 'size-count'
              ? 'answer how many sizes the sheet draws on the sizes step'
              : why === 'grade-ambiguous'
                ? 'two size layouts fit the lines equally well'
                : 'the sizes are drawn alike and nothing proves which line is which'
          }; trace them by hand or mark "not a piece"`;
        }
        if (open.length)
          return `${open.length} ${open.length === 1 ? 'region needs' : 'regions need'} a fix — close the gap, split, or mark "not a piece"`;
        return null;
      }
      case 'meaning': {
        if (!s.semantics) return 'piece details are not built yet';
        const blocked = s.semantics.blocked;
        if (blocked.length) {
          const grain = blocked.filter((b) => b.reason === 'no-grain').length;
          const fold = blocked.filter((b) => b.reason === 'fold-question').length;
          return grain
            ? `${grain} ${grain === 1 ? 'piece has' : 'pieces have'} no grainline — draw it (two clicks)`
            : fold
              ? `${fold} fold ${fold === 1 ? 'question' : 'questions'}: pick the fold edge or "not a fold"`
              : `${blocked.length} ${blocked.length === 1 ? 'piece is' : 'pieces are'} blocked`;
        }
        if (s.semantics.foldList)
          return 'the cutting list names fold pieces the sheet does not mark: mark them or confirm the list';
        // D3: what the drawing does not prove waits for the operator, like the grainline; a DXF
        // block name (E3) is the file's own word and is never in it (openQuestions)
        const open = openQuestions(s.semantics, s.names, inputs, answersNow(s, inputs));
        if (open.allowance.length || open.total)
          return [
            open.allowance.length ? 'say what the drawn outline is (cut or seam line)' : '',
            open.total ? `confirm ${countWords(open)} — or "confirm all as shown"` : '',
          ]
            .filter(Boolean)
            .join(' · ');
        // The identities the writer will spell (both hands of a declared pair), checked with the
        // gate's own rule — a declared `_L`/`_R` is exempt from "ends in a size token".
        const isSizeToken = sizeTokenTest(sizeTokens);
        const edited = new Set(inputs.editedNames);
        for (const n of s.names) {
          if (!exportedSeed(n.seed)) continue;
          // The dictionary binds the MODEL (D2: SL not SLV, the D2 codes; F9 enforces the same list
          // server-side); a code the operator typed is theirs — base codes are suggestions, not a
          // closed list.
          const origin = nameOriginOf(n, edited.has(n.seed));
          const known = origin === 'ai' || origin === 'ai-auto' ? isKnownCode : undefined;
          const hand =
            inputs.overrides[n.seed]?.pairHand !== undefined
              ? inputs.overrides[n.seed]!.pairHand!
              : s.semantics?.pieces.find((p) => p.seed === n.seed)?.pairHand ?? null;
          for (const w of identitiesOf(n.code, n.mods, hand)) {
            const why = identityProblem(w.identity, {
              isSizeToken,
              pair: { hand: w.pairHand, of: w.pairOf },
              isKnownCode: known,
            });
            if (why) return `${w.identity || 'a code'}: ${why}`;
          }
        }
        return null;
      }
      case 'fabrics': {
        const a = s.fabrics;
        if (!a) return 'fabrics are not proposed yet';
        if (!card.scopes.length) return 'the BOM has no fabric lines — add them on the BOM tab';
        // C7: a cloth other than main on the AI's word alone is the operator's call
        const ai = (a.aiOnly ?? []).filter((x) => x.needsConfirm).length;
        if (ai)
          return `${ai} ${ai === 1 ? 'piece is' : 'pieces are'} cut from lining, interlining or another cloth on the AI's word alone — confirm or change the ticks`;
        // The same planner the write stage cuts the files with: what blocks here blocks there.
        const problem = planScopes(s.semantics?.pieces ?? [], a, card.scopes).problems[0];
        return problem ? problem.message : null;
      }
      case 'check': {
        const failing = Object.values(s.gate).flatMap((g) =>
          g.checks.filter((c) => !c.ok && c.severity === 'block'),
        );
        if (failing.length)
          return `${failing.length} blocking ${failing.length === 1 ? 'check' : 'checks'}`;
        return null;
      }
      default:
        return null;
    }
    // exportedSeed/sizeTokens are derived from session/card on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, inputs, card]);

  /** A click seed: appended to the first run's text seeds (the contract has no 'add' edit). */
  async function addSeed(at: PtMm) {
    try {
      const i = iRef.current;
      const all = [...(baseSeeds.current ?? []), ...i.clickSeeds];
      const id = Math.max(0, ...all.map((s) => s.id)) + 1;
      const seed: Seed = { id, at, origin: 'click', variant: i.variant };
      const next = { ...i, clickSeeds: [...i.clickSeeds, seed] };
      iRef.current = next;
      patchInputs({ clickSeeds: next.clickSeeds });
      const out = await run('pieces', piecesInput(next));
      patch({ pieces: out });
      settleToPieces();
      return id;
    } catch (e) {
      fail(e);
      return null;
    }
  }

  /** The operator TYPED a code or display name: it is theirs now (nameOrigin 'operator'). */
  async function editName(
    seed: SeedId,
    p: Partial<Pick<NameDecision, 'code' | 'mods' | 'displayName'>>,
  ) {
    const i = iRef.current;
    // C7: the AI's fabric call was for the AI's name — an edited name drops it, and an assignment
    // the operator already kept is proposed again without it
    const staleFabric = !!i.assignment?.aiOnly?.some((x) => x.seed === seed);
    const next = {
      ...i,
      editedNames: [...new Set([...i.editedNames, seed])],
      confirmedNames: [...new Set([...i.confirmedNames, seed])],
      ...(staleFabric ? { assignment: null } : {}),
    };
    iRef.current = next;
    patchInputs({
      editedNames: next.editedNames,
      confirmedNames: next.confirmedNames,
      ...(staleFabric ? { assignment: null } : {}),
    });
    const names = sRef.current.names;
    // A piece nobody named yet (no AI answer — not logged in, or the AI is off) gets its first
    // name from what the operator typed, on top of what the sheet text gave the spec.
    const decisions = names.some((n) => n.seed === seed)
      ? names.map((n) => (n.seed === seed ? { ...n, ...p } : n))
      : [...names, { ...textNameOf(seed, sRef.current.semantics, i.overrides[seed]), ...p }];
    await dispatch({ type: 'names', decisions });
  }

  /** The operator accepted an automatic size match as it is. */
  async function confirmSize(rank: number) {
    const entries = sRef.current.sizes?.map.entries ?? [];
    const own = (iRef.current.sizeMap ?? []).filter((e) => e.source.rank !== rank);
    const hit = entries.find((e) => e.source.rank === rank);
    if (!hit) return;
    await dispatch({ type: 'size-map', entries: [...own, { ...hit, origin: 'operator' }] });
  }

  /** The operator set a source size's card size (null = not exported). */
  async function setSize(rank: number, cardSize: CardSize | null) {
    const entries = sRef.current.sizes?.map.entries ?? [];
    const own = (iRef.current.sizeMap ?? []).filter((e) => e.source.rank !== rank);
    const hit = entries.find((e) => e.source.rank === rank);
    if (!hit) return;
    await dispatch({
      type: 'size-map',
      entries: [...own, { ...hit, card: cardSize, origin: 'operator' }],
    });
  }

  /** Append (or, with `undo`, drop the last) piece edit and re-run the fill. */
  async function editPieces(e: PieceEdit | 'undo') {
    const cur = iRef.current.edits;
    const edits = e === 'undo' ? cur.slice(0, -1) : [...cur, e];
    iRef.current = { ...iRef.current, edits };
    await dispatch({ type: 'piece-edits', edits });
  }

  function exportedSeed(seed: SeedId) {
    return (session.semantics?.pieces ?? []).some((p) => p.seed === seed);
  }

  /**
   * D3 "confirm as shown": every open quantity, sheet-note name and AI name below the threshold —
   * of one piece (`seed`), or of the whole step. The outline question is never in it: that one is
   * answered explicitly (`answerOutline`).
   */
  function confirmShown(seed?: SeedId) {
    const now = answersNow();
    const open = openQuestions(sRef.current.semantics, sRef.current.names, iRef.current, now);
    const mine = <T extends { seed: SeedId }>(xs: T[]) =>
      seed == null ? xs : xs.filter((x) => x.seed === seed);
    const qty = mine(open.quantity);
    const names = [...mine(open.name).map((u) => u.seed), ...mine(open.aiNames).map((n) => n.seed)];
    patchInputs((i) => {
      const next = {
        confirmedQuantities: {
          ...i.confirmedQuantities,
          ...Object.fromEntries(qty.map((u) => [u.seed, questionKey(u, now)])),
        },
        confirmedNames: [...new Set([...i.confirmedNames, ...names])],
      };
      iRef.current = { ...i, ...next };
      return next;
    });
  }

  /** D3: the operator's explicit answer to "what is the drawn outline" for the file. */
  async function answerOutline(meaning: 'cut' | 'seam', allowanceMm: number) {
    const fileAllowance: AllowanceDecision = {
      meaning,
      allowanceMm,
      origin: 'operator',
      evidence: [],
    };
    const next = { ...iRef.current, fileAllowance };
    iRef.current = next;
    await dispatch({ type: 'semantics', input: semanticsInput(next) });
  }

  return {
    session,
    inputs,
    apply,
    sheetModes,
    setSheetMode: (scopeKey: string, mode: 'replace' | 'add') =>
      setSheetModes((m) => ({ ...m, [scopeKey]: mode })),
    extracted,
    errorCode,
    notice,
    som,
    clientKind: client.kind,
    blocker,
    /** S3: the fingerprint answers are read against (pass to `openQuestions`). */
    answersNow: answersNow(session, inputs),
    sizeTokens,
    baseSeeds: baseSeeds.current,
    dispatch,
    next,
    addSeed,
    editPieces,
    editName,
    confirmSize,
    setSize,
    setDrawnSizes: (n: number | null) => dispatch({ type: 'drawn-sizes', n }),
    confirmShown,
    answerOutline,
    patchInputs,
    scaleDecision: () => scaleDecision(inputs),
    piecesInput,
    semanticsInput,
    cancel: () => client.cancel(),
    errorReport,
    downloadReport: () => downloadErrorReport(errorReport()),
  };

  /** M5: everything needed to reproduce this run without the files (no file contents). */
  function errorReport(): ErrorReport {
    const c = client as ImportClient & {
      log?: { events: readonly ImportLogEvent[] };
      heapMb?: number | null;
      peakHeapMb?: number | null;
    };
    const { fileList, ...rest } = iRef.current;
    return buildErrorReport({
      session: sRef.current,
      operator: {
        files: fileList.map((f) => ({ name: f.name, bytes: f.size, type: f.type })),
        ...rest,
      },
      failure: failureRef.current ?? undefined,
      extract: exRef.current,
      generator: `grbpwr-admin pattern-import (${client.kind})`,
      log: c.log?.events,
      heapMb: c.heapMb ?? null,
      peakHeapMb: c.peakHeapMb ?? null,
    });
  }
}

export type ImportSessionApi = ReturnType<typeof useImportSession>;

/** Where a name came from, as the manifest records it (lib: ai/dxf-names.ts). */
export { nameOriginOf };

/** Auto matches below the confirm line (F5: < 0.9) that the operator has not answered. */
export const guessedSizes = (entries: readonly SizeMapEntry[]) =>
  entries.filter((e) => e.origin === 'auto' && !!e.card && (e.confidence ?? 1) < 0.9);

/** The map still has a question: a guess, or no size reaching the card at all. */
const sizeMapOpen = (map: SizeMap) =>
  guessedSizes(map.entries).length > 0 || !map.entries.some((e) => e.card);

/** Source ranks written to the card (null = no map yet: every rank counts). */
export function exportedRanks(map: SizeMap | undefined): Set<number> | null {
  if (!map) return null;
  return new Set(map.entries.flatMap((e) => (e.card ? [e.source.rank] : [])));
}

/**
 * A name decision for a piece the namer said nothing about: what the operator already typed (kept
 * in the semantics overrides across `back`), else what semantics read off the sheet, else empty.
 */
export function textNameOf(
  seed: SeedId,
  sem: ImportSession['semantics'],
  override?: PieceOverride,
): NameDecision {
  const spec = sem?.pieces.find((p) => p.seed === seed);
  const hand = override?.pairHand ?? spec?.pairHand ?? null;
  return {
    seed,
    suggestion: null,
    source: 'text',
    evidence: [],
    confidence: 1,
    autoAccepted: false,
    code: override?.code ?? spec?.code ?? '',
    mods: (override?.code ? override.mods ?? [] : spec?.mods ?? []).filter(
      (m) => !(hand && m === hand),
    ),
    displayName: override?.displayName ?? spec?.displayName ?? '',
  };
}

/** D3 open questions, read through the live answers (S3, answers.ts). */
export { countWords, openQuestions, UnansweredQuestionsError } from './answers';

/**
 * D3: the count an AI name auto-accepted at T backs with the sheet's own "cut n" (`cut-qty`
 * evidence) is the sheet's word. A model call without that evidence, or a name the operator typed
 * over, proves nothing.
 */
function aiQuantityOf(
  names: readonly NameDecision[],
  edited: readonly SeedId[],
): StageIO['semantics']['in']['aiQuantity'] {
  const out: NonNullable<StageIO['semantics']['in']['aiQuantity']> = {};
  for (const n of names) {
    const s = n.suggestion;
    if (!n.autoAccepted || !s || s.cutQty == null || edited.includes(n.seed)) continue;
    if (!n.evidence.some((e) => e.kind === 'cut-qty' && e.qty === s.cutQty)) continue;
    out[n.seed] = { qty: s.cutQty, pair: s.pair };
  }
  return out;
}

/** The models to choose from: the seeds' own, plus the ones the sheet names (pieces out). */
export function variantsOf(
  seeds: Seed[],
  base: Seed[] | null,
  named: readonly string[] = [],
): string[] {
  return [
    ...new Set([
      ...[...(base ?? []), ...seeds].flatMap((s) => (s.variant ? [s.variant] : [])),
      ...named,
    ]),
  ].sort();
}

function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/dxf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
