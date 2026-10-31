// THE STEP'S SEAMS, WIRING (assembly-schema T8). One provider over the operations rail hands every
// step card the saved card, its frozen state and ONE seam writer; it also keeps the form honest:
//
// - the card's seam rows are in the seams store even while the assembly map (whose door hydrates
//   it) is folded away;
// - a seam that leaves the card (removed in the review, dropped by a DXF re-upload, deleted by a
//   colleague) leaves every step's `seamKeys` at once — the server refuses a save that names a key
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
    async (row: StoredSeam): Promise<string | null> => {
      if (!ctx) return null;
      const ok = await ctx.writes.upsert([row]);
      if (!ok) return null;
      const sig = rowPairSig(row);
      const stored = rowsOf(useSeamsStore.getState()).find(
        (candidate) => rowPairSig(candidate) === sig,
      );
      const key = stored?.seamKey ?? row.seamKey;
      const current = (getValues(`operations.${index}.seamKeys`) ?? []) as string[];
      setValue(`operations.${index}.seamKeys`, [...current.filter((item) => item !== key), key], {
        shouldDirty: true,
      });
      return key;
    },
    [ctx, getValues, index, setValue],
  );
}

/**
 * Store a step's pose rows (P8) and keep this form step's `poseKeys` with them: `put` is upserted
 * (a replaced pose carries its old key), `drop` deleted. True when the server took every write.
 */
export function useAttachStepPose(index: number) {
  const ctx = useStepSeams();
  const { getValues, setValue } = useFormContext<TechCardFormData>();
  return useCallback(
    async (put: readonly StoredPose[], drop: readonly StoredPose[] = []): Promise<boolean> => {
      if (!ctx) return false;
      const field = `operations.${index}.poseKeys` as const;
      const keys = () => ((getValues(field) ?? []) as string[]).slice();
      if (put.length) {
        if (!(await ctx.writes.upsertPoses([...put]))) return false;
        const add = new Set(put.map((r) => r.seamKey));
        setValue(field, [...keys().filter((k) => !add.has(k)), ...add], { shouldDirty: true });
      }
      if (drop.length) {
        if (!(await ctx.writes.removePoses([...drop]))) return false;
        const gone = new Set(drop.map((r) => r.seamKey));
        const left = keys().filter((k) => !gone.has(k));
        if (left.length !== keys().length) setValue(field, left, { shouldDirty: true });
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
  children,
}: {
  techCard: common_TechCard | undefined;
  frozen: boolean;
  /** The construction screen is in view (all card tabs stay mounted). */
  active?: boolean;
  children: ReactNode;
}) {
  const cardId = techCard?.id;
  const writes = useSeamWrites(cardId, frozen);
  const geometry = useAssemblyGeometry((techCard ?? {}) as common_TechCard);
  const { getValues, setValue } = useFormContext<TechCardFormData>();

  // The store follows the card read here too: the assembly map's door hydrates it only while the
  // map is open, and resets it when the door unmounts.
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
