// PLT → PDF: pick a .plt / .hpgl, see it, download it as a PDF at its PHYSICAL size — one sheet
// (plotter / large-format) or tiled onto A4 / A3 / Letter with overlap, trim marks and a page-1
// map. Printed by THE 1:1 tiler (lib/pattern-export/dxf-pdf.ts) — the same plan, marks and limits
// as a DXF or a marker; the preview draws that plan's grid, so what is shown is what is printed.
//
// Self-contained: the parser and jsPDF load only when a file is picked, so the tech-card list
// that hosts the button pays nothing for it.
import { downloadPatternExport } from 'components/managers/tech-card/components/pattern-export/download';
import type { PatternDrawing } from 'lib/pattern-export/drawing';
import { fitsOneSheet, planPdf, type PdfPlan } from 'lib/pattern-export/dxf-pdf';
import { PDF_FORMATS, pdfLayoutOf, type PdfFormatId } from 'lib/pattern-export/formats';
import { penRole, type PltSheet } from 'lib/pattern-export/plt-pdf';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Chip, ChipRow, ConfirmationModal, Input, Text } from 'ui';

type Mode = PdfFormatId;

// SOURCE UNITS. A PLT never states the size of its plotter unit: 40/mm is the HP standard, but a
// driver set to 1000/in draws 1.6 % smaller, and the PDF's own test square cannot catch that — it
// checks the PRINTER, not the file. So the unit is the operator's answer, shown next to the size it
// produces, and the same answer drives preview and download.
const UNIT_PRESETS = [
  { key: 'hp', label: '40 / mm (HP)', perMm: 40 },
  { key: 'in1000', label: '1000 / in', perMm: 1000 / 25.4 },
  { key: 'tenth', label: '0.1 mm', perMm: 10 },
] as const;
type UnitKey = (typeof UNIT_PRESETS)[number]['key'] | 'custom';

