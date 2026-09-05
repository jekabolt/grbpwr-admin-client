import type { GetDesignBandResponse, common_DesignAsset } from 'api/proto-http/admin';
import { MediaSlot } from 'components/managers/media/components/media-slot';
import { useSnackBarStore } from 'lib/stores/store';
import { useMemo, useState, type JSX } from 'react';
import { Button } from 'ui/components/button';
import { Chip } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { GroupLabel } from 'ui/components/group-label';
import Input from 'ui/components/input';
import { PLACEHOLDER_SURFACE, placeholderClass } from 'ui/components/placeholder';
import Text from 'ui/components/text';
import { Tiles } from 'ui/components/tiles';

import {
  ASSET_FABRIC,
  ASSETS_PER_CARD_MAX,
  assetFull,
  assetIsPattern,
  assetLabel,
  assetThumb,
  clothShelf,
  fabricUses,
  unmanagedAssets,
} from '../assets/model';
import { ColourPicker } from '../assets/colour-picker';
import { useAssetWrites } from '../assets/use-assets';
import { PartsRow } from '../colour-plan/parts-row';
import type { ColourPlanWrites } from '../colour-plan/use-colour-plan';
import { PictureTile } from '../picture-tile';
import { benchSides } from './model';
import { ClothIsRow } from './cloth-is';
import type { ColourDraft } from './drafts';
import { FieldRow, Hint } from './field-row';
import { COLOUR_NAME_MAX, fabricStatement, hexIsPaintable, statedWords } from './model';

/**
 * TEXTURE & COLOUR — what a render is clothed and coloured with, and the ONLY place on the band
 * where the card's cloth is brought in, chosen, named and thrown away.
 *
 * ═══ E-7 + E-8 ARE ONE MOVE, AND SPLITTING THEM WOULD HAVE MISSED BOTH ════════════════════════
 *
 * Владелец, дословно:
 *   E-7 — «в фабрик рендере в INPUT — FLATS OF THIS CARD убери CLOTH плейсхолдер давай эту все
 *          настройку сделаем в GENERATION — FABRIC RENDER»;
 *   E-8 — «в GENERATION — FABRIC RENDER сделай более интуитивный выбор текстуры и цвета с помощью
 *          импакбл во первых переименуй там FABRIC в texsture & color дай там возможность создать
 *          новую текстуру что или пикером выбрать из пиктограмок и нормальный пикер цвета».
 *
 * ЧТО БЫЛО НЕ ТАК — ЗАМЕР ПО ЭКРАНУ, А НЕ ВПЕЧАТЛЕНИЕ. Ткань карточки жила в ЧЕТЫРЁХ комнатах:
 *   1. ЗАВОДИЛАСЬ плейсхолдером `+ cloth` внутри ленты «input — flats of this card» — то есть
 *      среди ЧЕРТЕЖЕЙ, под заголовком, который называет чертежи;
 *   2. НАЗЫВАЛАСЬ на вкладке PATTERN, в блоке `patterns of this card`;
 *   3. ОТДАВАЛАСЬ колорвею там же, чипами носки;
 *   4. ВЫБИРАЛАСЬ для прогона здесь — ВЫПАДАЮЩИМ СПИСКОМ ИМЁН под одной плиткой.
 * Четыре места, один предмет. И четвёртое было хуже прочих: это единственная точка полосы, где
 * КАРТИНКУ выбирали по её ИМЕНИ. «cloth 3» и «cloth 4» — не ответ на вопрос «какая из них».
 *
 * ЧТО СТОИТ ТЕПЕРЬ — ДВЕ КОМНАТЫ ВМЕСТО ЧЕТЫРЁХ:
 *   · ЗДЕСЬ ткань ЗАВОДЯТ, ВЫБИРАЮТ и УБИРАЮТ с карточки, и здесь же красят прогон;
 *   · на PATTERN плитку ДЕЛАЮТ и ИМЕНУЮТ (E-15).
 * Комнаты 3 (носка колорвею) больше нет вовсе — E-1/E-16 сняли колорвей с обоих экранов, а E-15
 * прямо говорит, что `keep` не значит «стала текстурой рендера».
 *
 * ═══ ПОЧЕМУ ПИКТОГРАММЫ, А НЕ СПИСОК — ЭТО ГЛАВНОЕ РЕШЕНИЕ ЭКРАНА ═════════════════════════════
 *
 * Ткань опознают ГЛАЗОМ. Вся полоса DESIGN уже так и устроена: верстак, лента входа, выходы,
 * артефакты — везде картинку выбирают, ткнув в картинку. `Select` имён был здесь единственным
 * исключением, и он же был единственным местом, где человек обязан был помнить, что значит
 * «cloth 3». Сетка `Tiles` — то же самое, что он уже умеет, ровно тем же жестом.
 *
 * ⚠ ПОВЕРХНОСТЬ ВЫБИРАЕТ МЫШЬЮ, А ЧИП — ВСЕМ ОСТАЛЬНЫМ, И ЭТО НЕ ДВА ОРГАНА НА ОДНО ДЕЙСТВИЕ.
 * Тот же приём, что у самого примитива с зумом, и его довод дословно: «Поверхность остаётся
 * жестом мыши („ткнуть в картинку“), а именем, фокусом и объявлением владеет угловая кнопка».
 * Поверхность `PictureTile` — `tabIndex={-1} aria-hidden`, то есть клавиатуре и читалке экрана
 * её нет вовсе; выбор ткани, живущий ТОЛЬКО на ней, был бы органом не для всех (PRODUCT.md, WCAG
 * AA). Поэтому объявленный орган выбора — чип с ИМЕНЕМ ткани под кадром: он в табе, он называет
 * предмет вслух, и он же несёт состояние заливкой (DESIGN.md: выбранный чип заливается ink).
 *
 * ⚠ И СОСТОЯНИЕ НЕ НЕСЁТСЯ ОДНОЙ ЗАЛИВКОЙ. Выбранная ткань несёт ТРИ независимых носителя: чип
 * залит, кадр обведён 2px (`selected`), и на кадре стоит словесный ярлык «in this run». Правило
 * PRODUCT.md («state is never carried by colour alone») здесь не формальность: сетка монохромная,
 * и толстая рамка на миниатюре набивки читается плохо.
 *
 * ═══ ЧТО ПРИЕХАЛО СЮДА ИЗ ЛЕНТЫ ВХОДА, ПОИМЁННО (E-7) ════════════════════════════════════════
 *
 *   · дверь `+ texture` (`MediaSlot`: библиотека, ⌘V, бросок файла) — ВМЕСТЕ со своим потолком
 *     активов, его причиной словами и второй проверкой на подтверждении модалки;
 *   · дверь `make a pattern ▸` — вторая половина K-16 («или же оно должно предлагать сделать это
 *     как паттерн»);
 *   · `✕` на кадре — снятие ткани С КАРТОЧКИ, со своим вопросом и своей ценой (у паттерна она
 *     другая: сделать его заново — платный прогон);
 *   · имя `cloth N` для новой ткани.
 * Лента входа при этом стала тем, что написано на её заголовке: ЧЕРТЕЖИ.
 *
 * ⚠ ДВА ✕ ОДНОГО РЯДА ЗНАЧАТ РАЗНОЕ, И РАЗНИЦА НАЗВАНА У КАЖДОГО. `✕` НА КАДРЕ — «убрать ткань
 * с карточки» (запись карточки, необратимая). Снять ткань С ЭТОГО ПРОГОНА — повторное нажатие на
 * её чип, ровно как у всякого чипа полосы. Один глиф на два акта был бы худшим, что можно сделать
 * на выпущенной карточке.
 *
 * ПРОВОД НЕ ИЗМЕНИЛСЯ НИ ОДНИМ ПОЛЕМ. `params.colour = {fabrics, fabricMediaId, code, hex, words,
 * source}` собирается там же, где собирался (`render-studio.tsx`), из того же черновика, теми же
 * дверями (`draft.typed` / `draft.echo({from:'cloths'})`).
 *
 * ═══ ПОТОЛОК «ОДНА ТКАНЬ НА ПРОГОН» СНЯТ (круг 19, C2) ═══════════════════════════════════════
 *
 * ⚠ ОН БЫЛ ТОЛЬКО ЗДЕСЬ, И ЭТО ЗАМЕРЕНО, А НЕ ПРЕДПОЛОЖЕНО. `common.DesignColourRecipe.fabrics` —
 * `repeated` с первого дня; воркер прикладывает ПО КАРТИНКЕ НА ТКАНЬ при двух и более
 * (`snapshot.go`, `len(statedCloths) >= 2`), промпт печатает список тканей и клаузу «made of two
 * different cloths» (`renderprompt.go`), опись «what the model gets» перечисляет их из того же
 * поля, а строка денег склеивает их через ` + `. Единственным местом, где N сжималось в 1, была
 * эта сетка: `chosenId = fabrics[0].assetId` и `pick(id)`, заменявший список целиком.
 *
 * ЧТО ИЗ ЭТОГО СЛЕДУЕТ ДЛЯ ЭКРАНА:
 *   · выбор — МНОЖЕСТВО (`chosen`), нажатие — ПЕРЕКЛЮЧАТЕЛЬ, а не замена;
 *   · ПОРЯДОК ВЫБОРА — ЗНАЧЕНИЕ, А НЕ ОФОРМЛЕНИЕ. Промпт зовёт первую CLOTH 1, и скаляры цвета
 *     (`code`/`hex`) говорят про НЕЁ (`renderprompt.go`). Значит порядок обязан быть ВИДЕН —
 *     отсюда порядковый номер в углу кадра; переизбрание CLOTH 1 снимает её, и CLOTH 2 становится
 *     первой у всех на глазах;
 *   · `fabric_media_id` по-прежнему ПЕРВАЯ ФОТОГРАФИЯ СПИСКА (`echoOf`, ветка `cloths`) — правило
 *     не менялось, просто раньше список не бывал длиннее одной;
 *   · `parts` («какая ткань на какой детали») с этого экрана НЕ ПИШЕТСЯ и не будет: его авторит
 *     цветовая карта фичи A. Две ткани без `parts` — ЗАКОННОЕ состояние, и промпт говорит про него
 *     дословно: «the division is yours to make. Use every cloth on this list, and change cloth only
 *     on a seam, a panel edge or a finished edge the drawings actually show».
 *
 * ⚠ ПЛИТКА РИСУЕТ ТО, ЧТО УЕДЕТ, А НЕ СВОЙ ВЫБОР. Выбранные читаются из `draft.recipe.fabrics` —
 * того самого объекта, который читают ворота, строка денег и модалка «what the model gets».
 * Экран, у которого выбор хранится отдельно от посылки, однажды покажет одно, а купит другое.
 */

