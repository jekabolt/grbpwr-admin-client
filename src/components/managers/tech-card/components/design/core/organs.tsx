import type { googletype_Decimal } from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';
import { formatMoney } from '../generation/money';

/**
 * THE STUDIO'S SHARED ORGANS — the small things every band screen draws and used to spell for
 * itself. Nothing here carries state or reads the wire; each organ is a printer over the app's own
 * primitives (`Pill`, `Text`), so the skin stays the skin of `ui/components`.
 */

/**
 * ═══ ОДНО СЛОВО СОСТОЯНИЯ ПУСТОГО СЛОТА НА ВСЮ СТУДИЮ ════════════════════════════════════════
 *
 * Ленты студии рисуют ОДИН И ТОТ ЖЕ факт — «в этой ячейке ничего не стоит», — и до этой правки
 * называли его двумя словами: `empty` во флэтах, паттерне и артефактах, `nothing marked` в
 * таблице SIDES. Два слова на одно состояние читаются как ДВА РАЗНЫХ состояния: человек,
 * увидевший на соседних экранах «empty» и «nothing marked», честно ищет между ними разницу,
 * которой нет.
 *
 * СЛОВО ЖИВЁТ ЗДЕСЬ, А НЕ В КАЖДОЙ ЛЕНТЕ, ровно затем, чтобы следующее расхождение было
 * невыразимо: второе написание пришлось бы завести руками и против этой записки.
 *
 * ЧТО ЭТО НЕ: не подпись ДВЕРИ и не совет. Дверь у каждой ленты своя («mark one», «fill it on
 * FABRIC RENDER»), и она стоит рядом со словом, а не вместо него.
 */
export const EMPTY_WORD = 'empty';

/**
 * `2 of 6 sides` / `7 pictures` — a read-only count as a Pill.
 *
 * `noun` is the SINGULAR; the plural is `noun + 's'` unless `plural` says otherwise. With `total`
 * the plural follows the total (`1 of 6 sides`), without it — the count (`1 picture`).
 *
 * ZERO IS THE `gap` TONE — DASHED GREY, NEVER RED. The mock-up's own rule (`_core.js` `counter`:
 * `pill(text, n ? '' : 'gap')`, and the note beside it: «gap значит „не хватает" и НЕ красный:
 * красный в этом админе значит убыток»), and the owner's, seeing the beta paint every empty
 * count red on all seven steps. An empty list is not a loss and not a fault; it is a place not
 * reached yet, and the dashed edge is the mark every empty cell and «+ add» chip already wears.
 * `warn` on this organ used to lean on `colour-plan/parts-row.tsx`, which paints an unassigned
 * colour red — that one IS a fault of the recipe (a run cannot start without it), so it keeps
 * its red; a count of zero is not.
 */
export function Counter({
  n,
  noun,
  plural,
  total,
  className,
  title,
}: {
  n: number;
  noun: string;
  plural?: string;
  total?: number;
  className?: string;
  title?: string;
}) {
  const many = plural ?? `${noun}s`;
  const word = (total ?? n) === 1 ? noun : many;
  return (
    <Pill tone={n === 0 ? 'gap' : 'mut'} className={className} title={title}>
      {total != null ? `${n} of ${total} ${word}` : `${n} ${word}`}
    </Pill>
  );
}

/**
 * One line for an empty LIST — not an empty form. A form's blank field is its own affordance; a
 * list with nothing in it has to say so in words, or the screen reads as broken.
 *
 * `action` is the one door that fills the list (a button, a chip); it sits after the sentence.
 */
export function EmptyState({
  children,
  action,
  className,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-baseline gap-2', className)}>
      <Text size='micro' variant='label' component='p' className='min-w-0'>
        {children}
      </Text>
      {action && <div>{action}</div>}
    </div>
  );
}

/**
 * The price of ONE run, as `generation/money.ts` speaks it.
 *
 * THE RULE OF THAT FILE HOLDS HERE: an absent decimal is «not stated», never zero, and this organ
 * NEVER prints `$0.00` for it. When the amount is stated, the amount is printed and `note` is
 * dropped — a price and «priced later» cannot both be true.
 *
 * WHEN THE AMOUNT IS NOT STATED the organ prints `note` instead — by default the band's own
 * pre-run sentence, `priced by the server when the run starts`, which already stands verbatim on
 * the generate row, the construction draft and the pattern studio. That default is for the
 * POSITION BEFORE A RUN, where no price can exist yet. A reader of a FINISHED row — where an absent
 * price means «this account may not see it» (costing-shaped fields are stripped without
 * `costing:read`) — passes `note={null}` and the organ renders nothing at all, as money.ts asks.
 */
