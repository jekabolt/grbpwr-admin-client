import type {
  GetDesignBandResponse,
  common_DesignAsset,
  common_MediaFull,
} from 'api/proto-http/admin';
import { MediaSelector } from 'components/managers/media/components/media-selector';
import { MediaSlot } from 'components/managers/media/components/media-slot';
import { useSnackBarStore } from 'lib/stores/store';
import { useId, useMemo, useRef, useState, type JSX } from 'react';
import { Button } from 'ui/components/button';
import { FoldCaret } from 'ui/components/fold-caret';
import { Chip } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { GroupLabel } from 'ui/components/group-label';
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
import { useAssetWrites } from '../assets/use-assets';
import { InertDoor } from '../bench-slot';
import { GROUP_GAP } from '../core';
import { CornerLabel } from '../pattern/organs';
import type { ClothSlot } from '../pattern/slot-fabrics';
import { PictureTile } from '../picture-tile';
import { useRenderWordsFollow, useWordsSeeding } from '../use-words-seeding';
import { WordsField } from '../words-field';
import { omittedOf, useScreenWordsDropped, useWordsSeed } from '../words-seed';
import { boundClothsOf, type BoundCloth, type ColourDraft } from './drafts';
import { hexIsPaintable, statedWords } from './model';

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
 *   · удаление ткани С КАРТОЧКИ — строка `delete…` меню `more ▾` на кадре (TF2), со своим
 *     вопросом и своей ценой (у паттерна она другая: сделать его заново — платный прогон);
 *   · имя `cloth N` для новой ткани.
 * Лента входа при этом стала тем, что написано на её заголовке: ЧЕРТЕЖИ.
 *
 * ⚠ УДАЛИТЬ И СНЯТЬ — ДВА РАЗНЫХ ОРГАНА. Удалить ткань с карточки (запись карточки, необратимая)
 * — красная строка меню с вопросом; снять ткань С ЭТОГО ПРОГОНА — повторное нажатие на её чип,
 * ровно как у всякого чипа полосы. `✕` на этой сетке не удаляет ничего (TF2): один глиф на два
 * акта был бы худшим, что можно сделать на выпущенной карточке.
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
 *     ⚠ STEP 3 — ОДНО ИСКЛЮЧЕНИЕ, И ОНО НЕ ПИШЕТСЯ ЭКРАНОМ, А ПРИЕЗЖАЕТ: ткань, надетая на слот
 *     колорвея на шаге PATTERN, засевается с `parts` = слот (`useColourDraft`), и сетка это слово
 *     при переключении чипов СОХРАНЯЕТ (`pick`). Новых частей экран по-прежнему не сочиняет.
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
 * ПОТОЛОК АКТИВОВ — ОДНА ФУНКЦИЯ НА ВСЕХ, КТО ЕГО НАЗЫВАЕТ (r3 п.22).
 *
 * Считается по ВСЕЙ карточке — он зеркало серверного: `UpsertDesignAsset` отвергает 121-й актив
 * независимо от полки (`ASSETS_PER_CARD_MAX`, было 40 до STEP 3). Но ОТЧЁТ раздельный (Д-2):
 * сколько мест держит эта сетка и сколько — то, чего она не показывает; иначе человек читает
 * «120 активов», не имея ни одного способа освободить место и ни одного слова о том, чем оно занято.
 *
 * ⚠ ФУНКЦИЯ, А НЕ ТРИ КОПИИ СТРОКИ. Дверь ткани переехала в ДВА места (пустая полка — квадрат в
 * сетке, непустая — тихая дверь в заголовке группы), и повод отказа обязан быть у них дословно
 * один: разошедшись, они объявили бы человеку два разных потолка на одной карточке.
 */
function clothCeiling(
  band: GetDesignBandResponse,
  shelf: common_DesignAsset[],
): { full: boolean; reason: string } {
  const totalAssets = (band.assets ?? []).length;
  const unmanaged = unmanagedAssets(band);
  const full = totalAssets >= ASSETS_PER_CARD_MAX;
  const reason =
    unmanaged.length === 0
      ? `the card is at its limit of ${ASSETS_PER_CARD_MAX} assets, all of them in this grid — remove one to make room`
      : shelf.length === 0
        ? `the card is at its limit of ${ASSETS_PER_CARD_MAX} assets, and every one of them is hardware from the removed ASSETS shelves — nothing on this screen can free a place, so this card cannot take a texture`
        : `the card is at its limit of ${ASSETS_PER_CARD_MAX} assets: ${shelf.length} in this grid and ${unmanaged.length} hardware from the removed ASSETS shelves, which no screen can remove any more — free a place by removing a texture here`;
  return { full, reason };
}

