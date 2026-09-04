import type { GetDesignBandResponse, common_AdminColorwayRef } from 'api/proto-http/admin';
import { useMemo, useState, type JSX } from 'react';
import { Section } from 'ui/components/section';

import { viewLabel } from '../views';
import { useCardFit, useColourDraft } from './drafts';
import { FabricRenderSlots } from './fabric-render-slots';
import { GenerateRow } from './generate-row';
import {
  hexIsPaintable,
  madeOfLine,
  recipeIsStated,
  renderGate,
  renderSheetViews,
  statedWords,
  wireColourSource,
  type Gate,
} from './model';
import { OutputsSection } from './outputs';
import { Palette } from './palette';
import { RenderInputStrip } from './render-input-strip';
import { useStartDesignRun } from './use-design-run';
import { WhatModelGetsRenderModal } from './what-model-gets';

/**
 * THE FABRIC RENDER STUDIO — the whole of the `render` view of the DESIGN band.
 *
 * TWO BLOCKS, IN THIS ORDER, AND THE ORDER IS THE ARGUMENT. First what the render is MADE FROM (the
 * flats, with the line down the middle), then what it is made WITH (the fabric: photo, colour, words
 * — any of them, in any combination, ranked by the prompt and not by this screen). The
 * prototype puts the inputs above the menu on both generative screens for the same reason the bench
 * stands below the feed on FLAT: you look at the material before you decide what to do to it.
 *
 * THE REFERENCES ARE NOT DRAWN HERE, and that is a rule of the band rather than a layout choice: a
 * fabric render is coloured over THE FLATS OF THIS CARD, and the model never sees the reference
 * photographs at all. Drawing them would put a section on screen that has no effect on the button
 * beneath it. They belong to FLAT, one click away.
 *
 * ONE RUN COMES BACK AS ONE SHEET OF SEVERAL VIEWS, and it is split into the slots afterwards —
 * the owner's answer of 2026-08-31. That is why there is no «pictures» count in the menu: the money
 * and the picture are both singular no matter how many sides the bench holds, and the plural is
 * created for free, later, by the split.
 *
 * ═══ FIT БОЛЬШЕ НЕ СТОИТ НА ЭТОМ ЭКРАНЕ (J-20) ═══════════════════════════════════════════════
 *
 * Владелец: «FIT полностью убираем отсюда». Здесь стоял read-only ряд, который печатал посадку
 * карточки и объяснял, почему её нельзя править, — то есть занимал строку настройки, ничего не
 * настраивая.
 *
 * ⚠ «ОТСЮДА» — ЭТО ЭКРАН, А НЕ ПРОВОД, И РАЗНИЦА ЗДЕСЬ ДЕНЕЖНАЯ. Сервер по-прежнему морозит
 * `fit` в снимок КАЖДОГО рендер-прогона и печатает его в платный промпт (`snapshot.go`,
 * `composePrompt`). Поэтому `useCardFit` остался и по-прежнему кормит модалку «what the model
 * gets»: инвентарь обязан называть ВСЁ, что уезжает, иначе экран говорит одно, а тело запроса
 * другое. Перестать ОТПРАВЛЯТЬ посадку — правка бэкенда и другой промпт на каждом рендере; это
 * отдельное решение владельца, и здесь оно не принимается молча.
 */
