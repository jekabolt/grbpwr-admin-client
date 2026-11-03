import type { Affine, PieceGeom } from 'lib/assembly-skeleton/types';
import { apply, compose, translate } from 'lib/assembly-skeleton/union/affine';
import {
  newSeamKey,
  poseOf,
  poseRow,
  type SeamLayer,
  type StoredPose,
  type StoredSeam,
  withSeamLayer,
} from 'lib/seams';
import { useMemo, useRef, useState } from 'react';
import { useSeamsStore } from '../assembly-seams/seams-store';
import {
  onlyFlagsDiffer,
  onTopChip,
  pendingLayerRows,
  pendingStacking,
  pressEdits,
  pressLayer,
  type PendingLayerEdits,
} from './pose-picking';
import { pictureBounds } from './step-picture-view';
import {
  pinPoses,
  fitPlan,
  poseAfterDrop,
  poseBlockGroup,
  posePickup,
  resolvePoseEdit,
  resolvePoseEdits,
  turnAbout,
  turnToGrain,
  upright,
  type FitSource,
  type PoseEditResolution,
  type PosePickup,
  type PoseSnap,
} from './step-pose';
import type { StepLayout } from './step-picture';
import type { LayerRow, StepResult } from './step-result';
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
  fitSource,
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
  attach: (row: StoredSeam, keepPlace?: boolean) => Promise<string | null>;
  attachPose: (
    put: readonly StoredPose[],
    drop?: readonly StoredPose[],
    reflag?: readonly StoredPose[],
  ) => Promise<boolean>;
  fitSource?: FitSource | null;
}) {
  // Pieces moved by hand on the canvas (P8), kept here until ACCEPT.
  const [poseChanges, setPoseChanges] = useState<PoseEditResolution>(() => ({
    edits: new Map(),
    drop: new Set(),
  }));
  const poseEdits = poseChanges.edits;
  const [handEdits, setHandEdits] = useState<Map<string, StoredSeam>>(() => new Map());
  // The under/over switch on a pose row: piece → layer, null = cleared; saved with ACCEPT.
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
  const fitCycle = useRef<{
    sourceKey: string;
    transforms: ReadonlyMap<string, Affine>;
    alternate: boolean;
  } | null>(null);

  // This step's stored pose rows retain their key when a move updates them.
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
  // The canvas starts from the exact result transforms. Unsaved drops are pinned over a fresh map so
  // the shared cached result remains immutable; with none, the result's own layout stands.
  const poseLayout = useMemo(() => {
    if (!poseEdits.size) return resultLayout;
    const T = new Map(resultLayout.T);
    pinPoses(T, poseEdits, geoms, poseHung, {
      groupOf: (piece, host) => poseBlockGroup(piece, host, { blocks: poseBlocks, hung: poseHung }),
    });
    return { ...resultLayout, T };
  }, [resultLayout, poseEdits, geoms, poseHung, poseBlocks]);
  const poseShown = useMemo(() => {
    if (!poseDrag && !poseFree) return poseLayout;
    const T = new Map(poseLayout.T);
    if (poseFree) for (const [k, t] of T) T.set(k, compose(poseFree, t));
    for (const k of poseDrag?.group ?? []) {
      const t = T.get(k);
      if (t) T.set(k, compose(poseDrag!.D, t));
    }
    return { ...poseLayout, T };
  }, [poseLayout, poseDrag, poseFree]);
  // The zoom frame stays the result's own while pieces move: a drag never rescales the picture.
  const poseBounds = useMemo(
    () => (stepPicture ? pictureBounds(resultLayout, geoms, 'canvas') : undefined),
    [stepPicture, resultLayout, geoms],
  );
  const posePending =
    poseEdits.size > 0 ||
    poseChanges.drop.size > 0 ||
    handEdits.size > 0 ||
    poseLayerEdits.size > 0;
  const fitReady = useMemo(
    () =>
      !!fitSource &&
      !!fitPlan(
        fitSource,
        {
          blocks: poseBlocks,
          hung: poseHung,
          transforms: poseLayout.T,
          stacked: resultLayout.stacked,
        },
        geoms,
      ),
    [fitSource, poseBlocks, poseHung, poseLayout, resultLayout.stacked, geoms],
  );

  // ── any piece moved by hand (P8), stored as a pose on ACCEPT; the pick is left as it is ──
  const clearPose = () => {
    fitCycle.current = null;
    setPoseChanges({ edits: new Map(), drop: new Set() });
    setHandEdits(new Map());
    setPoseLayerEdits(new Map());
    setPoseFree(null);
    setPoseSel(null);
    setSnapOn(false);
    setPoseDrag(null);
  };
  const pickupOf = (piece: string): PosePickup =>
    posePickup(piece, { blocks: poseBlocks, transforms: poseLayout.T, hung: poseHung }, geoms);
  const putPose = (piece: string, T: Affine, pickup: PosePickup) => {
    // A hand move changes what FIT measures from: the next press starts a new cycle.
    fitCycle.current = null;
    const dropped = poseAfterDrop(piece, T, pickup, { transforms: poseLayout.T }, geoms);
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
    const T0 = poseLayout.T.get(piece);
    if (!T0) return;
    const moved = snap ? compose(translate(snap.dx, snap.dy), D) : D;
    putPose(piece, compose(moved, T0), pickup);
  };
  const fitPose = () => {
    if (!fitSource || !fitReady || busy || !stepPicture) return;
    const shownTransforms = poseLayout.T;
    const previous = fitCycle.current;
    const cycle =
      previous?.sourceKey === fitSource.key
        ? previous
        : {
            sourceKey: fitSource.key,
            transforms: new Map(shownTransforms),
            alternate: false,
          };
    const plan = fitPlan(
      fitSource,
      {
        blocks: poseBlocks,
        hung: poseHung,
        transforms: cycle.transforms,
        stacked: resultLayout.stacked,
      },
      geoms,
      cycle.alternate,
    );
    const T0 = plan ? cycle.transforms.get(plan.piece) : undefined;
    if (!plan || !T0) return;
    const dropped = poseAfterDrop(
      plan.piece,
      compose(plan.D, T0),
      { host: plan.host },
      { transforms: cycle.transforms },
      geoms,
    );
    if (!dropped) return;
    fitCycle.current = { ...cycle, alternate: !cycle.alternate };
    setRefused('');
    setPoseDrag(null);
    setPoseSel(plan.piece);
    setPoseChanges((current) =>
      resolvePoseEdit(storedPoseHosts, current, plan.piece, {
        host: dropped.host,
        placement: dropped.placement,
      }),
    );
  };
  const transformPose = (command: 'left' | 'right' | 'mirror' | 'upright') => {
    const piece = poseSel;
    const free = piece ? !pickupOf(piece).host : false;
    const T0 = piece ? (free ? poseShown : poseLayout).T.get(piece) : undefined;
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

  // What ACCEPT will save, read by the one layer rule: the canvas and the switch show exactly this.
  const layerEdits = useMemo((): PendingLayerEdits => {
    const moved = new Map<string, { host: string; layer?: SeamLayer }>();
    for (const [piece, pin] of poseEdits)
      moved.set(piece, { host: pin.host, layer: ownPoseRows.get(piece)?.sideA[0]?.layer });
    return { seams: handEdits, layers: poseLayerEdits, moved, dropped: poseChanges.drop };
  }, [handEdits, poseLayerEdits, poseEdits, poseChanges.drop, ownPoseRows]);
  const layerInput = stepResult?.layerInput;
  const pendingRows = useMemo(
    () => (layerInput ? pendingLayerRows(layerInput.rows, layerEdits) : []),
    [layerInput, layerEdits],
  );
  const shownPoseStacking = useMemo(
    () =>
      layerInput
        ? pendingStacking(layerInput, layerEdits)
        : { layers: [...poseLayers], lower: [], stacked: [] },
    [layerInput, layerEdits, poseLayers],
  );
  const shownPoseLayers = shownPoseStacking.layers;
  const shownPoseStacked = shownPoseStacking.stacked;

  const onTop = layerInput
    ? onTopChip(layerInput.blocks, pendingRows, shownPoseLayers, poseSel)
    : null;
  const pressOnTop = () => {
    const press = onTop?.press;
    if (!press || !layerInput || busy) return;
    const pressed = press.hosts.reduce<readonly LayerRow[]>(
      (rows, host) => pressLayer(rows, layerInput.blocks, press.piece, host, 'over'),
      pendingRows,
    );
    const { seams, layers } = pressEdits(
      pendingRows,
      pressed,
      (key) => stepRows.find((row) => row.seamKey === key),
      { seams: handEdits, layers: poseLayerEdits },
    );
    setHandEdits(seams);
    setPoseLayerEdits(layers);
  };

  const resetPose = async () => {
    if (busy) return;
    const selected = poseSel ? new Set(pickupOf(poseSel).group) : null;
    const inScope = (piece: string) => !selected || selected.has(piece);
    // A press stores its flag on either block's row, so a pose row's flag belongs to its host's block too.
    const layerInScope = (piece: string) => {
      const host = poseEdits.get(piece)?.host ?? storedPoseHosts.get(piece);
      return inScope(piece) || (host != null && inScope(host));
    };
    const unsaved =
      (!selected && !!poseFree) ||
      [...poseEdits.keys()].some((piece) =>
        selected ? pickupOf(piece).group.some((member) => selected.has(member)) : true,
      ) ||
      [...poseChanges.drop].some(inScope) ||
      [...handEdits.values()].some((row) =>
        [...row.sideA, ...row.sideB].some((anchor) => inScope(anchor.piece)),
      ) ||
      [...poseLayerEdits.keys()].some(layerInScope);
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
      for (const piece of current.keys()) if (layerInScope(piece)) next.delete(piece);
      return next;
    });
    setPoseDrag(null);
  };
  /** ACCEPT's half for the moves: true when nothing is left unsaved. */
  const savePose = async (): Promise<boolean> => {
    if (busy) return false;
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
    const reflag: StoredPose[] = [];
    for (const piece of poseLayerEdits.keys()) {
      const own = ownPoseRows.get(piece);
      if (safeChanges.edits.has(piece) || safeChanges.drop.has(piece) || !own?.sideA[0]) continue;
      const layer = layerOf(piece, own);
      reflag.push({
        ...own,
        sideA: [withSeamLayer(own.sideA[0], layer), ...own.sideA.slice(1)],
        sideB: own.sideB.map((anchor) => withSeamLayer(anchor, null)),
      });
    }
    const drop = [...safeChanges.drop].flatMap((piece) => {
      const row = ownPoseRows.get(piece);
      return row ? [row] : [];
    });
    if (!put.length && !drop.length && !reflag.length && !handEdits.size) {
      clearPose();
      return true;
    }
    setBusy(true);
    setRefused('');
    for (const row of handEdits.values()) {
      const stored = stepRows.find((one) => one.seamKey === row.seamKey);
      if (await attach(row, !!stored && onlyFlagsDiffer(stored, row))) continue;
      setBusy(false);
      setRefused(useSeamsStore.getState().errors[row.seamKey] ?? 'not saved');
      return false;
    }
    const ok =
      (!put.length && !drop.length && !reflag.length) || (await attachPose(put, drop, reflag));
    setBusy(false);
    if (!ok) {
      const key = put[0]?.seamKey ?? reflag[0]?.seamKey ?? drop[0]?.seamKey ?? '';
      setRefused(useSeamsStore.getState().errors[key] ?? 'not saved');
      return false;
    }
    clearPose();
    return true;
  };

  return {
    posePending,
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
  };
}
