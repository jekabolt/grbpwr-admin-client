// THE STEP'S SEAM PICKER v3 «step result» (owner OK 31.10). The canvas is the operation's shared
// result layout: every piece of every input, earlier sewn blocks kept rigid, and the owner's rows
// applied with no crop or automatic turn. The owner's own pick is blue, a stored seam ink bold with
// its number; there is no second RESULT picture.
// Clicking edges collects the sides (with two or more inputs the side is the input's, with one it is
// the piece click order); nothing is picked for the owner — «guess» only fills both sides from the
// proposal, in plain sight. Nothing is stored until «accept» (or Enter), live only with both sides
// picked: then the pair becomes ONE card seam (composite when a side holds several runs, surface when
// one side is an inner line), its key goes onto the step after the ones already there, and the
// picker closes. «place» starts from that same result and moves any rigid input block by hand, with
// or without a pick (snap is optional; ⟲ ⟳ ⇋, upright, layer choice and reset stay pending until
// «done» stores them; the pick stays as it was).

import * as Dialog from '@radix-ui/react-dialog';
import { activeFoldRows, type FoldStep } from 'lib/folds';
import {
  anchorOfRunId,
  newSeamKey,
  poseRow,
  type EdgeAnchor,
  type SidePart,
  type StoredSeam,
} from 'lib/seams';
import { cn } from 'lib/utility';
import { useCallback, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Button, Chip, ChipRow, Close, Placeholder, Text } from 'ui';
import { runsOfSide } from '../assembly-seams/seam-actions';
import { rowPairSig, useSeamsStore } from '../assembly-seams/seams-store';
import { useFoldRows } from '../assembly-folds/folds-store';
import { useOperationWorkCatalog } from '../useOperationWorkCatalog';
import { PairNo } from './pair-no';
import { recordSeamDecision } from './seam-decisions';
import {
  isGuess,
  mirrorLeftPoses,
  mirrorLeftRows,
  pickTarget,
  seamSideName,
  sideForClick,
} from './seam-focus';
import { usePictureZoom } from './picture-zoom';
import { snapAtDuringDrag } from './pose-picking';
import { PoseOverlay } from './pose-overlay';
import { useStepResults } from './step-result-context';
import { useAttachStepPose, useAttachStepSeam } from './step-seams-context';
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
  type NoMark,
} from './step-picture-view';
import { edgeRowFromPick, initialPickerPick, orderedPickSides } from './step-rows';
import { fitSourceOf } from './step-pose';
import { stepPictureOf } from './surface-picture';
import { usePoseEdit } from './use-pose-edit';

type Side = 'a' | 'b';
type Sel = { a: TargetId[]; b: TargetId[] };
const EMPTY: Sel = { a: [], b: [] };

