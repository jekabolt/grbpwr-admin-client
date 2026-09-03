import type { GetDesignBandResponse, common_AdminColorwayRef } from 'api/proto-http/admin';
import { useMemo, type JSX } from 'react';
import { Button } from 'ui/components/button';
import { Chip, ChipRow } from 'ui/components/chip';
import { GroupLabel } from 'ui/components/group-label';
import Input from 'ui/components/input';
import Text from 'ui/components/text';

import {
  ASSETS_PER_CARD_MAX,
  assetIsPattern,
  assetLabel,
  assetThumb,
  assetWornBy,
  clothShelf,
  fabricOfColorway,
  fabricUses,
  partsOfAsset,
} from '../assets/model';
import { useAssetWrites } from '../assets/use-assets';
import { colorwayLabel, colorwaySubtitle } from '../colorway-picker';
import { ClothIsRow } from './cloth-is';
import type { ColourDraft } from './drafts';
import { ColourStatementRow } from './colour-statement';
import { FieldRow, Hint, Swatch } from './field-row';
import { clothWordsRank, fabricAuthority, fabricStatement, statedWords } from './model';

/**
 * FABRIC — what a render is coloured and clothed with.
 *
 * THREE STATEMENTS THAT COMBINE, WHICH IS THE WHOLE CHANGE ON THIS SCREEN. It used to be a
 * segmented switch: dictionary OR own colour OR fabric photo, one at a time, each move wiping the
 * other two fields. The owner asked for the opposite in as many words — «можно комбинировать» — and
 * the reason is a real garment: the photograph is the only thing that can state a rib knit's
 * texture, the picker is the only thing that can state an exact colour, and the words are the only
 * place «matte, slightly sheer» fits. Forcing a choice between them threw away two thirds of what a
 * person knows about the cloth.
 *
 * SO THE SCREEN'S JOB CHANGED FROM «PICK ONE» TO «SAY WHICH WINS». Three coexisting statements can
 * disagree — a blue swatch under a red picker — and the answer is NOT computed here. It is written
 * into the prompt (`internal/designgen/renderprompt.go`) so that every run resolves the collision
 * identically, and this block only REPEATS it, once, at the top: photo → material, picked colour
 * beats the photo on colour, words add what is left. A person about to spend money is entitled to
 * read the rule before pressing GENERATE, not to discover it in the picture.
 *
 * THREE RULED ROWS, NOT THREE BOXES. Each statement is one line of the ladder (`FieldRow`, the
 * `#e6e6e6` weight), because a block never contains a block and «which of these is filled in» has
 * to be answerable by running an eye down one column of labels.
 *
 * NOTHING HERE IS CARD DATA — С ОДНИМ НАЗВАННЫМ ИСКЛЮЧЕНИЕМ. A colourway is a fact about the
 * style, signed off by a lab dip; the rows under `THIS RUN` are a submission to a picture generator,
 * and the two must never be confused. The recipe reaches the server once, inside
 * `StartDesignRun.params.colour`, and lives afterwards only as the run's own frozen history.
 * Исключение — ряд FABRIC наверху: чипы `wears` пишут КАРТОЧКУ (`SetDesignAssetColorway`), и
 * граница между двумя половинами теперь не сказана серой строкой, а НАРИСОВАНА лестницей: факт
 * колорвея → `GroupLabel this run` → ворота.
 *
 * THE LAB-DIP CLAUSE OF THE PROTOTYPE IS STILL NOT HERE, AND STILL DELIBERATELY. The prototype
 * prints «also a colorway of this style — lab dip approved · round 1», and the badge reads the LAB
 * DIP rather than the colourway fact. This admin cannot draw it truthfully: colourways are a
 * separate entity, `GetColorwaysPaged` has no «of this tech card» filter and the band carries none,
 * so the clause would need a paged scan of the whole system to answer — and a wrong answer here is
 * a technologist rendering a colour the dyehouse has already rejected. Absent beats guessed.
 */

/* ─── СЕТКА СЛОВАРЯ ЖИЛА ЗДЕСЬ, ПЕРЕЕХАЛА В `colour-statement.tsx` И СНЕСЕНА ТАМ (H-8) ────────
   Сначала она была приватной функцией палитры, вторая копия завелась в перекрасе и разошлась с
   первой за неполные сутки — классический дефект «один список живёт дважды». Орган свели в один, а
   потом владелец снял ВОПРОС, на который он отвечал: цвет выбирают пикером и называют словом. Довод
   целиком — в шапке `colour-statement.tsx`. Пустой словарь цветов беты перестал быть видимым
   состоянием этого экрана вовсе: одним ложно-сломанным экраном меньше. */

/* ─── СТАРЫЙ КВАДРАТ НАД НАТИВНЫМ `<input type='color'>` СНЯТ ЦЕЛИКОМ (V-5) ────────────────────
   Он делал ровно одно: прятал хром операционной системы под нашей рамкой, — и всё, что человек
   про цвет выбирал, происходило в чужом окне. Замена живёт в `../assets/colour-picker` и заменяет
   не оформление, а орган: выбор, ввод, пипетка и уже использованные рецепты стоят в одном месте.
   Двух пикеров в полосе быть не должно, поэтому здесь не остаётся и обёртки. */

