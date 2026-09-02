import type { GetDesignBandResponse, common_AdminColorwayRef } from 'api/proto-http/admin';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { cn } from 'lib/utility';
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
import { useColourDraft, type ColourDraft } from './drafts';
import { ColourStatementRow } from './colour-statement';
import { FieldRow, Hint, Swatch } from './field-row';
import {
  EMPTY_RECIPE,
  FABRIC_AUTHORITY,
  colourLabel,
  colourSubtitle,
  colourSwatchHex,
  fabricStatement,
} from './model';

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
 * NOTHING HERE IS CARD DATA. A colourway is a fact about the style, signed off by a lab dip; this
 * is a submission to a picture generator, and the two must never be confused — which is why a typed
 * hex still carries its worded warning that it is a visualisation override. The recipe reaches the
 * server once, inside `StartDesignRun.params.colour`, and lives afterwards only as the run's own
 * frozen history.
 *
 * THE LAB-DIP CLAUSE OF THE PROTOTYPE IS STILL NOT HERE, AND STILL DELIBERATELY. The prototype
 * prints «also a colorway of this style — lab dip approved · round 1», and the badge reads the LAB
 * DIP rather than the colourway fact. This admin cannot draw it truthfully: colourways are a
 * separate entity, `GetColorwaysPaged` has no «of this tech card» filter and the band carries none,
 * so the clause would need a paged scan of the whole system to answer — and a wrong answer here is
 * a technologist rendering a colour the dyehouse has already rejected. Absent beats guessed.
 */

/* ─── СЕТКА СЛОВАРЯ ЖИЛА ЗДЕСЬ И ПЕРЕЕХАЛА В `colour-statement.tsx` ───────────────────────────
   Приватная `DictionaryGrid` была недоступна второму экрану, и волна K-17 честно скопировала её
   себе — после чего копии разошлись за неполные сутки: у одной появился `data-colour-code`, у
   другой осталась своя фраза про пустой словарь. Список одного словаря, живущий дважды, расходится
   МОЛЧА. Орган теперь один; различие экранов сказано двумя пропами (`hint`, `emptyNote`), а не
   двумя телами функции. */

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
    const fabrics = fabricUses(band, next);
    const first = fabrics[0];
    state.patch({
      fabrics,
      // ЭХО ПЕРВОЙ ТКАНИ В СКАЛЯРЫ — требование контракта, а не удобство; см. шапку.
      fabricMediaId: first?.mediaId ?? 0,
      // ...и только в ПУСТЫЕ поля: набранное руками это ранг 2, он старше фотографии по цвету.
      code: (state.recipe.code ?? '').trim() || first?.colourCode || '',
      hex: (state.recipe.hex ?? '').trim() || first?.colourHex || '',
      words: (state.recipe.words ?? '').trim() || first?.words || '',
    });
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
            one cloth: it is the whole garment. its texture governs the material, the picked colour
            below still beats it on colour.
          </Hint>
        )}
      </div>
    </FieldRow>
  );
}

