import type { GetDesignBandResponse, common_DesignRunParams } from 'api/proto-http/admin';
import { useMemo, useState, type ReactNode } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { Chip, ChipRow } from 'ui/components/chip';
import Text from 'ui/components/text';
import { ViewSwitch } from 'ui/components/view-switch';

import { displayDetailName, readBench } from './bench-slot';
import { serverSpeaksDesign } from './capability';
import { GROUP_GAP, PRICED_LATER, latestRunOfKind } from './core';
import { filledFlatSlots, sentFlatSlotIds, useFlatSlotsSend } from './flat-slots-send';
import { markedPlatesOf } from './fix-markup';
import { formatMoney } from './generation/money';
import { useStartRun } from './generation/use-generation';
import { WhatModelGetsModal } from './modals';
import { GenerateRow, RunRefusal } from './render/generate-row';
import { DETAIL_VIEW, SILHOUETTE_VIEWS, viewLabel } from './views';

/**
 * ═══ РЯД ЗАПУСКА БЛОКА INPUT — REFERENCES (`runDoors('flat')` макета) ═══════════════════════════
 *
 *   GENERATE · $0.38 · priced by the server on start ·                    WHAT THE MODEL GETS ▸
 *
 * Здесь стояла ОТДЕЛЬНАЯ секция `generation — flat`, потом — подвал `the flat run` с линейкой
 * группы, чипами видов, переключателем раскладки и рядом. Макет (`_step-flat.js`, SPEC п.7) знает
 * один блок и один ряд: то, что модели дают, и то, что у неё просят, — один запрос.
 *
 * ПОЧЕМУ ОТДЕЛЬНЫЙ КОМПОНЕНТ, А НЕ ВСТАВКА В `ReferencesSection`. Секция референсов уже несёт
 * два десятка хуков и приёмник рекола (`RecalledRunPrompt`), который при размонтировании стирает
 * выбор из реестра; всякий условный хук в её теле — риск сдвинуть их порядок. Органы прогона
 * живут своим состоянием и монтируются ВНУТРИ той же `Section`.
 *
 * ⚠ РЯД ВИДОВ — ПРОДУКТОВЫЙ, У МАКЕТА ЕГО НЕТ. Прототипный прогон флэта возвращает «до двух
 * свободных флэтов с видом» из фикстур; продуктовый `StartDesignRun` требует `params.views[]` —
 * какие стороны рисовать — и `layout`. Спрятать выбор и слать всегда `front, back` значило бы
 * решать за человека, за что он платит. Поэтому ряд остаётся, одной строкой над рядом запуска:
 * ярлык `VIEWS`, чипы сторон и деталей, справа — раскладка ответа. Это названо в gaps.
 *
 * ⚠ ЦЕНА — ПОСЛЕДНЕГО ФЛЭТ-ПРОГОНА, И ЭТО СКАЗАНО СЛОВАМИ. Макет печатает `$0.38` из своего
 * прейскуранта; на проводе цены прогона, которого ещё нет, не бывает (`price_estimate` и
 * `price_actual` — поля прогона, выходные). Что есть — цена ПОСЛЕДНЕГО флэт-прогона карточки, факт,
 * а не оценка; она печатается с приставкой «last flat run», а дальше — та же фраза, что на всех
 * пяти рядах GENERATE (`PRICED_LATER`). Нет ни одного прогона — только фраза.
 */

/**
 * ═══ ОДИН РОСТ НА ВСЕ ОРГАНЫ ТРЁХ РЯДОВ (r3 п.5) ══════════════════════════════════════════════
 *
 * Владелец, дословно: «после WORDS очень много кнопок разного размера с минимальными отступами …
 * сделать по уму». «Разного размера» — это измеримо и это была правда: `Button size='sm'` (рамка +
 * `py-1` + `leading-4`) ростом 26px стояла вплотную к `Chip` и к сегменту `ViewSwitch` ростом 19px,
 * и три ряда органов читались как три разных класса вещей.
 *
 * ЭТАЛОН ВЫБРАН НЕ ГОЛОСОВАНИЕМ: 26px — рост `GENERATE`, а её разметку держит общий ряд
 * (`render/generate-row.tsx`, зона G1), то есть подогнать надо было ВСЁ ОСТАЛЬНОЕ к ней, а не
 * наоборот. Число живёт здесь одно, и ленты берут его отсюда.
 *
 * ⚠ ИНЛАЙНОМ, А НЕ КЛАССОМ, И ЭТО НЕ НЕБРЕЖНОСТЬ. Класса на 26px в tailwind нет (`h-6` = 24), а
 * произвольного (`h-[26px]`) НЕТ В СОБРАННОМ CSS, если его не было в дереве на момент сборки —
 * стенд читает именно собранный CSS и намерил бы неправильную геометрию, показав зелёное там, где
 * у человека разъехалось (память `probe-served-a-stale-bundle`).
 */
