// THE STEP'S SEAMS, WIRING (assembly-schema T8). One provider over the operations rail hands every
// step card the saved card, its frozen state and ONE seam writer; it also keeps the form honest:
//
// - the card's seam rows are in the seams store even while the assembly map is folded away;
// - a seam that leaves the card (dropped by a DXF re-upload or deleted by a colleague) leaves every
//   step's `seamKeys` at once — the server refuses a save that names a key
//   it no longer holds (InvalidArgument), and the autosave would retry that refusal forever;
// - the same for a POSE row (P8, a piece placed by hand) and the steps' `poseKeys`.

import type { common_TechCard } from 'api/proto-http/admin';
import { useSeamHints, type SeamHints, type SeamHintsState } from 'lib/seam-hints';
import type { StoredPose, StoredSeam, TechCardSeamWire } from 'lib/seams';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { useFormContext } from 'react-hook-form';
import type { AssemblyGeometry } from '../../techpack/use-assembly-geometry';
import { useAssemblyGeometry } from '../../techpack/use-assembly-geometry';
import { hydrateSeams, rowPairSig, rowsOf, useSeamsStore } from '../assembly-seams/seams-store';
import { useSeamWrites, type SeamWrites } from '../assembly-seams/use-seam-decisions';
import type { TechCardFormData } from '../schema';
import { planStepSeamRemoval } from './step-seam-actions';
import { dropKeys } from './step-seams-model';

export type StepSeamsCtx = {
  techCard: common_TechCard | undefined;
  cardId: number | undefined;
  frozen: boolean;
  writes: SeamWrites;
  geometry: AssemblyGeometry;
  /** A piece's words by its line key: the card's name, else the key. */
  nameOf: (pieceKey: string) => string;
  /** The card's AI hints and the owner's rows (line F): the owner screen reads this. */
  seamHints: SeamHintsState;
  /** The hints by piece key for the guess (`SignalOp.hints`); empty = today's guess. */
  guessHints: SeamHints;
};

const Ctx = createContext<StepSeamsCtx | null>(null);

/** Null outside a provider: the row then draws nothing (print, stands, other tabs). */
export const useStepSeams = () => useContext(Ctx);

/** Store one seam row, then attach the server's canonical key to this form step; that key, or null. */
export function useAttachStepSeam(index: number) {
  const ctx = useStepSeams();
  const { getValues, setValue } = useFormContext<TechCardFormData>();
  return useCallback(
    // `keepPlace`: same row with a new flag, its place stays because the order of rows moves pieces.
    async (row: StoredSeam, keepPlace = false): Promise<string | null> => {
      if (!ctx) return null;
      const ok = await ctx.writes.upsert([row]);
      if (!ok) return null;
      const sig = rowPairSig(row);
      const stored = rowsOf(useSeamsStore.getState()).find(
        (candidate) => rowPairSig(candidate) === sig,
      );
      const key = stored?.seamKey ?? row.seamKey;
      const current = (getValues(`operations.${index}.seamKeys`) ?? []) as string[];
      if (keepPlace && current.includes(key)) return key;
      setValue(`operations.${index}.seamKeys`, [...current.filter((item) => item !== key), key], {
        shouldDirty: true,
      });
      return key;
    },
    [ctx, getValues, index, setValue],
  );
}

/** Remove one of this step's stored seams through the shared seam writer. */
export function useStepSeamActions(index: number) {
  const ctx = useStepSeams();
  const { getValues, setValue } = useFormContext<TechCardFormData>();

  const remove = useCallback(
    async (seamKey: string, row: StoredSeam | undefined): Promise<boolean> => {
      if (!ctx || ctx.frozen) return false;
      const operations = getValues('operations') ?? [];
      const removal = planStepSeamRemoval(operations, index, seamKey);
      if (removal.deleteRow && row && !(await ctx.writes.remove([row]))) return false;
      const field = `operations.${index}.seamKeys` as const;
      const seamKeys = removal.deleteRow
        ? ((getValues(field) ?? []) as string[]).filter((key) => key !== seamKey)
        : removal.seamKeys;
      setValue(field, seamKeys, { shouldDirty: true });
      return true;
    },
    [ctx, getValues, index, setValue],
  );

  return { remove };
}

/**
 * Store a step's pose rows (P8) and keep this form step's `poseKeys` with them: `drop` is deleted
 * before `put` is upserted (so a replacement cannot briefly make a host cycle). True when the
 * server took every write.
 */
