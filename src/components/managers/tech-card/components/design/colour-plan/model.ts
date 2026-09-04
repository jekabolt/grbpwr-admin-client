import type {
  GetDesignBandResponse,
  common_DesignColourCloth,
  common_DesignColourMap,
  common_DesignColourPlan,
  common_DesignColourRecipe,
  common_DesignFabricUse,
} from 'api/proto-http/admin';

import { fabricUseOf, normaliseHex } from '../assets/model';
import { benchSides, renderSheetViews } from '../render/model';
import { viewLabel } from '../views';

/**
 * ═══ ЦВЕТОВОЙ ПЛАН КАРТОЧКИ — ЧИТАТЕЛЬ, ПРАВИЛА И СБОРЩИК ПОСЫЛКИ ═════════════════════════════
 *
 * Владелец, дословно: «Colour manually перед генерацией 3д что бы ты мог заливкой и брашем выбрать
 * кастомные колорс для разных деталей и потом когда ты порисовали закрасил что каким цветом то у
 * тебя дальше в меню показывает какие цвета ты использовал и там можно выбрать какие текстуры
 * какого цвета».
 *
 * ЧТО ЭТО ЗА ПРЕДМЕТ. «Карта» — ОДИН покрашенный вид: флэт, залитый деталь за деталью плоскими
 * цветами. «План» — весь документ карточки: карты по видам плюс словарь «этот цвет = эта ткань».
 * Два слова, потому что это две вещи: рецепт прогона морозит КАРТЫ и `map_hex` у каждой ткани, а
 * план живёт на карточке до запуска и переживает перезагрузку.
 *
 * ⚠ ЦВЕТ НА КАРТЕ — ЭТО МЕТКА, А НЕ ЦВЕТ ВЕЩИ, и из этой одной фразы следует всё остальное.
 * Деталь, закрашенная стальным синим, не станет стальной синей: она наденет ту ткань, которую план
 * прикрепил к `#3a7bd5`. Цвет самой вещи говорят ТКАНИ — там, где он и говорился всегда.
 *
 * ═══ ПАЛИТРА СОБИРАЕТСЯ ПО ХОДУ ПОКРАСКИ, А НЕ СКАНОМ ГОТОВОГО ХОЛСТА ═════════════════════════
 *
 * ⚠ ЭТО ГЛАВНОЕ РЕШЕНИЕ ФАЙЛА, И ОНО ЗАЩИЩАЕТ ДЕНЬГИ. И кисть, и ведро СМЕШИВАЮТ пиксели на краю:
 * у кисти мягкость и непрозрачность, у заливки — мягкая полоса `edge`, которая «красит настолько,
 * насколько похоже». Скан готового холста поэтому содержит СОТНИ промежуточных оттенков, которых
 * никто не выбирал, — и человек назначал бы ткани цветам, которых на экране нет, а платный промпт
 * объявлял бы модели детали, размеченные несуществующей меткой.
 *
 * Поэтому множество кандидатов ЗАКРЫТО: чернила записываются в момент КОММИТА жеста (кисть — в
 * `endRasterGesture`, ведро — в своём обработчике), и скан по документу только СВЕРЯЕТ точным
 * равенством, сколько пикселей каждого записанного цвета выжило. Ни один пиксель другого цвета не
 * считается никогда; фон листа не сэмплируется вовсе. Закрашенный поверх цвет получает `px = 0` и
 * уходит из палитры вместе со своим назначением.
 *
 * Чёрное и белое не записываются: `#000000` — чернила чертежа, `#ffffff` — бумага. Красить ими
 * можно (это зрительный ластик), но метки из них не рождается.
 */

/* ─────────────────────────── потолки, зеркалящие серверные ─────────────────────────── */

/**
 * ПОТОЛКИ — ЗЕРКАЛО ДВЕРИ `SetDesignColourPlan`, А НЕ НАША ОСТОРОЖНОСТЬ. Контракт называет их
 * поимённо: не больше шести карт, не больше 64 меток на палитре одной карты, не больше 64
 * назначений, документ не толще 64 КБ (план читается на КАЖДОМ чтении полосы — раздутый делает
 * карточку нечитаемой, а не просто большой). Экран, который их не знает, узнаёт о них отказом
 * посреди работы.
 */
