import {
  common_ProductionMarkerSource,
  common_ProductionRun,
  common_ProductionRunMarker,
  common_TechCardFabricDirection,
} from 'api/proto-http/admin';
import { MaterialPicker } from 'components/managers/materials/components/material-picker';
import { useTechCard } from 'components/managers/tech-cards/components/useTechCardQuery';
import { findInDictionary } from 'lib/features/findInDictionary';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useMemo, useState } from 'react';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { decimalToInput, inputToDecimal, sanitizeDecimal } from 'utils/decimal';
import { updateRunErrorMessage, useUpdateRunSection } from './useProductionRuns';

const cell = 'w-full border border-textInactiveColor bg-bgColor px-2 py-1.5 text-textBaseSize';

// Nesting-marker CAD source (gap-07 v2 E). Default new markers to MANUAL; UNKNOWN is never offered.
const MARKER_SOURCES: { value: common_ProductionMarkerSource; label: string }[] = [
  { value: 'PRODUCTION_MARKER_SOURCE_MANUAL', label: 'manual' },
  { value: 'PRODUCTION_MARKER_SOURCE_GERBER', label: 'gerber' },
  { value: 'PRODUCTION_MARKER_SOURCE_OPTITEX', label: 'optitex' },
  { value: 'PRODUCTION_MARKER_SOURCE_LECTRA', label: 'lectra' },
  { value: 'PRODUCTION_MARKER_SOURCE_AUDACES', label: 'audaces' },
  { value: 'PRODUCTION_MARKER_SOURCE_OTHER', label: 'other' },
];

type MarkerDraft = {
  source: common_ProductionMarkerSource;
  markerName: string;
  sizeId: number;
  materialId: number;
  markerWidth: string;
  layLength: string;
  unitsPerMarker: string;
  efficiencyPct: string;
  markerFileUrl: string;
  notes: string;
};

const markerDraftFrom = (m: common_ProductionRunMarker): MarkerDraft => ({
  source: m.source ?? 'PRODUCTION_MARKER_SOURCE_MANUAL',
  markerName: m.markerName ?? '',
  sizeId: m.sizeId ?? 0,
  materialId: m.materialId ?? 0,
  markerWidth: decimalToInput(m.markerWidth),
  layLength: decimalToInput(m.layLength),
  unitsPerMarker: m.unitsPerMarker ? String(m.unitsPerMarker) : '',
  efficiencyPct: decimalToInput(m.efficiencyPct),
  markerFileUrl: m.markerFileUrl ?? '',
  notes: m.notes ?? '',
});

const emptyMarker: MarkerDraft = {
  source: 'PRODUCTION_MARKER_SOURCE_MANUAL',
  markerName: '',
  sizeId: 0,
  materialId: 0,
  markerWidth: '',
  layLength: '',
  unitsPerMarker: '',
  efficiencyPct: '',
  markerFileUrl: '',
  notes: '',
};

const directionLabel = (d?: common_TechCardFabricDirection): string => {
  switch (d) {
    case 'TECH_CARD_FABRIC_DIRECTION_ANY':
      return 'any (no nap)';
    case 'TECH_CARD_FABRIC_DIRECTION_ONE_WAY':
      return 'one-way';
    case 'TECH_CARD_FABRIC_DIRECTION_TWO_WAY':
      return 'two-way';
    default:
      return '—';
  }
};

// The fabric sections whose width / nap the marker (раскладка) software needs.
const FABRIC_SECTIONS = new Set([
  'TECH_CARD_BOM_SECTION_FABRIC',
  'TECH_CARD_BOM_SECTION_LINING',
  'TECH_CARD_BOM_SECTION_INTERLINING',
  'TECH_CARD_BOM_SECTION_INSULATION',
]);