/**
 * ═══ КОЛОНКА PHOTO ЗАМЕНЕНА НА ПОЛКУ ТКАНЕЙ (V-4, V-8) ════════════════════════════════════════
 *
 * Владелец, V-4 дословно: «сделать апплоуд текстуры материала и что бы он всегда был как
 * плейсхолдер но не обязательный и что мы мы там могли замаркать его как материал ВМЕСТО КОЛОНКИ
 * PHOTO в GENERATION — FABRIC RENDER». То есть PHOTO перестаёт быть самостоятельным органом: на
 * его месте — ссылка на ассет-ткань, живущий на карточке.
 *
 * ПОЧЕМУ ЭТО ПРАВИЛЬНО, А НЕ ПРОСТО ВЫПОЛНЕНО. Файловый пикер, стоявший здесь, привязывал ткань к
 * ОДНОМУ ПРОГОНУ: следующий рендер начинался с пустой рамки, и лоскут, выбранный вчера, приходилось
 * искать в медиатеке заново. Ткань — свойство ИЗДЕЛИЯ, а не подачи; на полке она переживает прогон,
 * несёт имя, цвет, слова и раппорт и размечается на флэтах.
 *
 * НЕСКОЛЬКО ТКАНЕЙ — ЭТО ТО ЖЕ САМОЕ ПОЛЕ (V-8: «если у нас в изделии используется больше чем одна
 * ткань что бы была возможность добавить несколько тканей»). Одна ткань это список из одного члена;
 * отдельного написания «одна ткань» нет и быть не должно, иначе два написания разошлись бы, как
 * только у любого из них появилось бы своё свойство.
 *
 * ЧТО УЕЗЖАЕТ НА ПРОВОД. `colour.fabrics` — замороженные копии (имя, медиа, цвет, слова, части,
 * раппорт), чтобы история прогона читалась после переименования или удаления ассета. И ПЕРВАЯ ткань
 * ДОПОЛНИТЕЛЬНО повторяется в скалярах `fabric_media_id`/`code`/`hex`/`words` — так велит контракт:
 * абзац старшинства в промпте называет главную фотографию по её номеру и читает его оттуда, а
 * прогон об одной ткани обязан композироваться теми же словами, что и все замороженные до него.
 * Эхо в цвет и слова ставится ТОЛЬКО в пустые поля: набранный руками hex это осознанное отклонение,
 * и затирать его выбором ткани значило бы отменять ранг 2 порядка старшинства.
 *
 * ЧАСТИ ИЗДЕЛИЯ НЕ НАБИРАЮТСЯ ЗДЕСЬ. Они выводятся из МЕТОК на флэтах, потому что второе место для
 * тех же слов разошлось бы с разметкой молча: человек видел бы на чертеже одно, а модель читала
 * другое.
 *
 * ⚠ ОТКУДА ТЕПЕРЬ БЕРЁТСЯ САМА ПОЛКА (Y-11 + Y-12). Секция ASSETS, которая её наполняла, снята с
 * экрана целиком; ткань заводит дверь «+ cloth» в блоке INPUT — FLATS OF THIS CARD, тем же
 * `UpsertDesignAsset` рода `fabric`. Для ЭТОГО ряда не изменилось ничего: он как читал
 * `band.assets`, так и читает. Изменилось одно — НОВЫХ МЕТОК больше нет, поэтому `parts` непусты
 * только на карточках, размеченных до снятия, и звать сюда «разметьте на флэтах» больше нельзя.
 */
