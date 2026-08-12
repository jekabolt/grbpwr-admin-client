import { StyleCostPriceSource } from 'api/proto-http/admin';
import { Pill } from 'ui/components/pill';
import GenericPopover from 'ui/components/popover';
import Text from 'ui/components/text';

/**
 * ONE vocabulary for the whole costing tab.
 *
 * Before this module the same two states had two names each, in two sections of one tab: the
 * costing block said «строка без цены» / «no FX» / «неполный», and the cost-estimate table below
 * it said «no price» / «no base rate» / «plan (snapshot)». Someone who read the first name and
 * then searched the page for it did not find the row they were sent to fix.
 *
 * The other half of the fix is that provenance and breakage are now TWO AXES, not one row of
 * mixed pills:
 *
 *   откуда цена  — always present, always neutral. Where the number came from.
 *   проблема     — present only when something is broken. Why the line is not in the total.
 *
 * A catalogue price is not a warning, and a missing FX rate is not a provenance. Mixing them in
 * one pill strip is what made a healthy row and a broken row look alike.
 */

/** The problem axis. Two states, two words, everywhere on the tab. */
export const NO_PRICE = 'нет цены';
export const noFx = (currency?: string) => (currency ? `нет курса ${currency}` : 'нет курса');

/** The provenance axis. Neutral by construction — NONE is absence, and absence is a problem, not a source. */
const ORIGIN_LABEL: Partial<Record<StyleCostPriceSource, string>> = {
  STYLE_COST_PRICE_SOURCE_BOM_SNAPSHOT: 'снимок плана',
  STYLE_COST_PRICE_SOURCE_CATALOG_LATEST: 'каталог',
};

/**
 * ОТКУДА ВЗЯЛАСЬ НОРМА РАСХОДА — те же три слова везде на тех-карте.
 *
 * Слова уже стояли на экране (NormSummary в рецепте колорвея); здесь они переехали в общий
 * словарь, потому что их понадобилось назвать во втором месте (полоса себестоимости), а вторая
 * копия трёх строковых литералов — это ровно тот случай, из-за которого этот файл и заведён:
 * одно состояние с двумя именами в двух местах одного экрана.
 *
 * Пустое/«manual» — это НЕ отсутствие источника, а конкретный источник «набрали руками», и
 * называется он вслух: у такого числа нет геометрии, по которой его можно проверить.
 */
const NORM_SOURCE_LABEL: Record<string, string> = {
  marker: 'из раскладки',
  dxf: 'по выкройкам',
};
export const normSourceLabel = (source?: string) =>
  NORM_SOURCE_LABEL[(source ?? '').trim().toLowerCase()] ?? 'введено руками';

/**
 * СТУПЕНЬ ЦИФРЫ — третья ось словаря, рядом с «откуда цена» и «проблема».
 *
 * Оценка снизу — это НЕ проблема строки и не источник цены: строка полна, цена настоящая, а
 * неполон САМ СПОСОБ, которым получен расход. Поэтому у неё своя ось и свои слова, одни на все
 * три поверхности, которые эту цифру показывают: полоса себестоимости (money-panel), вкладка
 * КОСТИНГ (costing-field) и смета построчно (cost-estimate-field). До этого слово «оценка» жило
 * ровно в одном месте — на полосе, — и вкладка, глядя на тот же самый флаг сервера, называла
 * оценку планом и красила по ней маржу зелёным.
 *
 * `has_estimate` — утверждение СЕРВЕРА, а не вывод клиента: он сам отказывается засевать таким
 * числом `product.cost_price`, и это единственный признак, по которому ступень вообще узнаётся.
 */
export const TIER_ESTIMATE = 'оценка снизу';
export const TIER_PLAN = 'план';

/**
 * ПОЧЕМУ ЭТО НИЖНЯЯ ГРАНИЦА — одной фразой, дословно одинаковой везде.
 *
 * Направление ошибки здесь важнее её величины: оценка занижает себестоимость и, значит, ЗАВЫШАЕТ
 * маржу. Человек, который прочтёт «оценка» и решит, что это просто «неточно», ошибётся в сторону,
 * в которую ошибаться дороже всего — согласует цену по цифре, которой не бывает на фабрике.
 */
