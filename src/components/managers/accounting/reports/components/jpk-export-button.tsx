import { adminService } from 'api/api';
import { useSnackBarStore } from 'lib/stores/store';
import { useState } from 'react';
import { Button } from 'ui/components/button';

// Downloads the official JPK_V7M (JPK_VAT) XML for the month from the backend and saves it as a file.
// The backend returns FailedPrecondition until the taxpayer identity (JPK_* env) is configured, so a
// failure surfaces that as an actionable message rather than a silent no-op.
export function JpkExportButton({ month }: { month: string }) {
  const { showMessage } = useSnackBarStore();
  const [busy, setBusy] = useState(false);

  const onExport = async () => {
    setBusy(true);
    try {
      const res = await adminService.ExportJpkV7M({ month });
      const blob = new Blob([res.xmlContent ?? ''], { type: 'application/xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = res.filename || `JPK_V7M_${month}.xml`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      showMessage('JPK_V7M downloaded', 'success');
    } catch (e) {
      showMessage(
        e instanceof Error ? e.message : 'Could not generate JPK_V7M — check the taxpayer identity is configured',
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
      {busy ? 'generating…' : 'download JPK_V7M (XML)'}
    </Button>
  );
}
