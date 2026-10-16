// Step 4 · SIZES — a picture of the mapping (owner 16.10: «make a clearer UI for mapping sizes»):
// two aligned columns, «in the file» (each drawn size: its line sample, large, and its name) → «on
// the card» (the card size it goes to, a box; dashed «leave out» when none). One click on a box
// opens the card sizes, `leave out` and `rename…`. Card sizes nothing goes to close the list as
// «nothing → XL», so the gap is seen where it is. Above the list, at most ONE question, asked only
// when the sizes do not map by name: «which file size is your XS?» answered with the drawn sizes
// as pictures; the rest follow in order. A row's own doubt (a line the reader is unsure of, a
// guess, a drawn size off the card) is a `?` on the row that opens its yes / no under it.
// Hovering a row lights its lines on the sheet, blue and thicker. Evidence lives in `?debug=1`.
// Two size rows given one name are one size (a size drawn in two looks) — the worker merges them.
import { useEffect, useRef, useState } from 'react';
import type {
  BoxMm,
  CardSize,
  ChainRole,
  ChainAmbiguity,
  ClassEvidence,
  ExpectedSizes,
  LineClass,
  LineSwatch,
  SizeCountAsk,
  SizeMapEntry,
} from 'lib/pattern-import/types';
import { Chip } from 'ui/components/chip';
import { DataTable } from 'ui/components/data-table';
import { HeaderWarnings, type HeaderWarning } from 'ui/components/header-warnings';
import Input from 'ui/components/input';
import { Pill } from 'ui/components/pill';
import GenericPopover from 'ui/components/popover';
import Text from 'ui/components/text';
import { evidenceKinds } from 'lib/pattern-import/sizes/count-evidence';
import { drawnUnmapped } from 'lib/pattern-import/sizes/map';
import { sheetLegendQuestion } from 'lib/pattern-import/pieces/sheets';
import { cn } from 'lib/utility';
import type { CardContext } from '../client';
import { SHEET_INK, SheetViewport, f32Attr, vy } from '../sheet-viewport';
import type { ImportSessionApi, LegendEdit } from '../use-import-session';
import { legendKey } from '../use-import-session';
import { guessedSizes } from '../use-import-session';
import {
  DebugFold,
  Fold,
  NativeSelect,
  Panel,
  SplitStage,
  ask,
  fmtPct,
  useAnsweredAndGo,
  useQuizSlot,
} from '../ui-bits';
import { LineSwatchView } from '../line-swatch';

const ROLES: { value: ChainRole; label: string }[] = [
  { value: 'size', label: 'a size' },
  { value: 'common', label: 'all sizes share it' },
  { value: 'seam', label: 'a seam line' },
  { value: 'grain', label: 'a grainline' },
  { value: 'notch', label: 'a notch' },
  { value: 'internal', label: 'inside pieces' },
  { value: 'ignore', label: 'not needed' },
];
/** The row question for a line the reader is unsure of, in plain words (the line is beside it). */
const ROLE_QUESTION: Record<ChainRole, string> = {
  size: 'is this line a size?',
  common: 'is this one line that all sizes share?',
  seam: 'is this line a seam line?',
  grain: 'is this line a grainline?',
  notch: 'is this line a notch?',
  internal: 'is this line drawn inside the pieces (darts, pockets), not a size?',
  ignore: 'is this line not needed (text, a frame, marks)?',
};
const ROLE_WORD = Object.fromEntries(ROLES.map((r) => [r.value, r.label])) as Record<
  ChainRole,
  string
>;

const FLAG: Record<ChainAmbiguity['kind'], string> = {
  'size-count': 'size count',
  'labels-missing': 'no size names',
  'rank-direction': 'order unsure',
  'class-merge': 'two sizes alike',
  'class-split': 'one size, two looks',
  'size-empty': 'size not drawn',
  unassigned: 'lines without a size',
  'bundle-overfull': 'too many lines',
  'grade-ambiguous': 'which size is which',
};

/** A dash rhythm as the eye reads it: 7.78/1.66, not 7.781600531/1.659…. */
const mm = (xs: readonly number[]) => xs.map((x) => +x.toFixed(2)).join('/');

const around = (p: { x: number; y: number }, r = 60): BoxMm => ({
  minX: p.x - r,
  minY: p.y - r,
  maxX: p.x + r,
  maxY: p.y + r,
});

/** A mapping row's line sample: a 14 mm stretch, 1:1 (≈ 53 px) — two rhythms of most dashes. */
const ROW_SWATCH_MM = 14;
/** The quiz's picture strip: a shorter stretch, the chips stay one line. */
const QUIZ_SWATCH_MM = 10;
/** The row detail: a longer stretch, still cropped to the narrow column. */
const DETAIL_MM = 60;

