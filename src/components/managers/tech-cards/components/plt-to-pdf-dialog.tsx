// PLT → PDF: pick a .plt / .hpgl, see it, download it as a PDF at its PHYSICAL size — one sheet
// (plotter / large-format) or tiled onto A4 with overlap, registration marks and a page-1 map.
//
// Self-contained: the parser and jsPDF load only when a file is picked, so the tech-card list
// that hosts the button pays nothing for it.
import type { PltSheet } from 'lib/pattern-export/plt-pdf';
import { planTiles } from 'lib/pattern-export/tiles';
import { downloadFile } from 'lib/pattern-export/download';
import { useMemo, useRef, useState } from 'react';
import { Button } from 'ui/components/button';
import { Chip, ChipRow } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';

type Mode = 'a4' | 'sheet';

const ACCEPT = '.plt,.hpgl,.hpg,.hgl,.pen';
/** tiles.ts pads the sheet by this much in tiled mode (sheet-pdf.ts PAD). */
const TILE_PAD = 5;
/** jsPDF page limit, mm (sheet-pdf.ts PDF_PAGE_MAX_MM). */
const ONE_PAGE_MAX = 5080 - 2 * 15 - 120;

const rgb = (c: [number, number, number]) => `rgb(${c[0]},${c[1]},${c[2]})`;

