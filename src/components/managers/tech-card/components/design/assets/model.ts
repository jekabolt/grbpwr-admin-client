import { colorwayOf } from '../bench-kinds';
import type {
  GetDesignBandResponse,
  common_DesignAsset,
  common_DesignFabricUse,
  common_DesignPicture,
} from 'api/proto-http/admin';

/**
 * ЧТО ТАКОЕ АССЕТ ТЕХ-КАРТЫ, И ПОЧЕМУ ПОЛОК ТРИ, А ТАБЛИЦА ОДНА.
 *
 * Владелец (круг 5, V-11): «как-то надо хранить отдельно набор асетов тканей паттернов сгенеренных
 * и фурнитуры внутни одной тех карты», и прямым ответом выбрал форму: «Своя секция ASSETS в
 * студии» — три полки, из которых берут и фабрик-рендер, и разметка на флэтах.
 *
 * `kind` — ОДИН словарь: он говорит, ЧЕМ ассет является. Происхождение паттерна это отдельное
 * ребро (`derivedFromAssetId`), поэтому паттерн, нарисованный моделью, и паттерн, разложенный из
 * загруженного лоскута, — один род с разной родословной. Полный довод — в шапке миграции 0354.
 *
 * ═══ СЕКЦИИ ASSETS БОЛЬШЕ НЕТ, А ЭТОТ ФАЙЛ ЖИВ (Y-11) ══════════════════════════════════════════
 *
 * Владелец снял экран полок целиком («ASSETS в студио давай пока полностью выпилим»). Вместе с ним
 * ушли `assets-section.tsx`, `asset-shelf.tsx`, `asset-marks.tsx` и `pattern-preview.tsx`. Модель
 * осталась, потому что её читают ДВА живых органа, и оба не про полки:
 *   • `render/palette.tsx` — ряд CLOTHS: берёт ткани и паттерны карточки и замораживает выбранные
 *     в `params.colour.fabrics` (`clothShelf`, `fabricUses`, `assetLabel`, `assetThumb`);
 *   • `render/render-input-strip.tsx` — ряд CLOTH: показывает и снимает те же ассеты и заводит
 *     новые ткани; читает полку ТЕМ ЖЕ `clothShelf`, что и палитра. Одно определение на обоих —
 *     единственное, что мешает читателю и писателю разойтись снова (см. `clothShelf`).
 *
 * ПОЭТОМУ ЗДЕСЬ ЕСТЬ ЭКСПОРТЫ, КОТОРЫХ СЕЙЧАС НИКТО НЕ ЗОВЁТ (`ASSET_SHELVES`, `kindTakesRepeat`,
 * `ASSET_NAME_MAX`/`NOTE`/`REPEAT`, `allAssets`, `pictureThumbUrl`,
 * `ASSET_HARDWARE`). Они не мусор, а СПЕЦИФИКАЦИЯ снятого экрана: владелец сказал «пока», сервер
 * все три полки и метки по-прежнему принимает, и переписывать эти правила заново по памяти при
 * возврате означало бы разойтись с сервером молча. Стоимость — ноль байт в бандле: они не
 * импортируются, и tree-shaking их не берёт.
 */

export const ASSET_FABRIC = 'fabric';
export const ASSET_PATTERN = 'pattern';
export const ASSET_HARDWARE = 'hardware';

export type AssetKind = typeof ASSET_FABRIC | typeof ASSET_PATTERN | typeof ASSET_HARDWARE;

/**
 * ПОРЯДОК ПОЛОК — ПОРЯДОК РАБОТЫ, а не алфавит: ткань загружают первой, паттерн делают ИЗ неё,
 * фурнитуру навешивают на готовое. Полка, стоящая раньше своего источника, читалась бы как
 * независимая, и «сделать паттерн» на ней было бы жестом из ниоткуда.
 */
