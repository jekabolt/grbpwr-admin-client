// THE STEP'S SEAM PICKER v3 «step result» (owner OK 31.10). The canvas is the operation's shared
// result layout: every piece of every input, earlier sewn blocks kept rigid, and the owner's rows
// applied with no crop or automatic turn. The owner's own pick is blue, a stored seam ink bold with
// its number; there is no second RESULT picture.
// Clicking edges collects the sides (with two or more inputs the side is the input's, with one it is
// the piece click order); nothing is picked for the owner — «guess» only fills both sides from the
// proposal, in plain sight. Nothing is stored until «accept» (or Enter), live only with both sides
// picked: then the pair becomes ONE card seam (composite when a side holds several runs, surface when
// one side is an inner line), its key goes onto the step after the ones already there, and the
// picker closes. The same canvas moves any rigid input block by hand: a press on an edge picks or
// spans it, a drag from inside a piece past a dead zone moves its block (snap is optional; ⟲ ⟳ ⇋,
// upright, layer choice and reset stay pending). One ACCEPT stores the moves and the pair; a move is
// stored by nothing else, and it leaves the pick as it was.

import * as Dialog from '@radix-ui/react-dialog';
import { activeFoldRows } from 'lib/folds';
import { resolveEdge } from 'lib/assembly-skeleton/union';
import { anchorOfRunId, type EdgeAnchor, type SidePart, type StoredSeam } from 'lib/seams';
import { cn } from 'lib/utility';
import { useCallback, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Button, Chip, ChipRow, Close, ConfirmationModal, Placeholder, Text } from 'ui';
import { runsOfSide } from '../assembly-seams/seam-actions';
import { useSeamsStore } from '../assembly-seams/seams-store';
import { useFoldRows } from '../assembly-folds/folds-store';
import { useOperationWorkCatalog } from '../useOperationWorkCatalog';
import { PairNo } from './pair-no';
import { recordSeamDecision } from './seam-decisions';
import { isGuess, pickTarget, seamSideName, sideForClick } from './seam-focus';
import { usePictureZoom } from './picture-zoom';
import {
  edgeBreaks,
  NO_SPANS,
  pickFreeSpan,
  pickSegment,
  repeatsStoredSeam,
  segmentAt,
  sideParts,
  snapToBreak,
  storedSeamAt,
  type SidePick,
  type SpanRange,
} from './span-pick';
import { snapAtDuringDrag } from './pose-picking';
import { PoseOverlay } from './pose-overlay';
import { useStepResults } from './step-result-context';
import { useAttachStepPose, useAttachStepSeam, useStepSeamActions } from './step-seams-context';
import { stepWords } from './step-words';
import {
  deltaMm,
  fmtMm,
  innerId,
  longestEdge,
  parseInner,
  pieceOfTarget,
  surfaceRow,
  type Pt,
  type TargetId,
  targetsLen,
} from './step-seams-model';
import type { SeamSides } from './step-picture';
import {
  isUnitStep,
  StepPictureSvg,
  useBoxSize,
  useStepScene,
  type EdgeMark,
  type EdgeTick,
  type NoMark,
} from './step-picture-view';
import { foldedDrawing, foldedFitSides, withFoldPartners } from './step-folds';
import { edgeRowFromPick, initialPickerPick, orderedPickSides } from './step-rows';
import { fitSourceOf } from './step-pose';
import { stepPictureOf } from './surface-picture';
import { useMirrorStep } from './use-mirror-step';
import { usePoseEdit } from './use-pose-edit';

type Side = 'a' | 'b';
type Sel = SidePick;
const EMPTY: Sel = { a: [], b: [], spans: NO_SPANS };
const wholeSel = (sides: { a: readonly TargetId[]; b: readonly TargetId[] }): Sel => ({
  a: [...sides.a],
  b: [...sides.b],
  spans: NO_SPANS,
});
type SpanHover = { id: TargetId; range: SpanRange };

const sameSel = (x: Sel, y: Sel) =>
  !Object.keys(x.spans.a).length &&
  !Object.keys(x.spans.b).length &&
  x.a.length === y.a.length &&
  x.b.length === y.b.length &&
  x.a.every((id) => y.a.includes(id)) &&
  x.b.every((id) => y.b.includes(id));

const polyLen = (pts: readonly Pt[]) =>
  pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : s), 0);
const mmText = (v: number) => `${fmtMm(v)} mm`;

