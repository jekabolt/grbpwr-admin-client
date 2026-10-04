import type { common_Color, common_ColorwayColour, common_Language } from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import { useMemo, useState, type JSX } from 'react';
import Input from 'ui/components/input';
import Text from 'ui/components/text';

import {
  blankRow,
  NAME_I18N_MAX,
  PALETTE_MAX,
  paletteFromWire,
  rowText,
  suggestFamily,
  suggestionWords,
  TOKEN_CAPTION,
  withHex,
  withText,
  type PaletteRow,
} from './colourway-palette-model';
import { PantonePicker } from './pantone-picker';
import { FoldCaret } from 'ui/components/fold-caret';

/**
 * ═══ ОДИН РЕДАКТОР ПАЛИТРЫ НА ТРИ ЭКРАНА (T45) ═════════════════════════════════════════════════
 *
 * Окно рождения колорвея в студии, предложение ИИ под черновиком конструкции и форма продукта
 * задают ОДНИ И ТЕ ЖЕ вопросы в одном порядке: имя → палитра (ряды «pantone или метка · hex»,
 * первый — main, пунктирный «+ colour» под списком, до 8) → семейство (селект словаря с
 * подсказкой «suggested: black» по hex главного) → свёрнутые переводы имени по языкам
 * сторфронта. Три формы с разным порядком вопросов — это три места, где человек ищет своё поле.
 *
 * ⚠ СЕМЕЙСТВО ИДЁТ ЗА ПОДСКАЗКОЙ, ПОКА ЧЕЛОВЕК НЕ ВЫБРАЛ САМ, и правило это без флага: при
 * правке палитры семейство переставляется на новую подсказку ровно тогда, когда оно пусто или
 * равно ПРЕЖНЕЙ подсказке (то есть человек от неё не отступал). Выбранное рукой другое семейство
 * правка палитры не трогает. Подсказка считается серверной мерой (`suggestFamily`), либо
 * приходит готовой (`suggested`) — у предложения ИИ семейство сверил сам сервер.
 *
 * Токен SKU здесь НЕ вводится: его чеканит сервер (решение владельца 1), редактор его не знает.
 * Показ токена — `SkuToken` ниже, только чтение.
 */

export type PaletteValue = {
  name: string;
  rows: PaletteRow[];
  /** Семейство словаря, которое уедет в `merchandising.color_code`; '' — ещё не выбрано. */
  colorCode: string;
  /** Переводы имени по Language.id (строкой, как на проводе); '' = перевода нет. */
  nameI18n: Record<string, string>;
};

export function emptyPaletteValue(): PaletteValue {
  return { name: '', rows: [], colorCode: '', nameI18n: {} };
}

/** Значение из прочитанного колорвея: палитра с провода, семейство как хранится. */
export function paletteValueFromRead(read: {
  name?: string;
  colours?: readonly common_ColorwayColour[] | null;
  colorCode?: string;
  nameI18n?: Readonly<Record<string, string>> | null;
}): PaletteValue {
  return {
    name: (read.name ?? '').trim(),
    rows: paletteFromWire(read.colours),
    colorCode: (read.colorCode ?? '').trim(),
    nameI18n: { ...(read.nameI18n ?? {}) },
  };
}

const CELL =
  'block min-h-[22px] w-full appearance-none border border-borderColor bg-bgColor px-[7px] py-[3px] text-textBaseSize focus:border-textColor focus:outline-none disabled:bg-bgZebra disabled:text-labelColor';

function Label({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <Text size='micro' variant='label' component='span' className='uppercase'>
      {children}
    </Text>
  );
}

function Hint({ children, ...rest }: { children: React.ReactNode; [k: string]: unknown }) {
  return (
    <Text size='micro' variant='label' component='span' className='block min-w-0' {...rest}>
      {children}
    </Text>
  );
}

/** Свотч ряда: цвет превью или пунктирный квадрат, когда hex не назван. */
function Swatch({ hex, title, size = 3 }: { hex?: string; title?: string; size?: 3 | 4 }) {
  return (
    <span
      aria-hidden
      title={title || hex || undefined}
      className={cn(
        'inline-block shrink-0 border',
        size === 4 ? 'size-4' : 'size-3',
        hex ? 'border-textColor' : 'border-dashed border-borderColor',
      )}
      style={hex ? { backgroundColor: hex } : undefined}
    />
  );
}

