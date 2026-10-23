// The fuse fields of the piece panel, variant «Fold» (owner OK 2026-10-22): FUSING no / whole /
// strip / zone / derived file with `⋯` in the door; INTERLINING (prefilled when the BOM has one);
// WIDTH MM for a strip; `⋯` opens INSET MM / FUSIBLE GRAIN / DARTS in place, and opens by itself
// when any of them is off its default. ZONE (L13 Rect+): clipped area in the door, sharp / round,
// undo / reset. Desktop: in the panel. Phone: docked above the footer.
import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  Button,
  Chip,
  Combobox,
  DotsHorizontalIcon,
  EmptyCell,
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
  isMmText,
  mmOfText,
  type FuseDarts,
  type FuseGrain,
  type FuseMode,
  type FusePanelMode,
  type PieceFuseSpec,
} from './fuse-spec';
import { allCorners, isDrawnZone, resetZone, withCorners, type ZoneBus } from './fuse-zone';
import { PatternDropZone } from '../pattern-drop-zone';

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
  ['strip', 'strip'],
  ['zone', 'zone'],
  ['file', 'file'],
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
  onAddFileSlot,
  onUploadFile,
  onPickFile,
  onLeaveFile,
  fileMappedLineKeys = [],
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
  onAddFileSlot?: () => string | void;
  onUploadFile?: (lineKey: string, files: FileList | File[]) => void;
  onPickFile?: (lineKey: string) => void;
  onLeaveFile?: (lineKey: string) => void;
  /** Owner-file slots whose aliases currently point at this piece. */
  fileMappedLineKeys?: readonly string[];
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
  const [fileOpen, setFileOpen] = useState(() => derivedMode === 'file');
  const [fileLineKey, setFileLineKey] = useState(() => line || lines[0]?.key || '');
  const [fileDragging, setFileDragging] = useState(false);
  useEffect(() => {
    if (derivedMode !== 'file' || !line) return;
    setFileOpen(true);
    setFileLineKey(line);
  }, [derivedMode, line]);
  const shownLineKey = fileOpen ? fileLineKey : line;
  const shownLine = lines.find((candidate) => candidate.key === shownLineKey);
  const cur: FusePanelMode | null = !fused
    ? ''
    : derivedMode === 'file' && shownLineKey === line
      ? 'file'
      : spec.mode || null;
  const set = (d: Partial<PieceFuseSpec>) => onChange({ ...spec, ...d });
  const setMode = (m: FuseMode) => {
    if (!m) return onChange(blankFuse());
    onChange({
      ...spec,
      mode: m,
      edges: m === 'strip' ? spec.edges : [],
      zone: m === 'zone' ? spec.zone : null,
    });
  };
  const chooseMode = (mode: FusePanelMode) => {
    if (mode === 'file') {
      setFileOpen(true);
      if (!fileLineKey) setFileLineKey(line || lines[0]?.key || '');
      return;
    }
    if (derivedMode === 'file' && line) onLeaveFile?.(line);
    setFileOpen(false);
    setMode(mode);
  };
  const fileReady = !!shownLine && !shownLine.uploading && !readOnly;

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
      {(on || fileOpen) && (
        <div
          className={!fileOpen && spec.mode === 'strip' ? 'grid grid-cols-2 items-end gap-2' : ''}
        >
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
              value={shownLineKey}
              readOnly={readOnly}
              invalid={!shownLineKey}
              onValueChange={(x: string) => {
                if (x === ADD_SLOT) {
                  if (fileOpen) {
                    const added = onAddFileSlot?.();
                    if (added) setFileLineKey(added);
                  } else onAddSlot();
                  return;
                }
                if (fileOpen) setFileLineKey(x);
                else set({ bomLineKey: x });
              }}
            />
          </FuseField>
          {!fileOpen && spec.mode === 'strip' && (
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
          )}
        </div>
      )}
      {fileOpen && (
        <FuseField
          label='file'
          door={
            shownLine?.ownerFileName &&
            !readOnly && (
              <Button
                type='button'
                variant='underline'
                size='xs'
                disabled={shownLine.uploading}
                onClick={() => onPickFile?.(shownLine.key)}
              >
                replace
              </Button>
            )
          }
        >
          {shownLine?.ownerFileName ? (
            <Input
              readOnly
              aria-label='owner file'
              className='bg-pageBg text-micro'
              title={shownLine.ownerFileName}
              value={shownLine.uploading ? 'uploading…' : shownLine.ownerFileName}
            />
          ) : (
            <PatternDropZone
              interactive={fileReady}
              active={fileDragging}
              disabled={!fileReady}
              className='h-14'
              onClick={() => shownLine && onPickFile?.(shownLine.key)}
              onDragOver={(event) => {
                event.preventDefault();
                if (!fileReady) return;
                setFileDragging(true);
              }}
              onDragLeave={() => setFileDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setFileDragging(false);
                if (!fileReady || !shownLine) return;
                onUploadFile?.(shownLine.key, event.dataTransfer.files);
              }}
            >
              <Text size='micro' component='span'>
                {shownLine?.uploading ? 'uploading…' : shownLine ? 'drop dxf' : 'select slot'}
              </Text>
            </PatternDropZone>
          )}
        </FuseField>
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

/** ZONE: the clipped area, all corners sharp / round, undo, back to the rectangle. */
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
  const canUndo = bus.canUndo(ci);
  const write = (zone: PieceFuseSpec['zone']) => {
    bus.push(ci, spec.zone);
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
  return (
    <FuseField
      label='zone'
      error={drawn && area === null}
      door={
        <Text size='micro' component='span' data-zone-area={area ?? ''}>
          {area != null ? `${Math.round(area)} cm²` : <EmptyCell />}
        </Text>
      }
    >
      <div className='grid grid-cols-2 gap-1'>
        {chip('sharp', drawn && allCorners(spec.zone, true), !drawn, () =>
          write(withCorners(spec.zone, true)),
        )}
        {chip('round', drawn && allCorners(spec.zone, false), !drawn, () =>
          write(withCorners(spec.zone, false)),
        )}
        {chip('undo', false, !canUndo, () => {
          const prev = bus.pop(ci);
          if (prev) onChange({ ...spec, zone: prev.zone });
        })}
        {chip('reset', false, !drawn, () => write(resetZone(spec.zone)))}
      </div>
    </FuseField>
  );
}
