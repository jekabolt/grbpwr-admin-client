import * as DialogPrimitives from '@radix-ui/react-dialog';
import { useQuery } from '@tanstack/react-query';
import { adminService } from 'api/api';
import {
  common_ProductionRun,
  common_ProductionRunCostKind,
  common_ProductionRunInsert,
  common_ProductionRunStatus,
} from 'api/proto-http/admin';
import { CURRENCIES } from 'constants/constants';
import { findInDictionary } from 'lib/features/findInDictionary';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useMemo, useState } from 'react';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { decimalToInput, inputToDecimal } from 'utils/decimal';
import { runCostKindOptions, runStatusOptions } from './options';
import { useSaveProductionRun } from './useProductionRuns';

const cell = 'w-full border border-textInactiveColor bg-bgColor px-2 py-1.5 text-textBaseSize';
const isoToDate = (ts?: string) => (ts ? ts.slice(0, 10) : '');
const dateToIso = (d: string) => (d ? new Date(`${d}T00:00:00Z`).toISOString() : undefined);

type SizeDraft = { sizeId: number; plannedQty: string };
type CostDraft = {
  kind: string;
  description: string;
  amount: string;
  currency: string;
  incurredAt: string;
};
type Draft = {
  techCardId: number;
  releaseId: number;
  status: common_ProductionRunStatus;
  startedAt: string;
  notes: string;
  sizes: SizeDraft[];
  costs: CostDraft[];
};

