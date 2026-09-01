import type {
  common_DesignAsset,
  common_DesignAssetPlacement,
  common_DesignPicture,
  common_TechCardAnnotation,
  GetDesignBandResponse,
} from 'api/proto-http/admin';
import { annotationKindToWire } from 'ui/components/annotation/wire';

import {
  assetFull,
  assetIsPattern,
  assetLabel,
  clothShelf,
  placementsOnPicture,
} from '../../assets/model';
import { viewLabel } from '../../views';
import { benchSides, isFlatCandidate } from '../model';

/**
 * ПРИМЕРКА ТКАНИ НА ФЛЭТЕ — СЧЁТНАЯ ЧАСТЬ (K-14).
 *
 * Владелец: «на вкладке паттерны можно генерить паттерны а давай разметка уже будет в разделе
 * рендерс», и хвостом к K-13 — «можем взять какой нибудь флет… обрезать там белый фон и прикинуть
 * размер этого паттерна руками увеличить или уменьшить». То есть ПРИМЕРКА, а не генерация: ни
 * одного платного вызова, ни одного нового медиа.
 *
 * ═══ ЧТО ИЗ ЭТОГО ВООБЩЕ МОЖНО СОХРАНИТЬ, И ПОЧЕМУ ЭТО ДВА РАЗНЫХ ГЛАГОЛА ═══════════════════
 *
 * `SetDesignAssetPlacementRequest` НЕ НЕСЁТ НИ МАСШТАБА, НИ ПОВОРОТА. На проводе у него ровно
 * шесть полей: tech_card_id, placement_id, asset_id, picture_id, annotation, note. Раппорт и
 * поворот живут на САМОМ АССЕТЕ (`design_asset.repeat_mm`, `design_asset.rotation_deg`) и
 * пишутся `UpsertDesignAsset`. Это не обход контракта, а его форма: ткань имеет один раппорт на
 * всю карточку, а не свой на каждом флэте, — «как крупно печатать» это свойство ПОЛОТНА.
 *
 * Отсюда два писателя вместо одного, и каждый называет свою цену на экране:
 *   • раппорт и поворот  → `assetSaveInput` → UpsertDesignAsset → меняет ткань ВЕЗДЕ на карточке;
 *   • «эта ткань здесь»  → `pinAnnotation`  → SetDesignAssetPlacement → метка на ОДНОМ флэте.
 *
 * ⚠ ТРЕТЬЕГО НЕТ. Пролёт кадра, положение подложки и выбранный отрезок сравнения не хранятся
 * нигде — их не примет ни одна из двух ручек. Экран обязан сказать это словами (`SURVIVES`), а не
 * оставить человека гадать, почему после перезагрузки картинка другая.
 */

/* ─────────────────────────── что можно примерять ─────────────────────────── */

/**
 * ФЛЭТЫ КАРТОЧКИ — ТЕМ ЖЕ ЧИТАТЕЛЕМ, ЧТО И ВЕСЬ РАЗДЕЛ RENDER.
 *
 * `isFlatCandidate` уже отказывает склейкам, скрытым кадрам и выводам генеративных машин
 * (render/threed/recolor), и отказывает по роду ПРОГОНА, а не по объявленному роду картинки —
 * рекол объявляет себя рендером сам. Свой второй предикат здесь разошёлся бы с полосой INPUT в
 * первый же день: там человек видит один список флэтов, здесь — другой, и оба называются «флэты
 * этой карточки».
 *
 * КАДР БЕЗ ФАЙЛА ОТСЕЯН ДОПОЛНИТЕЛЬНО, и это не дубль проверки. `isFlatCandidate` отвечает на
 * вопрос «того ли это рода» (и там же снимает скрытые), а не «есть ли что показать»: у картинки,
 * чья строка media пропала, род законный, а `src` пустой — примерка на пустом `src` рисует ткань в
 * форме прямоугольника и читается как «флэт стал квадратом».
 *
 * ⚠ КАРТИНКИ ЛЕЖАТ В ДВУХ МЕСТАХ, А НЕ В ОДНОМ СПИСКЕ. У полосы нет плоского `pictures`: кадры
 * висят на прогонах (`runs[].pictures`) и на загрузках (`batches[].pictures`), и собирать надо оба
 * — ровно так это делает `unmarkedFlats` рядом. Взять один источник значило бы потерять либо всё
 * загруженное руками, либо всё нарисованное машиной, и потерять молча.
 */
