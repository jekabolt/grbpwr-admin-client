import { cn } from 'lib/utility';
import { useEffect, useRef } from 'react';
import { useFormContext } from 'react-hook-form';
import { kindDef } from 'ui/components/annotation/kinds';
import { AnnotationStyleRow } from 'ui/components/annotation/style-row';
import { rememberPen, type NoteArrows } from 'ui/components/annotation/surface';
import { Button } from 'ui/components/button';
import Input from 'ui/components/input';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';
import Textarea from 'ui/components/text-area';

import type { AnnotationCaps, AnnotationKind, TechCardFormData } from '../schema';

/**
 * ═══ БОКОВОЕ МЕНЮ УКАЗАНИЙ — ОДИН ОРГАН НА ЛИСТ И НА ДОСКУ ══════════════════════════════════════
 *
 * Владелец (круг 20, B-9), дословно: «в мудборде все управление колаутами должно было переехать в
 * панель слева как в артифактах логика должна там быть такая-же и не должно быть этой брови над
 * картинками "no callout selected — click a note or a line on a frame · Backspace deletes it ·
 * Enter opens this editor" все только в правом блоке».
 *
 * ⚠ ЭТО ПЕРЕЕЗД, А НЕ ВТОРАЯ КОПИЯ. Тело жило в `artifacts-panel.tsx` (`CalloutPanel`), где за три
 * круга обросло сужением по вкладке (C-1), подсветкой выноски по наведению на строку (C-2) и
 * пиктограммой вида в каждой строке. Мудборд к тому времени держал СВОЁ меню — «временный орган из
 * общих примитивов» (D-27), у которого не было ни выбора, ни наведения, ни правки, — и его подпись
 * прямо называла извлечение общего органа как долг. Долг закрыт здесь: файл один, оба экрана
 * монтируют его, и «логика такая же» держится по построению, а не по дисциплине двух правок.
 *
 * ═══ ЧТО ЗДЕСЬ ПИШЕТСЯ И ЧЕГО ЗДЕСЬ НЕ ПИШЕТСЯ ═════════════════════════════════════════════════
 *
 * Writes are LEAF writes on a dotted path — `callouts.3.description` — which is the same mechanism
 * the surface uses for the same fields. They touch no array identity, so they cannot desynchronise
 * the `useFieldArray` instances that other organs hold over `callouts`; the ROOT write
 * (`setValue('callouts', next)`) is the one that re-syncs them, and this panel needs it for exactly
 * one act — deleting a row — which is why deletion is handed in by the owner of the array.
 *
 * ГЕОМЕТРИЯ (якоря, положение маркера) правится ЖЕСТОМ НА КАРТИНКЕ, а не полем: доля кадра,
 * набранная с клавиатуры, — это координата, которую человек не видит.
 *
 * ОДИН ВЫБОР НА ЭКРАН, И ЭТО НЕ СОВПАДЕНИЕ: `selected` — то же число, которым картинка подсвечивает
 * свой маркер. Нажатие на строку открывает правку И зажигает указание на кадре; нажатие на кадр
 * открывает эту строку. Второе состояние выбора рядом с первым означало бы, что человек правит не
 * то указание, которое видит выделенным.
 *
 * СПИСОК ПРИХОДИТ УЖЕ ОТФИЛЬТРОВАННЫМ, и каждая строка несёт СВОЙ индекс в полном массиве
 * `callouts`: leaf-запись `callouts.N.description` и `selected` адресуют по нему, и панель,
 * пересчитавшая индексы от видимого списка, писала бы текст в чужое указание.
 */

/** Одна строка массива `callouts` как её видит ФОРМА (`z.input`: поля необязательны). */
export type RailCallout = NonNullable<TechCardFormData['callouts']>[number];

export type CalloutRailRow = {
  /** Индекс строки В МАССИВЕ ФОРМЫ — им идёт и запись, и адресация выбора. Не позиция в списке. */
  index: number;
  c: RailCallout;
  /**
   * Где стоит указание — имя плиты у листа, «picture N» у доски. `null`/пусто — сказать нечего,
   * и пилюли тогда нет вовсе: пустая пилюля читается как поломанная подпись.
   */
  where?: string | null;
};