export const ESTIMATE_WHY =
  'Расход части тканей выведен из геометрии: площадь деталей кроя ÷ раскройную ширину. Это NETTO — ' +
  'межлекальных выпадов, концов настила и стыков в нём нет и быть не может, их знает только ' +
  'раскладка. Настоящая себестоимость ВЫШЕ этой, а маржа — НИЖЕ; поэтому сервер такой цифрой не ' +
  'сеет cost_price продукта, и цель маржи по ней не считается выполненной.';

/**
 * Where a material line's price came from, and when. Renders `—` for NONE rather than a red
 * badge: the fact that there is no price is stated once, in the problem column, and stating it
 * twice in two colours was half of why the old table was hard to scan.
 */
export function PriceOrigin({ source, date }: { source?: StyleCostPriceSource; date?: string }) {
  const label = source ? ORIGIN_LABEL[source] : undefined;
  if (!label) return <span className='text-labelColor'>—</span>;
  return (
    <span className='flex flex-col items-start gap-0.5'>
      <Text size='micro' variant='label' tracking='label' component='span' className='uppercase'>
        {label}
      </Text>
      {date && (
        <Text size='nano' variant='label' component='span'>
          {String(date).slice(0, 10)}
        </Text>
      )}
    </span>
  );
}

/**
 * What is wrong with this line, if anything. Renders nothing at all when the line is healthy —
 * an empty cell is the correct "no problem" state and keeps the eye on the rows that do have one.
 *
 * `noFx` is deliberately separate from `noPrice`: a line CAN have a perfectly good price and
 * still be missing from the base-currency total, and telling someone to go set a price when the
 * actual gap is an FX rate sends them to the wrong screen.
 */
export function LineProblems({
  noPrice,
  noFxRate,
  currency,
}: {
  noPrice?: boolean;
  noFxRate?: boolean;
  currency?: string;
}) {
  if (!noPrice && !noFxRate) return null;
  return (
    <span className='flex flex-wrap items-center gap-1'>
      {noPrice && <Pill tone='warn'>{NO_PRICE}</Pill>}
      {noFxRate && <Pill tone='warn'>{noFx(currency)}</Pill>}
    </span>
  );
}

/**
 * A `?` that opens its explanation, usable on a RELEASED card.
 *
 * The whole tech-card form is wrapped in `<fieldset disabled>` when the card is released
 * (index.tsx), and a disabled fieldset disables every BUTTON inside it — which is why the
 * explanations on this tab used to be `<details>` blocks or bare `title=` attributes. `title` is
 * unreachable on touch and invisible to a keyboard, so it was never a real answer.
 *
 * A `<span>` is not a form control, so `fieldset[disabled]` does not touch it. Radix gives it the
 * popover behaviour via `asChild`; the keydown handler is what Radix cannot supply for a
 * non-button element, and without it the control would be mouse-only — the exact failure we are
 * replacing.
 */
export function HelpMark({
  title,
  label,
  children,
}: {
  title: string;
  /** Word-shaped trigger instead of the `?` square — for "почему" at the end of a sentence. */
  label?: string;
  children: React.ReactNode;
}) {
  const onKeyDown = (e: React.KeyboardEvent<HTMLSpanElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.currentTarget.click();
    }
  };
  const focus =
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor';
  return (
    <GenericPopover
      title={title}
      triggerProps={{ asChild: true }}
      openElement={
        label ? (
          <span
            role='button'
            tabIndex={0}
            onKeyDown={onKeyDown}
            className={`cursor-help underline decoration-dotted hover:text-textColor ${focus}`}
          >
            {label}
          </span>
        ) : (
          <span
            role='button'
            tabIndex={0}
            aria-label={`что такое «${title}»`}
            onKeyDown={onKeyDown}
            className={`inline-flex size-[13px] shrink-0 cursor-help items-center justify-center border border-borderColor align-middle text-nano leading-none text-labelColor hover:border-textColor hover:text-textColor ${focus}`}
          >
            ?
          </span>
        )
      }
    >
      <Text size='micro' variant='label'>
        {children}
      </Text>
    </GenericPopover>
  );
}
