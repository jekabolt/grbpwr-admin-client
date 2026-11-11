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
// upright and reset stay pending). One ACCEPT stores the moves and the pair; a move is stored by
// nothing else, and it leaves the pick as it was. The order of the blocks is not a move: the LAYERS
// window and a right click write it to the step at once, through the card's autosave.

import * as Dialog from '@radix-ui/react-dialog';
import { activeFoldRows } from 'lib/folds';
import { resolveEdge } from 'lib/assembly-skeleton/union';
import { anchorOfRunId, type EdgeAnchor, type SidePart, type StoredSeam } from 'lib/seams';
import { cn } from 'lib/utility';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Button, Chip, ChipRow, Close, ConfirmationModal, Placeholder, Text } from 'ui';
import { runsOfSide } from '../assembly-seams/seam-actions';
import { useSeamsStore } from '../assembly-seams/seams-store';
import { useFoldRows } from '../assembly-folds/folds-store';
import { useTechCardAutosave } from '../design/autosave-contract';
import { bindingRowFromCloth, bindingStripTarget } from '../binding-step';
import type { CutStrip } from '../cut-strip-editor/use-cut-strip';
import { fittedSideMm } from '../cut-strips/length-check';
import { stripKeysOf, stripName, type BomLineLike } from '../cut-strips/strip-pieces';
import type { TechCardFormData } from '../schema';
import { isTopstitchStep } from '../operation-kinds';
import {
  createTopstitchLineFromPick,
  topstitchPickOverlaps,
  topstitchThreadKey,
  type TopstitchBomLine,
  type TopstitchLine,
} from '../topstitch-lines';
import { useOperationWorkCatalog } from '../useOperationWorkCatalog';
import { moveRow, orderOfRows, windowRows, type LayerMove } from './layers-window';
import { LayersMenu, LayersWindow } from './layers-window-view';
import { PairNo } from './pair-no';
import { recordSeamDecision } from './seam-decisions';
import { NO_STEP_EDGES, NO_STEP_PARTS } from './step-highlight';
import {
  edgesTouch,
  isGuess,
  pickTarget,
  seamSideName,
  sideForClick,
  sideForTarget,
} from './seam-focus';
import { usePictureZoom } from './picture-zoom';
import {
  edgeBreaks,
  NO_SPANS,
  pickFreeSpan,
  pickSegment,
  repeatsStoredSeam,
  samePick,
  labelSideLength,
  sidePartsShareEdge,
  segmentAt,
  surfacePartSide,
  surfacePick,
  spanOfLength,
  sideParts,
  snapToBreak,
  storedSeamAt,
  storedSeamOverlapping,
  type SidePick,
  type SpanRange,
} from './span-pick';
import { bindingRowsOf, seamsToClear } from './step-seam-actions';
import { piecesUnder, snapAtDuringDrag } from './pose-picking';
import { poseFit, PoseOverlay, poseRings } from './pose-overlay';
import { useStepResults } from './step-result-context';
import { useAttachStepPose, useAttachStepSeam, useStepSeamActions } from './step-seams-context';
import { stepWords } from './step-words';
import {
  TopstitchLineList,
  topstitchLineNos,
  topstitchLineText,
  withoutTopstitchLine,
  writeTopstitchLines,
} from './topstitch-picker';
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
  stepActionMarks,
  StepPictureSvg,
  useBoxSize,
  useStepScene,
  type EdgeMark,
  type EdgeTick,
  type NoMark,
  useSeamRows,
} from './step-picture-view';
import {
  cardFoldLines,
  foldCrossingsMm,
  foldedDrawing,
  foldedFitSides,
  withFoldPartners,
} from './step-folds';
import { edgeRowOfPick, initialPickerPick, orderedPickSides, storedSeamSides } from './step-rows';
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

const polyLen = (pts: readonly Pt[]) =>
  pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : s), 0);