export const PLAN_MAPS_MAX = 6;
export const PLAN_PALETTE_MAX = 64;
export const PLAN_CLOTHS_MAX = 64;
export const PLAN_BYTES_MAX = 64 * 1024;

/**
 * ПРЕДЕЛ СЛОВ ПРО ОДНУ ДЕТАЛЬ. Не серверный, а НАШ: у плана есть потолок в 64 КБ на весь документ,
 * и 64 назначения по абзацу каждое упёрлись бы в него молча — отказом двери в конце работы. Число
 * взято от соседа по смыслу: описание ткани на экране рендера («fine rib jersey, matte…») живёт в
 * одну строку, и деталь описывают так же коротко.
 */
export const COLOUR_WORDS_MAX = 120;

/** Чернила чертежа и бумага. Метками они не бывают — довод в шапке. */
export const PLAN_INK_BLACK = '#000000';
export const PLAN_INK_WHITE = '#ffffff';

/* ─────────────────────────── документ плана ─────────────────────────── */

/** Одна метка карты: цвет, который кто-то держал в руке, и сколько его выжило точным совпадением. */
export type PlanSwatch = { hex: string; px: number };

/** Один покрашенный вид. `baseMediaId` — тот флэт, по которому красили; чужой флэт = карта устарела. */
export type PlanMap = {
  mediaId: number;
  view: string;
  baseMediaId: number;
  palette: PlanSwatch[];
  /**
   * АДРЕС САМОЙ ПОКРАСКИ, ПРИЕХАВШИЙ С ПРОВОДА, — и до него у этой фичи был разрыв, который
   * ломал ровно тот круг, ради которого её делали. Карта хранила ТОЛЬКО номер картинки, а
   * читать медиа по номеру контракт не умеет: после перезагрузки покраску нельзя было ни
   * показать, ни открыть на доводку — палитра и назначения выживали, плитка откатывалась на
   * флэт. Теперь лента отдаёт карту вместе с её `MediaFull`, как это давно делает `DesignInputRef`.
   * Пустая строка — «картинки здесь нет», и второй способ это сказать не заводится (см. `gone`).
   */
  url: string;
  /**
   * СЕРВЕР СКАЗАЛ, ЧТО СТРОКА МЕДИА УДАЛЕНА. Это НЕ то же, что пустой `url`: пустой адрес значит
   * «мы не знаем», а `gone` — «мы знаем, что её нет». Разница дорогая: карта, которой нет, не
   * имеет права уехать с прогоном, иначе промпт сошлётся на картинку, которая не поедет, — та
   * самая находка 1 ревью `5dbb3b5`. Поэтому состояние карты читает `gone` РАНЬШЕ геометрии.
   */
  gone: boolean;
};

/** Что значит один покрашенный цвет: ткань, цвет, слова — или пока ничего. */
export type PlanCloth = {
  hex: string;
  assetId: number;
  colourHex: string;
  words: string;
  parts: string;
};

export type ColourPlanDoc = { rev: number; maps: PlanMap[]; cloths: PlanCloth[] };

/**
 * ⚠ ФУНКЦИЯ, А НЕ КОНСТАНТА, И ЭТО НЕ ПЕДАНТИЗМ. Общая константа отдала бы ОДНИ И ТЕ ЖЕ массивы
 * каждому читателю; первый же, кто их подтолкнёт, подтолкнёт их у всех — и «пустой план» перестал
 * бы быть пустым для карточки, которую никто не открывал.
 */
export const emptyPlan = (): ColourPlanDoc => ({ rev: 0, maps: [], cloths: [] });

/* ─────────────────────────── hex ─────────────────────────── */

/**
 * HEX МЕТКИ — шесть знаков в нижнем регистре или ''. Тот же разбор, что у всей полосы
 * (`normaliseHex` в `assets/model`), потому что второй разбор одного значения — это второй ответ
 * на вопрос «это вообще цвет», и расходятся они молча.
 */
export const planHex = (value?: string | null): string => normaliseHex(value ?? '');

/**
 * ЦВЕТ, КОТОРЫЙ МОЖЕТ БЫТЬ МЕТКОЙ. Чёрное и белое исключены ЗДЕСЬ, у одного предиката, а не
 * условием в трёх местах: запись чернил, скан и сборщик посылки обязаны понимать «метку» одинаково,
 * иначе покрашенное белым доехало бы до промпта как деталь, которой человек не размечал.
 */