export function fittingFlats(band: GetDesignBandResponse): common_DesignPicture[] {
  const out: common_DesignPicture[] = [];
  const seen = new Set<number>();
  const push = (pictures?: common_DesignPicture[] | null) => {
    for (const p of pictures ?? []) {
      const id = p.id ?? 0;
      if (id <= 0 || seen.has(id)) continue;
      if (!isFlatCandidate(band, p) || pictureUrl(p) === '') continue;
      seen.add(id);
      out.push(p);
    }
  };
  for (const run of band.runs ?? []) push(run.pictures);
  for (const batch of band.batches ?? []) push(batch.pictures);
  return out;
}

/**
 * ПОДПИСЬ ФЛЭТА. Вид из СЛОТА ВЕРСТАКА, если кадр в нём стоит, и только потом `ghostView`.
 *
 * Порядок не косметический: слот — это УТВЕРЖДЕНИЕ человека о том, какой это вид, а `ghostView` —
 * догадка загрузчика по имени файла. Ряд INPUT подписывает флэты видом слота по той же причине;
 * подписать здесь догадкой значило бы назвать один и тот же кадр по-разному на двух экранах.
 */
export function flatLabel(band: GetDesignBandResponse, picture: common_DesignPicture): string {
  const id = picture.id ?? 0;
  const inSlot = benchSides(band, 'flat').find((s) => (s.picture?.id ?? 0) === id);
  return viewLabel(inSlot?.view) || viewLabel(picture.ghostView) || `flat ${id}`;
}

/**
 * ТКАНИ И ПАТТЕРНЫ КАРТОЧКИ — `clothShelf`, тот же читатель, что у палитры и у ряда CLOTH.
 *
 * Сужено до ассетов С КАРТИНКОЙ, и это сужение по существу примерки: подкладывать под флэт нечего,
 * когда ткань названа словами и цветом. Ассет без медиа при этом НЕ ошибка — он законен по
 * контракту («0 = the asset is stated in words and colour only»), поэтому пустой список здесь
 * значит «нечего примерять», а не «полка пуста», и экран говорит именно это.
 */
export function fittingCloths(band: GetDesignBandResponse): common_DesignAsset[] {
  return clothShelf(band).filter((a) => assetFull(a) !== '');
}

export const pictureUrl = (p?: common_DesignPicture | null): string =>
  p?.media?.media?.fullSize?.mediaUrl || p?.media?.media?.thumbnail?.mediaUrl || '';

/* ─────────────────────────── масштаб: миллиметры, а не проценты ─────────────────────────── */

/**
 * ПРОЛЁТ КАДРА — СКОЛЬКО МИЛЛИМЕТРОВ ТКАНИ ПОПЕРЁК ФЛЭТА.
 *
 * ЭТО ЗНАМЕНАТЕЛЬ, БЕЗ КОТОРОГО САНТИМЕТРЫ — ЛОЖЬ. Плитка укладывается по ширине КОРОБКИ, и доля
 * `repeat/пролёт` превращается в сантиметры только тогда, когда пролёт назван. Показать вместо
 * этого «масштаб 40%» значило бы назвать процент от неназванной величины: сорок процентов чего?
 * У самого флэта такого числа на проводе нет — картинка не знает, какой ширины изделие на ней, —
 * поэтому число называет человек, и экран говорит, что это ДОПУЩЕНИЕ, а не измерение.
 *
 * СЛОВАРЬ ОДИН НА ДВА ЭКРАНА. Отрезки берутся из `pattern/tile-preview` (`SPANS`): полоса-линейка
 * K-13 прикладывает плитку ровно к этим трём и теми же словами. Свой список здесь был бы вторым
 * членом одного словаря — приёмом, за который этот репозиторий уже платил: «500 мм» на одном
 * экране и «600 мм» на другом расходятся молча, а спорят они про одну и ту же ткань.
 *
 * ⚠ БЕРЁТСЯ ИЗ ЛИСТА, А НЕ ИЗ `pattern/index`, И ЭТО НЕ ВКУСОВЩИНА. Полдюжины файлов `pattern/**`
 * импортируют `../render`; импорт индекса паттернов отсюда замкнул бы кольцо
 * render → placement → pattern → render, а кольцо модулей выдаёт себя не ошибкой сборки, а
 * `undefined` у случайного экспорта в рантайме. `tile-preview` не импортирует из `render` ничего.
 */