/**
 * ═══ ТКАНЬ ЭТОГО КОЛОРВЕЯ — ОДИН ОРГАН НА «ЦВЕТ ИЛИ ПАТТЕРН» (G-15) ═══════════════════════════
 *
 * Владелец: паттерн — это бесшовная плитка, бесшовная плитка — это ТКАНЬ, и «в рендере и 3D она
 * выбирается как ткань ЭТОГО КОЛОРВЕЯ». Отсюда единственное число ряда: колорвей носит ОДНУ ткань,
 * и клик по соседнему чипу И ЕСТЬ намерение «теперь ткань ROSSO — вот эта». Сервер исполняет это
 * одной транзакцией (назначение снимает колорвей со всех прочих ассетов), поэтому клиент шлёт ОДИН
 * вызов и ничего не имитирует.
 *
 * ЦВЕТНАЯ ПОЛОВИНА НЕ ХРАНИТСЯ И НЕ МОЖЕТ ХРАНИТЬСЯ ЗДЕСЬ. `its own colour` — не запись, а СНЯТИЕ
 * назначения (`colorway_id = 0`): цвет у колорвея уже есть — `devHex`/`pantone`/`colorCode` в его
 * собственной строке, — и второе поле для него было бы конкурирующим ответом на вопрос, у которого
 * ответ есть. Ровно от этого палитра отгораживается прямым текстом с самого начала.
 *
 * ═══ ПОЧЕМУ РЯД НЕ ТОЛЬКО ПИШЕТ КАРТОЧКУ, НО И ПРАВИТ ПОДАЧУ ═════════════════════════════════
 *
 * Провальный режим, ради которого писан весь G-15, — «сохранено, но до модели не доехало». Если
 * назначение меняет карточку и НЕ меняет того, что уедет в этот прогон, человек нажал «ткань ROSSO
 * — pattern 2», нажал GENERATE и купил прежний рецепт. Поэтому удавшееся назначение сразу правит
 * черновик: ткань встаёт в `fabrics`, эхо — в скаляры (требование контракта), а снятие возвращает
 * собственный цвет колорвея. Это ПРАВКА ЧЕЛОВЕКА, а не второй засев: черновик после неё честно
 * считается тронутым.
 *
 * ⚠ ПРАВКА — В `onSuccess`, А НЕ ОПТИМИСТИЧНО. Отказ сервера (`colorway_forbidden` на фурнитуре,
 * `foreign_colorway` на чужом колорвее) обязан оставить экран в том состоянии, которое он
 * описывает; подача, уехавшая вперёд отказа, показывала бы ткань, которой колорвей не носит.
 */
