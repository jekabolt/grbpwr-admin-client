// The wizard's state machine (08-CONTRACT §4.2). One session per run; every field of
// `ImportSession` is the latest stage output, and `inputs` are what the operator decided — kept
// across `back`, so re-entering a step re-runs it with the previous answers (contract: "back{to}
// re-enters a step with its previous inputs; outputs after it are dropped").
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AiPageHint,
  AllowanceDecision,
  ApplyResult,
  AutopilotRecord,
  ReplayRecord,
  CardSize,
  ImportErrorCode,
  ChainAssign,
  ChainRole,
  ClassId,
  FabricAssignment,
  GradeAnswer,
  GridOverride,
  ImportSession,
  NameDecision,
  PageMaskEdit,
  PieceEdit,
  PtMm,
  ScaleDecision,
  Seed,
  SetAside,
  SeedId,
  SizeMap,
  SizeMapEntry,
  StageIO,
  StageName,
  WizardEvent,
  WizardStep,
  WriteStorage,
  SheetAcceptMissing,
  SheetAnswer,
} from 'lib/pattern-import/types';
import { heldCells, holePagesKey } from 'lib/pattern-import/assemble/holes';
import { AI_AUTO_ACCEPT_T } from 'lib/pattern-import/ai/threshold';
import {
  classifyFilePages,
  pagesForCall,
  thumbPxFor,
  type PageRoleDeps,
} from 'lib/pattern-import/ai/pages';
import {
  nameOriginOf,
  overridesFromNames as namesToOverrides,
  planNaming,
  withAiNames,
} from 'lib/pattern-import/ai/dxf-names';
import { isKnownCode } from 'lib/pattern-import/dictionary/codes';
import { PATIMPORT, shapeFixKey, type ShapeFixAction } from 'lib/pattern-import/types';
import { shapeIssueOf, shapeSeedOf, type ShapeMoveResult } from './shape-moves';
import { sheetLegendQuestion, sheetQuestion } from 'lib/pattern-import/pieces/sheets';
import {
  crossKindQuestion,
  drawnUnmapped,
  partialSizeMapQuestion,
} from 'lib/pattern-import/sizes/map';
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
import {
  asideDigests,
  scaleUncertain,
  stepOffer,
  weakAsides,
  type AutoResolver,
} from './auto-advance';
import { singlePageSheet } from './sheet-skip';
import {
  normWriteStorage,
  writeStorageFor,
  writeStorageInput,
  writtenTokens,
} from './write-storage';
import { driveTick, newDriveState, type DriveState, type DriveStopWhy } from './auto-drive';
import { autopilotRecordOf, mergeAssumptions, type Assumption } from './autopilot/types';
import { aiAsideAssumptions } from './autopilot/ai-pages';
import { answerRecordOf } from './autopilot/replay-record';
import {
  before,
  cloneInput,
  digestOf,
  nextStageOf,
  pruneAfter,
  RESTORE_STAGES,
  shownStage,
  type RestoreEntry,
} from './stop-restore';
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
import { fusedSeeds, pinToScope, planScopes } from 'lib/pattern-import/fabrics/scope';
import {
  answerCtxOf,
  legendRevOf,
  maskRevOf,
  bindDrawnToModel,
  countWords,
  drawnSizesKey,
  liveDrawnSizes,
  liveAnswers,
  openQuestions,
  questionKey,
  REV_SEP,
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

export type LegendEdit = {
  classId: ClassId;
  role: ChainRole;
  sizeLabel: string | null;
  /** The row's signature (LineClass.sig) the answer was given to. */
  sig?: string;
  /** MOOD-F1: split the row in two — by the look of its lines or by the sizes they run between. */
  split?: 'look' | 'nesting';
};

/** The key a legend answer is bound to: the row's signature, else its number (older rows). */
export const legendKey = (c: { id: ClassId; sig?: string }) => c.sig ?? `#${c.id}`;
export type PieceOverride = NonNullable<StageIO['semantics']['in']['pieceOverrides'][SeedId]>;

/** What the operator decided. Survives `back`; cleared only by `reset`. */
export type Inputs = {
  fileList: File[];
  /** A8: the operator's edits to the clean stage's mask (undo a kind, accept, a page's role). */
  cleanEdits: PageMaskEdit[];
  scaleIndex: number;
  /** Measured length of the test square when the operator overrides the detection, mm. */
  manualMeasuredMm: number | null;
  scaleConfirmed: boolean;
  gridOverride: GridOverride | undefined;
  /**
   * D6 (one file = one garment): every tile sheet is assembled into one drawing — nothing is
   * picked. This is the sheet the operator's hand grid (`gridOverride`) is set on (0 = none set).
   */
  sheetIndex: number;
  /** Loop-closure residuals over the limit, looked at and accepted by the operator. */
  residualsAccepted: boolean;
  /**
   * UXHOOKS: missing tile cells accepted as blank pages, one entry per tile sheet (the event
   * `sheet-accept-missing`; auto-advance/UX-HOOKS.md). Bound to the sheet's pages; a new hand grid
   * takes it back. No piece closes across an accepted cell (pieces/holes.ts).
   */
  sheetAcceptMissing: SheetAcceptMissing[];
  /**
   * D6: answers to the cross-sheet questions of the pieces step, by geometric key
   * (pieces/sheets.ts): a copy / an alternative rendering kept or not, a split piece.
   */
  sheetAnswers: Record<string, SheetAnswer>;
  /** D6: the per-sheet size-line reading the operator confirmed (`SheetLegend.sig`); null = none. */
  sheetLegendOk: string | null;
  legend: LegendEdit[];
  /**
   * UXHOOKS: per tile sheet, the digest (`asideDigests`) of the outlines set aside on a guess the
   * operator has looked at — the pieces step's offer is dropped for that set; a set that changes
   * asks again. The operator's answer only: the autopilot never sets it (a replay gives it back).
   */
  asideReviewed: Record<number, string>;
  /** Low-confidence legend rows the operator has looked at and accepted (`legendKey`). */
  legendConfirmed: string[];
  /** LINEFIX: the operator's per-line answers ("these lines are size N"), chains/assign.ts. */
  chainAssign: ChainAssign[];
  sizeMap: SizeMapEntry[] | null;
  /** H1: the operator's "sizes drawn on this sheet" (null = not answered). */
  drawnSizes: number | null;
  /** Where `drawnSizes` was answered (`drawnSizesKey`): read only through `liveDrawnSizes` (S3). */
  drawnSizesAt: string | null;
  variant: string | null;
  /** Seeds the operator added by clicking (appended to the text seeds of the first run). */
  clickSeeds: Seed[];
  edits: PieceEdit[];
  fileAllowance: AllowanceDecision | null;
  overrides: StageIO['semantics']['in']['pieceOverrides'];
  /** Two clicks, or an accepted proposal (A1: `accepted` = the proposal's evidence). */
  operatorGrain: StageIO['semantics']['in']['operatorGrain'];
  /** Fold edges the operator picked (E1a); "not a fold" lives in `overrides[seed].unfoldedFold`. */
  operatorFold: Partial<Record<SeedId, { a: PtMm; b: PtMm }>>;
  /** The unbound cutting-list entries the operator has seen named and checked (S5). */
  foldListChecked: string[];
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
  /**
   * GRADE P1: the operator's answers to semantics' `gradeAsks` by question key — a lone notch
   * ("in every size / in none / only in this one"), a per-size count difference ("intended"). The
   * key is the question's content, so a question that changes simply asks again. The operator's
   * only: the autopilot never sets it (D3/D5). Absent = none.
   */
  gradeAnswers?: Record<string, GradeAnswer>;
  /**
   * SHAPE-KINK: the operator's one-shape moves on the check step, keyed `${seed}:${sizeToken}`
   * (shapeFixKey) — 'straighten' (api.fixShape) / 'drop' (api.dropSize). The operator's only: the
   * autopilot never sets it (D3/D5). Absent = none.
   */
  shapeFixes?: Record<string, ShapeFixAction>;
  assignment: FabricAssignment | null;
  /**
   * S3: the fingerprint (sheet, grid, model, each piece's outline) the answers above were given
   * against. Settled after every pieces run; an answer whose piece or sheet moved is dropped, and
   * every reader goes through `liveAnswers`, so a stale one never counts (answers.ts).
   */
  answerCtx: AnswerCtx | null;
  /**
   * A10: what the autopilot answered in the operator's place (rule D5), one per question. Written
   * into every manifest of the run (`autopilotRecordOf`); empty = the operator answered.
   */
  autopilot: Assumption[];
  /**
   * RULHOOK: how the write stores the sizes (event `write-storage`; RUL-SPEC.md §6). Absent =
   * 'blocks' (per-size DXF only). Not an answer: the autopilot never sets it, every write of the
   * run carries it. Not in EMPTY_INPUTS on purpose — a new file drop keeps it; `reset` clears it.
   */
  writeStorage?: WriteStorage;
};

const EMPTY_INPUTS: Inputs = {
  fileList: [],
  cleanEdits: [],
  scaleIndex: 0,
  manualMeasuredMm: null,
  scaleConfirmed: false,
  gridOverride: undefined,
  sheetIndex: 0,
  residualsAccepted: false,
  sheetAcceptMissing: [],
  sheetAnswers: {},
  sheetLegendOk: null,
  legend: [],
  asideReviewed: {},
  legendConfirmed: [],
  chainAssign: [],
  sizeMap: null,
  drawnSizes: null,
  drawnSizesAt: null,
  variant: null,
  clickSeeds: [],
  edits: [],
  fileAllowance: null,
  overrides: {},
  operatorGrain: {},
  operatorFold: {},
  foldListChecked: [],
  confirmedNames: [],
  editedNames: [],
  confirmedQuantities: {},
  assignment: null,
  answerCtx: null,
  autopilot: [],
  // SHAPE-KINK (Codex r1): a new file / reset never carries the last run's one-shape moves
  shapeFixes: {},
};

/** STOPFIX: a stage answer for a run the operator has left — it changes nothing (`fail` drops it). */
class StaleRun extends Error {
  constructor() {
    super('a stage of an earlier run');
    this.name = 'StaleRun';
  }
}

/** SHAPE-KINK: the events after which the operator's one-shape moves still name the same pieces. */
const SHAPE_FIX_KEEPS = new Set<WizardEvent['type']>([
  'shape-fix',
  'write',
  'write-storage',
  'fabrics',
  'apply',
  'download',
  'names',
  'semantics',
  'back',
]);
/** RULHOOK × STOPFIX: the apply-lock token of a draft the storage re-write holds. */
const REWRITE = -2;

const EMPTY_SESSION: ImportSession = {
  sessionId: null,
  step: 'files',
  files: [],
  pages: [],
  clean: null,
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

/** Index of the most confident scale candidate. */
const bestScale = (cs: StageIO['extract']['out']['scale']) =>
  cs.reduce((b, c, i) => (c.confidence > cs[b].confidence ? i : b), 0);

/** A best scale candidate the operator does not need to look at (DXF with declared units). */
const certainScale = (c: StageIO['extract']['out']['scale'][number] | undefined) =>
  !!c && c.confidence >= 0.9 && Math.abs(c.factor - 1) <= PATIMPORT.scaleWarnRatio;

export type ApplyState =
  | { phase: 'idle' }
  | { phase: 'running'; progress: Record<string, ApplyProgress['state']> }
  | { phase: 'done'; result: ApplyResult; progress: Record<string, ApplyProgress['state']> };

/**
 * What a run reads off the card, as one string: the size run, the BOM fabric scopes, the pieces,
 * patterns and block links it already holds (the draft binds to them). Not the manifests (read
 * late, asynchronously) nor the style label (file names only).
 */
export function cardFingerprint(c: CardContext): string {
  return JSON.stringify([
    c.techCardId,
    !!c.downloadOnly,
    c.sizes.map((x) => [x.sizeId, x.token, x.rank]),
    c.scopes.map((x) => [x.scopeKey, x.bomLineKey, x.fabricPurpose, x.isInterlining]),
    c.existingPieces.map((x) => [x.lineKey, x.name, x.cutSymmetry, x.piecesPerGarment ?? null]),
    (c.existingAliases ?? []).map((x) => [x.scopeKey, x.blockName, x.pieceLineKey]),
    (c.existingPatterns ?? []).map((x) => [x.scopeKey, x.url, x.lineKey ?? null]),
    cardIdentity(c),
  ]);
}

/**
 * A10 (Codex #5): what the card says it is — the strings the model / sheet choice is matched
 * against (autopilot/card-match.ts). A change means the choice was made against another card.
 */
export const cardIdentity = (c: CardContext) =>
  JSON.stringify([c.cardName ?? '', c.styleNumber ?? '', c.styleLabel ?? '']);

export function useImportSession(deps: {
  client: ImportClient;
  card: CardContext;
  namer: NameSuggester;
  buildDraft: DraftBuilder;
  applyDraft: ApplyDraftFn;
  /**
   * A9: the AI page-role call (ai-page-roles.ts on the real worker; the recorded fixture in the
   * probes). Absent = no call: the pages are judged by their geometry alone, as before.
   */
  pageRoles?: PageRoleDeps;
  /**
   * Files dropped on one card slot: every piece's fabric defaults to this scope (pinToScope), not
   * to the sheet's inferred main fabric. The operator can still change it on the fabrics step.
   */
  pinScopeKey?: string;
}) {
  const { client, namer, buildDraft, applyDraft } = deps;
  /** The LIVE card as the latest render sees it (only the freshness check reads it). */
  const cardRef = useRef(deps.card);
  cardRef.current = deps.card;
  /**
   * Codex re-check #1 (r4): the card snapshot THIS run reads — taken once when the files are read
   * (refreshed when the operator goes back to sizes or earlier); every stage, blocker and the draft
   * read it through `rc()`, and its fingerprint is what the live card is compared with before apply.
   */
  const runCard = useRef<CardContext | null>(null);
  const rc = (): CardContext => runCard.current ?? cardRef.current;
  const cardAt = useRef<string | null>(null);
  const takeCard = () => {
    runCard.current = cardRef.current;
    cardAt.current = cardFingerprint(runCard.current);
  };
  /**
   * Codex re-check #2: one apply per draft. Taken synchronously — by the autopilot before its
   * check → apply move (`lockApply`), by the apply itself otherwise — and never handed twice: a
   * concurrent or repeated apply of the same draft is refused. A new draft (a re-write) is a new
   * lock; an apply that did not complete the card write (failed, threw, card changed) gives it back.
   */
  const applyLock = useRef<{ draft: unknown; token: number; used: boolean } | null>(null);
  const lockSeq = useRef(0);
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
  /**
   * A9: the AI's page roles of this run (evidence the clean stage reads on every run of it), and
   * what the call did in words — a note on the files step, never a stop.
   */
  const pageHints = useRef<AiPageHint[]>([]);
  /** A9 (Codex #4): per file, what its answers were asked against (`basisOf`). */
  const pageBasis = useRef(new Map<string, string>());
  const [pageRoleNote, setPageRoleNote] = useState<string | null>(null);
  const exRef = useRef(extracted);
  exRef.current = extracted;
  /**
   * N1: the steps the wizard went through without the operator — 'auto' = shown, checked, nothing
   * asked (the stepper: "auto ✓"); 'skipped' = jumped over unseen (the DXF fast path, a one-page
   * sheet). Each stays a door back. Pruned to the steps before the current one on every move.
   */
  const [passed, setPassed] = useState<Partial<Record<WizardStep, 'auto' | 'skipped'>>>({});
  /**
   * N1: the forward drive — armed by the operator's next / read, dropped where a step asks. `gen`
   * tells a stale drive (or a stale resolver answer) from the live one.
   */
  const drive = useRef<{
    gen: number;
    resolve?: AutoResolver<Inputs>;
    /** AP-replay: the previous import's unasked answers, offered on a step that asks nothing. */
    prefill?: AutoResolver<Inputs>;
    /** Armed with the standing pair (the operator's "next", reading files), not by `advance`. */
    standing: boolean;
    state: DriveState;
  } | null>(null);
  /**
   * AP-replay: what arms the drive when nothing else does (the operator's "next", reading the
   * files) — the replay of a previous import of the same files, so manual mode reuses its answers
   * too. Its resolver stops on a question it cannot answer (the operator's, as without it).
   */
  const standing = useRef<{
    resolve?: AutoResolver<Inputs>;
    prefill?: AutoResolver<Inputs>;
  } | null>(null);
  /** A10: where and why the last armed resolver (the autopilot) stopped; null = it did not. */
  const [driveStop, setDriveStop] = useState<{
    step: WizardStep;
    why: DriveStopWhy;
    reason: string;
  } | null>(null);
  const driveGen = useRef(0);
  /** N1: bumped by every operator action — an answer computed before it is stale. */
  const opRev = useRef(0);
  /** N1: the notice a refused resolver answer left (the next `advance` clears it, no other). */
  const refusal = useRef<string | null>(null);
  /**
   * Codex re-check #3: the AI-namer outage notice of this run, and the one a resume acknowledged —
   * the drive goes on past it (the autopilot types its P-codes); the notice stays on screen.
   */
  const namerNote = useRef<string | null>(null);
  const ackedNote = useRef<string | null>(null);
  const [driveTick_, setDriveTick] = useState(0);
  /** Transitions in flight (a stage, the namer, a write): the drive waits for all of them. */
  const flightRef = useRef(0);
  const [flight, setFlight] = useState(0);
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

  // ── STOPFIX: a stop never ends the run ──────────────────────────────────────────────────
  /**
   * The stages that made the worker's state, with their inputs and output digests (stop-restore.ts):
   * what a restore plays again after the importer was restarted under the run.
   */
  const history = useRef<RestoreEntry[]>([]);
  /** Bumped when the run starts over (files, reset, a run given up): a late answer is not recorded. */
  const histGen = useRef(0);
  /**
   * The worker session the run lives in after a restore. `session.sessionId` stays the run's id
   * (the wizard keys "a new run" off it: the autopilot starts once per id) — the worker's may move.
   */
  const wid = useRef<number | null>(null);
  const workerId = () => wid.current ?? sRef.current.sessionId;
  /** The importer was restarted under the run: the next stage restores it first. */
  const lost = useRef(false);
  const [restorePending, setRestorePending] = useState(false);
  const markLost = (v: boolean) => {
    lost.current = v;
    setRestorePending(v);
  };
  const restoring = useRef<Promise<void> | null>(null);
  /** The operator pressed stop: no stage starts until his next action (a move stops between stages). */
  const stopReq = useRef(false);
  /** What the last stop stopped; null once a stage runs again (or a new run starts). */
  const [stopped, setStopped] = useState<{ stage: StageName | null; restarted: boolean } | null>(
    null,
  );
  const resetHistory = () => {
    history.current = [];
    histGen.current++;
    wid.current = null;
    restoring.current = null;
    markLost(false);
    setStopped(null);
  };

  /**
   * STOPFIX: one move — an operator action, a drive tick — is all or nothing under a stop: what
   * it changed (the session, the inputs, the history, the apply lock) is put back as it was when
   * the move began, so "run again" repeats the action on the state it was made on (a seed is not
   * added twice, a mask edit is not half-applied). When the move ran a stage that holds state,
   * the worker is past the screen: its session is replaced by a restore of the history as it was.
   */
  type Move = {
    gen: number;
    session: ImportSession;
    inputs: Inputs;
    history: RestoreEntry[];
    baseSeeds: Seed[] | null;
    hints: AiPageHint[];
    basis: Map<string, string>;
    lock: typeof applyLock.current;
    rewriteError: string | null;
    /** Codex r2: the card the run reads (`back` takes it again before a stage that may stop). */
    runCard: CardContext | null;
    cardAt: string | null;
    /** A stage that holds state was sent to the worker during the move. */
    touched: boolean;
    stopped: boolean;
  };
  const move = useRef<Move | null>(null);
  async function asMove<T>(f: () => Promise<T>): Promise<T> {
    if (move.current) return f();
    const m: Move = {
      gen: histGen.current,
      session: sRef.current,
      inputs: iRef.current,
      history: history.current,
      baseSeeds: baseSeeds.current,
      hints: pageHints.current,
      basis: pageBasis.current,
      lock: applyLock.current,
      rewriteError: rewriteErr.current,
      runCard: runCard.current,
      cardAt: cardAt.current,
      touched: false,
      stopped: false,
    };
    move.current = m;
    try {
      return await f();
    } finally {
      if (move.current === m) move.current = null;
      if (m.stopped && m.gen === histGen.current) rollBack(m);
    }
  }
  function rollBack(m: Move) {
    const error = sRef.current.error;
    const back = { ...m.session, busy: null, error };
    sRef.current = back;
    setSession(back);
    iRef.current = m.inputs;
    setInputs(m.inputs);
    baseSeeds.current = m.baseSeeds;
    pageHints.current = m.hints;
    pageBasis.current = m.basis;
    applyLock.current = m.lock;
    runCard.current = m.runCard;
    cardAt.current = m.cardAt;
    rewriteErr.current = m.rewriteError;
    setRewriteError(m.rewriteError);
    prunePassed();
    if (!m.touched) return;
    // the worker ran past the screen (or half-ran a stage): its session is rebuilt from the history
    // the screen was made of, on the next stage
    history.current = m.history;
    const id = workerId();
    if (id != null && (!client.alive || client.alive(id))) void client.close(id);
    markLost(true);
  }

  /** RULHOOK × STOPFIX: the re-write of the check step's draft after a storage change. */
  const rewriting = useRef(false);
  const rewriteAgain = useRef(false);
  const rewriteErr = useRef<string | null>(null);
  const [rewriteError, setRewriteErrorState] = useState<string | null>(null);
  const setRewriteError = (x: string | null) => {
    rewriteErr.current = x;
    setRewriteErrorState(x);
  };

  // Close the worker session — and end the worker — when the wizard unmounts.
  useEffect(
    () => () => {
      const id = workerId();
      if (id != null) void client.close(id);
      client.dispose?.();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client],
  );

  async function run<S extends StageName>(stage: S, input: StageIO[S]['in']) {
    if (sRef.current.sessionId == null) throw new Error('no session — read the files first');
    // STOPFIX: a stop holds every stage after the one it stopped (a move, a drive)
    if (stopReq.current) throw new ImportWorkerError('cancelled', 'stopped by the operator', stage);
    // the stage that reads the card's run: what everything after it was built against
    patch({ busy: { stage, done: 0, total: 1 }, error: null });
    setErrorCode(null);
    setStopped(null);
    failureRef.current = null;
    // Codex: a run that outlives its run (files read again, reset) changes nothing of the new one
    const gen = histGen.current;
    const live = () => gen === histGen.current;
    let id: number | null = null;
    try {
      if (lost.current) {
        const r = (restoring.current ??= restore().finally(() => {
          if (restoring.current === r) restoring.current = null;
        }));
        await r;
        if (!live()) throw new StaleRun();
        patch({ busy: { stage, done: 0, total: 1 } });
      }
      id = workerId();
      if (id == null) throw new Error('no session — read the files first');
      const kept = RESTORE_STAGES.has(stage) ? cloneInput(input) : null;
      if (kept && move.current) move.current.touched = true;
      const out = await client.run(id, stage, input, (p) => {
        if (live()) patch({ busy: { stage, done: p.done, total: p.total, note: p.note } });
      });
      if (!live()) throw new StaleRun();
      if (kept)
        history.current = [
          ...pruneAfter(history.current, stage),
          { stage, input: kept, digest: digestOf(out) },
        ];
      return out;
    } catch (e) {
      if (!live()) throw e instanceof StaleRun ? e : new StaleRun();
      if (id != null) {
        const alive = !client.alive || client.alive(id);
        // a live worker ran the stage's invalidation before it failed: the history drops the same
        if (alive) history.current = pruneAfter(history.current, stage);
        // PATTERNS ("chains: assemble the sheet first"): the worker now holds less than the
        // screen shows — its latest state stage (the history's frontier) comes before the latest
        // output on screen (a page-remove whose clean failed; chains new, then sizes failed). The
        // move is undone like a stop, so the screen never runs ahead of the worker (Codex)
        const frontier = history.current.at(-1)?.stage ?? null;
        if (
          alive &&
          move.current &&
          importErrorCode(e) !== 'cancelled' &&
          shownStage(sRef.current) != null &&
          (frontier == null || before(frontier, shownStage(sRef.current)))
        )
          move.current.stopped = true;
        // the importer was restarted under a stop: the run is kept, the next stage restores it
        else if (importErrorCode(e) === 'cancelled') markLost(true);
      }
      throw e;
    } finally {
      if (live()) patch({ busy: null });
    }
  }

  /**
   * STOPFIX: the run back in a fresh worker session — the files read again, every stage of the
   * history played again quietly with its recorded input, each output checked against the one
   * recorded. A stop during it keeps the run lost (and kept); any other failure gives the run up
   * as before the fix (`no-session`: read the files again) — never a run on another drawing.
   */
  async function restore(): Promise<void> {
    const files = iRef.current.fileList;
    const hist = history.current.slice();
    const gen = histGen.current;
    const total = hist.length + 1;
    const note = (k: number) => `restoring the run after the stop · ${k}/${total}`;
    patch({ busy: { stage: hist[0]?.stage ?? 'extract', done: 0, total, note: note(0) } });
    let fresh: number | null = null;
    try {
      if (!files.length) throw new Error('the files are no longer at hand');
      const bytes = await Promise.all(
        files.map(async (f) => ({ name: f.name, bytes: await f.arrayBuffer() })),
      );
      const opened = await client.open(bytes);
      fresh = opened.sessionId;
      for (let k = 0; k < hist.length; k++) {
        const h = hist[k];
        if (stopReq.current)
          throw new ImportWorkerError('cancelled', 'stopped by the operator', h.stage);
        if (gen !== histGen.current) throw new StaleRun();
        patch({ busy: { stage: h.stage, done: k + 1, total, note: note(k + 1) } });
        const out = await client.run(fresh, h.stage, cloneInput(h.input));
        if (digestOf(out) !== h.digest)
          throw new Error(`${h.stage} came out different in the restarted importer`);
      }
      if (gen !== histGen.current) throw new StaleRun();
      wid.current = fresh;
      markLost(false);
    } catch (e) {
      if (fresh != null && wid.current !== fresh) void client.close(fresh);
      if (gen !== histGen.current) throw new StaleRun();
      // stopped again: the run stays as it is (kept, still to restore)
      if (importErrorCode(e) === 'cancelled') throw e;
      const why = e instanceof Error ? e.message : String(e);
      throw new ImportWorkerError(
        'no-session',
        `the run could not be restored after the stop (${why}) — read the files again`,
      );
    }
  }

  /** The last failure, kept for the error report (M5): which stage, which code, what it said. */
  const failureRef = useRef<{
    stage: StageName | null;
    code: ImportErrorCode | null;
    message: string;
  } | null>(null);

  const fail = (e: unknown) => {
    // a stage of a run the operator has left (files read again, reset): nothing of the new one moves
    if (e instanceof StaleRun) return;
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
    const id = workerId();
    const dead = id != null && !!client.alive && !client.alive(id);
    // STOPFIX: a stop is the operator's — the run stays on its step with everything it had and
    // all his answers. When the importer had to be restarted for it (a stage that would not
    // pause), the next stage restores the run first (`restore`).
    if (code === 'cancelled') {
      if (dead) markLost(true);
      // the move it stopped is undone when it returns (`asMove`)
      if (move.current) move.current.stopped = true;
      setStopped({ stage: failureRef.current.stage, restarted: dead });
      patch({
        busy: null,
        error: dead
          ? 'stopped — the importer was restarted; the run is as it was before this step'
          : 'stopped by the operator — the run is as it was before this step',
      });
      return;
    }
    // The worker was restarted (a crash, a run that could not be restored): its session is gone,
    // so the run starts over from the files — still staged on the files step.
    if (dead) {
      resetHistory();
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
    sheetAnswers: i.sheetAnswers,
    opts: {
      cellMm: PATIMPORT.fillCellMm,
      snapMm: PATIMPORT.snapMm,
      variant: i.variant,
      // H1: the fill refuses graded pieces it cannot prove against this count
      ...(sRef.current.sizes?.expected ? { expectedSizes: sRef.current.sizes.expected } : {}),
    },
  });

  /** H1 drawn-size count — only as answered on this sheet for this model (S3). */
  const drawnNow = (i: Inputs = iRef.current) => liveDrawnSizes(i, i);
  /** S3: the fingerprint of what is on screen now — the sheet, its grid, the model, the pieces. */
  /** A8: the mask the sheet was read with — page items, sheet items and the operator's edits. */
  const maskRevNow = (s: ImportSession, i: Inputs): string | undefined => {
    const ids = [
      ...(s.clean?.pages ?? []).flatMap((p) => p.items.filter((m) => m.applied).map((m) => m.id)),
      ...(s.clean?.dropped ?? []).map((d) => `drop:${d.file}:${d.page}`),
      ...(s.sheet?.clean?.items ?? []).filter((m) => m.applied).map((m) => m.id),
    ];
    if (!ids.length && !i.cleanEdits.length) return undefined;
    return maskRevOf(ids, i.cleanEdits);
  };
  const answersNow = (s: ImportSession = sRef.current, i: Inputs = iRef.current): AnswerCtx =>
    answerCtxOf(
      {
        sheetIndex: i.sheetIndex,
        gridOverride: i.gridOverride,
        variant: s.variant,
        maskRev: maskRevNow(s, i),
        legendRev: legendRevOf(i),
      },
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
    // GRADE P1: the operator's answers to the one-shape questions (never the autopilot's)
    ...(i.gradeAnswers && Object.keys(i.gradeAnswers).length
      ? { gradeAnswers: i.gradeAnswers }
      : {}),
    // SHAPE-KINK: the operator's fixShape / dropSize (never the autopilot's)
    ...(i.shapeFixes && Object.keys(i.shapeFixes).length ? { shapeFixes: i.shapeFixes } : {}),
    // the AI read "on fold" off the drawing (the sheet's words may be curves): asked, not unfolded
    foldHints: sRef.current.names.filter((n) => n.suggestion?.onFold).map((n) => n.seed),
  });

  // ── events (08-CONTRACT WizardEvent) ─────────────────────────────────────────────────────
  async function dispatchRaw(ev: WizardEvent): Promise<void> {
    // SHAPE-KINK (Codex r2): a one-shape move is bound to the pieces it was made on — any event
    // that may change the sheet, the sizes or the pieces drops every move (asked again on check)
    if (!SHAPE_FIX_KEEPS.has(ev.type) && Object.keys(iRef.current.shapeFixes ?? {}).length) {
      iRef.current = { ...iRef.current, shapeFixes: {} };
      patchInputs({ shapeFixes: {} });
    }
    try {
      switch (ev.type) {
        case 'files': {
          takeCard();
          patchInputs({ ...EMPTY_INPUTS, fileList: ev.files });
          baseSeeds.current = null;
          heldNames.current = [];
          setSom(null);
          setExtracted(NO_EXTRACT);
          const old = workerId();
          resetHistory();
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
          // A8: the pages are cleaned before anything is parsed — furniture masked, the pages
          // that are not pattern set aside, a test square drawn as lines offered as the scale
          const cl0 = await run('clean', { edits: [] });
          // A9: the AI's page roles (one call per file with a page set aside that holds line work),
          // read by the clean stage as the evidence it lacked
          const cl = (await askPageRoles(cl0, out.files)) ?? cl0;
          // The best candidate is preselected; the operator confirms on the scale step.
          const best = bestScale(cl.scale);
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
            pages: cl.classes,
            clean: cl,
            scale: { candidates: cl.scale, decision: null },
          });
          return;
        }
        case 'clean': {
          // A8: an undo / accept / page role re-runs clean and everything after it. From the sheet
          // step (the sheet pass's watermark) the run comes back to the sheet with the same scale
          // and grid; from the files step the scale is asked again.
          const from = sRef.current.step;
          const decision = sRef.current.scale.decision;
          patchInputs({ cleanEdits: ev.edits });
          iRef.current = { ...iRef.current, cleanEdits: ev.edits };
          let cl = await run('clean', { edits: ev.edits, ...aiHintsNow() });
          // A9 (Codex #4): an edit that changed a file's render or its tile reference set makes
          // that file's AI answers stale — they only suggest until asked again
          if (staleAfter(cl)) cl = await run('clean', { edits: ev.edits, ...aiHintsNow() });
          const best = bestScale(cl.scale);
          patchInputs({ scaleIndex: best, scaleConfirmed: false });
          iRef.current = { ...iRef.current, scaleIndex: best, scaleConfirmed: false };
          patch(
            dropAfter(
              {
                ...sRef.current,
                clean: cl,
                pages: cl.classes,
                scale: { candidates: cl.scale, decision: null },
              },
              'files',
            ),
          );
          if (from !== 'files' && decision && !exRef.current.presegmented) {
            await run('scale', { decision });
            patch({ scale: { ...sRef.current.scale, decision } });
            const out = await run('assemble', {
              sheet: iRef.current.sheetIndex,
              override: iRef.current.gridOverride,
              acceptMissing: iRef.current.sheetAcceptMissing,
            });
            patch({ sheet: out, step: 'sheet' });
          }
          return;
        }
        case 'scale': {
          await run('scale', { decision: ev.decision });
          patch({ scale: { ...sRef.current.scale, decision: ev.decision } });
          if (exRef.current.presegmented) return await fastPath();
          const out = await run('assemble', {
            sheet: iRef.current.sheetIndex,
            override: iRef.current.gridOverride,
            acceptMissing: iRef.current.sheetAcceptMissing,
          });
          // A0.2: one page is the sheet — nothing to assemble or pick; the step stays a door back
          if (singlePageSheet(sRef.current.pages, out, iRef.current.gridOverride)) {
            patch({ sheet: out });
            sRef.current = { ...sRef.current, sheet: out };
            return await toSizes();
          }
          patch({ sheet: out, step: 'sheet' });
          return;
        }
        case 'sheet': {
          // D6: every tile sheet is in the drawing whatever this says — the event sets (or takes
          // back) the hand grid of ONE sheet and re-assembles. The answers given on the pieces are
          // settled against the new drawing after its pieces run (S3: the grid is in the print).
          const sheetIndex = ev.override ? ev.sheet : 0;
          // UXHOOKS: the cells accepted as blank were cells of the old grid — asked again
          patchInputs({
            gridOverride: ev.override,
            sheetIndex,
            residualsAccepted: false,
            sheetAcceptMissing: [],
          });
          iRef.current = {
            ...iRef.current,
            gridOverride: ev.override,
            sheetIndex,
            sheetAcceptMissing: [],
          };
          const out = await run('assemble', { sheet: ev.sheet, override: ev.override });
          patch(dropAfter({ ...sRef.current, sheet: out }, 'sheet'));
          return;
        }
        case 'sheet-accept-missing': {
          // UXHOOKS: the missing cells of one tile sheet are blank pages (`cells` = the whole set
          // of that sheet, [] takes it back), bound to the pages the sheet has now; the sheet is
          // assembled again and everything after it re-runs (D3: no piece closes across a hole)
          const pages = holePagesKey(sRef.current.sheet?.sheet, ev.sheet);
          const rest = iRef.current.sheetAcceptMissing.filter((a) => a.sheet !== ev.sheet);
          const sheetAcceptMissing = ev.cells.length
            ? [
                ...rest,
                {
                  sheet: ev.sheet,
                  // who accepted is kept per cell (a cell the operator accepted stays his)
                  cells: ev.cells.map((c) => ({
                    row: c.row,
                    col: c.col,
                    ...(c.file != null ? { file: c.file } : {}),
                    origin: c.origin ?? ev.origin ?? 'operator',
                  })),
                  pages,
                  origin: ev.origin ?? 'operator',
                },
              ]
            : rest;
          patchInputs({ sheetAcceptMissing });
          iRef.current = { ...iRef.current, sheetAcceptMissing };
          const out = await run('assemble', {
            sheet: iRef.current.sheetIndex,
            override: iRef.current.gridOverride,
            acceptMissing: sheetAcceptMissing,
          });
          patch(dropAfter({ ...sRef.current, sheet: out }, 'sheet'));
          return;
        }
        case 'legend': {
          patchInputs({ legend: ev.edits });
          const chains = await run('chains', {
            opts: chainOpts(),
            legend: ev.edits,
            confirmed: iRef.current.legendConfirmed,
            chainAssign: iRef.current.chainAssign ?? [],
          });
          const sizes = await run('sizes', {
            card: rc().sizes,
            drawnSizes: drawnNow() ?? undefined,
          });
          patchInputs({ sizeMap: null });
          patch({ chains, sizes });
          return;
        }
        case 'legend-confirm': {
          // an answer the worker needs too (the size checks): the chains are rebuilt with it; the
          // roles do not change, so the operator's size map stays
          const legendConfirmed = [...iRef.current.legendConfirmed, ev.key];
          iRef.current = { ...iRef.current, legendConfirmed };
          patchInputs({ legendConfirmed });
          const chains = await run('chains', {
            opts: chainOpts(),
            legend: iRef.current.legend,
            confirmed: legendConfirmed,
            chainAssign: iRef.current.chainAssign ?? [],
          });
          const sizes = await run('sizes', {
            card: rc().sizes,
            operatorMap: iRef.current.sizeMap ?? undefined,
            drawnSizes: drawnNow() ?? undefined,
          });
          patch({ chains, sizes });
          return;
        }
        case 'line-assign': {
          // LINEFIX: the lines move between rows, the rows stay (their labels, the operator's map)
          iRef.current = { ...iRef.current, chainAssign: ev.assign };
          patchInputs({ chainAssign: ev.assign });
          const chains = await run('chains', {
            opts: chainOpts(),
            legend: iRef.current.legend,
            confirmed: iRef.current.legendConfirmed,
            chainAssign: ev.assign,
          });
          const sizes = await run('sizes', {
            card: rc().sizes,
            operatorMap: iRef.current.sizeMap ?? undefined,
            drawnSizes: drawnNow() ?? undefined,
          });
          patch({ chains, sizes });
          return;
        }
        case 'size-map': {
          patchInputs({ sizeMap: ev.entries });
          const sizes = await run('sizes', {
            card: rc().sizes,
            operatorMap: ev.entries,
            drawnSizes: drawnNow() ?? undefined,
          });
          patch({ sizes });
          return;
        }
        case 'drawn-sizes': {
          // H1: how many sizes the sheet draws re-reads the run; the operator's map starts over
          const drawnSizesAt = ev.n == null ? null : drawnSizesKey(iRef.current);
          patchInputs({ drawnSizes: ev.n, drawnSizesAt, sizeMap: null });
          iRef.current = { ...iRef.current, drawnSizes: ev.n, drawnSizesAt, sizeMap: null };
          const sizes = await run('sizes', { card: rc().sizes, drawnSizes: ev.n ?? undefined });
          patch({ sizes });
          return;
        }
        case 'variant': {
          patchInputs({ variant: ev.variant });
          // S3: a count answered before any model was picked is the FIRST picked model's answer;
          // one answered for another model is not this model's: the sizes step asks again (the
          // map starts over with it, as on any drawn-sizes answer)
          const bound = bindDrawnToModel(iRef.current, { ...iRef.current, variant: ev.variant });
          if (bound !== iRef.current.drawnSizesAt) {
            iRef.current = { ...iRef.current, drawnSizesAt: bound };
            patchInputs({ drawnSizesAt: bound });
          }
          const i0 = iRef.current;
          if (i0.drawnSizes != null && liveDrawnSizes(i0, { ...i0, variant: ev.variant }) == null) {
            const cleared = { drawnSizes: null, drawnSizesAt: null, sizeMap: null };
            iRef.current = { ...i0, ...cleared, variant: ev.variant };
            patchInputs(cleared);
            const sizes = await run('sizes', { card: rc().sizes });
            patch(dropAfter({ ...sRef.current, sizes }, 'sizes'));
            return;
          }
          iRef.current = { ...iRef.current, variant: ev.variant };
          const out = await run('pieces', piecesInput(iRef.current));
          patch({ pieces: out, variant: ev.variant });
          settleToPieces();
          return;
        }
        case 'sheet-answer': {
          // D6: "copy" / "keep" travel as "not a piece" on the copies (the record replays them as
          // piece edits); every answer is kept by its key for the gate (G23)
          const sheetAnswers = { ...iRef.current.sheetAnswers, [ev.key]: ev.answer };
          const seen = new Set(
            iRef.current.edits.flatMap((e) => (e.kind === 'not-a-piece' ? [e.seed] : [])),
          );
          const edits = [
            ...iRef.current.edits,
            ...ev.edits.filter((e) => e.kind !== 'not-a-piece' || !seen.has(e.seed)),
          ];
          const next = { ...iRef.current, sheetAnswers, edits };
          iRef.current = next;
          patchInputs({ sheetAnswers, edits });
          const out = await run('pieces', piecesInput(next));
          patch({ pieces: out });
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
            foldListChecked: Array.isArray(ev.input.foldListChecked)
              ? ev.input.foldListChecked
              : iRef.current.foldListChecked,
            gradeAnswers: ev.input.gradeAnswers
              ? { ...ev.input.gradeAnswers }
              : iRef.current.gradeAnswers,
            shapeFixes: ev.input.shapeFixes ? { ...ev.input.shapeFixes } : iRef.current.shapeFixes,
          });
          const out = await run('semantics', ev.input);
          patch({ semantics: out });
          return;
        }
        case 'fabrics':
          patchInputs({ assignment: ev.assignment });
          patch({ fabrics: ev.assignment });
          return;
        case 'shape-fix': {
          // SHAPE-KINK: the operator's one-shape move — recorded in the inputs, then (on the check
          // step) semantics and the write run again; an apply-held draft is not written over
          const seed = shapeSeedOf(sRef.current, ev.identity, ev.size);
          if (seed == null) return;
          const key = shapeFixKey(seed, ev.size);
          const shapeFixes = { ...(iRef.current.shapeFixes ?? {}) };
          if (ev.action === 'clear') delete shapeFixes[key];
          else shapeFixes[key] = ev.action;
          iRef.current = { ...iRef.current, shapeFixes };
          patchInputs({ shapeFixes });
          const s = sRef.current;
          const held = applyLock.current;
          const free = !held || held.draft !== s.draft || held.token === REWRITE;
          if (s.step !== 'check' || !s.draft || !free) return;
          if (rewriting.current) {
            rewriteAgain.current = true;
            return;
          }
          applyLock.current = { draft: s.draft, token: REWRITE, used: true };
          await rewrite();
          return;
        }
        case 'write-storage': {
          // RULHOOK: the operator's storage choice; an unknown storage changes nothing
          const writeStorage = normWriteStorage(ev);
          if (!writeStorage) return;
          iRef.current = { ...iRef.current, writeStorage };
          patchInputs({ writeStorage });
          // on the check step the draft is written again with it — unless an apply holds that draft.
          // Codex: the old draft (the old choice) is locked first, before any await — no apply
          // takes it while the write runs, nor after a write that failed; the new draft is free
          // STOPFIX: a draft only a re-write holds (the last one failed) is written again — the
          // toggle and the files never part; one held by an apply (running or done) is not
          const s = sRef.current;
          const held = applyLock.current;
          const free = !held || held.draft !== s.draft || held.token === REWRITE;
          if (s.step !== 'check' || !s.draft || !free) return;
          // a re-write in flight writes the latest choice once it is done
          if (rewriting.current) {
            rewriteAgain.current = true;
            return;
          }
          applyLock.current = { draft: s.draft, token: REWRITE, used: true };
          await rewrite();
          return;
        }
        case 'write': {
          const a = sRef.current.fabrics;
          const sizes = sRef.current.sizes;
          let sem = sRef.current.semantics;
          if (!a || !sizes || !sem) return;
          // `fused` is decided on the fabrics step (interlining not in BOM → the flag, decision 14)
          // but is a PieceSpec field: hand it to semantics as an override, so the manifest, the
          // draft and the card read the same flag.
          const fused = fusedSeeds(a, rc().scopes);
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
            scopes: rc().scopes,
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
            // RULHOOK: 'rul' also packs base DXF + .rul (an unknown base is dropped, its reason
            // on `writeStorage.ignored`); absent / 'blocks' = today's write
            ...writeStorageInput(writeStorageFor(iRef.current.writeStorage, writtenTokens(sizes))),
            generator: `grbpwr-admin pattern-import (${client.kind})`,
            techCardId: rc().techCardId,
            // A10: an autopilot run's assumptions ride in every written manifest (A9: with the
            // pages the AI + geometry set aside, when the autopilot asked nothing to record them)
            ...autopilotOf(
              ev.autopilot,
              (drive.current?.resolve && !drive.current.standing) || iRef.current.autopilot.length
                ? mergeAssumptions(
                    iRef.current.autopilot,
                    aiAsideAssumptions(sRef.current, iRef.current.autopilot),
                  )
                : iRef.current.autopilot,
              sem.pieces,
            ),
            // AP-replay: every answer the run ends with, reproducible — a re-import of the same
            // files reuses them (autopilot/replay.ts); never a reason not to write
            ...replayOf(),
          });
          const draft = buildDraft(out, { card: rc(), semantics: sem });
          patch({ draft, gate: out.gate, step: 'check' });
          return;
        }
        case 'apply': {
          const built = sRef.current.draft;
          // a download-only run has no BOM line to bind a file to: nothing is applied; and only
          // from the apply step, past a gate that blocks nothing (never on the way there)
          if (!built || rc().downloadOnly || sRef.current.step !== 'apply') return;
          if (
            Object.values(sRef.current.gate).some((g) =>
              g.checks.some((c) => !c.ok && c.severity === 'block'),
            )
          )
            return;
          // Codex re-check #2: the lock, before anything else can await
          const held = applyLock.current;
          if (held && held.draft === built) {
            if (held.used || ev.token !== held.token) return;
          } else if (ev.token != null) return; // a lock taken for another draft
          const lock = { draft: built as unknown, token: ev.token ?? -1, used: true };
          applyLock.current = lock;
          // Codex re-check #1: the card changed since the run read it — nothing goes up
          const stale = cardStale();
          if (stale) {
            applyLock.current = null;
            setApply({
              phase: 'done',
              result: { ok: false, failedScope: '', message: stale, uploaded: [] },
              progress: {},
            });
            return;
          }
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
          // Codex final #2: whatever the apply throws (a rejected save, an upload) lands as a
          // failed result with its reason — the step never stays 'running'
          let result: ApplyResult;
          try {
            result = await applyDraft(draft, (p) => {
              progress[p.scopeKey] = p.state;
              setApply({ phase: 'running', progress: { ...progress } });
            });
          } catch (e) {
            result = {
              ok: false,
              failedScope: '',
              message: `the apply failed: ${e instanceof Error ? e.message : String(e)}`,
              uploaded: [],
            };
          }
          // the card write did not complete: the operator may apply again (files a failed try
          // uploaded are orphans — a known tail); the lock only holds a running or DONE apply
          if (!result.ok && applyLock.current === lock) applyLock.current = null;
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
        case 'back': {
          // back to sizes or before: the stages run again — against the card as it is now
          const changed = stepIndex(ev.to) <= stepIndex('sizes') && !!cardStale();
          // A10 (Codex #5): the card's name / style number changed — the model it named is chosen
          // again (D6: no sheet is ever chosen — every one is in the drawing)
          const renamed =
            stepIndex(ev.to) <= stepIndex('sizes') &&
            runCard.current != null &&
            cardIdentity(runCard.current) !== cardIdentity(cardRef.current);
          if (renamed) {
            const cleared = {
              variant: null,
              autopilot: iRef.current.autopilot.filter((a) => a.kind !== 'model'),
            };
            iRef.current = { ...iRef.current, ...cleared };
            patchInputs(cleared);
          }
          if (stepIndex(ev.to) <= stepIndex('sizes')) takeCard();
          if (sRef.current.names.length) heldNames.current = sRef.current.names;
          setApply({ phase: 'idle' });
          setNotice(null);
          setErrorCode(null);
          patch(dropAfter(sRef.current, ev.to));
          if (renamed) patch({ variant: null });
          // the card's size run changed under the map: the map is read again from the new run
          if (changed && ev.to === 'sizes' && sRef.current.sizes) {
            iRef.current = { ...iRef.current, sizeMap: null };
            patchInputs({ sizeMap: null });
            const sizes = await run('sizes', {
              card: rc().sizes,
              drawnSizes: drawnNow() ?? undefined,
            });
            patch({ sizes });
          }
          return;
        }
        case 'page-roles': {
          // A9: "ask the AI again" — fresh answers for the pages as they are now (edits kept)
          const now = sRef.current.clean;
          if (!now) return;
          const cl = await askPageRoles(now, sRef.current.files, iRef.current.cleanEdits);
          if (!cl) return;
          const best = bestScale(cl.scale);
          patchInputs({ scaleIndex: best, scaleConfirmed: false });
          iRef.current = { ...iRef.current, scaleIndex: best, scaleConfirmed: false };
          patch(
            dropAfter(
              {
                ...sRef.current,
                clean: cl,
                pages: cl.classes,
                scale: { candidates: cl.scale, decision: null },
              },
              'files',
            ),
          );
          return;
        }
        case 'reset': {
          const old = workerId();
          resetHistory();
          if (old != null) await client.close(old);
          pageHints.current = [];
          pageBasis.current = new Map();
          setPageRoleNote(null);
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
   * RULHOOK × STOPFIX: the draft written again with the storage the inputs hold now. Not written
   * (the write failed): the old draft stays locked — no apply takes it — and `rewriteError` says
   * why; the next storage event or `retryWrite` writes again. Stopped: the move is undone (the
   * storage, the draft and its lock as before the event).
   */
  async function rewrite() {
    rewriting.current = true;
    setRewriteError(null);
    try {
      for (;;) {
        const before = sRef.current.draft;
        rewriteAgain.current = false;
        await dispatchRaw({ type: 'write' });
        if (sRef.current.draft === before) {
          setRewriteError(sRef.current.error ?? 'the files were not written again');
          return;
        }
        if (!rewriteAgain.current) return;
        // a newer choice came in while it ran: the draft just written is the old one now
        applyLock.current = { draft: sRef.current.draft, token: REWRITE, used: true };
      }
    } finally {
      rewriting.current = false;
    }
  }

  /** AP-replay: the run's answers for the manifest (absent when none, or when it cannot be read). */
  const replayOf = (): { replay?: ReplayRecord } => {
    try {
      const r = answerRecordOf(
        sRef.current,
        iRef.current,
        baseSeeds.current,
        rc(),
        !!exRef.current.presegmented,
      );
      return r ? { replay: r } : {};
    } catch {
      return {};
    }
  };

  /** A9: the AI page roles of this run as the clean stage's input (none = absent). */
  const aiHintsNow = () =>
    pageHints.current.length ? { aiHints: { pages: pageHints.current } } : {};

  /**
   * A9: render → upload → ClassifyPatternPages, one call per file that has a page set aside
   * holding line work (plan question 10: the call is conditional — a file whose pages the
   * geometry settles costs nothing). The answer re-runs clean with the hints; any failure leaves
   * the run as it was (a note, never a stop). Null = clean need not run again.
   */
  /**
   * A9 (Codex #4): what a file's AI answers depend on — the mask its thumbnails were drawn with
   * (file-neutral item ids) and its tile reference set. A change of either makes them stale.
   */
  const basisOf = (cl: StageIO['clean']['out'], file: string) =>
    `${maskRevOf(
      cl.pages
        .filter((p) => p.file === file)
        .flatMap((p) => p.items.filter((m) => m.applied).map((m) => m.id.slice(file.length + 1))),
      [],
    )}|${cl.classes
      .filter((c) => c.file === file && c.cls === 'tile')
      .map((c) => c.page)
      .join(',')}`;

  /** Marks the answers of every file whose basis moved stale; true = clean must run again. */
  const staleAfter = (cl: StageIO['clean']['out']) => {
    let moved = false;
    pageHints.current = pageHints.current.map((h) => {
      if (h.stale || basisOf(cl, h.file) === pageBasis.current.get(h.file)) return h;
      moved = true;
      return { ...h, stale: true };
    });
    if (moved)
      setPageRoleNote(
        'AI page roles: asked before your edits — they only suggest now; ask the AI again to use them',
      );
    return moved;
  };

  async function askPageRoles(
    cl: StageIO['clean']['out'],
    files: StageIO['extract']['out']['files'],
    edits: PageMaskEdit[] = [],
  ): Promise<StageIO['clean']['out'] | null> {
    pageHints.current = [];
    pageBasis.current = new Map();
    setPageRoleNote(null);
    const roles = deps.pageRoles;
    if (!roles) return null;
    const asked = new Map<string, Set<number>>();
    // the pages in question: set aside holding line work (also those the AI set aside before)
    for (const d of cl.dropped)
      if (d.status === 'suggest' || d.aiAside) {
        const set = asked.get(d.file) ?? new Set<number>();
        set.add(d.page);
        asked.set(d.file, set);
      }
    if (!asked.size) return null;
    const hints: AiPageHint[] = [];
    const notes: string[] = [];
    for (const [file, pagesAsked] of asked) {
      const info = files.find((f) => f.id === file);
      const all = cl.classes.filter((c) => c.file === file).sort((a, b) => a.page - b.page);
      const { pages, left } = pagesForCall(all, pagesAsked);
      // the thumbnails show the page after the mask: the answer is cached per file + mask
      // file-neutral (Codex #3): the item ids without the file's index (`${file}:…`)
      const rev = maskRevOf(
        cl.pages
          .filter((p) => p.file === file)
          .flatMap((p) => p.items.filter((m) => m.applied).map((m) => m.id.slice(file.length + 1))),
        [],
      );
      let thumbs: StageIO['render-pages']['out'];
      try {
        thumbs = await run('render-pages', {
          pages: pages.map((p) => ({ file, page: p.page })),
          // ≤ 1024 px each, ≤ 32 Mpx a call (the server's rules)
          maxPx: thumbPxFor(pages.length),
          pictures: roles.pictures !== false,
        });
      } catch (e) {
        if (e instanceof StaleRun || importErrorCode(e) === 'cancelled') throw e;
        notes.push(
          `AI page roles: the pages could not be drawn (${e instanceof Error ? e.message : String(e)})`,
        );
        continue;
      }
      patch({
        busy: { stage: 'render-pages', done: 1, total: 2, note: 'asking the AI what each page is' },
      });
      try {
        const r = await classifyFilePages(
          {
            key: `${info?.sha256 || info?.name || file}:${rev}`,
            file,
            fileName: info?.name ?? `file ${Number(file) + 1}`,
            techCardId: rc().techCardId,
            thumbs: thumbs.pages,
            left,
          },
          roles,
        );
        hints.push(...r.hints);
        if (r.note) notes.push(`${files.length > 1 ? `${info?.name}: ` : ''}${r.note}`);
      } finally {
        patch({ busy: null });
      }
    }
    pageHints.current = hints;
    setPageRoleNote(notes.join(' · ') || null);
    for (const file of asked.keys()) pageBasis.current.set(file, basisOf(cl, file));
    if (!hints.length) return edits.length ? await run('clean', { edits }) : null;
    return await run('clean', { edits, aiHints: { pages: hints } });
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
      rc().sizes.map((c) => c.token),
    );
    let names: NameDecision[] = [];
    let namerError: string | null = null;
    if (plan.ask.length) {
      const out = await run('render-som', { seeds: plan.ask, dpi: 72 });
      setSom(out);
      patch({ busy: { stage: 'render-som', done: 1, total: 2, note: 'asking the AI for names' } });
      try {
        names = await namer(out, { card: rc(), threshold: AI_AUTO_ACCEPT_T });
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
    namerNote.current = namerError;
    setNotice(namerError);
  }

  /** STOPFIX: the details of the pieces as named — what `toDetails` ends with, run on its own. */
  async function buildDetails() {
    const sem = await run('semantics', semanticsInput(iRef.current));
    patch({ semantics: sem });
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
      card: rc().sizes,
      operatorMap: iRef.current.sizeMap ?? undefined,
      drawnSizes: drawnNow() ?? undefined,
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

  /** sheet → sizes: the legend and the size map of the assembled sheet. */
  async function toSizes() {
    const chains = await run('chains', {
      opts: chainOpts(),
      legend: iRef.current.legend,
      confirmed: iRef.current.legendConfirmed,
      chainAssign: iRef.current.chainAssign ?? [],
    });
    const sizes = await run('sizes', {
      card: rc().sizes,
      operatorMap: iRef.current.sizeMap ?? undefined,
      drawnSizes: drawnNow() ?? undefined,
    });
    patch({ chains, sizes, step: 'sizes' });
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
  async function forward(): Promise<void> {
    const s = sRef.current;
    try {
      switch (s.step) {
        case 'files': {
          // A garment DXF with declared units has nothing to ask on the scale step: confirm it
          // and go straight to the pieces it already carries.
          const best = s.scale.candidates[iRef.current.scaleIndex];
          if (exRef.current.presegmented && certainScale(best)) {
            await dispatchRaw({
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
          if (d) await dispatchRaw({ type: 'scale', decision: d });
          return;
        }
        case 'sheet':
          await toSizes();
          return;
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
          // STOPFIX: a stop landed on the details before they were built — "next" builds them
          if (!s.semantics) return await buildDetails();
          setNotice(null);
          // The AI's fabric calls ride along; the worker uses them only where the sheet is silent,
          // only for names auto-accepted at T and never for a name the operator typed (C7).
          const aiHints = aiFabricHintsOf(s.names, iRef.current.editedNames);
          const proposed = await run('fabrics', { bom: rc().scopes, aiHints });
          const pinSeeds = (s.semantics?.pieces ?? []).map((p) => p.seed);
          const out =
            deps.pinScopeKey && pinSeeds.length
              ? pinToScope(proposed, deps.pinScopeKey, pinSeeds, rc().scopes)
              : proposed;
          // An assignment the operator already edited survives a round trip through `back`.
          const a = iRef.current.assignment ?? out;
          patch({ fabrics: a, step: 'fabrics' });
          return;
        }
        case 'fabrics':
          await dispatchRaw({ type: 'write' });
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
    () => new Set(rc().sizes.map((c) => c.token.toLowerCase())),
    [deps.card, session.sessionId],
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
        const sides = squareSidesOf(c.evidence?.text);
        const needsHuman = scaleUncertain(c, d?.factor ?? 1, extracted.calibrations);
        if (needsHuman && !inputs.scaleConfirmed && !inputs.manualMeasuredMm)
          return sides && anisotropyOf(sides) > PATIMPORT.scaleWarnRatio
            ? 'the test square is not square in the file — measure it on paper or confirm'
            : !scaleUncertain(c, d?.factor ?? 1)
              ? 'a page has no certain scale of its own (inherited or none) — check it, then confirm'
              : 'confirm the scale — the detection is not certain';
        return null;
      }
      case 'sheet': {
        // D6: several tile sheets are not a question — every one is in the drawing
        // D3: a placement the printed labels contradict (or pages left off their grid) has no
        // "accept" — the pages or the grid change first
        const refused = s.sheet?.sheet.refused ?? [];
        if (refused.length) return `the tile placement is refused — ${refused[0]}`;
        const miss = s.sheet?.sheet.missing.length ?? 0;
        // UXHOOKS: answered by `sheet-accept-missing` (blank pages) or a hand grid
        if (miss)
          return `${miss} pages are missing — accept them as blank pages or set the grid by hand`;
        const worst = Math.max(0, ...(s.sheet?.sheet.poses.map((p) => p.residualMm) ?? [0]));
        if (worst > PATIMPORT.registrationMaxResidualMm && !inputs.residualsAccepted)
          return `tiles do not close: ${worst.toFixed(2)} mm > ${PATIMPORT.registrationMaxResidualMm} mm — check the seams, then accept or set the grid`;
        return null;
      }
      case 'sizes': {
        if (!rc().sizes.length) return 'the card has no size range — set it on the card first';
        if (s.sizes?.countAsk && !s.sizes.expected)
          return 'answer how many sizes are drawn on this sheet';
        const pending = (s.chains?.classes ?? []).filter(
          (c) =>
            c.confidence < 0.6 &&
            !inputs.legendConfirmed.includes(legendKey(c)) &&
            // gb2: the file name's one size against a graded look — answering the sizes drawn
            // settles it as well as confirming the row
            !(
              s.sizes?.expected?.from === 'operator' &&
              c.evidence.some((x) => x.kind === 'face-graded' && x.sourceOne)
            ),
        );
        if (pending.length)
          return `${pending.length} legend ${pending.length === 1 ? 'row' : 'rows'} to confirm`;
        // D6: one legend for the document — every sheet draws the same size pens
        const lq = sheetLegendQuestion(s.sizes?.sheetLegend, inputs.sheetLegendOk);
        if (lq) return lq;
        const entries = s.sizes?.map.entries ?? [];
        if (!entries.some((e) => e.card))
          return (
            (s.sizes ? crossKindQuestion(s.sizes.map, rc().sizes) : null) ??
            'map at least one size to the card'
          );
        const ids = entries.flatMap((e) => (e.card ? [e.card.sizeId] : []));
        if (new Set(ids).size !== ids.length) return 'two source sizes point at one card size';
        const guesses = guessedSizes(entries);
        if (guesses.length)
          return `${guesses.length} size ${guesses.length === 1 ? 'match is a guess' : 'matches are guesses'} — confirm or change ${guesses.length === 1 ? 'it' : 'them'}`;
        // a partial map (some drawn sizes off the card while it has sizes with no source) is never
        // an export of fewer sizes than drawn without the operator saying so
        const partial = s.sizes ? partialSizeMapQuestion(s.sizes.map) : null;
        if (partial) return partial;
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
          }; reseed elsewhere inside the piece or mark "not a piece"`;
        }
        if (open.length)
          return `${open.length} ${open.length === 1 ? 'region needs' : 'regions need'} a fix — close the gap, split, or mark "not a piece"`;
        // D6: a piece in the export twice (a copy, a sheet drawn again) or in halves is asked
        const sq = sheetQuestion(s.pieces?.sheets, inputs.sheetAnswers);
        if (sq) return sq.text;
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
        if (!rc().scopes.length) return 'the BOM has no fabric lines — add them on the BOM tab';
        // C7: a cloth other than main on the AI's word alone is the operator's call
        const ai = (a.aiOnly ?? []).filter((x) => x.needsConfirm).length;
        if (ai)
          return `${ai} ${ai === 1 ? 'piece is' : 'pieces are'} cut from lining, interlining or another cloth on the AI's word alone — confirm or change the ticks`;
        // The same planner the write stage cuts the files with: what blocks here blocks there.
        const problem = planScopes(s.semantics?.pieces ?? [], a, rc().scopes).problems[0];
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
  }, [session, inputs, deps.card, extracted]);

  /** N1: what the step offers without blocking on it (a suggestion waiting for accept). */
  const offer = session.busy
    ? null
    : stepOffer({
        ...session,
        presegmented: !!extracted.presegmented,
        cleanEdits: inputs.cleanEdits,
        scopes: rc().scopes.length,
        fabricsEdited: inputs.assignment != null,
        asideReviewed: inputs.asideReviewed,
      });

  // ── N1 auto-advance: forward through every step that asks nothing ─────────────────────
  async function tracked<T>(f: () => Promise<T>): Promise<T> {
    flightRef.current++;
    setFlight((n) => n + 1);
    try {
      return await f();
    } finally {
      flightRef.current--;
      setFlight((n) => n - 1);
    }
  }
  const arm = (resolve?: AutoResolver<Inputs>, prefill?: AutoResolver<Inputs>) => {
    const st = resolve ? null : standing.current;
    drive.current = {
      gen: ++driveGen.current,
      resolve: resolve ?? st?.resolve,
      prefill: resolve ? prefill : st?.prefill,
      standing: !resolve && !!st,
      state: newDriveState(),
    };
    setDriveStop(null);
    setDriveTick((t) => t + 1);
  };
  const disarm = () => {
    drive.current = null;
  };
  /** An operator action: whatever the drive or a resolver was about to do is stale now. */
  const operatorActs = () => {
    opRev.current++;
    // STOPFIX: the operator acts again — the stop he pressed is behind him
    stopReq.current = false;
    disarm();
  };
  /** Only the steps before the current one can be "passed". */
  const prunePassed = () => {
    const at = stepIndex(sRef.current.step);
    setPassed((p) => {
      const stale = (Object.keys(p) as WizardStep[]).filter((x) => stepIndex(x) >= at);
      if (!stale.length) return p;
      const next = { ...p };
      for (const x of stale) delete next[x];
      return next;
    });
  };
  /**
   * One forward move. The step it left is 'auto' when the drive left it (checked, nothing asked);
   * the steps it jumped over unseen (fast path, one-page sheet) are 'skipped'.
   */
  async function forwardMarked(auto: boolean) {
    const from = sRef.current.step;
    const rev = opRev.current;
    await tracked(forward);
    // the operator acted meanwhile (a door back): what moved is theirs, nothing is marked
    if (opRev.current !== rev) return false;
    const a = stepIndex(from);
    const b = stepIndex(sRef.current.step);
    if (b <= a) return false;
    const marks: Partial<Record<WizardStep, 'auto' | 'skipped'>> = {};
    if (auto) marks[from] = 'auto';
    for (const x of STEPS.slice(a + 1, b)) marks[x.id] = 'skipped';
    setPassed((p) => {
      const next = { ...p, ...marks };
      if (!auto) delete next[from];
      return next;
    });
    return true;
  }

  // The drive: armed by "next" / "read files" (or `advance`), one tick at a time — the SAME tick
  // the autopilot metric runs (auto-drive.ts `driveTick`): forward while a step asks nothing; a
  // step that asks goes to the resolver (AUTOPILOT) once per (step, question, outputs revision),
  // its answer taken only as the step's own and only while nothing moved; stopped = disarmed.
  useEffect(() => {
    const d = drive.current;
    if (!d || flight > 0 || flightRef.current > 0 || session.busy) return;
    const at = { gen: d.gen, sid: sRef.current.sessionId, step: session.step, rev: opRev.current };
    const live = () =>
      drive.current?.gen === at.gen &&
      sRef.current.sessionId === at.sid &&
      sRef.current.step === at.step &&
      opRev.current === at.rev;
    void tracked(async () => {
      try {
        // STOPFIX: one tick is one move — a stop puts back what the tick's answer changed
        const t = await asMove(() =>
          driveTick(d.state, {
            session: sRef.current,
            inputs: iRef.current,
            blocker,
            offer,
            notice: notice && notice === ackedNote.current ? null : notice,
            busy: false,
            resolve: d.resolve,
            prefill: d.prefill,
            current: () => ({ session: sRef.current, inputs: iRef.current }),
            forward: async () => {
              const rev = opRev.current;
              const moved = await forwardMarked(true);
              return moved && opRev.current === rev;
            },
            patch: (p) => {
              iRef.current = { ...iRef.current, ...p };
              patchInputs(p);
            },
            dispatch: (ev) => dispatchRaw(ev),
            live,
            failed: () => !!sRef.current.error,
          }),
        );
        if (t.kind !== 'stopped' || drive.current !== d) return;
        disarm();
        if (t.why === 'refused' && t.reason) {
          refusal.current = t.reason;
          setNotice(t.reason);
        }
        // A10: why an armed resolver (the autopilot) stopped — the footer's "autopilot stopped"
        if (d.resolve && t.why !== 'stale' && t.why !== 'not-moved')
          setDriveStop({
            step: t.step,
            why: t.why,
            reason:
              t.reason ?? t.question ?? (t.why === 'auto-stop' ? 'the gate is read here' : ''),
          });
      } catch (e) {
        if (!live()) return;
        disarm();
        fail(e);
      }
    });
    // the drive reads the latest refs; these are what can change the answer
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driveTick_, flight, session, blocker, offer, notice]);

  /** Operator events. Reading files arms the drive; any other event stops it (the operator looks). */
  async function dispatch(ev: WizardEvent): Promise<void> {
    operatorActs();
    if (ev.type === 'files' || ev.type === 'reset') setPassed({});
    // STOPFIX: an event is one move (reading files or a reset starts a run of its own)
    await tracked(() =>
      ev.type === 'files' || ev.type === 'reset' ? dispatchRaw(ev) : asMove(() => dispatchRaw(ev)),
    );
    prunePassed();
    if (ev.type === 'files' && !sRef.current.error && sRef.current.sessionId != null) arm();
  }

  /**
   * UXHOOKS: "the missing pages are blank" — the missing cells of the sheet step (all of them, or
   * `only`) added to what each tile sheet already accepted, one `sheet-accept-missing` per sheet.
   */
  async function acceptMissing(
    only?: readonly { sheet?: number; row: number; col: number; file?: string }[],
  ) {
    const missing = sRef.current.sheet?.sheet.missing ?? [];
    const pick = only
      ? missing.filter((m) =>
          only.some(
            (o) =>
              (o.sheet ?? 0) === (m.sheet ?? 0) &&
              o.row === m.row &&
              o.col === m.col &&
              (o.file == null || o.file === m.file),
          ),
        )
      : missing;
    for (const k of [...new Set(pick.map((m) => m.sheet ?? 0))]) {
      await dispatch({
        type: 'sheet-accept-missing',
        sheet: k,
        cells: [
          ...heldCells(sRef.current.sheet?.sheet, k),
          ...pick
            .filter((m) => (m.sheet ?? 0) === k)
            .map((m) => ({
              row: m.row,
              col: m.col,
              ...(m.file != null ? { file: m.file } : {}),
              origin: 'operator' as const,
            })),
        ],
      });
    }
  }

  /**
   * UXHOOKS: "I looked at the outlines set aside" (the pieces step's offer) — bound per tile sheet
   * to the set as it is now (`asideDigests`): the offer is dropped until that set changes.
   */
  function reviewAsides() {
    operatorActs();
    const s = sRef.current;
    const now = asideDigests(
      weakAsides(s.pieces?.setAside, s.pieces?.families, s.pieces?.seeds),
      s.sheet?.sheet.parts,
    );
    const asideReviewed = { ...iRef.current.asideReviewed, ...now };
    iRef.current = { ...iRef.current, asideReviewed };
    patchInputs({ asideReviewed });
  }

  /**
   * SHAPE-KINK: one operator one-shape move (`shape-fix`). Refused (nothing changes) when the
   * check names no such held size, or — fixShape — when the gate says it cannot be straightened.
   */
  async function shapeMove(
    identity: string,
    size: string,
    action: ShapeFixAction | 'clear',
  ): Promise<ShapeMoveResult> {
    const issue = shapeIssueOf(sRef.current, identity, size);
    const asked = shapeSeedOf(sRef.current, identity, size);
    if (action === 'clear') {
      if (asked == null || !iRef.current.shapeFixes?.[shapeFixKey(asked, size)])
        return { ok: false, reason: `no fix or drop asked for ${identity} ${size}` };
    } else if (!issue)
      return { ok: false, reason: `${identity} ${size} is not held by the shape check` };
    else if (action === 'straighten' && !issue.fixable)
      return { ok: false, reason: issue.why || 'not fixable' };
    if (asked == null) return { ok: false, reason: `${identity}: no such piece in this run` };
    await dispatch({ type: 'shape-fix', identity, size, action });
    const err = sRef.current.error;
    return err ? { ok: false, reason: err } : { ok: true, reason: null };
  }

  /** The operator's "next": this step, then on through every step that asks nothing. */
  async function next(): Promise<void> {
    operatorActs();
    if (await asMove(() => forwardMarked(false))) arm();
  }

  /**
   * N1: run forward from the current step while no step asks anything; with `resolve`, a step that
   * asks is offered to it first (AUTOPILOT's policy) — its answer is applied and the step checked
   * again; no answer = the run stops there for the operator.
   */
  function advance(opts: { resolve?: AutoResolver<Inputs>; prefill?: AutoResolver<Inputs> } = {}) {
    stopReq.current = false;
    // STOPFIX: a resume goes on past the operator's own stop (the drive stops on any error)
    if (failureRef.current?.code === 'cancelled' && sRef.current.error) {
      failureRef.current = null;
      setErrorCode(null);
      patch({ error: null });
    }
    if (refusal.current && notice === refusal.current) setNotice(null);
    refusal.current = null;
    // a resume past the namer's outage: acknowledged — the codes are typed without the AI
    if (opts.resolve && notice && notice === namerNote.current) ackedNote.current = notice;
    arm(opts.resolve, opts.prefill);
    // STOPFIX: stopped on the details before they were built — build them first (the drive waits)
    const s = sRef.current;
    if (s.step === 'meaning' && !s.semantics && !s.busy && s.sessionId != null)
      void tracked(async () => {
        try {
          await asMove(buildDetails);
        } catch (e) {
          fail(e);
        }
      });
  }

  /**
   * A2 "this is a piece" on a set-aside outline: its held text seed comes back, else a click at its
   * point that does not supersede the outline seed it lies in (another piece there).
   */
  async function promoteAside(a: SetAside) {
    return addSeed(a.at, a);
  }

  /**
   * PROMOTE-BATCH (Codex): the next free seed id — above every seed the worker may hold: the first
   * run's, the clicks, the seeds on screen and the text seeds held back with a set-aside outline
   * (one of those taken again by a click would promote the wrong outline).
   */
  const nextSeedId = (i: Inputs, extra: readonly Seed[] = []) =>
    Math.max(
      0,
      ...(baseSeeds.current ?? []).map((x) => x.id),
      ...i.clickSeeds.map((x) => x.id),
      ...(sRef.current.pieces?.seeds ?? []).map((x) => x.id),
      ...(sRef.current.pieces?.setAside ?? []).flatMap((a) => (a.seed ? [a.seed.id] : [])),
      ...extra.map((x) => x.id),
    ) + 1;

  /**
   * PROMOTE-BATCH: "these are pieces" on several set-aside outlines at once — the seeds that
   * `promoteAside` gives each, in the order given, with ONE pieces run. One move: a stop — or any
   * failure — undoes the whole batch. An id that is not among the outlines set aside now (read
   * again, a piece already, given twice) is skipped with its reason, never a failure. Returns the
   * seed each promoted aside became (a following piece-edits names them) — only seeds the fill made
   * a piece of; a seed the fill dropped is reported skipped. null = the batch was undone.
   */
  async function promoteAsides(ids: readonly number[]): Promise<PromoteResult | null> {
    operatorActs();
    return asMove(async () => {
      try {
        const i = iRef.current;
        const shown = new Map((sRef.current.pieces?.setAside ?? []).map((a) => [a.id, a]));
        const added: Seed[] = [];
        const want = new Map<number, SeedId>();
        const res: PromoteResult = { seeds: {}, skipped: [] };
        for (const id of ids) {
          const a = shown.get(id);
          if (want.has(id) || !a) {
            res.skipped.push({
              id,
              why: want.has(id)
                ? 'given twice'
                : 'not set aside now (the pieces were read again, or it is a piece already)',
            });
            continue;
          }
          // a seed already given for it that the fill has not taken: used again, not doubled
          const own = [...i.clickSeeds, ...added].find(
            (x) => x.aside === id || (!!a.seed && x.id === a.seed.id),
          );
          const seed: Seed = own ??
            a.seed ?? {
              id: nextSeedId(i, added),
              at: a.at,
              origin: 'click',
              variant: i.variant,
              aside: a.id,
            };
          if (!own) added.push(seed);
          want.set(id, seed.id);
        }
        if (!want.size) return res;
        // Codex: the fill judges a not-a-piece seed against the pieces of the run before
        // (`separator`): with one of those edits, several promotes run one after the other (the
        // runs the clicks make), so the batch never draws what the clicks would not
        const oneByOne = want.size > 1 && i.edits.some((e) => e.kind === 'not-a-piece');
        const fill = async (clicks: readonly Seed[], seeds: readonly Seed[]) => {
          let out: StageIO['pieces']['out'] | null = null;
          for (let k = oneByOne ? Math.min(1, seeds.length) : seeds.length; ; k++) {
            const step = { ...i, clickSeeds: [...clicks, ...seeds.slice(0, k)] };
            iRef.current = step;
            patchInputs({ clickSeeds: step.clickSeeds });
            out = await run('pieces', piecesInput(step));
            patch({ pieces: out });
            settleToPieces();
            if (k >= seeds.length) break;
          }
          return new Set((out?.families ?? []).map((f) => f.seed));
        };
        let made = await fill(i.clickSeeds, added);
        // Codex: a seed the fill made no piece of (another model's held seed, a duplicate label)
        // is taken back and the fill runs once more without it — its outline stays set aside
        const dropped = [...want].filter(([, sd]) => !made.has(sd));
        if (dropped.length) {
          const gone = new Set(dropped.map(([, sd]) => sd));
          made = await fill(
            i.clickSeeds.filter((x) => !gone.has(x.id)),
            added.filter((x) => !gone.has(x.id)),
          );
          for (const [id] of dropped) {
            res.skipped.push({ id, why: 'the fill made no piece of it — left set aside' });
            want.delete(id);
          }
        }
        for (const [id, sd] of want) {
          // still none: the batch is undone rather than handing back a seed with no piece
          if (!made.has(sd)) throw new Error(`promote-asides: no piece came of outline ${id}`);
          res.seeds[id] = sd;
        }
        return res;
      } catch (e) {
        // Codex: any failure undoes the batch (inputs never say "promoted" over pieces that do not)
        if (move.current) move.current.stopped = true;
        fail(e);
        return null;
      }
    });
  }

  /** A click seed: appended to the first run's text seeds (the contract has no 'add' edit). */
  async function addSeed(at: PtMm, aside?: SetAside) {
    operatorActs();
    return asMove(() => addSeedMove(at, aside));
  }
  async function addSeedMove(at: PtMm, aside?: SetAside) {
    try {
      const i = iRef.current;
      const id = nextSeedId(i);
      const seed: Seed = aside?.seed
        ? aside.seed
        : aside
          ? { id, at, origin: 'click', variant: i.variant, aside: aside.id }
          : { id, at, origin: 'click', variant: i.variant };
      const next = { ...i, clickSeeds: [...i.clickSeeds, seed] };
      iRef.current = next;
      patchInputs({ clickSeeds: next.clickSeeds });
      const out = await run('pieces', piecesInput(next));
      patch({ pieces: out });
      settleToPieces();
      return seed.id;
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
    await editNames(new Map([[seed, p]]));
  }

  /** CODE lane: several names in one answer ("name N pieces") — each as if typed (editName). */
  async function editNames(
    edits: ReadonlyMap<SeedId, Partial<Pick<NameDecision, 'code' | 'mods' | 'displayName'>>>,
  ) {
    if (!edits.size) return;
    // STOPFIX (Codex r2): a typed name and its confirmation are undone with the move a stop ends
    operatorActs();
    return asMove(() => editNamesMove(edits));
  }
  async function editNamesMove(
    edits: ReadonlyMap<SeedId, Partial<Pick<NameDecision, 'code' | 'mods' | 'displayName'>>>,
  ) {
    const i = iRef.current;
    const seeds = [...edits.keys()];
    // C7: the AI's fabric call was for the AI's name — an edited name drops it, and an assignment
    // the operator already kept is proposed again without it
    const staleFabric = !!i.assignment?.aiOnly?.some((x) => edits.has(x.seed));
    const next = {
      ...i,
      editedNames: [...new Set([...i.editedNames, ...seeds])],
      confirmedNames: [...new Set([...i.confirmedNames, ...seeds])],
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
    const known = new Set(names.map((n) => n.seed));
    const decisions = [
      ...names.map((n) => (edits.has(n.seed) ? { ...n, ...edits.get(n.seed)! } : n)),
      ...seeds
        .filter((sd) => !known.has(sd))
        .map((sd) => ({
          ...textNameOf(sd, sRef.current.semantics, i.overrides[sd]),
          ...edits.get(sd)!,
        })),
    ];
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

  /**
   * Cause E override: "this size is drawn — use the common outline". The size the sheet reads as
   * not drawn is mapped back (to the card size it would have taken) and filled on its walls as they
   * are; nothing is copied from a neighbour.
   */
  async function drawnAnyway(rank: number) {
    const entries = sRef.current.sizes?.map.entries ?? [];
    const own = (iRef.current.sizeMap ?? []).filter((e) => e.source.rank !== rank);
    const hit = entries.find((e) => e.source.rank === rank);
    if (!hit?.notDrawn) return;
    const { notDrawn, ...rest } = hit;
    await dispatch({
      type: 'size-map',
      entries: [
        ...own,
        { ...rest, card: notDrawn.wouldMap, origin: 'operator', drawnAnyway: true },
      ],
    });
  }

  /** Append (or, with `undo`, drop the last) piece edit and re-run the fill. */
  async function editPieces(e: PieceEdit | 'undo') {
    // STOPFIX (Codex r2): the inputs it sets are part of the move a stop undoes
    operatorActs();
    return asMove(() => editPiecesMove(e));
  }
  async function editPiecesMove(e: PieceEdit | 'undo') {
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
    operatorActs();
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
    operatorActs();
    return asMove(() => answerOutlineMove(meaning, allowanceMm));
  }
  async function answerOutlineMove(meaning: 'cut' | 'seam', allowanceMm: number) {
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

  /**
   * The apply lock for the current draft, taken before the check → apply move (the autopilot);
   * null = no draft, or the lock is already held (an apply is running or done for this draft).
   */
  function lockApply(): number | null {
    const draft = sRef.current.draft;
    if (!draft) return null;
    const held = applyLock.current;
    if (held && held.draft === draft) return null;
    const token = ++lockSeq.current;
    applyLock.current = { draft, token, used: false };
    return token;
  }

  /** Give back a lock `lockApply` took and no apply used (the move to apply did not happen). */
  function unlockApply(token: number) {
    const held = applyLock.current;
    if (held && held.token === token && !held.used) applyLock.current = null;
  }

  /** Why the card is no longer the one this run read (null = the same card). */
  function cardStale(): string | null {
    if (cardAt.current == null) return null;
    if (runCard.current && cardIdentity(runCard.current) !== cardIdentity(cardRef.current))
      return "the card's name / style number changed since this run read it — the model and the sheet were chosen against the old one: nothing was uploaded, go back to sizes to choose them again";
    return cardFingerprint(cardRef.current) === cardAt.current
      ? null
      : 'the card changed since this run read it (sizes, BOM fabrics or its pieces / patterns) — nothing was uploaded: go back to sizes to run against the card as it is now';
  }

  return {
    session,
    inputs,
    apply,
    /** Codex re-check #1 (r4): the card snapshot this run reads (the autopilot reads it too). */
    runCard: rc(),
    /** Codex re-check #1: the card changed since the run read it (the reason), else null. */
    cardStale,
    /** Codex re-check #2: take the apply lock of this draft (null = held already). */
    lockApply,
    unlockApply,
    sheetModes,
    /**
     * RULHOOK: the storage the next write uses, judged against this run's sizes — `ignored` says
     * why an asked base is not used. Set it with `dispatch({ type: 'write-storage', … })`.
     */
    writeStorage: {
      ...writeStorageFor(inputs.writeStorage, writtenTokens(session.sizes)),
      /**
       * STOPFIX: the last re-write after a storage change did not write — the draft on screen is
       * the OLD choice and no apply takes it; null = the draft is the choice shown.
       */
      rewriteError:
        rewriteError &&
        applyLock.current?.token === REWRITE &&
        applyLock.current.draft === session.draft
          ? rewriteError
          : null,
      /** A re-write is running. */
      rewriting: rewriting.current,
    },
    /**
     * SHAPE-KINK (UX-HOOKS §5): straighten `size`'s offending turns of `identity` onto the shape the
     * other sizes share (≤ 6 mm, recorded in the manifest + passport); refused with the reason when
     * the gate's issue says it is not fixable. One move (STOPFIX: a stop undoes it); the draft is
     * written again. `clearShapeFix` takes the move back.
     */
    fixShape: (identity: string, size: string) => shapeMove(identity, size, 'straighten'),
    /** SHAPE-KINK: export `identity` without `size` (explicit, recorded). One move. */
    dropSize: (identity: string, size: string) => shapeMove(identity, size, 'drop'),
    /** SHAPE-KINK: take a fixShape / dropSize back (the size as drawn). One move. */
    clearShapeFix: (identity: string, size: string) => shapeMove(identity, size, 'clear'),
    /** SHAPE-KINK: the one-shape moves asked, `${seed}:${size}` → action. */
    shapeFixes: inputs.shapeFixes ?? {},
    /** STOPFIX: write the check step's draft again with the storage chosen (after a failed one). */
    retryWrite: () =>
      dispatch({ type: 'write-storage', ...(iRef.current.writeStorage ?? { storage: 'blocks' }) }),
    setSheetMode: (scopeKey: string, mode: 'replace' | 'add') => {
      operatorActs();
      setSheetModes((m) => ({ ...m, [scopeKey]: mode }));
    },
    extracted,
    errorCode,
    notice,
    /** A9: what the AI page-role call did (answered, unavailable, timed out) — a note, not a stop. */
    pageRoleNote,
    /** A9 (Codex #4): some AI answers were asked before an edit — "ask the AI again" refreshes them. */
    pageRolesStale: pageHints.current.some((h) => h.stale),
    som,
    clientKind: client.kind,
    blocker,
    /** N1: what the step offers without blocking on it — why the drive stopped here. */
    offer,
    /** N1: how each step was passed without the operator ('auto' ✓ / 'skipped'), still doors. */
    passed,
    advance,
    /** A10: where and why the autopilot's drive stopped (the footer line); null = it did not. */
    driveStop,
    /**
     * AP-replay: what arms the drive when the operator moves on (manual mode) — the replay of a
     * previous import; null = nothing (a step that asks stops for the operator).
     */
    setStanding: (x: { resolve?: AutoResolver<Inputs>; prefill?: AutoResolver<Inputs> } | null) => {
      standing.current = x;
    },
    /** A0.2: the sheet is one page — the stepper shows the step passed over ("1 page"). */
    sheetSkipped:
      !extracted.presegmented && singlePageSheet(session.pages, session.sheet, inputs.gridOverride),
    /** S3: the fingerprint answers are read against (pass to `openQuestions`). */
    answersNow: answersNow(session, inputs),
    sizeTokens,
    baseSeeds: baseSeeds.current,
    dispatch,
    next,
    addSeed,
    promoteAside,
    /** PROMOTE-BATCH: several set-aside outlines are pieces — one pieces run (UX-HOOKS §4). */
    promoteAsides,
    editPieces,
    editName,
    editNames,
    confirmSize,
    setSize,
    drawnAnyway,
    setDrawnSizes: (n: number | null) => dispatch({ type: 'drawn-sizes', n }),
    confirmShown,
    answerOutline,
    /** The steps' own input answers (an operator action: a running drive stops). */
    patchInputs: (p: Partial<Inputs> | ((i: Inputs) => Partial<Inputs>)) => {
      operatorActs();
      patchInputs(p);
    },
    acceptMissing,
    reviewAsides,
    scaleDecision: () => scaleDecision(inputs),
    piecesInput,
    semanticsInput,
    /**
     * STOPFIX: stop the stage in flight AND the move it is part of — no stage starts again until
     * the operator's next action (an event, next, advance, an answer). The run keeps its step, its
     * outputs and every answer; see `stopped` / `restorePending`.
     */
    cancel: () => {
      stopReq.current = true;
      const armed = !!drive.current;
      disarm();
      const idle = !sRef.current.busy;
      client.cancel();
      // PATTERNS: pressed in the gap between two stages (of a move, or two ticks of the drive):
      // nothing in flight to stop — the stop is said now (the stage that would have run next),
      // and the move, when one is open, is undone when it returns
      if (idle && (move.current || armed))
        fail(
          new ImportWorkerError(
            'cancelled',
            'stopped by the operator',
            nextStageOf(sRef.current.step) ?? undefined,
          ),
        );
    },
    /**
     * STOPFIX: what the last stop stopped (`stage`), and whether the importer had to be restarted
     * for it (`restarted`); null once a stage runs again or a new run starts.
     */
    stopped,
    /**
     * STOPFIX: the importer was restarted under the run — the next stage first restores it (the
     * files read again, the stages played again quietly; `session.busy.note` says so meanwhile).
     */
    restorePending,
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
    // the answers' fingerprint carries every outline (S3 T2): the report keeps its scope only
    const { fileList, answerCtx, ...rest } = iRef.current;
    return buildErrorReport({
      session: sRef.current,
      operator: {
        files: fileList.map((f) => ({ name: f.name, bytes: f.size, type: f.type })),
        ...rest,
        answerScope: answerCtx?.scope ?? null,
        confirmedQuantities: Object.fromEntries(
          Object.entries(rest.confirmedQuantities).map(([k, v]) => [k, v?.split(REV_SEP)[0]]),
        ),
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

/** PROMOTE-BATCH: per promoted aside id, the seed id it became; what was skipped and why. */
export type PromoteResult = {
  seeds: Record<number, SeedId>;
  skipped: { id: number; why: string }[];
};

/** Where a name came from, as the manifest records it (lib: ai/dxf-names.ts). */
export { nameOriginOf };

/** Auto matches below the confirm line (F5: < 0.9) that the operator has not answered. */
export const guessedSizes = (entries: readonly SizeMapEntry[]) =>
  entries.filter((e) => e.origin === 'auto' && !!e.card && (e.confidence ?? 1) < 0.9);

/** The map still has a question: a guess, no size reaching the card, or a drawn size left off. */
const sizeMapOpen = (map: SizeMap) =>
  guessedSizes(map.entries).length > 0 ||
  !map.entries.some((e) => e.card) ||
  // a drawn size the automatic map left off the card — a question with card sizes free, an offer
  // past a full card run: either way the sizes step is shown (the DXF fast path stops there too)
  drawnUnmapped(map).length > 0;

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

/** A10: the write's autopilot record — given with the event, else the run's own assumptions. */
function autopilotOf(
  given: AutopilotRecord | undefined,
  own: readonly Assumption[],
  pieces: readonly { seed: SeedId }[],
): { autopilot?: AutopilotRecord } {
  if (given) return { autopilot: given };
  if (!own.length) return {};
  return { autopilot: autopilotRecordOf(own, new Set(pieces.map((p) => p.seed))) };
}
