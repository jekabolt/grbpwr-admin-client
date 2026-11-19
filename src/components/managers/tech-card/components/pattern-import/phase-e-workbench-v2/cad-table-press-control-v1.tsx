import { useEffect, useRef, useState } from 'react';
import { Button, Select, Text } from 'ui';

import { PRESS_EQUIPMENT_LABELS } from '../../equipment-options';
import { PRESS_ACTION_LABELS } from '../../operation-options';
import {
  PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_PRESS_ACTIONS_V1,
  PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_PRESS_EQUIPMENT_V1,
  type PatternImportDxfPhaseECadTablePressActionV1,
  type PatternImportDxfPhaseECadTablePressAuthoringResultV1,
  type PatternImportDxfPhaseECadTablePressEquipmentV1,
} from './cad-table-press-authoring-v1';

export type CreateCadTablePressDraftV1 = (
  selectedPieceIds: readonly string[],
  pressAction: PatternImportDxfPhaseECadTablePressActionV1,
  pressEquipment: PatternImportDxfPhaseECadTablePressEquipmentV1,
) => PatternImportDxfPhaseECadTablePressAuthoringResultV1;

export function CadTablePressControlV1({
  selectedPieceIds,
  disabled = false,
  visible = true,
  onCreateDraft,
}: Readonly<{
  selectedPieceIds: readonly string[];
  disabled?: boolean;
  visible?: boolean;
  onCreateDraft: CreateCadTablePressDraftV1;
}>) {
  const [action, setAction] = useState<PatternImportDxfPhaseECadTablePressActionV1 | ''>('');
  const [equipment, setEquipment] = useState<PatternImportDxfPhaseECadTablePressEquipmentV1 | ''>(
    '',
  );
  const [result, setResult] = useState<PatternImportDxfPhaseECadTablePressAuthoringResultV1 | null>(
    null,
  );
  const submitLocked = useRef(false);
  const selectedPieceIdentity = selectedPieceIds.join('\u0000');
  useEffect(() => {
    submitLocked.current = false;
    setResult(null);
  }, [selectedPieceIdentity]);

  if (!visible) return null;
  return (
    <div
      className='flex min-w-0 flex-wrap items-center gap-1 border-l border-hairline pl-2'
      data-cad-contextual-press-authoring=''
    >
      <Text component='span' size='micro' className='whitespace-nowrap font-bold'>
        Press · {selectedPieceIds.length}
      </Text>
      <Select
        name='cad-contextual-press-action'
        size='sm'
        value={action}
        placeholder='action'
        items={PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_PRESS_ACTIONS_V1.map((value) => ({
          value,
          label: PRESS_ACTION_LABELS[value],
        }))}
        onValueChange={(value) => {
          const choice = PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_PRESS_ACTIONS_V1.find(
            (action) => action === value,
          );
          if (!choice) return;
          submitLocked.current = false;
          setAction(choice);
          setResult(null);
        }}
        readOnly={disabled}
      />
      <Select
        name='cad-contextual-press-equipment'
        size='sm'
        value={equipment}
        placeholder='equipment'
        items={PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_PRESS_EQUIPMENT_V1.map((value) => ({
          value,
          label: PRESS_EQUIPMENT_LABELS[value],
        }))}
        onValueChange={(value) => {
          const choice = PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_PRESS_EQUIPMENT_V1.find(
            (equipment) => equipment === value,
          );
          if (!choice) return;
          submitLocked.current = false;
          setEquipment(choice);
          setResult(null);
        }}
        readOnly={disabled}
      />
      <Button
        type='button'
        size='xs'
        variant='main'
        disabled={disabled || !action || !equipment || Boolean(result?.ok)}
        onClick={() => {
          if (disabled || submitLocked.current || !action || !equipment) return;
          submitLocked.current = true;
          const outcome = onCreateDraft(selectedPieceIds, action, equipment);
          if (!outcome.ok) submitLocked.current = false;
          setResult(outcome);
        }}
      >
        Add draft
      </Button>
      {result ? (
        <Text
          component='span'
          size='micro'
          variant={result.ok ? 'label' : 'errorLabel'}
          role='status'
          data-cad-contextual-press-result={result.ok ? 'inserted' : 'refused'}
        >
          {result.ok ? 'draft added' : result.blocker.detail}
        </Text>
      ) : null}
    </div>
  );
}
