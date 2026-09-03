import type {
  GetDesignBandResponse,
  common_AdminColorwayRef,
  common_DesignColourRecipe,
  common_DesignFabricUse,
} from 'api/proto-http/admin';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFormContext, type UseFormReturn } from 'react-hook-form';

import type { TechCardFormData } from '../../schema';
import { COLORWAY_NONE } from '../bench-kinds';
import { fabricOfColorway, fabricUses } from '../assets/model';
import {
  EMPTY_CLOTH,
  EMPTY_RECIPE,
  clampColourName,
  normaliseTypedHex,
  splitStatedWords,
  type ClothDraft,
  type Presentation,
} from './model';

/**
 * THE SUBMISSION DRAFTS — what is about to be asked for, and nothing else.
 *
 * A draft is NOT card data and never becomes any. It is the state of a menu: the colour a render
 * would be given, the body a 3D asset is asked to sit on. It lives in the studio, dies with the
 * tab, and reaches the server exactly once — inside `StartDesignRun.params`, which the run then
 * freezes as its own history. Storing any of it on the card would put a second, competing answer to
 * «what colour is this style» next to the colourways, which is the one thing the palette's own
 * warning says it must never become.
 */

/* ─────────────────────────── the card's fit ─────────────────────────── */

/**
 * THE CARD'S FIT, READ WITHOUT ASSUMING THE FORM IS THERE.
 *
 * `fit` is a garment property: the studio only ever DISPLAYS it, and 3D may state a one-run
 * deviation from it. It lives in the tech card form, so it is read through the form context — but
 * the studio is also mounted by composers that are not inside a form (a print root, a harness), and
 * `useFormContext` answers `null` there while its type promises it never does. There is no error
 * boundary over this tab, so a `null.control` would take the whole screen white for the sake of a
 * grey caption.
 *
 * `useWatch` CANNOT BE USED HERE for exactly that reason: with no `control` prop it dereferences
 * the context itself. So the subscription is made by hand — `watch(callback)` returns a
 * subscription and is safe to skip entirely — and the hook count stays constant either way.
 */
export function useCardFit(): string {
  const form = useFormContext<TechCardFormData>() as UseFormReturn<TechCardFormData> | null;
  const [fit, setFit] = useState<string>(() => ((form?.getValues('fit') as string) ?? '').trim());

  useEffect(() => {
    if (!form) return;
    setFit(((form.getValues('fit') as string) ?? '').trim());
    const subscription = form.watch((values, { name }) => {
      if (name && name !== 'fit') return;
      setFit(((values.fit as string) ?? '').trim());
    });
    return () => subscription.unsubscribe();
  }, [form]);

  return fit;
}

/* ─────────────────────────── the colour draft ─────────────────────────── */

