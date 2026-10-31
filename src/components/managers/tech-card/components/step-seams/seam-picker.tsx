// THE STEP'S SEAM PICKER v2 «step picture» (owner OK 27.10). The step's inputs drawn as units — each
// input one shape, its pieces as assembled, one human name — every piece of every input on the
// canvas, laid only along the owner's stored seams (a step with none shows its inputs apart);
// RESULT shows them joined. The owner's own pick is blue, a stored seam ink bold with its number.
// Clicking edges collects the sides (with two or more inputs the side is the input's, with one it is
// the A / B switch); nothing is picked for the owner — «guess» only fills both sides from the
// proposal, in plain sight. Nothing is stored until «accept» (or Enter), live only with both sides
// picked: then the pair becomes ONE card seam (composite when a side holds several runs, surface when
// one side is an inner line), its key goes onto the step after the ones already there, and the
// picker closes. «place» moves any piece of the step by hand, with or without a pick (P8 pose: snap
// onto an edge or a vertex, ⟲ ⟳ ⇋, «auto» back to the layout, «done» stores the poses, the pick
// stays as it was).

import * as Dialog from '@radix-ui/react-dialog';
import type { Affine, PieceGeom, Pt2, SeamCandidate } from 'lib/assembly-skeleton/types';
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
import { Button, Close, Placeholder, Text, ViewSwitch } from 'ui';
import { rowFromHand, runsOfSide } from '../assembly-seams/seam-actions';
import { useSeamsStore } from '../assembly-seams/seams-store';
import { edgeOf } from '../assembly-seams/words';
import { useOperationWorkCatalog } from '../useOperationWorkCatalog';
import { PairNo } from './pair-no';
import { recordSeamDecision } from './seam-decisions';
import { isGuess, pickTarget } from './seam-focus';
import { usePictureZoom } from './picture-zoom';
import {
  DEFAULT_HAND,
  stepHandsOf,
  handTargetsOf,
  isHandSeamKind,
  pickHandTarget,
  sameHand,
  twinRowOf,
  type HandOn,
  type HandPlace,
  type HandTarget,
  withHandPlace,
} from './step-hand';
import { useAttachStepPose, useAttachStepSeam } from './step-seams-context';
import {
  poseAt,
  poseGroup,
  poseHostOf,
  posePinsOf,
  snapPose,
  turnAbout,
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
  sideOf,
  surfaceRow,
  type Pt,
  type TargetId,
  targetsLen,
} from './step-seams-model';
import {
  boxOf,
  fitBox,
  pathOf,
  seamOfSides,
  seamSig,
  stepLayout,
  surfaceSeam,
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
const SIDES = [
  { value: 'a', label: 'side A' },
  { value: 'b', label: 'side B' },
] as const;

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

/** Stored placements with this session's edits on top (null: cleared). */
const withOverrides = (
  base: ReadonlyMap<string, HandOn>,
  edits: ReadonlyMap<string, HandOn | null>,
): Map<string, HandOn> => {
  const next = new Map(base);
  for (const [piece, place] of edits) {
    if (place) next.set(piece, place);
    else next.delete(piece);
  }
  return next;
};

const handsOnRow = (
  row: StoredSeam,
  hand: ReadonlyMap<string, HandPlace | null>,
  pieces: ReadonlySet<string>,
) => {
  let next = row;
  for (const [piece, place] of hand)
    if (pieces.has(piece)) next = withHandPlace(next, piece, place ?? undefined);
  return next;
};

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
  const [chosen, setChosen] = useState<Side>('a');
  const [hover, setHover] = useState<TargetId | null>(null);
  const [selectedPiece, setSelectedPiece] = useState<string | null>(null);
  const [handOverrides, setHandOverrides] = useState<Map<string, HandOn | null>>(() => new Map());
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState('');
  // «guess» only fills the pick from the proposal the picker opened on; the owner sees it and accepts.
  const suggestion = suggestions[initialProposal] ?? suggestions[0] ?? null;
  const [filled, setFilled] = useState<Sel | null>(null);
  // «place» (P8): pieces moved by hand, kept here until «done».
  const [posing, setPosing] = useState(false);
  const [poseEdits, setPoseEdits] = useState<Map<string, PosePin | null>>(() => new Map());
  const [poseSel, setPoseSel] = useState<string | null>(null);
  const [poseSnap, setPoseSnap] = useState<Pt2 | null>(null);
  const [poseDrag, setPoseDrag] = useState<{ group: string[]; D: Affine } | null>(null);

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
  const host = surface ? parseInner(inners[0]) : null;
  // The part laid on a line is the piece of the edges picked on the other side — never a fallback.
  const partSide = hostSide ? sel[hostSide === 'a' ? 'b' : 'a'] : [];
  const partKey = partSide.length ? pieceOfTarget(partSide[0]) : null;

  /** The pair on the table: both sides picked by hand, edge to edge. */
  const pair: SeamSides | null =
    !inners.length && sel.a.length && sel.b.length ? { a: sel.a, b: sel.b } : null;
  const canAccept =
    !frozen && !busy && !!cardId && (surface ? !!partKey && pick[hostSide!].length === 1 : !!pair);

  // Hand placements: this step's and the earlier ones' (a later step inherits them); the twins read
  // the whole card's (the right bag mirrors the left one placed a step later).
  const poses = scene.poses;
  const savedHands = useMemo(
    () => stepHandsOf(ops, index, byKey, poses),
    [ops, index, byKey, poses],
  );
  const storedHand = savedHands.hand;
  const cardHand = savedHands.twinHand;
  const hand = useMemo(() => withOverrides(storedHand, handOverrides), [storedHand, handOverrides]);
  const twinHand = useMemo(() => withOverrides(cardHand, handOverrides), [cardHand, handOverrides]);
  // Poses (P8): the earlier steps' and this one's, with the pieces moved here and not yet stored.
  const inheritedPose = useMemo(() => posePinsOf(ops.slice(0, index), poses), [ops, index, poses]);
  const ownPoseRows = useMemo(() => {
    const out = new Map<string, StoredPose>();
    for (const key of op?.poseKeys ?? []) {
      const row = poses.get(key);
      const pose = row ? poseOf(row) : null;
      if (row && pose) out.set(pose.piece, row);
    }
    return out;
  }, [op?.poseKeys, poses]);
  const savedPose = savedHands.pose;
  const livePose = useMemo(() => {
    const next = new Map(savedPose ?? []);
    for (const [piece, pin] of poseEdits) {
      next.delete(piece);
      const now = pin ?? inheritedPose.get(piece);
      if (now) next.set(piece, now);
    }
    return next;
  }, [savedPose, poseEdits, inheritedPose]);
  const laidHands = useMemo(
    () => ({ hand, twinHand, ...(livePose.size ? { pose: livePose } : {}) }),
    [hand, twinHand, livePose],
  );
  const pairPieces = useMemo(
    () => new Set(pair ? [...pair.a, ...pair.b].map(pieceOfTarget) : []),
    [pair],
  );

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
        const row = rowFromHand(s.a, s.b, geoms, anchorCtx, { direction: 'reversed' });
        return row ? handsOnRow(row, handOverrides, pairPieces) : null;
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
    [geoms, anchorCtx, pieces, geo, partKey, handOverrides, pairPieces],
  );

  const reset = () => {
    setSel(EMPTY);
    setSelectedPiece(null);
    setHandOverrides(new Map());
    setChosen('a');
    setRefused('');
    setFilled(null);
  };

  const commit = async () => {
    if (!canAccept) return;
    const row = buildRow(pick);
    if (!row) {
      setRefused('cannot pair');
      return;
    }
    setBusy(true);
    setRefused('');
    const ok = await attach(row);
    // A twin's seam already stored on this step takes the mirrored placement too.
    const twins = ok
      ? [...handOverrides].flatMap(([piece, place]) => {
          if (!pairPieces.has(piece)) return [];
          const t = twinWrite(
            piece,
            place?.partner,
            place ?? undefined,
            storedHand.get(piece),
            row.seamKey,
          );
          return t ? [t] : [];
        })
      : [];
    const twinsOk = twins.length && scene.ctx ? await scene.ctx.writes.upsert(twins) : true;
    setBusy(false);
    if (!ok || !twinsOk) {
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
    const side = sideOf(pieceOfTarget(id), groups, chosen);
    setRefused('');
    const has = sel[side].includes(id);
    setSel(pickTarget(sel, side, id, (t) => !!parseInner(t), pieceOfTarget));
    // One input: the first pick on A moves the switch to B.
    if (!has && groups.length < 2 && side === 'a' && sel.a.length === 0) setChosen('b');
  };

  // ── the canvas: every piece of every input; laid only along the owner's stored seams (and the
  // ones sewn inside an input), so a step with no row shows its inputs apart ──
  const frameRaw = frameSeamsOf(innerSeams, storedSeams, [], []);
  const frameSeams = useStable(frameRaw, seamSig(frameRaw));
  const layout = useStepLayout(leaves, frameSeams, geoms, EXPLODE, undefined, laidHands);
  // A surface pick lies on its host's line in RESULT, centred on the line.
  const pairSeam =
    surface && host && partKey
      ? surfaceSeam(
          host.piece,
          partKey,
          innerLines.get(host.piece)?.[host.k] ?? [],
          geoms,
          undefined,
          sel[hostSide === 'a' ? 'b' : 'a'][0],
        )
      : pair
        ? seamOfSides(pair, geoms, innerLines)
        : null;
  const resultRaw = [...innerSeams, ...storedSeams, ...(pairSeam ? [pairSeam] : [])];
  const resultSeams = useStable<SeamCandidate[]>(resultRaw, seamSig(resultRaw));
  const handTargets = useMemo(() => handTargetsOf(resultSeams, geoms), [resultSeams, geoms]);
  const joined = useMemo(
    () => stepLayout(leaves, resultSeams, geoms, { explode: 0, ...laidHands }),
    [leaves, resultSeams, geoms, laidHands],
  );
  // «place»: every piece of the step joined as its views draw it, moved by hand; the pick stays.
  const poseLayout = useMemo(
    () => (posing ? stepLayout(leaves, frameSeams, geoms, { explode: 0, ...laidHands }) : null),
    [posing, leaves, frameSeams, geoms, laidHands],
  );
  const poseBounds = useMemo(
    () => (poseLayout ? pictureBounds(poseLayout, geoms, 'canvas') : undefined),
    [poseLayout, geoms],
  );
  const poseShown = useMemo(() => {
    if (!poseLayout || !poseDrag) return poseLayout;
    const T = new Map(poseLayout.T);
    for (const k of poseDrag.group) {
      const t = T.get(k);
      if (t) T.set(k, compose(poseDrag.D, t));
    }
    return { ...poseLayout, T };
  }, [poseLayout, poseDrag]);
  const hasResult = storedSeams.length > 0 || !!pairSeam;

  const marks: EdgeMark[] = [];
  const nos: NoMark[] = [];
  // One label per side, on its longest edge that is drawn (a neckline's on the back neck, not on
  // a front's end of it; a piece laid apart has none).
  const sideMarks = (ids: readonly TargetId[], tone: EdgeMark['tone']) => {
    let at = 0;
    let longest = -1;
    ids.forEach((id, k) => {
      if (!layout.T.has(pieceOfTarget(id))) return;
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
  const resultMarks: EdgeMark[] = marks.map(({ id, tone }) => ({ id, tone }));

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
  const [resultEl, result] = useBoxSize();
  const phone = canvas.w > 0 && canvas.w < 600;
  const zoom = usePictureZoom(canvas.w, canvas.h, index);

  // ── «place» (P8): any piece moved by hand, stored as a pose on «done»; the pick is left as it is ──
  const exitPose = () => {
    setPosing(false);
    setPoseEdits(new Map());
    setPoseSel(null);
    setPoseSnap(null);
    setPoseDrag(null);
  };
  const startPose = () => {
    if (posing) {
      exitPose();
      return;
    }
    setSelectedPiece(null);
    setRefused('');
    setPoseEdits(new Map());
    setPoseSel(null);
    setPoseSnap(null);
    setPosing(true);
  };
  /** The host a piece stands on: its pose's, else the block's root. */
  const poseHost = (piece: string, group: readonly string[]) => {
    if (!poseLayout) return null;
    const was = livePose.get(piece)?.host;
    return was && was !== piece && poseLayout.T.has(was) && !group.includes(was)
      ? was
      : poseHostOf(piece, group, poseLayout, geoms);
  };
  /** What moves with a piece: the pieces hung on it, unless its host hangs on it too. */
  const poseGroupOf = (piece: string): string[] => {
    if (!poseLayout) return [piece];
    const host = livePose.get(piece)?.host ?? poseHostOf(piece, [piece], poseLayout, geoms);
    return host
      ? poseGroup(piece, host, poseLayout.hung ?? []).filter((k) => poseLayout.T.has(k))
      : [piece];
  };
  const putPose = (piece: string, T: Affine, host: string | null) => {
    const hostT = host ? poseLayout?.T.get(host) : undefined;
    const pg = geoms.get(piece);
    const hg = host ? geoms.get(host) : undefined;
    if (!host || !hostT || !pg || !hg) {
      setRefused('no host');
      return;
    }
    setRefused('');
    setPoseEdits((current) => {
      const next = new Map(current);
      next.set(piece, { host, placement: poseAt(hg, pg, hostT, T) });
      return next;
    });
  };
  const dropPose = (piece: string, group: string[], D: Affine, snap: PoseSnap | null) => {
    setPoseDrag(null);
    const T0 = poseLayout?.T.get(piece);
    if (!T0) return;
    const moved = snap ? compose(translate(snap.dx, snap.dy), D) : D;
    putPose(piece, compose(moved, T0), snap?.host ?? poseHost(piece, group));
    setPoseSnap(snap ? snap.at : null);
  };
  const turnPose = (quarter: -1 | 0 | 1) => {
    const piece = poseSel;
    const T0 = piece ? poseLayout?.T.get(piece) : undefined;
    const g = piece ? geoms.get(piece) : undefined;
    if (!piece || !T0 || !g || busy) return;
    const D = turnAbout(
      g.rs.map((p) => apply(T0, p)),
      quarter,
    );
    putPose(piece, compose(D, T0), poseHost(piece, poseGroupOf(piece)));
    setPoseSnap(null);
  };
  const posedHere = (piece: string | null) =>
    !!piece &&
    (!!poseEdits.get(piece) || (ownPoseRows.has(piece) && poseEdits.get(piece) !== null));
  const autoPose = () => {
    const piece = poseSel;
    if (!piece || !posedHere(piece) || busy) return;
    setPoseEdits((current) => {
      const next = new Map(current);
      if (ownPoseRows.has(piece)) next.set(piece, null);
      else next.delete(piece);
      return next;
    });
    setPoseSnap(null);
  };
  const finishPose = async () => {
    if (!posing || busy) return;
    const put: StoredPose[] = [];
    const drop: StoredPose[] = [];
    for (const [piece, pin] of poseEdits) {
      const own = ownPoseRows.get(piece);
      if (!pin) {
        if (own) drop.push(own);
        continue;
      }
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
    if (!put.length && !drop.length) {
      exitPose();
      return;
    }
    setBusy(true);
    setRefused('');
    const ok = await attachPose(put, drop);
    setBusy(false);
    if (!ok) {
      const key = put[0]?.seamKey ?? drop[0]?.seamKey ?? '';
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
            const hostAt = sideOf(surfaceSuggestion.host, groups, 'a');
            const part = edge ? [edge] : [];
            return hostAt === 'a' ? { a: [line], b: part } : { a: part, b: [line] };
          })()
        : null;
    if (!next) return;
    setRefused('');
    setSel(next);
    setFilled(next);
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
    if (selectedPiece) {
      setSelectedPiece(null);
      return true;
    }
    if (sel.a.length || sel.b.length) {
      reset();
      return true;
    }
    return false;
  };

  const groupName = (id: TargetId | undefined) => {
    if (!id) return '';
    const k = pieceOfTarget(id);
    return groups.find((g) => g.pieces.includes(k))?.name ?? nameOf(k);
  };
  const sidesName = (a: TargetId | undefined, b: TargetId | undefined) =>
    [groupName(a), groupName(b)].filter(Boolean).join(' · ');
  // The footer lists a pair once: a row stored twice, or the pick of a stored pair, is not repeated.
  const sidesSig = (s: { a: readonly TargetId[]; b: readonly TargetId[] }) =>
    [[...s.a].sort().join('+'), [...s.b].sort().join('+')].sort().join('~');
  const listed = stored.filter(
    (s, i) => stored.findIndex((o) => sidesSig(o.sides) === sidesSig(s.sides)) === i,
  );
  const pairListed = !!pair && listed.some((s) => sidesSig(s.sides) === sidesSig(pair));
  const pairName = pair ? sidesName(pair.a[0], pair.b[0]) : '';
  // The seam's number on the step: after the stored ones.
  const pairNo = stored.length;
  // The step's words as its row shows them («join / seam · armhole»), else the unit it makes.
  const stepName = stepWords(op, workCatalog) || op?.outputUnitName?.trim() || '';

  const loading = geo?.dep.status === 'pending';
  const drawn = layout.T.size > 0;
  const error = refused || stored.map((s) => (errors[s.key] ? 'refused' : '')).find(Boolean) || '';
  // The selected piece's placement as drawn: its own, or its twin's mirrored.
  const selectedLaid = selectedPiece ? joined.hand.get(selectedPiece) : undefined;
  const selectedHand: HandOn | undefined =
    selectedLaid?.place ?? (selectedPiece ? hand.get(selectedPiece) : undefined);
  const selectedTarget: HandTarget | undefined =
    selectedLaid?.target ??
    (selectedPiece
      ? pickHandTarget(handTargets.get(selectedPiece), hand.get(selectedPiece))
      : undefined);
  // A twin lends its placement to a piece with none: «inside» off is then an own placement.
  const twinPlaced = (piece: string) =>
    (geoms.get(piece)?.twinOf ?? []).some((t) => twinHand.has(t.key));

  const storedEntryFor = (piece: string) => {
    if (pairPieces.has(piece)) return undefined;
    return stored.find(
      (item) =>
        item.row &&
        isHandSeamKind(item.row.kind) &&
        [...item.row.sideA, ...item.row.sideB].some((anchor) => anchor.piece === piece),
    );
  };

  const putHandOverride = (piece: string, next: HandOn | undefined) => {
    setHandOverrides((current) => {
      const changed = new Map(current);
      changed.set(piece, next ?? null);
      return changed;
    });
  };

  /**
   * The twin's seam stored on this step takes the mirrored placement too, while it has none of its
   * own or still mirrors the piece's previous one; a twin's seam on another step is only drawn.
   */
  const twinWrite = (
    piece: string,
    partner: string | undefined,
    next: HandPlace | undefined,
    prev: HandPlace | undefined,
    skip: string,
  ): StoredSeam | null => {
    if (!partner) return null;
    const rows = stored.flatMap((item) => (item.row && item.key !== skip ? [item.row] : []));
    const twin = twinRowOf(rows, piece, partner, next, geoms);
    if (!twin) return null;
    const was = twinRowOf(rows, piece, partner, prev, geoms)?.place;
    if (twin.current && !sameHand(twin.current, was)) return null;
    if (sameHand(twin.current, twin.place)) return null;
    return withHandPlace(twin.row, twin.twin, twin.place);
  };

  const persistStoredHand = async (
    piece: string,
    next: HandPlace | undefined,
    fallback: HandPlace | undefined,
    partner: string | undefined,
  ) => {
    const item = storedEntryFor(piece);
    if (!item?.row || !scene.ctx) return;
    const row = withHandPlace(item.row, piece, next);
    const twin = twinWrite(piece, partner, next, fallback, item.key);
    setBusy(true);
    setRefused('');
    const ok = await scene.ctx.writes.upsert(twin ? [row, twin] : [row]);
    setBusy(false);
    if (ok) return;
    putHandOverride(piece, fallback);
    setRefused(useSeamsStore.getState().errors[row.seamKey] ?? 'not saved');
  };

  const editSelectedHand = (next: HandPlace | undefined) => {
    if (!selectedPiece || !selectedTarget || frozen || busy) return;
    const fallback = storedHand.get(selectedPiece);
    const own = next && { ...next, partner: selectedTarget.partner };
    putHandOverride(selectedPiece, own);
    if (storedEntryFor(selectedPiece))
      void persistStoredHand(selectedPiece, own, fallback, selectedTarget.partner);
  };

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
        {groups.length < 2 && !frozen && (
          <ViewSwitch value={chosen} options={SIDES} onChange={setChosen} label='side' />
        )}
        {onClose && (
          <div className='ml-auto'>
            <Close onClick={onClose} aria-label='close' />
          </div>
        )}
      </div>

      <div className='flex min-h-0 flex-1 flex-col border border-borderColor bg-bgColor'>
        <div className='flex min-h-0 flex-1 flex-col md:flex-row'>
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
                  geoms={geoms}
                  nameOf={nameOf}
                  selected={poseSel}
                  snapAt={poseDrag ? null : poseSnap}
                  disabled={frozen || busy}
                  groupOf={poseGroupOf}
                  onSelect={(piece) => {
                    setPoseSel(piece);
                    setPoseSnap(null);
                  }}
                  onDrag={(group, D) => setPoseDrag({ group, D })}
                  onDrop={dropPose}
                  onCancel={() => setPoseDrag(null)}
                />
              </>
            ) : (
              <StepPictureSvg
                w={canvas.w}
                h={canvas.h}
                pad={phone ? 28 : 64}
                look='canvas'
                layout={layout}
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
          <div
            className='relative h-1/3 flex-none border-t border-hairline md:h-auto md:w-75 md:border-t-0 md:border-l'
            data-seam-result=''
          >
            <Text
              size='micro'
              variant='label'
              tracking='label'
              className='absolute top-2.5 left-3 uppercase'
            >
              result
            </Text>
            <div ref={resultEl} className='absolute inset-x-0 top-6 bottom-0'>
              {hasResult && (
                <>
                  <StepPictureSvg
                    w={result.w}
                    h={result.h}
                    pad={18}
                    look='result'
                    layout={joined}
                    geoms={geoms}
                    innerLines={innerLines}
                    marks={resultMarks}
                    ghostName={nameOf}
                    className='absolute inset-0'
                  />
                  <ResultHandOverlay
                    w={result.w}
                    h={result.h}
                    pad={18}
                    layout={joined}
                    geoms={geoms}
                    nameOf={nameOf}
                    selected={selectedPiece}
                    onSelect={setSelectedPiece}
                  />
                </>
              )}
            </div>
          </div>
        </div>

        <div
          className='sticky bottom-0 box-content flex h-21 flex-none items-center gap-3 border-t border-hairline bg-bgColor px-3 pb-[env(safe-area-inset-bottom)] md:gap-4.5 md:px-5'
          data-seam-bar=''
        >
          {error && (
            <Text size='micro' variant='error' className='min-w-0 truncate'>
              {error}
            </Text>
          )}
          {listed.map((s) => (
            <span key={s.key} className='flex min-w-0 items-center gap-2' data-seam-stored={s.key}>
              <PairNo i={stored.indexOf(s)} />
              <Text size='micro' tracking='label' className='min-w-0 truncate uppercase'>
                {sidesName(s.sides.a[0], s.sides.b[0])}
              </Text>
            </span>
          ))}
          {pair && !pairListed && (
            <span className='flex min-w-0 items-center gap-2' data-seam-pair=''>
              <PairNo i={pairNo} />
              <Text size='micro' tracking='label' className='min-w-0 truncate uppercase'>
                {pairName}
              </Text>
            </span>
          )}
          <span className='flex-1' />
          {posing && poseSnap && (
            <Text size='micro' variant='label' data-seam-pose-snap=''>
              snap
            </Text>
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
          {posing && (
            <>
              <Button
                type='button'
                variant='underline'
                size='xs'
                aria-label='turn left'
                onClick={() => turnPose(1)}
                disabled={!poseSel || busy}
              >
                ⟲
              </Button>
              <Button
                type='button'
                variant='underline'
                size='xs'
                aria-label='turn right'
                onClick={() => turnPose(-1)}
                disabled={!poseSel || busy}
              >
                ⟳
              </Button>
              <Button
                type='button'
                variant='underline'
                size='xs'
                aria-label='flip'
                onClick={() => turnPose(0)}
                disabled={!poseSel || busy}
              >
                ⇋
              </Button>
              <Button
                type='button'
                variant='underline'
                size='xs'
                onClick={autoPose}
                disabled={!posedHere(poseSel) || busy}
                data-seam-pose-auto=''
              >
                auto
              </Button>
            </>
          )}
          {!frozen && drawn && !!cardId && (
            <Button
              type='button'
              variant='underline'
              size='xs'
              className={posing ? 'text-warning' : undefined}
              aria-pressed={posing}
              onClick={startPose}
              disabled={busy}
              data-seam-pose=''
            >
              place
            </Button>
          )}
          {selectedPiece && !posing && (
            <Button
              type='button'
              variant='underline'
              size='xs'
              className={selectedHand?.inside ? 'text-warning' : undefined}
              aria-pressed={selectedHand?.inside ?? false}
              onClick={() =>
                editSelectedHand(
                  selectedHand?.inside
                    ? selectedPiece && twinPlaced(selectedPiece)
                      ? { ...selectedHand, inside: false }
                      : undefined
                    : { ...(selectedHand ?? DEFAULT_HAND), inside: true },
                )
              }
              disabled={!selectedTarget || frozen || busy}
            >
              inside
            </Button>
          )}
          {(sel.a.length > 0 || sel.b.length > 0) && !posing && (
            <Button type='button' variant='underline' size='xs' onClick={reset}>
              clear
            </Button>
          )}
          {!frozen && posing && (
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
          )}
          {!frozen && !posing && (
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
          {!frozen &&
            !posing &&
            (suggestion || surfaceSuggestion) &&
            !sel.a.length &&
            !sel.b.length && (
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
          {footerActions}
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

/** RESULT: a press selects a piece (its «inside» switch); nothing moves here. */
function ResultHandOverlay({
  w,
  h,
  pad,
  layout,
  geoms,
  nameOf,
  selected,
  onSelect,
}: {
  w: number;
  h: number;
  pad: number;
  layout: StepLayout;
  geoms: ReadonlyMap<string, PieceGeom>;
  nameOf: (piece: string) => string;
  selected: string | null;
  onSelect: (piece: string | null) => void;
}) {
  const fit = useMemo(() => fitBox(layout.bbox, w, h, pad), [layout.bbox, w, h, pad]);
  const pieces = useMemo(
    () =>
      [...layout.T].flatMap(([piece, transform]) => {
        const geom = geoms.get(piece);
        return geom
          ? [{ piece, ring: geom.rs.map((point) => toPx(fit, apply(transform, point))) }]
          : [];
      }),
    [layout, geoms, fit],
  );

  if (w < 2 || h < 2) return null;
  const selectedRing = pieces.find((piece) => piece.piece === selected)?.ring;
  const hitPieces = selected
    ? [
        ...pieces.filter((piece) => piece.piece !== selected),
        ...pieces.filter((piece) => piece.piece === selected),
      ]
    : pieces;
  const toggle = (piece: string) => onSelect(selected === piece ? null : piece);
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className='absolute inset-0 touch-none'
      data-hand-result=''
    >
      {hitPieces.map((item) => (
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
          className='cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-textColor'
          onKeyDown={(e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            toggle(item.piece);
          }}
          onClick={() => toggle(item.piece)}
          data-hand-piece=''
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
          data-hand-selected=''
        />
      )}
    </svg>
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
  geoms,
  nameOf,
  selected,
  snapAt,
  disabled,
  groupOf,
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
  geoms: ReadonlyMap<string, PieceGeom>;
  nameOf: (piece: string) => string;
  selected: string | null;
  snapAt: Pt2 | null;
  disabled: boolean;
  groupOf: (piece: string) => string[];
  onSelect: (piece: string | null) => void;
  onDrag: (group: string[], D: Affine) => void;
  onDrop: (piece: string, group: string[], D: Affine, snap: PoseSnap | null) => void;
  onCancel: () => void;
}) {
  const fit = useMemo(() => {
    const f = fitBox(bounds, w, h, pad);
    return { s: f.s * view.k, tx: f.tx * view.k + view.x, ty: f.ty * view.k + view.y };
  }, [bounds, w, h, pad, view.k, view.x, view.y]);
  const stacked = useMemo(() => new Set(layout.stacked.flatMap((g) => g.slice(1))), [layout]);
  const pieces = useMemo(
    () =>
      [...layout.T].flatMap(([piece, transform]) => {
        const geom = geoms.get(piece);
        if (!geom || geom.rs.length < 3 || stacked.has(piece)) return [];
        return [{ piece, ring: geom.rs.map((point) => toPx(fit, apply(transform, point))) }];
      }),
    [layout, geoms, fit, stacked],
  );
  const drag = useRef<{
    piece: string;
    group: string[];
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
    if (cancelled || !state.moved) {
      onCancel();
      return;
    }
    const D = state.D;
    const group = new Set(state.group);
    // The layout under the drag already carries D: the dragged rings are read as drawn.
    const ringOf = (k: string, T: Affine) => (geoms.get(k)?.rs ?? []).map((p) => apply(T, p));
    const moving = state.group.flatMap((k) => {
      const T = layout.T.get(k);
      return T ? ringOf(k, T) : [];
    });
    const others = [...layout.T].flatMap(([k, T]) =>
      group.has(k) || stacked.has(k) || (geoms.get(k)?.rs.length ?? 0) < 3
        ? []
        : [{ piece: k, ring: ringOf(k, T) }],
    );
    onDrop(state.piece, state.group, D, snapPose(moving, others, POSE_SNAP_PX / scale));
  };

  if (w < 2 || h < 2) return null;
  const selectedRing = pieces.find((item) => item.piece === selected)?.ring;
  const hitPieces = selected
    ? [
        ...pieces.filter((item) => item.piece !== selected),
        ...pieces.filter((item) => item.piece === selected),
      ]
    : pieces;
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
        state.D = shiftOf(e, state);
        onDrag(state.group, state.D);
      }}
      onPointerUp={() => finish()}
      onPointerCancel={() => finish(true)}
      data-seam-pose-canvas=''
    >
      {hitPieces.map((item) => (
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
            onSelect(selected === item.piece ? null : item.piece);
          }}
          onPointerDown={(e) => {
            e.preventDefault();
            // A press on a piece moves it; only a press on the empty canvas pans.
            e.stopPropagation();
            onSelect(item.piece);
            if (disabled) return;
            e.currentTarget.setPointerCapture?.(e.pointerId);
            drag.current = {
              piece: item.piece,
              group: groupOf(item.piece),
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
