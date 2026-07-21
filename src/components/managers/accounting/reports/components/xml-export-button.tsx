import { useSnackBarStore } from 'lib/stores/store';
import { useState } from 'react';
import { Button } from 'ui/components/button';

type Props = {
  label: string;
  fallbackName: string;
  // Returns the backend export payload. A FailedPrecondition (taxpayer identity not configured) throws
  // and is surfaced as an actionable message rather than a silent no-op.
  run: () => Promise<{ filename?: string; xmlContent?: string }>;
};

// Fetches a statutory XML export (JPK_V7M, OSS, …) from the backend and saves it as a file.
export function XmlExportButton({ label, fallbackName, run }: Props) {
  const { showMessage } = useSnackBarStore();
  const [busy, setBusy] = useState(false);

  const onExport = async () => {
    setBusy(true);
    try {
      const res = await run();
      const blob = new Blob([res.xmlContent ?? ''], { type: 'application/xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = res.filename || fallbackName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      showMessage(`${res.filename || fallbackName} downloaded`, 'success');
    } catch (e) {
      showMessage(
        e instanceof Error ? e.message : 'Export failed — check the taxpayer identity is configured',
        'error',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      type='button'
      variant='main'
      size='sm'
      className='px-3 py-1 uppercase'
      disabled={busy}
      onClick={onExport}
    >
      {busy ? 'generating…' : label}
    </Button>
  );
}