/**
 * ═══ ПИКТОГРАММА ВИДА УКАЗАНИЯ В СТРОКЕ (C-2) ═══════════════════════════════════════════════════
 *
 * Владелец: «в этом меню пиктограмкой помечать какой это вид колаута кривая там линия и тд».
 *
 * ВИД ЧИТАЕТСЯ ИЗ РЕЕСТРА (`kindDef`), И ГЛИФ КЛЮЧУЕТСЯ ЕГО ПОЛЕМ `tool` — тем же, каким палитра
 * сводит виды хранения к чипам: `dim` и `bracket` дают один глиф линии, `label` и `multi` — один
 * глиф записки. Ярлык и подсказка — тоже реестра: переименует его соседняя волна («line»,
 * «curve») — переименуется и здесь, без правки этого файла. Незнакомый вид рисуется словом, а не
 * пустотой: реестр отвечает пином на всё неизвестное, и глиф пина у него есть.
 */
export function KindGlyph({ kind }: { kind: string }) {
  const def = kindDef(kind);
  const tool = def.tool;
  const common = {
    viewBox: '0 0 12 12',
    'aria-hidden': true as const,
    className: 'h-3 w-3 shrink-0',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.25,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  const glyph =
    tool === 'label' ? (
      <svg {...common}>
        <path d='M1.5 10.5 6 6' />
        <rect x='5.5' y='1.5' width='5' height='4' />
      </svg>
    ) : tool === 'dim' ? (
      <svg {...common}>
        <path d='M1.5 6h9M1.5 3.5v5M10.5 3.5v5' />
      </svg>
    ) : tool === 'arc' ? (
      <svg {...common}>
        <path d='M1.5 9.5C3 2 9 2 10.5 9.5' />
      </svg>
    ) : tool === 'polygon' ? (
      <svg {...common}>
        <path d='M2 3.5 8 1.5l2.5 5.5L6 10.5 1.5 8z' />
      </svg>
    ) : tool === 'ink' ? (
      <svg {...common}>
        <path d='M1.5 8C3 2 5 10 7 5s3 4 3.5-2' />
      </svg>
    ) : tool === 'pin' ? (
      <svg {...common}>
        <circle cx='6' cy='6' r='3.5' />
        <circle cx='6' cy='6' r='1' fill='currentColor' />
      </svg>
    ) : null;
  return (
    <span
      data-callout-kind={tool}
      title={`${def.label} — ${def.hint}`}
      aria-label={def.label}
      className='inline-flex h-4 w-4 shrink-0 items-center justify-center text-labelColor'
    >
      {glyph ?? (
        <Text size='nano' variant='label' component='span'>
          {def.label}
        </Text>
      )}
    </span>
  );
}

export function CalloutRail({
  rows,
  selected,
  onSelect,
  hoverIndex,
  onHover,
  disabled,
  onRemove,
  arrows,
  focusToken = 0,
  numbered = true,
  detailFields = true,
  caps = false,
  emptyLabel,
}: {
  rows: CalloutRailRow[];
  selected: number | null;
  onSelect: (index: number | null) => void;
  /**
   * НАВЕДЕНИЕ НА СТРОКУ (C-2) — индекс формы, как у выбора. Мышью И фокусом: у клавиатуры ховера
   * не бывает, и подсветка только для мыши была бы органом не для всех (тот же довод, что у
   * `hoverNotes` поверхности).
   */
  hoverIndex: number | null;
  onHover: (index: number | null) => void;
  disabled?: boolean;
  /** Удалить указание целиком, или `undefined` — и двери нет: на выпущенной карточке её и не должно быть. */
  onRemove?: (index: number) => void;
  /**
   * ЛУЧИ ВЫБРАННОЙ ЗАПИСКИ. Считаются ОДНОЙ функцией с кадром (`noteArrowsOf`): ответ на вопрос
   * «есть ли у этого указания лучи» обязан совпадать на всех экранах.
   */
  arrows?: NoteArrows;
  /**
   * Просьба поставить курсор в правку выбранной строки: растёт по жесту выбора на картинке.
   *
   * СЧЁТЧИКОМ, А НЕ ФЛАГОМ. Данные строки приходят из `useWatch`, то есть новой ссылкой на каждую
   * запись под формой: наводись фокус «при изменении выбранного», он уезжал бы сюда из любого
   * другого поля экрана после первого набранного символа. Число меняется РОВНО в жесте выбора.
   */
  focusToken?: number;
  /**
   * НОМЕР В СТРОКЕ. У листа он есть и он АДРЕС: им деталь кроя называет свою выноску, им операция
   * ссылается на мерку, его печатает тех-пак. У мудбордной пометки номера нет вовсе (см. шапку
   * `mood-callouts.tsx`), и колонка с прочерком в каждой строке рисовала бы адрес, которого не
   * существует.
   */
  numbered?: boolean;
  /**
   * ДЕТАЛЬ И РАЗМЕР. Поля листа: указание называет деталь кроя и мерку. Мудбордная пометка — про
   * настроение, у неё этих полей нет, и пустая пара инпутов просила бы заполнить несуществующее.
   */
  detailFields?: boolean;
  /**
   * ВЫБОР НАКОНЕЧНИКА (D-19/D-20). Пара «вид хранения + caps» пишется ЦЕЛИКОМ, одной записью:
   * скоба в хранении — `bracket` без caps, и записать только `caps` значило бы молча превратить
   * нарисованные стрелки в засечки.
   */
  caps?: boolean;
  /** Что стоит вместо списка, когда указаний нет. Своё у каждого экрана: жест постановки разный. */
  emptyLabel: string;
}) {
  if (rows.length === 0) {
    return (
      <Text size='micro' variant='label' component='p' data-callout-rail-empty=''>
        {emptyLabel}
      </Text>
    );
  }

  return (
    <div data-callout-rail=''>
      {rows.map(({ c, index, where }) => {
        const open = selected === index;
        const hot = hoverIndex === index;
        const place = (where ?? '').trim();
        return (
          <div
            key={index}
            data-callout-row={index}
            data-callout-hot={hot ? 'true' : undefined}
            /* СТРОКА ПОД КУРСОРОМ ЗАЛИВАЕТСЯ ПАНЕЛЬЮ (`bgSecondary` — «a fill, not a container»),
               а картинка в тот же миг подсвечивает указание: два конца одного жеста. */
            className={cn('border-b border-hairline py-1 px-1 -mx-1', hot && 'bg-bgSecondary')}
            onPointerEnter={() => onHover(index)}
            onPointerLeave={() => onHover(null)}
            onFocusCapture={() => onHover(index)}
            onBlurCapture={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onHover(null);
            }}
          >
            <div className='flex items-center gap-2'>
              {numbered && (
                <Text size='nano' variant='uppercase' component='span' className='w-5 shrink-0'>
                  {c.number || '—'}
                </Text>
              )}
              <KindGlyph kind={c.kind ?? 'pin'} />
              <button
                type='button'
                onClick={() => onSelect(open ? null : index)}
                aria-expanded={open}
                className='min-w-0 flex-1 cursor-pointer text-left'
              >
                <Text size='micro' component='span' className='block truncate'>
                  {(c.description ?? '').trim() || (c.part ?? '').trim() || 'no text'}
                </Text>
              </button>
              {place ? <Pill tone='mut'>{place}</Pill> : null}
            </div>

            {open && (
              <CalloutEditRow focusToken={focusToken} index={index}>
                <CalloutRowBody
                  index={index}
                  c={c}
                  disabled={disabled}
                  onRemove={onRemove}
                  arrows={arrows}
                  detailFields={detailFields}
                  caps={caps}
                />
              </CalloutEditRow>
            )}
          </div>
        );
      })}
      {/* ⚠ ЗАМЫКАЮЩЕГО АБЗАЦА ПОД СПИСКОМ БОЛЬШЕ НЕТ — снят владельцем (круг 20, B-7), дословно:
          «убрать текст "The server takes a cut
          piece's name from its callout text, and paper always
          prints these — the current ones, never a frozen copy. A deleted number leaves a hole;
          numbers are never reused"».

          ЧТО ОН ГОВОРИЛ И ГДЕ ЭТО ОСТАЛОСЬ. Три утверждения. «Номер не переиспользуется» стоит на
          самой двери, которая дыру и делает: `title` кнопки `delete` — «its number is never handed
          to another one», то есть цена названа В МОМЕНТ ЖЕСТА, а не абзацем ниже. «Бумага печатает
          текущий текст, не замороженную копию» — свойство печати, и живёт оно у печати. «Имя детали
          кроя сервер берёт из текста выноски» — правило домена, записанное в самой связке детали и
          выноски (`internal/dto`), а не то, что человеку нужно читать, набирая слово в поле.
          Возвращать абзац сюда — значит вернуть прозу в блок, где владелец её снял. */}
    </div>
  );
}