function FabricOfRow({
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

  const wear = (assetId: number) => {
    if (disabled || setAssetColorway.isPending) return;
    setAssetColorway.mutate(
      { assetId, colorwayId },
      {
        onSuccess: () => {
          const fabrics = fabricUses(band, [assetId]);
          const first = fabrics[0];
          state.patch({
            fabrics,
            // ЭХО ПЕРВОЙ ТКАНИ В СКАЛЯРЫ — требование контракта, то же, что делает ряд CLOTHS.
            fabricMediaId: first?.mediaId ?? 0,
            // ⚠ И БЕЗ ПОДМЕШИВАНИЯ СОБСТВЕННОГО ЦВЕТА КОЛОРВЕЯ: выбранный цвет ПЕРЕБИВАЕТ цвет
            // фотографии, поэтому `devHex` поверх набивки залил бы её одним тоном. Довод целиком —
            // в засеве `useColourDraft` (`./drafts`), где живёт то же правило.
            code: first?.colourCode || '',
            hex: first?.colourHex || '',
            words: first?.words || '',
          });
        },
      },
    );
  };

  const takeOff = () => {
    if (disabled || !wornId || setAssetColorway.isPending) return;
    setAssetColorway.mutate(
      { assetId: wornId, colorwayId: 0 },
      {
        onSuccess: () =>
          state.patch({
            ...EMPTY_RECIPE,
            hex: (colorway?.devHex ?? '').trim(),
            code: (colorway?.colorCode ?? '').trim(),
            words: (colorway?.pantone ?? '').trim(),
          }),
      },
    );
  };

  return (
    <FieldRow label='fabric of' data-fabric-of={colorwayId}>
      <Text size='control' variant='uppercase' tracking='label' component='span' className='font-bold'>
        {name}
      </Text>
      <ChipRow>
        <Chip
          nonForm
          selected={!wornId}
          pressed={!wornId}
          disabled={disabled || setAssetColorway.isPending}
          data-wear-asset='none'
          title={
            wornId
              ? `take the fabric off ${name} — it goes back to wearing its own colour, ${colorwaySubtitle(colorway) || 'as stated on the colourway'}`
              : `${name} wears its own colour — ${colorwaySubtitle(colorway) || 'stated on the colourway itself'}`
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
      <div className='w-full pl-[100px]'>
        <Hint>
          {wornId
            ? `${name} wears ${assetLabel(worn)} on every render — this is a fact of the card. The rows below are this run only.`
            : `${name} wears its own colour. Picking a cloth here writes the card; the rows below are this run only.`}
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
  /** ⚠ ПАЛИТРА БОЛЬШЕ НЕ «НИЧЕГО НЕ ПИШЕТ»: ряд `fabric of` пишет назначение ткани колорвею
   *  (`SetDesignAssetColorway`, G-15) — единственная запись КАРТОЧКИ на этом экране. Рецепт по-
   *  прежнему не карточка: он уезжает внутри прогона и живёт замороженной историей. */
  techCardId: number;
  disabled?: boolean;
  draft?: ColourDraft;
  /** Выбранный колорвей; 0 = безколорвейный верстак, и ряда `fabric of` тогда нет вовсе. */
  colorwayId?: number;
  colorway?: common_AdminColorwayRef | null;
}): JSX.Element {
  // Own draft when mounted alone, the studio's when composed. The hook is called unconditionally —
  // rules of hooks — and its result is simply not used when a draft was handed in.
  const own = useColourDraft(band, colorwayId, colorway);
  const state = draft ?? own;
  const recipe = state.recipe;
  const stated = fabricStatement(recipe);

  const { dictionary } = useDictionary();
  const colors = dictionary?.colors;

  return (
    <div>
      {/* ── 0. ТКАНЬ КОЛОРВЕЯ — ФАКТ КАРТОЧКИ, И ОН СТОИТ ВЫШЕ ГРУППЫ «FABRIC» (G-15).
             Порядок здесь и есть довод: сверху то, что переживает прогон, ниже — подача, которая
             живёт ровно один раз. Внутри группы «fabric» этот ряд читался бы как ещё одно поле
             подачи, то есть ровно наоборот. Граница названа словами в хвосте самого ряда. */}
      <FabricOfRow
        band={band}
        techCardId={techCardId}
        colorwayId={colorwayId}
        colorway={colorway}
        state={state}
        disabled={disabled}
      />

      <GroupLabel
        action={
          <Text size='micro' variant='label' component='span' className='normal-case'>
            {FABRIC_AUTHORITY}
          </Text>
        }
      >
        fabric
      </GroupLabel>

      {/* WHAT IS STATED, STATED BEFORE IT IS EDITED. The swatch, the name and the full list of
          sources stand above the controls, so the answer to «what will this render be made of»
          never depends on scanning three rows for whichever one is filled. */}
      <div className='flex flex-wrap items-start gap-3 border-b border-hairline pb-2'>
        <Swatch hex={colourSwatchHex(recipe, colors)} size={44} />
        <div className='min-w-0 flex-1'>
          <Text
            size='control'
            variant='uppercase'
            tracking='label'
            component='p'
            className='font-bold'
          >
            {colourLabel(recipe, colors)}
          </Text>
          <Text size='micro' variant='label' component='p' className='normal-case'>
            {colourSubtitle(recipe, colors)}
          </Text>
        </div>
      </div>

      {/* ── 1. THE CLOTHS — the shelf, not a file picker. */}
      <ClothRow band={band} disabled={disabled} state={state} />

      {/* ── 2. THE PICKED COLOUR — dictionary code and hex are ONE statement, on one line.
          ⚠ ОРГАН ОБЩИЙ С ON MODEL (`ColourStatementRow`), И РАЗЛИЧИЕ ЭКРАНОВ — В ДВУХ ПРОПАХ.
          `hint` говорит, что с цветом СДЕЛАЮТ (здесь — покрасят чертёж), `emptyNote` — есть ли на
          этом экране третий путь назвать цвет. Здесь он есть: фотография ткани. В перекрасе его
          нет, и та же фраза была бы советом, которому нельзя последовать. */}
      <ColourStatementRow
        band={band}
        draft={state}
        disabled={disabled}
        emptyNote='The colour dictionary is empty on this server. Type a hex beside it, or leave the colour to the fabric photo.'
        hint={
          <>
            The colour goes to the model as a name and a hex together, and it overrides the colour of
            the photo above. Picking one states nothing about the style — a colourway is signed off
            by a lab dip, not by a render.
          </>
        }
      />

      {/* ── 3. THE WORDS — the lowest rank, and a legal statement entirely on its own. */}
      <FieldRow label='in words'>
        <div className='w-full max-w-[420px]'>
          <Input
            name='design-fabric-words'
            value={recipe.words ?? ''}
            disabled={disabled}
            placeholder='fine rib jersey, matte, slightly sheer…'
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              state.patch({ words: e.target.value })
            }
          />
        </div>
        {!disabled && stated.words && (
          <Button variant='secondary' size='xs' onClick={() => state.clear('words')}>
            clear
          </Button>
        )}
        <Hint>adds what the photo and the colour do not state; it never overrides either</Hint>
      </FieldRow>
    </div>
  );
}
