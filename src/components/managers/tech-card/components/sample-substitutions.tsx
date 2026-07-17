import { common_TechCard } from 'api/proto-http/admin';
import { MaterialPicker } from 'components/managers/materials/components/material-picker';
import { useMaterials } from 'components/managers/materials/components/useMaterials';
import { useSnackBarStore } from 'lib/stores/store';
import { useMemo, useState } from 'react';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { decimalToInput, inputToDecimal, sanitizeDecimal } from 'utils/decimal';
import { fieldErrorSummary } from 'utils/field-errors';
import {
  useAddSampleSubstitution,
  useDeleteSampleSubstitution,
  useSampleSubstitutions,
} from './useSamples';

const cell = 'w-full border border-textInactiveColor bg-bgColor px-2 py-1.5 text-textBaseSize';

// Sample substitutions (§2.7): a dev-time deviation from the spec BOM — a line sewn with a different
// material. Documentation only (Q2: never COGS; the authoritative spend stays in the stock ledger +
// the BOM plan). Pick the BOM line, see its original (spec) material, record what was used instead.
export function SampleSubstitutions({
  sampleId,
  techCard,
  canEdit,
}: {
  sampleId: number;
  techCard?: common_TechCard;
  canEdit: boolean;
}) {
  const { showMessage } = useSnackBarStore();
  const { data } = useSampleSubstitutions(sampleId);
  const add = useAddSampleSubstitution(sampleId);
  const del = useDeleteSampleSubstitution(sampleId);
  const { data: materialsData } = useMaterials('', true);

  const substitutions = data?.substitutions ?? [];
  const bomItems = useMemo(
    () => (techCard?.techCard?.bomItems ?? []).filter((b) => (b.id ?? 0) > 0),
    [techCard],
  );
  const materialName = (id?: number) =>
    id ? materialsData?.materials?.find((m) => m.id === id)?.name || `#${id}` : '—';
  const bomName = (id?: number) => {
    const b = bomItems.find((x) => x.id === id);
    return b?.name?.trim() || (id ? `#${id}` : '—');
  };

  const [bomItemId, setBomItemId] = useState(0);
  const [substitutedMaterialId, setSubstitutedMaterialId] = useState(0);
  const [reason, setReason] = useState('');
  const [plannedQty, setPlannedQty] = useState('');
  const [actualQty, setActualQty] = useState('');

  // The spec (original) material is the one linked on the chosen BOM line — shown as a snapshot.
  const originalMaterialId = bomItems.find((b) => b.id === bomItemId)?.materialId || 0;

  const reset = () => {
    setBomItemId(0);
    setSubstitutedMaterialId(0);
    setReason('');
    setPlannedQty('');
    setActualQty('');
  };

  const submit = () => {
    if (!bomItemId || !substitutedMaterialId) {
      showMessage('Pick a BOM line and the material used instead', 'error');
      return;
    }
    add.mutate(
      {
        sampleId,
        bomItemId,
        originalMaterialId,
        substitutedMaterialId,
        reason: reason.trim(),
        plannedQty: inputToDecimal(plannedQty),
        actualQty: inputToDecimal(actualQty),
      },
      {
        onSuccess: () => {
          showMessage('Substitution added', 'success');
          reset();
        },
        onError: (e) => showMessage(fieldErrorSummary(e, 'Failed to add substitution'), 'error'),
      },
    );
  };

  return (
    <div className='flex flex-col gap-2'>
      <Text variant='uppercase' size='small'>
        substitutions — deviations from the spec BOM
        {substitutions.length ? ` (${substitutions.length})` : ''}
      </Text>
      <Text variant='inactive' size='small'>
        Read-only overview of what changed from the plan, plus editable entries below. Documentation
        only — never counted as COGS (Q2); the real spend stays in the stock ledger.
      </Text>

      {substitutions.length === 0 ? (
        <Text variant='inactive' size='small'>
          no substitutions — this sample was sewn exactly to the spec BOM
        </Text>
      ) : (
        <div className='flex flex-col gap-1'>
          {substitutions.map((s) => (
            <div
              key={s.id}
              className='flex flex-wrap items-start justify-between gap-2 border border-textInactiveColor p-2'
            >
              <div className='flex flex-col gap-0.5'>
                <Text size='small' className='font-semibold uppercase'>
                  {bomName(s.bomItemId)}
                </Text>
                <Text size='small'>
                  {materialName(s.originalMaterialId)}
                  <span className='px-1 text-textInactiveColor'>→</span>
                  {materialName(s.substitutedMaterialId)}
                </Text>
                <Text variant='inactive' size='small'>
                  {s.reason || 'no reason given'}
                  {s.plannedQty?.value ? ` · plan ${decimalToInput(s.plannedQty)}` : ''}
                  {s.actualQty?.value ? ` · actual ${decimalToInput(s.actualQty)}` : ''}
                </Text>
              </div>
              {canEdit && (
                <Button
                  type='button'
                  variant='secondary'
                  aria-label='remove substitution'
                  onClick={() =>
                    s.id &&
                    del.mutate(s.id, {
                      onSuccess: () => showMessage('Substitution removed', 'success'),
                      onError: (e) => showMessage(fieldErrorSummary(e, 'Failed'), 'error'),
                    })
                  }
                >
                  ✕
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {canEdit && (
        <div className='flex flex-col gap-2 border border-textInactiveColor p-2'>
          <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
            <label className='flex flex-col gap-1'>
              <Text size='small'>BOM line (spec)</Text>
              <select
                className={cell}
                value={bomItemId || 0}
                onChange={(e) => setBomItemId(Number(e.target.value) || 0)}
              >
                <option value={0}>— select BOM line —</option>
                {bomItems.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name?.trim() || `#${b.id}`}
                  </option>
                ))}
              </select>
              {bomItemId > 0 && (
                <Text variant='inactive' size='small'>
                  spec material: {materialName(originalMaterialId)}
                </Text>
              )}
            </label>
            <label className='flex flex-col gap-1'>
              <Text size='small'>material used instead</Text>
              <MaterialPicker
                value={substitutedMaterialId}
                onChange={(id) => setSubstitutedMaterialId(id)}
                includeArchived
                placeholder='search material'
              />
            </label>
          </div>
          <div className='grid grid-cols-1 gap-2 sm:grid-cols-3'>
            <label className='flex flex-col gap-1'>
              <Text size='small'>reason</Text>
              <input
                className={cell}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder='out of stock, trial…'
              />
            </label>
            <label className='flex flex-col gap-1'>
              <Text size='small'>planned qty</Text>
              <input
                className={cell}
                inputMode='decimal'
                value={plannedQty}
                onChange={(e) => setPlannedQty(sanitizeDecimal(e.target.value))}
              />
            </label>
            <label className='flex flex-col gap-1'>
              <Text size='small'>actual qty</Text>
              <input
                className={cell}
                inputMode='decimal'
                value={actualQty}
                onChange={(e) => setActualQty(sanitizeDecimal(e.target.value))}
              />
            </label>
          </div>
          <div className='flex justify-end'>
            <Button
              type='button'
              variant='secondary'
              size='lg'
              className='uppercase'
              disabled={add.isPending}
              onClick={submit}
            >
              {add.isPending ? 'adding…' : '+ add substitution'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
