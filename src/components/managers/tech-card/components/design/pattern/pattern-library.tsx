import type {
  GetDesignBandResponse,
  common_DesignAsset,
  common_DesignRun,
} from 'api/proto-http/admin';
import { useTechCard } from 'components/managers/tech-cards/components/useTechCardQuery';
import { useMemo, useState, type JSX } from 'react';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { GroupLabel } from 'ui/components/group-label';
import Input from 'ui/components/input';
import { Pill } from 'ui/components/pill';
import { Placeholder } from 'ui/components/placeholder';
import SelectComponent from 'ui/components/select';
import { Tiles } from 'ui/components/tiles';
import Text from 'ui/components/text';

import {
  ASSET_NAME_MAX,
  ASSET_PATTERN,
  assetFull,
  assetLabel,
  assetThumb,
  assetWornBy,
} from '../assets/model';
import { useAssetWrites } from '../assets/use-assets';
import { COLORWAY_NONE, runIsOnPage } from '../bench-kinds';
import { archivedRef, colorwayLabel } from '../colorway-picker';
import { InertDoor } from '../bench-slot';
import { serverSpeaksDesign } from '../capability';
import { useElapsed } from '../generation';
import { PictureTile } from '../picture-tile';
import { useDesignWrites } from '../use-design-band';
import { Strip, StripCell } from '../render/strip-cell';
import {
  SEAM_WORDS,
  assetOfMedia,
  nextPatternName,
  patternAssets,
  patternOutputs,
  pictureFull,
  pictureThumb,
  repeatOfRun,
  seamWarningOf,
  shelfIsFull,
} from './model';

