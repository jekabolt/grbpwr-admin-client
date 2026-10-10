// THE PAPER DOLL, FULLSCREEN (01-DESIGN-L0 §6): the fourth view of the assembly — the pattern's
// pieces wrapped round a proxy and pulled shut along the seam graph, for two questions only: does
// the graph close into a garment, and where do the card's measures sit on it.
//
// Three blocks on the grey ground, as the SEAMS review: the header (size, state, the honesty line),
// the DOLL beside the MEASURES rail, and the ASSEMBLY CHECK strip. Nothing here writes to the card:
// a seam is fixed in the SEAMS review (opened over this view, on that seam), and the doll is
// rebuilt from the decisions after the provider's re-read.
//
// Lazy-loaded (three.js stays out of the card's bundle until the view is opened).

import * as Dialog from '@radix-ui/react-dialog';
import { useQuery } from '@tanstack/react-query';
import { adminService } from 'api/api';
import type { EdgeId } from 'lib/assembly-skeleton/types';
import { liftMeasureLine } from 'lib/doll/lift';
import type { DollSeamReport } from 'lib/doll/types';
import { compareToSizeChart, POM, type ChartCell } from 'lib/pom';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useEffect, useMemo, useState } from 'react';
import { useWatch } from 'react-hook-form';
import { Chip, ChipRow } from 'ui/components/chip';
import { GroupLabel } from 'ui/components/group-label';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';
import { ViewSwitch, type ViewSwitchOption } from 'ui/components/view-switch';

import { SeamsReview } from '../assembly-seams/seams-review';
import { useHeldSeamGraph } from '../assembly-seams/use-seam-decisions';
import type { TechCardFormData } from '../schema';
import { DollCanvas, type CameraPreset, type PomLine } from './doll-canvas';
import { DollReportRows } from './doll-report';
import { requestDoll, requestPoms, THUMB, useDollStore } from './doll-store';
import { PomRail } from './pom-rail';
import { dollKey, dollRequest, pomKey, pomRequest, useDollCard } from './use-doll-card';
import { cm, reportRows, stateLine } from './words';