/**
 * ═══════════════ ДВЕ ДВЕРИ, А НЕ ОДНА: НАБРАННОЕ ЧЕЛОВЕКОМ И ЭХО ПРОИЗВОДНОГО ═══════════════
 *
 * ⚠ ЭТО НЕ УКРАШЕНИЕ ТИПА. Это единственная форма, в которой правило H-8 перестаёт держаться
 * дисциплиной вызывающих. История, замеренная целиком:
 *
 *   · `takeOff()` клал в имя цвета `colorCode` колорвея («OLV-02») — починено кругом раньше;
 *   · `wear()`, ШЕСТНАДЦАТЬЮ СТРОКАМИ ВЫШЕ, клал в имя `colourCode` ассета («ECRU») И ЗАТИРАЛ ИМ
 *     набранные руками hex, имя и слова. Замерено: набрано `#a41f22` / «dusty rose» /
 *     «fine rib jersey, matte» → после нажатия чипа `wears` стало `#eee8dd` / «ECRU» / «fine rib»,
 *     и `colourPhrase` печатал «colourway ECRU — the exact value is #eee8dd»;
 *   · ряд CLOTHS (`choose`) набранное БЕРЁГ, но в ПУСТОЕ имя тот же «ECRU» клал охотно, то есть
 *     знал половину правила;
 *   · засев колорвея клал в ТКАНЬ СЛОВАМИ его `pantone` — номер красильни, из которого промпт
 *     теперь велено СТРОИТЬ переплетение, вес, поверхность и падение.
 *
 * Четыре писателя, одна дорога, три разных потери. Пятый пришёл бы по ней же — поэтому правило
 * переехало С ВЫЗЫВАЮЩИХ НА ДВЕРЬ, и дверей стало две:
 *
 *   `typed` — ТО, ЧТО ЧЕЛОВЕК ВВЁЛ. Ранг 2 порядка старшинства: по цвету он СТАРШЕ фотографии, и
 *             ничто производное его не перебивает. Пишет ровно три скаляра и запоминает, что они
 *             отныне «свои».
 *   `echo`  — ПРОИЗВОДНОЕ: ассет, запись колорвея, прошлый рецепт. Ложится ТОЛЬКО в поля, которых
 *             человек не набирал, и получает не готовые скаляры, а ИСТОЧНИК.
 *
 * ⚠ ПОЧЕМУ `echo` ПРИНИМАЕТ ИСТОЧНИК, А НЕ МЕШОК ЗНАЧЕНИЙ — В ЭТОМ ВСЯ ЗАЩИТА. Дверь, берущая
 * `{code, hex, words}`, отличается от старого `patch` только именем: следующий писатель передаст в
 * неё `asset.colourCode`, и жетон снова уедет в промпт. Дверь, берущая ИСТОЧНИК, разбирает его
 * САМА — и в её разборе ПРОСТО НЕТ ВЫРАЖЕНИЯ, читающего `colourCode` ассета или `pantone`
 * колорвея. Артикульный жетон не «отфильтрован» предикатом, который однажды ошибётся на «ECRU» и
 * «ROSSO»; он НЕВЫРАЗИМ, потому что взять его неоткуда.
 *
 * ⚠ И ПОЧЕМУ ДВЕРИ НЕ СЛИТЫ В ОДНУ «ЧТОБЫ НЕ РАЗЪЕХАЛИСЬ». Соседняя волна только что оплатила
 * обратную ошибку: два поля свели в одно ради невозможности расхождения — и состояние, которое
 * фиче НУЖНО, стало невыразимым, а документированное действие молча выродилось в ничто. Здесь
 * различие несущее: «человек сказал синий» и «ткань оказалась синей» — разные утверждения с разным
 * старшинством, и прогон обязан уметь нести первое поверх второго. Невыразимой сделана НЕВЕРНАЯ
 * КОМБИНАЦИЯ (производное поверх набранного; жетон в имени), а не нужное состояние.
 */

/** Три скаляра цвета — единственные поля рецепта, у которых есть и ранг, и происхождение. */
const COLOUR_SCALARS = ['code', 'hex', 'words'] as const;
type ColourScalar = (typeof COLOUR_SCALARS)[number];

/** Что человек ввёл сам. Только эти три поля: остальное набрать негде. */
export type TypedColour = Partial<Record<ColourScalar, string>>;

/** По одному флагу на скаляр: «это значение принадлежит человеку, эхо его не трогает». */
export type OperatorOwned = Record<ColourScalar, boolean>;
const NOTHING_OWNED: OperatorOwned = { code: false, hex: false, words: false };

/**
 * ОТКУДА ПРИШЛО ЭХО. Ровно три источника, потому что их ровно три и есть; четвёртый обязан
 * появиться здесь членом объединения, а не новым вызовом `patch` где-то в органе.
 */
export type EchoSource =
  /** Ткани, выбранные для этого прогона (или надетые на колорвей). Пустой список = «ткани нет». */
  | { from: 'cloths'; fabrics: common_DesignFabricUse[] }
  /** Собственный цвет колорвея — то, что он носит, когда не носит ткань. */
  | { from: 'colourway'; colorway?: common_AdminColorwayRef | null }
  /** Последний рецепт карточки: засев «отрендерить то же ещё раз». */
  | { from: 'recipe'; recipe: common_DesignColourRecipe };

/**
 * ⚠ ОТСУТСТВУЮЩИЙ КЛЮЧ И ПУСТАЯ СТРОКА — РАЗНЫЕ ОТВЕТЫ, И РАЗНИЦА ЗАМЕРЕНА.
 *
 * `''` значит «этот источник говорит: тут ничего нет» — снятие ткани обязано убрать её цветное эхо.
 * Отсутствие ключа значит «источник про это поле не высказывается» — снятие ПОСЛЕДНЕГО чипа в ряду
 * CLOTHS не должно стирать собственный цвет колорвея, засеянный совсем другим источником. Свести
 * их в одно значило бы либо не убирать чужое эхо, либо убирать своё.
 */
export type EchoValues = Partial<
  Pick<common_DesignColourRecipe, 'source' | 'fabrics' | 'fabricMediaId' | 'code' | 'hex' | 'words'>
>;