export const ASSET_SHELVES: {
  kind: AssetKind;
  title: string;
  /** Что эта полка ДАЁТ прогону или листу. Стоит в подписи группы, а не в подсказке под ней. */
  question: string;
  /** Слово на пустом слоте. Называет род того, что появится. */
  addLabel: string;
  empty: string;
}[] = [
  {
    kind: ASSET_FABRIC,
    title: 'fabrics',
    question: '— the cloths this garment is made of; the render is built out of them',
    addLabel: '+ fabric',
    empty: 'no cloth stated yet. a texture here is what the render reads weave and drape from.',
  },
  {
    kind: ASSET_PATTERN,
    title: 'patterns',
    question: '— built from a cloth, with the repeat the factory lays out',
    addLabel: '+ pattern',
    empty: 'a pattern is made from a fabric above, or brought in as its own tile.',
  },
  {
    kind: ASSET_HARDWARE,
    title: 'hardware',
    question: '— zips, buttons, cord stops; marked on the flats where each one goes',
    addLabel: '+ hardware',
    empty: 'no hardware stated yet.',
  },
];

export const shelfOf = (kind: string): AssetKind =>
  kind === ASSET_PATTERN || kind === ASSET_HARDWARE ? kind : ASSET_FABRIC;

/** РАППОРТ И ПОВОРОТ ЖИВУТ ТОЛЬКО У ПАТТЕРНА — сервер отвергает их у прочих родов. */
export const kindTakesRepeat = (kind: string): boolean => kind === ASSET_PATTERN;

/** ПОТОЛКИ — ЗЕРКАЛО СЕРВЕРНЫХ, чтобы отказ приходил до сетевого вызова, а не из него. */
export const ASSET_NAME_MAX = 60;
export const ASSET_NOTE_MAX = 500;
export const ASSET_REPEAT_MAX = 2000;
export const ASSETS_PER_CARD_MAX = 40;

export const assetThumb = (a?: common_DesignAsset): string =>
  a?.media?.media?.thumbnail?.mediaUrl || a?.media?.media?.fullSize?.mediaUrl || '';

export const assetFull = (a?: common_DesignAsset): string =>
  a?.media?.media?.fullSize?.mediaUrl || a?.media?.media?.thumbnail?.mediaUrl || '';

export const pictureThumbUrl = (p?: common_DesignPicture): string =>
  p?.media?.media?.thumbnail?.mediaUrl || p?.media?.media?.fullSize?.mediaUrl || '';

/**
 * ЧИТАЕМОЕ ИМЯ АССЕТА. Сервер обязывает имя быть непустым, но полоса может приехать с карточки-
 * клона или со старого бинаря, и безымянная плитка на экране читалась бы как сломанная строка.
 */
export const assetLabel = (a?: common_DesignAsset): string =>
  (a?.name ?? '').trim() || (a?.id ? `asset ${a.id}` : 'asset');

/** Ассеты одной полки, в серверном порядке (kind, ordinal, id). */
export function shelfAssets(band: GetDesignBandResponse, kind: AssetKind): common_DesignAsset[] {
  return (band.assets ?? []).filter((a) => shelfOf(a.kind ?? '') === kind);
}