const CAMERAS = [
  { value: 'front', label: 'front', hint: 'the doll from the front' },
  { value: 'back', label: 'back', hint: 'the doll from the back' },
  { value: 'left', label: 'left', hint: 'the doll’s left side' },
  { value: 'right', label: 'right', hint: 'the doll’s right side' },
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

export default function DollOverlay({
  open,
  onClose,
  frozen,
}: {
  open: boolean;
  onClose: () => void;
  frozen: boolean;
}) {
  const card = useDollCard();
  const { graph } = useHeldSeamGraph();
  const styleNumber = (useWatch<TechCardFormData>({ name: 'styleNumber' }) ?? '') as string;
  const name = (useWatch<TechCardFormData>({ name: 'name' }) ?? '') as string;
  const unit = (useWatch<TechCardFormData>({ name: 'measurementUnit' }) ?? 'mm') as string;
  const title = styleNumber.trim() || name.trim() || 'this card';

  const [size, setSize] = useState<string | null>(null);
  const [lining, setLining] = useState(false);
  const [showPom, setShowPom] = useState(false);
  const [camera, setCamera] = useState<CameraPreset | null>('front');
  const [fix, setFix] = useState<{ a: EdgeId[]; b: EdgeId[] } | null | false>(false);
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
  useEffect(() => {
    if (!open || !card || !pkey) return;
    const req = pomRequest(card);
    if (req) requestPoms(pkey, req);
  }, [open, card, pkey]);
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
    return compareToSizeChart(pom.report, cells, unit).filter((c) => norm(c.size) === norm(at));
  }, [pom, chart.data, dictionary, unit, at]);
  const chartCells = chart.data?.chart?.cells?.length ?? 0;

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

  // ── the report in words ──
  const geoms = useMemo(() => new Map((graph?.pieces ?? []).map((p) => [p.pieceKey, p])), [graph]);
  const roles = useMemo(() => {
    const out = new Map<EdgeId, string>();
    for (const [id, r] of Object.entries(pom?.report?.roles ?? {}))
      if (r.confidence >= POM.roleAccept && r.role !== 'unknown')
        out.set(id, r.role.replace(/-/g, ' '));
    return out;
  }, [pom]);
  const names = useMemo(
    () => new Map((card?.factsOf(card.baseSize)?.pieces ?? []).map((p) => [p.pieceKey, p.name])),
    [card],
  );
  const rows = useMemo(
    () => (report ? reportRows(report, geoms, roles, names) : []),
    [report, geoms, roles, names],
  );
  const missing = card && at ? card.missingOf(at) : [];
  const onBase = !!card && at === card.baseSize;

  const fixSeam = (s: DollSeamReport | null) => setFix(s && onBase ? { a: s.a, b: s.b } : null);

  const state = !card
    ? 'reading the pattern…'
    : !solve || solve.status === 'solving'
      ? 'closing the seams…'
      : solve.status === 'error'
        ? `the doll could not be built: ${solve.error}`
        : `${stateLine(report!)} · solved in ${secs(solve.doneMs)}`;

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
          className='fixed inset-0 z-[var(--z-modal)] flex flex-col gap-gutter bg-pageBg p-4 text-textColor focus:outline-none'
        >
          <Dialog.Title className='sr-only'>paper doll</Dialog.Title>
          <Dialog.Description className='sr-only'>
            the pattern’s pieces pulled shut along the seam graph, with the measures read from the
            pattern laid flat
          </Dialog.Description>

          <Section
            title='paper doll'
            question={`— ${title} · does the pattern close into a garment`}
            action={
              <>
                <Chip quiet onClick={() => setFix(null)} data-doll-door='seams'>
                  seams review
                </Chip>
                <Chip quiet onClick={onClose} data-doll-door='close'>
                  close · esc
                </Chip>
              </>
            }
          >
            <div className='flex flex-wrap items-center gap-x-4 gap-y-2'>
              {card && card.sizes.length > 0 && (
                <ViewSwitch<string>
                  label='size'
                  value={at}
                  onChange={(s) => {
                    setSize(s);
                    setCamera((c) => c ?? 'front');
                  }}
                  options={card.sizes.map((s) => ({
                    value: s,
                    label: s,
                    hint:
                      s === card.baseSize
                        ? `size ${s}, the size the pattern is read on`
                        : `size ${s}`,
                  }))}
                />
              )}
              <Text component='span' className='tabular-nums' data-doll-state=''>
                {state}
              </Text>
            </div>
            <Text size='micro' variant='label' component='p' data-doll-honesty=''>
              paper doll — shape approximate, no fabric or body · measures from the pattern laid
              flat (seam lines) · size {at}
            </Text>
            {missing.length > 0 && (
              <Text size='micro' variant='label' component='p'>
                {missing.length} {missing.length === 1 ? 'piece has' : 'pieces have'} no contour in
                size {at} and {missing.length === 1 ? 'is' : 'are'} left out: {missing.join(', ')}
              </Text>
            )}
          </Section>

          <div className='grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_360px] gap-gutter'>
            <Section
              title='doll'
              question='— drag to turn it, scroll to zoom'
              action={
                <ViewSwitch<CameraPreset>
                  quiet
                  label='camera'
                  value={camera ?? ('' as CameraPreset)}
                  onChange={setCamera}
                  options={CAMERAS}
                />
              }
              className='flex min-h-0 flex-col overflow-hidden'
            >
              <div className='min-h-0 flex-1'>
                <DollCanvas
                  solveKey={key}
                  report={report}
                  pomLines={pomLines}
                  showPom={showPom}
                  hoverPom={hoverPom}
                  camera={camera}
                  onCameraLeft={() => setCamera(null)}
                  onFrame={() => {
                    const w = window as Window & { __dollFrames?: number };
                    w.__dollFrames = (w.__dollFrames ?? 0) + 1;
                  }}
                />
              </div>
            </Section>
            <Section
              title='measures'
              question={`— size ${at}, from the pattern laid flat`}
              className='flex min-h-0 flex-col overflow-hidden'
            >
              <div className='min-h-0 flex-1 overflow-y-auto pr-1'>
                <GroupLabel flush>
                  {`${pom?.report?.convention === 'full' ? 'full' : 'half'} girths · ±1.0 cm ${pom?.report?.conventionSource ?? 'default'}`}
                </GroupLabel>
                {!pom || pom.status === 'reading' ? (
                  <Text size='micro' variant='label' component='p' className='py-2'>
                    measuring the pattern…
                  </Text>
                ) : pom.status === 'error' ? (
                  <Text size='micro' variant='label' component='p' className='py-2'>
                    the measures could not be read: {pom.error}
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
                <Text size='micro' variant='label' component='p' className='pt-2'>
                  {chart.isLoading
                    ? 'reading the size chart…'
                    : chartCells === 0
                      ? 'the size chart is empty: no spec to compare against'
                      : 'spec from the size chart · Δ = pattern − spec'}
                </Text>
              </div>
            </Section>
          </div>

          <Section
            title='assembly check'
            question='— what the doll could not close as drawn'
            action={
              <ChipRow>
                <Chip
                  selected={showPom}
                  pressed={showPom}
                  onClick={() => setShowPom((v) => !v)}
                  data-doll-toggle='pom'
                  title='draw every measure line on the doll'
                >
                  pom lines
                </Chip>
                {hasLining && (
                  <Chip
                    selected={lining}
                    pressed={lining}
                    onClick={() => setLining((v) => !v)}
                    data-doll-toggle='lining'
                    title='lining is not solved until asked: it doubles the work on a lined jacket'
                  >
                    lining {lining ? 'solved' : 'not solved'}
                  </Chip>
                )}
              </ChipRow>
            }
            className='max-h-[30vh] overflow-y-auto'
          >
            {report ? (
              <DollReportRows
                rows={rows}
                onFix={fixSeam}
                fixHint={
                  onBase ? null : `the review reads size ${card?.baseSize}: it opens unfocused`
                }
              />
            ) : (
              <Text size='micro' variant='label' component='p'>
                {solve?.status === 'error' ? state : 'the report comes when the doll settles'}
              </Text>
            )}
          </Section>

          {fix !== false && card && (
            <SeamsReview
              open
              onClose={() => setFix(false)}
              cardId={card.cardId ?? undefined}
              frozen={frozen}
              title={title}
              size={card.baseSize}
              focus={fix}
            />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
