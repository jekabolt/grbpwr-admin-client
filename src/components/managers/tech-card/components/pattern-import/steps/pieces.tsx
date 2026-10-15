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
} from 'lib/pattern-import/types';
import { PATIMPORT } from 'lib/pattern-import/types';
import { Button } from 'ui/components/button';
import { sheetAnswerEdits, sheetQuestion } from 'lib/pattern-import/pieces/sheets';
import { CalloutBox } from 'ui/components/callout-box';
import { Chip, ChipRow } from 'ui/components/chip';
import { FoldCaret } from 'ui/components/fold-caret';
import { HeaderWarnings } from 'ui/components/header-warnings';
import { Pill } from 'ui/components/pill';
import { Row } from 'ui/components/row';
import Text from 'ui/components/text';
import { cn } from 'lib/utility';
import { SHEET_INK, SheetViewport, f32Attr, inside, ptsAttr, vy } from '../sheet-viewport';
import type { ImportSessionApi } from '../use-import-session';
import { exportedRanks, variantsOf } from '../use-import-session';
import { DebugFold, Fold, Panel, SplitStage, ask, fmtMm, fmtPct } from '../ui-bits';
import { plural } from '../stages';
import type { PieceFocus } from '../piece-focus';
import { modelFromCard } from '../autopilot/card-match';
import { provenCopy, weakAsides } from '../auto-advance';
import type { CardContext } from '../client';
import { DroppedLabels } from './not-in-file';

type Tool = 'pan' | 'seed' | 'bridge' | 'wall' | 'ignore' | 'lasso' | 'reseed';

const HINT: Record<Tool, string> = {
  pan: 'click a piece to select · wheel zoom · drag pan',
  seed: 'click inside a piece to seed it',
  bridge: 'click one end of the gap, then the other — a wall is drawn between them',
  wall: 'click a line the fill should treat as an outline (a facing line, a seam)',
  ignore: 'click a line that is not an outline (frame, watermark, label box)',
  lasso: 'draw around several seeds to merge · inside a two-seed region to split',
  reseed: 'click the new place for the selected seed',
};

/** The toolbar: tool, word, what it does. */
const TOOLS = [
  ['pan', 'pan', 'pan and select'],
  ['seed', '+ seed', 'click inside a piece the text did not label'],
  ['bridge', 'close gap', 'two clicks: a wall between two line ends'],
  ['wall', 'use line', 'a drawn line the fill should treat as an outline'],
  ['ignore', 'ignore line', 'a line that is not an outline'],
  ['lasso', 'lasso', 'merge seeds or split a two-seed region'],
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
  merged: { word: 'two seeds', tone: 'attention' },
  tiny: { word: 'tiny', tone: 'mut' },
  refused: { word: 'sizes unclear', tone: 'attention' },
};

/** Where a seed came from, as the regions list says it (A2: 'face' = a closed outline). */
const SEED_WORD: Record<Seed['origin'], string> = {
  text: 'text seed',
  click: 'clicked seed',
  ai: 'AI seed',
  face: 'outline seed',
};

/** A2: why a closed outline was set aside (D3: shown, one click from a piece). */
const ASIDE_WORD: Record<SetAside['reason'], string> = {
  sheet: 'a border round the whole sheet',
  'tile-frame': 'a page frame',
  'test-square': 'the test square',
  legend: 'a legend box (line samples with sizes)',
  table: 'a table',
  logo: 'a logo or a hatching',
  background: 'drawn in lines set aside as background',
  unlabelled: 'no piece label inside (this sheet labels its pieces)',
  'other-size': "another size's drawing (the first size's seed covers it)",
  'size-copy': 'another size of a piece already seeded',
  'seam-line': 'a seam line or a seam strip of a piece already seeded',
  joined: 'drawn against a piece already seeded',
  'inner-line': 'split off a seeded piece by an inner line',
  'other-pen': 'inside a piece, in another pen (a label box, a mark)',
  'code-text': 'part of a printed code',
};