export { SPANS } from '../../pattern/tile-preview';

/** Пролёт по умолчанию: флэт рисуют во всю ширину изделия, а это половина обхвата груди. */
export const DEFAULT_SPAN_MM = 500;

/**
 * ДОЛЯ ШИРИНЫ КАДРА, КОТОРУЮ ЗАНИМАЕТ ОДНА ПЛИТКА, В ПРОЦЕНТАХ.
 *
 * НИКОГДА НЕ НОЛЬ: `background-size: 0` браузер рисует как «фона нет», то есть примерка молча
 * показала бы голый флэт и читалась бы как сломанная. Нижняя граница оставляет плитку различимой
 * даже при пятимиллиметровом раппорте на метровом пролёте.
 */
export function tilePercent(repeatMm: number, spanMm: number): number {
  if (repeatMm <= 0 || spanMm <= 0) return 0;
  return Math.max(0.2, (repeatMm / spanMm) * 100);
}

/** Сколько плиток укладывается поперёк кадра — то, что глаз проверяет по картинке. */
export function tilesAcross(repeatMm: number, spanMm: number): number {
  if (repeatMm <= 0 || spanMm <= 0) return 0;
  return spanMm / repeatMm;
}

/**
 * РАППОРТ СЛОВАМИ — САНТИМЕТРЫ, ПОТОМУ ЧТО РУКАМИ МЕРЯЮТ ИМИ.
 *
 * Число на проводе — целые миллиметры (`repeat_mm`), и оно уезжает в промпт как есть; человек же
 * прикидывает размер рисунка сантиметрами. Показываются ОБА, а не одно вместо другого: подпись,
 * называющая только сантиметры, разошлась бы с числом, которое сохранится.
 */
export function repeatLabel(repeatMm: number): string {
  if (repeatMm <= 0) return 'no repeat stated';
  return `${repeatMm} mm · ${(repeatMm / 10).toFixed(1)} cm`;
}

/** Пределы раппорта — серверные (`MaxDesignAssetRepeatMm`, 1..2000 на паттерне). */
export const REPEAT_MIN_MM = 1;
export const REPEAT_MAX_MM = 2000;
export const ROTATION_MAX_DEG = 359;

export const clampRepeat = (mm: number): number =>
  Math.min(REPEAT_MAX_MM, Math.max(REPEAT_MIN_MM, Math.round(mm || 0)));

/** Поворот замыкается по кругу, а не упирается: 359 + 1 это 0, а не «дальше нельзя». */
export const wrapRotation = (deg: number): number =>
  ((Math.round(deg || 0) % (ROTATION_MAX_DEG + 1)) + ROTATION_MAX_DEG + 1) % (ROTATION_MAX_DEG + 1);

/* ─────────────────────────── запись раппорта: на АССЕТ, целиком ─────────────────────────── */

export type AssetSaveInput = {
  assetId: number;
  kind: string;
  name: string;
  mediaId: number;
  colourCode: string;
  colourHex: string;
  note: string;
  derivedFromAssetId: number;
  repeatMm: number;
  rotationDeg: number;
  ordinal: number;
};

/**
 * ПОЛНЫЙ РЯД АССЕТА С ДВУМЯ НОВЫМИ ЧИСЛАМИ. ⚠ ЭТО ЗАМЕНА, А НЕ ПАТЧ.
 *
 * `UpsertDesignAsset` перезаписывает СТРОКУ ЦЕЛИКОМ — контракт говорит это прямым текстом («EVERY
 * FIELD IS SENT ON EVERY CALL — this is a replace, not a patch»). Поэтому каждое поле, которого
 * примерка не касается, ОБЯЗАНО уехать обратно тем же значением. Забытое поле здесь не «останется
 * прежним»: оно уедет пустым и сотрёт имя, цвет, записку или родословную ткани — молча, с ответом
 * OK, и заметить это можно будет только на другом экране.
 *
 * Именно поэтому функция строит ВЕСЬ ряд из ассета, а не принимает два числа: список полей,
 * который надо не забыть, живёт здесь один раз и проверяется типом, а не памятью вызывающего.
 */
