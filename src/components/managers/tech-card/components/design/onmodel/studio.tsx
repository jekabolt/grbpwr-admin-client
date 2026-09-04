import type { GetDesignBandResponse } from 'api/proto-http/admin';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useMemo, useState, type JSX } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import Input from 'ui/components/input';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';

import { FieldRow, Hint } from '../render/field-row';
import { GenerateRow } from '../render/generate-row';
import { fabricStatement, type Gate } from '../render/model';
import { useStartDesignRun } from '../render/use-design-run';
import { WhatModelGetsRenderModal } from '../render/what-model-gets';
import { ClothRow } from './cloth-row';
import { useClothChoice, useRecolorSources, useTargetColourDraft } from './drafts';
import { OnModelInputStrip } from './input-strip';
import { chosenCloth, clothChoices, recolorGate, recolorShape, recolourWireColour } from './model';
import { OnModelOutputs } from './outputs';
import { PriceBeforeThePress } from './price';

/**
 * ═══ ON MODEL — ФОТОГРАФИИ ВЕЩИ НА ЧЕЛОВЕКЕ, ПЕРЕКРАШЕННЫЕ ГЕНЕРАЦИЕЙ (K-17) ══════════════════
 *
 * Владелец, дословно: «раздел ON MODEL должен быть таким что мы можем загрузить фото реальное на
 * модели с разных сторон и нам можно будет поменять цвет вещи». И его же ответ на «как менять»:
 * ГЕНЕРАЦИЕЙ — модель перекрашивает вещь, сохраняя ткань, складки и тени.
 *
 * ЭТО НЕ РЕНДЕР С ФЛАГОМ, И РАЗНИЦА НЕ АДМИНИСТРАТИВНАЯ. Фабрик-рендер СОЧИНЯЕТ фотографию,
 * которой не существует, из чертежей на верстаке; перекраска обязана НЕ ТРОГАТЬ фотографию,
 * которая есть. Две эти инструкции модели противоречат друг другу построчно, поэтому у экрана свой
 * род прогона (`recolor`) и своя дверь. Контракт говорит то же самое своими словами.
 *
 * ТРИ БЛОКА, В ЭТОМ ПОРЯДКЕ, И ПОРЯДОК — ЭТО ДОВОД. Сначала ЧТО перекрашиваем (снимки), потом ВО
 * ЧТО (текстура и цвет), потом ЧТО ВЕРНУЛОСЬ. Тот же порядок, что у двух соседних генеративных
 * экранов: на материал смотрят раньше, чем решают, что с ним сделать.
 *
 * ═══ ВО ЧТО ПЕРЕОДЕВАЮТ — ТЕМ ЖЕ РЯДОМ, ЧТО НА FABRIC RENDER (D-14) ═══════════════════════════
 *
 * Владелец, дословно: «ON MODEL так же должен принимать колор и текстур инпут как FABRIC RENDER».
 * Меню открывается группой `texture & colour` и ОДНОЙ строкой: сетка текстур карточки слева, плитка
 * цвета справа, дверь `+ texture` в той же сетке — ряд D-8 палитры, повторённый теми же
 * примитивами и с теми же мерами (`./cloth-row.tsx`). Что в нём иначе, чем на рендере, и почему,
 * сказано там же; здесь важно одно — читает он ТЕЛО запроса (`wireColour`), а не черновик.
 *
 * ═══ ЧЕГО ЗДЕСЬ НЕТ, И ЭТО ПРАВИЛА, А НЕ ПРОБЕЛЫ ══════════════════════════════════════════════
 *
 *  · ВЕРСТАКА НЕТ. Перекраска не адресуется видами: `params.views` уезжает ПУСТЫМ, а `ghost_view`
 *    на выводе сервер нарочно не заполняет — сторону снимка не объявляет никто, и выдумывать её
 *    было бы враньём в замороженной истории.
 *  · РЯДА `cloth is` НЕТ. Граммаж и прозрачность ткани на фотографии видны, объявлять их словами
 *    значило бы спорить со снимком; черновик цвета здесь сужен так, что ткань в него не засевается
 *    (`./drafts.ts`) — выбранная текстура живёт числом в `useClothChoice`.
 *  · ПОДАЧИ И ТЕЛА НЕТ. Кто и как стоит в кадре — уже решено съёмкой; пикер модели здесь был бы
 *    органом без действия.
 *
 * ═══ ДЕНЬГИ — ЕДИНСТВЕННОЕ, ЧТО ЗДЕСЬ УСТРОЕНО ИНАЧЕ, ЧЕМ У СОСЕДЕЙ ═══════════════════════════
 *
 * Один платный вызов НА КАЖДЫЙ снимок. Значит цена — единственная во всей полосе — растёт от
 * органа, стоящего ВЫШЕ по экрану, и человек добавляет пятую фотографию, не думая о счёте. Поэтому
 * над кнопкой стоит `PriceBeforeThePress`: он называет число покупаемых картинок, называет
 * умножение вслух и приводит свидетельство — во что обошёлся последний закончившийся рекол ЭТОЙ
 * карточки. Прогноза в деньгах нет и быть не может: цена прогона, который ещё не заказан, не лежит
 * ни в одном поле контракта.
 *
 * ═══ ОТКАЗ ПОКАЗЫВАЕТСЯ ДОСЛОВНО ═════════════════════════════════════════════════════════════
 *
 * Ворота ниже ЗЕРКАЛЯТ бесплатные отказы сервера (`no_source_picture`, `no_target_colour`), чтобы
 * человек не покупал круг по сети ради того, что видно на экране. Всё остальное — отказ по ключу,
 * который НАЗЫВАЕТ переменную окружения, снятая с публикации модель провайдера, неизвестный этому
 * бандлу новый код — печатается ТЕМИ СЛОВАМИ, КОТОРЫМИ ПРИШЛО. Своя проза на месте серверной
 * стёрла бы ровно ту часть, по которой неисправность и опознают.
 */
