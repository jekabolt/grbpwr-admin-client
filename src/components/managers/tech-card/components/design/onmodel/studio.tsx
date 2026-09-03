import type { GetDesignBandResponse } from 'api/proto-http/admin';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useMemo, useState, type JSX } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { GroupLabel } from 'ui/components/group-label';
import Input from 'ui/components/input';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';

import { ColourStatementRow } from '../render/colour-statement';
import { FieldRow, Hint } from '../render/field-row';
import { GenerateRow } from '../render/generate-row';
import { ASSET_PATTERN, shelfAssets } from '../assets/model';
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
 * ЧТО (цвет), потом ЧТО ВЕРНУЛОСЬ. Тот же порядок, что у двух соседних генеративных экранов: на
 * материал смотрят раньше, чем решают, что с ним сделать.
 *
 * ═══ ЧЕГО ЗДЕСЬ НЕТ, И ЭТО ПРАВИЛА, А НЕ ПРОБЕЛЫ ══════════════════════════════════════════════
 *
 *  · ВЕРСТАКА НЕТ. Перекраска не адресуется видами: `params.views` уезжает ПУСТЫМ, а `ghost_view`
 *    на выводе сервер нарочно не заполняет — сторону снимка не объявляет никто, и выдумывать её
 *    было бы враньём в замороженной истории.
 *  · РЯДА CLOTHS НЕТ. Лоскут ткани называет МАТЕРИАЛ, а материал у снятой вещи уже есть — он на
 *    фотографии. Пускать его сюда значило бы предлагать сменить ткань там, где меняют цвет.
 *    Черновик цвета сужен так, что фотография ткани в него физически не попадает (`./drafts.ts`).
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
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
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
   * строка у кнопки, его же описывает заголовок ряда и опись перед деньгами. Три читателя,
   * реконструирующие тело из черновика каждый по-своему, — это три утверждения об одном платном
   * прогоне, и расходятся они молча: на соседнем экране подпись говорила «плиты не едут» ровно
   * тогда, когда тело говорило «шли все».
   */
  const wireColour = useMemo(
    () => recolourWireColour(band, colour.recipe, picked?.assetId ?? 0),
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
         * ═══ ПЕРЕКРАС ЕДЕТ БЕЗ КОЛОРВЕЯ, И ЭТО РЕШЕНИЕ, А НЕ ПРОПУСК ═══════════════════════════
         *
         * Контракт колорвей на `recolor` ПРИНИМАЕТ. Но на этом экране нет и не появилось ни одного
         * органа, который его называет: владелец про ON MODEL не сказал ни слова, пикер стоит на
         * FABRIC RENDER и 3D, а состояние студии — общее. Переслать сюда чужой выбор значило бы
         * ЗАМОРОЗИТЬ В ИСТОРИИ атрибуцию, которой человек не видел и снять не мог: «эта фотография
         * перекрашена ДЛЯ ROSSO», потому что на соседней вкладке был открыт ROSSO. Это ровно та
         * молчаливая приписка, от которой ось и заводили, только в обратную сторону.
         *
         * Ноль здесь — «не атрибутирован», и это ПРАВДА про этот прогон: его выход объявляет себя
         * `kind: render`, но представление у него `onmodel`, поэтому ни в один рендер-верстак и ни
         * в один список кандидатов 3D он не попадает — сужать по колорвею тут просто нечего.
         * ЧТО ДОЛЖНО СТАТЬ ПРАВДОЙ, ЧТОБЫ НОЛЬ УШЁЛ: на ЭТОМ экране появится свой орган выбора
         * колорвея — то есть выход ON MODEL начнёт попадать в верстак или в список кандидатов,
         * сужаемый по колорвею, и человек сможет увидеть и снять атрибуцию. До тех пор ноль
         * означает выбор, которого не было, а не выбор, который забыли переслать.
         */
        colorwayId: 0,
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
        title='generation — on model'
        question='— the cloth those photographs are re-dressed in: a pattern, a colour, or both'
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
          <GroupLabel
            action={
              <Text size='micro' variant='label' component='span' className='normal-case'>
                a pattern, a colour, or both — one cloth per run
              </Text>
            }
          >
            the cloth
          </GroupLabel>

          {/* ═══ ЗАГОЛОВОК-ЗАЯВЛЕНИЕ + РЯД ПЛИТОК (J-31) ═════════════════════════════════════
              Довод формы и порядка старшинства целиком в `./cloth-row.tsx`. Здесь важно одно:
              всё, что этот ряд показывает, читается из `wireColour` — тела запроса, — а не из
              черновика рядом с ним. */}
          <ClothRow
            choices={choices}
            chosen={picked}
            colour={wireColour}
            colors={colors}
            disabled={disabled}
            onPick={cloth.pick}
            onClear={() => cloth.pick(0)}
            hasAnyPattern={shelfAssets(band, ASSET_PATTERN).length > 0}
          />

          {/* ТОТ ЖЕ ОРГАН, ЧТО В ФАБРИК-РЕНДЕРЕ, А НЕ ПОХОЖИЙ НА НЕГО: пикер, значение и имя — один
              компонент на два экрана. Цвет здесь тот же предмет, и второе написание разошлось бы с
              первым молча (уже расходилось — довод в шапке `colour-statement.tsx`).

              ⚠ СЕТКА СЛОВАРЯ КОДОВ УШЛА И ОТСЮДА (H-8). Владелец назвал только FABRIC RENDER, но
              орган ОДИН на два экрана, и оставить сетку здесь можно было бы только вернув вторую
              копию компонента — то есть заплатив ровно тем дефектом, ради устранения которого его
              и сводили в один. Цвет на перекрасе выбирают тем же жестом, потому что это тот же
              предмет. Если коды на перекрасе владельцу нужны — это один проп, а не развилка. */}
          <ColourStatementRow
            band={band}
            draft={colour}
            disabled={disabled}
            hint={
              picked ? (
                <>
                  With a pattern picked, the colour <b>re-tints that pattern</b> and keeps its
                  motif, weave and scale — the same order of authority a fabric render uses. On its
                  own it repaints the cloth already in the photograph, keeping its weave, folds and
                  shadows.
                </>
              ) : (
                <>
                  The colour goes to the model as a name and a hex together. It repaints the garment
                  only: the weave, the folds and the shadows of the photograph are kept, and nothing
                  else in the frame is touched. Picking one states nothing about the style — a
                  colourway is signed off by a lab dip, not by a picture.
                </>
              )
            }
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