export const isMapInk = (hex?: string | null): boolean => {
  const v = planHex(hex);
  return v !== '' && v !== PLAN_INK_BLACK && v !== PLAN_INK_WHITE;
};

const packHex = (hex: string): number => parseInt(hex.slice(1), 16) & 0xffffff;

/* ─────────────────────────── случайный мазок ─────────────────────────── */

/**
 * ПОРОГ «ЭТО СЛУЧАЙНОСТЬ, А НЕ ДЕТАЛЬ»: `max(64, площадь·0.0002)`. Три пикселя, задетые краем
 * кисти по дороге, — не деталь изделия, и ворота не имеют права требовать за них ткань. Строка при
 * этом ПОКАЗЫВАЕТСЯ («stray · 3 px»): молча выброшенный цвет читался бы как «я красил, а оно не
 * записалось». На провод такая строка не уезжает, и промпт её не называет.
 *
 * ⚠ ПЛОЩАДЬ БЕРЁТСЯ У БАЗОВОГО ФЛЭТА, А НЕ У САМОЙ КАРТЫ, И ЦЕНА НАЗВАНА. На проводе у
 * `DesignColourMap` нет ни ширины, ни высоты, а холст редактора — это база, ужатая до потолка
 * растра, то есть площадь может отличаться в разы. Порог от этого не портится: он отделяет
 * «десятки случайных пикселей» от «залитой детали», и между 125 и 250 не лежит ни одна настоящая
 * деталь. ОДНА функция и ОДНО место вызова — потому что два порога на одно решение разошлись бы
 * молча, и первым это увидел бы человек, у которого ворота требуют ткань за мазок в три пикселя.
 */
export const STRAY_PX_FLOOR = 64;

export const strayCeiling = (area: number): number =>
  Math.max(STRAY_PX_FLOOR, Math.round(Math.max(0, area) * 0.0002));

/** Площадь базового флэта этой карты в пикселях, или 0 — «полоса не назвала размера». */
export function baseArea(band: GetDesignBandResponse, map: PlanMap): number {
  const side = benchSides(band).find((s) => s.view === map.view);
  const full = side?.picture?.media?.media?.fullSize;
  const w = full?.width ?? 0;
  const h = full?.height ?? 0;
  return w > 0 && h > 0 ? w * h : 0;
}

/* ─────────────────────────── скан по ЗАКРЫТОМУ множеству ─────────────────────────── */

/**
 * СКОЛЬКО ПИКСЕЛЕЙ КАЖДОГО ЗАПИСАННОГО ЦВЕТА ВЫЖИЛО НА ДОКУМЕНТЕ.
 *
 * ⚠ КАНДИДАТЫ ПРИХОДЯТ СНАРУЖИ И БОЛЬШЕ ЭТА ФУНКЦИЯ НИОТКУДА ИХ НЕ БЕРЁТ. Она не умеет узнать
 * цвет, которого ей не назвали, — и в этом весь её смысл: мягкий край заливки, антиалиасинг кисти
 * и шум JPEG под ней просто не проходят точное равенство. Открой множество — и палитра наполнится
 * оттенками, которых никто не выбирал (довод целиком в шапке файла).
 *
 * `a === 255` — второе условие той же породы: полупрозрачный пиксель это КРАЙ, а не заливка.
 * Порядок ответа — порядок кандидатов, то есть порядок покраски; закрашенные насмерть (`px = 0`)
 * не возвращаются вовсе.
 */
export function exactPalette(
  pixels: Uint8ClampedArray,
  candidates: readonly string[],
): PlanSwatch[] {
  const want = new Map<number, number>();
  const order: string[] = [];
  for (const raw of candidates) {
    const hex = planHex(raw);
    if (!isMapInk(hex)) continue;
    const packed = packHex(hex);
    if (want.has(packed)) continue;
    want.set(packed, order.length);
    order.push(hex);
  }
  const counts: number[] = new Array<number>(order.length).fill(0);
  if (order.length === 0) return [];

  /** Номер полки для цвета — ТОЛЬКО если этот цвет кто-то держал в руке; -1 для всего прочего. */
  const admit = (packed: number): number => want.get(packed) ?? -1;

  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3] !== 255) continue;
    const packed = (pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2];
    const slot = admit(packed);
    if (slot < 0) continue;
    counts[slot] += 1;
  }
  const out: PlanSwatch[] = [];
  for (let i = 0; i < order.length; i += 1) if (counts[i] > 0) out.push({ hex: order[i], px: counts[i] });
  return out;
}

