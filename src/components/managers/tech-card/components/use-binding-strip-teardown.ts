import { useCallback } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { useParams } from 'react-router-dom';

import { rowsOf, useSeamsStore } from './assembly-seams/seams-store';
import { useSeamWrites } from './assembly-seams/use-seam-decisions';
import { teardownBindingStrips } from './binding-step';
import type { CutStrip } from './cut-strip-editor/use-cut-strip';
import type { TechCardFormData } from './schema';
import { useStepSeams } from './step-seams/step-seams-context';

type Scope = Parameters<typeof teardownBindingStrips>[1];

/** Delete stored seam rows first, then apply the pure binding-strip teardown to the live form. */
export function useBindingStripTeardown() {
  const ctx = useStepSeams();
  const { control, getValues, setValue } = useFormContext<TechCardFormData>();
  const approvalState = useWatch({ control, name: 'approvalState' });
  const storeCardId = useSeamsStore((state) => state.cardId) ?? undefined;
  const { id: routeId } = useParams<{ id: string }>();
  const parsedRouteId = routeId ? Number(routeId) : 0;
  const cardId = ctx?.cardId ?? (parsedRouteId > 0 ? parsedRouteId : storeCardId);
  // BOM and patterns are siblings of the construction provider. They share its hydrated seam store,
  // but need their own writer so a delete can still remove seam rows before touching the form.
  const outsideWrites = useSeamWrites(
    cardId,
    approvalState === 'TECH_CARD_APPROVAL_STATE_RELEASED',
  );
  const removeRows = ctx?.writes.remove ?? outsideWrites.remove;

  return useCallback(
    async (scope: Scope): Promise<boolean> => {
      const seamState = useSeamsStore.getState();
      // A card switch settles in an effect. Never let the previous card's rows authorize a delete.
      const seamReady = !cardId || seamState.cardId === cardId;
      const seamRows = seamReady ? rowsOf(seamState) : [];
      const plan = teardownBindingStrips(
        {
          cutStrips: (getValues('cutStrips') ?? []) as CutStrip[],
          operations: getValues('operations') ?? [],
          seamRows,
        },
        scope,
      );
      if (!plan.operations.length && plan.strips.length === (getValues('cutStrips') ?? []).length)
        return true;
      if (!seamReady) return false;
      const removeKeys = new Set(plan.seamRowsToRemove);
      const rows = seamRows.filter((row) => removeKeys.has(row.seamKey));
      if (rows.length && !(await removeRows(rows))) return false;

      setValue('cutStrips', plan.strips as never, { shouldDirty: true });
      for (const patch of plan.operations) {
        setValue(`operations.${patch.index}.inputKeys`, patch.inputKeys, { shouldDirty: true });
        setValue(`operations.${patch.index}.seamKeys`, patch.seamKeys, { shouldDirty: true });
      }
      return true;
    },
    [cardId, getValues, removeRows, setValue],
  );
}