/**
 * ИМЯ НОВОЙ ТКАНИ. Приехало из ленты входа вместе с дверью (E-7) и не переписано ни на знак:
 * `taken` — ВЕСЬ ряд, ткани и паттерны вместе, потому что имя обязано быть уникально по тому, что
 * ВИДНО и что уезжает в промпт. Первое свободное, а не «сколько есть + 1»: после удаления второй
 * из трёх счётчик выдал бы занятое имя, и две разные ткани уехали бы в промпт под одним словом.
 */
function nextClothName(taken: common_DesignAsset[]): string {
  const names = new Set(taken.map((a) => (a.name ?? '').trim().toLowerCase()));
  for (let n = 1; n <= ASSETS_PER_CARD_MAX + 1; n += 1) {
    if (!names.has(`cloth ${n}`)) return `cloth ${n}`;
  }
  return `cloth ${taken.length + 1}`;
}

/** Пиктограмма — квадрат. Лоскут и набивка сами квадратные; портретная рамка резала бы их зря. */
const TEXTURE_ASPECT = '1/1';

/**
 * ═══ СЕТКА ТЕКСТУР ════════════════════════════════════════════════════════════════════════════
 *
 * Ширина дорожки 104px — та же, что у плит `also shown` в референсах, и по той же причине: это
 * наименьший кадр, на котором фактура ткани ещё различима, а раппорт набивки читается как раппорт.
 * Крупнее — и четыре ткани заняли бы экран; мельче — и сетка перестала бы отвечать на свой вопрос.
 */
