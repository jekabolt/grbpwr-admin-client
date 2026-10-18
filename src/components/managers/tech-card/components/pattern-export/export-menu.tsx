// «Download as» list for a pattern drawing: the formats of lib/pattern-export/formats.ts as
// underline buttons in the popover shell. One component for the DXF row and the marker window.
import type { PatternDrawing } from 'lib/pattern-export/drawing';
import { EXPORT_FORMATS, type ExportFormatId } from 'lib/pattern-export/formats';
import type { PlotDrawing } from 'lib/pattern-export/hpgl';
import { useSnackBarStore } from 'lib/stores/store';
import { useState } from 'react';
import { Button, GenericPopover } from 'ui';
import { downloadPatternExport, downloadPlotExport } from './download';

/** The plotter input (pens per role, plotter-sized labels) and the file's name, built on demand. */
export type PlotSource = () => Promise<{ plot: PlotDrawing; title: string }>;

/** Buttons only — for a popover that already exists (the marker's download corner). */
export function PatternExportItems({
  drawing,
  plot,
  disabled,
  title,
  onDone,
}: {
  drawing: () => PatternDrawing | Promise<PatternDrawing>;
  /** Given → the «PLT · plotter» item is shown. */
  plot?: PlotSource;
  disabled?: boolean;
  title?: string;
  onDone?: () => void;
}) {
  const { showMessage } = useSnackBarStore();
  const [busy, setBusy] = useState<ExportFormatId | null>(null);
  const run = async (id: ExportFormatId) => {
    setBusy(id);
    try {
      const warnings =
        id === 'plt'
          ? plot
            ? await downloadPlotExport(plot)
            : []
          : await downloadPatternExport(drawing, id);
      if (warnings.length > 0) showMessage(warnings.join(' · '), 'error');
      onDone?.();
    } catch (e) {
      showMessage(`export failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setBusy(null);
    }
  };
  return (
    <>
      {EXPORT_FORMATS.filter((f) => f.id !== 'plt' || plot).map((f) => (
        <Button
          key={f.id}
          type='button'
          variant='underline'
          disabled={disabled || busy !== null}
          title={title || f.hint}
          onClick={() => void run(f.id)}
        >
          {busy === f.id ? `${f.label}…` : f.label}
        </Button>
      ))}
    </>
  );
}

/** A small «⤓» trigger with the list — the per-file menu on the patterns tab. */
export function PatternExportMenu({
  drawing,
  plot,
  label,
}: {
  drawing: () => PatternDrawing | Promise<PatternDrawing>;
  plot?: PlotSource;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <GenericPopover
      noTail
      open={open}
      onOpenChange={setOpen}
      className='w-[180px]'
      contentProps={{ align: 'end', side: 'bottom', sideOffset: 4 }}
      triggerProps={{
        'aria-label': `download ${label} as`,
        title: 'download as…',
        className:
          'inline-flex h-6 min-w-6 items-center justify-center border border-borderColor bg-bgColor px-1 text-micro hover:opacity-70',
      }}
      openElement={
        <svg width='12' height='12' viewBox='0 0 14 14' aria-hidden fill='none'>
          <path d='M7 1.5v8M3.5 6 7 9.5 10.5 6M2 12.5h10' stroke='currentColor' strokeWidth='1.2' />
        </svg>
      }
    >
      <div className='flex flex-col items-start gap-1'>
        <PatternExportItems drawing={drawing} plot={plot} onDone={() => setOpen(false)} />
      </div>
    </GenericPopover>
  );
}
