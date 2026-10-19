// Step 5 · PIECES — seed + outer fill (06-SYNTHESIS: the core). Every region is drawn as found;
// what the fill could not close goes to the human: a leak (red, with where the outside got in),
// two seeds in one region (blue), a region too small to be a piece. Tools: click to seed, close a
// gap (two clicks: a wall between two line ends), use a line (it becomes an outline for this size
// or all sizes), ignore a line (a frame, a watermark), lasso to
// merge (around several seeds) or split (inside a merged region), "not a piece", reseed. Each
// region carries a strip of its sizes, so a piece closed in four sizes of six says which two.
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import type {
  BoxMm,
  FillOutcome,
  PieceCandidate,
  PieceEdit,
  PieceFamily,
  PtMm,
  Seed,
  SetAside,
  VariantMark,
} from 'lib/pattern-import/types';
import { PATIMPORT, SLIVER_MM } from 'lib/pattern-import/types';
import {
  Button,
  CalloutBox,
  Chip,
  ChipRow,
  FoldCaret,
  HeaderWarnings,
  Row,
  Text,
  EmptyCell,
} from 'ui';
import { sheetAnswerEdits, sheetQuestion } from 'lib/pattern-import/pieces/sheets';
import { cn } from 'lib/utility';
import { SHEET_INK, SheetViewport, f32Attr, inside, ptsAttr, vy } from '../sheet-viewport';
import type { ImportSessionApi } from '../use-import-session';
import { exportedRanks, variantsOf } from '../use-import-session';
import {
  DebugFold,
  Fold,
  Panel,
  SplitStage,
  ask,
  debugUi,
  fmtMm,
  fmtPct,
  useAnsweredAndGo,
  SkipQuiz,
  useAutoAnswer,
  useLikelySlot,
  useQuizSlot,
} from '../ui-bits';
import { plural, useWizardPrimary } from '../stages';
import type { PieceFocus } from '../piece-focus';
import { modelFromCard } from '../autopilot/card-match';
import { provenCopy, weakAsides } from '../auto-advance';
import type { CardContext } from '../client';
import { DroppedLabels } from './not-in-file';
import {
  AsideSilhouette,
  GapCrop,
  ModelThumb,
  findGap,
  asideOutline,
  asideTouch,
  OutlineTile,
  RegionCrop,
  TouchCrop,
  faceOutline,
  ownChains,
} from './pieces-guide';
import type { AsideTouch, GapGuess, TouchPart } from './pieces-guide';

type Tool = 'pan' | 'seed' | 'bridge' | 'wall' | 'ignore' | 'lasso' | 'reseed';

const HINT: Record<Tool, string> = {
  pan: 'click a piece to select · wheel zoom · drag pan',
  seed: 'click inside a piece the sheet did not number',
  bridge: 'click one end of the gap, then the other — a wall is drawn between them',
  wall: 'click a line the fill should treat as an outline (a facing line, a seam)',
  ignore: 'click a line that is not an outline (frame, watermark, label box)',
  lasso: 'draw around several numbers to join them · around one of two touching pieces to split',
  reseed: 'click another spot inside the selected piece',
};

/** The toolbar: tool, word, what it does. */
const TOOLS = [
  ['pan', 'pan', 'pan and select'],
  ['seed', '+ piece', 'click inside a piece the sheet did not number'],
  ['bridge', 'close gap', 'two clicks: a wall between two line ends'],
  ['wall', 'use line', 'a drawn line the fill should treat as an outline'],
  ['ignore', 'ignore line', 'a line that is not an outline'],
  ['lasso', 'lasso', 'join pieces, or split two pieces that touch'],
] as const satisfies readonly (readonly [Tool, string, string])[];

type Bridge = Extract<PieceEdit, { kind: 'bridge' }>;

/** Where the worker will land a bridge end (display only; same rule as pieces/operator snapBridge). */
function landOn(previews: readonly Float32Array[], p: PtMm, skip: ReadonlySet<number>): PtMm {
  let best: PtMm | null = null;
  let bd = 4;
  previews.forEach((a, id) => {
    if (skip.has(id) || a.length < 4) return;
    const closed = a[0] === a[a.length - 2] && a[1] === a[a.length - 1];
    if (closed) return;
    for (const k of [0, a.length - 2]) {
      const d = Math.hypot(a[k] - p.x, a[k + 1] - p.y);
      if (d <= bd) {
        bd = d;
        best = { x: a[k], y: a[k + 1] };
      }
    }
  });
  if (best) return best;
  const n = nearestLine(previews, p, 2, skip);
  return n ? n.at : p;
}

/** The preview line nearest to `p` within `reach` mm (index = ChainId). */
function nearestLine(
  previews: readonly Float32Array[],
  p: PtMm,
  reach: number,
  skip: ReadonlySet<number> = new Set(),
): { id: number; at: PtMm } | null {
  let best: { id: number; at: PtMm } | null = null;
  let bd = reach;
  previews.forEach((a, id) => {
    if (skip.has(id)) return;
    for (let i = 0; i + 3 < a.length; i += 2) {
      const ax = a[i];
      const ay = a[i + 1];
      const dx = a[i + 2] - ax;
      const dy = a[i + 3] - ay;
      const l2 = dx * dx + dy * dy;
      const t = l2 ? Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.y - ay) * dy) / l2)) : 0;
      const q = { x: ax + t * dx, y: ay + t * dy };
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d <= bd) {
        bd = d;
        best = { id, at: q };
      }
    }
  });
  return best;
}

const OUTCOME: Record<FillOutcome, { word: string; tone: 'ok' | 'warn' | 'attention' | 'mut' }> = {
  closed: { word: 'closed', tone: 'ok' },
  leak: { word: 'leak', tone: 'warn' },
  merged: { word: 'two pieces touch', tone: 'attention' },
  tiny: { word: 'tiny', tone: 'mut' },
  refused: { word: 'sizes unclear', tone: 'attention' },
};

/** Where a seed came from, as the regions list says it (A2: 'face' = a closed outline). */
const SEED_WORD: Record<Seed['origin'], string> = {
  text: 'number on the sheet',
  click: 'clicked',
  ai: 'AI',
  face: 'closed outline',
};

/** A2: why a closed outline was set aside (D3: shown, one click from a piece). */
const ASIDE_WORD: Record<SetAside['reason'], string> = {
  sheet: 'a border round the whole sheet',
  'tile-frame': 'a page frame',
  'test-square': 'the test square',
  legend: 'a legend box (line samples with sizes)',
  table: 'a table',
  logo: 'a logo or a hatching',
  background: 'drawn in background lines',
  unlabelled: 'no piece number inside',
  'other-size': "another size's drawing of a piece",
  'size-copy': 'another size of a piece already found',
  'seam-line': 'a seam line of a piece already found',
  joined: 'drawn against a piece already found',
  'inner-line': 'cut off a piece by an inner line',
  'other-pen': 'a mark inside a piece (a label box, a mark)',
  'code-text': 'part of a printed code',
};

/** H1: why the sizes of a piece were held back (the candidate's `gradeRefusal`). */
const REFUSED: Record<NonNullable<PieceCandidate['gradeRefusal']>, string> = {
  'sizes-not-distinguished':
    'the sizes are drawn alike here and nothing on the sheet proves which line is which size, so this size gets no outline. closing a gap does not help. try another spot inside the piece (a different spot can prove the sizes), or mark it not a piece.',
  'size-count':
    'how many sizes this sheet draws is not settled. answer it on the sizes step ("sizes drawn on this sheet").',
  'grade-ambiguous':
    'two size layouts fit these lines equally well, so no outline is given. try another spot inside the piece, or mark it not a piece.',
};

/** A refusal in a row's few words; the whole of REFUSED is the row's title. */
const REFUSED_SHORT: Record<NonNullable<PieceCandidate['gradeRefusal']>, string> = {
  'sizes-not-distinguished': 'sizes drawn alike',
  'size-count': 'size count open',
  'grade-ambiguous': 'two size layouts fit',
};

/**
 * The reader's own detail on a refusal, minus the sentence REFUSED already says (FLY-final copy 6:
 * the panel printed it twice). Its generic sentences end in the specific reason in brackets.
 */
const GENERIC_DETAIL = [
  'several sizes are drawn alike here and nothing proves which line is which size',
  'more than one size layout fits these lines',
  'how many sizes this sheet draws is not known',
];
function refusalExtra(detail: string | undefined): string | null {
  if (!detail) return null;
  if (!GENERIC_DETAIL.some((g) => detail.startsWith(g))) return detail;
  return /\(([^()]*)\)\s*$/.exec(detail)?.[1] ?? null;
}

/** What the note offers to do about a piece sent here from check / details. */
const FOCUS_HELP: Record<PieceFocus['kind'], string> = {
  walls:
    'the written outline leaves the drawn line here. use line: click the drawn line the outline should follow. close gap: click the two ends of a gap. or mark it not a piece.',
  growth:
    'a size is not larger than the size below it: that size took the wrong line. step through the sizes, then use line on the right line for that size, try another spot, or mark it not a piece.',
  region:
    'see the question below for what is wrong. try another spot, close a gap, or mark it not a piece.',
};

const STYLE: Record<FillOutcome, { fill: string; stroke: string; dash: boolean }> = {
  closed: { fill: '#f2f2f2', stroke: SHEET_INK.ink, dash: false },
  leak: { fill: '#ffffff', stroke: SHEET_INK.red, dash: true },
  merged: { fill: '#ffffff', stroke: SHEET_INK.blue, dash: true },
  tiny: { fill: '#fafafa', stroke: SHEET_INK.mut, dash: true },
  refused: { fill: '#ffffff', stroke: SHEET_INK.blue, dash: true },
};

const centre = (pts: PtMm[]) => {
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p.x;
    y += p.y;
  }
  return { x: x / pts.length, y: y / pts.length };
};

/**
 * One thing the operator answers on this step, in the order the footer asks them (model, the
 * regions, the cross-sheet question). The guide shows ONE at a time; the checklist shows them all.
 */
type Problem =
  | { key: 'model'; kind: 'model' }
  | {
      key: string;
      kind: 'region';
      seed: number;
      rank: number;
      outcome: FillOutcome;
      /** 'two pieces touch': the whole region (every number in it), asked once. */
      group?: TouchGroup;
    }
  /** Several regions where pieces touch, all with the same likely answer: one question for all. */
  | { key: 'touch'; kind: 'touch'; groups: TouchGroup[] }
  | { key: 'sheet'; kind: 'sheet' }
  /** Optional, after the required ones: were the outlines left out on a guess left out right? */
  | { key: 'aside'; kind: 'aside' };

/**
 * One region where pieces touch, asked ONCE for every number in it (owner 17.10: «quiz too long»
 * — it was one question per number, so a pair was asked twice). The answer is a seed edit, so it
 * covers every size of those numbers at once.
 */
type TouchGroup = {
  key: string;
  /** The numbers (seeds) in the region, the asked one first. */
  seeds: number[];
  /** The size the region is shown in. */
  rank: number;
  outer: PtMm[];
  areaMm2: number;
  /** The engine's own proof: exactly two numbers, each the other's only partner. */
  proven: boolean;
  /** The likely answer: one piece, or this part (a label, a mark: tiny) is not a piece. */
  likely: { kind: 'join' } | { kind: 'drop'; seed: number };
  /** Proven, likely one piece, and not two printed piece numbers: joined without asking. */
  auto: boolean;
};

/**
 * How one garment differs on the sheet: the engine's `pieces.out.variantMarks` (VARIANT-MARKS.md).
 * A mark the client can show is sure and says something: a cutting line (`cut` — the garment cuts
 * the piece there; `edge` — it keeps the piece's drawn edge where another garment cuts) or a piece
 * of that garment alone (`piece`). Uncertain marks change nothing, so they draw nothing.
 */
const markShows = (m: VariantMark) =>
  !m.uncertain && (m.cutLines.length > 0 || m.pieces.length > 0);
/** Squared distance from `p` to the closed outline `poly` (its edges). */
const distToOutline2 = (p: PtMm, poly: readonly PtMm[]) => {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
    const ex = a.x + t * dx - p.x;
    const ey = a.y + t * dy - p.y;
    best = Math.min(best, ex * ex + ey * ey);
  }
  return best;
};
const polyLen = (l: readonly PtMm[]) => {
  let n = 0;
  for (let i = 1; i < l.length; i++) n += Math.hypot(l[i].x - l[i - 1].x, l[i].y - l[i - 1].y);
  return n;
};
/** How far (mm) a cutting line's end may lie from an outline and still be ON it. */
const ON_OUTLINE_MM = 1.5;
/**
 * A cutting line that may be drawn in the size `poly` is drawn in: both its ends lie on that
 * outline (an `edge` line runs along it, a `cut` line ends on its sides / is its new cut edge).
 * The engine gives one line per size and no size label; a bigger or other size's line ends a
 * whole grade step (≈ 12 mm on kombinezon) off and is left out — no nearest fallback: a wrong
 * size's line is worse than none. Smaller sizes' lines sharing the fold end still pass; the caller
 * keeps the longest.
 */
/** VARIANTS-2: a cut line this far off its outline was drawn so in the PDF (`offMm`). */
const CUT_OFF_MM = 1.5;
const lineOn = (l: readonly PtMm[], poly: readonly PtMm[]) =>
  l.length > 1 &&
  poly.length > 2 &&
  distToOutline2(l[0], poly) <= ON_OUTLINE_MM ** 2 &&
  distToOutline2(l[l.length - 1], poly) <= ON_OUTLINE_MM ** 2;
/**
 * One garment's picture, every piece in ONE size: its pieces (a piece another garment owns is
 * already left out by the caller), each in this garment's own outline where the engine cut one
 * (`outlines` — given in one representative size, so the picture uses that size's rank for every
 * piece), else as drawn in that rank; the pieces its marks touch tinted; its cutting lines — only
 * per piece the one line drawn in the size shown (`lineOn`, the longest), none when no line is.
 * `at.own: false` (the sheet under the pointer): the size on screen, the drawn outlines as given.
 */
function garmentPicture(
  v: string,
  fams: readonly PieceFamily[],
  marks: readonly VariantMark[],
  at: { rank: number; rankOfSize: (size: string) => number | null; own: boolean },
) {
  const mine = marks.filter((m) => m.label === v && markShows(m));
  const given = at.own
    ? mine
        .flatMap((m) => m.outlines ?? [])
        .map((o) => at.rankOfSize(o.size))
        .find((r): r is number => r != null)
    : undefined;
  const rank = given ?? at.rank;
  const own = new Map<number, PtMm[]>();
  if (at.own)
    for (const m of mine)
      for (const o of m.outlines ?? [])
        if (o.poly.length > 2 && at.rankOfSize(o.size) === rank) own.set(o.seed, o.poly);
  const touched = new Set(mine.flatMap((m) => m.pieces));
  const drawn = (f: PieceFamily) =>
    (
      f.candidates.find((c) => c.rank === rank) ??
      f.candidates[Math.min(rank, f.candidates.length - 1)]
    )?.outer ?? [];
  const shapes = fams.map((f) => own.get(f.seed) ?? drawn(f));
  const cutLines: PtMm[][] = [];
  const cutOff: boolean[] = [];
  for (const m of mine) {
    if (m.kind === 'piece') continue;
    // VARIANTS-2: a line carries its size (legend row / PDF layer / pen — never the nearest
    // outline): the size shown takes exactly its own lines. `offMm > 1.5`: the PDF itself drew
    // that line off its outline — drawn, but dashed and said so.
    const sized = m.cutLines.filter((l) => l.size != null && at.rankOfSize(l.size) === rank);
    for (const l of sized) {
      cutLines.push(l.poly);
      cutOff.push((l.offMm ?? 0) > CUT_OFF_MM);
    }
    // an unsized line (no evidence of its size): only by its ends on this size's outline, the
    // longest per piece — no nearest fallback, a wrong size's line is worse than none
    const bare = m.cutLines.filter((l) => l.size == null);
    if (!bare.length) continue;
    for (const sd of m.pieces) {
      const i = fams.findIndex((f) => f.seed === sd);
      if (i < 0) continue;
      const on = bare.filter((l) => lineOn(l.poly, shapes[i]));
      if (on.length) {
        cutLines.push(on.reduce((x, y) => (polyLen(y.poly) > polyLen(x.poly) ? y : x)).poly);
        cutOff.push(false);
      }
    }
  }
  return {
    rank,
    outlines: shapes,
    tinted: fams.map((f) => touched.has(f.seed)),
    cutLines,
    cutOff,
  };
}

/** What the canvas shows lit (blue) because a tile or a garment picture is under the pointer. */
type Hot =
  | { kind: 'piece'; seed: number }
  | { kind: 'aside'; id: number }
  | { kind: 'garment'; v: string }
  | null;

/**
 * A two-parts split in progress, as one transaction: stage 1 = the first loop sent, 2 = waiting
 * for the loop round the other part, 3 = the second loop sent. `baseline` = the edits before the
 * first loop, `cuts` = the exact split edits sent since (the edits must be baseline + cuts, by
 * identity — any other edit in between ends the transaction, keeping what is there); `sent` = the
 * pieces output the last loop was drawn on (the check waits for a newer one). Kept in the quiz
 * slot: the step unmounts while the pieces run again.
 */
type SplitCheck = {
  stage: 1 | 2 | 3;
  rank: number;
  orig: number;
  a1: number;
  first: number;
  other: number;
  baseline: readonly PieceEdit[];
  cuts: PieceEdit[];
  sent: unknown;
};

/** A set-aside reason in two or three words, the caption of its tiles. */
const ASIDE_SHORT: Partial<Record<SetAside['reason'] | 'size-copy?', string>> = {
  unlabelled: 'no number',
  'size-copy?': 'between sizes',
  joined: 'touches a piece',
  'inner-line': 'cut by a line',
  'other-pen': 'mark inside',
};
/**
 * A thin band between two drawn lines (a size copy the engine calls a sliver, or an outline that
 * fills under a tenth of its own box): never a piece, so never asked — it stays left out.
 */
const askable = (a: SetAside) => {
  if (a.copy?.how === 'sliver') return false;
  const boxArea = (a.box.maxX - a.box.minX) * (a.box.maxY - a.box.minY);
  return !(a.areaMm2 > 0 && boxArea > 0 && a.areaMm2 / boxArea < 0.1);
};
/** Proven no-piece reasons: asked last, after the outlines that could be a piece. */
const ASIDE_JUNK = new Set<string>([
  'sheet',
  'tile-frame',
  'test-square',
  'legend',
  'table',
  'logo',
  'background',
  'code-text',
]);

/** An answer of the set-aside quiz, kept until the quiz is sent. */
type AsideAnswer = 'yes' | 'no' | { join: number };

/** A checklist row as it was last seen open: a fixed one keeps its words, greyed, with a ✓. */
type SeenRow = { order: number; label: string; seed?: number };