/**
 * ЕДИНСТВЕННОЕ МЕСТО, ГДЕ ПРОИЗВОДНОЕ ПРЕВРАЩАЕТСЯ В СКАЛЯРЫ. Экспортировано не ради переиспользования,
 * а ради засева: он пишет состояние мимо `setRecipe`-двери (ему надо ещё разобрать `words` обратно),
 * и второе написание разбора источника было бы четвёртым вариантом того же правила.
 */
export function echoOf(source: EchoSource): EchoValues {
  switch (source.from) {
    case 'cloths': {
      const fabrics = source.fabrics;
      const first = fabrics[0];
      const structural: EchoValues = {
        fabrics,
        /**
         * ⚠ ГЛАВНАЯ ФОТОГРАФИЯ — ПЕРВАЯ, У КОТОРОЙ ОНА ЕСТЬ, а не «медиа первой ткани, какое бы ни
         * было». Ткань с `media_id = 0` законна и предлагается чипом наравне с прочими; выбрав
         * сначала бесфотографную, а следом снятую, человек получал `fabric_media_id = 0` — и обе
         * стороны дружно врали про один прогон: строка ранга на экране говорила «слова управляют
         * материалом», а бэкенд печатал клаузу «WHEN THIS RUN CARRIES NO FABRIC PHOTOGRAPH…» двумя
         * абзацами ниже списка тканей, к которому только что приложил фотографию второй.
         */
        fabricMediaId: fabrics.find((f) => (f.mediaId ?? 0) > 0)?.mediaId ?? 0,
      };
      // Ткани не выбрано вовсе: про цвет и слова этот источник не высказывается — см. `EchoValues`.
      if (!first) return structural;
      return {
        ...structural,
        /**
         * ⚠ `colourCode` АССЕТА СЮДА НЕ ЧИТАЕТСЯ, И ЭТОГО ВЫРАЖЕНИЯ ЗДЕСЬ ПРОСТО НЕТ. «ECRU»,
         * «OLV-02» — складские жетоны: они живут в SKU и на витрине и там не тронуты, а в промпте
         * читаются моделью как бессмысленный набор букв. H-8 существует ровно ради их изгнания.
         * Пустое имя — законное состояние: уезжает один hex, и `colourPhrase` это умеет.
         */
        code: '',
        hex: normaliseTypedHex(first.colourHex),
        // Свободное описание лоскута («fine rib») — НЕ жетон: это ткань словами, и ехать обязано.
        words: (first.words ?? '').trim(),
      };
    }
    case 'colourway': {
      const cw = source.colorway;
      return {
        // Колорвей носит СВОЙ цвет — значит ткани в этом прогоне нет, и это часть заявления.
        fabrics: [],
        fabricMediaId: 0,
        /**
         * ⚠ ИМЯ, А НЕ `colorCode`. Владелец снял словарь кодов с экрана генерации: «просто выбираем
         * пикером цвет … и назначаем ей название». `devName` — то, как цвет зовут люди; это
         * единственное из двух полей, что-то значащее для того, кто рисует картинку.
         */
        code: clampColourName((cw?.devName ?? '').trim()),
        hex: normaliseTypedHex(cw?.devHex),
        /**
         * ⚠ `pantone` СЮДА НЕ ЧИТАЕТСЯ, И ЭТО ОТДЕЛЬНОЕ РЕШЕНИЕ, А НЕ ЧАСТНЫЙ СЛУЧАЙ ПРЕДЫДУЩЕГО.
         *
         * `AdminColorwayRef.pantone` — по словам самого контракта «pantone reference the dyehouse
         * matches». Пока единственным глаголом клаузы слов в промпте было «is to be ignored», номер
         * красильни в поле `words` был инертным украшением. После правки H-13 промпт читает:
         * «…the weave or knit, the weight, the surface and the drape of this garment are to be
         * built from those words». Замерено на пути ПО УМОЛЧАНИЮ (именованный колорвей, ткани нет,
         * не тронуто ничего): поле показывало «18-1664 TCX», подпись — «goes to the model as:
         * «18-1664 TCX»», строка ранга — `governs`, и платный прогон получал приказ построить
         * переплетение и падение вещи из номера, которого человек не набирал.
         *
         * Цвет уже сказан ТОЧНО — `colourPhrase` печатает «colourway <имя> — the exact value is
         * <hex>», — поэтому в словах о ткани пантону делать нечего вовсе. С ЭКРАНА он никуда не
         * делся: чип пикера колорвеев печатает его через `colorwaySubtitle` (ряд FABRIC, второй
         * его читатель, снят вместе с тремя рядами настроек — J-20).
         * Нужно ли доносить его до модели РЯДОМ с именем и hex — вопрос к владельцу, и он открыт;
         * тихо подмешивать его в описание материала — не ответ на него.
         */
        words: '',
      };
    }
    default: {
      const r = source.recipe;
      return {
        source: (r.source ?? '').trim(),
        fabrics: r.fabrics ?? [],
        fabricMediaId: r.fabricMediaId ?? 0,
        code: clampColourName((r.code ?? '').trim()),
        hex: normaliseTypedHex(r.hex),
        words: (r.words ?? '').trim(),
      };
    }
  }
}

