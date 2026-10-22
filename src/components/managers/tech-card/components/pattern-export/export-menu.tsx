// «Download as» list for a pattern drawing: the formats of lib/pattern-export/formats.ts as
// underline buttons in the popover shell. One component for the DXF row and the marker window.
import type { PatternDrawing } from 'lib/pattern-export/drawing';
import { EXPORT_FORMATS, type ExportFormatId } from 'lib/pattern-export/formats';
import type { PlotDrawing } from 'lib/pattern-export/hpgl';
import { notify } from 'lib/stores/store';
import { useState } from 'react';
import { Button, GenericPopover } from 'ui';
import { downloadFile } from 'lib/pattern-export/download';
import { downloadPatternExport, downloadPlotExport } from './download';

/** The plotter input (pens per role, plotter-sized labels) and the file's name, built on demand. */
export type PlotSource = () => Promise<{ plot: PlotDrawing; title: string }>;

/** The source file as stored — saved byte for byte, no export. */
export type OriginalSource = () => Promise<{ blob: Blob; fileName: string }>;

/** Buttons only — for a popover that already exists (the marker's download corner). */
export function PatternExportItems({
  drawing,
  plot,
  original,
  disabled,
  title,
  onDone,
  only,
}: {
  drawing: () => PatternDrawing | Promise<PatternDrawing>;
  /** Given → only these formats are listed (the original stays when given). */
  only?: readonly ExportFormatId[];
  /** Given → the «PLT · plotter» item is shown. */
  plot?: PlotSource;
  /** Given → the «DXF · original» item is shown first. */
  original?: OriginalSource;
  disabled?: boolean;
  title?: string;
  onDone?: () => void;
}) {
  const [busy, setBusy] = useState<ExportFormatId | 'dxf' | null>(null);
  const saveOriginal = async () => {
    if (!original) return;
    setBusy('dxf');
    try {
      const { blob, fileName } = await original();
      downloadFile(blob, fileName);
      onDone?.();
    } catch (e) {
      notify({
        sev: 'error',
        subject: 'DOWNLOAD DXF',
        text: 'not downloaded',
        detail: e instanceof Error ? e.message : String(e),
        action: { label: 'retry', onClick: () => void saveOriginal() },
      });
    } finally {
      setBusy(null);
    }
  };
  const run = async (id: ExportFormatId) => {
    setBusy(id);
    try {
      const warnings =
        id === 'plt'
          ? plot
            ? await downloadPlotExport(plot)
            : []
          : await downloadPatternExport(drawing, id);
      // The file is saved; what it lost on the way is news.
      if (warnings.length > 0)
        notify({
          sev: 'warn',
          subject: `EXPORT ${id.toUpperCase()}`,
          text: 'exported',
          bad: `${warnings.length} ${warnings.length === 1 ? 'warning' : 'warnings'}`,
          detail: warnings.join(' · '),
        });
      onDone?.();
    } catch (e) {
      notify({
        sev: 'error',
        subject: `EXPORT ${id.toUpperCase()}`,
        text: 'not exported',
        detail: e instanceof Error ? e.message : String(e),
        action: { label: 'retry', onClick: () => void run(id) },
      });
    } finally {
      setBusy(null);
    }
  };
  return (
    <>
      {original && (
        <Button
          type='button'
          variant='underline'
          disabled={disabled || busy !== null}
          title={title || 'the uploaded file as is'}
          onClick={() => void saveOriginal()}
        >
          {busy === 'dxf' ? 'DXF · original…' : 'DXF · original'}
        </Button>
      )}
      {EXPORT_FORMATS.filter((f) => (f.id !== 'plt' || plot) && (!only || only.includes(f.id))).map(
        (f) => (
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
        ),
      )}
    </>
  );
}

/** The 12px download glyph of the file row. */
export function DownloadGlyph() {
  return (
    <svg width='12' height='12' viewBox='0 0 14 14' aria-hidden fill='none'>
      <path d='M7 1.5v8M3.5 6 7 9.5 10.5 6M2 12.5h10' stroke='currentColor' strokeWidth='1.2' />
    </svg>
  );
}

/** The file row's history glyph: a counter-clockwise arrow around clock hands. */
export function HistoryGlyph() {
  return (
    <svg width='12' height='12' viewBox='0 0 14 14' aria-hidden fill='none'>
      <path
        d='M2 7a5 5 0 1 0 1.46-3.54L2 4.9M2 1.9v3h3M7 4.2V7l2 1.2'
        stroke='currentColor'
        strokeWidth='1.2'
      />
    </svg>
  );
}

/** The framed 24px icon button of the file row (download, history). */
export const ROW_ICON_BTN =
  'inline-flex h-6 min-w-6 items-center justify-center border border-borderColor bg-bgColor px-1 text-micro hover:opacity-70';

/** A small «⤓» trigger with the list — the per-file menu on the patterns tab. */
export function PatternExportMenu({
  drawing,
  plot,
  original,
  label,
  only,
  after,
}: {
  drawing: () => PatternDrawing | Promise<PatternDrawing>;
  plot?: PlotSource;
  original?: OriginalSource;
  label: string;
  only?: readonly ExportFormatId[];
  /** Under a hairline, after the formats; gets the close callback. */
  after?: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <GenericPopover
      noTail
      open={open}
      onOpenChange={setOpen}
      className='w-44'
      contentProps={{ align: 'end', side: 'bottom', sideOffset: 4 }}
      triggerProps={{
        'aria-label': `download ${label}`,
        title: 'download',
        className: ROW_ICON_BTN,
      }}
      openElement={<DownloadGlyph />}
    >
      <div className='flex flex-col items-start gap-1'>
        <PatternExportItems
          drawing={drawing}
          plot={plot}
          original={original}
          only={only}
          onDone={close}
        />
        {after && (
          <div className='flex w-full flex-col items-start gap-1 border-t border-hairline pt-1'>
            {after(close)}
          </div>
        )}
      </div>
    </GenericPopover>
  );
}
