import { useEffect, useRef, useState } from 'react';

import { cn } from 'lib/utility';
import { SectionHeader } from 'ui/components/section-header';
import Text from 'ui/components/text';
import { Arrow } from 'ui/icons/arrow';

/**
 * THE block — the unit every screen in this admin is built from.
 * See DESIGN.md → "1. Overview" and "5. Components → The Block".
 *
 * White stock (`bg-bgColor`) inside a 1px outer edge (`border-borderColor`), sitting on the
 * grey page ground. Three things about it are not style preferences:
 *
 *  1. The FILL is load-bearing. A bordered box without `bg-bgColor` lets the grey ground show
 *     straight through its contents, and data stops reading as data. Six managers shipped that
 *     bug (`border border-textInactiveColor p-4` with no background) before this primitive
 *     existed.
 *  2. The GUTTER is the divider. Blocks are separated by 24px of ground, never by a drawn line
 *     — both neighbours already carry their own outline, so a rule in the gutter renders as a
 *     triple line. Use `SectionStack`.
 *  3. A block NEVER contains another block. Sub-structure is `GroupLabel` + `Row`, i.e. ruled
 *     weights, not a second border+fill. Box-in-box is the single most visible way to miss
 *     this design.
 *
 * The title sits on a 2px ink rule (`SectionHeader`), not on an 18px heading. `question` is the
 * grey trailing clause saying what the block is FOR — use it; it is most of why this product
 * reads as explained rather than merely labelled.
 */