export function SizesStep({ api, card }: { api: ImportSessionApi; card: CardContext }) {
  const { session, inputs, patchInputs } = api;
  const chains = session.chains;
  const sizes = session.sizes;
  // D6: the tile sheets must draw the same size pens (one legend for the document)
  const legendQ = sheetLegendQuestion(sizes?.sheetLegend, inputs.sheetLegendOk);
  const [hover, setHover] = useState<number | null>(null);
  const [flag, setFlag] = useState<number | null>(null);
  // MOOD-F1: the row clicked open — its lines lit, its key sample marked, its detail below
  const [picked, setPicked] = useState<number | null>(null);
  const [toKey, setToKey] = useState(false);
  // the `other lines` fold: null = follow the step (open while one of them waits for a confirm)
  const [otherOpen, setOtherOpen] = useState<boolean | null>(null);
  // a row question opened or closed by hand (key → open); otherwise the asked row is open
  const [qOverride, setQOverride] = useState<Record<string, boolean>>({});
  // the in-order quiz reopened over row answers (it then replaces them, and says so)
  const [reorder, setReorder] = useState(false);
  // A rename re-reads the lines, and that read starts the size map over (use-import-session
  // `legend`). The operator's answers are kept by size NAME across it: noted here before the
  // rename, given back with one `size-map` once the new read has landed. The note lives in the
  // wizard's slot, not in the step: the step unmounts while the read runs.
  const kept = useQuizSlot<{ map: KeptMap | null }>('sizes-kept-map', () => ({ map: null }));
  useEffect(() => {
    const keepMap = kept.map;
    if (!keepMap || !sizes || sizes === keepMap.at || session.busy) return;
    kept.map = null;
    if (inputs.sizeMap != null) return; // answered again meanwhile: theirs stands
    const byName = new Map(keepMap.entries.map((k) => [k.name, k.card]));
    const entries = sizes.map.entries.flatMap((e) => {
      const name = norm(e.source.label);
      return !e.notDrawn && byName.has(name)
        ? [{ ...e, card: byName.get(name) ?? null, origin: 'operator' as const }]
        : [];
    });
    if (entries.length) void api.dispatch({ type: 'size-map', entries });
  }, [kept, sizes, session.busy, inputs.sizeMap, api]);
  // As many sizes drawn as the card has, none matching by name: mapped in order at once, no
  // question (owner 16.10). Built in render (it needs the order), run after it, once per read.
  const autoMap = useRef<(() => void) | null>(null);
  const autoMapped = useQuizSlot<{ at: unknown }>('sizes-auto-map', () => ({ at: null }));
  useEffect(() => autoMap.current?.());
  const go = useAnsweredAndGo();
  if (!chains || !sizes || !session.sheet) return null;

  // One size drawn (the operator's answer): nothing to merge, so "two sizes alike" is no question
  // any more; shown, it invited answering 2 on a one-size sheet (blazer).
  const oneSize = sizes.expected?.n === 1;
  const flags = (chains.ambiguities ?? []).filter((a) => !(oneSize && a.kind === 'class-merge'));
  // Only the rows the operator changed travel (Codex round 4 T3): the legend is re-applied to a
  // fresh build, and a row sent back as built would be taken as answered — an untouched
  // low-confidence row (a grey "ignore") must stay a question.
  const edit = (classId: number, p: Partial<LegendEdit>) => {
    const row = chains.classes.find((c) => c.id === classId);
    if (!row) return;
    const mine = (e: LegendEdit) => (e.sig ? e.sig === row.sig : e.classId === classId);
    const prev: LegendEdit = inputs.legend.find(mine) ?? {
      classId,
      role: row.role,
      sizeLabel: row.sizeLabel,
      ...(row.sig ? { sig: row.sig } : {}),
    };
    void api.dispatch({
      type: 'legend',
      edits: [...inputs.legend.filter((e) => !mine(e)), { ...prev, ...p, classId }],
    });
  };
  /** Rename a size; the operator's mapping follows the names (the renamed row its new name). */
  const rename = (c: LineClass, v: string) => {
    const own = new Set((inputs.sizeMap ?? []).map((e) => e.source.rank));
    const notes = sizes.map.entries
      .filter((e) => own.has(e.source.rank) && !e.notDrawn)
      // the renamed row last: on a name clash the size renamed onto keeps its card size
      .sort((a, b) => +(a.source.classId === c.id) - +(b.source.classId === c.id))
      .map((e) => ({
        name: norm(e.source.classId === c.id ? v : e.source.label),
        card: e.card,
      }));
    const entries = notes.filter((k, i) => notes.findIndex((o) => o.name === k.name) === i);
    kept.map = entries.length ? { at: sizes, entries } : null;
    edit(c.id, { sizeLabel: v || null });
  };
  const setCard = (e: SizeMapEntry, sizeId: string) =>
    void api.setSize(e.source.rank, card.sizes.find((c) => String(c.sizeId) === sizeId) ?? null);
  const setRole = (c: LineClass, v: string) =>
    edit(c.id, { role: v as ChainRole, sizeLabel: v === 'size' ? c.sizeLabel ?? '' : null });
  const confirmRow = (c: LineClass) =>
    void api.dispatch({ type: 'legend-confirm', key: legendKey(c) });

  const flagged = flag != null ? flags[flag] : null;
  const pickedRow = picked != null ? chains.classes.find((c) => c.id === picked) ?? null : null;
  const sample = pickedRow ? keySampleOf(pickedRow) : null;
  const hotRow0 = hover ?? pickedRow?.id ?? null;
  const hot =
    hotRow0 != null
      ? new Set(chains.classes.find((c) => c.id === hotRow0)?.chains ?? [])
      : flagged
        ? new Set(flagged.chains.length ? flagged.chains : flaggedClassChains(flagged))
        : null;
  const focusBox =
    toKey && sample
      ? around(
          { x: (sample.at.x + sample.textAt.x) / 2, y: (sample.at.y + sample.textAt.y) / 2 },
          40,
        )
      : flagged?.at
        ? around(flagged.at)
        : null;
  function flaggedClassChains(a: ChainAmbiguity) {
    return chains!.classes.filter((c) => a.classes.includes(c.id)).flatMap((c) => c.chains);
  }
  const motifOf = (id: number) => {
    const ev = chains.classes.find((c) => c.id === id)?.evidence ?? [];
    for (const e of ev) {
      if (e.kind === 'declared-dash') return e.dash;
      if (e.kind === 'recovered-motif') return e.motif;
    }
    return null;
  };
  const evidenceText = (id: number) =>
    (chains.classes.find((c) => c.id === id)?.evidence ?? [])
      .map((e) => {
        switch (e.kind) {
          case 'ocg':
            return `layer “${e.name}”`;
          case 'declared-dash':
            return `dash ${mm(e.dash)}`;
          case 'recovered-motif':
            return `motif ${mm(e.motif)} (recovered)`;
          case 'color':
            return `colour rgb(${e.rgb.join(',')})`;
          case 'file':
            return `file ${e.label}`;
          case 'text-label':
            return `text “${e.text}” ${e.distanceMm} mm away`;
          case 'nesting-order':
            return `nesting rank ${e.rank}`;
          case 'colour-only':
            return `light grey only (rgb ${e.rgb.join(',')}) — background or a cut line?`;
          case 'seam-offset':
            return `${e.offsetMm} mm inside the cut line`;
          case 'faces':
            return `closes ${e.pieces} outline${e.pieces === 1 ? '' : 's'}${e.cues.length > 1 ? ` · ${e.cues.slice(1).join(' · ')}` : ''}`;
          case 'inside-faces':
            return `inside the outlines`;
          case 'face-stray':
            return `not an outline: ${e.why}`;
          case 'face-graded':
            return e.sourceOne
              ? `${e.why} — confirm if the sheet draws only ${e.sourceOne}, else answer the sizes drawn`
              : `outside the outlines — another size's lines? left to the size checks (${e.why})`;
          case 'layer':
            return `layer “${e.layer}”: ${e.meaning}`;
          case 'legend-sample':
            return `key sample “${e.label}” ${e.distanceMm} mm from its label, match ${e.score.toFixed(2)}`;
        }
      })
      .join(' · ');
  // provenance is a tooltip (copy rule 6): where the row's identity comes from
  const rowTitle = (c: LineClass) =>
    [identityLine(c), evidenceText(c.id), `${c.chains.length} lines`].filter(Boolean).join(' · ');
  const entryOfClass = (id: number) => sizes.map.entries.find((e) => e.source.classId === id);
  const classIds = new Set(chains.classes.map((c) => c.id));
  const sizeRows = chains.classes.filter((c) => c.role === 'size');
  const otherRows = chains.classes.filter((c) => c.role !== 'size');
  // Sizes not drawn as a legend row of their own (one-size files, DXF block names, a size whose
  // line the reader did not find) are rows of the same list, without a swatch.
  const loose = sizes.map.entries.filter(
    (e) => e.source.classId == null || !classIds.has(e.source.classId),
  );
  const dupe = (sizeId: number | undefined) =>
    sizeId != null && sizes.map.entries.filter((e) => e.card?.sizeId === sizeId).length > 1;
  const labels = sizeRows.map((c) => c.sizeLabel?.trim().toLowerCase());
  const repeats = labels.some((l, i) => l && labels.indexOf(l) !== i);

  // ── which question the step asks now, in the order the footer's blocker asks them
  // (use-import-session `blocker` · case 'sizes'), so only the controls that answer it carry
  // `data-ask` and the footer's link lands on the right one.
  const low = (c: LineClass) =>
    c.confidence < 0.6 && !inputs.legendConfirmed.includes(legendKey(c));
  const pending = (c: LineClass) =>
    low(c) &&
    !(
      sizes.expected?.from === 'operator' &&
      c.evidence.some((x) => x.kind === 'face-graded' && x.sourceOne)
    );
  const countOpen = !!sizes.countAsk && !sizes.expected;
  const otherPending = otherRows.filter(low).length;
  const asking: 'range' | 'count' | 'confirm' | 'legend' | 'map' | 'offer' | null =
    card.sizes.length === 0
      ? 'range'
      : countOpen
        ? 'count'
        : chains.classes.some(pending)
          ? 'confirm'
          : legendQ
            ? 'legend'
            : api.blocker
              ? 'map'
              : api.offer
                ? 'offer'
                : null;
  const noneMapped = !sizes.map.entries.some((e) => e.card);
  const anyDupe = sizes.map.entries.some((e) => dupe(e.card?.sizeId));
  // the map's own order of questions: nothing mapped, one card size twice, a guess, a size left off
  const mapAsk: 'none' | 'dupe' | 'guess' | 'partial' | null =
    asking !== 'map'
      ? null
      : noneMapped
        ? 'none'
        : anyDupe
          ? 'dupe'
          : guessedSizes(sizes.map.entries).length
            ? 'guess'
            : 'partial';
  const firstUnmapped = sizes.map.entries.find((e) => !e.card && !e.notDrawn)?.source.rank;
  // the offer's own order: a size listed but not drawn, a drawn size left off, then the flags
  const offerInRows =
    sizes.map.entries.some((e) => e.notDrawn) || drawnUnmapped(sizes.map).length > 0;

  // In-order mapping: card sizes in grade order onto consecutive drawn sizes (8 drawn, 5 card:
  // a window of 5 drawn, the rest left out), or the drawn sizes onto a window of the card.
  // Owner 16.10: the ASSUMPTION is made from the drawing — the drawn sizes ordered by the size of
  // their pieces (the biggest closed outline of each size's lines: kombinezon 6…20 grows 340 →
  // 470 dm² in step), smallest → the card's first size. Only when a drawn size has no closed
  // outline of its own does the file's grading order stand in.
  const areaOf = (e: SizeMapEntry) =>
    e.source.classId != null ? outlineArea(chains, e.source.classId) : 0;
  const drawnRaw = sizes.map.entries.filter((e) => !e.notDrawn);
  const byGeometry = drawnRaw.length > 1 && drawnRaw.every((e) => areaOf(e) > 0);
  const drawn = drawnRaw.sort((a, b) =>
    byGeometry
      ? areaOf(a) - areaOf(b) || a.source.rank - b.source.rank
      : a.source.rank - b.source.rank,
  );
  const cards = [...card.sizes].sort((a, b) => a.rank - b.rank);
  const span = drawn.length - cards.length; // ≥ 0: the window runs over the drawn sizes
  const slots = Math.abs(span) + 1;
  const windowOf = (start: number) =>
    drawn.map((e, i) => cards[span >= 0 ? i - start : i + start] ?? null);
  const sameWindow = (start: number) =>
    windowOf(start).every((c, i) => (drawn[i].card?.sizeId ?? null) === (c?.sizeId ?? null));
  const currentStart = Array.from({ length: slots }, (_, s) => s).find(sameWindow) ?? null;
  const centred = Math.floor(Math.abs(span) / 2);
  // an in-order answer given (every drawn size answered, as one window): the question is closed
  const windowAnswered = currentStart != null && drawn.every((e) => e.origin === 'operator');
  // the quiz: asked while the drawn sizes do not all map by name (a size off the card, a guess, a dupe)
  const orderAsked =
    drawn.length > 0 &&
    cards.length > 0 &&
    !windowAnswered &&
    (anyDupe || drawn.some((e) => !e.card || isGuess(e)));
  // An operator row answer (a manual card size, a leave-out, a kept guess) that no quiz window
  // matches: the bulk quiz would overwrite it, so it folds to a quiet «map in order again» that
  // says so. A map that IS one quiz window keeps the quiz open (picking another window is the quiz).
  const drawnRanks = new Set(drawn.map((e) => e.source.rank));
  const rowAnswered =
    currentStart == null &&
    (inputs.sizeMap ?? []).some((e) => e.origin === 'operator' && drawnRanks.has(e.source.rank));
  const showOrderBar =
    drawn.length > 0 && cards.length > 0 && (reorder || (orderAsked && !rowAnswered));
  const orderFolded =
    !showOrderBar && ((orderAsked && rowAnswered) || (windowAnswered && span !== 0));
  // the assumption the question asks about, shown in the rows until it is answered (never a column
  // of «leave out»): smallest → the first card size
  const assumed = showOrderBar && noneMapped ? windowOf(0) : null;
  // Owner 16.10 (kombinezon: the waistband strips of 8…18 were read into size 6): each size's
  // lines should close as many piece outlines as the others. The reference is the most any size
  // closes, leaving out a size that closes far more (it holds other sizes' lines). Only a warning
  // for now: moving a line to another size needs the engine's per-line answer (LINE-ASSIGN).
  const outlines = new Map(
    drawn.flatMap((e) =>
      e.source.classId != null ? [[e.source.classId, outlineCount(chains, e.source.classId)]] : [],
    ),
  );
  const counts = [...outlines.values()].sort((a, b) => a - b);
  const median = counts.length ? counts[Math.floor(counts.length / 2)] : 0;
  const refCount = Math.max(0, ...counts.filter((n) => n <= median * 1.5));
  const outlineNote = (classId: number): { text: string; title: string } | null => {
    const n = outlines.get(classId);
    if (n == null || counts.length < 3 || !refCount) return null;
    if (n > median * 1.5)
      return {
        text: `${n - refCount} extra pieces`,
        title: `these lines close ${n} piece outlines, the other sizes ${refCount}: lines of other sizes were read into this one`,
      };
    if (n < refCount)
      return {
        text: `${refCount - n} ${refCount - n === 1 ? 'piece' : 'pieces'} missing`,
        title: `these lines close ${n} piece outlines, other sizes ${refCount}: a piece of this size was read into another size`,
      };
    return null;
  };
  const assumedOf = (e: SizeMapEntry | undefined) => {
    const i = e && assumed ? drawn.indexOf(e) : -1;
    return i >= 0 ? assumed![i] : null;
  };
  const mapInOrder = (start: number) => {
    const win = windowOf(start);
    const ranks = new Set(drawn.map((e) => e.source.rank));
    setReorder(false);
    // one `size-map` answer: the entries per-row `setSize` calls would leave, all at once
    return api.dispatch({
      type: 'size-map',
      entries: [
        ...(inputs.sizeMap ?? []).filter((e) => !ranks.has(e.source.rank)),
        ...drawn.map((e, i) => ({ ...e, card: win[i], origin: 'operator' as const })),
      ],
    });
  };
  /** The operator's answer to the question: that window, then on (ANSWERED AND GO). */
  const answerOrder = (start: number) => go(mapInOrder(start));
  autoMap.current =
    !session.busy &&
    asking !== 'range' &&
    asking !== 'count' &&
    drawn.length > 0 &&
    drawn.length === cards.length &&
    noneMapped &&
    !inputs.sizeMap?.length &&
    autoMapped.at !== sizes
      ? () => {
          autoMapped.at = sizes;
          void mapInOrder(0);
        }
      : null;
  const drawnName = (e: SizeMapEntry) => e.source.label || `#${e.source.rank + 1}`;
  const windowTitle = (start: number) =>
    windowOf(start)
      .map((c, i) => `${drawnName(drawn[i])} → ${c?.name ?? 'leave out'}`)
      .join(' · ');
  // the question about what we found: the smallest outlines, is that the first card size?
  const firstWord = byGeometry ? 'the smallest outlines' : 'the first size in the file';
  const quiz =
    drawn.length > 0 && cards.length > 0
      ? `${firstWord} (${drawnName(drawn[0])}): is that ${cards[0].name}?`
      : '';
  const quizClass = showOrderBar ? drawn[0]?.source.classId ?? null : null;
  // the canvas: a hovered / picked row, else the size the question asks about, else a flag
  const hotRow = hotRow0 ?? (flagged ? null : quizClass);
  const lit =
    hotRow0 == null && !flagged && quizClass != null
      ? new Set(chains.classes.find((c) => c.id === quizClass)?.chains ?? [])
      : hot;
  // the legend row the step asks about first: a size row before the other lines
  const confirmAsk =
    asking === 'confirm' ? sizeRows.find(pending) ?? otherRows.find(pending) ?? null : null;
  // the step's first question on a line that is not a size: shown first, above the list, not
  // inside the folded «other lines» below it (owner: the blocker must be seen on first view)
  const hoisted = confirmAsk && confirmAsk.role !== 'size' ? confirmAsk : null;
  // the row question open by the operator's click; the row the footer asks about opens by itself
  const qOpen = (key: string, active: boolean) => qOverride[key] ?? active;
  const toggleQ = (key: string, active: boolean) =>
    setQOverride({ ...qOverride, [key]: !qOpen(key, active) });

  const warnings: HeaderWarning[] = [
    ...flags.map((a, i) => ({
      text: `${FLAG[a.kind] ?? a.kind}: ${a.message}`,
      ...(a.at || a.chains.length > 0 || a.classes.length > 0
        ? { action: { label: 'show its lines', onClick: () => setFlag(i) } }
        : {}),
    })),
    // a card size given twice is a blocker: the boxes turn red, and it is said here too
    ...cards.filter((c) => dupe(c.sizeId)).map((c) => `card size ${c.name} is given twice`),
    ...(repeats ? ['two lines carry one size name: they are read as one size'] : []),
    // The reader's own notes (a refused split, «split … name it») answer an operator action, so
    // they stay visible; only the run/encoding statistics live in the debug fold.
    ...chains.warnings,
  ];

  /**
   * The one open question of a mapping row, asked in the row itself: a line the reader is unsure
   * of, a size no line draws, a drawn size the card lacks, a guessed card size. The answers are the
   * same calls the old markers made (`legend-confirm`, `drawnAnyway`, `confirmSize`).
   */
  const questionOf = (c: LineClass | null, e: SizeMapEntry | undefined): RowAsk | null => {
    if (c && low(c)) {
      const isSize = c.role === 'size' && !!c.sizeLabel;
      return {
        text: isSize
          ? `is this line really size ${c.sizeLabel}?`
          : ROLE_QUESTION[c.role] ?? `is this line ${ROLE_WORD[c.role] ?? c.role}?`,
        title: confirmTitle(c),
        askKey: 'sizes-confirm',
        askOn: asking === 'confirm' && confirmAsk?.id === c.id,
        hint: isSize ? 'confirm this line is a size' : 'confirm what this line is',
        answers: [
          { label: 'yes', primary: true, onClick: () => confirmRow(c) },
          {
            label: c.role === 'size' ? 'no, another size' : 'no, it is something else',
            title: 'open the line: say what it is, split it or join it to another size',
            onClick: () => {
              if (c.role !== 'size') setOtherOpen(true);
              setPicked(c.id);
              setToKey(false);
            },
          },
        ],
      };
    }
    if (!e) return null;
    if (e.notDrawn)
      return {
        text: 'no line draws this size. is it drawn on the shared lines?',
        title:
          'this size is drawn on the lines all sizes share: fill it on them; a piece they do not close stays open',
        askKey: 'sizes-not-drawn',
        askOn: asking === 'offer',
        hint: 'say it is drawn on the shared lines',
        answers: [
          {
            label: 'yes, it is drawn',
            primary: true,
            onClick: () => void api.drawnAnyway(e.source.rank),
          },
        ],
      };
    // while the in-order question is up it answers these rows at once: no `?` on each of them
    if (showOrderBar) return null;
    const leftOut = e.origin === 'auto' && !e.card;
    if (leftOut)
      return {
        text: `${drawnName(e)} is not on the card. leave it out?`,
        title: `drawn, but not on the card${e.evidence?.length ? ` (${e.evidence.join(' · ')})` : ''}`,
        askKey: 'sizes-check',
        askOn: mapAsk === 'partial' || asking === 'offer',
        hint: 'leave it out, or pick a card size in its box',
        answers: [
          {
            label: 'yes, leave it out',
            primary: true,
            onClick: () => void api.confirmSize(e.source.rank),
          },
        ],
      };
    if (isGuess(e))
      return {
        text: `${drawnName(e)} → ${e.card?.name} is a guess. is it right?`,
        title: `${fmtPct(e.confidence ?? 0, 0)} sure${e.evidence?.length ? ` · ${e.evidence.join(' · ')}` : ''}`,
        askKey: 'sizes-check',
        askOn: mapAsk === 'guess',
        hint: 'keep it, or pick another card size in its box',
        answers: [
          { label: 'yes', primary: true, onClick: () => void api.confirmSize(e.source.rank) },
        ],
      };
    return null;
  };

  // which drawn size gives each card size now (the menu says «now from 46»)
  const sourceOfCard = (sizeId: number, except?: number) =>
    sizes.map.entries
      .filter((x) => x.card?.sizeId === sizeId && x.source.rank !== except)
      .map(drawnName);

  const hoverOf = (id: number | null) =>
    id == null ? {} : { onMouseEnter: () => setHover(id), onMouseLeave: () => setHover(null) };

  /** A drawn size: its line, its name, the arrow, the card size it goes to, its question. */
  const mapRow = (key: string, c: LineClass | null, e: SizeMapEntry | undefined) => {
    const q = questionOf(c, e);
    const open = !!q && qOpen(key, q.askOn);
    const boxAsk =
      !!e &&
      (mapAsk === 'dupe'
        ? dupe(e.card?.sizeId)
        : mapAsk === 'none' && !showOrderBar && e.source.rank === firstUnmapped);
    const name = c ? c.sizeLabel || '(no name)' : e?.source.label || '(no name)';
    return (
      <MapRow
        key={key}
        zone={!!q?.askOn || boxAsk}
        hot={c != null && (hover === c.id || picked === c.id)}
        title={c ? rowTitle(c) : e?.evidence?.join(' · ')}
        {...hoverOf(c?.id ?? null)}
        onPick={
          c
            ? () => {
                setPicked(picked === c.id ? null : c.id);
                setToKey(false);
              }
            : undefined
        }
        left={
          <>
            <SwatchCell>
              {c && (
                <LineSwatchView
                  swatch={chains.swatches?.[c.id]}
                  widthMm={ROW_SWATCH_MM}
                  minStrokeMm={0.35}
                  fallbackDash={motifOf(c.id)}
                  title={`size ${name} as drawn on the sheet`}
                />
              )}
            </SwatchCell>
            <span className='flex min-w-0 flex-col'>
              <span className='min-w-0 truncate'>{name}</span>
              {c &&
                (() => {
                  const note = outlineNote(c.id);
                  return note ? (
                    <span className='min-w-0 truncate text-warning' title={note.title}>
                      {note.text}
                    </span>
                  ) : null;
                })()}
            </span>
          </>
        }
        linked={e?.card ? true : assumedOf(e) ? 'guess' : false}
        right={
          e ? (
            <CardSizeBox
              e={e}
              assumed={assumedOf(e)}
              cards={cards}
              invalid={dupe(e.card?.sizeId)}
              askOn={boxAsk}
              busy={!!session.busy}
              takenBy={(sizeId) => sourceOfCard(sizeId, e.source.rank)}
              onPick={(sizeId) => setCard(e, sizeId)}
              onRename={c ? (v) => rename(c, v) : undefined}
              renameFrom={c?.sizeLabel ?? ''}
              onMore={
                c
                  ? () => {
                      setPicked(c.id);
                      setToKey(false);
                    }
                  : undefined
              }
            />
          ) : (
            <span className='text-labelColor'>not in the size list</span>
          )
        }
        q={q}
        open={open}
        onToggleQ={() => q && toggleQ(key, q.askOn)}
      />
    );
  };

  /** A line that is not a size: its sample, what it is (a select), its question. */
  const otherRow = (c: LineClass) => {
    const key = `o${c.id}`;
    const q = questionOf(c, undefined);
    return (
      <MapRow
        key={key}
        zone={!!q?.askOn}
        hot={hover === c.id || picked === c.id}
        title={rowTitle(c)}
        {...hoverOf(c.id)}
        onPick={() => {
          setPicked(picked === c.id ? null : c.id);
          setToKey(false);
        }}
        left={
          <SwatchCell>
            <LineSwatchView
              swatch={chains.swatches?.[c.id]}
              widthMm={ROW_SWATCH_MM}
              minStrokeMm={0.35}
              fallbackDash={motifOf(c.id)}
              title={`${ROLE_WORD[c.role] ?? c.role} as drawn on the sheet`}
            />
          </SwatchCell>
        }
        linked={null}
        right={
          <NativeSelect
            value={c.role}
            onChange={(v) => setRole(c, v)}
            options={ROLES}
            aria-label={`what this line is (line ${c.id})`}
            className='h-7 w-full max-w-[136px]'
          />
        }
        q={q}
        open={!!q && qOpen(key, q.askOn)}
        onToggleQ={() => q && toggleQ(key, q.askOn)}
      />
    );
  };

  return (
    <SplitStage
      sideWidth={440}
      canvas={
        <Panel
          title='lines'
          aside={
            flagged ? (
              <Chip quiet selected onClick={() => setFlag(null)} title='stop lighting this flag'>
                {FLAG[flagged.kind] ?? flagged.kind} ✕
              </Chip>
            ) : undefined
          }
          bodyClassName='p-0'
        >
          <SheetViewport bbox={session.sheet.sheet.bbox} focus={focusBox}>
            {({ unit }) => (
              <>
                <g fill='none' pointerEvents='none'>
                  {chains.chainPreview.map((a, i) =>
                    a.length < 4 || lit?.has(i) ? null : (
                      <polyline
                        key={i}
                        points={f32Attr(a)}
                        stroke={lit ? '#dddddd' : SHEET_INK.mut}
                        strokeWidth={unit * 0.8}
                      />
                    ),
                  )}
                  {/* the lit size on top: blue and thicker for a row, ink for a flag */}
                  {lit &&
                    chains.chainPreview.map((a, i) =>
                      a.length < 4 || !lit.has(i) ? null : (
                        <polyline
                          key={`hot-${i}`}
                          points={f32Attr(a)}
                          stroke={hotRow != null ? SHEET_INK.blue : SHEET_INK.ink}
                          strokeWidth={unit * (hotRow != null ? 2.4 : 1.6)}
                        />
                      ),
                    )}
                </g>
                {flagged?.at && (
                  <circle
                    cx={flagged.at.x}
                    cy={vy(flagged.at.y)}
                    r={unit * 12}
                    fill='none'
                    stroke={SHEET_INK.blue}
                    strokeWidth={unit * 1.6}
                    pointerEvents='none'
                  />
                )}
                {sample && (
                  // the key's sample of the picked row and the leader to its label
                  <g pointerEvents='none'>
                    {(chains.chainPreview[sample.chain]?.length ?? 0) >= 4 && (
                      <polyline
                        points={f32Attr(chains.chainPreview[sample.chain])}
                        fill='none'
                        stroke={SHEET_INK.blue}
                        strokeWidth={unit * 2.4}
                      />
                    )}
                    <line
                      x1={sample.at.x}
                      y1={vy(sample.at.y)}
                      x2={sample.textAt.x}
                      y2={vy(sample.textAt.y)}
                      stroke={SHEET_INK.blue}
                      strokeWidth={unit}
                      strokeDasharray={`${unit * 4} ${unit * 3}`}
                    />
                    <circle
                      cx={sample.at.x}
                      cy={vy(sample.at.y)}
                      r={unit * 14}
                      fill='none'
                      stroke={SHEET_INK.blue}
                      strokeWidth={unit * 1.6}
                    />
                  </g>
                )}
              </>
            )}
          </SheetViewport>
        </Panel>
      }
      side={
        <Panel
          title='sizes'
          aside={
            <span {...ask('sizes-flags', asking === 'offer' && !offerInRows && flags.length > 0)}>
              <HeaderWarnings items={warnings} />
            </span>
          }
          bodyClassName='p-4'
        >
          <div className='flex flex-col gap-4'>
            {card.sizes.length === 0 && (
              <Text component='p' className='text-error'>
                ! the card has no sizes yet. set them on the card first
              </Text>
            )}
            {sizes.countAsk && (
              <DrawnSizes
                ask={sizes.countAsk}
                expected={sizes.expected}
                cardCount={card.sizes.length}
                asking={asking === 'count'}
                onCommit={(n) => void api.setDrawnSizes(n)}
              />
            )}
            {legendQ && sizes.sheetLegend && (
              <div
                data-ask-zone=''
                data-ask-label='is each line one size?'
                className='flex flex-col gap-2'
              >
                <Text component='p' className='text-warning' title={legendQ}>
                  the sheets do not draw the sizes with the same lines. is each line one size on
                  every sheet?
                </Text>
                <span className='flex flex-wrap gap-2'>
                  <Act
                    primary
                    {...ask('sizes-legend', asking === 'legend')}
                    data-ask-hint='say each line is one size on every sheet'
                    disabled={!!session.busy}
                    title={legendQ}
                    onClick={() => patchInputs({ sheetLegendOk: sizes.sheetLegend!.sig })}
                  >
                    yes, the same
                  </Act>
                </span>
              </div>
            )}

            {hoisted && (
              <div className='flex flex-col'>
                <Text component='p' className='text-labelColor'>
                  first, one line to check
                </Text>
                {otherRow(hoisted)}
              </div>
            )}

            {orderFolded && (
              <span>
                <Act
                  title={
                    rowAnswered
                      ? 'map every file size in order again: replaces the answers you gave on the rows'
                      : 'ask again which file size is the first card size'
                  }
                  onClick={() => setReorder(true)}
                >
                  {rowAnswered || currentStart == null
                    ? 'map in order again'
                    : `${cards[0].name} is ${drawnName(drawn[span >= 0 ? currentStart : 0])}${span < 0 && currentStart ? ` → ${cards[currentStart].name}` : ''} · change`}
                </Act>
              </span>
            )}
            {showOrderBar && (
              <div
                data-ask-zone=''
                data-ask-label={quiz || undefined}
                className='flex flex-col gap-2'
                {...hoverOf(quizClass != null && classIds.has(quizClass) ? quizClass : null)}
              >
                <span className='flex flex-wrap items-center gap-2'>
                  <Text component='span'>{firstWord}</Text>
                  {quizClass != null && (
                    <LineSwatchView
                      swatch={chains.swatches?.[quizClass]}
                      widthMm={QUIZ_SWATCH_MM}
                      minStrokeMm={0.35}
                      fallbackDash={motifOf(quizClass)}
                    />
                  )}
                  <Text component='span'>
                    {drawnName(drawn[0])}: is that {cards[0].name}?
                  </Text>
                </span>
                <span className='flex flex-wrap items-center gap-2'>
                  <Act
                    primary
                    disabled={!!session.busy}
                    {...ask(
                      'sizes-map',
                      mapAsk === 'none' || mapAsk === 'partial' || mapAsk === 'guess',
                    )}
                    data-ask-hint={`say yes, or pick which size is ${cards[0].name}`}
                    title={windowTitle(0)}
                    onClick={() => answerOrder(0)}
                  >
                    yes
                  </Act>
                  {slots > 1 && (
                    <Text component='span' className='ml-2 text-labelColor'>
                      {span >= 0 ? `no, ${cards[0].name} is` : 'no, it is'}
                    </Text>
                  )}
                  {Array.from({ length: slots - 1 }, (_, k) => {
                    const i = k + 1;
                    const d = span >= 0 ? drawn[i] : null;
                    const cls = d?.source.classId ?? null;
                    return (
                      <button
                        key={i}
                        type='button'
                        disabled={!!session.busy}
                        title={windowTitle(i)}
                        onClick={() => answerOrder(i)}
                        {...hoverOf(cls != null && classIds.has(cls) ? cls : null)}
                        className={cn(
                          'flex h-7 items-center gap-2 border border-borderColor bg-bgColor px-2 transition-colors hover:border-textColor',
                          FOCUS,
                          'disabled:cursor-not-allowed disabled:text-labelColor',
                        )}
                      >
                        {d && cls != null && (
                          <LineSwatchView
                            swatch={chains.swatches?.[cls]}
                            widthMm={QUIZ_SWATCH_MM}
                            minStrokeMm={0.35}
                            fallbackDash={motifOf(cls)}
                          />
                        )}
                        <span>{d ? drawnName(d) : cards[i].name}</span>
                      </button>
                    );
                  })}
                </span>
                <Text component='p' className='text-labelColor'>
                  {rowAnswered
                    ? 'the rest follow in order. this replaces the answers you gave below'
                    : span > 0
                      ? `the rest follow in order; the other ${span} are left out`
                      : 'the rest follow in order'}
                </Text>
              </div>
            )}

            <div>
              <div className='grid gap-x-2 pb-2 text-labelColor' style={MAP_GRID}>
                <span>in the file</span>
                <span />
                <span>on the card</span>
                <span />
              </div>
              <div className='divide-y divide-hairline border-t border-hairline'>
                {sizeRows.map((c) => mapRow(`c${c.id}`, c, entryOfClass(c.id)))}
                {loose.map((e) => mapRow(`r${e.source.rank}-${e.source.label}`, null, e))}
                {/* card sizes no file size goes to: the gap, said where it is */}
                {sizes.map.unmapped
                  .filter((cs) => !assumed?.some((a) => a?.sizeId === cs.sizeId))
                  .map((cs) => (
                    <MapRow
                      key={`card-${cs.sizeId}`}
                      left={
                        <>
                          <SwatchCell />
                          <span className='text-labelColor'>nothing</span>
                        </>
                      }
                      linked={false}
                      right={
                        <CardGapBox
                          name={cs.name}
                          drawn={drawn}
                          nameOf={drawnName}
                          busy={!!session.busy}
                          onPick={(e) => setCard(e, String(cs.sizeId))}
                        />
                      }
                    />
                  ))}
              </div>
            </div>

            {pickedRow && (
              <RowDetail
                row={pickedRow}
                swatch={chains.swatches?.[pickedRow.id]}
                keySwatch={sample ? chains.keySwatches?.[sample.chain] : undefined}
                others={chains.classes.filter(
                  (c) => c.role === 'size' && c.id !== pickedRow.id && !!c.sizeLabel,
                )}
                toKey={toKey}
                onToKey={() => setToKey(!toKey)}
                onRole={(v) => setRole(pickedRow, v)}
                onSplit={(by) => edit(pickedRow.id, { split: by })}
                onMerge={(label) => edit(pickedRow.id, { role: 'size', sizeLabel: label })}
              />
            )}

            {otherRows.length > 0 && (
              <Fold
                label={`${otherRows.length} other ${otherRows.length === 1 ? 'line' : 'lines'} · not sizes`}
                // the asked line is shown above the list; the fold opens only for the others

                open={otherOpen ?? (otherPending > 0 && !hoisted)}
                onOpenChange={setOtherOpen}
                ask={
                  asking === 'confirm' && otherPending > 0 && !hoisted ? 'sizes-confirm' : undefined
                }
              >
                <div className='divide-y divide-hairline'>
                  {otherRows.filter((c) => c.id !== hoisted?.id).map(otherRow)}
                </div>
              </Fold>
            )}

            <DebugFold>
              <div className='flex flex-col gap-1'>
                <Text size='micro' variant='label' component='p'>
                  run read from {sizes.run.encoding.replace('-', ' ')}
                  {sizes.run.evidence.length ? ` · ${sizes.run.evidence.join(' · ')}` : ''}
                </Text>
                <DataTable>
                  <thead>
                    <tr>
                      <th>class</th>
                      <th data-align='left'>meaning</th>
                      <th data-align='left'>label</th>
                      <th>sure</th>
                      <th data-align='left'>evidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chains.classes.map((c) => (
                      <tr key={c.id}>
                        <td>{c.id}</td>
                        <td data-align='left'>{ROLE_WORD[c.role] ?? c.role}</td>
                        <td data-align='left'>{c.sizeLabel ?? '—'}</td>
                        <td>{fmtPct(c.confidence, 0)}</td>
                        <td data-align='left'>{rowTitle(c)}</td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
                {sizes.map.entries.map((e) => (
                  <Text key={`ev-${e.source.rank}`} size='micro' variant='label' component='p'>
                    {e.source.label || `rank ${e.source.rank + 1}`} → {e.card?.name ?? '—'} ·{' '}
                    {e.origin} · {fmtPct(e.confidence ?? null, 0)}
                    {e.evidence?.length ? ` · ${e.evidence.join(' · ')}` : ''}
                  </Text>
                ))}
              </div>
            </DebugFold>
          </div>
        </Panel>
      }
    />
  );
}

/** Why a legend row waits for a confirm — the reader's reason, the number only here. */
function confirmTitle(c: LineClass): string {
  const pct = fmtPct(c.confidence, 0);
  if (c.evidence.some((x) => x.kind === 'face-graded'))
    return `${pct} sure — these lines look like other sizes, but the file name says one size; confirm to set them aside if the sheet draws only that size`;
  if (c.evidence.some((x) => x.kind === 'colour-only'))
    return `${pct} sure — set aside for its grey colour only; make it a line role if it is the cut line`;
  if (c.evidence.some((x) => x.kind === 'face-stray'))
    return `${pct} sure — these lines close no outline (strays, lettering, a watermark); set aside unless one is a piece line`;
  if (c.evidence.some((x) => x.kind === 'faces'))
    return `${pct} sure — these lines close the outlines, but only that says so; confirm they are the cut lines`;
  return `${pct} sure — recognised from a recovered motif only`;
}

/**
 * H1 / D1: how many sizes the sheet draws, when the file itself does not say. Required: the step
 * does not continue until it is answered — unless two or more independent evidences of the sheet
 * agree on it (A6: a size named in text, the nesting of the outlines, one file per size): then it
 * is pre-answered (AUTO) and the block shrinks to one quiet line, a click on it reopens the
 * answers. Quick answers, one click each: the sheet's evidence, what the lines show (suggested,
 * not chosen), the card's size count, then any number. The fill ranks each piece into that many
 * sizes and holds back (never guesses) a piece it cannot rank. Clearing the field takes the
 * answer back.
 */
function DrawnSizes({
  ask: countAsk,
  expected,
  cardCount,
  asking,
  onCommit,
}: {
  ask: SizeCountAsk;
  expected: ExpectedSizes | null;
  cardCount: number;
  asking: boolean;
  onCommit: (n: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const answer = expected?.from === 'operator' ? expected.n : null;
  const auto = countAsk.auto;
  const autoOn = expected?.from === 'inferred' && auto?.applied ? expected.n : null;
  // the sheet's evidences agree but the operator took the count back: a quick answer like the rest
  const autoQuick = autoOn == null && auto?.n != null ? auto.n : null;
  const inferred = autoOn == null && countAsk.inferred?.n !== autoQuick ? countAsk.inferred : null;
  const card =
    cardCount > 0 && cardCount !== inferred?.n && cardCount !== autoQuick ? cardCount : null;
  const why = [
    ...(auto?.evidence ?? []).map((e) => `${e.detail}${e.counts ? '' : ' (not counted)'}`),
    ...(auto?.blocked ? [auto.blocked] : []),
  ].join(' · ');
  const set = answer ?? autoOn;
  const commit = (n: number | null) => {
    setOpen(false);
    onCommit(n);
  };

  // answered (by the operator, or read off the sheet): one quiet line, the answers one click away
  if (set != null && !open)
    return (
      <div className='mb-2'>
        <Chip
          quiet
          className='px-0'
          title={
            autoOn != null
              ? `read off the sheet: ${why} — click to change`
              : `set by you — a piece that cannot be ranked into ${set} sizes is held back, not guessed. click to change`
          }
          onClick={() => setOpen(true)}
        >
          {set === 1 ? '1 size drawn' : `${set} sizes drawn`}
          {autoOn != null ? ' · auto' : ''}
        </Chip>
      </div>
    );

  const unanswered = asking && set == null;
  return (
    <div
      data-ask-zone=''
      data-ask-label='how many sizes are drawn?'
      className='mb-3 flex flex-col gap-1'
    >
      <Text size='micro' variant='label' tracking='label' component='span' className='uppercase'>
        sizes drawn
      </Text>
      <span className='flex flex-wrap items-center gap-1.5'>
        {autoOn != null && auto && (
          <Chip
            selected
            pressed
            className='h-[22px]'
            title={`read off the sheet: ${why} — click to take it back and answer yourself`}
            onClick={() => commit(0)}
          >
            {autoOn} · AUTO · {evidenceKinds(auto.evidence)}
          </Chip>
        )}
        {autoQuick != null && auto && (
          <Chip
            selected={answer === autoQuick}
            pressed={answer === autoQuick}
            className='h-[22px]'
            {...ask('sizes-count', unanswered)}
            data-ask-hint='pick how many sizes are drawn'
            title={`the sheet says so: ${why}`}
            onClick={() => (answer !== autoQuick ? commit(autoQuick) : setOpen(false))}
          >
            {autoQuick} · {evidenceKinds(auto.evidence)}
          </Chip>
        )}
        {inferred && (
          <Chip
            tone={answer === inferred.n ? 'default' : 'attention'}
            selected={answer === inferred.n}
            pressed={answer === inferred.n}
            className='h-[22px]'
            {...ask('sizes-count', unanswered)}
            data-ask-hint='pick how many sizes are drawn'
            title={`suggested: ${inferred.why}`}
            onClick={() => (answer !== inferred.n ? commit(inferred.n) : setOpen(false))}
          >
            {inferred.n} · from the lines
          </Chip>
        )}
        {card != null && (
          <Chip
            selected={answer === card}
            pressed={answer === card}
            className='h-[22px]'
            title="the card's size range — the sheet may draw fewer"
            onClick={() => (answer !== card ? commit(card) : setOpen(false))}
          >
            {card} (card)
          </Chip>
        )}
        <Input
          type='number'
          min={1}
          max={30}
          step={1}
          inputMode='numeric'
          key={answer ?? 'none'}
          defaultValue={answer ?? ''}
          placeholder={autoOn != null ? String(autoOn) : 'n'}
          aria-label='sizes drawn on this sheet'
          aria-invalid={(answer == null && autoOn == null) || undefined}
          {...ask('sizes-count', unanswered)}
          data-ask-hint='count the outlines of one piece'
          title={
            answer == null && autoOn == null
              ? `the file does not say how many sizes it draws — count the outlines of one piece${auto?.evidence.length && auto.n == null ? ` (read off the sheet, not enough to set it: ${why})` : ''}`
              : undefined
          }
          className='h-[22px] w-16 tabular-nums'
          onBlur={(ev: React.FocusEvent<HTMLInputElement>) => {
            const raw = ev.currentTarget.value.trim();
            const n = raw === '' ? null : Math.round(Number(raw));
            if (n !== null && (!Number.isFinite(n) || n < 1 || n > 30)) {
              ev.currentTarget.value = answer != null ? String(answer) : '';
              return;
            }
            if (n !== answer) commit(n);
          }}
          onKeyDown={(ev: React.KeyboardEvent<HTMLInputElement>) => {
            if (ev.key === 'Enter') ev.currentTarget.blur();
          }}
        />
      </span>
    </div>
  );
}

const isGuess = (e: SizeMapEntry) => guessedSizes([e]).length > 0;

type KeySample = Extract<ClassEvidence, { kind: 'legend-sample' }>;

/** The key sample a row was named by (MOOD-F1), if the drawing's own key named it. */
function keySampleOf(c: LineClass): KeySample | null {
  for (const e of c.evidence) if (e.kind === 'legend-sample') return e;
  return null;
}

/** Where the row's identity comes from, in one line: the key sample and the second evidence. */
function identityLine(c: LineClass): string {
  const k = keySampleOf(c);
  if (!k) return '';
  if (!k.score) return 'key read · no line like it';
  if (k.nestingOnly) return `key ${k.score.toFixed(2)} · nesting only`;
  return `key ${k.score.toFixed(2)}${k.second >= 0.5 ? ' · 2nd ✓' : ''}`;
}

/**
 * The clicked row (MOOD-F1): its look on the sheet against its sample in the key — and the
 * answers a wrong row needs: what it means, split it (two sizes drawn alike went into one row) or
 * merge it into another. A weak identity says so; a good one is a diagnostic.
 * Controls in one line share one size (22 px tall, w-28).
 */
function RowDetail({
  row,
  swatch,
  keySwatch,
  others,
  toKey,
  onToKey,
  onRole,
  onSplit,
  onMerge,
}: {
  row: LineClass;
  swatch: LineSwatch | undefined;
  keySwatch: LineSwatch | undefined;
  others: LineClass[];
  toKey: boolean;
  onToKey: () => void;
  onRole: (v: string) => void;
  onSplit: (by: 'look' | 'nesting') => void;
  onMerge: (label: string) => void;
}) {
  const k = keySampleOf(row);
  const term = (t: string) => (
    <dt>
      <Text size='micro' variant='label' component='span'>
        {t}
      </Text>
    </dt>
  );
  return (
    <div className='mt-2 border-t border-hairline pt-2'>
      <dl className='grid grid-cols-[64px_1fr] items-center gap-x-2 gap-y-1.5'>
        {term('sheet')}
        <dd className='flex min-w-0 items-center gap-2 overflow-hidden'>
          <LineSwatchView
            swatch={swatch}
            widthMm={DETAIL_MM}
            title='the row as drawn on the sheet, 1:1'
          />
        </dd>
        {term('key')}
        <dd className='flex min-w-0 flex-wrap items-center gap-1.5'>
          {k ? (
            <>
              <LineSwatchView swatch={keySwatch} widthMm={DETAIL_MM} title='the key sample, 1:1' />
              <Text size='micro' component='span'>
                “{k.label}”
              </Text>
              <Chip
                quiet
                selected={toKey}
                pressed={toKey}
                onClick={onToKey}
                title={`zoom the sheet to the key sample and its label (${k.distanceMm} mm apart)`}
              >
                {toKey ? 'shown' : 'show in key'}
              </Chip>
              {!k.score ? (
                <Pill
                  tone='attention'
                  title='no line of the sheet is drawn like this sample: the lines this row holds were ranked by nesting'
                >
                  ! no line like it
                </Pill>
              ) : k.nestingOnly ? (
                <Pill
                  tone='attention'
                  title={`drawn like ${k.alike.join(', ')} in the key: only the nesting tells them apart`}
                >
                  ! nesting only
                </Pill>
              ) : null}
            </>
          ) : (
            <Text size='micro' variant='label' component='span'>
              —
            </Text>
          )}
        </dd>
        {row.role === 'size' && (
          <>
            {term('meaning')}
            <dd>
              <NativeSelect
                value={row.role}
                onChange={onRole}
                options={ROLES}
                aria-label={`meaning of line class ${row.id}`}
                className='w-28'
              />
            </dd>
            {term('fix')}
            <dd className='flex min-w-0 flex-wrap items-center gap-1.5'>
              <Chip
                className='h-[22px] w-28 justify-center'
                onClick={() => onSplit('look')}
                title='two looks went into this row: give the lines of the second look a row of their own'
              >
                split by look
              </Chip>
              <Chip
                className='h-[22px] w-28 justify-center'
                onClick={() => onSplit('nesting')}
                title='two sizes drawn alike went into this row: split its lines by the sizes they run between'
              >
                split by nesting
              </Chip>
              <NativeSelect
                value=''
                onChange={(v) => v && onMerge(v)}
                aria-label={`merge row ${row.sizeLabel ?? row.id} into another size`}
                className='w-28'
                options={[
                  { value: '', label: 'merge into…' },
                  ...others.map((o) => ({ value: o.sizeLabel!, label: `size ${o.sizeLabel}` })),
                ]}
              />
            </dd>
          </>
        )}
      </dl>
      <DebugFold label='identity'>
        <Text size='micro' variant='label' component='p'>
          {row.chains.length} lines · {(row.totalLengthMm / 1000).toFixed(1)} m ·{' '}
          {k
            ? `key sample ${k.score.toFixed(2)} · ${k.distanceMm} mm from its label · ${
                k.second >= 0.5 ? `2nd evidence ${fmtPct(k.second, 0)}` : 'no 2nd evidence'
              }${k.alike.length ? ` · key drawn like ${k.alike.join(', ')}` : ''}`
            : `${fmtPct(row.confidence, 0)} sure · ${row.evidence.map((e) => e.kind).join(', ') || '—'}`}
        </Text>
      </DebugFold>
    </div>
  );
}

/** How many piece outlines (closed, ≥ 200 mm round) a size's lines draw. */
function outlineCount(chains: NonNullable<ImportSessionApi['session']['chains']>, classId: number) {
  const c = chains.classes.find((x) => x.id === classId);
  let n = 0;
  for (const id of c?.chains ?? []) {
    const a = chains.chainPreview[id];
    if (!a || a.length < 8) continue;
    const k = a.length;
    if (Math.hypot(a[0] - a[k - 2], a[1] - a[k - 1]) > 2) continue;
    let len = 0;
    for (let i = 0; i + 3 < k; i += 2) len += Math.hypot(a[i + 2] - a[i], a[i + 3] - a[i + 1]);
    if (len >= 200) n++;
  }
  return n;
}

/**
 * The biggest closed outline a size's lines draw, mm² (shoelace over the chain previews; a chain
 * is closed when its ends meet within 2 mm). 0 = none closed: the geometry cannot order it.
 */
function outlineArea(chains: NonNullable<ImportSessionApi['session']['chains']>, classId: number) {
  const c = chains.classes.find((x) => x.id === classId);
  let best = 0;
  for (const id of c?.chains ?? []) {
    const a = chains.chainPreview[id];
    if (!a || a.length < 8) continue;
    const n = a.length;
    if (Math.hypot(a[0] - a[n - 2], a[1] - a[n - 1]) > 2) continue;
    let sh = 0;
    for (let k = 0; k + 3 < n; k += 2) sh += a[k] * a[k + 3] - a[k + 2] * a[k + 1];
    best = Math.max(best, Math.abs(sh) / 2);
  }
  return best;
}

/** The operator's size map noted before a rename: card size per size name, and the read it was on. */
type KeptMap = { at: unknown; entries: { name: string; card: SizeMapEntry['card'] }[] };
const norm = (label: string | null | undefined) => (label ?? '').trim().toLowerCase();

// ═══ THE MAPPING ROW ══════════════════════════════════════════════════════════════════════════════

/** A row's open question and its answers (the old `check` / `! confirm` markers, said in words). */
type RowAsk = {
  text: string;
  title: string;
  /** `data-ask` key, live while `askOn`: on `?` while folded, on the first answer while open. */
  askKey: string;
  askOn: boolean;
  hint: string;
  answers: { label: string; onClick: () => void; primary?: boolean; title?: string }[];
};

/** The mapping's four columns: the file · the arrow · the card · the row's `?`. */
const MAP_GRID: React.CSSProperties = {
  gridTemplateColumns: 'minmax(0,1.4fr) 36px minmax(0,1fr) 28px',
};

const FOCUS =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor';

/** A plain answer button, 12px like the rest of the step; `primary` = the answer that is asked. */
function Act({
  primary,
  className,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  primary?: boolean;
  [k: `data-${string}`]: string | undefined;
}) {
  return (
    <button
      type='button'
      {...rest}
      className={cn(
        'inline-flex h-7 items-center border bg-bgColor px-2.5 whitespace-nowrap transition-colors',
        FOCUS,
        primary
          ? 'border-warning text-warning hover:bg-warning hover:text-bgColor'
          : 'border-borderColor hover:border-textColor',
        'disabled:cursor-not-allowed disabled:border-borderColor disabled:bg-bgColor disabled:text-labelColor',
        className,
      )}
    >
      {children}
    </button>
  );
}

/** The fixed slot the line sample sits in, so the size names line up under one another. */
function SwatchCell({ children }: { children?: React.ReactNode }) {
  return (
    <span className='flex h-6 w-[60px] shrink-0 items-center overflow-hidden'>{children}</span>
  );
}

/**
 * The arrow between the two columns: ink when the size goes somewhere, dashed grey when not,
 * dashed blue for the assumption the question asks about.
 */
function Connector({ on }: { on: boolean | 'guess' }) {
  const c =
    on === 'guess'
      ? 'var(--color-warning)'
      : on
        ? 'var(--color-textColor)'
        : 'var(--color-borderColor)';
  return (
    <svg width={36} height={10} viewBox='0 0 36 10' aria-hidden className='block'>
      <line
        x1={1}
        y1={5}
        x2={30}
        y2={5}
        stroke={c}
        strokeWidth={1}
        strokeDasharray={on === true ? undefined : '3 3'}
      />
      <path d='M29 1.5 L34 5 L29 8.5' fill='none' stroke={c} strokeWidth={1} />
    </svg>
  );
}

/**
 * One line of the mapping: left (the file), the arrow, right (the card), and the row's `?`. The
 * question opens under the row, in the row. Hovering lights the size's lines on the sheet.
 */
function MapRow({
  left,
  right,
  linked,
  q,
  open,
  onToggleQ,
  zone,
  hot,
  title,
  onPick,
  onMouseEnter,
  onMouseLeave,
}: {
  left: React.ReactNode;
  right: React.ReactNode;
  /** null: no arrow (a line that is not a size). */
  linked: boolean | 'guess' | null;
  q?: RowAsk | null;
  open?: boolean;
  onToggleQ?: () => void;
  zone?: boolean;
  hot?: boolean;
  title?: string;
  onPick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  return (
    <div
      {...(zone ? { 'data-ask-zone': '', 'data-ask-label': q?.askOn ? q.text : undefined } : {})}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={cn('transition-colors', hot && 'bg-bgZebra', onPick && 'cursor-pointer')}
      onClick={(ev) => {
        // the row's own controls answer; a click elsewhere on it pins its lines and opens its detail
        if (!onPick || (ev.target as HTMLElement).closest('button,select,input,a')) return;
        onPick();
      }}
    >
      <div className='grid min-h-12 items-center gap-x-2 py-1.5' style={MAP_GRID}>
        <span className='flex min-w-0 items-center gap-2' title={title}>
          {left}
        </span>
        <span className='flex justify-center'>{linked != null && <Connector on={linked} />}</span>
        <span className='min-w-0'>{right}</span>
        <span className='flex justify-end'>
          {q && (
            <button
              type='button'
              aria-expanded={!!open}
              aria-label={q.text}
              title={q.title}
              {...(!open ? ask(q.askKey, q.askOn, q.hint) : {})}
              onClick={onToggleQ}
              className={cn(
                'flex size-7 items-center justify-center border transition-colors',
                FOCUS,
                open
                  ? 'border-warning bg-warning text-bgColor'
                  : 'border-warning bg-bgColor text-warning hover:bg-warning hover:text-bgColor',
              )}
            >
              ?
            </button>
          )}
        </span>
      </div>
      {q && open && (
        <div className='flex flex-col gap-2 pb-3 pl-[68px]'>
          <Text component='p' className='text-warning' title={q.title}>
            {q.text}
          </Text>
          <span className='flex flex-wrap gap-2'>
            {q.answers.map((a, i) => (
              <Act
                key={a.label}
                primary={a.primary}
                title={a.title ?? q.title}
                {...(i === 0 ? ask(q.askKey, q.askOn, q.hint) : {})}
                onClick={a.onClick}
              >
                {a.label}
              </Act>
            ))}
          </span>
        </div>
      )}
    </div>
  );
}

/** The box a card size sits in: solid ink when set, dashed grey when nothing goes there. */
const boxCls = (filled: boolean, invalid: boolean, guess = false) =>
  cn(
    'flex h-8 w-full max-w-[136px] items-center justify-between gap-2 border bg-bgColor px-2.5 text-left transition-colors',
    FOCUS,
    invalid
      ? 'border-error text-error'
      : guess
        ? 'border-dashed border-warning text-warning hover:border-solid'
        : filled
          ? 'border-textColor hover:bg-bgZebra'
          : 'border-dashed border-borderColor text-labelColor hover:border-textColor hover:text-textColor',
  );

const Caret = () => (
  <svg width={8} height={5} viewBox='0 0 8 5' aria-hidden className='shrink-0'>
    <path d='M0 0h8L4 5z' fill='currentColor' />
  </svg>
);

function MenuItem({
  onSelect,
  checked,
  aside,
  children,
}: {
  onSelect: () => void;
  checked?: boolean;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type='button'
      role='menuitemradio'
      aria-checked={!!checked}
      onClick={onSelect}
      className={cn(
        'flex h-8 w-full items-center gap-2 px-1.5 text-left hover:bg-bgZebra',
        FOCUS,
        'focus-visible:outline-offset-[-2px]',
      )}
    >
      <span className='w-3 shrink-0'>{checked ? '✓' : ''}</span>
      <span className='min-w-0 flex-1 truncate'>{children}</span>
      {aside && <span className='shrink-0 text-labelColor'>{aside}</span>}
    </button>
  );
}

/**
 * The card size of one file size. One click opens the card sizes, `leave out`, and — for a drawn
 * line — `rename…` (typing another size's name joins the two) and the line's detail.
 */
function CardSizeBox({
  e,
  assumed,
  cards,
  invalid,
  askOn,
  busy,
  takenBy,
  onPick,
  onRename,
  renameFrom,
  onMore,
}: {
  e: SizeMapEntry;
  /** The card size the open question assumes for this row (shown dashed blue until answered). */
  assumed?: CardSize | null;
  cards: CardContext['sizes'];
  invalid: boolean;
  askOn: boolean;
  busy: boolean;
  takenBy: (sizeId: number) => string[];
  onPick: (sizeId: string) => void;
  onRename?: (v: string) => void;
  renameFrom: string;
  onMore?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const guess = !e.card && !e.notDrawn && !!assumed;
  const label = e.card
    ? e.card.name
    : e.notDrawn
      ? 'not drawn'
      : assumed
        ? `${assumed.name}?`
        : 'leave out';
  const askAttrs: Record<string, string> = askOn
    ? (ask(
        'sizes-map',
        true,
        invalid ? 'pick another card size' : 'pick a card size or leave out',
      ) as Record<string, string>)
    : {};
  const pick = (v: string) => {
    setOpen(false);
    onPick(v);
  };
  return (
    <GenericPopover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setRenaming(false);
      }}
      className='w-[232px]'
      triggerProps={{
        className: boxCls(!!e.card, invalid, guess),
        disabled: busy,
        'aria-label': `card size for file size ${e.source.label || e.source.rank + 1}: ${label}`,
        'aria-invalid': invalid || undefined,
        title: guess
          ? `our guess from the sizes of the pieces: answer the question above, or pick here`
          : e.evidence?.join(' · '),
        ...(!e.card && !e.notDrawn ? { 'data-unmapped': '' } : {}),
        ...askAttrs,
      }}
      openElement={
        <>
          <span className='min-w-0 truncate'>{label}</span>
          <Caret />
        </>
      }
    >
      {renaming && onRename ? (
        <div className='flex flex-col gap-2 py-1'>
          <Input
            autoFocus
            defaultValue={renameFrom}
            onFocus={(ev: React.FocusEvent<HTMLInputElement>) => ev.currentTarget.select()}
            aria-label='size name'
            className='h-7'
            onKeyDown={(ev: React.KeyboardEvent<HTMLInputElement>) => {
              if (ev.key === 'Enter') {
                const v = ev.currentTarget.value.trim();
                if (v !== renameFrom) onRename(v);
                setOpen(false);
                setRenaming(false);
              }
              if (ev.key === 'Escape') setRenaming(false);
            }}
          />
          <Text component='p' className='text-labelColor'>
            enter to save. the name of another size joins the two
          </Text>
        </div>
      ) : (
        <div role='menu' className='flex flex-col'>
          {cards.map((c) => {
            const from = takenBy(c.sizeId);
            return (
              <MenuItem
                key={c.sizeId}
                checked={e.card?.sizeId === c.sizeId}
                aside={from.length ? `from ${from.join(', ')}` : undefined}
                onSelect={() => pick(String(c.sizeId))}
              >
                {c.name}
              </MenuItem>
            );
          })}
          <MenuItem checked={!e.card} onSelect={() => pick('')}>
            leave out
          </MenuItem>
          {(onRename || onMore) && <span className='my-1 border-t border-hairline' />}
          {onRename && <MenuItem onSelect={() => setRenaming(true)}>rename…</MenuItem>}
          {onMore && (
            <MenuItem
              onSelect={() => {
                setOpen(false);
                onMore();
              }}
            >
              more about this line
            </MenuItem>
          )}
        </div>
      )}
    </GenericPopover>
  );
}

/** A card size nothing goes to: its dashed box; a click lists the file sizes to give it. */
function CardGapBox({
  name,
  drawn,
  nameOf,
  busy,
  onPick,
}: {
  name: string;
  drawn: SizeMapEntry[];
  nameOf: (e: SizeMapEntry) => string;
  busy: boolean;
  onPick: (e: SizeMapEntry) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <GenericPopover
      open={open}
      onOpenChange={setOpen}
      className='w-[232px]'
      triggerProps={{
        className: boxCls(false, false),
        disabled: busy,
        'aria-label': `card size ${name}: no file size goes to it`,
        title: `no file size goes to ${name}: pick one`,
      }}
      openElement={
        <>
          <span className='min-w-0 truncate'>{name}</span>
          <Caret />
        </>
      }
    >
      <div role='menu' className='flex flex-col'>
        <Text component='p' className='px-1.5 pb-1 text-labelColor'>
          which file size is {name}?
        </Text>
        {drawn.map((e) => (
          <MenuItem
            key={e.source.rank}
            aside={e.card ? `now ${e.card.name}` : undefined}
            onSelect={() => {
              setOpen(false);
              onPick(e);
            }}
          >
            {nameOf(e)}
          </MenuItem>
        ))}
      </div>
    </GenericPopover>
  );
}
