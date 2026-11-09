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
import { useFormContext, useWatch } from 'react-hook-form';
import type { AssemblyGeometry } from '../../techpack/use-assembly-geometry';
import { useAssemblyGeometry } from '../../techpack/use-assembly-geometry';
import { clearLinkOwed, markLinkOwed, owedLinks, planOwedLinks } from '../card-owed';
import { flushAllowsRun, useTechCardAutosave } from '../design/autosave-contract';
import { hydrateSeams, rowPairSig, rowsOf, useSeamsStore } from '../assembly-seams/seams-store';
import { useSeamWrites, type SeamWrites } from '../assembly-seams/use-seam-decisions';
import { linkBindingStripToSeam, removeBindingStripsForSeam } from '../binding-step';
import type { CutStrip } from '../cut-strip-editor/use-cut-strip';
import { useStoredSeamLengthsMm, useTopstitchLengthsMm } from '../cut-strips/seam-lengths';
import { syncCutStripSeamMm } from '../cut-strips/seam-mm-sync';
import { cutStripsOfCard, rowTouchesStrip, stripKeysOf } from '../cut-strips/strip-pieces';
import type { TechCardFormData } from '../schema';
import { syncTopstitchLineMm } from '../topstitch-line-mm-sync';
import type { TopstitchOperation } from '../topstitch-lines';
import { TopstitchThreadDefaults } from '../topstitch-thread-fields';
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

/**
 * ACCEPT WRITES AT ONCE (L16). The row has its own request; the step's link to it travels in the
 * whole-card body, which waited out the autosave's debounce. A link stays owed from before the row's
 * request until a read shows it stored (card-owed.ts): a page that dies on the way leaves the row with
 * no step, and the next page finishes the link.
 */
function useFlushLink() {
  const autosave = useTechCardAutosave();
  const latest = useRef(autosave);
  latest.current = autosave;
  return useCallback(() => {
    // The form tells the machine of a change a microtask after the event.
    window.setTimeout(() => void latest.current.flush('seam'), 0);
  }, []);
}

/** Store one seam row, then attach the server's canonical key to this form step; that key, or null. */
export function useAttachStepSeam(index: number) {
  const ctx = useStepSeams();
  const { getValues, setValue } = useFormContext<TechCardFormData>();
  const autosave = useTechCardAutosave();
  const flushLink = useFlushLink();
  return useCallback(
    async (row: StoredSeam): Promise<string | null> => {
      if (!ctx) return null;
      const liveStrips = (getValues('cutStrips') ?? []) as CutStrip[];
      const savedKeys = stripKeysOf(cutStripsOfCard(ctx.techCard));
      const unsavedKeys = new Set(
        [...stripKeysOf(liveStrips)].filter((lineKey) => !savedKeys.has(lineKey)),
      );
      // A seam RPC cannot name a strip the card body has not stored yet.
      if (rowTouchesStrip(row, unsavedKeys)) {
        const result = await autosave.flush('binding-strip');
        if (!flushAllowsRun(result)) return null;
      }
      const sig = rowPairSig(row);
      const op = getValues(`operations.${index}.operationNumber`) ?? 0;
      const owes = !!ctx.cardId && op > 0;
      if (owes)
        markLinkOwed(ctx.cardId!, {
          op,
          field: 'seamKeys',
          key: row.seamKey,
          sig,
          at: Date.now(),
        });
      const ok = await ctx.writes.upsert([row]);
      if (!ok) {
        if (owes) clearLinkOwed(ctx.cardId!, row.seamKey);
        return null;
      }
      const stored = rowsOf(useSeamsStore.getState()).find(
        (candidate) => rowPairSig(candidate) === sig,
      );
      const key = stored?.seamKey ?? row.seamKey;
      const operation = getValues(`operations.${index}`);
      const linked = linkBindingStripToSeam(
        operation,
        (getValues('cutStrips') ?? []) as CutStrip[],
        stored ?? row,
        key,
      );
      if (linked) setValue('cutStrips', linked.strips as never, { shouldDirty: true });
      const current = (getValues(`operations.${index}.seamKeys`) ?? []) as string[];
      setValue(`operations.${index}.seamKeys`, [...current.filter((item) => item !== key), key], {
        shouldDirty: true,
      });
      flushLink();
      return key;
    },
    [autosave, ctx, flushLink, getValues, index, setValue],
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
      if (ctx.cardId) clearLinkOwed(ctx.cardId, seamKey);
      if (removal.deleteRow && row && !(await ctx.writes.remove([row]))) return false;
      const field = `operations.${index}.seamKeys` as const;
      const seamKeys = removal.deleteRow
        ? ((getValues(field) ?? []) as string[]).filter((key) => key !== seamKey)
        : removal.seamKeys;
      setValue(field, seamKeys, { shouldDirty: true });
      // A shared row still belongs to its other step; only its last detach owns the strip teardown.
      if (removal.deleteRow) {
        const operation = getValues(`operations.${index}`);
        const stripped = removeBindingStripsForSeam(
          operation,
          (getValues('cutStrips') ?? []) as CutStrip[],
          seamKey,
        );
        if (stripped) {
          setValue('cutStrips', stripped.strips as never, { shouldDirty: true });
          setValue(`operations.${index}.inputKeys`, stripped.inputKeys, { shouldDirty: true });
        }
      }
      return true;
    },
    [ctx, getValues, index, setValue],
  );

  return { remove };
}