/* ─────────────────────────── провод → документ ─────────────────────────── */

export function readMap(wire: common_DesignColourMap): PlanMap {
  const palette: PlanSwatch[] = [];
  for (const s of wire.palette ?? []) {
    /* НЕ-МЕТКА С ПРОВОДА ОТБРАСЫВАЕТСЯ МОЛЧА, И ЭТО НЕ СНИСХОДИТЕЛЬНОСТЬ: чёрное, белое и
       полуназванный hex не могут стать строкой меню, потому что ткань им назначить некуда —
       промпт печатает метку дословно, а метки, которой нет на карте, он не найдёт. */
    const hex = planHex(s.hex);
    if (!isMapInk(hex)) continue;
    palette.push({ hex, px: Math.max(0, s.px ?? 0) });
  }
  return {
    mediaId: wire.mediaId ?? 0,
    view: (wire.view ?? '').trim(),
    baseMediaId: wire.baseMediaId ?? 0,
    palette,
    /* Полный размер, потом миниатюра: карту открывают на доводку, а не разглядывают в ленте. */
    url: wire.media?.media?.fullSize?.mediaUrl || wire.media?.media?.thumbnail?.mediaUrl || '',
    gone: wire.deleted === true,
  };
}

export function readCloth(wire: common_DesignColourCloth): PlanCloth | null {
  const hex = planHex(wire.hex);
  if (!isMapInk(hex)) return null;
  return {
    hex,
    assetId: wire.assetId ?? 0,
    colourHex: planHex(wire.colourHex),
    words: (wire.words ?? '').trim(),
    parts: (wire.parts ?? '').trim(),
  };
}

/**
 * ПЛАН ЭТОЙ КАРТОЧКИ — ИЛИ `undefined`, И ЭТО РАЗНЫЕ ОТВЕТЫ.
 *
 * ⚠ `undefined` ЗНАЧИТ «ЭТОТ СЕРВЕР ПРО ПЛАН НЕ ГОВОРИТ», а пустой документ (`emptyPlan()`) — «план пуст». Та же
 * доктрина, что у `has_fabric_render`, и здесь она стоит денег: клиент новее сервера отправил бы
 * прогон, у которого protojson молча выбросил бы `colour_maps` и `map_hex`, — то есть купил бы
 * картинку по вопросу, которого никто не задавал. Дверь покраски и посылка карт закрыты, пока
 * полоса не назвала план хотя бы пустым.
 */
export function readColourPlan(band: GetDesignBandResponse): ColourPlanDoc | undefined {
  const wire: common_DesignColourPlan | undefined | null = band.colourPlan;
  if (wire === undefined) return undefined;
  if (wire === null) return emptyPlan();
  const maps: PlanMap[] = [];
  for (const m of wire.maps ?? []) maps.push(readMap(m));
  const cloths: PlanCloth[] = [];
  const seen = new Set<string>();
  for (const c of wire.cloths ?? []) {
    const one = readCloth(c);
    /* ⚠ ДУБЛЬ HEX ОТБРАСЫВАЕТСЯ УЖЕ НА ЧТЕНИИ. Две строки на один покрашенный цвет — это два
       взаимоисключающих утверждения об одной области, оба абсолютных («and on no other part»).
       Сервер их не хранит; если такое всё же приехало, экран обязан показать ОДНО. */
    if (!one || seen.has(one.hex)) continue;
    seen.add(one.hex);
    cloths.push(one);
  }
  return { rev: wire.rev ?? 0, maps, cloths };
}

/* ─────────────────────────── документ → провод ─────────────────────────── */

export const writeMap = (m: PlanMap): common_DesignColourMap => ({
  mediaId: m.mediaId,
  view: m.view,
  baseMediaId: m.baseMediaId,
  palette: m.palette.slice(0, PLAN_PALETTE_MAX).map((s) => ({ hex: s.hex, px: s.px })),
  /* ⚠ КЛИЕНТ НЕ УТВЕРЖДАЕТ НИ ОДНОГО ИЗ ЭТИХ ДВУХ ПОЛЕЙ, И ЭТО НЕ ЛЕНЬ. Оба вычисляет сервер
     на чтении, приджойнивая медиа по номеру; отправить их обратно значило бы заморозить в плане
     адрес, который к моменту следующего чтения может уже ничего не значить, — и хуже, дать
     клиенту способ объявить карту живой. Номер картинки — единственное, что здесь наше. */
  media: undefined,
  deleted: false,
});

