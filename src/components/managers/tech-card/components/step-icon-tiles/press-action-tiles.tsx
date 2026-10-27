import { useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Button, Text, Tiles } from 'ui';
import { WORK_ICON, type WorkToken } from '../../op-icons';
import type { TechCardFormData } from '../schema';
import { IconTile, TileRow, useStepFieldErrors } from './icon-tile';
import { useStepWrite } from './use-step-write';

type PressActionItem = { action: string; work: string; label: string };

const NO_PRESS_ACTION = 'TECH_CARD_PRESS_ACTION_UNKNOWN';

const COMMON: readonly PressActionItem[] = [
  { action: 'TECH_CARD_PRESS_ACTION_PRESS_FLAT', work: 'press_flat', label: 'flat' },
  { action: 'TECH_CARD_PRESS_ACTION_TO_ONE_SIDE', work: 'press_to_one_side', label: 'one side' },
  { action: 'TECH_CARD_PRESS_ACTION_STEAM', work: 'press_steam', label: 'steam' },
  { action: 'TECH_CARD_PRESS_ACTION_FINAL', work: 'press_final', label: 'final' },
];

const EXTRA: readonly PressActionItem[] = [
  { action: 'TECH_CARD_PRESS_ACTION_EASE_IN', work: 'press_ease_in', label: 'ease in' },
  { action: 'TECH_CARD_PRESS_ACTION_STRETCH', work: 'press_stretch', label: 'stretch' },
  { action: 'TECH_CARD_PRESS_ACTION_MOULD', work: 'press_mould', label: 'mould' },
  { action: 'TECH_CARD_PRESS_ACTION_OTHER', work: 'press_flat', label: 'other' },
];

const iconOf = (work: string) => ({ key: WORK_ICON[work as WorkToken] ?? 'press_flat' });

/** The unanswered PRESS kind's one quiz. It writes only the press-action field. */
export function PressActionTiles({ index }: { index: number }) {
  const { control } = useFormContext<TechCardFormData>();
  const write = useStepWrite(index);
  const action = (useWatch({ control, name: `operations.${index}.pressAction` }) ??
    NO_PRESS_ACTION) as string;
  const errors = useStepFieldErrors(index, ['pressAction']);
  const [moreOpen, setMoreOpen] = useState(false);
  const tile = (item: PressActionItem) => (
    <IconTile
      key={item.work}
      icon={iconOf(item.work)}
      label={item.label}
      selected={action === item.action}
      onClick={() => write('pressAction', action === item.action ? NO_PRESS_ACTION : item.action)}
    />
  );

  return (
    <TileRow field={`operations.${index}.pressAction`} errors={errors}>
      <Tiles min={72}>{COMMON.map(tile)}</Tiles>
      <Button
        type='button'
        variant='underline'
        size='xs'
        className='self-start'
        onClick={() => setMoreOpen((open) => !open)}
      >
        {moreOpen ? 'less' : 'more'}
      </Button>
      {moreOpen && (
        <div className='flex flex-col gap-1'>
          <Text size='micro' variant='label' tracking='label' className='uppercase'>
            shaping
          </Text>
          <Tiles min={72}>{EXTRA.map(tile)}</Tiles>
        </div>
      )}
    </TileRow>
  );
}