/** Keep every strip's measured cloth-side length current, whether or not its editor is open. */
function CutStripSeamMmSync({ disabled }: { disabled: boolean }) {
  const { control, setValue } = useFormContext<TechCardFormData>();
  const strips = (useWatch({ control, name: 'cutStrips' }) ?? []) as CutStrip[];
  const sizeIds = (useWatch({ control, name: 'sizeIds' }) ?? []) as number[];
  const server = useSeamsStore((state) => state.server);
  const pending = useSeamsStore((state) => state.pending);
  const rows = useMemo(() => rowsOf({ server, pending }), [server, pending]);
  const seamLengthsMm = useStoredSeamLengthsMm(rows);

  useEffect(() => {
    if (disabled) return;
    const synced = syncCutStripSeamMm(strips, sizeIds, seamLengthsMm);
    if (!synced.changed) return;
    setValue('cutStrips', synced.strips as never, { shouldDirty: synced.seamChanged });
  }, [disabled, seamLengthsMm, setValue, sizeIds, strips]);

  return null;
}

/** Keep every A2 line's one-sided length current, whether or not its step is open. */
function TopstitchLineMmSync({ disabled }: { disabled: boolean }) {
  const { control, setValue } = useFormContext<TechCardFormData>();
  const operations = (useWatch({ control, name: 'operations' }) ?? []) as TopstitchOperation[];
  const sizeIds = (useWatch({ control, name: 'sizeIds' }) ?? []) as number[];
  const lengths = useTopstitchLengthsMm();

  useEffect(() => {
    if (disabled || !lengths.ready) return;
    const synced = syncTopstitchLineMm(operations, sizeIds, lengths.read);
    for (const index of synced.changed) {
      setValue(`operations.${index}.topstitchLines`, synced.operations[index].topstitchLines, {
        shouldDirty: true,
      });
    }
  }, [disabled, lengths, operations, setValue, sizeIds]);

  return null;
}

/**
 * Store a step's pose rows (P8) and keep this form step's `poseKeys` with them: `drop` is deleted
 * before `put` is upserted (so a replacement cannot briefly make a host cycle). True when the
 * server took every write.
 */