function TextureGrid({
  band,
  techCardId,
  state,
  disabled,
  onMakePattern,
  armed,
  onAssign,
  assignedTo,
  trailing,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  state: ColourDraft;
  disabled?: boolean;
  onMakePattern?: () => void;
  /**
   * ═══ СЕТКА ВЗВЕДЕНА ПОКРАШЕННЫМ ЦВЕТОМ (фича A) ══════════════════════════════════════════════
   *
   * Пусто — сетка работает ровно как работала: тычок в плитку добавляет ткань в прогон и снимает
   * её. Непустой hex — тот же тычок НАЗНАЧАЕТ ткань этому цвету карты.
   *
   * ⚠ ОДНА СЕТКА НА ДВА ЖЕСТА, А НЕ ДВЕ СЕТКИ. Вторая решётка, выбирающая то же самое из той же
   * полки, была бы ложным расщеплением: у неё не оказалось бы ни двери `+ texture`, ни
   * `make a pattern`, ни потолка активов, ни удаления с карточки — и первое же расхождение человек
   * встретил бы вопросом «а почему тут нельзя завести ткань».
   */
  armed?: string;
  onAssign?: (assetId: number) => void;
  /** Какие покрашенные цвета носит эта ткань — ярлык плитки под покраской. */
  assignedTo?: Map<number, string[]>;
  /**
   * ═══ B-22 · ПОСЛЕДНЯЯ КЛЕТКА ЭТОЙ ЖЕ СЕТКИ ═══════════════════════════════════════════════════
   *
   * Владелец, круг 20, дословно: «GENERATION — FABRIC RENDER в TEXTURE & COLOUR плейсхолдеры
   * текстуры и цвета как-то разъехались поработай импакаблом что бы все выглядело в этой вкладке
   * нормально».
   *
   * ⚠ «РАЗЪЕХАЛИСЬ» БЫЛО НЕ ОФОРМЛЕНИЕМ, А АРИФМЕТИКОЙ, И ВОТ ОНА. Плитка цвета стояла СОСЕДОМ
   * сетки во флекс-ряду и держала `w-[104px]` — ровно ту меру, которую сетка объявляет своим
   * МИНИМУМОМ. Но дорожка здесь `minmax(104px, 1fr)`: минимум — это пол, а не размер. На поле
   * шириной 400px встают три дорожки по 128px, и квадрат текстуры выходит на 24px шире квадрата
   * цвета. Пропорция у обоих одна (`TEXTURE_ASPECT`), значит и ВЫШЕ на те же 24px — поэтому
   * подпись под цветом висела заметно выше чипов под тканями, а два пустых кадра (`+ texture` и
   * `+ colour`, то есть ровно «плейсхолдеры», которые владелец и назвал) стояли разного роста
   * бок о бок. Никакой класс на соседе этого не чинит: ширину дорожки знает только сам грид.
   *
   * ПОЭТОМУ ЦВЕТ ПЕРЕЕХАЛ В ГРИД, а не получил вторую подгонку числом. Одна сетка — одна дорожка
   * на всех: квадраты одной ширины и одной высоты ПО ПОСТРОЕНИЮ, при любой ширине окна и при
   * любом числе тканей, а `align: stretch` грида равняет и низы клеток. Это ровно то, чем этот
   * ряд себя объявляет с круга D-8: «текстура и цвет — ОДНОРОДНЫЕ предметы, квадрат, на который
   * можно посмотреть». Однородные предметы стоят в одной сетке.
   *
   * ⚠ ПРИХОДИТ УЗЛОМ, А НЕ ИМПОРТОМ. `ColourTile` читает черновик цвета и полку рецептов карточки
   * — знания, которых у сетки текстур нет и заводить которые ей незачем; собирает её `Palette`,
   * которая держит и то и другое. Сетка отвечает только за МЕСТО: последняя клетка, после двери
   * `+ texture`.
   */
  trailing?: React.ReactNode;
}): JSX.Element {
  const writes = useAssetWrites(techCardId);
  const { showMessage } = useSnackBarStore();
  const [pendingRemove, setPendingRemove] = useState<common_DesignAsset | null>(null);

  /* ОДНА ФУНКЦИЯ НА ЧИТАТЕЛЯ И ПИСАТЕЛЯ (Д-1): ровно та полка, которую наполняет дверь `+ texture`
     ниже, — ткани И паттерны. Порядок — паттерны первыми: владелец сказал «выбрать паттерн», и
     плитка набивки на этом экране главнее фотографии лоскута. */
  const shelf = useMemo(() => {
    const all = clothShelf(band);
    return [...all.filter(assetIsPattern), ...all.filter((a) => !assetIsPattern(a))];
  }, [band]);

  /**
   * ПОРЯДОК ВЫБРАННЫХ — ЭТО САМ СПИСОК `fabrics`, а не отдельное состояние рядом с ним. Второе
   * хранилище порядка разошлось бы с посылкой при первом же восстановлении рецепта из истории или
   * засеве колорвеем: экран показывал бы «1, 2», а уезжало бы «2, 1» — и скаляры цвета говорили бы
   * про другую ткань, чем та, что помечена первой.
   */
  const chosen = state.recipe.fabrics ?? [];
  /** Порядковый номер ткани в прогоне, 1-based; `0` — «в этом прогоне её нет». */
  const ordinalOf = (id: number) => chosen.findIndex((f) => (f.assetId ?? 0) === id) + 1;

  /**
   * ПОТОЛОК СЧИТАЕТСЯ ПО ВСЕЙ КАРТОЧКЕ — ОН ЗЕРКАЛО СЕРВЕРНОГО: `UpsertDesignAsset` отвергает
   * 41-й ассет карточки независимо от полки. Но ОТЧЁТ раздельный (Д-2): сколько мест держит эта
   * сетка и сколько — то, чего она не показывает; иначе человек читает «40 активов», не имея ни
   * одного способа освободить место и ни одного слова о том, чем оно занято.
   */
  const totalAssets = (band.assets ?? []).length;
  const unmanaged = useMemo(() => unmanagedAssets(band), [band]);
  const full = totalAssets >= ASSETS_PER_CARD_MAX;
  const fullReason =
    unmanaged.length === 0
      ? `the card is at its limit of ${ASSETS_PER_CARD_MAX} assets, all of them in this grid — remove one to make room`
      : shelf.length === 0
        ? `the card is at its limit of ${ASSETS_PER_CARD_MAX} assets, and every one of them is hardware from the removed ASSETS shelves — nothing on this screen can free a place, so this card cannot take a texture`
        : `the card is at its limit of ${ASSETS_PER_CARD_MAX} assets: ${shelf.length} in this grid and ${unmanaged.length} hardware from the removed ASSETS shelves, which no screen can remove any more — free a place by removing a texture here`;

  /**
   * ПЕРЕКЛЮЧАТЕЛЬ, А НЕ ЗАМЕНА (круг 19, C2). Раньше здесь стояло `fabrics: [эта одна]`, и потолок
   * «одна ткань на прогон» держался ровно этой строкой — на проводе его нет ни в одном поле.
   *
   * ДОБАВЛЕННАЯ ВСТАЁТ В КОНЕЦ, СНЯТАЯ ПРОСТО УХОДИТ, ОСТАЛЬНЫЕ НЕ ДВИГАЮТСЯ. Это и есть «порядок
   * выбора»: первая названная — CLOTH 1, про которую говорят скаляры цвета в промпте. Снятие
   * CLOTH 1 поднимает CLOTH 2 на её место — видимо, номерами в углах кадров, а не молча.
   *
   * ⚠ СПИСОК ПЕРЕСОБИРАЕТСЯ `fabricUses` ЦЕЛИКОМ, А НЕ СШИВАЕТСЯ ИЗ СТАРЫХ КОПИЙ. Замороженная
   * копия в черновике могла быть снята с полки до переименования или перекраски ассета; ткань,
   * попавшая в прогон под старым именем, — это промпт, ссылающийся на слово, которого на экране
   * уже нет. Один сборщик на весь список держит их всех одного возраста.
   */
  const pick = (id: number) => {
    if (id <= 0) return;
    /* ⚠ ВЗВЕДЁННЫЙ ЦВЕТ ПЕРЕХВАТЫВАЕТ ТЫЧОК ЦЕЛИКОМ, а не «ещё и добавляет ткань в прогон».
       Под покраской список тканей СОБИРАЕТСЯ ИЗ ПЛАНА (`planFabrics`), и добавленная сюда чипом
       ткань уехала бы без метки — то есть как «ещё одна ткань неизвестно на чём», ровно рядом с
       размеченными. Один жест — одно последствие. */
    if (armed && onAssign) {
      onAssign(id);
      return;
    }
    const ids = chosen.map((f) => f.assetId ?? 0).filter((v) => v > 0);
    const next = ids.includes(id) ? ids.filter((v) => v !== id) : [...ids, id];
    state.echo({ from: 'cloths', fabrics: next.length ? fabricUses(band, next) : [] });
  };

  return (
    <>
      <Tiles min={104}>
        {shelf.map((a) => {
          const id = a.id ?? 0;
          const name = assetLabel(a);
          const url = assetThumb(a);
          const n = ordinalOf(id);
          /* ⚠ ПОД ПОКРАСКОЙ «ВЫБРАНА» ЗНАЧИТ «НЕСЁТ ХОТЯ БЫ ОДИН ПОКРАШЕННЫЙ ЦВЕТ». Порядковый
             номер прогона там ничего не описывает: список тканей собирается из палитры, а не из
             очерёдности тычков, и нарисованная «1» на плитке была бы номером, которого никто не
             назначал. */
          const serves = assignedTo?.get(id) ?? [];
          const on = armed !== undefined && assignedTo ? serves.length > 0 : n > 0;
          const pattern = assetIsPattern(a);
          return (
            <div key={id} className='flex min-w-0 flex-col gap-1' data-texture={id}>
              <PictureTile
                url={url}
                alt={name}
                aspect={TEXTURE_ASPECT}
                /* `cover`, не `contain`: у лоскута и у плитки набивки края нет, и поля вокруг
                   показывали бы фактуру мельче, чем она есть. */
                fit='cover'
                selected={on}
                className='w-full bg-bgColor'
                /* ⚠ ЯРЛЫК — ТРЕТИЙ НОСИТЕЛЬ СОСТОЯНИЯ, а не украшение: заливка чипа и толщина
                   рамки — оба зрительные, и на миниатюре набивки рамка читается плохо.
                   ⚠ И ТЕПЕРЬ ОН НЕСЁТ ЕЩЁ ОДИН ФАКТ — ПОРЯДКОВЫЙ НОМЕР. Здесь стояло слово
                   «in this run», и при одной ткани оно говорило ВСЁ, что было правдой. При
                   нескольких (круг 19, C2) правды стало больше: промпт зовёт первую CLOTH 1 и
                   скаляры цвета относит К НЕЙ (`renderprompt.go`), то есть порядок — это ДЕНЬГИ,
                   а не оформление. Порядок, который нельзя увидеть, нельзя и исправить: человек
                   снял бы не ту ткань, чтобы поменять их местами. Номер — тот же носитель («есть
                   ярлык / нет ярлыка»), только говорящий вторую половину. */
                badge={
                  serves.length > 0 ? (
                    /* ПЛИТКА ГОВОРИТ, КАКИЕ ПОКРАШЕННЫЕ ЦВЕТА ОНА НОСИТ, — ОБРАЗЦАМИ, а не
                       числом: числу «2» на этой сетке уже назначен другой смысл (порядок в
                       прогоне), и одно место с двумя значениями — это ведро под двумя смыслами. */
                    <span className='flex items-center gap-0.5'>
                      {serves.map((hex) => (
                        <span
                          key={hex}
                          data-texture-serves={hex}
                          className='block h-2 w-2 border border-textColor'
                          style={{ background: hex }}
                        />
                      ))}
                    </span>
                  ) : on ? (
                    String(n)
                  ) : undefined
                }
                /* ПОВЕРХНОСТЬ ВЫБИРАЕТ — ЖЕСТОМ МЫШИ. Объявленный орган — чип ниже; довод целиком
                   в шапке файла. */
                onOpen={disabled ? undefined : () => pick(id)}
                gallery={
                  url
                    ? { src: assetFull(a) || url, thumbnail: url, type: 'image', alt: name }
                    : undefined
                }
                /* ⚠ `✕` ЗДЕСЬ — «УБРАТЬ ТКАНЬ С КАРТОЧКИ», а не «снять с этого прогона». Второе
                   делается повторным нажатием на чип. Приехало из ленты входа (E-7) вместе со
                   своим вопросом: убрать эту дверь было бы дешевле — и оставило бы единственного
                   писателя тканей БЕЗ отката, потому что снять ткань больше негде во всей админке. */
                onRemove={
                  disabled
                    ? undefined
                    : {
                        onClick: () => setPendingRemove(a),
                        ariaLabel: `remove ${name} from this card`,
                        title: pattern
                          ? 'remove this pattern from the card'
                          : 'remove this cloth from the card',
                      }
                }
              />
              {/* ОБЪЯВЛЕННЫЙ ОРГАН ВЫБОРА: имя ткани, в табе, с заливкой в состоянии. */}
              <Chip
                nonForm
                selected={on}
                pressed={on}
                disabled={disabled}
                data-texture-pick={id}
                title={
                  armed
                    ? `make ${name} the cloth of the parts painted ${armed}`
                    : serves.length > 0
                      ? `${name} is the cloth of ${serves.join(', ')} on the colour map — change it on that row below`
                      : on
                        ? `cloth ${n} of this run — press again to drop it. ${name} stays on the card`
                        : `add ${name} to this run as cloth ${chosen.length + 1}`
                }
                onClick={() => pick(id)}
              >
                <span className='block max-w-full truncate'>{name}</span>
              </Chip>
              {/* ВТОРАЯ СТРОКА ТОЛЬКО ТОГДА, КОГДА ЕЙ ЕСТЬ ЧТО СКАЗАТЬ. Род называется словом лишь
                  у паттерна: ткань — умолчание этой сетки, а на глаз лоскут от набивки не отличить.
                  Раппорт — настоящий факт, и он тоже не читается с картинки. */}
              {pattern && (
                <Text size='nano' variant='label' component='span' className='min-w-0 truncate'>
                  {['pattern', a.repeatMm ? `${a.repeatMm} mm` : ''].filter(Boolean).join(' · ')}
                </Text>
              )}
            </div>
          );
        })}

        {!disabled && (
          <div className='flex min-w-0 flex-col gap-1' data-texture-add={full ? 'inert' : 'live'}>
            {/* ═══ ДВЕРЬ НА ПОТОЛКЕ ГАСНЕТ, А НЕ ГЛОТАЕТ (Д-2) ═══════════════════════════════
                Здесь стоял живой `MediaSlot`, а отказ жил ПОСЛЕДНЕЙ строкой обработчика: человек
                проходил приёмную модалку целиком — превью, кроп, подтверждение — и не происходило
                НИЧЕГО, без единого слова. Теперь на потолке рисуется мёртвый кадр с причиной. */}
            {full ? (
              <span data-inert={fullReason} title={fullReason} className='block w-full'>
                <span
                  style={{ ...PLACEHOLDER_SURFACE, aspectRatio: TEXTURE_ASPECT }}
                  className={`${placeholderClass({ dashed: true })} w-full`}
                >
                  + texture
                </span>
              </span>
            ) : (
              <MediaSlot
                aspectRatio={['Custom']}
                frameAspect={TEXTURE_ASPECT}
                label='+ texture'
                hint={null}
                purpose='design · cloth texture of this tech card'
                showVideos={false}
                editMode
                onSelect={(media) => {
                  const first = media[0];
                  if (!first?.id) return;
                  /* ВТОРАЯ ПРОВЕРКА ПОТОЛКА, И ОНА ГОВОРИТ ВСЛУХ. Дверь погашена по полосе,
                     прочитанной ЭТИМ рендером, а между её отрисовкой и подтверждением модалки
                     стоит целая прогулка человека: соседняя вкладка успевает добрать потолок. */
                  if (totalAssets >= ASSETS_PER_CARD_MAX) {
                    showMessage(fullReason, 'error');
                    return;
                  }
                  writes.upsertAsset.mutate({
                    // `assetId: 0` заводит. Род — УТВЕРЖДЕНИЕ этой двери: она стоит под подписью
                    // TEXTURE, значит через неё приходит ткань. По пикселям это не восстановимо.
                    assetId: 0,
                    kind: ASSET_FABRIC,
                    name: nextClothName(shelf),
                    mediaId: first.id,
                  });
                }}
              />
            )}
            <Text size='nano' variant='label' component='span' className='normal-case'>
              {full
                ? unmanaged.length === 0
                  ? `${ASSETS_PER_CARD_MAX} of ${ASSETS_PER_CARD_MAX} — remove one`
                  : `${ASSETS_PER_CARD_MAX} of ${ASSETS_PER_CARD_MAX} — ${shelf.length} here, ${unmanaged.length} hardware`
                : '⌘V · drop · browse'}
            </Text>
            {/* ═══ ВТОРАЯ ДВЕРЬ (K-16) ═══════════════════════════════════════════════════════
                Дословно владелец: «на плейсхолдере фабрик можно выбрать из библиотеки или же оно
                должно предлагать сделать это как паттерн». Две двери, «или же», на одной ячейке.
                Она НЕ гаснет на потолке активов: сделать плитку можно всегда, упрётся только
                дверь `keep` на PATTERN, и упрётся своими словами. */}
            {onMakePattern && (
              /* ⚠ `w-full` НЕСУЩИЙ, А НЕ УБОРКА. `<button>` внутри дорожки грида меряется ПО
                 СОДЕРЖИМОМУ и вылезает за её 104px, ложась на соседнюю плитку; ровно этот дефект
                 однажды уже был оплачен в `Tiles`. Ширину задаёт дорожка, а не подпись. */
              <Button
                variant='secondary'
                size='xs'
                className='w-full'
                onClick={onMakePattern}
                title='go to STUDIO → PATTERN: one picture in, a seamless repeating tile out. It comes back into this grid once it is named'
              >
                make a pattern ▸
              </Button>
            )}
          </div>
        )}

        {/* B-22 · ПЛИТКА ЦВЕТА — ПОСЛЕДНЯЯ КЛЕТКА ЭТОЙ ЖЕ СЕТКИ. Довод целиком у пропа `trailing`
            выше; короткая версия: одна дорожка на всех — единственный способ, которым квадрат
            цвета и квадрат ткани гарантированно одного роста. Стоит ПОСЛЕ двери `+ texture`,
            поэтому на пустой карточке два пустых кадра — `+ texture` и `+ colour` — оказываются
            соседями и читаются как пара, чем они и являются («a texture, a colour, or both»). */}
        {trailing}
      </Tiles>

      {/* ═══ ПРОСТЫНЯ ПУСТОЙ ПОЛКИ СНЯТА (F-19) ══════════════════════════════════════════════
          Владелец, дословно: «убери текст». Абзац говорил ТРИ вещи, и каждая уже сказана органом,
          который стоит ближе к делу, — поэтому снятие ничему не стоило смысла:
            · «принеси фотографию ткани через + texture» — сама дверь `+ texture` и стоит справа,
              с подписью «⌘V · drop · browse» под ней; текст пересказывал кнопку, на которую
              человек в этот момент смотрит;
            · «или сделай плитку на STUDIO → PATTERN» — вторая дверь, `make a pattern ▸`, стоит
              там же и уводит туда же (её `title` называет и что оттуда вернётся);
            · «прогон без текстуры законен» — единственный факт абзаца, которого не видно из
              кнопок, и он сказан на этом же экране ТРИЖДЫ помимо него: вопросом секции («the
              cloth: a texture, a colour, or both») и рядом CLOTH IS, который на пустой полке
              прямо говорит «No texture picture rides on this run, so these words govern the
              cloth». (Третьим носителем была оговорка этой группы; круг 19 снял её вместе с
              потолком «одна текстура на прогон», который она объявляла.)
              А в момент, когда это знание нужно по-настоящему — палец над GENERATE, — его говорят
              сами ворота: `recipeIsStated` отказывает словами «pick a cloth, pick a colour, say
              what the cloth is, or describe it in words above. Any one of them is enough».
          ЧТО ОСТАЛОСЬ, И ТОЛЬКО ДЛЯ ОДНОГО СЛУЧАЯ. На карточке ТОЛЬКО ДЛЯ ЧТЕНИЯ обеих дверей
          нет вовсе (`!disabled` выше), и без единой строки сетка стала бы пустым местом без
          подписи — «ткани нет» и «блок не загрузился» выглядели бы одинаково. Это признание
          пустоты, а не урок: одна короткая строка вместо четырёх (DESIGN.md — «render `—` for
          missing data»). */}
      {shelf.length === 0 && disabled && (
        <Text size='micro' variant='label' component='p' data-texture-empty className='normal-case'>
          No texture on this card.
        </Text>
      )}

      {/* ПРИЧИНА ПОТОЛКА — ВИДИМОЙ СТРОКОЙ, А НЕ ТОЛЬКО ПОДСКАЗКОЙ: подсказка требует НАВЕСТИ на
          кадр, а человек, у которого дверь погасла, смотрит на неё и уходит. */}
      {full && (
        <Text size='micro' variant='label' component='p' className='normal-case'>
          {fullReason}.
        </Text>
      )}

      <ConfirmationModal
        open={!!pendingRemove}
        onOpenChange={(open) => !open && setPendingRemove(null)}
        title={`remove ${pendingRemove ? assetLabel(pendingRemove) : 'this texture'}?`}
        confirmLabel='remove'
        onConfirm={() => {
          const id = pendingRemove?.id ?? 0;
          if (id > 0) writes.deleteAsset.mutate(id);
          setPendingRemove(null);
        }}
      >
        <div className='flex flex-col gap-2'>
          {/* УДАЛЕНИЕ ПАТТЕРНА ДОРОЖЕ УДАЛЕНИЯ ТКАНИ, И ЭТО НАДО СКАЗАТЬ ДО «ok». Ткань заводится
              этой же дверью заново из той же картинки; плитку надо СГЕНЕРИРОВАТЬ заново, и это
              стоит денег. Одинаковый вопрос на два разных по цене жеста учил бы нажимать не глядя. */}
          {assetIsPattern(pendingRemove ?? undefined) && (
            <Text size='control'>
              This one is a <b>pattern</b>: making it again is a paid run on STUDIO → PATTERN.
            </Text>
          )}
          <Text size='control'>
            The picture file stays in the library. Runs already made keep their own frozen copy of
            this cloth, so their history stays readable.
          </Text>
        </div>
      </ConfirmationModal>
    </>
  );
}