export function OnModelStudio({
  band,
  techCardId,
  disabled,
  colorwayId = 0,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
  /**
   * ЧЕЙ ЭТОТ ПЕРЕКРАС — число из ЕДИНСТВЕННОГО органа выбора на всю студию (селект в правом конце
   * ряда представлений, круг 19, C1). `0` — «не атрибутирован», по-прежнему законное значение и
   * умолчание пропа. Довод, по которому оно перестало быть КОНСТАНТОЙ, — у самого поля в теле
   * прогона ниже.
   */
  colorwayId?: number;
}): JSX.Element {
  const sources = useRecolorSources();
  const colour = useTargetColourDraft(band);
  const cloth = useClothChoice();
  const run = useStartDesignRun(techCardId);
  const { dictionary } = useDictionary();
  const colors = dictionary?.colors;
  /** Опись промпта. Модалка — своя поверхность, поэтому монтируется рядом с блоками. */
  const [inspecting, setInspecting] = useState(false);

  const count = sources.items.length;
  const stated = fabricStatement(colour.recipe);

  const choices = useMemo(
    () => clothChoices(band, sources.mediaIds),
    [band, sources.mediaIds.join(',')], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const picked = chosenCloth(choices, cloth.assetId);

  /**
   * ═══ ОДИН ОБЪЕКТ НА СУД, НА ПОДПИСЬ И НА ПРОВОД (J-31) ════════════════════════════════════
   *
   * `wireColour` — РОВНО ТО, что уедет в `params.colour`. Его же судят ворота, его же печатает
   * строка у кнопки, его же описывает строка под рядом текстуры и опись перед деньгами. Три
   * читателя, реконструирующие тело из черновика каждый по-своему, — это три утверждения об одном
   * платном прогоне, и расходятся они молча: на соседнем экране подпись говорила «плиты не едут»
   * ровно тогда, когда тело говорило «шли все».
   */
  const wireColour = useMemo(
    () => ({
      ...recolourWireColour(band, colour.recipe, picked?.assetId ?? 0),
      /**
       * ═══ ИМЯ ЦВЕТА НЕ УЕЗЖАЕТ С ЭТОГО ЭКРАНА — E-11, И ЭТО ДВЕРЬ, А НЕ СКРЫТОЕ ПОЛЕ ════════
       *
       * Владелец: «в GENERATION — ON MODEL текстфилд NAME не нужен». Поля нет (плитка цвета в
       * `./cloth-row.tsx` без него) — но снять ТОЛЬКО поле значило бы оставить писателя без
       * органа: `code` приезжает в черновик ещё и с плашки прошлого рецепта карточки, и
       * `colourPhrase` печатает его в промпт ПАРОЙ с hex. Экран без имени покупал бы «colourway
       * dusty rose — the exact value is #001122», а человек не увидел бы ни имени, ни способа его
       * снять.
       *
       * ⚠ ПОЭТОМУ ЧИСТКА СТОИТ У ЕДИНСТВЕННОЙ ДВЕРИ НА ПРОВОД, А НЕ У ПОЛЯ. `wireColour` читают
       * ВСЕ четверо — ворота, строка у кнопки, строка под рядом и опись «what the model gets», —
       * поэтому все четверо видят ровно то, что уедет. Правка у поля держалась бы порядком
       * событий и мимо плашки не проходила бы вовсе.
       *
       * ЧТО ЭТИМ ПОТЕРЯНО, ВСЛУХ: цель перекраса заявляется ЗНАЧЕНИЕМ и СЛОВАМИ, без имени.
       * Ворота это принимают (`no_target_colour` довольствуется hex или words), и промпт тоже:
       * ветка `colourPhrase` без кода печатает hex голым.
       */
      code: '',
    }),
    [band, colour.recipe, picked?.assetId],
  );

  const gate: Gate = useMemo(
    () => recolorGate(sources.mediaIds, wireColour),
    [sources.mediaIds.join(','), wireColour], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const generate = () => {
    // Ворота уже отказали бы пустому набору; это второй, дешёвый сторож — прогон без снимков
    // заморозил бы историю, которую потом нечем прочитать.
    if (!sources.mediaIds.length) return;
    run.start({
      kind: 'recolor',
      // ASK СНЯТ СО ВСЕЙ ПОЛОСЫ (T-3): всё, что человек хочет сказать, живёт в полях, которые
      // экран показывает. Здесь это слова о цвете — они едут внутри рецепта, а не отдельной
      // строкой, которую никто больше не читает.
      ask: '',
      params: {
        // ВИДОВ НЕТ. Перекраска не адресуется видами, и `detail_slot_ids` обязан быть той же
        // длины, что число элементов `detail` в `views`: два пустых списка — единственная пара,
        // которая здесь не лжёт.
        views: [],
        detailSlotIds: [],
        /**
         * ═══ ПЕРЕКРАС ЕДЕТ С КОЛОРВЕЕМ — УСЛОВИЕ, ЗАПИСАННОЕ ЗДЕСЬ ЖЕ, ВЫПОЛНЕНО ═══════════════
         *
         * ЗДЕСЬ СТОЯЛ ЖЁСТКИЙ НОЛЬ, и довод под ним был не «нам не нужно», а ИМЕННО УСЛОВИЕ:
         * «переслать сюда ЧУЖОЙ выбор значило бы заморозить в истории атрибуцию, которой человек
         * не видел и снять не мог — эта фотография перекрашена ДЛЯ ROSSO, потому что на соседней
         * вкладке был открыт ROSSO», и дальше дословно: «ЧТО ДОЛЖНО СТАТЬ ПРАВДОЙ, ЧТОБЫ НОЛЬ
         * УШЁЛ: на ЭТОМ экране появится свой орган выбора колорвея».
         *
         * Круг 19 (C1) это и сделал — но НЕ вторым пикером на экране, а ОДНИМ на всю студию, в
         * правом конце ряда представлений, который на ON MODEL ВИДЕН. Условие выполнено по своей
         * сути, а не по букве: выбор стоит НАД этим экраном, человек его ВИДИТ и МОЖЕТ СНЯТЬ
         * (`no colourway` — полноценный пункт, а не отсутствие). Молчаливой приписки, от которой
         * сторожил ноль, не остаётся.
         *
         * И атрибуция здесь ЗНАЧИТ: выход перекраса объявляет себя `kind: render` этого колорвея
         * (`entity/design.go`), то есть попадает в его историю рендеров. Ноль по-прежнему законен
         * и означает ровно «не атрибутирован» — им и остаётся всё, что снято под `no colourway`.
         */
        colorwayId,
        layout: '',
        /**
         * ЦВЕТ И ТКАНЬ — ОДИН ОБЪЕКТ, СОБРАННЫЙ ОДНОЙ ФУНКЦИЕЙ (`recolourWireColour`), и здесь
         * он только называется. Все инварианты — «полунабранный hex не уезжает», «ткань без
         * картинки не уезжает», «`fabric_media_id` обязан повторять `fabrics[0].media_id`, иначе
         * воркер не приложит плитку, а промпт всё равно скажет image 2» — живут там, потому что
         * там же их читают ворота.
         */
        colour: wireColour,
        threed: undefined,
        fixTarget: '',
        // ЗДЕСЬ ЭТО НЕ «ДОПОЛНИТЕЛЬНЫЕ» ВХОДЫ, А ПЕРВИЧНЫЕ, и имя поля это переживает: контракт
        // называет их для рекола «THE PHOTOGRAPHS BEING RECOLOURED», по одному платному вызову на
        // каждую. Порядок — тот, в котором они стоят на полосе входа.
        extraInputMediaIds: sources.mediaIds,
        fixTargets: [],
        fixSlotIds: [],
        // Склеенных листов эта дверь не производит: каждый снимок возвращается своей картинкой,
        // и резать нечего.
        autoSplit: false,
        pattern: undefined,
        useFlatSlots: false,
        // Поле НАРАЩИВАЕТ `use_flat_slots` и осмысленно только на kind=flat; здесь оно ИГНОРИРУЕТСЯ
        // сервером, а пустой список и так значит «все заполненные». Стоит явно, потому что
        // контракт требует назвать поле, а не потому, что этому прогону есть что им сказать.
        flatSlotIds: [],
      },
    });
  };

  /** Слова последнего отказа. Живут до следующего нажатия — тост живёт секунды. */
  const refusal = (run.refusal ?? '').trim();

  return (
    <>
      <OnModelInputStrip sources={sources} disabled={disabled} />

      <Section
        /* ЯКОРЬ ОБЪЯВЛЕН по тому же доводу, что у меню фабрик-рендера (`design-fabric-menu`): об
           этом блоке делаются утверждения ПРИНАДЛЕЖНОСТИ (сетка текстур и плитка цвета живут
           именно здесь — D-14) и ОТСУТСТВИЯ (поля имени цвета в нём нет — E-11). */
        id='design-onmodel-menu'
        title='generation — on model'
        question='— what those photographs are re-dressed in: a texture, a colour, or both'
      >
        <PriceBeforeThePress band={band} sources={count} />

        {/* ОТКАЗ ПОСЛЕДНЕГО НАЖАТИЯ, ДОСЛОВНО. Стоит НАД органами, которые его снимают, и не
            уходит по таймеру: отказ по ключу называет переменную окружения, а имя переменной,
            мелькнувшее во всплывающем сообщении, — имя, которое некому передать. */}
        {refusal && (
          <CalloutBox tone='error'>
            <Text size='micro' component='p' className='normal-case'>
              <b>the run did not start.</b> The server answered: «{refusal}». These are its words,
              printed as they arrived — nothing was charged for a request that was refused at the
              door.
            </Text>
          </CalloutBox>
        )}

        <div>
          {/* ═══ TEXTURE & COLOUR — РЯД D-8, КАК НА FABRIC RENDER (D-14) ═══════════════════════
              Группа, сетка текстур, плитка цвета, дверь `+ texture`, строка «что произойдёт со
              снимком» — всё в `./cloth-row.tsx`. Здесь важно одно: всё, что этот ряд показывает,
              читается из `wireColour` — тела запроса, — а не из черновика рядом с ним; сам черновик
              отдаётся плитке цвета как ПИСАТЕЛЮ.

              ⚠ ЗДЕСЬ СТОЯЛИ ДВА ОРГАНА, И ОБА УШЛИ В ЭТОТ РЯД: заголовок-заявление с рядом плиток
              `pattern` (J-31) и `ColourStatementRow` — 22px-свотч с полем hex (общий с рендером,
              пока рендер не перешёл на плитку цвета палитры). Второй теперь не читает НИКТО из
              экранов; файл `render/colour-statement.tsx` остался на диске за чужой волной.
              Подсказка «with a pattern picked, the colour re-tints that pattern…», стоявшая у
              него, не потеряна — это строка под рядом (`data-cloth-says`), сказанная теми же
              словами, что в промпте. */}
          <ClothRow
            band={band}
            techCardId={techCardId}
            choices={choices}
            chosen={picked}
            draft={colour}
            colour={wireColour}
            colors={colors}
            disabled={disabled}
            onPick={cloth.pick}
          />

          {/* ⚠ РЯД `in words` ОСТАЁТСЯ, ХОТЯ ВЛАДЕЛЕЦ НАЗВАЛ ТОЛЬКО «паттерн/цвет».
              Слова — ТРЕТЬЕ законное заявление цели у двери (`no_target_colour` довольствуется
              `params.colour.words`), и оно работает СЕГОДНЯ. J-31 сформулирован как «должна быть
              возможность», то есть прибавление; снять при этом уже работающий бесплатный способ
              заказать «washed indigo» значило бы отнять у человека орган, о котором он не просил
              и которого потом не хватится вслух. */}
          <FieldRow label='in words'>
            <div className='w-full max-w-[420px]'>
              <Input
                name='design-recolor-words'
                value={colour.recipe.words ?? ''}
                disabled={disabled}
                placeholder='washed indigo, slightly faded at the seams…'
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  colour.typed({ words: e.target.value })
                }
              />
            </div>
            {!disabled && stated.words && (
              <Button variant='secondary' size='xs' onClick={() => colour.clear('words')}>
                clear
              </Button>
            )}
            <Hint>
              adds what a swatch cannot say — a finish, a wash, a fade. Enough on its own: the
              server takes a target named in words alone.
            </Hint>
          </FieldRow>
        </div>

        <GenerateRow
          gate={gate}
          shape={recolorShape(count, wireColour)}
          pending={run.isPending}
          disabled={disabled}
          onGenerate={generate}
          onInspect={() => setInspecting(true)}
        />
      </Section>

      <OnModelOutputs band={band} techCardId={techCardId} disabled={disabled} />

      {/* ОПИСЬ ЧИТАЕТ ТЕЛО ЗАПРОСА, А НЕ ЧЕРНОВИК. Панель называется «what the model gets»; она
          обязана перечислять то, что действительно уедет, включая плитку ткани второй картинкой
          каждого вызова. */}
      <WhatModelGetsRenderModal
        open={inspecting}
        onOpenChange={setInspecting}
        band={band}
        kind='recolor'
        recipe={wireColour}
        sources={sources.items}
        cardFit=''
      />
    </>
  );
}
