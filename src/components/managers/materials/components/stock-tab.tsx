import { common_MaterialStockRow } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { SECTION } from 'constants/routes';
import { techCardBomSectionOptions } from 'constants/filter';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import GenericPopover from 'ui/components/popover';
import Text from 'ui/components/text';
import { decimalToInput } from 'utils/decimal';
import {
  AdjustStockModal,
  IssueStockModal,
  MovementTarget,
  ReceiveStockModal,
} from './movement-modals';
import { useMaterialStock } from './useWarehouse';

const cell = 'border border-textInactiveColor bg-bgColor px-2 py-1 text-textBaseSize';
const sectionLabel = (v?: string) =>
  techCardBomSectionOptions.find((o) => o.value === v)?.label ?? '—';

// Read/write the stock filters through the URL so a filtered view is shareable (R-1).
function useStockFilters() {
  const [params, setParams] = useSearchParams();
  const patch = (next: Record<string, string | boolean>) => {
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        Object.entries(next).forEach(([k, v]) => {
          if (v === '' || v === false) p.delete(k);
          else p.set(k, v === true ? '1' : String(v));
        });
        return p;
      },
      { replace: true },
    );
  };
  return {
    section: params.get('section') ?? '',
    q: params.get('q') ?? '',
    withStock: params.get('withStock') === '1',
    belowMin: params.get('belowMin') === '1',
    patch,
  };
}