/**
 * ═══ ОДНА ДВЕРЬ ТКАНИ, ДВА МЕСТА, И ЭТО НЕ ДВЕ КНОПКИ ЗА ОДНО (r3 п.21/22) ════════════════════
 *
 * Владелец, дословно: «огромная кнопка MAKE A PATTERN ▸ не нужна; при выбранном паттерне
 * плейсхолдер «+ CLOTH» остаётся — зачем» и «убери текст ⌘V · drop · browse».
 *
 * ЧТО БЫЛО. В сетке стояла КОЛОНКА ИЗ ТРЁХ ОРГАНОВ: полосатый квадрат `+ cloth`, под ним строка
 * жестов «⌘V · drop · browse», под ней кнопка `make a pattern ▸` во всю ширину дорожки. Три вещи
 * на одну задачу, и все три стояли на карточке, где ткань уже выбрана, — то есть между выбранной
 * тканью и квадратом цвета вклинивался пустой кадр, который в этот момент никому не нужен.
 *
 * ЧТО СТАЛО, И ПОЧЕМУ ИМЕННО ТАК:
 *   · СТРОКА ЖЕСТОВ СНЯТА. Она пересказывала кнопку, на которую человек смотрит, а сами жесты
 *     (⌘V, бросок файла) продолжают работать — их держит `MediaSlot`, а не эта подпись.
 *   · КНОПКА `make a pattern ▸` СНЯТА КАК КНОПКА и вернулась ДВЕРЬЮ ВНУТРИ ПУСТОЙ РАМКИ (`doors`
 *     примитива, приём J-7): «огромной» её делал именно отдельный ряд под квадратом. Внутри рамки
 *     она перестаёт спорить с квадратом за внимание и остаётся ровно там, где о ней спрашивают, —
 *     на пустом месте, которое надо чем-то заполнить.
 *   · КВАДРАТ РИСУЕТСЯ ТОЛЬКО НА ПУСТОЙ ПОЛКЕ. Когда ткань уже есть, дверь становится ТИХОЙ —
 *     вторичной кнопкой в заголовке группы, где живут органы про группу целиком. Сетка тогда
 *     показывает ровно то, что на карточке есть: ткани и цвет, без дыры между ними.
 *
 * ⚠ ДВЕРЬ ОДНА И ТА ЖЕ, ПРОСТО В ДВУХ КОЖАХ. Библиотека — единственный способ принести на карточку
 * фотографию ткани, и потерять его было нельзя: `PATTERN` умеет только ПЛАТНУЮ плитку. Поэтому
 * запись здесь написана ОДИН раз, а `variant` выбирает лицо.
 */
function ClothIntake({
  band,
  techCardId,
  shelf,
  variant,
  onMakePattern,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  shelf: common_DesignAsset[];
  /** `slot` — полосатый квадрат последней клеткой сетки; `door` — тихая кнопка в заголовке. */
  variant: 'slot' | 'door';
  /** Вторая дверь пустой рамки: уход на STUDIO → PATTERN. Не задана — двери нет вовсе. */
  onMakePattern?: () => void;
}): JSX.Element {
  const writes = useAssetWrites(techCardId);
  const { showMessage } = useSnackBarStore();
  const { full, reason } = clothCeiling(band, shelf);

  /* ВТОРАЯ ПРОВЕРКА ПОТОЛКА, И ОНА ГОВОРИТ ВСЛУХ. Дверь погашена по полосе, прочитанной ЭТИМ
     рендером, а между её отрисовкой и подтверждением модалки стоит целая прогулка человека:
     соседняя вкладка успевает добрать потолок. */
  const take = (media: common_MediaFull[]) => {
    const first = media[0];
    if (!first?.id) return;
    if ((band.assets ?? []).length >= ASSETS_PER_CARD_MAX) {
      showMessage(reason, 'error');
      return;
    }
    writes.upsertAsset.mutate({
      // `assetId: 0` заводит. Род — УТВЕРЖДЕНИЕ этой двери: она стоит под подписью CLOTH AND
      // COLOUR, значит через неё приходит ткань. По пикселям это не восстановимо.
      assetId: 0,
      kind: ASSET_FABRIC,
      name: nextClothName(shelf),
      mediaId: first.id,
    });
  };

  if (variant === 'door') {
    /* ТИХАЯ ДВЕРЬ ЗАГОЛОВКА. `MediaSelector` принимает свой триггер (`asChild`), поэтому это
       ОДНА вторичная кнопка ряда заголовка, а не второй квадрат рядом с первым. ⌘V и бросок
       файла у неё нет — их носит рамка, а рамки здесь нет; библиотека остаётся. */
    if (full) return <InertDoor label='+ cloth' reason={reason} variant='underline' />;
    return (
      <MediaSelector
        label='+ cloth'
        purpose='design · cloth texture of this tech card'
        aspectRatio={['Custom']}
        allowMultiple={false}
        showVideos={false}
        saveSelectedMedia={take}
        trigger={
          <Button
            variant='underline'
            size='xs'
            className='text-labelColor hover:text-textColor'
            data-cloth-add-door
          >
            + cloth
          </Button>
        }
      />
    );
  }

  /* ═══ ДВЕРЬ НА ПОТОЛКЕ ГАСНЕТ, А НЕ ГЛОТАЕТ (Д-2). Здесь стоял живой `MediaSlot`, а отказ жил
     ПОСЛЕДНЕЙ строкой обработчика: человек проходил приёмную модалку целиком — превью, кроп,
     подтверждение — и не происходило НИЧЕГО, без единого слова. Теперь на потолке рисуется
     мёртвый кадр с причиной. */
  if (full) {
    return (
      <span data-inert={reason} title={reason} className='block w-full'>
        <span
          style={{ ...PLACEHOLDER_SURFACE, aspectRatio: TEXTURE_ASPECT }}
          className={`${placeholderClass({ dashed: true })} w-full`}
        >
          + cloth
        </span>
      </span>
    );
  }
  return (
    <MediaSlot
      aspectRatio={['Custom']}
      frameAspect={TEXTURE_ASPECT}
      label='+ cloth'
      hint={null}
      purpose='design · cloth texture of this tech card'
      showVideos={false}
      editMode
      /* ВТОРАЯ ДВЕРЬ ЖИВЁТ ВНУТРИ РАМКИ (J-7), а не отдельной кнопкой под ней: ровно эту кнопку
         владелец и назвал «огромной». Ведёт на STUDIO → PATTERN — туда, где из одной картинки
         делают бесшовную плитку, и она возвращается в эту же сетку, названной. */
      doors={
        onMakePattern
          ? [
              {
                label: 'pattern ▸',
                onClick: onMakePattern,
                title: 'go to STUDIO → MATERIALS: a fabric per slot of each colourway',
              },
            ]
          : undefined
      }
      onSelect={take}
    />
  );
}