/**
 * ═══ ЦВЕТ — ТА ЖЕ ПИКТОГРАММА, ТОЛЬКО ЗАМЕШАННАЯ РУКАМИ ═══════════════════════════════════════
 *
 * ПОСЛЕДНЯЯ КЛЕТКА СЕТКИ ТЕКСТУР (B-22), а не сосед рядом с ней: на этом ряду текстура и цвет —
 * ОДНОРОДНЫЕ предметы («квадрат, на который можно посмотреть»), и это ровно то, чем они являются
 * для промпта. Однородные предметы стоят в одной сетке — тогда их квадраты одного роста ПО
 * ПОСТРОЕНИЮ, а не по совпадению двух чисел, которое и разъехалось. Незакрашиваемое значение —
 * ПОЛОСАТОЕ, никогда не чёрное и не белое: квадрат, закрасивший неизвестный цвет, врёт так, что
 * глаз верит целиком.
 *
 * ПИКЕР ТОТ ЖЕ САМЫЙ (`assets/colour-picker`) — квадрат насыщенности, полоса тона, поле hex,
 * пипетка там, где браузер её даёт, и плашки рецептов, которыми ЭТА карточка уже печаталась.
 * «Нормальный пикер цвета» из E-8 — это он, и второго здесь не заводится: два органа на один
 * предмет расходятся первой же правкой.
 *
 * ИМЯ ЦВЕТА — ВТОРАЯ ПОЛОВИНА ОДНОГО ЗАЯВЛЕНИЯ, а не отдельная настройка: промпт цитирует их
 * ПАРОЙ («colourway dusty rose — the exact value is #a41f22»), поэтому поле стоит в той же
 * колонке, под своей плиткой. Поля hex здесь НЕТ намеренно: оно живёт внутри пикера, и второй
 * вход одной величины на одном экране — тот самый дефект, который уже стоил купленного прогона.
 */
