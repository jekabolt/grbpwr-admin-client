import { useProductWaitlist } from 'components/managers/waitlist/components/useWaitlist';
import { formatDateShort } from 'components/managers/orders-catalog/components/utility';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { DataTable, EmptyCell } from 'ui/components/data-table';
import { GroupLabel } from 'ui/components/group-label';
import { formatSizeName } from '../utility/sizes';

// Compact read of the back-in-stock waitlist for this colourway — sits inside the same "sizes &
// stock" Section as SecondsPanel, so it stays a GroupLabel + DataTable sub-structure rather than
// a second bordered block (DESIGN.md: a block never contains another block). Silent (renders
// null) once there's nothing waiting, which is most products.
export function WaitlistPanel({ colorwayId }: { colorwayId: number }) {
  const { dictionary } = useDictionary();
  const { data } = useProductWaitlist(colorwayId || undefined, 50, 0);
  const entries = data?.entries ?? [];
  const total = data?.total ?? 0;

  const sizeName = (sizeId?: number) => {
    const raw = dictionary?.sizes?.find((s) => s.id === sizeId)?.name ?? String(sizeId ?? '');
    return formatSizeName(raw) || raw;
  };

  if (total === 0) return null;

  return (
    <div className='space-y-1'>
      <GroupLabel>waitlist ({total})</GroupLabel>
      <DataTable>
        <thead>
          <tr>
            <th>
              <span className='block text-left'>size</span>
            </th>
            <th>
              <span className='block text-left'>email</span>
            </th>
            <th>
              <span className='block text-left'>date</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id}>
              <td className='whitespace-nowrap'>
                <span className='block text-left'>{sizeName(e.sizeId)}</span>
              </td>
              <td className='whitespace-nowrap'>
                <span className='block text-left'>{e.email || <EmptyCell />}</span>
              </td>
              <td className='whitespace-nowrap'>
                <span className='block text-left'>{formatDateShort(e.createdAt)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </div>
  );
}
