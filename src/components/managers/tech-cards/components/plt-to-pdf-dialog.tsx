// PLT → PDF: pick a .plt / .hpgl, see it, download it as a PDF at its PHYSICAL size — one sheet
// (plotter / large-format) or tiled onto A4 with overlap, registration marks and a page-1 map.
//
// Self-contained: the parser and jsPDF load only when a file is picked, so the tech-card list
// that hosts the button pays nothing for it.
import type { PltSheet } from 'lib/pattern-export/plt-pdf';
import { planTiles, type TilePlan } from 'lib/pattern-export/tiles';
import { downloadFile } from 'lib/pattern-export/download';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from 'ui/components/button';
import { Chip, ChipRow } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Input from 'ui/components/input';
import Text from 'ui/components/text';

type Mode = 'a4' | 'sheet';

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
  const [unitKey, setUnitKey] = useState<UnitKey>('hp');
  const [customPerMm, setCustomPerMm] = useState('40');

  const unitsPerMm =
    unitKey === 'custom'
      ? Number(customPerMm.replace(',', '.'))
      : UNIT_PRESETS.find((u) => u.key === unitKey)!.perMm;
  const unitsValid = Number.isFinite(unitsPerMm) && unitsPerMm > 0;

  const oneFits = !!sheet && sheet.widthMm <= ONE_PAGE_MAX && sheet.heightMm <= ONE_PAGE_MAX;
  // The tiler refuses absurd sizes (tiles.ts caps); the refusal is shown, never thrown at render.
  const tiling = useMemo((): { plan: TilePlan | null; problem: string | null } => {
    if (!sheet) return { plan: null, problem: null };
    try {
      return {
        plan: planTiles(sheet.widthMm + 2 * TILE_PAD, sheet.heightMm + 2 * TILE_PAD),
        problem: null,
      };
    } catch (e) {
      return { plan: null, problem: e instanceof Error ? e.message : String(e) };
    }
  }, [sheet]);
  const plan = tiling.plan;
  const effectiveMode: Mode =
    mode === 'sheet' && !oneFits ? 'a4' : mode === 'a4' && !plan && oneFits ? 'sheet' : mode;
  const canDownload = !!sheet && (effectiveMode === 'sheet' ? oneFits : !!plan);

  // (Re)read whenever the file or the source unit changes: preview and download share one answer.
  useEffect(() => {
    if (!file || !unitsValid) {
      setSheet(null);
      return;
    }
    let live = true;
    setBusy(true);
    setError(null);
    (async () => {
      try {
        const { readPltSheet } = await import('lib/pattern-export/plt-pdf');
        const s = await readPltSheet(file.bytes, { name: file.name, unitsPerMm });
        if (live) setSheet(s);
      } catch (e) {
        if (live) {
          setSheet(null);
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
    setSheet(null);
    setFile({ name: f.name, bytes: await f.arrayBuffer() });
  };

  const download = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const { pltToPdf } = await import('lib/pattern-export/plt-pdf');
      const res = await pltToPdf(file.bytes, effectiveMode, { name: file.name, unitsPerMm });
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
              <Chip
                selected={effectiveMode === 'a4'}
                pressed={effectiveMode === 'a4'}
                disabled={!plan}
                title={tiling.problem ?? 'A4 tiles with overlap, marks and a map page'}
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
            {tiling.problem && (
              <Text size='micro' variant='error' component='p'>
                {tiling.problem}
              </Text>
            )}
            <Text size='micro' component='p'>
              {effectiveMode === 'a4' && plan
                ? `${plan.cols} × ${plan.rows} ${plan.paper}${plan.landscape ? ' landscape' : ''} + map page, ${plan.overlap} mm overlap`
                : 'one page'}
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