export function StockTab() {
  const { canWrite, canReadCosting } = usePermissions();
  const canEdit = canWrite(SECTION.techCards);
  const [, setParams] = useSearchParams();
  const f = useStockFilters();

  // Debounce only the value feeding the query — the URL/input stay immediate. Without this,
  // every keystroke is a distinct ListMaterialStock request and a 5-min cache entry.
  const [debouncedQ, setDebouncedQ] = useState(f.q);
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(f.q), 300);
    return () => clearTimeout(id);
  }, [f.q]);

  const { data, isLoading, isError } = useMaterialStock({
    section: f.section,
    q: debouncedQ,
    withStockOnly: f.withStock,
    belowMinOnly: f.belowMin,
  });
  const rows = useMemo(() => data?.rows ?? [], [data]);

  // Movement modals share one target; which modal is open is a small enum.
  const [target, setTarget] = useState<MovementTarget | undefined>();
  const [modal, setModal] = useState<'receive' | 'issue' | 'adjust' | null>(null);
  const openModal = (row: common_MaterialStockRow, which: 'receive' | 'issue' | 'adjust') => {
    const m = row.material;
    setTarget({
      materialId: m?.id ? Number(m.id) : 0,
      materialLabel: `${m?.code ? `${m.code} · ` : ''}${m?.name ?? `#${m?.id}`}`,
      unit: m?.unit ?? '',
      // An absent balance means 0 — '' would silently disable the over-issue guard
      // (parseDecimalNumber('') is NaN) while the modal still displays "on hand: 0".
      onHand: decimalToInput(row.onHand) || '0',
    });
    setModal(which);
  };
  const goToMovements = (materialId?: number) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set('tab', 'movements');
        if (materialId) p.set('material', String(materialId));
        return p;
      },
      { replace: false },
    );

  const totalValue = useMemo(() => {
    if (!canReadCosting) return null;
    let sum = 0;
    let seen = false;
    for (const r of rows) {
      const v = Number(r.stockValueBase?.value);
      if (Number.isFinite(v)) {
        sum += v;
        seen = true;
      }
    }
    return seen ? sum : null;
  }, [rows, canReadCosting]);
  const baseCurrency = rows.find((r) => r.baseCurrency)?.baseCurrency ?? '';

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-wrap items-center gap-3'>
        <select
          className={cell}
          value={f.section}
          onChange={(e) => f.patch({ section: e.target.value })}
        >
          <option value=''>all sections</option>
          {techCardBomSectionOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <input
          className={cell}
          placeholder='search name / code'
          value={f.q}
          onChange={(e) => f.patch({ q: e.target.value })}
        />
        <label className='flex items-center gap-2'>
          <input
            type='checkbox'
            checked={f.withStock}
            onChange={(e) => f.patch({ withStock: e.target.checked })}
          />
          <Text size='small'>with stock only</Text>
        </label>
        <label className='flex items-center gap-2'>
          <input
            type='checkbox'
            checked={f.belowMin}
            onChange={(e) => f.patch({ belowMin: e.target.checked })}
          />
          <Text size='small'>below min only</Text>
        </label>
      </div>

      {isLoading ? (
        <Text size='small'>loading…</Text>
      ) : isError ? (
        <Text size='small'>Stock is unavailable — the warehouse backend may not be deployed.</Text>
      ) : rows.length === 0 ? (
        <div className='flex flex-col gap-1 border border-textInactiveColor p-3'>
          <Text size='small'>No stock yet.</Text>
          <Text variant='inactive' size='small'>
            Existing shelf stock? Use adjust → set count per material — it sets on hand without
            touching the moving average. New purchases go through receive.
          </Text>
        </div>
      ) : (
        <div className='overflow-x-auto'>
          <table className='w-full border-collapse'>
            <thead>
              <tr>
                <th className={`${cell} text-left uppercase`}>code</th>
                <th className={`${cell} text-left uppercase`}>name</th>
                <th className={`${cell} text-left uppercase`}>section</th>
                <th className={`${cell} text-right uppercase`}>on hand</th>
                <th className={`${cell} text-right uppercase`}>min</th>
                {canReadCosting ? (
                  <>
                    <th className={`${cell} text-right uppercase`}>avg cost</th>
                    <th className={`${cell} text-right uppercase`}>value</th>
                  </>
                ) : null}
                <th className={`${cell} text-left uppercase`}>actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const m = r.material;
                const id = m?.id ? Number(m.id) : 0;
                const below = r.belowMinStock;
                return (
                  <tr key={id}>
                    <td className={cell}>{m?.code || '—'}</td>
                    <td className={cell}>{m?.name}</td>
                    <td className={cell}>{sectionLabel(m?.section)}</td>
                    <td className={`${cell} text-right ${below ? 'font-bold' : ''}`}>
                      {decimalToInput(r.onHand) || '0'} {m?.unit}
                    </td>
                    <td className={`${cell} text-right`}>
                      {below ? '! ' : ''}
                      {decimalToInput(r.minStock) || '—'}
                    </td>
                    {canReadCosting ? (
                      <>
                        <td className={`${cell} text-right`}>
                          {r.avgUnitCostBase?.value
                            ? `${decimalToInput(r.avgUnitCostBase)} ${r.baseCurrency || ''}`
                            : '—'}
                        </td>
                        <td className={`${cell} text-right`}>
                          {r.stockValueBase?.value ? decimalToInput(r.stockValueBase) : '—'}
                        </td>
                      </>
                    ) : null}
                    <td className={cell}>
                      {canEdit ? (
                        <div className='flex items-center gap-1'>
                          <Button
                            type='button'
                            variant='secondary'
                            className='uppercase'
                            onClick={() => openModal(r, 'receive')}
                          >
                            receive
                          </Button>
                          <Button
                            type='button'
                            variant='secondary'
                            className='uppercase'
                            onClick={() => openModal(r, 'issue')}
                          >
                            issue
                          </Button>
                          <GenericPopover
                            openElement={<span className='px-1'>⋯</span>}
                            triggerProps={{ 'aria-label': 'more actions', title: 'more actions' }}
                          >
                            <div className='flex flex-col gap-1'>
                              <Button
                                type='button'
                                variant='secondary'
                                className='uppercase'
                                onClick={() => openModal(r, 'adjust')}
                              >
                                adjust
                              </Button>
                              <Button
                                type='button'
                                variant='secondary'
                                className='uppercase'
                                onClick={() => goToMovements(id)}
                              >
                                movements →
                              </Button>
                            </div>
                          </GenericPopover>
                        </div>
                      ) : (
                        <Button
                          type='button'
                          variant='secondary'
                          className='uppercase'
                          onClick={() => goToMovements(id)}
                        >
                          movements →
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {totalValue != null ? (
            <div className='mt-2 flex justify-end'>
              <Text size='small'>
                Σ value: {Number(totalValue.toFixed(2))} {baseCurrency}
              </Text>
            </div>
          ) : null}
        </div>
      )}

      {target ? (
        <>
          <ReceiveStockModal
            open={modal === 'receive'}
            onOpenChange={(v) => !v && setModal(null)}
            target={target}
          />
          <IssueStockModal
            open={modal === 'issue'}
            onOpenChange={(v) => !v && setModal(null)}
            target={target}
          />
          <AdjustStockModal
            open={modal === 'adjust'}
            onOpenChange={(v) => !v && setModal(null)}
            target={target}
          />
        </>
      ) : null}
    </div>
  );
}