/**
 * ═══ КОЛОРВЕЙ: ОРГАН УХОДИЛ, ОСЬ НЕ УХОДИЛА, ОРГАН ВЕРНУЛСЯ ДРУГИМ (E-16 → круг 19, C1) ══════
 *
 * КРУГ 16, дословно: «в GENERATION — FABRIC RENDER мы полностью убираем колорвеи только имена
 * остаются». Тем же кругом про соседний экран: «в MAKE A PATTERN оставь только имя убери колорвей»
 * (E-1). Отсюда тогда ушли `ColorwaySelect` из заголовочной линейки блока, проп `colorway`, засев
 * черновика тканью колорвея и подпись «this card has no colourways…», а экран стал адресовать
 * безколорвейный верстак — `0`.
 *
 * КРУГ 19, дословно: «колорвеи для рендеров … как пробрасывать паттерны … как сохранять». Ось
 * вернулась, и мирится это с E-16 РОВНО ОДНИМ УСЛОВИЕМ, которое здесь и соблюдено:
 *
 *   · ВЫБОР СТОИТ НЕ НА ЭТОМ ЭКРАНЕ. Заголовочная линейка блока пуста, как её и оставил E-16;
 *     число приходит ПРОПОМ сверху, из единственного органа — селекта в правом конце ряда
 *     представлений (`kinds-strip.tsx`), который на всю студию один;
 *   · «ТОЛЬКО ИМЕНА ОСТАЮТСЯ» НЕ ТРОНУТО: имя цвета в рецепте — по-прежнему СВОБОДНОЕ слово рядом
 *     с hex (H-8), артикульных жетонов промпт не видит, и колорвей его собой не подменяет;
 *   · ЗАСЕВ ТКАНЬЮ ЧЕРЕЗ `design_asset.colorway_id` НЕ ВЕРНУЛСЯ. Ссылка «одна ткань на колорвей»
 *     не выражает N тканей; засев теперь идёт от ПОСЛЕДНЕГО РЕЦЕПТА этого колорвея — тем же
 *     правилом, которым нулевой верстак засевается последним рецептом карточки.
 *
 * ⚠ И ЭТО ПО-ПРЕЖНЕМУ ОБЯЗАНО БЫТЬ ОДНО ЧИСЛО НА ВСЮ СТУДИЮ — довод не изменился ни на слово,
 * поменялась только его сторона. Верстак рендеров ПИШЕТСЯ ЗДЕСЬ (`FabricRenderSlots`,
 * `OutputsSection` → `mark ▸`), ЧИТАЕТСЯ на 3D (`threedSides`) и собирается СЕРВЕРОМ
 * (`designSelectBench`). Заведи этот экран своё состояние — и 3D смотрело бы в один верстак, пока
 * рендер наполняет другой. Поэтому владелец числа — композитор, а здесь оно только принимается.
 */
