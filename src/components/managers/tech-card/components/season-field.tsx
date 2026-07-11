import { cn } from 'lib/utility';
import { useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Input from 'ui/components/input';
import Text from 'ui/components/text';
import { FormLabel } from 'ui/form';

type SeasonType = { code: string; label: string; short: boolean };

const SEASON_TYPES: SeasonType[] = [
  { code: 'SS', label: 'Spring / Summer', short: true },
  { code: 'FW', label: 'Fall / Winter', short: true },
  { code: 'Resort', label: 'Resort', short: false },
  { code: 'Pre-Fall', label: 'Pre-Fall', short: false },
  { code: 'Cruise', label: 'Cruise', short: false },
  { code: 'Holiday', label: 'Holiday', short: false },
];

// "SS25" for the short codes, "Resort 25" for the worded ones.
function buildSeason(t: SeasonType, year: number): string {
  const yy = String(year).slice(-2);
  return t.short ? `${t.code}${yy}` : `${t.code} ${yy}`;
}

// Season field with a modal picker (type + year), plus manual entry. Writes a string like
// "SS25" / "Resort 25" into the given form field. Replaces the free-text season input.
export function SeasonField({ name = 'season' }: { name?: string }) {
  const { setValue } = useFormContext();
  const value = (useWatch({ name }) as string) || '';
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<SeasonType | null>(null);
  const [manual, setManual] = useState('');

  const thisYear = new Date().getFullYear();
  const years = [thisYear - 1, thisYear, thisYear + 1, thisYear + 2];

  const close = () => {
    setOpen(false);
    setType(null);
    setManual('');
  };
  const commit = (v: string) => {
    setValue(name, v.trim(), { shouldDirty: true });
    close();
  };

  return (
    <div className='space-y-1'>
      <FormLabel>season</FormLabel>
      <div className='flex items-center gap-2 border-b border-textInactiveColor'>
        <Input value={value} readOnly placeholder='— сезон —' className='flex-1 border-none' />
        <Button
          type='button'
          variant='secondary'
          onClick={() => {
            setManual(value);
            setOpen(true);
          }}
          className='px-2 py-1 text-textBaseSize uppercase'
        >
          выбрать
        </Button>
      </div>

      {open && (
        <div
          className='fixed inset-0 z-[var(--z-popover)] flex items-center justify-center bg-black/60 p-6'
          onClick={close}
          role='dialog'
          aria-label='выбор сезона'
        >
          <div
            className='w-full max-w-sm space-y-4 border border-textInactiveColor bg-bgColor p-4'
            onClick={(e) => e.stopPropagation()}
          >
            <Text variant='uppercase'>выбор сезона</Text>

            <div className='space-y-2'>
              <Text variant='inactive' size='small'>
                1. тип
              </Text>
              <div className='flex flex-wrap gap-2'>
                {SEASON_TYPES.map((t) => (
                  <button
                    key={t.code}
                    type='button'
                    onClick={() => setType(t)}
                    title={t.label}
                    className={cn(
                      'border px-2 py-1 text-textBaseSize uppercase transition-colors',
                      type?.code === t.code
                        ? 'border-textColor bg-textColor text-bgColor'
                        : 'border-textInactiveColor hover:border-textInactiveColor',
                    )}
                  >
                    {t.code}
                  </button>
                ))}
              </div>
            </div>

            <div className='space-y-2'>
              <Text variant='inactive' size='small'>
                2. год
              </Text>
              <div className='flex flex-wrap gap-2'>
                {years.map((y) => (
                  <button
                    key={y}
                    type='button'
                    disabled={!type}
                    onClick={() => type && commit(buildSeason(type, y))}
                    className={cn(
                      'border px-3 py-1 text-textBaseSize transition-colors',
                      type
                        ? 'border-textInactiveColor hover:border-textInactiveColor'
                        : 'border-textInactiveColor opacity-40',
                    )}
                  >
                    {y}
                  </button>
                ))}
              </div>
            </div>

            <div className='space-y-1 border-t border-textInactiveColor pt-3'>
              <Text variant='inactive' size='small'>
                или вручную
              </Text>
              <div className='flex items-center gap-2'>
                <Input
                  value={manual}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setManual(e.target.value)}
                  placeholder='SS25'
                  className='flex-1'
                />
                <Button
                  type='button'
                  onClick={() => commit(manual)}
                  disabled={!manual.trim()}
                  className='uppercase'
                >
                  ок
                </Button>
              </div>
            </div>

            <div className='flex justify-end'>
              <Button type='button' variant='secondary' onClick={close} className='uppercase'>
                отмена
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
