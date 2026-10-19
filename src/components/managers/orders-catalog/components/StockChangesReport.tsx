import { subDays } from 'date-fns';
import { useState } from 'react';
import { adminService } from 'api/api';
import { StockChangeRow } from 'api/proto-http/admin';
import {
  downloadCsv,
  stockChangeRowsToCsv,
} from 'components/managers/product/components/stock/stock-csv';
import { Button, CalloutBox, Input, Text, useDoneFlash } from 'ui';
import { failureClassOfError } from 'components/managers/tech-card/components/useTechCardAutosave';
import { notify } from 'lib/stores/store';

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
  const exported = useDoneFlash();
  // A bad date range stands next to the dates until they change.
  const [rangeError, setRangeError] = useState<string | null>(null);
  const today = new Date();
  const defaultFrom = subDays(today, 6);
  const [dateFrom, setDateFrom] = useState(formatDateForInput(defaultFrom));
  const [dateTo, setDateTo] = useState(formatDateForInput(today));
  const [isExporting, setIsExporting] = useState(false);

  const handleExportCsv = async () => {
    if (!dateFrom || !dateTo) {
      setRangeError('pick both dates');
      return;
    }
    if (new Date(dateFrom) > new Date(dateTo)) {
      setRangeError('from is after to');
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
      exported.flash();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to export stock changes';
      notify({
        sev: 'error',
        subject: 'STOCK CHANGES',
        text: 'not exported',
        detail: msg,
        action:
          failureClassOfError(err) === 'transient'
            ? { label: 'retry', onClick: () => void handleExportCsv() }
            : undefined,
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className='flex flex-wrap items-end gap-3'>
      <Text variant='uppercase' className='shrink-0 font-medium'>
        Stock changes report
      </Text>
      <div className='flex flex-wrap items-center gap-2'>
        <label className='flex flex-col gap-1'>
          <Text variant='uppercase' className='text-textBaseSize text-borderColor'>
            From
          </Text>
          <Input
            type='date'
            value={dateFrom}
            aria-invalid={!!rangeError || undefined}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              setRangeError(null);
              setDateFrom(e.target.value);
            }}
            disabled={isExporting}
            className='w-40'
          />
        </label>
        <label className='flex flex-col gap-1'>
          <Text variant='uppercase' className='text-textBaseSize text-borderColor'>
            To
          </Text>
          <Input
            type='date'
            value={dateTo}
            aria-invalid={!!rangeError || undefined}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              setRangeError(null);
              setDateTo(e.target.value);
            }}
            disabled={isExporting}
            className='w-40'
          />
        </label>
        <Button
          variant='main'
          onClick={handleExportCsv}
          disabled={isExporting}
          done={exported.on && 'exported'}
          className='self-end'
        >
          <Text variant='uppercase'>{isExporting ? 'Exporting…' : 'Download CSV'}</Text>
        </Button>
      </div>
      {rangeError && (
        <CalloutBox tone='error'>
          <Text size='micro' component='span' role='alert'>
            <b>not exported</b> · {rangeError}
          </Text>
        </CalloutBox>
      )}
    </div>
  );
}
