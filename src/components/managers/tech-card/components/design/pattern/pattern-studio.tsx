import type {
  GetDesignBandResponse,
  common_AdminColorwayRef,
  common_MediaFull,
} from 'api/proto-http/admin';
import { useMemo, useState, type JSX } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { Chip, ChipRow } from 'ui/components/chip';
import Input from 'ui/components/input';
import { Placeholder } from 'ui/components/placeholder';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';

import { InertDoor } from '../bench-slot';
import { serverSpeaksDesign } from '../capability';
import { isRunLive, useElapsed } from '../generation';
import { REPEAT_MAX, normaliseRepeat, patternOutputs, patternRuns, refusalAdvice } from './model';
import { ClothSwatchStrip, swatchTiles } from './tile-preview';
import { PatternInput } from './pattern-input';
import { PatternLibrary } from './pattern-library';
import { PatternOutputs } from './pattern-outputs';
import { useStartDesignRun } from '../render/use-design-run';

/**
 * ═══ ВКЛАДКА PATTERN — ТРИ АКТА ВМЕСТО ЧЕТЫРЁХ СЕКЦИЙ С ПРОЗОЙ (G-15) ════════════════════════
 *
 * Владелец: «переделай юай создания паттернов сделай его максимально простым сейчас там хуй пойми
 * что используй импакбл».
 *
 * ЧТО ИМЕННО БЫЛО НЕПОНЯТНО — ЗАМЕР, А НЕ ВПЕЧАТЛЕНИЕ. Экран стоял ЧЕТЫРЬМЯ белыми блоками:
 *   1. INPUT — слот и чипы полки;
 *   2. GENERATION — раппорт, ВТОРАЯ линейка «at this size» с четырьмя чипами пролётов, блок «what
 *      the model gets» из двух фактов и кнопка;
 *   3. TILES — сцена, суд, KEEP, и две пометки с абзацем, объясняющим их разницу;
 *   4. CLOTH SOURCE — мета-блок, объясняющий, что произойдёт на ДРУГОЙ вкладке.
 * На сером грунте четыре блока читаются как четыре равновесных заявления, из которых три — про
 * одно действие; PRODUCT.md называет это своим анти-референсом дословно: «wizard-style
 * over-explained flows. These are expert users; don't pad the path».
 *
 * ТРИ АКТА, И КАЖДЫЙ — ОТДЕЛЬНЫЙ ВОПРОС, А НЕ ОТДЕЛЬНЫЙ ШАГ МАСТЕРА:
 *   · СДЕЛАТЬ — одна картинка внутрь, раппорт, кнопка. Один блок, три ruled-ряда;
 *   · СУДИТЬ — 3×3, линейка в раппорте ПРОГОНА, вердикт шва, KEEP;
 *   · ХРАНИТЬ И ОТДАВАТЬ — библиотека паттернов карточки, где плитка получает имя и КОЛОРВЕЯ.
 *
 * ЧТО СНЕСЕНО И ПОЧЕМУ ИМЕННО ЭТО:
 *   · СЕКЦИЯ `CLOTH SOURCE` целиком (`cloth-source.tsx`). Она объясняла СОСТОЯНИЕ ПОЛКИ словами
 *     («две ткани, и они не альтернативы…»), потому что связи «этот паттерн — ткань этого цвета»
 *     негде было ни записать, ни показать. Теперь связь ЕСТЬ (`SetDesignAssetColorway`), и её
 *     показывает третий акт строкой «worn by ROSSO». Объяснение, заменённое фактом, — это уже не
 *     объяснение, а второе мнение.
 *   · ПРЕ-ГЕНЕРАЦИОННАЯ ЛИНЕЙКА «at this size» с чипами пролётов. Двойник линейки сцены,
 *     отвечавший на вопрос («того ли размера плитка»), который решается ПОСЛЕ получения плитки, по
 *     настоящему изображению, а не по исходнику. Два органа с одним именем на одном экране — то,
 *     что заставляет искать между ними разницу.
 *   · БЛОК «what the model gets». Двух фактов (медиа и раппорт), и оба стоят в подписи у самой
 *     кнопки, в двух шагах от денег.
 *
 * ═══ ЧЕГО ЗДЕСЬ НЕТ НАМЕРЕННО: ПРИМЕРКИ ПАТТЕРНА НА ИЗДЕЛИЕ (K-14) ═══════════════════════════
 *
 * Владелец: «на вкладке паттерны можно генерить паттерны а давай разметка уже будет в разделе
 * рендерс». Двумя пунктами раньше (K-13) он же просил «прикинуть размер этого паттерна» — и это НЕ
 * противоречие, а два жеста: ПРИКИНУТЬ РАЗМЕР решается линейкой второго акта, ПОЛОЖИТЬ НА СИЛУЭТ
 * — это разметка, и K-14 увёл её в RENDERS. Третья причина, техническая: чтобы нарисовать плитку
 * НА ФЛЭТЕ в верном масштабе, нужен РОСТ ИЗДЕЛИЯ В МИЛЛИМЕТРАХ, а карточка его не называет вовсе
 * (`tech_card_size` меряет обхваты). Любая «примерка на флэт» здесь была бы нарисована по
 * выдуманному росту.
 */