function ColourTile({
  band,
  state,
  disabled,
}: {
  band: GetDesignBandResponse;
  state: ColourDraft;
  disabled?: boolean;
}): JSX.Element {
  const recipe = state.recipe;
  const stated = fabricStatement(recipe);
  const paintable = hexIsPaintable(recipe.hex);

  const recent = useMemo(
    () =>
      (band.colourRecipes ?? [])
        .map((r) => ({ hex: (r.hex ?? '').trim(), code: (r.code ?? '').trim() }))
        .filter((r) => hexIsPaintable(r.hex)),
    [band.colourRecipes],
  );

  return (
    <div
      data-fabric-tile='colour'
      data-tile-state={stated.colour ? 'filled' : 'empty'}
      /* ⚠ B-22 · НИ `w-[104px]`, НИ `shrink-0` — И ЭТО НЕ УБОРКА КЛАССОВ. Плитка теперь клетка
         сетки текстур, а не сосед сетки: ширину ей задаёт ДОРОЖКА (`minmax(104px, 1fr)`), и
         своё число здесь снова развело бы её с квадратами ткани ровно на разницу между полом
         дорожки и её настоящим размером — тот самый дефект, на который жаловался владелец.
         `min-w-0` обязателен: у грид-элемента `min-width:auto`, а внутри есть обрезаемая строка,
         min-content которой — всё значение целиком; без него плитка вылезла бы на соседнюю. */
      className='flex min-w-0 flex-col gap-1'
    >
      <ColourPicker
        hex={recipe.hex ?? ''}
        disabled={disabled}
        recent={recent}
        label='pick the colour of this run'
        /* ⚠ ПИКЕР — ТИПОВАННЫЙ ВХОД, А НЕ ЭХО. Человек, открывший его и выбравший значение, сделал
           ОСОЗНАННОЕ заявление; это ранг 2 порядка старшинства, и он обязан пережить последующий
           выбор ткани. «Производное» — то, что приезжает САМО, а не то, во что ткнули пальцем. */
        onPick={(hex) => state.typed({ hex })}
        /* Прошлый рецепт возвращается ЦЕЛИКОМ — значение и имя: плашка обещает пару, которая на
           карточке была, и вернуть половину значило бы собрать пару, которой не было никогда. */
        onPickRecent={(hex, code) => state.typed({ hex, code })}
        face={
          paintable ? (
            <span
              data-colour-swatch
              aria-hidden='true'
              className='block w-full border border-textColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
              style={{ aspectRatio: TEXTURE_ASPECT, background: (recipe.hex ?? '').trim() }}
            />
          ) : (
            <span
              data-colour-swatch
              style={{ ...PLACEHOLDER_SURFACE, aspectRatio: TEXTURE_ASPECT }}
              className={`${placeholderClass({ dashed: true })} w-full`}
            >
              + colour
            </span>
          )
        }
      />

      <Input
        name='design-colour-name'
        data-colour-name
        /* ПОДПИСЬ ДЛЯ СКРИНРИДЕРА: `<label for>` в этой колонке нет, а соседнее поле «in words»
           звучало бы так же — «edit text». */
        aria-label='colour name'
        maxLength={COLOUR_NAME_MAX}
        value={recipe.code ?? ''}
        disabled={disabled}
        placeholder='dusty rose'
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => state.typed({ code: e.target.value })}
      />

      <div className='flex min-w-0 flex-wrap items-center gap-1'>
        <Text size='nano' variant='label' component='span' className='min-w-0 break-words'>
          {paintable ? (recipe.hex ?? '').trim() : stated.colour ? 'named, no value' : 'optional'}
        </Text>
        {!disabled && stated.colour && (
          <Button variant='secondary' size='xs' onClick={() => state.clear('colour')}>
            clear
          </Button>
        )}
      </div>
    </div>
  );
}