/**
 * ═══ ЧТО СЧИТАЕТСЯ «ТКАНЬЮ» — ОДНО ОПРЕДЕЛЕНИЕ НА ЧИТАТЕЛЯ И НА ПИСАТЕЛЯ (Д-1) ════════════════
 *
 * ДЕФЕКТ, КОТОРЫЙ ЭТА ФУНКЦИЯ ЗАКРЫВАЕТ, БЫЛ ПОТЕРЕЙ ДОСТУПА К ДАННЫМ, а не расхождением вкуса.
 * Ряд CLOTHS (`render/palette.tsx`) читал ДВЕ полки — `fabric` и `pattern`, — потому что для
 * модели «из чего сшито» и «чем покрыто» один вопрос. А единственный оставшийся писатель, дверь
 * «+ cloth» в INPUT (`render/render-input-strip.tsx`), показывал и заводил ОДНУ. На карточке,
 * размеченной до снятия секции ASSETS, ассет-паттерн поэтому стоял чипом (его можно было выбрать,
 * и он уезжал в `params.colour.fabrics`), но НИ ОДНОЙ ПЛИТКОЙ — то есть увидеть и удалить его
 * было нельзя нигде во всей админке. Замер: полоса с одним `fabric` и одним `pattern` давала два
 * чипа и одну плитку.
 *
 * ЗАКРЫТО В СТОРОНУ «ПОКАЗАТЬ», А НЕ «ПЕРЕСТАТЬ ЧИТАТЬ», и выбор здесь не симметричен. Сузить
 * читателя до `fabric` значило бы молча изменить промпт выпущенных карточек (паттерн перестал бы
 * уезжать) и оставить сами строки на карточке невидимым мусором, который нечем снять. Показать
 * вторую полку не отнимает ничего и возвращает единственное, чего не хватало, — управление.
 *
 * ЗАВОДИТЬ ПАТТЕРНЫ ПО-ПРЕЖНЕМУ НЕЧЕМ, И ЭТО НЕ ПРОТИВОРЕЧИЕ. Паттерн — ткань ПЛЮС раппорт и
 * поворот, а редактора этих чисел не осталось (он ушёл с полками); дверь «+ cloth» честно заводит
 * `fabric`. Читатель, писатель и список на экране теперь совпадают в СОСТАВЕ; расходятся они
 * только в том, что нового паттерна не сделать, — и об этом сказано словом на самой плитке.
 */
export function clothShelf(band: GetDesignBandResponse): common_DesignAsset[] {
  return [...shelfAssets(band, ASSET_FABRIC), ...shelfAssets(band, ASSET_PATTERN)];
}

/** Род плитки ряда CLOTH: паттерн отличается от ткани раппортом и тем, что нового не завести. */
export const assetIsPattern = (a?: common_DesignAsset): boolean =>
  shelfOf(a?.kind ?? '') === ASSET_PATTERN;

/**
 * АССЕТЫ, КОТОРЫМИ РЯД CLOTH УПРАВЛЯТЬ НЕ МОЖЕТ, — сейчас это ровно полка `hardware`.
 *
 * Нужны не ради полноты, а ради ЧЕСТНОГО ПОТОЛКА (Д-2): предел в `ASSETS_PER_CARD_MAX` серверный
 * и считается по ВСЕЙ карточке, а снять на этом экране можно только ткани и паттерны. Когда предел
 * добран фурнитурой легаси-карточки, «освободите место» — ложь, и экран обязан сказать, чем именно
 * место занято, а не звать в несуществующий орган.
 */
export function unmanagedAssets(band: GetDesignBandResponse): common_DesignAsset[] {
  return (band.assets ?? []).filter((a) => shelfOf(a.kind ?? '') === ASSET_HARDWARE);
}

export const allAssets = (band: GetDesignBandResponse): common_DesignAsset[] => band.assets ?? [];

export function assetById(band: GetDesignBandResponse): Map<number, common_DesignAsset> {
  const m = new Map<number, common_DesignAsset>();
  for (const a of band.assets ?? []) if (a.id != null) m.set(a.id, a);
  return m;
}

