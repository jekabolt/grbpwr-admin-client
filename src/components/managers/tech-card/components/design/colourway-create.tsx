import { useTechCard } from 'components/managers/tech-cards/components/useTechCardQuery';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { useMemo, useRef, useState, type JSX } from 'react';
import { useFormContext, useFormState } from 'react-hook-form';
import { ConfirmationModal } from 'ui/components/confirmation-modal';

import type { TechCardFormData } from '../schema';
import {
  ColourwayPaletteEditor,
  emptyPaletteValue,
  type PaletteValue,
} from '../colourway-palette';
import { nameI18nPatch, paletteRefusal, paletteToWire } from '../colourway-palette-model';
import { createColorwayErrorMessage, useCreateColorway } from '../useColorwayRecipe';
import { createRefusal, normalizeColourwayName } from './colourway-create-model';
import { GROUP_SEAM, Reason } from './core';

/**
 * ═══ ОДИН ОРГАН РОЖДЕНИЯ КОЛОРВЕЯ НА ВСЮ СТУДИЮ (G2-4, решения D1–D12) ══════════════════════════
 *
 * Владелец: «именование колорвея — не из пула предефайн, мы всегда можем создать кастомный колорвей
 * сами… колорвей появляется только на этапе FABRIC RENDER, но не каждый фабрик-рендер значит, что у
 * нас будет такой колорвей в итоге». Отсюда весь замысел: колорвей РОЖДАЕТСЯ ЖЕСТОМ на рендере, а
 * не выбирается заранее из списка, и жест этот — ОДИН на четыре двери (заголовок столбца в SIDES,
 * пункт `+ colourway…` в цели GENERATE, он же в цели mark/apply, ручная строка у предложений MOOD).
 *
 * ЧЕТЫРЕ ДВЕРИ, ОДНА КОМНАТА — И ЭТО ГЛАВНОЕ ЗДЕСЬ ПРАВИЛО. До этого круга колорвей заводился в
 * двух местах двумя РАЗНЫМИ формами (`CreateColorwayForm` вкладки COLOURWAYS — только словарный
 * код, без имени; ручная строка `colourway-proposals` — имя плюс словарный `<select>`), и человек,
 * заведший его слева, не находил своего поля справа. Здесь форма одна: кто бы её ни открыл, вопросы
 * те же и в том же порядке.
 *
 * ⚠ ЭТО МОДАЛКА, ХОТЯ ЗОВЁТСЯ POPOVER, И ПРИЧИНА НЕ В ИМЕНИ. Две двери из четырёх — ПУНКТЫ СЕЛЕКТА
 * (`+ colourway…`): к моменту, когда окно открывается, пункт уже исчез вместе со списком, и
 * якориться поповеру не к чему. Второе: внутри стоит `PantonePicker`, а он сам — поповер; поповер в
 * поповере уводит слой закрытия в спор о том, кто из них верхний. `ConfirmationModal` — «одна
 * модалка приложения» (`ui/components/confirmation-modal.tsx`), она открывается СОСТОЯНИЕМ, без
 * триггера, и одинаково служит всем четырём дверям. Имя экспорта оставлено тем, каким его ждут
 * соседние зоны.
 *
 * ЧТО ЭТОТ ОРГАН ПИШЕТ, И ЧЕГО НЕ ПИШЕТ (T45). Ровно `CreateColorway{merchandising.color_code,
 * development{name, colours, name_i18n}}`: имя, палитру (первый цвет — главный; сервер сам
 * зеркалит его в pantone / pantone_system / dev_hex для старых читателей), переводы имени и
 * семейство словаря. Токен SKU НЕ отправляется — его чеканит сервер, и после создания он
 * показывается только для чтения (плитка COLOURWAYS, шапка продукта). Рецепт
 * (`UpdateColorwayRecipe`) НЕ пишется: ткань — свойство изделия, и назначать её здесь значило бы
 * выдумать метраж, которого никто не считал; палитра в слоты попадает только явной дверью
 * «apply palette to slots ›» на вкладке COLOURWAYS (решение владельца 7).
 *
 * ⚠ СЕМЕЙСТВО — НЕ УКРАШЕНИЕ, А ЧЕСТНОСТЬ (решение владельца 4). У каждого колорвея есть тег из
 * словаря 17 цветов — ключ фильтра каталога и сборки, — и подбирается он по hex главного цвета
 * той же мерой, что у сервера (`suggestFamily`). Спрятать его за автоподбором значило бы записать
 * в продукт то, чего никто не выбирал; поэтому подсказка ВИДНА («suggested: black») и семейство
 * переставляется в том же селекте. Все три вопроса задаёт общий редактор `ColourwayPaletteEditor`
 * — тот же, что у предложения ИИ и у формы продукта.
 */