/** Палитра в ряд — на плитке колорвея, в предложении ИИ, в шапке продукта. Только чтение. */
export function PaletteSwatches({
  colours,
  size = 3,
  className,
  ...rest
}: {
  colours: readonly common_ColorwayColour[] | readonly PaletteRow[] | undefined;
  size?: 3 | 4;
  className?: string;
  [k: string]: unknown;
}): JSX.Element | null {
  const rows = colours ?? [];
  if (rows.length === 0) return null;
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1', className)} {...rest}>
      {rows.map((c, i) => (
        <Swatch
          key={i}
          hex={(c.hex ?? '').trim() || undefined}
          title={(c.pantone ?? '').trim() || (c.label ?? '').trim() || undefined}
          size={size}
        />
      ))}
    </span>
  );
}

/**
 * ТОКЕН SKU — ТОЛЬКО ЧТЕНИЕ, С ПОДПИСЬЮ. Чеканится сервером при создании и не меняется никогда
 * (решение владельца 1); поля ввода у него нет ни на одном экране. Пустой токен (колорвей ещё
 * не создан, старый список без поля) — прочерк, а не пустота: строка обязана сказать, что
 * здесь стоит, даже когда стоять ещё нечему.
 */
export function SkuToken({
  token,
  className,
  ...rest
}: {
  token?: string;
  className?: string;
  [k: string]: unknown;
}): JSX.Element {
  const t = (token ?? '').trim();
  return (
    <span className={cn('flex min-w-0 flex-col gap-0.5', className)} {...rest}>
      <Text component='span' className='tabular-nums uppercase' data-cw-token=''>
        {t || '—'}
      </Text>
      <Text size='micro' variant='label' component='span'>
        {TOKEN_CAPTION}
      </Text>
    </span>
  );
}

/** Строка семейства для показа: «BLK · black». */
export function familyWords(code: string | undefined, colours?: readonly common_Color[]): string {
  const c = (code ?? '').trim();
  if (!c) return '';
  const name = (colours ?? [])
    .find((x) => x.code === c)
    ?.name?.trim()
    .toLowerCase();
  return name ? `${c} · ${name}` : c;
}