const emptyDraft: Draft = {
  techCardId: 0,
  releaseId: 0,
  status: 'PRODUCTION_RUN_STATUS_PLANNED',
  startedAt: '',
  notes: '',
  sizes: [],
  costs: [],
};

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
  const { dictionary } = useDictionary();
  const save = useSaveProductionRun();
  const isEdit = !!run?.id;
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
            sizes: (ins.sizes ?? []).map((s) => ({
              sizeId: s.sizeId ?? 0,
              plannedQty: String(s.plannedQty ?? 0),
            })),
            costs: (ins.costs ?? []).map((c) => ({
              kind: c.kind ?? 'PRODUCTION_RUN_COST_KIND_OTHER',
              description: c.description ?? '',
              amount: decimalToInput(c.amount),
              currency: c.currency ?? 'EUR',
              incurredAt: isoToDate(c.incurredAt),
            })),
          }
        : emptyDraft,
    );
  }, [run, open]);

  // Tech-card picker options (create only — editing keeps the run's tech card fixed).
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
        season: undefined,
        name: undefined,
        productId: undefined,
      }),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });
  const techCards = tcData?.techCards ?? [];

  // Releases of the selected tech card (optional "plan from release").
  const { data: relData } = useQuery({
    queryKey: ['techCardReleasesForRun', d.techCardId],
    queryFn: () => adminService.ListTechCardReleases({ techCardId: d.techCardId }),
    enabled: open && d.techCardId > 0,
  });
  const releases = relData?.releases ?? [];

  const usedSizeIds = new Set(d.sizes.map((s) => s.sizeId));
  const availableSizes = useMemo(
    () => (dictionary?.sizes ?? []).filter((s) => s.id != null && !usedSizeIds.has(s.id)),
    [dictionary, d.sizes],
  );

  const set = (patch: Partial<Draft>) => setD((prev) => ({ ...prev, ...patch }));

  const addSize = () => {
    const next = availableSizes[0];
    if (!next?.id) return;
    set({ sizes: [...d.sizes, { sizeId: next.id, plannedQty: '' }] });
  };
  const addCost = () =>
    set({
      costs: [
        ...d.costs,
        {
          kind: 'PRODUCTION_RUN_COST_KIND_MATERIALS',
          description: '',
          amount: '',
          currency: 'EUR',
          incurredAt: '',
        },
      ],
    });

  const submit = () => {
    if (!d.techCardId) {
      showMessage('Tech card is required', 'error');
      return;
    }
    if (d.sizes.length === 0) {
      showMessage('Add at least one size', 'error');
      return;
    }
    const insert: common_ProductionRunInsert = {
      techCardId: d.techCardId,
      releaseId: d.releaseId || undefined,
      status: d.status,
      startedAt: dateToIso(d.startedAt),
      receivedAt: run?.run?.receivedAt, // set by the receive flow; preserve on edit
      notes: d.notes.trim(),
      // received/defect stay unset here — they are captured at receive time.
      sizes: d.sizes.map((s) => ({
        sizeId: s.sizeId,
        plannedQty: Number(s.plannedQty) || 0,
        receivedQty: run?.run?.sizes?.find((x) => x.sizeId === s.sizeId)?.receivedQty,
        defectQty: run?.run?.sizes?.find((x) => x.sizeId === s.sizeId)?.defectQty,
      })),
      costs: d.costs
        .filter((c) => c.amount.trim())
        .map((c) => ({
          kind: c.kind as common_ProductionRunCostKind,
          description: c.description.trim(),
          amount: inputToDecimal(c.amount),
          currency: c.currency,
          amountBase: undefined, // server folds to base via FX rates
          incurredAt: dateToIso(c.incurredAt),
        })),
    };
    save.mutate(
      { id: run?.id ?? 0, run: insert },
      {
        onSuccess: () => {
          showMessage(isEdit ? 'Run updated' : 'Run created', 'success');
          onOpenChange(false);
        },
        onError: (e) => showMessage(e instanceof Error ? e.message : 'Failed to save run', 'error'),
      },
    );
  };

  return (
    <DialogPrimitives.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitives.Portal>
        <DialogPrimitives.Overlay className='fixed inset-0 z-20 h-screen bg-overlay' />
        <DialogPrimitives.Content className='fixed inset-x-2.5 top-1/2 z-50 flex max-h-[90vh] w-auto -translate-y-1/2 flex-col overflow-y-auto border border-textInactiveColor bg-bgColor text-textColor lg:inset-x-auto lg:left-1/2 lg:w-[600px] lg:-translate-x-1/2'>
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
            Plan a production run: tech card, sizes and actual cost lines.
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
                  {runStatusOptions.map((o) => (
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
              </label>
            </div>

            {/* sizes */}
            <div className='flex flex-col gap-2 border-t border-textInactiveColor pt-3'>
              <div className='flex items-center justify-between'>
                <Text variant='uppercase' size='small'>
                  planned sizes *
                </Text>
                <Button
                  type='button'
                  variant='secondary'
                  size='lg'
                  className='uppercase'
                  disabled={availableSizes.length === 0}
                  onClick={addSize}
                >
                  add size
                </Button>
              </div>
              {d.sizes.length === 0 ? (
                <Text variant='inactive' size='small'>
                  no sizes
                </Text>
              ) : (
                d.sizes.map((s, i) => (
                  <div key={s.sizeId} className='flex items-center gap-2'>
                    <span className='w-24 shrink-0'>
                      <Text size='small'>
                        {findInDictionary(dictionary, s.sizeId, 'size') || s.sizeId}
                      </Text>
                    </span>
                    <input
                      className={cell}
                      type='number'
                      min='0'
                      placeholder='planned qty'
                      value={s.plannedQty}
                      onChange={(e) =>
                        setD((prev) => {
                          const sizes = [...prev.sizes];
                          sizes[i] = { ...sizes[i], plannedQty: e.target.value };
                          return { ...prev, sizes };
                        })
                      }
                    />
                    <Button
                      type='button'
                      variant='secondary'
                      aria-label='remove size'
                      onClick={() =>
                        setD((prev) => ({ ...prev, sizes: prev.sizes.filter((_, j) => j !== i) }))
                      }
                    >
                      ✕
                    </Button>
                  </div>
                ))
              )}
            </div>

            {/* actual cost lines */}
            <div className='flex flex-col gap-2 border-t border-textInactiveColor pt-3'>
              <div className='flex items-center justify-between'>
                <Text variant='uppercase' size='small'>
                  actual cost lines
                </Text>
                <Button
                  type='button'
                  variant='secondary'
                  size='lg'
                  className='uppercase'
                  onClick={addCost}
                >
                  add cost
                </Button>
              </div>
              <Text variant='inactive' size='small'>
                Фактические статьи затрат партии; сервер свернёт их в базовую валюту (amount_base).
              </Text>
              {d.costs.map((c, i) => (
                <div key={i} className='grid grid-cols-2 gap-2 sm:grid-cols-5'>
                  <select
                    className={cell}
                    value={c.kind}
                    onChange={(e) =>
                      setD((prev) => {
                        const costs = [...prev.costs];
                        costs[i] = { ...costs[i], kind: e.target.value };
                        return { ...prev, costs };
                      })
                    }
                  >
                    {runCostKindOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <input
                    className={`${cell} sm:col-span-2`}
                    placeholder='description'
                    value={c.description}
                    onChange={(e) =>
                      setD((prev) => {
                        const costs = [...prev.costs];
                        costs[i] = { ...costs[i], description: e.target.value };
                        return { ...prev, costs };
                      })
                    }
                  />
                  <input
                    className={cell}
                    type='number'
                    step='0.01'
                    min='0'
                    placeholder='amount'
                    value={c.amount}
                    onChange={(e) =>
                      setD((prev) => {
                        const costs = [...prev.costs];
                        costs[i] = { ...costs[i], amount: e.target.value };
                        return { ...prev, costs };
                      })
                    }
                  />
                  <div className='flex gap-1'>
                    <select
                      className={cell}
                      value={c.currency}
                      onChange={(e) =>
                        setD((prev) => {
                          const costs = [...prev.costs];
                          costs[i] = { ...costs[i], currency: e.target.value };
                          return { ...prev, costs };
                        })
                      }
                    >
                      {CURRENCIES.map((cur) => (
                        <option key={cur.value} value={cur.value}>
                          {cur.value}
                        </option>
                      ))}
                    </select>
                    <Button
                      type='button'
                      variant='secondary'
                      aria-label='remove cost'
                      onClick={() =>
                        setD((prev) => ({ ...prev, costs: prev.costs.filter((_, j) => j !== i) }))
                      }
                    >
                      ✕
                    </Button>
                  </div>
                </div>
              ))}
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
            <Button
              type='button'
              variant='main'
              size='lg'
              disabled={save.isPending}
              onClick={submit}
            >
              {save.isPending ? 'saving…' : 'save'}
            </Button>
          </div>
        </DialogPrimitives.Content>
      </DialogPrimitives.Portal>
    </DialogPrimitives.Root>
  );
}