/**
 * ═══ РЯД SCALE ВМЕСТО РЯДА REPEAT (H-7) ══════════════════════════════════════════════════════
 *
 * Владелец, дословно: «в MAKE A TILE REPEAT mm / 20 MM / 60 MM / 120 MM / 300 MM / NOT STATED эти
 * кнопки мне вообще не понятны».
 *
 * ЧТО ЭТИ КНОПКИ ДЕЛАЮТ НА САМОМ ДЕЛЕ — замер по коду обеих сторон, а не догадка. Число уезжает
 * как `pattern.repeat_mm`; сервер (`patternprompt.go`) при `RepeatMM > 0` дописывает в промпт
 * «Draw the motif at the scale of a N mm repeat … one whole tile covers N mm of cloth in each
 * direction», то есть от него зависит, НАСКОЛЬКО КРУПНО нарисован мотив внутри квадрата. То же
 * число наследует сохранённый ассет («generated at N» = «placed at N»), его ест линейка второго
 * акта и промпт рендера. Вопрос ЗАКОНЕН и задан в правильном месте.
 *
 * НЕПОНЯТНЫ БЫЛИ НЕ МИЛЛИМЕТРЫ, А ТО, ЧТО ЧЕЛОВЕК ВЫБИРАЕТ. Решение — «как крупно мотив ляжет на
 * ткань»; миллиметры — ЕДИНИЦА ОТВЕТА, а не сам ответ. Ряд же показывал «20 MM», а смысл («a fine
 * all-over print») прятал в `title`-тултипе: под курсором, с задержкой, и никогда для клавиатуры.
 *
 * ЧТО ВСТАЛО ВМЕСТО:
 *   · ряд называется SCALE, и на лице кнопки СЛОВО ВПЕРЁД, число вторым: `fine · 20`;
 *   · пятая кнопка — `model decides`, то есть ВЫБОР, а не статус «NOT STATED»;
 *   · поле числа стоит ПОСЛЕ кнопок — орган точности для того, кто знает своё число;
 *   · при приложенном источнике и названном масштабе под рядом стоит ПОЛОСА ПЛОТНОСТИ: своя
 *     картинка, замощённая на полуметре ткани. Она отвечает на «что значит 60 против 120 НА МОЕЙ
 *     картинке» ДО денег — и честно называет свой предел («шов чинит прогон»).
 *
 * ЭТО НЕ ВОСКРЕШЕНИЕ СНЕСЁННОЙ ПРЕ-ЛИНЕЙКИ «at this size». Та была ИНСТРУМЕНТОМ-двойником линейки
 * второго акта: свои чипы отрезков, свои деления, ответ на вопрос СУДА («того ли размера вышла
 * плитка»), который решается по настоящей плитке, а не по исходнику. Полоса плотности — не
 * инструмент, а ИЛЛЮСТРАЦИЯ ВЫБОРА: один фиксированный отрезок, ноль делений, ноль своих
 * состояний, живёт только пока человек решает.
 *
 * ПРОВОД НЕ ТРОНУТ: те же четыре числа и тот же 0 уезжают в `params.pattern.repeat_mm`.
 */