export const writeCloth = (c: PlanCloth): common_DesignColourCloth => ({
  hex: c.hex,
  assetId: c.assetId,
  colourHex: c.colourHex,
  words: c.words,
  parts: c.parts,
});

/* ─────────────────────────── состояние карты ─────────────────────────── */

export type MapState = 'ok' | 'stale' | 'orphan' | 'lost';

/**
 * ЧТО С ЭТОЙ КАРТОЙ СЕЙЧАС.
 *   `ok`     — её база всё ещё стоит в слоте своего вида;
 *   `stale`  — в слоте ДРУГАЯ картинка: геометрия, по которой красили, ушла, и посылать карту
 *              нельзя (модель линовала бы метки по чертежу, которого в прогоне нет);
 *   `orphan` — слот пуст вовсе: вид выпал из прогона, и карте не к чему относиться;
 *   `lost`   — сама покраска удалена: строка медиа снесена, и восстановить её нечем.
 *
 * ⚠ `lost` ЧИТАЕТСЯ ПЕРВЫМ, И ПОРЯДОК ЗДЕСЬ — ЭТО ПРАВИЛО, А НЕ ОФОРМЛЕНИЕ. Карта, чьей картинки
 * больше нет, не может быть `ok`, даже если её база всё ещё стоит в слоте: геометрия совпадает,
 * а посылать нечего. Спроси мы геометрию первой, такая карта прошла бы в `sendableMaps` и промпт
 * сослался бы на изображение, которое не поехало (ревью `5dbb3b5`, находка 1).
 */
export function mapState(band: GetDesignBandResponse, map: PlanMap): MapState {
  if (map.gone) return 'lost';
  const side = benchSides(band).find((s) => s.view === map.view);
  const now = side?.picture?.media?.id ?? 0;
  if (now <= 0) return 'orphan';
  return now === map.baseMediaId ? 'ok' : 'stale';
}

/** Карты, которые ЗАКОННО уезжают с прогоном: живые, по одной на вид, не больше потолка. */
export function sendableMaps(band: GetDesignBandResponse, plan: ColourPlanDoc): PlanMap[] {
  const views = new Set(renderSheetViews(band));
  const out: PlanMap[] = [];
  const takenView = new Set<string>();
  const takenMedia = new Set<number>();
  for (const m of plan.maps) {
    if (m.mediaId <= 0) continue;
    if (!views.has(m.view)) continue;
    if (mapState(band, m) !== 'ok') continue;
    /* ⚠ ОДНА КАРТИНКА — ОДНА КАРТА, И ЭТО ПРАВИЛО СЕРВЕРА, А НЕ ВКУС. Список входных картинок
       дедуплицируется по media id и склеивает подписи, поэтому один файл, объявленный картой двух
       видов, доезжает до платного промпта предложением «Images 3 and 3». */
    if (takenView.has(m.view) || takenMedia.has(m.mediaId)) continue;
    takenView.add(m.view);
    takenMedia.add(m.mediaId);
    out.push(m);
    if (out.length >= PLAN_MAPS_MAX) break;
  }
  return out;
}

/** Назначение, которое ЧТО-ТО говорит. `parts` сюда НЕ входит — контракт называет ровно три поля. */
export const clothStated = (c: PlanCloth): boolean =>
  c.assetId > 0 || c.colourHex !== '' || c.words !== '';

export const clothOfHex = (plan: ColourPlanDoc, hex: string): PlanCloth | undefined =>
  plan.cloths.find((c) => c.hex === planHex(hex));

/** Один покрашенный цвет ЦЕЛИКОМ: сколько его, случаен ли он, и что он значит. */
export type PlanColour = {
  hex: string;
  px: number;
  /** Доля покрашенного — то самое «12%», которое видно на строке. */
  share: number;
  /** Мазок в три пикселя: показывается, но ничего не требует и никуда не едет. */
  stray: boolean;
  cloth: PlanCloth | undefined;
  stated: boolean;
  /** Виды, на которых этот цвет встречается, — для подписи строки. */
  views: string[];
};

