import type { GetDesignBandResponse, common_DesignRunParams } from 'api/proto-http/admin';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { Chip, ChipRow } from 'ui/components/chip';
import Text from 'ui/components/text';
import { ViewSwitch } from 'ui/components/view-switch';

import {
  flushAllowsRun,
  flushRefusalSentence,
  useTechCardAutosave,
  type FlushResult,
} from './autosave-contract';
import { displayDetailName, readBench } from './bench-slot';
import { serverSpeaksDesign } from './capability';
import { useMoodMinimumGate } from './chain-rail';
import { GROUP_GAP, PRICED_LATER, latestRunOfKind } from './core';
import { openStepOf } from './core/chain';
import { markedPlatesOf } from './fix-markup';
import { formatMoney } from './generation/money';
import { useStartRun } from './generation/use-generation';
import { WhatModelGetsModal } from './modals';
import { GenerateRow, LockBar, RunRefusal } from './render/generate-row';
import { ACTIVE_VIEWS, DETAIL_VIEW, viewLabel } from './views';

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
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
}): JSX.Element {
  const [wmgOpen, setWmgOpen] = useState(false);
  const speaks = serverSpeaksDesign();
  const startRun = useStartRun(techCardId);
  const [views, setViews] = useState<Record<string, boolean>>({ front: true, back: true });
  const [detailTicks, setDetailTicks] = useState<Record<number, boolean>>({});
  /** «one picture» по умолчанию (T23, D-19): виды приходят одним листом и режутся сами (`autoSplit`). */
  const [layout, setLayout] = useState<Layout>('one');
  const bench = useMemo(() => readBench(band, 'flat'), [band]);

  const tickedSides = ACTIVE_VIEWS.filter((v) => views[v]);
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

  /**
   * ═══ МИНИМУМ МУДБОРДА — ТА ЖЕ ФРАЗА, ЧТО ЗАПИРАЕТ FLAT НА РЕЛЬСЕ (D-10, контракт `mood-gate`) ══
   *
   * Флэт, нарисованный с пустой доски и без категории, — флэт НИЧЕГО. Правило одно: картинка НА
   * ДОСКЕ (строки входа REFERENCE не в счёт) или описание от 40 знаков, и категория. Читает его
   * ОДИН хук рельса (`useMoodMinimumGate`, заведён под эту кнопку), поэтому фраза отказа дословно
   * та, что запирает FLAT на рельсе, и кнопка с рельсом не могут разойтись в «почему». Дверь —
   * туда, где отказ чинится (`door`): к доске, если не хватает её содержимого, к категории в CARD
   * DETAILS — если только её. Открывается `openStepOf`, а не `revealField`: это не ошибка поля, и
   * красная пульсация после «отведи меня туда» читалась бы как «там что-то сломано».
   */
  const mood = useMoodMinimumGate();
  const moodReason = mood.ok ? null : mood.reason;
  const moodDoor =
    !mood.ok && mood.door === 'card'
      ? { label: 'card details ›', open: () => openStepOf('categoryId', '#card-details') }
      : { label: 'moodboard ›', open: () => openStepOf('concept') };

  /**
   * ═══ СНАЧАЛА СОХРАНИТЬ, ПОТОМ ПЛАТИТЬ (D-16, контракт `autosave`, Codex B-05) ══════════════
   *
   * Прогон читает СОХРАНЁННУЮ карточку: WORDS, засеянные секунду назад, и роль, выбранная только
   * что, на сервер ещё не уехали, и модель получила бы вчерашний запрос за сегодняшние деньги.
   * Поэтому GENERATE сначала ждёт `flush` и стартует только при `ok`/`nothing`/`off`; иначе —
   * фраза контракта (`flushRefusalSentence`) стойкой строкой под рядом, не всплывашкой.
   */
  const autosave = useTechCardAutosave();
  const [flushing, setFlushing] = useState(false);
  const [flushRefusal, setFlushRefusal] = useState<string | null>(null);
  /* Отказ снимается сам, как только карточка сохранилась: поправленное поле — это и есть ответ на
     него, и строка «save the card first» над сохранённой карточкой была бы неправдой. */
  useEffect(() => {
    if (autosave.status === 'saved' || autosave.status === 'idle') setFlushRefusal(null);
  }, [autosave.status]);

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
      : moodReason
        ? moodReason
        : noViews
          ? 'no views ticked — tick at least one'
          : null;

  const submit = async () => {
    if (gateReason || startRun.isPending || flushing) return;
    setFlushing(true);
    let saved: FlushResult;
    try {
      saved = await autosave.flush('flat-generate');
    } catch {
      // Контракт обещает исход, а не исключение; бросок читается как неудача сохранения.
      saved = 'error';
    } finally {
      setFlushing(false);
    }
    if (!flushAllowsRun(saved)) {
      setFlushRefusal(flushRefusalSentence(saved, autosave.errorsCount) || 'save the card first');
      return;
    }
    setFlushRefusal(null);
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
      // НЕ ПЛЕЙГРАУНД: поле осмысленно только на kind=freeform и на любом другом роде
      // отвергается сервером (`freeform_forbidden`), поэтому здесь оно названо пустым вслух.
      freeform: undefined,
      /* ПЛИТЫ ВЕРСТАКА В ПРОГОН ФЛЭТА НЕ ЕДУТ (T24, D-20): дверь `also send the flat slots` снята
         владельцем вместе с лентой плит. `false` — СКАЗАНО, а не опущено: пустой `flat_slot_ids`
         при включённом флаге значил бы «все» (`design.proto`), и старый флаг из хранилища вкладки
         не должен дожить до платного запроса. */
      useFlatSlots: false,
      flatSlotIds: [],
      extraInputMediaIds: [],
    };
    startRun.start({ kind: 'flat', ask: '', params });
  };

  return (
    /* ═══ ДВА РЯДА, ОДИН ЗАЗОР, ОДИН РОСТ ОРГАНОВ (r3 п.5; ряд источников снят D-20) ══════════
       Владелец: «сделать по уму … три спокойных ряда … дай больше спейсинга». Ряды идут в его
       порядке: виды → запуск (средний ряд источников снят владельцем в волне 25.09). Зазор —
       12px, ТОТ ЖЕ ШАГ, что `GROUP_GAP` («линейка группы → содержимое», `core/organs.tsx`):
       между полосами одного решения он обязан быть тем же, что между подписью и её содержимым,
       и меньше шва между блоками (16px у секции).
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
          {ACTIVE_VIEWS.map((view) => {
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

      {/* ═══ РЯД 2 · ЗАПУСК — ОБЩИЙ ОРГАН (F-1). `disabled` ряду НЕ передаётся: право на запись уже
          названо в `gateReason` и той же переменной заперт `submit`. `shape` не называется:
          хвост здесь свой — деньги слева от двери описи, дверь у правого края, как в макете.
          `data-flat-generate` — якорь двери «the flat run ›» из FLAT SLOTS. */}
      <div data-flat-generate=''>
        <GenerateRow
          gate={gateReason ? { ok: false, reason: gateReason } : { ok: true }}
          pending={startRun.isPending || flushing}
          onGenerate={() => void submit()}
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

      {/* ОТКАЗ МИНИМУМА МУДБОРДА — СЛОВАМИ И С ДВЕРЬЮ, А НЕ ТОЛЬКО ПОГАШЕННОЙ КНОПКОЙ. Погашенный
          GENERATE держит повод в `title`, то есть по наведению; здесь он же стоит строкой, и рядом —
          дверь туда, где он чинится. Только на карточке, которую можно писать. */}
      {moodReason && speaks && !disabled && (
        <div data-flat-mood-gate=''>
          <LockBar reason={moodReason}>
            <Button variant='secondary' size='sm' onClick={moodDoor.open}>
              <ControlLabel>{moodDoor.label}</ControlLabel>
            </Button>
          </LockBar>
        </div>
      )}
      {/* СОХРАНЕНИЕ НЕ ПРОШЛО — ПРОГОН НЕ ЗАПУЩЕН (контракт autosave). Стойкая строка до следующей
          попытки: исправление («поправь поле») — не новое нажатие, и всплывашка ушла бы раньше. */}
      {flushRefusal && (
        <div data-flat-flush-refusal=''>
          <LockBar reason={`${flushRefusal} — nothing was started, nothing was charged`} />
        </div>
      )}
      {/* МЕТКИ НЕ ЕДУТ, И СКАЗАНО ЭТО ТАМ, ГДЕ ТРАТЯТСЯ ДЕНЬГИ. Рисуется только пока метки есть. */}
      {marked.length > 0 && (
        <CalloutBox tone='note'>
          <Text size='micro' component='p'>
            <b>the edit ▸ marks on {marked.map((p) => p.label).join(', ')} stay on this screen.</b>{' '}
            a flat run reads the card’s references, never the bench plates, so nothing drawn there
            travels with GENERATE — the marks remain on their plates for people.
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