/**
 * THE CORNERS OF A TILE OF THE MOCKUP (`tile()`): the ROLE bottom left («cloth» / «colour»), the
 * mark «in» top left. Ink labels on the frame, the same organ `PictureTile` draws its badge with —
 * a second spelling of the corner would drift by a pixel on the first edit.
 */
function RoleLabel({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <span className='pointer-events-none absolute bottom-1 left-1 z-20 inline-block max-w-[calc(100%-8px)] bg-textColor px-1.5 py-0.5'>
      <Text size='nano' variant='uppercase' component='span' className='!text-bgColor'>
        {children}
      </Text>
    </span>
  );
}

/**
 * ═══ СЕТКА ТЕКСТУР ════════════════════════════════════════════════════════════════════════════
 *
 * Ширина дорожки 104px — та же, что у плит `also shown` в референсах, и по той же причине: это
 * наименьший кадр, на котором фактура ткани ещё различима, а раппорт набивки читается как раппорт.
 * Крупнее — и четыре ткани заняли бы экран; мельче — и сетка перестала бы отвечать на свой вопрос.
 *
 * ═══ STEP 3 · НАДЕТЫЕ ПЕРВЫМИ, ОСТАЛЬНОЕ — ЗА ОДНОЙ ДВЕРЬЮ (ревью §7, 2026-09-26) ═══════════════
 *
 * Шаг PATTERN делает свотч на каждую пару (колорвей, слот), и полка карточки выросла до 120
 * (`ASSETS_PER_CARD_MAX`): три колорвея × три слота × несколько попыток — это десятки плиток, и
 * сетка без свёртки стала бы стеной, в которой ткань ЭТОГО колорвея надо искать глазами. Поэтому:
 *
 *   · ПЛИТКИ, НАДЕТЫЕ НА СЛОТЫ ТЕКУЩЕЙ ЦЕЛИ (`boundClothsOf` — то же определение, по которому
 *     засеяна подача), стоят ПЕРВЫМИ, в порядке слотов, и носят угловой ярлык с именем слота
 *     (`CornerLabel` шага PATTERN, этажом выше ярлыка рода). Порядок совпадает с порядком засева,
 *     поэтому «in · 1» стоит на первой плитке, а не где-то в середине стены;
 *   · полка длиннее `FOLD_AT` — СВЁРНУТА по умолчанию: видны первые `FOLD_AT` плиток этого порядка,
 *     остальное открывает ОДНА дверь «show all N» (она же «show fewer» — одна дверь в двух
 *     положениях, как `show all` ↔ `paged again` истории). Других новых кнопок нет;
 *   · ⚠ СВЁРТКА НИКОГДА НЕ ПРЯЧЕТ ТО, ЧТО УЕДЕТ. Надетая плитка, плитка в этом прогоне (`chosen`) и
 *     плитка покрашенного цвета (`assignedTo`) видны всегда, где бы они ни стояли в порядке: сетка
 *     рисует посылку (шапка файла), и ткань, едущая в платный промпт из-за закрытой двери, была бы
 *     ровно «купили не то, что видели».
 *
 * ⚠ «FOLD_AT ВИДНЫ», А НЕ «ВИДНЫ ТОЛЬКО НАДЕТЫЕ», И ЭТО ВЫБОР. На верстаке `sample` привязок нет по
 * построению, и правило «остальное свёрнуто» показало бы там пустую сетку с одной дверью — то есть
 * отняло бы выбор ткани у самого частого экрана ради порядка на другом.
 */
const FOLD_AT = 8;