/**
 * ═══ РАЗМЕТКА ТКАНЕЙ НА ФЛЭТАХ СНЕСЕНА ЦЕЛИКОМ (J-21) ═════════════════════════════════════════
 *
 * Владелец, дословно: «в FABRIC FITTING давай удалим полностью эту функцональность она слишком
 * громоздкая и плохо работает». Здесь стояли три функции — `placementsOnPicture`,
 * `placementsOfAsset` и `partsOfAsset`, — и все три читали `band.asset_placements`.
 *
 * ЧТО ИМЕННО УМЕРЛО ВМЕСТЕ С НИМИ, СКАЗАНО ВСЛУХ, ПОТОМУ ЧТО ЭТО ДЕНЬГИ. `partsOfAsset` собирал
 * поле `DesignFabricUse.parts` — «на каких частях изделия лежит эта ткань», — и оно доезжало в
 * ПЛАТНЫЙ промпт рендера: при двух и более тканях сервер печатал «It is used on: … — and on no
 * other part of this garment» (`renderprompt.go`, `renderClothPartsRule`). Теперь `fabricUses`
 * шлёт `parts: ''` (см. ниже), и прогон с двумя тканями получает правило «the division is yours to
 * make» вместо сужения. Это ПРАВДА состояния: поставить новую метку было нечем и до J-21, а
 * теперь и увидеть её негде — то есть промпт переставал бы сужаться по разметке, которой ни один
 * экран не показывает и никто не может снять.
 *
 * ⚠ ЧТО ОСТАЛОСЬ ЖИВЫМ И НЕ ТРОНУТО: таблица `design_asset_placement` и её строки на бете, ручки
 * `SetDesignAssetPlacement` / `DeleteDesignAssetPlacement`, тип `DesignAssetPlacement` и поле
 * `GetDesignBandResponse.asset_placements`. Удаление данных — отдельное решение владельца, и
 * миграции этот круг не пишет. Замороженные `parts` внутри параметров СТАРЫХ прогонов тоже живы:
 * перезапуск замороженного прогона обязан повторить те же слова, а история — это улика.
 */

/**
 * ТКАНИ ПРОГОНА — то, что уезжает в `params.colour.fabrics` (V-4, V-8).
 *
 * ЗАМОРОЖЕННЫЕ КОПИИ, А НЕ ССЫЛКИ: контракт (`common.DesignFabricUse`) требует именно копий, чтобы
 * история прогона читалась после переименования, перекраски или удаления ассета. `assetId` едет
 * рядом как происхождение и никем не разрешается обратно.
 *
 * ПАТТЕРН — ЭТО ТОЖЕ ТКАНЬ ДЛЯ ПРОМПТА. Для модели «из чего сшито» и «чем это покрыто» один
 * вопрос; отдельного словаря у неё нет, а раппорт едет числом в `repeatMm`.
 *
 * ⚠ `parts` БОЛЬШЕ НЕ СОБИРАЕТСЯ (J-21) — довод у снесённого `partsOfAsset` выше.
 */
export function fabricUses(
  band: GetDesignBandResponse,
  assetIds: number[],
): common_DesignFabricUse[] {
  const by = assetById(band);
  const out: common_DesignFabricUse[] = [];
  for (const id of assetIds) {
    const a = by.get(id);
    if (!a) continue;
    out.push({
      // ПУСТАЯ СТРОКА — ЭТО «ЭТА ТКАНЬ НЕ ПРИВЯЗАНА К ПОКРАШЕННОМУ ЦВЕТУ», и заполнять её здесь
      // нечем. Поле пришло с фичей A: оно связывает ткань с оттенком на карте цветов, а карту
      // рисует человек на отдельном экране, которого ещё нет. ⚠ НЕ СТАВИТЬ СЮДА `colourHex`:
      // цвет ткани и цвет МЕТКИ на карте — разные величины, и сервер, увидев непустой `map_hex`,
      // объявит модели, что деталь размечена (ревью `5dbb3b5`, находка 1 — ровно эта ложь).
      mapHex: '',
      assetId: id,
      name: assetLabel(a),
      mediaId: a.mediaId ?? 0,
      colourCode: (a.colourCode ?? '').trim(),
      colourHex: (a.colourHex ?? '').trim(),
      words: (a.note ?? '').trim(),
      // ⚠ ПУСТАЯ СТРОКА — УТВЕРЖДЕНИЕ, А НЕ ПРОПУСК (J-21). Части изделия выводились ИЗ МЕТОК на
      // флэтах; экрана меток больше нет, поставить и снять их нечем, и поле обязано говорить то,
      // что есть на самом деле: разделения не заявлено. Композировать его из строк, которых никто
      // не видит и никто не может убрать, — это «орган молчит, владелец платит».
      parts: '',
      // ЧТО ЭТА ТКАНЬ ТАКОЕ — 'fabric' | 'pattern', род строки полки НА МОМЕНТ ЗАПУСКА.
      // Промпт спрашивает «из чего сшито» и «чем покрыто» одним вопросом, но плитку от
      // снимка материала отличает именно это слово. Пустое значит 'fabric', как и было до
      // круга 15, поэтому старые замороженные прогоны читаются ровно как прежде.
      kind: (a.kind ?? '').trim(),
      repeatMm: a.repeatMm ?? 0,
    });
  }
  return out;
}