// Marker / раскладка parameters (NF-06): fabric utilisation % + free notes, saved via
// read-modify-write. The efficiency figure comes from the external nesting software; alongside it
// we surface the fabric geometry (width / nap / wastage) from the card's BOM as read-only
// reference, because that's the input that software needs.
export function MarkerBlock({
  run,
  canEdit,
  locked,
}: {
  run: common_ProductionRun;
  canEdit: boolean;
  locked: boolean;
}) {
  const { showMessage } = useSnackBarStore();
  const { dictionary } = useDictionary();
  const update = useUpdateRunSection();
  const editable = canEdit && !locked;

  const { data: techCard } = useTechCard(run.run?.techCardId ? run.run.techCardId : undefined);
  const fabrics = useMemo(
    () => (techCard?.techCard?.bomItems ?? []).filter((b) => FABRIC_SECTIONS.has(b.section ?? '')),
    [techCard],
  );
  const sizeIds = techCard?.techCard?.sizeIds ?? [];

  const [efficiency, setEfficiency] = useState('');
  const [notes, setNotes] = useState('');
  // The structured nesting markers (gap-07 v2 E) — planning/traceability only, they don't feed cost.
  const [markers, setMarkers] = useState<MarkerDraft[]>([]);
  // Sibling saves refetch the run — don't let that resync wipe an in-progress draft.
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (dirty) return;
    setEfficiency(decimalToInput(run.run?.markerEfficiencyPct));
    setNotes(run.run?.markerNotes ?? '');
    setMarkers((run.run?.markers ?? []).map(markerDraftFrom));
  }, [run, dirty]);

  const patchMarker = (i: number, p: Partial<MarkerDraft>) => {
    setDirty(true);
    setMarkers((prev) => prev.map((m, idx) => (idx === i ? { ...m, ...p } : m)));
  };
  const addMarker = () => {
    setDirty(true);
    setMarkers((prev) => [...prev, { ...emptyMarker }]);
  };
  const removeMarker = (i: number) => {
    setDirty(true);
    setMarkers((prev) => prev.filter((_, idx) => idx !== i));
  };

  const save = async () => {
    const outMarkers: common_ProductionRunMarker[] = markers.map((m) => ({
      source: m.source,
      markerName: m.markerName.trim(),
      sizeId: m.sizeId || 0,
      materialId: m.materialId || 0,
      markerWidth: inputToDecimal(m.markerWidth),
      layLength: inputToDecimal(m.layLength),
      unitsPerMarker: Number(m.unitsPerMarker) || 0,
      efficiencyPct: inputToDecimal(m.efficiencyPct),
      markerFileUrl: m.markerFileUrl.trim(),
      notes: m.notes.trim(),
    }));
    try {
      await update.mutateAsync({
        id: run.id!,
        patch: {
          markerEfficiencyPct: inputToDecimal(efficiency),
          markerNotes: notes.trim(),
          markers: outMarkers,
        },
      });
      setDirty(false);
      showMessage('Marker saved', 'success');
    } catch (e) {
      showMessage(updateRunErrorMessage(e), 'error');
    }
  };

  return (
    <div className='flex flex-col gap-3 border-t border-textInactiveColor pt-4'>
      <div className='flex items-center justify-between'>
        <Text variant='uppercase' size='small'>
          marker / раскладка
          {dirty ? <span className='ml-2 lowercase text-labelColor'>· unsaved</span> : null}
        </Text>
        {editable && (
          <Button
            type='button'
            variant='main'
            size='lg'
            className='uppercase'
            disabled={update.isPending}
            onClick={save}
          >
            {update.isPending ? 'saving…' : 'save marker'}
          </Button>
        )}
      </div>

      <div className='grid grid-cols-1 gap-3 sm:grid-cols-[10rem_1fr]'>
        <label className='flex flex-col gap-1'>
          <Text size='small'>efficiency %</Text>
          <input
            className={cell}
            inputMode='decimal'
            disabled={!editable}
            placeholder='fabric utilisation'
            value={efficiency}
            onChange={(e) => {
              setDirty(true);
              setEfficiency(sanitizeDecimal(e.target.value));
            }}
          />
        </label>
        <label className='flex flex-col gap-1'>
          <Text size='small'>notes (width / lay / marker params)</Text>
          <input
            className={cell}
            disabled={!editable}
            value={notes}
            onChange={(e) => {
              setDirty(true);
              setNotes(e.target.value);
            }}
          />
        </label>
      </div>

      <div className='flex flex-col gap-2'>
        <div className='flex items-center justify-between'>
          <Text variant='inactive' size='small'>
            nesting markers (раскладки) — from the CAD/nesting software; for planning &
            traceability, not costing
          </Text>
          {editable && (
            <Button
              type='button'
              variant='secondary'
              size='lg'
              className='uppercase'
              onClick={addMarker}
            >
              + marker
            </Button>
          )}
        </div>
        {markers.map((m, i) => (
          <div key={i} className='flex flex-col gap-2 border border-textInactiveColor p-2'>
            <div className='flex items-center justify-between'>
              <Text variant='uppercase' size='small'>
                marker {i + 1}
              </Text>
              {editable && (
                <Button
                  type='button'
                  variant='secondary'
                  aria-label='remove marker'
                  onClick={() => removeMarker(i)}
                >
                  ✕
                </Button>
              )}
            </div>
            <div className='grid grid-cols-2 gap-2 sm:grid-cols-4'>
              <label className='flex flex-col gap-1'>
                <Text size='small'>source</Text>
                <select
                  className={cell}
                  disabled={!editable}
                  value={m.source}
                  onChange={(e) =>
                    patchMarker(i, { source: e.target.value as common_ProductionMarkerSource })
                  }
                >
                  {MARKER_SOURCES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className='flex flex-col gap-1'>
                <Text size='small'>name</Text>
                <input
                  className={cell}
                  disabled={!editable}
                  value={m.markerName}
                  onChange={(e) => patchMarker(i, { markerName: e.target.value })}
                />
              </label>
              <label className='flex flex-col gap-1'>
                <Text size='small'>size</Text>
                <select
                  className={cell}
                  disabled={!editable}
                  value={m.sizeId || 0}
                  onChange={(e) => patchMarker(i, { sizeId: Number(e.target.value) || 0 })}
                >
                  <option value={0}>— all sizes —</option>
                  {sizeIds.map((sid) => (
                    <option key={sid} value={sid}>
                      {findInDictionary(dictionary, sid, 'size') || sid}
                    </option>
                  ))}
                </select>
              </label>
              <label className='flex flex-col gap-1'>
                <Text size='small'>units / marker</Text>
                <input
                  className={cell}
                  inputMode='numeric'
                  disabled={!editable}
                  value={m.unitsPerMarker}
                  onChange={(e) =>
                    patchMarker(i, { unitsPerMarker: e.target.value.replace(/[^0-9]/g, '') })
                  }
                />
              </label>
            </div>
            <div className='grid grid-cols-2 gap-2 sm:grid-cols-3'>
              <label className='flex flex-col gap-1'>
                <Text size='small'>marker width</Text>
                <input
                  className={cell}
                  inputMode='decimal'
                  disabled={!editable}
                  value={m.markerWidth}
                  onChange={(e) => patchMarker(i, { markerWidth: sanitizeDecimal(e.target.value) })}
                />
              </label>
              <label className='flex flex-col gap-1'>
                <Text size='small'>lay length</Text>
                <input
                  className={cell}
                  inputMode='decimal'
                  disabled={!editable}
                  value={m.layLength}
                  onChange={(e) => patchMarker(i, { layLength: sanitizeDecimal(e.target.value) })}
                />
              </label>
              <label className='flex flex-col gap-1'>
                <Text size='small'>efficiency %</Text>
                <input
                  className={cell}
                  inputMode='decimal'
                  disabled={!editable}
                  value={m.efficiencyPct}
                  onChange={(e) =>
                    patchMarker(i, { efficiencyPct: sanitizeDecimal(e.target.value) })
                  }
                />
              </label>
            </div>
            <label className='flex flex-col gap-1'>
              <Text size='small'>material</Text>
              <MaterialPicker
                value={m.materialId}
                disabled={!editable}
                onChange={(materialId) => patchMarker(i, { materialId })}
              />
            </label>
            <div className='grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr]'>
              <label className='flex flex-col gap-1'>
                <Text size='small'>marker file url</Text>
                <input
                  className={cell}
                  disabled={!editable}
                  value={m.markerFileUrl}
                  onChange={(e) => patchMarker(i, { markerFileUrl: e.target.value })}
                />
              </label>
              <label className='flex flex-col gap-1'>
                <Text size='small'>notes</Text>
                <input
                  className={cell}
                  disabled={!editable}
                  value={m.notes}
                  onChange={(e) => patchMarker(i, { notes: e.target.value })}
                />
              </label>
            </div>
          </div>
        ))}
      </div>

      {fabrics.length > 0 ? (
        <div className='flex flex-col gap-1'>
          <Text variant='inactive' size='small'>
            fabric reference (from tech card BOM)
          </Text>
          <div className='overflow-x-auto'>
            <table className='border-collapse'>
              <thead>
                <tr>
                  <th className={`${cell} text-left uppercase`}>fabric</th>
                  <th className={`${cell} text-right uppercase`}>width (cm)</th>
                  <th className={`${cell} text-left uppercase`}>nap</th>
                  <th className={`${cell} text-right uppercase`}>wastage %</th>
                </tr>
              </thead>
              <tbody>
                {fabrics.map((b, i) => (
                  <tr key={i}>
                    <td className={cell}>{b.name}</td>
                    <td className={`${cell} text-right`}>{decimalToInput(b.fabricWidth) || '—'}</td>
                    <td className={cell}>{directionLabel(b.fabricDirection)}</td>
                    <td className={`${cell} text-right`}>
                      {decimalToInput(b.wastagePercent) || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