export const ROW_CONTROL_PX = 26;
export const ROW_CONTROL_STYLE: React.CSSProperties = { height: ROW_CONTROL_PX };

/** Сторона миниатюры плиты в ряду источников — снимок, а не иконка, и не выше двух рядов текста. */
export const PLATE_PX = 44;

/**
 * ═══ ПОДПИСЬ ВТОРОСТЕПЕННОЙ КНОПКИ — РАЗМЕРОМ КОНТРОЛА, А НЕ ТЕЛА ТЕКСТА (r3 п.5) ══════════════
 *
 * Владелец просил ещё и ОДИН РАЗМЕР ШРИФТА в этих рядах. Замерено: чипы и сегменты раскладки
 * печатают 10px, а `Button size='sm'` — 12px, хотя DESIGN.md на второстепенную кнопку говорит
 * ровно «10px label type uppercase». Разница не в вызове: `buttonVariants` кладёт на одну кнопку
 * И `text-textBaseSize` (от `variant`), И `text-micro` (от `size`), а `cva` их не мирит — спор
 * решает порядок утилит в собранном CSS, и `text-textBaseSize` там ПОЗЖЕ. То есть `text-micro`
 * размера `sm` мёртв во всей админке, и класс с места вызова умрёт так же.
 *
 * ПОЭТОМУ РАЗМЕР НАЗЫВАЕТ ПОДПИСЬ, А НЕ КНОПКА: у вложенного `span` конкурента нет. Это не обход
 * системы, а её же значение — 10px, `text-micro`, — возвращённое туда, где примитив его теряет.
 * ⚠ ПОЧИНКА ПО СУЩЕСТВУ ЖИВЁТ В `ui/components/button.tsx` (снять `text-textBaseSize` с вариантов
 * или помирить классы через `twMerge`); она за пределами этой зоны и названа в отчёте. Главную
 * кнопку (`GENERATE`) это не касается: 12px у неё — по системе.
 */
export function ControlLabel({ children }: { children: ReactNode }): JSX.Element {
  return <span className='text-micro'>{children}</span>;
}

const LAYOUT_OPTIONS = [
  { value: 'one' as const, label: 'one picture', hint: 'all the ticked views drawn into one file' },
  {
    value: 'per_view' as const,
    label: 'a picture per view',
    hint: 'each ticked view comes back on its own',
  },
];
type Layout = 'one' | 'per_view';