/** H1: why the sizes of a piece were held back (the candidate's `gradeRefusal`). */
const REFUSED: Record<NonNullable<PieceCandidate['gradeRefusal']>, string> = {
  'sizes-not-distinguished':
    'the sizes are drawn alike here and nothing on the sheet proves which line is which size, so this size gets no outline. closing a gap does not help. reseed: click another spot inside the piece (the reading starts from the seed, a different spot can prove the sizes). or mark it not a piece.',
  'size-count':
    'how many sizes this sheet draws is not settled. answer it on the sizes step ("sizes drawn on this sheet").',
  'grade-ambiguous':
    'two size layouts fit these lines equally well, so no outline is given. reseed: click another spot inside the piece. or mark it not a piece.',
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
    'a size is not larger than the size below it: that size took the wrong line. step through the size chips, then use line on the right line for that size, or reseed, or mark it not a piece.',
  region: 'see the region below for what is wrong. reseed, close a gap, or mark it not a piece.',
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
  const markOf = useMemo(() => new Map(families.map((f, i) => [f.seed, i + 1])), [families]);
  if (!out || !session.sheet || !session.chains) return null;
  const previews = session.chains.chainPreview;
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
  const mapped = exportedRanks(session.sizes?.map);
  const labelOf = (r: number) => runSizes.find((z) => z.rank === r)?.label || `#${r + 1}`;
  const pickTool = (t: Tool) => {
    setGapA(null);
    setTool(t);
  };

  const seedAt = (id: number) => out.seeds.find((s) => s.id === id);
  const outcomeOf = (f: PieceFamily): FillOutcome =>
    f.candidates.find((c) => c.outcome !== 'closed')?.outcome ?? 'closed';
  const cand = (f: PieceFamily) => f.candidates[Math.min(rank, f.candidates.length - 1)];
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
  const zoomBox = asideAt
    ? asideAt.box
    : zoomCand && zoomCand.outer.length > 2
      ? zoomCand.bbox
      : null;
  const asides = out.setAside ?? [];
  // D6: a piece (or a whole tile sheet) drawn twice, or one cut between two sheets — asked here
  const sheetQ = sheetQuestion(out.sheets, api.inputs.sheetAnswers);
  // a size copy not proven a copy of a seeded piece (auto-advance provenCopy) is a guess: apart
  const asideKey = (a: SetAside) =>
    a.seed
      ? `label:${a.reason}`
      : a.reason === 'size-copy' && !provenCopy(a, families, out.seeds)
        ? 'size-copy?'
        : a.reason;
  const asideGroups = [...new Set(asides.map(asideKey))].map((k) => ({
    key: k,
    list: asides.filter((a) => asideKey(a) === k),
  }));
  const asideWords = (a: SetAside) =>
    asideKey(a) === 'size-copy?'
      ? 'between size lines, but not another size of a seeded piece — a piece of its own?'
      : a.reason === 'code-text'
        ? 'a number read as part of a printed code (smaller than the piece numbers, digits beside it) — held back as a seed'
        : a.seed
          ? `a piece label in ${ASIDE_WORD[a.reason]} — held back as a seed`
          : ASIDE_WORD[a.reason];
  const counts = families.reduce<Record<FillOutcome, number>>(
    (m, f) => ({ ...m, [outcomeOf(f)]: m[outcomeOf(f)] + 1 }),
    { closed: 0, leak: 0, merged: 0, tiny: 0, refused: 0 },
  );

  // ── what needs a fix: only the sizes that are exported must close (the footer's own rule) ──
  const isExp = (r: number) => !mapped || mapped.has(r);
  const needsFix = (f: PieceFamily) =>
    f.candidates.some((c) => isExp(c.rank) && c.outcome !== 'closed');
  const openFams = families.filter(needsFix);
  const closedFams = families.filter((f) => !needsFix(f));
  /** The size that shows the region's problem: the one on screen, else the first open one. */
  const problemOf = (f: PieceFamily): PieceCandidate => {
    const c = cand(f);
    return c.outcome !== 'closed' && isExp(c.rank)
      ? c
      : f.candidates.find((x) => isExp(x.rank) && x.outcome !== 'closed') ?? c;
  };
  const selClosed = !!selected && !needsFix(selected);
  const weak = new Set(weakAsides(asides, families, out.seeds));
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
              short: 'open outline',
              full: 'an open outline: the drawing closes it nowhere in any size — the fill ran out through a gap (the red ring). close gap at the ring if it is a piece, or not a piece.',
            }
          : {
              short: 'gap at the red ring',
              full: 'the outline has a gap and the fill ran outside (the red ring). close gap: click the two line ends at the ring. or drop it if it is not a piece.',
            };
      case 'merged':
        return {
          short: 'two pieces touch',
          full: 'two seeds share one region: the pieces touch. draw a lasso around one of them to split.',
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
  // the toolbar holds the tools the selected problem needs (and the one in hand), not all six
  const ctxTools = new Set<Tool>(['pan', 'seed', tool]);
  const selProblem = selected && needsFix(selected) ? problemOf(selected).outcome : null;
  if (selProblem === 'leak') ['bridge', 'wall', 'ignore'].forEach((t) => ctxTools.add(t as Tool));
  if (selProblem === 'merged') ctxTools.add('lasso');
  if (focus?.kind === 'walls') ['wall', 'bridge'].forEach((t) => ctxTools.add(t as Tool));
  if (focus?.kind === 'growth') ctxTools.add('wall');
  if (focus?.kind === 'region') ctxTools.add('bridge');
  const editsLine = [
    plural(inputs.edits.length, 'edit'),
    bridges.length && `${plural(bridges.length, 'gap')} closed`,
    used.size && `${plural(used.size, 'line')} used`,
    ignored.size && `${plural(ignored.size, 'line')} ignored`,
    `${inputs.clickSeeds.length} clicked ${inputs.clickSeeds.length === 1 ? 'seed' : 'seeds'}`,
  ]
    .filter(Boolean)
    .join(' · ');

  const onLasso = (poly: PtMm[]) => {
    const ins = families.filter((f) => {
      const s = seedAt(f.seed);
      return s && inside(s.at, poly);
    });
    if (ins.length >= 2) {
      void api.editPieces({ kind: 'merge', seeds: ins.map((f) => f.seed) });
      setHint(`merged ${ins.length} seeds into one piece`);
    } else {
      const c = centre(poly);
      const target =
        ins[0] ?? families.find((f) => outcomeOf(f) === 'merged' && inside(c, cand(f).outer));
      if (target) {
        void api.editPieces({ kind: 'split', seed: target.seed, lassoMm: poly });
        setHint('region split along the lasso');
      } else setHint('the lasso holds no seed and crosses no merged region — nothing to do');
    }
    setTool('pan');
  };

  return (
    <SplitStage
      canvas={
        <Panel
          title='pieces on the sheet'
          aside={
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
          }
          bodyClassName='p-0 flex flex-col'
        >
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
            {variants.length > 1 && (
              <>
                <Text
                  size='micro'
                  variant='label'
                  tracking='label'
                  component='span'
                  className='ml-3 uppercase'
                >
                  model
                </Text>
                <ChipRow>
                  <Chip
                    selected={!session.variant}
                    tone={!session.variant ? 'attention' : 'default'}
                    onClick={() => void api.dispatch({ type: 'variant', variant: null })}
                  >
                    all
                  </Chip>
                  {variants.map((v) => (
                    <Chip
                      {...ask('pieces-model', !session.variant)}
                      key={v}
                      selected={session.variant === v}
                      pressed={session.variant === v}
                      onClick={() => void api.dispatch({ type: 'variant', variant: v })}
                    >
                      {v}
                    </Chip>
                  ))}
                </ChipRow>
              </>
            )}
            {(tool === 'bridge' || tool === 'wall') && (
              <ChipRow className='ml-3'>
                <Chip
                  selected={!allSizes}
                  pressed={!allSizes}
                  onClick={() => setAllSizes(false)}
                  title={
                    tool === 'bridge'
                      ? 'the gap is in this size line only'
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
            <Text size='micro' variant='label' component='span' className='ml-auto'>
              {tool === 'bridge' && gapA ? '! now click the other end of the gap' : HINT[tool]}
            </Text>
          </div>
          <div className='min-h-0 flex-1'>
            <SheetViewport
              bbox={session.sheet.sheet.bbox}
              focus={zoomBox}
              tool={tool === 'pan' ? 'pan' : tool === 'lasso' ? 'lasso' : 'point'}
              onPick={(k) => setSel(k ? Number(k) : null)}
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
                  setHint('seed added — the fill runs from it');
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
                      return (
                        <polygon
                          key={f.seed}
                          data-key={tool === 'pan' ? f.seed : undefined}
                          points={ptsAttr(c.outer)}
                          fill={on ? SHEET_INK.pick : st.fill}
                          fillOpacity={o === 'leak' && c.outer.length === 4 ? 0.15 : 0.85}
                          stroke={sent ? SHEET_INK.red : on ? SHEET_INK.ink : st.stroke}
                          strokeWidth={unit * (on || sent ? 2.2 : 1.2)}
                          strokeDasharray={st.dash ? `${unit * 8} ${unit * 5}` : undefined}
                          className={tool === 'pan' ? 'cursor-pointer' : undefined}
                        />
                      );
                    })}
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
                    const r = unit * 9;
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
                          fill={on ? SHEET_INK.blue : SHEET_INK.ink}
                        />
                        <text
                          x={s.at.x}
                          y={vy(s.at.y)}
                          fontSize={unit * 11}
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
                            {moved ? 'reseed' : s.origin === 'face' ? 'outline' : 'click'}
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
          title='regions'
          aside={
            <>
              <Text
                size='micro'
                variant='label'
                component='span'
                className='uppercase tracking-label'
              >
                {counts.closed} closed
                {counts.leak ? ` · ${counts.leak} leak` : ''}
                {counts.merged ? ` · ${counts.merged} two seeds` : ''}
                {counts.tiny ? ` · ${counts.tiny} tiny` : ''}
                {counts.refused ? ` · ${counts.refused} sizes unclear` : ''}
              </Text>
              {/* the grade's open questions: notes behind the header door, not lines in the list */}
              <HeaderWarnings items={(out.grade?.ambiguities ?? []).map((a) => a.message)} />
            </>
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
                    reseed
                  </Chip>
                )}
              </ChipRow>
            </CalloutBox>
          )}
          {variants.length > 1 && !session.variant && (
            <Text
              size='micro'
              component='p'
              className='mb-2 text-warning'
              title={named?.pick == null && named?.why ? named.why : undefined}
            >
              ! {variants.length} models ({variants.join(', ')}) — pick one
            </Text>
          )}
          {named?.pick != null && (
            <div className='mb-2'>
              <Button
                {...ask('pieces-model')}
                variant='secondary'
                size='sm'
                disabled={!!session.busy}
                title={[
                  named.strong ? 'the card names it' : 'suggested by the card',
                  ...named.evidence,
                ].join(' · ')}
                onClick={() => void api.dispatch({ type: 'variant', variant: named.pick })}
              >
                use {named.pick}
              </Button>
            </div>
          )}
          {sheetQ && (
            <CalloutBox tone='warning' className='mb-2 flex flex-col gap-1.5 py-1.5'>
              <Text
                size='micro'
                component='p'
                title={(
                  out.sheets?.alternatives.find((x) => x.key === sheetQ.key)?.evidence ??
                  out.sheets?.copies.find((x) => x.key === sheetQ.key)?.evidence ??
                  out.sheets?.splits.find((x) => x.key === sheetQ.key)?.evidence ??
                  []
                ).join(' · ')}
              >
                ! {sheetQ.text}
              </Text>
              <div className='flex flex-wrap gap-2'>
                {(sheetQ.kind === 'alternative'
                  ? ([
                      ['keep', 'keep one sheet'],
                      ['union', 'different pieces — keep both'],
                    ] as const)
                  : sheetQ.kind === 'copy'
                    ? ([
                        ['copy', 'one piece drawn twice — keep one'],
                        ['both', 'two pieces'],
                      ] as const)
                    : sheetQ.kind === 'empty'
                      ? ([['empty', 'no piece on this sheet']] as const)
                      : ([
                          ['separate', 'separate pieces'],
                          ['halves', 'one piece cut between the sheets'],
                        ] as const)
                ).map(([answer, label]) => (
                  <Button
                    {...ask('pieces-sheet', !openFams.length)}
                    key={answer}
                    variant='secondary'
                    size='sm'
                    disabled={!!session.busy}
                    onClick={() =>
                      void api.dispatch({
                        type: 'sheet-answer',
                        key: sheetQ.key,
                        answer,
                        edits: sheetAnswerEdits(out.sheets, sheetQ.key, answer),
                      })
                    }
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </CalloutBox>
          )}

          {/* the regions that need a fix, first, each with its answers inline */}
          {openFams.length > 0 && (
            <ul className='divide-y divide-hairline'>
              {openFams.map((f) => {
                const c = problemOf(f);
                const o = c.outcome;
                const ranks = [...f.candidates].sort((a, b) => a.rank - b.rank);
                const out_ = ranks.filter((x) => !mapped || mapped.has(x.rank));
                const shut = out_.filter((x) => x.outcome === 'closed').length;
                const why = whyOf(f, c);
                const pickHere = (t: Tool, r = c.rank) => {
                  setSel(f.seed);
                  setRank(r);
                  pickTool(t);
                };
                return (
                  <li key={f.seed} className='pb-1.5'>
                    <button
                      type='button'
                      onClick={() => setSel(f.seed === sel ? null : f.seed)}
                      title={why.full}
                      className={cn(
                        'flex w-full items-center gap-2 px-1 py-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-textColor',
                        f.seed === sel ? 'bg-bgZebra' : 'hover:bg-bgZebra',
                      )}
                    >
                      <MarkSquare n={markOf.get(f.seed)} />
                      <Text size='micro' component='span' className='min-w-0 flex-1 truncate'>
                        {why.short}
                      </Text>
                      {focusSeeds.has(f.seed) && <Pill tone='warn'>! sent here</Pill>}
                      <Pill tone={OUTCOME[o].tone}>{OUTCOME[o].word}</Pill>
                    </button>
                    <div className='flex flex-wrap items-center gap-0.5 pl-6'>
                      {ranks.map((x) => (
                        <RankCell
                          key={x.rank}
                          label={labelOf(x.rank)}
                          outcome={x.outcome}
                          exported={!mapped || mapped.has(x.rank)}
                          current={x.rank === rank}
                          onClick={() => {
                            setRank(x.rank);
                            setSel(f.seed);
                          }}
                        />
                      ))}
                      <Text size='nano' variant='label' component='span' className='ml-1'>
                        {shut}/{out_.length} closed
                      </Text>
                    </div>
                    <ChipRow className='mt-1 pl-6'>
                      {o === 'leak' && (
                        <Chip
                          {...ask('pieces-region')}
                          selected={sel === f.seed && tool === 'bridge'}
                          pressed={sel === f.seed && tool === 'bridge'}
                          onClick={() => pickHere('bridge')}
                          title='two clicks: the two line ends at the red ring'
                        >
                          close gap
                        </Chip>
                      )}
                      {o === 'merged' && (
                        <Chip
                          {...ask('pieces-region')}
                          selected={sel === f.seed && tool === 'lasso'}
                          pressed={sel === f.seed && tool === 'lasso'}
                          onClick={() => pickHere('lasso')}
                          title='draw a lasso around one of the two pieces'
                        >
                          split
                        </Chip>
                      )}
                      {o === 'refused' && c.gradeRefusal === 'size-count' && (
                        <Chip
                          {...ask('pieces-region')}
                          disabled={!!session.busy}
                          onClick={() => void api.dispatch({ type: 'back', to: 'sizes' })}
                        >
                          ← sizes
                        </Chip>
                      )}
                      {o !== 'tiny' && (
                        <Chip
                          {...ask('pieces-region')}
                          selected={sel === f.seed && tool === 'reseed'}
                          pressed={sel === f.seed && tool === 'reseed'}
                          disabled={!!session.busy}
                          onClick={() => pickHere('reseed')}
                          title='click another spot inside the piece'
                        >
                          reseed
                        </Chip>
                      )}
                      <Chip
                        {...ask('pieces-region')}
                        disabled={!!session.busy}
                        onClick={() => notAPiece(f)}
                      >
                        not a piece
                      </Chip>
                    </ChipRow>
                  </li>
                );
              })}
            </ul>
          )}

          {/* the regions that closed: one count line, the list behind it */}
          {closedFams.length > 0 && (
            <Fold
              label={plural(closedFams.length, 'piece')}
              open={closedOpen || selClosed}
              onOpenChange={(o) => {
                setClosedOpen(o);
                if (!o && selClosed) setSel(null);
              }}
            >
              <ul className='flex flex-col'>
                {closedFams.map((f) => {
                  const ranks = [...f.candidates].sort((a, b) => a.rank - b.rank);
                  return (
                    <li
                      key={f.seed}
                      className={cn(
                        'flex items-center gap-2 px-1 py-0.5',
                        f.seed === sel ? 'bg-bgZebra' : 'hover:bg-bgZebra',
                      )}
                    >
                      <button
                        type='button'
                        aria-label={`region ${markOf.get(f.seed)}`}
                        onClick={() => setSel(f.seed === sel ? null : f.seed)}
                        className='focus-visible:outline focus-visible:outline-2 focus-visible:outline-textColor'
                      >
                        <MarkSquare n={markOf.get(f.seed)} />
                      </button>
                      <span className='flex flex-wrap items-center gap-0.5'>
                        {ranks.map((x) => (
                          <RankCell
                            key={x.rank}
                            label={labelOf(x.rank)}
                            outcome={x.outcome}
                            exported={!mapped || mapped.has(x.rank)}
                            current={x.rank === rank && f.seed === sel}
                            onClick={() => {
                              setRank(x.rank);
                              setSel(f.seed);
                            }}
                          />
                        ))}
                      </span>
                      {focusSeeds.has(f.seed) && <Pill tone='warn'>! sent here</Pill>}
                    </li>
                  );
                })}
              </ul>
              {selected && selClosed && (
                <div className='mt-1 flex flex-wrap gap-2 pl-6'>
                  <Chip disabled={!!session.busy} onClick={() => notAPiece(selected)}>
                    not a piece
                  </Chip>
                  <Chip
                    selected={tool === 'reseed'}
                    pressed={tool === 'reseed'}
                    disabled={!!session.busy}
                    onClick={() => setTool('reseed')}
                  >
                    reseed
                  </Chip>
                </div>
              )}
            </Fold>
          )}

          {asideGroups.length > 0 && (
            <Fold
              label={`${asides.length} set aside`}
              defaultOpen={weak.size > 0}
              ask={weak.size ? 'pieces-aside' : undefined}
            >
              <ul className='divide-y divide-hairline'>
                {asideGroups.map(({ key: k, list }) => {
                  const weakHere = list.some((a) => weak.has(a));
                  return (
                    <li key={k} className='pb-1'>
                      <button
                        type='button'
                        aria-expanded={asideOpen === k}
                        {...(weakHere && asideOpen !== k
                          ? { 'data-ask': 'pieces-aside', 'data-ask-fold': 'folded' }
                          : {})}
                        onClick={() => {
                          setAsideOpen(asideOpen === k ? null : k);
                          setAsideAt(null);
                        }}
                        className={cn(
                          'flex w-full items-center gap-2 px-1 py-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-textColor',
                          asideOpen === k ? 'bg-bgZebra' : 'hover:bg-bgZebra',
                        )}
                      >
                        <Text
                          size='micro'
                          component='span'
                          className={cn('min-w-0 flex-1', weakHere && 'text-warning')}
                        >
                          {weakHere ? '! ' : ''}
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
                                {...ask('pieces-aside', weak.has(a))}
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
        </Panel>
      }
    />
  );
}

function MarkSquare({ n }: { n: number | undefined }) {
  return (
    <span className='flex size-4 shrink-0 items-center justify-center bg-textColor text-nano text-bgColor tabular-nums'>
      {n}
    </span>
  );
}

/** One size of a region: filled ink when closed; a leak / two seeds / tiny reads in words too. */
function RankCell({
  label,
  outcome,
  exported,
  current,
  onClick,
}: {
  label: string;
  outcome: FillOutcome;
  exported: boolean;
  current: boolean;
  onClick: () => void;
}) {
  const word = exported ? OUTCOME[outcome].word : 'not exported';
  return (
    <button
      type='button'
      onClick={onClick}
      title={`size ${label}: ${word}`}
      aria-label={`size ${label}: ${word}`}
      className={cn(
        'h-4 min-w-6 border px-0.5 text-nano tabular-nums leading-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-textColor',
        !exported
          ? 'border-dashed border-borderColor text-labelColor'
          : outcome === 'closed'
            ? 'border-textColor bg-textColor text-bgColor'
            : outcome === 'leak'
              ? 'border-error text-error line-through'
              : outcome === 'refused'
                ? 'border-dashed border-warning text-warning'
                : outcome === 'merged'
                  ? 'border-warning text-warning'
                  : 'border-borderColor text-labelColor',
        current && 'outline outline-1 outline-offset-1 outline-textColor',
      )}
    >
      {label}
    </button>
  );
}