/**
 * ═══ ПАТТЕРНЫ ЭТОЙ КАРТОЧКИ — ЕЁ ТКАНИ, И ТЕПЕРЬ ЭТО ВЕСЬ ВТОРОЙ АКТ ЭКРАНА (G-15 + J-12) ═════
 *
 * Владелец, круг 15, дословно: «блок TILES вообще не нужен должен быть удобный просмотр с зумом и
 * тд можно просто оставить блок PATTERNS OF THIS CARD и там сделать более большие карточки
 * паттернов и все». И раньше, про предмет: паттерн — бесшовная плитка, бесшовная плитка — ТКАНЬ;
 * делается один раз, живёт в библиотеке карточки, «в рендере и 3D выбирается как ткань ЭТОГО
 * КОЛОРВЕЯ».
 *
 * ═══ ПОЧЕМУ РЯДЫ 44 px СТАЛИ КАРТОЧКАМИ 220 px ═══════════════════════════════════════════════
 *
 * Здесь стоял список строк с миниатюрой 44 px. Он отвечал на «как эту ткань зовут и кто её носит»
 * и НЕ МОГ ответить на единственный вопрос, который к паттерну вообще есть: СТЫК ВИДЕН? На сорока
 * четырёх пикселях его нет ни у одной плитки. Пока рядом стоял блок TILES со сценой 3×3, разделение
 * труда было честным; блок снят — и вопрос обязан был переехать сюда вместе со своим местом.
 *
 * ЛИЦО КАРТОЧКИ — ПЛИТКА, НАРИСОВАННАЯ 2×2 (`background-repeat`, `background-size: 50% 50%`).
 * Это не украшение и не «превью раппорта»: при 220 px каждая копия ≈ 110 px, а ЕДИНСТВЕННЫЙ
 * перекрёсток четырёх копий приходится ровно на центр лица — самое видное место карточки. Плитка,
 * которая не стыкуется, выдаёт себя крестом посреди картинки, и её не надо никуда открывать.
 *
 * ЗУМ — ОБЩИЙ ПРОСМОТРЩИК СТУДИИ, И ЭТО ВТОРАЯ ПОЛОВИНА «удобного просмотра». Кадр отдаётся
 * ПОЛНЫМ (`assetFull`), а не миниатюрой: замощённое мыло читается как испорченный файл. В
 * просмотрщике живут колесо к курсору, пинч, перетаскивание и восьмикратное увеличение
 * (`media-viewer-zoom.tsx`), а стрелки листают ВСЁ, что на экране, потому что ряд собирает
 * `PictureGalleryProvider` в порядке документа.
 *
 * ═══ ⚠ ПЛИТКА САДИТСЯ НА ПОЛКУ САМА. `KEEP` — ПОДБОРЩИК ЛЕГАСИ, А НЕ ПУТЬ СОХРАНЕНИЯ ══════════
 *
 * ⚠⚠ ЗДЕСЬ СТОЯЛО ПРЯМО ПРОТИВОПОЛОЖНОЕ УТВЕРЖДЕНИЕ, И ОНО БЫЛО ЛОЖНЫМ. Дословно: «сервер плитку
 * на полку карточки НЕ КЛАДЁТ — прогон отдаёт картинку в ленту, а ассет заводит человек;
 * автоматическая посадка — правка бэкенда, которой на бете нет». Оно было написано ЗА КРУГ ДО
 * ТОГО, как эта правка приехала, и с тех пор пережило её молча.
 *
 * ЧТО НА САМОМ ДЕЛЕ, СВЕРЕНО НА `origin/beta` (круг 19): `keepPatternTx`
 * (`internal/store/design/assets.go:167`) вызывается из транзакции, ЗАКРЫВАЮЩЕЙ ПРОГОН
 * (`queue.go:897`, при `run.Kind == pattern`), и заводит `design_asset{kind:pattern, name,
 * media_id, repeat_mm, colorway_id}` из замороженного `params.pattern.name` прогона и живой
 * колонки `run.colorway_id`. То есть КАЖДЫЙ НАЗВАННЫЙ ПРОГОН ПАТТЕРНА СТАНОВИТСЯ СТРОКОЙ ПОЛКИ
 * САМ, без единого нажатия. Имя же теперь есть всегда: пустое поле на экране-делателе уезжает
 * как `pattern N` (разбор — у `fallbackName` в `pattern-studio.tsx`).
 *
 * ПОЧЕМУ ЛОЖНАЯ ШАПКА СТОИЛА ДЕНЕГ, А НЕ ТОЛЬКО ТОЧНОСТИ. Владелец спросил ДОСЛОВНО: «как
 * сохранять паттерны» — при том, что они сохраняются сами. Вопрос родился из СЛОВАРЯ этого
 * экрана: счётчик писал `N kept`, полоса зовётся `made earlier, not kept`, у двери `keep`
 * тултип «name this tile». Три органа хором учили, что сохранение — ручной жест. Круг 19 снял
 * первое (`N kept` → `N` в заголовке общей секции) и свёл делателя и полку в ОДИН блок, чтобы
 * плитка появлялась там же, где стояла пунктирная дыра прогона. Второе и третье остались, потому
 * что относятся к настоящему остатку — см. ниже.
 *
 * ЧТО ТОГДА ПОДБИРАЕТ `KEEP`, И ПОЧЕМУ ДВЕРЬ НЕ СНЕСЕНА. Ровно два рода плиток, у которых полка
 * не завелась: (a) прогоны, ЗАМОРОЖЕННЫЕ ДО КРУГА 15, — у них в `params` нет имени вовсе, и
 * `keepPatternTx` их пропускает (`assets.go:169-173`); (b) прогоны, упёршиеся в `library_full`.
 * Полоса исчезает целиком, когда таких плиток нет, — а это нормальное состояние любой карточки,
 * заведённой после круга 15.
 *
 * ═══ E-15 — ЧТО ЗНАЧИТ `KEEP` ТЕПЕРЬ, И ЧЕГО ОНО БОЛЬШЕ НЕ ЗНАЧИТ ════════════════════════════
 *
 * Владелец, дословно: «если мы сделали keep в PATTERNS OF THIS CARD это не значит что надо их
 * сразу добавлять как текстуру в рендер это значит что мы его просто проименовали и он тогда
 * должен появлять в артефактах».
 *
 * ДВЕ ПРАВКИ, ОБЕ БУКВАЛЬНЫЕ:
 *
 *   1. `KEEP` БОЛЬШЕ НЕ ДЕЛАЕТ ПЛИТКУ ТЕКСТУРОЙ РЕНДЕРА. Механизмом этого были ЧИПЫ НОСКИ
 *      (`SetDesignAssetColorway`, «worn by ROSSO»): назначенная колорвею ткань ЗАСЕВАЛА подачу
 *      рендера сама (`useColourDraft` → `fabricOfColorway`), то есть открытие экрана уже несло
 *      выбранную текстуру, которую человек не выбирал. Чипы сняты целиком. Это не расширение
 *      слова владельца, а его исполнение: он назвал ровно тот эффект, который они производили, и
 *      той же волной снял колорвеи с обоих экранов (E-1/E-16), после чего у носки не осталось ни
 *      одного читателя вовсе.
 *      ⚠ КОЛОНКА `design_asset.colorway_id` ЖИВА И НЕ ТРОНУТА. Снят ОРГАН; данные, ручка
 *      `SetDesignAssetColorway` и FK на месте, и удаление данных — отдельное решение владельца.
 *
 *      ⚠ И ИМЕННО ПОЭТОМУ B-26 ОКАЗАЛСЯ ОДНИМ СЕЛЕКТОМ, А НЕ ФИЧЕЙ. Круг 20, владелец: «также что
 *      бы во вкладке паттернс мы могли привзать паттерн к колорвею». Провод, оставленный этим
 *      абзацем нетронутым, всё это время ждал вызывающего — и получил ровно одного: ряд `worn by`
 *      на плитке (разбор — у `wornBy` в теле `Card`). Фраза «значение больше нигде не читается»
 *      снята отсюда, потому что перестала быть правдой; всё остальное в пункте 1 стоит как стояло.
 *
 *      ⚠ ГРАНИЦА E-15 ПРИ ЭТОМ НЕ СДВИНУТА НИ НА ШАГ, И ЭТО ГЛАВНОЕ. Вернулся ФАКТ, а не ЭФФЕКТ:
 *      привязка записывается и показывается, но подачу рендера не засевает — `fabricOfColorway`
 *      как не имел вызывающих, так и не имеет. Владелец жаловался ровно на засев («keep … это не
 *      значит что надо их сразу добавлять как текстуру в рендер»), а не на то, что связь видна.
 *
 *   2. `KEEP` ТЕПЕРЬ ЖЕ КЛАДЁТ ПЛИТКУ В АРТЕФАКТЫ. «Проименовали → появляется в артефактах» —
 *      это ровно пометка `selected`: сегмент PATTERNS панели ARTIFACTS сужается по ней
 *      (`artifacts-panel.tsx`, `bandPlates`), и до этой правки названная плитка в него не
 *      попадала, если на карточке была помечена хоть одна другая. Поэтому дверь пишет ДВА факта
 *      одним нажатием — ассет полки и пометку кадра, — и говорит об этом на себе.
 *
 * ⚠ ДВЕ ЗАПИСИ, И ВТОРАЯ МОЖЕТ ОТКАЗАТЬ ОТДЕЛЬНО. Транзакции на пару у клиента нет и быть не
 * может: это два разных глагола сервера. Порядок выбран так, что ЧАСТИЧНЫЙ ИСХОД БЕЗВРЕДЕН —
 * сначала ассет (без него плитка не ткань карточки вовсе), потом пометка (без неё плитка просто
 * не сузила сегмент). Обратный порядок оставил бы помеченный кадр без ассета, то есть артефакт,
 * которого нет на полке.
 */