export function useAttachStepPose(index: number) {
  const ctx = useStepSeams();
  const { getValues, setValue } = useFormContext<TechCardFormData>();
  return useCallback(
    async (
      put: readonly StoredPose[],
      drop: readonly StoredPose[] = [],
      // Same rows with a new flag: they keep their place, the order of pose rows moves pieces.
      reflag: readonly StoredPose[] = [],
    ): Promise<boolean> => {
      if (!ctx) return false;
      const field = `operations.${index}.poseKeys` as const;
      const keys = () => ((getValues(field) ?? []) as string[]).slice();
      if (drop.length) {
        if (!(await ctx.writes.removePoses([...drop]))) return false;
        const gone = new Set(drop.map((r) => r.seamKey));
        const left = keys().filter((k) => !gone.has(k));
        if (left.length !== keys().length) setValue(field, left, { shouldDirty: true });
      }
      if (reflag.length && !(await ctx.writes.upsertPoses([...reflag]))) return false;
      if (put.length) {
        if (!(await ctx.writes.upsertPoses([...put]))) return false;
        const add = new Set(put.map((r) => r.seamKey));
        setValue(field, [...keys().filter((k) => !add.has(k)), ...add], { shouldDirty: true });
      }
      return true;
    },
    [ctx, getValues, index, setValue],
  );
}

export function StepSeamsProvider({
  techCard,
  frozen,
  active = false,
  loadGeometry = false,
  children,
}: {
  techCard: common_TechCard | undefined;
  frozen: boolean;
  /** The construction screen is in view (all card tabs stay mounted). */
  active?: boolean;
  /** Non-interactive print surfaces still need the geometry without activating hint writes. */
  loadGeometry?: boolean;
  children: ReactNode;
}) {
  const cardId = techCard?.id;
  const writes = useSeamWrites(cardId, frozen);
  // Every card tab stays mounted. The assembly worker belongs to the visible construction tab;
  // another tab's cached DXF must not make this hidden provider segment every piece.
  const geometry = useAssemblyGeometry((techCard ?? {}) as common_TechCard, active || loadGeometry);
  const { getValues, setValue } = useFormContext<TechCardFormData>();

  // The store follows the card read while the construction surface is mounted.
  const wire = techCard?.seams as TechCardSeamWire[] | undefined;
  const wireRef = useRef(wire);
  wireRef.current = wire;
  useEffect(() => {
    if (!cardId) return;
    if (useSeamsStore.getState().cardId !== cardId) hydrateSeams(cardId, wire);
    return useSeamsStore.subscribe((s) => {
      if (s.cardId === null) hydrateSeams(cardId, wireRef.current);
    });
  }, [cardId, wire]);

  // A key that leaves the server's list of THIS card leaves the steps. A card switch or a reset is
  // not a removal; neither is a row only in flight.
  useEffect(() => {
    if (!cardId) return;
    return useSeamsStore.subscribe((s, prev) => {
      if (s.cardId !== cardId || prev.cardId !== cardId) return;
      if (s.server === prev.server && s.poses === prev.poses) return;
      const now = new Set([...s.server, ...s.poses].map((r) => r.seamKey));
      const gone = new Set(
        [...prev.server, ...prev.poses].map((r) => r.seamKey).filter((k) => !now.has(k)),
      );
      if (!gone.size) return;
      const ops = getValues('operations') ?? [];
      const next = dropKeys(ops, gone);
      if (!next) return;
      next.forEach((o, i) => {
        if (o === ops[i]) return;
        if (o.seamKeys !== ops[i].seamKeys)
          setValue(`operations.${i}.seamKeys`, o.seamKeys ?? [], { shouldDirty: true });
        if (o.poseKeys !== ops[i].poseKeys)
          setValue(`operations.${i}.poseKeys`, o.poseKeys ?? [], { shouldDirty: true });
      });
    });
  }, [cardId, getValues, setValue]);

  const seamHints = useSeamHints(
    cardId,
    techCard,
    geometry.pieces,
    geometry.dep.status !== 'pending',
    active,
  );
  const guessHints = seamHints.forGuess;

  const names = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of techCard?.techCard?.pieces ?? [])
      if (p.lineKey) m.set(p.lineKey, (p.name ?? '').trim() || p.lineKey);
    return m;
  }, [techCard?.techCard?.pieces]);

  const value = useMemo<StepSeamsCtx>(
    () => ({
      techCard,
      cardId,
      frozen,
      writes,
      geometry,
      nameOf: (k) => names.get(k) ?? k,
      seamHints,
      guessHints,
    }),
    [techCard, cardId, frozen, writes, geometry, names, seamHints, guessHints],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
