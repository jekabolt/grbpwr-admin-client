// THE PAPER DOLL, FULLSCREEN (01-DESIGN-L0 §6): the fourth view of the assembly — the pattern's
// pieces wrapped round a proxy and pulled shut along the seam graph, for two questions only: does
// the graph close into a garment, and where do the card's measures sit on it.
//
// Three blocks on the grey ground: the header in one line (title, sizes, close), the DOLL beside
// the MEASURES rail. The doll's state is a corner word over the canvas while it closes or fails;
// the full line stays for screen readers (and the probe) in `data-doll-state`. Nothing here
// writes to the card; the doll is rebuilt from decisions made in the assembly order after the
// provider's re-read.
//
// Lazy-loaded (three.js stays out of the card's bundle until the view is opened).

import * as Dialog from '@radix-ui/react-dialog';
import { useQuery } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { liftMeasureLine } from 'lib/doll/lift';
import { compareToSizeChart, type ChartCell } from 'lib/pom';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useWatch } from 'react-hook-form';
import { Chip, ChipRow, GroupLabel, Section, Text, ViewSwitch, type ViewSwitchOption } from 'ui';

import type { TechCardFormData } from '../schema';
import { DollCanvas, type CameraPreset, type PomLine } from './doll-canvas';
import { requestDoll, requestPoms, THUMB, useDollStore } from './doll-store';
import { PomRail } from './pom-rail';
import { dollKey, dollRequest, pomKey, pomRequest, useDollCard } from './use-doll-card';
import { cm, stateLine } from './words';

const CAMERAS = [
  { value: 'front', label: 'front', hint: '1' },
  { value: 'back', label: 'back', hint: '2' },
  { value: 'left', label: 'left', hint: '3' },
  { value: 'right', label: 'right', hint: '4' },
] as const satisfies readonly ViewSwitchOption<CameraPreset>[];

/**
 * A measure line is often two points (a chord across a panel). Lifted as is, its 3D chord cuts
 * through the doll; sampled every 8 mm on the flat pattern, it follows the cloth.
 */
function densify(pts: readonly [number, number][], stepMm = 8): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = pts[i];
    if (i === 0) {
      out.push([x, y]);
      continue;
    }
    const [px, py] = pts[i - 1];
    const n = Math.max(1, Math.ceil(Math.hypot(x - px, y - py) / stepMm));
    for (let k = 1; k <= n; k++) out.push([px + ((x - px) * k) / n, py + ((y - py) * k) / n]);
  }
  return out;
}

const secs = (ms: number | undefined) => (ms == null ? '' : `${(ms / 1000).toFixed(1)} s`);

