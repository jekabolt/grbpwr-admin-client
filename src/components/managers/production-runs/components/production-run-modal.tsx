import * as DialogPrimitives from '@radix-ui/react-dialog';
import { useQuery } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { common_ProductionRun, common_ProductionRunStatus } from 'api/proto-http/admin';
import { techCardKeys } from 'components/managers/tech-cards/components/useTechCardQuery';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useState } from 'react';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { decimalToInput, inputToDecimal, sanitizeDecimal } from 'utils/decimal';
import { runStatusLabel, runStatusOptions } from './options';
import { updateRunErrorMessage, useUpdateRunSection } from './useProductionRuns';

const cell = 'w-full border border-textInactiveColor bg-bgColor px-2 py-1.5 text-textBaseSize';
const isoToDate = (ts?: string) => (ts ? ts.slice(0, 10) : '');
const dateToIso = (d: string) => (d ? new Date(`${d}T00:00:00Z`).toISOString() : undefined);

type Draft = {
  techCardId: number;
  releaseId: number;
  status: common_ProductionRunStatus;
  startedAt: string;
  // Planning dates (production cockpit): when the batch is MEANT to start and the date it is
  // promised for. Distinct from startedAt, which records when work actually began — the plan and
  // the fact are separate columns precisely so a miss is visible.
  plannedStartAt: string;
  promisedAt: string;
  notes: string;
  // Run ACTUAL cutting wastage % (0..100) as a plain decimal string; blank = unset (fall back to
  // the BOM estimate). Sent as a google.type.Decimal via inputToDecimal, like markerEfficiencyPct.
  actualWastagePercent: string;
};

const emptyDraft: Draft = {
  techCardId: 0,
  releaseId: 0,
  status: 'PRODUCTION_RUN_STATUS_PLANNED',
  startedAt: '',
  plannedStartAt: '',
  promisedAt: '',
  notes: '',
  actualWastagePercent: '',
};