function ClothRow({
  band,
  state,
  disabled,
}: {
  band: GetDesignBandResponse;
  state: ColourDraft;
  disabled?: boolean;
}): JSX.Element {
  // ПАТТЕРН СТОИТ В ЭТОМ ЖЕ РЯДУ, И ЭТО НЕ НЕБРЕЖНОСТЬ. Для модели «из чего сшито» и «чем это
  // покрыто» — один вопрос; отдельного словаря у неё нет, а раппорт едет числом внутри той же
  // записи. Разводить их по двум рядам значило бы заставить человека решать, куда класть
  // набивную ткань.
  //
  // ⚠ СОСТАВ РЯДА НЕ НАБИРАЕТСЯ ЗДЕСЬ (Д-1). Список полок жил ДВАЖДЫ — здесь и у двери «+ cloth»
  // в INPUT, — и разошёлся: читатель брал две полки, писатель показывал одну, и ассет-паттерн
  // легаси-карточки нельзя было ни увидеть, ни удалить нигде, хотя выбрать и отправить в промпт
  // было можно. Теперь состав называет ОДНА функция, которую зовут оба; довод — в её шапке.
  const shelf = useMemo(() => clothShelf(band), [band]);
  /** Пуст ряд ПОТОМУ ЧТО ничего не завели — или потому что завести уже некуда. Это разные ответы. */
  const cardIsFull = (band.assets ?? []).length >= ASSETS_PER_CARD_MAX;
  const chosen = (state.recipe.fabrics ?? [])
    .map((f) => f.assetId ?? 0)
    .filter((id) => id > 0);

  function choose(assetId: number) {
    const next = chosen.includes(assetId)
      ? chosen.filter((id) => id !== assetId)
      : [...chosen, assetId];
    /**
     * ⚠ ЭХО ИДЁТ ЧЕРЕЗ ЭХО-ДВЕРЬ, А НЕ СОБИРАЕТСЯ ЗДЕСЬ. Этот ряд СЧИТАЛСЯ образцовым — он берёг
     * набранное руками, — но правило знал только наполовину: в ПУСТОЕ имя он клал `colourCode`
     * ассета так же охотно, как это делал `wear()` поверх набранного. Замерено: колорвей, у
     * которого не заявлено ничего, + чип ткани 801 → в имени цвета «ECRU», и `colourPhrase`
     * печатает «colourway ECRU». Обе половины правила теперь живут у двери, в одном месте.
     */
    state.echo({ from: 'cloths', fabrics: fabricUses(band, next) });
  }

  return (
    <FieldRow label='cloths'>
      {shelf.length === 0 ? (
        /* ОДНА СТРОКА-УКАЗАТЕЛЬ ВМЕСТО АБЗАЦА (Y-13). Владелец снял объяснение отсюда целиком;
           совсем пустой ряд, однако, читался бы как сломанный орган — у него есть подпись CLOTHS
           и ничего под ней. Осталась ровно вывеска: где дверь. Что фактура даёт рендеру, сказано
           ОДИН раз — у самой двери, в INPUT.
           ⚠ УКАЗАТЕЛЬ ОБЯЗАН ЗНАТЬ, ЗАКРЫТА ЛИ ДВЕРЬ (Д-2). Карточка легаси может держать потолок
           ассетов фурнитурой и не иметь ни одной ткани: «add one above» тогда посылает человека к
           погашенному кадру, и он читает это как поломку экрана, а не как предел карточки. */
        <Text size='micro' variant='label' component='span' className='normal-case'>
          {cardIsFull
            ? `none on this card, and no room for one — it already holds its ${ASSETS_PER_CARD_MAX} assets, none of which is a cloth.`
            : 'none on this card — add one under INPUT → CLOTH above.'}
        </Text>
      ) : (
        <ChipRow>
          {shelf.map((a) => {
            const id = a.id ?? 0;
            const on = chosen.includes(id);
            const parts = partsOfAsset(band, id);
            const url = assetThumb(a);
            return (
              <Chip
                key={id}
                nonForm
                selected={on}
                pressed={on}
                disabled={disabled}
                data-cloth={id}
                /* РОД НАЗВАН И ЗДЕСЬ — тем же словом, что на плитке в INPUT. Раппорт в подписи
                   выдаёт паттерн только тогда, когда он проставлен; у паттерна без числа чип был
                   неотличим от ткани, а два экрана про один ассет обязаны говорить одно. */
                title={
                  [
                    assetIsPattern(a) ? `${assetLabel(a)} — pattern` : assetLabel(a),
                    parts
                      ? `marked on: ${parts}`
                      : 'not marked on any flat, so it is the whole garment',
                  ].join(' — ')
                }
                onClick={() => choose(id)}
              >
                <span className='flex items-center gap-1'>
                  {url ? (
                    <img src={url} alt='' aria-hidden='true' className='size-[12px] object-cover' />
                  ) : null}
                  {assetLabel(a)}
                  {a.repeatMm ? ` · ${a.repeatMm} mm` : ''}
                </span>
              </Chip>
            );
          })}
        </ChipRow>
      )}

      {/* ЧТО ИМЕННО УЕДЕТ — СКАЗАНО ЗДЕСЬ, А НЕ ОБНАРУЖИТСЯ В КАРТИНКЕ. Ткань без меток покрывает
          изделие целиком; это законный ответ, а не пробел, и молчать о нём нельзя: человек,
          отметивший одну ткань из двух, обязан видеть, что вторая объявлена остатком.
          ⚠ ЭТО ЕДИНСТВЕННОЕ, ЧТО ЗДЕСЬ ОСТАЛОСЬ ОТ ПРОЗЫ (Y-13), и оно осталось намеренно: это не
          объяснение экрана, а ОТЧЁТ О ПОДАЧЕ — что именно уедет в промпт этого прогона. */}
      <div className='w-full pl-[100px]'>
        {chosen.length > 0 && (
          <Text size='micro' variant='label' component='p' className='normal-case'>
            {(state.recipe.fabrics ?? [])
              // «unless another cloth is marked» УБРАНО ИЗ ХВОСТА: разметка тканей на флэтах снята
              // вместе с секцией ASSETS (Y-11), и звать человека к органу, которого больше нет, —
              // не подсказка, а тупик. Сами `parts` по-прежнему читаются: на карточках,
              // размеченных до снятия, они есть и по-прежнему уезжают в промпт.
              .map((f) => `${f.name || 'cloth'} → ${(f.parts ?? '').trim() || 'the whole garment'}`)
              .join(' · ')}
          </Text>
        )}
        {/* ПОДСКАЗКА ЖИВЁТ ТОЛЬКО ТАМ, ГДЕ СООБЩАЕТ ПОРЯДОК СТАРШИНСТВА. Строка «optional — a cloth
            states the material a colour cannot…» снята по прямому требованию владельца (Y-13):
            необязательность поля и так сказана воротами кнопки GENERATE, а «mark it on the flats»
            указывало на снятый орган. Осталось одно — чего человек НЕ может вывести из чипов:
            кто кого перебивает по цвету. */}
        {chosen.length === 1 && (
          <Hint>
            one cloth: it is the whole garment. Its texture governs the material, the picked colour
            below still beats it on colour.
          </Hint>
        )}
      </div>
    </FieldRow>
  );
}