/**
 * Слить эхо поверх состояния, не тронув ни одного поля, которое человек набрал сам.
 *
 * Экспортировано ради ON MODEL: у перекраса свой хук с СУЖЕННЫМ эхом (только цвет), но само
 * правило старшинства обязано быть одно на два экрана — второе его написание разошлось бы молча.
 */
export function mergeEcho(
  prev: common_DesignColourRecipe,
  values: EchoValues,
  owned: OperatorOwned,
): common_DesignColourRecipe {
  const out: common_DesignColourRecipe = { ...prev };
  // Структурная половина рангом не защищена и защищена быть не может: набрать её негде, она
  // ВСЕГДА производна от выбора чипа.
  if (values.source !== undefined) out.source = values.source;
  if (values.fabrics !== undefined) out.fabrics = values.fabrics;
  if (values.fabricMediaId !== undefined) out.fabricMediaId = values.fabricMediaId;
  for (const key of COLOUR_SCALARS) {
    const echoed = values[key];
    if (echoed === undefined || owned[key]) continue;
    out[key] = echoed;
  }
  return out;
}

export type ColourDraft = {
  recipe: common_DesignColourRecipe;
  /**
   * ЧТО СКАЗАНО ПРО САМУ ТКАНЬ ЭТОГО ПРОГОНА (H-13) — прозрачность и граммаж.
   *
   * ЖИВЁТ РЯДОМ С РЕЦЕПТОМ, А НЕ ВНУТРИ НЕГО, потому что на проводе таких полей нет и заводить их
   * не нужно: обе оси КОМПОЗИРУЮТСЯ в `colour.words` у двери (`statedWords`, единственный писатель).
   * Класть их в `recipe` значило бы завести поля, которые протобуф молча выбросит при отправке, —
   * то есть построить ровно тот провальный режим («сохранено, но не поехало»), от которого вся эта
   * механика и защищается.
   */
  cloth: ClothDraft;
  /**
   * ЧЕЛОВЕК ВВЁЛ ЭТО САМ. Ранг 2: по цвету старше фотографии, и никакое эхо его больше не тронет.
   * Пустое значение снимает признак «своё» обратно — стёртое поле снова открыто для эха.
   */
  typed: (next: TypedColour) => void;
  /**
   * ПРОИЗВОДНОЕ ОТ ИСТОЧНИКА. Ложится только в поля, которых человек не набирал; артикульный жетон
   * в имя и в слова не пролезает по построению. Довод целиком — у `echoOf` выше.
   */
  echo: (source: EchoSource) => void;
  /**
   * Replace one axis of the cloth statement. Отдельный писатель, а не общий с рецептом: рецепт
   * едет на провод, а это — нет, и один писатель на два разных назначения складывал бы их в одно
   * поле при первой же невнимательности.
   */
  patchCloth: (next: Partial<ClothDraft>) => void;
  /**
   * Clear one statement without touching the others — «clear the colour», «clear the words». Писать
   * то же самое через `typed` можно было бы только выговаривая пустое значение каждого поля на
   * месте вызова, а три источника теперь КОМБИНИРУЮТСЯ: орган, чистивший цвет как
   * `{ code: '', hex: '', fabricMediaId: 0 }` (привычка старого переключателя), уносил бы с собой
   * и ткань, молча, на экране, весь смысл которого в том, что они сосуществуют.
   *
   * ⚠ ВЕТКА `'photo'` СНЯТА С ТИПА, А НЕ ОСТАВЛЕНА «НА ВСЯКИЙ СЛУЧАЙ». Вызывающих у неё не было ни
   * одного, а тело возвращало `{ ...prev, fabricMediaId: 0 }`, ОСТАВЛЯЯ `fabrics` стоять: прогон
   * после такой чистки нёс список тканей и заявлял, что фотографии в нём нет, — то есть промпт,
   * противоречащий сам себе. Мёртвая ветка, которая при первом же подключении даёт дефект, хуже
   * отсутствующей: она выглядит готовой дверью. Убрать ткань можно снятием чипа — там, где её и
   * ставят.
   */
  clear: (source: 'colour' | 'words') => void;
};