const QUICK: { mm: number; label: string; what: string }[] = [
  { mm: 20, label: 'fine', what: 'a fine all-over print' },
  { mm: 60, label: 'shirting', what: 'a shirting check' },
  { mm: 120, label: 'coat', what: 'a coat-scale motif' },
  { mm: 300, label: 'placement', what: 'a placement-scale repeat' },
];

/** Отрезок ткани, на котором показывается плотность. Полметра — половина обхвата груди. */
const DENSITY_SPAN_MM = 500;

/**
 * Масштаб набранного числа — ОДИН словарь на лицо кнопки и на строку значения: слово кнопки
 * (`coat`) — это голова её же фразы (`a coat-scale motif`). Раздельные списки разъехались бы
 * первой правкой, и человек читал бы два разных факта об одном числе.
 */
function scaleOf(mm: number): string {
  if (mm < 40) return QUICK[0].what;
  if (mm < 90) return QUICK[1].what;
  if (mm < 200) return QUICK[2].what;
  return QUICK[3].what;
}

/** Что число значит глазу — одной фразой у самого ряда, включая числа, набранные рукой. */
function scaleWords(mm: number): string {
  if (mm <= 0) return 'no scale stated · the model chooses the density itself';
  return scaleOf(mm);
}

export function PatternStudio({
  band,
  techCardId,
  disabled,
  colorways,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
  /**
   * Колорвеи карточки — для третьего акта. Приходят СВЕРХУ, из общего состояния студии, а не
   * читаются здесь вторым запросом: два чтения одной карточки расходятся ровно тем, чем расходятся
   * два кэша.
   */
  colorways?: common_AdminColorwayRef[];
}): JSX.Element {
  const speaks = serverSpeaksDesign();
  const run = useStartDesignRun(techCardId);
  const [source, setSource] = useState<common_MediaFull | null>(null);
  /** Черновик раппорта живёт СТРОКОЙ: половина набранного числа («12» на пути к «120») не должна
   *  превращаться в 12 на проводе, а пустое поле — в 0, пока человек ещё печатает. */
  const [repeatText, setRepeatText] = useState('120');

  const repeat = normaliseRepeat(repeatText);
  const sourceId = source?.id ?? 0;
  /** Адрес источника для полосы плотности. Полный кадр, а не миниатюра: замощённое мыло читается
   *  как испорченный файл, а не как масштаб. Та же лестница, что у слота ввода. */
  const sourceUrl = source?.media?.fullSize?.mediaUrl || source?.media?.thumbnail?.mediaUrl || '';
  /** Шов виден или нет — ОДИН ответ на кадр и на подпись под ним (`swatchTiles`), не два. */
  const tilesAtThisScale = swatchTiles(repeat, DENSITY_SPAN_MM);

  const outputs = useMemo(() => patternOutputs(band), [band]);
  const live = useMemo(() => patternRuns(band).filter(isRunLive), [band]);

  /* ВОРОТА СОБИРАЮТСЯ ЗДЕСЬ, А НЕ ЧИТАЮТСЯ ИЗ `patternGate`, ПО ОДНОЙ ПРИЧИНЕ: к условиям полосы
     добавляются два, которые полоса знать не может — право на запись и то, говорит ли этот сервер
     вообще на языке DESIGN. Порядок отказов — от самого широкого к самому узкому, чтобы первая
     фраза, которую читает человек, была той же, что сказал бы сервер.

     ТРЕТЬИМ ЗДЕСЬ СТОЯЛ ДНЕВНОЙ ПОТОЛОК. Он снят целиком — и на сервере, и во всех воротах
     полосы: «у нас в принципе не должно быть потолка похуй чем он съеден убери потолок». */
  const frozen = disabled
    ? 'this card is read-only for you — a run spends money, so it is one of the writes that stops here'
    : !speaks
      ? 'this server does not serve the design band, so there is nothing to start a run on'
      : !sourceId
        ? 'no picture is attached — a repeating tile is made out of exactly one picture. Attach one above: from the library, from the clipboard, or one of this card’s cloths'
        : null;

  const advice = run.refusal ? refusalAdvice(run.refusal) : '';

  return (
    <>
      {/* ═══════════════════ АКТ 1 — СДЕЛАТЬ ПЛИТКУ ═══════════════════ */}
      <Section
        title='make a tile'
        question='— one picture in, a repeating fabric out; how large one tile lies on the finished cloth'
      >
        <PatternInput
          band={band}
          source={source}
          onPick={setSource}
          onClear={() => setSource(null)}
          disabled={disabled}
        />

        {/* ─── SCALE: СЛОВА ВПЕРЁД, ЧИСЛО ВТОРЫМ, СВОЯ КАРТИНКА КАК ОТВЕТ (H-7) ───────────── */}
        {/* ⚠ ЗНАЧЕНИЕ `data-pattern-act` ОСТАЁТСЯ `repeat`, ХОТЯ РЯД НАЗЫВАЕТСЯ SCALE. Это адрес
            акта в композиции, по которому стоящий гейт (`qa-patacts`) сверяет ПОРЯДОК трёх актов;
            переименование адреса вместе с заголовком сломало бы сторожа, ничего не изменив на
            экране. Слово на экране и ключ в разметке — разные вещи, и здесь это сказано вслух. */}
        <div
          data-pattern-act='repeat'
          className='flex flex-wrap items-start gap-2 border-b border-hairline py-1'
        >
          <Text
            size='micro'
            variant='label'
            tracking='label'
            component='span'
            className='w-[92px] shrink-0 pt-1 uppercase'
          >
            scale
          </Text>

          <div className='flex min-w-0 flex-1 flex-col gap-1'>
            {/* КНОПКИ ПЕРВЫМИ, ПОЛЕ ЧИСЛА ЗА НИМИ. Человек решает «как крупно», а не «сколько
                миллиметров»: слово — это ответ, число — единица, в которой он записан. Поле не
                снято: тот, кто знает своё число, набирает его, и масштаб называется словами и для
                него тоже (85 → «a shirting check»).

                ⚠ ДВА ЯКОРЯ НА ОДНОЙ КНОПКЕ, И ЭТО НЕ НЕБРЕЖНОСТЬ. `data-scale-chip` — имя этой
                волны; `data-quick-repeat` держат ДВЕ стоящие пробы (`qa-pat` D1…D3, E21), которые
                эта волна не перенацеливает. Снять старое имя сейчас значило бы покрасить чужой
                гейт правкой, к которой он отношения не имеет.
                TODO: снять `data-quick-repeat`, когда `tmp/dsgprobe/qa-pat.mjs` (строки 318, 322,
                430) будет перенацелена на `data-scale-chip`; других потребителей у алиаса нет. */}
            <ChipRow>
              {QUICK.map((q) => (
                <Chip
                  key={q.mm}
                  nonForm
                  selected={repeat === q.mm}
                  pressed={repeat === q.mm}
                  disabled={disabled}
                  data-scale-chip={q.mm}
                  data-quick-repeat={q.mm}
                  onClick={() => !disabled && setRepeatText(String(q.mm))}
                >
                  {q.label} · {q.mm}
                </Chip>
              ))}
              {/* «MODEL DECIDES» — ВЫБОР, А НЕ СТАТУС. «NOT STATED» описывало ПОЛЕ («значение не
                  задано»), то есть говорило о нашей форме; человек же выбирает, кто принимает
                  решение о плотности. Названный исполнитель делает пустоту законной. */}
              <Chip
                nonForm
                selected={repeat === 0}
                pressed={repeat === 0}
                disabled={disabled}
                data-scale-chip='0'
                data-quick-repeat='0'
                title='legal: a tile without a declared scale is still a tile, and the model then chooses the density itself'
                onClick={() => !disabled && setRepeatText('0')}
              >
                model decides
              </Chip>

              {/* ПОЛЕ — ОТДЕЛЬНЫЙ ОРГАН, А НЕ ШЕСТАЯ КНОПКА: свой отступ отделяет «точное число» от
                  ряда названных масштабов, иначе на общем шаге ряда оно читается их продолжением. */}
              <div className='ml-2 w-[90px]'>
                <Input
                  name='design-pattern-repeat'
                  type='number'
                  min={0}
                  max={REPEAT_MAX}
                  step={1}
                  value={repeatText}
                  disabled={disabled}
                  placeholder='120'
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setRepeatText(e.target.value)
                  }
                />
              </div>
              <Text size='micro' variant='label' component='span'>
                mm
              </Text>
            </ChipRow>

            {/* МОСТ МЕЖДУ СЛОВОМ SCALE И СЛОВОМ REPEAT. В актах 2 и 3 остаётся «repeat»: они о
                НАСТОЯЩЕЙ плитке, где число стоит при линейке и при поле ассета. Здесь сказано, что
                это одно и то же, — иначе два слова на трёх экранах читаются как две величины. */}
            {/* `micro`, а не `nano`: DESIGN.md §3 отдаёт 10px подсказкам и полям, а 9px — бэджам,
                номерам пинов и ярлыкам полос. Предложение в 179 знаков — подсказка, а не бэдж. */}
            <Text
              size='micro'
              variant='label'
              component='span'
              data-repeat-words
              className='min-w-0 normal-case'
            >
              {repeat > 0
                ? `one tile covers ${repeat} mm of finished cloth — the print trade calls this the repeat. That is ${scaleWords(repeat)}. The model is told the scale in words; it never receives a pixel size.`
                : `${scaleWords(0)}. Whole millimetres up to ${REPEAT_MAX} if you state one; the model is told the scale in words and never receives a pixel size.`}
            </Text>

            {/* ═══ ПОЛОСА ПЛОТНОСТИ — СВОЯ КАРТИНКА КАК ОТВЕТ НА «60 ПРОТИВ 120» ═══════════════
                Стоит только тогда, когда есть на что смотреть: приложен источник И назван масштаб.
                Отрезок ФИКСИРОВАН (полметра) и делений не несёт — это иллюстрация выбора, а не
                вторая линейка. И она обязана назвать свой предел: сырое замощение показывает
                верную ПЛОТНОСТЬ и заведомо неверный ШОВ, а видимый шов без предупреждения читается
                как поломка ещё до того, как что-то куплено. */}
            {sourceUrl && repeat > 0 && (
              <div data-density-preview data-span={DENSITY_SPAN_MM} className='flex flex-col gap-1'>
                {/* ⚠ ПОДПИСЬ ОТДАНА САМОМУ ЛОСКУТУ, А НЕ НАПЕЧАТАНА РЯДОМ. Стоя здесь, она
                    выбиралась ОДНИМ масштабом и не знала про отказ загрузки, который видит только
                    сторож внутри полосы: на битом файле плейсхолдер говорил «the picture did not
                    load», а эта строка под ним — «only the density is true». Теперь оба слова
                    решает один флаг, и противоречие стало невыразимым. */}
                <ClothSwatchStrip
                  url={sourceUrl}
                  repeatMm={repeat}
                  spanMm={DENSITY_SPAN_MM}
                  probe='density-cloth'
                  /* Здесь замощается ПРОИЗВОЛЬНОЕ ФОТО, а не сгенерированная квадратная плитка, —
                     и от этого зависит вертикальный период. Довод — у пропа в `tile-preview`. */
                  subject='picture'
                  caption={
                    tilesAtThisScale
                      ? 'your own picture laid out raw at this scale — only the density is true; the seam is what the run fixes'
                      : `at this scale one tile is wider than the ${DENSITY_SPAN_MM} mm shown here, so this is your picture whole, not a repeat — there is no seam to judge`
                  }
                />
              </div>
            )}
          </div>
        </div>

        {/* ─── ДВЕРЬ. ИНВЕНТАРЬ — ЭТО ЕЁ ПОДПИСЬ, БЛОКА БОЛЬШЕ НЕТ ────────────────────────── */}
        <div className='flex flex-wrap items-center gap-2 pt-1'>
          {frozen ? (
            <InertDoor label='generate' reason={frozen} />
          ) : (
            <Button
              variant='main'
              size='sm'
              loading={run.isPending}
              onClick={() =>
                run.start({
                  kind: 'pattern',
                  ask: '',
                  params: {
                    // ПЛИТКА НЕ ИМЕЕТ ВИДА ИЗДЕЛИЯ. Список пуст ЯВНО, а не отсутствует: пустой
                    // список — утверждение «этот прогон не просит ни одной стороны», и сервер
                    // сверяет его длину.
                    views: [],
                    // ═══ И КОЛОРВЕЯ У ПЛИТКИ НЕТ — ПРОГОН ЕГО ОТВЕРГАЕТ (G-15) ═══════════════
                    // `params.colorway_id` осмыслен на render / recolor / threed и отвергается на
                    // pattern токеном `colorway_forbidden`. Это не пробел контракта: плитка
                    // делается ОДИН РАЗ и живёт тканью КАРТОЧКИ; чей она цвет — вопрос не к
                    // прогону, а к назначению (`SetDesignAssetColorway`), и задаётся он в третьем
                    // акте ниже, над сохранённым ассетом, а не над платной генерацией.
                    colorwayId: 0,
                    layout: '',
                    colour: undefined,
                    threed: undefined,
                    fixTarget: '',
                    // ⚠ ИМЯ ПОЛЯ ГОВОРИТ «EXTRA», А ВЕЗЁТ ОНО ЗДЕСЬ ЕДИНСТВЕННЫЙ ВХОД. Это
                    // переиспользование из контракта, а не небрежность: на рендере это правда
                    // «сверх слотов», на `pattern` — та самая одна картинка, из которой строится
                    // плитка, и сервер отвергает любое другое их число.
                    extraInputMediaIds: [sourceId],
                    fixTargets: [],
                    fixSlotIds: [],
                    autoSplit: false,
                    detailSlotIds: [],
                    pattern: { repeatMm: normaliseRepeat(repeat) },
                    useFlatSlots: false,
                  },
                })
              }
            >
              GENERATE
            </Button>
          )}
          {/* ИНВЕНТАРЬ ПРОМПТА, ОДНОЙ СТРОКОЙ И ДОСЛОВНО. У двух соседних экранов он — панель,
              потому что там уезжают плиты верстака, референсы, посадка и рецепт цвета. Здесь
              уезжают ДВА факта, и список из двух строк за дверью — это дверь, за которой человек
              уже знает, что найдёт, притом что деньги он тратит прямо под ней. */}
          <Text
            size='micro'
            variant='label'
            component='span'
            data-probe='payload'
            className='min-w-0 normal-case'
          >
            {sourceId ? `one picture — media ${sourceId}` : 'one picture — none attached yet'} ·{' '}
            {repeat > 0
              ? `one tile covers ${repeat} mm of cloth (${scaleOf(repeat)})`
              : 'no scale stated'}{' '}
            · priced by the server when the run starts. Nothing else from this card travels: not
            the bench, not the references, not the garment description.
          </Text>
        </div>

        {/* ⚠ ОТКАЗ ДЕРЖИТСЯ НА ЭКРАНЕ И ЦИТИРУЕТСЯ ДОСЛОВНО.
            Тост живёт четыре секунды и уезжает сам — а отказ без ключа НАЗЫВАЕТ ПЕРЕМЕННУЮ
            ОКРУЖЕНИЯ, то есть ровно то, ради чего его и читают. Наша половина — приписка «что с
            этим делать»; она стоит НИЖЕ строки сервера и никогда вместо неё.
            ⚠ Атрибут пробы висит на ВНУТРЕННЕМ div: `CalloutBox` принимает ровно три пропа и
            лишние молча выбрасывает, то есть `data-*` на нём до DOM не доезжает. */}
        {run.refusal && (
          <CalloutBox tone='error'>
            <div data-probe='refusal' className='flex items-start gap-2'>
              <div className='min-w-0 flex-1 space-y-1'>
                <Text size='micro' component='p' className='normal-case'>
                  <b>the run did not start.</b> The server said, in its own words:
                </Text>
                <Text
                  size='micro'
                  component='p'
                  data-probe='refusal-verbatim'
                  className='break-words border border-hairline bg-bgZebra px-2 py-1 normal-case'
                >
                  {run.refusal}
                </Text>
                {advice && (
                  <Text size='micro' variant='label' component='p' className='normal-case'>
                    {advice}
                  </Text>
                )}
              </div>
              <button
                type='button'
                onClick={run.dismissRefusal}
                className='shrink-0 uppercase text-labelColor hover:text-textColor focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
              >
                <Text size='nano' variant='uppercase' tracking='label' component='span'>
                  dismiss
                </Text>
              </button>
            </div>
          </CalloutBox>
        )}

        {/* ЖИВОЙ ПРОГОН РИСУЕТСЯ ЗДЕСЬ, А НЕ ТОЛЬКО В ИСТОРИИ. Человек, нажавший GENERATE, смотрит
            на эту кнопку, а не на ленту двумя блоками ниже; экран, который после нажатия не
            меняется, читается как «ничего не произошло», и следующее, что он делает, — платит
            второй раз. */}
        {live.length > 0 && (
          <div className='flex flex-wrap items-center gap-2 pt-1'>
            <Placeholder dashed label='' className='size-[44px] shrink-0' />
            <LiveLine startedAt={live[0].startedAt ?? live[0].createdAt} count={live.length} />
          </div>
        )}
      </Section>

      {/* ═══════════════════ АКТ 2 — СУДИТЬ ═══════════════════ */}
      {outputs.length === 0 && live.length === 0 ? (
        <Section title='tiles' question='— nothing has come back yet'>
          <Text size='micro' variant='label' component='p' className='normal-case'>
            A tile is one picture made to repeat. What comes back is judged here on a 3×3 preview: a
            single square of cloth looks right every time, and nine of them do not.
          </Text>
        </Section>
      ) : (
        <PatternOutputs band={band} techCardId={techCardId} disabled={disabled} />
      )}

      {/* ═══════════════════ АКТ 3 — ХРАНИТЬ И ОТДАТЬ КОЛОРВЕЮ ═══════════════════ */}
      <PatternLibrary
        band={band}
        techCardId={techCardId}
        colorways={colorways ?? []}
        disabled={disabled}
      />
    </>
  );
}

/**
 * Строка живого прогона. Отдельным компонентом РАДИ ХУКА: `useElapsed` тикает раз в секунду, и
 * вызванный в теле студии он перерисовывал бы вместе с собой всю вкладку, включая сцену с
 * фоновыми плитками. Здесь он перерисовывает одну строку.
 */
function LiveLine({ startedAt, count }: { startedAt?: string | null; count: number }): JSX.Element {
  const elapsed = useElapsed(startedAt ?? undefined);
  return (
    <Text size='micro' variant='label' component='span' className='normal-case'>
      {count === 1 ? 'a tile is being made' : `${count} tiles are being made`}
      {elapsed ? ` · ${elapsed}` : ''} — it lands below when the provider answers. No ETA is
      claimed: nothing on the wire states how long this takes.
    </Text>
  );
}