export function RenderStudio({
  band,
  techCardId,
  disabled,
  onGoToKind,
  colorwayId = 0,
  colorwayRef = null,
  colorwayLabel = '',
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
  /**
   * ЧЕЙ ЭТОТ РЕНДЕР. `0` — безколорвейный верстак: не пропуск, а НАСТОЯЩЕЕ, вечно законное
   * значение, на котором стоит каждый рендер, сделанный до появления оси, и которое читает
   * 3D-прогон, не назвавший колорвея. Умолчание пропа — оно же, поэтому композитор, не давший
   * числа, получает ровно прежнее поведение.
   */
  colorwayId?: number;
  /** Его строка — вторая половина засева («свой цвет колорвея», когда рендеров у него ещё нет). */
  colorwayRef?: common_AdminColorwayRef | null;
  /** Его имя — для отказов и подписей выходов; `''` под `no colourway`, и это тоже утверждение. */
  colorwayLabel?: string;
  /**
   * Уйти на другое представление студии. Тем же пропом и по тому же доводу, что у `ThreedStudio`:
   * состояние `kind` живёт в ОДНОМ месте на всю студию (`StudioTab`), и экран, заведший своё,
   * рассинхронил бы полосу вкладок со своим же содержимым.
   */
  onGoToKind?: (kind: 'flat' | 'pattern' | 'render' | 'threed' | 'onmodel') => void;
}): JSX.Element {
  const draft = useColourDraft(band, colorwayId, colorwayRef);
  const cardFit = useCardFit();
  const run = useStartDesignRun(techCardId);
  /** The prompt inventory. A modal is its own surface, so it is mounted beside the blocks. */
  const [inspecting, setInspecting] = useState(false);

  /**
   * THE VIEWS THIS RUN ASKS FOR, IN SHEET ORDER — a walk around the garment (front, side L, back,
   * side R), narrowed to the slots that actually hold a drawing.
   *
   * ⚠ THIS LIST IS SENT, PROMPTED AND SPLIT AS ONE. It travels as `params.views`; the store records
   * it VERBATIM as «what is glued into this image» (`compositeViewsOf`); the prompt names it
   * left-to-right; the splitter labels the cut frames off the record. Sorting it anywhere else in
   * that chain would hand back a sheet whose frames are systematically mislabeled.
   */
  const views = useMemo(() => renderSheetViews(band), [band]);

  /**
   * ═══ ОДНА ТОЧКА КОМПОЗИЦИИ НА ВЕСЬ ЭКРАН ════════════════════════════════════════════════════
   *
   * Ворота, тело прогона, строка инвентаря и модалка «what the model gets» читают ОДИН объект.
   * Собери его в четырёх местах — и первое же расхождение будет стоить купленной картинки: экран
   * пообещал бы «semi-sheer, about 180 g/m²», ворота посчитали бы рецепт пустым, а уехало бы третье.
   *
   * ⚠ ВОРОТА ОБЯЗАНЫ СЧИТАТЬ ИМЕННО ЭТО, А НЕ `draft.recipe`. После H-13 прогон, заявленный ТОЛЬКО
   * прозрачностью и граммажем, — законное заявление о ткани; ворота, читающие сырой рецепт, назвали
   * бы его пустым и отказали бы человеку в том, что экран у него только что принял.
   */
  const sent = useMemo(
    () => ({
      ...draft.recipe,
      words: statedWords(draft),
      /**
       * ⚠ ИНВАРИАНТ ЦВЕТА ДЕРЖИТ ЭТА ДВЕРЬ, А НЕ ПОЛЕ: НА ПРОВОД НЕ УЕЗЖАЕТ HEX, КОТОРЫЙ ЭКРАН
       * НАЗЫВАЕТ НЕ ЗАЯВЛЕННЫМ.
       *
       * Двe оси расходились и расходились уверенно. Клиентская — `hexIsPaintable` (три или шесть
       * знаков ПОСЛЕ решётки). Серверная — `strings.TrimSpace(colourPhrase(code, hex)) != ""`
       * (`renderprompt.go`), то есть ЛЮБОЙ непустой hex. Замерено пять значений из шести: при
       * «a41f22» / «#ab» / «red» / «#a41f2» / «#GGG» экран рисовал штриховку, не называл цвета и
       * говорил, что прогон сделан ИЗ СЛОВ, — а купленный промпт получал ранг 2 «THE STATED
       * COLOUR … governs the COLOUR of this garment» с блоком цвета «a41f22» и ТЕРЯЛ
       * утвердительную сольную клаузу, которую экран только что пообещал. Одно значение поля
       * покупало другой промпт, чем показанный.
       *
       * ОДНА ГАРАНТИЯ У КОМПОЗИРУЮЩЕЙ ДВЕРИ МИРИТ ОБЕ ОСИ ПРИ ЛЮБОМ СОДЕРЖИМОМ ПОЛЯ, и держится
       * она не порядком событий: `blur` поля (он тоже есть) можно обойти — а мимо этой строки не
       * проходит ни один прогон. `sent` читают и ворота, и строка денег, и модалка, поэтому все
       * они видят ровно то, что уедет.
       *
       * ⚠ ДВЕРЬ ПРОПУСКАЕТ, А НЕ ДОСТРАИВАЕТ, И РАЗНИЦА ЗАМЕРЕНА. Первая редакция звала здесь
       * `normaliseTypedHex`, то есть ДОПИСЫВАЛА решётку: «a41f22» уезжало как «#a41f22». Оси при
       * этом мирились лишь наполовину — свотч и `fabricStatement` читают СЫРОЙ черновик и
       * продолжали говорить «цвет не заявлен», пока на провод уезжал цвет. Инвариант сформулирован
       * не «привести к цвету», а «не везти то, чего экран не признаёт», и предикат здесь обязан
       * быть ТОТ ЖЕ, которым экран признаёт (`hexIsPaintable`), а не похожий на него.
       *
       * ДОСТРАИВАНИЕ ЖИВЁТ У ПОЛЯ, НА `blur`, ГДЕ ЧЕЛОВЕК ВИДИТ РЕЗУЛЬТАТ. Там оно — услуга; здесь
       * оно было бы тихой подменой в пользу значения, которого свотч не рисовал.
       */
      hex: hexIsPaintable(draft.recipe.hex) ? (draft.recipe.hex ?? '').trim() : '',
    }),
    [draft.recipe, draft.cloth],
  );

  const gate: Gate = useMemo(() => {
    const base = renderGate(band);
    if (!base.ok) return base;
    if (!recipeIsStated(sent)) {
      return {
        ok: false,
        reason:
          'no fabric is stated yet — pick a cloth, pick a colour, say what the cloth is, or describe it in words above. Any one of them is enough, and they may be combined',
      };
    }
    return { ok: true };
  }, [band, sent]);

  const generate = () => {
    run.start({
      kind: 'render',
      ask: '',
      params: {
        views,
        // ─── КОЛОРВЕЙ ПРОГОНА (L-2). Осмыслен именно на `render`: мультивью, который сейчас
        // покупается, — ЭТОГО цвета, и сервер копирует поле в живую колонку прогона, чтобы
        // историю можно было нарезать по колорвею, а разрез и флэттен унаследовали атрибуцию
        // кадрам. Число — ТО ЖЕ, что показывает селект в ряду представлений и по которому сужены
        // выходы и верстак ниже: экран, покупающий не тот колорвей, который называет, заморозил
        // бы в истории атрибуцию, которой человек не видел. `0` при этом — не пропуск, а «без
        // колорвея»: ровно то, чем является каждый рендер, сделанный до появления оси, и
        // единственное значение, при котором плиты прогона встают в безымянный верстак.
        colorwayId,
        // ─── ONE PICTURE, ALL THE VIEWS IN A ROW — the owner's own answer of 2026-08-31 to «что
        // возвращает один прогон»: «Три вида в одной картинке… в слоты кладётся уже после разреза».
        //
        // IT USED TO BE `per_view`, AND THE DIFFERENCE IS NOT COSMETIC. `per_view` is one PAID CALL
        // per view (see designgen/images.go, imageCalls), so a three-side card bought three
        // pictures — three separate photographs of what is supposed to be one garment, each free to
        // drift a shade of white, a neckline and a light. A sheet is one call, one cloth, one light,
        // and the store's own compositeViewsOf records the row so the splitter can cut it into the
        // slots afterwards. Cheaper AND more coherent, which is unusual enough to be worth the note.
        // Деталей этот прогон не просит, и список пуст ЯВНО: сервер сверяет его длину с числом
      // элементов `detail` в `views`, и «поле не задано» здесь означало бы то же, что пустой
      // список, только молча.
      detailSlotIds: [],
      layout: 'one',
        colour: {
          ...sent,
          // DERIVED AT THE DOOR, NOT HELD BY A CONTROL. `source` predates combination and cannot
          // spell «a photo and a picked colour together»; it is written here purely so recipes
          // already stored stay readable, and it never decides what travels — the three populated
          // fields do.
          source: wireColourSource(sent),
        },
        threed: undefined,
        fixTarget: '',
        extraInputMediaIds: [],
        // NOT A FIX, AND SAID EXPLICITLY IN BOTH SPELLINGS. `fix_target` is the frozen scalar the
        // history already states; `fix_targets`/`fix_slot_ids` are the selection a new run uses.
        // Empty in all three is «this run corrects nothing», which is what these two screens do.
        fixTargets: [],
        fixSlotIds: [],
        // ASK FOR THE PROPOSED CUT. A render now comes back as ONE sheet of several views, and the
        // whole point of the flag is that the human confirms frames instead of drawing rectangles
        // from nothing. It cuts nothing by itself — the cut stays `SplitDesignPicture`'s and stays
        // a person's — it only records that the guess was wanted.
        autoSplit: true,
        pattern: undefined,
        useFlatSlots: false,
        // Поле НАРАЩИВАЕТ `use_flat_slots` и осмысленно только на kind=flat; здесь оно ИГНОРИРУЕТСЯ
        // сервером, а пустой список и так значит «все заполненные». Стоит явно, потому что
        // контракт требует назвать поле, а не потому, что этому прогону есть что им сказать.
        flatSlotIds: [],
      },
    });
  };

  return (
    <>
      <RenderInputStrip band={band} techCardId={techCardId} disabled={disabled} />

      <Section
        /* ЯКОРЬ ОБЪЯВЛЕН по тому же доводу, что у полосы входа: об этом блоке делаются
           утверждения ОТСУТСТВИЯ (в нём нет пикера колорвея — E-16) и ПРИНАДЛЕЖНОСТИ (сетка
           текстур живёт ИМЕННО здесь, а не во входе — E-7). */
        id='design-fabric-menu'
        title='generation — fabric render'
        question='— the cloth: a texture, a colour, or both'
      >
        <Palette
          band={band}
          techCardId={techCardId}
          disabled={disabled}
          draft={draft}
          /* K-16: вторая дверь у полки текстур. Приехала сюда вместе с самой полкой (E-7); без
             `onGoToKind` её нет вовсе — кнопка, которой некуда вести, хуже её отсутствия. */
          onMakePattern={onGoToKind && (() => onGoToKind('pattern'))}
        />

        {/* СТРОКА ИНВЕНТАРЯ НАЗЫВАЕТ И ТКАНЬ (H-12). «made of pattern 2» — вторая половина работы
            снесённого заголовка-заявления: правда прогона стоит в двух шагах от денег, там, где на
            неё смотрят, а не над контролами, которые её же и правят. */}
        <GenerateRow
          gate={gate}
          shape={[
            views.length > 1
              ? `1 picture · ${views.length} views in a row`
              : `1 picture · ${views.length === 1 ? viewLabel(views[0]) : 'no slot filled'}`,
            madeOfLine(sent),
            views.length > 1 ? 'split into the slots afterwards' : '',
          ]
            .filter(Boolean)
            .join(' · ')}
          pending={run.isPending}
          disabled={disabled}
          onGenerate={generate}
          onInspect={() => setInspecting(true)}
        />
      </Section>

      {/* The renders this page of the band holds — the outputs, where the mark «chosen» lives and
          is SET. The owner's W-12 names 3D, but ARTIFACTS narrows its RENDERS segment to the
          chosen ones too (W-14) — a mark that filters a list must be settable for that list, so
          the same section stands on both generative screens. See `./outputs`. */}
      <OutputsSection
        band={band}
        techCardId={techCardId}
        kind='render'
        disabled={disabled}
        colorwayId={colorwayId}
        colorwayLabel={colorwayLabel}
      />

      {/* ═══ FABRIC RENDER SLOTS — ПОСЛЕ ВЫХОДОВ, ПОТОМУ ЧТО ЗАПОЛНЯЕТСЯ ИЗ НИХ (J-25) ══════════
          Владелец: «отдельные независимые слоты именно для фабрик рендеров которые можно заполнять
          в разделе RENDERS OF THIS CARD и там же можно и сплитить их». Порядок экрана поэтому
          читается как рассказ: из чего рендерим (флэты) → чем (ткань) → что вышло (выходы) →
          что из вышедшего пошло в дело (слоты). Тот же закон «сначала материал, потом сборка», по
          которому флэтовый верстак стоит под лентой прогонов.
          ⚠ FLAT SLOTS на этой вкладке НЕТ и не возвращается: гейт `kind === 'flat'` в
          `studio-tab.tsx` (J-14/J-18/J-30). Этот блок — не его переодетая копия, а второй
          верстак: другой род, другой скоуп, другие двери. */}
      <FabricRenderSlots
        band={band}
        techCardId={techCardId}
        disabled={disabled}
        colorwayId={colorwayId}
        colorwayLabel={colorwayLabel}
      />

      {/* ═══ БЛОК ПРИМЕРКИ (FABRIC FITTING) СНЕСЁН ЦЕЛИКОМ — J-21 ══════════════════════════════
          Владелец, дословно: «в FABRIC FITTING давай удалим полностью эту функцальность она
          слишком громоздкая и плохо работает». Вместе с блоком ушли `render/placement/` целиком,
          обе мутации меток (`assets/use-assets`) и три читателя разметки (`assets/model`).
          Таблица, ручки сервера и поле `asset_placements` полосы ЖИВЫ и не тронуты: удаление
          данных — отдельное решение владельца, и миграции этот круг не пишет.
          ⚠ ДЕНЕЖНОЕ ПОСЛЕДСТВИЕ НАЗВАНО ВСЛУХ у `fabricUses` в `assets/model.ts`: `parts` теперь
          пусты, и прогон с двумя тканями перестал сужаться правилом «It is used on: …». */}

      <WhatModelGetsRenderModal
        open={inspecting}
        onOpenChange={setInspecting}
        band={band}
        kind='render'
        /* МОДАЛКА О ЧИПАХ НЕ ЗНАЕТ И НЕ ДОЛЖНА: ей отдаётся ТО ЖЕ предложение, что уедет на провод,
           одной строкой слов. Иначе «что получит модель» показывало бы не то, что получит модель. */
        recipe={sent}
        cardFit={cardFit}
      />
    </>
  );
}