/**
 * ЛИЦО КАРТОЧКИ. Квадрат, замощённый плиткой 2×2.
 *
 * ⚠ `background-size: 50% 50%` — ЭТО РОВНО ЧЕТЫРЕ КОПИИ, а не «примерно четыре»: доля считается от
 * коробки, а коробка квадратная, поэтому у копий тот же квадрат, что у самой плитки, и стык не
 * растянут. Стоило бы взять `contain` или пиксели — и вертикальный период разошёлся бы с
 * горизонтальным на карточке любой другой ширины, то есть крест в центре перестал бы быть стыком.
 */
function TiledFace({ url, alt }: { url: string; alt: string }): JSX.Element {
  return (
    <div
      role='img'
      aria-label={`${alt} — the tile repeated four times, so the join runs through the middle`}
      data-tiled-face
      className='h-full w-full bg-bgColor'
      style={{
        backgroundImage: `url(${JSON.stringify(url)})`,
        backgroundSize: '50% 50%',
        backgroundRepeat: 'repeat',
      }}
    />
  );
}

function Card({
  asset,
  disabled,
  techCardId,
  seam,
}: {
  asset: common_DesignAsset;
  disabled?: boolean;
  techCardId: number;
  /** Сервер померил стык этой плитки и нашёл его видимым. Читается с ПРОГОНА, не с ассета. */
  seam: boolean;
}): JSX.Element {
  const { upsertAsset, deleteAsset, setAssetColorway } = useAssetWrites(techCardId);
  const speaks = serverSpeaksDesign();
  const writesOff = !!disabled || !speaks;

  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(() => assetLabel(asset));
  const [confirmDelete, setConfirmDelete] = useState(false);

  const id = asset.id ?? 0;

  /**
   * ═══ B-26 — «ЧЕЙ ЭТО ПАТТЕРН»: ОДИН СЕЛЕКТ, И ОРГАН У НЕГО УЖЕ БЫЛ ПОСТРОЕН ═══════════════
   *
   * Владелец, дословно: «также что бы во вкладке паттернс мы могли привзать паттерн к колорвею».
   *
   * ЗДЕСЬ НИЧЕГО НЕ ПРОЕКТИРУЕТСЯ, ЗДЕСЬ МОНТИРУЕТСЯ ПИСАТЕЛЬ. Глагол `SetDesignAssetColorway`,
   * колонка `design_asset.colorway_id`, её FK, читатели (`assetWornBy`, `fabricOfColorway`) и сама
   * мутация (`assets/use-assets.ts`) стояли живыми и БЕЗ ЕДИНОГО ВЫЗЫВАЮЩЕГО с круга 15, когда
   * E-15 снял чипы носки: снят был ОРГАН, провод не тронут (разбор — в шапке этого файла). Проверено
   * грепом перед правкой: у `setAssetColorway` были только определение и мемо, экспортирующее его.
   * Поэтому второго писателя не заводится — этот первый и единственный.
   *
   * SINGLE-SELECT, А НЕ РЯД ЧИПОВ, И ЭТО СЕРВЕРНЫЙ ИНВАРИАНТ, А НЕ НАША ОСТОРОЖНОСТЬ: колонка
   * одна, и назначение X на N сервер исполняет ОДНОЙ транзакцией, снимая N со всех прочих ассетов
   * карточки. Клиент этого не имитирует и второго вызова не шлёт (довод целиком — у мутации).
   * Плитка, потерявшая колорвей, после инвалидации полосы просто читается как `no colourway` —
   * никакой клиентской бухгалтерии.
   *
   * ⚠ ПРИВЯЗКА НЕ ЗАСЕВАЕТ РЕНДЕР, И ЭТО РЕШЕНО РАНЬШЕ (E-15), А НЕ ЗАБЫТО ЗДЕСЬ. Ровно этим
   * механизмом чипы носки и провинились: назначенная колорвею ткань уезжала в подачу сама
   * (`useColourDraft` → `fabricOfColorway`), и человек открывал экран с текстурой, которую не
   * выбирал. Владелец сказал, что `keep` значит «проименовали», и ничего больше. Здесь
   * записывается и показывается ФАКТ; `fabricOfColorway` вызывающих по-прежнему не получает, и
   * записка в шапке `colorway-picker.tsx` («засева тканью нет») остаётся правдой.
   */
  const wornBy = assetWornBy(asset);
  const { data: techCard, isLoading: cardLoading } = useTechCard(techCardId);

  /**
   * ⚠ АРХИВ ЗАКРЫВАЕТ ДВЕРЬ К НОВОЙ РАБОТЕ, А НЕ К УЖЕ СДЕЛАННОЙ — ПРАВИЛО ВЗЯТО У
   * `useColorwayChoice`, А НЕ ПРИДУМАНО ЗАНОВО.
   *
   * Там оно живёт двумя оговорками, и здесь читается ровно одна из них: `id === wornBy`. Довод у
   * неё тот же самый и он ДВОЙНОЙ. (а) Достижимость: колорвей архивируют, а плитка продолжает его
   * носить — выкинув имя из списка, мы спрятали бы связь, которую человек как раз и пришёл снять,
   * то есть починили бы дефект его же половиной. (б) Radix: рядом со списком стоит скрытый нативный
   * `<select>`, и значение, которого нет среди `<option>`, он присылает обратно ПУСТОЙ строкой как
   * «выбор человека». Значение обязано быть среди пунктов ВСЕГДА, и держится это конструкцией
   * списка, а не обещанием.
   *
   * ВТОРАЯ ОГОВОРКА ТОГО ФАЙЛА (`renderBenchOccupied`) СЮДА НАМЕРЕННО НЕ ПЕРЕНЕСЕНА, и это не
   * ослабление правила, а его исполнение. Она спрашивает «занят ли ВЕРСТАК РЕНДЕРОВ этого цвета» —
   * вопрос другого органа: там список — это фильтр по уже снятым плитам, и спрятать имя значит
   * спрятать плиты. Здесь список — это выбор НОВОЙ привязки, а новая работа под архивным именем —
   * ровно то, что архив и закрывает («ворота стоят у кнопки прогона»). Перенести её сюда значило бы
   * предложить завести новое под снятым цветом на основании, которое о тканях не говорит вовсе.
   *
   * ЛЕСТНИЦА ОСТАЛЬНЫХ СТАТУСОВ (`DRAFT`/`ACTIVE`/`HIDDEN`/`UNKNOWN`) НЕ ЧИТАЕТСЯ — по тому же
   * доводу, что и у пикера: `HIDDEN` про витрину, а не про студию.
   */
  const colorways = useMemo(
    () =>
      (techCard?.colorways ?? []).filter((c) => {
        const cid = c.colorwayId ?? 0;
        if (cid <= 0) return false;
        return !archivedRef(c) || cid === wornBy;
      }),
    [techCard, wornBy],
  );

  /**
   * ═══ «НЕ НОСИТ НИКТО» — ЭТО ПУНКТ СО ЗНАЧЕНИЕМ `0`, А НЕ ОТСУТСТВИЕ ПУНКТА ══════════════════
   *
   * Так отвязка и выражается, и другого способа у неё нет. `colorwayId: 0` — СНЯТИЕ на проводе:
   * сервер читает его как «колорвей носит свой собственный цвет» и обнуляет колонку, а
   * отрицательное значение отвергает (`InvalidArgument`), поэтому клиент его не шлёт. Довод
   * целиком — у мутации в `assets/use-assets.ts`.
   *
   * ⚠ НАРИСОВАТЬ ЭТО ПУСТЫМ ПУНКТОМ ИЛИ «ОЧИСТИТЬ ▸» БЫЛО БЫ ДВУМЯ ОШИБКАМИ СРАЗУ: Radix прислал
   * бы пустую строку неотличимо от своей же фантомной пустоты (сторож `if (!value) return` выше
   * съел бы настоящий жест человека), а на экране безколорвейная ткань выглядела бы незаполненным
   * полем — тогда как это законное и самое частое состояние плитки, а не пропуск.
   *
   * ⚠ СНЕСЁННЫЙ КОЛОРВЕЙ ПОЛУЧАЕТ СВОЙ ПУНКТ, И ЭТО НЕ КОСМЕТИКА. Архив плитку из списка не
   * выбивает (правило выше), а вот УДАЛЁННЫЙ колорвей исчезает из `techCard.colorways` вовсе —
   * держать его нечем, потому что держать нечего, — и тогда значение селекта не имеет пункта:
   * Radix присылает фантомную пустоту, а связь становится невидимой ровно у той плитки, с которой
   * её и надо снять. Пикер лечит тот же дрейф сбросом на `COLORWAY_NONE`, но там выбор — состояние
   * КЛИЕНТА и сброс бесплатен; здесь он состояние СЕРВЕРА, и «поправить» его значило бы писать в
   * базу на маунте, молча и за человека. Поэтому дрейф не правится, а НАЗЫВАЕТСЯ: пункт `#42`
   * показывает число, которое реально лежит в колонке, и человек снимает его сам.
   */
  const orphanWear = wornBy > 0 && !colorways.some((c) => (c.colorwayId ?? 0) === wornBy);
  const wornByItems = useMemo(
    () => [
      { value: String(COLORWAY_NONE), label: 'no colourway' },
      ...colorways.map((c) => {
        const cid = c.colorwayId ?? 0;
        /* Подпись `(archived)` называет ФАКТ и стоит всегда — ровно та же, что в пикере. */
        return {
          value: String(cid),
          label: `${colorwayLabel(c)}${archivedRef(c) ? ' (archived)' : ''}`,
        };
      }),
      ...(orphanWear ? [{ value: String(wornBy), label: `#${wornBy} (deleted)` }] : []),
    ],
    [colorways, orphanWear, wornBy],
  );

  /**
   * ВЫБИРАТЬ НЕЧЕГО — ОТВЕЧАЕТ САМ ОРГАН, А НЕ СТРОКА ПРОЗЫ ПОД НИМ (тот же довод, что у пикера).
   * Единственный пункт списка уже выбран; живой селект с одним пунктом читается как поломка
   * («список не загрузился»), поэтому он гаснет и НАЗЫВАЕТ причину заголовком — там же, куда
   * человек ведёт курсор, чтобы его раскрыть. Отдельного ряда с фразой не заводится.
   */
  const noColorways = wornByItems.length <= 1;
  const wornByTitle = writesOff
    ? disabled
      ? 'this card is read-only for you — the library is card data'
      : 'this server does not answer the design routes'
    : noColorways
      ? 'this card has no colourways — make one on the COLORWAYS tab'
      : /* ⚠ ЗАГОЛОВОК НАЗЫВАЕТ ПОСЛЕДСТВИЕ, КОТОРОЕ НЕ ВИДНО НА ЭТОЙ ПЛИТКЕ: снятие идёт с ЧУЖОЙ.
           Сервер держит одну ткань на колорвей и исполняет это одной транзакцией, поэтому выбор
           здесь молча меняет соседнюю плитку — единственное место, где об этом можно предупредить
           честно, это то, куда человек ведёт курсор ПЕРЕД выбором. */
        'a colourway wears one fabric — picking it here takes it off whatever else wore it';

  /**
   * ПЕРЕИМЕНОВАНИЕ — `UpsertDesignAsset` С ЭХОМ ВСЕХ ПОЛЕЙ, И ЭТО НЕ ПЕДАНТИЧНОСТЬ.
   *
   * Upsert — ПОЛНАЯ ЗАМЕНА строки, а не патч: поле, которое вызывающий не назвал, приезжает нулём
   * и затирает сохранённое. Послать сюда только `{assetId, name}` значило бы вместе с именем стереть
   * `media_id` (плитка перестала бы существовать как картинка), `repeat_mm` и родословную.
   *
   * КОЛОРВЕЙ ПРИ ЭТОМ НЕ ЭХОИТСЯ И НЕ МОЖЕТ БЫТЬ ЭХНУТ: `UpsertDesignAsset` его SET-списком не
   * называет вовсе — ровно для того, чтобы назначение переживало переименование. Это и есть довод,
   * по которому у назначения отдельный глагол.
   */
  const rename = () => {
    const next = name.trim().slice(0, ASSET_NAME_MAX);
    if (!next || next === assetLabel(asset)) {
      setRenaming(false);
      setName(assetLabel(asset));
      return;
    }
    upsertAsset.mutate(
      {
        assetId: id,
        kind: asset.kind ?? '',
        name: next,
        mediaId: asset.mediaId ?? 0,
        colourCode: asset.colourCode ?? '',
        colourHex: asset.colourHex ?? '',
        note: asset.note ?? '',
        derivedFromAssetId: asset.derivedFromAssetId ?? 0,
        repeatMm: asset.repeatMm ?? 0,
        rotationDeg: asset.rotationDeg ?? 0,
        ordinal: asset.ordinal ?? 0,
      },
      { onSettled: () => setRenaming(false) },
    );
  };

  const thumb = assetThumb(asset);
  const full = assetFull(asset) || thumb;
  const label = assetLabel(asset);

  return (
    <div data-pattern-asset={id} className='flex flex-col gap-1'>
      {/* ПЛИТКА — «СВОЯ ПОВЕРХНОСТЬ», а не блок в блоке: у неё одна рамка от `PictureTile` и
          никакого второго border+bg вокруг (DESIGN.md, «блок не содержит блока»). */}
      {full ? (
        <PictureTile
          url={full}
          alt={label}
          aspect='1/1'
          className='w-full'
          face={<TiledFace url={full} alt={label} />}
          gallery={{ src: full, thumbnail: thumb || full, type: 'image', alt: label }}
        />
      ) : (
        <div className='flex aspect-square w-full items-center justify-center border border-borderColor bg-bgZebra'>
          <Text size='nano' variant='label' component='span' className='uppercase'>
            no image
          </Text>
        </div>
      )}

      {/* ─── ИМЯ. Промпт ЦИТИРУЕТ ткань по нему, поэтому оно правится прямо здесь. ─────────── */}
      <div className='flex min-w-0 flex-wrap items-center gap-1'>
        {renaming ? (
          <>
            <div className='min-w-0 flex-1'>
              <Input
                name={`pattern-name-${id}`}
                value={name}
                maxLength={ASSET_NAME_MAX}
                autoFocus
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                onKeyDown={(e: React.KeyboardEvent) => {
                  // МАТЧ ПО `e.key` ДЛЯ Enter/Escape ЗАКОНЕН: это НЕ буквы. Мёртвым на кириллице
                  // становится сравнение с БУКВОЙ — там нужен `e.code`; у управляющих клавиш
                  // `key` не зависит от раскладки вовсе.
                  if (e.key === 'Enter') rename();
                  if (e.key === 'Escape') {
                    setRenaming(false);
                    setName(assetLabel(asset));
                  }
                }}
              />
            </div>
            <Button
              variant='secondary'
              size='xs'
              loading={upsertAsset.isPending}
              data-rename-save={id}
              onClick={rename}
            >
              save
            </Button>
          </>
        ) : (
          <Text
            size='control'
            variant='uppercase'
            tracking='label'
            component='span'
            className='min-w-0 break-words font-bold'
          >
            {label}
          </Text>
        )}
      </div>

      {/* ⚠ ПОДПИСИ «worn by ROSSO» ЗДЕСЬ БОЛЬШЕ НЕТ, И ТЕПЕРЬ ПО ДРУГОЙ ПРИЧИНЕ, ЧЕМ РАНЬШЕ.
          E-15 снял её потому, что у факта не осталось читателя, а подпись под фактом без читателя
          учит, что механизм жив. B-26 читателя вернул — но ОРГАНОМ, а не подписью: тот же факт
          называет селект `worn by` ниже, и он же его правит. Вторая, неправимая копия того же
          числа рядом с ним была бы не подписью, а вопросом «какая из двух главная». */}
      {/* ⚠ ПОЛОВИНА `run N` СНЯТА (круг 19). Владелец: «сделай его максимально простым сейчас
          там хуй пойми что». Номер прогона — АДРЕС В ЛЕНТЕ, а не свойство ткани: он ничего не
          говорит о плитке, отличается у двух одинаковых и пропадает сам, стоит прогону уехать со
          страницы истории (тогда строка молча становилась короче — то есть подпись под плиткой
          зависела от пагинации СОСЕДНЕГО блока). Осталось `N mm`, и только когда оно есть.

          ЛЕГАСИ-ЧИСЛО ПОКАЗЫВАЕТСЯ ТОЛЬКО ТОГДА, КОГДА ОНО ЕСТЬ. Новые паттерны его не несут
          (J-12 снял ряд SCALE, и `repeat_mm` уезжает нулём), а у старых оно настоящее и
          по-прежнему доезжает в промпт многоткани — молчать о нём было бы потерей. */}
      {!!asset.repeatMm && (
        <Text size='nano' variant='label' component='span' className='min-w-0 break-words'>
          {`${asset.repeatMm} mm`}
        </Text>
      )}

      {/* ⚠ ВЕРДИКТ О СТЫКЕ — РЯДОМ С ПЛИТКОЙ, А НЕ В ИСТОРИИ. Строка ленты говорит `done`, потому
          что прогон и правда завершился и был оплачен; шов сервер померил ОТДЕЛЬНО и записал на
          попытке. Читатель, который смотрит только на прогон, о нём не узнает вовсе. */}
      {seam && (
        <span>
          <Pill tone='warn' title={SEAM_WORDS}>
            join measured as visible
          </Pill>
        </span>
      )}

      {/* ═══ «WORN BY» — ОСЬ ВЕРНУЛАСЬ ОДНИМ СЕЛЕКТОМ ПО СЛОВУ ВЛАДЕЛЬЦА (B-26) ═══════════════
          Здесь стоял РЯД ЧИПОВ НОСКИ, снятый в круге 15 (E-15), и записка на его месте. Записка
          переписана, а не удалена, потому что важен шов: чипы провинились НЕ тем, что называли
          носку, а тем, что ДЕЛАЛИ носку текстурой рендера — подача засевалась сама. Владелец снял
          эффект; теперь он просит назад сам факт («привзать паттерн к колорвею»). Возвращается
          поэтому ФАКТ И ТОЛЬКО ФАКТ: селект пишет колонку и читает её обратно, засева нет.
          Форма — селект, а не чипы, по доводу пикера: чипов было бы столько же, сколько цветов, и
          читались бы они как ряд свойств плитки, тогда как вопрос у них один и ответ на него один.
          Разбор целиком — у `wornBy` выше. */}
      <div data-pattern-worn-by={id || undefined} className='flex min-w-0 items-center gap-1'>
        <Text size='micro' variant='label' tracking='label' component='span' className='uppercase'>
          worn by
        </Text>
        {/* ⚠ ПОДСКАЗКА И ХУК ВИСЯТ НА ОБЁРТКЕ, А НЕ НА `SelectComponent`: корень Radix разбирает
            ЗАКРЫТЫЙ список пропов, и `title`/`data-*` до DOM бы не доехали — утверждение по ним
            было бы зелёным над отсутствующим узлом. Тот же приём, что у полос рендера. */}
        <span className='min-w-0 flex-1' title={wornByTitle}>
          <SelectComponent
            name={`pattern-worn-by-${id}`}
            value={String(wornBy)}
            disabled={writesOff || noColorways || setAssetColorway.isPending || cardLoading}
            /* ⚠ СЕЛЕКТОР ПРИВОДИТСЯ К МЕТРИКЕ СОСЕДНИХ ДВЕРЕЙ, А НЕ НАОБОРОТ (F-9). `min-h-0`
               ОБЯЗАТЕЛЕН: `min-height` и `height` — РАЗНЫЕ группы у twMerge, поэтому `min-h-[22px]`
               примитива тихо победил бы `h-5`, и ряд встал бы выше `rename`/`delete` под ним. Кегль
               тот же, что у `size='xs'` у этих кнопок: 10px прописными. Тот же приём, что у
               `mark ▸` в `render/outputs.tsx` и во входе рендера. */
            className='h-5 min-h-0 py-0 text-micro uppercase tracking-label'
            items={wornByItems}
            onValueChange={(value: string) => {
              /* Пустая строка сюда доехать не может — значение всегда среди пунктов (довод у
                 списка выше), — но если доедет, это НЕ выбор человека, и молчание честнее записи. */
              if (!value) return;
              const next = Number(value) || COLORWAY_NONE;
              if (next === wornBy) return;
              setAssetColorway.mutate({ assetId: id, colorwayId: next });
            }}
            fullWidth
          />
        </span>
      </div>

      <div className='mt-auto flex flex-wrap items-center gap-1 pt-0.5'>
        {writesOff ? (
          <InertDoor
            label='rename'
            reason={
              disabled
                ? 'this card is read-only for you — the library is card data'
                : 'this server does not answer the design routes'
            }
          />
        ) : (
          !renaming && (
            <Button
              variant='secondary'
              size='xs'
              data-rename={id}
              onClick={() => {
                setName(assetLabel(asset));
                setRenaming(true);
              }}
              title='the prompt cites this fabric BY NAME, so «IMG_4471» reaches the model as the name of the cloth'
            >
              rename
            </Button>
          )
        )}
        {writesOff ? null : (
          <Button
            variant='secondary'
            size='xs'
            data-delete-asset={id}
            onClick={() => setConfirmDelete(true)}
          >
            delete
          </Button>
        )}
      </div>

      <ConfirmationModal
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`delete ${label}?`}
        confirmLabel='delete it'
        onConfirm={() => {
          setConfirmDelete(false);
          deleteAsset.mutate(id);
        }}
      >
        <Text size='micro' component='p' className='normal-case'>
          It leaves the card’s texture shelf, so FABRIC RENDER can no longer pick it. The PICTURE
          survives: the tile stays in the run’s history and in ARTIFACTS, and it can be kept again
          from the strip below.
        </Text>
      </ConfirmationModal>
    </div>
  );
}