/**
 * ═══ ЕДИНСТВЕННОЕ ЧТЕНИЕ ПАЛИТРЫ, И ЕГО ЧИТАЮТ ВСЕ ═══════════════════════════════════════════
 *
 * Ряды на экране, ворота и сборщик посылки читают ЭТОТ список. Собери его в трёх местах — и первое
 * же расхождение стоит купленной картинки: экран показал бы ткань там, где посылка её не назвала.
 * Порядок — порядок первой покраски: промпт зовёт первую CLOTH 1 и относит к ней скаляры цвета.
 */
export function planColours(
  band: GetDesignBandResponse,
  plan: ColourPlanDoc,
  maps: readonly PlanMap[] = sendableMaps(band, plan),
): PlanColour[] {
  const at = new Map<string, number>();
  const rows: { hex: string; px: number; ceiling: number; views: string[] }[] = [];
  for (const m of maps) {
    const ceiling = strayCeiling(baseArea(band, m));
    for (const s of m.palette) {
      const seat = at.get(s.hex);
      if (seat === undefined) {
        at.set(s.hex, rows.length);
        rows.push({ hex: s.hex, px: s.px, ceiling, views: [m.view] });
      } else {
        rows[seat].px += s.px;
        rows[seat].ceiling = Math.max(rows[seat].ceiling, ceiling);
        rows[seat].views.push(m.view);
      }
    }
  }
  const painted = rows.reduce((sum, r) => sum + r.px, 0);
  return rows.map((r) => {
    const cloth = clothOfHex(plan, r.hex);
    return {
      hex: r.hex,
      px: r.px,
      share: painted > 0 ? r.px / painted : 0,
      stray: r.px < r.ceiling,
      cloth,
      stated: !!cloth && clothStated(cloth),
      views: r.views,
    };
  });
}

/* ─────────────────────────── ткани прогона ─────────────────────────── */

/**
 * ═══ ТКАНИ, СОБРАННЫЕ ИЗ ПЛАНА — ОДНА СТРОКА НА ПОКРАШЕННЫЙ ЦВЕТ ══════════════════════════════
 *
 * Порядок — порядок палитры, то есть порядок покраски: промпт зовёт первую CLOTH 1 и относит к ней
 * скаляры цвета, значит «первый покрашенный» обязан быть виден и здесь, и на экране.
 *
 * ⚠ `map_hex` СТАВИТСЯ ТОЛЬКО ТОМУ ЦВЕТУ, КОТОРЫЙ ЕСТЬ НА ПАЛИТРЕ УЕЗЖАЮЩЕЙ КАРТЫ. Это первая из
 * трёх дверей ревью `5dbb3b5`: сервер ФОРМАТ проверяет, а «есть ли вообще карта» — нет, и
 * непустой `map_hex` без карты взводит на бэкенде правило «отметки есть» и печатает в ПЛАТНЫЙ
 * промпт «used on the parts painted steel blue (#3a7bd5) on the colour map» — ссылку на картинку,
 * которая никуда не уезжала. Здесь карта и метка приходят из ОДНОГО источника, поэтому расходиться
 * им нечем.
 *
 * ⚠ И ДВА ЦВЕТА НЕ МОГУТ ПРИТВОРИТЬСЯ ОДНИМ. Ключ строки — hex, дубли отброшены на чтении, а
 * `seenHex` ниже — второй сторож у самой посылки: две ткани с одним `map_hex` заявляют об одной
 * области два взаимоисключающих абсолютных утверждения.
 */
export function planFabrics(
  band: GetDesignBandResponse,
  plan: ColourPlanDoc,
  maps: readonly PlanMap[] = sendableMaps(band, plan),
): common_DesignFabricUse[] {
  /* ⚠ БЕЗ КАРТЫ НЕТ И МЕТКИ. Пустой список карт — это «покраской ничего не размечено», и тогда
     этот сборщик не производит НИ ОДНОЙ строки: ткани прогона в таком случае собирает сетка
     текстур своим прежним путём, а `map_hex` не появляется на проводе вовсе. */
  if (maps.length === 0) return [];
  const out: common_DesignFabricUse[] = [];
  const seenHex = new Set<string>();
  for (const colour of planColours(band, plan, maps)) {
    if (!colour.stated || colour.stray) continue;
    if (seenHex.has(colour.hex)) continue;
    seenHex.add(colour.hex);
    const cloth = colour.cloth!;
    out.push(
      fabricUseOf(band, cloth.assetId, {
        /* ЦВЕТ САМОЙ ТКАНИ: выбранный руками старше цвета лоскута — это ранг 2 порядка
           старшинства, тот же, что у пикера на экране рендера. Пусто — остаётся цвет ассета. */
        ...(cloth.colourHex ? { colourHex: cloth.colourHex } : {}),
        ...(cloth.words ? { words: cloth.words } : {}),
        parts: cloth.parts,
        mapHex: colour.hex,
      }),
    );
  }
  return out;
}