/**
 * ═══ FABRIC — ОДИН РЯД ФАКТА: ЧТО ЭТОТ КОЛОРВЕЙ НОСИТ И ЧЕМ ЕГО ПЕРЕОДЕТЬ (H-12 + G-15) ══════
 *
 * ═══ МЕНТАЛЬНАЯ МОДЕЛЬ, КОТОРУЮ РИСУЕТ ЭТОТ РЯД ══════════════════════════════════════════════
 *
 * Владелец просил «продумать механику … с самым минималистичным дизайном». Механика такая:
 * **колорвей — это ткань с именем.** Он носит РОВНО ОДНУ вещь — свой цвет или одну плитку из
 * библиотеки карточки, — и первый вопрос студии всегда «какой колорвей?». Всё, что ниже этого ряда,
 * — подача ЭТОГО прогона: она может ДОБАВИТЬ к ткани колорвея или отклониться ДЛЯ СЕБЯ, но не
 * переписать карточку.
 *
 * Значит под именованным колорвеем обязательных решений о цвете НОЛЬ: выбрал колорвей, взглянул на
 * его ткань, нажал GENERATE.
 *
 * ═══ ПОЧЕМУ РЯД СЛИТЫЙ, А НЕ ДВА СОСЕДНИХ ═══════════════════════════════════════════════════
 *
 * ЗАМЕР, А НЕ ВПЕЧАТЛЕНИЕ: на вопрос «из чего будет этот рендер» отвечали ЧЕТЫРЕ органа — ряд
 * `fabric of` (факт карточки), заголовок-заявление (свотч 44px + имя + подстрочник, состояние
 * ЧЕРНОВИКА), ряд CLOTHS и ряд COLOUR с сеткой словаря. Под нетронутым черновиком первые два
 * говорили ОДНО И ТО ЖЕ ДВАЖДЫ — черновик засеян ровно этим фактом. Экран читался «не минимально»
 * не потому, что рядов много, а потому что ОТВЕТОВ БЫЛО БОЛЬШЕ, ЧЕМ ВОПРОСОВ.
 *
 * Поэтому заголовок-заявление снесён, а его работу взяли двое: (а) ЭТОТ ряд — лицом 44px и строкой
 * факта, с которого черновик и засевается, и (б) строка инвентаря у кнопки GENERATE («made of
 * pattern 2») — правда прогона в двух шагах от денег. Тот же ход, что владелец уже принял на экране
 * паттернов: инвентарь = подпись кнопки, отдельного блока нет.
 *
 * ⚠ ОБРАТИМО. Если владельцу не хватит «большого свотча черновика», заявление возвращается лицом в
 * `GenerateRow` — это одна строка, а не архитектура. На ON MODEL заявление ОСТАЛОСЬ: у перекраса
 * нет колорвейного ряда FABRIC, и там оно единственный ответ «что поедет».
 *
 * ═══ ЧТО ЭТОТ РЯД ПИШЕТ ═════════════════════════════════════════════════════════════════════
 *
 * ЦВЕТНАЯ ПОЛОВИНА НЕ ХРАНИТСЯ И НЕ МОЖЕТ ХРАНИТЬСЯ ЗДЕСЬ. `its own colour` — не запись, а СНЯТИЕ
 * назначения (`colorway_id = 0`): цвет у колорвея уже есть — `devHex`/`pantone`/`colorCode` в его
 * собственной строке, — и второе поле для него было бы конкурирующим ответом на вопрос, у которого
 * ответ есть.
 *
 * Провальный режим, ради которого писан весь G-15, — «сохранено, но до модели не доехало»: человек
 * нажал «ткань ROSSO — pattern 2», нажал GENERATE и купил прежний рецепт. Поэтому удавшееся
 * назначение сразу правит черновик — ткань встаёт в `fabrics`, эхо в скаляры, — а снятие возвращает
 * собственный цвет колорвея. Это ПРАВКА ЧЕЛОВЕКА, а не второй засев: черновик после неё честно
 * считается тронутым.
 *
 * ⚠ ПРАВКА — В `onSuccess`, А НЕ ОПТИМИСТИЧНО. Отказ сервера (`colorway_forbidden` на фурнитуре,
 * `foreign_colorway` на чужом колорвее) обязан оставить экран в том состоянии, которое он
 * описывает; подача, уехавшая вперёд отказа, показывала бы ткань, которой колорвей не носит.
 */