/**
 * ═══ ПУНКТИРНАЯ ПЛИТКА ЖИВОГО ПРОГОНА — ДЫРА ФОРМЫ ОТВЕТА (круг 19) ══════════════════════════
 *
 * Здесь у прогона была СТРОКА в блоке-делателе: «a pattern is being made · 0:42 — it lands in
 * PATTERNS OF THIS CARD when the provider answers». Она ОБЕЩАЛА СЛОВАМИ, где появится плитка, —
 * стоя при этом в другой секции, чем названная. Дыра формы плитки, стоящая в самой сетке первой,
 * говорит то же самое и не может соврать: готовая плитка встанет ровно сюда.
 *
 * ОТДЕЛЬНЫМ КОМПОНЕНТОМ РАДИ ХУКА: `useElapsed` тикает раз в секунду, и вызванный в теле полки он
 * перерисовывал бы вместе с собой ВСЮ сетку, включая замощённые лица всех сохранённых плиток.
 * Здесь он перерисовывает одну ячейку.
 */
function PendingTile({ startedAt }: { startedAt?: string | null }): JSX.Element {
  const elapsed = useElapsed(startedAt ?? undefined);
  return (
    <div data-pattern-pending className='flex flex-col gap-1'>
      <Placeholder dashed aspect='square' className='w-full' />
      <Text size='nano' variant='label' component='span'>
        {elapsed || '0:00'}
      </Text>
    </div>
  );
}