export function FlatRunRow({
  band,
  techCardId,
  disabled,
  sources,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
  /**
   * ВТОРОЙ РЯД — ИСТОЧНИКИ (r3 п.5): «from construction ▸ · also send the flat slots» и лента
   * миниатюр плит при включённом тумблере. Приезжает щелью, потому что ОБЕ его двери пишут в
   * блок референсов (поле формы и хранилище исключений карточки), а этот компонент держит РИТМ
   * трёх полос, а не их содержимое. Разбор — у места вызова.
   */
  sources?: ReactNode;
}): JSX.Element {
  const [wmgOpen, setWmgOpen] = useState(false);
  const speaks = serverSpeaksDesign();
  const startRun = useStartRun(techCardId);
  const [views, setViews] = useState<Record<string, boolean>>({ front: true, back: true });
  const [detailTicks, setDetailTicks] = useState<Record<number, boolean>>({});
  const flatSend = useFlatSlotsSend(techCardId);
  const [layout, setLayout] = useState<Layout>('per_view');
  const bench = useMemo(() => readBench(band, 'flat'), [band]);

  const tickedSides = SILHOUETTE_VIEWS.filter((v) => views[v]);
  const tickedDetails = bench.details.filter((d) => (d.id ?? 0) > 0 && detailTicks[d.id ?? 0]);
  const ticked: string[] = [...tickedSides, ...tickedDetails.map(() => DETAIL_VIEW)];
  const tickedDetailIds: number[] = tickedDetails.map((d) => d.id ?? 0);

  const wholeBench = useMemo(
    () => ({
      viewKeys: bench.sides.map((s) => s.view),
      slotIds: bench.details.map((d) => d.id ?? 0).filter((id) => id > 0),
    }),
    [bench],
  );
  const marked = useMemo(() => markedPlatesOf(band, wholeBench), [band, wholeBench]);
  const filled = useMemo(() => filledFlatSlots(band), [band]);
  const sentSlotIds = useMemo(
    () =>
      sentFlatSlotIds(
        flatSend,
        filled.map((p) => p.slotId),
      ),
    [flatSend, filled],
  );

  /* Цена последнего флэт-прогона — см. шапку. `priceActual` первым: это то, что списали. */
  const lastRun = useMemo(() => latestRunOfKind(band.runs, 'flat'), [band.runs]);
  const lastPrice = lastRun
    ? formatMoney(lastRun.priceActual ?? lastRun.priceEstimate, lastRun.currency)
    : '';

  const writesOff = !!disabled || !speaks;
  const noViews = ticked.length === 0;
  /* Ряд (`GenerateRow`) сам спрашивает `serverSpeaksDesign()` ПЕРВЫМ и печатает свою формулировку;
     ветка ниже остаётся ЗАМКОМ ПРОВОДА: `submit` заперт этой же переменной. */
  const gateReason = !speaks
    ? 'this server does not speak the design band yet — nothing can be generated here'
    : disabled
      ? 'this card is read-only'
      : noViews
        ? 'no views ticked — tick at least one'
        : null;

  const submit = () => {
    if (gateReason || startRun.isPending) return;
    const params: common_DesignRunParams = {
      views: [...ticked],
      detailSlotIds: [...tickedDetailIds],
      layout,
      colorwayId: 0,
      colour: undefined,
      threed: undefined,
      fixTarget: '',
      fixTargets: [],
      fixSlotIds: [],
      autoSplit: layout === 'one' && ticked.length >= 2,
      pattern: undefined,
      /* ⚠ ПУСТОЙ СПИСОК ПРИ ВКЛЮЧЁННОМ ЧИПЕ ЗНАЧИТ «ВСЕ» (`design.proto`, `flat_slot_ids`) — поэтому
         «вычеркнул все плиты» обязано схлопнуться в ВЫКЛЮЧЕННЫЙ чип, а не уехать пустым списком.
         Потолка трат на сервере нет; эта строка — единственное между отказом человека и оплаченным
         прогоном, который этот отказ не услышал. Пара согласована в одном месте — здесь. */
      useFlatSlots: flatSend.on && sentSlotIds.length > 0,
      flatSlotIds: sentSlotIds,
      extraInputMediaIds: [],
    };
    startRun.start({ kind: 'flat', ask: '', params });
  };

  return (
    /* ═══ ТРИ РЯДА, ОДИН ЗАЗОР, ОДИН РОСТ ОРГАНОВ (r3 п.5) ══════════════════════════════════════
       Владелец: «сделать по уму … три спокойных ряда … дай больше спейсинга». Ряды идут в его
       порядке: виды → источники → запуск. Зазор — 12px, ТОТ ЖЕ ШАГ, что `GROUP_GAP` («линейка
       группы → содержимое», `core/organs.tsx`): между полосами одного решения он обязан быть тем
       же, что между подписью и её содержимым, и меньше шва между блоками (16px у секции).
       Классом `GROUP_GAP` его не выразить — тот margin-bottom на подписи, а здесь нужен ритм
       между рядами; поэтому шаг один, а написаний два, и оба названы здесь. */
    <div data-flat-run='' className='space-y-3'>
      {!speaks && (
        <CalloutBox tone='note'>
          this server does not speak the design band yet — the controls are here, but nothing can be
          started against them.
        </CalloutBox>
      )}

      {/* ═══ РЯД 1 · ВИДЫ — ярлык, чипы сторон и деталей, справа раскладка ответа ═══════════════
          Отмеченный чип заливается чернилами — это и есть состояние; «слот заполнен / пуст»
          живёт в title, потому что лента FLAT SLOTS стоит на той же вкладке и показывает то же
          глазами. Раскладка имеет смысл от двух видов; при одном она ничего не меняет и молчит
          (`title`), а не пропадает: положение переключателя — предпочтение, оно переживает галки.
          Ярлык `views` — единственный текст ряда; рост у чипов и у полосы раскладки тот же, что у
          кнопок двух рядов ниже (`ROW_CONTROL_STYLE`). */}
      <div className='flex flex-wrap items-center gap-2' data-flat-views=''>
        <Text size='nano' variant='label' component='span' className='uppercase tracking-label'>
          views
        </Text>
        <ChipRow>
          {SILHOUETTE_VIEWS.map((view) => {
            const on = !!views[view];
            const slot = bench.sides.find((s) => s.view === view)?.slot ?? null;
            const slotFilled = (slot?.pictureId ?? 0) > 0;
            return (
              <Chip
                key={view}
                selected={on}
                pressed={on}
                disabled={writesOff}
                style={ROW_CONTROL_STYLE}
                title={
                  slotFilled
                    ? 'its flat slot below is already filled'
                    : 'its flat slot below is empty'
                }
                onClick={() => setViews((prev) => ({ ...prev, [view]: !prev[view] }))}
              >
                {viewLabel(view)}
              </Chip>
            );
          })}
          {/* ДЕТАЛИ — ПО ГАЛКЕ НА КАЖДУЮ ОПИСАННУЮ (T-5): чипы — производная от bench.details. */}
          {bench.details.map((d) => {
            const id = d.id ?? 0;
            if (id <= 0) return null;
            const on = !!detailTicks[id];
            return (
              <Chip
                key={`d:${id}`}
                selected={on}
                pressed={on}
                disabled={writesOff}
                style={ROW_CONTROL_STYLE}
                title={`detail described in the flat slots: ${displayDetailName(bench.details, d)}`}
                onClick={() => setDetailTicks((prev) => ({ ...prev, [id]: !prev[id] }))}
              >
                detail · {displayDetailName(bench.details, d)}
              </Chip>
            );
          })}
        </ChipRow>
        {/* ПЕРЕКЛЮЧАТЕЛЬ РАСКЛАДКИ — В КОНЦЕ ТОГО ЖЕ РЯДА (слово владельца), и рост ему задаёт
            обёртка: у самой полосы сегменты растянуты (`items-stretch`), поэтому высоту довольно
            назвать один раз снаружи. */}
        <span
          className='ml-auto flex'
          style={ROW_CONTROL_STYLE}
          title={
            ticked.length <= 1
              ? 'one view is asked — both layouts return one picture, so this changes nothing here'
              : undefined
          }
        >
          <ViewSwitch
            label='layout'
            value={layout}
            options={LAYOUT_OPTIONS}
            disabled={writesOff}
            onChange={setLayout}
            className='h-full'
          />
        </span>
      </div>

      {/* ═══ РЯД 2 · ИСТОЧНИКИ — что ещё уедет вместе с референсами. Содержимое даёт блок
          референсов (разбор — у места вызова); здесь его место в ритме. */}
      {sources}

      {/* ═══ РЯД 3 · ЗАПУСК — ОБЩИЙ ОРГАН (F-1). `disabled` ряду НЕ передаётся: право на запись уже
          названо в `gateReason` и той же переменной заперт `submit`. `shape` не называется:
          хвост здесь свой — деньги слева от двери описи, дверь у правого края, как в макете.
          `data-flat-generate` — якорь двери «the flat run ›» из FLAT SLOTS. */}
      <div data-flat-generate=''>
        <GenerateRow
          gate={gateReason ? { ok: false, reason: gateReason } : { ok: true }}
          pending={startRun.isPending}
          onGenerate={submit}
          trailing={
            <>
              {/* «ЧТО ПОЛУЧИТ МОДЕЛЬ» — единственное место, где человек видит ПОЛНЫЙ состав запроса
                  до того, как заплатит (SPEC п.4: опись живёт в модалке, не на карточке).
                  ⚠ ЭТА ДВЕРЬ СТОИТ РЯДОМ С GENERATE, А НЕ У ПРАВОГО КРАЯ (R2 п.20), слово
                  владельца: «WHAT THE MODEL GETS ▸ помести рядом с GENERATE». Прежний `ml-auto`
                  разносил две двери одного решения по краям ряда, и глаз шёл через всю ширину
                  блока за ответом на вопрос «а что именно уедет». Правило макета («дверь описи у
                  правого края») остаётся у остальных четырёх рядов — они этот хвост не рисуют. */}
              <Button variant='secondary' size='sm' onClick={() => setWmgOpen(true)}>
                <ControlLabel>what the model gets ▸</ControlLabel>
              </Button>
              <Text
                size='micro'
                variant='label'
                component='span'
                className='min-w-0'
                data-probe='run-price'
              >
                {lastPrice ? (
                  <>
                    <b className='text-textColor'>{lastPrice}</b> · last flat run ·{' '}
                  </>
                ) : null}
                {PRICED_LATER}
              </Text>
            </>
          }
        />
      </div>

      {/* МЕТКИ НЕ ЕДУТ, И СКАЗАНО ЭТО ТАМ, ГДЕ ТРАТЯТСЯ ДЕНЬГИ. Рисуется только пока метки есть. */}
      {marked.length > 0 && (
        <CalloutBox tone='note'>
          <Text size='micro' component='p'>
            <b>the edit ▸ marks on {marked.map((p) => p.label).join(', ')} stay on this screen.</b>{' '}
            {flatSend.on
              ? 'the plates themselves travel with GENERATE — you asked for them above. The marks drawn on them do not: they stay here for people.'
              : 'a flat run reads the card’s references, never the bench plates, so nothing drawn there travels with GENERATE — the marks remain on their plates for people.'}
          </Text>
        </CalloutBox>
      )}
      {/* ОТКАЗ ЗАПУСКА — СТОЙКАЯ ПОЛОСА, НЕ СНЕКБАР (CONTRACT §E), тот же орган, что у FABRIC RENDER
          и 3D: слова сервера дословно, «nothing was charged» только когда сервер ОТВЕТИЛ. */}
      <RunRefusal refusal={startRun.refusal} onDismiss={startRun.dismissRefusal} />
      <WhatModelGetsModal open={wmgOpen} onOpenChange={setWmgOpen} band={band} />
    </div>
  );
}