export const PRICED_LATER = 'priced by the server when the run starts';

export function Money({
  value,
  currency,
  note = PRICED_LATER,
  className,
  ...rest
}: {
  value?: googletype_Decimal | null;
  currency?: string | null;
  /** `null` = say nothing when the amount is not stated. */
  note?: string | null;
  className?: string;
  [k: string]: unknown;
}) {
  const money = formatMoney(value, currency);
  if (!money && note == null) return null;
  return (
    <Text
      size='micro'
      variant='label'
      component='span'
      className={cn('min-w-0', className)}
      {...rest}
    >
      {money || note}
    </Text>
  );
}

/**
 * ═══ ДВА ЗАЗОРА ГРУППЫ — ОДИН ИСТОЧНИК НА ВСЮ СТУДИЮ ════════════════════════════════════════
 *
 * Владелец: «больший отступ от хединга группы вниз к содержимому, как в CARD DETAILS». Три
 * экрана уже сделали этот отступ ТРЕМЯ разными числами (20 / 24 / 16px) — то есть один и тот же
 * зазор назывался тремя. Эталон — CARD DETAILS, и обе величины живут здесь.
 *
 * `GROUP_GAP` — «линейка группы → первый ряд содержимого». Задаётся на САМОМ `GroupLabel`
 * (`className={GROUP_GAP}`), а не на том, что идёт следом: тогда зазор не зависит от того, какой
 * орган открывает группу, и его не нужно повторять в каждом ряду. `mb-3` (12px) вместо
 * собственного `mb-1` примитива — `cn`/twMerge разрешает пару `mb-*` в пользу переданного.
 * 12px — ступень «подпись к своему содержимому» по DESIGN.md: заметно больше, чем внутренний шаг
 * рядов (10px), и заметно меньше шва между группами.
 *
 * ⚠ `GROUP_GAP` — margin-bottom на лейбле, `GROUP_SEAM` — `[&>*]:mb-0` на ПРЯМЫХ детях секции.
 * Они не конфликтуют ровно потому, что `GroupLabel` лежит внутри обёртки группы, а не прямым
 * ребёнком секции. Прижав лейбл прямо к секции, вы обнулите его зазор молча.
 */
export const GROUP_GAP = 'mb-3';

/**
 * `GROUP_SEAM` — ОДИН ШОВ МЕЖДУ ГРУППАМИ БЛОКА, 20px, одинаковый на всех стыках.
 *
 * Владелец: «между IDENTIFICATION, CLASSIFICATION, BASE MODEL & SAMPLE SIZE и RESPONSIBLE ROLES
 * с LINKED PRODUCTS сделай чуть больше гэп, чтобы не казалось так скучено».
 *
 * До этого зазор рисовали ДВА разных органа: `space-y-stack` секции (10px) и `mt-3` у
 * неприжатого `GroupLabel` (12px, схлопывался с соседним, а не складывался). Отсюда 10 / 12 / 12
 * / 10 — четыре шва трёх разных весов, что и читалось как «скучено» и неровно. Здесь шов один и
 * задаётся ОДНИМ классом на самой секции: `mt` сверху у каждого ребёнка кроме первого и снятый
 * `mb` у всех (иначе к 20px прибавились бы 10px от `space-y-stack`). Утилиты `space-y-*` в
 * tailwind v4 завёрнуты в `:where(...)` — нулевая специфичность, поэтому обе строки ниже их
 * честно перекрывают, а не «случайно выигрывают порядком».
 *
 * 20px, а не 24px: 24px — это `--spacing-gutter`, зазор МЕЖДУ блоками. Группы внутри блока обязаны
 * дышать слабее, чем блоки между собой, иначе одна коробка читается как четыре.
 *
 * Все `GroupLabel` внутри — `flush`: свой `mt-3` они больше не приносят, вес шва живёт в одном
 * месте.
 */
export const GROUP_SEAM = '[&>*+*]:mt-5 [&>*]:mb-0';