export function PatternLibrary({
  band,
  techCardId,
  disabled,
  live,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
  /**
   * ЖИВЫЕ ПРОГОНЫ ПАТТЕРНА, СЧИТАННЫЕ ВЫЗЫВАЮЩИМ. Пропом, а не вторым чтением полосы: делатель
   * уже держит этот список ради собственного `pending`, и второй `patternRuns(band).filter(...)`
   * был бы вторым ответом на вопрос «что сейчас в работе» — с шансом разойтись на одном кадре.
   */
  live?: common_DesignRun[];
}): JSX.Element {
  const { upsertAsset } = useAssetWrites(techCardId);
  /**
   * ВТОРАЯ ПОЛОВИНА ЖЕСТА `KEEP` (E-15): пометка кадра, по которой ARTIFACTS сужает свой сегмент
   * PATTERNS. Отдельный глагол сервера, поэтому и отдельная мутация; порядок и цена частичного
   * исхода — в шапке файла.
   */
  const { setPictureSelected } = useDesignWrites(techCardId);
  const speaks = serverSpeaksDesign();
  const writesOff = !!disabled || !speaks;

  const assets = useMemo(() => patternAssets(band), [band]);
  const outputs = useMemo(() => patternOutputs(band), [band]);

  /**
   * ПРОГОН, СДЕЛАВШИЙ ПЛИТКУ, ИЩЕТСЯ ПО МЕДИА — у ассета нет `picture_id`, у него `media_id`.
   * Прогон, вытесненный со страницы ленты, здесь не найдётся, и это честный ответ «спросить не у
   * кого»: вердикт о стыке живёт на попытках прогона, а не на ассете.
   */
  const seamOfAsset = useMemo(() => {
    const m = new Map<number, boolean>();
    for (const { picture, run } of outputs) {
      const mediaId = picture.media?.id ?? 0;
      if (mediaId > 0 && !m.has(mediaId)) m.set(mediaId, seamWarningOf(run));
    }
    return m;
  }, [outputs]);

  /** Плитки, вернувшиеся из прогонов и НЕ положенные на полку. Пусто — полосы нет вовсе. */
  const unkept = useMemo(
    () => outputs.filter(({ picture }) => !assetOfMedia(band, picture.media?.id ?? 0)),
    [outputs, band],
  );

  const shelfFull = shelfIsFull(band);
  const pending = live ?? [];

  return (
    /* ═══ СВОЕЙ СЕКЦИИ У ПОЛКИ БОЛЬШЕ НЕТ (круг 19) ═══════════════════════════════════════════
       Владелец: «переделай юай создания паттернов сделай его максимально простым сейчас там хуй
       пойми что». Полка была ВТОРЫМ белым блоком на сером грунте, и между ней и делателем стояли
       24 пикселя `SectionStack` — то есть вход и выход одной вещи читались как два равновесных
       заявления. Теперь это тело ОДНОЙ секции `patterns`, а её заголовок и счётчик принадлежат
       `PatternStudio`.

       ЧТО УШЛО ВМЕСТЕ С СЕКЦИЕЙ:
         · ЗАГОЛОВОК `patterns of this card` — секция называется `patterns`, и повторять слово
           «карточки» внутри карточки незачем;
         · ВОПРОС-ПОДЗАГОЛОВОК «— the tiles it has named; each one is an artifact and a texture
           FABRIC RENDER can pick». Проза, и вдобавок неверная в главном слове: плитки называет
           не человек («it has named»), а прогон, а полку заводит сервер;
         · СЧЁТЧИК `N kept`. Слово `kept` учило, что сохранение — ручной жест, которого на самом
           деле нет; в заголовке общей секции стоит просто `N` (разбор — в шапке файла);
         · ПУСТОЕ СОСТОЯНИЕ — абзац «No pattern is named yet. Attach a picture above and press
           GENERATE…». Он пересказывал словами ряд, стоящий В ТРЁХ САНТИМЕТРАХ ВЫШЕ: пустая рамка
           `+ picture` рядом с инертной дверью GENERATE и есть пустое состояние этого экрана, и
           она показывает жест вместо того, чтобы его описывать. */
    <>
      {/* ЛИНИЯ ПОЯВЛЯЕТСЯ ВМЕСТЕ С ТЕМ, ЧТО ОНА ОТБИВАЕТ, И НИКОГДА РАНЬШЕ. Правило лестницы:
          1px `hairline` — ВНУТРЕННЯЯ линия между рядами блока (DESIGN.md, «две серых»). Линия над
          пустым полем — это обещание содержимого, которого нет. */}
      {(assets.length > 0 || pending.length > 0) && (
        /* 220 px — НИЖНЯЯ ГРАНИЦА, ПРИ КОТОРОЙ ЛИЦО ЕЩЁ ОТВЕЧАЕТ НА СВОЙ ВОПРОС: каждая из
           четырёх копий ≈ 110 px, и стык в центре читается без наведения. Дорожка `1fr` растит
           карточки дальше на широком экране, где места и правда больше. */
        <div className='border-t border-hairline pt-3'>
          <Tiles min={220}>
            {/* ЖИВЫЕ — ПЕРВЫМИ, И ЭТО НЕ «новое сверху», А АДРЕС ОТВЕТА. Готовая плитка встаёт
                в голову списка (полоса отдаёт ассеты новейшими вперёд), значит пунктирная дыра
                обязана стоять там же, иначе плитка появится не на месте своей дыры. */}
            {pending.map((r) => (
              <PendingTile key={r.id ?? `live-${r.startedAt ?? ''}`} startedAt={r.startedAt ?? r.createdAt} />
            ))}
            {assets.map((a) => (
              <Card
                key={a.id}
                asset={a}
                disabled={disabled}
                techCardId={techCardId}
                seam={!!seamOfAsset.get(a.mediaId ?? 0)}
              />
            ))}
          </Tiles>
        </div>
      )}

      {/* ═══ ПЛИТКИ, КОТОРЫЕ ВЕРНУЛИСЬ И НЕ ЛЕГЛИ НА ПОЛКУ ══════════════════════════════════════
          Полоса — не «второй список паттернов», а НЕЗАКОНЧЕННОЕ ДЕЛО: за эти картинки уже
          заплачено, и до нажатия кнопки ни один рендер их не увидит. Её нет вовсе, когда таких
          картинок нет, — и это нормальное состояние прибранной карточки. */}
      {unkept.length > 0 && (
        <>
          <GroupLabel
            action={
              <Text size='micro' variant='label' component='span' className='normal-case'>
                paid for, but unnamed — a nameless tile is in no artifact and in no texture grid
              </Text>
            }
          >
            made earlier, not kept
          </GroupLabel>
          <Strip>
            {unkept.map(({ picture, run }) => {
              const mediaId = picture.media?.id ?? 0;
              const full = pictureFull(picture);
              /* РАППОРТ НАСЛЕДУЕТСЯ ОТ ПРОГОНА, а не выдумывается: у плитки, сделанной ДО J-12,
                 он настоящий и доезжает в промпт многоткани. Прогон вне страницы ленты ответить
                 не может — и тогда дверь закрыта, а не пишет ноль наугад. */
              const known = runIsOnPage(band, run);
              const repeat = known ? repeatOfRun(run) : 0;
              return (
                <StripCell
                  key={picture.id}
                  src={pictureThumb(picture)}
                  alt={`tile from run ${run.id ?? ''}`}
                  cellPictureId={picture.id}
                  gallery={
                    full
                      ? {
                          src: full,
                          thumbnail: pictureThumb(picture),
                          type: 'image',
                          alt: `tile from run ${run.id ?? ''}`,
                        }
                      : undefined
                  }
                  lines={[
                    `${(run.id ?? 0) > 0 ? `run ${run.id}` : 'no run'}${repeat ? ` · ${repeat} mm` : ''}`,
                    seamWarningOf(run) ? 'join measured as visible' : '',
                  ]}
                  action={
                    writesOff ? (
                      <InertDoor
                        label='keep'
                        reason={
                          disabled
                            ? 'this card is read-only for you — the library is card data'
                            : 'this server does not answer the design routes'
                        }
                      />
                    ) : shelfFull ? (
                      <InertDoor
                        label='keep'
                        reason='this card already holds its 40 assets — delete a pattern above, or a texture under FABRIC RENDER → TEXTURE & COLOUR, before naming another'
                      />
                    ) : !known ? (
                      <InertDoor
                        label='keep'
                        reason='the run that made this tile is off this page of the feed, so its repeat cannot be read — and a fabric kept without one would send an invented 0 mm into every render of it. Press `show all` in GENERATION HISTORY to bring that run back, then keep it from here'
                      />
                    ) : (
                      <Button
                        variant='secondary'
                        size='xs'
                        data-keep-tile={picture.id}
                        disabled={
                          upsertAsset.isPending || setPictureSelected.isPending || mediaId <= 0
                        }
                        onClick={() => {
                          /* ⚠ ПОРЯДОК НЕСУЩИЙ, И ЭТО ПРО ЧАСТИЧНЫЙ ИСХОД (E-15). Транзакции на
                             два глагола сервера у клиента нет; значит одна из двух записей может
                             пройти в одиночку. Ассет ПЕРВЫМ: без него плитка не ткань карточки
                             вовсе, и оставшаяся одна пометка дала бы артефакт, которого нет на
                             полке. Обратный порядок стоил бы ровно этого. */
                          upsertAsset.mutate({
                            assetId: 0,
                            kind: ASSET_PATTERN,
                            name: nextPatternName(band),
                            mediaId,
                            repeatMm: repeat,
                          });
                          /* «и он тогда должен появлять в артефактах» — дословно. Сегмент
                             PATTERNS панели ARTIFACTS сужается по `selected`, поэтому названная
                             плитка без пометки в него не попадала, стоило пометить любую другую. */
                          const pictureId = picture.id ?? 0;
                          if (pictureId > 0) {
                            setPictureSelected.mutate({ pictureId, selected: true });
                          }
                        }}
                        title='name this tile: it is filed on the card’s texture shelf, listed in ARTIFACTS, and offered in the texture grid of FABRIC RENDER. It is offered there — it does not become the texture of anything by itself'
                      >
                        keep
                      </Button>
                    )
                  }
                />
              );
            })}
          </Strip>
        </>
      )}
    </>
  );
}
