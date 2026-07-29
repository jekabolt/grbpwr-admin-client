import { useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { Chip, ChipRow } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { GroupLabel } from 'ui/components/group-label';
import Input from 'ui/components/input';
import Text from 'ui/components/text';
import { FormLabel } from 'ui/form';

type SeasonType = { code: string; label: string; short: boolean };

// Every type here must fold to a real SeasonEnum in season-util's PREFIX_TO_ENUM, or the season
// silently reverts to blank on reload (there is no HOLIDAY enum, so "Holiday" is intentionally
// absent — see season-util.ts). SS/FW → SS/FW, Resort/Cruise → RC, Pre-Fall → PF.
const SEASON_TYPES: SeasonType[] = [
  { code: 'SS', label: 'Spring / Summer', short: true },
  { code: 'FW', label: 'Fall / Winter', short: true },
  { code: 'Resort', label: 'Resort', short: false },
  { code: 'Pre-Fall', label: 'Pre-Fall', short: false },
  { code: 'Cruise', label: 'Cruise', short: false },
];

// "SS25" for the short codes, "Resort 25" for the worded ones.
function buildSeason(t: SeasonType, year: number): string {
  const yy = String(year).slice(-2);
  return t.short ? `${t.code}${yy}` : `${t.code} ${yy}`;
}

// Season field with a two-step picker (type → year), plus manual entry. Writes a string like
// "SS25" / "Resort 25" into the given form field.
//
// The picker used to hand-roll its own `fixed inset-0 bg-black/60` backdrop — the one dialog in the
// app that did. It now rides the shared modal shell, so it dims, stacks, closes on outside-click
// and traps focus exactly like every other dialog. The two-step flow itself is unchanged.
export function SeasonField({ name = 'season' }: { name?: string }) {
  const { setValue } = useFormContext();
  const value = (useWatch({ name }) as string) || '';
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<SeasonType | null>(null);
  const [manual, setManual] = useState('');

  const thisYear = new Date().getFullYear();
  const years = [thisYear - 1, thisYear, thisYear + 1, thisYear + 2];

  const reset = () => {
    setType(null);
    setManual('');
  };
  const commit = (v: string) => {
    setValue(name, v.trim(), { shouldDirty: true });
    setOpen(false);
    reset();
  };

  return (
    <div className='space-y-px'>
      <FormLabel>season</FormLabel>
      <div className='flex items-center gap-1.5'>
        <Input value={value} readOnly placeholder='— сезон —' className='flex-1' />
        <Button
          type='button'
          variant='secondary'
          size='sm'
          className='shrink-0'
          onClick={() => {
            setManual(value);
            setOpen(true);
          }}
        >
          выбрать
        </Button>
      </div>

      <ConfirmationModal
        open={open}
        width='sm'
        title='выбор сезона'
        confirmLabel='ок'
        cancelLabel='отмена'
        // The chip path commits on the year click; the footer commits whatever is typed by hand.
        confirmDisabled={!manual.trim()}
        onConfirm={() => commit(manual)}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) reset();
        }}
      >
        <GroupLabel flush>1 · тип</GroupLabel>
        <ChipRow>
          {SEASON_TYPES.map((t) => (
            <Chip
              key={t.code}
              title={t.label}
              selected={type?.code === t.code}
              pressed={type?.code === t.code}
              onClick={() => setType(t)}
            >
              {t.code}
            </Chip>
          ))}
        </ChipRow>

        <GroupLabel>2 · год</GroupLabel>
        <ChipRow>
          {years.map((y) => (
            <Chip
              key={y}
              disabled={!type}
              title={type ? buildSeason(type, y) : 'сначала выберите тип'}
              onClick={() => type && commit(buildSeason(type, y))}
            >
              {y}
            </Chip>
          ))}
        </ChipRow>

        <GroupLabel>или вручную</GroupLabel>
        <Input
          name='season-manual'
          value={manual}
          autoComplete='off'
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setManual(e.target.value)}
          placeholder='SS25'
        />
        <Text size='micro' variant='label' className='mt-1'>
          тип + год пишет сезон сразу; «ок» сохраняет то, что вписано вручную
        </Text>
      </ConfirmationModal>
    </div>
  );
}