export function PltToPdfDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; bytes: ArrayBuffer } | null>(null);
  const [sheet, setSheet] = useState<PltSheet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<Mode>('a4');

  const oneFits = !!sheet && sheet.widthMm <= ONE_PAGE_MAX && sheet.heightMm <= ONE_PAGE_MAX;
  const effectiveMode: Mode = mode === 'sheet' && !oneFits ? 'a4' : mode;
  const plan = useMemo(
    () => (sheet ? planTiles(sheet.widthMm + 2 * TILE_PAD, sheet.heightMm + 2 * TILE_PAD) : null),
    [sheet],
  );

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    setError(null);
    setSheet(null);
    try {
      const bytes = await f.arrayBuffer();
      const { readPltSheet } = await import('lib/pattern-export/plt-pdf');
      const s = await readPltSheet(bytes, { name: f.name });
      setFile({ name: f.name, bytes });
      setSheet(s);
    } catch (e) {
      setFile(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const { pltToPdf } = await import('lib/pattern-export/plt-pdf');
      const res = await pltToPdf(file.bytes, effectiveMode, { name: file.name });
      downloadFile(res.bytes, res.fileName, 'application/pdf');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const close = (o: boolean) => {
    if (busy) return;
    onOpenChange(o);
    if (!o) {
      setFile(null);
      setSheet(null);
      setError(null);
    }
  };

  return (
    <ConfirmationModal
      open={open}
      width='lg'
      title='plt → pdf'
      confirmLabel={busy ? 'working…' : 'download pdf'}
      confirmDisabled={busy || !sheet}
      cancelLabel='close'
      closeOnConfirm={false}
      onOpenChange={close}
      onCancel={() => close(false)}
      onConfirm={download}
      footerHint='1:1 — print at 100 % / actual size, then measure the test square'
    >
      <div className='space-y-2'>
        <div className='flex flex-wrap items-center gap-2'>
          <input
            ref={input}
            type='file'
            accept={ACCEPT}
            className='hidden'
            onChange={(e) => {
              void pick(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <Button
            size='sm'
            variant='secondary'
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            {file ? 'another file…' : 'choose .plt / .hpgl…'}
          </Button>
          {file && (
            <Text size='micro' className='truncate' title={file.name}>
              {file.name}
            </Text>
          )}
          {sheet && (
            <ChipRow className='ml-auto'>
              <Chip
                selected={effectiveMode === 'a4'}
                pressed={effectiveMode === 'a4'}
                onClick={() => setMode('a4')}
              >
                a4 tiles{plan ? ` · ${plan.tiles.length + 1} pages` : ''}
              </Chip>
              <Chip
                selected={effectiveMode === 'sheet'}
                pressed={effectiveMode === 'sheet'}
                disabled={!oneFits}
                title={
                  oneFits ? 'one page the size of the drawing' : 'longer than a PDF page allows'
                }
                onClick={() => setMode('sheet')}
              >
                one sheet
              </Chip>
            </ChipRow>
          )}
        </div>

        {error && (
          <Text size='micro' variant='error' component='p'>
            {error}
          </Text>
        )}

        {!sheet && !error && (
          <Text size='micro' variant='inactive' component='p'>
            HP-GL / HP-GL/2 plotter files (Gerber, Lectra, Optitex, Investronica…). Nothing is
            uploaded — the file is read in this tab.
          </Text>
        )}

        {sheet && plan && (
          <>
            <Text size='micro' component='p'>
              {Math.round(sheet.widthMm)} × {Math.round(sheet.heightMm)} mm
              {effectiveMode === 'a4'
                ? ` · ${plan.cols} × ${plan.rows} ${plan.paper}${plan.landscape ? ' landscape' : ''} + map page, ${plan.overlap} mm overlap`
                : ' · one page'}
              {' · '}
              {sheet.pens.map((p) => (
                <span key={p.pen} className='mr-1.5 whitespace-nowrap'>
                  <span
                    className='mr-0.5 inline-block h-0.5 w-3 align-middle'
                    style={{ background: rgb(p.rgb) }}
                  />
                  pen {p.pen} ({p.runs})
                </span>
              ))}
            </Text>
            <PltPreview sheet={sheet} plan={effectiveMode === 'a4' ? plan : null} />
            {sheet.warnings.length > 0 && (
              <Text size='micro' variant='inactive' component='p'>
                {sheet.warnings.slice(0, 3).join(' · ')}
              </Text>
            )}
          </>
        )}
      </div>
    </ConfirmationModal>
  );
}

function PltPreview({
  sheet,
  plan,
}: {
  sheet: PltSheet;
  plan: ReturnType<typeof planTiles> | null;
}) {
  const pad = plan ? TILE_PAD : 0;
  const W = sheet.widthMm + 2 * pad;
  const H = sheet.heightMm + 2 * pad;
  // ~1 px lines at the dialog's width, whatever the sheet size.
  const sw = Math.max(W, H) / 900;
  const paths = useMemo(
    () =>
      sheet.lines.map((l, i) => (
        <polyline
          key={i}
          points={l.pts
            .map(([x, y]) => `${(x + pad).toFixed(2)},${(y + pad).toFixed(2)}`)
            .join(' ')}
          fill='none'
          stroke={rgb(l.rgb)}
          strokeWidth={sw * (l.widthMm >= 0.3 ? 1.6 : 1)}
          strokeDasharray={l.dashMm?.length ? l.dashMm.join(' ') : undefined}
        />
      )),
    [sheet, pad, sw],
  );
  return (
    <div className='border border-borderColor bg-white'>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className='block max-h-[60vh] w-full'
        preserveAspectRatio='xMidYMid meet'
        role='img'
        aria-label='plotter file preview'
      >
        {paths}
        {sheet.texts.map((t, i) => (
          <text
            key={i}
            x={t.x + pad}
            y={t.y + pad}
            fontSize={t.sizeMm}
            transform={
              t.rotationDeg ? `rotate(${-t.rotationDeg} ${t.x + pad} ${t.y + pad})` : undefined
            }
            fill='#000'
            fontFamily='Helvetica, Arial, sans-serif'
          >
            {t.text}
          </text>
        ))}
        {plan &&
          plan.tiles.map((t) => (
            <g key={t.label}>
              <rect
                x={t.sx}
                y={t.sy}
                width={Math.min(plan.winW, W - t.sx)}
                height={Math.min(plan.winH, H - t.sy)}
                fill='none'
                stroke='#999'
                strokeWidth={sw * 0.8}
                strokeDasharray={`${sw * 4} ${sw * 3}`}
              />
              <text
                x={t.sx + 4}
                y={t.sy + 14}
                fontSize={Math.min(plan.winW, plan.winH) / 12}
                fill='#999'
              >
                {t.label}
              </text>
            </g>
          ))}
      </svg>
    </div>
  );
}