/**
 * ═══ ТЕЛО ПРАВКИ ОДНОГО УКАЗАНИЯ — ОДИН ОРГАН, ДВА МЕСТА МОНТАЖА ════════════════════════════════
 *
 * Здесь лежит ВСЁ, чем указание правят: текст, деталь и мерка листа, ряд оформления (цвет, пунктир,
 * штриховка, наконечник), удаление и «+ point». Тело жило внутри `CalloutRail` и раскрывалось
 * строкой; вынесено оно ради ВТОРОГО места монтажа — увеличенного вида (`renderZoomEditor` у
 * `FocusedAnnotator`).
 *
 * ⚠ ЭТО НЕ ВТОРОЙ РЕДАКТОР И НЕ ВОЗВРАЩЁННАЯ «БРОВЬ» (B-9). Увеличенный вид — это Radix `Dialog`:
 * оверлей, модальность и ловушка фокуса. Пока правка жила ТОЛЬКО в боковом меню, открытый зум делал
 * её недостижимой физически — просьба поставить курсор уезжала в textarea ЗА оверлеем, и фокус-скоуп
 * немедленно утаскивал его обратно; поставленную в зуме записку нельзя было ни назвать, ни покрасить,
 * ни удалить, не закрыв окно. А ставят указание по миллиметровой детали именно в зуме.
 *
 * Поэтому орган ОДИН (этот файл, эта функция), а мест монтажа два, и одновременно достижимо ровно
 * одно: пока диалог открыт, меню за ним недостижимо по построению модалки. Второй КОПИИ правил —
 * того, что B-9 и звал «двумя расходящимися местами», — здесь не заводится: пара «вид + caps»
 * пишется одной записью в единственном экземпляре ниже.
 *
 * ЗАПИСЬ — ЛИСТОВАЯ, ПО ТОЧЕЧНОМУ ПУТИ (`callouts.3.description`): она не трогает идентичность
 * массива, поэтому не рассинхронизирует соседние `useFieldArray` над `callouts`. Единственное
 * исключение — удаление строки, и оно передаётся сюда пропом от владельца массива.
 */
