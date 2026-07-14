import { common_ProductionRun, common_TechCardFabricDirection } from 'api/proto-http/admin';
import { useTechCard } from 'components/managers/tech-cards/components/useTechCardQuery';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useMemo, useState } from 'react';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { decimalToInput, inputToDecimal, sanitizeDecimal } from 'utils/decimal';
import { useUpdateRunSection } from './useProductionRuns';

const cell = 'w-full border border-textInactiveColor bg-bgColor px-2 py-1.5 text-textBaseSize';

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
  const update = useUpdateRunSection();
  const editable = canEdit && !locked;

  const { data: techCard } = useTechCard(run.run?.techCardId ? run.run.techCardId : undefined);
  const fabrics = useMemo(
    () => (techCard?.techCard?.bomItems ?? []).filter((b) => FABRIC_SECTIONS.has(b.section ?? '')),
    [techCard],
  );

  const [efficiency, setEfficiency] = useState('');
  const [notes, setNotes] = useState('');
  // Sibling saves refetch the run — don't let that resync wipe an in-progress draft.
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (dirty) return;
    setEfficiency(decimalToInput(run.run?.markerEfficiencyPct));
    setNotes(run.run?.markerNotes ?? '');
  }, [run, dirty]);

  const save = async () => {
    try {
      await update.mutateAsync({
        id: run.id!,
        patch: {
          markerEfficiencyPct: inputToDecimal(efficiency),
          markerNotes: notes.trim(),
        },
      });
      setDirty(false);
      showMessage('Marker saved', 'success');
    } catch (e) {
      showMessage(e instanceof Error ? e.message : 'Failed to save marker', 'error');
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