export function Palette({
  disabled,
  /** Supplied by `RenderStudio`, so the palette and the studio's gate read one draft. */
  draft,
  colourPlan,
  band,
  techCardId,
  onMakePattern,
}: {
  band: GetDesignBandResponse;
  /**
   * ⚠ ОБЯЗАТЕЛЕН, И ЭТО ПОЧИНКА МЁРТВОГО ПИСАТЕЛЯ, А НЕ УЖЕСТОЧЕНИЕ РАДИ СТРОГОСТИ. Проп был
   * необязательным, а рядом безусловно звался `useColourDraft` — ЦЕЛЫЙ ВТОРОЙ ЧЕРНОВИК, который
   * выбрасывался всегда. Мёртвый он был не весь: смонтируй кто-нибудь `Palette` без пропа, и ряд
   * CLOTH IS писал бы в `own.cloth`, которого не композирует НИКТО, — «сохранено, но не поехало».
   * Состояние подаёт студия; ворота и палитра обязаны читать ОДИН черновик.
   */
  draft: ColourDraft;
  /**
   * ⚠ ПЛАН ПОДАЁТСЯ СВЕРХУ ПО ТОМУ ЖЕ ДОВОДУ, ЧТО И ЧЕРНОВИК, И ЭТО НЕ СИММЕТРИЯ РАДИ КРАСОТЫ.
   * `useColourPlan` держит ЭХО последней записи — ревизию, которую полоса ещё не догнала. Позови
   * его здесь вторым разом, и у экрана оказалось бы ДВА документа с разными ревизиями: ворота
   * студии считали бы по вчерашнему, а эта ведомость сохраняла бы под сегодняшним — то есть
   * первый же CAS отказал бы сам себе.
   */
  colourPlan: ColourPlanWrites;
  /** Полка ткани теперь ЗАПИСЫВАЕТСЯ здесь (E-7), и записи адресуются карточкой. */
  techCardId: number;
  /** K-16: уход на вкладку PATTERN со второй двери. Не задан — двери нет вовсе. */
  onMakePattern?: () => void;
  disabled?: boolean;
}): JSX.Element {
  const state = draft;
  const recipe = state.recipe;
  const stated = fabricStatement(recipe);
  /** ЖИВАЯ КОМПОЗИЦИЯ — ТА ЖЕ ФУНКЦИЯ, ЧТО УЕДЕТ НА ПРОВОД. Второе написание склейки обещало бы
   *  человеку одно, а покупало бы другое; поэтому подпись читает `statedWords`, а не собирается. */
  const willSay = statedWords(state);
  const clothAbove = stated.photo;
  const colourAbove = !stated.photo && stated.colour;

  /* ═══ ЦВЕТОВОЙ ПЛАН (фича A). `plan === undefined` — сервер про него не говорит вовсе, и тогда
     на экране нет ни двери, ни ряда: клиент новее сервера отправил бы прогон, у которого protojson
     молча выбросил бы карты и метки, — то есть купил бы картинку по вопросу, которого никто не
     задавал. Та же доктрина, что у `has_fabric_render`. */
  const plan = colourPlan;
  /** Взведённый покрашенный цвет. Читают двое — ведомость и сетка, — поэтому хранится ОДИН раз. */
  const [armed, setArmed] = useState('');
  /** Вид, который сейчас красят. Дверей две (кнопка заголовка и плитка вида), переменная одна. */
  const [painting, setPainting] = useState('');

  /** Какие покрашенные цвета носит каждая ткань — ярлык плиток и подсказки сетки. */
  const assignedTo = useMemo(() => {
    const by = new Map<number, string[]>();
    for (const c of plan.plan?.cloths ?? []) {
      if (c.assetId <= 0) continue;
      by.set(c.assetId, [...(by.get(c.assetId) ?? []), c.hex]);
    }
    return by;
  }, [plan.plan]);

  const painted = (plan.plan?.maps.length ?? 0) > 0;
  const firstSide = useMemo(() => benchSides(band).find((s) => !!s.picture)?.view ?? '', [band]);

  return (
    <div>
      {/* ═══ ОДНА ГРУППА НА ДВА ОДНОРОДНЫХ ПРЕДМЕТА (E-8) ════════════════════════════════════
          `GroupLabel` — вес «под-группа» лестницы DESIGN.md (1px `#cccccc`), на ступень выше
          рулёных рядов ниже (`#e6e6e6`). Это верный вес: текстура с цветом теперь самая крупная
          вещь блока, а `cloth is` и `in words` — её свойства. Второй белой коробки при этом не
          заводится: блок в блоке запрещён, и группа рисуется ЛИНИЕЙ, а не рамкой. */}
      {/* ⚠ ЯКОРЯ `data-*` НА `GroupLabel` НЕТ И БЫТЬ НЕ МОЖЕТ: примитив принимает ЗАКРЫТЫЙ список
          пропов и лишние молча выбрасывает — атрибут не доехал бы до DOM, а проба на нём была бы
          ВАКУУМНО ЗЕЛЁНОЙ. Заголовок группы проверяется текстом; коробку объявляет ряд ниже
          (`data-fabric-pair`) и сама секция (`id='design-fabric-menu'`). */}
      {/* ═══ ОГОВОРКА ГРУППЫ СНЯТА ВМЕСТЕ С ПОТОЛКОМ, КОТОРЫЙ ОНА ОБЪЯВЛЯЛА (круг 19, C2) ══════
          Здесь стояло «a texture, a colour, or both — one texture per run». Вторая половина
          («one texture per run») перестала быть правдой в тот же коммит, которым сетка научилась
          выбирать N, — и оставить её значило бы напечатать на экране запрет, которого нет.
          ПЕРВАЯ ПОЛОВИНА СНЯТА ВМЕСТЕ С НЕЙ, А НЕ ОСТАВЛЕНА ОБРЕЗКОМ: «a texture, a colour, or
          both» — ДОСЛОВНО вопрос секции строкой выше («the cloth: a texture, a colour, or both»),
          то есть повтор в двух сантиметрах от оригинала. А в момент, когда это знание нужно
          по-настоящему — палец над GENERATE, — его говорят сами ворота: «pick a cloth, pick a
          colour, say what the cloth is, or describe it in words above. Any one of them is enough,
          and they may be combined». */}
      {/* ⚠ ОДНА КНОПКА НА ВСЮ ФИЧУ, И СТОИТ ОНА В СЛОТЕ ДЕЙСТВИЯ ЗАГОЛОВКА — там, где до круга 19
          жила снятая оговорка группы. Больше дверей покраски на этом экране НЕТ: у каждого вида
          есть своя `paint` на плитке ниже, но она появляется только когда ряд уже есть. Дверь
          гаснет вместе с планом: сервер, не знающий глагола, обязан быть назван словами, а не
          показан живой кнопкой, которая молча ничего не сделает. */}
      <GroupLabel
        flush
        action={
          !disabled && plan.plan && firstSide && !painted ? (
            <Button
              variant='secondary'
              size='xs'
              data-paint-parts=''
              onClick={() => setPainting(firstSide)}
              title='flood the drawing part by part in flat colours; each colour then picks its own cloth below'
            >
              paint the parts ▸
            </Button>
          ) : undefined
        }
      >
        texture &amp; colour
      </GroupLabel>

      {/* ═══ ТЕКСТУРА И ЦВЕТ — ОДНОЙ СТРОКОЙ (D-8) ═══════════════════════════════════════════
          Владелец, дословно: «GENERATION — FABRIC RENDER TEXTURE и COLOUR пусть будут в одной
          строке а не в одном столбце».
          Это не только компактнее — это ЧЕСТНЕЕ. Два ряда друг под другом читаются как две
          последовательные ступени («сначала ткань, потом цвет»), а они РАВНОПРАВНЫ: подпись
          группы прямо говорит «a texture, a colour, or both».
          ⚠ КРУГ 20, B-22 — «В ОДНОЙ СТРОКЕ» СТАЛО «В ОДНОЙ СЕТКЕ». Здесь стоял флекс-ряд: сетка
          текстур слева, плитка цвета справа со своим `w-[104px]`. Ширина 104px объявлялась «той
          же мерой, что минимальная колонка сетки» — и это была ошибка на одно слово: у сетки 104
          это МИНИМУМ дорожки (`minmax(104px, 1fr)`), а не её размер, так что квадраты ткани
          выходили шире квадрата цвета, а вместе с шириной расходилась и высота. Флекс-обёртка
          снята целиком, плитка цвета уехала последней клеткой внутрь `TextureGrid` (довод — у
          пропа `trailing` там же), и равенство теперь держит грид, а не совпадение двух чисел.
          ⚠ ПОДПИСЬ РЯДА — `texture`, А НЕ «texture & colour»: заголовок группы строкой выше уже
          сказал это ровно теми же словами, и повторить их в левой колонке значило бы напечатать
          одно и то же дважды подряд. Плитка цвета называет себя сама — дверью `+ colour` и полем
          имени цвета под ней. */}
      <FieldRow label='texture' data-fabric-pair className='items-start'>
        <div className='min-w-0 flex-1'>
          <TextureGrid
            band={band}
            techCardId={techCardId}
            state={state}
            disabled={disabled}
            onMakePattern={onMakePattern}
            trailing={<ColourTile band={band} state={state} disabled={disabled} />}
            /* ⚠ СЕТКА ПЕРЕХОДИТ НА ЯЗЫК ПОКРАСКИ ТОЛЬКО КОГДА КАРТЫ ЕСТЬ, и это не осторожность.
               `assignedTo` заданный, но пустой, переопределяет ВЫБРАННОСТЬ плиток на «носит ли
               она покрашенный цвет» — то есть на карточке с пустым планом обесцветил бы каждый
               выбранный чип, ничего не сказав. Пустой план — это «не красили», и сетка обязана
               в нём работать ровно как вчера. */
            armed={painted ? armed : undefined}
            assignedTo={painted ? assignedTo : undefined}
            onAssign={(assetId) => {
              const doc = plan.plan;
              if (!doc || !armed) return;
              const prev = doc.cloths.find((c) => c.hex === armed);
              /* ПОВТОРНЫЙ ТЫЧОК В ТУ ЖЕ ПЛИТКУ СНИМАЕТ ТКАНЬ — тот же жест, что у чипов полосы,
                 и единственный способ передумать, не выбирая «никакую» из списка, которого нет. */
              const next = prev?.assetId === assetId ? 0 : assetId;
              void plan.save({
                maps: doc.maps,
                cloths: [
                  ...doc.cloths.filter((c) => c.hex !== armed),
                  ...(next > 0 || prev?.colourHex || prev?.words
                    ? [
                        {
                          hex: armed,
                          assetId: next,
                          colourHex: prev?.colourHex ?? '',
                          words: prev?.words ?? '',
                          parts: prev?.parts ?? '',
                        },
                      ]
                    : []),
                ],
              });
              setArmed('');
            }}
          />
        </div>
        {/* ⚠ ЗДЕСЬ СТОЯЛА ОБЩАЯ СТРОКА ПОРЯДКА СТАРШИНСТВА (`fabricAuthority`), И ОНА СНЯТА С
            ЭКРАНА — E-2. Она говорила ПРАВИЛО («the photo states the material · the picked colour
            overrides the photo’s colour · the words state what neither of them states»), а тремя
            рядами ниже то же самое говорилось ВТОРОЙ раз, применительно к этому прогону. Владелец
            жаловался ровно на невидимость этого утверждения — и невидимо оно было потому, что было
            размазано на три тихие копии. Осталась ОДНА, у чипов прозрачности, там, где принимают
            отменяемое ею решение.

            ⚠ ФУНКЦИЯ ЖИВА И ПРОДОЛЖАЕТ ПИТАТЬ ВТОРУЮ ПОВЕРХНОСТЬ — модалку «what the model gets»,
            где опись читают целиком. Гарантия «одна поверхность не разойдётся с другой» при этом
            не потеряна и держится тем же, чем держалась: ОБЕ читают `clothWordsRank`. Проба
            сверяет `data-words-rank` экрана с `data-fabric-authority` модалки. */}
      </FieldRow>

      {/* ═══ PARTS — ПОКРАШЕННЫЕ ЦВЕТА И ТКАНЬ КАЖДОГО (фича A) ══════════════════════════════
          Стоит ПОД сеткой, потому что читается сверху вниз как работа: вот полка тканей → вот
          виды, которые я покрасил → вот что каждый цвет значит. И ряд рисуется только когда
          сервер про план говорит: иначе экран предлагал бы разметку, которую провод молча
          выбросит. */}
      {plan.plan && (painted || painting) && (
        <PartsRow
          band={band}
          techCardId={techCardId}
          plan={plan.plan}
          writes={plan}
          armed={armed}
          onArm={setArmed}
          painting={painting}
          onPaint={setPainting}
          disabled={disabled}
        />
      )}

      {/* ── WHAT THE CLOTH IS — H-13. Свойство ТОЙ ЖЕ ткани, что в сетке, и уезжает в то же поле
          провода, что слова ниже. ⚠ РЯД ЗНАЕТ ПРО ФОТОГРАФИЮ (E-2): именно у него стоит теперь
          единственная строка о том, кто кого перебивает. */}
      <ClothIsRow draft={state} disabled={disabled} />

      {/* ── THE WORDS — the lowest rank, and a legal statement entirely on its own. */}
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
        {/* ⚠ ЗДЕСЬ СТОЯЛА ТРЕТЬЯ КОПИЯ ОДНОГО УТВЕРЖДЕНИЯ О СТАРШИНСТВЕ (E-2). Владелец про него:
            «этого не видно» — и он был прав дважды: сказано было тихо И в трёх местах сразу
            (подсказка этого ряда, абзац под плитками, ряд `cloth is` молчал). Три тихих экземпляра
            складываются не в громкость, а в шум. Утверждение переехало ЦЕЛИКОМ и ровно одно — к
            чипам прозрачности, то есть туда, где принимают решение, которое оно отменяет. Здесь
            осталось то, чего не говорит никто другой: как это поле склеивается с соседним. */}
        <Hint>free text; it is joined to the opacity and the weight above into one sentence</Hint>
      </FieldRow>

      {/* ═══ ОДНА ЖИВАЯ ПОДПИСЬ — ЧТО ИМЕННО УЕДЕТ СЛОВАМИ ═══════════════════════════════════════
          Не «предпросмотр» и не украшение: два контрола выше пишут ОДНО поле провода, и порядок
          клауз в нём человек иначе не увидит до самой картинки. Строка показывает результат ДО
          денег теми же словами, что и модалка «what the model gets», потому что читает ту же
          функцию. Пустая композиция — законный ответ, и он тоже назван вслух. */}
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
              ? 'nothing added — legal; the texture above already states the material'
              : colourAbove
                ? 'nothing added — only a colour is stated above, so the material is left to the model'
                : 'nothing added — and nothing above states the cloth yet either'}
        </Text>
      </div>
    </div>
  );
}
