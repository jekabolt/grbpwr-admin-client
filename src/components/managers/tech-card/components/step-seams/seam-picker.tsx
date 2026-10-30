// THE STEP'S SEAM PICKER v2 «step picture» (owner OK 27.10). The step's inputs drawn as units — each
// input one shape, its pieces as assembled, one human name — laid along the step's seam and pulled
// apart; RESULT shows them joined. The proposal is dashed with its mm, the user's own pick blue, a
// stored seam ink bold with its number. Clicking edges collects the sides (with two or more inputs
// the side is the input's, with one it is the A / B switch); one picked side gets its partner by
// length, dashed. Nothing is stored until «accept» (or Enter): then the pair becomes ONE card seam
// (composite when a side holds several runs, surface when one side is an inner line) and its key
// goes onto the step, after the ones already there. «place» drags the part onto its host for a
// surface seam.

import * as Dialog from '@radix-ui/react-dialog';
import type { EdgeId, PieceGeom, Pt2, SeamCandidate } from 'lib/assembly-skeleton/types';
import { apply } from 'lib/assembly-skeleton/union/affine';
import { anchorOfRunId, type EdgeAnchor, type SeamPlacement, type StoredSeam } from 'lib/seams';
import { cn } from 'lib/utility';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { Button, Close, Placeholder, Text, ViewSwitch } from 'ui';
import type { AsmPiece } from '../../techpack/derive-assembly';
import { rowFromHand, runsOfSide } from '../assembly-seams/seam-actions';
import { useSeamsStore } from '../assembly-seams/seams-store';
import { edgeOf, plainEdges } from '../assembly-seams/words';
import { useOperationWorkCatalog } from '../useOperationWorkCatalog';
import { PairNo } from './pair-no';
import { usePictureZoom } from './picture-zoom';
import {
  clampHandSlide,
  DEFAULT_HAND,
  handsFromSeams,
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
import { useAttachStepSeam } from './step-seams-context';
import { stepWords } from './step-words';
import {
  deltaMm,
  fmtMm,
  longestEdge,
  parseInner,
  pieceOfTarget,
  proposalLabel,
  sideOf,
  surfaceRow,
  type Pt,
  type TargetId,
} from './step-seams-model';
import {
  boxOf,
  fitBox,
  focusPieces,
  partnerOf,
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
  StepPictureSvg,
  useBoxSize,
  useStable,
  useStepLayout,
  useStepScene,
  frameSeamsOf,
  type EdgeMark,
  type NoMark,
} from './step-picture-view';

type Side = 'a' | 'b';
type Sel = { a: TargetId[]; b: TargetId[] };
type Place = { x: number; y: number; rot: number };
const EMPTY: Sel = { a: [], b: [] };
const SIDES = [
  { value: 'a', label: 'side A' },
  { value: 'b', label: 'side B' },
] as const;

/** Share of the extent the inputs stand apart on the canvas. */
const EXPLODE = 0.08;
const NONE: readonly (readonly string[])[] = [];

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
    used,
    suggestions,
    innerSeams,
    proposalSeams,
    crossSeams,
    storedSeams,
    pieceName: nameOf,
  } = scene;
  const frozen = (scene.ctx?.frozen ?? true) || readOnly;
  const cardId = scene.ctx?.cardId;
  const attach = useAttachStepSeam(index);
  const errors = useSeamsStore((s) => s.errors);
  const { catalog: workCatalog } = useOperationWorkCatalog();

  const [sel, setSel] = useState<Sel>(EMPTY);
  const [chosen, setChosen] = useState<Side>('a');
  const [hover, setHover] = useState<TargetId | null>(null);
  const [place, setPlace] = useState<Place | null>(null);
  const [selectedPiece, setSelectedPiece] = useState<string | null>(null);
  const [handOverrides, setHandOverrides] = useState<Map<string, HandOn | null>>(() => new Map());
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState('');
  const [prop, setProp] = useState(initialProposal);
  const suggestion = suggestions[prop] ?? suggestions[0] ?? null;
  const propOptions = useMemo(
    () => suggestions.map((p, i) => ({ value: String(i), label: proposalLabel(p, i) })),
    [suggestions],
  );

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
  const sideLen = (ids: readonly TargetId[]) => ids.reduce((s, id) => s + lenOf(id), 0);

  // ── the partner of a lone picked side: the other side's edge closest in length ──
  const sewnInside = useMemo(() => {
    const s = new Set<EdgeId>();
    for (const c of innerSeams)
      for (const id of [c.a, c.b, ...(c.aParts ?? []), ...(c.bParts ?? [])]) s.add(id);
    return s;
  }, [innerSeams]);
  const lone: Side | null =
    sel.a.length > 0 && sel.b.length === 0
      ? 'a'
      : sel.b.length > 0 && sel.a.length === 0
        ? 'b'
        : null;
  const partner = useMemo(() => {
    if (!lone || sel[lone].some((t) => parseInner(t))) return null;
    const mine = new Set(sel[lone].map(pieceOfTarget));
    const other =
      groups.length >= 2
        ? lone === 'a'
          ? groups.slice(1).flatMap((g) => g.pieces)
          : groups[0].pieces
        : groups[0]?.pieces ?? [];
    const cands = other.flatMap((p) => {
      const g = geoms.get(p);
      if (!g || mine.has(p)) return [];
      return plainEdges(g)
        .filter((e) => !used.has(e.id) && !sewnInside.has(e.id))
        .map((e) => ({ id: e.id, lenMm: e.lenMm }));
    });
    const len = sel[lone].reduce((s, id) => s + lenOf(id), 0);
    return partnerOf(len, cands, (a, b) => deltaMm(a, b, ease));
  }, [lone, sel, groups, geoms, used, sewnInside, ease, lenOf]);

  // ── what «accept» would write ──
  const inners = [...sel.a, ...sel.b].filter((t) => parseInner(t));
  const surface = inners.length === 1;
  const hostSide: Side | null = surface ? (sel.a.includes(inners[0]) ? 'a' : 'b') : null;
  const host = surface ? parseInner(inners[0]) : null;
  const hostGroup = host ? groups.findIndex((g) => g.pieces.includes(host.piece)) : -1;
  const partKey = useMemo(() => {
    if (!host || !hostSide) return null;
    const other = sel[hostSide === 'a' ? 'b' : 'a'];
    if (other.length) return pieceOfTarget(other[0]);
    const g = groups.find((_, gi) => gi !== hostGroup);
    return g?.pieces.find((p) => pieces?.has(p)) ?? null;
  }, [host, hostSide, sel, groups, hostGroup, pieces]);

  /**
   * The pair on the table: the user's own (both sides, or one side + its partner), else the
   * proposal — with the lengths as sewn, which its notches may read shorter than the edges (a
   * neckline's folds and pleat stay out of the collar seam).
   */
  const pair: (SeamSides & { own: boolean; aLen?: number; bLen?: number }) | null = (() => {
    if (inners.length) return null;
    if (sel.a.length && sel.b.length) return { a: sel.a, b: sel.b, own: true };
    if (lone && partner)
      return lone === 'a'
        ? { a: sel.a, b: [partner], own: true }
        : { a: [partner], b: sel.b, own: true };
    if (!sel.a.length && !sel.b.length && suggestion)
      return {
        a: suggestion.a,
        b: suggestion.b,
        own: false,
        aLen: suggestion.aLen,
        bLen: suggestion.bLen,
      };
    return null;
  })();
  const canAccept =
    !frozen &&
    !busy &&
    !!cardId &&
    (surface ? !!partKey && sel[hostSide!].length === 1 : inners.length === 0 && !!pair);

  // Hand placements: this step's and the earlier ones' (a later step inherits them); the twins read
  // the whole card's (the right bag mirrors the left one placed a step later).
  const storedHand = useMemo(() => {
    const rows = ops
      .slice(0, index + 1)
      .flatMap((step) => (step.seamKeys ?? []).flatMap((key) => byKey.get(key) ?? []));
    return handsFromSeams(rows);
  }, [ops, index, byKey]);
  const cardHand = useMemo(
    () =>
      handsFromSeams(
        ops.flatMap((step) => (step.seamKeys ?? []).flatMap((key) => byKey.get(key) ?? [])),
      ),
    [ops, byKey],
  );
  const hand = useMemo(() => withOverrides(storedHand, handOverrides), [storedHand, handOverrides]);
  const twinHand = useMemo(() => withOverrides(cardHand, handOverrides), [cardHand, handOverrides]);
  const pairPieces = useMemo(
    () => new Set(pair ? [...pair.a, ...pair.b].map(pieceOfTarget) : []),
    [pair],
  );

  const anchorCtx = useMemo(
    () => ({ pieces: [...geoms.values()], grainDeg: geo?.grainDeg ?? new Map(), nameOf }),
    [geoms, geo?.grainDeg, nameOf],
  );

  const placement = useMemo((): SeamPlacement | undefined => {
    if (!place || !host) return undefined;
    return {
      xMm: Math.round(place.x * 10) / 10,
      yMm: Math.round(place.y * 10) / 10,
      rotDeg: place.rot,
      flip: false,
    };
  }, [place, host]);

  const buildRow = useCallback(
    (s: Sel): StoredSeam | null => {
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
      const runs = picked.length ? runsOfSide(picked, geoms) : [longestEdge(geoms.get(partKey))];
      const parts = runs
        .map((id) => (id ? anchorOfRunId(anchorCtx.pieces, id, geo.grainDeg) : null))
        .filter((a): a is EdgeAnchor => !!a);
      return surfaceRow(
        { geom: g, k: h.k, line, grainDeg: geo.grainDeg.get(h.piece) ?? 0 },
        parts,
        placement,
      );
    },
    [geoms, anchorCtx, pieces, geo, partKey, placement, handOverrides, pairPieces],
  );

  const reset = () => {
    setSel(EMPTY);
    setPlace(null);
    setSelectedPiece(null);
    setHandOverrides(new Map());
    setChosen('a');
    setRefused('');
  };

  const commit = async () => {
    if (!canAccept) return;
    const row = buildRow(surface || !pair ? sel : { a: [...pair.a], b: [...pair.b] });
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
    reset();
    onAccepted?.();
  };

  const toggle = (id: TargetId) => {
    if (frozen || place) return;
    const side = sideOf(pieceOfTarget(id), groups, chosen);
    setRefused('');
    const has = sel[side].includes(id);
    setSel({ ...sel, [side]: has ? sel[side].filter((x) => x !== id) : [...sel[side], id] });
    // One input: the first pick on A moves the switch to B.
    if (!has && groups.length < 2 && side === 'a' && sel.a.length === 0) setChosen('b');
  };

  // ── the canvas: only the pieces of the seam on the table (the proposal's, and whatever a
  // re-pick touches) with the pieces of their unit between them, apart; RESULT: them joined ──
  const seamIds = [
    ...(suggestion ? [...suggestion.a, ...suggestion.b] : []),
    ...(pair ? [...pair.a, ...pair.b] : []),
    ...sel.a,
    ...sel.b,
    ...(partner ? [partner] : []),
  ];
  const seamPieces = new Set(seamIds.map(pieceOfTarget));
  const focus = seamPieces.size > 0 && inners.length === 0;
  const focusRaw = groups
    .map((g) => ({
      name: g.name,
      pieces: focus ? focusPieces(g.pieces, seamPieces, innerSeams) : g.pieces,
    }))
    .filter((g) => g.pieces.length > 0);
  const focused = useStable(
    focusRaw,
    focusRaw.map((g) => `${g.name}:${g.pieces.join(',')}`).join(';'),
  );
  const focusLeaves = useMemo(() => focused.map((g) => g.pieces), [focused]);
  // Along the step's proposals (the right sleeve's armhole on the right; a third input on its own
  // seam), never the live pick.
  const frameRaw = frameSeamsOf(innerSeams, storedSeams, proposalSeams, crossSeams);
  const frameSeams = useStable(frameRaw, seamSig(frameRaw));
  const laidFocus = useStepLayout(focus ? focusLeaves : leaves, frameSeams, geoms, EXPLODE);
  // A piece of the seam no earlier seam attaches to its unit is not drawn loose with a bit of the
  // seam on it: the focused canvas is laid again without it (the seam's label goes on the rest).
  const apart = new Set(focus ? laidFocus.apart : []);
  const shownRaw = apart.size
    ? focused
        .map((g) => ({ name: g.name, pieces: g.pieces.filter((p) => !apart.has(p)) }))
        .filter((g) => g.pieces.length > 0)
    : focused;
  const shown = useStable(
    shownRaw,
    shownRaw.map((g) => `${g.name}:${g.pieces.join(',')}`).join(';'),
  );
  const seamLeaves = useMemo(() => shown.map((g) => g.pieces), [shown]);
  const laidShown = useStepLayout(apart.size ? seamLeaves : NONE, frameSeams, geoms, EXPLODE);
  const layout = apart.size ? laidShown : laidFocus;
  // A surface pick lies on its host's line in RESULT (by «place», else centred on the line).
  const pairSeam =
    surface && host && partKey
      ? surfaceSeam(
          host.piece,
          partKey,
          innerLines.get(host.piece)?.[host.k] ?? [],
          geoms,
          placement,
        )
      : pair
        ? seamOfSides(pair, geoms, innerLines)
        : null;
  const resultRaw = [...innerSeams, ...(focus ? [] : storedSeams), ...(pairSeam ? [pairSeam] : [])];
  const resultSeams = useStable<SeamCandidate[]>(resultRaw, seamSig(resultRaw));
  const handTargets = useMemo(() => handTargetsOf(resultSeams, geoms), [resultSeams, geoms]);
  const resultLeaves = focus ? seamLeaves : leaves;
  const joined = useMemo(
    () => stepLayout(resultLeaves, resultSeams, geoms, { explode: 0, hand, twinHand }),
    [resultLeaves, resultSeams, geoms, hand, twinHand],
  );
  const hasResult = storedSeams.length > 0 || !!pairSeam;

  const marks: EdgeMark[] = [];
  const nos: NoMark[] = [];
  // One label per side, on its longest edge that is drawn (a neckline's on the back neck, not on
  // a front's end of it; a piece laid apart has none).
  const sideMarks = (ids: readonly TargetId[], tone: EdgeMark['tone'], lenMm?: number) => {
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
      marks.push({ id, tone, label: k === at ? mmText(lenMm ?? sideLen(ids)) : undefined }),
    );
  };
  // A stored seam reads as a proposal does: its edges with their lengths, its number on the first.
  stored.forEach((s, i) => {
    sideMarks(s.sides.a, 'stored');
    sideMarks(s.sides.b, 'stored');
    const first = s.sides.a[0] ?? s.sides.b[0];
    if (first) nos.push({ id: first, i });
  });
  if (sel.a.length || sel.b.length) {
    sideMarks(sel.a, 'pick');
    sideMarks(sel.b, 'pick');
    if (partner) sideMarks([partner], 'pick');
  } else if (pair) {
    const tone: EdgeMark['tone'] = pair.own ? 'pick' : 'proposal';
    sideMarks(pair.a, tone, pair.aLen);
    sideMarks(pair.b, tone, pair.bLen);
  }
  const resultMarks: EdgeMark[] = marks.map(({ id, tone }) => ({ id, tone }));

  // Edge to edge on both sides (a part on its host's line has no Δ).
  const edgeToEdge = (s: { a: readonly TargetId[]; b: readonly TargetId[] }) =>
    s.a.length > 0 && s.b.length > 0 && [...s.a, ...s.b].every((id) => !parseInner(id));
  const delta = pair
    ? deltaMm(pair.aLen ?? sideLen(pair.a), pair.bLen ?? sideLen(pair.b), ease)
    : stored.length === 1 && edgeToEdge(stored[0].sides)
      ? deltaMm(sideLen(stored[0].sides.a), sideLen(stored[0].sides.b), ease)
      : null;
  const empty = !pair && !surface && stored.length === 0 && !sel.a.length && !sel.b.length;

  const [canvasEl, canvas] = useBoxSize();
  const [resultEl, result] = useBoxSize();
  const phone = canvas.w > 0 && canvas.w < 600;
  const zoom = usePictureZoom(canvas.w, canvas.h, index);

  // ── «place»: the part follows the pointer over its host (mm in the drawing frame) ──
  const hostPiece = host ? pieces?.get(host.piece) : undefined;
  const partPiece = partKey ? pieces?.get(partKey) : undefined;
  const startPlace = () => {
    if (place) return setPlace(null);
    if (!hostPiece || !partPiece || !host) return;
    const hb = boxOf(hostPiece.cut);
    const lb = boxOf(hostPiece.inner[host.k] ?? hostPiece.cut);
    const pb = boxOf(partPiece.cut);
    // Start with the part centred on the mark, relative to the host's bbox corner.
    setPlace({
      x: (lb.x0 + lb.x1) / 2 - (pb.x1 - pb.x0) / 2 - hb.x0,
      y: (lb.y0 + lb.y1) / 2 - (pb.y1 - pb.y0) / 2 - hb.y0,
      rot: 0,
    });
  };

  const switchProposal = (v: string) => {
    reset();
    setProp(Number(v));
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest('input, textarea')) return;
    if (!e.metaKey && !e.ctrlKey && !e.altKey && !place && zoom.onKey(e.key)) {
      e.preventDefault();
    } else if (e.key === 'Enter' && canAccept) {
      e.preventDefault();
      void commit();
    } else if (/^[1-9]$/.test(e.key) && Number(e.key) <= propOptions.length) {
      e.preventDefault();
      switchProposal(String(Number(e.key) - 1));
    }
  };

  const escape = () => {
    if (selectedPiece) {
      setSelectedPiece(null);
      return true;
    }
    if (place) {
      setPlace(null);
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
  const pairName = pair ? sidesName(pair.a[0], pair.b[0]) : '';
  // The seam's number on the step: after the stored ones, a proposal by its place among them.
  const pairNo = stored.length + (pair?.own ? 0 : prop);
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

  const slideSelectedHand = (slideMm: number, done: boolean) => {
    if (!selectedPiece || !selectedTarget || frozen || busy) return;
    const next = { ...(selectedHand ?? DEFAULT_HAND), slideMm, partner: selectedTarget.partner };
    putHandOverride(selectedPiece, next);
    if (done && storedEntryFor(selectedPiece))
      void persistStoredHand(
        selectedPiece,
        next,
        storedHand.get(selectedPiece),
        selectedTarget.partner,
      );
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
        {propOptions.length > 1 && (
          <ViewSwitch
            value={String(prop)}
            options={propOptions}
            onChange={switchProposal}
            label='seam'
          />
        )}
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
              zoom.zoomed && !place && 'cursor-grab active:cursor-grabbing',
            )}
            data-seam-picker-canvas=''
            {...(place ? {} : zoom.handlers)}
          >
            {loading && !drawn ? (
              <div className='absolute inset-0 grid place-items-center'>
                <Placeholder label='loading' />
              </div>
            ) : !drawn ? (
              <div className='absolute inset-0 grid place-items-center'>
                <Placeholder label={groups.length ? 'no pattern' : 'no pieces'} dashed />
              </div>
            ) : place && hostPiece && partPiece && host ? (
              <PlaceView
                w={canvas.w}
                h={canvas.h}
                host={hostPiece}
                line={hostPiece.inner[host.k] ?? []}
                part={partPiece}
                place={place}
                onPlace={setPlace}
              />
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
                names={(focus ? shown : groups).map((g) => g.name)}
                namesBelow={phone}
                ghostName={nameOf}
                hover={hover}
                onHover={setHover}
                onPick={frozen ? undefined : toggle}
                view={zoom.view}
                className='absolute inset-0'
              />
            )}
            {drawn && !place && (
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
                    target={selectedTarget}
                    hand={selectedHand}
                    disabled={frozen || busy}
                    onSelect={setSelectedPiece}
                    onSlide={slideSelectedHand}
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
          {stored.map((s, i) => (
            <span key={s.key} className='flex min-w-0 items-center gap-2' data-seam-stored={s.key}>
              <PairNo i={i} />
              <Text size='micro' tracking='label' className='min-w-0 truncate uppercase'>
                {sidesName(s.sides.a[0], s.sides.b[0])}
              </Text>
            </span>
          ))}
          {pair && (
            <span className='flex min-w-0 items-center gap-2' data-seam-pair=''>
              <PairNo i={pairNo} />
              <Text size='micro' tracking='label' className='min-w-0 truncate uppercase'>
                {pairName}
              </Text>
            </span>
          )}
          <span className='flex-1' />
          {delta != null ? (
            <Text size='control' className='whitespace-nowrap tabular-nums' data-seam-delta=''>
              {`Δ ${fmtMm(delta)} mm`}
            </Text>
          ) : empty && !loading ? (
            <Text size='micro' variant='error' data-step-seams-status=''>
              no seam
            </Text>
          ) : null}
          {surface && !frozen && (
            <Button
              type='button'
              variant='underline'
              size='xs'
              onClick={startPlace}
              disabled={!hostPiece || !partPiece}
            >
              {place ? 'done' : 'place'}
            </Button>
          )}
          {place && (
            <Button
              type='button'
              variant='underline'
              size='xs'
              onClick={() => setPlace({ ...place, rot: (place.rot + 90) % 360 })}
            >
              turn
            </Button>
          )}
          {selectedPiece && (
            <>
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
              <Button
                type='button'
                variant='underline'
                size='xs'
                onClick={() =>
                  editSelectedHand({
                    ...(selectedHand ?? DEFAULT_HAND),
                    flip: !(selectedHand?.flip ?? false),
                  })
                }
                disabled={!selectedTarget || frozen || busy}
              >
                flip
              </Button>
            </>
          )}
          {(sel.a.length > 0 || sel.b.length > 0) && (
            <Button type='button' variant='underline' size='xs' onClick={reset}>
              clear
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

function ResultHandOverlay({
  w,
  h,
  pad,
  layout,
  geoms,
  nameOf,
  selected,
  target,
  hand,
  disabled,
  onSelect,
  onSlide,
}: {
  w: number;
  h: number;
  pad: number;
  layout: StepLayout;
  geoms: ReadonlyMap<string, PieceGeom>;
  nameOf: (piece: string) => string;
  selected: string | null;
  target: HandTarget | undefined;
  hand: HandPlace | undefined;
  disabled: boolean;
  onSelect: (piece: string | null) => void;
  onSlide: (slideMm: number, done: boolean) => void;
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
  const drag = useRef<{
    piece: string;
    clientX: number;
    clientY: number;
    slideMm: number;
    latestMm: number;
    tx: number;
    ty: number;
    scale: number;
    canSlide: boolean;
    moved: boolean;
  } | null>(null);

  const slideAt = (e: PointerEvent, state: NonNullable<typeof drag.current>) => {
    const dx = (e.clientX - state.clientX) / state.scale;
    const dy = -(e.clientY - state.clientY) / state.scale;
    if (!target) return state.slideMm;
    return clampHandSlide(
      target.partRun,
      target.partnerRun,
      state.slideMm + dx * state.tx + dy * state.ty,
    );
  };

  const finish = (e: PointerEvent, cancelled = false) => {
    const state = drag.current;
    if (!state) return;
    drag.current = null;
    if (state.canSlide && state.moved) {
      onSlide(cancelled ? state.latestMm : slideAt(e, state), true);
      return;
    }
    if (!cancelled) onSelect(selected === state.piece ? null : state.piece);
  };

  if (w < 2 || h < 2) return null;
  const selectedRing = pieces.find((piece) => piece.piece === selected)?.ring;
  const hitPieces = selected
    ? [
        ...pieces.filter((piece) => piece.piece !== selected),
        ...pieces.filter((piece) => piece.piece === selected),
      ]
    : pieces;
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className='absolute inset-0 touch-none'
      onPointerMove={(e) => {
        const state = drag.current;
        if (!state || !state.canSlide) return;
        const moved = Math.hypot(e.clientX - state.clientX, e.clientY - state.clientY) > 2;
        if (!moved && !state.moved) return;
        state.moved = true;
        state.latestMm = slideAt(e, state);
        onSlide(state.latestMm, false);
      }}
      onPointerUp={(e) => finish(e)}
      onPointerCancel={(e) => finish(e, true)}
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
          className={
            selected === item.piece && target && !disabled
              ? 'cursor-move focus-visible:outline focus-visible:outline-2 focus-visible:outline-textColor'
              : 'cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-textColor'
          }
          onKeyDown={(e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            onSelect(selected === item.piece ? null : item.piece);
          }}
          onPointerDown={(e) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture?.(e.pointerId);
            const partnerT = target ? layout.T.get(target.partner) : undefined;
            const partnerRun =
              target && partnerT ? target.partnerRun.map((point) => apply(partnerT, point)) : [];
            const a = partnerRun[0] ?? ([0, 0] as Pt2);
            const b = partnerRun[partnerRun.length - 1] ?? ([1, 0] as Pt2);
            const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
            const canSlide =
              !disabled && selected === item.piece && target?.piece === item.piece && !!partnerT;
            drag.current = {
              piece: item.piece,
              clientX: e.clientX,
              clientY: e.clientY,
              slideMm: hand?.slideMm ?? 0,
              latestMm: hand?.slideMm ?? 0,
              tx: (b[0] - a[0]) / length,
              ty: (b[1] - a[1]) / length,
              scale: Math.max(fit.s, 1e-6),
              canSlide,
              moved: false,
            };
          }}
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

/**
 * «place»: the host in its drawing frame (mm, y down) with its mark in the pick blue, the part on
 * top following the pointer. The stored placement is the part's bbox corner relative to the host's,
 * then turned — the same numbers the surface seam has always stored. The drag lives here (the
 * picker hears the drop only); the host layer is drawn once.
 */
function PlaceView({
  w,
  h,
  host,
  line,
  part,
  place,
  onPlace,
}: {
  w: number;
  h: number;
  host: AsmPiece;
  line: Pt[];
  part: AsmPiece;
  place: Place;
  onPlace: (p: Place) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const [live, setLive] = useState(place);
  useEffect(() => setLive(place), [place]);
  const hb = useMemo(() => boxOf(host.cut), [host]);
  const pb = useMemo(() => boxOf(part.cut), [part]);
  const m = Math.max(pb.x1 - pb.x0, pb.y1 - pb.y0);
  const vb = [hb.x0 - m, hb.y0 - m, hb.x1 - hb.x0 + 2 * m, hb.y1 - hb.y0 + 2 * m];
  const hostLayer = useMemo(
    () => (
      <>
        <path
          d={pathOf(host.cut, true)}
          fill='var(--color-bgColor)'
          stroke='var(--color-textColor)'
          strokeWidth={2}
          vectorEffect='non-scaling-stroke'
        />
        <path
          d={pathOf(line)}
          fill='none'
          stroke='var(--color-warning)'
          strokeWidth={3}
          vectorEffect='non-scaling-stroke'
        />
      </>
    ),
    [host, line],
  );
  const partLayer = useMemo(
    () => (
      <path
        d={pathOf(part.cut, true)}
        fill='var(--color-bgColor)'
        fillOpacity={0.85}
        stroke='var(--color-textColor)'
        strokeWidth={1.2}
        strokeDasharray='6 4'
        vectorEffect='non-scaling-stroke'
      />
    ),
    [part],
  );
  const toMm = (e: PointerEvent) => {
    const ctm = svgRef.current?.getScreenCTM();
    if (!ctm) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };
  const drop = () => {
    if (!drag.current) return;
    drag.current = null;
    onPlace(live);
  };
  const ox = hb.x0 + live.x;
  const oy = hb.y0 + live.y;
  if (w < 2 || h < 2) return null;
  return (
    <svg
      ref={svgRef}
      width={w}
      height={h}
      viewBox={vb.map((v) => v.toFixed(1)).join(' ')}
      preserveAspectRatio='xMidYMid meet'
      className='absolute inset-0'
      onPointerMove={(e) => {
        const g = drag.current;
        if (!g) return;
        const p = toMm(e);
        if (p) setLive({ ...live, x: g.px + p.x - g.x, y: g.py + p.y - g.y });
      }}
      onPointerUp={drop}
      onPointerCancel={drop}
      data-seam-place=''
    >
      {hostLayer}
      <g
        transform={`translate(${ox.toFixed(1)} ${oy.toFixed(1)}) rotate(${live.rot}) translate(${(-pb.x0).toFixed(1)} ${(-pb.y0).toFixed(1)})`}
        className='cursor-move'
        onPointerDown={(e) => {
          const p = toMm(e);
          if (!p) return;
          (e.target as Element).setPointerCapture?.(e.pointerId);
          drag.current = { x: p.x, y: p.y, px: live.x, py: live.y };
        }}
      >
        {partLayer}
      </g>
    </svg>
  );
}
