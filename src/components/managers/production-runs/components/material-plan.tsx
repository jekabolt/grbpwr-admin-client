import { useQueryClient } from '@tanstack/react-query';
import { MaterialPlanRow, common_ProductionRun, googletype_Decimal } from 'api/proto-http/admin';
import {
  IssueStockModal,
  MovementTarget,
} from 'components/managers/materials/components/movement-modals';
import { useSnackBarStore } from 'lib/stores/store';
import { useState } from 'react';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { decimalToInput } from 'utils/decimal';
import { productionRunKeys, useMaterialPlan } from './useProductionRuns';

const cell = 'border border-textInactiveColor bg-bgColor px-2 py-1 text-textBaseSize';
const num = (d?: googletype_Decimal) => decimalToInput(d) || '0';
const isShort = (r: MaterialPlanRow) => Number(r.shortage?.value) > 0;
// issued_variance (gap-04): signed issued − required. Blank until anything is issued.
const variance = (d?: googletype_Decimal) => {
  const n = Number(d?.value);
  if (!d?.value || !Number.isFinite(n) || n === 0) return '—';
  return `${n > 0 ? '+' : ''}${Number(n.toFixed(3))}`;
};

// Estimated material requirement of the run against warehouse stock (NF-06). Shortage is the ready
// purchase order (copy it — R-9); [issue…] opens the shared warehouse Issue modal locked to this
// run and prefilled with the shortage quantity so the fabric can be booked out in one step.
export function MaterialPlan({ run, canEdit }: { run: common_ProductionRun; canEdit: boolean }) {
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
  const runId = run.id ?? 0;
  const { data, isLoading, isError, refetch, isFetching } = useMaterialPlan(runId, runId > 0);
  const rows = data?.rows ?? [];
  const caveats = data?.caveats ?? [];

  const [issue, setIssue] = useState<{ target: MovementTarget; qty: string } | undefined>();

  const copyShortage = async () => {
    const text = rows
      .filter(isShort)
      .map((r) => `${r.materialName} — ${num(r.shortage)} ${r.unit ?? ''}`.trim())
      .join('; ');
    if (!text) {
      showMessage('No shortage to copy', 'error');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      showMessage('Shortage copied', 'success');
    } catch {
      showMessage('Could not copy to clipboard', 'error');
    }
  };

  return (
    <div className='flex flex-col gap-2 border-t border-textInactiveColor pt-4'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <Text variant='uppercase' size='small'>
          material plan
        </Text>
        <div className='flex items-center gap-2'>
          {rows.some(isShort) ? (
            <Button
              type='button'
              variant='secondary'
              size='lg'
              className='uppercase'
              onClick={copyShortage}
            >
              copy shortage
            </Button>
          ) : null}
          <Button
            type='button'
            variant='secondary'
            size='lg'
            className='uppercase'
            disabled={isFetching}
            onClick={() => refetch()}
          >
            {isFetching ? 'refreshing…' : 'refresh'}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Text size='small'>loading…</Text>
      ) : isError ? (
        <Text size='small'>Material plan is unavailable.</Text>
      ) : rows.length === 0 ? (
        <Text variant='inactive' size='small'>
          no material requirement — the card's colourways have no linked materials with norms
        </Text>
      ) : (
        <div className='overflow-x-auto'>
          <table className='border-collapse'>
            <thead>
              <tr>
                <th className={`${cell} text-left uppercase`}>material</th>
                <th className={`${cell} text-right uppercase`}>required</th>
                <th className={`${cell} text-right uppercase`}>on hand</th>
                <th className={`${cell} text-right uppercase`}>issued</th>
                <th className={`${cell} text-right uppercase`}>Δ vs plan</th>
                <th className={`${cell} text-right uppercase`}>shortage</th>
                {canEdit ? <th className={cell} /> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.materialId}>
                  <td className={cell}>
                    {r.materialName}
                    {r.hasSizeNorms === false ? (
                      <Text variant='inactive' size='small'>
                        per-garment norm (rough)
                      </Text>
                    ) : null}
                  </td>
                  <td className={`${cell} text-right`}>
                    {num(r.required)} {r.unit}
                  </td>
                  <td className={`${cell} text-right`}>{num(r.onHand)}</td>
                  <td className={`${cell} text-right`}>{num(r.issued)}</td>
                  <td
                    className={`${cell} text-right`}
                    title='issued − required: >0 over-issued (scrap/overuse), <0 leftover'
                  >
                    {variance(r.issuedVariance)}
                  </td>
                  <td className={`${cell} text-right ${isShort(r) ? 'font-bold' : ''}`}>
                    {isShort(r) ? '! ' : ''}
                    {num(r.shortage)}
                  </td>
                  {canEdit ? (
                    <td className={cell}>
                      <Button
                        type='button'
                        variant='secondary'
                        className='uppercase'
                        onClick={() =>
                          setIssue({
                            target: {
                              materialId: r.materialId ?? 0,
                              materialLabel: r.materialName ?? `#${r.materialId}`,
                              unit: r.unit ?? '',
                              onHand: decimalToInput(r.onHand),
                            },
                            qty: isShort(r) ? num(r.shortage) : '',
                          })
                        }
                      >
                        issue…
                      </Button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {caveats.length > 0 ? (
        <div className='flex flex-col gap-0.5'>
          {caveats.map((c, i) => (
            <Text key={i} variant='inactive' size='small'>
              · {c}
            </Text>
          ))}
        </div>
      ) : null}

      {issue ? (
        <IssueStockModal
          open
          onOpenChange={(v) => {
            if (!v) {
              setIssue(undefined);
              // Refresh the plan's issued/shortage and the run's actuals after a booking.
              qc.invalidateQueries({ queryKey: productionRunKeys.detail(runId) });
            }
          }}
          target={issue.target}
          defaultTarget={{ productionRunId: runId }}
          defaultQty={issue.qty}
          lockTarget
        />
      ) : null}
    </div>
  );
}