/* ─────────────────────────── двери, которые не дают купить ложь ─────────────────────────── */

/** Медиа, которые уже уезжают с прогоном в другой роли: плиты верстака, референсы, лоскуты тканей. */
export function runPictureIds(
  band: GetDesignBandResponse,
  fabrics: readonly common_DesignFabricUse[],
): Map<number, string> {
  const roles = new Map<number, string>();
  for (const side of benchSides(band)) {
    const id = side.picture?.media?.id ?? 0;
    if (id > 0) roles.set(id, `the ${viewLabel(side.view)} plate`);
  }
  for (const r of band.references ?? []) {
    const id = r.mediaId ?? 0;
    if (id > 0 && !roles.has(id)) roles.set(id, 'a reference');
  }
  for (const f of fabrics) {
    const id = f.mediaId ?? 0;
    if (id > 0 && !roles.has(id)) roles.set(id, `the swatch of ${(f.name ?? '').trim() || 'a cloth'}`);
  }
  return roles;
}

export type PlanGate = { ok: true } | { ok: false; reason: string };

/**
 * ═══ ЧТО ДОЛЖНО БЫТЬ ПРАВДОЙ ДО ДЕНЕГ ═════════════════════════════════════════════════════════
 *
 * Три отказа — это ТРИ ДВЕРИ, КОТОРЫЕ ТЕПЕРЬ СТОЯТ И НА СЕРВЕРЕ (ревью `5dbb3b5`, находки 1, 2, 3).
 * Сервер откажет словами; экран обязан не доводить до отказа — «дверь погасла с причиной» и «мы
 * послали, а нам вернули ошибку» это разные экраны для руки, и второй стоит одного круга ожидания.
 *
 * ЧЕТВЁРТЫЙ ОТКАЗ — НАШ И ТОЛЬКО НАШ: цвет, который человек покрасил и ни во что не назначил.
 * Сервер такого не видит вовсе (в `fabrics` он не попадает), и молча выбросить его нельзя: его
 * красили НАРОЧНО, деталь на карте есть, а промпт про неё не скажет ничего.
 */
export function colourPlanGate(
  band: GetDesignBandResponse,
  plan: ColourPlanDoc | undefined,
): PlanGate {
  if (!plan) return { ok: true };
  if (plan.maps.length === 0) return { ok: true };

  const stale = plan.maps.filter((m) => mapState(band, m) === 'stale');
  if (stale.length > 0) {
    const which = stale.map((m) => viewLabel(m.view)).join(', ');
    return {
      ok: false,
      reason: `the ${which} flat changed after it was painted — repaint that colour map or drop it, or the marks would be lined up against a drawing this run does not carry`,
    };
  }

  const maps = sendableMaps(band, plan);
  if (maps.length === 0) return { ok: true };

  /* СЛУЧАЙНЫЙ МАЗОК НИЧЕГО НЕ ТРЕБУЕТ — он и на провод не едет. Требовать ткань за три пикселя
     значило бы держать дверь закрытой ради пятна, которого человек не рисовал. */
  const unassigned = planColours(band, plan, maps).filter((c) => !c.stated && !c.stray);
  if (unassigned.length > 0) {
    const first = unassigned[0];
    return {
      ok: false,
      reason: `say what cloth ${first.hex} is — pick a texture, a colour or words on its row${unassigned.length > 1 ? ` (${unassigned.length} painted colours are still unassigned)` : ''}`,
    };
  }

  const fabrics = planFabrics(band, plan, maps);
  const roles = runPictureIds(band, fabrics);
  for (const m of maps) {
    const role = roles.get(m.mediaId);
    if (role) {
      return {
        ok: false,
        reason: `the ${viewLabel(m.view)} colour map is the same picture as ${role} — one image cannot be both a drawing to render and a sheet of labels. Repaint that view`,
      };
    }
  }
  return { ok: true };
}