const mmText = (v: number) => `${fmtMm(v)} mm`;
/** The LAYERS window stays as the owner left it from step to step while the tab lives. */
let layersShown = true;
const NO_PAINT: readonly string[] = [];

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
    pieceName: sceneName,
  } = scene;
  const frozen = (scene.ctx?.frozen ?? true) || readOnly;
  const cardId = scene.ctx?.cardId;
  const form = useFormContext<TechCardFormData>();
  const autosave = useTechCardAutosave();
  const attach = useAttachStepSeam(index);
  const attachPose = useAttachStepPose(index);
  const seamActions = useStepSeamActions(index);
  const errors = useSeamsStore((s) => s.errors);
  const foldRows = useFoldRows();
  const foldLines = useMemo(
    () => cardFoldLines(foldRows, geoms, geo?.grainDeg, innerLines),
    [foldRows, geoms, geo?.grainDeg, innerLines],
  );
  const breaksOf = useCallback(
    (id: TargetId) => edgeBreaks(id, geoms, foldCrossingsMm(id, geoms, foldLines)),
    [geoms, foldLines],
  );
  const { catalog: workCatalog } = useOperationWorkCatalog();
  const cutStrips = (useWatch({ control: form.control, name: 'cutStrips' }) ?? []) as CutStrip[];
  const sizeIds = (useWatch({ control: form.control, name: 'sizeIds' }) ?? []) as number[];
  const baseSizeId = useWatch({ control: form.control, name: 'baseSampleSizeId' }) as
    | number
    | undefined;
  const bindingTarget = useMemo(
    () => bindingStripTarget(op, cutStrips, sizeIds),
    [op, cutStrips, sizeIds],
  );
  const bindingStripKeys = useMemo(() => stripKeysOf(cutStrips), [cutStrips]);
  const seamRows = useSeamRows();
  const cardBindings = useMemo(
    () =>
      bindingTarget
        ? bindingRowsOf(seamRows.values(), bindingStripKeys).map((row) => ({
            parts: storedSeamSides(row, geoms).parts,
          }))
        : [],
    [bindingTarget, seamRows, bindingStripKeys, geoms],
  );
  // An edge is bound once on the card: any step's binding row holding that stretch refuses it.
  const boundOnCard = useCallback(
    (id: TargetId, range: SpanRange | undefined) =>
      storedSeamOverlapping(stored, id, range, geoms) >= 0 ||
      storedSeamOverlapping(cardBindings, id, range, geoms) >= 0,
    [stored, cardBindings, geoms],
  );
  const bomItems = (useWatch({ control: form.control, name: 'bomItems' }) ?? []) as Array<
    BomLineLike & TopstitchBomLine
  >;
  // A strip the card has not stored yet has no name on the card: its BOM line names it.
  const nameOf = useCallback(
    (key: string) => {
      const strip = cutStrips.find((row) => row.lineKey?.trim() === key);
      return strip ? stripName(strip, bomItems) : sceneName(key);
    },
    [cutStrips, bomItems, sceneName],
  );
  const topstitchMode = isTopstitchStep(op ?? {});
  const topstitchLines = useMemo(
    () => (op?.topstitchLines ?? []) as TopstitchLine[],
    [op?.topstitchLines],
  );
  const topstitchBomLineKey = topstitchThreadKey(op, bomItems);
  const bindingMode = !topstitchMode && !!bindingTarget;

  const suggestion = suggestions[initialProposal] ?? suggestions[0] ?? null;
  const unitStep = isUnitStep(groups);
  const initialPick =
    bindingMode || topstitchMode
      ? null
      : initialPickerPick(suggestion, preselectProposal, unitStep);
  const [sel, setSel] = useState<Sel>(() => (initialPick ? wholeSel(initialPick) : EMPTY));
  const [hover, setHover] = useState<SpanHover | null>(null);
  const [spanDrag, setSpanDrag] = useState<SpanHover | null>(null);
  // The selected stored seam's key; in topstitch mode, the selected line's `lineKey`.
  const [activeSeam, setActiveSeam] = useState<string | null>(null);
  const [clearingSeams, setClearingSeams] = useState(false);
  const [clearingLines, setClearingLines] = useState(false);
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
  const {
    posePending,
    poseSel,
    setPoseSel,
    snapOn,
    setSnapOn,
    poseDrag,
    setPoseDrag,
    poseBounds,
    frameStale,
    fitFrame,
    fitReady,
    ownPoseRows,
    resultLayout,
    poseShown,
    shownPoseLayers,
    shownPoseStacked,
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
    geoms,
    grainDeg: geo?.grainDeg,
    busy,
    frozen,
    setBusy,
    setRefused,
    attachPose,
    fitSource,
  });
  const mirror = useMirrorStep({
    index,
    step: op ?? {},
    cardOps: scene.ops,
    rows: byKey,
    poses,
    folds: foldRows,
    geoms,
    grainDeg: geo?.grainDeg,
  });

  const pieces = geo?.pieces;
  const activeFolds = activeFoldRows(ops, index, foldRows);
  // What was picked, as it lies at this step: a folded stretch counts once, never the other side's.
  const sideLen = (ids: readonly TargetId[] | readonly SidePart[]) =>
    targetsLen(ids, geoms, (piece, k) => polyLen(pieces?.get(piece)?.inner[k] ?? []), {
      activeFolds,
      grainDeg: geo?.grainDeg,
      placed: stepPicture?.layout.T,
    });
  const pickParts = (side: Side) => sideParts(sel[side], sel.spans[side]);
  // Where a click lands: an edge in hand keeps its side; a piece closed on itself opens side 2.
  // An inner line is a host: it keeps the input rule.
  const clickSide = useCallback(
    (id: TargetId): Side =>
      parseInner(id)
        ? sideForClick(pieceOfTarget(id), groups, sel, pieceOfTarget)
        : sideForTarget(id, groups, sel, pieceOfTarget, (x, y) =>
            edgesTouch(x, y, geoms, pieceOfTarget),
          ),
    [groups, sel, geoms],
  );

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
  const topstitchReady =
    topstitchMode &&
    !!topstitchBomLineKey &&
    !inners.length &&
    sel.a.length > 0 &&
    sel.b.length === 0;
  const bindingReady = bindingMode && !inners.length && sel.a.length > 0 && sel.b.length === 0;
  const pair: SeamSides | null =
    !bindingMode && !inners.length && sel.a.length && sel.b.length ? { a: sel.a, b: sel.b } : null;
  const repeatsSeam = !!pair && repeatsStoredSeam(pickParts('a'), pickParts('b'), stored, geoms);
  // One edge on both sides sews nothing: the row would be stale from its first read.
  const sidesShare = !!pair && sidePartsShareEdge(pickParts('a'), pickParts('b'), geoms);
  // An edge is bound once on the card: a second step binding it would double the strip and its norm.
  const repeatsBinding =
    bindingReady && pickParts('a').some((part) => boundOnCard(part.target, part.range));
  const repeatsTopstitch =
    topstitchMode &&
    pickParts('a').some((part) =>
      topstitchPickOverlaps(topstitchLines, part.target, part.range, geoms),
    );
  const pickReady =
    !repeatsSeam &&
    !sidesShare &&
    !repeatsBinding &&
    !repeatsTopstitch &&
    (topstitchReady ||
      bindingReady ||
      (surface ? !!partKey && pick[hostSide!].length === 1 : !!pair));
  const canAccept =
    !frozen &&
    !busy &&
    (topstitchMode || !!cardId) &&
    (pickReady || (!topstitchMode && posePending));

  const anchorCtx = useMemo(
    () => ({ pieces: [...geoms.values()], grainDeg: geo?.grainDeg ?? new Map(), nameOf }),
    [geoms, geo?.grainDeg, nameOf],
  );

  // An edge-only pick as ACCEPT stores it, with the words it shows when it cannot.
  const edgePick = useCallback(
    (clicked: Sel) => {
      const s = orderedPickSides(clicked, geoms);
      const ranged = Object.keys(clicked.spans.a).length || Object.keys(clicked.spans.b).length;
      return edgeRowOfPick(
        s,
        geoms,
        anchorCtx,
        ranged
          ? { a: sideParts(s.a, clicked.spans.a), b: sideParts(s.b, clicked.spans.b) }
          : undefined,
      );
    },
    [geoms, anchorCtx],
  );

  const buildRow = useCallback(
    (clicked: Sel): StoredSeam | null => {
      const s = orderedPickSides(clicked, geoms);
      const ins = [...s.a, ...s.b].filter((t) => parseInner(t));
      if (ins.length === 0) return edgePick(clicked).row;
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
    [geoms, anchorCtx, pieces, geo, partKey, edgePick],
  );

  const reset = () => {
    setSel(EMPTY);
    setRefused('');
    setFilled(null);
    setActiveSeam(null);
  };

  const draftRow = useMemo(
    () =>
      bindingReady && bindingTarget
        ? bindingRowFromCloth(
            sideParts(pick.a, pick.spans.a),
            bindingTarget.strip,
            geoms,
            anchorCtx,
          )
        : pair || surface
          ? buildRow(pick)
          : null,
    [anchorCtx, bindingReady, bindingTarget, buildRow, geoms, pair, pick, surface],
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
    if (topstitchMode) {
      const line = createTopstitchLineFromPick({
        parts: pickParts('a'),
        geoms,
        anchors: { pieces: anchorCtx.pieces, grainDeg: geo?.grainDeg },
        bomLineKey: topstitchBomLineKey,
        anchoredSize: geo?.size ?? '',
      });
      if (!line) {
        setRefused('cannot add line');
        return;
      }
      const currentOperation = form.getValues(`operations.${index}`);
      const currentLines = (currentOperation?.topstitchLines ?? []) as TopstitchLine[];
      form.setValue(`operations.${index}.topstitchLines`, [...currentLines, line], {
        shouldDirty: true,
      });
      const bomLineKeys = currentOperation?.bomLineKeys ?? [];
      if (!bomLineKeys.includes(topstitchBomLineKey)) {
        form.setValue(`operations.${index}.bomLineKeys`, [...bomLineKeys, topstitchBomLineKey], {
          shouldDirty: true,
        });
      }
      reset();
      setSaved(true);
      onAccepted?.();
      onClose?.();
      return;
    }
    const row = pickReady ? draftRow : null;
    if (pickReady && !row) {
      const edgeOnly = !bindingReady && pair && ![...pick.a, ...pick.b].some((t) => parseInner(t));
      setRefused((edgeOnly && edgePick(pick).refusal) || 'cannot pair');
      return;
    }
    if (posePending && !(await savePose())) return;
    // Moves alone: stored, the half-made pick stays in hand.
    if (!row) {
      setSaved(true);
      onAccepted?.();
      return;
    }
    let addedBindingKey = '';
    if (bindingReady && bindingTarget?.fresh) {
      const lineKey = bindingTarget.strip.lineKey?.trim() ?? '';
      const currentStrips = (form.getValues('cutStrips') ?? []) as CutStrip[];
      if (lineKey && !currentStrips.some((strip) => strip.lineKey?.trim() === lineKey)) {
        form.setValue('cutStrips', [...currentStrips, bindingTarget.strip] as never, {
          shouldDirty: true,
        });
        const currentInputs = (form.getValues(`operations.${index}.inputKeys`) ?? []) as string[];
        form.setValue(
          `operations.${index}.inputKeys`,
          [...currentInputs.filter((key) => key !== lineKey), lineKey],
          { shouldDirty: true },
        );
        addedBindingKey = lineKey;
      }
    }
    setBusy(true);
    setRefused('');
    const res = await attach(row);
    setBusy(false);
    if ('refused' in res) {
      if (addedBindingKey) {
        const currentStrips = (form.getValues('cutStrips') ?? []) as CutStrip[];
        form.setValue(
          'cutStrips',
          currentStrips.filter((strip) => strip.lineKey?.trim() !== addedBindingKey) as never,
          { shouldDirty: true },
        );
        const currentInputs = (form.getValues(`operations.${index}.inputKeys`) ?? []) as string[];
        form.setValue(
          `operations.${index}.inputKeys`,
          currentInputs.filter((key) => key !== addedBindingKey),
          { shouldDirty: true },
        );
      }
      setRefused(res.refused);
      return;
    }
    // Accepted as «guess» filled it: the proposal's acceptance; any change made it the owner's own.
    const guessed = !!filled && samePick(filled, pick);
    recordSeamDecision({
      cardId: cardId ?? 0,
      operationNumber: op?.operationNumber ?? 0,
      action: guessed ? 'accept' : 'own',
      seamKey: res.key,
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
  // A garment edge picked against a label's edge takes the label's length, centred on the click.
  const labelSpanAt = useCallback(
    (id: TargetId, side: Side, length: number, atMm: number) => {
      const isLabel = (target: string) =>
        !!geoms.get(pieceOfTarget(target as TargetId))?.garmentLabel;
      if (isLabel(id)) return null;
      const want = labelSideLength(
        sel,
        side,
        isLabel,
        (target) => resolveEdge(target as TargetId, geoms)?.len ?? 0,
      );
      return want && want < length ? spanOfLength(want, length, atMm) : null;
    },
    [geoms, sel],
  );
  const toggle = useCallback(
    (id: TargetId, atMm?: number) => {
      if (frozen) return;
      if (topstitchMode && parseInner(id)) return;
      if (bindingMode && bindingStripKeys.has(pieceOfTarget(id))) return;
      const side = bindingMode || topstitchMode ? 'a' : clickSide(id);
      setSaved(false);
      setPoseSel(null);
      const length = resolveEdge(id, geoms)?.len ?? 0;
      const picked = (side: Side) =>
        sel[side].includes(id) &&
        (atMm == null ||
          !sel.spans[side][id] ||
          sel.spans[side][id].some(([from, to]) => atMm >= from && atMm <= to));
      setRefused('');
      // A stored seam's part is that seam, not a new pick; what is in hand comes off first.
      if (!topstitchMode && !picked('a') && !picked('b')) {
        const at = storedSeamAt(stored, id, atMm, geoms);
        if (at >= 0) {
          if (bindingMode) {
            setRefused('already bound');
            return;
          }
          setSel(EMPTY);
          setFilled(null);
          setActiveSeam((current) => (current === stored[at].key ? null : stored[at].key));
          return;
        }
      }
      setActiveSeam(null);
      const base = (bindingMode || topstitchMode) && !sel.a.includes(id) ? EMPTY : sel;
      // A surface's part is taken by whole edges of one piece (Р5).
      const surfaced = (next: Sel) =>
        bindingMode || topstitchMode
          ? next
          : surfacePick(next, pickRules.isInner, pickRules.pieceOf, id);
      const wholeOnly =
        !bindingMode && !topstitchMode && surfacePartSide(base, pickRules.isInner) === side;
      if (atMm == null || parseInner(id) || !(length > 0) || wholeOnly) {
        if (topstitchMode && topstitchPickOverlaps(topstitchLines, id, undefined, geoms)) {
          setRefused('already picked');
          return;
        }
        if (bindingMode && boundOnCard(id, undefined)) {
          setRefused('already bound');
          return;
        }
        setSel(
          surfaced(
            onFolded(pickTarget(base, side, id, pickRules.isInner, pickRules.pieceOf), side, id),
          ),
        );
        return;
      }
      const segment = labelSpanAt(id, side, length, atMm) ?? segmentAt(breaksOf(id), length, atMm);
      if (topstitchMode && topstitchPickOverlaps(topstitchLines, id, segment, geoms)) {
        setRefused('already picked');
        return;
      }
      if (bindingMode && boundOnCard(id, segment)) {
        setRefused('already bound');
        return;
      }
      setSel(
        surfaced(
          onFolded(pickSegment(base, side, id, segment, length, pickRules, breaksOf(id)), side, id),
        ),
      );
    },
    [
      frozen,
      topstitchMode,
      topstitchLines,
      bindingMode,
      bindingStripKeys,
      groups,
      sel,
      geoms,
      stored,
      pickRules,
      setPoseSel,
      onFolded,
      labelSpanAt,
      breaksOf,
      clickSide,
    ],
  );
  const onHoverAt = useCallback(
    (id: TargetId | null, atMm: number | null) => {
      const length = id ? resolveEdge(id, geoms)?.len ?? 0 : 0;
      const wholeOnly =
        !!id &&
        !bindingMode &&
        !topstitchMode &&
        surfacePartSide(sel, pickRules.isInner) === clickSide(id);
      const free =
        id &&
        atMm != null &&
        length > 0 &&
        !wholeOnly &&
        (topstitchMode || storedSeamAt(stored, id, atMm, geoms) < 0)
          ? labelSpanAt(id, bindingMode || topstitchMode ? 'a' : clickSide(id), length, atMm) ??
            segmentAt(breaksOf(id), length, atMm)
          : null;
      setHover((current) =>
        current?.id === id && current?.range[0] === free?.[0] && current?.range[1] === free?.[1]
          ? current
          : id && free
            ? { id, range: free }
            : null,
      );
    },
    [geoms, stored, labelSpanAt, bindingMode, topstitchMode, breaksOf, clickSide, sel, pickRules],
  );
  const onSpanDrag = useCallback(
    (id: TargetId, fromMm: number, toMm: number, done: boolean) => {
      if (frozen) return;
      const breaks = breaksOf(id);
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
      if (topstitchMode && parseInner(id)) return;
      if (bindingMode && bindingStripKeys.has(pieceOfTarget(id))) return;
      if (topstitchMode && topstitchPickOverlaps(topstitchLines, id, range, geoms)) {
        setRefused('already picked');
        return;
      }
      if (bindingMode && boundOnCard(id, range)) {
        setRefused('already bound');
        return;
      }
      const side = bindingMode || topstitchMode ? 'a' : clickSide(id);
      const base = (bindingMode || topstitchMode) && !sel.a.includes(id) ? EMPTY : sel;
      // A surface's part has no stretches (Р5): a drag on it takes the whole edge.
      if (!bindingMode && !topstitchMode && surfacePartSide(base, pickRules.isInner) === side) {
        if (base[side].includes(id)) return;
        setSel(
          surfacePick(
            onFolded(pickTarget(base, side, id, pickRules.isInner, pickRules.pieceOf), side, id),
            pickRules.isInner,
            pickRules.pieceOf,
            id,
          ),
        );
        return;
      }
      setSel(
        surfacePick(
          onFolded(
            pickFreeSpan(base, side, id, range, resolveEdge(id, geoms)?.len ?? 0, pickRules),
            side,
            id,
          ),
          pickRules.isInner,
          pickRules.pieceOf,
          id,
        ),
      );
    },
    [
      frozen,
      topstitchMode,
      topstitchLines,
      bindingMode,
      bindingStripKeys,
      groups,
      sel,
      geoms,
      stored,
      pickRules,
      setPoseSel,
      onFolded,
      breaksOf,
      clickSide,
    ],
  );

  // Edges only: no length is drawn on the canvas (the owner, №58); the footer keeps the lengths.
  // Kept until a seam is stored or the selection moves: the canvas keys its layers on these.
  const { marks, nos } = useMemo(() => {
    const marks: EdgeMark[] = [];
    const nos: NoMark[] = [];
    // A stored topstitch line: its number at the middle of its longest part, as in LINES.
    if (topstitchMode) nos.push(...topstitchLineNos(topstitchLines, geoms));
    // A stored seam reads as a proposal does: its edges, its number on the first.
    if (!topstitchMode)
      stored.forEach((s, i) => {
        const parts = [...s.parts.a, ...s.parts.b];
        const active = s.key === activeSeam;
        parts.forEach(({ target, range }) =>
          marks.push({ id: target, tone: 'stored', ...(range ? { range } : {}), active }),
        );
        const first = s.parts.a[0] ?? s.parts.b[0];
        if (first)
          nos.push({ id: first.target, i, ...(first.range ? { range: first.range } : {}) });
      });
    const sideMarks = (side: Side, tone: EdgeMark['tone']) =>
      sideParts(sel[side], sel.spans[side]).forEach(({ target, range }) =>
        marks.push({ id: target, tone, ...(range ? { range } : {}) }),
      );
    sideMarks('a', 'pickFirst');
    sideMarks('b', 'pick');
    if (spanDrag)
      marks.push({
        id: spanDrag.id,
        tone:
          (bindingMode || topstitchMode ? 'a' : clickSide(spanDrag.id)) === 'a'
            ? 'pickFirst'
            : 'pick',
        range: [
          Math.min(spanDrag.range[0], spanDrag.range[1]),
          Math.max(spanDrag.range[0], spanDrag.range[1]),
        ],
      });
    return { marks, nos };
  }, [
    stored,
    sel,
    activeSeam,
    spanDrag,
    clickSide,
    bindingMode,
    topstitchMode,
    topstitchLines,
    geoms,
  ]);
  // The break points of every edge in hand: what a segment or a drag can land on.
  const ticks = useMemo<EdgeTick[]>(() => {
    const ids = new Set([...sel.a, ...sel.b].filter((id) => !parseInner(id)));
    if (hover) ids.add(hover.id);
    if (spanDrag) ids.add(spanDrag.id);
    return [...ids].flatMap((id) =>
      breaksOf(id).map((point) => ({
        id,
        atMm: point.atMm,
        notch: point.kind === 'notch',
      })),
    );
  }, [sel, hover, spanDrag, geoms, breaksOf]);
  const groupNames = useMemo(() => groups.map((g) => g.name), [groups]);
  const canvasPickTargets = useMemo(
    () =>
      unitStep && !topstitchMode
        ? [
            ...new Set([
              ...suggestions.flatMap((candidate) => [...candidate.a, ...candidate.b]),
              ...stored.flatMap((seam) => [...seam.sides.a, ...seam.sides.b]),
              ...sel.a,
              ...sel.b,
            ]),
          ]
        : undefined,
    [unitStep, topstitchMode, suggestions, stored, sel],
  );

  // Edge to edge on both sides (a part on its host's line has no Δ).
  const edgeToEdge = (s: { a: readonly TargetId[]; b: readonly TargetId[] }) =>
    s.a.length > 0 && s.b.length > 0 && [...s.a, ...s.b].every((id) => !parseInner(id));
  // A strip's side reads through its fit: elastic is short of its seam on purpose.
  const fitted = (parts: readonly SidePart[]) =>
    fittedSideMm(
      sideLen(parts),
      [...new Set(parts.map((part) => pieceOfTarget(part.target)))],
      geoms,
    );
  const delta = pair
    ? deltaMm(fitted(pickParts('a')), fitted(pickParts('b')), ease)
    : shownSeam && edgeToEdge(shownSeam.sides)
      ? deltaMm(fitted(shownSeam.parts.a), fitted(shownSeam.parts.b), ease)
      : null;
  const empty =
    !pair &&
    !surface &&
    (topstitchMode ? topstitchLines.length === 0 : stored.length === 0) &&
    !sel.a.length &&
    !sel.b.length;

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
    if (layerMenu) {
      setLayerMenu(null);
      return true;
    }
    if (poseSel) {
      setPoseSel(null);
      return true;
    }
    if (posePending) {
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
    for (const seam of seamsToClear(stored)) if (!(await removeSeam(seam))) return;
  };
  const writeLines = (next: TopstitchLine[]) => {
    writeTopstitchLines(form.setValue, index, next);
    setActiveSeam(null);
    setSaved(false);
  };
  const removeLine = (lineKey: string) =>
    writeLines(
      withoutTopstitchLine(
        (form.getValues(`operations.${index}.topstitchLines`) ?? []) as TopstitchLine[],
        lineKey,
      ),
    );
  const clearLines = () => {
    setClearingLines(false);
    writeLines([]);
  };
  const lineText = (line: TopstitchLine) =>
    topstitchLineText(line, {
      geoms,
      sideName,
      widthMm: op?.topstitchWidthMm,
      sizeId: baseSizeId || sizeIds[0],
    });
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
    (repeatsSeam ? 'already sewn' : '') ||
    (repeatsBinding ? 'already bound' : '') ||
    (repeatsTopstitch ? 'already picked' : '') ||
    (topstitchMode && !topstitchBomLineKey ? 'thread missing' : '');
  const shownActive = stored.find((s) => s.key === activeSeam);
  const activeLine = topstitchMode
    ? topstitchLines.find((line) => line.lineKey === activeSeam)
    : undefined;
  const activeIndex = topstitchMode
    ? activeLine
      ? topstitchLines.indexOf(activeLine)
      : -1
    : shownActive
      ? stored.indexOf(shownActive)
      : -1;
  const clearActive = topstitchMode
    ? activeLine && (() => removeLine(activeLine.lineKey))
    : shownActive && (() => void removeSeam(shownActive));
  // Stored lines in the highlight ink, read from the op itself rather than the shared results.
  const topstitchActions = useMemo(
    () =>
      topstitchMode && topstitchLines.length
        ? stepActionMarks(op, NO_STEP_PARTS, geoms, innerLines).lines
        : undefined,
    [topstitchMode, topstitchLines, op, geoms, innerLines],
  );

  const movable = !frozen && !!cardId;
  const pad = phone ? 28 : 64;

  // ── the order of the blocks: the LAYERS window and a right click ──
  const [painted, setPainted] = useState(NO_PAINT);
  const onPainted = useCallback(
    (next: readonly string[]) =>
      setPainted((held) =>
        held.length === next.length && held.every((key, at) => key === next[at]) ? held : next,
      ),
    [],
  );
  const stepOrder = op?.layerOrder;
  const layerRows = useMemo(
    () => windowRows(stepResult?.layerInput.blocks ?? [], painted, stepOrder),
    [stepResult?.layerInput.blocks, painted, stepOrder],
  );
  const layersOn = movable && layerRows.length >= 2;
  const [layersOpen, setLayersOpen] = useState(layersShown);
  const [layerMenu, setLayerMenu] = useState<{ key: string; x: number; y: number } | null>(null);
  const closeLayerMenu = useCallback(() => setLayerMenu(null), []);
  useEffect(closeLayerMenu, [closeLayerMenu, index]);
  const moveLayer = (key: string, move: LayerMove) => {
    if (busy || !layersOn) return;
    const next = moveRow(layerRows, key, move);
    if (next === layerRows) return;
    form.setValue(`operations.${index}.layerOrder`, orderOfRows(next), { shouldDirty: true });
    autosave.request('layers');
  };
  const drawnGeoms = useMemo(
    () => foldedDrawing(geoms, innerLines, stepFolds?.flat).geoms,
    [geoms, innerLines, stepFolds?.flat],
  );
  const pickLayerRow = (pieces: readonly string[]) => {
    setPoseSel(pieces[0]);
    setPoseDrag(null);
  };
  // The piece seen under the pointer: the rings in the order of the fills, topmost first.
  const onCanvasMenu = (e: MouseEvent<HTMLElement>) => {
    if (!layersOn || (e.target as Element).closest('[data-seam-zoom], [data-seam-pose-tools]'))
      return;
    const box = e.currentTarget.getBoundingClientRect();
    const fit = poseFit(poseBounds ?? poseShown.bbox, canvas.w, canvas.h, pad, zoom.view);
    const [hit] = piecesUnder(
      [e.clientX - box.left, e.clientY - box.top],
      poseRings(poseShown, painted, drawnGeoms, fit),
    );
    const row = layerRows.find(({ pieces }) => pieces.includes(hit));
    if (!row) return;
    e.preventDefault();
    setPoseSel(hit);
    setPoseDrag(null);
    setLayerMenu({ key: row.key, x: e.clientX, y: e.clientY });
  };
  const layersWindow = layersOn && layersOpen && (
    <LayersWindow
      rows={layerRows}
      selected={layerRows.find(({ pieces }) => poseSel && pieces.includes(poseSel))?.key ?? null}
      docked={phone}
      disabled={busy}
      T={resultLayout.T}
      geoms={drawnGeoms}
      nameOf={(row) => groups.find((group) => group.key === row.key)?.name ?? nameOf(row.pieces[0])}
      onClose={() => {
        layersShown = false;
        setLayersOpen(false);
      }}
      onSelect={(row) => pickLayerRow(row.pieces)}
      onMove={moveLayer}
      onMenu={(key, x, y) => setLayerMenu({ key, x, y })}
    />
  );

  const picture = (passThrough?: string) => (
    <StepPictureSvg
      w={canvas.w}
      h={canvas.h}
      pad={pad}
      look='canvas'
      layout={poseShown}
      layers={posePending ? shownPoseLayers : stepPicture?.layers}
      stacked={posePending ? shownPoseStacked : undefined}
      onPainted={movable ? onPainted : undefined}
      geoms={geoms}
      innerLines={innerLines}
      marks={marks}
      {...(topstitchMode
        ? {
            stepEdges: NO_STEP_EDGES,
            stepParts: NO_STEP_PARTS,
            seamless: true,
            actionLines: topstitchActions,
          }
        : {})}
      nos={nos}
      names={groupNames}
      namesBelow={phone}
      ghostName={nameOf}
      bounds={poseBounds}
      hover={spanDrag?.id ?? hover?.id ?? null}
      hoverRange={spanDrag?.range ?? hover?.range ?? null}
      ticks={ticks}
      activeNo={activeIndex >= 0 ? activeIndex : null}
      onClearNo={frozen || !clearActive ? undefined : clearActive}
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
            onContextMenu={onCanvasMenu}
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
                pad={pad}
                bounds={poseBounds ?? poseShown.bbox}
                view={zoom.view}
                layout={poseShown}
                layerOrder={shownPoseLayers}
                geoms={drawnGeoms}
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
            {movable && drawn && (
              <div
                className='absolute top-2 left-3 flex flex-wrap items-center gap-3'
                data-seam-pose-tools=''
              >
                {poseSel && (
                  <>
                    <Button
                      type='button'
                      variant='underline'
                      size='xs'
                      aria-label='turn left'
                      onClick={() => transformPose('left')}
                      disabled={busy}
                    >
                      ⟲
                    </Button>
                    <Button
                      type='button'
                      variant='underline'
                      size='xs'
                      aria-label='turn right'
                      onClick={() => transformPose('right')}
                      disabled={busy}
                    >
                      ⟳
                    </Button>
                    <Button
                      type='button'
                      variant='underline'
                      size='xs'
                      aria-label='mirror'
                      onClick={() => transformPose('mirror')}
                      disabled={busy}
                    >
                      ⇋
                    </Button>
                    <Button
                      type='button'
                      variant='underline'
                      size='xs'
                      onClick={() => transformPose('upright')}
                      disabled={busy}
                    >
                      upright
                    </Button>
                  </>
                )}
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
                {layersOn && (
                  <Chip
                    selected={layersOpen}
                    pressed={layersOpen}
                    onClick={() => {
                      layersShown = !layersOpen;
                      setLayersOpen(!layersOpen);
                    }}
                  >
                    layers
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
            {!phone && layersWindow}
          </div>
        </div>
        {phone && layersWindow}

        <div
          className='sticky bottom-0 box-content flex h-21 flex-none flex-wrap content-center items-center gap-x-3 border-t border-hairline bg-bgColor px-3 pb-[env(safe-area-inset-bottom)] md:gap-4.5 md:px-5'
          data-seam-bar=''
        >
          {error && (
            <Text size='micro' variant='error' className='min-w-0 truncate'>
              {error}
            </Text>
          )}
          {!topstitchMode &&
            listed.map((s) => {
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
          {topstitchMode && (
            <TopstitchLineList
              lines={topstitchLines}
              active={activeSeam}
              frozen={frozen}
              busy={busy}
              textOf={lineText}
              onToggle={(lineKey) => {
                setSel(EMPTY);
                setFilled(null);
                setRefused('');
                setActiveSeam(lineKey);
              }}
              onRemove={removeLine}
            />
          )}
          {(sel.a.length > 0 || sel.b.length > 0) && (
            <ChipRow>
              <Chip
                selected={sel.a.length > 0}
                onClick={() => clearSide('a')}
                disabled={!sel.a.length}
                data-seam-side='1'
              >
                {sel.a.length
                  ? `${topstitchMode ? 'line' : '1'} ${sideName(sel.a)} ${mmText(sideLen(pickParts('a')))}`
                  : topstitchMode
                    ? 'line'
                    : '1'}
              </Chip>
              {!topstitchMode && (
                <Chip
                  selected={sel.b.length > 0}
                  tone={sel.b.length ? 'attention' : 'default'}
                  onClick={() => clearSide('b')}
                  disabled={!sel.b.length}
                  data-seam-side='2'
                >
                  {sel.b.length ? `2 ${sideName(sel.b)} ${mmText(sideLen(pickParts('b')))}` : '2'}
                </Chip>
              )}
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
          {!frozen && !topstitchMode && (suggestion || surfaceSuggestion) && (
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
          {!frozen && !topstitchMode && mirror.visible && mirror.plan.kind === 'no-twin' && (
            <Chip tone='error'>NO TWIN</Chip>
          )}
          {!frozen && !topstitchMode && mirror.visible && mirror.plan.kind === 'edge-mismatch' && (
            <Chip tone='error'>EDGE MISMATCH</Chip>
          )}
          {!frozen && !topstitchMode && mirror.visible && (
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
          {!frozen && !topstitchMode && listed.length > 0 && (
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
          {!frozen && topstitchMode && topstitchLines.length > 0 && (
            <Button
              type='button'
              variant='underline'
              size='xs'
              onClick={() => setClearingLines(true)}
              disabled={busy}
              data-topstitch-clear-all=''
            >
              clear lines
            </Button>
          )}
          {!frozen && (posePending || ownPoseRows.size > 0) && (
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
      {layerMenu && (
        <LayersMenu
          x={layerMenu.x}
          y={layerMenu.y}
          atFront={layerRows[0]?.key === layerMenu.key}
          atBack={layerRows[layerRows.length - 1]?.key === layerMenu.key}
          disabled={busy}
          onMove={(move) => {
            moveLayer(layerMenu.key, move);
            setLayerMenu(null);
          }}
          onClose={closeLayerMenu}
        />
      )}
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
        open={clearingLines}
        onOpenChange={setClearingLines}
        onConfirm={clearLines}
        title='clear lines'
        confirmLabel='clear'
      >
        <ChipRow>
          {topstitchLines.map((line, i) => (
            <PairNo key={line.lineKey} i={i} />
          ))}
        </ChipRow>
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
