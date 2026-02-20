import type { common_StockChange } from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import { useMemo } from 'react';
import Text from 'ui/components/text';

function formatStockSource(source: string | undefined): string {
  if (!source) return '—';
  return source.replace('STOCK_CHANGE_SOURCE_', '').replace(/_/g, ' ').toLowerCase();
}

function formatDateShort(value: string | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

interface SizeOption {
  id?: number;
  name?: string;
}

interface StockTableProps {
  changes: common_StockChange[];
  isLoading: boolean;
  sizes?: SizeOption[];
}

export function StockTable({ changes = [], isLoading, sizes = [] }: StockTableProps) {
  const list = Array.isArray(changes) ? changes : [];
  const sizeById = useMemo(
    () => new Map(sizes.filter((s) => s.id != null).map((s) => [s.id!, s.name ?? String(s.id)])),
    [sizes],
  );

  const COLUMNS: { label: string; accessor: (c: common_StockChange) => React.ReactNode }[] =
    useMemo(
      () => [
        {
          label: 'Size',
          accessor: (c) => (c.sizeId != null ? sizeById.get(c.sizeId) ?? String(c.sizeId) : '—'),
        },
        {
          label: 'Source',
          accessor: (c) => formatStockSource(c.source),
        },
        {
          label: 'Change',
          accessor: (c) => {
            const v = c.quantityDelta?.value;
            if (v == null || v === '') return '—';
            const n = Number(v);
            const sign = n >= 0 ? '+' : '';
            return `${sign}${v}`;
          },
        },
        {
          label: 'Date',
          accessor: (c) => formatDateShort(c.createdAt),
        },
        { label: 'Order', accessor: (c) => c.orderUuid ?? '—' },
        { label: 'Admin', accessor: (c) => c.adminUsername ?? '—' },
      ],
      [sizeById],
    );

  return (
    <div className='min-h-0 w-full flex-1 overflow-auto'>
      <table className='w-full border-collapse border-2 border-textColor min-w-max'>
          <thead className='sticky top-0 z-20 h-10'>
            <tr className='border-b border-textColor bg-textInactiveColor'>
              {COLUMNS.map((col, i) => (
                <th
                  key={col.label}
                  className={cn(
                    'text-center h-10 min-w-26 border border-r border-textColor bg-textInactiveColor px-2',
                  )}
                >
                  <Text variant='uppercase'>{col.label}</Text>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={COLUMNS.length} className='text-center py-8'>
                  <Text variant='uppercase'>Loading…</Text>
                </td>
              </tr>
            ) : list.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length} className='text-center py-8'>
                  <Text variant='uppercase'>no stock changes</Text>
                </td>
              </tr>
            ) : (
              list.map((c) => (
                <tr
                  key={c.id}
                  className='group border-b border-text last:border-b-0 h-10 hover:bg-highlightColor/20 transition-colors'
                >
                  {COLUMNS.map((col) => (
                    <td
                      key={col.label}
                      className={cn('border border-r border-textColor text-center px-2')}
                    >
                      <Text>{col.accessor(c)}</Text>
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
    </div>
  );
}