export function Section({
  title,
  question,
  action,
  id,
  className,
  headerClassName,
  collapsible = false,
  defaultOpen = true,
  children,
}: {
  /** Omit for an untitled block (a bare panel of controls). */
  title?: string;
  /** Grey trailing clause: what this block is for. */
  question?: React.ReactNode;
  /** Right-aligned control in the header rule (a button, a count, a filter). */
  action?: React.ReactNode;
  /** Anchor id, for screens with an in-page section nav. */
  id?: string;
  className?: string;
  headerClassName?: string;
  /** Secondary blocks on a long form can start closed to keep it scannable. */
  collapsible?: boolean;
  /**
   * Followed live, so a caller can pass a derived value ("open while there's data in it").
   * An explicit toggle by the user wins from then on and is never fought by the data.
   */
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [manual, setManual] = useState<boolean | null>(null);
  const open = manual ?? defaultOpen;
  const isOpen = !collapsible || open;

  /**
   * ⚠ ФОКУС ПЕРЕЕЗЖАЕТ ЗА ДВЕРЬЮ, ПОТОМУ ЧТО ДВЕРЬ — ДВА РАЗНЫХ УЗЛА.
   *
   * Свёрнутый блок — это отдельное дерево (вся коробка есть кнопка), развёрнутый — шапка со
   * значком справа. Значит нажатие РАЗМОНТИРУЕТ ту самую кнопку, на которой стоял фокус, и
   * браузеру некуда его деть: он уезжает в `<body>`. Замерено на живом блоке: до нажатия
   * `BUTTON[data-section-toggle]`, после — `BODY`; следующий Tab начинается с начала документа.
   * До круга 17 обе позы рисовала ОДНА кнопка («− hide» / «+ show»), и вопроса не возникало.
   *
   * Поэтому фокус переносится руками и ТОЛЬКО когда переключил человек: `moved` ставится в
   * обработчике, а не выводится из смены состояния. Иначе блок, который открылся сам (данные
   * приехали, `defaultOpen` стал истинным), воровал бы фокус у того, кто в этот момент печатает.
   */
  const door = useRef<HTMLButtonElement | null>(null);
  const moved = useRef(false);
  const toggle = () => {
    moved.current = true;
    setManual(!open);
  };
  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    door.current?.focus();
  }, [isOpen]);

  /**
   * СВЁРНУТЫЙ БЛОК — ОДНА СТРОКА И ОДНА ДВЕРЬ (F-2 круга 17, дословно: «в свернутом варианте
   * GENERATION HISTORY должен быть только текст GENERATION HISTORY и стрелочка и все и анколапс
   * просходит на любое нажатие на бокс не только на стрелочку»).
   *
   * ЭТО ПРАВИЛО ПРИМИТИВА, А НЕ ОДНОГО ЭКРАНА. Свёрнутая коробка существует, чтобы её можно было
   * пропустить глазом; счётчики, подзаголовок и вторые кнопки в ней — это содержимое, которое
   * человек как раз и убрал. Поэтому здесь не прячется «лишнее», а не рисуется НИЧЕГО, кроме
   * имени и знака.
   *
   * ⚠ ЗДЕСЬ БЫЛ `collapsedNote` — ЕДИНСТВЕННОЕ ИСКЛЮЧЕНИЕ «РАДИ ДЕНЕГ», И ЕГО БОЛЬШЕ НЕТ.
   * Свёрнутая лента генераций печатала маркер идущего прогона (`run N now`), чтобы человек не
   * нажал GENERATE второй раз и не заплатил дважды. Владелец, круг 19, дословно: «в свернутом
   * варианте GENERATION HISTORY должен быть только текст GENERATION HISTORY и стрелочка и все».
   * Слово владельца сильнее пробы E21-7, поэтому проп снесён целиком — вместе с типом и
   * отрисовкой, а не спрятан за флагом: иначе он вернётся следующим вызывающим.
   *
   * ⚠ ТРИ «КОМПЕНСАЦИИ», КОТОРЫЕ ЗДЕСЬ ПЕРЕЧИСЛЯЛИСЬ, НЕ СУЩЕСТВОВАЛИ, И ЭТО СТОИЛО ДЕНЕГ.
   * Прежняя редакция этого абзаца утверждала, что живой прогон «по-прежнему называют» (1) строка
   * `LiveLine` студии, (2) подпись кнопки `starting…` и (3) развёрнутый `action` этой же секции.
   * Проверено по репозиторию, а не по памяти: `LiveLine` в `src/` НЕТ НИ ОДНОЙ (единственное
   * вхождение слова было в этом самом комментарии); `starting…` висит на `run.isPending`, то есть
   * на полёте МУТАЦИИ (`use-design-run.ts`), и гаснет в момент, когда прогон только ЗАБРОНИРОВАН;
   * `action` свёрнутая коробка не рисует по построению, а обе истории смонтированы
   * `defaultOpen={false}`. То есть на FABRIC RENDER и на 3D признака прогона в полёте не
   * оставалось ВООБЩЕ: снекбар гас, кнопка возвращалась в `GENERATE`, второе нажатие минтило новый
   * `client_request_id` и покупало ВТОРОЙ ПЛАТНЫЙ ПРОГОН.
   *
   * ЧЕМ ЗАКРЫТО (круг 19). Не возвратом маркера в шапку — его владелец и снял, — а ФОРМОЙ ОТВЕТА
   * там, где ответ появится: пунктирная ячейка живого прогона стоит в голове полосы выходов на
   * обоих экранах (`render/outputs.tsx`, `PendingCell`; тем же приёмом, что `PendingTile` на
   * экране паттернов). Свёртка прячет ленту, а не прогон, — но говорит это теперь другой орган, и
   * ПРАВИЛО ЭТОГО ПРИМИТИВА НА НЕГО НЕ ОПИРАЕТСЯ: свёрнутая коробка обязана молчать в любом
   * случае.
   *
   * И ВСЯ КОРОБКА — КНОПКА, а не один значок в углу. Это безопасно ровно потому, что в свёрнутом
   * виде внутри неё нет ни одного другого интерактивного органа: `action` не отрисован, дети не
   * смонтированы. В РАЗВЁРНУТОМ виде так делать нельзя — там в шапке живут чужие кнопки
   * (`archived ▸` у истории генераций), и кнопка внутри кнопки это невалидная разметка, которую
   * браузер чинит на свой вкус.
   *
   * Заголовок обязателен: без него это не «свёрнутый блок», а коробка без двери — старое
   * поведение (дети скрыты, открыть нечем) сохранено как есть, чтобы не выдумывать дверь там,
   * где вызывающий её не просил.
   */
  if (collapsible && !isOpen && title) {
    return (
      <section id={id} className={cn('border border-borderColor bg-bgColor', id && 'scroll-mt-20', className)}>
        <button
          ref={door}
          type='button'
          onClick={toggle}
          aria-expanded={false}
          aria-controls={id}
          data-section-collapsed=''
          className='group flex w-full cursor-pointer items-center justify-between gap-2 p-block text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor'
        >
          <Text
            component='h3'
            variant='uppercase'
            tracking='section'
            className='min-w-0 break-words font-bold'
          >
            {title}
          </Text>
          <Arrow aria-hidden className='shrink-0 rotate-180 text-labelColor group-hover:text-textColor' />
        </button>
      </section>
    );
  }

  return (
    <section
      id={id}
      className={cn(
        'space-y-stack border border-borderColor bg-bgColor p-block',
        id && 'scroll-mt-20',
        className,
      )}
    >
      {title && (
        <SectionHeader
          title={title}
          question={question}
          className={headerClassName}
          action={
            collapsible ? (
              <>
                {action}
                {/* ЗНАК ОДИН И ТОТ ЖЕ В ОБОИХ СОСТОЯНИЯХ — стрелка, а не пара слов «− hide» /
                    «+ show». Слова были ДВУМЯ разными органами на одном месте: закрывающий и
                    открывающий, и человек читал их как две разные кнопки. Стрелка — тот же самый
                    знак, что уже несёт `FieldsGroup`, повёрнутый на 180°. */}
                <button
                  ref={door}
                  type='button'
                  onClick={toggle}
                  aria-expanded
                  aria-controls={id}
                  aria-label='collapse'
                  data-section-toggle=''
                  className='group cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-textColor'
                >
                  {/* Поворота здесь нет и быть не может: эта ветка рисуется только раскрытой —
                      свёрнутую перехватывает ранний возврат выше. */}
                  <Arrow aria-hidden className='shrink-0 text-labelColor group-hover:text-textColor' />
                </button>
              </>
            ) : (
              action
            )
          }
        />
      )}
      {isOpen && children}
    </section>
  );
}

/**
 * The stack of blocks on a page: `--spacing-gutter` (24px) of ground between each, which is the
 * only divider this design has.
 *
 * Use this instead of a hand-written `flex flex-col gap-N`. The gutter is a semantic value, not
 * a whim — before it was a token it had drifted across gap-2.5 / gap-3 / gap-4 / gap-6, so the
 * same divider read at four different weights depending on which screen you were on.
 *
 * `row` lays the blocks side by side from `lg` up (stacked below it), for the common
 * two-column header/detail pairing.
 */
export function SectionStack({
  row,
  hidden,
  className,
  children,
}: {
  /** Side by side from `lg` up, stacked below. */
  row?: boolean;
  /**
   * Tab panels are the dominant page shape in this admin and they stay mounted (form state
   * lives across tabs), so the stack has to be hideable without a wrapper div. Tailwind's
   * preflight applies `display: none !important` to `[hidden]`, so it wins over `flex`.
   */
  hidden?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      hidden={hidden}
      className={cn('flex flex-col gap-gutter', row && 'lg:flex-row lg:items-start', className)}
    >
      {children}
    </div>
  );
}
