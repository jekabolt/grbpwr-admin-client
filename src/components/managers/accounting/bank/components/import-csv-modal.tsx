import * as DialogPrimitives from '@radix-ui/react-dialog';
import { notify } from 'lib/stores/store';
import { useState } from 'react';
import { Button, CalloutBox, Close, Text } from 'ui';
import { errorText, isRefused, isTransient, reasonOf } from '../../utils/feedback';
import { useImportBankCsv } from '../../utils/hooks';

// Parsers the backend accepts (PostBankTxnRequest.source; empty = revolut). Revolut is the only one
// live today; kept as a select so a second bank slots in without a layout change.
const SOURCES = [{ value: 'revolut', label: 'Revolut' }];

const cell = 'w-full border border-borderColor bg-bgColor px-2 py-1.5 text-textBaseSize';

// Import bank statement (4.1): paste a raw Revolut CSV export, the backend parses it into inbox
// lines and dedupes against already-imported ones. The response counts (parsed / imported /
// skipped) are surfaced verbatim so an operator sees exactly what landed. Kept as a raw dialog (not
// ConfirmationModal) so a parse error keeps the pasted text on screen instead of closing.
export function ImportCsvModal({ onClose }: { onClose: () => void }) {
  const importCsv = useImportBankCsv();
  const [source, setSource] = useState('revolut');
  const [csvText, setCsvText] = useState('');
  // An empty paste or the parser's refusal stands in the dialog until the next edit or attempt.
  const [refusal, setRefusal] = useState<string | null>(null);

  const submit = () => {
    if (!csvText.trim()) {
      setRefusal('paste the CSV export');
      return;
    }
    setRefusal(null);
    importCsv.mutate(
      { source, csvText },
      {
        onSuccess: (res) => {
          const parsed = res.parsed ?? 0;
          const imported = res.imported ?? 0;
          const skipped = res.skipped ?? 0;
          // The counts live nowhere else once the dialog closes: one result toast.
          const failed = Math.max(0, parsed - imported - skipped);
          notify({
            sev: failed > 0 ? 'warn' : 'ok',
            subject: 'BANK CSV',
            text: `imported ${imported} of ${parsed}`,
            bad: failed > 0 ? `${failed} failed` : undefined,
            detail: skipped > 0 ? `${skipped} duplicates skipped` : undefined,
          });
          onClose();
        },
        onError: (e) => {
          const said = errorText(e, 'failed to import CSV') ?? '';
          if (isRefused(e)) {
            setRefusal(said);
            return;
          }
          // Re-importing the same export is safe: duplicates are skipped.
          notify({
            sev: 'error',
            subject: 'BANK CSV',
            text: 'not imported',
            bad: reasonOf(e),
            detail: said,
            action: isTransient(e) ? { label: 'retry', onClick: submit } : undefined,
          });
        },
      },
    );
  };

  return (
    <DialogPrimitives.Root open onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitives.Portal container={document.body}>
        <DialogPrimitives.Overlay className='fixed inset-0 z-[var(--z-modal)] h-screen bg-overlay' />
        <DialogPrimitives.Content className='fixed inset-x-2.5 top-1/2 z-[var(--z-modal)] flex max-h-[90vh] w-auto -translate-y-1/2 flex-col overflow-y-auto border border-borderColor bg-bgColor text-textColor lg:inset-x-auto lg:left-1/2 lg:w-[620px] lg:-translate-x-1/2'>
          <div className='sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-borderColor bg-bgColor px-4 py-3'>
            <DialogPrimitives.Title className='text-lg uppercase'>
              import bank statement
            </DialogPrimitives.Title>
            <Close onClick={onClose} />
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
                aria-invalid={(refusal !== null && !csvText.trim()) || undefined}
                onChange={(e) => {
                  setRefusal(null);
                  setCsvText(e.target.value);
                }}
                autoFocus
              />
            </label>

            <Text variant='inactive' size='small'>
              Already-imported lines are skipped automatically — re-importing the same export is
              safe.
            </Text>

            {refusal && <CalloutBox tone='error'>{refusal}</CalloutBox>}

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