const sameSel = (x: Sel, y: Sel) =>
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
}) {
  const scene = useStepScene(index);
  const stepResults = useStepResults();
  const stepPicture = stepPictureOf(stepResults, index);
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
  const errors = useSeamsStore((s) => s.errors);
  const foldRows = useFoldRows();
  const { catalog: workCatalog } = useOperationWorkCatalog();

  const suggestion = suggestions[initialProposal] ?? suggestions[0] ?? null;
  const unitStep = isUnitStep(groups);
  const initialPick = initialPickerPick(suggestion, preselectProposal, unitStep);
  const [sel, setSel] = useState<Sel>(() => initialPick ?? EMPTY);
  const [hover, setHover] = useState<TargetId | null>(null);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState('');
  // A tile preloads its proposal; GUESS does the same from the manual + seam entry.
  const [filled, setFilled] = useState<Sel | null>(() => initialPick);
  const [mirroredPick, setMirroredPick] = useState<StoredSeam | null>(null);
  const fitSource = useMemo(() => fitSourceOf({ a: sel.a, b: sel.b }), [sel]);
  const poses = scene.poses;
  const stepRows = useMemo(
    () => (op?.seamKeys ?? []).flatMap((key) => byKey.get(key) ?? []),
    [op?.seamKeys, byKey],
  );
  const {
    posing,
    poseEdits,
    handEdits,
    poseLayerEdits,
    poseSel,
    setPoseSel,
    snapOn,
    setSnapOn,
    poseDrag,
    setPoseDrag,
    poseFree,
    poseBounds,
    fitReady,
    ownPoseRows,
    resultLayout,
    poseShown,
    shownPoseLayers,
    shownPoseLower,
    shownPoseStacked,
    layerTarget,
    setLayer,
    exitPose,
    startPose,
    pickupOf,
    dropPose,
    fitPose,
    transformPose,
    resetPose,
    finishPose,
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

  const pieces = geo?.pieces;
  const foldSteps = ops.map((operation) => operation as typeof operation & FoldStep);
  const activeFolds = activeFoldRows(foldSteps, index, foldRows);
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

  // ── what «accept» would write: only what the owner picked ──
  const pick: Sel = sel;
  const inners = [...pick.a, ...pick.b].filter((t) => parseInner(t));
  const surface = inners.length === 1;
  const hostSide: Side | null = surface ? (pick.a.includes(inners[0]) ? 'a' : 'b') : null;
  // The part laid on a line is the piece of the edges picked on the other side — never a fallback.
  const partSide = hostSide ? sel[hostSide === 'a' ? 'b' : 'a'] : [];
  const partKey = partSide.length ? pieceOfTarget(partSide[0]) : null;

  const guessSelection = useMemo<Sel | null>(() => {
    if (suggestion) return { a: [...suggestion.a], b: [...suggestion.b] };
    if (!surfaceSuggestion) return null;
    const line = innerId(surfaceSuggestion.host, surfaceSuggestion.inner);
    const edge = longestEdge(geoms.get(surfaceSuggestion.part));
    const hostAt = sideForClick(surfaceSuggestion.host, groups, EMPTY, pieceOfTarget);
    const part = edge ? [edge] : [];
    return hostAt === 'a' ? { a: [line], b: part } : { a: part, b: [line] };
  }, [suggestion, surfaceSuggestion, geoms, groups]);

  /** The pair on the table: both sides picked by hand, edge to edge. */
  const pair: SeamSides | null =
    !inners.length && sel.a.length && sel.b.length ? { a: sel.a, b: sel.b } : null;
  const canAccept =
    !frozen && !busy && !!cardId && (surface ? !!partKey && pick[hostSide!].length === 1 : !!pair);

  const anchorCtx = useMemo(
    () => ({ pieces: [...geoms.values()], grainDeg: geo?.grainDeg ?? new Map(), nameOf }),
    [geoms, geo?.grainDeg, nameOf],
  );

  const buildRow = useCallback(
    (clicked: Sel): StoredSeam | null => {
      const s = orderedPickSides(clicked, geoms);
      const ins = [...s.a, ...s.b].filter((t) => parseInner(t));
      if (ins.length === 0) return edgeRowFromPick(s, geoms, anchorCtx);
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
    setMirroredPick(null);
  };

  const draftRow = useMemo(
    () => (pair || surface ? buildRow(pick) : null),
    [buildRow, pick, surface],
  );

  const mirrorTargets = useMemo(() => {
    const rows = [...stepRows];
    if (draftRow && !rows.some((row) => rowPairSig(row) === rowPairSig(draftRow)))
      rows.push(draftRow);
    return mirrorLeftRows(rows, [...byKey.values()], geoms);
  }, [stepRows, draftRow, byKey, geoms]);
  const mirrorPoses = useMemo(
    () =>
      mirrorLeftPoses(
        groups.flatMap((group) => group.pieces),
        poses.values(),
        geoms,
      ),
    [groups, poses, geoms],
  );

  const mirrorLeft = async () => {
    if ((!mirrorTargets.length && !mirrorPoses.length) || busy) return;
    const pending = draftRow
      ? mirrorTargets.find((update) => update.row.seamKey === draftRow.seamKey)
      : undefined;
    if (pending) setMirroredPick(pending.row);
    const storedUpdates = mirrorTargets.filter(
      (update) => !draftRow || update.row.seamKey !== draftRow.seamKey,
    );
    const poseRows = mirrorPoses.flatMap((pose) => {
      const pg = geoms.get(pose.piece);
      const hg = geoms.get(pose.host);
      if (!pg || !hg) return [];
      return [
        poseRow({
          seamKey: ownPoseRows.get(pose.piece)?.seamKey ?? newSeamKey(),
          piece: pg,
          host: hg,
          placement: pose.placement,
          grainDeg: geo?.grainDeg,
          layer: pose.layer,
        }),
      ];
    });
    if (!storedUpdates.length && !poseRows.length) return;
    setBusy(true);
    setRefused('');
    for (const update of storedUpdates) {
      if (await attach(update.row)) continue;
      setBusy(false);
      setRefused(useSeamsStore.getState().errors[update.row.seamKey] ?? 'not saved');
      return;
    }
    if (poseRows.length && !(await attachPose(poseRows))) {
      setBusy(false);
      setRefused(useSeamsStore.getState().errors[poseRows[0].seamKey] ?? 'not saved');
      return;
    }
    setBusy(false);
  };

  const commit = async () => {
    if (!canAccept) return;
    const row =
      mirroredPick && draftRow && rowPairSig(mirroredPick) === rowPairSig(draftRow)
        ? mirroredPick
        : draftRow;
    if (!row) {
      setRefused('cannot pair');
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
    onAccepted?.();
    onClose?.();
  };

  // Stable while the selection stands: the canvas keeps its hit layer across hovers (a fresh
  // closure per render re-created every hit path of the picture on each pointer event).
  const toggle = useCallback(
    (id: TargetId) => {
      if (frozen || posing) return;
      const side = sideForClick(pieceOfTarget(id), groups, sel, pieceOfTarget);
      setRefused('');
      setSel(pickTarget(sel, side, id, (t) => !!parseInner(t), pieceOfTarget));
      setMirroredPick(null);
    },
    [frozen, posing, groups, sel],
  );

  // Edges only: no length is drawn on the canvas (the owner, №58); the footer keeps the lengths.
  // Kept until a seam is stored or the selection moves: the canvas keys its layers on these.
  const { marks, nos } = useMemo(() => {
    const marks: EdgeMark[] = [];
    const nos: NoMark[] = [];
    const sideMarks = (ids: readonly TargetId[], tone: EdgeMark['tone']) => {
      ids.forEach((id) => marks.push({ id, tone }));
    };
    // A stored seam reads as a proposal does: its edges, its number on the first.
    stored.forEach((s, i) => {
      sideMarks(s.sides.a, 'stored');
      sideMarks(s.sides.b, 'stored');
      const first = s.sides.a[0] ?? s.sides.b[0];
      if (first) nos.push({ id: first, i });
    });
    sideMarks(sel.a, 'pickFirst');
    sideMarks(sel.b, 'pick');
    return { marks, nos };
  }, [stored, sel]);
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
    ? deltaMm(sideLen(pair.a, pair.b), sideLen(pair.b, pair.a), ease)
    : stored.length === 1 && !sel.a.length && !sel.b.length && edgeToEdge(stored[0].sides)
      ? deltaMm(
          sideLen(stored[0].parts.a, stored[0].parts.b),
          sideLen(stored[0].parts.b, stored[0].parts.a),
          ease,
        )
      : null;
  const empty = !pair && !surface && stored.length === 0 && !sel.a.length && !sel.b.length;

  const [canvasEl, canvas] = useBoxSize();
  const phone = canvas.w > 0 && canvas.w < 600;
  const zoom = usePictureZoom(canvas.w, canvas.h, index);

  // «guess»: the proposal's two sides become the pick, shown as the owner's — nothing is saved.
  const fillGuess = () => {
    if (frozen || posing) return;
    if (!guessSelection) return;
    const next = { a: [...guessSelection.a], b: [...guessSelection.b] };
    setRefused('');
    setSel(next);
    setFilled(next);
    setMirroredPick(null);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest('input, textarea')) return;
    if (!e.metaKey && !e.ctrlKey && !e.altKey && zoom.onKey(e.key)) {
      e.preventDefault();
    } else if (e.key === 'Enter' && posing) {
      e.preventDefault();
      void finishPose();
    } else if (e.key === 'Enter' && canAccept) {
      e.preventDefault();
      void commit();
    }
  };

  const escape = () => {
    if (posing) {
      if (poseSel) setPoseSel(null);
      else exitPose();
      return true;
    }
    if (sel.a.length || sel.b.length) {
      reset();
      return true;
    }
    return false;
  };

  const sideName = (ids: readonly TargetId[]) => seamSideName(ids, geoms, nameOf, pieceOfTarget);
  const seamName = (sides: { a: readonly TargetId[]; b: readonly TargetId[] }) =>
    [sideName(sides.a), sideName(sides.b)].filter(Boolean).join(' · ');
  // The footer lists a pair once: a row stored twice, or the pick of a stored pair, is not repeated.
  const sidesSig = (s: { a: readonly TargetId[]; b: readonly TargetId[] }) =>
    [[...s.a].sort().join('+'), [...s.b].sort().join('+')].sort().join('~');
  const listed = stored.filter(
    (s, i) => stored.findIndex((o) => sidesSig(o.sides) === sidesSig(s.sides)) === i,
  );
  const clearSide = (side: Side) => {
    setSel((current) => ({ ...current, [side]: [] }));
    setFilled(null);
    setMirroredPick(null);
    setRefused('');
  };
  // The step's words as its row shows them («join / seam · armhole»), else the unit it makes.
  const stepName = stepWords(op, workCatalog) || op?.outputUnitName?.trim() || '';

  const loading = geo?.dep.status === 'pending';
  const drawn = resultLayout.T.size > 0;
  const error = refused || stored.map((s) => (errors[s.key] ? 'refused' : '')).find(Boolean) || '';

  const content = (
    <>
      {mode === 'dialog' && (
        <>
          <Dialog.Title className='sr-only'>{`op #${op?.operationNumber ?? ''} seams`}</Dialog.Title>
          <Dialog.Description className='sr-only'>pick edges</Dialog.Description>
        </>
      )}

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

      <div className='flex min-h-0 flex-1 flex-col border border-borderColor bg-bgColor'>
        <div className='flex min-h-0 flex-1'>
          <div
            ref={(node) => {
              canvasEl(node);
              zoom.ref(node);
            }}
            className={cn(
              'relative min-h-0 min-w-0 flex-1 touch-none overflow-hidden select-none',
              zoom.zoomed && 'cursor-grab active:cursor-grabbing',
            )}
            data-seam-picker-canvas=''
            {...zoom.handlers}
          >
            {loading && !drawn ? (
              <div className='absolute inset-0 grid place-items-center'>
                <Placeholder label='loading' />
              </div>
            ) : !drawn ? (
              <div className='absolute inset-0 grid place-items-center'>
                <Placeholder label={groups.length ? 'no pattern' : 'no pieces'} dashed />
              </div>
            ) : posing && poseShown ? (
              <>
                <StepPictureSvg
                  w={canvas.w}
                  h={canvas.h}
                  pad={phone ? 28 : 64}
                  look='canvas'
                  layout={poseShown}
                  layers={shownPoseLayers}
                  lower={shownPoseLower}
                  stacked={shownPoseStacked}
                  geoms={geoms}
                  innerLines={innerLines}
                  ghostName={nameOf}
                  bounds={poseBounds}
                  view={zoom.view}
                  className='absolute inset-0'
                />
                <PoseOverlay
                  w={canvas.w}
                  h={canvas.h}
                  pad={phone ? 28 : 64}
                  bounds={poseBounds ?? poseShown.bbox}
                  view={zoom.view}
                  layout={poseShown}
                  layerOrder={shownPoseLayers}
                  lower={shownPoseLower}
                  geoms={geoms}
                  nameOf={nameOf}
                  selected={poseSel}
                  snapAt={snapAtDuringDrag(poseDrag)}
                  snapSource={fitSource}
                  disabled={frozen || busy}
                  pickupOf={pickupOf}
                  onSelect={(piece) => {
                    setPoseSel(piece);
                    setPoseDrag(null);
                  }}
                  onDrag={(group, D, snap) => setPoseDrag({ group, D, snap })}
                  onDrop={dropPose}
                  snap={snapOn}
                  onCancel={() => setPoseDrag(null)}
                />
              </>
            ) : (
              <StepPictureSvg
                w={canvas.w}
                h={canvas.h}
                pad={phone ? 28 : 64}
                look='canvas'
                layout={resultLayout}
                layers={stepPicture?.layers}
                geoms={geoms}
                innerLines={innerLines}
                marks={marks}
                nos={nos}
                names={groupNames}
                namesBelow={phone}
                ghostName={nameOf}
                hover={hover}
                onHover={setHover}
                onPick={frozen ? undefined : toggle}
                pickTargets={canvasPickTargets}
                view={zoom.view}
                className='absolute inset-0'
              />
            )}
            {drawn && (
              <div className='absolute top-2 right-3 flex items-center gap-3' data-seam-zoom=''>
                <Button
                  type='button'
                  variant='underline'
                  size='xs'
                  onClick={zoom.zoomOut}
                  disabled={!zoom.zoomed}
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
                {zoom.zoomed && (
                  <Button type='button' variant='underline' size='xs' onClick={zoom.fit}>
                    fit
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        <div
          className='sticky bottom-0 box-content flex h-21 flex-none items-center gap-3 border-t border-hairline bg-bgColor px-3 pb-[env(safe-area-inset-bottom)] md:gap-4.5 md:px-5'
          data-seam-bar=''
        >
          {posing ? (
            <>
              {error && (
                <Text size='micro' variant='error' className='min-w-0 truncate'>
                  {error}
                </Text>
              )}
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
              <Button
                type='button'
                variant='underline'
                size='xs'
                onClick={fitPose}
                disabled={!fitReady || busy || frozen}
                data-seam-fit=''
              >
                FIT
              </Button>
              <ChipRow>
                <Chip
                  selected={layerTarget?.layer === 'under'}
                  pressed={layerTarget?.layer === 'under'}
                  onClick={() => setLayer('under')}
                  disabled={!layerTarget || busy}
                >
                  under
                </Chip>
                <Chip
                  selected={layerTarget?.layer === 'over'}
                  pressed={layerTarget?.layer === 'over'}
                  onClick={() => setLayer('over')}
                  disabled={!layerTarget || busy}
                >
                  over
                </Chip>
              </ChipRow>
              <span className='flex-1' />
              <Button
                type='button'
                variant='underline'
                size='xs'
                onClick={() => void resetPose()}
                disabled={
                  (!poseEdits.size &&
                    !handEdits.size &&
                    !poseLayerEdits.size &&
                    !poseFree &&
                    !ownPoseRows.size) ||
                  busy
                }
                data-seam-pose-reset=''
              >
                reset
              </Button>
              <Button
                type='button'
                variant='main'
                size='sm'
                onClick={() => void finishPose()}
                loading={busy}
                data-seam-pose-done=''
              >
                done
              </Button>
            </>
          ) : (
            <>
              {error && (
                <Text size='micro' variant='error' className='min-w-0 truncate'>
                  {error}
                </Text>
              )}
              {listed.map((s) => (
                <span
                  key={s.key}
                  className='flex min-w-0 items-center gap-2'
                  data-seam-stored={s.key}
                >
                  <PairNo i={stored.indexOf(s)} />
                  <Text size='micro' tracking='label' className='min-w-0 truncate uppercase'>
                    {seamName(s.sides)}
                  </Text>
                </span>
              ))}
              <ChipRow>
                <Chip
                  selected={sel.a.length > 0}
                  onClick={() => clearSide('a')}
                  disabled={!sel.a.length}
                  data-seam-side='1'
                >
                  {sel.a.length ? `1 ${sideName(sel.a)} ${mmText(sideLen(sel.a, sel.b))}` : '1'}
                </Chip>
                <Chip
                  selected={sel.b.length > 0}
                  tone={sel.b.length ? 'attention' : 'default'}
                  onClick={() => clearSide('b')}
                  disabled={!sel.b.length}
                  data-seam-side='2'
                >
                  {sel.b.length ? `2 ${sideName(sel.b)} ${mmText(sideLen(sel.b, sel.a))}` : '2'}
                </Chip>
              </ChipRow>
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
              {!frozen && (suggestion || surfaceSuggestion) && !sel.a.length && !sel.b.length && (
                <Button
                  type='button'
                  variant='underline'
                  size='xs'
                  onClick={fillGuess}
                  data-seam-guess=''
                >
                  guess
                </Button>
              )}
              {!frozen && (mirrorTargets.length > 0 || mirrorPoses.length > 0) && (
                <Button
                  type='button'
                  variant='underline'
                  size='xs'
                  onClick={() => void mirrorLeft()}
                  disabled={busy}
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
              {!frozen && drawn && !!cardId && (
                <Button
                  type='button'
                  variant='underline'
                  size='xs'
                  onClick={startPose}
                  disabled={busy}
                  data-seam-pose=''
                >
                  place
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
                  data-seam-accept=''
                >
                  accept
                </Button>
              )}
              {footerActions}
            </>
          )}
        </div>
      </div>
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
        'flex h-120 min-h-0 flex-col bg-bgColor text-textColor',
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
