import { useState } from 'react';
import { useFormContext, useFormState, useWatch } from 'react-hook-form';
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
export function SeasonField({
  name = 'season',
  pickHint,
}: {
  name?: string;
  /**
   * K-19 · Последствие смены сезона, сказанное ОРГАНОМ, а не абзацем на экране. Садится на
   * «pick», потому что это единственный писатель поля: сам Input readOnly, руками сезон здесь
   * не набирается. Необязательный: на новой карте перевыпускать нечего, и подсказка про SKU
   * уже существующих расцветок была бы враньём.
   */
  pickHint?: string;
}) {
  const { setValue } = useFormContext();
  const value = (useWatch({ name }) as string) || '';
  // The control is hand-rolled (a read-only Input + a picker), so it gets none of ui/form's error
  // plumbing for free: read the message and stamp the [data-field] anchor by hand, or a season the
  // schema rejects would block the save with nothing on screen to explain it.
  const { errors } = useFormState({ name });
  const error = (errors as Record<string, { message?: string } | undefined>)[name];
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
    <div className='space-y-px' data-field={name}>
      <FormLabel>season</FormLabel>
      <div className='flex items-center gap-1.5'>
        <Input
          value={value}
          readOnly
          placeholder='— season —'
          className='flex-1'
          aria-invalid={!!error}
        />
        <Button
          type='button'
          variant='secondary'
          size='sm'
          className='shrink-0'
          title={pickHint}
          onClick={() => {
            setManual(value);
            setOpen(true);
          }}
        >
          pick
        </Button>
      </div>
      {error?.message && (
        <Text size='micro' variant='error'>
          {error.message}
        </Text>
      )}

      <ConfirmationModal
        open={open}
        width='sm'
        title='pick a season'
        confirmLabel='ok'
        cancelLabel='cancel'
        // The chip path commits on the year click; the footer commits whatever is typed by hand.
        confirmDisabled={!manual.trim()}
        onConfirm={() => commit(manual)}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) reset();
        }}
      >
        <GroupLabel flush>1 · type</GroupLabel>
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

        <GroupLabel>2 · year</GroupLabel>
        <ChipRow>
          {years.map((y) => (
            <Chip
              key={y}
              disabled={!type}
              title={type ? buildSeason(type, y) : 'pick a type first'}
              onClick={() => type && commit(buildSeason(type, y))}
            >
              {y}
            </Chip>
          ))}
        </ChipRow>

        <GroupLabel>or by hand</GroupLabel>
        <Input
          name='season-manual'
          value={manual}
          autoComplete='off'
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setManual(e.target.value)}
          placeholder='SS25'
        />
        <Text size='micro' variant='label' className='mt-1'>
          type + year writes the season straight away; “ok” saves whatever is typed by hand
        </Text>
      </ConfirmationModal>
    </div>
  );
}