export function ColourwayCreatePopover({
  techCardId,
  open,
  onOpenChange,
  onCreated,
  anchor,
  readOnly = false,
}: {
  techCardId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Новый колорвей заведён — вызывающий делает его целью прогона. */
  onCreated: (colorwayId: number) => void;
  /**
   * Дверь, если она у вызывающего одна и её удобно отдать сюда: клик по ней открывает окно. Узел
   * рисуется КАК ЕСТЬ и своего обработчика открытия нести не обязан. Двери-пункты селекта его не
   * передают вовсе — они держат `open` сами.
   */
  anchor?: React.ReactNode;
  readOnly?: boolean;
}): JSX.Element {
  /* ⚠ ЧИТАЕТСЯ ТОЛЬКО `isDirty`, И ЭТО ПОДПИСКА, А НЕ ПРОСМОТР — тот же довод, что у соседа
     (`colourway-proposals.tsx`): прокси `useFormState` подписывает на прочитанные свойства, и один
     булев переключается редко.

     ⚠ ЗДЕСЬ СТОЯЛ ПРОП `isCardDirty` «для вызывающего ВНЕ формы», и вызывающих у него не было ни
     одного: оба монтирования окна (`render-studio.tsx`, `colourway-proposals.tsx`) живут внутри
     `<Form>` тех-карты. Снят, а не оставлен на будущее: необязательный проп, старший контекста,
     это готовая дверь мимо единственного источника истины — первый же, кто передал бы в неё своё
     значение, получил бы окно, отказывающее по одной «грязности», пока сохраняет другую. */
  const { control } = useFormContext<TechCardFormData>();
  const { isDirty: dirty } = useFormState({ control });

  const { data: techCard } = useTechCard(techCardId);
  const { dictionary } = useDictionary();
  const { showMessage } = useSnackBarStore();
  const create = useCreateColorway(techCardId);

  const [value, setValue] = useState<PaletteValue>(emptyPaletteValue);
  const [failed, setFailed] = useState<string | null>(null);
  const touched =
    !!value.name ||
    value.rows.length > 0 ||
    !!value.colorCode ||
    Object.keys(value.nameI18n).length > 0 ||
    !!failed;

  const clear = () => {
    setValue(emptyPaletteValue());
    setFailed(null);
  };

  /**
   * ═══ ДВА СБРОСА, ОБА В ТЕЛЕ РЕНДЕРА (инвариант 12) ═══════════════════════════════════════════
   *
   * КАРТОЧКА. `StudioTab` при смене карточки НЕ размонтируется, а это окно висит рядом с дверью —
   * значит набранное имя и выбранный пантон уехали бы в `CreateColorway` уже под ЧУЖОЙ карточкой,
   * и человек узнал бы об этом на её вкладке COLOURWAYS. Довод и образец — тот же `shownCard` у
   * соседа.
   *
   * ЗАКРЫТИЕ. Окно закрывают четыре разных пути (✕, cancel, Esc, клик мимо), и все они идут одним
   * `onOpenChange(false)` МИМО нашего кода. Без этой пары строк следующая дверь открыла бы форму с
   * половиной прошлого ответа — и, что хуже, с прошлым отказом под кнопкой.
   *
   * Эффектом это делать нельзя: остаётся закоммиченный кадр, в котором карточка уже новая, а поля
   * ещё чужие, — и по нему успевают нажать.
   */
  const shownCard = useRef(techCardId);
  if (shownCard.current !== techCardId) {
    shownCard.current = techCardId;
    if (touched) clear();
  }
  const wasOpen = useRef(open);
  if (wasOpen.current !== open) {
    wasOpen.current = open;
    if (!open && touched) clear();
  }

  const colorways = techCard?.colorways ?? [];
  /**
   * ИМЕНА, УЖЕ ЗАНЯТЫЕ НА КАРТОЧКЕ (D12). Архивные считаются: имя архивного колорвея всё ещё стоит
   * в спецификациях и в разговоре, и второй «ROSSO» рядом с ним читался бы как тот же самый.
   *
   * Безымянный колорвей на экране зовётся своим кодом (`p.name || p.colorCode` у соседа) — значит
   * и занимает он это имя: «BLK», набранное поверх безымянного BLK, дало бы два одинаковых ярлыка.
   */
  const takenNames = useMemo(
    () =>
      new Set(
        colorways
          .map((c) => normalizeColourwayName(c.devName || c.colorCode))
          .filter(Boolean),
      ),
    [colorways],
  );

  const colours = dictionary?.colors;
  const picked = value.colorCode;
  const pickedColour = (colours ?? []).find((c) => c.code === picked);

  const named = value.name.trim();
  const refusal = createRefusal({
    readOnly,
    dirty,
    name: named,
    nameTaken: !!named && takenNames.has(normalizeColourwayName(named)),
    rowCount: value.rows.length,
    paletteRefusal: paletteRefusal(value.rows),
    colorCode: picked,
    dictionaryHasAny: (colours ?? []).length > 0,
    dictionaryHasColours: (colours ?? []).some((c) => !c.archived),
    codeChoosable: !picked || (!!pickedColour && !pickedColour.archived),
    codeKnown: !picked || !!pickedColour,
  });

  async function submit() {
    if (refusal || create.isPending) return;
    setFailed(null);
    try {
      const res = await create.mutateAsync({
        colorCode: picked,
        development: {
          devCode: undefined,
          name: named,
          labDipStatus: undefined,
          comment: undefined,
          // Пантон, система и hex НЕ отправляются: сервер зеркалит их из colours[0] сам, а
          // присланные рядом значения всё равно перекрывает зеркалом (ColorwayDevelopmentInsert).
          pantone: undefined,
          pantoneSystem: undefined,
          devHex: undefined,
          swatchMediaId: undefined,
          labDipRound: undefined,
          labDipSubmittedAt: undefined,
          labDipDecidedAt: undefined,
          labDipDecidedBy: undefined,
          labDipRejectReason: undefined,
          // Вложенный рецепт сервер отвергает прямым текстом — и этому окну он не нужен вовсе.
          usages: undefined,
          displayOrder: undefined,
          colours: paletteToWire(value.rows),
          // Переводы — только названные: пустая карта значит «нет перевода», и её не шлём.
          nameI18n: nameI18nPatch(undefined, value.nameI18n),
        },
      });
      const colorwayId = res?.colorwayId ?? 0;
      if (!colorwayId) throw new Error('the server created no colourway id');
      showMessage('colourway created', 'success');
      clear();
      onOpenChange(false);
      /* ⚠ ЦЕЛЬ ВСТАЁТ НА НОВЫЙ КОЛОРВЕЙ ТОЛЬКО ПОТОМУ, ЧТО `useCreateColorway.onSuccess` ВОЗВРАЩАЕТ
         промис `qc.invalidateQueries` (`useColorwayRecipe.ts`): v5 ждёт его до резолва
         `mutateAsync`, поэтому к этой строке карточка УЖЕ перечитана и новый id есть в
         `techCard.colorways`. Убери там `return` (или перепиши на `mutate`) — и дрейф-эффект
         `useColorwayChoice` не найдёт пункта под только что выбранным числом и молча отправит
         цель обратно в `sample`, а следующий прогон уедет семплом. Связь неявная — поэтому
         названа здесь, у потребителя. */
      onCreated(colorwayId);
    } catch (e) {
      /* ⚠ ОКНО НЕ ЗАКРЫВАЕТСЯ НА ОШИБКЕ (`closeOnConfirm={false}`): закрыть его значило бы стереть
         набранное имя вместе с отказом сервера — человек набирал бы его заново, чтобы получить тот
         же отказ. Квитанция стоит там же, где кнопка. */
      setFailed(createColorwayErrorMessage(e));
    }
  }

  return (
    <>
      {/* Дверь рисуется КАК ЕСТЬ, а открывает окно обёртка: `display:contents` не заводит своей
          коробки, поэтому раскладка вызывающего не меняется ни на пиксель. */}
      {anchor && (
        <span className='contents' onClick={() => !readOnly && onOpenChange(true)}>
          {anchor}
        </span>
      )}
      <ConfirmationModal
        open={open}
        onOpenChange={onOpenChange}
        onConfirm={submit}
        onCancel={clear}
        title='new colourway'
        confirmLabel='create colourway'
        confirmDisabled={!!refusal || create.isPending}
        closeOnConfirm={false}
        /* `md` — ЭТО ПОЛ, А НЕ ШИРИНА (шелл говорит так сам): в `sm` (340px) строка «sku colour»
           переносилась вместе со своей причиной в три строки мелкого текста, и три спокойных ряда
           читались теснее, чем один. Владелец в этом круге просит ровно обратного. */
        width='md'
      >
        {/* ЧЕТЫРЕ ВОПРОСА ОДНОГО РЕДАКТОРА И НИ ОДНОЙ ЛИШНЕЙ КНОПКИ. Шов между группами — тот же
            20px, что `GROUP_SEAM` студии: владелец просит «дай больше спейсинга», и своё число
            здесь развело бы окно с остальными экранами. */}
        <div className={GROUP_SEAM} data-cw-create=''>
          <ColourwayPaletteEditor
            name='colourway-create'
            value={value}
            onChange={(next) => {
              setValue(next);
              if (failed) setFailed(null);
            }}
            colours={colours}
            languages={dictionary?.languages}
            readOnly={readOnly}
            autoFocusName
            onEnter={() => void submit()}
          />

          {/* ОТКАЗ — ПОД ПОЛЯМИ, А НЕ В ПОДВАЛЕ: подвал этой модалки отдан подсказке о клавишах, и
              довод про место у него свой. Причина стоит там, где её чинят. */}
          {(refusal || failed) && (
            <div data-cw-refusal=''>
              <Reason>{failed ?? refusal}</Reason>
            </div>
          )}
        </div>
      </ConfirmationModal>
    </>
  );
}