const ACCEPT = '.plt,.hpgl,.hpg,.hgl,.pen';

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
  const [read, setRead] = useState<{ sheet: PltSheet; drawing: PatternDrawing } | null>(null);
  const sheet = read?.sheet ?? null;
  const drawing = read?.drawing ?? null;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<Mode>('pdf-a4');
  const [unitKey, setUnitKey] = useState<UnitKey>('hp');
  const [customPerMm, setCustomPerMm] = useState('40');

  const unitsPerMm =
    unitKey === 'custom'
      ? Number(customPerMm.replace(',', '.'))
      : UNIT_PRESETS.find((u) => u.key === unitKey)!.perMm;
  const unitsValid = Number.isFinite(unitsPerMm) && unitsPerMm > 0;

  const oneFits = !!drawing && fitsOneSheet(drawing);
  const effectiveMode: Mode = mode === 'pdf-sheet' && !oneFits ? 'pdf-a4' : mode;
  // THE plan the download will print (dxf-pdf.ts). Its refusals (size, page count) are shown,
  // never thrown at render.
  const planned = useMemo((): { plan: PdfPlan | null; problem: string | null } => {
    if (!drawing) return { plan: null, problem: null };
    try {
      return { plan: planPdf(drawing, pdfLayoutOf(effectiveMode)), problem: null };
    } catch (e) {
      return { plan: null, problem: e instanceof Error ? e.message : String(e) };
    }
  }, [drawing, effectiveMode]);
  const plan = planned.plan;
  const canDownload = !!plan;

  // (Re)read whenever the file or the source unit changes: preview and download share one answer.
  useEffect(() => {
    if (!file || !unitsValid) {
      setRead(null);
      return;
    }
    let live = true;
    setBusy(true);
    setError(null);
    (async () => {
      try {
        const { readPltSheet, drawingFromPltSheet } = await import('lib/pattern-export/plt-pdf');
        const s = await readPltSheet(file.bytes, { name: file.name, unitsPerMm });
        if (live) setRead({ sheet: s, drawing: drawingFromPltSheet(s) });
      } catch (e) {
        if (live) {
          setRead(null);
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (live) setBusy(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [file, unitsPerMm, unitsValid]);

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setError(null);
    setRead(null);
    setFile({ name: f.name, bytes: await f.arrayBuffer() });
  };

  const download = async () => {
    if (!drawing) return;
    setBusy(true);
    setError(null);
    try {
      // The drawing the preview shows, at the units chosen — not a second read of the file.
      await downloadPatternExport(() => drawing, effectiveMode);
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
      setRead(null);
      setError(null);
    }
  };

  return (
    <ConfirmationModal
      open={open}
      width='lg'
      title='plt → pdf'
      confirmLabel={busy ? 'working…' : 'download pdf'}
      confirmDisabled={busy || !canDownload || !unitsValid}
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
              {PDF_FORMATS.map((f) => {
                const off = f.id === 'pdf-sheet' && !oneFits;
                return (
                  <Chip
                    key={f.id}
                    selected={effectiveMode === f.id}
                    pressed={effectiveMode === f.id}
                    disabled={off}
                    title={off ? 'longer than a PDF page allows' : f.hint}
                    onClick={() => setMode(f.id)}
                  >
                    {f.label.replace(/^PDF 1:1 · /, '')}
                    {effectiveMode === f.id && plan ? ` · ${plan.pages.length} p.` : ''}
                  </Chip>
                );
              })}
            </ChipRow>
          )}
        </div>

        {file && (
          <div className='flex flex-wrap items-center gap-2'>
            <Text size='micro' variant='label'>
              source units
            </Text>
            <ChipRow>
              {UNIT_PRESETS.map((u) => (
                <Chip
                  key={u.key}
                  selected={unitKey === u.key}
                  pressed={unitKey === u.key}
                  onClick={() => setUnitKey(u.key)}
                >
                  {u.label}
                </Chip>
              ))}
              <Chip
                selected={unitKey === 'custom'}
                pressed={unitKey === 'custom'}
                onClick={() => setUnitKey('custom')}
              >
                custom
              </Chip>
            </ChipRow>
            {unitKey === 'custom' && (
              <div className='flex items-center gap-1'>
                <Input
                  className='w-20'
                  value={customPerMm}
                  inputMode='decimal'
                  aria-label='plotter units per mm'
                  aria-invalid={!unitsValid || undefined}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setCustomPerMm(e.target.value)
                  }
                />
                <Text size='micro'>units / mm</Text>
              </div>
            )}
          </div>
        )}

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

        {sheet && (
          <>
            <Text size='micro' component='p'>
              <b>
                drawing {sheet.widthMm.toFixed(1)} × {sheet.heightMm.toFixed(1)} mm
              </b>{' '}
              at {+sheet.unitsPerMm.toFixed(4)} plotter units / mm — check one known garment
              dimension against this: the test square checks the printer, not the file&apos;s units.
              {(sheet.selfScaled.ip || sheet.selfScaled.sc) &&
                ` The file scales itself (${[sheet.selfScaled.ip && 'IP', sheet.selfScaled.sc && 'SC'].filter(Boolean).join(' + ')}); that scaling is applied.`}
              {sheet.rotationDeg ? ` Rotated ${sheet.rotationDeg}° (RO) as the file asks.` : ''}
            </Text>
            {planned.problem && (
              <Text size='micro' variant='error' component='p'>
                {planned.problem}
              </Text>
            )}
            <Text size='micro' component='p'>
              {plan?.grid
                ? `${plan.pages.length - 1} of ${plan.grid.cols} × ${plan.grid.rows} ${plan.grid.paper} pages printed (blank ones skipped) + map page, 10 mm overlap`
                : plan
                  ? `one page ${Math.round(plan.pages[0].w)} × ${Math.round(plan.pages[0].h)} mm`
                  : ''}
              {' · '}
              {sheet.pens.map((p) => (
                <span key={p.pen} className='mr-1.5 whitespace-nowrap'>
                  <span
                    className='mr-0.5 inline-block h-0.5 w-3 align-middle'
                    style={{ background: rgb(p.rgb) }}
                  />
                  pen {p.pen} ({p.runs}) → {penRole(p.pen).kind}
                </span>
              ))}
            </Text>
            {drawing && <PltPreview sheet={sheet} drawing={drawing} plan={plan} />}
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
  drawing,
  plan,
}: {
  sheet: PltSheet;
  drawing: PatternDrawing;
  plan: PdfPlan | null;
}) {
  const g = plan?.grid ?? null;
  // The tiled grid may reach past the drawing (it is centred in whole pages): the view covers both.
  const x0 = g ? -g.ox : 0;
  const y0 = g ? -g.oy : 0;
  const W = g ? (g.cols - 1) * g.sx + g.cw : drawing.w;
  const H = g ? (g.rows - 1) * g.sy + g.ch : drawing.h;
  // ~1 px lines at the dialog's width, whatever the sheet size.
  const sw = Math.max(W, H) / 900;
  const paths = useMemo(
    () =>
      sheet.lines.map((l, i) => (
        <polyline
          key={i}
          points={l.pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ')}
          fill='none'
          stroke={rgb(penRole(l.pen).rgb)}
          strokeWidth={sw * (penRole(l.pen).kind === 'cut' ? 1.6 : 1)}
          strokeDasharray={l.dashMm?.length ? l.dashMm.join(' ') : undefined}
        />
      )),
    [sheet, sw],
  );
  return (
    <div className='border border-borderColor bg-white'>
      <svg
        viewBox={`${x0} ${y0} ${W} ${H}`}
        className='block max-h-[60vh] w-full'
        preserveAspectRatio='xMidYMid meet'
        role='img'
        aria-label='plotter file preview'
      >
        {paths}
        {sheet.texts.map((t, i) => (
          <text
            key={i}
            x={t.x}
            y={t.y}
            fontSize={t.sizeMm}
            transform={t.rotationDeg ? `rotate(${-t.rotationDeg} ${t.x} ${t.y})` : undefined}
            fill='#000'
            fontFamily='Helvetica, Arial, sans-serif'
          >
            {t.text}
          </text>
        ))}
        {g &&
          g.cells.map((c) => {
            // The window the page prints (dxf-pdf.ts grid): blank pages are not printed.
            const x = c.col * g.sx - g.ox;
            const y = c.row * g.sy - g.oy;
            return (
              <g key={c.label} opacity={c.blank ? 0.35 : 1}>
                <rect
                  x={x}
                  y={y}
                  width={g.cw}
                  height={g.ch}
                  fill='none'
                  stroke='#999'
                  strokeWidth={sw * 0.8}
                  strokeDasharray={`${sw * 4} ${sw * 3}`}
                />
                <text
                  x={x + 4}
                  y={y + 4 + Math.min(g.cw, g.ch) / 12}
                  fontSize={Math.min(g.cw, g.ch) / 12}
                  fill='#999'
                >
                  {c.label}
                </text>
              </g>
            );
          })}
      </svg>
    </div>
  );
}
