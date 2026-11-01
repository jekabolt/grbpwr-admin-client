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
import type { Affine, PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';
import { orderSideAlongOutline } from 'lib/assembly-skeleton/union';
import { apply, compose, translate } from 'lib/assembly-skeleton/union/affine';
import {
  anchorOfRunId,
  newSeamKey,
  poseOf,
  poseRow,
  type EdgeAnchor,
  type StoredPose,
  type StoredSeam,
} from 'lib/seams';
import { cn } from 'lib/utility';
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { Button, Chip, ChipRow, Close, Placeholder, Text } from 'ui';
import { rowFromHand, runsOfSide } from '../assembly-seams/seam-actions';
import { rowPairSig, useSeamsStore } from '../assembly-seams/seams-store';
import { edgeOf } from '../assembly-seams/words';
import { useOperationWorkCatalog } from '../useOperationWorkCatalog';
import { PairNo } from './pair-no';
import { recordSeamDecision } from './seam-decisions';
import {
  cycleLayerHit,
  isGuess,
  mirrorLeftPoses,
  mirrorLeftRows,
  pickTarget,
  seamSideName,
  sideForClick,
  type LayerHit,
} from './seam-focus';
import { usePictureZoom } from './picture-zoom';
import {
  decodeHandPlace,
  DEFAULT_HAND,
  isHandSeamKind,
  stepHandsOf,
  withHandPlace,
} from './step-hand';
import { useStepResult } from './step-result-context';
import { useAttachStepPose, useAttachStepSeam } from './step-seams-context';
import {
  pinPoses,
  poseAfterDrop,
  poseBlockGroup,
  posePickup,
  snapPose,
  turnToGrain,
  turnAbout,
  upright,
  type PosePickup,
  type PosePin,
  type PoseSnap,
} from './step-pose';
import { stepWords } from './step-words';
import { StepHintRow } from './step-hint-row';
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
import {
  boxOf,
  fitBox,
  insideRing,
  pathOf,
  seamSig,
  toPx,
  type SeamSides,
  type StepLayout,
} from './step-picture';
import {
  pictureBounds,
  StepPictureSvg,
  useBoxSize,
  useStable,
  useStepLayout,
  useStepScene,
  frameSeamsOf,
  type EdgeMark,
  type NoMark,
  type PictureView,
} from './step-picture-view';

type Side = 'a' | 'b';
type Sel = { a: TargetId[]; b: TargetId[] };
const EMPTY: Sel = { a: [], b: [] };

/** Share of the extent the inputs stand apart on the canvas. */
const EXPLODE = 0.08;

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
}: {
  index: number;
  open: boolean;
  onClose: () => void;
  /** Which of the step's proposals the picker opens on. */
  proposal?: number;
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
        <SeamPickerBody index={index} proposal={initialProposal} mode='dialog' onClose={onClose} />
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function SeamPickerBody({
  index,
  proposal: initialProposal = 0,
  mode = 'inline',
  onClose,
  onAccepted,
  footerActions,
  readOnly = false,
}: {
  index: number;
  /** Which of the step's proposals is selected first. */
  proposal?: number;
  mode?: 'dialog' | 'inline';
  onClose?: () => void;
  onAccepted?: () => void;
  footerActions?: ReactNode;
  readOnly?: boolean;
}) {
  const scene = useStepScene(index);
  const stepResult = useStepResult(index);
  const {
    op,
    geo,
    geoms,
    ops,
    byKey,
    innerLines,
    groups,
    leaves,
    ease,
    stored,
    suggestions,
    surfaceSuggestion,
    innerSeams,
    storedSeams,
    pieceName: nameOf,
  } = scene;
  const frozen = (scene.ctx?.frozen ?? true) || readOnly;
  const cardId = scene.ctx?.cardId;
  const attach = useAttachStepSeam(index);
  const attachPose = useAttachStepPose(index);
  const errors = useSeamsStore((s) => s.errors);
  const { catalog: workCatalog } = useOperationWorkCatalog();

  const [sel, setSel] = useState<Sel>(EMPTY);
  const [hover, setHover] = useState<TargetId | null>(null);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState('');
  // «guess» only fills the pick from the proposal the picker opened on; the owner sees it and accepts.
  const suggestion = suggestions[initialProposal] ?? suggestions[0] ?? null;
  const [filled, setFilled] = useState<Sel | null>(null);
  const [mirroredPick, setMirroredPick] = useState<StoredSeam | null>(null);
  // «place» (P8): pieces moved by hand, kept here until «done».
  const [posing, setPosing] = useState(false);
  const [poseEdits, setPoseEdits] = useState<Map<string, PosePin>>(() => new Map());
  const [handEdits, setHandEdits] = useState<Map<string, StoredSeam>>(() => new Map());
  const [poseSel, setPoseSel] = useState<string | null>(null);
  const [snapOn, setSnapOn] = useState(false);
  const [poseSnap, setPoseSnap] = useState<Pt2 | null>(null);
  const [poseDrag, setPoseDrag] = useState<{ group: string[]; D: Affine } | null>(null);
  // A step of one block has nothing to sit against: its drag moves the whole picture, stored nowhere.
  const [poseFree, setPoseFree] = useState<Affine | null>(null);
  const [poseBounds, setPoseBounds] = useState<ReturnType<typeof pictureBounds>>();

  const pieces = geo?.pieces;
  const lenOf = useCallback(
    (id: TargetId) => {
      const inner = parseInner(id);
      return inner
        ? polyLen(pieces?.get(inner.piece)?.inner[inner.k] ?? [])
        : edgeOf(id, geoms)?.lenMm ?? 0;
    },
    [pieces, geoms],
  );
  // A stack of identical plies runs one layer long (the model's own count).
  const sideLen = (ids: readonly TargetId[]) =>
    targetsLen(ids, geoms, (piece, k) => polyLen(pieces?.get(piece)?.inner[k] ?? []));

  // ── what «accept» would write: only what the owner picked ──
  const pick: Sel = sel;
  const inners = [...pick.a, ...pick.b].filter((t) => parseInner(t));
  const surface = inners.length === 1;
  const hostSide: Side | null = surface ? (pick.a.includes(inners[0]) ? 'a' : 'b') : null;
  // The part laid on a line is the piece of the edges picked on the other side — never a fallback.
  const partSide = hostSide ? sel[hostSide === 'a' ? 'b' : 'a'] : [];
  const partKey = partSide.length ? pieceOfTarget(partSide[0]) : null;

  /** The pair on the table: both sides picked by hand, edge to edge. */
  const pair: SeamSides | null =
    !inners.length && sel.a.length && sel.b.length ? { a: sel.a, b: sel.b } : null;
  const canAccept =
    !frozen && !busy && !!cardId && (surface ? !!partKey && pick[hostSide!].length === 1 : !!pair);

  // The legacy frame remains only as the loading/outside-provider fallback. Its stored placements
  // match the old canvas while the shared result is unavailable.
  const poses = scene.poses;
  const savedHands = useMemo(
    () => stepHandsOf(ops, index, byKey, poses),
    [ops, index, byKey, poses],
  );
  // This step's stored pose rows retain their key when PLACE updates them.
  const ownPoseRows = useMemo(() => {
    const out = new Map<string, StoredPose>();
    for (const key of op?.poseKeys ?? []) {
      const row = poses.get(key);
      const pose = row ? poseOf(row) : null;
      if (row && pose) out.set(pose.piece, row);
    }
    return out;
  }, [op?.poseKeys, poses]);

  const anchorCtx = useMemo(
    () => ({ pieces: [...geoms.values()], grainDeg: geo?.grainDeg ?? new Map(), nameOf }),
    [geoms, geo?.grainDeg, nameOf],
  );

  const buildRow = useCallback(
    (clicked: Sel): StoredSeam | null => {
      // Edges clicked out of order still run along each piece's outline.
      const along = (ids: readonly TargetId[]) => {
        const byPiece = new Map<string, TargetId[]>();
        ids.forEach((id) =>
          byPiece.set(pieceOfTarget(id), [...(byPiece.get(pieceOfTarget(id)) ?? []), id]),
        );
        return [...byPiece.values()].flatMap((run) => orderSideAlongOutline(run, geoms));
      };
      const s: Sel = { a: along(clicked.a), b: along(clicked.b) };
      const ins = [...s.a, ...s.b].filter((t) => parseInner(t));
      if (ins.length === 0) {
        return rowFromHand(s.a, s.b, geoms, anchorCtx, { direction: 'reversed' });
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
    setMirroredPick(null);
  };

  const draftRow = useMemo(
    () => (pair || surface ? buildRow(pick) : null),
    [buildRow, pick, surface],
  );

  const stepRows = useMemo(
    () => (op?.seamKeys ?? []).flatMap((key) => byKey.get(key) ?? []),
    [op?.seamKeys, byKey],
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

  const toggle = (id: TargetId) => {
    if (frozen || posing) return;
    const side = sideForClick(pieceOfTarget(id), groups, sel, pieceOfTarget);
    setRefused('');
    setSel(pickTarget(sel, side, id, (t) => !!parseInner(t), pieceOfTarget));
    setMirroredPick(null);
  };

  // The old frame is retained only as a fallback outside the card-level result provider.
  const frameRaw = frameSeamsOf(innerSeams, storedSeams, [], []);
  const frameSeams = useStable(frameRaw, seamSig(frameRaw));
  const fallbackLayout = useStepLayout(leaves, frameSeams, geoms, EXPLODE, undefined, savedHands);
  const canvasLayout = stepResult?.layout ?? fallbackLayout;
  const poseLayers = useMemo(
    () => stepResult?.layers ?? [...canvasLayout.T.keys()],
    [stepResult?.layers, canvasLayout],
  );
  const poseBlocks = useMemo(
    () => stepResult?.blocks ?? groups.map((group) => ({ pieces: group.pieces })),
    [stepResult?.blocks, groups],
  );
  const poseHung = useMemo(
    () => stepResult?.hung ?? canvasLayout.hung ?? [],
    [stepResult?.hung, canvasLayout.hung],
  );
  // PLACE starts from the exact result transforms. Unsaved drops are pinned over a fresh map so
  // the shared cached result remains immutable.
  const poseLayout = useMemo(() => {
    if (!posing) return null;
    const T = new Map(canvasLayout.T);
    pinPoses(T, poseEdits, geoms, poseHung, {
      groupOf: (piece, host) => poseBlockGroup(piece, host, { blocks: poseBlocks, hung: poseHung }),
    });
    return { ...canvasLayout, T };
  }, [posing, canvasLayout, poseEdits, geoms, poseHung, poseBlocks]);
  const poseShown = useMemo(() => {
    if (!poseLayout || (!poseDrag && !poseFree)) return poseLayout;
    const T = new Map(poseLayout.T);
    if (poseFree) for (const [k, t] of T) T.set(k, compose(poseFree, t));
    for (const k of poseDrag?.group ?? []) {
      const t = T.get(k);
      if (t) T.set(k, compose(poseDrag!.D, t));
    }
    return { ...poseLayout, T };
  }, [poseLayout, poseDrag, poseFree]);
  const marks: EdgeMark[] = [];
  const nos: NoMark[] = [];
  // One label per side, on its longest edge that is drawn (a neckline's on the back neck, not on
  // a front's end of it; a piece laid apart has none).
  const sideMarks = (ids: readonly TargetId[], tone: EdgeMark['tone']) => {
    let at = 0;
    let longest = -1;
    ids.forEach((id, k) => {
      if (!canvasLayout.T.has(pieceOfTarget(id))) return;
      const l = lenOf(id);
      if (l > longest) {
        longest = l;
        at = k;
      }
    });
    ids.forEach((id, k) =>
      marks.push({ id, tone, label: k === at ? mmText(sideLen(ids)) : undefined }),
    );
  };
  // A stored seam reads as a proposal does: its edges with their lengths, its number on the first.
  stored.forEach((s, i) => {
    sideMarks(s.sides.a, 'stored');
    sideMarks(s.sides.b, 'stored');
    const first = s.sides.a[0] ?? s.sides.b[0];
    if (first) nos.push({ id: first, i });
  });
  sideMarks(sel.a, 'pick');
  sideMarks(sel.b, 'pick');

  // Edge to edge on both sides (a part on its host's line has no Δ).
  const edgeToEdge = (s: { a: readonly TargetId[]; b: readonly TargetId[] }) =>
    s.a.length > 0 && s.b.length > 0 && [...s.a, ...s.b].every((id) => !parseInner(id));
  const delta = pair
    ? deltaMm(sideLen(pair.a), sideLen(pair.b), ease)
    : stored.length === 1 && edgeToEdge(stored[0].sides)
      ? deltaMm(sideLen(stored[0].sides.a), sideLen(stored[0].sides.b), ease)
      : null;
  const empty = !pair && !surface && stored.length === 0 && !sel.a.length && !sel.b.length;

  const [canvasEl, canvas] = useBoxSize();
  const phone = canvas.w > 0 && canvas.w < 600;
  const zoom = usePictureZoom(canvas.w, canvas.h, index);

  // ── «place» (P8): any piece moved by hand, stored as a pose on «done»; the pick is left as it is ──
  const exitPose = () => {
    setPosing(false);
    setPoseEdits(new Map());
    setHandEdits(new Map());
    setPoseFree(null);
    setPoseSel(null);
    setSnapOn(false);
    setPoseSnap(null);
    setPoseDrag(null);
    setPoseBounds(undefined);
  };
  const startPose = () => {
    if (posing) return;
    setRefused('');
    setPoseEdits(new Map());
    setHandEdits(new Map());
    setPoseFree(null);
    setPoseSel(null);
    setSnapOn(false);
    setPoseSnap(null);
    setPoseBounds(pictureBounds(canvasLayout, geoms, 'canvas'));
    setPosing(true);
  };
  const pickupOf = (piece: string): PosePickup =>
    posePickup(
      piece,
      { blocks: poseBlocks, transforms: poseLayout?.T ?? canvasLayout.T, hung: poseHung },
      geoms,
    );
  const putPose = (piece: string, T: Affine, pickup: PosePickup) => {
    const dropped = poseAfterDrop(
      piece,
      T,
      pickup,
      { transforms: poseLayout?.T ?? canvasLayout.T },
      geoms,
    );
    if (!dropped) {
      setRefused('no host');
      return;
    }
    setRefused('');
    setPoseEdits((current) => {
      const next = new Map(current);
      next.set(piece, { host: dropped.host, placement: dropped.placement });
      return next;
    });
  };
  const dropPose = (piece: string, pickup: PosePickup, D: Affine, snap: PoseSnap | null) => {
    setPoseDrag(null);
    if (!pickup.host) {
      setPoseFree((free) => (free ? compose(D, free) : D));
      return;
    }
    const T0 = poseLayout?.T.get(piece);
    if (!T0) return;
    const moved = snap ? compose(translate(snap.dx, snap.dy), D) : D;
    putPose(piece, compose(moved, T0), pickup);
    setPoseSnap(snapOn && snap ? snap.at : null);
  };
  const transformPose = (command: 'left' | 'right' | 'mirror' | 'upright') => {
    const piece = poseSel;
    const free = piece ? !pickupOf(piece).host : false;
    const T0 = piece ? (free ? poseShown : poseLayout)?.T.get(piece) : undefined;
    const g = piece ? geoms.get(piece) : undefined;
    if (!piece || !T0 || !g || busy) return;
    const D =
      command === 'left'
        ? turnToGrain(g, T0, 1)
        : command === 'right'
          ? turnToGrain(g, T0, -1)
          : command === 'upright'
            ? upright(g, T0)
            : turnAbout(
                g.rs.map((point) => apply(T0, point)),
                0,
              );
    setPoseSnap(null);
    if (free) setPoseFree((current) => (current ? compose(D, current) : D));
    else putPose(piece, compose(D, T0), pickupOf(piece));
  };

  const editedStepRows = stepRows.map((row) => handEdits.get(row.seamKey) ?? row);
  const layerTarget = (() => {
    const piece = poseSel;
    const host = piece ? pickupOf(piece).host : null;
    if (!piece || !host) return null;
    for (const row of editedStepRows) {
      if (!isHandSeamKind(row.kind)) continue;
      for (const [own, other] of [
        [row.sideA, row.sideB],
        [row.sideB, row.sideA],
      ] as const) {
        const anchor = own.find((candidate) => candidate.piece === piece);
        if (!anchor || !other.some((candidate) => candidate.piece === host)) continue;
        return { row, piece, host, hand: decodeHandPlace(anchor.placement) ?? DEFAULT_HAND };
      }
    }
    return null;
  })();
  const setLayer = (inside: boolean) => {
    if (!layerTarget || busy) return;
    const row = withHandPlace(layerTarget.row, layerTarget.piece, {
      ...layerTarget.hand,
      inside,
    });
    setHandEdits((current) => new Map(current).set(row.seamKey, row));
  };
  const shownPoseLayers = useMemo(() => {
    const order = [...poseLayers];
    const move = (piece: string, host: string, under: boolean) => {
      const from = order.indexOf(piece);
      if (from < 0 || !order.includes(host)) return;
      order.splice(from, 1);
      const at = order.indexOf(host);
      order.splice(under ? at : at + 1, 0, piece);
    };
    for (const row of handEdits.values())
      for (const [own, other] of [
        [row.sideA, row.sideB],
        [row.sideB, row.sideA],
      ] as const)
        for (const anchor of own) {
          const hand = decodeHandPlace(anchor.placement);
          const host = other.find((candidate) => candidate.piece !== anchor.piece)?.piece;
          if (hand && host) move(anchor.piece, host, hand.inside);
        }
    return order;
  }, [poseLayers, handEdits]);

  const resetPose = () => {
    if (busy) return;
    setPoseFree(null);
    const selected = poseSel ? new Set(pickupOf(poseSel).group) : null;
    setPoseEdits((current) => {
      if (!selected) return new Map();
      const next = new Map(current);
      for (const piece of current.keys())
        if (pickupOf(piece).group.some((member) => selected.has(member))) next.delete(piece);
      return next;
    });
    setHandEdits((current) => {
      if (!selected) return new Map();
      const next = new Map(current);
      for (const [key, row] of current)
        if ([...row.sideA, ...row.sideB].some((anchor) => selected.has(anchor.piece)))
          next.delete(key);
      return next;
    });
    setPoseSnap(null);
  };
  const finishPose = async () => {
    if (!posing || busy) return;
    const put: StoredPose[] = [];
    for (const [piece, pin] of poseEdits) {
      const own = ownPoseRows.get(piece);
      const pg = geoms.get(piece);
      const hg = geoms.get(pin.host);
      if (!pg || !hg) continue;
      put.push(
        poseRow({
          seamKey: own?.seamKey ?? newSeamKey(),
          piece: pg,
          host: hg,
          placement: pin.placement,
          grainDeg: geo?.grainDeg,
        }),
      );
    }
    if (!put.length && !handEdits.size) {
      exitPose();
      return;
    }
    setBusy(true);
    setRefused('');
    for (const row of handEdits.values()) {
      if (await attach(row)) continue;
      setBusy(false);
      setRefused(useSeamsStore.getState().errors[row.seamKey] ?? 'not saved');
      return;
    }
    const ok = !put.length || (await attachPose(put));
    setBusy(false);
    if (!ok) {
      const key = put[0]?.seamKey ?? '';
      setRefused(useSeamsStore.getState().errors[key] ?? 'not saved');
      return;
    }
    exitPose();
  };

  // «guess»: the proposal's two sides become the pick, shown as the owner's — nothing is laid or saved.
  const fillGuess = () => {
    if (frozen || posing) return;
    const next: Sel | null = suggestion
      ? { a: [...suggestion.a], b: [...suggestion.b] }
      : surfaceSuggestion
        ? (() => {
            const line = innerId(surfaceSuggestion.host, surfaceSuggestion.inner);
            const edge = longestEdge(geoms.get(surfaceSuggestion.part));
            const hostAt = sideForClick(surfaceSuggestion.host, groups, EMPTY, pieceOfTarget);
            const part = edge ? [edge] : [];
            return hostAt === 'a' ? { a: [line], b: part } : { a: part, b: [line] };
          })()
        : null;
    if (!next) return;
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
  const drawn = canvasLayout.T.size > 0;
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
        <StepHintRow op={op} />
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
                  geoms={geoms}
                  nameOf={nameOf}
                  selected={poseSel}
                  snapAt={poseDrag ? null : poseSnap}
                  disabled={frozen || busy}
                  pickupOf={pickupOf}
                  onSelect={(piece) => {
                    setPoseSel(piece);
                    setPoseSnap(null);
                  }}
                  onDrag={(group, D) => setPoseDrag({ group, D })}
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
                layout={canvasLayout}
                layers={stepResult?.layers}
                geoms={geoms}
                innerLines={innerLines}
                marks={marks}
                nos={nos}
                names={groups.map((g) => g.name)}
                namesBelow={phone}
                ghostName={nameOf}
                hover={hover}
                onHover={setHover}
                onPick={frozen ? undefined : toggle}
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
                  setPoseSnap(null);
                }}
                disabled={busy}
              >
                snap
              </Chip>
              <ChipRow>
                <Chip
                  selected={!!layerTarget?.hand.inside}
                  pressed={!!layerTarget?.hand.inside}
                  onClick={() => setLayer(true)}
                  disabled={!layerTarget || busy}
                >
                  under
                </Chip>
                <Chip
                  selected={!!layerTarget && !layerTarget.hand.inside}
                  pressed={!!layerTarget && !layerTarget.hand.inside}
                  onClick={() => setLayer(false)}
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
                onClick={resetPose}
                disabled={(!poseEdits.size && !handEdits.size && !poseFree) || busy}
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
                  {sel.a.length ? `1 ${sideName(sel.a)} ${mmText(sideLen(sel.a))}` : '1'}
                </Chip>
                <Chip
                  selected={sel.b.length > 0}
                  onClick={() => clearSide('b')}
                  disabled={!sel.b.length}
                  data-seam-side='2'
                >
                  {sel.b.length ? `2 ${sideName(sel.b)} ${mmText(sideLen(sel.b))}` : '2'}
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

/** A drop snaps within this many screen px (P8 pose). */
const POSE_SNAP_PX = 8;

/**
 * «place» (P8): every drawn piece a handle — a press selects it, a drag moves
 * it with the pieces hung on it, a drop snaps a vertex of theirs onto another piece's vertex or
 * outline within POSE_SNAP_PX. The picture under it is the same layout with the drag laid in.
 */
function PoseOverlay({
  w,
  h,
  pad,
  bounds,
  view,
  layout,
  layerOrder,
  geoms,
  nameOf,
  selected,
  snapAt,
  snap,
  disabled,
  pickupOf,
  onSelect,
  onDrag,
  onDrop,
  onCancel,
}: {
  w: number;
  h: number;
  pad: number;
  bounds: ReturnType<typeof boxOf>;
  /** The canvas zoom: the overlay sits over the picture as zoomed (screen = fitted × k + x, y). */
  view: PictureView;
  layout: StepLayout;
  /** Bottom to top, from the shared step result. */
  layerOrder: readonly string[];
  geoms: ReadonlyMap<string, PieceGeom>;
  nameOf: (piece: string) => string;
  selected: string | null;
  snapAt: Pt2 | null;
  snap: boolean;
  disabled: boolean;
  pickupOf: (piece: string) => PosePickup;
  onSelect: (piece: string | null) => void;
  onDrag: (group: string[], D: Affine) => void;
  onDrop: (piece: string, pickup: PosePickup, D: Affine, snap: PoseSnap | null) => void;
  onCancel: () => void;
}) {
  const fit = useMemo(() => {
    const f = fitBox(bounds, w, h, pad);
    return { s: f.s * view.k, tx: f.tx * view.k + view.x, ty: f.ty * view.k + view.y };
  }, [bounds, w, h, pad, view.k, view.x, view.y]);
  const stacked = useMemo(() => new Set(layout.stacked.flatMap((g) => g.slice(1))), [layout]);
  const pieces = useMemo(() => {
    const keys = [...layout.T.keys()];
    const present = new Set(keys);
    const ordered = new Set(layerOrder.filter((piece) => present.has(piece)));
    const bottomToTop = [
      ...keys.filter((piece) => !ordered.has(piece)),
      ...layerOrder.filter((piece) => present.has(piece)),
    ];
    return bottomToTop.flatMap((piece) => {
      const transform = layout.T.get(piece)!;
      const geom = geoms.get(piece);
      if (!geom || geom.rs.length < 3) return [];
      return [{ piece, ring: geom.rs.map((point) => toPx(fit, apply(transform, point))) }];
    });
  }, [layout, layerOrder, geoms, fit]);
  const lastHit = useRef<LayerHit | null>(null);
  const drag = useRef<{
    piece: string;
    pickup: PosePickup;
    clientX: number;
    clientY: number;
    moved: boolean;
    /** The shift last handed to `onDrag`: the layout drawn under the drop carries it. */
    D: Affine;
  } | null>(null);
  const scale = Math.max(fit.s, 1e-6);
  const shiftOf = (e: PointerEvent, state: NonNullable<typeof drag.current>): Affine =>
    translate((e.clientX - state.clientX) / scale, -(e.clientY - state.clientY) / scale);

  const finish = (cancelled = false) => {
    const state = drag.current;
    if (!state) return;
    drag.current = null;
    if (cancelled || state.moved) lastHit.current = null;
    if (cancelled || !state.moved) {
      onCancel();
      return;
    }
    const D = state.D;
    const group = new Set(state.pickup.group);
    // The layout under the drag already carries D: the dragged rings are read as drawn.
    const ringOf = (k: string, T: Affine) => (geoms.get(k)?.rs ?? []).map((p) => apply(T, p));
    const moving = state.pickup.group.flatMap((k) => {
      const T = layout.T.get(k);
      return T ? ringOf(k, T) : [];
    });
    const others = [...layout.T].flatMap(([k, T]) =>
      group.has(k) || stacked.has(k) || (geoms.get(k)?.rs.length ?? 0) < 3
        ? []
        : [{ piece: k, ring: ringOf(k, T) }],
    );
    onDrop(
      state.piece,
      state.pickup,
      D,
      snap ? snapPose(moving, others, POSE_SNAP_PX / scale) : null,
    );
  };

  if (w < 2 || h < 2) return null;
  const selectedRing = pieces.find((item) => item.piece === selected)?.ring;
  const snapPx = snapAt ? toPx(fit, snapAt) : null;
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className='absolute inset-0 touch-none'
      onPointerMove={(e) => {
        const state = drag.current;
        if (!state) return;
        if (!state.moved && Math.hypot(e.clientX - state.clientX, e.clientY - state.clientY) <= 2)
          return;
        state.moved = true;
        lastHit.current = null;
        state.D = shiftOf(e, state);
        onDrag(state.pickup.group, state.D);
      }}
      onPointerUp={() => finish()}
      onPointerCancel={() => finish(true)}
      data-seam-pose-canvas=''
    >
      {pieces.map((item) => (
        <path
          key={item.piece}
          d={pathOf(item.ring, true)}
          fill='transparent'
          stroke='transparent'
          pointerEvents='all'
          tabIndex={0}
          role='button'
          aria-label={nameOf(item.piece)}
          aria-pressed={selected === item.piece}
          className={cn(
            disabled ? 'cursor-pointer' : 'cursor-move',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-textColor',
          )}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            e.stopPropagation();
            lastHit.current = null;
            onSelect(selected === item.piece ? null : item.piece);
          }}
          onPointerDown={(e) => {
            e.preventDefault();
            // A press on a piece moves it; only a press on the empty canvas pans.
            e.stopPropagation();
            const svg = e.currentTarget.ownerSVGElement;
            const rect = svg?.getBoundingClientRect();
            const at: [number, number] = rect
              ? [
                  ((e.clientX - rect.left) * w) / Math.max(rect.width, 1),
                  ((e.clientY - rect.top) * h) / Math.max(rect.height, 1),
                ]
              : [e.clientX, e.clientY];
            const hits = [...pieces]
              .reverse()
              .filter((candidate) => insideRing(at, candidate.ring))
              .map((candidate) => candidate.piece);
            if (!hits.includes(item.piece)) hits.push(item.piece);
            const piece = cycleLayerHit(hits, at, lastHit.current) ?? item.piece;
            lastHit.current = { piece, at };
            onSelect(piece);
            if (disabled) return;
            e.currentTarget.setPointerCapture?.(e.pointerId);
            drag.current = {
              piece,
              pickup: pickupOf(piece),
              clientX: e.clientX,
              clientY: e.clientY,
              moved: false,
              D: [1, 0, 0, 1, 0, 0],
            };
          }}
          data-seam-pose-piece={item.piece}
        />
      ))}
      {selectedRing && (
        <path
          d={pathOf(selectedRing, true)}
          fill='none'
          stroke='var(--color-warning)'
          strokeWidth={2.6}
          strokeLinejoin='round'
          pointerEvents='none'
          data-seam-pose-selected=''
        />
      )}
      {snapPx && (
        <circle
          cx={snapPx[0]}
          cy={snapPx[1]}
          r={6}
          fill='none'
          stroke='var(--color-warning)'
          strokeWidth={2.4}
          pointerEvents='none'
          data-seam-pose-snap-at=''
        />
      )}
    </svg>
  );
}
