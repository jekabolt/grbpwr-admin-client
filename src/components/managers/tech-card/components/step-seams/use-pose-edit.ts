import type { Affine, PieceGeom } from 'lib/assembly-skeleton/types';
import { apply, compose, translate } from 'lib/assembly-skeleton/union/affine';
import {
  newSeamKey,
  poseOf,
  poseRow,
  type EdgeAnchor,
  type SeamLayer,
  type StoredPose,
  type StoredSeam,
  withSeamLayer,
} from 'lib/seams';
import { useMemo, useState } from 'react';
import { useSeamsStore } from '../assembly-seams/seams-store';
import { pendingStacking, type PendingLayerClaim } from './pose-picking';
import { decodeHandPlace, isHandSeamKind } from './step-hand';
import { pictureBounds } from './step-picture-view';
import {
  pinPoses,
  poseAfterDrop,
  poseBlockGroup,
  posePickup,
  resolvePoseEdit,
  resolvePoseEdits,
  turnAbout,
  turnToGrain,
  upright,
  type PoseEditResolution,
  type PosePickup,
  type PoseSnap,
} from './step-pose';
import type { StepLayout } from './step-picture';
import type { StepResult } from './step-result';
import type { SurfacePicture } from './surface-picture';

const EMPTY_CANVAS_LAYOUT: StepLayout = {
  T: new Map(),
  input: new Map(),
  ghosts: [],
  stacked: [],
  onRuns: [],
  apart: [],
  clusters: [],
  layers: [],
  pieceLayers: [],
  hand: new Map(),
  hung: [],
  bbox: { x0: 0, y0: 0, x1: 1, y1: 1 },
};