export function PiecesStep({
  api,
  card,
  focus = null,
  onDismissFocus,
}: {
  api: ImportSessionApi;
  /** A10: the card, whose name / style number may name the model (a one-click suggestion). */
  card?: CardContext;
  /** Sent from check / details ("fix in pieces"): select it, zoom to it, say why. */
  focus?: PieceFocus | null;
  onDismissFocus?: () => void;
}) {
  const { session, inputs } = api;
  const { remember } = useContext(DroppedLabels);
  // the checklist's memory for this import (owned by the wizard: the step unmounts while the
  // pieces run again after an answer, and a fixed question must come back as fixed, not vanish)
  const seen = useQuizSlot('pieces', () => ({
    variant: session.variant ?? null,
    rows: new Map<string, SeenRow>(),
    /** «yes — all right» on the set-aside check. */
    asideOk: false,
    /** Outlines brought back from the set-aside check: aside id → the piece it became. */
    promoted: new Map<number, { aside: SetAside; seed: number }>(),
    /** Every set-aside outline the quiz has shown (aside id → it): a repeated batch is adopted. */
    asideById: new Map<number, SetAside>(),
    split: null as SplitCheck | null,
    /** The set-aside quiz, one outline at a time: the aside ids answered, in order. */
    asideDone: [] as number[],
    /** The garment picked without asking (styles the client cannot tell apart); once per import. */
    autoVariant: null as string | null,
    /** The run (sessionId) the automatic pick was sent for: one send per run, StrictMode-proof. */
    autoTried: null as number | null,
    /** «change» on the picked-for-you garment: ask from now on, never pick again. */
    autoReopened: false,
    /**
     * Each number's own outline per size, the last time it closed alone: when it then touches
     * another piece, the picture draws the two parts apart (the engine gives one outline only).
     */
    own: new Map<number, Map<number, { outer: PtMm[]; areaMm2: number }>>(),
    /** Touch regions joined without asking: never again (undone = asked). */
    autoDone: new Set<string>(),
    /** Regions clicked off the one-question-for-all: asked one by one. */
    touchOff: new Set<string>(),
    /** The last answer that covered several edits: its words, how many, and the edits after it. */
    applied: null as {
      text: string;
      n: number;
      at: number;
      /** «part of piece N»: the set-aside outlines it brought back (undo leaves them out again). */
      drop?: number[];
      /** The set-aside quiz: the edit list before it was sent (undo goes back to it). */
      restore?: readonly PieceEdit[];
      /** The set-aside quiz: every outline the batch answered (undo asks them again). */
      batch?: number[];
      /** The set-aside quiz: the seeds it brought back for the first time (undo leaves them out). */
      fresh?: number[];
      /** «part of piece N»: the pieces joined to (the quiet line says in which sizes). */
      hosts?: number[];
    } | null,
    /** What the data says about each set-aside outline, per pieces run (and size on screen). */
    asideCache: { out: null as unknown, m: new Map<string, unknown>() },
    /** The quiz's answers not sent yet (aside id → answer), sent once at its end. */
    answers: new Map<number, AsideAnswer>(),
    /** How many answers are being applied right now (0 = none). */
    committing: 0,
    /** A bridge just sent: it must close that piece in that size (`at` = the edits after it). */
    gapCheck: null as { seed: number; rank: number; at: number; auto: boolean } | null,
    /** The last send of the quiz failed: its answers are kept, «try again» sends them again. */
    applyFailed: false,
    /** A send that failed half way: the edit list before it, and the outlines it brought back. */
    pendingBefore: null as readonly PieceEdit[] | null,
    pendingFresh: [] as number[],
    /** The quiz's answers, one step per card (back takes the last step off). */
    asideSteps: [] as number[][],
    /** Group cards: the pictures flipped away from the likely answer. */
    flip: new Set<number>(),
    /** The session error as the last render saw it (a run that failed). */
    errNow: null as unknown,
    /** The piece edits as the last render saw them (the step remounts during a run). */
    editsNow: [] as readonly PieceEdit[],
    /** «show» on a quiet line of outlines answered without asking. */
    showAuto: null as 'auto' | 'inner' | null,
  }));
  seen.editsNow = inputs.edits;
  seen.errNow = session.error ?? null;
  const splitRef = {
    get current() {
      return seen.split;
    },
    set current(v: SplitCheck | null) {
      seen.split = v;
    },
  };
  const out = session.pieces;
  const runSizes = session.sizes?.run.sizes ?? [];
  const [rank, setRank] = useState(
    () => focus?.items[0]?.rank ?? Math.min(2, Math.max(0, runSizes.length - 1)),
  );
  const [tool, setTool] = useState<Tool>('pan');
  const [sel, setSel] = useState<number | null>(() => focus?.items[0]?.seed ?? null);
  /** The box the sheet zooms to: a piece the operator was sent to, or picked in the note. */
  const [zoomTo, setZoomTo] = useState<{ seed: number; rank: number | null } | null>(() =>
    focus?.items[0] ? { seed: focus.items[0].seed, rank: focus.items[0].rank } : null,
  );
  const jump = (it: { seed: number; rank: number | null }) => {
    setSel(it.seed);
    if (it.rank != null) setRank(it.rank);
    setZoomTo({ seed: it.seed, rank: it.rank });
  };
  // a new "fix in pieces" while the step is open (the wizard keeps it mounted)
  const lastFocus = useRef(focus);
  useEffect(() => {
    if (focus && focus !== lastFocus.current && focus.items[0]) jump(focus.items[0]);
    lastFocus.current = focus;
  }, [focus]);
  const [hint, setHint] = useState<string | null>(null);
  // the lasso armed by «one piece»: it joins the parts drawn around, it does not split
  const [lassoJoin, setLassoJoin] = useState(false);
  // the lasso armed by «two parts»: a loop round ONE part; round both is asked again, never joined
  const [lassoSplit, setLassoSplit] = useState(false);

  /** Every tool on the toolbar, not only the ones the selected region's problem needs. */
  const [allTools, setAllTools] = useState(false);
  /** The closed regions' list, opened by hand (a closed region picked on the sheet opens it too). */
  const [closedOpen, setClosedOpen] = useState(false);
  /** A2: the set-aside group opened in the list, and the outline the sheet zooms to. */
  const [asideOpen, setAsideOpen] = useState<string | null>(null);
  const [asideAt, setAsideAt] = useState<SetAside | null>(null);
  /** First end of a bridge being drawn. */
  const [gapA, setGapA] = useState<PtMm | null>(null);
  /** A bridge closes this size only, or every size (a gap in a line all sizes share). */
  const [allSizes, setAllSizes] = useState(false);
  /** mm per screen pixel of the last render: a click picks a line within a few pixels. */
  const unitRef = useRef(1);
  const variants = variantsOf(out?.seeds ?? [], api.baseSeeds, out?.variants);
  const named =
    card && variants.length > 1 && !session.variant
      ? modelFromCard(
          variants,
          card,
          session.files.map((f) => f.name),
        )
      : null;
  const families = useMemo(() => out?.families ?? [], [out]);
  // ── garments PROVABLY the same are not asked (owner 16.10: «why do we need it if identical»):
  // the engine reported what tells the models apart (`variantMarks` present) and found nothing —
  // no cutting line (knife), no piece of one model's own, no unsure label — and every garment gets
  // the same pieces. Without that report the client cannot know: the engine cuts a model along its
  // own cutting lines (pieces/variants.ts `variantKnives`) even when no seed carries the model,
  // so styles sharing every seed may still differ (kombinezon: A and B cut the waist and the
  // bodice at different heights) → asked, each garment's picture drawn from its marks
  // (`garmentPicture`: its own outlines, its cutting lines in blue). The automatic pick goes through the shell's `autoAnswer` (a
  // running autopilot is resumed, not disarmed), once per run; said in the panel and the header
  // (D5: never silent), «change» asks the question ──
  const marks: VariantMark[] = out?.variantMarks ?? [];
  // `[]` (present, empty) = the engine proved the models identical; absent = unknown → ask
  const marksSayNone = Array.isArray(out?.variantMarks) && out.variantMarks.length === 0;
  const pieceSetOf = (v: string) =>
    families
      .filter((f) => {
        const sv = out?.seeds.find((x) => x.id === f.seed)?.variant;
        return sv == null || sv === v;
      })
      .map((f) => f.seed)
      .sort((a, b) => a - b)
      .join(',');
  const sets = variants.map(pieceSetOf);
  const looksSame = variants.length > 1 && marksSayNone && sets.every((k) => k === sets[0]);
  const autoPick = named?.pick ?? variants[0] ?? null;
  const autoGo =
    looksSame &&
    !session.variant &&
    seen.autoTried !== session.sessionId &&
    !seen.autoReopened &&
    !!autoPick &&
    families.length > 0;
  const autoAnswer = useAutoAnswer(api);
  // LIKELY ANSWERS (ui-bits): what «skip — decide for me» takes on this step
  const likelyModel = useLikelySlot('pieces-model');
  const likelyTouch = useLikelySlot('pieces-touch');
  const likelyAside = useLikelySlot('pieces-aside');
  useEffect(() => {
    if (!autoGo || session.busy || !autoPick) return;
    // the one-shot guard is read and set HERE, right before the send: a StrictMode replay of this
    // effect (same render, same `autoGo`) finds it taken and sends nothing
    const sid = session.sessionId;
    if (sid == null || seen.autoTried === sid) return;
    seen.autoTried = sid;
    seen.autoVariant = autoPick;
    void autoAnswer({ type: 'variant', variant: autoPick });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoGo, session.busy]);
  /** A garment is still to pick: the regions and outlines asked belong to no garment yet. */
  const modelOpen = variants.length > 1 && !session.variant;
  // skip: the garment the card names (strong or suggested); none named = no safe guess, a stop
  likelyModel.current =
    variants.length > 1 && !session.variant && !autoGo && named?.pick && !session.busy
      ? {
          key: 'pieces-model',
          what: 'garment',
          answer: `${named.pick} (${named.strong ? 'the card names it' : 'suggested by the card'})`,
          sig: named.pick,
          likely: () => autoAnswer({ type: 'variant', variant: named.pick }),
        }
      : null;
  /** The garment on screen was picked for the operator (not asked). */
  const autoShown = !!session.variant && session.variant === seen.autoVariant && !seen.autoReopened;
  const reopenVariant = () => {
    seen.autoReopened = true;
    void api.dispatch({ type: 'variant', variant: null });
  };
  const [hot, setHot] = useState<Hot>(null);
  const [, bump] = useState(0);
  /** The tools strip is for ?debug=1 only: an answer starts the tool it needs. */
  const debug = debugUi();
  /** The answer just clicked, shown as working while the run is busy (no silent click). */
  const [doing, setDoing] = useState<string | null>(null);
  useEffect(() => {
    if (!session.busy) setDoing(null);
  }, [session.busy]);
  useEffect(() => {
    if (tool === 'pan') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Esc here cancels the drawing only: never the wizard's own Esc (discard this import?)
      e.preventDefault();
      e.stopPropagation();
      if (splitRef.current?.stage === 2) splitRef.current = null;
      setGapA(null);
      setTool('pan');
      setLassoJoin(false);
      setLassoSplit(false);
    };
    // capture on window: before the dialog's own Esc listener on the document
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [tool]);
  // the outlines left out on a guess that are big enough to be a piece: the optional check
  const weakList = out ? weakAsides(out.setAside, families, out.seeds).filter(askable) : [];
  const go = useAnsweredAndGo();
  const markOf = useMemo(() => new Map(families.map((f, i) => [f.seed, i + 1])), [families]);

  // ── what needs a fix: only the sizes that are exported must close (the footer's own rule) ──
  const mapped = exportedRanks(session.sizes?.map);
  const isExp = (r: number) => !mapped || mapped.has(r);
  const needsFix = (f: PieceFamily) =>
    f.candidates.some((c) => isExp(c.rank) && c.outcome !== 'closed');
  const cand = (f: PieceFamily) => f.candidates[Math.min(rank, f.candidates.length - 1)];
  /** The size that shows the region's problem: the one on screen, else the first open one. */
  const problemOf = (f: PieceFamily): PieceCandidate => {
    const c = cand(f);
    return c.outcome !== 'closed' && isExp(c.rank)
      ? c
      : f.candidates.find((x) => isExp(x.rank) && x.outcome !== 'closed') ?? c;
  };
  // D6: a piece (or a whole tile sheet) drawn twice, or one cut between two sheets — asked here
  const sheetQ = out ? sheetQuestion(out.sheets, api.inputs.sheetAnswers) : null;

  // A reseed moves the seed: draw its marker where the operator clicked, not where the text put
  // it (FLY-final M2: the marker stayed at the old point). Undo drops the edit and moves it back.
  const movedTo = new Map<number, PtMm>();
  for (const e of inputs.edits) if (e.kind === 'reseed') movedTo.set(e.seed, e.at);
  const seedAt = (id: number) => out?.seeds.find((s) => s.id === id);
  const pointOf = (id: number) => movedTo.get(id) ?? seedAt(id)?.at;
  /** A part's word: its number on the sheet, else plainly that it has none. */
  const nameOf = (seed: number) => String(markOf.get(seed) ?? 'unnamed part');
  const sizeLabel = (r: number) => runSizes.find((z) => z.rank === r)?.label || `#${r + 1}`;
  // every number's own outline per size while it closes alone (the touch picture's two parts)
  for (const f of families)
    for (const c of f.candidates)
      if (c.outcome === 'closed' && c.outer.length > 2) {
        const m = seen.own.get(f.seed) ?? new Map<number, { outer: PtMm[]; areaMm2: number }>();
        m.set(c.rank, { outer: c.outer, areaMm2: c.areaMm2 });
        seen.own.set(f.seed, m);
      }

  /**
   * Two numbers in one outline: the region's own other number is the one whose fill, at the same
   * size, is ALSO 'two pieces touch' and gives the same region (same area within 3 %, its number
   * inside this outline). A separately closed nested piece (a pocket, a facing) sits inside too but
   * closes on its own — 'closed', another area — so it is never taken for a part of this one.
   */
  const rawPartners = (f: PieceFamily, c: PieceCandidate): PieceFamily[] =>
    c.outcome !== 'merged' || c.outer.length < 3
      ? []
      : families.filter((g) => {
          if (g.seed === f.seed) return false;
          const gc = g.candidates.find((x) => x.rank === c.rank);
          if (!gc || gc.outcome !== 'merged') return false;
          if (Math.abs(gc.areaMm2 - c.areaMm2) > 0.03 * c.areaMm2) return false;
          const at = pointOf(g.seed);
          return !!at && inside(at, c.outer);
        });
  /** Proven only when reciprocal and unique: each of the two lists exactly the other. */
  const partnersOf = (f: PieceFamily, c: PieceCandidate): PieceFamily[] => {
    const raw = rawPartners(f, c);
    if (raw.length !== 1) return [];
    const gc = raw[0].candidates.find((x) => x.rank === c.rank);
    const back = gc ? rawPartners(raw[0], gc) : [];
    return back.length === 1 && back[0].seed === f.seed ? raw : [];
  };
  const broughtBack = new Set([...seen.promoted.values()].map((x) => x.seed));
  /**
   * Every number of a region where pieces touch: the pair rule's, the part already cut mid-split
   * (its outline no longer overlaps), and a brought-back outline whose number sits in it (after a
   * cut it no longer reads as the same region, so the pair rule alone would miss it).
   */
  const partsOf = (f: PieceFamily, c: PieceCandidate): PieceFamily[] => {
    if (c.outcome !== 'merged') return [f];
    const cut =
      seen.split?.stage === 2 && seen.split.other === f.seed
        ? families.find((g) => g.seed === seen.split!.first)
        : undefined;
    const back =
      c.outer.length > 2
        ? families.filter((g) => {
            if (g.seed === f.seed || !broughtBack.has(g.seed)) return false;
            const at = pointOf(g.seed);
            return !!at && inside(at, c.outer);
          })
        : [];
    return [...new Set([f, ...rawPartners(f, c), ...(cut ? [cut] : []), ...back])];
  };
  /** A part's own area: its outline when it closed alone, its outline seed's, the one brought back. */
  const partArea = (seed: number, r: number, whole: number) => {
    const ok = (a?: number) => (a != null && a > 0 && a < 0.97 * whole ? a : null);
    const back = [...seen.promoted.values()].find((x) => x.seed === seed)?.aside;
    return (
      ok(seen.own.get(seed)?.get(r)?.areaMm2) ??
      ok(seedAt(seed)?.face?.areaMm2) ??
      ok(back?.areaMm2) ??
      null
    );
  };
  const merges = (seeds: number[]) =>
    inputs.edits.some(
      (e) =>
        e.kind === 'merge' &&
        e.seeds.length === seeds.length &&
        seeds.every((s) => e.seeds.includes(s)),
    );
  // ── two pieces touch: ONE question per region (every number in it), its likely answer known ──
  const touchGroups: TouchGroup[] = [];
  const grouped = new Set<number>();
  for (const f of families) {
    if (!needsFix(f) || grouped.has(f.seed)) continue;
    const c = problemOf(f);
    if (c.outcome !== 'merged') continue;
    const seeds = partsOf(f, c)
      .map((g) => g.seed)
      .filter((s) => s === f.seed || !grouped.has(s));
    for (const s of seeds) grouped.add(s);
    const key = `t${[...seeds].sort((a, b) => a - b).join('-')}`;
    // a part under a twentieth of the rest (a label, a mark) is most likely not a piece
    const tiny = seeds.filter((s) => {
      const a = partArea(s, c.rank, c.areaMm2);
      return a != null && a < 0.05 * (c.areaMm2 - a);
    });
    const likely: TouchGroup['likely'] =
      seeds.length >= 2 && tiny.length === 1 ? { kind: 'drop', seed: tiny[0] } : { kind: 'join' };
    const proven = seeds.length === 2 && partnersOf(f, c).length === 1;
    // two printed piece numbers can be two real pieces drawn touching: those are always asked
    const printed = seeds.filter((s) => seedAt(s)?.origin === 'text' && !broughtBack.has(s));
    touchGroups.push({
      key,
      seeds,
      rank: c.rank,
      outer: c.outer,
      areaMm2: c.areaMm2,
      proven,
      likely,
      // joined once without asking; undone → asked (the merge edit gone from the inputs)
      auto:
        proven &&
        likely.kind === 'join' &&
        printed.length < 2 &&
        (!seen.autoDone.has(key) || merges(seeds)),
    });
  }
  /** The exported sizes a region touches in («8, 10, 12»): one answer covers them all. */
  const touchSizes = (g: TouchGroup) => {
    const f = families.find((x) => x.seed === g.seeds[0]);
    return (f?.candidates ?? [])
      .filter((c) => isExp(c.rank) && c.outcome === 'merged')
      .map((c) => sizeLabel(c.rank));
  };
  const touchWords = (g: TouchGroup) => {
    const z = touchSizes(g);
    return z.length > 1 ? ` · applied to sizes ${z.join(', ')}` : '';
  };
  const askTouch = touchGroups.filter((g) => !g.auto);
  const bulk = askTouch.filter((g) => !seen.touchOff.has(g.key));
  /** Every region still asked has the same likely answer: one question for them all. */
  const together =
    bulk.length >= 2 && bulk.every((g) => g.likely.kind === bulk[0].likely.kind) ? bulk : [];

  // ── the set-aside outlines: which are asked, which are answered by the data alone ──
  const pv = session.chains?.chainPreview ?? [];
  type AsideItem = { a: SetAside; seed: number | null; picked: boolean };
  /** The geometry asked of the set-aside outlines, once per pieces run (the step re-renders a lot). */
  const asideCache = () => {
    if (seen.asideCache.out !== out) seen.asideCache = { out, m: new Map() };
    return seen.asideCache.m;
  };
  const lastEdit = inputs.edits[inputs.edits.length - 1];
  const dropped = (seed: number) =>
    inputs.edits.some((e) => e.kind === 'not-a-piece' && e.seed === seed);
  for (const a of weakList) seen.asideById.set(a.id, a);
  // a stopped batch repeated by the footer's «run again» (its move, STOPFIX) brought outlines back
  // outside the quiz's send: they are that send's — adopted, so «try again» sends only their joins
  // and undo leaves them out again
  if (!seen.committing && seen.answers.size)
    for (const c of inputs.clickSeeds) {
      const a = c.aside == null ? undefined : seen.asideById.get(c.aside);
      if (!a || seen.promoted.has(a.id) || !seen.answers.has(a.id) || dropped(c.id)) continue;
      if (weakList.some((w) => w.id === a.id)) continue;
      seen.promoted.set(a.id, { aside: a, seed: c.id });
      if (seen.pendingBefore) seen.pendingFresh = [...seen.pendingFresh, c.id];
    }
  const asideItems: AsideItem[] = [
    ...weakList
      .filter((a) => !seen.promoted.has(a.id))
      .map((a) => ({ a, seed: null, picked: false })),
    ...[...seen.promoted.values()].map((p) => ({
      a: p.aside,
      seed: p.seed,
      picked: !dropped(p.seed),
    })),
  ];
  // ── «part of piece N»: a set-aside outline drawn against a piece (a hem or cuff extension drawn
  // under it as its own rectangle) is brought back and joined to that piece in one answer ──
  type Join = {
    /** The outline lies inside this piece (its edge on or within the piece's): a zone of it. */
    inner: boolean;
    /** Inside the piece in some sizes, outside it in others: a strip between its graded lines. */
    graded: boolean;
    /** Its whole edge on the piece's outline in some size: the piece's own line, another size. */
    same: boolean;
    insideMm: number;
    perimMm: number;
    seed: number;
    sharedMm: number;
    full: boolean;
    below: boolean;
    outer: PtMm[];
    edge: PtMm[][];
  };
  /** The pieces an outline touches (an edge shared, or more than a hairline over), most first. */
  const joinsOf = (it: AsideItem): Join[] => {
    const own = it.seed;
    const key = `j${it.a.id}:${own ?? ''}:${rank}`;
    const hit = asideCache().get(key) as Join[] | undefined;
    if (hit) return hit;
    const a = it.a;
    const w = a.box.maxX - a.box.minX;
    const h = a.box.maxY - a.box.minY;
    const side = Math.min(w, h);
    const ol = a.areaMm2 > 0 && w > 0 && h > 0 ? asideOutline(a.box, pv) : null;
    const res: Join[] = [];
    for (const f of ol ? families : []) {
      if (f.seed === own) continue;
      let best: (AsideTouch & { c: PieceCandidate }) | null = null;
      /** The size where it lies inside the piece (per size: a strip between graded lines lies
       * outside the small sizes and inside the big ones — a zone of the piece all the same). */
      let within: (AsideTouch & { c: PieceCandidate }) | null = null;
      /** Sizes it lies within / clearly outside; its edge IS the piece's line in some size. */
      let inRanks = 0;
      let outRanks = 0;
      let same = false;
      // the size on screen first: its outline is the one the picture draws
      const cs = [cand(f), ...f.candidates.filter((c) => c !== cand(f))];
      for (const c of cs) {
        if (c.outcome !== 'closed' || c.outer.length <= 4) continue;
        const b = c.bbox;
        if (b.minX > a.box.maxX + 4 || b.maxX < a.box.minX - 4) continue;
        if (b.minY > a.box.maxY + 4 || b.maxY < a.box.minY - 4) continue;
        const t = asideTouch(ol!, c.outer);
        if (!best || t.sharedMm > best.sharedMm + 1) best = { ...t, c };
        const on = t.insideMm + t.sharedMm >= 0.95 * t.perimMm;
        if (on) inRanks++;
        else if (t.insideMm + t.sharedMm < 0.5 * t.perimMm) outRanks++;
        if (t.sharedMm >= 0.95 * t.perimMm) same = true;
        if (!within && on) within = { ...t, c };
      }
      if (!best) continue;
      const hair = Math.max(5, 0.1 * side);
      // round the whole piece (a frame, the sheet's margin): never a part of it
      if (holds(a.box, best.c.bbox) && !holds(best.c.bbox, a.box)) continue;
      // its whole edge on or inside the piece's (in some size): a zone of that piece (a waistband
      // or facing drawn within it, or the piece's own line in another size) — nothing to join
      const inner = !!within;
      if (within) best = within;
      if (best.sharedMm < hair && best.insideMm < hair) continue;
      if (!inner) {
        // bigger than the piece: the piece is the part, not the other way round
        if (a.areaMm2 > best.c.areaMm2) continue;
        // a band between two lines (graded size lines): narrower than any piece is cut
        if (side < 2 * SLIVER_MM) continue;
      }
      res.push({
        // between the piece's own graded lines: inside the big sizes, outside the small ones
        graded: inner && outRanks > 0 && inRanks > 0,
        same,
        insideMm: best.insideMm,
        perimMm: best.perimMm,
        inner,
        seed: f.seed,
        sharedMm: best.sharedMm,
        full: best.full,
        below: a.box.maxY <= best.c.bbox.minY + 2,
        outer: best.c.outer,
        edge: best.edge,
      });
    }
    res.sort((x, y) => y.sharedMm - x.sharedMm);
    asideCache().set(key, res);
    return res;
  };
  /** A box round another (3 mm slack: a face's box is cut from a raster). */
  const holds = (o: BoxMm, i: BoxMm) =>
    o.minX <= i.minX + 3 && o.minY <= i.minY + 3 && o.maxX >= i.maxX - 3 && o.maxY >= i.maxY - 3;
  /** One full edge shared with exactly one piece: «part of piece N» is the likely answer. */
  const likelyJoin = (js: Join[]) =>
    js.length > 0 && js[0].full && (js.length === 1 || js[1].sharedMm < 0.2 * js[0].sharedMm);
  /** The outline can still be brought back by this answer (a re-dropped one: its drop taken off). */
  const canJoin = (it: AsideItem) => it.seed == null || it.picked || dropped(it.seed);
  // the real pieces' sizes (the size on screen): an outline far outside them is no piece
  const pieceAreas = families
    .map((f) => cand(f).areaMm2)
    .filter((x) => x > 0)
    .sort((a, b) => a - b);
  const typical = pieceAreas.length ? pieceAreas[Math.floor(pieceAreas.length / 2)] : 0;
  /** The size key's samples (the legend rows' own drawing): an outline round them is the legend. */
  const legendAt = (session.chains?.classes ?? []).flatMap((c) =>
    c.evidence.flatMap((e) => (e.kind === 'legend-sample' ? [e.at, e.textAt] : [])),
  );
  /**
   * What the data says about an outline left out on a guess:
   * - 'join': one full edge on exactly one piece (a hem rectangle drawn under it) — «part of piece N»;
   * - 'auto': PROVEN no piece — an engine reason (frame, table, legend, …), an engine-proven size
   *   copy, a strip between a piece's own graded lines, the piece's own line in another size, the
   *   size key's samples, a garment sketch (mostly open strokes) — never asked, on a quiet line
   *   with «show» and a way back;
   * - 'group': a likely answer only (a closed shape inside a piece, a frame round a piece, a small
   *   outline, marks) — asked, one question per kind with its pictures, the likely answer chosen;
   * - 'ask': could be a piece, asked alone.
   */
  type GroupKey = 'inner' | 'frame' | 'small' | 'marks';
  type AsideClass =
    | { kind: 'ask' | 'join' }
    | { kind: 'auto'; word: string; host?: number }
    | { kind: 'group'; group: GroupKey; word: string; host?: number };
  const classOf = (it: AsideItem): AsideClass => {
    // brought back by the operator: theirs, asked as it is (a «part of» one still with its piece)
    if (it.seed != null) return likelyJoin(joinsOf(it)) ? { kind: 'join' } : { kind: 'ask' };
    const key = `c${it.a.id}:${rank}`;
    const hit = asideCache().get(key) as AsideClass | undefined;
    if (hit) return hit;
    const group = (g: GroupKey, word: string, host?: number): AsideClass => ({
      kind: 'group',
      group: g,
      word,
      host,
    });
    const c = ((): AsideClass => {
      const a = it.a;
      // the engine's own word first
      if (a.reason === 'legend') return auto('legend');
      if (a.reason === 'table') return auto('table');
      if (a.reason === 'code-text') return auto('text block');
      if (a.reason === 'logo') return auto('logo');
      if (a.reason === 'test-square') return auto('test square');
      if (a.reason === 'sheet' || a.reason === 'tile-frame' || a.reason === 'background')
        return auto('frame');
      if (a.reason === 'size-copy' && out && provenCopy(a, families, out.seeds))
        return auto('other size');
      const js = joinsOf(it);
      const inner = js.filter((j) => j.inner);
      if (inner.length === 1) {
        const j = inner[0];
        if (j.same) return { kind: 'auto', word: 'other size', host: j.seed };
        if (j.graded || a.copy?.how === 'lines' || a.copy?.how === 'sliver')
          return { kind: 'auto', word: 'strip between sizes', host: j.seed };
        return group('inner', `inside piece ${nameOf(j.seed)}`, j.seed);
      }
      if (likelyJoin(js)) return { kind: 'join' };
      const box = a.box;
      const w = box.maxX - box.minX;
      const h = box.maxY - box.minY;
      const inBox = (p: PtMm) =>
        p.x >= box.minX && p.x <= box.maxX && p.y >= box.minY && p.y <= box.maxY;
      if (legendAt.filter(inBox).length >= 2) return auto('legend');
      const area = a.areaMm2 > 0 ? a.areaMm2 : w * h;
      // what is drawn inside it: a pattern piece holds a few long lines (grain, notches)
      const { idx, small } = ownChains(box, pv);
      const isClosed = (i: number) => {
        const c = pv[i];
        return c.length >= 8 && Math.hypot(c[0] - c[c.length - 2], c[1] - c[c.length - 1]) <= 0.5;
      };
      const open = idx.filter((i) => !isClosed(i)).length;
      // round a whole piece: likely the sheet's frame or a box drawn round a piece — asked (a real
      // piece is never dropped on a guess)
      if (families.some((f) => holds(box, cand(f).bbox) && !holds(cand(f).bbox, box)))
        return group('frame', 'frame');
      // a drawing of the garment: many short strokes, mostly open (gathers, a zigzag)
      if (idx.length >= 10 && small >= 0.5 * idx.length && open >= 0.6 * idx.length)
        return auto('sketch');
      if (small >= 6 && small > idx.length * 0.5) return group('marks', 'marks');
      if (pieceAreas.length && area < 0.5 * pieceAreas[0]) return group('small', 'small outline');
      if (pieceAreas.length && area > 1.5 * pieceAreas[pieceAreas.length - 1])
        return group('frame', 'frame');
      return { kind: 'ask' };
    })();
    asideCache().set(key, c);
    return c;
  };
  const auto = (word: string): AsideClass => ({ kind: 'auto', word });
  // ── the set-aside quiz: one outline at a time, an edge shared with a piece first, then the
  // likeliest pieces; what the data answers is never asked ──
  const rankOf = (it: AsideItem) => {
    const a = it.a;
    const area = a.areaMm2 > 0 ? a.areaMm2 : (a.box.maxX - a.box.minX) * (a.box.maxY - a.box.minY);
    const off = typical > 0 && area > 0 ? Math.abs(Math.log(area / typical)) : 9;
    return (likelyJoin(joinsOf(it)) ? -100 : 0) + off;
  };
  const autoOut = asideItems.filter((it) => classOf(it).kind === 'auto');
  const singles = asideItems
    .filter((it) => {
      const k = classOf(it).kind;
      return k === 'ask' || k === 'join';
    })
    .sort((x, y) => rankOf(x) - rankOf(y) || x.a.id - y.a.id);
  const joinItems = singles.filter((it) => classOf(it).kind === 'join');
  /**
   * The quiz, card by card: the «part of piece N» outlines (together when there are several),
   * then one card per kind of likely non-piece, then the outlines that could be a piece.
   */
  type QuizCard =
    | { key: string; kind: 'one'; it: AsideItem }
    | { key: string; kind: 'group'; group: GroupKey | 'join'; items: AsideItem[] };
  const GROUP_ORDER: GroupKey[] = ['inner', 'frame', 'small', 'marks'];
  const quizCards: QuizCard[] = [
    ...(joinItems.length >= 2
      ? [{ key: 'g-join', kind: 'group' as const, group: 'join' as const, items: joinItems }]
      : joinItems.map((it) => ({ key: `a${it.a.id}`, kind: 'one' as const, it }))),
    ...GROUP_ORDER.flatMap((g) => {
      const items = asideItems.filter((it) => {
        const c = classOf(it);
        return c.kind === 'group' && c.group === g;
      });
      return items.length ? [{ key: `g-${g}`, kind: 'group' as const, group: g, items }] : [];
    }),
    ...singles
      .filter((it) => classOf(it).kind !== 'join')
      .map((it) => ({ key: `a${it.a.id}`, kind: 'one' as const, it })),
  ];
  const cardItems = (c: QuizCard) => (c.kind === 'one' ? [c.it] : c.items);
  const cardDone = (c: QuizCard) => cardItems(c).every((it) => seen.asideDone.includes(it.a.id));
  const cardsLeft = quizCards.filter((c) => !cardDone(c));
  /** Every outline the quiz asks about (one by one or in a group). */
  const quiz = quizCards.flatMap(cardItems);
  const quizLeft = quiz.filter((it) => !seen.asideDone.includes(it.a.id));

  // ── THE GUIDE: every open question in the footer's order; one is on the card at a time ──
  const openProblems: Problem[] = [
    ...(variants.length > 1 && !session.variant && !autoGo
      ? [{ key: 'model', kind: 'model' } as const]
      : []),
    ...families.filter(needsFix).flatMap((f): Problem[] => {
      const g = touchGroups.find((x) => x.seeds[0] === f.seed);
      // another number of a region asked under its first number
      if (!g && grouped.has(f.seed)) return [];
      if (g?.auto) return [];
      if (g && together.includes(g))
        return g === together[0] ? [{ key: 'touch', kind: 'touch', groups: together }] : [];
      const c = problemOf(f);
      return [
        {
          key: g ? g.key : `r${f.seed}`,
          kind: 'region',
          seed: f.seed,
          rank: c.rank,
          outcome: c.outcome,
          group: g,
        },
      ];
    }),
    ...(sheetQ ? [{ key: 'sheet', kind: 'sheet' } as const] : []),
    ...((weakList.length || seen.promoted.size) && !seen.asideOk
      ? [{ key: 'aside', kind: 'aside' } as const]
      : []),
  ];
  /** The questions that must be answered (the set-aside check is optional). */
  const required = openProblems.filter((p) => p.kind !== 'aside');
  /** The question the operator picked (a checklist row, a region on the sheet); else the first. */
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const active = openProblems.find((p) => p.key === activeKey) ?? openProblems[0] ?? null;
  const cardNow = active?.kind === 'aside' ? cardsLeft[0] ?? null : null;
  const quizNow = cardNow?.kind === 'one' ? cardNow.it : null;
  const groupNow = cardNow?.kind === 'group' ? cardNow : null;
  const quizJoins = quizNow && canJoin(quizNow) ? joinsOf(quizNow).slice(0, 2) : [];
  const quizLikely = likelyJoin(quizJoins);
  /** A group card: each outline's likely answer, and the other one (its picture clicked). */
  const groupAns = (g: GroupKey | 'join', it: AsideItem, flipped: boolean): AsideAnswer => {
    if (g === 'join') return flipped ? 'no' : { join: joinsOf(it)[0]?.seed ?? -1 };
    return flipped ? 'yes' : 'no';
  };
  const groupWord = (g: GroupKey | 'join', it: AsideItem, flipped: boolean) => {
    const host = g === 'join' ? joinsOf(it)[0]?.seed : (classOf(it) as { host?: number }).host;
    if (g === 'join' || g === 'inner')
      return flipped
        ? g === 'join'
          ? 'not part of it'
          : 'its own piece'
        : `part of piece ${host != null ? nameOf(host) : '?'}`;
    return flipped ? 'a piece' : (classOf(it) as { word?: string }).word ?? 'not a piece';
  };
  const hostsOf = (items: AsideItem[], g: GroupKey | 'join') =>
    [
      ...new Set(
        items.flatMap((it) => {
          const h = g === 'join' ? joinsOf(it)[0]?.seed : (classOf(it) as { host?: number }).host;
          return h != null ? [h] : [];
        }),
      ),
    ]
      .sort((x, y) => (markOf.get(x) ?? 0) - (markOf.get(y) ?? 0))
      .map(nameOf);
  const groupQ = (c: Extract<QuizCard, { kind: 'group' }>) => {
    const n = c.items.length;
    const hs = hostsOf(c.items, c.group);
    const pcs = `piece${hs.length > 1 ? 's' : ''} ${hs.join(', ')}`;
    switch (c.group) {
      case 'join':
        return `the ${n} blue outlines ${c.items.every((it) => joinsOf(it)[0]?.below) ? 'under' : 'against'} ${pcs}: part of those pieces?`;
      case 'inner':
        return `${n > 1 ? `the ${n} blue shapes` : 'the blue shape'} inside ${pcs}: part of ${hs.length > 1 || n > 1 ? 'them' : `piece ${hs[0]}`}?`;
      case 'frame':
        return `${plural(n, 'frame')} round pieces: not pieces?`;
      case 'small':
        return `${plural(n, 'small outline')}: not pieces?`;
      default:
        return `${plural(n, 'outline')} of marks or text: not pieces?`;
    }
  };
  /** The set-aside card's one question. */
  const asideQ = groupNow
    ? groupQ(groupNow)
    : quizNow
      ? quizLikely
        ? `is the blue outline part of piece ${nameOf(quizJoins[0].seed)}?`
        : 'is the blue outline a pattern piece?'
      : seen.answers.size
        ? seen.applyFailed
          ? `couldn't apply ${plural(seen.answers.size, 'answer')}: try again?`
          : `apply ${plural(seen.answers.size, 'answer')}?`
        : 'none of these is a piece: all right?';
  /** Every question seen open since the step opened (or the model last changed): fixed ones stay. */
  if (seen.variant !== (session.variant ?? null)) {
    // another model is another set of regions: what the last one asked is not "fixed"
    seen.variant = session.variant ?? null;
    for (const k of [...seen.rows.keys()]) if (k !== 'model') seen.rows.delete(k);
    seen.asideOk = false;
    seen.asideDone = [];
    seen.promoted.clear();
    seen.asideById.clear();
    seen.split = null;
    seen.own.clear();
    seen.autoDone.clear();
    seen.touchOff.clear();
    seen.applied = null;
    seen.asideSteps = [];
    seen.answers = new Map();
    seen.flip = new Set();
  }
  // the engine proves two numbers name one outline: joined without asking, said on a quiet line
  const autoNext = touchGroups.find((g) => g.auto && !seen.autoDone.has(g.key));
  useEffect(() => {
    if (!autoNext || session.busy || seen.autoDone.has(autoNext.key)) return;
    seen.autoDone.add(autoNext.key);
    seen.applied = {
      text: `${autoNext.seeds.map(nameOf).join(' and ')} are one outline: joined${touchWords(autoNext)}`,
      n: 1,
      at: inputs.edits.length + 1,
    };
    // an automatic answer, not the operator's: through the shell's autoAnswer (the whole edit list,
    // as editPieces would send it), so a running autopilot is resumed, never disarmed
    void autoAnswer({
      type: 'piece-edits',
      edits: [...inputs.edits, { kind: 'merge', seeds: autoNext.seeds }],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoNext?.key, session.busy]);
  // a gap of a pen's width between two line ends that point at each other: closed without asking
  // (once; undone = asked), said on the quiet line
  const ignoredNow = new Set(
    inputs.edits.flatMap((e) => (e.kind === 'ignore-line' ? [e.chain] : [])),
  );
  const gapOf = (seed: number, c: PieceCandidate) => {
    if (!c.leakAt) return null;
    const key = `g${seed}:${c.rank}:${inputs.edits.length}`;
    const m = asideCache();
    // only the ends of the leaking outline's own walls: a gap in THIS piece, not a line nearby
    if (!m.has(key)) m.set(key, findGap(c.leakAt, pv, ignoredNow, 40, new Set(c.walls)));
    return m.get(key) as GapGuess | null;
  };
  /**
   * The size a bridge serves: the leaking size, unless every exported size leaks through that
   * same gap (both ends within half a millimetre) — then every size.
   */
  const gapRank = (f: PieceFamily, c: PieceCandidate, g: GapGuess): number | null => {
    const exp = f.candidates.filter((x) => isExp(x.rank));
    const near = (p: PtMm, q: PtMm) => Math.hypot(p.x - q.x, p.y - q.y) <= 0.5;
    const all =
      exp.length > 0 &&
      exp.every((x) => {
        if (x.outcome !== 'leak') return false;
        const h = gapOf(f.seed, x);
        return (
          !!h &&
          ((near(h.from, g.from) && near(h.to, g.to)) || (near(h.from, g.to) && near(h.to, g.from)))
        );
      });
    return all ? null : c.rank;
  };
  /**
   * A bridge sent (by hand or by itself): it must close that piece in that size. One that did not
   * is taken back when it was automatic, and said when it was the operator's.
   */
  useEffect(() => {
    const k = seen.gapCheck;
    if (!k || session.busy || inputs.edits.length !== k.at) return;
    seen.gapCheck = null;
    const f = families.find((x) => x.seed === k.seed);
    const c = f?.candidates.find((x) => x.rank === k.rank);
    if (!c || c.outcome === 'closed') return;
    if (k.auto) {
      seen.applied = null;
      void autoAnswer({ type: 'piece-edits', edits: inputs.edits.slice(0, -1) });
    } else setHint(`piece ${nameOf(k.seed)} is still open there — undo, or close it by hand`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.busy, inputs.edits.length]);
  const autoGap = autoNext
    ? null
    : families
        .filter(needsFix)
        .flatMap((f) =>
          f.candidates
            .filter((c) => isExp(c.rank) && c.outcome === 'leak')
            .slice(0, 1)
            .map((c) => ({ f, c, g: gapOf(f.seed, c), key: `gap${f.seed}` })),
        )
        .find((x) => x.g && x.g.facing && x.g.mm <= 2 && !seen.autoDone.has(x.key));
  useEffect(() => {
    if (!autoGap?.g || session.busy || seen.autoDone.has(autoGap.key)) return;
    seen.autoDone.add(autoGap.key);
    seen.applied = {
      text: `piece ${nameOf(autoGap.f.seed)}: a ${autoGap.g.mm.toFixed(1)} mm gap closed`,
      n: 1,
      at: inputs.edits.length + 1,
    };
    seen.gapCheck = {
      seed: autoGap.f.seed,
      rank: autoGap.c.rank,
      at: inputs.edits.length + 1,
      auto: true,
    };
    void autoAnswer({
      type: 'piece-edits',
      edits: [
        ...inputs.edits,
        {
          kind: 'bridge',
          seed: autoGap.f.seed,
          rank: gapRank(autoGap.f, autoGap.c, autoGap.g),
          from: autoGap.g.from,
          to: autoGap.g.to,
        },
      ],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoGap?.key, session.busy]);
  // the card follows the active question: a resolved region hands over to the next one by itself
  const guided = useRef(false);
  const activeRegion = active?.kind === 'region' ? active : null;
  // the question for several regions: the sheet goes to the first of them
  const viewAt =
    activeRegion ??
    (active?.kind === 'touch'
      ? { seed: active.groups[0].seeds[0], rank: active.groups[0].rank, outcome: 'merged' }
      : null);
  useEffect(() => {
    // the step opened from check / details: the piece it was sent to keeps the view
    const keep = !guided.current && !!focus;
    guided.current = true;
    if (keep || !viewAt) return;
    jump({ seed: viewAt.seed, rank: viewAt.rank });
    setGapA(null);
    setTool('pan');
    // the same region asked again after an answer (two pieces → a gap) is a new question too
  }, [active?.key, viewAt?.outcome, viewAt?.rank]);
  // a loop has applied: did it split? Two identified parts, both closed, adding up to the region
  useEffect(() => {
    const p = splitRef.current;
    if (!p) return;
    const want = [...p.baseline, ...p.cuts];
    const same = (n: number) =>
      inputs.edits.length >= n && want.slice(0, n).every((e, i) => inputs.edits[i] === e);
    // another edit came in between (an undo, a drop, a gap): the transaction ends, nothing undone
    // an undo that took a recorded cut off (fewer edits than the transaction holds, with nothing
    // still in flight) ends it too — else stage 2 would wait for a cut that is no longer there
    const shrunk = inputs.edits.length < want.length && !session.busy && out !== p.sent;
    if (
      shrunk ||
      !same(Math.min(inputs.edits.length, want.length)) ||
      inputs.edits.length > want.length
    ) {
      splitRef.current = null;
      setHint('split stopped — answer again');
      return;
    }
    if (p.stage === 2 || session.busy || inputs.edits.length !== want.length || out === p.sent)
      return;
    const at = (seed: number) =>
      families.find((f) => f.seed === seed)?.candidates.find((c) => c.rank === p.rank);
    // back to exactly the edits before the first loop: the cuts are the last edits (checked above),
    // so taking them off one by one restores that list (the session has no 'set edits' answer
    // that keeps its own copy in step)
    const restore = () => {
      splitRef.current = null;
      setHint("didn't split — try again");
      void (async () => {
        for (let k = 0; k < p.cuts.length; k++) await api.editPieces('undo');
      })();
    };
    const a = at(p.first);
    const b = at(p.other);
    const partition = (x: number, y: number) => Math.abs(x + y - p.orig) <= 0.05 * p.orig;
    if (p.stage === 1) {
      if (!a || a.outcome !== 'closed' || a.areaMm2 > 0.97 * p.orig) return restore();
      if (b?.outcome === 'merged') {
        // the other part still reads as the whole region: ask for its loop
        splitRef.current = { ...p, stage: 2, a1: a.areaMm2 };
        setHint(null);
        setSel(p.other);
        setRank(p.rank);
        setZoomTo({ seed: p.other, rank: p.rank });
        setLassoJoin(false);
        setLassoSplit(true);
        setTool('lasso');
        return;
      }
      // the other part closed by itself: it must still be the rest of the region
      if (b?.outcome === 'closed' && partition(a.areaMm2, b.areaMm2)) {
        splitRef.current = null;
        setHint('split into two parts');
        return;
      }
      return restore();
    }
    if (!b || b.outcome !== 'closed' || !a || a.outcome !== 'closed') return restore();
    if (!partition(a.areaMm2, b.areaMm2)) return restore();
    splitRef.current = null;
    setHint('split into two parts');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [out, session.busy, inputs.edits]);
  // a new question closes the pieces list: while one is open, the card is the only thing to read
  useEffect(() => {
    setClosedOpen(false);
  }, [active?.key]);

  // the set-aside quiz answers not sent yet go out when the step closes (left mid-quiz)
  // the quiz's answers not sent yet: the footer's primary sends them (leaving the step), never an
  // unmount (the shell unmounts the step on every run)
  const applyAsides = useRef<() => void>(() => {});
  useWizardPrimary(
    seen.answers.size > 0 && !seen.committing
      ? {
          label: `apply ${plural(seen.answers.size, 'answer')}`,
          onClick: () => applyAsides.current(),
          title: 'the outlines answered so far; the rest stay as they are',
        }
      : null,
  );
  if (!out || !session.sheet || !session.chains) return null;
  const previews = session.chains.chainPreview;
  const sheetBox = session.sheet.sheet.bbox;
  // the last word on a line wins: "use line" after "ignore line" makes it a wall again, and back
  const ignored = new Set<number>();
  const used = new Map<number, number | null>();
  for (const e of inputs.edits) {
    if (e.kind === 'ignore-line') {
      ignored.add(e.chain);
      used.delete(e.chain);
    } else if (e.kind === 'set-wall') {
      ignored.delete(e.chain);
      used.set(e.chain, e.rank);
    }
  }
  const bridges = inputs.edits.filter((e): e is Bridge => e.kind === 'bridge');
  const focusSeeds = new Set(focus?.items.map((x) => x.seed) ?? []);
  const labelOf = (r: number) => runSizes.find((z) => z.rank === r)?.label || `#${r + 1}`;
  /** The rank of a size named by its source label (the engine's `outlines[].size`). */
  const rankOfSize = (size: string) => runSizes.find((z) => z.label === size)?.rank ?? null;
  const pickTool = (t: Tool) => {
    setGapA(null);
    setTool(t);
    setLassoJoin(false);
    setLassoSplit(false);
  };

  const outcomeOf = (f: PieceFamily): FillOutcome =>
    f.candidates.find((c) => c.outcome !== 'closed')?.outcome ?? 'closed';
  const selected = families.find((f) => f.seed === sel) ?? null;
  const refusedSel = !!selected && cand(selected).outcome === 'refused';
  // a refused size has no outline to close: an active bridge tool falls back to the default one
  if (tool === 'bridge' && refusedSel) {
    setGapA(null);
    setTool('pan');
  }
  const zoomFam = zoomTo ? families.find((f) => f.seed === zoomTo.seed) : undefined;
  const zoomCand = zoomFam
    ? zoomFam.candidates.find((c) => c.rank === (zoomTo?.rank ?? rank)) ?? cand(zoomFam)
    : undefined;
  // an open size has no outline: the view goes to the piece's outline in another size
  const zoomShape =
    zoomCand && zoomCand.outer.length > 4
      ? zoomCand
      : zoomFam?.candidates.find((c) => c.outer.length > 4) ??
        (zoomCand && zoomCand.outer.length > 2 ? zoomCand : undefined);
  const zoomBox = asideAt ? asideAt.box : zoomShape ? zoomShape.bbox : null;
  const asides = out.setAside ?? [];
  // a size copy not proven a copy of a seeded piece (auto-advance provenCopy) is a guess: apart
  const asideKey = (a: SetAside) =>
    a.seed
      ? `label:${a.reason}`
      : a.reason === 'size-copy' && !provenCopy(a, families, out.seeds)
        ? 'size-copy?'
        : a.reason;
  const weak = new Set(weakList);
  // what was left out and is NOT asked about (proven junk, too small): the debug list only
  const quiet = asides.filter((a) => !weak.has(a));
  const asideGroups = [...new Set(quiet.map(asideKey))].map((k) => ({
    key: k,
    list: quiet.filter((a) => asideKey(a) === k),
  }));
  const asideWords = (a: SetAside) =>
    asideKey(a) === 'size-copy?'
      ? 'between the sizes of a piece, but not another size of one'
      : a.reason === 'code-text'
        ? 'a number read as part of a printed code (smaller than the piece numbers, digits beside it)'
        : a.seed
          ? `a piece number in ${ASIDE_WORD[a.reason]}`
          : ASIDE_WORD[a.reason];
  const closedFams = families.filter((f) => !needsFix(f));
  const selClosed = !!selected && !needsFix(selected);
  /** What is wrong with a region: a short word on the row, the whole instruction as its title. */
  const whyOf = (f: PieceFamily, c: PieceCandidate): { short: string; full: string } => {
    switch (c.outcome) {
      case 'refused': {
        const r = c.gradeRefusal ?? 'sizes-not-distinguished';
        const extra = refusalExtra(c.gradeDetail);
        return { short: REFUSED_SHORT[r], full: `${REFUSED[r]}${extra ? ` (${extra})` : ''}` };
      }
      case 'leak':
        return seedAt(f.seed)?.origin === 'face' &&
          f.candidates.every((x) => x.outcome === 'leak' || x.outcome === 'tiny')
          ? {
              short: 'outline never closes',
              full: 'an open outline: the drawing closes it nowhere in any size — the fill ran out through a gap (the red ring). close gap at the ring if it is a piece, or not a piece.',
            }
          : {
              short: 'gap in the outline',
              full: 'the outline has a gap and the fill ran outside (the red ring). close gap: click the two line ends at the ring. or drop it if it is not a piece.',
            };
      case 'merged':
        return {
          short: 'two pieces touch',
          full: 'two numbered pieces read as one outline: they touch. draw a lasso around one of them to split.',
        };
      case 'tiny':
        return {
          short: 'too small',
          full: `smaller than ${PATIMPORT.minPieceAreaMm2 / 100} cm² — a label or a mark, not a piece.`,
        };
      default:
        return { short: 'closed', full: 'closed and snapped to the drawn lines.' };
    }
  };
  const notAPiece = (f: PieceFamily) => {
    // keep how the region read, for "not in this file" on check
    const big = Math.max(...f.candidates.map((c) => c.areaMm2));
    remember(
      f.seed,
      `region ${markOf.get(f.seed)}${big > 0 ? ` · ${(big / 100).toFixed(0)} cm²` : ''}`,
    );
    const p = api.editPieces({ kind: 'not-a-piece', seed: f.seed });
    setSel(null);
    return p;
  };
  // at rest the toolbar is pan (and the tool in hand): the card arms what its answer needs; the
  // rest is behind "more tools". A sheet with no pieces at all asks for a seed, so that one shows.
  const ctxTools = new Set<Tool>(['pan', tool]);
  if (!families.length) ctxTools.add('seed');
  const editsLine = [
    plural(inputs.edits.length, 'edit'),
    bridges.length && `${plural(bridges.length, 'gap')} closed`,
    used.size && `${plural(used.size, 'line')} used`,
    ignored.size && `${plural(ignored.size, 'line')} ignored`,
    `${inputs.clickSeeds.length} clicked ${inputs.clickSeeds.length === 1 ? 'piece' : 'pieces'}`,
  ]
    .filter(Boolean)
    .join(' · ');

  const onLasso = (poly: PtMm[]) => {
    const ins = families.filter((f) => {
      const s = seedAt(f.seed);
      return s && inside(s.at, poly);
    });
    if (ins.length >= 2 && lassoSplit) {
      setHint('loop one part only — try again');
      return;
    }
    if (ins.length >= 2) {
      void api.editPieces({ kind: 'merge', seeds: ins.map((f) => f.seed) });
      setHint(`joined ${ins.length} parts into one piece`);
    } else if (lassoJoin) {
      // «one piece» never splits: a lasso around fewer than two labels joins nothing
      setHint('draw around both parts (both labels inside the lasso) to join them');
      setTool('pan');
      setLassoJoin(false);
      return;
    } else {
      const c = centre(poly);
      const target =
        ins[0] ?? families.find((f) => outcomeOf(f) === 'merged' && inside(c, cand(f).outer));
      if (target) {
        // the loop the operator drew is the only cut sent: one part per loop. The first loop's
        // result is checked (it cut something, it closed); the other part is asked for next, and
        // both parts must add up to the region — else the loops are undone ("didn't split")
        const p = splitRef.current;
        const cut: PieceEdit = { kind: 'split', seed: target.seed, lassoMm: poly };
        if (p?.stage === 2 && p.other === target.seed) {
          splitRef.current = { ...p, stage: 3, cuts: [...p.cuts, cut], sent: out };
        } else {
          const tc = target.candidates.find((x) => x.rank === rank) ?? cand(target);
          // the other part: the proven pair, else the one other number inside this outline
          const proven = partnersOf(target, tc);
          const raw = rawPartners(target, tc);
          const other = proven.length === 1 ? proven[0] : raw.length === 1 ? raw[0] : null;
          if (!other) {
            // two parts need two numbers to tell them apart: nothing is cut
            setHint('no second number in this outline — use not a piece, or add a piece');
            setTool('pan');
            setLassoSplit(false);
            return;
          }
          splitRef.current = {
            stage: 1,
            rank: tc.rank,
            orig: tc.areaMm2,
            a1: 0,
            first: target.seed,
            other: other.seed,
            baseline: [...inputs.edits],
            cuts: [cut],
            sent: out,
          };
        }
        void api.editPieces(cut);
        setHint('splitting…');
      } else
        setHint('no piece number inside the lasso and no touching pieces under it — nothing to do');
    }
    setTool('pan');
    setLassoJoin(false);
    setLassoSplit(false);
  };

  // ── the guide's checklist: every question seen open, fixed ones greyed with a ✓ ──
  if (variants.length > 1 && !seen.rows.has('model'))
    seen.rows.set('model', { order: 0, label: 'which garment is this card' });
  for (const p of openProblems) {
    if (p.kind === 'region') {
      const f = families.find((x) => x.seed === p.seed)!;
      const m = markOf.get(p.seed) ?? 0;
      seen.rows.set(p.key, {
        order: 1 + m,
        // the number is the region's current mark: a region gone from the sheet has none
        label: whyOf(f, problemOf(f)).short,
        seed: p.seed,
      });
    } else if (p.kind === 'touch') {
      // the regions it asks together are one question now
      for (const g of p.groups) seen.rows.delete(g.key);
      seen.rows.set(p.key, {
        order: 1 + Math.min(...p.groups.map((g) => markOf.get(g.seeds[0]) ?? 0)),
        label: 'pieces touch',
      });
    } else if (p.kind === 'sheet')
      seen.rows.set(p.key, { order: 1e6, label: 'pieces across sheets' });
    else if (p.kind === 'aside')
      seen.rows.set(p.key, { order: 2e6, label: 'outlines left out · optional' });
  }
  // the garment, once picked, is its own quiet line (with «change»), not a row of the list
  const checklist = [...seen.rows.entries()]
    // the optional check is not a row: it is asked after the list, on its own
    .filter(([k]) => k !== 'aside')
    .filter(([k]) => k !== 'model' || openProblems.some((p) => p.kind === 'model'))
    .sort((a, b) => a[1].order - b[1].order);
  /** One question needs no list and no count: the card says it. */
  const listed = checklist.length >= 2;

  // ── the active card: the region it asks about, and only the answers to its kind ──
  const activeFam = activeRegion
    ? families.find((f) => f.seed === activeRegion.seed) ?? null
    : null;
  const activeCand = activeFam ? problemOf(activeFam) : null;
  const activeWhy = activeFam && activeCand ? whyOf(activeFam, activeCand) : null;
  const expRanks = activeFam
    ? [...activeFam.candidates].filter((c) => isExp(c.rank)).sort((a, b) => a.rank - b.rank)
    : [];
  const badRanks = expRanks.filter((c) => c.outcome !== 'closed');
  /** The problem is in some sizes only: the card says which ('in 44 46'). */
  const partly = badRanks.length > 0 && badRanks.length < expRanks.length;
  /** The piece does not close and the gap is found: the card shows it and closes it in one click. */
  const leakGap =
    activeRegion && !activeRegion.group && activeFam && activeCand?.outcome === 'leak'
      ? gapOf(activeFam.seed, activeCand)
      : null;
  const closeGap = () => {
    if (!leakGap || !activeFam || !activeCand) return;
    pickTool('pan');
    seen.applied = {
      text: `piece ${nameOf(activeFam.seed)} closed${partly ? ` in size ${labelOf(activeCand.rank)}` : ''}`,
      n: 1,
      at: inputs.edits.length + 1,
    };
    seen.gapCheck = {
      seed: activeFam.seed,
      rank: activeCand.rank,
      at: inputs.edits.length + 1,
      auto: false,
    };
    go(
      api.editPieces({
        kind: 'bridge',
        seed: activeFam.seed,
        rank: gapRank(activeFam, activeCand, leakGap),
        from: leakGap.from,
        to: leakGap.to,
      }),
    );
  };
  /** The other numbers inside this outline (shown large even when not proven a pair). */
  const others = activeFam && activeCand ? rawPartners(activeFam, activeCand) : [];
  /** The region where pieces touch that the card asks about (one question for every number). */
  const activeTouch = activeRegion?.group ?? null;
  /** The pieces the active question is about: lit on the canvas, their numbers drawn large. */
  /** The set-aside card on screen: its outlines (lettered a, b, …) and the pieces they join. */
  const cardShown = active?.kind === 'aside' && cardNow ? cardItems(cardNow) : [];
  const cardHosts = [
    ...new Set(
      cardShown.flatMap((it) => {
        const h = groupNow
          ? groupNow.group === 'join'
            ? joinsOf(it)[0]?.seed
            : (classOf(it) as { host?: number }).host
          : quizJoins[0]?.seed;
        return h != null ? [h] : [];
      }),
    ),
  ];
  /** The view zooms to the card's outlines and the pieces they belong to, all at once. */
  const cardBox = cardShown.length
    ? [
        ...cardShown.map((it) => it.a.box),
        ...cardHosts.flatMap((h) => {
          const f = families.find((x) => x.seed === h);
          return f ? [cand(f).bbox] : [];
        }),
      ].reduce((u, b) => ({
        minX: Math.min(u.minX, b.minX),
        minY: Math.min(u.minY, b.minY),
        maxX: Math.max(u.maxX, b.maxX),
        maxY: Math.max(u.maxY, b.maxY),
      }))
    : null;
  const letterOf = (i: number) => String.fromCharCode(97 + i);
  const asked = cardShown.length
    ? new Set(cardHosts)
    : active?.kind === 'touch'
      ? new Set(active.groups.flatMap((g) => g.seeds))
      : activeTouch
        ? new Set(activeTouch.seeds)
        : activeFam
          ? new Set([activeFam.seed, ...others.map((g) => g.seed)])
          : null;
  const markWord = nameOf;
  /**
   * The card's picture: the region's own outline, or around the gap. A 4-point outline is the
   * fill's placeholder box for an open region, not a shape — never shown as one.
   */
  const cropBox = !activeCand
    ? null
    : activeCand.outer.length > 4
      ? {
          minX: Math.min(...activeCand.outer.map((p) => p.x)),
          minY: Math.min(...activeCand.outer.map((p) => p.y)),
          maxX: Math.max(...activeCand.outer.map((p) => p.x)),
          maxY: Math.max(...activeCand.outer.map((p) => p.y)),
        }
      : activeCand.leakAt
        ? {
            minX: activeCand.leakAt.x - 60,
            minY: activeCand.leakAt.y - 60,
            maxX: activeCand.leakAt.x + 60,
            maxY: activeCand.leakAt.y + 60,
          }
        : activeFam?.candidates.find((c) => c.outer.length > 4)?.bbox ?? null;
  const arm = (t: Tool) => {
    if (!activeFam || !activeCand) return;
    setSel(activeFam.seed);
    setRank(activeCand.rank);
    pickTool(t);
  };
  type Answer = {
    label: string;
    onClick: () => void;
    /** ≤8 words: how to answer, for the footer's coach bubble (`data-ask-hint`). */
    how: string;
    title?: string;
    pressed?: boolean;
    disabled?: boolean;
  };
  const notThis: Answer | null = activeFam
    ? {
        label: 'not a piece',
        how: 'mark it as not a piece',
        title: 'a label, a mark or a frame: drop it from the pieces',
        onClick: () => notAPiece(activeFam),
      }
    : null;
  /** A region's parts as its picture draws them: number, where, its own outline when known. */
  const touchParts = (g: TouchGroup): TouchPart[] => {
    const area = (o: readonly PtMm[]) =>
      Math.abs(
        o.reduce((n, p, i) => n + p.x * o[(i + 1) % o.length].y - o[(i + 1) % o.length].x * p.y, 0),
      ) / 2;
    const parts = g.seeds.map((s) => {
      const own = seen.own.get(s)?.get(g.rank);
      const box =
        seedAt(s)?.face?.box ?? [...seen.promoted.values()].find((x) => x.seed === s)?.aside.box;
      let outer: PtMm[] | null = own ? own.outer : null;
      if (!outer && box) {
        outer = faceOutline(box, previews) ?? [
          { x: box.minX, y: box.minY },
          { x: box.maxX, y: box.minY },
          { x: box.maxX, y: box.maxY },
          { x: box.minX, y: box.maxY },
        ];
      }
      // an outline as big as the region is the region itself, not a part of it
      if (outer && area(outer) >= 0.97 * g.areaMm2) outer = null;
      return { n: nameOf(s), at: pointOf(s) ?? null, outer, a: outer ? area(outer) : Infinity };
    });
    // every part known: the biggest is the rest of the region (blue), the others drawn on it
    if (parts.every((x) => x.outer)) {
      const big = parts.reduce((x, y) => (y.a > x.a ? y : x));
      big.outer = null;
    }
    return parts.map(({ n, at, outer }) => ({ n, at, outer }));
  };
  const sizesOfAll = (gs: TouchGroup[]) => {
    const z = [...new Set(gs.flatMap(touchSizes))];
    return z.length > 1 ? ` · applied to sizes ${z.join(', ')}` : '';
  };
  /** The answer for a region where pieces touch: one edit, said on the quiet line with undo. */
  const touchEdit = (g: TouchGroup, how: 'join' | number) => {
    if (how === 'join') return api.editPieces({ kind: 'merge', seeds: g.seeds });
    const f = families.find((x) => x.seed === how);
    return f ? notAPiece(f) : Promise.resolve();
  };
  // skip: each region where pieces touch takes its likely answer (one piece, or the small part
  // dropped); a region with one number only (a loop is needed) has no guess
  const touchLikely = askTouch.filter((g) => g.likely.kind === 'drop' || g.seeds.length >= 2);
  likelyTouch.current =
    touchLikely.length > 0 && !modelOpen && !session.busy
      ? {
          key: touchLikely.length > 1 ? 'pieces-touch' : 'pieces-region',
          what: `${plural(touchLikely.length, 'region')} where pieces touch`,
          answer: touchLikely
            .map((g) =>
              g.likely.kind === 'drop'
                ? `${nameOf(g.likely.seed)} not a piece`
                : `${g.seeds.map(nameOf).join(' + ')} one piece`,
            )
            .join(', '),
          sig: touchLikely.map((g) => g.key).join(','),
          likely: async () => {
            for (const g of touchLikely)
              await touchEdit(g, g.likely.kind === 'drop' ? g.likely.seed : 'join');
          },
        }
      : null;
  const answerTouch = (gs: TouchGroup[], how: (g: TouchGroup) => 'join' | number) => {
    pickTool('pan');
    setHint(null);
    const hows = gs.map(how);
    seen.applied = {
      text:
        (hows.every((h) => h === 'join')
          ? `${gs.map((g) => g.seeds.map(nameOf).join(' + ')).join(', ')} joined`
          : hows.every((h) => h !== 'join')
            ? `${hows.map((h) => nameOf(h as number)).join(', ')} ${hows.length > 1 ? 'are' : 'is'} not ${hows.length > 1 ? 'pieces' : 'a piece'}`
            : 'answered') + sizesOfAll(gs),
      n: gs.length,
      at: inputs.edits.length + gs.length,
    };
    // one edit after the other: each re-runs the pieces; the shell moves on when nothing is asked
    go(
      (async () => {
        for (let k = 0; k < gs.length; k++) await touchEdit(gs[k], hows[k]);
      })(),
    );
  };
  // ── the outlines answered without asking: one quiet line each kind, «show» lists them ──
  const wordAuto = (it: AsideItem) => {
    const c = classOf(it);
    return c.kind === 'auto' ? c.word : '';
  };
  const hostOf = (it: AsideItem) => {
    const c = classOf(it);
    return c.kind === 'auto' || c.kind === 'group' ? c.host ?? null : null;
  };
  /** «3 sketches», «16 strips between sizes»: the noun takes the plural, not the phrase. */
  const many = (w: string, n: number) => {
    if (n === 1) return w;
    const ws = w.split(' ');
    const k = w.includes(' between ') ? 0 : ws.length - 1;
    ws[k] = /(sh|ch|x|s)$/.test(ws[k]) ? `${ws[k]}es` : `${ws[k]}s`;
    return `${n} ${ws.join(' ')}`;
  };
  const autoLine = (() => {
    const by = new Map<string, number>();
    for (const it of autoOut) by.set(wordAuto(it), (by.get(wordAuto(it)) ?? 0) + 1);
    return [...by]
      .sort((x, y) => x[1] - y[1])
      .map(([w, n]) => many(w, n))
      .join(', ');
  })();
  /** A quiet line of outlines answered without asking, «show» → each with its picture and a way back. */
  const quietList = (o: {
    key: 'auto' | 'inner';
    line: string;
    items: { it: AsideItem; word: string; host: number | null }[];
  }) => {
    const open = seen.showAuto === o.key;
    return (
      <div className='flex flex-col gap-2' data-aside-quiet={o.key}>
        <div className='flex flex-wrap items-center gap-2'>
          <Text size='micro' variant='label' component='span'>
            {o.line} ·
          </Text>
          <Button
            variant='underline'
            size='xs'
            className='text-labelColor hover:text-textColor'
            onClick={() => {
              seen.showAuto = open ? null : o.key;
              bump((n) => n + 1);
            }}
          >
            {open ? 'hide' : 'show'}
          </Button>
        </div>
        {open && (
          <ul className='grid grid-cols-2 gap-2'>
            {o.items.map(({ it, word, host }) => {
              const back = seen.answers.get(it.a.id) === 'yes';
              const hj = host != null ? joinsOf(it).find((j) => j.seed === host) : undefined;
              return (
                <li
                  key={it.a.id}
                  className='flex flex-col gap-1 border border-borderColor p-1'
                  onPointerEnter={() => setHot({ kind: 'aside', id: it.a.id })}
                  onPointerLeave={() => setHot(null)}
                >
                  <AsideSilhouette
                    box={it.a.box}
                    previews={previews}
                    outline={faceOutline(it.a.box, previews) ?? undefined}
                    hosts={hj ? [hj] : undefined}
                    title={word}
                    className='w-full bg-bgColor'
                    style={{ height: 72 }}
                  />
                  <div className='flex flex-wrap items-center gap-2'>
                    <Text size='micro' variant='label' component='span'>
                      {word}
                    </Text>
                    <Button
                      variant='underline'
                      size='xs'
                      className={cn(
                        'ml-auto hover:text-textColor',
                        back ? 'text-textColor' : 'text-labelColor',
                      )}
                      aria-pressed={back}
                      disabled={!!session.busy || seen.committing > 0}
                      onClick={() => {
                        if (back) seen.answers.delete(it.a.id);
                        else seen.answers.set(it.a.id, 'yes');
                        bump((n) => n + 1);
                      }}
                    >
                      {back ? 'a piece ✓' : host != null ? "it's its own piece" : 'this is a piece'}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  };
  /** «applied to sizes 8, 10, 12»: where the joined pieces now close (the merge is per number). */
  const joinedSizes = (hosts: number[]) => {
    const z = [
      ...new Set(
        families
          .filter((f) => hosts.includes(f.seed))
          .flatMap((f) => f.candidates)
          .filter((c) => isExp(c.rank) && c.outcome === 'closed')
          .sort((a, b) => a.rank - b.rank)
          .map((c) => sizeLabel(c.rank)),
      ),
    ];
    return z.length > 1 ? ` · applied to sizes ${z.join(', ')}` : '';
  };
  /** The quiet line's undo: every edit of the last answer, newest first. */
  const undoApplied = () => {
    const a = seen.applied;
    seen.applied = null;
    void (async () => {
      for (let k = 0; k < (a?.n ?? 1); k++) await api.editPieces('undo');
      // the set-aside quiz: back to the exact list before it, the outlines it brought back for the
      // first time left out again (those brought back before were already dropped in that list)
      const back = a?.drop ?? [];
      if (a?.restore) {
        const restore = a.restore;
        const fresh = (a.fresh ?? []).filter(
          (sd) => !restore.some((e) => e.kind === 'not-a-piece' && e.seed === sd),
        );
        await api.dispatch({
          type: 'piece-edits',
          edits: [...restore, ...fresh.map((sd): PieceEdit => ({ kind: 'not-a-piece', seed: sd }))],
        });
      }
      const again = a?.batch ?? back;
      if (again.length) {
        seen.asideDone = seen.asideDone.filter((x) => !again.includes(x));
        seen.asideSteps = seen.asideSteps
          .map((st) => st.filter((x) => !again.includes(x)))
          .filter((st) => st.length);
        seen.asideOk = false;
        bump((n) => n + 1);
      }
    })();
  };
  const answers: Answer[] = (() => {
    if (active?.kind === 'model') {
      const order = named?.pick
        ? [named.pick, ...variants.filter((v) => v !== named.pick)]
        : variants;
      return order.map((v) => ({
        label: v,
        how: 'pick the model to import',
        title:
          v === named?.pick
            ? [
                named.strong ? 'the card names it' : 'suggested by the card',
                ...named.evidence,
              ].join(' · ')
            : undefined,
        onClick: () => void api.dispatch({ type: 'variant', variant: v }),
      }));
    }
    if (active?.kind === 'aside') return []; // the one-outline quiz has its own answers
    if (active?.kind === 'sheet' && sheetQ) {
      return (
        sheetQ.kind === 'alternative'
          ? ([
              ['keep', 'keep one sheet'],
              ['union', 'keep both'],
            ] as const)
          : sheetQ.kind === 'copy'
            ? ([
                ['copy', 'keep one'],
                ['both', 'two pieces'],
              ] as const)
            : sheetQ.kind === 'empty'
              ? ([['empty', 'no piece here']] as const)
              : ([
                  ['separate', 'separate pieces'],
                  ['halves', 'one, cut apart'],
                ] as const)
      ).map(([answer, label]) => ({
        label,
        how: 'say how the sheets relate',
        onClick: () =>
          void api.dispatch({
            type: 'sheet-answer',
            key: sheetQ.key,
            answer,
            edits: sheetAnswerEdits(out.sheets, sheetQ.key, answer),
          }),
      }));
    }
    if (!activeFam || !activeCand || !notThis) return [];
    switch (activeCand.outcome) {
      case 'leak':
        return [
          {
            label: 'close the gap',
            how: 'click both ends of the gap',
            title: 'two clicks: the two line ends at the red ring',
            pressed: tool === 'bridge' && sel === activeFam.seed,
            onClick: () => arm('bridge'),
          },
          notThis,
        ];
      case 'merged':
        // the touch card draws its own answers (pictures + «isn't a piece» chips)
        return [];
      case 'tiny':
        return [
          notThis,
          {
            label: 'yes, keep',
            how: 'click inside the piece',
            title: 'click inside the piece: the fill starts again from there',
            pressed: tool === 'reseed' && sel === activeFam.seed,
            onClick: () => arm('reseed'),
          },
        ];
      case 'refused':
        return [
          activeCand.gradeRefusal === 'size-count'
            ? {
                label: '← sizes',
                how: 'answer the size count on sizes',
                onClick: () => void api.dispatch({ type: 'back', to: 'sizes' }),
              }
            : {
                label: 'try another spot',
                how: 'click another spot inside the piece',
                title: 'click another spot inside the piece: the sizes are read again from there',
                pressed: tool === 'reseed' && sel === activeFam.seed,
                onClick: () => arm('reseed'),
              },
          notThis,
        ];
      default:
        return [notThis];
    }
  })();
  /** A drawing tool is on: the banner over the sheet says what to do, in one line. */
  const selMark = sel != null ? markWord(sel) : '';
  const banner =
    tool === 'bridge'
      ? gapA
        ? 'now click the other end of the gap'
        : 'click both ends of the gap'
      : tool === 'lasso'
        ? lassoJoin
          ? 'draw a loop around both parts'
          : sel != null
            ? splitRef.current?.stage === 2
              ? `now draw a loop around part ${selMark}`
              : `draw a loop around part ${selMark} only`
            : 'draw a loop'
        : tool === 'reseed'
          ? `click another spot inside piece ${selMark}`
          : tool === 'seed'
            ? 'click inside the piece'
            : tool === 'wall'
              ? 'click the line the outline should follow'
              : tool === 'ignore'
                ? 'click the line to ignore'
                : '';
  /** The card asks a question: what the parser is stuck on, in the operator's words. */
  const question = !active
    ? null
    : active.kind === 'touch'
      ? active.groups[0].likely.kind === 'drop'
        ? `${active.groups.length} small parts: not pieces?`
        : `${active.groups.length} places where pieces touch: one piece each?`
      : activeTouch
        ? `${activeTouch.seeds.map(nameOf).join(' and ')} touch: one piece?`
        : active.kind === 'model'
          ? 'which garment is this card?'
          : active.kind === 'aside'
            ? asideQ
            : active.kind === 'sheet'
              ? sheetQ?.text ?? 'how do these sheets relate?'
              : activeCand?.outcome === 'leak'
                ? activeFam
                  ? `piece ${nameOf(activeFam.seed)} isn't closed${partly ? ` in ${badRanks.length > 1 ? 'sizes' : 'size'} ${badRanks.map((c) => labelOf(c.rank)).join(', ')}` : ''}${leakGap ? '. close it?' : ': close the gap by hand?'}`
                  : 'outline with a gap?'
                : activeCand?.outcome === 'merged'
                  ? 'one piece or two parts?'
                  : activeCand?.outcome === 'tiny'
                    ? 'is this a piece?'
                    : 'sizes unclear — try elsewhere?';
  const qIndex = active ? checklist.findIndex(([k]) => k === active.key) : -1;
  /** A quiet «2 of 4» beside the question, only when there are several. */
  const counter = listed && qIndex >= 0 ? `${qIndex + 1} of ${checklist.length}` : null;

  // ── the garments, the tiles, what the canvas lights ──
  const garments = variants.map((v) => ({
    v,
    // a piece no garment label claims is in every garment (the garments differ by cutting lines)
    fams: families.filter((f) => {
      const sv = seedAt(f.seed)?.variant;
      return sv == null || sv === v;
    }),
  }));
  const hotGarment = hot?.kind === 'garment' ? garments.find((g) => g.v === hot.v) : undefined;
  /** The garment under the pointer: its cutting lines on the sheet, in the size on screen. */
  const hotGarmentPic = hotGarment
    ? garmentPicture(hotGarment.v, hotGarment.fams, marks, { rank, rankOfSize, own: false })
    : null;
  const hotGarmentLines = hotGarmentPic?.cutLines ?? [];
  const hotSeeds =
    hot?.kind === 'piece'
      ? new Set([hot.seed])
      : hotGarment
        ? new Set(hotGarment.fams.map((f) => f.seed))
        : null;
  /** «sizes 6–14»: the exported sizes of a piece. */
  const sizesOf = (f: PieceFamily) => {
    const r = f.candidates
      .filter((c) => isExp(c.rank))
      .map((c) => c.rank)
      .sort((a, b) => a - b);
    if (!r.length) return 'no size exported';
    return r.length === 1
      ? `size ${labelOf(r[0])}`
      : `sizes ${labelOf(r[0])}–${labelOf(r[r.length - 1])}`;
  };
  /**
   * The quiz is over: everything left keeps its current guess, and the operator has looked at the
   * outlines set aside — said to the engine (UXHOOKS `inputs.asideReviewed`: per tile sheet, the
   * digest of the set as it is AFTER the last answer's re-run, so the answer itself is not a
   * "changed set"), which drops the step's offer. The shell then moves on if nothing else is asked.
   */
  /**
   * The quiz is over (or left): its answers are sent, and only when every run of that send went
   * through is the engine told the outlines were looked at (reviewAsides). A send that failed
   * keeps every answer and asks again («couldn't apply · try again»).
   */
  const flushAsides = async () => {
    seen.asideOk = true;
    setHot(null);
    bump((n) => n + 1);
    if (await commitAsides()) return api.reviewAsides();
    seen.asideOk = false;
    bump((n) => n + 1);
    return undefined;
  };
  const quizEnd = () => {
    if (seen.committing) return;
    go(flushAsides());
  };
  applyAsides.current = quizEnd;
  // skip: every card left takes its pre-selected answer (joins yes, inside shapes part of, frames /
  // small / marks not pieces), a lone uncertain outline stays as the engine guessed; the batch goes
  // out through the same flush as the primary «apply N answers», awaited to the end
  // (after the garment: another garment is another set of outlines, the quiz starts over)
  likelyAside.current =
    asideItems.length > 0 && !modelOpen && !seen.asideOk && !seen.committing && !session.busy
      ? {
          key: 'pieces-aside',
          what: `${plural(asideItems.length, 'outline')} set aside`,
          answer: (() => {
            const n = cardsLeft.reduce(
              (k, c) =>
                k + (c.kind === 'group' ? c.items.length : likelyJoin(joinsOf(c.it)) ? 1 : 0),
              0,
            );
            return n ? `${plural(n, 'pre-selected answer')}, the rest as read` : 'left as read';
          })(),
          sig: `${asideItems.map((it) => it.a.id).join(',')}|${seen.answers.size}`,
          likely: () => {
            for (const c of cardsLeft) {
              const items = cardItems(c).filter((it) => !seen.asideDone.includes(it.a.id));
              for (const it of items) {
                const ans: AsideAnswer | null =
                  c.kind === 'group'
                    ? groupAns(c.group, it, false)
                    : likelyJoin(joinsOf(it)) && canJoin(it)
                      ? { join: joinsOf(it)[0].seed }
                      : null;
                if (ans) seen.answers.set(it.a.id, ans);
                seen.asideDone = [...seen.asideDone, it.a.id];
              }
            }
            return flushAsides();
          },
        }
      : null;
  /**
   * The quiz's answers, sent once: every outline brought back in ONE batch (PROMOTE-BATCH: one
   * pieces run, undone whole on a stop or a failure), then ONE list of piece edits naming the seeds
   * it returned (the joins, the outlines left out again). An outline the batch skipped stays set
   * aside, said on the quiet line. The answers stay until all of it went through.
   */
  const commitAsides = async (): Promise<boolean> => {
    if (seen.committing) return false;
    const todo = [...seen.answers].flatMap(([id, ans]) => {
      const it = asideItems.find((x) => x.a.id === id);
      return it ? [{ it, ans }] : [];
    });
    const bring = (x: { ans: AsideAnswer }) => x.ans !== 'no';
    const promote = todo.filter((x) => bring(x) && x.it.seed == null);
    const reBring = todo
      .filter((x) => bring(x) && x.it.seed != null && !x.it.picked)
      .map((x) => x.it.seed!);
    const leave = todo
      .filter((x) => !bring(x) && x.it.seed != null && x.it.picked)
      .map((x) => x.it.seed!);
    const joins = todo.filter((x) => typeof x.ans === 'object');
    if (!promote.length && !reBring.length && !leave.length && !joins.length) {
      seen.answers = new Map();
      seen.applyFailed = false;
      return true;
    }
    seen.committing = todo.filter((x) => bring(x) || leave.includes(x.it.seed ?? -1)).length;
    seen.applyFailed = false;
    bump((n) => n + 1);
    // a send that failed half way goes on from where it stopped: the list before it is the one
    // undo goes back to, the outlines it already brought back are this send's too
    const before = seen.pendingBefore ?? seen.editsNow;
    seen.pendingBefore = before;
    const tick = () => new Promise((r) => setTimeout(r, 30));
    try {
      const skipped: { id: number; why: string }[] = [];
      if (promote.length) {
        const r = await api.promoteAsides(promote.map((x) => x.it.a.id));
        // null: the whole batch was undone (a stop or a failure) — nothing kept, ask again
        if (!r) throw new Error('the outlines could not be brought back');
        for (const x of promote) {
          const sd = r.seeds[x.it.a.id];
          if (sd == null) continue;
          seen.promoted.set(x.it.a.id, { aside: x.it.a, seed: sd });
          if (!seen.pendingFresh.includes(sd)) seen.pendingFresh = [...seen.pendingFresh, sd];
        }
        skipped.push(...r.skipped);
      }
      const gone = new Set(skipped.map((x) => x.id));
      const seedOf = (it: AsideItem) => it.seed ?? seen.promoted.get(it.a.id)?.seed ?? null;
      const now = seen.editsNow;
      const merges: PieceEdit[] = joins.flatMap((x) => {
        const sd = seedOf(x.it);
        const host = (x.ans as { join: number }).join;
        return sd == null || host < 0 ? [] : [{ kind: 'merge', seeds: [host, sd] }];
      });
      const edits: PieceEdit[] = [
        ...now.filter((e) => !(e.kind === 'not-a-piece' && reBring.includes(e.seed))),
        ...leave.map((sd): PieceEdit => ({ kind: 'not-a-piece', seed: sd })),
        ...merges,
      ];
      const same = edits.length === now.length && edits.every((e, i) => e === now[i]);
      if (!same) {
        await api.dispatch({ type: 'piece-edits', edits });
        await tick();
        if (seen.errNow) throw new Error('the pieces did not run');
      }
      const joined = joins.filter((x) => !gone.has(x.it.a.id));
      const hosts = joined.map((x) => (x.ans as { join: number }).join);
      const fresh = seen.pendingFresh;
      const back =
        promote.filter((x) => !gone.has(x.it.a.id)).length + reBring.length - joined.length;
      seen.applied = {
        text: [
          joined.length
            ? `${plural(joined.length, 'outline')} joined to piece${new Set(hosts).size > 1 ? 's' : ''} ${[...new Set(hosts.map(nameOf))].join(', ')}`
            : '',
          back > 0 ? `${plural(back, 'outline')} back as pieces` : '',
          leave.length ? `${plural(leave.length, 'outline')} left out` : '',
          // the batch skipped them (read again, or the fill made no piece): still set aside
          skipped.length
            ? `${plural(skipped.length, 'outline')} stayed set aside (${skipped[0].why})`
            : '',
        ]
          .filter(Boolean)
          .join(' · '),
        n: 0,
        at: edits.length,
        restore: before,
        batch: todo.map((x) => x.it.a.id),
        fresh,
        drop: todo.filter((x) => bring(x) && !gone.has(x.it.a.id)).map((x) => x.it.a.id),
        hosts,
      };
      seen.answers = new Map();
      seen.pendingBefore = null;
      seen.pendingFresh = [];
      return true;
    } catch {
      seen.applyFailed = true;
      return false;
    } finally {
      seen.committing = 0;
      bump((n) => n + 1);
    }
  };
  /** One answer to the card (one outline, or a group's outlines with their likely answers). */
  const record = (xs: { it: AsideItem; ans: AsideAnswer }[]) => {
    if (!xs.length) return;
    setHot(null);
    for (const { it, ans } of xs) {
      seen.answers.set(it.a.id, ans);
      if (!seen.asideDone.includes(it.a.id)) seen.asideDone = [...seen.asideDone, it.a.id];
    }
    seen.asideSteps = [...seen.asideSteps, xs.map((x) => x.it.a.id)];
    seen.flip = new Set();
    const done = new Set(seen.asideDone);
    if (quiz.every((x) => done.has(x.a.id))) quizEnd();
    else bump((n) => n + 1);
  };
  const quizAnswer = (piece: boolean) => {
    if (quizNow) record([{ it: quizNow, ans: piece ? 'yes' : 'no' }]);
  };
  const answerJoin = (pairs: { it: AsideItem; host: number }[]) =>
    record(pairs.map(({ it, host }) => ({ it, ans: { join: host } })));
  const answerGroup = (c: Extract<QuizCard, { kind: 'group' }>) =>
    record(
      c.items
        .filter((it) => !seen.asideDone.includes(it.a.id))
        .map((it) => ({ it, ans: groupAns(c.group, it, seen.flip.has(it.a.id)) })),
    );
  const quizBack = () => {
    const last = seen.asideSteps[seen.asideSteps.length - 1] ?? [];
    seen.asideSteps = seen.asideSteps.slice(0, -1);
    seen.asideDone = seen.asideDone.filter((x) => !last.includes(x));
    for (const id of last) seen.answers.delete(id);
    bump((n) => n + 1);
  };
  const wordOf = (a: SetAside) =>
    ASIDE_SHORT[asideKey(a) === 'size-copy?' ? 'size-copy?' : a.reason] ?? 'left out';
  /** A brought-back outline left out again comes back only by undoing that last step. */
  const canToggle = (it: AsideItem) =>
    it.seed == null || it.picked || (lastEdit?.kind === 'not-a-piece' && lastEdit.seed === it.seed);
  const toggleAside = (it: AsideItem): Promise<unknown> | undefined => {
    if (it.seed == null) {
      const a = it.a;
      return api.promoteAside(a).then((id) => {
        if (id == null) return;
        seen.promoted.set(a.id, { aside: a, seed: id });
        bump((n) => n + 1);
      });
    } else if (it.picked) return api.editPieces({ kind: 'not-a-piece', seed: it.seed });
    else if (canToggle(it)) return api.editPieces('undo');
    return undefined;
  };
  const hotAside =
    hot?.kind === 'aside' ? asideItems.find((it) => it.a.id === hot.id)?.a : undefined;
  const hotFam = hot?.kind === 'piece' ? families.find((f) => f.seed === hot.seed) : undefined;
  /** The canvas pans to what a tile under the pointer shows, when it is off-screen. */
  const reveal = hotAside?.box ?? (hotFam ? cand(hotFam).bbox : null);
  /** The header: the count only when there is a list of questions. */
  const headTitle = required.length
    ? 'pieces'
    : active?.kind === 'aside'
      ? 'pieces ✓ · 1 optional check'
      : families.length
        ? 'pieces ✓'
        : 'no pieces yet';
  const ASK_KEY: Record<Problem['kind'], string> = {
    model: 'pieces-model',
    region: 'pieces-region',
    touch: 'pieces-touch',
    sheet: 'pieces-sheet',
    aside: 'pieces-aside',
  };
  /** The quiet line of the last answer that covered several edits (or was given for you). */
  const appliedNow = seen.applied && inputs.edits.length === seen.applied.at ? seen.applied : null;
  /**
   * Two pieces touch, one region: its picture (each part its own fill, the edge they share heavy),
   * the two answers as pictures, and «N isn't a piece» for every part — the likely one marked.
   */
  const renderTouch = (g: TouchGroup) => {
    const parts = touchParts(g);
    const dropSeed = g.likely.kind === 'drop' ? g.likely.seed : null;
    const lead = g.seeds[0];
    const pics = [
      {
        label: 'one piece',
        mode: 'one' as const,
        suggested: g.likely.kind === 'join',
        pressed: tool === 'lasso' && lassoJoin && sel === lead,
        title: `${g.seeds.map(nameOf).join(' and ')} are one piece`,
        onClick: () => {
          if (g.seeds.length >= 2) return answerTouch([g], () => 'join');
          // one number only: the loop round the parts to join (the banner says so)
          arm('lasso');
          setLassoJoin(true);
          setZoomTo({ seed: lead, rank: g.rank });
        },
      },
      {
        label: 'two pieces',
        mode: 'two' as const,
        suggested: false,
        pressed: tool === 'lasso' && !lassoJoin && sel === lead,
        title: `draw a loop around part ${nameOf(lead)}`,
        onClick: () => {
          arm('lasso');
          setLassoSplit(true);
          setZoomTo({ seed: lead, rank: g.rank });
        },
      },
    ];
    return (
      <div
        className='flex flex-col gap-3'
        data-touch={g.key}
        data-touch-likely={dropSeed != null ? `drop ${nameOf(dropSeed)}` : 'join'}
        data-touch-sizes={touchSizes(g).join(',')}
      >
        <TouchCrop
          region={g.outer}
          parts={parts}
          className='w-full border border-hairline bg-bgColor'
          style={{ height: 200 }}
        />
        <div className='grid grid-cols-2 gap-2'>
          {pics.map((x, i) => (
            <button
              key={x.label}
              type='button'
              {...ask(ASK_KEY.region, i === 0)}
              data-ask-hint={i === 0 ? 'one piece, or two pieces' : undefined}
              {...(x.suggested ? { 'data-ask-fix': ASK_KEY.region, 'data-suggested': 'true' } : {})}
              aria-label={x.label}
              aria-pressed={x.pressed}
              aria-busy={doing === x.label && !!session.busy}
              title={x.title}
              disabled={!!session.busy}
              onClick={() => {
                setDoing(x.label);
                x.onClick();
              }}
              className={cn(
                'flex flex-col gap-1 bg-bgColor p-2 text-left hover:border-textColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-textColor disabled:cursor-default',
                x.suggested ? 'border-2 border-textColor' : 'border border-borderColor',
                x.pressed && 'bg-bgZebra',
              )}
            >
              <TouchCrop
                region={g.outer}
                parts={parts}
                mode={x.mode}
                className='w-full'
                style={{ height: 96 }}
              />
              <Text size='micro' component='span'>
                {doing === x.label && session.busy ? `${x.label}…` : x.label}
              </Text>
            </button>
          ))}
        </div>
        <ChipRow>
          {g.seeds.map((s) => (
            <Chip
              key={s}
              selected={s === dropSeed}
              data-suggested={s === dropSeed ? 'true' : undefined}
              aria-label={`${nameOf(s)} isn't a piece`}
              title={`part ${nameOf(s)} is a label or a mark: drop it`}
              disabled={!!session.busy}
              onClick={() => answerTouch([g], () => s)}
            >
              {nameOf(s)} isn't a piece
            </Chip>
          ))}
        </ChipRow>
      </div>
    );
  };
  /**
   * Several regions, the same likely answer: one question, the regions small side by side. A
   * region clicked is taken off (asked apart afterwards); one click answers the rest.
   */
  const renderTouchAll = (gs: TouchGroup[]) => {
    const drop = gs[0].likely.kind === 'drop';
    return (
      <div className='flex flex-col gap-3' data-touch-all={gs.length}>
        <div className='grid grid-cols-3 gap-2'>
          {gs.map((g) => (
            <button
              key={g.key}
              type='button'
              aria-label={`${g.seeds.map(nameOf).join(' + ')}: ask apart`}
              title='ask this one apart'
              disabled={!!session.busy}
              onClick={() => {
                seen.touchOff.add(g.key);
                setHot(null);
                bump((n) => n + 1);
              }}
              onPointerEnter={() => setHot({ kind: 'piece', seed: g.seeds[0] })}
              onPointerLeave={() => setHot(null)}
              className='flex flex-col gap-1 border border-borderColor bg-bgColor p-1 text-left hover:border-textColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-textColor disabled:cursor-default'
            >
              <TouchCrop
                region={g.outer}
                parts={touchParts(g)}
                className='w-full'
                style={{ height: 90 }}
              />
              <Text size='micro' component='span'>
                {g.likely.kind === 'drop'
                  ? `${nameOf(g.likely.seed)} isn't a piece`
                  : g.seeds.map(nameOf).join(' + ')}
              </Text>
            </button>
          ))}
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          <Button
            {...ask(ASK_KEY.touch)}
            data-ask-hint='one click answers them all'
            {...(drop ? {} : { 'data-ask-fix': ASK_KEY.touch })}
            data-suggested='true'
            variant='secondary'
            size='sm'
            className='border-2 border-textColor'
            disabled={!!session.busy}
            onClick={() =>
              answerTouch(gs, (g) => (g.likely.kind === 'drop' ? g.likely.seed : 'join'))
            }
          >
            {`yes, all ${gs.length}`}
          </Button>
          <Button
            variant='underline'
            size='xs'
            className='text-labelColor hover:text-textColor'
            disabled={!!session.busy}
            onClick={() => {
              for (const g of gs) seen.touchOff.add(g.key);
              bump((n) => n + 1);
            }}
          >
            one by one
          </Button>
        </div>
      </div>
    );
  };

  return (
    <SplitStage
      canvas={
        <Panel
          title='pieces on the sheet'
          aside={
            debug && (
              <span className='flex flex-wrap items-center gap-1'>
                {TOOLS.filter(([t]) => allTools || ctxTools.has(t)).map(([t, word, title]) => (
                  <Chip
                    {...ask('pieces-seed', t === 'seed' && !families.length)}
                    quiet
                    key={t}
                    selected={tool === t}
                    pressed={tool === t}
                    onClick={() => pickTool(t)}
                    // a refused size has no outline to close: a bridge cannot prove which line is it
                    disabled={t === 'bridge' && refusedSel}
                    title={
                      t === 'bridge' && refusedSel
                        ? 'this size is held back (sizes unclear), not open: a gap closed here would not prove it'
                        : t === 'pan'
                          ? HINT.pan
                          : title
                    }
                  >
                    {word}
                  </Chip>
                ))}
                <Chip
                  quiet
                  onClick={() => setAllTools((a) => !a)}
                  title={allTools ? 'only the tools for the selected region' : 'every tool'}
                >
                  {allTools ? 'fewer tools' : 'more tools'}
                </Chip>
              </span>
            )
          }
          bodyClassName='p-0 flex flex-col'
        >
          {debug && (
            <div className='flex shrink-0 flex-wrap items-center gap-2 border-b border-hairline px-2 py-1'>
              <Text
                size='micro'
                variant='label'
                tracking='label'
                component='span'
                className='uppercase'
              >
                size
              </Text>
              <ChipRow>
                {runSizes.map((s) => (
                  <Chip
                    key={s.rank}
                    selected={rank === s.rank}
                    pressed={rank === s.rank}
                    onClick={() => setRank(s.rank)}
                  >
                    {labelOf(s.rank)}
                  </Chip>
                ))}
              </ChipRow>
              {(tool === 'bridge' || tool === 'wall') && (
                <ChipRow className='ml-3'>
                  <Chip
                    selected={!allSizes}
                    pressed={!allSizes}
                    onClick={() => setAllSizes(false)}
                    title={
                      tool === 'bridge'
                        ? 'the gap is in this size only'
                        : 'the line bounds this size only'
                    }
                  >
                    size {labelOf(rank)}
                  </Chip>
                  <Chip
                    selected={allSizes}
                    pressed={allSizes}
                    onClick={() => setAllSizes(true)}
                    title={
                      tool === 'bridge'
                        ? 'the gap is in a line every size shares'
                        : 'the line bounds every size'
                    }
                  >
                    all sizes
                  </Chip>
                </ChipRow>
              )}
              {tool !== 'pan' && (
                <Text size='micro' variant='label' component='span' className='ml-auto'>
                  {tool === 'bridge' && gapA ? '! now click the other end of the gap' : HINT[tool]}
                </Text>
              )}
            </div>
          )}
          {/* while an answer is drawn on the sheet, the sheet is where the coach points */}
          <div
            className='relative min-h-0 flex-1'
            data-ask-zone={tool !== 'pan' ? '' : undefined}
            data-ask-label={tool !== 'pan' ? banner : undefined}
          >
            {/* a drawing tool is only ever started by an answer: the sheet says what to do */}
            {tool !== 'pan' && (
              <div
                className='absolute inset-x-2 top-2 z-10 flex items-center gap-3 px-3 py-2 text-micro text-bgColor'
                style={{ background: SHEET_INK.blue }}
              >
                <span className='min-w-0 flex-1'>{banner}</span>
                <button
                  type='button'
                  onClick={() => pickTool('pan')}
                  className='shrink-0 underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-bgColor'
                >
                  cancel · esc
                </button>
              </div>
            )}
            <SheetViewport
              bbox={session.sheet.sheet.bbox}
              focus={cardBox ?? zoomBox}
              reveal={reveal}
              tool={tool === 'pan' ? 'pan' : tool === 'lasso' ? 'lasso' : 'point'}
              onPick={(k) => {
                setSel(k ? Number(k) : null);
                // a region with a question picked on the sheet becomes the card's question
                const n = k ? Number(k) : null;
                const pk =
                  n == null
                    ? undefined
                    : openProblems.find((p) =>
                        p.kind === 'region'
                          ? p.seed === n || !!p.group?.seeds.includes(n)
                          : p.kind === 'touch' && p.groups.some((g) => g.seeds.includes(n)),
                      );
                if (pk) setActiveKey(pk.key);
              }}
              onPoint={(pt) => {
                if (tool === 'bridge') {
                  if (!gapA) {
                    setGapA(landOn(previews, pt, ignored));
                    return;
                  }
                  const to = landOn(previews, pt, ignored);
                  void api.editPieces({
                    kind: 'bridge',
                    seed: sel,
                    rank: allSizes ? null : rank,
                    from: gapA,
                    to,
                  });
                  setGapA(null);
                  setHint(
                    `gap closed in ${allSizes ? 'every size' : `size ${labelOf(rank)}`} — the fill runs again`,
                  );
                  return;
                }
                if (tool === 'wall') {
                  const hit = nearestLine(previews, pt, Math.max(1.5, unitRef.current * 8));
                  if (!hit) {
                    setHint('no line under the click — zoom in and click on the line itself');
                    return;
                  }
                  void api.editPieces({
                    kind: 'set-wall',
                    chain: hit.id,
                    rank: allSizes ? null : rank,
                  });
                  setHint(
                    `line used as an outline in ${allSizes ? 'every size' : `size ${labelOf(rank)}`} — the pieces it touches are filled again`,
                  );
                  return;
                }
                if (tool === 'ignore') {
                  const hit = nearestLine(
                    previews,
                    pt,
                    Math.max(1.5, unitRef.current * 8),
                    ignored,
                  );
                  if (!hit) {
                    setHint('no line under the click — zoom in and click on the line itself');
                    return;
                  }
                  void api.editPieces({ kind: 'ignore-line', chain: hit.id });
                  setHint('line ignored — it is no wall for any piece now');
                  return;
                }
                if (tool === 'seed') {
                  void api.addSeed(pt).then((id) => id != null && setSel(id));
                  setHint('piece added — its outline is read from the click');
                } else if (tool === 'reseed' && sel != null) {
                  void api.editPieces({ kind: 'reseed', seed: sel, at: pt });
                  setTool('pan');
                }
              }}
              onLasso={onLasso}
            >
              {({ unit, box }) => (
                <>
                  {(unitRef.current = unit) && null}
                  <g
                    fill='none'
                    stroke={SHEET_INK.source}
                    strokeWidth={unit * 0.6}
                    pointerEvents='none'
                  >
                    {previews.map((a, i) =>
                      a.length < 4 || ignored.has(i) ? null : (
                        <polyline key={i} points={f32Attr(a)} />
                      ),
                    )}
                  </g>
                  <g
                    fill='none'
                    stroke={SHEET_INK.red}
                    strokeWidth={unit * 1}
                    strokeDasharray={`${unit * 3} ${unit * 3}`}
                    pointerEvents='none'
                  >
                    {[...ignored].map((i) =>
                      previews[i] ? <polyline key={`x${i}`} points={f32Attr(previews[i])} /> : null,
                    )}
                  </g>
                  <g
                    fill='none'
                    stroke={SHEET_INK.blue}
                    strokeWidth={unit * 2}
                    pointerEvents='none'
                  >
                    {[...used].map(([i, r]) =>
                      previews[i] && (r == null || r === rank) ? (
                        <polyline key={`w${i}`} points={f32Attr(previews[i])} />
                      ) : null,
                    )}
                  </g>
                  {[...families]
                    .sort((a, b) => cand(b).areaMm2 - cand(a).areaMm2)
                    .map((f) => {
                      const c = cand(f);
                      const o = outcomeOf(f);
                      const st = STYLE[o];
                      const on = f.seed === sel;
                      // a piece the gate / details sent here is outlined red until dismissed
                      const sent = focusSeeds.has(f.seed);
                      // a tile or a garment picture under the pointer lights its pieces blue
                      // …and, with nothing under the pointer, the piece the active question asks about
                      const lit = hotSeeds ? hotSeeds.has(f.seed) : !!asked?.has(f.seed);
                      const dim = (hotGarment || (asked && !hotSeeds)) && !lit;
                      return (
                        <polygon
                          key={f.seed}
                          data-key={tool === 'pan' ? f.seed : undefined}
                          points={ptsAttr(c.outer)}
                          fill={lit ? SHEET_INK.blue : on ? SHEET_INK.pick : st.fill}
                          fillOpacity={
                            lit ? 0.15 : o === 'leak' && c.outer.length === 4 ? 0.15 : 0.85
                          }
                          stroke={
                            lit
                              ? SHEET_INK.blue
                              : sent
                                ? SHEET_INK.red
                                : on
                                  ? SHEET_INK.ink
                                  : st.stroke
                          }
                          strokeWidth={unit * (lit || on || sent ? 2.2 : 1.2)}
                          strokeDasharray={!lit && st.dash ? `${unit * 8} ${unit * 5}` : undefined}
                          opacity={dim ? (hotGarment ? 0.35 : 0.55) : undefined}
                          className={tool === 'pan' ? 'cursor-pointer' : undefined}
                          onPointerEnter={
                            tool === 'pan'
                              ? () => setHot({ kind: 'piece', seed: f.seed })
                              : undefined
                          }
                          onPointerLeave={tool === 'pan' ? () => setHot(null) : undefined}
                        />
                      );
                    })}
                  {hotGarmentLines.length > 0 && (
                    <g
                      fill='none'
                      stroke={SHEET_INK.blue}
                      strokeWidth={unit * 3}
                      strokeLinecap='round'
                      pointerEvents='none'
                    >
                      {hotGarmentLines.map((l, i) => (
                        <polyline
                          key={`gl${i}`}
                          points={ptsAttr(l)}
                          strokeDasharray={
                            hotGarmentPic?.cutOff[i] ? `${unit * 6} ${unit * 4}` : undefined
                          }
                        >
                          {hotGarmentPic?.cutOff[i] && (
                            <title>drawn off its outline in the PDF</title>
                          )}
                        </polyline>
                      ))}
                    </g>
                  )}
                  {families.map((f) => {
                    const c = cand(f);
                    if (!c.leakAt) return null;
                    return (
                      <g key={`l${f.seed}`} pointerEvents='none'>
                        <circle
                          cx={c.leakAt.x}
                          cy={vy(c.leakAt.y)}
                          r={unit * 9}
                          fill='none'
                          stroke={SHEET_INK.red}
                          strokeWidth={unit * 1.6}
                        />
                        <text
                          x={c.leakAt.x + unit * 12}
                          y={vy(c.leakAt.y)}
                          fontSize={unit * 12}
                          fill={SHEET_INK.red}
                          dominantBaseline='middle'
                        >
                          gap
                        </text>
                      </g>
                    );
                  })}
                  {bridges
                    .filter((b) => b.rank == null || b.rank === rank)
                    .map((b, i) => (
                      <g key={`b${i}`} pointerEvents='none'>
                        <line
                          x1={b.from.x}
                          y1={vy(b.from.y)}
                          x2={b.to.x}
                          y2={vy(b.to.y)}
                          stroke={SHEET_INK.blue}
                          strokeWidth={unit * 2}
                        />
                        {[b.from, b.to].map((p, k) => (
                          <rect
                            key={k}
                            x={p.x - unit * 2.5}
                            y={vy(p.y) - unit * 2.5}
                            width={unit * 5}
                            height={unit * 5}
                            fill={SHEET_INK.blue}
                          />
                        ))}
                      </g>
                    ))}
                  {gapA && (
                    <rect
                      x={gapA.x - unit * 4}
                      y={vy(gapA.y) - unit * 4}
                      width={unit * 8}
                      height={unit * 8}
                      fill='none'
                      stroke={SHEET_INK.blue}
                      strokeWidth={unit * 1.6}
                      pointerEvents='none'
                    />
                  )}
                  {/* the set-aside check: every outline it asks about, the hovered one lit */}
                  {cardShown.map(({ a }, i) => {
                    const off = seen.flip.has(a.id);
                    const lit = !off || (hot?.kind === 'aside' && hot.id === a.id);
                    const r = {
                      x: a.box.minX,
                      y: vy(a.box.maxY),
                      width: a.box.maxX - a.box.minX,
                      height: a.box.maxY - a.box.minY,
                    };
                    return (
                      <g
                        key={`q${a.id}`}
                        onPointerEnter={() => setHot({ kind: 'aside', id: a.id })}
                        onPointerLeave={() => setHot(null)}
                      >
                        <rect
                          {...r}
                          fill={lit ? SHEET_INK.blue : 'none'}
                          fillOpacity={lit ? 0.35 : 0}
                          stroke={lit ? SHEET_INK.blue : SHEET_INK.ink}
                          strokeWidth={unit * (lit ? 3 : 1.6)}
                          strokeDasharray={lit ? undefined : `${unit * 3} ${unit * 3}`}
                          pointerEvents='none'
                        />
                        {cardShown.length > 1 && (
                          <text
                            x={a.box.maxX + unit * 6}
                            y={vy((a.box.minY + a.box.maxY) / 2)}
                            fontSize={unit * 16}
                            fill={lit ? SHEET_INK.blue : SHEET_INK.ink}
                            dominantBaseline='middle'
                            pointerEvents='none'
                          >
                            {letterOf(i)}
                          </text>
                        )}
                        <rect
                          {...r}
                          fill='none'
                          stroke='transparent'
                          strokeWidth={unit * 8}
                          pointerEvents='stroke'
                        />
                      </g>
                    );
                  })}
                  {asides
                    .filter((a) => asideKey(a) === asideOpen || a === asideAt)
                    .map((a) => (
                      <rect
                        key={`a${a.id}`}
                        x={a.box.minX}
                        y={vy(a.box.maxY)}
                        width={a.box.maxX - a.box.minX}
                        height={a.box.maxY - a.box.minY}
                        fill='none'
                        stroke={a === asideAt ? SHEET_INK.ink : SHEET_INK.mut}
                        strokeWidth={unit * (a === asideAt ? 1.8 : 1)}
                        strokeDasharray={`${unit * 3} ${unit * 3}`}
                        pointerEvents='none'
                      />
                    ))}
                  {out.seeds.map((s0) => {
                    const m = markOf.get(s0.id);
                    if (!m) return null;
                    const moved = movedTo.get(s0.id);
                    const s = moved ? { ...s0, at: moved } : s0;
                    // the numbers the question is about are drawn large (which part is which)
                    const big = !!asked?.has(s.id) && asked.size > 1;
                    const r = unit * (big ? 18 : 9);
                    const on = s.id === sel;
                    return (
                      <g
                        key={`s${s.id}`}
                        data-key={tool === 'pan' ? s.id : undefined}
                        className={tool === 'pan' ? 'cursor-pointer' : undefined}
                      >
                        <rect
                          x={s.at.x - r}
                          y={vy(s.at.y) - r}
                          width={r * 2}
                          height={r * 2}
                          fill={on || big ? SHEET_INK.blue : SHEET_INK.ink}
                        />
                        <text
                          x={s.at.x}
                          y={vy(s.at.y)}
                          fontSize={unit * (big ? 22 : 11)}
                          fill='#ffffff'
                          textAnchor='middle'
                          dominantBaseline='central'
                        >
                          {m}
                        </text>
                        {(s.origin === 'click' || s.origin === 'face' || moved) && (
                          <text
                            x={s.at.x}
                            y={vy(s.at.y) + r * 2.2}
                            fontSize={unit * 9}
                            fill={SHEET_INK.mut}
                            textAnchor='middle'
                          >
                            {moved ? 'moved' : s.origin === 'face' ? 'outline' : 'click'}
                          </text>
                        )}
                      </g>
                    );
                  })}
                  <title>{`${box.w.toFixed(0)} mm across`}</title>
                </>
              )}
            </SheetViewport>
          </div>
        </Panel>
      }
      side={
        <Panel
          title={headTitle}
          aside={
            /* the grade's open questions: notes behind the header door, not lines in the list */
            <HeaderWarnings
              items={[
                autoShown && {
                  text: `picked ${session.variant} — the file's styles look the same`,
                  action: {
                    label: 'change the garment',
                    onClick: reopenVariant,
                    disabled: !!session.busy,
                  },
                },
                ...(out.grade?.ambiguities ?? []).map((a) => a.message),
              ]}
            />
          }
        >
          {focus && (
            <CalloutBox tone='error' className='mb-2 flex flex-col gap-1.5 py-1.5'>
              <div className='flex items-start gap-2'>
                <Text
                  size='micro'
                  component='p'
                  className='min-w-0 flex-1'
                  title={FOCUS_HELP[focus.kind]}
                >
                  <b>! from {focus.from}</b>
                </Text>
                {onDismissFocus && (
                  <Button
                    variant='underline'
                    size='xs'
                    className='shrink-0 text-labelColor hover:text-textColor'
                    onClick={onDismissFocus}
                  >
                    dismiss
                  </Button>
                )}
              </div>
              <ul className='flex flex-col gap-0.5'>
                {focus.items.map((it, i) => (
                  <li key={`${it.label}-${i}`}>
                    <button
                      type='button'
                      onClick={() => jump(it)}
                      className={cn(
                        'w-full text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-textColor',
                        sel === it.seed && (it.rank == null || it.rank === rank)
                          ? 'bg-bgZebra'
                          : 'hover:bg-bgZebra',
                      )}
                    >
                      <Text size='micro' component='span' className='font-bold'>
                        {markOf.get(it.seed) ? `${markOf.get(it.seed)} · ` : ''}
                        {it.label}
                        {it.rank != null && !it.sized ? ` · size ${labelOf(it.rank)}` : ''}
                      </Text>
                      <Text size='micro' variant='label' component='span' className='block'>
                        {it.why}
                      </Text>
                    </button>
                  </li>
                ))}
              </ul>
              <ChipRow>
                {focus.kind !== 'region' && (
                  <Chip
                    selected={tool === 'wall'}
                    pressed={tool === 'wall'}
                    onClick={() => pickTool('wall')}
                  >
                    use line
                  </Chip>
                )}
                {focus.kind !== 'growth' && (
                  <Chip
                    selected={tool === 'bridge'}
                    pressed={tool === 'bridge'}
                    disabled={refusedSel}
                    onClick={() => pickTool('bridge')}
                  >
                    close gap
                  </Chip>
                )}
                {focus.kind !== 'walls' && (
                  <Chip
                    selected={tool === 'reseed'}
                    pressed={tool === 'reseed'}
                    disabled={sel == null}
                    onClick={() => setTool('reseed')}
                  >
                    try another spot
                  </Chip>
                )}
              </ChipRow>
            </CalloutBox>
          )}
          {/* the garment picked for the operator: always said, with «change» */}
          {autoShown && (
            <div className='flex items-center gap-2 px-1 py-1' data-auto-variant={session.variant}>
              <Text size='micro' variant='label' component='span' className='min-w-0 flex-1'>
                garment: {session.variant} · the styles look the same here
              </Text>
              <Button
                variant='underline'
                size='xs'
                className='shrink-0 text-labelColor hover:text-textColor'
                disabled={!!session.busy}
                onClick={reopenVariant}
              >
                change
              </Button>
            </div>
          )}
          {/* the garment, once picked: one quiet line */}
          {variants.length > 1 && session.variant && !autoShown && !active && (
            <div className='flex items-center gap-2 px-1 py-1'>
              <Text size='micro' variant='label' component='span' className='min-w-0 flex-1'>
                garment: {session.variant} ✓
              </Text>
              <Button
                variant='underline'
                size='xs'
                className='shrink-0 text-labelColor hover:text-textColor'
                disabled={!!session.busy}
                onClick={() => void api.dispatch({ type: 'variant', variant: null })}
              >
                change
              </Button>
            </div>
          )}
          {/* the active question: its title, its picture, and only its own answers */}
          {active && (
            <div
              data-ask-zone
              data-ask-label={
                active.kind === 'aside'
                  ? `${asideQ}${cardNow ? ` · ${quizCards.length - cardsLeft.length + 1} of ${quizCards.length}` : ''}`
                  : `${active.kind === 'region' && !activeTouch && activeCand?.outcome !== 'leak' && markOf.get(active.seed) ? `${markOf.get(active.seed)} · ` : ''}${question}`
              }
              className='flex flex-col gap-3'
            >
              {counter && active.kind !== 'aside' && (
                <Text size='micro' variant='label' component='span' className='-mb-2 self-end'>
                  {counter}
                </Text>
              )}
              <Text
                size='micro'
                component='p'
                title={
                  active.kind === 'region'
                    ? activeWhy?.full
                    : active.kind === 'sheet' && sheetQ
                      ? (
                          out.sheets?.alternatives.find((x) => x.key === sheetQ.key)?.evidence ??
                          out.sheets?.copies.find((x) => x.key === sheetQ.key)?.evidence ??
                          out.sheets?.splits.find((x) => x.key === sheetQ.key)?.evidence ??
                          []
                        ).join(' · ')
                      : undefined
                }
              >
                {active.kind === 'region' &&
                !activeTouch &&
                activeCand?.outcome !== 'leak' &&
                markOf.get(active.seed)
                  ? `${markOf.get(active.seed)} · `
                  : ''}
                {question}
              </Text>
              {activeTouch && activeCand && renderTouch(activeTouch)}
              {active.kind === 'touch' && renderTouchAll(active.groups)}
              {leakGap && activeFam && (
                <div
                  className='flex flex-col gap-3'
                  data-gap-card
                  data-gap-mm={leakGap.mm.toFixed(1)}
                >
                  <GapCrop
                    gap={leakGap}
                    previews={previews}
                    className='w-full border border-borderColor bg-bgColor'
                    style={{ height: 220 }}
                  />
                  <div className='grid grid-cols-2 gap-2'>
                    {(
                      [
                        ['close it', 'closed', closeGap],
                        ['not a piece', 'drop', () => notAPiece(activeFam)],
                      ] as const
                    ).map(([label, mode, onClick], i) => (
                      <button
                        key={label}
                        type='button'
                        {...ask(ASK_KEY.region, i === 0)}
                        data-ask-hint={i === 0 ? 'close the outline' : undefined}
                        data-suggested={i === 0 || undefined}
                        disabled={!!session.busy}
                        onClick={onClick}
                        className={`flex flex-col gap-2 bg-bgColor p-2 text-left hover:border-textColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-textColor disabled:cursor-default ${i === 0 ? 'border-2 border-textColor' : 'border border-borderColor'}`}
                      >
                        <GapCrop
                          gap={leakGap}
                          previews={previews}
                          mode={mode}
                          className='w-full'
                          style={{ height: 100 }}
                        />
                        <Text size='micro' component='span'>
                          {label}
                        </Text>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {active.kind === 'region' && !activeTouch && !leakGap && activeCand && cropBox && (
                <RegionCrop
                  box={cropBox}
                  outer={activeCand.outer.length > 4 ? activeCand.outer : []}
                  previews={previews}
                  stroke={SHEET_INK.blue}
                  leakAt={activeCand.leakAt}
                  marks={
                    asked && asked.size > 1
                      ? [...asked].flatMap((id) => {
                          const at = movedTo.get(id) ?? seedAt(id)?.at;
                          return at ? [{ at, n: markWord(id) }] : [];
                        })
                      : undefined
                  }
                  className='w-full border border-hairline bg-bgColor'
                  style={{ height: 160 }}
                />
              )}
              {/* a garment: its picture IS the answer (hover lights its pieces on the sheet) */}
              {active.kind === 'model' && (
                <div className='flex flex-col gap-3'>
                  {answers.map((x, i) => {
                    const g = garments.find((y) => y.v === x.label);
                    const on = hot?.kind === 'garment' && hot.v === x.label;
                    // how this garment differs, when the engine says (sure marks only): its own
                    // outlines, its cutting lines in blue, the pieces it changes tinted
                    const pic = garmentPicture(x.label, g?.fams ?? [], marks, {
                      rank,
                      rankOfSize,
                      own: true,
                    });
                    // the card's own suggestion (first in the list) is shown picked in advance
                    const suggested = x.label === named?.pick;
                    return (
                      <button
                        key={x.label}
                        type='button'
                        {...ask(ASK_KEY.model, i === 0)}
                        // the garment the card itself names (strong evidence) is the one-click
                        // fix; a suggestion or no name stays a choice, coached
                        {...(i === 0 && named?.strong && x.label === named.pick
                          ? { 'data-ask-fix': ASK_KEY.model }
                          : {})}
                        data-ask-hint={i === 0 ? x.how : undefined}
                        aria-label={`garment ${x.label}`}
                        title={x.title}
                        disabled={!!session.busy}
                        aria-busy={doing === x.label && !!session.busy}
                        onClick={() => {
                          setDoing(x.label);
                          x.onClick();
                        }}
                        onPointerEnter={() => setHot({ kind: 'garment', v: x.label })}
                        onPointerLeave={() => setHot(null)}
                        onFocus={() => setHot({ kind: 'garment', v: x.label })}
                        onBlur={() => setHot(null)}
                        className={`flex flex-col gap-2 bg-bgColor p-2 text-left hover:border-textColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-textColor disabled:cursor-default ${suggested ? 'border-2 border-textColor' : 'border border-borderColor'}`}
                        data-suggested={suggested || undefined}
                        style={on ? { borderColor: SHEET_INK.blue } : undefined}
                      >
                        <ModelThumb
                          sheet={sheetBox}
                          outlines={pic.outlines}
                          tinted={pic.tinted}
                          cutLines={pic.cutLines}
                          cutOff={pic.cutOff}
                          hot={on}
                          className='w-full'
                          style={{ height: 240 }}
                        />
                        <Text size='micro' component='span'>
                          {doing === x.label && session.busy ? 'opening… · ' : ''}
                          {x.label} · {plural(g?.fams.length ?? 0, 'piece')} · size{' '}
                          {labelOf(pic.rank)}
                          {pic.cutLines.length ? ' · its cutting line in blue' : ''}
                          {suggested && named
                            ? named.strong
                              ? ' · the card names it'
                              : ' · suggested by the card'
                            : ''}
                        </Text>
                      </button>
                    );
                  })}
                </div>
              )}
              {/* the outlines left out on a guess: one card at a time — one outline, or one kind
                  of likely non-piece with its pictures — the likely answer chosen */}
              {active.kind === 'aside' && (
                <div
                  className='flex flex-col gap-3'
                  data-aside-quiz
                  data-aside-now={quizNow?.a.id ?? (groupNow ? groupNow.key : undefined)}
                  data-aside-cards={quizCards.length}
                  data-aside-asked={quiz.length}
                  data-aside-auto={autoOut.length}
                  data-aside-failed={seen.applyFailed || undefined}
                  data-aside-plan={asideItems
                    .map((it) => {
                      const c = classOf(it);
                      const j = joinsOf(it)
                        .map(
                          (x) =>
                            `${nameOf(x.seed)}(${Math.round(x.sharedMm)}+${Math.round(x.insideMm)}/${Math.round(x.perimMm)}${x.full ? 'F' : ''}${x.graded ? 'G' : ''}${x.same ? 'S' : ''})`,
                        )
                        .join(',');
                      return `${it.a.id}:${c.kind}${c.kind === 'auto' || c.kind === 'group' ? `/${c.kind === 'group' ? `${c.group}:` : ''}${c.word}` : ''}${j ? `[${j}]` : ''}`;
                    })
                    .join(' ')}
                >
                  {groupNow ? (
                    <>
                      <div
                        className='grid grid-cols-3 gap-2'
                        data-aside-group={groupNow.group}
                        data-aside-group-n={groupNow.items.length}
                      >
                        {groupNow.items.map((it, i) => {
                          const flipped = seen.flip.has(it.a.id);
                          const js = joinsOf(it);
                          const host = hostOf(it);
                          const hj =
                            groupNow.group === 'join'
                              ? js.slice(0, 1)
                              : host != null
                                ? js.filter((x) => x.seed === host).slice(0, 1)
                                : [];
                          return (
                            <button
                              key={it.a.id}
                              type='button'
                              aria-pressed={flipped}
                              data-aside-tile={it.a.id}
                              title='click to give this one the other answer'
                              disabled={!!session.busy || seen.committing > 0}
                              onPointerEnter={() => setHot({ kind: 'aside', id: it.a.id })}
                              onPointerLeave={() => setHot(null)}
                              onClick={() => {
                                if (flipped) seen.flip.delete(it.a.id);
                                else seen.flip.add(it.a.id);
                                bump((n) => n + 1);
                              }}
                              className={cn(
                                'flex flex-col gap-1 bg-bgColor p-1 text-left hover:border-textColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-textColor',
                                flipped ? 'border-2 border-textColor' : 'border border-borderColor',
                              )}
                            >
                              <AsideSilhouette
                                box={it.a.box}
                                previews={previews}
                                outline={faceOutline(it.a.box, previews) ?? undefined}
                                hosts={hj}
                                className='w-full'
                                style={{ height: 96 }}
                              />
                              <Text size='micro' variant='label' component='span'>
                                {letterOf(i)} · {groupWord(groupNow.group, it, flipped)}
                              </Text>
                            </button>
                          );
                        })}
                      </div>
                      <div className='flex flex-wrap items-center gap-2'>
                        <Button
                          {...ask(ASK_KEY.aside, true)}
                          data-ask-hint='answer them all at once'
                          variant='secondary'
                          size='sm'
                          data-suggested
                          disabled={!!session.busy || seen.committing > 0}
                          onClick={() => answerGroup(groupNow)}
                          className='border-textColor'
                        >
                          {seen.flip.size
                            ? `yes, with ${plural(seen.flip.size, 'change')}`
                            : groupNow.group === 'join'
                              ? 'yes, join them'
                              : groupNow.group === 'inner'
                                ? 'yes, part of them'
                                : 'yes, none are pieces'}
                        </Button>
                        <Text size='micro' variant='label' component='span'>
                          click a picture to change its answer
                        </Text>
                        <Text size='micro' variant='label' component='span' className='ml-auto'>
                          {quizCards.length - cardsLeft.length + 1} of {quizCards.length}
                        </Text>
                      </div>
                    </>
                  ) : quizNow ? (
                    <>
                      <AsideSilhouette
                        box={quizNow.a.box}
                        previews={previews}
                        outline={faceOutline(quizNow.a.box, previews) ?? undefined}
                        hosts={quizJoins}
                        title={`${wordOf(quizNow.a)} · ${asideWords(quizNow.a)}`}
                        className='w-full border border-borderColor bg-bgColor p-2'
                        style={{ height: 220 }}
                      />
                      <div className='flex flex-wrap items-center gap-2'>
                        {(
                          [
                            ...(quizLikely
                              ? [
                                  ...quizJoins.slice(0, 1).map((j) => ({
                                    label: `part of piece ${nameOf(j.seed)}`,
                                    host: j.seed as number | null,
                                    yes: false,
                                  })),
                                  { label: 'its own piece', host: null, yes: true },
                                ]
                              : [
                                  { label: 'yes, a piece', host: null, yes: true },
                                  ...quizJoins.map((j) => ({
                                    label: `part of piece ${nameOf(j.seed)}`,
                                    host: j.seed as number | null,
                                    yes: false,
                                  })),
                                ]),
                            { label: 'no', host: null, yes: false },
                          ] as const
                        ).map((x, i) => (
                          <Button
                            {...ask(ASK_KEY.aside, i === 0)}
                            data-ask-hint={i === 0 ? 'say if it is a piece' : undefined}
                            key={x.label}
                            variant='secondary'
                            size='sm'
                            data-suggested={i === 0 || undefined}
                            data-join={x.host ?? undefined}
                            disabled={!!session.busy || seen.committing > 0}
                            onPointerEnter={() =>
                              x.host != null && setHot({ kind: 'piece', seed: x.host })
                            }
                            onPointerLeave={() => x.host != null && setHot(null)}
                            onClick={() =>
                              x.host != null
                                ? answerJoin([{ it: quizNow, host: x.host }])
                                : quizAnswer(x.yes)
                            }
                            className={cn(i === 0 && 'border-textColor')}
                          >
                            {x.label}
                          </Button>
                        ))}
                        <Text size='micro' variant='label' component='span' className='ml-auto'>
                          {quizCards.length - cardsLeft.length + 1} of {quizCards.length}
                        </Text>
                      </div>
                    </>
                  ) : (
                    <div className='flex flex-wrap items-center gap-2'>
                      <Button
                        {...ask(ASK_KEY.aside, true)}
                        data-ask-hint={
                          seen.answers.size ? 'send the answers' : 'confirm what was left out'
                        }
                        variant='secondary'
                        size='sm'
                        data-aside-apply
                        disabled={!!session.busy || seen.committing > 0}
                        onClick={() => quizEnd()}
                        className='border-textColor'
                      >
                        {seen.applyFailed ? 'try again' : 'yes'}
                      </Button>
                    </div>
                  )}
                  <div className='flex flex-wrap items-center gap-3'>
                    {cardNow && (
                      <Button
                        variant='underline'
                        size='xs'
                        className='text-labelColor hover:text-textColor'
                        title='every outline still to ask stays as it is now'
                        // an explicit operator choice (it keeps the guesses for unseen outlines):
                        // never the ask line's one-click fix
                        disabled={!!session.busy || seen.committing > 0}
                        onClick={() => quizEnd()}
                      >
                        none of the rest are pieces
                      </Button>
                    )}
                    {seen.asideSteps.length > 0 && seen.answers.size > 0 && (
                      <Button
                        variant='underline'
                        size='xs'
                        className='text-labelColor hover:text-textColor'
                        title='ask the last card again'
                        disabled={!!session.busy || seen.committing > 0}
                        onClick={quizBack}
                      >
                        back
                      </Button>
                    )}
                    {seen.committing > 0 && (
                      <Text size='micro' variant='label' component='span' data-aside-applying>
                        applying {plural(seen.committing, 'answer')}…
                      </Text>
                    )}
                    {seen.applyFailed && !seen.committing && (
                      <Text size='micro' variant='label' component='span' data-aside-error>
                        couldn&apos;t apply · try again
                      </Text>
                    )}
                  </div>
                  {autoLine &&
                    quietList({
                      key: 'auto',
                      line: `left out: ${autoLine}`,
                      items: autoOut.map((it) => ({ it, word: wordAuto(it), host: hostOf(it) })),
                    })}
                </div>
              )}
              {active.kind === 'region' && partly && activeCand?.outcome !== 'leak' && (
                <div className='flex flex-wrap items-center gap-1'>
                  <Text size='micro' variant='label' component='span'>
                    in size
                  </Text>
                  {badRanks.map((x) => (
                    <button
                      key={x.rank}
                      type='button'
                      title={`size ${labelOf(x.rank)}: ${OUTCOME[x.outcome].word}`}
                      onClick={() => jump({ seed: active.seed, rank: x.rank })}
                      className={cn(
                        'text-micro tabular-nums text-labelColor hover:text-textColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-textColor',
                        x.rank === rank && 'text-textColor underline',
                      )}
                    >
                      {labelOf(x.rank)}
                    </button>
                  ))}
                </div>
              )}
              {active.kind !== 'model' &&
                active.kind !== 'aside' &&
                active.kind !== 'touch' &&
                !activeTouch &&
                !leakGap && (
                  <div className='flex flex-wrap items-center gap-2'>
                    {answers.map((x, i) => (
                      <Button
                        {...ask(ASK_KEY[active.kind], i === 0)}
                        data-ask-hint={i === 0 ? x.how : undefined}
                        key={x.label}
                        variant='secondary'
                        size='sm'
                        disabled={!!session.busy || x.disabled}
                        aria-pressed={x.pressed}
                        title={x.title}
                        aria-busy={doing === x.label && !!session.busy}
                        onClick={() => {
                          setDoing(x.label);
                          x.onClick();
                        }}
                        className={cn(i === 0 && 'border-textColor', x.pressed && 'bg-bgZebra')}
                      >
                        {doing === x.label && session.busy ? `${x.label}…` : x.label}
                      </Button>
                    ))}
                  </div>
                )}
              <SkipQuiz />
            </div>
          )}

          {/* no piece found at all: the one answer is to click one on the sheet */}
          {!active && !families.length && (
            <div data-ask-zone data-ask-label='no pieces found' className='flex flex-col gap-3'>
              <Text size='micro' component='p'>
                no pieces found
              </Text>
              <div className='flex flex-wrap items-center gap-2'>
                <Button
                  {...ask('pieces-seed', true, 'click inside a piece')}
                  variant='secondary'
                  size='sm'
                  className='border-textColor'
                  aria-pressed={tool === 'seed'}
                  disabled={!!session.busy}
                  onClick={() => pickTool('seed')}
                >
                  add a piece
                </Button>
              </div>
            </div>
          )}

          {/* the pieces found: a tile each; not shown while a question is open */}
          {closedFams.length > 0 && !active && (
            <Fold
              className='mt-4'
              label={plural(closedFams.length, 'piece')}
              open={closedOpen || (selClosed && !required.length)}
              onOpenChange={(o) => {
                setClosedOpen(o);
                if (!o && selClosed) setSel(null);
              }}
            >
              <div className='grid grid-cols-4 gap-3 pt-1'>
                {closedFams.map((f) => {
                  const c = cand(f);
                  const m = markOf.get(f.seed);
                  return (
                    <OutlineTile
                      key={f.seed}
                      box={c.bbox}
                      outline={c.outer}
                      previews={previews}
                      mark={m}
                      picked={f.seed === sel}
                      hot={hotSeeds?.has(f.seed) ?? false}
                      label={`piece ${m}`}
                      title={`piece ${m} · ${sizesOf(f)}`}
                      onHover={(o) => setHot(o ? { kind: 'piece', seed: f.seed } : null)}
                      onClick={() => setSel(f.seed === sel ? null : f.seed)}
                    />
                  );
                })}
              </div>
              {selected && selClosed && (
                <div className='mt-3 flex flex-wrap items-center gap-2'>
                  <Text size='micro' component='span' className='min-w-0 flex-1'>
                    {markOf.get(selected.seed)} · {sizesOf(selected)}
                    {focusSeeds.has(selected.seed) ? ' · ! sent here' : ''}
                  </Text>
                  <Button
                    variant='secondary'
                    size='sm'
                    disabled={!!session.busy}
                    onClick={() => notAPiece(selected)}
                  >
                    not a piece
                  </Button>
                  <Button
                    variant='secondary'
                    size='sm'
                    aria-pressed={tool === 'reseed'}
                    disabled={!!session.busy}
                    onClick={() => setTool('reseed')}
                    className={cn(tool === 'reseed' && 'bg-bgZebra')}
                  >
                    try another spot
                  </Button>
                </div>
              )}
            </Fold>
          )}

          {(inputs.edits.length > 0 || hint || appliedNow) && (
            <div className='mt-2 flex flex-wrap items-center gap-2'>
              {appliedNow && (
                <Text size='micro' variant='label' component='span' data-touch-applied>
                  {appliedNow.text}
                  {appliedNow.hosts ? joinedSizes(appliedNow.hosts) : ''} ·
                </Text>
              )}
              {(inputs.edits.length > 0 || appliedNow) && (
                <Button
                  variant='underline'
                  size='xs'
                  className='text-labelColor hover:text-textColor'
                  disabled={!!session.busy}
                  title={editsLine}
                  onClick={() => (appliedNow ? undoApplied() : void api.editPieces('undo'))}
                >
                  undo
                </Button>
              )}
              {hint && (
                <Text size='micro' variant='label' component='span'>
                  {hint}
                </Text>
              )}
            </div>
          )}

          {selected && (
            <DebugFold label={`region ${markOf.get(selected.seed)} · diagnostics`}>
              {/* a refused size has no outline: no area, no coverage, no growth (copy 6) */}
              <Row
                label='seed'
                value={`${SEED_WORD[seedAt(selected.seed)?.origin ?? 'text']}${seedAt(selected.seed)?.variant ? ` · ${seedAt(selected.seed)!.variant}` : ''}`}
              />
              <Row
                label='area, this size'
                value={
                  refusedSel ? <EmptyCell /> : `${(cand(selected).areaMm2 / 100).toFixed(1)} cm²`
                }
              />
              <Row
                label='walls covered'
                value={refusedSel ? <EmptyCell /> : fmtPct(cand(selected).sourceCoverage)}
              />
              <Row
                label='p95 to the walls'
                value={refusedSel ? <EmptyCell /> : fmtMm(cand(selected).p95Mm)}
              />
              <Row
                label='grows with size'
                value={
                  selected.candidates.some((c) => c.outcome === 'refused') ? (
                    <EmptyCell />
                  ) : selected.monotone ? (
                    'yes'
                  ) : (
                    <span className='text-error'>no</span>
                  )
                }
              />
            </DebugFold>
          )}
          {asideGroups.length > 0 && (
            <DebugFold label={`${asides.length - weak.size} left out, not asked`}>
              <ul className='divide-y divide-hairline'>
                {asideGroups.map(({ key: k, list }) => {
                  return (
                    <li key={k} className='pb-1'>
                      <button
                        type='button'
                        aria-expanded={asideOpen === k}
                        onClick={() => {
                          setAsideOpen(asideOpen === k ? null : k);
                          setAsideAt(null);
                        }}
                        className={cn(
                          'flex w-full items-center gap-2 px-1 py-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-textColor',
                          asideOpen === k ? 'bg-bgZebra' : 'hover:bg-bgZebra',
                        )}
                      >
                        <Text size='micro' component='span' className='min-w-0 flex-1'>
                          {list.length} · {asideWords(list[0])}
                        </Text>
                        <FoldCaret open={asideOpen === k} />
                      </button>
                      {asideOpen === k && (
                        <ul className='flex flex-col pl-3'>
                          {list.map((a) => (
                            <li key={a.id} className='flex items-center gap-2 py-0.5'>
                              <button
                                type='button'
                                title={a.why || undefined}
                                onClick={() => setAsideAt(a === asideAt ? null : a)}
                                className={cn(
                                  'min-w-0 flex-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-textColor',
                                  a === asideAt ? 'bg-bgZebra' : 'hover:bg-bgZebra',
                                )}
                              >
                                <Text size='micro' component='span' className='tabular-nums'>
                                  {a.seed?.text ? `“${a.seed.text.text.slice(0, 16)}”` : ''}
                                  {a.seed?.text && a.areaMm2 > 0 ? ' · ' : ''}
                                  {a.areaMm2 > 0 ? `${(a.areaMm2 / 100).toFixed(0)} cm²` : ''}
                                </Text>
                              </button>
                              <Button
                                variant='underline'
                                size='xs'
                                disabled={!!session.busy}
                                onClick={() => {
                                  setAsideAt(null);
                                  void api.promoteAside(a).then((id) => id != null && setSel(id));
                                  setHint('made a piece — the fill runs from it');
                                }}
                              >
                                this is a piece
                              </Button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            </DebugFold>
          )}
        </Panel>
      }
    />
  );
}
