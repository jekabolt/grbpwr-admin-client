import { useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { common_Fitting } from 'api/proto-http/admin';
import {
  fittingKeys,
  fittingSaveErrorMessage,
  useUpdateFitting,
} from 'components/managers/fittings/components/useFittingQuery';
import { failureClassOfError } from 'components/managers/tech-card/components/useTechCardAutosave';
import { notify } from 'lib/stores/store';
import { useCallback, useEffect, useRef, useState } from 'react';
import { UseFormReturn } from 'react-hook-form';
import { extractFieldViolations, fieldErrorSummary } from 'utils/field-errors';
import { FittingFormData, mapFittingToForm, mapFormToFittingInsert } from './schema';
import { SaveState } from './workspace';

const DEBOUNCE_MS = 800;

// Form-backed fitting fields the workspace edits in place. A change to any of them (or to a
// nested path under one, e.g. `callouts.3.posX`) schedules a save; roundNumber / changeRequests
// are not here: roundNumber mirrors the sample, change requests have their own RPCs.
const TRACKED = [
  'mediaIds',
  'callouts',
  'comment',
  'outcome',
  'status',
  'modelId',
  'fittingDate',
  'recordedBy',
  'sampleId',
  'techCardId',
] as const;

function isTracked(name: string | undefined): boolean {
  if (!name) return false;
  return TRACKED.some((t) => name === t || name.startsWith(`${t}.`));
}

// Autosave of the fitting row (UpdateFitting is a full replace of the row + its sizes / media /
// patterns / callouts; change requests are never sent on update — mapFormToFittingInsert omits
// them when `original` is set).
//
// LOCK VERSION. UpdateFitting answers with an empty body, and only UpdateFitting moves the row's
// lock_version (+1 per write; the change-request RPCs do not touch it). So after each own write the
// version is bumped locally instead of waiting for the refetch. A server copy that arrives later is
// NOT adopted: a higher version there means somebody else wrote, and the next save must 409 rather
// than silently overwrite them. On 409 the fitting is reloaded and the form takes the server copy.
//
// ONE REQUEST IN FLIGHT. Changes made during a save are coalesced into one follow-up save of the
// latest values.
export function useFittingAutosave({
  form,
  fitting,
  fittingId,
  sampleSizeId,
}: {
  form: UseFormReturn<FittingFormData>;
  fitting: common_Fitting | undefined;
  fittingId: number;
  sampleSizeId: number;
}): { saveNow: () => void; saveState: SaveState; saveError: string | null } {
  const updateFitting = useUpdateFitting();
  const queryClient = useQueryClient();
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);

  const lockRef = useRef<number>(fitting?.lockVersion ?? 0);
  const originalRef = useRef(fitting?.fitting);
  const sizeRef = useRef(sampleSizeId);
  sizeRef.current = sampleSizeId;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const pendingRef = useRef(false);
  const dirtyRef = useRef(false);
  const mountedRef = useRef(true);

  // Keep the spread base (fields the form does not manage) fresh, never the lock version.
  useEffect(() => {
    if (fitting?.fitting) originalRef.current = fitting.fitting;
  }, [fitting?.fitting]);

  const mutateRef = useRef(updateFitting.mutateAsync);
  mutateRef.current = updateFitting.mutateAsync;

  const reload = useCallback(async () => {
    try {
      const res = await adminService.GetFitting({ id: fittingId });
      const fresh = res.fitting;
      if (!fresh) return;
      queryClient.setQueryData(fittingKeys.detail(fittingId), fresh);
      lockRef.current = fresh.lockVersion ?? 0;
      originalRef.current = fresh.fitting;
      dirtyRef.current = false;
      if (mountedRef.current) form.reset(mapFittingToForm(fresh));
    } catch (e) {
      console.error('Failed to reload fitting', e);
    }
  }, [fittingId, form, queryClient]);

  const flushRef = useRef<() => Promise<void>>(async () => {});
  flushRef.current = async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!dirtyRef.current) return;
    if (inFlightRef.current) {
      pendingRef.current = true;
      return;
    }
    const values = form.getValues();
    // Nothing to try on without both links; the server would refuse the row.
    if (!values.techCardId || !values.sampleId) return;

    inFlightRef.current = true;
    dirtyRef.current = false;
    if (mountedRef.current) setSaveState('saving');
    const expected = lockRef.current;
    try {
      await mutateRef.current({
        id: fittingId,
        fitting: mapFormToFittingInsert(values, originalRef.current, sizeRef.current),
        expectedLockVersion: expected,
      });
      lockRef.current = expected + 1;
      if (mountedRef.current) {
        setSaveError(null);
        setSaveState('saved');
      }
    } catch (error) {
      const cls = failureClassOfError(error);
      const said = extractFieldViolations(error).length
        ? fieldErrorSummary(error, 'Failed to save fitting')
        : fittingSaveErrorMessage(error);
      console.error('Failed to save fitting', error);
      if (mountedRef.current) {
        setSaveError(said);
        setSaveState('error');
      }
      if (cls === 'conflict') {
        pendingRef.current = false;
        await reload();
      } else if (cls === 'transient') {
        // The values were not stored: keep them owed, offer a retry.
        dirtyRef.current = true;
        notify({
          sev: 'error',
          subject: `FITTING ${fittingId}`,
          text: 'not saved',
          detail: said,
          action: { label: 'retry', onClick: () => void flushRef.current() },
        });
      }
    } finally {
      inFlightRef.current = false;
    }
    if (pendingRef.current) {
      pendingRef.current = false;
      void flushRef.current();
    }
  };

  const schedule = useCallback(() => {
    dirtyRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void flushRef.current(), DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    const sub = form.watch((_values, { name }) => {
      if (isTracked(name)) schedule();
    });
    return () => sub.unsubscribe();
  }, [form, schedule]);

  // Leaving the screen with a debounced change still owed: send it now.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) void flushRef.current();
    };
  }, []);

  const saveNow = useCallback(() => {
    dirtyRef.current = true;
    void flushRef.current();
  }, []);

  return { saveNow, saveState, saveError };
}
