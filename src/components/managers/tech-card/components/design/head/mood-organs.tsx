import { type JSX, type ReactNode } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';

import { useCardMemory } from './use-draft-fills';

/**
 * ═══ ОРГАНЫ ШАГА MOODBOARD, ОБЩИЕ ДЛЯ ЕГО ШЕСТИ БЛОКОВ ═══════════════════════════════════════════
 *
 * Макет (`_step-mood.js`) рисует три блока выхода — GENERAL INFORMATION, CONSTRUCTION, MATERIAL
 * SLOTS — одними и теми же органами: пилюля `moodboard moved on`, пилюля `drafted` (волна 25.09:
 * одна, синяя, из контракта `drafted-contract.ts`), полоса `LOCKED …` с дверью, раскрытие
 * `show ▸ / hide ▾`.
 * У продукта их не было, а три копии по трём файлам разошлись бы на первой же правке — поэтому
 * они лежат здесь, ОДИН раз, поверх примитивов `ui/components`.
 *
 * ⚠ ПИЛЮЛИ `from the moodboard` ЗДЕСЬ БОЛЬШЕ НЕТ (r3b, M-4). Владелец снял счётчики черновика из
 * шапок GENERAL INFORMATION (рулинг 11) и MATERIAL SLOTS (п. 12), и вместе с ними ушла пилюля
 * источника — `FromMoodboardPill` остался экспортом БЕЗ ЕДИНОГО потребителя во всём `src/`
 * (проверено `rg`). Мёртвый экспорт в общем файле органов опаснее обычного мёртвого кода: он
 * читается как «так принято» и возвращается следующим вызывающим в шапку, из которой его сняли.
 *
 * ⚠ ЭТОТ ФАЙЛ ПРОСИТСЯ В `design/core/` — вместе с `Counter`, `EmptyState`, `Money`. Он лежит в
 * `head/` только потому, что `core/*` заморожен для этой волны; ни состояния провода, ни формы
 * (кроме чтения журнала заполнений) здесь нет.
 *
 * ═══ «DRAFTED» ЧИТАЕТСЯ ИЗ ОДНОГО СОСТОЯНИЯ — КОНТРАКТА `drafted-contract.ts` (волна 25.09) ═══
 *
 * Здесь стояли `useProvenance` и `ProvenancePill` — второй читатель журнала, у каждого органа свой
 * (`drafted` чернилами, `drafted, edited` серым). Волна 25.09 (D-07', ревью Codex B-09) свела
 * пометку к ОДНОМУ состоянию: провайдер `./drafted-provider.tsx` у композитора считает её из
 * журнала против живой формы, органы спрашивают `useDrafted().isLive(key, current)`. Пилюля
 * `DraftedPill` ниже — тот же синий тон, что рамка `DraftedField` (синий = «в полёте, нужен
 * человек»), и она рисуется ровно пока поле не просмотрено. `drafted, edited` снят: правка поля
 * и есть просмотр, и серой пилюле нечего больше утверждать.
 */

/**
 * `moodboard moved on` — доска ушла вперёд после последнего прогона. Флаг пишет черновик
 * (`construction-draft.tsx`, тот же `stale`, что даёт `the moodboard has changed since` в ряду
 * прогона); здесь — только чтение. Тон `attention` — синий «изменилось после», DESIGN.md §2.
 */
export function BoardMovedPill({ techCardId }: { techCardId: number }): JSX.Element | null {
  const { boardMoved } = useCardMemory(techCardId);
  if (!boardMoved) return null;
  return (
    <Pill tone='attention' data-mb-moved=''>
      moodboard moved on
    </Pill>
  );
}

/**
 * `drafted` — поле написано черновиком и человек его ещё не смотрел. С фиксапа волны пилюля живёт
 * в `core/drafted-field.tsx` рядом с рамкой и сама принимает поле (кнопка, M3); здесь — реэкспорт
 * для органов, которые брали её отсюда.
 */
export { DraftedPill } from '../core/drafted-field';

/**
 * `LOCKED  причина  [дверь ›]` — единственная поверхность отказа макета. Продуктовый `LockBar`
 * (`render/generate-row.tsx`) печатает причину без слова `locked`; слово здесь несущее — им полоса
 * отличается от заметки. `CalloutBox`, а не своя рамка: блок в блоке запрещён, а полоса с 1px
 * краем без заливки — единственная форма, которой внутри блока можно.
 */
export function LockedBar({
  reason,
  door,
  className,
  ...rest
}: {
  reason: string;
  door?: ReactNode;
  className?: string;
  [k: string]: unknown;
}): JSX.Element {
  return (
    <CalloutBox tone='note' className={className}>
      <div data-locked-bar='' className='flex flex-wrap items-center gap-2' {...rest}>
        <Text
          size='micro'
          variant='uppercase'
          tracking='label'
          component='span'
          className='shrink-0 font-bold'
        >
          locked
        </Text>
        <Text size='micro' variant='label' component='span' className='min-w-0 flex-1 normal-case'>
          {reason}
        </Text>
        {door}
      </div>
    </CalloutBox>
  );
}

/** Дверь «туда ›» — `xs`-кнопка с хвостовой стрелкой, как `goTo` макета. */
export function GoTo({
  children,
  onClick,
  ...rest
}: {
  children: ReactNode;
  onClick: () => void;
  [k: string]: unknown;
}): JSX.Element {
  return (
    <Button type='button' variant='secondary' size='xs' onClick={onClick} {...rest}>
      {children} ›
    </Button>
  );
}

/**
 * Раскрытие: подпись-линейка `GroupLabel`, справа `show ▸` / `hide ▾`, тело только раскрытым.
 * Состояние у вызывающего — раскрытие, которое надо открыть жестом соседа («записал → покажи
 * журнал»), не может владеть собой.
 */
export function Fold({
  label,
  action,
  open,
  onToggle,
  children,
  className,
  ...rest
}: {
  label: ReactNode;
  action?: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  className?: string;
  [k: string]: unknown;
}): JSX.Element {
  return (
    <div className={className} {...rest}>
      <GroupLabel
        action={
          <span className='flex items-center gap-1.5'>
            {action}
            <Button
              type='button'
              variant='secondary'
              size='xs'
              aria-expanded={open}
              onClick={onToggle}
              data-fold-toggle=''
            >
              {open ? 'hide ▾' : 'show ▸'}
            </Button>
          </span>
        }
      >
        {label}
      </GroupLabel>
      {open && children}
    </div>
  );
}

/** Скролл к органу по селектору — двери `see it on CONSTRUCTION ▸`, `+ picture ›`. */
export function scrollToOrgan(selector: string): void {
  const el = document.querySelector(selector);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
