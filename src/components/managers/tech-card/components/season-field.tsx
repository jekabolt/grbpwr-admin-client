import type { common_SkuSeason } from 'api/proto-http/admin';
import { useState } from 'react';
import { useFormContext, useFormState, useWatch } from 'react-hook-form';
import { Button, Chip, ChipRow, Input, Text, FormLabel } from 'ui';

import { parseSeasonToSku } from './season-util';

export type SeasonType = { code: string; label: string; short: boolean };

// Every type here must fold to a real SeasonEnum in season-util's PREFIX_TO_ENUM, or the season
// silently reverts to blank on reload (there is no HOLIDAY enum, so "Holiday" is intentionally
// absent — see season-util.ts). SS/FW → SS/FW, Resort/Cruise → RC, Pre-Fall → PF.
export const SEASON_TYPES: SeasonType[] = [
  { code: 'SS', label: 'Spring / Summer', short: true },
  { code: 'FW', label: 'Fall / Winter', short: true },
  { code: 'Resort', label: 'Resort', short: false },
  { code: 'Pre-Fall', label: 'Pre-Fall', short: false },
  { code: 'Cruise', label: 'Cruise', short: false },
];

// "SS25" for the short codes, "Resort 25" for the worded ones.
export function buildSeason(t: SeasonType, year: number): string {
  const yy = String(year).slice(-2);
  return t.short ? `${t.code}${yy}` : `${t.code} ${yy}`;
}

/** The type and year a stored label spells, matched back to the chips (null = none of them). */
function chipsOf(label: string): { type: SeasonType | null; year: number | null } {
  const m = label.trim().match(/^([A-Za-z-]+)\s*'?(\d{2,4})$/);
  if (!m) return { type: null, year: null };
  const word = m[1].replace(/-/g, '').toUpperCase();
  const type = SEASON_TYPES.find((t) => t.code.replace(/-/g, '').toUpperCase() === word) ?? null;
  let year = parseInt(m[2], 10);
  if (year < 100) year += 2000;
  return { type, year };
}

/**
 * THE SEASON CHIPS — type, then year, then a typed label, inline (no dialog). A year click commits
 * `type + year`; Enter in the typed field commits whatever is typed. Shared by SEASON in CARD
 * DETAILS and the create quiz's `other…`, so a season is picked one way everywhere.
 */
export function SeasonChips({
  value,
  onPick,
}: {
  /** The label the field holds now: its type is preselected, its year is drawn selected. */
  value: string;
  onPick: (label: string) => void;
}) {
  const current = chipsOf(value);
  const [type, setType] = useState<SeasonType | null>(current.type ?? SEASON_TYPES[0]);
  const [manual, setManual] = useState('');
  const thisYear = new Date().getFullYear();
  const years = [thisYear - 1, thisYear, thisYear + 1, thisYear + 2];
  return (
    <div className='space-y-1' data-season-chips=''>
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
      <ChipRow>
        {years.map((y) => (
          <Chip
            key={y}
            disabled={!type}
            selected={!!type && current.type?.code === type.code && current.year === y}
            title={type ? buildSeason(type, y) : undefined}
            onClick={() => type && onPick(buildSeason(type, y))}
          >
            {y}
          </Chip>
        ))}
      </ChipRow>
      <Input
        name='season-manual'
        value={manual}
        autoComplete='off'
        aria-label='season by hand'
        placeholder='or type: SS25'
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setManual(e.target.value)}
        onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
          if (e.key !== 'Enter') return;
          // Never the page form's implicit submit: Enter here writes the season, nothing more.
          e.preventDefault();
          if (manual.trim()) onPick(manual.trim());
        }}
      />
    </div>
  );
}

// Season field: the label it holds, and `pick` unfolding the season chips (type → year, or typed)
// right under it. Writes a string like "SS25" / "Resort 25" into the given form field.
//
// INLINE, NOT A DIALOG (TABS-LITE item 11). The picker was a modal for two rows of chips; it now
// unfolds in place under the field and folds back on a commit. It lives inside the cell, so a
// disabled fieldset around the cell stops its chips too (the modal portalled out of it).
export function SeasonField({
  name = 'season',
  pickHint,
  open: openProp,
  onOpenChange,
  onPicked,
}: {
  name?: string;
  /**
   * K-19 · Последствие смены сезона, сказанное ОРГАНОМ, а не абзацем на экране. Садится на
   * «pick», потому что это единственный писатель поля: сам Input readOnly, руками сезон здесь
   * не набирается. Необязательный: на новой карте перевыпускать нечего, и подсказка про SKU
   * уже существующих расцветок была бы враньём.
   */
  pickHint?: string;
  /**
   * The chips' open state, when the owner needs to open them from elsewhere (CARD DETAILS: SUGGEST
   * with no season opens the chips, then suggests with the season they commit). Unset = the field
   * keeps it itself, as before.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Fired after a commit wrote the season, with the season it wrote — only when it parses. */
  onPicked?: (sku: common_SkuSeason) => void;
}) {
  const { setValue } = useFormContext();
  const value = (useWatch({ name }) as string) || '';
  // The control is hand-rolled (a read-only Input + the chips), so it gets none of ui/form's error
  // plumbing for free: read the message and stamp the [data-field] anchor by hand, or a season the
  // schema rejects would block the save with nothing on screen to explain it.
  const { errors } = useFormState({ name });
  const error = (errors as Record<string, { message?: string } | undefined>)[name];
  const [ownOpen, setOwnOpen] = useState(false);
  const open = openProp ?? ownOpen;
  const setOpen = (o: boolean) => {
    if (openProp === undefined) setOwnOpen(o);
    onOpenChange?.(o);
  };

  const commit = (v: string) => {
    setValue(name, v.trim(), { shouldDirty: true });
    // Before the close: the owner may tie its follow-up to the close (CARD DETAILS forgets a
    // pending SUGGEST when the chips fold without a season).
    const sku = parseSeasonToSku(v);
    if (sku) onPicked?.(sku);
    setOpen(false);
  };

  return (
    <div
      className='space-y-px'
      data-field={name}
      onKeyDown={(e) => {
        if (open && e.key === 'Escape') {
          e.stopPropagation();
          setOpen(false);
        }
      }}
    >
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
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          pick
        </Button>
      </div>
      {open && (
        <div className='pt-1'>
          <SeasonChips value={value} onPick={commit} />
        </div>
      )}
      {error?.message && (
        <Text size='micro' variant='error'>
          {error.message}
        </Text>
      )}
    </div>
  );
}
