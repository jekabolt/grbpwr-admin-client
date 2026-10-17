// Step 5 · PIECES — seed + outer fill (06-SYNTHESIS: the core). Every region is drawn as found;
// what the fill could not close goes to the human: a leak (red, with where the outside got in),
// two seeds in one region (blue), a region too small to be a piece. Tools: click to seed, close a
// gap (two clicks: a wall between two line ends), use a line (it becomes an outline for this size
// or all sizes), ignore a line (a frame, a watermark), lasso to
// merge (around several seeds) or split (inside a merged region), "not a piece", reseed. Each
// region carries a strip of its sizes, so a piece closed in four sizes of six says which two.
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import type {
  FillOutcome,
  PieceCandidate,
  PieceEdit,
  PieceFamily,
  PtMm,
  Seed,
  SetAside,
  VariantMark,
} from 'lib/pattern-import/types';
import { PATIMPORT } from 'lib/pattern-import/types';
import { Button } from 'ui/components/button';
import { sheetAnswerEdits, sheetQuestion } from 'lib/pattern-import/pieces/sheets';
import { CalloutBox } from 'ui/components/callout-box';
import { Chip, ChipRow } from 'ui/components/chip';
import { FoldCaret } from 'ui/components/fold-caret';
import { HeaderWarnings } from 'ui/components/header-warnings';
import { Row } from 'ui/components/row';
import Text from 'ui/components/text';
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
  useAutoAnswer,
  useQuizSlot,
} from '../ui-bits';
import { plural } from '../stages';
import type { PieceFocus } from '../piece-focus';
import { modelFromCard } from '../autopilot/card-match';
import { provenCopy, weakAsides } from '../auto-advance';
import type { CardContext } from '../client';
import { DroppedLabels } from './not-in-file';
import { AsideSilhouette, ModelThumb, OutlineTile, RegionCrop, ownChains } from './pieces-guide';

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
  | { key: string; kind: 'region'; seed: number; rank: number; outcome: FillOutcome }
  | { key: 'sheet'; kind: 'sheet' }
  /** Optional, after the required ones: were the outlines left out on a guess left out right? */
  | { key: 'aside'; kind: 'aside' };

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
    split: null as SplitCheck | null,
    /** The set-aside quiz, one outline at a time: the aside ids answered, in order. */
    asideDone: [] as number[],
    /** The garment picked without asking (styles the client cannot tell apart); once per import. */
    autoVariant: null as string | null,
    /** The run (sessionId) the automatic pick was sent for: one send per run, StrictMode-proof. */
    autoTried: null as number | null,
    /** «change» on the picked-for-you garment: ask from now on, never pick again. */
    autoReopened: false,
  }));
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

  // ── THE GUIDE: every open question in the footer's order; one is on the card at a time ──
  const openProblems: Problem[] = [
    ...(variants.length > 1 && !session.variant && !autoGo
      ? [{ key: 'model', kind: 'model' } as const]
      : []),
    ...families.filter(needsFix).map((f): Problem => {
      const c = problemOf(f);
      return { key: `r${f.seed}`, kind: 'region', seed: f.seed, rank: c.rank, outcome: c.outcome };
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
  /** Every question seen open since the step opened (or the model last changed): fixed ones stay. */
  if (seen.variant !== (session.variant ?? null)) {
    // another model is another set of regions: what the last one asked is not "fixed"
    seen.variant = session.variant ?? null;
    for (const k of [...seen.rows.keys()]) if (k !== 'model') seen.rows.delete(k);
    seen.asideOk = false;
    seen.asideDone = [];
    seen.promoted.clear();
    seen.split = null;
  }
  // the card follows the active question: a resolved region hands over to the next one by itself
  const guided = useRef(false);
  const activeRegion = active?.kind === 'region' ? active : null;
  useEffect(() => {
    // the step opened from check / details: the piece it was sent to keeps the view
    const keep = !guided.current && !!focus;
    guided.current = true;
    if (keep || !activeRegion) return;
    jump({ seed: activeRegion.seed, rank: activeRegion.rank });
    setGapA(null);
    setTool('pan');
    // the same region asked again after an answer (two pieces → a gap) is a new question too
  }, [active?.key, activeRegion?.outcome, activeRegion?.rank]);
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
  // A reseed moves the seed: draw its marker where the operator clicked, not where the text put
  // it (FLY-final M2: the marker stayed at the old point). Undo drops the edit and moves it back.
  const movedTo = new Map<number, PtMm>();
  for (const e of inputs.edits) if (e.kind === 'reseed') movedTo.set(e.seed, e.at);
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

  const seedAt = (id: number) => out.seeds.find((s) => s.id === id);
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
    void api.editPieces({ kind: 'not-a-piece', seed: f.seed });
    setSel(null);
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
          const at = movedTo.get(g.seed) ?? seedAt(g.seed)?.at;
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
  // two numbers in one outline: the region's own other number is the one whose fill, at the same
  // size, is ALSO 'two pieces touch' and gives the same region (same area within 3 %, its number
  // inside this outline). A separately closed nested piece (a pocket, a facing) sits inside too but
  // closes on its own — 'closed', another area — so it is never taken for a part of this one.
  const partners = activeFam && activeCand ? partnersOf(activeFam, activeCand) : [];
  /** The other numbers inside this outline (shown large even when not proven a pair). */
  const others = activeFam && activeCand ? rawPartners(activeFam, activeCand) : [];
  /** The pieces the active question is about: lit on the canvas, their numbers drawn large. */
  const asked = activeFam ? new Set([activeFam.seed, ...others.map((g) => g.seed)]) : null;
  const markWord = (seed: number) => markOf.get(seed) ?? '?';
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
  // mid-split, the part already cut is still one of the two (its outline no longer overlaps)
  const cutPart =
    activeFam && seen.split?.stage === 2 && seen.split.other === activeFam.seed
      ? families.find((g) => g.seed === seen.split!.first)
      : undefined;
  const broughtBack = new Set([...seen.promoted.values()].map((x) => x.seed));
  // a brought-back outline whose number sits in this region is one of its parts too (after a cut
  // it no longer reads as the same region, so the pair rule alone would miss it)
  const backInside =
    activeFam && activeCand && activeCand.outcome === 'merged' && activeCand.outer.length > 2
      ? families.filter((g) => {
          if (g.seed === activeFam.seed || !broughtBack.has(g.seed)) return false;
          const at = movedTo.get(g.seed) ?? seedAt(g.seed)?.at;
          return !!at && inside(at, activeCand.outer);
        })
      : [];
  const parts = activeFam
    ? [...new Set([activeFam, ...others, ...(cutPart ? [cutPart] : []), ...backInside])]
    : [];
  const backParts = parts.filter((g) => broughtBack.has(g.seed));
  const dropAnswers: Answer[] = (backParts.length === 1 ? backParts : parts).map((g) => ({
    label: `drop ${markWord(g.seed)}`,
    how: 'one piece, or two parts',
    title: `part ${markWord(g.seed)} is not a piece`,
    onClick: () => notAPiece(g),
  }));
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
        return [
          // one click: the two numbers become one piece (the merge edit, these numbers exactly)
          ...(partners.length === 1
            ? [
                {
                  label: 'one piece',
                  how: 'one piece, or two parts',
                  title: `numbers ${[activeFam, ...partners].map((g) => markWord(g.seed)).join(' and ')} name one piece`,
                  onClick: () => {
                    pickTool('pan');
                    void api.editPieces({
                      kind: 'merge',
                      seeds: [activeFam.seed, ...partners.map((g) => g.seed)],
                    });
                    setHint(
                      `${markWord(activeFam.seed)} and ${partners.map((g) => markWord(g.seed)).join(', ')} joined into one piece`,
                    );
                  },
                },
              ]
            : [
                // not proven a pair: the loop round the parts to join (the banner says so)
                {
                  label: 'one piece',
                  how: 'one piece, or two parts',
                  title: 'draw a loop around the parts that are one piece',
                  pressed: tool === 'lasso' && lassoJoin && sel === activeFam.seed,
                  onClick: () => {
                    arm('lasso');
                    setLassoJoin(true);
                    setZoomTo({ seed: activeFam.seed, rank: activeCand.rank });
                  },
                },
              ]),
          // a split needs the line between the parts: the sheet is already on the region, the
          // numbers are large, and the hint says which loop to draw
          {
            label: 'two parts',
            how: 'one piece, or two parts',
            title: `draw a loop around the part with number ${markWord(activeFam.seed)}`,
            pressed: tool === 'lasso' && !lassoJoin && sel === activeFam.seed,
            onClick: () => {
              arm('lasso');
              setLassoSplit(true);
              setZoomTo({ seed: activeFam.seed, rank: activeCand.rank });
            },
          },
          // which part is not a piece: the brought-back outline when it is one of them, else
          // one answer per part with its number (never an ambiguous «not a piece»)
          ...dropAnswers,
        ];
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
    : active.kind === 'model'
      ? 'which garment is this card?'
      : active.kind === 'aside'
        ? 'is this a pattern piece?'
        : active.kind === 'sheet'
          ? sheetQ?.text ?? 'how do these sheets relate?'
          : activeCand?.outcome === 'leak'
            ? 'outline with a gap?'
            : activeCand?.outcome === 'merged'
              ? 'one piece or two parts?'
              : activeCand?.outcome === 'tiny'
                ? 'is this a piece?'
                : 'sizes unclear — try elsewhere?';
  const qIndex = active ? checklist.findIndex(([k]) => k === active.key) : -1;

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
  type AsideItem = { a: SetAside; seed: number | null; picked: boolean };
  const lastEdit = inputs.edits[inputs.edits.length - 1];
  const dropped = (seed: number) =>
    inputs.edits.some((e) => e.kind === 'not-a-piece' && e.seed === seed);
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
  // ── the set-aside quiz: one outline at a time, the likeliest pieces first ──
  const pieceAreas = families
    .map((f) => cand(f).areaMm2)
    .filter((x) => x > 0)
    .sort((a, b) => a - b);
  const typical = pieceAreas.length ? pieceAreas[Math.floor(pieceAreas.length / 2)] : 0;
  const rankOf = (a: SetAside) => {
    const area = a.areaMm2 > 0 ? a.areaMm2 : (a.box.maxX - a.box.minX) * (a.box.maxY - a.box.minY);
    const { idx, small } = ownChains(a.box, previews);
    // text, a legend table, a garment sketch: mostly small marks — asked last
    const junk = ASIDE_JUNK.has(a.reason) || (small > 30 && small > idx.length * 0.5);
    const off = typical > 0 && area > 0 ? Math.abs(Math.log(area / typical)) : 9;
    return (junk ? 100 : 0) + off;
  };
  const quizRank = new Map(asideItems.map((it) => [it.a.id, rankOf(it.a)]));
  const quiz = [...asideItems].sort(
    (x, y) => quizRank.get(x.a.id)! - quizRank.get(y.a.id)! || x.a.id - y.a.id,
  );
  const quizLeft = quiz.filter((it) => !seen.asideDone.includes(it.a.id));
  const quizNow = active?.kind === 'aside' ? quizLeft[0] ?? null : null;
  /**
   * The quiz is over: everything left keeps its current guess, and the operator has looked at the
   * outlines set aside — said to the engine (UXHOOKS `inputs.asideReviewed`: per tile sheet, the
   * digest of the set as it is AFTER the last answer's re-run, so the answer itself is not a
   * "changed set"), which drops the step's offer. The shell then moves on if nothing else is asked.
   */
  const quizEnd = (answer?: Promise<unknown>) => {
    seen.asideOk = true;
    setHot(null);
    bump((n) => n + 1);
    go(Promise.resolve(answer).then(() => api.reviewAsides()));
  };
  const quizAnswer = (piece: boolean) => {
    if (!quizNow) return;
    // the same dispatch the tiles used: only a change of the guess sends anything
    const isPiece = quizNow.seed != null && quizNow.picked;
    const p = piece !== isPiece ? toggleAside(quizNow) : undefined;
    seen.asideDone = [...seen.asideDone, quizNow.a.id];
    if (quizLeft.length <= 1) quizEnd(p);
    else bump((n) => n + 1);
  };
  const quizBack = () => {
    seen.asideDone = seen.asideDone.slice(0, -1);
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
  const headTitle =
    active && listed && qIndex >= 0
      ? `question ${qIndex + 1} of ${checklist.length}`
      : required.length
        ? 'pieces'
        : active?.kind === 'aside'
          ? 'pieces ✓ · 1 optional check'
          : families.length
            ? 'pieces ✓'
            : 'no pieces yet';
  const ASK_KEY: Record<Problem['kind'], string> = {
    model: 'pieces-model',
    region: 'pieces-region',
    sheet: 'pieces-sheet',
    aside: 'pieces-aside',
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
              focus={quizNow ? quizNow.a.box : zoomBox}
              reveal={reveal}
              tool={tool === 'pan' ? 'pan' : tool === 'lasso' ? 'lasso' : 'point'}
              onPick={(k) => {
                setSel(k ? Number(k) : null);
                // a region with a question picked on the sheet becomes the card's question
                if (k && openProblems.some((p) => p.key === `r${k}`)) setActiveKey(`r${k}`);
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
                  {active?.kind === 'aside' &&
                    quizNow &&
                    [quizNow].map(({ a, picked }) => {
                      const lit = true;
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
                            fillOpacity={lit ? 0.12 : 0}
                            stroke={lit ? SHEET_INK.blue : picked ? SHEET_INK.ink : SHEET_INK.mut}
                            strokeWidth={unit * (lit ? 2 : 1)}
                            strokeDasharray={lit ? undefined : `${unit * 3} ${unit * 3}`}
                            pointerEvents='none'
                          />
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
          {/* THE GUIDE: with two questions or more, every one as a plain row; the card answers one */}
          {listed && (
            <ol className='flex flex-col gap-0.5'>
              {checklist.map(([key, row]) => {
                const open = openProblems.find((p) => p.key === key);
                const on = !!open && active?.key === key;
                const fam =
                  row.seed != null ? families.find((f) => f.seed === row.seed) : undefined;
                return (
                  <li key={key}>
                    <button
                      type='button'
                      aria-current={on ? 'step' : undefined}
                      disabled={!open && !fam}
                      title={
                        open?.kind === 'region' && fam ? whyOf(fam, problemOf(fam)).full : undefined
                      }
                      onClick={() => {
                        if (open) {
                          setActiveKey(key);
                          if (open.kind === 'region') jump({ seed: open.seed, rank: open.rank });
                        } else if (fam) jump({ seed: fam.seed, rank: null });
                      }}
                      className={cn(
                        'flex w-full min-w-0 items-center gap-2 px-2 py-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-textColor disabled:cursor-default',
                        on ? 'bg-bgZebra' : open ? 'hover:bg-bgZebra' : 'text-labelColor',
                      )}
                    >
                      <Text size='micro' component='span' className='min-w-0 flex-1 truncate'>
                        {fam && markOf.get(fam.seed)
                          ? `${markOf.get(fam.seed)} · ${row.label}`
                          : row.label}
                      </Text>
                      {!open && (
                        <Text size='micro' variant='label' component='span' aria-label='fixed'>
                          ✓
                        </Text>
                      )}
                    </button>
                  </li>
                );
              })}
            </ol>
          )}

          {/* the active question: its title, its picture, and only its own answers */}
          {active && (
            <div
              data-ask-zone
              data-ask-label={
                active.kind === 'aside'
                  ? `is this a pattern piece? · ${quiz.length - quizLeft.length + 1} of ${quiz.length}`
                  : `${active.kind === 'region' && markOf.get(active.seed) ? `${markOf.get(active.seed)} · ` : ''}${question}`
              }
              className={cn('flex flex-col gap-3', listed && 'mt-3 border-t border-hairline pt-3')}
            >
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
                {active.kind === 'region' && markOf.get(active.seed)
                  ? `${markOf.get(active.seed)} · `
                  : ''}
                {question}
              </Text>
              {active.kind === 'region' && activeCand && cropBox && (
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
              {/* the outlines left out on a guess: one at a time, its silhouette, yes or no */}
              {active.kind === 'aside' && quizNow && (
                <div className='flex flex-col gap-3'>
                  <AsideSilhouette
                    box={quizNow.a.box}
                    previews={previews}
                    title={`${wordOf(quizNow.a)} · ${asideWords(quizNow.a)}`}
                    className='w-full border border-borderColor bg-bgColor p-2'
                    style={{ height: 220 }}
                  />
                  <div className='flex flex-wrap items-center gap-2'>
                    {(
                      [
                        ['yes, a piece', true],
                        ['no', false],
                      ] as const
                    ).map(([label, yes], i) => (
                      <Button
                        {...ask(ASK_KEY.aside, i === 0)}
                        data-ask-hint={i === 0 ? 'say if it is a piece' : undefined}
                        key={label}
                        variant='secondary'
                        size='sm'
                        disabled={
                          !!session.busy ||
                          (yes && quizNow.seed != null && !quizNow.picked && !canToggle(quizNow))
                        }
                        onClick={() => quizAnswer(yes)}
                        className={cn(i === 0 && 'border-textColor')}
                      >
                        {label}
                      </Button>
                    ))}
                    <Text size='micro' variant='label' component='span' className='ml-auto'>
                      {quiz.length - quizLeft.length + 1} of {quiz.length}
                    </Text>
                  </div>
                  <div className='flex flex-wrap items-center gap-3'>
                    <Button
                      variant='underline'
                      size='xs'
                      className='text-labelColor hover:text-textColor'
                      title='every outline still to ask stays as it is now'
                      // an explicit operator choice (it keeps the guesses for unseen outlines):
                      // never the ask line's one-click fix
                      disabled={!!session.busy}
                      onClick={() => quizEnd()}
                    >
                      none of the rest are pieces
                    </Button>
                    {seen.asideDone.length > 0 && (
                      <Button
                        variant='underline'
                        size='xs'
                        className='text-labelColor hover:text-textColor'
                        title='ask the last outline again'
                        disabled={!!session.busy}
                        onClick={quizBack}
                      >
                        back
                      </Button>
                    )}
                  </div>
                </div>
              )}
              {active.kind === 'region' && partly && (
                <div className='flex flex-wrap items-center gap-1'>
                  <Text size='micro' variant='label' component='span'>
                    in
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
              {active.kind !== 'model' && active.kind !== 'aside' && (
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

          {(inputs.edits.length > 0 || hint) && (
            <div className='mt-2 flex flex-wrap items-center gap-2'>
              {inputs.edits.length > 0 && (
                <Button
                  variant='underline'
                  size='xs'
                  className='text-labelColor hover:text-textColor'
                  disabled={!!session.busy}
                  title={editsLine}
                  onClick={() => void api.editPieces('undo')}
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
                value={refusedSel ? '—' : `${(cand(selected).areaMm2 / 100).toFixed(1)} cm²`}
              />
              <Row
                label='walls covered'
                value={refusedSel ? '—' : fmtPct(cand(selected).sourceCoverage)}
              />
              <Row
                label='p95 to the walls'
                value={refusedSel ? '—' : fmtMm(cand(selected).p95Mm)}
              />
              <Row
                label='grows with size'
                value={
                  selected.candidates.some((c) => c.outcome === 'refused') ? (
                    '—'
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
