import { useMemo, useState } from 'react';
import { Button } from 'ui/components/button';
import Input from 'ui/components/input';
import GenericPopover from 'ui/components/popover';
import Text from 'ui/components/text';
import {
  findPantone,
  normalizePantone,
  searchPantone,
  type PantoneFamily,
  type PantoneSwatch,
} from './pantone-swatches';

/**
 * A Pantone reference picked by searching — «Search Pantone code or colour» (owner, C-8 snapshot).
 *
 * THE PRIMITIVE HOLDS NO VALUE AND KNOWS NO SCHEMA. What the picked code is written to is the
 * caller's decision, and the caller says so next to the trigger.
 *
 * `label` IS WHERE AN INHERITED VALUE GOES. The trigger renders `value` in ink and `label` in the
 * grey label variant, so a caller with a senior fallback (the linked article's own pantone) passes
 * it as `label`: the row then reads «shown, but not mine» without a second control and without this
 * file learning what a BOM line is.
 *
 * TYPED CODES ARE ACCEPTED AS TYPED. The swatch list is a suggestion list; the dyehouse's own
 * number («19-4005 TCX») is not refused because it is not in it — the list narrows, the query
 * itself stays offered as the first row whenever it reads as a reference. What counts as a
 * reference and what spelling is stored are ONE answer, `normalizePantone`; this file never
 * re-decides either.
 *
 * ═══ КРУПНЫЕ СВОТЧИ И ДВЕ СЕМЬИ (владелец, r3 пп.13 и 25) ══════════════════════════════════════
 *
 * Дословно: «COLOUR: один бедный пикер, выглядит не очень; очень мало цветов в пантоне» и
 * «пантон-пикер: крупнее свотчи».
 *
 * ЧТО БЫЛО ЗАМЕРЕНО. Список — 120 записей, все текстильные; `searchPantone` отдавал ПЕРВЫЕ 24, то
 * есть открывший пикер видел пятую часть набора и ни одного solid-кода; каждая запись — строка
 * высотой 22px со свотчем 12 × 12. Цвет по свотчу 12 пикселей не выбирают — по нему сверяют, что
 * не ошиблись строкой. Отсюда «бедный»: орган был СПИСКОМ, а вопрос к нему — «какой из этих».
 *
 * ЧТО СТАЛО. Сетка свотчей 60px (потолок п.25 — 56–64) с кодом ПОД свотчем, две семьи двумя
 * секциями внутри одного списка, и ни одной новой кнопки: переключателя семей нет НАРОЧНО —
 * владелец в этом же круге просит «не пихай кучу кнопок в одном месте», а секция, которую поиск
 * опустошил, просто не рисуется. Ряд «use “…” as typed» стоит там же, где стоял.
 *
 * ⚠ СЕТКА — ЭТО `role='listbox'` С `role='option'`, И РАЗМЕТКА ЗДЕСЬ НЕСУЩАЯ: заголовки семей
 * лежат ВНЕ опций (`role='presentation'`), иначе читалка объявила бы их выбираемыми пунктами.
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
   * кнопке стоит «407 C», в поле уезжает «407 C».
   */
  const typedCode = normalizePantone(typed);
  const current = findPantone(value);

  const choose = (code: string) => {
    onPick(code.trim());
    setQuery('');
    setOpen(false);
  };

  /** Две секции одного списка. Пустая не рисуется — поиск сам решает, какие семьи остались. */
  const families: { family: PantoneFamily; head: string; rows: PantoneSwatch[] }[] = [
    { family: 'textile', head: 'textile · tcx', rows: hits.filter((s) => s.family === 'textile') },
    { family: 'solid', head: 'solid coated · c', rows: hits.filter((s) => s.family === 'solid') },
  ];

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
      className='w-[380px] max-w-[calc(100vw-1.5rem)]'
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
      <div className='space-y-2'>
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

        {typedCode && (
          <button
            type='button'
            data-pantone-typed={name}
            onClick={() => choose(typedCode)}
            className='flex w-full items-center gap-2 border border-borderColor bg-bgColor px-1.5 py-1 text-left hover:border-textColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
          >
            <span aria-hidden className='size-4 shrink-0 border border-dashed border-borderColor' />
            <Text component='span' size='micro' className='uppercase'>
              use “{typedCode}” as typed
            </Text>
          </button>
        )}

        <div className='max-h-[320px] space-y-2.5 overflow-y-auto' role='listbox' aria-label='pantone swatches'>
          {hits.length === 0 && !typedCode && (
            <Text size='micro' variant='label' className='py-1' data-pantone-empty={name}>
              nothing matches “{typed}” — type the reference itself, e.g. 19-4005 TCX or 407 C
            </Text>
          )}
          {families.map(
            (group) =>
              group.rows.length > 0 && (
                /* Семья — `role='group'` внутри listbox'а: опции лежат в обёртке, и без роли
                   читалка объявила бы их «не в списке». Заголовок — часть группы, а не пункт. */
                <div key={group.family} role='group' aria-label={group.head} data-pantone-family={group.family}>
                  <div className='mb-1.5 border-b border-borderColor pb-0.5'>
                    <Text size='nano' variant='uppercase' tracking='group' component='span' className='text-labelColor'>
                      {group.head}
                    </Text>
                  </div>
                  {/* 60px — потолок п.25 (56–64). Колонок столько, сколько влезет: ширина окна
                      фиксирована, а сетка не обязана знать их число. */}
                  <div
                    className='grid gap-1.5'
                    style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(60px, 1fr))' }}
                  >
                    {group.rows.map((s) => {
                      const on = s.code === value;
                      return (
                        <button
                          key={s.code}
                          type='button'
                          role='option'
                          aria-selected={on}
                          data-pantone-option={s.code}
                          title={`${s.code} · ${s.name}`}
                          onClick={() => choose(s.code)}
                          className={`flex min-w-0 flex-col gap-0.5 p-0.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor ${
                            on ? 'bg-textColor' : 'hover:bg-bgZebra'
                          }`}
                        >
                          <span
                            aria-hidden
                            className='block w-full border border-borderColor'
                            style={{ background: s.hex, aspectRatio: '1/1' }}
                          />
                          {/* Код ПОД свотчем (п.25). Имя не печатается: в ячейку 60px оно легло бы
                              тремя строками — оно живёт в `title` и в поиске. */}
                          <span
                            className={`block min-w-0 truncate text-nano uppercase tracking-label ${
                              on ? '!text-bgColor' : ''
                            }`}
                          >
                            {s.code}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ),
          )}
        </div>

        <div className='flex items-center justify-between gap-2 border-t border-borderColor pt-1.5'>
          {/* ДВА ФАКТА ОДНОЙ СТРОКОЙ, и оба нужны: свотч — приближение (в промпт и в спецификацию
              едет КОД), а набор — подборка, а не библиотека на 2 600 ссылок. */}
          <Text size='nano' variant='label' component='span' className='normal-case'>
            swatches are approximate · suggestions, not the full library — any code can be typed
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
