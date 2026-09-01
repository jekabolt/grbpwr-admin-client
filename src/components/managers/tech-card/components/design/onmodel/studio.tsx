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
import { FieldRow, Hint, Swatch } from '../render/field-row';
import { GenerateRow } from '../render/generate-row';
import {
  colourLabel,
  colourSubtitle,
  colourSwatchHex,
  fabricStatement,
  wireColourSource,
  type Gate,
} from '../render/model';
import { useStartDesignRun } from '../render/use-design-run';
import { WhatModelGetsRenderModal } from '../render/what-model-gets';
import { useRecolorSources, useTargetColourDraft } from './drafts';
import { OnModelInputStrip } from './input-strip';
import { recolorGate, recolorShape } from './model';
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
  const run = useStartDesignRun(techCardId);
  const { dictionary } = useDictionary();
  const colors = dictionary?.colors;
  /** Опись промпта. Модалка — своя поверхность, поэтому монтируется рядом с блоками. */
  const [inspecting, setInspecting] = useState(false);

  const count = sources.items.length;
  const stated = fabricStatement(colour.recipe);

  const gate: Gate = useMemo(
    () => recolorGate(band, count, colour.recipe),
    [band, count, colour.recipe],
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
        layout: '',
        colour: {
          ...colour.recipe,
          // ВЫВЕДЕНО У ДВЕРИ, А НЕ ХРАНИТСЯ КОНТРОЛОМ. `source` старше комбинирования и не умеет
          // выговорить «код и слова вместе»; пишется он только ради читаемости уже сохранённых
          // рецептов и никогда не решает, что уедет, — решают заполненные поля.
          source: wireColourSource(colour.recipe),
        },
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
        question='— the colour the garment in those photographs is repainted in'
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
                the colour is stated by a code, a hex, words, or any mix of them
              </Text>
            }
          >
            target colour
          </GroupLabel>

          {/* ЧТО СКАЗАНО — СКАЗАНО ДО ТОГО, КАК ЭТО ПРАВЯТ. Плашка, имя и полный список источников
              стоят над контролами, чтобы ответ на «во что это перекрасится» не приходилось
              собирать, пробегая глазами два ряда в поисках заполненного. */}
          <div className='flex flex-wrap items-start gap-3 border-b border-hairline pb-2'>
            <Swatch hex={colourSwatchHex(colour.recipe, colors)} size={44} />
            <div className='min-w-0 flex-1'>
              <Text
                size='control'
                variant='uppercase'
                tracking='label'
                component='p'
                className='font-bold'
              >
                {colourLabel(colour.recipe, colors)}
              </Text>
              <Text size='micro' variant='label' component='p' className='normal-case'>
                {colourSubtitle(colour.recipe, colors)}
              </Text>
            </div>
          </div>

          {/* ТОТ ЖЕ ОРГАН, ЧТО В ФАБРИК-РЕНДЕРЕ, А НЕ ПОХОЖИЙ НА НЕГО: пикер, поле hex и словарь
              колорвеев — один компонент на два экрана. Второй словарь разошёлся бы с первым
              молча, а цвет здесь — тот же предмет. */}
          <ColourStatementRow
            band={band}
            draft={colour}
            disabled={disabled}
            hint={
              <>
                The colour goes to the model as a name and a hex together. It repaints the garment
                only: the weave, the folds and the shadows of the photograph are kept, and nothing
                else in the frame is touched. Picking one states nothing about the style — a
                colourway is signed off by a lab dip, not by a picture.
              </>
            }
          />

          <FieldRow label='in words'>
            <div className='w-full max-w-[420px]'>
              <Input
                name='design-recolor-words'
                value={colour.recipe.words ?? ''}
                disabled={disabled}
                placeholder='washed indigo, slightly faded at the seams…'
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  colour.patch({ words: e.target.value })
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
              server takes a colour named in words alone.
            </Hint>
          </FieldRow>
        </div>

        <GenerateRow
          band={band}
          gate={gate}
          shape={recolorShape(count)}
          pending={run.isPending}
          disabled={disabled}
          onGenerate={generate}
          onInspect={() => setInspecting(true)}
        />
      </Section>

      <OnModelOutputs band={band} techCardId={techCardId} disabled={disabled} />

      <WhatModelGetsRenderModal
        open={inspecting}
        onOpenChange={setInspecting}
        band={band}
        kind='recolor'
        recipe={colour.recipe}
        sources={sources.items}
        cardFit=''
      />
    </>
  );
}
