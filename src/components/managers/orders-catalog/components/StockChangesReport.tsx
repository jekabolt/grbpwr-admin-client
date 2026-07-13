import { subDays } from 'date-fns';
import { useState } from 'react';
import { adminService } from 'api/api';
import { StockChangeRow } from 'api/proto-http/admin';
import {
  downloadCsv,
  stockChangeRowsToCsv,
} from 'components/managers/product/components/stock/stock-csv';
import { Button } from 'ui/components/button';
import Input from 'ui/components/input';
import Text from 'ui/components/text';
import { useSnackBarStore } from 'lib/stores/store';

function toRfc3339DateOnly(dateStr: string, endOfDay: boolean): string {
  if (endOfDay) {
    return `${dateStr}T23:59:59.999Z`;
  }
  return `${dateStr}T00:00:00.000Z`;
}

function formatDateForInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function StockChangesReport() {
  const { showMessage } = useSnackBarStore();
  const today = new Date();
  const defaultFrom = subDays(today, 6);
  const [dateFrom, setDateFrom] = useState(formatDateForInput(defaultFrom));
  const [dateTo, setDateTo] = useState(formatDateForInput(today));
  const [isExporting, setIsExporting] = useState(false);

  const handleExportCsv = async () => {
    if (!dateFrom || !dateTo) {
      showMessage('Please select both date from and date to', 'error');
      return;
    }
    if (new Date(dateFrom) > new Date(dateTo)) {
      showMessage('Date from must be before or equal to date to', 'error');
      return;
    }
    setIsExporting(true);
    try {
      // The backend clamps list limits (>1000 → 1000, ≤0 → default 50), so a single
      // "give me everything" request can silently truncate. Page through explicitly using
      // the response `total` so the export always covers the full date range.
      const PAGE = 1000;
      const MAX_PAGES = 100; // safety cap: 100k rows
      const rows: StockChangeRow[] = [];
      let offset = 0;
      for (let page = 0; page < MAX_PAGES; page++) {
        const response = await adminService.ListStockChanges({
          from: toRfc3339DateOnly(dateFrom, false),
          to: toRfc3339DateOnly(dateTo, true),
          source: undefined,
          limit: PAGE,
          offset,
        });
        const batch = response.changes ?? [];
        rows.push(...batch);
        const total = response.total ?? 0;
        if (batch.length < PAGE || rows.length >= total) break;
        offset += batch.length;
      }
      const csv = stockChangeRowsToCsv(rows);
      const filename = `stock-changes-${dateFrom}-to-${dateTo}.csv`;
      downloadCsv(csv, filename);
      showMessage(`Exported ${rows.length} rows`, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to export stock changes';
      showMessage(msg, 'error');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className='flex flex-wrap items-end gap-3 border border-textInactiveColor bg-bgColor p-4'>
      <Text variant='uppercase' className='shrink-0 font-medium'>
        Stock changes report
      </Text>
      <div className='flex flex-wrap items-center gap-2'>
        <label className='flex flex-col gap-1'>
          <Text variant='uppercase' className='text-textBaseSize text-textInactiveColor'>
            From
          </Text>
          <Input
            type='date'
            value={dateFrom}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDateFrom(e.target.value)}
            disabled={isExporting}
            className='w-40'
          />
        </label>
        <label className='flex flex-col gap-1'>
          <Text variant='uppercase' className='text-textBaseSize text-textInactiveColor'>
            To
          </Text>
          <Input
            type='date'
            value={dateTo}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDateTo(e.target.value)}
            disabled={isExporting}
            className='w-40'
          />
        </label>
        <Button
          variant='main'
          onClick={handleExportCsv}
          disabled={isExporting}
          className='self-end'
        >
          <Text variant='uppercase'>{isExporting ? 'Exporting…' : 'Download CSV'}</Text>
        </Button>
      </div>
    </div>
  );
}