export default function DollOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const card = useDollCard();
  const styleNumber = (useWatch<TechCardFormData>({ name: 'styleNumber' }) ?? '') as string;
  const name = (useWatch<TechCardFormData>({ name: 'name' }) ?? '') as string;
  const unit = (useWatch<TechCardFormData>({ name: 'measurementUnit' }) ?? 'mm') as string;
  const title = styleNumber.trim() || name.trim() || 'this card';

  const [size, setSize] = useState<string | null>(null);
  const [lining, setLining] = useState(false);
  const [showPom, setShowPom] = useState(false);
  const [camera, setCamera] = useState<CameraPreset | null>('front');
  const [fitSignal, setFitSignal] = useState(0);
  const [showSeams, setShowSeams] = useState(false);
  const at = size && card?.sizes.includes(size) ? size : card?.baseSize ?? '';
  const hasLining = !!card?.factsOf(card.baseSize)?.pieces.some((p) => p.cloth === 'lining');

  // ── the doll of the size on screen, solved in the worker on selection (§8 q6) ──
  const key = card && at ? dollKey(card, at, lining) : null;
  useEffect(() => {
    if (!open || !card || !key) return;
    const req = dollRequest(card, at, lining);
    // The read size without lining is the column's doll too: its still comes with it.
    const still = at === card.baseSize && !lining ? THUMB : undefined;
    if (req) requestDoll(key, { size: at, lining }, req, still);
  }, [open, card, key, at, lining]);
  const solve = useDollStore((s) => (key ? s.solves[key] : undefined));
  const report = solve?.status === 'done' ? solve.report ?? null : null;

  // ── POM values for every size, read once per read of the card (2D, §8 q6) ──
  const pkey = card ? pomKey(card) : null;
  // After the doll's first frame: the all-size read must not compete with the first solve.
  const firstFrame = solve?.firstFrameMs != null || solve?.status === 'error';
  useEffect(() => {
    if (!open || !card || !pkey || !firstFrame) return;
    const req = pomRequest(card);
    if (req) requestPoms(pkey, req);
  }, [open, card, pkey, firstFrame]);
  const pom = useDollStore((s) => (pkey ? s.poms[pkey] : undefined));
  const hoverPom = useDollStore((s) => s.hoverPom);
  const values = useMemo(
    () => pom?.report?.sizes.find((s) => s.size === at)?.values ?? [],
    [pom, at],
  );

  // ── the card's size chart: the spec the factory reads ──
  const { dictionary } = useDictionary();
  const chart = useQuery({
    queryKey: ['doll', 'style-size-chart', card?.cardId],
    queryFn: () => adminService.GetStyleSizeChart({ styleId: card!.cardId! }),
    enabled: open && !!card?.cardId,
    retry: false,
  });
  const comparisons = useMemo(() => {
    if (!pom?.report) return [];
    const sizeName = new Map((dictionary?.sizes ?? []).map((s) => [s.id, s.name ?? '']));
    const measure = new Map((dictionary?.measurements ?? []).map((m) => [m.id, m.name ?? '']));
    const cells: ChartCell[] = [];
    for (const c of chart.data?.chart?.cells ?? []) {
      const v = Number(c.value?.value ?? NaN);
      const n = measure.get(c.measurementNameId);
      const s = sizeName.get(c.sizeId);
      if (!Number.isFinite(v) || v <= 0 || !n || !s) continue;
      cells.push({ size: s, name: n, value: v });
    }
    const norm = (s: string) => s.replace(/[<>\s]/g, '').toLowerCase();
    // The chart is in the card's sizes; the doll's sizes are the DXF's («M» for «m_32bo_m»).
    const keyOf = new Map((card?.sizes ?? []).map((s) => [norm(card!.cardSizeOf(s)), s]));
    const mapped = cells.map((c) => ({ ...c, size: keyOf.get(norm(c.size)) ?? c.size }));
    return compareToSizeChart(pom.report, mapped, unit).filter((c) => norm(c.size) === norm(at));
  }, [pom, chart.data, dictionary, unit, at, card]);

  // ── POM lines lifted onto the doll on screen ──
  const pomLines = useMemo<PomLine[]>(() => {
    if (!report) return [];
    return values
      .filter((v) => v.valueMm != null)
      .map((v) => ({
        code: v.code,
        // The pinned label is short: the code and the number (the rail carries the full name).
        label: `${v.code.replace(/-/g, ' ')} · ${cm(v.valueMm!)} cm`,
        paths: v.path.lines
          .map((l) => liftMeasureLine(report, { pieceKey: l.pieceKey, pts: densify(l.pts) }))
          .filter((p) => p.length >= 2),
      }))
      .filter((l) => l.paths.length > 0);
  }, [report, values]);
  const drawn = useMemo(() => new Set(pomLines.map((l) => l.code)), [pomLines]);

  const names = useMemo(
    () => new Map((card?.factsOf(card.baseSize)?.pieces ?? []).map((p) => [p.pieceKey, p.name])),
    [card],
  );
  const missing = card && at ? card.missingOf(at) : [];

  // The probe reads the report as data (the strip that listed it is gone).
  useEffect(() => {
    (window as Window & { __dollReport?: unknown }).__dollReport = report;
  }, [report]);

  // The size on screen stays in view inside its scrolling row.
  const sizesRow = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    sizesRow.current
      ?.querySelector('[aria-checked="true"]')
      ?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }, [at, open]);

  const busy = !card || !solve || solve.status === 'solving';
  const state = !card
    ? 'reading the pattern…'
    : !solve || solve.status === 'solving'
      ? 'closing the seams…'
      : solve.status === 'error'
        ? `the doll could not be built: ${solve.error}`
        : `${stateLine(report!)} · solved in ${secs(solve.doneMs)}`;

  // F fits the doll, 1–4 turn it to a view; not while typing, not under cmd/ctrl/alt.
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    const t = e.target as HTMLElement;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable) return;
    if (e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      setFitSignal((n) => n + 1);
      return;
    }
    const view = CAMERAS[Number(e.key) - 1]?.value;
    if (view && /^[1-4]$/.test(e.key)) {
      e.preventDefault();
      setCamera(view);
    }
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className='fixed inset-0 z-[var(--z-modal)] bg-overlay' />
        <Dialog.Content
          data-doll-overlay=''
          data-doll-size={at}
          data-doll-status={solve?.status ?? 'idle'}
          data-doll-first-frame-ms={solve?.firstFrameMs?.toFixed(0) ?? ''}
          data-doll-done-ms={solve?.doneMs?.toFixed(0) ?? ''}
          data-doll-vertices={report?.stats.vertices ?? ''}
          onKeyDown={onKeyDown}
          className='fixed inset-0 z-[var(--z-modal)] flex flex-col gap-gutter overflow-y-auto bg-pageBg p-4 text-textColor focus:outline-none lg:overflow-hidden'
        >
          <Dialog.Title className='sr-only'>paper doll</Dialog.Title>
          <Dialog.Description className='sr-only'>
            the pattern closed along its seams
          </Dialog.Description>

          <Section
            title='paper doll'
            question={title}
            action={
              <div className='flex min-w-0 items-center gap-4'>
                {card && card.sizes.length > 0 && (
                  <div
                    ref={sizesRow}
                    className='min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
                  >
                    <ViewSwitch<string>
                      quiet
                      label='size'
                      value={at}
                      onChange={(s) => {
                        setSize(s);
                        setCamera((c) => c ?? 'front');
                      }}
                      options={card.sizes.map((s) => ({
                        value: s,
                        label: card.sizeLabel(s),
                        hint: s === card.baseSize ? 'read size' : undefined,
                      }))}
                      className='whitespace-nowrap'
                    />
                  </div>
                )}
                <Chip quiet onClick={onClose} data-doll-door='close'>
                  close
                </Chip>
              </div>
            }
          >
            {missing.length > 0 && (
              <Text size='micro' variant='label' component='p' className='truncate'>
                no contour: {missing.join(', ')}
              </Text>
            )}
            <span className='sr-only' data-doll-state='' aria-live='polite'>
              {state}
            </span>
          </Section>

          <div className='grid shrink-0 grid-cols-1 gap-gutter lg:min-h-0 lg:flex-1 lg:shrink lg:grid-cols-[minmax(0,1fr)_360px]'>
            <Section
              title='doll'
              action={
                <div className='flex flex-wrap items-center justify-end gap-x-2'>
                  <ViewSwitch<CameraPreset>
                    quiet
                    label='camera'
                    value={camera ?? ('' as CameraPreset)}
                    onChange={setCamera}
                    options={CAMERAS}
                  />
                  <ChipRow>
                    <Chip
                      quiet
                      onClick={() => setFitSignal((n) => n + 1)}
                      data-doll-fit=''
                      title='F'
                    >
                      fit
                    </Chip>
                    <Chip
                      quiet
                      selected={showSeams}
                      pressed={showSeams}
                      onClick={() => setShowSeams((v) => !v)}
                      data-doll-toggle='seams'
                      title='closed and proposed'
                    >
                      seams
                    </Chip>
                    {hasLining && report?.liningAsShell && (
                      <Chip quiet selected data-doll-lining-shell='' title='every piece is lining'>
                        lining
                      </Chip>
                    )}
                    {hasLining && !report?.liningAsShell && (
                      <Chip
                        quiet
                        selected={lining}
                        pressed={lining}
                        onClick={() => setLining((v) => !v)}
                        data-doll-toggle='lining'
                        title='solved on demand'
                      >
                        lining
                      </Chip>
                    )}
                  </ChipRow>
                </div>
              }
              className='flex h-[60vh] min-h-[360px] flex-col overflow-hidden lg:h-auto lg:min-h-0'
            >
              <div className='relative min-h-0 flex-1'>
                <DollCanvas
                  solveKey={key}
                  report={report}
                  pomLines={pomLines}
                  showPom={showPom}
                  hoverPom={hoverPom}
                  camera={camera}
                  fitSignal={fitSignal}
                  showSeams={showSeams}
                  onCameraLeft={() => setCamera(null)}
                  onFrame={() => {
                    const w = window as Window & { __dollFrames?: number };
                    w.__dollFrames = (w.__dollFrames ?? 0) + 1;
                  }}
                />
                {busy && (
                  <Text
                    size='micro'
                    variant='label'
                    component='span'
                    className='pointer-events-none absolute left-2 top-2'
                  >
                    {card ? 'closing…' : 'reading…'}
                  </Text>
                )}
                {solve?.status === 'error' && (
                  <Text
                    size='micro'
                    variant='error'
                    component='span'
                    className='absolute left-2 top-2'
                    title={solve.error}
                  >
                    doll failed
                  </Text>
                )}
              </div>
            </Section>
            <Section
              title='measures'
              action={
                <Chip
                  quiet
                  selected={showPom}
                  pressed={showPom}
                  onClick={() => setShowPom((v) => !v)}
                  data-doll-toggle='pom'
                  title='every measure line'
                >
                  lines
                </Chip>
              }
              className='flex max-h-[70vh] min-h-0 flex-col overflow-hidden lg:max-h-none'
            >
              <div className='min-h-0 flex-1 overflow-y-auto pr-1'>
                {/* Not a garment (a bag, a cover): the standard POMs are a garment's; the rail is
                    not shown, the engine's reason sits in the title. */}
                {report?.notGarment ? (
                  <Text
                    size='micro'
                    variant='label'
                    component='p'
                    className='py-2'
                    title={report.notGarment}
                    data-doll-no-measures=''
                  >
                    no measures
                  </Text>
                ) : (
                  <>
                    <GroupLabel flush>
                      {pom?.report?.convention === 'full' ? 'full girths' : 'half girths'}
                    </GroupLabel>
                    {!pom || pom.status === 'reading' ? (
                      <Text size='micro' variant='label' component='p' className='py-2'>
                        measuring…
                      </Text>
                    ) : pom.status === 'error' ? (
                      <Text
                        size='micro'
                        variant='label'
                        component='p'
                        className='py-2'
                        title={pom.error}
                      >
                        no measures
                      </Text>
                    ) : (
                      <PomRail
                        values={values}
                        garment={pom.report!.garment}
                        comparisons={comparisons}
                        hover={hoverPom}
                        drawn={drawn}
                        names={names}
                      />
                    )}
                  </>
                )}
              </div>
            </Section>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
