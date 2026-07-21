import * as DialogPrimitives from '@radix-ui/react-dialog';
import { useSnackBarStore } from 'lib/stores/store';
import { useState } from 'react';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { useImportBankCsv } from '../../utils/hooks';

// Parsers the backend accepts (PostBankTxnRequest.source; empty = revolut). Revolut is the only one
// live today; kept as a select so a second bank slots in without a layout change.
const SOURCES = [{ value: 'revolut', label: 'Revolut' }];

const cell = 'w-full border border-textInactiveColor bg-bgColor px-2 py-1.5 text-textBaseSize';

// Import bank statement (4.1): paste a raw Revolut CSV export, the backend parses it into inbox
// lines and dedupes against already-imported ones. The response counts (parsed / imported /
// skipped) are surfaced verbatim so an operator sees exactly what landed. Kept as a raw dialog (not
// ConfirmationModal) so a parse error keeps the pasted text on screen instead of closing.
export function ImportCsvModal({ onClose }: { onClose: () => void }) {
  const { showMessage } = useSnackBarStore();
  const importCsv = useImportBankCsv();
  const [source, setSource] = useState('revolut');
  const [csvText, setCsvText] = useState('');

  const submit = () => {
    if (!csvText.trim()) {
      showMessage('Paste the CSV export first', 'error');
      return;
    }
    importCsv.mutate(
      { source, csvText },
      {
        onSuccess: (res) => {
          const parsed = res.parsed ?? 0;
          const imported = res.imported ?? 0;
          const skipped = res.skipped ?? 0;
          showMessage(
            `Imported ${imported} of ${parsed} line(s)${
              skipped > 0 ? ` · ${skipped} duplicate(s) skipped` : ''
            }`,
            'success',
          );
          onClose();
        },
        onError: (e) =>
          showMessage(e instanceof Error ? e.message : 'Failed to import CSV', 'error'),
      },
    );
  };

  return (
    <DialogPrimitives.Root open onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitives.Portal container={document.body}>
        <DialogPrimitives.Overlay className='fixed inset-0 z-[var(--z-modal)] h-screen bg-overlay' />
        <DialogPrimitives.Content className='fixed inset-x-2.5 top-1/2 z-[var(--z-modal)] flex max-h-[90vh] w-auto -translate-y-1/2 flex-col overflow-y-auto border border-textInactiveColor bg-bgColor text-textColor lg:inset-x-auto lg:left-1/2 lg:w-[620px] lg:-translate-x-1/2'>
          <div className='sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-textInactiveColor bg-bgColor px-4 py-3'>
            <DialogPrimitives.Title className='text-lg uppercase'>
              import bank statement
            </DialogPrimitives.Title>
            <Button type='button' className='shrink-0 cursor-pointer' onClick={onClose}>
              [x]
            </Button>
          </div>
          <DialogPrimitives.Description className='sr-only'>
            Paste a bank CSV export to import statement lines into the inbox
          </DialogPrimitives.Description>

          <div className='flex flex-col gap-3 p-4'>
            <label className='flex flex-col gap-1'>
              <Text variant='inactive' size='small'>
                source
              </Text>
              <select className={cell} value={source} onChange={(e) => setSource(e.target.value)}>
                {SOURCES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>

            <label className='flex flex-col gap-1'>
              <Text variant='inactive' size='small'>
                CSV export
              </Text>
              <textarea
                className={`${cell} min-h-[220px] font-mono`}
                placeholder='paste the raw CSV here — header row included'
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                autoFocus
              />
            </label>

            <Text variant='inactive' size='small'>
              Already-imported lines are skipped automatically — re-importing the same export is safe.
            </Text>

            <div className='flex items-center justify-end gap-2'>
              <Button type='button' variant='secondary' size='lg' onClick={onClose}>
                cancel
              </Button>
              <Button
                type='button'
                variant='main'
                size='lg'
                disabled={importCsv.isPending}
                onClick={submit}
              >
                {importCsv.isPending ? 'importing…' : 'import'}
              </Button>
            </div>
          </div>
        </DialogPrimitives.Content>
      </DialogPrimitives.Portal>
    </DialogPrimitives.Root>
  );
}
