import { common_TechCard } from 'api/proto-http/admin';
import { MaterialPicker } from 'components/managers/materials/components/material-picker';
import { useMaterials } from 'components/managers/materials/components/useMaterials';
import { useSnackBarStore } from 'lib/stores/store';
import { useMemo, useState } from 'react';
import { Button } from 'ui/components/button';
import { EmptyCell } from 'ui/components/data-table';
import { Row } from 'ui/components/row';
import Text from 'ui/components/text';
import { decimalToInput, inputToDecimal, sanitizeDecimal } from 'utils/decimal';
import { fieldErrorSummary } from 'utils/field-errors';
import { Field, selectCell } from './sample-panels';
import {
  useAddSampleSubstitution,
  useDeleteSampleSubstitution,
  useSampleSubstitutions,
} from './useSamples';

// Sample substitutions (§2.7): a dev-time deviation from the spec BOM — a line sewn with a different
// material. Documentation only (Q2: never COGS; the authoritative spend stays in the stock ledger +
// the BOM plan). Pick the BOM line, see its original (spec) material, record what was used instead.
//
// DELIBERATE — this panel does NOT stage into the card's one save (phase 19, same reasoning as
// roles-field and the dev-expense ledger). Substitutions are an append-only record of what actually
// happened at the machine, not a draft of the sample: the boxed form below is a composer, "+ add
// substitution" IS the commit, and the row it writes appears immediately in the SUBSTITUTIONS
// summary the sample editor keeps visible. Staging it would leave "add" doing nothing until the
// operator found the header save — and each row is one indivisible fact, so there is no dirty state
// to accumulate anyway. The parent sample's FIELDS are a draft form and do stage; this list does
// not. Do not "fix" it into the staged model.

// Shared naming so the always-visible rows and the editor read a substitution identically.
function useSubstitutionNaming(techCard?: common_TechCard) {
  const { data: materialsData } = useMaterials('', true);
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
  return { bomItems, materialName, bomName };
}

/**
 * The SUBSTITUTIONS area's always-visible rows (10.3): you can SEE there are two
 * substitutions without expanding anything.
 */
export function SubstitutionRows({
  sampleId,
  techCard,
}: {
  sampleId: number;
  techCard?: common_TechCard;
}) {
  const { data } = useSampleSubstitutions(sampleId);
  const { materialName, bomName } = useSubstitutionNaming(techCard);
  const substitutions = data?.substitutions ?? [];

  if (!substitutions.length) {
    return <Row label='sewn exactly to the spec BOM' tone='label' value={<EmptyCell />} />;
  }
  return (
    <>
      {substitutions.map((s) => (
        <Row
          key={s.id}
          label={`${bomName(s.bomItemId)}: ${materialName(s.originalMaterialId)} → ${materialName(
            s.substitutedMaterialId,
          )}`}
          value={decimalToInput(s.actualQty) || decimalToInput(s.plannedQty) || <EmptyCell />}
        />
      ))}
    </>
  );
}

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
  const { bomItems, materialName, bomName } = useSubstitutionNaming(techCard);

  const substitutions = data?.substitutions ?? [];

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
      <Text size='micro' variant='label'>
        dev-time deviations from the spec BOM — documentation only, never COGS
      </Text>

      {substitutions.length > 0 && (
        <div className='flex flex-col'>
          {substitutions.map((s) => (
            <Row
              key={s.id}
              label={
                <span className='flex min-w-0 flex-col'>
                  <Text size='micro' className='font-bold uppercase'>
                    {bomName(s.bomItemId)}
                  </Text>
                  <Text size='micro'>
                    {materialName(s.originalMaterialId)}
                    <span className='px-1 text-labelColor'>→</span>
                    {materialName(s.substitutedMaterialId)}
                  </Text>
                  <Text size='nano' variant='label'>
                    {s.reason || 'no reason given'}
                    {s.plannedQty?.value ? ` · plan ${decimalToInput(s.plannedQty)}` : ''}
                    {s.actualQty?.value ? ` · actual ${decimalToInput(s.actualQty)}` : ''}
                  </Text>
                </span>
              }
              value={
                canEdit ? (
                  <Button
                    type='button'
                    variant='secondary'
                    size='xs'
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
                ) : undefined
              }
            />
          ))}
        </div>
      )}

      {canEdit && (
        <div className='flex flex-col gap-2 border border-borderColor p-2'>
          <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
            <Field
              label='BOM line (spec)'
              hint={
                bomItemId > 0 ? `spec material: ${materialName(originalMaterialId)}` : undefined
              }
            >
              <select
                className={selectCell}
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
            </Field>
            <Field label='material used instead'>
              <MaterialPicker
                value={substitutedMaterialId}
                onChange={(id) => setSubstitutedMaterialId(id)}
                includeArchived
                placeholder='search material'
              />
            </Field>
          </div>
          <div className='grid grid-cols-1 gap-2 sm:grid-cols-3'>
            <Field label='reason'>
              <input
                className={selectCell}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder='out of stock, trial…'
              />
            </Field>
            <Field label='planned qty'>
              <input
                className={selectCell}
                inputMode='decimal'
                value={plannedQty}
                onChange={(e) => setPlannedQty(sanitizeDecimal(e.target.value))}
              />
            </Field>
            <Field label='actual qty'>
              <input
                className={selectCell}
                inputMode='decimal'
                value={actualQty}
                onChange={(e) => setActualQty(sanitizeDecimal(e.target.value))}
              />
            </Field>
          </div>
          <div className='flex justify-end'>
            <Button
              type='button'
              variant='secondary'
              size='sm'
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