export function CalloutRowBody({
  index,
  c,
  disabled,
  onRemove,
  arrows,
  detailFields = true,
  caps = false,
}: {
  /** Индекс строки В МАССИВЕ ФОРМЫ — им идёт запись. Не позиция в видимом списке. */
  index: number;
  c: RailCallout;
  disabled?: boolean;
  onRemove?: (index: number) => void;
  arrows?: NoteArrows;
  detailFields?: boolean;
  caps?: boolean;
}) {
  const form = useFormContext<TechCardFormData>();

  // ОДНА leaf-запись на все поля строки, включая оформление: путь `callouts.N.field` не трогает
  // идентичность массива, поэтому соседние читатели пути не рассинхронизируются.
  const write = (
    field: 'description' | 'part' | 'dimensions' | 'color' | 'dashed' | 'filled',
    value: string | boolean,
  ) => {
    form.setValue(`callouts.${index}.${field}` as never, value as never, { shouldDirty: true });
  };

  return (
    <>
      {/* CONTROLLED, NOT DEFAULT-VALUED, and the difference is a bug that would only
          show up after a successful save. The page resets the form to what the SERVER
          returned (`form.reset(settled.values)` — and the mint does the same), and an
          uncontrolled field keeps whatever was typed into it: the screen would go on
          showing a note the card no longer holds, with nothing saying so. The value is
          read back through the same `useWatch` that feeds this list, so a draft restore
          and an undo land here too. */}
      <Textarea
        name={`callout-${index}-description`}
        value={c.description ?? ''}
        disabled={disabled}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
          write('description', e.target.value)
        }
      />
      {detailFields && (
        <div className='flex gap-1'>
          <Input
            name={`callout-${index}-part`}
            value={c.part ?? ''}
            disabled={disabled}
            placeholder='part'
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => write('part', e.target.value)}
          />
          <Input
            name={`callout-${index}-dimensions`}
            value={c.dimensions ?? ''}
            disabled={disabled}
            placeholder='dimensions'
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              write('dimensions', e.target.value)
            }
          />
        </div>
      )}
      {/* ЦВЕТ · ПУНКТИР · ШТРИХОВКА — ТОТ ЖЕ РЯД, ЧТО В РЕДАКТОРЕ ПОД КАДРОМ, а не второй
          набор свотчей: указание красят одинаково, где бы оно ни стояло. Правка стиля
          запоминается ПЕРОМ, поэтому следующее указание родится тем же цветом — у
          человека одна рука, и серия штрихов одним цветом не должна перекрашиваться
          поштучно. */}
      {!disabled && (
        <AnnotationStyleRow
          kind={c.kind ?? 'pin'}
          color={c.color ?? ''}
          dashed={!!c.dashed}
          filled={!!c.filled}
          caps={c.caps ?? ''}
          onColor={(v) => {
            rememberPen({ color: v });
            write('color', v);
          }}
          onDashed={(v) => {
            rememberPen({ dashed: v });
            write('dashed', v);
          }}
          onFilled={(v) => {
            rememberPen({ filled: v });
            write('filled', v);
          }}
          onCaps={
            caps
              ? (next, chosen) => {
                  // Перо помнит ВЫБРАННОЕ (`chosen`), а не хранимое: скоба хранится как
                  // `bracket` без caps, и помнить `''` значило бы забыть выбор.
                  rememberPen({ caps: chosen });
                  form.setValue(`callouts.${index}.kind`, next.kind as AnnotationKind, {
                    shouldDirty: true,
                  });
                  form.setValue(`callouts.${index}.caps`, next.caps as AnnotationCaps, {
                    shouldDirty: true,
                  });
                }
              : undefined
          }
        />
      )}
      <div className='flex flex-wrap items-center gap-1.5'>
        {onRemove && (
          <Button
            variant='secondary'
            size='xs'
            onClick={() => onRemove(index)}
            title='delete this callout — its number is never handed to another one'
          >
            delete
          </Button>
        )}
        {/* НА МЕСТЕ «MAKE IT A PIN» — «+ POINT», И ЭТО ОБМЕН, А НЕ ДВЕ ПРАВКИ.
            Убрана она вместе с «make it a point» редактора (E-27): жест один, имён было
            два, и оставленная здесь кнопка вернула бы на соседний экран ровно то, что
            владелец убрал. Смысла у неё тоже не осталось — пин ушёл из палитры (E-29).
            Пришедшая на её место кнопка добавляет записке ещё один луч и заменяет собой
            весь бывший «мультилидер». */}
        {arrows &&
          (arrows.arming ? (
            <Button
              variant='secondary'
              size='xs'
              data-arrows='cancel'
              onClick={arrows.cancel}
              title='stop waiting for the click'
            >
              cancel
            </Button>
          ) : (
            <Button
              variant='secondary'
              size='xs'
              data-arrows='add'
              disabled={arrows.full}
              onClick={arrows.arm}
              title={
                arrows.full
                  ? `a note points at ${arrows.max} places at most`
                  : 'point this note at one more place — then click it on the picture'
              }
            >
              + point
            </Button>
          ))}
        {/* ⚠ СТРОКИ ПРО ПЕРЕТАСКИВАНИЕ ЗДЕСЬ БОЛЬШЕ НЕТ — снята владельцем (круг 20,
            B-6), дословно: «убрать текст "shape and position
            are dragged on the plate itself"». Счёт лучей при этом НЕ потерян: он уехал
            в пилюлю рядом, потому что это ФАКТ о выбранной записке («сколько мест она
            называет»), а не объяснение жеста. Сам жест — перетаскивание фигуры и её
            плашки — живёт на кадре и объявляется курсором, ручками и подсказками самой
            поверхности; повторять его словом в панели значило бы держать инструкцию
            там, где инструмента нет. */}
        {arrows && arrows.count > 1 && <Pill tone='mut'>{arrows.count} points</Pill>}
      </div>
    </>
  );
}

/**
 * Раскрытая строка указания: якорь для серверного отказа И место, куда приезжает курсор.
 *
 * ЯКОРЬ. `data-field` — канонный адрес этого указания, и ЕДИНСТВЕННЫЙ: поверхность своего не
 * ставит, поэтому `revealField('callouts.N.description')` приходит именно сюда.
 *
 * КУРСОР. Ставится ТОЛЬКО по жесту выбора (счётчик меняется у владельца), а не при каждом изменении
 * данных строки: значения приходят из `useWatch`, то есть новой ссылкой на каждую запись под
 * формой, — фокус, наведённый «по изменению», уезжал бы сюда из любого другого поля экрана после
 * первого набранного символа.
 */
function CalloutEditRow({
  focusToken,
  index,
  children,
}: {
  focusToken: number;
  index: number;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focusToken === 0) return;
    ref.current?.querySelector<HTMLElement>('textarea, input')?.focus();
  }, [focusToken]);
  return (
    <div ref={ref} className='mt-1 space-y-1' data-field={`callouts.${index}.description`}>
      {children}
    </div>
  );
}
