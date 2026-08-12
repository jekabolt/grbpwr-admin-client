import { common_TechCard, common_TechCardColorwayUsage } from 'api/proto-http/admin';
import { useState } from 'react';
import { useFormContext, useFormState } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import { Row } from 'ui/components/row';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';
import { decimalToInput } from 'utils/decimal';
import { COSTING_COST_KEYS, COSTING_COST_PATHS } from './costing-field';
import { NO_PRICE, noFx, normSourceLabel } from './costing-vocab';
import { TechCardFormData, wireInt } from './schema';

/**
 * ДЕНЬГИ РЯДОМ С ТЕМ, ЧТО ИХ МЕНЯЕТ — полоса себестоимости на КАЖДОЙ вкладке тех-карты.
 *
 * Сегодня один вопрос — «сколько стоит это изделие» — размазан по четырём экранам: BOM →
 * колорвеи → костинг → производство. Правка цены в BOM требует уйти на другую вкладку, чтобы
 * увидеть, что она сделала. Полоса отвечает на этот вопрос, не уводя со вкладки.
 *
 * ГЛАВНОЕ ПРАВИЛО, ИЗ КОТОРОГО СЛЕДУЕТ ВСЁ ОСТАЛЬНОЕ: ПОЛОСА И ВКЛАДКА КОСТИНГА ЧИТАЮТ ОДИН
 * РАСЧЁТ. Второй вывод тех же денег — ровно та болезнь, которую этот код лечит: она уже кусала
 * этот репозиторий, когда половина экрана неттировалась по одной ставке VAT, а половина по
 * другой, и ни одна строка об этом не говорила. Поэтому здесь НЕТ вычислений: каждое число —
 * поле, которое сервер уже посчитал и прислал (`techCard.techCard.costing`, OUTPUT-ONLY-рollup, и
 * OUTPUT-ONLY `line_total` строк рецепта). Ни одного сложения, ни одного процента, ни одного
 * повторного округления — сумма и её разрядность печатаются ровно так, как пришли с провода.
 *
 * ЧЕГО ЗДЕСЬ НЕТ И ПОЧЕМУ (каждый пункт — следствие того же правила):
 *
 *  • НЕТ ПЕРЕКЛЮЧАТЕЛЯ «СТИЛЬ / ПАРТИЯ». Выбор базы расчёта принадлежит вкладке костинга вместе
 *    со своим состоянием; второй переключатель был бы второй правдой о том, на какой вопрос
 *    отвечает экран. Полоса показывает цифру СТИЛЯ и ГОВОРИТ ЭТО СЛОВАМИ, а за партией отправляет
 *    на вкладку.
 *  • НЕТ СПИСКА ПРОБЛЕМ. Их там восемь, и они выведены — пересчитать или пересказать их значит
 *    вывести второй раз. Три пилюли ниже — это ТРИ БУЛЕВЫХ ПОЛЯ СЕРВЕРА (has_estimate,
 *    has_unpriced, has_unconverted_currencies), а не выжимка из вкладки.
 *  • НЕТ КНОПКИ «РАСКРОИТЬ ПАРТИЮ». Она принадлежит ВЫБРАННОЙ партии, а партия живёт на вкладке.
 *  • НЕТ МАРЖИ. Маржа = нетто-розница − себестоимость, и нетто-розница выводится из цен
 *    колорвеев со всеми оговорками про согласие и про страну VAT. Это вывод, а не поле.
 */

/** Открыта ли полоса — предпочтение ЧЕЛОВЕКА, одно на все карточки. См. `readOpen`. */
const OPEN_KEY = 'techCardMoneyPanelOpen';

/**
 * Состояние «раскрыта/свёрнута» хранится ПО ПОЛЬЗОВАТЕЛЮ, а не по карточке, и намеренно одним
 * ключом: панель, которая заново открывается на каждой карточке, — это панель, которую закроют
 * навсегда. Отсутствие ключа = свёрнута: новый человек видит узкую полоску и ничего не теряет из
 * рабочей области.
 */
function readOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) === '1';
  } catch {
    // приватный режим / квота не должны ронять карточку
    return false;
  }
}

