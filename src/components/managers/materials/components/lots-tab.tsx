import { useSearchParams } from 'react-router-dom';
import Text from 'ui/components/text';
import { decimalToInput } from 'utils/decimal';
import { MaterialPicker } from './material-picker';
import { useMaterialLots } from './useWarehouse';

const th =
  'border border-textInactiveColor bg-textInactiveColor/20 px-2 py-1 text-left text-textBaseSize uppercase';
const td = 'border border-textInactiveColor px-2 py-1 text-textBaseSize';
const day = (ts?: string) => (ts ? ts.slice(0, 10) : '—');

// Read-only material-lots view (gap-07 v2 D): the received batches (roll / dye-lot) of a material,
// each a supplier lot code with a running remaining quantity. Lots are created as a side effect of
// receives — there is no create/edit here. unit_cost is informational only (valuation is
// moving-average, not FIFO). The chosen material lives in the URL (?material=) so the view is a
// shareable link and survives a tab switch (materials/index.tsx preserves ?material=).
export function LotsTab() {
  const [params, setParams] = useSearchParams();
  const materialId = Number(params.get('material')) || 0;
  const includeArchived = params.get('archived') === '1';

  const setParam = (key: string, value: string) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (value) p.set(key, value);
        else p.delete(key);
        return p;
      },
      { replace: true },
    );

  const { data, isLoading, isError, refetch } = useMaterialLots(
    materialId,
    includeArchived,
    materialId > 0,
  );
  const lots = data?.lots ?? [];

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-wrap items-end justify-between gap-3'>
        <div className='w-72'>
          <Text size='small'>material</Text>
          <MaterialPicker
            value={materialId}
            onChange={(id) => setParam('material', id ? String(id) : '')}
            includeArchived
            placeholder='search material to see its lots'
          />
        </div>
        <label className='flex items-center gap-2'>
          <input
            type='checkbox'
            checked={includeArchived}
            onChange={(e) => setParam('archived', e.target.checked ? '1' : '')}
          />
          <Text size='small'>show archived</Text>
        </label>
      </div>

      {materialId === 0 ? (
        <Text variant='inactive' size='small'>
          pick a material to see its received lots
        </Text>
      ) : isLoading ? (
        <Text variant='inactive' size='small'>
          loading…
        </Text>
      ) : isError ? (
        <div className='flex items-center gap-3'>
          <Text variant='error' size='small'>
            failed to load lots
          </Text>
          <button
            type='button'
            className='text-textBaseSize uppercase underline'
            onClick={() => refetch()}
          >
            retry
          </button>
        </div>
      ) : lots.length === 0 ? (
        <Text variant='inactive' size='small'>
          no lots for this material
        </Text>
      ) : (
        <div className='overflow-x-auto'>
          <table className='w-full min-w-max border-collapse'>
            <thead>
              <tr>
                <th className={th}>lot</th>
                <th className={th}>supplier doc</th>
                <th className={th}>received</th>
                <th className={th}>remaining</th>
                <th className={th}>unit cost</th>
                <th className={th}>received at</th>
                <th className={th}>note</th>
              </tr>
            </thead>
            <tbody>
              {lots.map((l) => (
                <tr key={l.id} className={l.archived ? 'opacity-50' : ''}>
                  <td className={td}>
                    {l.lotCode || '—'}
                    {l.archived ? ' · archived' : ''}
                  </td>
                  <td className={td}>{l.supplierDoc || '—'}</td>
                  <td className={td}>{decimalToInput(l.receivedQty) || '—'}</td>
                  <td className={td}>{decimalToInput(l.remainingQty) || '0'}</td>
                  <td className={td}>
                    {l.unitCost?.value ? `${decimalToInput(l.unitCost)} ${l.currency || ''}` : '—'}
                  </td>
                  <td className={`${td} whitespace-nowrap`}>{day(l.receivedAt)}</td>
                  <td className={td}>{l.note || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