/**
 * The colour a render would be given, seeded from the LAST recipe this card actually used.
 *
 * SEEDED ONCE, AND ONLY WHILE UNTOUCHED. `colour_recipes` is newest first, so the first entry is
 * what the card last rendered — opening the studio on it is what makes «render the same thing in
 * another size» a single press. This seed is now the ONLY way a past recipe comes back: the colour
 * history that used to restore one by chip was removed on the owner's word («COLOUR HISTORY нам не
 * нужен»), so the last recipe has to arrive by itself or not at all. The seed is dropped the moment a human touches anything, because a
 * band refetch (any write on the card invalidates it) would otherwise reach in and overwrite a
 * half-made choice with the last finished one.
 */
/**
 * ПОЛОВИНА ЧЕРНОВИКА, КОТОРАЯ ОПИСЫВАЕТ ТКАНЬ СЛОВАМИ (H-13) — одно написание на оба черновика.
 *
 * Вынесено сюда, а не скопировано в каждый хук, по правилу этой полосы: список, живущий дважды,
 * расходится молча. У перекраса ряда CLOTH IS нет (H-13 сказан про фабрик-рендеры), поэтому там это
 * состояние просто никто не заполняет — но оно НАСТОЯЩЕЕ, а не заглушка: мёртвый писатель, который
 * молча съедал бы значение, был бы хуже пустого.
 */
function useClothStatement(touched: { current: boolean }): {
  cloth: ClothDraft;
  patchCloth: (next: Partial<ClothDraft>) => void;
  /** Засев — НЕ правка человека: `touched` он не поднимает, иначе первый же рефетч перестал бы
   *  засевать соседнюю половину черновика, и две половины разъехались бы по разным прогонам. */
  seedCloth: (next: ClothDraft) => void;
} {
  const [cloth, setCloth] = useState<ClothDraft>(EMPTY_CLOTH);
  return {
    cloth,
    patchCloth: (next) => {
      touched.current = true;
      setCloth((prev) => ({ ...prev, ...next }));
    },
    seedCloth: setCloth,
  };
}