export function useAttachStepPose(index: number) {
  const ctx = useStepSeams();
  const { getValues, setValue } = useFormContext<TechCardFormData>();
  const flushLink = useFlushLink();
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
        if (ctx.cardId) for (const r of drop) clearLinkOwed(ctx.cardId, r.seamKey);
        if (!(await ctx.writes.removePoses([...drop]))) return false;
        const gone = new Set(drop.map((r) => r.seamKey));
        const left = keys().filter((k) => !gone.has(k));
        if (left.length !== keys().length) setValue(field, left, { shouldDirty: true });
      }
      if (reflag.length && !(await ctx.writes.upsertPoses([...reflag]))) return false;
      if (put.length) {
        const op = getValues(`operations.${index}.operationNumber`) ?? 0;
        const owes = !!ctx.cardId && op > 0;
        if (owes)
          for (const r of put)
            markLinkOwed(ctx.cardId!, { op, field: 'poseKeys', key: r.seamKey, at: Date.now() });
        if (!(await ctx.writes.upsertPoses([...put]))) {
          if (owes) for (const r of put) clearLinkOwed(ctx.cardId!, r.seamKey);
          return false;
        }
        const add = new Set(put.map((r) => r.seamKey));
        setValue(field, [...keys().filter((k) => !add.has(k)), ...add], { shouldDirty: true });
        flushLink();
      }
      return true;
    },
    [ctx, flushLink, getValues, index, setValue],
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
      const next = dropKeys(ops, gone) ?? ops;
      let strips = (getValues('cutStrips') ?? []) as CutStrip[];
      let stripsChanged = false;
      next.forEach((o, i) => {
        let operation = o;
        for (const seamKey of gone) {
          const stripped = removeBindingStripsForSeam(operation, strips, seamKey);
          if (!stripped) continue;
          strips = stripped.strips;
          stripsChanged = true;
          operation = { ...operation, inputKeys: stripped.inputKeys };
        }
        if (operation !== o)
          setValue(`operations.${i}.inputKeys`, operation.inputKeys ?? [], { shouldDirty: true });
        if (o === ops[i]) return;
        if (o.seamKeys !== ops[i].seamKeys)
          setValue(`operations.${i}.seamKeys`, o.seamKeys ?? [], { shouldDirty: true });
        if (o.poseKeys !== ops[i].poseKeys)
          setValue(`operations.${i}.poseKeys`, o.poseKeys ?? [], { shouldDirty: true });
      });
      if (stripsChanged) setValue('cutStrips', strips as never, { shouldDirty: true });
    });
  }, [cardId, getValues, setValue]);

  // L16: the links a page before this one owed, and the ones this page's own writes have now landed.
  // Every card read comes through here; the timeout lets the page's effects put the card in the form.
  const autosave = useTechCardAutosave();
  const autosaveRef = useRef(autosave);
  autosaveRef.current = autosave;
  const autosaveOff = autosave.status === 'off';
  useEffect(() => {
    if (!cardId || frozen || autosaveOff || !owedLinks(cardId).length) return;
    const timer = window.setTimeout(() => {
      const seams = useSeamsStore.getState();
      if (seams.cardId !== cardId) return;
      const plan = planOwedLinks(
        owedLinks(cardId),
        (techCard?.techCard?.operations ?? []) as never,
        (getValues('operations') ?? []) as never,
        [
          ...seams.server.map((r) => ({ seamKey: r.seamKey, sig: rowPairSig(r) })),
          ...seams.poses.map((r) => ({ seamKey: r.seamKey })),
        ],
        Date.now(),
      );
      for (const link of plan.drop) clearLinkOwed(cardId, link.key);
      for (const { index, field, key } of plan.attach) {
        const path = `operations.${index}.${field}` as const;
        const current = (getValues(path) ?? []) as string[];
        setValue(path, [...current, key], { shouldDirty: true });
      }
      if (plan.attach.length) autosaveRef.current.request('seam-link');
    }, 0);
    return () => window.clearTimeout(timer);
  }, [cardId, frozen, autosaveOff, techCard, getValues, setValue]);

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
    for (const label of techCard?.techCard?.garmentLabels ?? [])
      if (label.lineKey)
        m.set(label.lineKey, (label.key ?? '').trim() || (label.kind ?? '').trim() || 'label');
    return m;
  }, [techCard?.techCard?.pieces, techCard?.techCard?.garmentLabels]);

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
  return (
    <Ctx.Provider value={value}>
      <CutStripSeamMmSync disabled={frozen} />
      <TopstitchLineMmSync disabled={frozen} />
      {!frozen && <TopstitchThreadDefaults />}
      {children}
    </Ctx.Provider>
  );
}