function FabricRow({
  band,
  techCardId,
  colorwayId,
  colorway,
  state,
  disabled,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  colorwayId: number;
  colorway: common_AdminColorwayRef | null;
  state: ColourDraft;
  disabled?: boolean;
}): JSX.Element | null {
  const { setAssetColorway } = useAssetWrites(techCardId);
  const shelf = useMemo(() => clothShelf(band), [band]);
  const worn = useMemo(() => fabricOfColorway(band, colorwayId), [band, colorwayId]);

  // РЯДА ПРОСТО НЕТ ПОД «NO COLOURWAY», и он не «серый»: у безколорвейного верстака ткани-факта не
  // существует — назначить её некому. Всё, что ниже, ведёт себя тогда байт в байт как до оси.
  if (colorwayId <= 0) return null;

  const name = colorwayLabel(colorway) || `#${colorwayId}`;
  const wornId = worn?.id ?? 0;
  const subtitle = colorwaySubtitle(colorway);

  /**
   * СТРОКА ФАКТА. Три состояния, и третье — РАБОЧЕЕ, а не ошибка: на бете колорвеи с пустыми
   * `devHex`/`pantone`/`colorCode` обычны, и молчащий ряд читался бы как поломка экрана. Поэтому
   * он называет, чего нет, и обе двери наружу — одеть колорвей или сказать про ткань на один прогон.
   */
  const fact = wornId
    ? `wears ${assetLabel(worn)}${worn?.repeatMm ? ` · ${worn.repeatMm} mm` : ''}`
    : subtitle
      ? `its own colour · ${subtitle}`
      : 'nothing stated on the colourway yet: no dev colour, no fabric. Dress it below, or state the cloth for this run only.';

  const wear = (assetId: number) => {
    if (disabled || setAssetColorway.isPending) return;
    setAssetColorway.mutate(
      { assetId, colorwayId },
      {
        /**
         * ⚠ ЭТА СТРОКА ГОВОРИЛА «то же, что делает ряд CLOTHS», И ЭТО БЫЛО НЕПРАВДОЙ. Она писала
         * три скаляра БЕЗУСЛОВНО. Замерено: набрано `#a41f22` / «dusty rose» / «fine rib jersey,
         * matte» → нажатие чипа `wears` на ассете 801 дало `#eee8dd` / «ECRU» / «fine rib», на
         * провод уехало `code="ECRU" hex="#eee8dd"`, и бэкенд напечатал «colourway ECRU — the
         * exact value is #eee8dd». Тот же жест на ряду CLOTHS все три значения берёг.
         *
         * Теперь оба ряда зовут ОДНУ дверь, и «то же самое» перестало быть обещанием в
         * комментарии: собственного цвета колорвея дверь по-прежнему не подмешивает (`devHex`
         * поверх набивки залил бы её одним тоном), а набранное руками — не трогает.
         */
        onSuccess: () => state.echo({ from: 'cloths', fabrics: fabricUses(band, [assetId]) }),
      },
    );
  };

  const takeOff = () => {
    if (disabled || !wornId || setAssetColorway.isPending) return;
    setAssetColorway.mutate(
      { assetId: wornId, colorwayId: 0 },
      {
        /**
         * ⚠ ПИСАТЕЛЕЙ ИМЕНИ ДВА, И ВТОРОЙ ЖИЛ ПО СНЯТОМУ ПРАВИЛУ — так это было записано кругом
         * раньше, и починена была ОДНА половина: жетон `colorCode` перестал попадать в имя. Вторая
         * половина осталась и была замерена здесь же: тело писало `{ ...EMPTY_RECIPE, ... }`, то
         * есть ОБНУЛЯЛО набранные человеком hex, имя и слова, а потом клало поверх собственный цвет
         * колорвея И ЕГО `pantone` в поле ткани словами. «Снять ткань» уносило с собой ранг 2.
         *
         * Теперь это ОДИН вызов эхо-двери: она сама знает, что колорвей, носящий свой цвет, ткани
         * не носит (`fabrics` и `fabric_media_id` очищает), сама берёт имя, а не складской код, и
         * сама не читает `pantone` вовсе.
         */
        onSuccess: () => state.echo({ from: 'colourway', colorway }),
      },
    );
  };

  /* ЛИЦО РЯДА — ПЛИТКА, ЕСЛИ КОЛОРВЕЙ НОСИТ ТКАНЬ, ИНАЧЕ ЕГО СОБСТВЕННЫЙ ЦВЕТ. Пустой девхекс
     рисуется штриховкой, а не чёрным: свотч, закрасивший неизвестный цвет, врёт так, что глаз
     верит целиком (`Swatch` держит это правило за всю полосу). */
  const face = wornId ? assetThumb(worn) : '';

  return (
    <FieldRow label='fabric' data-fabric-row={colorwayId}>
      {face ? (
        <img
          src={face}
          alt=''
          aria-hidden='true'
          data-fabric-face='cloth'
          className='size-[44px] shrink-0 border border-textColor object-cover'
        />
      ) : (
        <Swatch hex={(colorway?.devHex ?? '').trim()} size={44} />
      )}
      <div className='min-w-0 flex-1'>
        <Text size='control' variant='uppercase' tracking='label' component='p' className='font-bold'>
          {name}
        </Text>
        <Text size='micro' variant='label' component='p' className='normal-case'>
          {fact}
        </Text>
      </div>

      <div className='w-full space-y-1 pl-[100px]'>
        <ChipRow>
          <Chip
            nonForm
            selected={!wornId}
            pressed={!wornId}
            disabled={disabled || setAssetColorway.isPending}
            data-wear-asset='none'
            title={
              wornId
                ? `take the fabric off ${name} — it goes back to wearing its own colour, ${subtitle || 'as stated on the colourway'}`
                : `${name} wears its own colour — ${subtitle || 'stated on the colourway itself'}`
            }
            onClick={takeOff}
          >
            <span className='flex items-center gap-1'>
              <Swatch hex={(colorway?.devHex ?? '').trim()} size={11} />
              its own colour
            </span>
          </Chip>
          {shelf.map((a) => {
            const id = a.id ?? 0;
            const on = assetWornBy(a) === colorwayId;
            const url = assetThumb(a);
            return (
              <Chip
                key={id}
                nonForm
                selected={on}
                pressed={on}
                disabled={disabled || setAssetColorway.isPending}
                data-wear-asset={id}
                title={
                  on
                    ? `${assetLabel(a)} is the fabric of ${name} — press «its own colour» to take it off`
                    : `make ${assetLabel(a)} the fabric of ${name}. This writes the card: it comes back on every render of ${name}, and it takes ${name} off whatever else was wearing it`
                }
                onClick={() => (on ? takeOff() : wear(id))}
              >
                <span className='flex items-center gap-1'>
                  {url ? (
                    <img src={url} alt='' aria-hidden='true' className='size-[12px] object-cover' />
                  ) : null}
                  {assetLabel(a)}
                  {a.repeatMm ? ` · ${a.repeatMm} mm` : ''}
                </span>
              </Chip>
            );
          })}
        </ChipRow>
        {/* ГРАНИЦА «КАРТОЧКА ↑ / ПРОГОН ↓» СКАЗАНА ЗДЕСЬ ОДИН РАЗ. Ниже её рисует сама лестница —
            `GroupLabel this run`, — поэтому повторять её у каждого ряда не нужно и вредно. */}
        {/* ⚠ `Hint` (micro, 10px), А НЕ `nano`. Это бегущее предложение, а `nano` (9px) DESIGN.md
            отдаёт бейджам, номерам пинов и подписям полос — вещам в два-три слова. Кегль здесь
            заменил собой `Hint`, который стоял на этом месте до слияния рядов; предложение,
            уменьшенное до размера бейджа, читается хуже ровно там, где объясняет запись КАРТОЧКИ. */}
        <Hint>
          picking here writes the card — it comes back on every render of {name}. Everything under
          THIS RUN is one run only.
        </Hint>
      </div>
    </FieldRow>
  );
}