/**
 * ХЕКС, КОТОРЫЙ МОЖНО ПОКРАСИТЬ. Полуназванный `#4a5` не цвет: нативный пикер молча падает на
 * чёрный, а квадрат, закрашенный чёрным, врёт так, что глаз верит целиком.
 */
export function hexIsPaintable(hex?: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test((hex ?? '').trim());
}

/** Приведение к шести знакам: `#4a5` → `#44aa55`. Нужен и пикеру, и превью паттерна. */
export function normaliseHex(hex?: string): string {
  const v = (hex ?? '').trim().toLowerCase();
  if (!hexIsPaintable(v)) return '';
  if (v.length === 4) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  return v;
}


/* ─────────────────────────── ткань колорвея (G-15) ─────────────────────────── */

/**
 * ═══ КАКУЮ ТКАНЬ НОСИТ ЭТОТ КОЛОРВЕЙ — одна строка полки или ничего (G-15) ════════════════════
 *
 * Владелец определил паттерн прямым ответом: «бесшовная плитка = ТКАНЬ», делается один раз, живёт
 * в библиотеке карточки, «в рендере и 3D выбирается как ткань ЭТОГО КОЛОРВЕЯ». Значит колорвей
 * несёт «цвет ИЛИ паттерн», и хранить надо ровно вторую половину: ЦВЕТ у колорвея уже есть —
 * `devHex`/`pantone`/`colorCode` лежат в его собственной строке, и второе поле для того же было бы
 * конкурирующим ответом на вопрос, у которого ответ уже есть.
 *
 * SINGLE-SELECT — СЕРВЕРНЫЙ ИНВАРИАНТ, А НЕ НАША ОСТОРОЖНОСТЬ: `SetDesignAssetColorway` в одной
 * транзакции снимает колорвей со всех прочих ассетов карточки. Поэтому здесь `find`, а не
 * `filter`: второй строки быть не может, и молча показывать «первую из двух» значило бы прятать
 * нарушение, которого сервер не допускает.
 *
 * КОЛОРВЕЙ 0 НЕ ИМЕЕТ ТКАНИ ПО ОПРЕДЕЛЕНИЮ. `colorway_id = 0` на ассете читается «ничья ткань», и
 * спросить «какую ткань носит безколорвейный верстак» нельзя: у него нет носителя, которому эта
 * ткань принадлежала бы. Легаси-рендеры рецептом задним числом не перекрашиваются.
 */
export function fabricOfColorway(
  band: GetDesignBandResponse,
  colorwayId: number,
): common_DesignAsset | undefined {
  if (colorwayOf({ colorwayId }) <= 0) return undefined;
  return (band.assets ?? []).find((a) => colorwayOf(a) === colorwayId);
}

/**
 * КОЛОРВЕЙ, НОСЯЩИЙ ЭТОТ АССЕТ, или 0. Читается ТЕМ ЖЕ разбором, что колорвей слота, кадра и
 * прогона (`colorwayOf` в `../bench-kinds`) — ось одна, и второго её написания в дереве нет.
 */
export const assetWornBy = (a?: common_DesignAsset | null): number => colorwayOf(a);

/**
 * АССЕТЫ, КОТОРЫМ КОЛОРВЕЙ НАЗНАЧИТЬ МОЖНО. Ткани и паттерны — да; фурнитура — нет, и это отказ
 * сервера (`colorway_forbidden`, «a zip is not what a colourway is made of»), а не наш вкус.
 * Тот же состав, что у ряда CLOTHS: полка, из которой рендер и так берёт ткань.
 */
export const assetTakesColorway = (a?: common_DesignAsset | null): boolean =>
  shelfOf(a?.kind ?? '') !== ASSET_HARDWARE;
