// Step 6 · DETAILS (contract step `meaning`) — one row per piece: the code (grammar checked as you
// type), the name, how many per garment, fold, the L/R pair, the grainline, the line meaning and
// the allowance. AI names above the threshold arrive accepted but FLAGGED (owner decision 11);
// below it they wait for a click. A piece without a grainline cannot be exported until the
// two-click tool draws one (decision 12) or the operator accepts the proposed one (A1: a line
// drawn with one evidence, or the outline's fold / symmetry axis / straight edge). D3: proposals
// are accepted only from the overview that shows every one of them on its piece — "review N"
// opens it, "accept these N" there applies them (two clicks, nothing accepted unseen).
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AllowanceDecision,
  FoldAsk,
  FoldMiss,
  GradeAnswer,
  GradeAsk,
  LineMeaning,
  NameDecision,
  PieceFamily,
  PtMm,
  SemanticsOutput,
  SeedId,
} from 'lib/pattern-import/types';
import { PATIMPORT } from 'lib/pattern-import/types';
import { cn } from 'lib/utility';
import {
  BackLink,
  Button,
  CheckboxCommon,
  Chip,
  ChipRow,
  DataTable,
  HeaderWarnings,
  Input,
  Pill,
  Text,
  EmptyCell,
} from 'ui';
import type { CardContext } from '../client';
import {
  codeWordsOf,
  identitiesOf,
  identityProblem,
  sizeTokenTest,
} from 'lib/pattern-import/manifest';
import { isKnownCode } from 'lib/pattern-import/dictionary/codes';
import { SHEET_INK, SheetViewport, ptsAttr, vy } from '../sheet-viewport';
import { questionKey } from '../answers';
import type { ImportSessionApi, Inputs } from '../use-import-session';
import { textNameOf } from '../use-import-session';
import { PendingDetails } from './details-pending';
import {
  GradeCanvasMarks,
  GradeSizes,
  gradeAnswerChoices,
  gradeRefusal,
  openGradeAsks,
} from './details-grade';
import {
  ConfirmStrip,
  OutlineQuestion,
  outlineAsked,
  RowQuestions,
  passportWarning,
  qtyOpen,
  rowOpen,
  useOpenQuestions,
} from './details-confirm';
import {
  DebugFold,
  Field,
  Fold,
  NativeSelect,
  NumberField,
  Panel,
  STICKY_END,
  SplitStage,
  ask,
  fmtPct,
  AnsweredAndGoContext,
  AutopilotOnContext,
  type AnsweredAndGo,
  SkipQuiz,
  useAnsweredAndGo,
  useAutoAnswer,
  useLikelySlot,
  useQuizSlot,
} from '../ui-bits';
import { plural } from '../stages';
import { PIECES_REASONS, focusFromBlocked, type PieceFocus } from '../piece-focus';
import { bulkNames, codeBlocked } from '../bulk-names';
import { principalAxis } from '../autopilot/grain';
import { mappedRanks, outlineOf as exportOutlineOf } from '../autopilot/replay-record';

/**
 * Owner 16.10: a grainline in one click. A straight line through the outline's area centroid at
 * `angleDeg` (90 = the sheet's vertical, 0 = its horizontal), 70 % of the piece's extent along it
 * — the autopilot's fallback geometry (autopilot/grain.ts), the direction chosen by the operator.
 * Dispatched exactly like the two clicks: `operatorGrain[seed] = { a, b }`.
 */
function axisGrain(ring: readonly PtMm[], angleDeg: number): { a: PtMm; b: PtMm } | null {
  const ax = ring.length > 2 ? principalAxis(ring) : null;
  if (!ax) return null;
  const t = (angleDeg * Math.PI) / 180;
  const ux = Math.cos(t);
  const uy = Math.sin(t);
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of ring) {
    const d = (p.x - ax.centroid.x) * ux + (p.y - ax.centroid.y) * uy;
    lo = Math.min(lo, d);
    hi = Math.max(hi, d);
  }
  const mid = (lo + hi) / 2;
  const half = Math.max(20, 0.35 * (hi - lo));
  const c = { x: ax.centroid.x + mid * ux, y: ax.centroid.y + mid * uy };
  return {
    a: { x: c.x - half * ux, y: c.y - half * uy },
    b: { x: c.x + half * ux, y: c.y + half * uy },
  };
}

const MEANING: { value: LineMeaning; label: string }[] = [
  { value: 'seam', label: 'seam line' },
  { value: 'cut', label: 'cut line' },
  { value: 'both', label: 'both drawn' },
];
const REASON: Record<string, string> = {
  'no-grain': 'no grainline',
  'offset-hull': 'offset collapsed',
  'offset-self-intersection': 'offset crosses itself',
  'offset-topology': 'offset broke the shape',
  leak: 'outline not closed',
  merged: 'two pieces in one region',
  tiny: 'too small for a piece',
  'non-monotone': 'sizes do not grow',
  grammar: 'code grammar',
  'duplicate-identity': 'code used twice',
  'size-unmapped': 'size not mapped',
  'fold-unresolved': 'fold edge not found',
  'fold-question': 'fold?',
  'facing-fold': 'facing fold line?',
  'one-size-question': 'one piece for all sizes?',
  'sizes-not-distinguished': 'sizes drawn alike',
  'size-count': 'size count open',
  'grade-ambiguous': 'two size layouts fit',
};

/**
 * GUIDED: one thing the step still asks — a blocked piece, a fold question, the cutting list, the
 * file's outline, a count / name to confirm, a code the gate refuses (or the gate's own words).
 */
/** The coach's HOW for an answering control (≤ 8 words; the shell shows it in a bubble). */
const hint = (h: string) => ({ 'data-ask-hint': h });

type Problem = {
  key: string;
  seed: SeedId | null;
  kind:
    | 'blocked'
    | 'fold'
    | 'cutlist'
    | 'outline'
    | 'qty'
    | 'name'
    | 'code'
    | 'gate'
    | 'group'
    | 'grade';
  reason?: string;
  label: string;
  /** A group question (owner 16.10: one question for the same ask on many pieces). */
  group?: Group;
  seeds?: SeedId[];
  /** GRADE P1: the per-size question (non-blocking; asked after every blocking one). */
  grade?: GradeAsk;
};
type Group = 'grain' | 'code' | 'qty' | 'name';

/**
 * The blocked row the footer's "N pieces …" points at — in table order, the same priority as the
 * footer's sentence (grainlines, then fold questions, then any); null = nothing blocked.
 */
export function firstBlockedSeed(
  sem: Pick<SemanticsOutput, 'blocked'> | null | undefined,
  families: readonly PieceFamily[],
): SeedId | null {
  const blocked = sem?.blocked ?? [];
  if (!blocked.length) return null;
  const order = families.filter((f) => f.candidates.every((c) => c.outcome !== 'tiny'));
  const first = (ok: (r: string) => boolean) =>
    order.find((f) => blocked.some((b) => b.seed === f.seed && ok(b.reason)))?.seed ??
    blocked.find((b) => ok(b.reason))?.seed ??
    null;
  const has = (r: string) => blocked.some((b) => b.reason === r);
  return has('no-grain')
    ? first((r) => r === 'no-grain')
    : has('fold-question')
      ? first((r) => r === 'fold-question')
      : first(() => true);
}

/** 'fold-unresolved' in words: which size fails, and why, against which pick. */
function foldMissWords(m: FoldMiss): string {
  if (m.kind === 'no-edge')
    return `size ${m.size}: its outline has no straight edge where the fold you picked on size ${m.refSize} is (a loose match was tried too)`;
  return m.picked
    ? `size ${m.size}: unfolding across the fold you picked fails — ${m.problem}`
    : `size ${m.size}: the fold line drawn in the source does not unfold — ${m.problem}`;
}

/** The candidate edge nearest a click, within 30 mm; null = the click missed every edge. */
function edgeAt(ask: { edges: FoldAsk['edges'] }, pt: PtMm): FoldAsk['edges'][number] | null {
  let best: { e: FoldAsk['edges'][number]; d: number } | null = null;
  for (const e of ask.edges) {
    const dx = e.b.x - e.a.x;
    const dy = e.b.y - e.a.y;
    const t = Math.max(
      0,
      Math.min(1, ((pt.x - e.a.x) * dx + (pt.y - e.a.y) * dy) / (dx * dx + dy * dy || 1)),
    );
    const d = Math.hypot(pt.x - e.a.x - t * dx, pt.y - e.a.y - t * dy);
    if (d <= 30 && (!best || d < best.d)) best = { e, d };
  }
  return best?.e ?? null;
}