/** Exported for `scripts/tile-menu-probe.mjs` only; the screen mounts it through `Palette`. */
export function TextureGrid({
  band,
  techCardId,
  state,
  disabled,
  onMakePattern,
  armed,
  onAssign,
  assignedTo,
  trailing,
  colorwayId = 0,
  slots,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  state: ColourDraft;
  disabled?: boolean;
  onMakePattern?: () => void;
  /** Цель прогона — чьи привязки ставят плитки первыми (STEP 3). `0` — `sample`, привязок нет. */
  colorwayId?: number;
  /** Слоты ткани композитора — тот же массив, по которому засеяна подача. */
  slots?: readonly ClothSlot[];
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
  /* ТОЛЬКО СНЯТИЕ. Заведение уехало в `ClothIntake` — оно нужно двум местам, снятие одному. */
  const writes = useAssetWrites(techCardId);
  const [pendingRemove, setPendingRemove] = useState<common_DesignAsset | null>(null);

  /* ОДНА ФУНКЦИЯ НА ЧИТАТЕЛЯ И ПИСАТЕЛЯ (Д-1): ровно та полка, которую наполняет дверь `+ texture`
     ниже, — ткани И паттерны. Порядок — паттерны первыми: владелец сказал «выбрать паттерн», и
     плитка набивки на этом экране главнее фотографии лоскута. */
  const shelf = useMemo(() => {
    const all = clothShelf(band);
    return [...all.filter(assetIsPattern), ...all.filter((a) => !assetIsPattern(a))];
  }, [band]);

  /* STEP 3 — надетые на слоты текущей цели, по ассету. Одно определение с засевом подачи. */
  const boundBy = useMemo(() => {
    const by = new Map<number, BoundCloth>();
    for (const b of boundClothsOf(band, colorwayId, slots)) by.set(b.assetId, b);
    return by;
  }, [band, colorwayId, slots]);

  /* ПОРЯДОК СЕТКИ: надетые — первыми и в порядке слотов (Map хранит порядок вставки), затем
     остальная полка в прежнем порядке (паттерны, потом ткани). */
  const ranked = useMemo(() => {
    const byId = new Map(shelf.map((a) => [a.id ?? 0, a] as const));
    const first = [...boundBy.keys()]
      .map((id) => byId.get(id))
      .filter((a): a is common_DesignAsset => !!a);
    return [...first, ...shelf.filter((a) => !boundBy.has(a.id ?? 0))];
  }, [shelf, boundBy]);

  /**
   * СВЁРТКА — СОСТОЯНИЕ ВИДА, НЕ ЧЕРНОВИКА, но и оно живёт карточкой: `StudioTab` между карточками
   * не размонтируется (инвариант 12), и открытая на A стена не должна встречать человека на B.
   * В теле рендера, тем же приёмом, что у черновиков.
   */
  const [unfolded, setUnfolded] = useState(false);
  const shownCard = useRef(techCardId);
  if (shownCard.current !== techCardId) {
    shownCard.current = techCardId;
    if (unfolded) setUnfolded(false);
  }

  /**
   * ПОРЯДОК ВЫБРАННЫХ — ЭТО САМ СПИСОК `fabrics`, а не отдельное состояние рядом с ним. Второе
   * хранилище порядка разошлось бы с посылкой при первом же восстановлении рецепта из истории или
   * засеве колорвеем: экран показывал бы «1, 2», а уезжало бы «2, 1» — и скаляры цвета говорили бы
   * про другую ткань, чем та, что помечена первой.
   */
  const chosen = state.recipe.fabrics ?? [];
  /** Порядковый номер ткани в прогоне, 1-based; `0` — «в этом прогоне её нет». */
  const ordinalOf = (id: number) => chosen.findIndex((f) => (f.assetId ?? 0) === id) + 1;

  /** Потолок активов — ОДНА функция на всех, кто его называет (разбор у `clothCeiling`). */
  const { full, reason: fullReason } = clothCeiling(band, shelf);

  /**
   * ═══ ПЛИТКА С ФОКУСОМ НЕ РАЗМОНТИРУЕТСЯ ИЗ-ПОД КЛАВИАТУРЫ (финальное ревью, m-C) ═══════════════
   *
   * В свёрнутой сетке плитка за `FOLD_AT` видна, пока она едет с прогоном. Снял её чипом — она
   * перестаёт ехать, фильтр ниже её выбрасывает, и узел с фокусом уходит из документа: фокус падает
   * на `body`, а человек с клавиатуры оказывается в начале страницы, не зная, что случилось. Поэтому
   * плитка, внутри которой фокус (чип, зум, `✕`, сама поверхность), остаётся в сетке, пока он там, —
   * и сворачивается следом, когда человек ушёл табом дальше: фокус к тому времени уже у соседа.
   * `focusin`/`focusout` React всплывают, поэтому слушает обёртка плитки, а не каждый её орган.
   */
  const [focusedId, setFocusedId] = useState(0);

  /* ЧТО ВИДНО В СВЁРНУТОЙ СЕТКЕ: первые `FOLD_AT` плиток порядка — и, вне очереди, всё, что едет
     с этим прогоном или надето на цель (довод — в шапке сетки), и плитка с фокусом (m-C выше). */
  const foldable = shelf.length > FOLD_AT;
  const folded = foldable && !unfolded;
  const visible = folded
    ? ranked.filter((a, i) => {
        const id = a.id ?? 0;
        return (
          i < FOLD_AT ||
          boundBy.has(id) ||
          ordinalOf(id) > 0 ||
          !!assignedTo?.has(id) ||
          (id > 0 && id === focusedId)
        );
      })
    : ranked;
  const hidden = ranked.length - visible.length;
  /** Сетка, которую открывает и сворачивает дверь свёртки, — её `aria-controls` (m-C). */
  const gridId = useId();

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
    /* ⚠ НАДЕТАЯ ТКАНЬ СОХРАНЯЕТ СВОИ ЧАСТИ (STEP 3). Засев положил ей `parts` = слот; пересборка
       `fabricUses` целиком (довод выше) отдаёт `parts: ''`, и первый же тычок в соседнюю плитку
       молча стирал бы «outer» у всех надетых — промпт из «ткань A на outer, ткань B на lining»
       превращался бы в «делите сами». Части берутся из того же `boundClothsOf`, что и засев;
       ненадетая ткань остаётся без частей, то есть ОСТАТКОМ изделия (`renderClothPartsRule`). */
    const fabrics = fabricUses(band, next).map((f) => {
      const b = boundBy.get(f.assetId ?? 0);
      return b ? { ...f, parts: b.parts } : f;
    });
    state.echo({ from: 'cloths', fabrics });
  };

  return (
    <>
      {/* Обёртка — ради `id`, на который указывает `aria-controls` двери свёртки: `Tiles` закрытым
          списком пропов `id` не принимает, а блочный `div` вокруг грида раскладку не трогает. */}
      <div id={gridId} data-texture-grid=''>
        <Tiles min={118}>
          {visible.map((a) => {
            const id = a.id ?? 0;
            const name = assetLabel(a);
            const url = assetThumb(a);
            const n = ordinalOf(id);
            /* STEP 3: на какие слоты текущей цели эта плитка надета — `undefined`, если ни на какие. */
            const worn = boundBy.get(id);
            const wornAs = worn ? worn.slotNames.join(' · ') : '';
            /* ⚠ ПОД ПОКРАСКОЙ «ВЫБРАНА» ЗНАЧИТ «НЕСЁТ ХОТЯ БЫ ОДИН ПОКРАШЕННЫЙ ЦВЕТ». Порядковый
               номер прогона там ничего не описывает: список тканей собирается из палитры, а не из
               очерёдности тычков, и нарисованная «1» на плитке была бы номером, которого никто не
               назначал. */
            const serves = assignedTo?.get(id) ?? [];
            const on = armed !== undefined && assignedTo ? serves.length > 0 : n > 0;
            const pattern = assetIsPattern(a);
            return (
              <div
                key={id}
                className='flex min-w-0 flex-col gap-1'
                data-texture={id}
                data-texture-bound={wornAs || undefined}
                onFocus={() => setFocusedId(id)}
                onBlur={(e) => {
                  // Фокус ушёл к другому органу ЭТОЙ ЖЕ плитки — она всё ещё «в руках».
                  if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
                  setFocusedId((current) => (current === id ? 0 : current));
                }}
              >
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
                      /* «in» — the mark of the mockup; with several cloths the ORDER is money (the
                         prompt calls the first CLOTH 1), so the number rides with it. */
                      chosen.length > 1 ? (
                        `in · ${n}`
                      ) : (
                        'in'
                      )
                    ) : undefined
                  }
                  /* ПОВЕРХНОСТЬ ВЫБИРАЕТ — ЖЕСТОМ МЫШИ. Объявленный орган — чип ниже; довод целиком
                     в шапке файла. */
                  onOpen={disabled ? undefined : () => pick(id)}
                  /* The role corner of the mockup's tile — «cloth» / «pattern», bottom left; a tile
                     bound to a slot of this target wears the slot one storey above it (STEP 3) —
                     the same corner organ the PATTERN step prints «in render» with. */
                  children={
                    <>
                      {worn && (
                        <CornerLabel at='bl' stack>
                          {wornAs}
                        </CornerLabel>
                      )}
                      <RoleLabel>{pattern ? 'pattern' : 'cloth'}</RoleLabel>
                    </>
                  }
                  gallery={
                    url
                      ? { src: assetFull(a) || url, thumbnail: url, type: 'image', alt: name }
                      : undefined
                  }
                  /* ⚠ УДАЛЕНИЕ С КАРТОЧКИ — СТРОКА МЕНЮ, А НЕ `✕` (TF2). `✕` по всей полосе значит
                     «убрать из этого блока, ничего не теряя»; снять ткань с этого прогона — повторное
                     нажатие на чип, а это — запись карточки без отката. Других строк у плитки нет,
                     поэтому угол — `more ▾` с одной красной `delete…`, и она всегда спрашивает.
                     Приехало из ленты входа (E-7): снять ткань больше негде во всей админке. */
                  menu={
                    disabled
                      ? undefined
                      : {
                          label: 'more',
                          ariaLabel: `more for ${name}`,
                          items: [
                            {
                              value: 'delete',
                              label: 'delete…',
                              tone: 'danger',
                              title: pattern
                                ? 'delete this pattern from the card'
                                : 'delete this cloth from the card',
                            },
                          ],
                          onPick: () => setPendingRemove(a),
                          pending:
                            writes.deleteAsset.isPending && writes.deleteAsset.variables === id,
                          'data-menu': `more:${id}`,
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
                  title={[
                    armed
                      ? `make ${name} the cloth of the parts painted ${armed}`
                      : serves.length > 0
                        ? `${name} is the cloth of ${serves.join(', ')} on the colour map — change it on that row below`
                        : on
                          ? `cloth ${n} of this run — press again to drop it. ${name} stays on the card`
                          : `add ${name} to this run as cloth ${chosen.length + 1}`,
                    /* Кто надел её и где это меняют — одна фраза, а не новая кнопка. */
                    worn ? `bound to ${wornAs} of this colourway on the PATTERN step` : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
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

          {/* ═══ КВАДРАТ ДВЕРИ — ТОЛЬКО НА ПУСТОЙ ПОЛКЕ (r3 п.22) ═══════════════════════════════
              Владелец: «при выбранном паттерне плейсхолдер «+ CLOTH» остаётся — зачем». Незачем:
              на карточке, где ткань уже принесена, пустой кадр вклинивался МЕЖДУ выбранной тканью и
              квадратом цвета и читался как третий предмет ряда. Когда полка непуста, та же дверь
              стоит тихой кнопкой в заголовке группы (`ClothIntake variant='door'`) — одна дверь, два
              лица, и ни одного места, где её нет вовсе. */}
          {!disabled && shelf.length === 0 && (
            <div className='flex min-w-0 flex-col gap-1' data-texture-add={full ? 'inert' : 'live'}>
              <ClothIntake
                band={band}
                techCardId={techCardId}
                shelf={shelf}
                variant='slot'
                onMakePattern={onMakePattern}
              />
            </div>
          )}

          {/* B-22 · ПЛИТКА ЦВЕТА — ПОСЛЕДНЯЯ КЛЕТКА ЭТОЙ ЖЕ СЕТКИ. Довод целиком у пропа `trailing`
              выше; короткая версия: одна дорожка на всех — единственный способ, которым квадрат
              цвета и квадрат ткани гарантированно одного роста. Стоит ПОСЛЕ двери `+ texture`,
              поэтому на пустой карточке два пустых кадра — `+ texture` и `+ colour` — оказываются
              соседями и читаются как пара, чем они и являются («a texture, a colour, or both»). */}
          {trailing}
        </Tiles>
      </div>

      {/* ═══ ОДНА ДВЕРЬ СВЁРТКИ (STEP 3) — в двух положениях, как `show all` ↔ `paged again`
          истории. Рисуется, только когда ей есть что открыть или что свернуть: полка, где всё
          и так на виду (надето, в прогоне), двери не получает. */}
      {foldable && (hidden > 0 || !folded) && (
        <div className='flex'>
          <Button
            variant='secondary'
            size='xs'
            data-texture-fold={folded ? 'folded' : 'open'}
            aria-expanded={!folded}
            aria-controls={gridId}
            onClick={() => setUnfolded(folded)}
            title={
              folded
                ? `${hidden} more cloth${hidden === 1 ? '' : 's'} of this card are folded; the ones bound to this colourway and the ones in this run always stay in view`
                : `fold the grid back to ${FOLD_AT} tiles; the bound cloths and the ones in this run stay in view`
            }
          >
            {folded ? `show all ${shelf.length}` : 'show fewer'}
            <FoldCaret open={!folded} />
          </Button>
        </div>
      )}

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
        title={`delete ${pendingRemove ? assetLabel(pendingRemove) : 'this texture'}?`}
        confirmLabel='delete'
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
 * ═══ ЦВЕТ ВЫБИРАЮТ ПАНТОНОМ, И ПАНТОН — ЭТО И ЕСТЬ ОПИСАНИЕ (r3 п.23/24) ══════════════════════
 *
 * Владелец, дословно: «CLOTH AND COLOUR: цвет выбирается из пантона; описания-текста цвета не
 * должно быть — пантон и есть описание» и «пустое состояние: два квадрата — паттерн и цвет
 * (клик → пантон)».
 *
 * ЧТО ЗДЕСЬ СТОЯЛО, И ПОЧЕМУ ЭТО БЫЛА КОЛОНКА ИЗ ЧЕТЫРЁХ ОРГАНОВ НА ОДИН ВОПРОС: квадрат с
 * пипеточным пикером (тон + насыщенность + поле hex + плашки прошлых рецептов), под ним ПОЛЕ
 * ИМЕНИ ЦВЕТА («dusty rose»), под ним строка с напечатанным hex («#b3202a»), а рядом с ней кнопка
 * CLEAR. Четыре предмета, из которых человек трогает один, — и ни один из четырёх не назывался
 * так, как цвет зовут в производстве.
 *
 * ЧТО СТАЛО — ОДИН КВАДРАТ И ОДНА СТРОКА ПОД НИМ:
 *   · КВАДРАТ ЕСТЬ ДВЕРЬ. Вся его поверхность открывает `PantonePicker` — тот же орган, которым
 *     пантон выбирают на PATTERN и на ON MODEL. Второго пикера цвета на экране больше нет:
 *     произвольный тон, набранный пипеткой, дайхаус не сварит, а два органа на один предмет
 *     расходятся первой же правкой.
 *   · КОД — ПОД КВАДРАТОМ, мелко. Это и есть «описание цвета»: «18-1664 TCX» говорит и цвет, и
 *     как его повторить, чего не говорил ни «dusty rose», ни «#b3202a».
 *   · ПОЛЕ ИМЕНИ СНЯТО ЦЕЛИКОМ, и знание не потеряно: имя цвета в рецепте — это ИМЯ КОЛОРВЕЯ
 *     (H-8), и оно теперь подставляется у двери прогона (`RenderStudio`), где известна цель. Под
 *     `sample` имени нет вовсе — и это правда, а не пропуск: у оси 0 нет колорвея, чтобы её так
 *     звать.
 *   · CLEAR СНЯТ КАК КНОПКА и вернулся `✕` в углу квадрата, по наведению и по фокусу — той же
 *     грамматикой, что у всех плиток полосы (`TILE_QUIET` / `TILE_CORNER`). Ряд перестал носить
 *     кнопку, которая нужна раз в сессию.
 *
 * ⚠ ЧТО ИМЕННО УЕЗЖАЕТ НА ПРОВОД — `hex`, А НЕ КОД (D7). Номер красильни модель прочтёт как
 * бессмысленный жетон: TCX-таблиц она не знает. `renderprompt.go` печатает «colourway <имя> — the
 * exact value is <hex>», и обе половины этой фразы собираются в `RenderStudio`. Ссылка остаётся на
 * экране, где по ней сверяются с банкой краски; поле рецепта под неё — бэкенд-задача B8.
 */

/**
 * ═══ КОНТЕКСТ `ai ✦` У IN WORDS — ТКАНЬ И ЦВЕТ ЭТОГО ПРОГОНА (O-61, D-60) ══════════════════════
 *
 * `AiEnhance` принимает контекст: факты, которые модель правки вправе назвать, но не выдумывать
 * (сервер: «never invent … materials … that are not in the input or the context»). У WORDS флэта это
 * факты карточки (`cardFactsContext`); здесь — то, что знает только рендер: выбранные ткани (имя,
 * плитка ли это паттерна, части, слова о ней), выбранный цвет и что сказано про саму ткань
 * (прозрачность и граммаж — тем же композитором, что уезжает на провод, `statedWords`). Факты
 * карточки уже стоят в самих словах по умолчанию, второй раз в контексте им делать нечего.
 *
 * ⚠ ЦВЕТ — HEX, А НЕ НОМЕР ПАНТОНА (D7): номер красильни — жетон, которого модель рисунка не знает,
 * и ответ `ai ✦`, вписавший «18-1664 TCX» в слова, унёс бы его в промпт.
 * ⚠ ПРЕДЕЛ — 2000 ЗНАКОВ КОНТЕКСТА НА СЕРВЕРЕ (`enhanceMaxContextRunes`, отказ `too_long`): строки
 * кладутся целиком, пока влезают.
 */
const WORDS_CONTEXT_MAX = 2000;

function renderWordsContext(state: ColourDraft): string {
  const recipe = state.recipe;
  const lines: string[] = [];
  for (const f of recipe.fabrics ?? []) {
    const name = (f.name ?? '').trim();
    if (!name) continue;
    const pattern = (f.kind ?? '').trim() === 'pattern' ? ' (a pattern tile)' : '';
    const parts = (f.parts ?? '').trim();
    const note = (f.words ?? '').trim();
    lines.push(`cloth: ${name}${pattern}${parts ? `, on ${parts}` : ''}${note ? `: ${note}` : ''}`);
  }
  if (hexIsPaintable(recipe.hex)) lines.push(`colour: ${(recipe.hex ?? '').trim()}`);
  const said = statedWords({ cloth: state.cloth });
  if (said) lines.push(`the cloth is: ${said}`);
  const kept: string[] = [];
  let length = 0;
  for (const line of lines) {
    const add = line.length + (kept.length ? 1 : 0);
    if (length + add > WORDS_CONTEXT_MAX) continue;
    kept.push(line);
    length += add;
  }
  return kept.join('\n');
}

/**
 * ═══ IN WORDS — ТЕ ЖЕ СЛОВА И ТОТ ЖЕ ОРГАН, ЧТО WORDS ФЛЭТА (27.09, O-61, D-60) ═══════════════
 *
 * Владелец: «в FABRIC RENDER в IN WORDS подефолту должно быть тоже самое что и в WORDS во флете …
 * с возможностью редактирования и что бы сама форма поля выглядела также как во флетах».
 *
 *   · ПОЛЕ — `WordsField`, тот же орган, что у флэта: textarea во всю ширину, счётчик `N / 2000` и
 *     `ai ✦` в правом нижнем углу, строка «+N omitted». Здесь стоял однострочный `Input`.
 *   · СЛОВА — `recipe.words` черновика, а он уже отдаёт СЛОВА НА ЭКРАНЕ: пока собственные пусты и
 *     засев рендера не снят — те, что показывает WORDS флэта (разбор — в `useColourDraft`). Правка и
 *     ответ `ai ✦` идут дверью `typed` и отдают показанное в рецепт; дальше слова свои.
 *   · CLEAR — дверь группы, как была, и снимает засев РЕНДЕРА (`clear('words')`): поле пусто и не
 *     засевается до перезагрузки страницы, WORDS флэта не тронуты. Нечего чистить — дверь погашена,
 *     а не спрятана, как `clear the input ✕` флэта: пустое место не объясняет, куда она делась, а
 *     прыгающая строка заголовка двигала бы поле под пальцами.
 *   · ДВЕРИ «from construction ▸» БОЛЬШЕ НЕТ. Она стояла погашенной с причиной («a pasted part of
 *     the construction is not on the wire») — мёртвая дверь; факты карточки теперь стоят в самом
 *     поле с самого начала, ровно как у флэта, где эта дверь снята тем же доводом (T24, D-20).
 *   · ПОДПИСЬ — линейка группы «in words», как у соседей «cloth and colour» и «cloth is»: у
 *     рендера своя грамматика заголовков, а одинаковым владелец просил само поле.
 *   · ЗАСЕВ — ТОТ ЖЕ, ЧТО У ФЛЭТА (O-61 r2): `useWordsSeeding` с теми же входами, что зовёт секция
 *     WORDS (карточка, полоса, «только чтение» экрана). Пока он стоял лишь во флэте, карточка без
 *     сохранённых слов, открытая прямо здесь, показывала пустое поле до первого захода на FLAT.
 *
 * ⚠ ОБЁРТКА ОРГАНА — ОДИН `<div>`: соседом линейки группы должен быть блок, от которого меряется
 * зазор `GROUP_GAP` (r3 п.34), а орган — фрагмент (подпись для читалки, поле, строка «omitted»).
 */
export function InWords({
  state,
  band,
  techCardId,
  disabled,
}: {
  state: ColourDraft;
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
}): JSX.Element {
  useWordsSeeding(techCardId, band, !!disabled);
  const words = state.recipe.words ?? '';
  /* Строка «+N omitted» — по засеву флэта: рендер показывает его слова, и правда о них та же. */
  const seed = useWordsSeed(techCardId);
  /* T56: IN WORDS догоняет мудборд своим брифом (ткань, цвет, драпировка); правленое — по ссылке. */
  const dropped = useScreenWordsDropped(techCardId, 'render');
  const follow = useRenderWordsFollow(
    techCardId,
    !!disabled,
    state.ownWords ?? words,
    dropped,
    (text) => state.typed({ words: text }),
  );
  const clear = disabled ? undefined : (
    <Button
      variant='underline'
      size='xs'
      className='text-labelColor hover:text-textColor'
      data-words-clear=''
      disabled={words.trim() === ''}
      title='takes the words off this run — WORDS on the flat stay'
      onClick={() => state.clear('words')}
    >
      clear
    </Button>
  );
  return (
    <div>
      <GroupLabel
        flush
        className={GROUP_GAP}
        action={
          follow.rewrite ? (
            <span className='flex items-baseline gap-3'>
              <Button
                variant='underline'
                size='xs'
                className='text-labelColor hover:text-textColor'
                data-words-rewrite=''
                disabled={follow.rewriting}
                title='the moodboard changed since these words were written — rewrite them for the render'
                onClick={follow.rewrite}
              >
                {follow.rewriting ? 'rewriting…' : 'moodboard changed · rewrite ✦'}
              </Button>
              {clear}
            </span>
          ) : (
            clear
          )
        }
      >
        in words
      </GroupLabel>
      <div data-render-words=''>
        <WordsField
          id='design-fabric-words'
          name='design-fabric-words'
          label='the cloth in words'
          value={words}
          disabled={disabled}
          placeholder='fine rib jersey, matte'
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
            state.typed({ words: e.target.value })
          }
          omitted={omittedOf(seed, words)}
          aiContext={renderWordsContext(state)}
          aiDisabled={disabled}
          onApply={(text) => state.typed({ words: text })}
        />
      </div>
      {/* ⚠ СТРОКА «the words above travel with the recipe · goes to the model as «…»» СНЯТА
          (r3 п.26, слово владельца: «убрать»). Она эхом печатала СОДЕРЖИМОЕ поля, которое человек
          в этот момент печатает, — и стояла в двух сантиметрах под ним. Всё, что она добавляла
          сверх эха, — оговорка «уедет вместе с рецептом», а это ровно то, чем поле под подписью
          IN WORDS и является.
          ⚠ ЗНАНИЕ НЕ ПОТЕРЯНО, И ЭТО ПРОВЕРЯЕТСЯ, А НЕ ОБЕЩАЕТСЯ. Полная склейка (`statedWords` —
          та же функция, что уезжает на провод) печатается в модалке «what the model gets», в одном
          нажатии отсюда, в ряду GENERATE. Там её читают, когда ПРОВЕРЯЮТ, а не когда печатают. */}
    </div>
  );
}
