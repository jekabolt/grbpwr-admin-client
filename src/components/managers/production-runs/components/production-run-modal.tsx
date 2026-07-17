import * as DialogPrimitives from '@radix-ui/react-dialog';
import { useQuery } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { common_ProductionRun, common_ProductionRunStatus } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { decimalToInput } from 'utils/decimal';
import { isRunLocked, runDetailPath, runStatusLabel, runStatusOptions } from './options';
import {
  updateRunErrorMessage,
  useSaveProductionRun,
  useUpdateRunSection,
} from './useProductionRuns';

const cell = 'w-full border border-textInactiveColor bg-bgColor px-2 py-1.5 text-textBaseSize';
const isoToDate = (ts?: string) => (ts ? ts.slice(0, 10) : '');
const dateToIso = (d: string) => (d ? new Date(`${d}T00:00:00Z`).toISOString() : undefined);

type Draft = {
  techCardId: number;
  releaseId: number;
  status: common_ProductionRunStatus;
  startedAt: string;
  notes: string;
};

const emptyDraft: Draft = {
  techCardId: 0,
  releaseId: 0,
  status: 'PRODUCTION_RUN_STATUS_PLANNED',
  startedAt: '',
  notes: '',
};

// The run's header/meta only. Lines, marker and costs are edited on the detail page (NF-06 makes a
// run a multi-colourway grid — a single-product modal would collapse it). Create bootstraps an
// empty run and jumps to its detail; edit is a read-modify-write of just these fields, so it can't
// wipe the lines/costs saved on the detail page.
export function ProductionRunModal({
  open,
  onOpenChange,
  run,
  initialTechCardId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  run?: common_ProductionRun;
  // Seed the tech card on a fresh run (the spine's [plan run] deep link, W3.6). Ignored on edit.
  initialTechCardId?: number;
}) {
  const { showMessage } = useSnackBarStore();
  const navigate = useNavigate();
  const create = useSaveProductionRun();
  const update = useUpdateRunSection();
  const isEdit = !!run?.id;
  const busy = create.isPending || update.isPending;
  const [d, setD] = useState<Draft>(emptyDraft);

  useEffect(() => {
    if (!open) return;
    const ins = run?.run;
    setD(
      ins
        ? {
            techCardId: ins.techCardId ?? 0,
            releaseId: ins.releaseId ?? 0,
            status: ins.status ?? 'PRODUCTION_RUN_STATUS_PLANNED',
            startedAt: isoToDate(ins.startedAt),
            notes: ins.notes ?? '',
          }
        : { ...emptyDraft, techCardId: initialTechCardId ?? 0 },
    );
  }, [run, open, initialTechCardId]);

  const { data: tcData } = useQuery({
    queryKey: ['techCardsForRun'],
    queryFn: () =>
      adminService.ListTechCards({
        limit: 200,
        offset: 0,
        orderFactor: undefined,
        stage: undefined,
        gender: undefined,
        brand: undefined,
        name: undefined,
        purpose: undefined,
        skuSeason: undefined,
        productId: undefined,
      }),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });
  const techCards = tcData?.techCards ?? [];

  const { data: relData } = useQuery({
    queryKey: ['techCardReleasesForRun', d.techCardId],
    queryFn: () => adminService.ListTechCardReleases({ techCardId: d.techCardId }),
    enabled: open && d.techCardId > 0,
  });
  const releases = relData?.releases ?? [];

  const set = (patch: Partial<Draft>) => setD((prev) => ({ ...prev, ...patch }));

  // A received/closed run has stock (and possibly cost_price) posted — downgrading it to
  // planned would re-offer the receive button and double-post stock, and un-hide delete.
  // Only the forward move received → closed stays available.
  const statusLocked = isEdit && isRunLocked(run?.run?.status);
  const statusOptions = statusLocked
    ? runStatusOptions.filter((o) => o.value === 'PRODUCTION_RUN_STATUS_CLOSED')
    : runStatusOptions;

  const submit = () => {
    if (!d.techCardId) {
      showMessage('Tech card is required', 'error');
      return;
    }
    if (isEdit && run?.id) {
      // Patch only the meta; RMW preserves lines / costs / marker edited on the detail page.
      update.mutate(
        {
          id: run.id,
          patch: {
            releaseId: d.releaseId || undefined,
            status: d.status,
            startedAt: dateToIso(d.startedAt),
            notes: d.notes.trim(),
          },
        },
        {
          onSuccess: () => {
            showMessage('Run updated', 'success');
            onOpenChange(false);
          },
          onError: (e) => showMessage(updateRunErrorMessage(e), 'error'),
        },
      );
      return;
    }
    // Create an empty run, then jump to its detail to plan lines / marker / costs.
    create.mutate(
      {
        id: 0,
        run: {
          techCardId: d.techCardId,
          releaseId: d.releaseId || undefined,
          status: d.status,
          startedAt: dateToIso(d.startedAt),
          receivedAt: undefined,
          notes: d.notes.trim(),
          lines: [],
          costs: [],
          markerEfficiencyPct: undefined,
          markerNotes: undefined,
          markers: [],
        },
      },
      {
        onSuccess: (res) => {
          showMessage('Run created', 'success');
          onOpenChange(false);
          const id = (res as { id?: number })?.id;
          if (id) navigate(runDetailPath(id));
        },
        onError: (e) => showMessage(e instanceof Error ? e.message : 'Failed to save run', 'error'),
      },
    );
  };

  return (
    <DialogPrimitives.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitives.Portal>
        <DialogPrimitives.Overlay className='fixed inset-0 z-[var(--z-modal)] h-screen bg-overlay' />
        <DialogPrimitives.Content className='fixed inset-x-2.5 top-1/2 z-50 flex max-h-[90vh] w-auto -translate-y-1/2 flex-col overflow-y-auto border border-textInactiveColor bg-bgColor text-textColor lg:inset-x-auto lg:left-1/2 lg:w-[520px] lg:-translate-x-1/2'>
          <div className='sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-textInactiveColor bg-bgColor px-4 py-3'>
            <DialogPrimitives.Title className='text-lg uppercase'>
              {isEdit ? `production run PR-${run?.id}` : 'new production run'}
            </DialogPrimitives.Title>
            <DialogPrimitives.Close asChild>
              <Button type='button' className='shrink-0 cursor-pointer'>
                [x]
              </Button>
            </DialogPrimitives.Close>
          </div>
          <DialogPrimitives.Description className='sr-only'>
            The run's tech card, release, status and dates. Plan lines on the detail page.
          </DialogPrimitives.Description>

          <div className='flex flex-col gap-4 p-4'>
            <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
              <label className='flex flex-col gap-1'>
                <Text size='small'>tech card *</Text>
                <select
                  className={cell}
                  value={d.techCardId || 0}
                  disabled={isEdit}
                  onChange={(e) => set({ techCardId: Number(e.target.value) || 0, releaseId: 0 })}
                >
                  <option value={0}>— select —</option>
                  {techCards.map((t) => (
                    <option key={t.id} value={t.id}>
                      TC-{t.id} · {t.styleNumber || t.name || 'untitled'}
                    </option>
                  ))}
                </select>
              </label>
              <label className='flex flex-col gap-1'>
                <Text size='small'>release (optional — plan from snapshot)</Text>
                <select
                  className={cell}
                  value={d.releaseId || 0}
                  onChange={(e) => set({ releaseId: Number(e.target.value) || 0 })}
                >
                  <option value={0}>— latest tech card —</option>
                  {releases.map((r) => (
                    <option key={r.id} value={r.id}>
                      v{r.version}
                      {r.unitCost?.value
                        ? ` · ${decimalToInput(r.unitCost)} ${r.currency || ''}`
                        : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className='flex flex-col gap-1'>
                <Text size='small'>status</Text>
                <select
                  className={cell}
                  value={d.status}
                  onChange={(e) => set({ status: e.target.value as common_ProductionRunStatus })}
                >
                  {!statusOptions.some((o) => o.value === d.status) && (
                    <option value={d.status}>{runStatusLabel(d.status)}</option>
                  )}
                  {statusOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {statusLocked ? (
                  <Text variant='inactive' size='small'>
                    stock is posted — status can only move forward to closed
                  </Text>
                ) : null}
              </label>
              <label className='flex flex-col gap-1'>
                <Text size='small'>started at</Text>
                <input
                  className={cell}
                  type='date'
                  value={d.startedAt}
                  onChange={(e) => set({ startedAt: e.target.value })}
                />
              </label>
            </div>

            <label className='flex flex-col gap-1'>
              <Text size='small'>notes</Text>
              <textarea
                className={cell}
                rows={2}
                value={d.notes}
                onChange={(e) => set({ notes: e.target.value })}
              />
            </label>

            {!isEdit && (
              <Text variant='inactive' size='small'>
                After creating, you'll plan colour-model × size lines, marker and costs on the run
                page.
              </Text>
            )}
          </div>

          <div className='sticky bottom-0 flex justify-end gap-2 border-t border-textInactiveColor bg-bgColor px-4 py-3'>
            <Button type='button' variant='secondary' size='lg' onClick={() => onOpenChange(false)}>
              cancel
            </Button>
            <Button type='button' variant='main' size='lg' disabled={busy} onClick={submit}>
              {busy ? 'saving…' : isEdit ? 'save' : 'create'}
            </Button>
          </div>
        </DialogPrimitives.Content>
      </DialogPrimitives.Portal>
    </DialogPrimitives.Root>
  );
}
