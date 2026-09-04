import type { GetDesignBandResponse, common_MediaFull } from 'api/proto-http/admin';
import { useMemo, useState, type JSX } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import Input from 'ui/components/input';
import { Placeholder } from 'ui/components/placeholder';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';

import { ASSET_NAME_MAX } from '../assets/model';
import { InertDoor } from '../bench-slot';
import { serverSpeaksDesign } from '../capability';
import { isRunLive, useElapsed } from '../generation';
import { patternRuns, refusalAdvice } from './model';
import { PatternInput } from './pattern-input';
import { PatternLibrary } from './pattern-library';
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
 * ═══ КРУГ 15: ДВА АКТА ВМЕСТО ТРЁХ (J-12) ════════════════════════════════════════════════════
 *
 * Владелец, дословно: «в make tile не все так топорно должно быть … SCALE этот мне сейчас вообще
 * не кажется нужным в MAKE A TILE он только путает … блок TILES вообще не нужен должен быть
 * удобный просмотр с зумом и тд можно просто оставить блок PATTERNS OF THIS CARD и там сделать
 * более большие карточки паттернов и все».
 *
 * ДВА АКТА, И КАЖДЫЙ — ОТДЕЛЬНЫЙ ВОПРОС, А НЕ ОТДЕЛЬНЫЙ ШАГ МАСТЕРА:
 *   · СДЕЛАТЬ — одна картинка внутрь, кнопка. Один блок, один ряд и дверь;
 *   · ХРАНИТЬ И ОТДАВАТЬ — паттерны карточки крупными карточками: стык виден на лице (плитка
 *     нарисована 2×2), зум открывает общий просмотрщик студии, имя и колорвей правятся на месте.
 *
 * ═══ ЧТО СНЯТО ЭТИМ КРУГОМ И ПОЧЕМУ ИМЕННО ЭТО ══════════════════════════════════════════════
 *
 *   · РЯД `SCALE` целиком — чипы масштаба, поле мм, строка слов и полоса плотности. Число уезжало
 *     в `params.pattern.repeat_mm`, и сервер при `RepeatMM > 0` дописывал в промпт «Draw the motif
 *     at the scale of a N mm repeat». ТЕПЕРЬ УЕЗЖАЕТ ЛИТЕРАЛЬНЫЙ 0, и промпт о плотности не
 *     говорит НИЧЕГО — её выбирает модель. Это ЕДИНСТВЕННОЕ изменение провода на этом экране, оно
 *     стоит денег, и потому сказано и здесь, и в строке инвентаря под самой кнопкой.
 *   · БЛОК `TILES` целиком (сцена 3×3, линейка `ScaleStrip`, чип `selected`, `KEEP IN LIBRARY`,
 *     рельс). ⚠ ВОПРОС, НА КОТОРЫЙ ОН ОТВЕЧАЛ, НЕ ВЫБРОШЕН ВМЕСТЕ С НИМ: «оно тайлится?» решается
 *     теперь на лице карточки паттерна (плитка нарисована 2×2, стык — в центре) и в зуме до 8×.
 *   · ⚠ ДВЕРЬ `KEEP IN LIBRARY` НЕ УДАЛЕНА, А ПЕРЕЕХАЛА. Без неё ни один оплаченный прогон не мог
 *     бы стать тканью карточки вовсе: сервер плитку на полку не кладёт (это отдельная правка
 *     бэкенда, и её на бете НЕТ). Теперь она стоит в полосе `made earlier, not kept` внутри блока
 *     `patterns of this card` — там, где человек и смотрит на то, чем карточка располагает.
 *   · ⚠ ПОМЕТКА `selected` НЕ ОСИРОТЕЛА. Её читает ARTIFACTS (сегмент PATTERNS сужается по ней), и
 *     ставится она ТАМ ЖЕ — у каждой плиты панели ARTIFACTS есть своя дверь `select`. Фильтр и его
 *     переключатель остались на одном экране; здесь стоял ВТОРОЙ писатель одного факта.
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
 * ═══ КОЛОРВЕЙ УШЁЛ С ЭТОГО ЭКРАНА — E-1 ══════════════════════════════════════════════════════
 *
 * Владелец, дословно: «в MAKE A PATTERN оставь только имя убери колорвей».
 *
 * ЧТО СНЯТО: ряд `colourway` (второе поле жеста), состояние `colorwayId`, проп `colorways` и
 * приписка «Filing it on ROSSO takes that colourway off whatever else was wearing it» — она
 * описывала разрушительное последствие, которого больше не бывает.
 *
 * ЧТО ЕДЕТ ТЕПЕРЬ. `params.colorway_id: 0`. Контракт поле ПРИНИМАЕТ на этом роде
 * (`DesignRunKindTakesColorway` перечисляет pattern — сверено на `origin/beta`), и ноль — не
 * пропуск, а ЗАКОННОЕ ЗНАЧЕНИЕ «ничей». `keepPatternTx` читает живую колонку прогона и при
 * `cw > 0` зовёт `stealColorwayTx`; при нуле он этой ветки не касается вовсе — готовая плитка
 * встаёт на полку карточки НИЧЬЕЙ, ровно в то же состояние, в которое её и так переводит FK при
 * удалении колорвея. То есть посадка на полку (одно нажатие = плитка на карточке) НЕ ПОТЕРЯНА,
 * потеряна только атрибуция, которую владелец просил убрать.
 *
 * ⚠ И ЭТО ЖЕ ОТВЕЧАЕТ НА ВТОРУЮ ПОЛОВИНУ E-15. «Keep» перестаёт быть жестом, после которого
 * ткань сама становится текстурой рендера: одевать колорвей больше нечем, а рендер и так не
 * читает носку — он читает выбор в сетке TEXTURE & COLOUR, сделанный руками.
 */