export function ColourwayPaletteEditor({
  value,
  onChange,
  name,
  colours,
  languages,
  readOnly = false,
  suggested,
  withName = true,
  autoFocusName = false,
  onEnter,
}: {
  value: PaletteValue;
  onChange: (next: PaletteValue) => void;
  /** Якорь проб и имён пикеров — один на редактор; ряды получают `${name}-${i}`. */
  name: string;
  /** Словарь цветов (семейства). Архивные показываются только когда уже выбраны. */
  colours: readonly common_Color[] | undefined;
  /** Языки сторфронта из словаря; неактивные не предлагаются. */
  languages: readonly common_Language[] | undefined;
  readOnly?: boolean;
  /** Подсказка семейства, сверенная сервером (предложение ИИ). Без неё считается по hex. */
  suggested?: common_Color;
  /** Имя спрашивает этот редактор (по умолчанию) — или строка вызывающего рядом. */
  withName?: boolean;
  autoFocusName?: boolean;
  /** Enter в поле имени — отправка формы вызывающего (клавиатура первична). */
  onEnter?: () => void;
}): JSX.Element {
  const [i18nOpen, setI18nOpen] = useState(false);

  const main = value.rows[0];
  const computed = useMemo(() => suggestFamily(main?.hex, colours), [main?.hex, colours]);
  const suggestion = suggested ?? computed;

  const live = useMemo(
    () =>
      (colours ?? [])
        .filter((c) => !!c.code && (!c.archived || c.code === value.colorCode))
        .sort((a, b) => (a.code ?? '').localeCompare(b.code ?? '')),
    [colours, value.colorCode],
  );
  const picked = (colours ?? []).find((c) => c.code === value.colorCode);
  const orphan = !!value.colorCode && !picked;

  /**
   * Палитра меняется — семейство переставляется на новую подсказку, если человек от прежней не
   * отступал (пусто или равно прежней). Подсказка «сверху» (`suggested`) не зависит от палитры,
   * поэтому с ней семейство просто стоит.
   */
  const setRows = (rows: PaletteRow[]) => {
    const before = suggestion?.code ?? '';
    const after = suggested ? before : suggestFamily(rows[0]?.hex, colours)?.code ?? '';
    const following = !value.colorCode || value.colorCode === before;
    onChange({ ...value, rows, colorCode: following && after ? after : value.colorCode });
  };
  const setRow = (i: number, row: PaletteRow) =>
    setRows(value.rows.map((r, j) => (j === i ? row : r)));

  const langs = useMemo(
    () => (languages ?? []).filter((l) => l.isActive !== false && l.id != null),
    [languages],
  );
  const filled = langs.filter((l) => (value.nameI18n[String(l.id)] ?? '').trim()).length;

  const familyCaption = suggestion
    ? `${suggestionWords(suggestion)}${
        value.colorCode === suggestion.code ? ' · nearest to the main colour' : ''
      }`
    : 'suggested from the main colour’s hex';

  if (readOnly) {
    return (
      <div className='flex flex-col gap-5' data-cw-palette={name} data-readonly=''>
        {withName && (
          <div className='flex flex-col gap-0.5'>
            <Label>name</Label>
            <Text component='span' className='uppercase' data-cw-name-read=''>
              {value.name || '—'}
            </Text>
          </div>
        )}
        <div className='flex flex-col gap-0.5'>
          <Label>palette</Label>
          {value.rows.length === 0 ? (
            <Hint>no palette — the colour reads from the family</Hint>
          ) : (
            <div className='flex flex-col'>
              {value.rows.map((r, i) => (
                <span
                  key={i}
                  className='flex items-center gap-2 border-b border-hairline py-1.5 last:border-b-0'
                  data-cw-row={i}
                >
                  <Swatch hex={r.hex || undefined} title={rowText(r)} />
                  <Text component='span' size='micro' className='uppercase'>
                    {rowText(r)}
                  </Text>
                  {r.hex && (
                    <Text component='span' size='micro' variant='label' className='uppercase'>
                      {r.hex}
                    </Text>
                  )}
                  {i === 0 && (
                    <Text component='span' size='micro' variant='label' className='ml-auto'>
                      main
                    </Text>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className='flex flex-col gap-0.5'>
          <Label>family</Label>
          <span className='flex items-center gap-2'>
            {!!picked?.hex && <Swatch hex={picked.hex} title={picked.code} />}
            <Text component='span' className='uppercase' data-cw-family-read=''>
              {familyWords(value.colorCode, colours) || '—'}
            </Text>
          </span>
        </div>
        {filled > 0 && (
          <div className='flex flex-col gap-0.5'>
            <Label>name in other languages</Label>
            {langs
              .filter((l) => (value.nameI18n[String(l.id)] ?? '').trim())
              .map((l) => (
                <span key={l.id} className='flex items-baseline gap-2'>
                  <Text size='micro' variant='label' component='span' className='w-20 shrink-0'>
                    {(l.name ?? l.code ?? '').toLowerCase()}
                  </Text>
                  <Text component='span' size='micro'>
                    {value.nameI18n[String(l.id)]}
                  </Text>
                </span>
              ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className='flex flex-col gap-5' data-cw-palette={name}>
      {withName && (
        <label className='flex flex-col gap-0.5'>
          <Label>name</Label>
          <Input
            value={value.name}
            maxLength={64}
            autoFocus={autoFocusName}
            placeholder='name this colourway'
            data-cw-name=''
            onChange={(e: { target: { value: string } }) =>
              onChange({ ...value, name: e.target.value })
            }
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
              // Enter отправляет — клавиатура здесь первична (PRODUCT.md). Сравнение по имени
              // клавиши, не по букве: буквы мертвы на кириллической раскладке.
              if (e.key !== 'Enter' || !onEnter) return;
              e.preventDefault();
              onEnter();
            }}
          />
        </label>
      )}

      {/* ═══ ПАЛИТРА: ряды «pantone или метка · hex», первый — main, дверь «+ colour» под списком.
          Линейка — МЕЖДУ рядами, не под последним (DESIGN.md, Between-Rows Rule); дверь стоит на
          шаг (mt-4) от последнего ряда и только когда ряды есть — в пустом списке она первый ряд. */}
      <div className='flex flex-col gap-0.5'>
        <Label>palette</Label>
        {value.rows.length > 0 && (
          <div className='flex flex-col' data-cw-rows=''>
            {value.rows.map((r, i) => (
              <div
                key={i}
                className='flex flex-wrap items-center gap-2 border-b border-hairline py-1.5 last:border-b-0'
                data-cw-row={i}
              >
                {/* Ячейка «pantone или метка» — одной ширины на все ряды, чтобы колонка hex стояла
                    ровно; сам пикер — тот же, что в рецепте и на палитре рендера, плюс дверь для
                    своих слов (`freeText`) и свотч метки по её hex (`previewHex`). */}
                <span className='w-48 shrink-0'>
                  <PantonePicker
                    name={`${name}-${i}`}
                    value={rowText(r)}
                    label='pantone or label'
                    previewHex={r.hex || undefined}
                    freeText
                    fill
                    onPick={(code) => setRow(i, withText(r, code))}
                  />
                </span>
                <Input
                  value={r.hex}
                  maxLength={7}
                  placeholder='#RRGGBB'
                  aria-label={`preview hex of colour ${i + 1}`}
                  className='w-24 uppercase'
                  data-cw-hex={i}
                  onChange={(e: { target: { value: string } }) =>
                    setRow(i, withHex(r, e.target.value))
                  }
                />
                {i === 0 && (
                  <Text size='micro' variant='label' component='span' data-cw-main=''>
                    main
                  </Text>
                )}
                <button
                  type='button'
                  aria-label={`remove colour ${i + 1}`}
                  title='remove this colour'
                  data-cw-remove={i}
                  className='ml-auto px-1 text-labelColor hover:text-textColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
                  onClick={() => setRows(value.rows.filter((_, j) => j !== i))}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
        {value.rows.length < PALETTE_MAX ? (
          <button
            type='button'
            data-cw-add=''
            className={cn(
              'self-start border border-dashed border-borderColor px-2.5 py-1 text-micro uppercase tracking-label text-labelColor hover:border-textColor hover:text-textColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
              value.rows.length > 0 && 'mt-4',
            )}
            onClick={() => setRows([...value.rows, blankRow()])}
          >
            + colour
          </button>
        ) : (
          <Hint>a palette holds up to {PALETTE_MAX} colours</Hint>
        )}
      </div>

      {/* ═══ СЕМЕЙСТВО: селект словаря + подсказка словами. Подсказка — не выбор, а следствие
          (по hex главного цвета), поэтому она стоит мелко ПОД селектом, а не пунктом в нём. */}
      <div className='flex flex-col gap-0.5'>
        <Label>family</Label>
        <span className='flex items-center gap-2'>
          <Swatch hex={picked?.hex || undefined} title={picked?.code} />
          <select
            className={cn(CELL, 'w-56')}
            value={value.colorCode}
            data-cw-family=''
            aria-label='dictionary family'
            onChange={(e) => onChange({ ...value, colorCode: e.target.value })}
          >
            {!value.colorCode && <option value=''>— select family —</option>}
            {live.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} · {(c.name ?? '').toLowerCase()}
                {c.archived ? ' (archived)' : ''}
              </option>
            ))}
            {/* Сирота — своим пунктом: без него у селекта нет пункта под своё же значение. */}
            {orphan && (
              <option value={value.colorCode} disabled>
                {value.colorCode} (not in the dictionary)
              </option>
            )}
          </select>
        </span>
        <Hint data-cw-family-suggested={suggestion?.code ?? ''}>{familyCaption}</Hint>
      </div>

      {/* ═══ ПЕРЕВОДЫ ИМЕНИ — СВЁРНУТЫ: нужны не каждому колорвею. Пусто = имя оператора. */}
      <div className='flex flex-col gap-1.5'>
        <button
          type='button'
          data-cw-i18n-toggle=''
          aria-expanded={i18nOpen}
          className='flex items-center gap-1.5 self-start text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
          onClick={() => setI18nOpen((o) => !o)}
        >
          <Label>name in other languages</Label>
          {filled > 0 && (
            <Text size='micro' variant='label' component='span' data-cw-i18n-count=''>
              · {filled}
            </Text>
          )}
          <FoldCaret open={i18nOpen} className='ml-0 text-labelColor' />
        </button>
        {i18nOpen &&
          (langs.length === 0 ? (
            <Hint>no other storefront languages are configured</Hint>
          ) : (
            <div className='flex flex-col gap-1.5' data-cw-i18n-list=''>
              {langs.map((l) => {
                const key = String(l.id);
                return (
                  <label key={key} className='flex items-center gap-2'>
                    <Text size='micro' variant='label' component='span' className='w-20 shrink-0'>
                      {(l.name ?? l.code ?? key).toLowerCase()}
                    </Text>
                    <Input
                      value={value.nameI18n[key] ?? ''}
                      maxLength={NAME_I18N_MAX}
                      placeholder={value.name.trim() || 'as the name'}
                      data-cw-i18n={key}
                      onChange={(e: { target: { value: string } }) =>
                        onChange({
                          ...value,
                          nameI18n: { ...value.nameI18n, [key]: e.target.value },
                        })
                      }
                    />
                  </label>
                );
              })}
            </div>
          ))}
      </div>
    </div>
  );
}
