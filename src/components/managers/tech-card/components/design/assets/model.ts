import type {
  GetDesignBandResponse,
  common_DesignAsset,
  common_DesignAssetPlacement,
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

export const allAssets = (band: GetDesignBandResponse): common_DesignAsset[] => band.assets ?? [];

export function assetById(band: GetDesignBandResponse): Map<number, common_DesignAsset> {
  const m = new Map<number, common_DesignAsset>();
  for (const a of band.assets ?? []) if (a.id != null) m.set(a.id, a);
  return m;
}

/** Метки, стоящие НА ЭТОЙ картинке. Экран читает разметку по кадру, а не по ассету. */
export function placementsOnPicture(
  band: GetDesignBandResponse,
  pictureId: number,
): common_DesignAssetPlacement[] {
  return (band.assetPlacements ?? []).filter((p) => p.pictureId === pictureId);
}

/** Метки ЭТОГО ассета, по всем кадрам — цена, которую называет вопрос перед удалением. */
export function placementsOfAsset(
  band: GetDesignBandResponse,
  assetId: number,
): common_DesignAssetPlacement[] {
  return (band.assetPlacements ?? []).filter((p) => p.assetId === assetId);
}

/**
 * ЧАСТИ ИЗДЕЛИЯ, КОТОРЫЕ ЭТА ТКАНЬ ЗАКРЫВАЕТ, СЛОВАМИ (V-8).
 *
 * Составляется ИЗ МЕТОК, а не набирается отдельным полем, и это не экономия на органе: второе
 * место для тех же слов разошлось бы с разметкой в первый же день, а спорят они молча — человек
 * видит на флэте одно, модель читает другое.
 *
 * Источник слов — записка метки. Метка без записки даёт номер («mark 2»): у неё есть геометрия и
 * нет имени, и промолчать про неё значило бы отправить модели ткань, у которой на флэте есть
 * место, а в промпте нет.
 */
export function partsOfAsset(band: GetDesignBandResponse, assetId: number): string {
  const words: string[] = [];
  const marks = placementsOfAsset(band, assetId);
  marks.forEach((p, i) => {
    const note = (p.note ?? '').trim();
    words.push(note || `mark ${i + 1}`);
  });
  // Дедупликация по тексту: две метки «collar» на левом и правом флэте это ОДНО место изделия,
  // и повторённое слово в промпте читается как два разных воротника.
  return [...new Set(words)].join(', ');
}

/**
 * ТКАНИ ПРОГОНА — то, что уезжает в `params.colour.fabrics` (V-4, V-8).
 *
 * ЗАМОРОЖЕННЫЕ КОПИИ, А НЕ ССЫЛКИ: контракт (`common.DesignFabricUse`) требует именно копий, чтобы
 * история прогона читалась после переименования, перекраски или удаления ассета. `assetId` едет
 * рядом как происхождение и никем не разрешается обратно.
 *
 * ПАТТЕРН — ЭТО ТОЖЕ ТКАНЬ ДЛЯ ПРОМПТА. Для модели «из чего сшито» и «чем это покрыто» один
 * вопрос; отдельного словаря у неё нет, а раппорт едет числом в `repeatMm`.
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
      assetId: id,
      name: assetLabel(a),
      mediaId: a.mediaId ?? 0,
      colourCode: (a.colourCode ?? '').trim(),
      colourHex: (a.colourHex ?? '').trim(),
      words: (a.note ?? '').trim(),
      parts: partsOfAsset(band, id),
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