export function PatternStudio({
  band,
  techCardId,
  disabled,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
}): JSX.Element {
  const speaks = serverSpeaksDesign();
  const run = useStartDesignRun(techCardId);
  const [source, setSource] = useState<common_MediaFull | null>(null);
  const sourceId = source?.id ?? 0;
  /* ИМЯ — ВЕСЬ ЖЕСТ (E-1). Владелец: «оставь только имя убери колорвей». Оно уезжает В ПРОГОН,
     а не назначается потом над сохранённым ассетом: с круга 15 `keepPatternTx` сажает готовую
     плитку на полку В ТОЙ ЖЕ транзакции, что закрывает прогон, и читает имя именно оттуда. */
  const [name, setName] = useState('');
  /* РОДИТЕЛЬ ПЛИТКИ, когда источник взят чипом полки. Ноль — «не назван», и это ЧЕСТНОЕ
     состояние для файла из библиотеки или из буфера: у них родителя нет. Контракт сужает
     поле до ткани или другого паттерна ЭТОЙ карточки, и сервер это проверяет. */
  const [sourceAssetId, setSourceAssetId] = useState(0);
  const patternName = name.trim();
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
        ? 'no picture is attached — a pattern is made out of exactly one picture. Attach one above: from the library, from the clipboard, or one of this card’s cloths'
        : !patternName
          ? /* СЕРВЕР ОТКАЗЫВАЕТ `pattern_name_required` БЕСПЛАТНО, ДО РЕЗЕРВА. Эта дверь
               говорит то же самое ДО нажатия: отказ, который человек читает только после
               клика, — это отказ, о котором экран знал и промолчал. */
            'this pattern has no name — it is filed on the card’s shelf under one, and a nameless tile reaches a later prompt as the bare word «pattern»'
          : null;

  const advice = run.refusal ? refusalAdvice(run.refusal) : '';

  return (
    <>
      {/* ═══════════════════ АКТ 1 — СДЕЛАТЬ ПЛИТКУ ═══════════════════ */}
      <Section
        title='make a pattern'
        question='— one picture in, a seamless repeat out; it lands in the block below'
      >
        <PatternInput
          band={band}
          source={source}
          onPick={(media, assetId) => {
            setSource(media);
            setSourceAssetId(assetId ?? 0);
          }}
          onClear={() => {
            setSource(null);
            setSourceAssetId(0);
          }}
          disabled={disabled}
        >
        {/* ─── НАЗВАТЬ — ОДНО ПОЛЕ (E-1) ────────────────────────────────────────────────────
            Владелец: «оставь только имя убери колорвей». Поле стоит НАД дверью, потому что
            читается оно до нажатия, а не после: имя обязательно, и дверь без него не
            открывается — сервер отказал бы `pattern_name_required` бесплатно, но отказ, который
            человек читает только после клика, это отказ, о котором экран знал и промолчал. */}
        <div className='flex flex-col gap-2'>
          <label className='flex flex-col gap-1' htmlFor='design-pattern-name'>
            <Text size='micro' variant='label' component='span'>
              name
            </Text>
            <Input
              name='design-pattern-name'
              data-pattern-name
              value={name}
              disabled={disabled}
              // ПРЕДЕЛ ЖИВЁТ В ОДНОМ МЕСТЕ (`ASSET_NAME_MAX`), а не переписан числом: у
              // колонки `design_asset.name` VARCHAR(60), у двери то же правило, и соседний
              // экран библиотеки уже читает эту же константу. Второе определение разошлось
              // бы молча в тот день, когда сдвинется первое.
              maxLength={ASSET_NAME_MAX}
              placeholder='chevron, washed denim, oil slick…'
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
            />
          </label>
        </div>

        {/* ─── ДВЕРЬ. ИНВЕНТАРЬ — ЭТО ЕЁ ПОДПИСЬ, БЛОКА БОЛЬШЕ НЕТ ────────────────────────── */}
        <div className='flex flex-wrap items-center gap-2'>
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
                    // ═══ ПЛИТКА ЕДЕТ БЕЗ КОЛОРВЕЯ — E-1 ════════════════════════════════════
                    // Владелец: «оставь только имя убери колорвей». Поле контракт на этом роде
                    // ПРИНИМАЕТ (`DesignRunKindTakesColorway` перечисляет pattern, сверено на
                    // `origin/beta`), поэтому ноль здесь — не «поле не задано» и не отказ, а
                    // ЗАКОННОЕ ЗНАЧЕНИЕ «ничей». `keepPatternTx` читает живую колонку прогона и
                    // при нуле не касается `stealColorwayTx` вовсе: готовая плитка встаёт на
                    // полку карточки ничьей — ровно туда же, куда её переводит FK при удалении
                    // колорвея. Посадка на полку при этом НЕ ПОТЕРЯНА: её решает ИМЯ, а имя
                    // осталось и обязательно.
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
                    // ═══ РАППОРТ УЕЗЖАЕТ ЛИТЕРАЛЬНЫМ НУЛЁМ (J-12) ═══════════════════════════
                    // Владелец: «SCALE этот мне сейчас вообще не кажется нужным … он только
                    // путает». Ряд снят, и число НЕ СОБИРАЕТСЯ НИОТКУДА — ни из поля, ни из
                    // чипа, ни из прошлого прогона. Ноль здесь — ОТВЕТ («плотность выбирает
                    // модель»), а не пропуск: сервер при `RepeatMM == 0` не пишет о масштабе в
                    // промпт ни слова (`designgen/patternprompt.go`), и это ровно то, о чём
                    // просили. Поле названо явно, потому что контракт требует назвать его.
                    // ИМЯ ОБЯЗАТЕЛЬНО, И ДВЕРЬ ВЫШЕ НЕ ОТКРЫВАЕТСЯ БЕЗ НЕГО. `sourceAssetId`
                    // приходит ненулевым РОВНО ТОГДА, когда источник взят чипом полки:
                    // тогда родитель известен и его нельзя терять. Файл из библиотеки или
                    // из буфера родителя не имеет, и ноль там — утверждение, а не пропуск.
                    pattern: { repeatMm: 0, name: patternName, sourceAssetId },
                    useFlatSlots: false,
                    // Поле НАРАЩИВАЕТ `use_flat_slots` и осмысленно только на kind=flat; здесь оно ИГНОРИРУЕТСЯ
                    // сервером, а пустой список и так значит «все заполненные». Стоит явно, потому что
                    // контракт требует назвать поле, а не потому, что этому прогону есть что им сказать.
                    flatSlotIds: [],
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
            {sourceId ? `one picture — media ${sourceId}` : 'one picture — none attached yet'} · no
            scale stated, so the model chooses the density itself · priced by the server when the
            run starts. No other picture from this card travels: not the bench, not the references.
            {/* ⚠ ЗДЕСЬ СТОЯЛО РАСКРЫТИЕ РАЗРУШИТЕЛЬНОГО ДЕЙСТВИЯ — «Filing it on ROSSO takes that
                colourway off whatever else was wearing it». Оно ушло вместе с самим действием
                (E-1): прогон больше не называет колорвея, `keepPatternTx` при нуле не касается
                `stealColorwayTx` вовсе, и снимать что-то с чего-то стало нечем. Строка снята
                ИМЕННО ПОТОМУ, что описываемого ею последствия больше не бывает; оставить её
                значило бы предупреждать о том, чего не произойдёт. */}{' '}
            It lands on the card&apos;s shelf under the name above, owned by no colourway.
          </Text>
        </div>
        </PatternInput>

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

      {/* ═══════════════════ АКТ 2 — ХРАНИТЬ, СУДИТЬ СТЫК И ОТДАТЬ КОЛОРВЕЮ ═══════════════════ */}
      <PatternLibrary band={band} techCardId={techCardId} disabled={disabled} />
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
      {count === 1 ? 'a pattern is being made' : `${count} patterns are being made`}
      {elapsed ? ` · ${elapsed}` : ''} — it lands in PATTERNS OF THIS CARD when the provider
      answers. No ETA is claimed: nothing on the wire states how long this takes.
    </Text>
  );
}
