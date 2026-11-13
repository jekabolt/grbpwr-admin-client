// The fuse fields of the piece panel, variant «Fold» (owner OK 2026-10-22): FUSING no / whole /
// allowance / strip / zone with `⋯` in the door; INTERLINING (prefilled when the BOM has one);
// WIDTH MM for a strip; `⋯` opens INSET MM / FUSIBLE GRAIN / DARTS in place, and opens by itself
// when any of them is off its default. ZONE (variant C, owner OK 2026-11-05): full / sharp / round
// and the point count; a sharp or round ring is drawn by dragging across the piece.
// Desktop: in the panel. Phone: docked above the footer.
import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  Button,
  Chip,
  Combobox,
  DotsHorizontalIcon,
  EmptyCell,
  GroupLabel,
  Input,
  Select,
  Text,
  type ComboboxGroup,
} from 'ui';
import {
  DART_ITEMS,
  DEFAULT_INSET_MM,
  FUSE_GRAIN_ITEMS,
  INSET_PRESETS,
  WIDTH_PRESETS,
  blankFuse,
  deriveFusePanelMode,
  fuseIncomplete,
  fuseLineOf,
  fuseOffDefault,
  fuseSpecForPanelMode,
  isMmText,
  mmOfText,
  PREVIEW_STRIP_MM,
  type FuseDarts,
  type FuseGrain,
  type FusePanelMode,
  type PieceFuseSpec,
} from './fuse-spec';
import { zoneRingsMm, ZONE_MAX_HOLES, ZONE_MAX_OUTER_RINGS } from 'lib/fusing-dxf/geometry';
import { SPLINE_MAX_POINTS } from 'lib/fusing-dxf/spline';
import {
  addZoneHole,
  allCorners,
  deleteMainZoneRing,
  deleteZoneRing,
  isDrawnZone,
  isFullZoneRing,
  isSplineZone,
  rebuildZoneRing,
  seedZone,
  splineZone,
  withCorners,
  zoneDrawKind,
  zonePoints,
  zoneRingLabel,
  zoneRingModeLabel,
  zoneRingPoints,
  zoneRingRefs,
  ZONE_DRAW_POINTS,
  ZONE_MIN_DRAWN_POINTS,
  ZONE_POINT_PRESETS,
  type ZoneBus,
  type ZoneDrawKind,
  type ZoneRingRef,
} from './fuse-zone';

export type InterliningLine = {
  key: string;
  label: string;
  color: string;
  ownerFileName?: string;
  uploading?: boolean;
};

const MODES: [FusePanelMode, string][] = [
  ['', 'no'],
  ['whole', 'whole'],
  ['allowance', 'allowance'],
  ['strip', 'strip'],
  ['zone', 'zone'],
];
const ADD_SLOT = '+slot';

