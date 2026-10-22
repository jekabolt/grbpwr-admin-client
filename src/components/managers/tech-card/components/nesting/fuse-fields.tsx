// The fuse fields of the piece panel, variant «Fold» (owner OK 2026-10-22): FUSING no / whole /
// strip / zone with `⋯` in the door; INTERLINING (always shown, prefilled when the BOM has one);
// WIDTH MM for a strip; `⋯` opens INSET MM / FUSIBLE GRAIN / DARTS in place, and opens by itself
// when any of them is off its default. Desktop: in the panel. Phone: docked above the footer.
import { useState } from 'react';
import { Button, Chip, Combobox, DotsHorizontalIcon, Select, Text, type ComboboxGroup } from 'ui';
import {
  DART_ITEMS,
  DEFAULT_INSET_MM,
  FUSE_GRAIN_ITEMS,
  INSET_PRESETS,
  WIDTH_PRESETS,
  blankFuse,
  fuseIncomplete,
  fuseLineOf,
  fuseOffDefault,
  isMmText,
  mmOfText,
  type FuseDarts,
  type FuseGrain,
  type FuseMode,
  type PieceFuseSpec,
} from './fuse-spec';

export type InterliningLine = { key: string; label: string; color: string };

const MODES: [FuseMode, string][] = [
  ['', 'no'],
  ['whole', 'whole'],
  ['strip', 'strip'],
  ['zone', 'zone'],
];

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
}: {
  spec: PieceFuseSpec;
  /** The stored `fused` — true with no mode is the legacy «fused, how not said». */
  fused: boolean;
  lines: readonly InterliningLine[];
  readOnly: boolean;
  /** The panel's toggle box class (one height for every control in the panel). */
  toggleBox: string;
  onChange: (next: PieceFuseSpec) => void;
}) {
  const on = spec.mode !== '';
  const [more, setMore] = useState(() => fuseOffDefault(spec));
  const lineKeys = lines.map((l) => l.key);
  const line = fuseLineOf(spec, lineKeys);
  const cur: FuseMode | null = !fused ? '' : spec.mode || null;
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
        <div className='grid grid-cols-4 gap-1'>
          {MODES.map(([m, l]) => (
            <Chip
              key={m || 'no'}
              className={`${toggleBox} ${cur === m && m && fuseIncomplete(spec) ? 'border-error' : ''}`}
              selected={cur === m}
              pressed={cur === m}
              disabled={readOnly}
              aria-label={l}
              onClick={() => setMode(m)}
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
              items={lines.map((l) => ({
                value: l.key,
                label: (
                  <span className='flex min-w-0 items-center gap-1.5'>
                    <Swatch color={l.color} />
                    <span className='truncate'>{l.label}</span>
                  </span>
                ),
              }))}
              value={line}
              readOnly={readOnly}
              invalid={!line}
              onValueChange={(x: string) => set({ bomLineKey: x })}
            />
          </FuseField>
          {spec.mode === 'strip' && (
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