export function DetailsStep({
  api,
  card,
  onFixInPieces,
  jump,
}: {
  api: ImportSessionApi;
  card: CardContext;
  /** Back to the pieces step with this piece selected and the reason on screen (M5). */
  onFixInPieces?: (f: PieceFocus) => void;
  /** The footer's "N pieces are blocked": select this row and focus its actions (a new `n` each click). */
  jump?: { seed: SeedId; n: number } | null;
}) {
  const { session, inputs, patchInputs } = api;
  const sem = session.semantics;
  const families = useMemo(() => session.pieces?.families ?? [], [session.pieces]);
  // a blocked piece opens selected: its next action is on screen without a click
  const [sel, setSel] = useState<SeedId | null>(() => firstBlockedSeed(sem, families));
  const [grainA, setGrainA] = useState<PtMm | null>(null);
  // A1: the overview of every proposed grainline (accepting happens only there)
  const [reviewing, setReviewing] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const open = useOpenQuestions(api);
  // E1a: the fold question's click tool (pick the edge the half is unfolded across)
  const [pickingFold, setPickingFold] = useState(false);
  // a blocked state clicked (the row's pill, the footer): the panel's first action takes focus
  const actionsRef = useRef<HTMLDivElement>(null);
  const [focusN, setFocusN] = useState(0);
  // GUIDED: the problem the operator chose in the checklist (a key) or the footer jumped to (a
  // seed); null = the first open one, in the footer's order — answered, it advances by itself
  const [pick, setPick] = useState<{ key?: string; seed?: SeedId } | null>(null);
  // every question seen on this run, in first-seen order: the answered ones stay listed, ticked
  // (the wizard owns it — the step unmounts while a semantics re-run shows the busy screen)
  const seen = useQuizSlot('details', () => new Map<string, Problem>());
  // the groups the operator opened "one by one" (kept while the step remounts on a re-run)
  const split = useQuizSlot('details-split', () => new Set<Group>());
  const [, setSplitN] = useState(0);
  const splitGroup = (g: Group) => {
    split.add(g);
    seen.delete(`grp:${g}`);
    setPick(null);
    setSplitN((n) => n + 1);
  };
  const [synced, setSynced] = useState<string | null>(null);
  // ANSWERED AND GO (ui-bits): a quiz answer that leaves nothing asked moves the step on
  const shellGo = useAnsweredAndGo();
  // GRADE P1: the per-size questions never block, so the shell cannot see them — it would move on
  // past them after any answer. The step's own go hands the shell, AT ONCE, a gate promise: the
  // shell captures the step it is called on (its stepRef) and drops the go if another step is
  // showing by then (back, next, close). The gate resolves only after the answer's re-run is
  // rendered with no per-size question still open, and only for the newest answer (`gen`: a
  // later answer supersedes, so rapid answers forward once); otherwise it never resolves and the
  // shell does nothing. Not cancelled on unmount: the step remounts during every busy re-run.
  const gradeLive = useQuizSlot('details-grade-live', () => ({
    sem: null as SemanticsOutput | null,
    gen: 0,
  }));
  if (sem) {
    gradeLive.sem = sem;
  }
  const autopilotOn = useContext(AutopilotOnContext);
  const go: AnsweredAndGo = (p, opts) => {
    const gen = ++gradeLive.gen;
    // the autopilot on: the shell's go resumes the drive, which never waits for these questions
    if (autopilotOn) return shellGo(p, opts);
    const was = gradeLive.sem;
    const gate = new Promise<void>((resolve) => {
      Promise.resolve(p).then(
        async () => {
          // the re-run's output reaches the slot on its render (≤ 2 s; no re-run: at once)
          for (let k = 0; p && k < 60 && gradeLive.sem === was && gradeLive.gen === gen; k++)
            await new Promise((r) => setTimeout(r, 35));
          if (gradeLive.gen !== gen) return;
          const still = gradeLive.sem ? openGradeAsks(gradeLive.sem).length : 0;
          if (!still) resolve();
        },
        // a failed answer: the step shows its error, nothing moves on
        () => {},
      );
    });
    shellGo(gate, opts);
  };
  // the active question's free answer (a count not offered, a new name) is open
  const [other, setOther] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const showActions = (seed: SeedId) => {
    setPick({ seed });
    setSel(seed);
    setReviewing(false);
    setDrawing(false);
    setGrainA(null);
    setPickingFold(false);
    setFocusN((k) => k + 1);
  };
  const [seenJump, setSeenJump] = useState(jump ?? null);
  if ((jump ?? null) !== seenJump) {
    setSeenJump(jump ?? null);
    if (jump) showActions(jump.seed);
  }
  useEffect(() => {
    if (!focusN) return;
    // the active problem's card holds the answer; the side panel's actions otherwise
    const card = cardRef.current?.querySelector<HTMLElement>('button:not(:disabled), input');
    const el = card ? cardRef.current : actionsRef.current;
    el?.scrollIntoView?.({ block: 'nearest' });
    (card ?? el?.querySelector<HTMLElement>('button:not(:disabled)'))?.focus();
  }, [focusN]);
  // LIKELY ANSWERS (ui-bits): what «skip — decide for me» takes on this step (grade asks: none,
  // they stay open and export as drawn)
  const autoAnswer = useAutoAnswer(api);
  const likelyGrain = useLikelySlot('details-grain');
  const likelyCodes = useLikelySlot('details-codes');
  const likelyQty = useLikelySlot('details-qty');
  const likelyNames = useLikelySlot('details-names');
  if (!sem) return <PendingDetails api={api} />;
  if (!session.sheet) return null;

  // FLY copy 2: the header says what the file's outline IS — the operator's answer, else what the
  // pieces were built with (a measured second line, the sheet's text), else the asked default
  // with the worker's own evidence (incl. "allowances only for some pieces" context).
  const fileAllowance: AllowanceDecision = fileAllowanceShown(
    inputs.fileAllowance,
    sem.pieces.map((p) => p.allowance),
  );
  const nameOf = (seed: SeedId) => session.names.find((n) => n.seed === seed);
  const specsOf = (seed: SeedId) => sem.pieces.filter((p) => p.seed === seed);
  const blockedOf = (seed: SeedId) => sem.blocked.find((b) => b.seed === seed);
  // A1: the grainlines proposed for pieces that have none yet
  const proposals = (sem.grainProposals ?? []).filter((g) => !inputs.operatorGrain[g.seed]);
  const proposalOf = (seed: SeedId) => proposals.find((g) => g.seed === seed);
  /** The outline a one-click grainline is laid on: the largest closed exported size. */
  const grainRing = (seed: SeedId) => {
    const f = families.find((x) => x.seed === seed);
    if (!f) return null;
    return (
      exportOutlineOf(f, mappedRanks(session.sizes?.map)) ??
      f.candidates.find((c) => c.outer.length > 2)?.outer ??
      null
    );
  };
  /**
   * The pieces [all vertical] may lay a grain on: blocked for the grainline only, with no grain the
   * operator already gave (a pair whose mirroring failed keeps its line), no proposal (a fold line
   * proposed as the grain is the operator's choice) and no fold in play (asked, answered, missed).
   * Called from the card, after the fold lookups below exist.
   */
  const bulkVertical = () =>
    sem.blocked
      .filter((b) => b.reason === 'no-grain')
      .map((b) => b.seed)
      .filter(
        (sd) =>
          !inputs.operatorGrain[sd] &&
          !proposalOf(sd) &&
          !inputs.operatorFold[sd] &&
          inputs.overrides[sd]?.unfoldedFold == null &&
          !foldAskOf(sd) &&
          !foldMissOf(sd),
      );
  /** One click: these pieces' grain along the sheet's vertical (90°) or horizontal (0°). */
  const setGrainAxis = (seeds: SeedId[], angleDeg: number) => {
    const lines = seeds.flatMap((sd) => {
      const ring = grainRing(sd);
      const g = ring ? axisGrain(ring, angleDeg) : null;
      return g ? [[sd, g] as const] : [];
    });
    if (!lines.length) return undefined;
    setDrawing(false);
    setGrainA(null);
    return rerun({ operatorGrain: { ...inputs.operatorGrain, ...Object.fromEntries(lines) } });
  };
  /** One proposal, accepted from its card (the side panel shows it dashed on the piece). */
  const acceptProposal = (seed: SeedId) => {
    const g = proposalOf(seed);
    if (!g) return undefined;
    return rerun({
      operatorGrain: {
        ...inputs.operatorGrain,
        [seed]: { a: g.a, b: g.b, accepted: g.evidence },
      },
    });
  };
  const acceptProposals = () => {
    setReviewing(false);
    return rerun({
      operatorGrain: {
        ...inputs.operatorGrain,
        ...Object.fromEntries(
          proposals.map((g) => [g.seed, { a: g.a, b: g.b, accepted: g.evidence }]),
        ),
      },
    });
  };
  // the overview frames the pieces that carry a proposal
  const reviewBox = (() => {
    const boxes = proposals.flatMap((g) => {
      const c = families.find((f) => f.seed === g.seed)?.candidates;
      return c?.length ? [c[c.length - 1].bbox] : [];
    });
    if (!boxes.length) return null;
    return {
      minX: Math.min(...boxes.map((b) => b.minX)),
      minY: Math.min(...boxes.map((b) => b.minY)),
      maxX: Math.max(...boxes.map((b) => b.maxX)),
      maxY: Math.max(...boxes.map((b) => b.maxY)),
    };
  })();
  const mark = (seed: SeedId) => families.findIndex((f) => f.seed === seed) + 1;
  // CODE lane: every piece without a usable code, named in one click (bulk-names.ts) — the
  // autopilot's codes in sheet order, the source's own words kept as names, each still editable
  const unnamed = codeBlocked(sem.blocked);
  const bulk = unnamed.length
    ? bulkNames(
        sem.blocked,
        (sd) => {
          const c = families.find((f) => f.seed === sd)?.candidates;
          return c?.length ? c[c.length - 1].bbox : null;
        },
        // written identities, and the codes other pieces already hold while blocked for another
        // reason (a grainline still to draw): neither is given out again
        [
          ...sem.pieces.map((p) => p.identity),
          ...session.names
            .filter((n) => n.code && !unnamed.some((b) => b.seed === n.seed))
            .map((n) => n.code),
        ],
        card.sizes.map((c) => c.token),
        (sd) => session.pieces?.seeds.find((x) => x.id === sd)?.text?.text ?? null,
      )
    : new Map<SeedId, never>();
  const nameAll = () => api.editNames(bulk);

  /** Re-run semantics with a patch to the operator's answers. */
  const rerun = (
    p: Partial<
      Pick<
        Inputs,
        | 'fileAllowance'
        | 'overrides'
        | 'operatorGrain'
        | 'operatorFold'
        | 'foldListChecked'
        | 'gradeAnswers'
      >
    >,
    send: typeof api.dispatch = api.dispatch,
  ) => {
    const i = { ...inputs, ...p };
    // only an operator answer travels as the file's allowance: a shown 'measured'/'text' value is
    // the worker's own reading and is re-read by it (sent back, it would pass as proven everywhere)
    return send({
      type: 'semantics',
      input: {
        ...api.semanticsInput(i),
        fileAllowance:
          i.fileAllowance?.origin === 'operator'
            ? i.fileAllowance
            : {
                meaning: 'seam',
                allowanceMm: PATIMPORT.defaultAllowanceMm,
                origin: 'default',
                evidence: [],
              },
      },
    });
  };
  const override = (seed: SeedId, o: NonNullable<Inputs['overrides'][SeedId]>) =>
    rerun({
      overrides: { ...inputs.overrides, [seed]: { ...(inputs.overrides[seed] ?? {}), ...o } },
    });
  const setName = (seed: SeedId, p: Partial<Pick<NameDecision, 'code' | 'mods' | 'displayName'>>) =>
    void api.editName(seed, p);
  const foldAskOf = (seed: SeedId) => sem.folds?.find((q) => q.seed === seed);
  /** 'fold-unresolved': the size the answered fold fails in, and the edges to pick again from. */
  const foldMissOf = (seed: SeedId) => sem.foldMisses?.find((m) => m.seed === seed);
  /** Unfold across the picked edge: every size takes its own matching edge (semantics). */
  const pickFold = (seed: SeedId, e: { a: PtMm; b: PtMm }) => {
    setPickingFold(false);
    return rerun({
      operatorFold: { ...inputs.operatorFold, [seed]: { a: e.a, b: e.b } },
      overrides: {
        ...inputs.overrides,
        [seed]: { ...(inputs.overrides[seed] ?? {}), unfoldedFold: true },
      },
    });
  };
  const notFold = (seed: SeedId) => {
    setPickingFold(false);
    const { [seed]: _drop, ...operatorFold } = inputs.operatorFold;
    return rerun({
      operatorFold,
      overrides: {
        ...inputs.overrides,
        [seed]: { ...(inputs.overrides[seed] ?? {}), unfoldedFold: false },
      },
    });
  };
  const confirm = (seed: SeedId) =>
    patchInputs((i) => ({ confirmedNames: [...new Set([...i.confirmedNames, seed])] }));
  /**
   * An answer given on the question card (ANSWERED AND GO): with nothing left to ask the step moves
   * on by itself. The same controls in the side panel (no question open) are row edits: no move.
   */
  const answer = (p?: Promise<unknown>) => {
    if (asking) go(p);
  };

  const selFamily = families.find((f) => f.seed === sel);
  const selSpec = sel != null ? specsOf(sel)[0] : undefined;
  const selRank = selSpec?.sizes[0]?.rank ?? Math.min(2, (selFamily?.candidates.length ?? 1) - 1);
  const selAsk = sel != null ? foldAskOf(sel) : undefined;
  const selMiss = sel != null && !selAsk ? foldMissOf(sel) : undefined;
  // the edges a click picks from: the open question's, or (a pick not found in every size) the
  // edges of the size the pick was made on — never for a fold line the source draws itself
  const selPick: { rank: number; edges: FoldAsk['edges'] } | undefined =
    selAsk ?? (selMiss?.picked && selMiss.edges.length ? selMiss : undefined);
  // a fold question is asked on its own size: show that one, so the edges sit on the outline
  const selOn = selAsk ?? selMiss;
  const selCand = selOn
    ? selFamily?.candidates.find((c) => c.rank === selOn.rank) ?? selFamily?.candidates[selRank]
    : selFamily?.candidates[selRank];
  const selOuter = selCand?.outer;
  const selGrain =
    sel != null
      ? inputs.operatorGrain[sel] ??
        (selSpec && selSpec.pairHand !== 'R' ? selSpec.sizes[0]?.grain : null)
      : null;
  const selProposal = sel != null && !selGrain ? proposalOf(sel) : undefined;

  const rows = families.filter((f) => f.candidates.every((c) => c.outcome !== 'tiny'));
  const startGrain = (seed: SeedId) => {
    setSel(seed);
    setPickingFold(false);
    setGrainA(null);
    setDrawing(true);
  };
  const startFold = (seed: SeedId) => {
    setSel(seed);
    setDrawing(false);
    setGrainA(null);
    setPickingFold(true);
  };
  const codeOf = (seed: SeedId) => {
    const n = nameOf(seed);
    return (n ? [n.code, ...n.mods].filter(Boolean).join('_') : '') || `piece ${mark(seed)}`;
  };
  /** A blocked row whose answer is on the pieces step: go there with the piece selected. */
  const fixInPieces = (seed: SeedId) => {
    const b = blockedOf(seed);
    if (!b || !onFixInPieces) return;
    onFixInPieces(
      focusFromBlocked(
        b,
        codeOf(seed),
        REASON[b.reason] ?? b.reason,
        families.find((f) => f.seed === seed),
      ),
    );
  };

  /**
   * The next action of a blocked row, in the side panel: every reason has a button, or a sentence
   * that says where it is answered — a red word alone is a dead end (owner, 12.10).
   */
  const blockedActions = (seed: SeedId, sentence = true) => {
    const b = blockedOf(seed)!;
    const say = (t: string) => (
      <Text size='micro' variant='label' component='p'>
        {t}
      </Text>
    );
    let body: React.ReactNode;
    switch (b.reason) {
      case 'fold-unresolved': {
        const m = foldMissOf(seed);
        // a pick again needs the edges of the size the pick lies on, and a pick to replace
        const noPick = !m
          ? 'the candidate edges are not known for this piece'
          : !m.picked
            ? 'the fold line is drawn in the source: a picked edge does not replace it'
            : !m.edges.length
              ? `size ${m.refSize} has no straight edge to unfold across`
              : null;
        body = (
          <>
            {m && (
              <Text size='micro' component='p'>
                {foldMissWords(m)}
              </Text>
            )}
            <ChipRow>
              <Chip
                {...ask('details-blocked', !noPick)}
                {...hint('click the fold edge on the piece')}
                disabled={!!noPick}
                title={noPick ?? undefined}
                onClick={() => {
                  setDrawing(false);
                  setGrainA(null);
                  setPickingFold(true);
                }}
              >
                pick the edge again
              </Chip>
              <Chip
                {...ask('details-blocked')}
                onClick={() => answer(notFold(seed))}
                title='the outline is cut exactly as drawn — only if it is the whole piece'
              >
                not a fold
              </Chip>
            </ChipRow>
            {noPick && say(noPick)}
          </>
        );
        break;
      }
      case 'no-grain': {
        const pr = proposalOf(seed);
        body = (
          <>
            <ChipRow>
              {pr && (
                <Chip
                  {...ask('details-blocked')}
                  onClick={() => answer(acceptProposal(seed))}
                  title={`proposed · ${pr.why}`}
                >
                  proposed
                </Chip>
              )}
              <Chip {...ask('details-blocked')} onClick={() => answer(setGrainAxis([seed], 90))}>
                vertical
              </Chip>
              <Chip {...ask('details-blocked')} onClick={() => answer(setGrainAxis([seed], 0))}>
                horizontal
              </Chip>
              <Chip
                {...ask('details-blocked')}
                {...hint('click two points along the grain')}
                onClick={() => startGrain(seed)}
                title='two clicks on the piece: the two ends of the grainline'
              >
                draw it
              </Chip>
            </ChipRow>
          </>
        );
        break;
      }
      case 'fold-question':
        body = (
          <ChipRow>
            <Chip
              {...ask('details-blocked')}
              {...hint('say it is not a fold')}
              onClick={() => answer(notFold(seed))}
            >
              not a fold
            </Chip>
          </ChipRow>
        );
        break;
      // MOOD Ф3.3: a facing fold line read in some sizes only, or a facing cut off at it
      case 'facing-fold':
        body = (
          <>
            <ChipRow>
              {onFixInPieces && (
                <Chip
                  {...ask('details-blocked')}
                  onClick={() => fixInPieces(seed)}
                  title='close the facing of every size on the pieces step'
                >
                  ← fix in pieces
                </Chip>
              )}
              <Chip
                {...ask('details-blocked')}
                onClick={() => answer(notFold(seed))}
                title='the outline is cut exactly as drawn'
              >
                not a fold
              </Chip>
            </ChipRow>
          </>
        );
        break;
      // MOOD Ф5: every size closes on one outline, one evidence says it is one piece for all
      case 'one-size-question':
        body = (
          <>
            <ChipRow>
              <Chip
                {...ask('details-blocked')}
                onClick={() => answer(override(seed, { ungraded: true }))}
                title='written once, cut alike in every size'
              >
                one for all sizes
              </Chip>
              {onFixInPieces && (
                <Chip
                  {...ask('details-blocked')}
                  {...hint('fix it on the pieces step')}
                  onClick={() => fixInPieces(seed)}
                >
                  sizes differ ←
                </Chip>
              )}
            </ChipRow>
          </>
        );
        break;
      case 'grammar':
      case 'duplicate-identity':
        body = (
          <>
            {bulk.has(seed) && (
              <ChipRow>
                <Chip
                  {...ask('details-blocked')}
                  {...hint('name every piece in one click')}
                  onClick={() => answer(nameAll())}
                >
                  name {plural(bulk.size, 'piece')}
                </Chip>
              </ChipRow>
            )}
            {say(`type a code in row ${mark(seed)}`)}
          </>
        );
        break;
      case 'size-unmapped':
      case 'size-count':
        body = (
          <>
            <ChipRow>
              <Chip
                {...ask('details-blocked')}
                onClick={() => void api.dispatch({ type: 'back', to: 'sizes' })}
                title={
                  b.reason === 'size-count'
                    ? 'say how many sizes the sheet draws on the sizes step'
                    : 'map this size to a card size on the sizes step'
                }
              >
                ← fix in sizes
              </Chip>
            </ChipRow>
          </>
        );
        break;
      case 'offset-hull':
      case 'offset-self-intersection':
      case 'offset-topology':
        body = say('check line & allowance, or the outline in pieces');
        break;
      default:
        body = PIECES_REASONS.has(b.reason) ? (
          onFixInPieces ? (
            <BackLink {...ask('details-blocked')} onClick={() => fixInPieces(seed)}>
              fix in pieces
            </BackLink>
          ) : (
            say('fixed on the pieces step')
          )
        ) : null;
    }
    return (
      <div className='mt-1 flex flex-col items-start gap-1'>
        {/* no grainline: the button says it, the footer's ask line says why — no third sentence */}
        {sentence && b.reason !== 'no-grain' && (
          <Text size='micro' component='p' className='text-error'>
            ! {REASON[b.reason] ?? b.reason}
            {b.reason === 'fold-unresolved' && foldMissOf(seed) ? '' : ` — ${b.detail}`}
          </Text>
        )}
        {body}
      </div>
    );
  };

  /** E1a: the fold question's answers (the edge is picked on the drawing at the right). */
  const foldAskActions = (seed: SeedId, sentence: boolean) => {
    const fa = foldAskOf(seed);
    if (!fa) return null;
    return (
      <div className='mt-1 flex flex-col gap-1'>
        {sentence && (
          <Text
            size='micro'
            component='p'
            className='text-error'
            title={
              fa.evidence.length
                ? `sheet: ${fa.evidence.map((t) => `«${t}»`).join(', ')}`
                : undefined
            }
          >
            ! fold? {fa.why}
          </Text>
        )}
        <ChipRow>
          {fa.suggested != null && (
            <Chip
              {...ask('details-fold-edge')}
              {...hint('unfold on the suggested solid edge')}
              onClick={() => answer(pickFold(seed, fa.edges[fa.suggested!]))}
            >
              solid edge
            </Chip>
          )}
          <Chip
            {...ask('details-fold-edge')}
            selected={pickingFold && sel === seed}
            pressed={pickingFold && sel === seed}
            disabled={!fa.edges.length}
            title={
              fa.edges.length
                ? undefined
                : 'no straight edge to unfold across: draw the whole piece, or not a fold'
            }
            onClick={() => startFold(seed)}
          >
            pick edge
          </Chip>
          <Chip {...ask('details-fold-edge')} onClick={() => answer(notFold(seed))}>
            not a fold
          </Chip>
        </ChipRow>
      </div>
    );
  };

  const outlineOpen = outlineAsked(api, fileAllowance);
  // what the file's outline answer rests on, and what it does to the cut: the fields' tooltip
  const fileNote = `${
    fileAllowance.origin === 'operator'
      ? 'set by you'
      : fileAllowance.evidence.join(' · ') || fileAllowance.origin
  } — ${outlineNote(fileAllowance)}`;
  const isSizeToken = sizeTokenTest(api.sizeTokens);
  /** One row as the table shows it: the spec, else the namer's reading off the sheet. */
  const rowData = (seed: SeedId) => {
    const specs = specsOf(seed);
    // No AI answer for this piece (not logged in, AI off): show what the sheet text gave the
    // spec; typing a code makes it the operator's.
    const ov0 = inputs.overrides[seed];
    const n = nameOf(seed) ?? (specs.length || ov0?.code ? textNameOf(seed, sem, ov0) : undefined);
    const ov = inputs.overrides[seed] ?? {};
    // A blocked piece has no spec yet: fall back to what the namer read off the sheet.
    const pair: 'L' | 'R' | null =
      ov.pairHand !== undefined
        ? ov.pairHand
        : specs.length
          ? specs[0].pairHand ?? null
          : n?.suggestion?.pair
            ? 'L'
            : null;
    const unfolded =
      ov.unfoldedFold ?? (specs.length ? specs[0].unfoldedFold : !!n?.suggestion?.onFold);
    const allowance = ov.allowance ?? specs[0]?.allowance ?? fileAllowance;
    const grainOrigin = inputs.operatorGrain[seed]
      ? inputs.operatorGrain[seed]?.accepted
        ? 'accepted'
        : 'drawn'
      : specs[0]?.sizes[0]?.grain
        ? 'found'
        : null;
    const code = n ? [n.code, ...n.mods].filter(Boolean).join('_') : '';
    const aiName = !!n && n.source === 'ai' && !inputs.editedNames.includes(seed);
    return { specs, n, pair, unfolded, allowance, grainOrigin, code, aiName };
  };
  /** The code's problem as the code field shows it (the gate's G11 rule); null = it passes. */
  const codeWhy = (d: ReturnType<typeof rowData>) =>
    codeProblem(d.code, d.pair, isSizeToken, d.aiName);
  // ── GUIDED: every problem of the step as a question, in the footer's order (its ask line
  // names the first): blocked pieces (grainlines, then fold questions, then the rest —
  // firstBlockedSeed), the cutting list, the outline, the counts and names, then the codes ──
  const pieceWord = (seed: SeedId) => nameOf(seed)?.displayName || codeOf(seed);
  const problems: Problem[] = [];
  {
    const order = [...new Set([...rows.map((f) => f.seed), ...sem.blocked.map((b) => b.seed)])];
    const taken = new Set<SeedId>();
    const blockedPass = (ok: (r: string) => boolean) => {
      for (const seed of order) {
        if (taken.has(seed)) continue;
        const b = sem.blocked.find((x) => x.seed === seed && ok(x.reason));
        if (!b) continue;
        taken.add(seed);
        const w = pieceWord(seed);
        problems.push({
          key: `blk:${seed}:${b.reason}`,
          seed,
          kind: 'blocked',
          reason: b.reason,
          label:
            b.reason === 'no-grain'
              ? `${w}: grain direction?`
              : b.reason === 'fold-question'
                ? `${w}: cut on fold?`
                : b.reason === 'grammar' || b.reason === 'duplicate-identity'
                  ? `${w}: code?`
                  : `${w}: ${REASON[b.reason] ?? b.reason}`,
        });
      }
    };
    // owner 16.10: the file-wide questions first — one answer for every piece
    if (outlineOpen)
      problems.push({
        key: 'outline',
        seed: null,
        kind: 'outline',
        label: 'the drawn outline is…',
      });
    if (sem.foldList)
      problems.push({
        key: 'cutlist',
        seed: null,
        kind: 'cutlist',
        label: 'cutting list folds right?',
      });
    blockedPass((r) => r === 'no-grain');
    blockedPass((r) => r === 'fold-question');
    blockedPass(() => true);
    for (const seed of order)
      if (!taken.has(seed) && foldAskOf(seed)) {
        taken.add(seed);
        problems.push({
          key: `fold:${seed}`,
          seed,
          kind: 'fold',
          label: `${pieceWord(seed)}: cut on fold?`,
        });
      }
    for (const f of rows) {
      const seed = f.seed;
      if (taken.has(seed)) continue;
      const d = rowData(seed);
      if (qtyOpen(open, seed))
        problems.push({
          key: `qty:${seed}`,
          seed,
          kind: 'qty',
          label: `${pieceWord(seed)}: how many${d.pair ? ' per hand' : ''}?`,
        });
      if (open.name.some((u) => u.seed === seed) || open.aiNames.some((n) => n.seed === seed))
        problems.push({
          key: `name:${seed}`,
          seed,
          kind: 'name',
          label: `name «${pieceWord(seed)}» right?`,
        });
    }
    for (const f of rows)
      if (!taken.has(f.seed) && !rowOpen(open, f.seed) && codeWhy(rowData(f.seed)))
        problems.push({
          key: `code:${f.seed}`,
          seed: f.seed,
          kind: 'code',
          label: `${pieceWord(f.seed)}: code?`,
        });
    // what the footer still asks that no question above carries: said in its own words
    if (!problems.length && api.blocker)
      problems.push({ key: `gate:${api.blocker}`, seed: null, kind: 'gate', label: api.blocker });
    // GRADE P1: the per-size questions come after every blocking one — they never hold the step
    for (const g of openGradeAsks(sem))
      problems.push({
        key: `grade:${g.key}`,
        seed: g.seed,
        kind: 'grade',
        grade: g,
        // the piece's name, else the identity the ask is written for (a piece not named yet)
        label: `${nameOf(g.seed)?.displayName || g.identity || pieceWord(g.seed)}: ${g.question}`,
      });
    // owner 16.10: the same ask on two or more pieces is ONE question (grain, codes, counts,
    // names); "one by one" opens a group back into its pieces (names stay one list)
    const groupOf = (p: Problem): Group | null =>
      p.kind === 'blocked' && p.reason === 'no-grain'
        ? 'grain'
        : p.kind === 'code' ||
            (p.kind === 'blocked' && (p.reason === 'grammar' || p.reason === 'duplicate-identity'))
          ? 'code'
          : p.kind === 'qty'
            ? 'qty'
            : p.kind === 'name'
              ? 'name'
              : null;
    const members = new Map<Group, Problem[]>();
    for (const p of problems) {
      const g = groupOf(p);
      if (g) members.set(g, [...(members.get(g) ?? []), p]);
    }
    const grouped: Problem[] = [];
    const placed = new Set<Group>();
    for (const p of problems) {
      const g = groupOf(p);
      const m = g ? members.get(g)! : [];
      if (!g || m.length < 2 || (g !== 'name' && split.has(g))) {
        grouped.push(p);
        continue;
      }
      if (placed.has(g)) continue;
      placed.add(g);
      const n = m.length;
      grouped.push({
        key: `grp:${g}`,
        seed: m[0].seed,
        seeds: m.flatMap((x) => (x.seed != null ? [x.seed] : [])),
        kind: 'group',
        group: g,
        label:
          g === 'grain'
            ? `${n} pieces: grain direction?`
            : g === 'code'
              ? `codes of ${n} pieces?`
              : g === 'qty'
                ? `${n} counts right?`
                : 'names right?',
      });
    }
    problems.splice(0, problems.length, ...grouped);
  }
  for (const p of problems) seen.set(p.key, p);
  const listed = [...seen.values()];
  const active =
    (pick &&
      problems.find((p) =>
        pick.key != null ? p.key === pick.key : pick.seed != null && p.seed === pick.seed,
      )) ||
    problems[0] ||
    null;
  // the file-wide questions (outline, cutting list) have no piece of their own: the preview shows
  // the largest piece — the one the outline's picture answers are drawn from
  const bigSeed =
    [...rows].sort(
      (x, y) =>
        (y.candidates[y.candidates.length - 1]?.areaMm2 ?? 0) -
        (x.candidates[x.candidates.length - 1]?.areaMm2 ?? 0),
    )[0]?.seed ?? null;
  const pieceOf = (p: Problem): SeedId | null =>
    p.seed ?? (p.kind === 'outline' ? bigSeed : sel ?? bigSeed);
  // the canvas (left) always shows the piece of the active question (a new question moves it
  // there) — never "select a row" while a question is open
  if (active && active.key !== synced) {
    setSynced(active.key);
    setOther(false);
    const want = pieceOf(active);
    if (want != null && want !== sel && !reviewing) {
      setSel(want);
      setDrawing(false);
      setGrainA(null);
      setPickingFold(false);
    }
  } else if (active && active.kind !== 'gate' && sel == null && bigSeed != null && !reviewing)
    setSel(pieceOf(active) ?? bigSeed);

  // owner 16.10: while a question is open only "question k of n" and its one card are on screen
  // (the full list was information nobody acts on; the table's state cells still jump to any row)
  // skip: the grain proposals accepted, codes in sheet order, counts and names as shown
  const busyNow = !!session.busy;
  likelyGrain.current =
    proposals.length && !busyNow
      ? {
          key: 'details-blocked',
          what: plural(proposals.length, 'grainline'),
          answer: 'as proposed',
          sig: proposals.map((g) => g.seed).join(','),
          likely: () => {
            setReviewing(false);
            return rerun(
              {
                operatorGrain: {
                  ...inputs.operatorGrain,
                  ...Object.fromEntries(
                    proposals.map((g) => [g.seed, { a: g.a, b: g.b, accepted: g.evidence }]),
                  ),
                },
              },
              autoAnswer,
            );
          },
        }
      : null;
  likelyCodes.current =
    bulk.size && !busyNow
      ? {
          key: 'details-blocked',
          what: `codes of ${plural(bulk.size, 'piece')}`,
          answer: 'in sheet order',
          sig: [...bulk.keys()].join(','),
          likely: () => nameAll(),
        }
      : null;
  const qtyLive = rows.flatMap((f) => {
    const u = qtyOpen(open, f.seed);
    return u ? [{ sd: f.seed, key: questionKey(u, api.answersNow) }] : [];
  });
  likelyQty.current =
    qtyLive.length && !busyNow
      ? {
          key: 'details-confirm',
          what: plural(qtyLive.length, 'count'),
          answer: 'as shown',
          sig: qtyLive.map((x) => `${x.sd}:${x.key}`).join(','),
          likely: async () =>
            api.patchInputs((i) => ({
              confirmedQuantities: {
                ...i.confirmedQuantities,
                ...Object.fromEntries(qtyLive.map(({ sd, key }) => [sd, key])),
              },
            })),
        }
      : null;
  const namesLive = [
    ...new Set([...open.name.map((u) => u.seed), ...open.aiNames.map((n) => n.seed)]),
  ].filter((sd) => rows.some((f) => f.seed === sd));
  likelyNames.current =
    namesLive.length && !busyNow
      ? {
          key: 'details-confirm',
          what: plural(namesLive.length, 'name'),
          answer: 'as shown',
          sig: namesLive.join(','),
          likely: async () =>
            api.patchInputs((i) => ({
              confirmedNames: [...new Set([...i.confirmedNames, ...namesLive])],
            })),
        }
      : null;
  const checklist = !listed.length ? null : !problems.length ? (
    <Text size='micro' variant='label' component='p' className='uppercase tracking-label'>
      all fixed ✓
    </Text>
  ) : (
    <Text size='micro' variant='label' component='p' className='uppercase tracking-label'>
      {/* k counts the answered ones: it only grows, whichever question comes next */}
      question {listed.length - problems.length + 1} of {listed.length}
    </Text>
  );

  /** A question is open on its card: the step shows that card and nothing else to read. */
  const asking = !!active && active.kind !== 'gate';
  /** Is the open question the no-grain (or fold) question of this very piece? */
  const activeIsFor = (seed: SeedId, what: 'grain' | 'fold') => {
    if (!active) return false;
    if (what === 'grain')
      return (
        (active.kind === 'blocked' && active.reason === 'no-grain' && active.seed === seed) ||
        (active.kind === 'group' && active.group === 'grain' && !!active.seeds?.includes(seed))
      );
    return (
      active.seed === seed &&
      (active.kind === 'fold' ||
        (active.kind === 'blocked' &&
          (active.reason === 'fold-question' || active.reason === 'fold-unresolved')))
    );
  };

  /** The outline a question shows: the size the piece is built on, else the largest drawn. */
  const outerOf = (seed: SeedId) => {
    const c = families.find((f) => f.seed === seed)?.candidates ?? [];
    const r = specsOf(seed)[0]?.sizes[0]?.rank;
    return (c.find((x) => x.rank === r) ?? c[c.length - 1])?.outer ?? [];
  };
  /** A count asked: keep it as the sheet shows it (that question only, like confirm-as-shown). */
  const confirmQty = (seed: SeedId) => {
    const u = qtyOpen(open, seed);
    if (!u) return;
    api.patchInputs((i) => ({
      confirmedQuantities: { ...i.confirmedQuantities, [seed]: questionKey(u, api.answersNow) },
    }));
  };

  /** GRADE P1: the spec a per-size question is drawn from (its identity, else the piece's first). */
  const gradeSpecOf = (g: GradeAsk) =>
    specsOf(g.seed).find((x) => x.identity === g.identity) ?? specsOf(g.seed)[0];
  /**
   * GRADE P1: an answer to a per-size question re-runs semantics with `gradeAnswers[key]`.
   * ANSWERED AND GO through the step's own go: it moves on only when no per-size question is left
   * open — a refused all / none keeps its question open (and on screen, with the reason).
   */
  const answerGrade = (g: GradeAsk, a: GradeAnswer) => {
    go(rerun({ gradeAnswers: { ...(inputs.gradeAnswers ?? {}), [g.key]: a } }));
  };

  /** The active question: a picture, the question, and only the answers the session takes. */
  const problemCard = (p: Problem) => {
    const busy = !!session.busy;
    // the proposals overview is open on the left: the card answers it (accept, or back)
    const reviewOpen = reviewing && proposals.length > 0 && !!reviewBox;
    const reviewAnswers = (
      <span className='flex flex-col items-stretch gap-1.5'>
        <Button
          {...ask('details-grain-accept')}
          // every proposal is on screen (left): accepting them is the seen, one-click fix
          data-ask-fix=''
          variant='secondary'
          size='xs'
          disabled={busy}
          onClick={() => answer(acceptProposals())}
        >
          accept these {proposals.length}
        </Button>
        <Button variant='underline' size='xs' onClick={() => setReviewing(false)}>
          back
        </Button>
      </span>
    );
    const seed = p.seed;
    let why: string | null = null;
    let answers: React.ReactNode = null;
    if (p.kind === 'outline') {
      why = 'the sheet does not say whether the seam allowance is in the drawing';
      // the pictures are drawn from the largest piece (the one on the canvas): it reads best there
      answers = (
        <OutlineQuestion
          api={api}
          current={fileAllowance}
          outer={bigSeed != null ? grainRing(bigSeed) ?? outerOf(bigSeed) : []}
        />
      );
    } else if (p.kind === 'group' && p.seeds) {
      const sds = p.seeds;
      const oneByOne = (
        <Button variant='underline' size='xs' disabled={busy} onClick={() => splitGroup(p.group!)}>
          one by one
        </Button>
      );
      if (p.group === 'grain') {
        const bulkSeeds = bulkVertical();
        const props = proposals.filter((g) => sds.includes(g.seed));
        why = 'the sheet draws no grainline on these pieces';
        answers = reviewOpen ? (
          reviewAnswers
        ) : (
          <span className='flex flex-col items-stretch gap-1.5'>
            {props.length > 0 && (
              <Button
                {...ask('details-blocked')}
                // the fix opens the overview; there "accept these N" is the fix (nothing unseen)
                data-ask-fix='details-blocked'
                variant='secondary'
                size='xs'
                disabled={busy}
                title='every proposed grainline on its piece (left), then accept them together'
                onClick={() => setReviewing(true)}
              >
                all proposed ({props.length})
              </Button>
            )}
            {bulkSeeds.length > 0 && (
              <Button
                {...ask('details-blocked')}
                variant='secondary'
                size='xs'
                disabled={busy}
                title={`the ${bulkSeeds.length} pieces with no grainline, no proposal and no fold: straight grain along the sheet's vertical`}
                onClick={() => answer(setGrainAxis(bulkSeeds, 90))}
              >
                all vertical ({bulkSeeds.length})
              </Button>
            )}
            {oneByOne}
          </span>
        );
      } else if (p.group === 'code') {
        why = 'the export writes the code on every block';
        answers = (
          <span className='flex flex-col items-stretch gap-1.5'>
            {bulk.size > 0 && (
              <Button
                {...ask('details-blocked')}
                variant='secondary'
                size='xs'
                disabled={busy}
                title='codes in sheet order; the sheet words stay the names'
                onClick={() => answer(nameAll())}
              >
                name {plural(bulk.size, 'piece')}
              </Button>
            )}
            {oneByOne}
          </span>
        );
      } else if (p.group === 'qty') {
        why = 'no sheet text gives these counts';
        // each piece with the count it is built with now and why it is asked; [all right]
        // confirms exactly these shown entries (a count that changed since is left open)
        const shown = sds.flatMap((sd) => {
          const u = qtyOpen(open, sd);
          return u ? [{ sd, u, key: questionKey(u, api.answersNow) }] : [];
        });
        answers = (
          <span className='flex flex-col items-stretch gap-1.5'>
            {shown.map(({ sd, u }) => (
              <span key={sd} className='flex flex-col gap-0.5'>
                <span className='flex items-center gap-1.5'>
                  <MarkBox n={mark(sd)} />
                  <Text size='micro' component='span' className='min-w-0 flex-1 truncate'>
                    {pieceWord(sd)}
                  </Text>
                  <Text size='micro' component='span'>
                    {u.shown}
                  </Text>
                  {u.foldAlt && (
                    <Chip
                      tone='attention'
                      disabled={busy}
                      title='one long straight edge: this outline may be the half of a piece cut on fold — pick the fold edge next'
                      onClick={() => {
                        override(sd, { unfoldedFold: true });
                        startFold(sd);
                      }}
                    >
                      on fold?
                    </Chip>
                  )}
                </span>
                <Text size='micro' variant='label' component='span'>
                  {u.detail}
                </Text>
              </span>
            ))}
            <Button
              {...ask('details-confirm')}
              variant='secondary'
              size='xs'
              disabled={busy || !shown.length}
              title='keep every count exactly as listed'
              // keep counts as shown: what the file builds now, each still editable
              data-ask-fix=''
              onClick={() => {
                const live = shown.filter(({ sd, key }) => {
                  const u = qtyOpen(open, sd);
                  return u && questionKey(u, api.answersNow) === key;
                });
                api.patchInputs((i) => ({
                  confirmedQuantities: {
                    ...i.confirmedQuantities,
                    ...Object.fromEntries(live.map(({ sd, key }) => [sd, key])),
                  },
                }));
                answer();
              }}
            >
              all right
            </Button>
            {oneByOne}
          </span>
        );
      } else {
        // names: one list, each name editable where it stands, one answer for all
        why = 'names read off the sheet or proposed: keep them, or type over one';
        answers = (
          <span className='flex flex-col items-stretch gap-1.5'>
            {sds.map((sd) => {
              const n = rowData(sd).n;
              return (
                <label key={sd} className='flex items-center gap-1.5'>
                  <MarkBox n={mark(sd)} />
                  <Input
                    key={n?.displayName ?? ''}
                    defaultValue={n?.displayName ?? ''}
                    aria-label={`name of piece ${mark(sd)}`}
                    className='h-[22px] min-w-0 flex-1'
                    onBlur={(e: React.FocusEvent<HTMLInputElement>) => {
                      const v = e.currentTarget.value.trim();
                      if (v !== (n?.displayName ?? '')) setName(sd, { displayName: v });
                    }}
                  />
                </label>
              );
            })}
            <Button
              {...ask('details-confirm')}
              variant='secondary'
              size='xs'
              disabled={busy}
              // keep the names as shown: each stays editable in the table
              data-ask-fix=''
              onClick={() => {
                patchInputs((i) => ({
                  confirmedNames: [...new Set([...i.confirmedNames, ...sds])],
                }));
                answer();
              }}
            >
              all right
            </Button>
          </span>
        );
      }
    } else if (p.kind === 'blocked' && seed != null) {
      const b = blockedOf(seed);
      const pr = proposalOf(seed);
      if (p.reason === 'no-grain') {
        why = pr ? `proposed: ${pr.why}` : 'the sheet draws no grainline on this piece';
        const bulkSeeds = bulkVertical();
        const many = bulkSeeds.length >= 2;
        answers = reviewOpen ? (
          reviewAnswers
        ) : (
          <span className='flex flex-col items-stretch gap-1.5'>
            {proposals.length >= 2 && (
              // every proposal at once: the overview shows each on its piece, "accept these N"
              // there applies them (D3: nothing accepted unseen) — two clicks for the whole file
              <Button
                {...ask('details-blocked')}
                data-ask-fix='details-blocked'
                variant='secondary'
                size='xs'
                disabled={busy}
                title='every proposed grainline on its piece, then accept them together'
                onClick={() => setReviewing(true)}
              >
                all proposed ({proposals.length})
              </Button>
            )}
            {many && (
              <Button
                {...ask('details-blocked')}
                variant='secondary'
                size='xs'
                disabled={busy}
                title={`the ${bulkSeeds.length} pieces with no grainline, no proposal and no fold: straight grain along the sheet's vertical`}
                onClick={() => answer(setGrainAxis(bulkSeeds, 90))}
              >
                all vertical ({bulkSeeds.length})
              </Button>
            )}
            {pr && (
              <Button
                {...ask('details-blocked')}
                // the proposal is drawn dashed on the piece (left): seen, so the one-click fix
                {...(proposals.length < 2 ? { 'data-ask-fix': 'details-blocked' } : {})}
                variant='secondary'
                size='xs'
                disabled={busy}
                title={`the dashed line on the piece · ${pr.why}`}
                onClick={() => answer(acceptProposal(seed))}
              >
                proposed
              </Button>
            )}
            <Button
              {...ask('details-blocked')}
              variant='secondary'
              size='xs'
              disabled={busy}
              title="straight grain along the sheet's vertical"
              onClick={() => answer(setGrainAxis([seed], 90))}
            >
              vertical
            </Button>
            <Button
              {...ask('details-blocked')}
              variant='secondary'
              size='xs'
              disabled={busy}
              title="straight grain along the sheet's horizontal"
              onClick={() => answer(setGrainAxis([seed], 0))}
            >
              horizontal
            </Button>
            <Button
              {...ask('details-blocked')}
              {...hint('click two points along the grain')}
              variant='secondary'
              size='xs'
              disabled={busy}
              title='two clicks on the piece at the right: the two ends of the grainline'
              onClick={() => startGrain(seed)}
            >
              draw it
            </Button>
          </span>
        );
      } else if (p.reason === 'grammar' || p.reason === 'duplicate-identity') {
        why = b?.detail ?? null;
        answers = (
          <span className='flex flex-col items-stretch gap-1.5'>
            {codeField(seed)}
            {bulk.has(seed) && (
              <Button
                {...ask('details-blocked')}
                {...hint('name every piece in one click')}
                variant='secondary'
                size='xs'
                onClick={() => answer(nameAll())}
              >
                name {plural(bulk.size, 'piece')}
              </Button>
            )}
          </span>
        );
      } else {
        why = foldAskOf(seed)?.why ?? b?.detail ?? null;
        answers = foldAskOf(seed) ? foldAskActions(seed, false) : blockedActions(seed, false);
      }
    } else if (p.kind === 'fold' && seed != null) {
      why = foldAskOf(seed)?.why ?? null;
      answers = foldAskActions(seed, false);
    } else if (p.kind === 'cutlist' && sem.foldList) {
      why = `the list says ${sem.foldList.entries.map((e) => `«${e}»`).join(', ')} is cut on fold; no piece here is marked so: tick unfold on it in all pieces${
        sem.foldList.bound.length
          ? ` · ${sem.foldList.bound.length} other ${sem.foldList.bound.length === 1 ? 'entry is' : 'entries are'} asked on ${sem.foldList.bound.length === 1 ? 'its piece' : 'their pieces'}`
          : ''
      }`;
      answers = (
        <Button
          {...ask('details-fold-list')}
          {...hint('tick unfold, or confirm the list')}
          variant='secondary'
          size='xs'
          onClick={() =>
            answer(
              rerun({
                foldListChecked: [
                  ...new Set([...inputs.foldListChecked, ...sem.foldList!.entries]),
                ],
              }),
            )
          }
        >
          list is right
        </Button>
      );
    } else if (p.kind === 'qty' && seed != null) {
      const d = rowData(seed);
      const q = qtyOpen(open, seed);
      const shown = d.specs[0]?.piecesPerGarment ?? 1;
      const alt = shown === 1 ? 2 : 1;
      why = [q?.detail, d.pair ? 'counted per hand: 1 = one left + one right' : '']
        .filter(Boolean)
        .join(' · ');
      answers = (
        <span className='flex flex-col items-stretch gap-1.5'>
          <Button
            {...ask('details-confirm')}
            {...hint('pick how many per garment')}
            // the count as shown: the one-click fix
            data-ask-fix=''
            variant='secondary'
            size='xs'
            disabled={busy}
            onClick={() => {
              confirmQty(seed);
              answer();
            }}
          >
            {shown}
          </Button>
          <Button
            variant='secondary'
            size='xs'
            disabled={busy}
            onClick={() => answer(override(seed, { piecesPerGarment: alt }))}
          >
            {alt}
          </Button>
          {other ? (
            <NumberField
              value={shown}
              min={1}
              aria-label={`pieces per garment${d.pair ? ' per hand' : ''} of piece ${mark(seed)}`}
              className='w-12'
              onCommit={(v) =>
                v && v !== shown
                  ? answer(override(seed, { piecesPerGarment: Math.round(v) }))
                  : undefined
              }
            />
          ) : (
            <Button variant='secondary' size='xs' disabled={busy} onClick={() => setOther(true)}>
              other…
            </Button>
          )}
          {q && (
            <Button
              variant='underline'
              size='xs'
              disabled={busy}
              title='the outline is the half of a piece cut on fold: pick the fold edge next'
              onClick={() => {
                override(seed, { unfoldedFold: true });
                startFold(seed);
              }}
            >
              {q.foldAlt ? 'on fold (likely)' : 'on fold'}
            </Button>
          )}
        </span>
      );
    } else if (p.kind === 'name' && seed != null) {
      const n = rowData(seed).n;
      why =
        open.name.find((u) => u.seed === seed)?.detail ??
        'an AI name below the auto-accept threshold';
      answers = (
        <span className='flex flex-col items-stretch gap-1.5'>
          <Button
            {...ask('details-confirm')}
            {...hint('keep the name, or rename it')}
            // the name as shown: the one-click fix
            data-ask-fix=''
            variant='secondary'
            size='xs'
            disabled={busy}
            onClick={() => {
              confirm(seed);
              answer();
            }}
          >
            keep it
          </Button>
          {other ? (
            <>
              {codeField(seed)}
              <Input
                key={n?.displayName ?? ''}
                defaultValue={n?.displayName ?? ''}
                aria-label={`name of piece ${mark(seed)}`}
                className='h-[22px] w-28'
                onBlur={(e: React.FocusEvent<HTMLInputElement>) => {
                  const v = e.currentTarget.value.trim();
                  if (v !== (n?.displayName ?? '')) setName(seed, { displayName: v });
                }}
              />
            </>
          ) : (
            <Button variant='secondary' size='xs' disabled={busy} onClick={() => setOther(true)}>
              rename…
            </Button>
          )}
        </span>
      );
    } else if (p.kind === 'code' && seed != null) {
      why = `${codeWhy(rowData(seed))} — the export writes this code on every block`;
      answers = codeField(seed);
    } else if (p.kind === 'grade' && p.grade) {
      const g = p.grade;
      const refusal = gradeRefusal(sem, g);
      why = 'the export goes on as drawn either way; the answer is written to the passport';
      answers = (
        <span className='flex flex-col items-stretch gap-1.5'>
          <GradeSizes ask={g} spec={gradeSpecOf(g)} />
          {gradeAnswerChoices(g).map((c) => (
            <span key={c.label} className='flex flex-col items-stretch gap-0.5'>
              <Button
                variant='secondary'
                size='xs'
                disabled={busy}
                title={c.title}
                data-testid={`grade-answer-${c.answer}`}
                onClick={() => answerGrade(g, c.answer)}
              >
                {c.label}
              </Button>
              {/* a refused all / none: why, quietly, under the answer that was refused */}
              {refusal && inputs.gradeAnswers?.[g.key] === c.answer && (
                <Text size='micro' variant='label' component='p' data-testid='grade-refused'>
                  not possible: {refusal}
                </Text>
              )}
            </span>
          ))}
        </span>
      );
    } else {
      why = 'open all pieces below: the field it names is marked';
    }
    // owner 16.10: one plain question and its answers, beside the preview — no callout box, no
    // bold, one font size; why it is asked is the hover. The piece is the canvas on the left
    return (
      <div className='mt-2 flex min-w-0 flex-col gap-2'>
        <Text size='micro' component='p' title={why ?? undefined}>
          {p.label}
          {p.kind === 'outline' && (
            <Text size='micro' variant='label' component='span'>
              {' '}
              for all pieces
            </Text>
          )}
        </Text>
        {/* where the answer is not on the card itself, the why says where it is */}
        {why && (p.kind === 'gate' || p.kind === 'cutlist') && (
          <Text size='micro' variant='label' component='p'>
            {why}
          </Text>
        )}
        {answers}
      </div>
    );
  };

  /** One piece's code field, as the table's code cell (grammar checked as you type). */
  const codeField = (seed: SeedId) => {
    const d = rowData(seed);
    return (
      <CodeCell
        value={d.code}
        hand={d.pair}
        blocks={d.specs.map((x) => x.identity).join(' + ')}
        sizeTokens={api.sizeTokens}
        aiName={d.aiName}
        onCommit={(v) => setName(seed, splitCode(v))}
      />
    );
  };

  /** The pieces table: the rows that ask (with their state), or the ready ones (no state). */
  const pieceTable = (list: typeof rows, withState: boolean) => (
    <DataTable className='mt-2'>
      <thead>
        <tr>
          <th>#</th>
          <th data-align='left'>code</th>
          <th data-align='left'>name</th>
          <th title='pieces per garment'>qty</th>
          <th data-align='left'>pair</th>
          <th data-align='left'>fold</th>
          <th data-align='left'>grain</th>
          {withState && (
            <th data-align='left' className={cn(STICKY_END, 'bg-bgColor')}>
              state
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {list.map((f) => {
          const seed = f.seed;
          const { specs, n, pair, unfolded, grainOrigin, code, aiName } = rowData(seed);
          const b = blockedOf(seed);
          const proposal = proposalOf(seed);
          const on = sel === seed;
          return (
            <tr
              key={seed}
              onClick={() => setSel(seed)}
              className={cn('cursor-pointer', on && 'bg-pageBg')}
            >
              <td>
                <MarkBox n={mark(seed)} />
              </td>
              <td data-align='left'>
                <CodeCell
                  value={code}
                  hand={pair}
                  blocks={[
                    specs.map((s) => s.identity).join(' + '),
                    `name from ${nameFromWord(n, inputs.confirmedNames.includes(seed))}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  sizeTokens={api.sizeTokens}
                  aiName={aiName}
                  onCommit={(v) => setName(seed, splitCode(v))}
                />
              </td>
              <td data-align='left'>
                <Input
                  key={n?.displayName ?? ''}
                  defaultValue={n?.displayName ?? ''}
                  aria-label={`name of piece ${mark(seed)}`}
                  className='h-[22px] w-28'
                  onBlur={(e: React.FocusEvent<HTMLInputElement>) => {
                    const v = e.currentTarget.value.trim();
                    if (v !== (n?.displayName ?? '')) setName(seed, { displayName: v });
                  }}
                />
              </td>
              <td>
                {!specs.length ? (
                  <EmptyCell />
                ) : (
                  // A pair counts PER HAND (PieceSpec): 2 = two _L and two _R per garment.
                  // D3: a count no sheet text gives is marked until confirmed or edited.
                  <span
                    className='flex items-center gap-1'
                    title={
                      qtyOpen(open, seed)?.detail ??
                      (pair ? 'per hand: one _L and one _R each' : undefined)
                    }
                  >
                    {/* fixed slots: the inputs line up whether or not a row is marked */}
                    <span className='w-2 text-warning'>{qtyOpen(open, seed) ? '?' : ''}</span>
                    <NumberField
                      value={specs[0].piecesPerGarment}
                      min={1}
                      aria-label={`pieces per garment${pair ? ' per hand' : ''} of piece ${mark(seed)}`}
                      className={cn('w-12', qtyOpen(open, seed) && 'border-warning')}
                      onCommit={(v) =>
                        v && v !== specs[0].piecesPerGarment
                          ? override(seed, { piecesPerGarment: Math.round(v) })
                          : undefined
                      }
                    />
                    <Text size='nano' variant='label' component='span' className='w-7'>
                      {pair ? '/hand' : ''}
                    </Text>
                  </span>
                )}
              </td>
              <td data-align='left'>
                <NativeSelect
                  value={pair ?? ''}
                  onChange={(v) => override(seed, { pairHand: v ? (v as 'L' | 'R') : null })}
                  aria-label={`pair of piece ${mark(seed)}`}
                  className='w-24'
                  title='a pair is written as two blocks, _L and _R; say which hand is drawn'
                  options={[
                    { value: '', label: 'single' },
                    { value: 'L', label: 'L+R · L' },
                    { value: 'R', label: 'L+R · R' },
                  ]}
                />
              </td>
              <td data-align='left'>
                {foldAskOf(seed) ? (
                  <Button
                    {...ask('details-fold')}
                    variant='secondary'
                    size='xs'
                    className='whitespace-nowrap border-error text-error'
                    title={foldAskOf(seed)!.why}
                    onClick={(e: React.MouseEvent) => {
                      e.stopPropagation();
                      startFold(seed);
                    }}
                  >
                    ! fold?
                  </Button>
                ) : (
                  <label className='flex items-center gap-1.5' onClick={(e) => e.stopPropagation()}>
                    <CheckboxCommon
                      name={`fold-${seed}`}
                      checked={unfolded}
                      // ticked: semantics asks which edge (E1a); unticked: "not a fold"
                      onChange={(v) => (v ? override(seed, { unfoldedFold: true }) : notFold(seed))}
                    />
                    <Text size='micro' variant='label' component='span'>
                      unfold
                    </Text>
                  </label>
                )}
              </td>
              <td data-align='left'>
                {grainOrigin ? (
                  <Text size='micro' variant='label' component='span'>
                    {grainOrigin}
                  </Text>
                ) : proposal ? (
                  <Pill
                    tone='attention'
                    title={`proposed · ${proposal.why} — review above, or draw your own`}
                  >
                    proposed
                  </Pill>
                ) : (
                  <Button
                    {...ask('details-grain')}
                    variant='secondary'
                    size='xs'
                    className='whitespace-nowrap border-error text-error'
                    onClick={(e: React.MouseEvent) => {
                      e.stopPropagation();
                      startGrain(seed);
                    }}
                  >
                    ! draw
                  </Button>
                )}
              </td>
              {/* pinned to the right edge: the answer the footer asks for is always on screen,
                  even when the table scrolls sideways (1024 px) */}
              {withState && (
                <td data-align='left' className={cn(STICKY_END, on ? 'bg-pageBg' : 'bg-bgColor')}>
                  {b ? (
                    <BlockedState
                      reason={b.reason}
                      proposed={!!proposal}
                      onReview={() => setReviewing(true)}
                      detail={b.detail}
                      word={REASON[b.reason] ?? b.reason}
                      onGrain={() => startGrain(seed)}
                      onFold={() => startFold(seed)}
                      onShow={() => showActions(seed)}
                      onPieces={
                        onFixInPieces && PIECES_REASONS.has(b.reason)
                          ? () => fixInPieces(seed)
                          : undefined
                      }
                      onSizes={
                        b.reason === 'size-unmapped' || b.reason === 'size-count'
                          ? () => void api.dispatch({ type: 'back', to: 'sizes' })
                          : undefined
                      }
                    />
                  ) : rowOpen(open, seed) ? (
                    <RowQuestions
                      api={api}
                      seed={seed}
                      // E4: "cut on fold" from the count question → the fold question of this
                      // row: semantics asks for the edge, the drawing opens to pick it
                      onFold={() => {
                        override(seed, { unfoldedFold: true });
                        startFold(seed);
                      }}
                    />
                  ) : foldAskOf(seed) ? (
                    <Text size='micro' component='span' className='text-error'>
                      ! fold?
                    </Text>
                  ) : (
                    <Text size='micro' component='span' className='text-error'>
                      ! code
                    </Text>
                  )}
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </DataTable>
  );

  return (
    // the step's own go (GRADE P1 above) for every quiz under it, the outline pictures included
    <AnsweredAndGoContext.Provider value={go}>
      <SplitStage
        canvas={
          reviewing && proposals.length && reviewBox ? (
            <Panel
              title={
                <span title='every proposal on its piece (blue, dashed) with why it was proposed — accept them all here, or go back and draw the wrong ones by hand'>
                  proposed grainlines
                </span>
              }
              aside={
                <span className='flex items-center gap-2'>
                  <Chip quiet onClick={() => setReviewing(false)}>
                    back
                  </Chip>
                  <Chip {...ask('details-grain-accept')} onClick={() => answer(acceptProposals())}>
                    accept these {proposals.length}
                  </Chip>
                </span>
              }
              bodyClassName='p-0 flex flex-col'
            >
              <div className='min-h-[480px] flex-1'>
                <SheetViewport key='review' bbox={reviewBox} focus={null}>
                  {({ unit }) => (
                    <>
                      {families.map((f) => {
                        const c = f.candidates[f.candidates.length - 1];
                        if (!c || c.outer.length < 3) return null;
                        return (
                          <polygon
                            key={f.seed}
                            points={ptsAttr(c.outer)}
                            fill={proposalOf(f.seed) ? SHEET_INK.fill : 'none'}
                            stroke={proposalOf(f.seed) ? SHEET_INK.ink : '#dddddd'}
                            strokeWidth={unit * 1.2}
                          />
                        );
                      })}
                      {proposals.map((g) => {
                        const m = { x: (g.a.x + g.b.x) / 2, y: (g.a.y + g.b.y) / 2 };
                        return (
                          <g key={g.seed}>
                            <GrainMark a={g.a} b={g.b} unit={unit} tone={SHEET_INK.blue} dashed />
                            <text
                              x={m.x + unit * 10}
                              y={vy(m.y)}
                              fontSize={unit * 12}
                              fill={SHEET_INK.blue}
                              dominantBaseline='middle'
                            >
                              {mark(g.seed)} · {g.why}
                            </text>
                          </g>
                        );
                      })}
                    </>
                  )}
                </SheetViewport>
              </div>
            </Panel>
          ) : (
            <Panel
              title={
                sel != null ? (
                  <span
                    title={[
                      `blocks: ${
                        specsOf(sel)
                          .map((s) => s.identity)
                          .join(', ') || '—'
                      }`,
                      `sizes: ${
                        specsOf(sel)[0]
                          ?.sizes.map((z) => z.sizeToken)
                          .join(' ') || '—'
                      }`,
                      `fabrics proposed: ${nameOf(sel)?.suggestion?.fabrics.length ?? '—'}`,
                    ].join(' · ')}
                  >
                    piece {mark(sel)} · {nameOf(sel)?.displayName || <EmptyCell />}
                  </span>
                ) : (
                  'piece'
                )
              }
              aside={
                // a piece without a grainline draws it from the one button under the drawing
                sel != null &&
                blockedOf(sel)?.reason !== 'no-grain' && (
                  <Chip
                    quiet
                    selected={drawing}
                    pressed={drawing}
                    onClick={() => {
                      setGrainA(null);
                      setPickingFold(false);
                      setDrawing((d) => !d);
                    }}
                  >
                    {drawing ? 'drawing grainline…' : 'draw grainline'}
                  </Chip>
                )
              }
              bodyClassName='p-0 flex flex-col'
            >
              {sel == null || !selOuter ? (
                <Text size='micro' variant='label' component='p' className='p-2'>
                  select a row
                </Text>
              ) : (
                <>
                  <div
                    className='relative min-h-0 flex-1'
                    // the answer is drawn here: the coach rings the drawing, not the card
                    {...(drawing || pickingFold
                      ? {
                          'data-ask-zone': '',
                          'data-ask-label': drawing
                            ? grainA
                              ? 'now click the other end'
                              : 'click one end of the grain'
                            : 'click the fold edge',
                        }
                      : {})}
                  >
                    {/* owner 16.10: a drawing answer says what to click ON the canvas, big */}
                    {(drawing || (pickingFold && selPick)) && (
                      <div
                        data-testid='details-canvas-banner'
                        className='pointer-events-none absolute inset-x-0 top-0 z-10 bg-warning/90 px-3 py-2 text-center text-[18px] leading-tight text-white'
                      >
                        {drawing
                          ? grainA
                            ? 'now click the other end'
                            : 'click one end of the grain'
                          : 'click the fold edge'}
                      </div>
                    )}
                    <SheetViewport
                      key='preview'
                      bbox={session.sheet.sheet.bbox}
                      focus={selCand?.bbox ?? null}
                      tool={drawing || pickingFold ? 'point' : 'pan'}
                      onPoint={(pt) => {
                        if (pickingFold && selPick) {
                          const e = edgeAt(selPick, pt);
                          if (!e) return;
                          const p = pickFold(sel, e);
                          // only the active fold question of this same piece moves the step on
                          if (activeIsFor(sel, 'fold')) answer(p);
                          return;
                        }
                        if (!drawing) return;
                        if (!grainA) setGrainA(pt);
                        else {
                          const p = rerun({
                            operatorGrain: { ...inputs.operatorGrain, [sel]: { a: grainA, b: pt } },
                          });
                          // a free "draw grainline" edit is committed as is; only the drawing that
                          // answers the active no-grain question of this same piece moves on
                          if (activeIsFor(sel, 'grain')) answer(p);
                          setGrainA(null);
                          setDrawing(false);
                        }
                      }}
                    >
                      {({ unit }) => (
                        <>
                          {families
                            .filter((f) => f.seed !== sel)
                            .map((f) => (
                              <polygon
                                key={f.seed}
                                points={ptsAttr(f.candidates[selRank]?.outer ?? [])}
                                fill='none'
                                stroke='#dddddd'
                                strokeWidth={unit}
                              />
                            ))}
                          <polygon
                            points={ptsAttr(selOuter)}
                            fill='#f2f2f2'
                            stroke={SHEET_INK.ink}
                            strokeWidth={unit * 1.6}
                          />
                          {selAsk?.edges.map((e, i) => {
                            // the suggested edge solid, the others dashed: never colour alone
                            const sug = i === selAsk.suggested;
                            return (
                              <line
                                key={i}
                                x1={e.a.x}
                                y1={vy(e.a.y)}
                                x2={e.b.x}
                                y2={vy(e.b.y)}
                                stroke={sug ? SHEET_INK.blue : SHEET_INK.red}
                                strokeWidth={unit * (sug ? 4 : 2.5)}
                                strokeDasharray={sug ? undefined : `${unit * 6} ${unit * 4}`}
                                pointerEvents='none'
                              />
                            );
                          })}
                          {selMiss &&
                            pickingFold &&
                            selMiss.edges.map((e, i) => (
                              <line
                                key={`m${i}`}
                                x1={e.a.x}
                                y1={vy(e.a.y)}
                                x2={e.b.x}
                                y2={vy(e.b.y)}
                                stroke={SHEET_INK.red}
                                strokeWidth={unit * 2.5}
                                strokeDasharray={`${unit * 6} ${unit * 4}`}
                                pointerEvents='none'
                              />
                            ))}
                          {selMiss?.picked && (
                            // the pick that is not found in every size: solid, the candidates dashed
                            <line
                              x1={selMiss.picked.a.x}
                              y1={vy(selMiss.picked.a.y)}
                              x2={selMiss.picked.b.x}
                              y2={vy(selMiss.picked.b.y)}
                              stroke={SHEET_INK.red}
                              strokeWidth={unit * 4}
                              pointerEvents='none'
                            />
                          )}
                          {selGrain && (
                            <GrainMark
                              a={selGrain.a}
                              b={selGrain.b}
                              unit={unit}
                              tone={inputs.operatorGrain[sel] ? SHEET_INK.blue : SHEET_INK.red}
                            />
                          )}
                          {selProposal && (
                            <GrainMark
                              a={selProposal.a}
                              b={selProposal.b}
                              unit={unit}
                              tone={SHEET_INK.blue}
                              dashed
                            />
                          )}
                          {active?.kind === 'grade' && active.grade && active.seed === sel && (
                            <GradeCanvasMarks
                              ask={active.grade}
                              spec={gradeSpecOf(active.grade)}
                              unit={unit}
                            />
                          )}
                          {grainA && (
                            <circle
                              cx={grainA.x}
                              cy={vy(grainA.y)}
                              r={unit * 4}
                              fill={SHEET_INK.blue}
                            />
                          )}
                        </>
                      )}
                    </SheetViewport>
                  </div>
                  <div ref={actionsRef} className='shrink-0 border-t border-hairline p-2'>
                    {drawing ? (
                      <div className='flex items-center justify-end gap-2'>
                        <Chip
                          quiet
                          onClick={() => {
                            setGrainA(null);
                            setDrawing(false);
                          }}
                        >
                          cancel
                        </Chip>
                      </div>
                    ) : pickingFold && selPick ? (
                      <div className='flex items-center gap-2'>
                        <Text size='micro' component='p' className='min-w-0 flex-1 text-warning'>
                          {selAsk
                            ? '! click the fold edge (solid = suggested)'
                            : `! click the fold edge on size ${selMiss!.refSize} (solid = your pick, not found in ${selMiss!.size})`}
                        </Text>
                        <Chip quiet onClick={() => setPickingFold(false)}>
                          cancel
                        </Chip>
                      </div>
                    ) : (
                      <>
                        {!asking && sel !== active?.seed && (
                          <>
                            {selAsk && foldAskActions(sel, true)}
                            {blockedOf(sel) && !selAsk && blockedActions(sel)}
                          </>
                        )}
                      </>
                    )}
                  </div>
                </>
              )}
            </Panel>
          )
        }
        side={
          <Panel
            title='details'
            aside={
              // owner 16.10: nothing beside the open question — the warnings wait until it is answered
              asking ? null : <HeaderWarnings items={[...sem.warnings, passportWarning(api)]} />
            }
          >
            {checklist}
            {active && (
              <div
                ref={cardRef}
                data-ask-zone=''
                data-ask-label={active.label}
                data-testid='details-question'
              >
                {problemCard(active)}
                <SkipQuiz className='mt-3' />
              </div>
            )}

            {!asking && (
              <>
                <Fold
                  label={`all pieces · ${rows.length}`}
                  // the gate's own words with no row above: its field is in here (aria-invalid)
                  ask={active?.kind === 'gate' ? 'details-ready' : undefined}
                  className='mt-3'
                >
                  <ConfirmStrip api={api} />
                  {pieceTable(rows, true)}
                </Fold>
                <Fold
                  label={`line & allowance · ${
                    MEANING.find((m) => m.value === fileAllowance.meaning)?.label ??
                    fileAllowance.meaning
                  } · ${fileAllowance.allowanceMm} mm`}
                >
                  {/* the file's answer: set by the question box above while it is open (one place) */}
                  {!outlineOpen && (
                    <div className='mb-1 flex flex-wrap items-end gap-2'>
                      <Field label='drawn outline' className='w-40'>
                        <NativeSelect
                          value={fileAllowance.meaning}
                          title={fileNote}
                          onChange={(v) =>
                            rerun({
                              fileAllowance: {
                                ...fileAllowance,
                                meaning: v as LineMeaning,
                                origin: 'operator',
                              },
                            })
                          }
                          options={MEANING}
                        />
                      </Field>
                      <Field label='allowance, mm' className='w-40'>
                        <NumberField
                          value={fileAllowance.allowanceMm}
                          min={0}
                          title={fileNote}
                          onCommit={(v) =>
                            rerun({
                              fileAllowance: {
                                ...fileAllowance,
                                allowanceMm: v ?? 0,
                                origin: 'operator',
                              },
                            })
                          }
                        />
                      </Field>
                    </div>
                  )}
                  <DataTable>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th data-align='left'>code</th>
                        <th data-align='left'>line</th>
                        <th>allow., mm</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((f) => {
                        const d = rowData(f.seed);
                        return (
                          <tr key={f.seed}>
                            <td>
                              <MarkBox n={mark(f.seed)} />
                            </td>
                            <td data-align='left'>{codeOf(f.seed)}</td>
                            <td data-align='left'>
                              <NativeSelect
                                value={d.allowance.meaning}
                                onChange={(v) =>
                                  override(f.seed, {
                                    allowance: {
                                      ...d.allowance,
                                      meaning: v as LineMeaning,
                                      origin: 'operator',
                                    },
                                  })
                                }
                                aria-label={`line meaning of piece ${mark(f.seed)}`}
                                className='w-24'
                                options={MEANING}
                              />
                            </td>
                            <td>
                              <NumberField
                                value={d.allowance.allowanceMm}
                                min={0}
                                aria-label={`allowance of piece ${mark(f.seed)}`}
                                className='ml-auto w-16'
                                onCommit={(v) =>
                                  override(f.seed, {
                                    allowance: {
                                      ...d.allowance,
                                      allowanceMm: v ?? 0,
                                      origin: 'operator',
                                    },
                                  })
                                }
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </DataTable>
                </Fold>
                <DebugFold>
                  <Text size='micro' variant='label' component='p'>
                    {sem.pieces.length} blocks · {sem.blocked.length} blocked ·{' '}
                    {fileAllowance.origin === 'operator'
                      ? 'outline set by you'
                      : fileAllowance.evidence.join(' · ') || fileAllowance.origin}
                  </Text>
                  {card.existingPieces.length > 0 && (
                    <Text size='micro' variant='label' component='p'>
                      card pieces already here: {card.existingPieces.map((p) => p.name).join(', ')}
                    </Text>
                  )}
                  {rows.map((f) => {
                    const n = rowData(f.seed).n;
                    return (
                      <Text key={f.seed} size='micro' variant='label' component='p'>
                        {mark(f.seed)} · {codeOf(f.seed)} · name from{' '}
                        {nameFromWord(n, inputs.confirmedNames.includes(f.seed))}
                        {n?.source === 'ai' ? ` · ${fmtPct(n.confidence, 0)}` : ''}
                        {specsOf(f.seed).length
                          ? ` · ${specsOf(f.seed)
                              .map((s) => s.identity)
                              .join(', ')}`
                          : ''}
                      </Text>
                    );
                  })}
                </DebugFold>
              </>
            )}
          </Panel>
        }
      />
    </AnsweredAndGoContext.Provider>
  );
}

/**
 * The state cell of a blocked row: the answer itself where it is one click (draw the grainline,
 * the fold question), the way to the step that answers it otherwise (M5: "sizes do not grow" had
 * no action). The reason stays a word next to it, never colour alone.
 */
function BlockedState({
  reason,
  proposed,
  onReview,
  detail,
  word,
  onGrain,
  onFold,
  onShow,
  onPieces,
  onSizes,
}: {
  reason: string;
  /** A1: a grainline is proposed for this piece — the answer is to review it, or draw one. */
  proposed?: boolean;
  onReview?: () => void;
  detail: string;
  word: string;
  onGrain: () => void;
  onFold: () => void;
  /** Select the row and focus its actions in the side panel. */
  onShow: () => void;
  onPieces?: () => void;
  onSizes?: () => void;
}) {
  const stop = (f: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    f();
  };
  if (reason === 'no-grain' && proposed && onReview)
    return (
      <Button
        {...ask('details-blocked')}
        variant='secondary'
        size='xs'
        className='whitespace-nowrap border-warning text-warning'
        title={detail}
        onClick={stop(onReview)}
      >
        proposed — accept or draw
      </Button>
    );
  // the row's grain cell carries "! draw" — the state cell does not repeat it
  if (reason === 'no-grain') return null;
  if (reason === 'fold-question')
    return (
      <Button
        {...ask('details-blocked')}
        variant='secondary'
        size='xs'
        className='whitespace-nowrap border-error text-error'
        title={detail}
        onClick={stop(onFold)}
      >
        ! fold?
      </Button>
    );
  if (reason === 'fold-unresolved')
    return (
      <Button
        {...ask('details-blocked')}
        variant='secondary'
        size='xs'
        className='whitespace-nowrap border-error text-error'
        title={`${detail} — pick the edge again or "not a fold"`}
        onClick={stop(onShow)}
      >
        ! {word}
      </Button>
    );
  const go = onPieces ?? onSizes;
  return (
    <span className='flex flex-col items-start gap-1'>
      <button
        {...ask('details-blocked')}
        type='button'
        className='cursor-pointer'
        title={`${detail} — what to do: in the panel on the right`}
        onClick={stop(onShow)}
      >
        <Pill tone='warn'>{word}</Pill>
      </button>
      {go && (
        <BackLink className='whitespace-nowrap' title={detail} onClick={stop(go)}>
          fix in {onPieces ? 'pieces' : 'sizes'}
        </BackLink>
      )}
    </span>
  );
}

/** The code input: grammar checked per keystroke, committed on blur/Enter. */
/** "LIN_FP_1" → code LIN_FP (all code words), mods ['1']. */
function splitCode(v: string): { code: string; mods: string[] } {
  const t = v.trim().split('_').filter(Boolean).join('_');
  const words = t ? codeWordsOf(t) : [];
  return { code: words.join('_'), mods: t.split('_').slice(words.length) };
}

function CodeCell({
  value,
  hand,
  blocks,
  sizeTokens,
  aiName,
  onCommit,
}: {
  value: string;
  hand: 'L' | 'R' | null;
  blocks: string;
  sizeTokens: ReadonlySet<string>;
  /** The model's code, untouched: it must be a dictionary code (D2). A typed code is the operator's. */
  aiName: boolean;
  onCommit: (v: string) => void;
}) {
  const [text, setText] = useState(value);
  const [prev, setPrev] = useState(value);
  if (prev !== value) {
    setPrev(value);
    setText(value);
  }
  const why = codeProblem(text, hand, sizeTokenTest(sizeTokens), aiName && text === value);
  const verdict = why ? { ok: false as const, why } : { ok: true as const };
  return (
    <span className='flex flex-col gap-0.5'>
      <Input
        value={text}
        aria-invalid={!verdict.ok || undefined}
        aria-label='piece code'
        title={blocks || undefined}
        className='h-[22px] w-20 uppercase'
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
          setText(e.currentTarget.value.toUpperCase())
        }
        onBlur={() => text !== value && onCommit(text.trim())}
        onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
      {!verdict.ok && (
        <Text size='nano' component='span' className='text-error'>
          ! {verdict.why}
        </Text>
      )}
    </span>
  );
}

/** Where a row's name came from — provenance, said in the code field's tooltip only. */
function nameFromWord(n: NameDecision | undefined, confirmed: boolean): string {
  if (!n) return '—';
  if (confirmed) return 'you';
  if (n.source === 'dxf') return 'DXF block';
  if (n.source === 'text') return 'sheet text';
  if (n.autoAccepted) return `AI auto · ${fmtPct(n.confidence, 0)}`;
  return n.source === 'ai' ? `AI · ${fmtPct(n.confidence, 0)}` : n.source;
}

/**
 * A code the export cannot spell, with the gate's own G11 rule over the identities the writer
 * will actually write (both hands of a declared pair); null = it passes. `known`: the model's
 * code untouched must be a dictionary code (D2) — a typed code is the operator's.
 */
function codeProblem(
  text: string,
  hand: 'L' | 'R' | null,
  isSizeToken: (t: string) => boolean,
  known: boolean,
): string | null {
  if (!text.trim()) return 'empty code';
  const { code, mods } = splitCode(text);
  return (
    identitiesOf(code, mods, hand)
      .map((w) =>
        identityProblem(w.identity, {
          isSizeToken,
          pair: { hand: w.pairHand, of: w.pairOf },
          isKnownCode: known ? isKnownCode : undefined,
        }),
      )
      .find((x) => x) ?? null
  );
}

function MarkBox({ n }: { n: number }) {
  return (
    <span className='inline-flex size-4 items-center justify-center bg-textColor text-nano text-bgColor'>
      {n}
    </span>
  );
}

function GrainMark({
  a,
  b,
  unit,
  tone,
  dashed,
}: {
  a: PtMm;
  b: PtMm;
  unit: number;
  tone: string;
  /** A1: a proposal, not yet the piece's grain. */
  dashed?: boolean;
}) {
  const ang = Math.atan2(vy(b.y) - vy(a.y), b.x - a.x);
  const h = unit * 10;
  const tip = (p: PtMm, dir: number) => {
    const x = p.x;
    const y = vy(p.y);
    return `${x},${y} ${x - h * Math.cos(ang - dir * 0.4) * dir},${y - h * Math.sin(ang - dir * 0.4) * dir} ${x - h * Math.cos(ang + dir * 0.4) * dir},${y - h * Math.sin(ang + dir * 0.4) * dir}`;
  };
  return (
    <g pointerEvents='none'>
      <line
        x1={a.x}
        y1={vy(a.y)}
        x2={b.x}
        y2={vy(b.y)}
        stroke={tone}
        strokeWidth={unit * 1.8}
        strokeDasharray={dashed ? `${unit * 8} ${unit * 5}` : undefined}
      />
      <polygon points={tip(b, 1)} fill={tone} />
      <polygon points={tip(a, -1)} fill={tone} />
    </g>
  );
}

/** The file's outline as the header shows it (FLY copy 2): answered › built with › asked default. */
export function fileAllowanceShown(
  answered: AllowanceDecision | null,
  built: readonly AllowanceDecision[],
): AllowanceDecision {
  if (answered?.origin === 'operator') return answered;
  const count = (o: AllowanceDecision['origin']) => built.filter((a) => a.origin === o);
  const measured = count('measured');
  const text = count('text');
  const pick = measured.length >= text.length ? measured[0] ?? text[0] : text[0];
  if (pick) {
    const n = pick.origin === 'measured' ? measured.length : text.length;
    return n < built.length
      ? { ...pick, evidence: [...pick.evidence, `${n} of ${built.length} blocks`] }
      : pick;
  }
  const asked = built.find((a) => a.origin === 'default');
  return {
    meaning: asked?.meaning ?? 'seam',
    allowanceMm: asked?.allowanceMm ?? PATIMPORT.defaultAllowanceMm,
    origin: 'default',
    evidence: asked?.evidence.length
      ? asked.evidence
      : ['no allowance text and no second line found — answer below'],
  };
}

/** What the line choice does to the cut, in words that match the geometry (FLY copy 2). */
export function outlineNote(a: AllowanceDecision): string {
  switch (a.meaning) {
    case 'cut':
      return `the outline is cut as drawn; the seam line is taken ${a.allowanceMm} mm inside it (layer 1 = final cut, the card adds nothing).`;
    case 'both':
      return `both lines are drawn: the outline is cut as drawn, the inner line is the seam (layer 1 = final cut, the card adds nothing).`;
    default:
      return `the outline is the seam line: the cut line is built ${a.allowanceMm} mm outside it (layer 1 = final cut, the card adds nothing).`;
  }
}