export function useColourDraft(
  band: GetDesignBandResponse,
  /**
   * WHOSE render this is. `0` (or omitted) is the colourway-less bench and keeps the legacy seed
   * byte for byte. A named colourway seeds from the CARD instead — see below.
   */
  colorwayId: number = COLORWAY_NONE,
  /** Its row, for the colour half of the seed. Absent = the fabric half only. */
  colorway?: common_AdminColorwayRef | null,
): ColourDraft {
  const [recipe, setRecipe] = useState<common_DesignColourRecipe>(EMPTY_RECIPE);
  const touched = useRef(false);
  const seeded = useRef(false);
  /**
   * ⚠ РЕФ, А НЕ СОСТОЯНИЕ, И ЭТО НЕ ЭКОНОМИЯ ПЕРЕРИСОВКИ. Принадлежность НИЧЕГО не рисует: ни один
   * орган её не показывает и показывать не должен — человек и так знает, что он набирал. Заведи её
   * состоянием, и появилась бы вторая причина перерисовки ряда, ровно синхронная с первой, то есть
   * ЛИШНЯЯ. Читается и пишется она только в обработчиках, где рефы точны.
   */
  const owned = useRef<OperatorOwned>({ ...NOTHING_OWNED });
  const { cloth, patchCloth, seedCloth } = useClothStatement(touched);

  /**
   * ═══ ВЫБОР КОЛОРВЕЯ ЗАСЕВАЕТ ПОДАЧУ — ЭТО И ЕСТЬ ПРОБРОС ПАТТЕРНА В РЕНДЕР (G-15) ═══════════
   *
   * Владелец: «как мы туда можем пробрасывать паттерны которые мы сделаем». Провод от плитки до
   * промпта существует ЦЕЛИКОМ и здоров — ассет → чип в CLOTHS → `params.colour.fabrics` → воркер
   * прикрепляет медиа картинкой → `renderClothLine` цитирует имя и раппорт. Провальный режим был
   * один и он КЛИЕНТСКИЙ: «сохранено, но не поехало» — плитка лежала на полке, а в промпт не
   * попадала, пока человек не тикнет чип. Отсюда правило: назначенная ткань колорвея НАЧИНАЕТ
   * подачу выбранной, и строка над GENERATE (и модалка «what the model gets») показывают её ещё до
   * денег.
   *
   * ТРИ ЗАСЕВА, ПО ОДНОМУ НА СЛУЧАЙ, И НИ ОДИН НЕ ВЫВОДИТСЯ ИЗ ДРУГИХ:
   *   · колорвей 0 — последний рецепт карточки (`colour_recipes[0]`), ЛЕГАСИ-ПОВЕДЕНИЕ БАЙТ В БАЙТ.
   *     Никакого «своего цвета» у безколорвейного верстака нет, и выдумывать его нечем;
   *   · колорвей N с назначенной тканью — эта ткань: `fabrics=[она]` плюс ЭХО первой ткани в
   *     скаляры, ровно как это делает ряд CLOTHS (требование контракта: абзац старшинства в промпте
   *     читает главную фотографию из `fabric_media_id`);
   *   · колорвей N без назначения — ЕГО СОБСТВЕННЫЙ ЦВЕТ: hex ← `devHex`, code ← ИМЯ (`devName`, и
   *     БОЛЬШЕ НИЧЕГО), words ← ПУСТО. Это не догадка: «колорвей несёт цвет ИЛИ паттерн», и
   *     цветная половина уже лежит в строке колорвея.
   *     ⚠ ЗДЕСЬ СТОЯЛО «words ← `pantone`», И ЭТО БЫЛО НЕПРАВДОЙ О СОБСТВЕННОМ КОДЕ. Реализация
   *     (`echoOf`, ветка `colourway`) отдаёт `words: ''` НАМЕРЕННО, и довод расписан там же: после
   *     H-13 промпт строит переплетение и падение вещи ИЗ СЛОВ, поэтому номер красильни в этом
   *     поле стал приказом построить ткань из «18-1664 TCX». Поведение верное — врал комментарий.
   *
   * ⚠ ПОЧЕМУ ИМЯ, А НЕ SKU-КОД (H-8). Владелец снял словарь кодов (BEI BLK … ZSA) с экрана
   * генерации: «просто выбираем пикером цвет … и назначаем ей название». Код колорвея (`RED-01`)
   * — артикульная половина записи; он живёт в SKU и на витрине и там не тронут. Но в промпт он
   * уезжал строкой «colourway RED-01», то есть моделью читался как бессмысленный жетон. Имя, под
   * которым цвет зовут люди (`devName` = «ROSSO»), — то же самое поле провода, и оно единственное
   * из двух что-то значит для того, кто рисует картинку.
   *
   * ⚠ ФОЛБЭКА НА `colorCode` ЗДЕСЬ НЕТ, И ЭТОТ АБЗАЦ ОДНАЖДЫ УТВЕРЖДАЛ ОБРАТНОЕ. Он выглядел
   * вежливо — «колорвей без имени обязан назвать себя хоть чем-то» — и возвращал в подачу ровно те
   * жетоны, которые H-8 снял. Отсутствие имени законно: уезжает ОДИН HEX И БОЛЬШЕ НИЧЕГО — у
   * `colourPhrase` (`internal/designgen/renderprompt.go:605-615`, сверено на `origin/beta`) ветка
   * без кода возвращает `hex` ГОЛЫМ, без слова «colourway». Прежняя редакция этого абзаца
   * цитировала «colourway #a41f22» — такой строки промпт не печатает никогда, пример был выдуман.
   * Поведение при этом верное; неверна была цитата. Лестница `devName → colorCode → baseSku` жива
   * ТОЛЬКО у подписи чипа в пикере: чипу нужно как-то называться, а промпту — нет.
   *
   * ЗАСЕВ ОДИН РАЗ И ТОЛЬКО ПОКА НЕ ТРОНУТО — правило не менялось: рефетч полосы (её инвалидирует
   * любая запись на карточке) иначе затирал бы наполовину сделанный выбор. Переключение колорвея
   * пересевает не здесь, а РЕМОУНТОМ (`key={colorwayId}` в `studio-tab.tsx`): «засеяно однажды»
   * и «засеяно заново при смене цвета» — два разных правила, и складывать их в одно условие
   * значило бы отменять первое.
   */
  const latest = (band.colourRecipes ?? [])[0];
  /**
   * ⚠ ВСЕ ТРИ ВЕТКИ ЗАСЕВА ХОДЯТ ЧЕРЕЗ `echoOf` — ТУ ЖЕ ДВЕРЬ, ЧТО И ЖИВЫЕ ЖЕСТЫ. Раньше засев был
   * ЧЕТВЁРТЫМ написанием разбора источника, и именно он потерял правило про `pantone`: две ветки
   * из трёх читали поля колорвея и ассета руками, каждая по-своему. Теперь у «что производное
   * говорит о цвете» ровно одно определение, и добавить туда жетон нельзя, не тронув его.
   */
  const seed = useMemo<EchoValues | null>(() => {
    if (colorwayId <= 0) return latest ? echoOf({ from: 'recipe', recipe: latest }) : null;
    const asset = fabricOfColorway(band, colorwayId);
    if (asset) {
      /**
       * ⚠ СОБСТВЕННЫЙ ЦВЕТ КОЛОРВЕЯ СЮДА НЕ ПОДМЕШИВАЕТСЯ, И ЭТО НЕ ЭКОНОМИЯ.
       *
       * Порядок старшинства в промпте (`fabricAuthority`, `renderprompt.go`): фотография задаёт
       * МАТЕРИАЛ, а выбранный цвет ПЕРЕБИВАЕТ цвет фотографии. Значит дописать сюда `devHex`
       * колорвея, у которого ткань — многоцветная набивка, значило бы приказать модели залить
       * паттерн одним тоном: рецепт, собранный «на всякий случай полнее», отменил бы ровно ту
       * ткань, ради проброса которой всё и делалось. Ткань говорит за себя; цвет колорвея — это
       * ДРУГАЯ ветка засева, ниже, и она включается ровно тогда, когда ткани нет.
       */
      const fabrics = fabricUses(band, [asset.id ?? 0]);
      if (fabrics.length) return echoOf({ from: 'cloths', fabrics });
    }
    if (!colorway) return null;
    const own = echoOf({ from: 'colourway', colorway });
    // Колорвей, у которого не заявлено НИЧЕГО, — законное состояние: засевать нечем, и ряд FABRIC
    // говорит это словами вместо того, чтобы молчать.
    if (!own.hex && !own.code) return null;
    return own;
  }, [band, colorwayId, colorway, latest]);

  useEffect(() => {
    if (touched.current || seeded.current || !seed) return;
    seeded.current = true;
    /**
     * ⚠ ЗАСЕВ РАЗБИРАЕТ `words` ОБРАТНО НА СТРУКТУРНУЮ ПОЛОВИНУ И ХВОСТ (H-13, замеренный дефект).
     *
     * `colour_recipes[0]` хранит СОБРАННУЮ строку прошлого прогона, а `cloth` начинается пустым.
     * Без разбора вторая сессия складывала свойства ДВАЖДЫ: выбрал `opaque` + 220 поверх засеянного
     * «semi-sheer, about 180 g/m², fine rib» — и в платный запрос уезжало
     * «opaque, about 220 g/m², semi-sheer, about 180 g/m², fine rib», где два взаимоисключающих
     * заявления о прозрачности стоят в одной фразе. Довод и грамматика разбора — у `splitStatedWords`.
     */
    const restored = splitStatedWords(seed.words ?? '');
    /**
     * ⚠ ЗАСЕВ — НЕ «СВОЁ» ЗНАЧЕНИЕ, И ФЛАГИ ПРИНАДЛЕЖНОСТИ ОН НЕ ПОДНИМАЕТ. Он ЭХО по природе:
     * колорвей, ассет или прошлый рецепт, — и следующий жест (одеть ткань, снять её) обязан его
     * заменить. Поднять здесь «своё» значило бы объявить набранным человеком то, чего он не
     * набирал, и заморозить засеянный цвет колорвея поверх ткани, которую он тут же наденет.
     *
     * ПРЕДЕЛ ИМЕНИ И ПРИВЕДЕНИЕ HEX УЖЕ ПРИМЕНЕНЫ — их применил `echoOf`, один на все три ветки.
     * Раньше клампилась ОДНА ветка из трёх: `setRecipe` шёл мимо единственной двери, которая про
     * предел знала.
     */
    setRecipe({ ...EMPTY_RECIPE, ...seed, words: restored.words });
    seedCloth(restored.cloth);
  }, [seed, seedCloth]);

  return {
    recipe,
    cloth,
    typed: (next) => {
      touched.current = true;
      const clean: TypedColour = {};
      // ПРЕДЕЛ ИМЕНИ — У ПИШУЩЕЙ ДВЕРИ, а не только в атрибуте поля: `maxLength` ограничивает
      // только набор с клавиатуры, а сюда значение приходит и вставкой. Довод — у `clampColourName`.
      if (next.code !== undefined) clean.code = clampColourName(next.code);
      /**
       * ⚠ HEX ЗДЕСЬ НЕ ПРИВОДИТСЯ, И ЭТО НЕ ЗАБЫВЧИВОСТЬ. `typed` зовётся НА КАЖДОЙ БУКВЕ: человек,
       * набирающий «#a41f22», проходит через «#a», «#a4», «#a41» — и приведение под пальцами либо
       * стирало бы набранное, либо (на «#a41») достраивало бы его до цвета, которого никто не
       * просил. Инвариант «на провод не уезжает непокрасимое» держат ДВЕРЬ КОМПОЗИЦИИ и `blur`
       * поля; здесь живёт ровно то, что человек напечатал.
       */
      if (next.hex !== undefined) clean.hex = next.hex;
      if (next.words !== undefined) clean.words = next.words;
      for (const key of COLOUR_SCALARS) {
        const value = clean[key];
        if (value === undefined) continue;
        // ⚠ ОЧИЩЕННОЕ ПОЛЕ СНОВА ОТКРЫТО ДЛЯ ЭХА. Иначе человек, стерший имя, навсегда запретил бы
        // ткани назвать себя — «своим» осталось бы пустое место.
        owned.current[key] = value.trim() !== '';
      }
      setRecipe((prev) => ({ ...prev, ...clean }));
    },
    echo: (source) => {
      touched.current = true;
      setRecipe((prev) => mergeEcho(prev, echoOf(source), owned.current));
    },
    patchCloth,
    /**
     * ⚠ `clear('words')` НЕ ТРОГАЕТ ПРОЗРАЧНОСТЬ И ГРАММАЖ, И ЭТО РЕШЕНИЕ. Кнопка `clear` стоит на
     * ряду IN WORDS и снимает ровно то, что человек в него набрал; снести заодно две оси соседнего
     * ряда значило бы стереть выбор, к которому кнопка не относится, — и он ушёл бы молча, потому
     * что общая подпись композиции ниже пересобралась бы сама. Оси снимаются там же, где ставятся:
     * повторным кликом по чипу и пустым полем.
     */
    clear: (source) => {
      touched.current = true;
      if (source === 'colour') {
        owned.current.code = false;
        owned.current.hex = false;
        setRecipe((prev) => ({ ...prev, code: '', hex: '' }));
        return;
      }
      owned.current.words = false;
      setRecipe((prev) => ({ ...prev, words: '' }));
    },
  };
}