/** Строка рецепта, привязанная к ДЕТАЛИ кроя, — назначение материала, а не норма. */
function isPieceAssignment(u: common_TechCardColorwayUsage): boolean {
  // Три представления одной привязки; pieceIndex — explicit presence, 0 это настоящая деталь.
  // Зеркало серверного правила (T8, entity.IsPieceMaterialAssignment) и тот же предикат, что в
  // pairNormInput: расход — свойство ИЗДЕЛИЯ, строка детали лишь говорит, из чего её кроят.
  return wireInt(u.pieceId) > 0 || !!u.pieceLineKey || u.pieceIndex != null;
}

export function MoneyPanel({ techCard }: { techCard?: common_TechCard }) {
  const [open, setOpen] = useState(readOpen);
  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(OPEN_KEY, next ? '1' : '0');
      } catch {
        // см. readOpen
      }
      return next;
    });
  };

  const { control } = useFormContext<TechCardFormData>();
  // ЧЕРНОВИК. Полоса печатает ТОЛЬКО серверные числа, поэтому правка статьи костинга её не
  // двигает — и молчать об этом нельзя: человек, поправивший CMT и не увидевший движения, решит,
  // что полоса сломана. Тот же список полей, что у вкладки (импортирован, не скопирован), и тот
  // же смысл: dirty меряется от defaultValues последнего чтения, то есть это ровно вопрос «форма
  // всё ещё то, из чего сервер считал rollup».
  const { dirtyFields } = useFormState({ control, name: COSTING_COST_PATHS });
  const costingDirty = COSTING_COST_KEYS.some(
    (k) => !!(dirtyFields.costing as Record<string, boolean> | undefined)?.[k],
  );

  const rollup = techCard?.techCard?.costing;
  // Валюта костинга — С КАРТОЧКИ, не с формы: все числа ниже сервер посчитал в СОХРАНЁННОЙ
  // валюте, и подписать их валютой из формы значило бы поставить знак PLN у суммы в EUR.
  const cur = rollup?.currency || rollup?.baseCurrency || '';
  const unitCost = decimalToInput(rollup?.unitCost).trim();
  const money = (v: string, currency: string) =>
    v ? `${currency ? `${currency} ` : ''}${v}` : '—';

  // СТУПЕНЬ. Сервер называет ровно одну: has_estimate = «часть слотов посчитана ОЦЕНКОЙ снизу»
  // (площадь деталей ÷ раскройную ширину, Ф1, ступень 0) — netto, нижняя граница, которой сервер
  // сам отказывается засевать cost_price. Всё остальное — план по нормам.
  //
  // «РАСКЛАДКА» И «ФАКТ» ЗДЕСЬ НЕ НАЗЫВАЮТСЯ, И ЭТО НЕ ЭКОНОМИЯ. Провенанс живёт НА СТРОКЕ
  // (consumption_source ниже), и он у строк разный; свернуть их в одно слово карточки — это
  // вывод, а не чтение, и он был бы вторым выводом рядом с серверным. Факта же на тех-карте нет
  // вовсе: он принадлежит прогону.
  const tier = !unitCost ? 'нет расчёта' : rollup?.hasEstimate ? 'оценка' : 'план';
  const tierTone = rollup?.hasEstimate && unitCost ? 'attention' : 'mut';

  const materialsPerUnit = decimalToInput(rollup?.materialsPerUnit).trim();
  const materialsTotal = rollup?.materialsTotal ?? [];

  // РЕЦЕПТ ОСНОВНОГО КОЛОРВЕЯ — тот же, из которого посчитан корень rollup'а: «Root figures are
  // the PRIMARY colourway (colorways index 0)» (контракт TechCardCosting). Брать любой другой
  // значило бы подписать список цифрой, которая к нему не относится.
  const primary = techCard?.colorways?.[0];
  const bomLines = techCard?.techCard?.bomItems ?? [];
  const recipeRows = (primary?.usages ?? [])
    .filter((u) => !isPieceAssignment(u))
    .map((u, i) => {
      // Тот же join, что у pairNormInput: стабильный line_key, с фолбэком на резолвнутый id.
      const bom = bomLines.find(
        (b) =>
          (!!u.bomLineKey && b.lineKey === u.bomLineKey) ||
          (wireInt(u.bomItemId) > 0 && wireInt(b.id) === wireInt(u.bomItemId)),
      );
      const unit = bom?.unit?.trim() ?? '';
      const scalar = decimalToInput(u.consumption).trim();
      const count = decimalToInput(u.quantity).trim();
      const perSize = (u.sizeConsumptions ?? []).some((s) => decimalToInput(s.consumption).trim());
      return {
        key: u.bomLineKey || `${wireInt(u.bomItemId)}-${i}`,
        name: bom?.name?.trim() || u.placement?.trim() || 'строка без названия',
        // ПЕР-РАЗМЕРНАЯ НОРМА ПОБЕЖДАЕТ СКАЛЯР — как на сервере: себестоимость стиля берёт по ней
        // среднее по размерному ряду. Печатать здесь скаляр значило бы назвать нормой число,
        // которого расчёт не берёт, поэтому вместо него сказано, ЧТО норма пер-размерная.
        // Единица нормы — единица СТРОКИ BOM, и только она (единица артикула это единица склада,
        // и пин колорвея на артикул другой размерности законен).
        qty: perSize
          ? 'по размерам'
          : scalar || count
            ? `${scalar || count}${unit ? ` ${unit}` : ''}`
            : '',
        // Провенанс показывается только у ИЗМЕРЯЕМОЙ нормы: у счётного трима ручной ввод —
        // единственный способ, и метка «введено руками» на каждой пуговице была бы шумом.
        source: scalar || perSize ? normSourceLabel(u.consumptionSource) : '',
        // ДЕНЬГИ СТРОКИ — В ЕЁ СОБСТВЕННОЙ ВАЛЮТЕ (валюта строки BOM), а не в валюте костинга:
        // строка в чужой валюте в materials_per_unit не входит вовсе (has_unconverted_currencies),
        // и подписать её валютой костинга значило бы соврать дважды.
        // При пер-размерной норме line_total невалиден (сервер строит его из скаляра, а расчёт
        // идёт средним по ряду) — тогда числа нет, и здесь стоит «—», а не чужая сумма.
        total: perSize ? '' : decimalToInput(u.lineTotal).trim(),
        currency: bom?.currency?.trim() ?? '',
      };
    });

  const label = unitCost ? money(unitCost, cur) : '—';

  return (
    // ЗАКРЕПЛЕНА ОТНОСИТЕЛЬНО ОБЛАСТИ ФОРМЫ, А НЕ ВКЛАДКИ: position:fixed у правого края, поэтому
    // из рабочей области не забирает НИ ПИКСЕЛЯ и не переезжает при переключении вкладок.
    // z — sticky-ступень шкалы: НИЖЕ навигации (45), которая обязана оставаться сверху.
    // Тени нет намеренно: в этой системе плавают только модалка, поповер и таскаемая карточка, а
    // отделяет полосу от страницы то же, что и любой блок, — 1px контур плюс белая заливка.
    //
    // УЖЕ lg ЕЁ ПРОСТО НЕТ. Полоска шириной ~26px у правого края телефона легла бы поверх
    // содержимого, которого там и так впритык (у контента всего px-2.5), а тех-карту с телефона
    // открывают в примерочной, где считают посадку, а не деньги. Ровно на lg рейл секций и сам
    // перестаёт быть рейлом. Костинг оттуда — один тап по рейлу.
    <aside
      aria-label='себестоимость стиля'
      className='fixed top-1/2 right-0 z-[var(--z-sticky)] hidden -translate-y-1/2 print:hidden lg:block'
    >
      {open ? (
        <Section
          title='себестоимость'
          question='— то, что сервер посчитал при последнем сохранении'
          className='max-h-[70vh] w-[320px] overflow-y-auto'
          action={
            <Button type='button' variant='secondary' size='xs' aria-expanded onClick={toggle}>
              свернуть ✕
            </Button>
          }
        >
          <div>
            <Text size='statBig'>{label}</Text>
            <div className='mt-1 flex flex-wrap items-center gap-1.5'>
              <Pill tone={tierTone}>{tier}</Pill>
              {costingDirty && <Pill tone='attention'>черновик</Pill>}
              {rollup?.hasUnpriced && <Pill tone='warn'>{NO_PRICE}</Pill>}
              {rollup?.hasUnconvertedCurrencies && <Pill tone='warn'>{noFx()}</Pill>}
            </div>
          </div>

          {/* Одно предложение, которое обязано стоять у цифры: ЧЬЯ она и на какой вопрос отвечает.
              «Стиль» и «партия» — разные вопросы, и спутать их дороже всего: партия из одних XL,
              посчитанная по средней ряда, выглядит нормально и врёт на всю разницу градации. */}
          <Text size='micro' variant='label'>
            за изделие · СТИЛЬ (средним по размерному ряду), не партия · пересчитывается при
            сохранении карточки
            {costingDirty ? ' — в форме есть несохранённые статьи, цифра ещё прежняя' : ''}
          </Text>

          <div>
            <GroupLabel flush>материалы</GroupLabel>
            <Row label='на изделие' value={money(materialsPerUnit, cur)} />
            {/* Валютные корзины сервера: строка BOM в другой валюте в materials_per_unit не входит,
                но здесь она есть — сервер её не роняет молча, и полоса тоже. Подпись — теми же
                словами, что на вкладке костинга. */}
            {materialsTotal.map((line, i) => (
              <Row
                key={`${line.currency || 'none'}-${i}`}
                label={`материалы · ${line.currency || 'без валюты'}`}
                value={decimalToInput(line.amount) || '—'}
              />
            ))}
          </div>

          <div>
            <GroupLabel>
              {`рецепт · ${primary?.colorCode?.trim() || primary?.baseSku?.trim() || 'основной колорвей'}`}
            </GroupLabel>
            {recipeRows.length > 0 ? (
              recipeRows.map((r) => (
                <Row
                  key={r.key}
                  label={
                    <span className='flex min-w-0 flex-col'>
                      <span className='truncate'>{r.name}</span>
                      <Text size='nano' variant='label' component='span'>
                        {[r.qty || '—', r.source].filter(Boolean).join(' · ')}
                      </Text>
                    </span>
                  }
                  value={money(r.total, r.currency)}
                />
              ))
            ) : (
              <Text size='micro' variant='label'>
                {primary
                  ? 'в рецепте этого колорвея нет строк расхода на изделие — материалы считаются нулевыми'
                  : 'у карточки нет колорвеев — расход задавать не на чем'}
              </Text>
            )}
          </div>

          {/* Ссылка, а не кнопка: вкладка живёт в URL (?tab=), и <a> переживает и замороженную
              релизом карточку, и аккаунт с одним лишь costing:read. */}
          <Button asChild variant='secondary' size='sm'>
            <Link to='?tab=costing'>костинг — маржа, проблемы, партия</Link>
          </Button>
        </Section>
      ) : (
        // СВЁРНУТАЯ ПОЛОСКА. Вертикальный набор, потому что горизонтальная плашка с числом легла
        // бы поверх ~140px содержимого, а вертикальная — поверх ~26px. Одна цифра и одно слово:
        // всё остальное живёт в раскрытом виде и на вкладке.
        <button
          type='button'
          onClick={toggle}
          aria-expanded={false}
          title='себестоимость стиля — развернуть'
          className='flex cursor-pointer items-center gap-2 border border-borderColor bg-bgColor px-1.5 py-3 [writing-mode:vertical-rl] hover:border-textColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
        >
          <Text size='nano' variant='label' tracking='label' component='span' className='uppercase'>
            себестоимость
          </Text>
          {/* Без ручного tabular-nums: разрядность выравнивают КОЛОНКИ цифр, и она вшита в
              примитив там, где колонка есть (Row, stat). Здесь число одно. */}
          <Text size='control' component='span' className='font-bold'>
            {label}
          </Text>
          <Text size='nano' variant='label' tracking='label' component='span' className='uppercase'>
            {tier}
          </Text>
        </button>
      )}
    </aside>
  );
}