/**
 * ЦВЕТА, КОТОРЫЕ ПОКРАШЕНЫ, НО НИЧЕГО НЕ ЗНАЧАТ — для строки-отказа и для пилюль на экране.
 * Считается по УЕЗЖАЮЩИМ картам: цвет с устаревшей карты не требуется ничем, потому что и сама
 * карта никуда не поедет.
 */
export function unassignedHexes(band: GetDesignBandResponse, plan: ColourPlanDoc): string[] {
  return planColours(band, plan)
    .filter((c) => !c.stated && !c.stray)
    .map((c) => c.hex);
}

/**
 * ═══ РЕЦЕПТ ПРОГОНА ПОД ПОКРАСКОЙ — ОДНА ТОЧКА КОМПОЗИЦИИ ════════════════════════════════════
 *
 * Ворота, строка денег, модалка «what the model gets» и тело запроса читают ОДИН объект — тот же
 * закон, по которому на этом экране живёт `sent`. Собери его в четырёх местах, и первое же
 * расхождение стоит купленной картинки.
 *
 * ⚠ КАРТ НЕТ — РЕЦЕПТ ВОЗВРАЩАЕТСЯ БАЙТ В БАЙТ ТЕМ ЖЕ. Это и есть обещание «непокрашенный прогон
 * не изменился ни одним полем»: ни `colour_maps`, ни `map_hex` не появляются на проводе вовсе, и
 * промпт остаётся тем же, что вчера.
 *
 * ⚠ И ЭТО ЗАМЕНА СПИСКА ТКАНЕЙ, А НЕ ДОБАВКА К НЕМУ. Под покраской ткани перечисляет палитра;
 * оставить рядом чипы сетки значило бы послать ткань «неизвестно на чём» рядом с размеченными —
 * при том что промпт печатает каждой из них абсолютное «and on no other part of this garment».
 *
 * ⚠ СКАЛЯРЫ ЦВЕТА И СЛОВА НЕ ТРОГАЮТСЯ. Их пишет человек, и они старше всякого производного
 * (ранг 2 порядка старшинства). Пересчитывается ровно `fabric_media_id` — «главная фотография» —
 * потому что он СТРУКТУРНЫЙ: рангом он не защищён ни здесь, ни в `mergeEcho`, и промпт называет
 * им картинку ПЕРВОЙ ткани списка. Список сменился — обязан смениться и он.
 */
export function planRecipe(
  band: GetDesignBandResponse,
  plan: ColourPlanDoc | undefined,
  base: common_DesignColourRecipe,
): common_DesignColourRecipe {
  if (!plan) return base;
  const maps = sendableMaps(band, plan);
  if (maps.length === 0) return base;
  const fabrics = planFabrics(band, plan, maps);
  if (fabrics.length === 0) return base;
  return {
    ...base,
    fabrics,
    fabricMediaId: fabrics.find((f) => (f.mediaId ?? 0) > 0)?.mediaId ?? 0,
    colourMaps: maps.map(writeMap),
  };
}

/** Карты прогона на проводе — ровно те, что признаны уезжающими. */
export const wireColourMaps = (
  band: GetDesignBandResponse,
  plan: ColourPlanDoc | undefined,
): common_DesignColourMap[] => (plan ? sendableMaps(band, plan).map(writeMap) : []);

/**
 * ПОДПИСЬ ПОД ПЛИТКОЙ ВИДА — состояние карты словом. `''` значит «карты нет», и это не пропуск:
 * непокрашенный вид законен, промпт про него говорит «деление перенесите с покрашенного».
 */
export function mapBadge(band: GetDesignBandResponse, map: PlanMap | undefined): string {
  if (!map) return '';
  const state = mapState(band, map);
  /* ⚠ `lost` СТОИТ ПЕРВЫМ И НАЗЫВАЕТ ПОТЕРЮ, А НЕ ЧИСЛО. У такой карты палитра цела — образцы
     хранятся в плане, а не в файле, — и `N colours` был бы правдой о плане и ложью об экране:
     плитка показывает флэт, потому что показывать больше нечего. Слово должно совпадать с тем,
     что человек видит, иначе он будет искать покраску, которой нет. */
  if (state === 'lost') return 'picture gone';
  if (state === 'stale') return 'stale';
  if (state === 'orphan') return 'no flat';
  const n = map.palette.length;
  return `${n} colour${n === 1 ? '' : 's'}`;
}