export default function SeamPicker({
  index,
  open,
  onClose,
  proposal: initialProposal = 0,
  preselectProposal = false,
}: {
  index: number;
  open: boolean;
  onClose: () => void;
  /** Which of the step's proposals the picker opens on. */
  proposal?: number;
  /** A suggestion tile opens with that proposal already selected. */
  preselectProposal?: boolean;
}) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className='fixed inset-0 z-[var(--z-modal)] bg-overlay' />
        <SeamPickerBody
          index={index}
          proposal={initialProposal}
          preselectProposal={preselectProposal}
          mode='dialog'
          onClose={onClose}
        />
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function SeamPickerBody({
  index,
  proposal: initialProposal = 0,
  preselectProposal = false,
  mode = 'inline',
  onClose,
  onAccepted,
  footerActions,
  readOnly = false,
  walk = false,
}: {
  index: number;
  /** Which of the step's proposals is selected first. */
  proposal?: number;
  /** Whether the picker was opened from that suggestion tile. */
  preselectProposal?: boolean;
  mode?: 'dialog' | 'inline';
  onClose?: () => void;
  onAccepted?: () => void;
  footerActions?: ReactNode;
  readOnly?: boolean;
  /** Inside the seam walk: the window names the op, the canvas fills it, ACCEPT reads back SAVED. */
  walk?: boolean;
}) {
  const scene = useStepScene(index);
  const stepResults = useStepResults();
  const stepPicture = stepPictureOf(stepResults, index);
  const stepFolds = stepPicture?.layout.folds;
  const stepResult = stepResults?.[index];
  const {
    ops,
    op,
    geo,
    geoms,
    byKey,
    innerLines,
    groups,
    ease,
    stored,
    suggestions,
    surfaceSuggestion,
    pieceName: nameOf,
  } = scene;
  const frozen = (scene.ctx?.frozen ?? true) || readOnly;
  const cardId = scene.ctx?.cardId;
  const attach = useAttachStepSeam(index);
  const attachPose = useAttachStepPose(index);
  const seamActions = useStepSeamActions(index);
  const errors = useSeamsStore((s) => s.errors);
  const foldRows = useFoldRows();
  const { catalog: workCatalog } = useOperationWorkCatalog();

  const suggestion = suggestions[initialProposal] ?? suggestions[0] ?? null;
  const unitStep = isUnitStep(groups);
  const initialPick = initialPickerPick(suggestion, preselectProposal, unitStep);
  const [sel, setSel] = useState<Sel>(() => (initialPick ? wholeSel(initialPick) : EMPTY));
  const [hover, setHover] = useState<SpanHover | null>(null);
  const [spanDrag, setSpanDrag] = useState<SpanHover | null>(null);
  const [activeSeam, setActiveSeam] = useState<string | null>(null);
  const [clearingSeams, setClearingSeams] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState('');
  const [replaceMirrorOpen, setReplaceMirrorOpen] = useState(false);
  // A tile preloads its proposal; GUESS does the same from the manual + seam entry.
  const [filled, setFilled] = useState<Sel | null>(() =>
    initialPick ? wholeSel(initialPick) : null,
  );
  // FIT and the corner snap work on what is in hand: the spans, not the whole edges.
  // With nothing in hand it works on the seam shown: the selected one, or the step's only one.
  const shownSeam =
    stored.find((s) => s.key === activeSeam) ??
    (stored.length === 1 && !sel.a.length && !sel.b.length ? stored[0] : undefined);
  const shownParts = shownSeam?.parts;
  const fitSource = useMemo(() => {
    const once = (sides: { a: readonly SidePart[]; b: readonly SidePart[] }) =>
      foldedFitSides(sides, stepFolds, geoms, geo?.grainDeg);
    return fitSourceOf(
      once({ a: sideParts(sel.a, sel.spans.a), b: sideParts(sel.b, sel.spans.b) }),
      shownParts && once(shownParts),
    );
  }, [sel, shownParts, stepFolds, geoms, geo?.grainDeg]);
  const [saved, setSaved] = useState(false);
  const poses = scene.poses;
  const stepRows = useMemo(
    () => (op?.seamKeys ?? []).flatMap((key) => byKey.get(key) ?? []),
    [op?.seamKeys, byKey],
  );
  const {
    posePending,
    poseSel,
    setPoseSel,
    snapOn,
    setSnapOn,
    poseDrag,
    setPoseDrag,
    poseFree,
    poseBounds,
    frameStale,
    fitFrame,
    fitReady,
    ownPoseRows,
    resultLayout,
    poseShown,
    shownPoseLayers,
    shownPoseStacked,
    onTop,
    pressOnTop,
    clearPose,
    pickupOf,
    dropPose,
    fitPose,
    transformPose,
    resetPose,
    savePose,
  } = usePoseEdit({
    poseKeys: op?.poseKeys,
    poses,
    stepPicture,
    stepResult,
    stepRows,
    geoms,
    grainDeg: geo?.grainDeg,
    busy,
    setBusy,
    setRefused,
    attach,
    attachPose,
    fitSource,
  });
  const mirror = useMirrorStep({
    index,
    step: op ?? {},
    cardOps: scene.ops,
    rows: byKey,
    poses,
    geoms,
    grainDeg: geo?.grainDeg,
  });

  const pieces = geo?.pieces;
  const activeFolds = activeFoldRows(ops, index, foldRows);
  // A stack of identical plies runs one layer long (the model's own count).
  const plainSideLen = (ids: readonly TargetId[] | readonly SidePart[]) =>
    targetsLen(ids, geoms, (piece, k) => polyLen(pieces?.get(piece)?.inner[k] ?? []));
  const sideLen = (
    ids: readonly TargetId[] | readonly SidePart[],
    otherIds: readonly TargetId[] | readonly SidePart[],
  ) =>
    targetsLen(ids, geoms, (piece, k) => polyLen(pieces?.get(piece)?.inner[k] ?? []), {
      activeFolds,
      otherSideMm: otherIds.length ? plainSideLen(otherIds) : null,
      grainDeg: geo?.grainDeg,
    });
  const pickParts = (side: Side) => sideParts(sel[side], sel.spans[side]);

  // ── what «accept» would write: only what the owner picked ──
  const pick: Sel = sel;
  const inners = [...pick.a, ...pick.b].filter((t) => parseInner(t));
  const surface = inners.length === 1;
  const hostSide: Side | null = surface ? (pick.a.includes(inners[0]) ? 'a' : 'b') : null;
  // The part laid on a line is the piece of the edges picked on the other side — never a fallback.
  const partSide = hostSide ? sel[hostSide === 'a' ? 'b' : 'a'] : [];
  const partKey = partSide.length ? pieceOfTarget(partSide[0]) : null;

  const guessSelection = useMemo<Sel | null>(() => {
    if (suggestion) return wholeSel(suggestion);
    if (!surfaceSuggestion) return null;
    const line = innerId(surfaceSuggestion.host, surfaceSuggestion.inner);
    const edge = longestEdge(geoms.get(surfaceSuggestion.part));
    const hostAt = sideForClick(surfaceSuggestion.host, groups, EMPTY, pieceOfTarget);
    const part = edge ? [edge] : [];
    return wholeSel(hostAt === 'a' ? { a: [line], b: part } : { a: part, b: [line] });
  }, [suggestion, surfaceSuggestion, geoms, groups]);

  /** The pair on the table: both sides picked by hand, edge to edge. */
  const pair: SeamSides | null =
    !inners.length && sel.a.length && sel.b.length ? { a: sel.a, b: sel.b } : null;
  const repeatsSeam = !!pair && repeatsStoredSeam(pickParts('a'), pickParts('b'), stored, geoms);
  const pickReady = !repeatsSeam && (surface ? !!partKey && pick[hostSide!].length === 1 : !!pair);
  const canAccept = !frozen && !busy && !!cardId && (pickReady || posePending);

  const anchorCtx = useMemo(
    () => ({ pieces: [...geoms.values()], grainDeg: geo?.grainDeg ?? new Map(), nameOf }),
    [geoms, geo?.grainDeg, nameOf],
  );

  const buildRow = useCallback(
    (clicked: Sel): StoredSeam | null => {
      const s = orderedPickSides(clicked, geoms);
      const ins = [...s.a, ...s.b].filter((t) => parseInner(t));
      if (ins.length === 0) {
        const ranged = Object.keys(clicked.spans.a).length || Object.keys(clicked.spans.b).length;
        return edgeRowFromPick(
          s,
          geoms,
          anchorCtx,
          ranged
            ? { a: sideParts(s.a, clicked.spans.a), b: sideParts(s.b, clicked.spans.b) }
            : undefined,
        );
      }
      const h = parseInner(ins[0]);
      const g = h ? geoms.get(h.piece) : undefined;
      const line = h ? pieces?.get(h.piece)?.inner[h.k] : undefined;
      if (!h || !g || !line || !partKey || !geo) return null;
      const hs: Side = s.a.includes(ins[0]) ? 'a' : 'b';
      const picked = s[hs === 'a' ? 'b' : 'a'];
      if (!picked.length) return null;
      const parts = runsOfSide(picked, geoms)
        .map((id) => (id ? anchorOfRunId(anchorCtx.pieces, id, geo.grainDeg) : null))
        .filter((a): a is EdgeAnchor => !!a);
      return surfaceRow(
        { geom: g, k: h.k, line, grainDeg: geo.grainDeg.get(h.piece) ?? 0 },
        parts,
        undefined,
      );
    },
    [geoms, anchorCtx, pieces, geo, partKey],
  );

  const reset = () => {
    setSel(EMPTY);
    setRefused('');
    setFilled(null);
    setActiveSeam(null);
  };

  const draftRow = useMemo(
    () => (pair || surface ? buildRow(pick) : null),
    [buildRow, pick, surface],
  );

  const mirrorLeft = async () => {
    if ((mirror.plan.kind !== 'create' && mirror.plan.kind !== 'replace') || busy) return;
    setBusy(true);
    setRefused('');
    const result = await mirror.write();
    setBusy(false);
    if (!result.ok) setRefused(result.error);
  };

  const commit = async () => {
    if (!canAccept) return;
    const row = pickReady ? draftRow : null;
    if (pickReady && !row) {
      setRefused('cannot pair');
      return;
    }
    if (posePending && !(await savePose())) return;
    // Moves alone: stored, the half-made pick stays in hand.
    if (!row) {
      setSaved(true);
      onAccepted?.();
      return;
    }
    setBusy(true);
    setRefused('');
    const ok = await attach(row);
    setBusy(false);
    if (!ok) {
      setRefused(useSeamsStore.getState().errors[row.seamKey] ?? 'not saved');
      return;
    }
    // Accepted as «guess» filled it: the proposal's acceptance; any change made it the owner's own.
    const guessed = !!filled && sameSel(filled, pick);
    recordSeamDecision({
      cardId: cardId ?? 0,
      operationNumber: op?.operationNumber ?? 0,
      action: guessed ? 'accept' : 'own',
      seamKey: ok,
      tier: guessed ? (isGuess(suggestion ?? surfaceSuggestion) ? 'guess' : 'confident') : 'none',
      shown: filled ? { a: [...filled.a], b: [...filled.b] } : null,
    });
    // One ACCEPT, one seam: the picker is done — back to the step card (the quiz moves on).
    reset();
    setSaved(true);
    onAccepted?.();
    onClose?.();
  };

  // Stable while the selection stands: the canvas keeps its hit layer across hovers (a fresh
  // closure per render re-created every hit path of the picture on each pointer event).
  const pickRules = useMemo(
    () => ({ isInner: (t: string) => !!parseInner(t), pieceOf: pieceOfTarget }),
    [],
  );
  // Two flat edges folded onto each other are one line on the canvas: what the hand does to one it
  // does to both, and the side reads as the composite row the card stores.
  const onFolded = useCallback(
    (pick: Sel, side: Side, id: TargetId) =>
      withFoldPartners(pick, side, id, stepFolds, geoms, geo?.grainDeg, pickRules),
    [stepFolds, geoms, geo?.grainDeg, pickRules],
  );
  const toggle = useCallback(
    (id: TargetId, atMm?: number) => {
      if (frozen) return;
      const side = sideForClick(pieceOfTarget(id), groups, sel, pieceOfTarget);
      setSaved(false);
      setPoseSel(null);
      const length = resolveEdge(id, geoms)?.len ?? 0;
      const picked = (side: Side) =>
        sel[side].includes(id) &&
        (atMm == null ||
          !sel.spans[side][id] ||
          (atMm >= sel.spans[side][id][0] && atMm <= sel.spans[side][id][1]));
      setRefused('');
      // A stored seam's part is that seam, not a new pick; what is in hand comes off first.
      if (!picked('a') && !picked('b')) {
        const at = storedSeamAt(stored, id, atMm, geoms);
        if (at >= 0) {
          setSel(EMPTY);
          setFilled(null);
          setActiveSeam((current) => (current === stored[at].key ? null : stored[at].key));
          return;
        }
      }
      setActiveSeam(null);
      if (atMm == null || parseInner(id) || !(length > 0)) {
        setSel(onFolded(pickTarget(sel, side, id, pickRules.isInner, pickRules.pieceOf), side, id));
        return;
      }
      const segment = segmentAt(edgeBreaks(id, geoms), length, atMm);
      setSel(onFolded(pickSegment(sel, side, id, segment, length, pickRules), side, id));
    },
    [frozen, groups, sel, geoms, stored, pickRules, setPoseSel, onFolded],
  );
  const onHoverAt = useCallback(
    (id: TargetId | null, atMm: number | null) => {
      const length = id ? resolveEdge(id, geoms)?.len ?? 0 : 0;
      const free =
        id && atMm != null && length > 0 && storedSeamAt(stored, id, atMm, geoms) < 0
          ? segmentAt(edgeBreaks(id, geoms), length, atMm)
          : null;
      setHover((current) =>
        current?.id === id && current?.range[0] === free?.[0] && current?.range[1] === free?.[1]
          ? current
          : id && free
            ? { id, range: free }
            : null,
      );
    },
    [geoms, stored],
  );
  const onSpanDrag = useCallback(
    (id: TargetId, fromMm: number, toMm: number, done: boolean) => {
      if (frozen) return;
      const breaks = edgeBreaks(id, geoms);
      const range: SpanRange = [snapToBreak(breaks, fromMm), snapToBreak(breaks, toMm)];
      if (!done) {
        setSpanDrag({ id, range });
        return;
      }
      setSpanDrag(null);
      setRefused('');
      setSaved(false);
      setPoseSel(null);
      setActiveSeam(null);
      const side = sideForClick(pieceOfTarget(id), groups, sel, pieceOfTarget);
      setSel(
        onFolded(
          pickFreeSpan(sel, side, id, range, resolveEdge(id, geoms)?.len ?? 0, pickRules),
          side,
          id,
        ),
      );
    },
    [frozen, groups, sel, geoms, pickRules, setPoseSel, onFolded],
  );

  // Edges only: no length is drawn on the canvas (the owner, №58); the footer keeps the lengths.
  // Kept until a seam is stored or the selection moves: the canvas keys its layers on these.
  const { marks, nos } = useMemo(() => {
    const marks: EdgeMark[] = [];
    const nos: NoMark[] = [];
    // A stored seam reads as a proposal does: its edges, its number on the first.
    stored.forEach((s, i) => {
      const parts = [...s.parts.a, ...s.parts.b];
      const active = s.key === activeSeam;
      parts.forEach(({ target, range }) =>
        marks.push({ id: target, tone: 'stored', ...(range ? { range } : {}), active }),
      );
      const first = s.parts.a[0] ?? s.parts.b[0];
      if (first) nos.push({ id: first.target, i, ...(first.range ? { range: first.range } : {}) });
    });
    const sideMarks = (side: Side, tone: EdgeMark['tone']) =>
      sel[side].forEach((id) => {
        const range = sel.spans[side][id];
        marks.push({ id, tone, ...(range ? { range } : {}) });
      });
    sideMarks('a', 'pickFirst');
    sideMarks('b', 'pick');
    if (spanDrag)
      marks.push({
        id: spanDrag.id,
        tone:
          sideForClick(pieceOfTarget(spanDrag.id), groups, sel, pieceOfTarget) === 'a'
            ? 'pickFirst'
            : 'pick',
        range: [
          Math.min(spanDrag.range[0], spanDrag.range[1]),
          Math.max(spanDrag.range[0], spanDrag.range[1]),
        ],
      });
    return { marks, nos };
  }, [stored, sel, activeSeam, spanDrag, groups]);
  // The break points of every edge in hand: what a segment or a drag can land on.
  const ticks = useMemo<EdgeTick[]>(() => {
    const ids = new Set([...sel.a, ...sel.b].filter((id) => !parseInner(id)));
    if (hover) ids.add(hover.id);
    if (spanDrag) ids.add(spanDrag.id);
    return [...ids].flatMap((id) =>
      edgeBreaks(id, geoms).map((point) => ({
        id,
        atMm: point.atMm,
        notch: point.kind === 'notch',
      })),
    );
  }, [sel, hover, spanDrag, geoms]);
  const groupNames = useMemo(() => groups.map((g) => g.name), [groups]);
  const canvasPickTargets = useMemo(
    () =>
      unitStep
        ? [
            ...new Set([
              ...suggestions.flatMap((candidate) => [...candidate.a, ...candidate.b]),
              ...stored.flatMap((seam) => [...seam.sides.a, ...seam.sides.b]),
              ...sel.a,
              ...sel.b,
            ]),
          ]
        : undefined,
    [unitStep, suggestions, stored, sel],
  );

  // Edge to edge on both sides (a part on its host's line has no Δ).
  const edgeToEdge = (s: { a: readonly TargetId[]; b: readonly TargetId[] }) =>
    s.a.length > 0 && s.b.length > 0 && [...s.a, ...s.b].every((id) => !parseInner(id));
  const delta = pair
    ? deltaMm(
        sideLen(pickParts('a'), pickParts('b')),
        sideLen(pickParts('b'), pickParts('a')),
        ease,
      )
    : shownSeam && edgeToEdge(shownSeam.sides)
      ? deltaMm(
          sideLen(shownSeam.parts.a, shownSeam.parts.b),
          sideLen(shownSeam.parts.b, shownSeam.parts.a),
          ease,
        )
      : null;
  const empty = !pair && !surface && stored.length === 0 && !sel.a.length && !sel.b.length;

  const [canvasEl, canvas] = useBoxSize();
  const phone = canvas.w > 0 && canvas.w < 600;
  const zoom = usePictureZoom(index, canvas.w, canvas.h, fitFrame);

  // «guess»: the proposal's two sides become the pick, shown as the owner's — nothing is saved.
  const fillGuess = () => {
    if (frozen) return;
    if (!guessSelection) return;
    const next = wholeSel(guessSelection);
    setActiveSeam(null);
    setRefused('');
    setSel(next);
    setFilled(next);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest('input, textarea')) return;
    if (!e.metaKey && !e.ctrlKey && !e.altKey && zoom.onKey(e.key)) {
      e.preventDefault();
    } else if (e.key === 'Enter' && canAccept) {
      e.preventDefault();
      void commit();
    }
  };

  const escape = () => {
    if (poseSel) {
      setPoseSel(null);
      return true;
    }
    if (posePending || poseFree) {
      clearPose();
      setSaved(false);
      return true;
    }
    if (sel.a.length || sel.b.length || activeSeam) {
      reset();
      return true;
    }
    return false;
  };

  const sideName = (ids: readonly TargetId[]) => seamSideName(ids, geoms, nameOf, pieceOfTarget);
  const seamName = (sides: { a: readonly TargetId[]; b: readonly TargetId[] }) =>
    [sideName(sides.a), sideName(sides.b)].filter(Boolean).join(' · ');
  // The footer lists a pair once: a row stored twice, or the pick of a stored pair, is not repeated.
  const sidesSig = (s: (typeof stored)[number]) =>
    [s.parts.a, s.parts.b]
      .map((parts) =>
        parts
          .map((part) => `${part.target}@${part.range?.join('-') ?? ''}`)
          .sort()
          .join('+'),
      )
      .sort()
      .join('~');
  const listed = stored.filter(
    (s, i) => stored.findIndex((o) => sidesSig(o) === sidesSig(s)) === i,
  );
  const removeSeam = async (seam: (typeof stored)[number]) => {
    setBusy(true);
    setRefused('');
    const ok = await seamActions.remove(seam.key, seam.row);
    setBusy(false);
    if (!ok) setRefused(useSeamsStore.getState().errors[seam.key] ?? 'not saved');
    setActiveSeam(null);
    return ok;
  };
  const clearSeams = async () => {
    setClearingSeams(false);
    for (const seam of listed) if (!(await removeSeam(seam))) return;
  };
  const clearSide = (side: Side) => {
    setSel((current) => ({
      ...current,
      [side]: [],
      spans: { ...current.spans, [side]: {} },
    }));
    setFilled(null);
    setRefused('');
  };
  // The step's words as its row shows them («join / seam · armhole»), else the unit it makes.
  const stepName = stepWords(op, workCatalog) || op?.outputUnitName?.trim() || '';

  const loading = geo?.dep.status === 'pending';
  const drawn = resultLayout.T.size > 0;
  const error =
    refused ||
    stored.map((s) => (errors[s.key] ? 'refused' : '')).find(Boolean) ||
    (repeatsSeam ? 'already sewn' : '');
  const shownActive = stored.find((s) => s.key === activeSeam);
  const activeIndex = shownActive ? stored.indexOf(shownActive) : -1;

  const movable = !frozen && !!cardId;
  const picture = (passThrough?: string) => (
    <StepPictureSvg
      w={canvas.w}
      h={canvas.h}
      pad={phone ? 28 : 64}
      look='canvas'
      layout={poseShown}
      layers={posePending ? shownPoseLayers : stepPicture?.layers}
      stacked={posePending ? shownPoseStacked : undefined}
      geoms={geoms}
      innerLines={innerLines}
      marks={marks}
      nos={nos}
      names={groupNames}
      namesBelow={phone}
      ghostName={nameOf}
      bounds={poseBounds}
      hover={spanDrag?.id ?? hover?.id ?? null}
      hoverRange={spanDrag?.range ?? hover?.range ?? null}
      ticks={ticks}
      activeNo={activeIndex >= 0 ? activeIndex : null}
      onClearNo={frozen || !shownActive ? undefined : () => void removeSeam(shownActive)}
      onHoverAt={frozen ? undefined : onHoverAt}
      onSpanDrag={frozen ? undefined : onSpanDrag}
      onPick={frozen ? undefined : toggle}
      pickTargets={canvasPickTargets}
      view={zoom.view}
      className={cn('absolute inset-0', passThrough)}
    />
  );

  const content = (
    <>
      {mode === 'dialog' && (
        <>
          <Dialog.Title className='sr-only'>{`op #${op?.operationNumber ?? ''} seams`}</Dialog.Title>
          <Dialog.Description className='sr-only'>pick edges</Dialog.Description>
        </>
      )}

      {!walk && (
        <div className='flex h-13 flex-none items-center gap-3'>
          <Text size='small' tracking='section' className='uppercase'>
            {`op #${op?.operationNumber ?? ''}`}
          </Text>
          {stepName && (
            <Text size='small' variant='label' className='min-w-0 truncate'>
              {stepName}
            </Text>
          )}
          {onClose && (
            <div className='ml-auto'>
              <Close onClick={onClose} aria-label='close' />
            </div>
          )}
        </div>
      )}

      <div className='flex min-h-0 flex-1 flex-col border border-borderColor bg-bgColor'>
        <div className='flex min-h-0 flex-1'>
          <div
            ref={(node) => {
              canvasEl(node);
              zoom.ref(node);
            }}
            className={cn(
              'relative min-h-0 min-w-0 flex-1 touch-none overflow-hidden select-none',
              'cursor-grab active:cursor-grabbing',
              zoom.spaceHeld && '[&_*]:cursor-grab!',
            )}
            data-seam-picker-canvas=''
            // A press on the canvas keeps the keys here: Esc lets go, Enter accepts.
            {...zoom.handlers}
            onPointerDownCapture={(e) => {
              e.currentTarget
                .closest<HTMLElement>('[data-seam-picker]')
                ?.focus({ preventScroll: true });
              zoom.handlers.onPointerDownCapture(e);
            }}
          >
            {loading && !drawn ? (
              <div className='absolute inset-0 grid place-items-center'>
                <Placeholder label='loading' />
              </div>
            ) : !drawn ? (
              <div className='absolute inset-0 grid place-items-center'>
                <Placeholder label={groups.length ? 'no pattern' : 'no pieces'} dashed />
              </div>
            ) : movable ? (
              <PoseOverlay
                w={canvas.w}
                h={canvas.h}
                pad={phone ? 28 : 64}
                bounds={poseBounds ?? poseShown.bbox}
                view={zoom.view}
                layout={poseShown}
                layerOrder={shownPoseLayers}
                geoms={foldedDrawing(geoms, innerLines, stepFolds?.flat).geoms}
                nameOf={nameOf}
                selected={poseSel}
                snapAt={snapAtDuringDrag(poseDrag)}
                snapSource={fitSource}
                disabled={busy}
                pickupOf={pickupOf}
                onSelect={(piece) => {
                  setPoseSel(piece);
                  setPoseDrag(null);
                }}
                onDrag={(group, D, snap) => setPoseDrag({ group, D, snap })}
                onDrop={dropPose}
                snap={snapOn}
                onCancel={() => setPoseDrag(null)}
              >
                {picture('pointer-events-none')}
              </PoseOverlay>
            ) : (
              picture()
            )}
            {movable && poseSel && (
              <div
                className='absolute top-2 left-3 flex flex-wrap items-center gap-3'
                data-seam-pose-tools=''
              >
                <Button
                  type='button'
                  variant='underline'
                  size='xs'
                  aria-label='turn left'
                  onClick={() => transformPose('left')}
                  disabled={!poseSel || busy}
                >
                  ⟲
                </Button>
                <Button
                  type='button'
                  variant='underline'
                  size='xs'
                  aria-label='turn right'
                  onClick={() => transformPose('right')}
                  disabled={!poseSel || busy}
                >
                  ⟳
                </Button>
                <Button
                  type='button'
                  variant='underline'
                  size='xs'
                  aria-label='mirror'
                  onClick={() => transformPose('mirror')}
                  disabled={!poseSel || busy}
                >
                  ⇋
                </Button>
                <Button
                  type='button'
                  variant='underline'
                  size='xs'
                  onClick={() => transformPose('upright')}
                  disabled={!poseSel || busy}
                >
                  upright
                </Button>
                <Chip
                  selected={snapOn}
                  pressed={snapOn}
                  onClick={() => {
                    setSnapOn((on) => !on);
                    setPoseDrag(null);
                  }}
                  disabled={busy}
                >
                  snap
                </Chip>
                {onTop && (
                  <Chip
                    selected={onTop.active}
                    pressed={onTop.active}
                    onClick={pressOnTop}
                    disabled={!onTop.press || busy}
                  >
                    on top {onTop.input}
                  </Chip>
                )}
              </div>
            )}
            {drawn && (
              <div className='absolute top-2 right-3 flex items-center gap-3' data-seam-zoom=''>
                <Button
                  type='button'
                  variant='underline'
                  size='xs'
                  onClick={zoom.zoomOut}
                  aria-label='zoom out'
                >
                  −
                </Button>
                <Button
                  type='button'
                  variant='underline'
                  size='xs'
                  onClick={zoom.zoomIn}
                  aria-label='zoom in'
                >
                  +
                </Button>
                {(zoom.moved || frameStale) && (
                  <Button type='button' variant='underline' size='xs' onClick={zoom.fit}>
                    fit
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        <div
          className='sticky bottom-0 box-content flex h-21 flex-none flex-wrap content-center items-center gap-x-3 border-t border-hairline bg-bgColor px-3 pb-[env(safe-area-inset-bottom)] md:gap-4.5 md:px-5'
          data-seam-bar=''
        >
          {error && (
            <Text size='micro' variant='error' className='min-w-0 truncate'>
              {error}
            </Text>
          )}
          {listed.map((s) => {
            const on = s.key === activeSeam;
            return (
              <span
                key={s.key}
                className='flex min-w-0 items-center gap-2'
                data-seam-stored={s.key}
              >
                <Button
                  type='button'
                  variant='underline'
                  size='xs'
                  aria-pressed={on}
                  onClick={() => {
                    setSel(EMPTY);
                    setFilled(null);
                    setActiveSeam(on ? null : s.key);
                  }}
                >
                  <PairNo i={stored.indexOf(s)} />
                </Button>
                {(on || listed.length === 1) && (
                  <Text size='micro' tracking='label' className='min-w-0 truncate uppercase'>
                    {seamName(s.sides)}
                  </Text>
                )}
                {on && !frozen && (
                  <Close
                    onClick={() => void removeSeam(s)}
                    disabled={busy}
                    aria-label='remove seam'
                    data-seam-remove=''
                  />
                )}
              </span>
            );
          })}
          {(sel.a.length > 0 || sel.b.length > 0) && (
            <ChipRow>
              <Chip
                selected={sel.a.length > 0}
                onClick={() => clearSide('a')}
                disabled={!sel.a.length}
                data-seam-side='1'
              >
                {sel.a.length
                  ? `1 ${sideName(sel.a)} ${mmText(sideLen(pickParts('a'), pickParts('b')))}`
                  : '1'}
              </Chip>
              <Chip
                selected={sel.b.length > 0}
                tone={sel.b.length ? 'attention' : 'default'}
                onClick={() => clearSide('b')}
                disabled={!sel.b.length}
                data-seam-side='2'
              >
                {sel.b.length
                  ? `2 ${sideName(sel.b)} ${mmText(sideLen(pickParts('b'), pickParts('a')))}`
                  : '2'}
              </Chip>
            </ChipRow>
          )}
          {delta != null ? (
            <Text size='control' className='whitespace-nowrap tabular-nums' data-seam-delta=''>
              {`Δ ${fmtMm(delta)} mm`}
            </Text>
          ) : empty && !loading ? (
            drawn ? (
              <Text size='micro' variant='label' data-step-seams-status='pick'>
                pick
              </Text>
            ) : (
              <Text size='micro' variant='error' data-step-seams-status=''>
                no seam
              </Text>
            )
          ) : null}
          <span className='flex-1' />
          {!frozen && (
            <Button
              type='button'
              variant='underline'
              size='xs'
              onClick={fitPose}
              disabled={!fitReady || busy}
              data-seam-fit=''
            >
              FIT
            </Button>
          )}
          {!frozen && (suggestion || surfaceSuggestion) && (
            <Button
              type='button'
              variant='underline'
              size='xs'
              onClick={fillGuess}
              // Holds its place while a pick is live, so the words beside it do not shift.
              className={sel.a.length || sel.b.length ? 'invisible' : undefined}
              data-seam-guess=''
            >
              guess
            </Button>
          )}
          {!frozen && mirror.visible && mirror.plan.kind === 'no-twin' && (
            <Chip tone='error'>NO TWIN</Chip>
          )}
          {!frozen && mirror.visible && mirror.plan.kind === 'edge-mismatch' && (
            <Chip tone='error'>EDGE MISMATCH</Chip>
          )}
          {!frozen && mirror.visible && (
            <Button
              type='button'
              variant='underline'
              size='xs'
              onClick={() => {
                if (mirror.plan.kind === 'replace') setReplaceMirrorOpen(true);
                else void mirrorLeft();
              }}
              disabled={
                busy ||
                mirror.plan.kind === 'same' ||
                mirror.plan.kind === 'no-twin' ||
                mirror.plan.kind === 'edge-mismatch'
              }
              data-seam-mirror-left=''
            >
              mirror left
            </Button>
          )}
          {!frozen && (
            <Button
              type='button'
              variant='underline'
              size='xs'
              onClick={reset}
              disabled={!sel.a.length && !sel.b.length}
            >
              clear
            </Button>
          )}
          {!frozen && listed.length > 0 && (
            <Button
              type='button'
              variant='underline'
              size='xs'
              onClick={() => setClearingSeams(true)}
              disabled={busy}
              data-seam-clear-all=''
            >
              clear seams
            </Button>
          )}
          {!frozen && (posePending || !!poseFree || ownPoseRows.size > 0) && (
            <Button
              type='button'
              variant='underline'
              size='xs'
              onClick={() => void resetPose()}
              disabled={busy}
              data-seam-pose-reset=''
            >
              reset
            </Button>
          )}
          {!frozen && (
            <Button
              type='button'
              variant='main'
              size='sm'
              onClick={() => void commit()}
              disabled={!canAccept}
              loading={busy}
              done={saved && !canAccept}
              className={
                saved && !canAccept
                  ? 'border-2 border-success text-success disabled:border-success disabled:text-success'
                  : undefined
              }
              data-seam-accept=''
            >
              accept
            </Button>
          )}
          {footerActions}
        </div>
      </div>
      <ConfirmationModal
        open={replaceMirrorOpen}
        onOpenChange={setReplaceMirrorOpen}
        onConfirm={() => void mirrorLeft()}
        title='REPLACE RIGHT?'
        confirmLabel='REPLACE'
      >
        {null}
      </ConfirmationModal>
      <ConfirmationModal
        open={clearingSeams}
        onOpenChange={setClearingSeams}
        onConfirm={() => void clearSeams()}
        title='clear seams'
        confirmLabel='clear'
      >
        <ChipRow>
          {listed.map((s) => (
            <PairNo key={s.key} i={stored.indexOf(s)} />
          ))}
        </ChipRow>
      </ConfirmationModal>
    </>
  );

  if (mode === 'dialog') {
    return (
      <Dialog.Content
        data-seam-picker=''
        className='fixed inset-0 z-[var(--z-modal)] flex flex-col bg-pageBg px-3 text-textColor focus:outline-none md:px-4 md:pb-4'
        onEscapeKeyDown={(e) => {
          if (escape()) e.preventDefault();
        }}
        onKeyDown={onKeyDown}
      >
        {content}
      </Dialog.Content>
    );
  }

  return (
    <div
      data-seam-picker='inline'
      className={cn(
        'flex min-h-0 flex-col bg-bgColor text-textColor',
        walk ? 'h-full' : 'h-120',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
      )}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && escape()) {
          e.preventDefault();
          return;
        }
        onKeyDown(e);
      }}
    >
      {content}
    </div>
  );
}