// The run's header/meta only — the EDITOR of an existing run, and nothing else (Ф6.4).
//
// Lines, marker and costs are edited on the detail page (NF-06 makes a run a multi-colourway grid —
// a single-product modal would collapse it); edit here is a read-modify-write of just these fields,
// so it can't wipe what the detail page saved.
//
// CREATION LIVES IN create-run-modal.tsx AND MUST NOT COME BACK HERE. Creating a run became a
// multi-step surface (карточка → релиз → колорвеи → количества → покрытие) whose whole point is the
// readiness gate recomputing on the composed grid. This file stays a plain RMW form; a flag serving
// both would make both worse, and the gate would end up half-wired into a form that never needed it.
export function ProductionRunModal({
  open,
  onOpenChange,
  run,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  run?: common_ProductionRun;
}) {
  const { showMessage } = useSnackBarStore();
  const update = useUpdateRunSection();
  const isEdit = !!run?.id;
  const busy = update.isPending;
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
            plannedStartAt: isoToDate(ins.plannedStartAt),
            promisedAt: isoToDate(ins.promisedAt),
            notes: ins.notes ?? '',
            actualWastagePercent: decimalToInput(ins.actualWastagePercent),
          }
        : emptyDraft,
    );
  }, [run, open]);

  const { data: tcData } = useQuery({
    // Keyed UNDER techCardKeys.lists() rather than off on its own string, so every tech-card
    // mutation's existing invalidation reaches it. Standing outside the factory meant this dropdown
    // could keep serving a 5-minute-stale card list — a card created or re-purposed a moment ago
    // was simply absent from the picker with no way to refresh but waiting.
    queryKey: [...techCardKeys.lists(), 'forRun'],
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
        categoryIds: undefined,
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

  // The modal can no longer be OPENED on a received/closed run (the edit affordances are hidden —
  // the server rejects any update on such a run before it even reads the status, so the
  // received → closed move this dropdown used to offer was unreachable and every save failed).
  const statusOptions = runStatusOptions;

  const submit = () => {
    // No create branch: this modal is only ever opened on an existing run. A missing id here is a
    // caller bug, not an operator one — refuse loudly rather than silently minting a run.
    if (!isEdit || !run?.id) {
      showMessage('Нет прогона для правки — создание живёт в отдельной модалке', 'error');
      return;
    }
    // Patch only the meta; RMW preserves lines / costs / marker edited on the detail page.
    update.mutate(
      {
        id: run.id,
        lockVersion: run.lockVersion ?? 0,
        patch: {
          releaseId: d.releaseId || undefined,
          status: d.status,
          startedAt: dateToIso(d.startedAt),
          plannedStartAt: dateToIso(d.plannedStartAt),
          promisedAt: dateToIso(d.promisedAt),
          notes: d.notes.trim(),
          // Run-level ACTUAL cutting wastage %; blank → undefined clears it (back to BOM estimate).
          actualWastagePercent: inputToDecimal(d.actualWastagePercent),
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
  };

  return (
    <DialogPrimitives.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitives.Portal>
        <DialogPrimitives.Overlay className='fixed inset-0 z-[var(--z-modal)] h-screen bg-overlay' />
        <DialogPrimitives.Content className='fixed inset-x-2.5 top-1/2 z-50 flex max-h-[90vh] w-auto -translate-y-1/2 flex-col overflow-y-auto border border-textInactiveColor bg-bgColor text-textColor lg:inset-x-auto lg:left-1/2 lg:w-[520px] lg:-translate-x-1/2'>
          <div className='sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-textInactiveColor bg-bgColor px-4 py-3'>
            <DialogPrimitives.Title className='text-lg uppercase'>
              {`production run PR-${run?.id ?? ''}`}
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
                  // A run's tech card is fixed at creation: moving one style's batch onto another
                  // style would re-point its lines at colourways that are not the card's.
                  disabled
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
                  {/* A release's identity is its releaseNumber — `version` is a reserved field the
                      backend no longer emits, so labelling by it rendered every entry as a bare "v"
                      and two releases at the same unit cost became indistinguishable. */}
                  {releases.map((r) => (
                    <option key={r.id} value={r.id}>
                      Rev.{r.releaseNumber ?? '—'}
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
              </label>
              <label className='flex flex-col gap-1'>
                <Text size='small'>started at</Text>
                <input
                  className={cell}
                  type='date'
                  value={d.startedAt}
                  onChange={(e) => set({ startedAt: e.target.value })}
                />
                <Text variant='label' size='small'>
                  when work actually began — the fact, not the plan
                </Text>
              </label>
              <label className='flex flex-col gap-1'>
                <Text size='small'>planned start</Text>
                <input
                  className={cell}
                  type='date'
                  value={d.plannedStartAt}
                  onChange={(e) => set({ plannedStartAt: e.target.value })}
                />
              </label>
              <label className='flex flex-col gap-1'>
                <Text size='small'>promised (обещано)</Text>
                <input
                  className={cell}
                  type='date'
                  value={d.promisedAt}
                  onChange={(e) => set({ promisedAt: e.target.value })}
                />
                <Text variant='label' size='small'>
                  the delivery date this batch is committed to; an open run past it reads as
                  «опаздывает»
                </Text>
              </label>
              <label className='flex flex-col gap-1'>
                <Text size='small'>actual cutting wastage %</Text>
                <input
                  className={cell}
                  inputMode='decimal'
                  placeholder='e.g. 12.5'
                  value={d.actualWastagePercent}
                  onChange={(e) => set({ actualWastagePercent: sanitizeDecimal(e.target.value) })}
                />
                <Text variant='label' size='small'>
                  overrides the BOM estimate for this run's cost; leave blank to use the BOM's
                  estimated cutting wastage
                </Text>
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
          </div>

          <div className='sticky bottom-0 flex justify-end gap-2 border-t border-textInactiveColor bg-bgColor px-4 py-3'>
            <Button type='button' variant='secondary' size='lg' onClick={() => onOpenChange(false)}>
              cancel
            </Button>
            <Button type='button' variant='main' size='lg' disabled={busy} onClick={submit}>
              {busy ? 'saving…' : 'save'}
            </Button>
          </div>
        </DialogPrimitives.Content>
      </DialogPrimitives.Portal>
    </DialogPrimitives.Root>
  );
}
