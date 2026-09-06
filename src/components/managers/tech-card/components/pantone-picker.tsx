import { useMemo, useState } from 'react';
import { Button } from 'ui/components/button';
import Input from 'ui/components/input';
import GenericPopover from 'ui/components/popover';
import Text from 'ui/components/text';
import { findPantone, normalizePantone, searchPantone } from './pantone-swatches';

/**
 * A Pantone reference picked by searching — «Search Pantone code or colour» (owner, C-8 snapshot).
 *
 * THE PRIMITIVE HOLDS NO VALUE AND KNOWS NO SCHEMA. What the picked code is written to is the
 * caller's decision, and the caller says so next to the trigger.
 *
 * THAT DAY CAME. The header used to end «the same control can bind to `TechCardBomItem.pantone` the
 * day that field exists, without a second picker» — the field exists (backend `50a1fb2`, migration
 * 0363), the BOM sheet binds to it, and no second picker was written. The catalogue article is no
 * longer written from here at all: `Material.pantone` is a fact about what will be BOUGHT and is
 * edited in the materials manager, while this row holds what the line INTENDS, which is decided
 * before an article is chosen.
 *
 * `label` IS WHERE AN INHERITED VALUE GOES. The trigger renders `value` in ink and `label` in the
 * grey label variant, so a caller with a senior fallback (the linked article's own pantone) passes
 * it as `label`: the row then reads «shown, but not mine» without a second control and without this
 * file learning what a BOM line is.
 *
 * TYPED CODES ARE ACCEPTED AS TYPED. The swatch list is a suggestion list of ~120 common references;
 * the dyehouse's own number («19-4005 TCX») is not refused because it is not in it — the list
 * narrows, the query itself stays offered as the first row whenever it reads as a reference.
 *
 * AND «READS AS A REFERENCE» COVERS BOTH FAMILIES. The list is textile (TCX), but a solid coated
 * number — «407 C», «1635 C» — is what the owner's own reference sheet holds, and a picker that
 * refused it made the code in the operator's hand unenterable. What counts as a reference and what
 * spelling is stored are ONE answer, `normalizePantone`; this file never re-decides either.
 */
export function PantonePicker({
  value,
  onPick,
  disabled,
  label = 'pick',
  name,
}: {
  value?: string;
  /** '' clears. */
  onPick: (code: string) => void;
  disabled?: boolean;
  /** Trigger text when nothing is picked yet. */
  label?: string;
  /** Anchor for probes and labels — one per row. */
  name: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const hits = useMemo(() => searchPantone(query), [query]);
  const typed = query.trim();
  /**
   * НАБРАННОЕ, ПРИВЕДЁННОЕ К ХРАНИМОМУ НАПИСАНИЮ — и одновременно ответ на вопрос «ссылка ли это»
   * (пусто = не ссылка). Строка предлагает РОВНО ТО, что и положит: человек набирает «407c», в
   * кнопке стоит «407 C», в поле уезжает «407 C». Раньше здесь стоял `toUpperCase()`, и набранное
   * «18-1248tcx» уезжало в карточку слипшимся — рядом с «18-1248 TCX» из списка это два значения.
   */
  const typedCode = normalizePantone(typed);
  const current = findPantone(value);

  const choose = (code: string) => {
    onPick(code.trim());
    setQuery('');
    setOpen(false);
  };

  return (
    <GenericPopover
      open={open}
      onOpenChange={(o) => {
        if (disabled) return;
        setOpen(o);
        if (!o) setQuery('');
      }}
      title='pantone'
      noTail
      contentProps={{ align: 'start' }}
      // The probe anchor rides on the trigger as a data attribute; Radix's prop type lists no
      // `data-*`, so it goes in through a spread rather than a literal key the checker can refuse.
      triggerProps={{
        className: 'flex items-center',
        disabled,
        ...({ 'data-pantone-picker': name } as Record<string, string>),
      }}
      className='w-[300px] max-w-[calc(100vw-1.5rem)]'
      openElement={
        <span
          className={`inline-flex min-h-[22px] items-center gap-1.5 border border-borderColor bg-bgColor px-[7px] py-[3px] text-left ${
            disabled ? 'text-textInactiveColor' : 'hover:border-textColor'
          }`}
        >
          {current && (
            <span
              aria-hidden
              className='size-3 shrink-0 border border-borderColor'
              style={{ background: current.hex }}
            />
          )}
          <Text component='span' size='micro' variant={value ? 'default' : 'label'} className='uppercase'>
            {value?.trim() || label}
          </Text>
          <Text size='micro' variant='label' component='span' aria-hidden>
            ▾
          </Text>
        </span>
      }
    >
      <div className='space-y-1.5'>
        <Input
          name={`pantone-search-${name}`}
          value={query}
          autoFocus
          placeholder='Search Pantone code or colour'
          data-pantone-search={name}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
            // Enter takes the typed reference when it reads as one, else the first hit. Compared
            // with the key NAME, never a letter — letters die on a Cyrillic layout.
            if (e.key !== 'Enter') return;
            e.preventDefault();
            if (typedCode) choose(typedCode);
            else if (hits[0]) choose(hits[0].code);
          }}
        />
        <div className='max-h-[260px] overflow-y-auto' role='listbox' aria-label='pantone swatches'>
          {typedCode && (
            <button
              type='button'
              role='option'
              aria-selected={false}
              data-pantone-typed={name}
              onClick={() => choose(typedCode)}
              className='flex w-full items-center gap-2 border-b border-hairline px-1.5 py-1 text-left hover:bg-bgZebra'
            >
              <span aria-hidden className='size-3 shrink-0 border border-dashed border-borderColor' />
              <Text component='span' size='micro' className='uppercase'>
                use “{typedCode}” as typed
              </Text>
            </button>
          )}
          {hits.length === 0 && !typedCode && (
            <Text size='micro' variant='label' className='px-1.5 py-1' data-pantone-empty={name}>
              nothing matches “{typed}” — type the reference itself, e.g. 19-4005 TCX or 407 C
            </Text>
          )}
          {hits.map((s) => (
            <button
              key={s.code}
              type='button'
              role='option'
              aria-selected={s.code === value}
              data-pantone-option={s.code}
              onClick={() => choose(s.code)}
              className={`flex w-full items-center gap-2 border-b border-hairline px-1.5 py-1 text-left last:border-b-0 ${
                s.code === value ? 'bg-textColor text-bgColor' : 'hover:bg-bgZebra'
              }`}
            >
              <span
                aria-hidden
                className='size-3 shrink-0 border border-borderColor'
                style={{ background: s.hex }}
              />
              <span className='min-w-0 flex-1 truncate text-micro uppercase tracking-label'>
                {s.code}
              </span>
              {/* The name inherits the row's ink when the row is the selected one — grey-on-black
                  is the one pairing this system has no contrast for. */}
              <span className={`shrink-0 text-micro ${s.code === value ? '' : 'text-labelColor'}`}>
                {s.name}
              </span>
            </button>
          ))}
        </div>
        <div className='flex items-center justify-between gap-2 border-t border-borderColor pt-1.5'>
          <Text size='micro' variant='label' component='span'>
            swatches are approximate on screen
          </Text>
          {value?.trim() && (
            <Button
              type='button'
              variant='secondary'
              size='xs'
              data-pantone-clear={name}
              onClick={() => choose('')}
            >
              clear
            </Button>
          )}
        </div>
      </div>
    </GenericPopover>
  );
}