export function usePoseEdit({
  poseKeys,
  poses,
  stepPicture,
  stepResult,
  stepRows,
  geoms,
  grainDeg,
  busy,
  setBusy,
  setRefused,
  attach,
  attachPose,
}: {
  poseKeys: readonly string[] | undefined;
  poses: ReadonlyMap<string, StoredPose>;
  stepPicture: SurfacePicture | null;
  stepResult: StepResult | undefined;
  stepRows: readonly StoredSeam[];
  geoms: ReadonlyMap<string, PieceGeom>;
  grainDeg: ReadonlyMap<string, number> | undefined;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  setRefused: (message: string) => void;
  attach: (row: StoredSeam) => Promise<string | null>;
  attachPose: (put: readonly StoredPose[], drop?: readonly StoredPose[]) => Promise<boolean>;
}) {
  // «place» (P8): pieces moved by hand, kept here until «done».
  const [posing, setPosing] = useState(false);
  const [poseChanges, setPoseChanges] = useState<PoseEditResolution>(() => ({
    edits: new Map(),
    drop: new Set(),
  }));
  const poseEdits = poseChanges.edits;
  const [handEdits, setHandEdits] = useState<Map<string, StoredSeam>>(() => new Map());
  // The under/over switch on a pose row: piece → layer, null = cleared; saved with «done».
  const [poseLayerEdits, setPoseLayerEdits] = useState<Map<string, SeamLayer | null>>(
    () => new Map(),
  );
  const [poseSel, setPoseSel] = useState<string | null>(null);
  const [snapOn, setSnapOn] = useState(false);
  const [poseDrag, setPoseDrag] = useState<{
    group: string[];
    D: Affine;
    snap: PoseSnap | null;
  } | null>(null);
  // A step of one block has nothing to sit against: its drag moves the whole picture, stored nowhere.
  const [poseFree, setPoseFree] = useState<Affine | null>(null);
  const [poseBounds, setPoseBounds] = useState<ReturnType<typeof pictureBounds>>();

  // This step's stored pose rows retain their key when PLACE updates them.
  const ownPoseRows = useMemo(() => {
    const out = new Map<string, StoredPose>();
    for (const key of poseKeys ?? []) {
      const row = poses.get(key);
      const pose = row ? poseOf(row) : null;
      if (row && pose) out.set(pose.piece, row);
    }
    return out;
  }, [poseKeys, poses]);
  const storedPoseHosts = useMemo(() => {
    const out = new Map<string, string>();
    for (const [piece, row] of ownPoseRows) {
      const pose = poseOf(row);
      if (pose) out.set(piece, pose.host);
    }
    return out;
  }, [ownPoseRows]);

  const resultLayout = stepPicture?.layout ?? EMPTY_CANVAS_LAYOUT;
  const poseLayers = stepPicture?.layers ?? [];
  const poseBlocks = stepResult?.blocks ?? [];
  const poseHung = stepResult?.hung ?? [];
  // PLACE starts from the exact result transforms. Unsaved drops are pinned over a fresh map so
  // the shared cached result remains immutable.
  const poseLayout = useMemo(() => {
    if (!posing) return null;
    const T = new Map(resultLayout.T);
    pinPoses(T, poseEdits, geoms, poseHung, {
      groupOf: (piece, host) => poseBlockGroup(piece, host, { blocks: poseBlocks, hung: poseHung }),
    });
    return { ...resultLayout, T };
  }, [posing, resultLayout, poseEdits, geoms, poseHung, poseBlocks]);
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

  // ── «place» (P8): any piece moved by hand, stored as a pose on «done»; the pick is left as it is ──
  const exitPose = () => {
    setPosing(false);
    setPoseChanges({ edits: new Map(), drop: new Set() });
    setHandEdits(new Map());
    setPoseLayerEdits(new Map());
    setPoseFree(null);
    setPoseSel(null);
    setSnapOn(false);
    setPoseDrag(null);
    setPoseBounds(undefined);
  };
  const startPose = () => {
    if (posing || !stepPicture) return;
    setRefused('');
    setPoseChanges({ edits: new Map(), drop: new Set() });
    setHandEdits(new Map());
    setPoseLayerEdits(new Map());
    setPoseFree(null);
    setPoseSel(null);
    setSnapOn(false);
    setPoseDrag(null);
    setPoseBounds(pictureBounds(resultLayout, geoms, 'canvas'));
    setPosing(true);
  };
  const pickupOf = (piece: string): PosePickup =>
    posePickup(
      piece,
      { blocks: poseBlocks, transforms: poseLayout?.T ?? resultLayout.T, hung: poseHung },
      geoms,
    );
  const putPose = (piece: string, T: Affine, pickup: PosePickup) => {
    const dropped = poseAfterDrop(
      piece,
      T,
      pickup,
      { transforms: poseLayout?.T ?? resultLayout.T },
      geoms,
    );
    if (!dropped) {
      setRefused('no host');
      return;
    }
    setRefused('');
    setPoseChanges((current) =>
      resolvePoseEdit(storedPoseHosts, current, piece, {
        host: dropped.host,
        placement: dropped.placement,
      }),
    );
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
    setPoseDrag(null);
    if (free) setPoseFree((current) => (current ? compose(D, current) : D));
    else putPose(piece, compose(D, T0), pickupOf(piece));
  };

  const editedStepRows = stepRows.map((row) => handEdits.get(row.seamKey) ?? row);
  // The under/over switch: the selected piece against the host fixed at pickup, on this step's row
  // that joins them (seam, surface) or the piece's own pose row. The flag is the only stacking claim;
  // an edge row's legacy «inside» hand reads as under until the owner sets the flag.
  const layerTarget = (() => {
    const piece = poseSel;
    const host = piece ? pickupOf(piece).host : null;
    if (!piece || !host) return null;
    for (const row of editedStepRows)
      for (const [own, other] of [
        [row.sideA, row.sideB],
        [row.sideB, row.sideA],
      ] as const) {
        const anchor = own.find((candidate) => candidate.piece === piece);
        if (!anchor || !other.some((candidate) => candidate.piece === host)) continue;
        const legacy =
          isHandSeamKind(row.kind) && decodeHandPlace(anchor.placement)?.inside ? 'under' : null;
        return {
          kind: 'row' as const,
          row,
          piece,
          layer: anchor.layer ?? legacy,
          explicit: anchor.layer,
        };
      }
    const own = ownPoseRows.get(piece);
    if (!poseEdits.has(piece) && !own) return null;
    const layer = poseLayerEdits.has(piece)
      ? poseLayerEdits.get(piece)!
      : own?.sideA[0]?.layer ?? null;
    return { kind: 'pose' as const, piece, layer, explicit: layer };
  })();
  const setLayer = (layer: SeamLayer) => {
    if (!layerTarget || busy) return;
    // A second press on a set switch clears it: no claim, the two pieces are equal. A legacy
    // «inside» lit as under is not a flag; pressing under then writes the flag over it.
    const next = layerTarget.explicit === layer ? null : layer;
    if (layerTarget.kind === 'pose') {
      setPoseLayerEdits((current) => new Map(current).set(layerTarget.piece, next));
      return;
    }
    const flag = (side: readonly EdgeAnchor[]) =>
      side.map((anchor) => {
        if (anchor.piece !== layerTarget.piece) return anchor;
        return withSeamLayer(anchor, next);
      });
    const row = {
      ...layerTarget.row,
      sideA: flag(layerTarget.row.sideA),
      sideB: flag(layerTarget.row.sideB),
    };
    setHandEdits((current) => new Map(current).set(row.seamKey, row));
  };
  const shownPoseStacking = useMemo(() => {
    const claims: PendingLayerClaim[] = [];
    for (const row of handEdits.values())
      for (const [own, other] of [
        [row.sideA, row.sideB],
        [row.sideB, row.sideA],
      ] as const)
        for (const anchor of own) {
          const hand = decodeHandPlace(anchor.placement);
          const host = other.find((candidate) => candidate.piece !== anchor.piece)?.piece;
          if (!host) continue;
          if (anchor.layer)
            claims.push({ piece: anchor.piece, host, under: anchor.layer === 'under' });
          else if (hand) claims.push({ piece: anchor.piece, host, under: hand.inside });
        }
    for (const [piece, layer] of poseLayerEdits) {
      const own = ownPoseRows.get(piece);
      const host = poseEdits.get(piece)?.host ?? (own ? poseOf(own)?.host : undefined);
      if (layer && host) claims.push({ piece, host, under: layer === 'under' });
      else if (!layer) claims.push({ piece, under: null });
    }
    return pendingStacking(
      {
        layers: poseLayers,
        lower: stepResult?.lower ?? [],
        stacked: stepResult?.stacked ?? [],
      },
      claims,
    );
  }, [
    poseLayers,
    stepResult?.lower,
    stepResult?.stacked,
    handEdits,
    poseLayerEdits,
    poseEdits,
    ownPoseRows,
  ]);
  const shownPoseLayers = shownPoseStacking.layers;
  const shownPoseLower = shownPoseStacking.lower;
  const shownPoseStacked = shownPoseStacking.stacked;

  const resetPose = async () => {
    if (busy) return;
    const selected = poseSel ? new Set(pickupOf(poseSel).group) : null;
    const inScope = (piece: string) => !selected || selected.has(piece);
    const unsaved =
      (!selected && !!poseFree) ||
      [...poseEdits.keys()].some((piece) =>
        selected ? pickupOf(piece).group.some((member) => selected.has(member)) : true,
      ) ||
      [...poseChanges.drop].some(inScope) ||
      [...handEdits.values()].some((row) =>
        [...row.sideA, ...row.sideB].some((anchor) => inScope(anchor.piece)),
      ) ||
      [...poseLayerEdits.keys()].some(inScope);
    // Nothing unsaved left to undo: «reset» removes this step's saved poses (the picked block's,
    // else all of them) and the step is laid automatically again.
    if (!unsaved) {
      const drop = [...ownPoseRows].filter(([piece]) => inScope(piece)).map(([, row]) => row);
      if (!drop.length) return;
      setBusy(true);
      setRefused('');
      const ok = await attachPose([], drop);
      setBusy(false);
      if (!ok) setRefused(useSeamsStore.getState().errors[drop[0].seamKey] ?? 'not saved');
      return;
    }
    setPoseFree(null);
    setPoseChanges((current) => {
      if (!selected) return { edits: new Map(), drop: new Set() };
      const next = new Map(current.edits);
      for (const piece of current.edits.keys())
        if (pickupOf(piece).group.some((member) => selected.has(member))) next.delete(piece);
      return resolvePoseEdits(storedPoseHosts, next);
    });
    setHandEdits((current) => {
      if (!selected) return new Map();
      const next = new Map(current);
      for (const [key, row] of current)
        if ([...row.sideA, ...row.sideB].some((anchor) => selected.has(anchor.piece)))
          next.delete(key);
      return next;
    });
    setPoseLayerEdits((current) => {
      if (!selected) return new Map();
      const next = new Map(current);
      for (const piece of current.keys()) if (selected.has(piece)) next.delete(piece);
      return next;
    });
    setPoseDrag(null);
  };
  const finishPose = async () => {
    if (!posing || busy) return;
    // Recheck at the write boundary too: no stale render or future caller may persist a cycle.
    const safeChanges = resolvePoseEdits(storedPoseHosts, poseChanges.edits, poseChanges.drop);
    const put: StoredPose[] = [];
    const layerOf = (piece: string, own: StoredPose | undefined) =>
      (poseLayerEdits.has(piece) ? poseLayerEdits.get(piece) : own?.sideA[0]?.layer) ?? undefined;
    for (const [piece, pin] of safeChanges.edits) {
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
          grainDeg,
          layer: layerOf(piece, own),
        }),
      );
    }
    // A switch flipped on a saved pose that was not moved: the stored row with the new flag only.
    for (const piece of poseLayerEdits.keys()) {
      const own = ownPoseRows.get(piece);
      if (safeChanges.edits.has(piece) || safeChanges.drop.has(piece) || !own?.sideA[0]) continue;
      const layer = layerOf(piece, own);
      put.push({ ...own, sideA: [withSeamLayer(own.sideA[0], layer), ...own.sideA.slice(1)] });
    }
    const drop = [...safeChanges.drop].flatMap((piece) => {
      const row = ownPoseRows.get(piece);
      return row ? [row] : [];
    });
    if (!put.length && !drop.length && !handEdits.size) {
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
    const ok = (!put.length && !drop.length) || (await attachPose(put, drop));
    setBusy(false);
    if (!ok) {
      const key = put[0]?.seamKey ?? drop[0]?.seamKey ?? '';
      setRefused(useSeamsStore.getState().errors[key] ?? 'not saved');
      return;
    }
    exitPose();
  };

  return {
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
    transformPose,
    resetPose,
    finishPose,
  };
}