export function Palette({
  disabled,
  /** Supplied by `RenderStudio`, so the palette and the studio's gate read one draft. */
  draft,
  band,
  techCardId,
  colorwayId = 0,
  colorway = null,
}: {
  band: GetDesignBandResponse;
  /** ⚠ ПАЛИТРА БОЛЬШЕ НЕ «НИЧЕГО НЕ ПИШЕТ»: ряд FABRIC пишет назначение ткани колорвею
   *  (`SetDesignAssetColorway`, G-15) — единственная запись КАРТОЧКИ на этом экране. Рецепт по-
   *  прежнему не карточка: он уезжает внутри прогона и живёт замороженной историей. */
  techCardId: number;
  disabled?: boolean;
  /**
   * ⚠ ОБЯЗАТЕЛЕН, И ЭТО ПОЧИНКА МЁРТВОГО ПИСАТЕЛЯ, А НЕ УЖЕСТОЧЕНИЕ РАДИ СТРОГОСТИ. Проп был
   * необязательным, а рядом безусловно звался `useColourDraft` — ЦЕЛЫЙ ВТОРОЙ ЧЕРНОВИК, который
   * выбрасывался всегда, потому что `draft` передавали всегда (вызывающий на всю программу один).
   * Мёртвый он был не весь: смонтируй кто-нибудь `Palette` без пропа, и ряд CLOTH IS писал бы в
   * `own.cloth`, которого не композирует НИКТО, — «сохранено, но не поехало», тот самый провальный
   * режим, от которого написана вся эта механика. Состояние подаёт студия; ворота и палитра
   * обязаны читать ОДИН черновик, и теперь это невыразимо иначе.
   */
  draft: ColourDraft;
  /** Выбранный колорвей; 0 = безколорвейный верстак, и ряда FABRIC тогда нет вовсе. */
  colorwayId?: number;
  colorway?: common_AdminColorwayRef | null;
}): JSX.Element {
  const state = draft;
  const recipe = state.recipe;
  const stated = fabricStatement(recipe);
  /** ЖИВАЯ КОМПОЗИЦИЯ — ТА ЖЕ ФУНКЦИЯ, ЧТО УЕДЕТ НА ПРОВОД. Второе написание склейки обещало бы
   *  человеку одно, а покупало бы другое; поэтому подпись читает `statedWords`, а не собирается. */
  const willSay = statedWords(state);
  /**
   * КТО ПЕРЕБЬЁТ ЭТИ СЛОВА — ВЫЧИСЛЯЕТ МОДЕЛЬ, ЭКРАН ТОЛЬКО ГОВОРИТ (H-13). Довод и построчное
   * условие из `renderprompt.go` — у `clothWordsRank`.
   */
  const rank = clothWordsRank(recipe);
  /** Подпись порядка старшинства — одна пара «состояние + текст» на обе поверхности. */
  const authority = fabricAuthority(recipe);
  /**
   * ПУСТАЯ ПОДПИСЬ РАЗЛИЧАЕТ ТРИ СОСТОЯНИЯ, А НЕ ДВА, И ЭТО ВТОРАЯ ПРАВКА ОДНОЙ И ТОЙ ЖЕ ФРАЗЫ.
   *
   * Сначала она была одна и врала на колорвее, где не заявлено ничего. Потом стала двумя — и
   * продолжала врать в САМОМ ЧАСТОМ состоянии: у колорвея с `devHex` и без назначенной ткани (ровно
   * то, что производит собственный засев) выше заявлен ЦВЕТ, а фраза говорила «the fabric above
   * already states the cloth», хотя ряд FABRIC двумя строками выше читается `its own colour`.
   * Цвет — не ткань: он не несёт ни переплетения, ни веса, ни падения, и промпт строит материал
   * не из него. Поэтому состояний три, и каждое названо своими словами.
   */
  const clothAbove = stated.photo;
  const colourAbove = !stated.photo && stated.colour;

  return (
    <div>
      {/* ── 0. ТКАНЬ КОЛОРВЕЯ — ФАКТ КАРТОЧКИ, И ОН СТОИТ ВЫШЕ ГРУППЫ ПОДАЧИ (G-15 + H-12).
             Порядок здесь и есть довод: сверху то, что переживает прогон, ниже — подача, которая
             живёт ровно один раз. Внутри группы «this run» этот ряд читался бы как ещё одно поле
             подачи, то есть ровно наоборот. */}
      <FabricRow
        band={band}
        techCardId={techCardId}
        colorwayId={colorwayId}
        colorway={colorway}
        state={state}
        disabled={disabled}
      />

      {/* ПОДПИСЬ ГРУППЫ НАЗЫВАЕТ СРОК ЖИЗНИ ТОГО, ЧТО ПОД НЕЙ. Под именованным колорвеем над ней
          стоит ФАКТ КАРТОЧКИ, и различить их обязана лестница, а не серая строка: `this run`. На
          безколорвейном верстаке факта-ткани не существует вовсе, различать нечего, и группа
          остаётся тем, чем была, — `fabric`, байт в байт как до оси. */}
      {/* ⚠ ПОДПИСЬ ПОРЯДКА СТАРШИНСТВА — ФУНКЦИЯ РЕЦЕПТА, А НЕ КОНСТАНТА. Довод целиком у
          `fabricAuthority`: та же строка стоит в модалке «what the model gets», где строки ранга
          нет по построению, и безусловное обещание звучало там при живой фотографии ткани.
          `data-fabric-authority` — не украшение: он даёт пробе сверить ДВЕ поверхности между
          собой, а не каждую с ожидаемым текстом по отдельности. */}
      <GroupLabel
        action={
          <Text
            size='micro'
            variant='label'
            component='span'
            data-fabric-authority={authority.state}
            className='normal-case'
          >
            {authority.text}
          </Text>
        }
      >
        {colorwayId > 0 ? 'this run' : 'fabric'}
      </GroupLabel>

      {/* ── 1. THE CLOTHS — the shelf, not a file picker. */}
      <ClothRow band={band} disabled={disabled} state={state} />

      {/* ── 2. THE PICKED COLOUR — a value and a name, on one line.
          ⚠ ОРГАН ОБЩИЙ С ON MODEL (`ColourStatementRow`), И РАЗЛИЧИЕ ЭКРАНОВ — В ОДНОМ ПРОПЕ:
          `hint` говорит, что с цветом СДЕЛАЮТ. Второй проп (`emptyNote`) исчез вместе с сеткой
          словаря — он объяснял ПУСТОЙ СЛОВАРЬ, состояние, которого у этого ряда больше нет. */}
      <ColourStatementRow
        band={band}
        draft={state}
        disabled={disabled}
        hint={
          <>
            {/* ЦИТАТА ОБЯЗАНА БЫТЬ ЦИТАТОЙ. Сервер пишет ` — the exact value is ` (`colourPhrase`,
                renderprompt.go); запятая здесь была нашей отсебятиной в кавычках, то есть примером
                фразы, которой не существует. */}
            The name and the hex go to the model together — «colourway dusty rose — the exact value
            is #a41f22». Picking one states nothing about the style: a colourway is signed off by a
            lab dip, not by a render.
          </>
        }
      />

      {/* ── 3. WHAT THE CLOTH IS — H-13. Стоит МЕЖДУ цветом и словами намеренно: это свойство того
          же предмета, что описывают слова ниже, и обе оси уезжают в одно поле провода. */}
      <ClothIsRow draft={state} disabled={disabled} />

      {/* ── 4. THE WORDS — the lowest rank, and a legal statement entirely on its own. */}
      <FieldRow label='in words'>
        <div className='w-full max-w-[420px]'>
          <Input
            name='design-fabric-words'
            value={recipe.words ?? ''}
            disabled={disabled}
            placeholder='fine rib jersey, matte…'
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              state.typed({ words: e.target.value })
            }
          />
        </div>
        {!disabled && stated.words && (
          <Button variant='secondary' size='xs' onClick={() => state.clear('words')}>
            clear
          </Button>
        )}
        {/* ⚠ ТА ЖЕ УСЛОВНОСТЬ, ЧТО У ПОДПИСИ ГРУППЫ, И ПО ТОЙ ЖЕ ПРИЧИНЕ. Строка «adds what the
            photo and the colour do not state; it never overrides either» стояла ДВУМЯ РЯДАМИ ВЫШЕ
            той, что говорит «модель строит из этих слов переплетение, вес, поверхность и падение»,
            — то есть занижала ровно там, где H-13 наконец начал работать, и обещала лишнего там,
            где едет фотография. Условие читает `rank`, тот же, что подпись группы. */}
        <Hint>
          {rank.governs
            ? 'with no cloth photograph riding, these words build the material: weave, weight, surface, drape'
            : 'against the cloth photograph above these words are description, not instruction'}
        </Hint>
      </FieldRow>

      {/* ═══ ОДНА ЖИВАЯ ПОДПИСЬ НА ДВА РЯДА — ЧТО ИМЕННО УЕДЕТ СЛОВАМИ ═══════════════════════════
          Не «предпросмотр» и не украшение: два контрола выше пишут ОДНО поле провода, и порядок
          клауз в нём человек иначе не увидит до самой картинки. Строка показывает результат ДО
          денег теми же словами, что и модалка «what the model gets», потому что читает ту же
          функцию. Пустая композиция — законный ответ, и он тоже назван вслух: молчащая строка
          читалась бы как «поле сломалось». */}
      <div className='space-y-0.5 pl-[100px] pt-1'>
        <Text
          size='micro'
          variant='label'
          component='p'
          data-stated-words={willSay ? 'stated' : 'nothing'}
          className='normal-case'
        >
          {willSay
            ? `goes to the model as: «${willSay}»`
            : clothAbove
              ? 'nothing added — legal; the cloth above already states the material'
              : colourAbove
                ? 'nothing added — only a colour is stated above, so the material is left to the model'
                : 'nothing added — and nothing above states the cloth yet either'}
        </Text>

        {/* ═══ ЧТО ЭТИ СЛОВА СДЕЛАЮТ — СКАЗАНО ДО ДЕНЕГ, А НЕ ОБНАРУЖИТСЯ В КАРТИНКЕ (H-13) ═══
            Ранг живёт в промпте, экран его не меняет — но обязан НАЗВАТЬ его там, где принимают
            решение: в двух строках от кнопки. Условие одно и вычисляет его `clothWordsRank`;
            история двух неверных редакций и точная фраза промпта — в его шапке.
            ⚠ СТРОКА ГОВОРИТ И ХОРОШУЮ ПОЛОВИНУ, А НЕ ТОЛЬКО ПРЕДУПРЕЖДЕНИЕ. На обычном пути слова
            УПРАВЛЯЮТ материалом, и человеку, который только что ткнул `semi-sheer`, важнее всего
            знать именно это; строка, загорающаяся только в беде, читается как «что-то не так» и
            тогда, когда всё так. */}
        {willSay && (
          <Text
            size='micro'
            variant='label'
            component='p'
            data-words-rank={rank.governs ? 'governs' : 'outranked'}
            className='normal-case'
          >
            {rank.governs
              ? '…and the model builds the weave, the weight, the surface and the drape from these words: a stated colour states colour and nothing else.'
              : '…but the cloth photograph above states transparency, weight and drape itself, so against it these words are description, not instruction. Take the cloth off to let them govern the material.'}
          </Text>
        )}
      </div>
    </div>
  );
}