export function assetSaveInput(
  asset: common_DesignAsset,
  repeatMm: number,
  rotationDeg: number,
): AssetSaveInput {
  return {
    assetId: asset.id ?? 0,
    kind: asset.kind ?? '',
    name: assetLabel(asset),
    mediaId: asset.mediaId ?? 0,
    colourCode: (asset.colourCode ?? '').trim(),
    colourHex: (asset.colourHex ?? '').trim(),
    note: (asset.note ?? '').trim(),
    derivedFromAssetId: asset.derivedFromAssetId ?? 0,
    repeatMm: clampRepeat(repeatMm),
    rotationDeg: wrapRotation(rotationDeg),
    ordinal: asset.ordinal ?? 0,
  };
}

export type SaveGate = { ok: true } | { ok: false; reason: string };

/**
 * МОЖНО ЛИ СОХРАНИТЬ РАППОРТ НА ЭТУ ТКАНЬ — ВОПРОС РОДА, И ОТВЕТ НА НЕГО СЕРВЕРНЫЙ.
 *
 * `DesignAssetUpsert.Validate` отказывает дословно: «%q carries a parent or a repeat, and both
 * belong to a pattern» для всякого рода, кроме `pattern`. Обычная ткань раппорта не носит — у
 * полотна его нет, он появляется у НАБИВКИ, — поэтому кнопка на ткани не гаснет молча, а называет
 * серверный довод: иначе человек жмёт, ловит красное и решает, что экран сломан.
 *
 * ПРИМЕРКА ПРИ ЭТОМ РАБОТАЕТ И НА ОБЫЧНОЙ ТКАНИ. Посмотреть, как вещь выглядит в этом полотне, —
 * ровно то, что просил владелец; несохраняемость числа сужает ЗАПИСЬ, а не ПРОСМОТР.
 */
export function repeatSaveGate(asset?: common_DesignAsset | null): SaveGate {
  if (!asset || !(asset.id ?? 0)) return { ok: false, reason: 'pick a cloth first' };
  if (!assetIsPattern(asset)) {
    return {
      ok: false,
      reason:
        'a repeat belongs to a pattern, and this cloth is a plain fabric — the server refuses one here. The fitting still shows it; only the number cannot be kept',
    };
  }
  return { ok: true };
}

/* ─────────────────────────── метка на флэте ─────────────────────────── */

/**
 * ТОЧНОСТЬ ДОЛИ — ЧЕТЫРЕ ЗНАКА, И ЭТО ЗАЩИТА, А НЕ ОФОРМЛЕНИЕ.
 *
 * Координаты едут десятичными строками. Доля, снятая с клика как есть, приходит числом вроде
 * 0.5333333333333333, и в этом виде она и хранится, и сравнивается, и печатается. Четыре знака —
 * это уже доли миллиметра на метровом кадре, то есть точнее, чем человек способен ткнуть.
 */
const COORD_DIGITS = 4;
const coord = (v: number): { value: string } => ({
  value: Math.min(1, Math.max(0, v)).toFixed(COORD_DIGITS),
});

/**
 * ГЕОМЕТРИЯ МЕТКИ: ПИН В ОДНОЙ ТОЧКЕ.
 *
 * ВИД БЕРЁТСЯ ИЗ ОБЩЕГО СЛОВАРЯ (`annotationKindToWire`), а не пишется строкой-литералом. Словарь
 * видов указаний в системе ОДИН — им пользуются и снимок узла сборки, и вложение задачи; вторая
 * копия ключа здесь пережила бы переименование энума молча, а поймать это было бы нечем.
 *
 * ПИН, А НЕ ПОЛИГОН, потому что сервер считает точки по виду (PIN — ровно одна) и потому что
 * примерка отвечает на вопрос «эта ткань — вот здесь», а не обводит границу куска. Обводка — это
 * другой жест и другой экран.
 *
 * `text` ОСТАЁТСЯ ПУСТЫМ намеренно: слова метки живут в `note` рядом, ровно как это делают
 * замороженные выноски полосы. Два места для одного текста разошлись бы.
 */
export function pinAnnotation(x: number, y: number): common_TechCardAnnotation {
  return {
    kind: annotationKindToWire('pin'),
    points: [{ x: coord(x), y: coord(y) }],
    text: '',
    labelX: coord(x),
    labelY: coord(y),
    color: undefined,
    pieceLineKey: '',
    dashed: false,
    filled: false,
    pieceLineKeys: [],
  };
}