/* ─────────────────────────── the 3D draft ─────────────────────────── */

export type ThreedDraft = {
  /**
   * `frames` СНЯТ ОТСЮДА (K-11) вместе со своим рядом выбора и своей строкой описи. Довод целиком
   * — в `./model.ts`, на месте покойного `FRAME_CHOICES`: 3D строится из ВИДОВ, промежуточной
   * сущности «кадр» на этом пути нет, и вопрос «сколько кадров» перестал иметь ответ. Черновик
   * его больше не держит, поэтому подставить его молча неоткуда.
   */
  presentation: Presentation;
  /** 0 = no model chosen. A real id, from the models dictionary. */
  modelId: number;
  /** 0 = no size chosen. A real id, from the sizes dictionary. */
  garmentSizeId: number;
  /**
   * WHAT BUILD the garment is asked to sit on — one word of `BODY_TYPES`, or '' for «not stated».
   *
   * НЕ АЛЬТЕРНАТИВА `modelId`, А ВТОРАЯ ПОЛОВИНА ОДНОГО ОТВЕТА: имя называет, КТО, это слово — КАКОЙ
   * ФОРМЫ, и контракт разрешает назвать оба. '' читается ровно как «не сказано» — генератор выбирает
   * сам, — а не как «обычное телосложение».
   */
  bodyType: string;
  /** '' = the card's fit was used. Anything else is a stated deviation and is stamped as one. */
  fitOverride: string;
};

export type ThreedDraftState = {
  draft: ThreedDraft;
  patch: (next: Partial<ThreedDraft>) => void;
};

const INITIAL_THREED: ThreedDraft = {
  presentation: 'air',
  modelId: 0,
  garmentSizeId: 0,
  bodyType: '',
  fitOverride: '',
};

export function useThreedDraft(): ThreedDraftState {
  const [draft, setDraft] = useState<ThreedDraft>(INITIAL_THREED);
  return {
    draft,
    patch: (next) => setDraft((prev) => ({ ...prev, ...next })),
  };
}