/** Label row (micro uppercase, red when the answer is missing) over one control. */
export function FuseField({
  label,
  door,
  error,
  children,
}: {
  label: string;
  door?: React.ReactNode;
  error?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className='min-w-0 space-y-0.5'>
      <div className='flex items-baseline justify-between gap-2'>
        <Text
          size='micro'
          variant='label'
          component='span'
          className={`uppercase ${error ? 'text-error' : ''}`}
        >
          {label}
        </Text>
        {door}
      </div>
      {children}
    </div>
  );
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
function Swatch({ color }: { color: string }) {
  const c = color.trim();
  return HEX.test(c) ? (
    <span
      aria-hidden
      className='inline-block size-3 shrink-0 border border-textColor'
      style={{ backgroundColor: c }}
    />
  ) : (
    <span
      aria-hidden
      className='inline-block size-3 shrink-0 border border-dashed border-borderColor'
    />
  );
}

/** Preset numbers, plus what is typed when it is a number; `extra` rides at the end. */
const mmGroups = (q: string, presets: number[], extra: string[] = []): ComboboxGroup[] => {
  const t = q.trim();
  const opts = presets.map((x) => ({ value: String(x), label: String(x) }));
  if (t && isMmText(t) && !presets.includes(Number(t.replace(',', '.'))))
    opts.unshift({ value: t.replace(',', '.'), label: t });
  for (const x of extra) opts.push({ value: x, label: x });
  return [{ key: 'mm', label: 'mm', options: opts.filter((o) => !t || o.value.startsWith(t)) }];
};

export function FuseFields({
  spec,
  fused,
  lines,
  readOnly,
  toggleBox,
  onChange,
  onAddSlot,
  onLeaveFile,
  fileMappedLineKeys = [],
  seamAllowanceMm,
  allowanceUsesNetOutline = false,
  ci,
  zoneBus,
}: {
  spec: PieceFuseSpec;
  /** The stored `fused` — true with no mode is the legacy «fused, how not said». */
  fused: boolean;
  lines: readonly InterliningLine[];
  readOnly: boolean;
  /** The panel's toggle box class (one height for every control in the panel). */
  toggleBox: string;
  onChange: (next: PieceFuseSpec) => void;
  onAddSlot: () => void;
  onLeaveFile?: (lineKey: string) => void;
  /** Owner-file slots whose aliases currently point at this piece. */
  fileMappedLineKeys?: readonly string[];
  seamAllowanceMm?: number | null;
  /** The shown size has its own sewing contour. */
  allowanceUsesNetOutline?: boolean;
  /** The piece's canvas id and the dialog's zone bus (area + undo), shared with the canvas. */
  ci?: string;
  zoneBus?: ZoneBus;
}) {
  const on = spec.mode !== '';
  const [more, setMore] = useState(() => fuseOffDefault(spec));
  const lineKeys = lines.map((l) => l.key);
  const line = fuseLineOf(spec, lineKeys);
  const ownerMapped =
    !!line &&
    fileMappedLineKeys.includes(line) &&
    lines.some((candidate) => candidate.key === line && !!candidate.ownerFileName);
  const derivedMode = deriveFusePanelMode(spec, ownerMapped);
  const cur: FusePanelMode | null = !fused ? '' : derivedMode || null;
  const set = (d: Partial<PieceFuseSpec>) => onChange({ ...spec, ...d });
  const setMode = (m: FusePanelMode) => {
    if (ci) zoneBus?.setDrawing(ci, null);
    if (!m) return onChange(blankFuse());
    const next = fuseSpecForPanelMode(spec, m);
    onChange(m === 'strip' ? { ...next, widthMm: PREVIEW_STRIP_MM } : next);
  };
  const chooseMode = (mode: FusePanelMode) => {
    if (mode === derivedMode) return;
    if (ownerMapped && line) onLeaveFile?.(line);
    setMode(mode);
  };
  const allowanceWidth = allowanceUsesNetOutline
    ? 'seam line'
    : Number.isFinite(seamAllowanceMm) && (seamAllowanceMm ?? 0) > 0
      ? `${seamAllowanceMm} mm · card`
      : '—';

  return (
    <div className='space-y-2' data-fuse-fields=''>
      <FuseField
        label='fusing'
        error={fused && !on}
        door={
          on && (
            <Button
              type='button'
              aria-label='more'
              aria-expanded={more}
              className={`flex items-center ${more ? 'text-textColor' : 'text-labelColor'} hover:text-textColor`}
              onClick={() => setMore(!more)}
            >
              <DotsHorizontalIcon />
            </Button>
          )
        }
      >
        <div className='grid grid-cols-5 gap-1'>
          {MODES.map(([m, l]) => (
            <Chip
              key={m || 'no'}
              className={`${toggleBox} ${cur === m && m && fuseIncomplete(spec) ? 'border-error' : ''}`}
              selected={cur === m}
              pressed={cur === m}
              disabled={readOnly}
              aria-label={l}
              onClick={() => chooseMode(m)}
            >
              {l}
            </Chip>
          ))}
        </div>
      </FuseField>
      {on && (
        <div className={spec.mode === 'strip' ? 'grid grid-cols-2 items-end gap-2' : ''}>
          <FuseField label='interlining'>
            <Select
              name='interlining'
              size='sm'
              placeholder='—'
              items={[
                ...lines.map((l) => ({
                  value: l.key,
                  label: (
                    <span className='flex min-w-0 items-center gap-1.5'>
                      <Swatch color={l.color} />
                      <span className='truncate'>{l.label}</span>
                    </span>
                  ),
                })),
                { value: ADD_SLOT, label: '+ slot' },
              ]}
              value={line}
              readOnly={readOnly}
              invalid={!line}
              onValueChange={(x: string) => {
                if (x === ADD_SLOT) {
                  onAddSlot();
                  return;
                }
                set({ bomLineKey: x });
              }}
            />
          </FuseField>
          {derivedMode === 'allowance' ? (
            <FuseField label='width'>
              <Input readOnly aria-label='width' className='bg-pageBg' value={allowanceWidth} />
            </FuseField>
          ) : spec.mode === 'strip' ? (
            <FuseField label='width mm'>
              <Combobox
                name='width'
                size='sm'
                placeholder='mm'
                searchPlaceholder='mm'
                valueLabel={spec.widthMm == null ? '' : String(spec.widthMm)}
                filter={(q) => mmGroups(q, WIDTH_PRESETS)}
                readOnly={readOnly}
                onSelect={(x) => set({ widthMm: mmOfText(x) })}
              />
            </FuseField>
          ) : null}
        </div>
      )}
      {spec.mode === 'zone' && ci && zoneBus && (
        <ZoneRow
          spec={spec}
          ci={ci}
          bus={zoneBus}
          readOnly={readOnly}
          toggleBox={toggleBox}
          onChange={onChange}
        />
      )}
      {on && more && (
        <div className='grid grid-cols-3 items-end gap-2'>
          <FuseField label='inset mm'>
            <Combobox
              name='inset'
              size='sm'
              placeholder='mm'
              searchPlaceholder='mm'
              valueLabel={spec.insetNet ? 'net' : String(spec.insetMm ?? DEFAULT_INSET_MM)}
              filter={(q) =>
                mmGroups(q, INSET_PRESETS, !q.trim() || 'net'.startsWith(q.trim()) ? ['net'] : [])
              }
              readOnly={readOnly}
              onSelect={(x) =>
                x === 'net'
                  ? set({ insetNet: true, insetMm: null })
                  : set({ insetNet: false, insetMm: mmOfText(x) })
              }
            />
          </FuseField>
          <FuseField label='fusible grain'>
            <Select
              name='fusible grain'
              size='sm'
              items={FUSE_GRAIN_ITEMS}
              value={spec.grain}
              readOnly={readOnly}
              onValueChange={(x: string) => set({ grain: x as FuseGrain })}
            />
          </FuseField>
          <FuseField label='darts'>
            <Select
              name='darts'
              size='sm'
              items={DART_ITEMS}
              value={spec.darts}
              readOnly={readOnly}
              onValueChange={(x: string) => set({ darts: x as FuseDarts })}
            />
          </FuseField>
        </div>
      )}
    </div>
  );
}

/** ZONE variant C: ruled rings, selected-ring curve tools, and one shared undo stack. */
function ZoneRow({
  spec,
  ci,
  bus,
  readOnly,
  toggleBox,
  onChange,
}: {
  spec: PieceFuseSpec;
  ci: string;
  bus: ZoneBus;
  readOnly: boolean;
  toggleBox: string;
  onChange: (next: PieceFuseSpec) => void;
}) {
  useSyncExternalStore(bus.subscribe, bus.version);
  const area = bus.area(ci);
  const drawn = isDrawnZone(spec.zone);
  const spline = isSplineZone(spec.zone)
    ? spec.zone
    : drawn
      ? splineZone(zonePoints(spec.zone))
      : null;
  const refs = zoneRingRefs(spline);
  const requested = bus.selected(ci);
  const selected: ZoneRingRef = refs.includes(requested) ? requested : 'main';
  const ringAreas = bus.ringAreas(ci);
  const contour = bus.contour(ci) ?? [];
  const canUndo = bus.canUndo(ci);
  const zoneInvalid = drawn && area === null;
  useEffect(() => {
    if (requested !== selected) bus.select(ci, selected);
  }, [bus, ci, requested, selected]);
  const valid = (zone: PieceFuseSpec['zone']) => {
    if (!isSplineZone(zone)) return true;
    try {
      zoneRingsMm(zone, contour);
      return true;
    } catch {
      return false;
    }
  };
  const write = (zone: PieceFuseSpec['zone'], nextSelected: ZoneRingRef = selected) => {
    if (!valid(zone)) return;
    bus.commit(ci, spec.zone, selected, nextSelected);
    onChange({ ...spec, zone });
  };
  const chip = (label: string, on: boolean, off: boolean, onClick: () => void) => (
    <Chip
      className={toggleBox}
      selected={on}
      pressed={on}
      disabled={readOnly || off}
      aria-label={label}
      onClick={onClick}
    >
      {label}
    </Chip>
  );
  const addHole = () => {
    if (!spline || contour.length < 3) return;
    const added = addZoneHole(spline, selected, contour);
    if (added) write(added.zone, added.ref);
  };
  const clear = () => {
    bus.commit(ci, spec.zone, selected, 'main');
    onChange({ ...spec, zone: null });
  };
  const drawKind = zoneDrawKind(bus, ci, spec.zone);
  const full = drawn && isFullZoneRing(spec.zone, selected, contour);
  const count = zoneRingPoints(spec.zone, selected).length;
  const chooseFull = () => {
    const seeded = seedZone(contour);
    if (!seeded) return;
    const kept = isSplineZone(spec.zone)
      ? { holes: spec.zone.holes, islands: spec.zone.islands }
      : undefined;
    const next = kept ? splineZone(zonePoints(seeded), kept) : seeded;
    write(valid(next) ? next : seeded, 'main');
  };
  const chooseShape = (kind: ZoneDrawKind) => {
    if (drawKind) return bus.setDrawing(ci, kind);
    if (!drawn) return bus.setDrawing(ci, kind);
    if (!full) {
      // Round keeps the ring inside its own bounds; sharp only sets the corners of what is there.
      if (kind === 'round')
        return write(rebuildZoneRing(spec.zone, selected, count, contour, kind));
      return write(withCorners(spec.zone, true, selected));
    }
    clear();
    bus.setDrawing(ci, kind);
  };
  const setCount = (text: string) => {
    const n = Number(text);
    if (!Number.isInteger(n) || n < ZONE_MIN_DRAWN_POINTS || n > SPLINE_MAX_POINTS) return;
    write(rebuildZoneRing(spec.zone, selected, n, contour));
  };
  const reset = () => {
    if (full) return chooseFull();
    write(rebuildZoneRing(spec.zone, selected, count, contour));
  };
  const remove = () => {
    if (selected !== 'main') {
      const next = deleteZoneRing(spline, selected);
      if (next) write(next, 'main');
      return;
    }
    const next = deleteMainZoneRing(spline);
    if (next) write(next, 'main');
    else clear();
  };
  return (
    <div data-zone-area={area ?? ''} aria-invalid={zoneInvalid ? true : undefined}>
      <GroupLabel>zone</GroupLabel>
      <div className='grid grid-cols-[repeat(3,minmax(0,1fr))_4rem] gap-1'>
        {chip('full', full && !drawKind, selected !== 'main' || contour.length < 3, chooseFull)}
        {chip(
          'sharp',
          drawKind === 'sharp' || (!drawKind && !full && allCorners(spec.zone, true, selected)),
          false,
          () => chooseShape('sharp'),
        )}
        {chip(
          'round',
          drawKind === 'round' || (!drawKind && !full && allCorners(spec.zone, false, selected)),
          false,
          () => chooseShape('round'),
        )}
        <Combobox
          name='points'
          size='sm'
          placeholder='pt'
          searchPlaceholder='pt'
          valueLabel={drawKind ? String(ZONE_DRAW_POINTS[drawKind]) : full ? '' : String(count)}
          filter={(q) => mmGroups(q, ZONE_POINT_PRESETS)}
          readOnly={readOnly || !!drawKind || !drawn || full}
          onSelect={setCount}
        />
      </div>
      {(refs.length > 0 || canUndo) && (
        <>
          <GroupLabel
            className={zoneInvalid ? '[&>span]:text-error' : undefined}
            action={
              <div className='flex flex-wrap justify-end gap-x-3'>
                <Button
                  variant='underline'
                  size='xs'
                  disabled={
                    readOnly ||
                    !spline ||
                    contour.length < 3 ||
                    selected.startsWith('hole:') ||
                    spline.holes.length >= ZONE_MAX_HOLES
                  }
                  onClick={addHole}
                >
                  + hole
                </Button>
                <Button
                  variant='underline'
                  size='xs'
                  aria-pressed={!!drawKind && drawn}
                  className={drawKind && drawn ? 'bg-textColor text-bgColor' : undefined}
                  disabled={
                    readOnly || !spline || full || 1 + spline.islands.length >= ZONE_MAX_OUTER_RINGS
                  }
                  onClick={() =>
                    bus.setDrawing(
                      ci,
                      drawKind ? null : allCorners(spec.zone, true, selected) ? 'sharp' : 'round',
                    )
                  }
                >
                  + part
                </Button>
                <Button
                  variant='underline'
                  size='xs'
                  disabled={readOnly || !canUndo}
                  onClick={() => {
                    const prev = bus.undo(ci);
                    if (prev) onChange({ ...spec, zone: prev.zone });
                  }}
                >
                  undo
                </Button>
                <Button variant='underline' size='xs' disabled={readOnly || !drawn} onClick={reset}>
                  reset
                </Button>
                <Button
                  variant='underline'
                  size='xs'
                  disabled={readOnly || !drawn}
                  onClick={remove}
                >
                  delete
                </Button>
              </div>
            }
          >
            rings
          </GroupLabel>
          <div className='divide-y divide-hairline'>
            {refs.map((ref) => {
              const selectedRow = ref === selected;
              const ringArea = ringAreas[ref];
              const ringInvalid = zoneInvalid || ringArea === null;
              return (
                <Button
                  key={ref}
                  aria-label={zoneRingLabel(spline, ref)}
                  aria-pressed={selectedRow}
                  aria-invalid={ringInvalid || undefined}
                  className={`grid min-h-7 w-full grid-cols-[auto_minmax(0,1fr)_auto_4.5rem] items-center gap-1.5 px-1.5 py-1 text-left text-micro uppercase tracking-label ${
                    selectedRow && ringInvalid
                      ? 'bg-error text-bgColor'
                      : selectedRow
                        ? 'bg-textColor text-bgColor'
                        : ringInvalid
                          ? 'bg-bgColor text-error hover:bg-pageBg'
                          : 'bg-bgColor text-textColor hover:bg-pageBg'
                  }`}
                  disabled={readOnly}
                  onClick={() => bus.select(ci, ref)}
                >
                  <span aria-hidden>{ringInvalid ? '!' : ref.startsWith('hole:') ? '◇' : '◆'}</span>
                  <span className='truncate'>{zoneRingLabel(spline, ref)}</span>
                  <span data-ring-mode=''>{zoneRingModeLabel(spline, ref, bus.lines(ci))}</span>
                  <span className='text-right tabular-nums'>
                    {ringArea != null ? `${Math.round(ringArea)} cm²` : <EmptyCell />}
                  </span>
                </Button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