/** Доля кадра из метки, пришедшей с провода. Пустая геометрия — центр, а не срыв отрисовки. */
export function pinPoint(p?: common_DesignAssetPlacement | null): { x: number; y: number } {
  const pt = p?.annotation?.points?.[0];
  const x = Number(pt?.x?.value ?? '');
  const y = Number(pt?.y?.value ?? '');
  return {
    x: Number.isFinite(x) ? x : 0.5,
    y: Number.isFinite(y) ? y : 0.5,
  };
}

/**
 * МЕТКА ЭТОЙ ТКАНИ НА ЭТОМ ФЛЭТЕ, если она уже стоит.
 *
 * Читается ПО КАДРУ (`placementsOnPicture`), тем же читателем, что и всё остальное: доли — это
 * доли КОНКРЕТНОГО кадра, и искать метку по ассету значило бы найти её на чужом флэте.
 */
export function pinOnFlat(
  band: GetDesignBandResponse,
  assetId: number,
  pictureId: number,
): common_DesignAssetPlacement | undefined {
  if (!assetId || !pictureId) return undefined;
  return placementsOnPicture(band, pictureId).find((p) => p.assetId === assetId);
}

/**
 * МОЖНО ЛИ СТАВИТЬ МЕТКУ — И ПОЧЕМУ ЗАПИСКА ЗДЕСЬ ОБЯЗАТЕЛЬНА.
 *
 * ⚠ ЗАПИСКА МЕТКИ УЕЗЖАЕТ В ПЛАТНЫЙ ПРОМПТ ДОСЛОВНО. `partsOfAsset` собирает из записок поле
 * `DesignFabricUse.parts`, а `designgen/renderprompt.go` печатает его прямой строкой:
 *
 *     " It is used on: " + parts + " — and on no other part of this garment."
 *
 * Отсюда два следствия, и оба стоят денег.
 *
 * ПЕРВОЕ: пустая записка НЕ значит «метка без слов». `partsOfAsset` подставляет вместо неё номер
 * («mark 1»), и в промпт уходит «It is used on: mark 1» — модели названа несуществующая часть
 * изделия. Поэтому записка требуется, а не предлагается.
 *
 * ВТОРОЕ: сама метка СУЖАЕТ ткань. Пока меток нет, ткань в промпте — всё изделие («EMPTY MEANS THE
 * WHOLE GARMENT»); первая же метка добавляет «and on no other part of this garment». Примерка
 * «покажи мне вещь целиком в этом полотне» метки поэтому НЕ ставит и ставить не должна — метка
 * отвечает на другой вопрос, «этой тканью вот эта часть», и экран говорит это до нажатия.
 */
export function pinSaveGate(
  asset: common_DesignAsset | null | undefined,
  picture: common_DesignPicture | null | undefined,
  at: { x: number; y: number } | null,
  note: string,
): SaveGate {
  if (!asset || !(asset.id ?? 0)) return { ok: false, reason: 'pick a cloth first' };
  if (!picture || !(picture.id ?? 0)) return { ok: false, reason: 'pick a flat first' };
  if (!at) return { ok: false, reason: 'click the flat to say where this cloth goes' };
  if (!note.trim()) {
    return {
      ok: false,
      reason:
        'name the part this cloth covers — the words go to the render prompt as written, and an unnamed mark reaches it as «mark 1»',
    };
  }
  return { ok: true };
}

/* ─────────────────────────── что переживает перезагрузку ─────────────────────────── */

/**
 * ЧТО ГДЕ ЛЕЖИТ ПОСЛЕ ЗАКРЫТИЯ ВКЛАДКИ — СПИСКОМ, НА ЭКРАНЕ, А НЕ В ГОЛОВЕ.
 *
 * Орган с тремя регуляторами, из которых сохраняются два, обязан сказать это сам: человек,
 * покрутивший пролёт и не нашедший его назавтра, читает это как потерю работы, а не как границу
 * фичи. Список живёт здесь, а не в разметке, потому что его проверяет проба.
 */
export const SURVIVES: { what: string; where: string; kept: boolean }[] = [
  { what: 'repeat', where: 'on the cloth, card-wide', kept: true },
  { what: 'rotation', where: 'on the cloth, card-wide', kept: true },
  { what: 'the mark on the flat', where: 'on the flat, with its words', kept: true },
  { what: 'frame span', where: 'this browser only — an assumption, not a measurement', kept: false },
];
