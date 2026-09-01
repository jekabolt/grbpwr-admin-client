import type { common_DesignPicture, common_DesignRun, common_MediaFull } from 'api/proto-http/admin';

/**
 * ═══ ЧТО ИЗ ДВУХ КАРТИНОК ПРОГОНА — МОДЕЛЬ, А ЧТО ЕЁ МИНИАТЮРА ════════════════════════════════
 *
 * ЭТО ПРОЧИТАНО ПО ЗАДЕПЛОЕННОМУ БЭКЕНДУ (origin/beta), А НЕ ВЫВЕДЕНО ИЗ ОДНОГО ПРИМЕРА.
 *
 * 1. МАРШРУТ ОБЪЯВЛЯЕТ ДВА ПРЕДМЕТА. `internal/designgen/threedfal.go` (и дословно так же
 *    `threed.go` у маршрута meshy):
 *
 *        func (p falThreedProvider) Produces() []string { return []string{ContentTypeGLB, ContentTypePNG} }
 *
 *    и `ContentTypeGLB = "model/gltf-binary"` (`internal/designgen/provider.go`).
 *
 * 2. МИНИАТЮРА НЕОБЯЗАТЕЛЬНА. Collect кладёт модель всегда, а растр — только если он приехал:
 *
 *        out.Artifacts = append(out.Artifacts, Artifact{Bytes: model.Bytes(), ContentType: ContentTypeGLB, …})
 *        if thumb.Len() > 0 { out.Artifacts = append(out.Artifacts, Artifact{… ContentTypePNG …}) }
 *
 *    То есть «модель без миниатюры» — ЗАКОННОЕ состояние прогона, а не поломка. Экран, который
 *    умеет рисовать только пару, на таком прогоне покажет пустоту.
 *
 * 3. СВЯЗЬ — ПРОГОН И ПОРЯДОК В НЁМ, И БОЛЬШЕ НИЧЕГО. `Worker.publish` (`dispatch.go`) пишет
 *    ordinal НОМЕРОМ АРТЕФАКТА в списке:
 *
 *        for i, a := range out.Artifacts {
 *            outputs = append(outputs, entity.DesignPictureInsert{MediaId: m.ID, Ordinal: i, Kind: a.Kind, …})
 *
 *    `entity.DesignPictureInsert` — это ВЕСЬ набор полей, которыми прогон описывает свой выход, и
 *    в нём НЕТ `DerivedFrom` (`internal/entity/design.go`). Значит `derived_from` у обеих картинок
 *    ноль, и «миниатюра выведена из модели» на проводе НЕ СКАЗАНО НИГДЕ. Единственная запись о их
 *    родстве — что они в одном `run_id` и что растр идёт СЛЕДОМ за своей моделью по `ordinal`.
 *
 * 4. ТИПА ФАЙЛА НА ПРОВОДЕ НЕТ, И ЭТО РЕШЕНИЕ БЭКЕНДА, А НЕ УПУЩЕНИЕ. `common.MediaInfo` несёт
 *    ровно `media_url`, `width`, `height` (`proto/common/common/media.proto`), а
 *    `internal/bucket/nonraster.go` говорит почему:
 *
 *        «the media table has never carried a content type, and the object's extension is where
 *         the file type has always lived»
 *
 *    Расширение и есть объявленный тип. `fileExtensionFromContentType` (`internal/bucket/utils.go`)
 *    отображает `model/gltf-binary → "glb"`, и объект кладётся под этим суффиксом.
 *
 * ⚠ И ЕЩЁ ОДНА ЛОВУШКА, ИЗ-ЗА КОТОРОЙ «СМОТРЕТЬ НА МИНИАТЮРУ» НЕ РАБОТАЕТ. У модели ВСЕ ТРИ слота
 *    медиа указывают на один и тот же `.glb`:
 *
 *        FullSizeMediaURL: url, CompressedMediaURL: url, ThumbnailMediaURL: url
 *
 *    (там же, `UploadContentNonRaster`) — «a reader that asks for the thumbnail must still get a
 *    url that resolves rather than an empty string». Поэтому обычный `pictureThumb`, который
 *    предпочитает `thumbnail`, у модели возвращает НЕ картинку, а сам файл модели, и `<img>`
 *    получает `.glb`. Это ровно тот битый кадр, который человек читает как «сломался сервер».
 */

/**
 * Адрес указывает на файл модели.
 *
 * Решение принимается по ПУТИ, а не по всей строке: подписанный запрос (`?X-Amz-…`) или якорь не
 * должны ни включать, ни выключать признак. Форма списана с `isDxfUrl` (`utils/pattern.ts`), у
 * которой ровно та же причина существовать, и её комментарий говорит то же самое своими словами:
 * «there is no content-type field anywhere in the contract».
 */
export function isModelUrl(url?: string | null): boolean {
  if (!url) return false;
  try {
    return new URL(url).pathname.toLowerCase().endsWith('.glb');
  } catch {
    // Относительный адрес (стенд, blob-заглушка) — `new URL` без базы на нём падает.
    return url.split('?')[0].split('#')[0].toLowerCase().endsWith('.glb');
  }
}

/** Адрес файла модели у медиа-строки, или пусто. Все три слота у модели равны — берётся полный. */
export function modelUrlOf(media?: common_MediaFull | null): string {
  const url = media?.media?.fullSize?.mediaUrl || media?.media?.compressed?.mediaUrl || '';
  return isModelUrl(url) ? url : '';
}

/** Картинка прогона на самом деле файл модели. */
export function pictureIsModel(picture?: common_DesignPicture | null): boolean {
  return !!modelUrlOf(picture?.media);
}

/**
 * ОДИН РЕЗУЛЬТАТ 3D: модель и растр, который стоит вместо неё в списке.
 *
 * `model` пусто — прогон отдал только растр (историческая строка или ручная загрузка с родом
 * threed). `poster` пусто — маршрут не вернул миниатюры. Оба пустыми не бывают: результат
 * заводится ровно от одной из двух картинок.
 */
export interface ThreedResult {
  run: common_DesignRun;
  model: common_DesignPicture | null;
  poster: common_DesignPicture | null;
  /** Адрес `.glb`; пусто, когда модели нет. */
  modelUrl: string;
  /** Адрес растра для плитки; пусто, когда миниатюры нет. */
  posterUrl: string;
  /**
   * КАКАЯ ИЗ ДВУХ СТРОК НЕСЁТ ПОМЕТКУ И ВСТАЁТ В ARTIFACTS — миниатюра, если она есть, иначе сама
   * модель.
   *
   * ЭТО НЕ ПРОИЗВОЛ, А ЕДИНСТВЕННЫЙ ВЫБОР, ПРИ КОТОРОМ ДВА ЭКРАНА СОГЛАСНЫ. Пометку читает
   * ARTIFACTS, а ARTIFACTS имеет дело с ПЛИТАМИ, по которым рисуют указания; `.glb` плитой быть не
   * может — размечать нечего. Значит на прогоне с миниатюрой помеченной обязана быть она, иначе
   * «выбрано» на одном экране и «ничего не выбрано» на другом стали бы двумя реестрами одних
   * выборов. На прогоне БЕЗ миниатюры плиты в ARTIFACTS нет вовсе, поэтому пометка на модели
   * ничему не противоречит: фильтровать ею нечего.
   */
  markable: common_DesignPicture;
}

/**
 * ═══ ПАРА «МОДЕЛЬ + ЕЁ МИНИАТЮРА» — ОДИН РЕЗУЛЬТАТ, А НЕ ДВА ══════════════════════════════════
 *
 * ЭТО ЕДИНСТВЕННОЕ МЕСТО, ГДЕ ЖИВЁТ ЭТОТ СЧЁТ. Всякий счётчик 3D обязан звать эту функцию, а не
 * повторять её правило рядом: второй способ считать разойдётся с первым в тот день, когда маршрут
 * начнёт возвращать что-то третье, и разойдётся МОЛЧА.
 *
 * ПРАВИЛО СПИСАНО С ПРОИЗВОДИТЕЛЯ, А НЕ ПРИДУМАНО. `publish` выдаёт ordinal номером в списке
 * артефактов, а Collect кладёт в список сначала модель и следом её миниатюру. Значит растр
 * принадлежит БЛИЖАЙШЕЙ ПРЕДШЕСТВУЮЩЕЙ модели того же прогона — и это верно не только для
 * сегодняшней пары, но и для маршрута, который однажды вернёт две пары за прогон.
 *
 * ⚠ ПОЧЕМУ НЕ «ordinal === 0 — модель». Порядковый номер — свойство ПОЗИЦИИ, а не файла. Прогон,
 * у которого миниатюра не приехала, отдаёт единственную картинку с ordinal 0, и она модель;
 * прогон, у которого однажды поменяется порядок артефактов, отдаст модель под ordinal 1 и правило
 * начнёт врать, ничего не сломав на глаз. Модель узнаётся по ФАЙЛУ (`isModelUrl`), а ordinal
 * отвечает только на вопрос «чья это миниатюра».
 *
 * ⚠ ПРОИЗВОДНАЯ КАРТИНКА НЕ ПОГЛОЩАЕТСЯ. Кроп наследует `run_id` родителя (это сказано в контракте
 * `DesignPicture.derived_from`: «a derivative is a SIBLING OF ITS PARENT»), поэтому без этого
 * условия кроп молча стал бы «миниатюрой модели» и исчез бы из списка вместе с ней.
 */
export function threedResults(
  outputs: { picture: common_DesignPicture; run: common_DesignRun }[],
): ThreedResult[] {
  const out: ThreedResult[] = [];
  // Последний заведённый результат КАЖДОГО прогона — к нему пристаёт следующий растр. Ключ по
  // прогону, потому что лента перемешивает прогоны и «предыдущий по списку» им не общий.
  const openByRun = new Map<number, ThreedResult>();

  for (const { picture, run } of outputs) {
    // Ключ берётся С САМОЙ КАРТИНКИ, а не с прогона рядом. Родство — это `run_id` строки, и
    // читать его со строки значит не зависеть от того, кто и какой прогон приложил к списку.
    const runId = picture.runId ?? run.id ?? 0;
    const modelUrl = modelUrlOf(picture.media);

    if (modelUrl) {
      const result: ThreedResult = {
        run,
        model: picture,
        poster: null,
        modelUrl,
        posterUrl: '',
        markable: picture,
      };
      openByRun.set(runId, result);
      out.push(result);
      continue;
    }

    const open = openByRun.get(runId);
    const ordinal = picture.ordinal ?? 0;
    const absorbs =
      !!open &&
      !open.poster &&
      (picture.derivedFrom ?? 0) === 0 &&
      ordinal > (open.model?.ordinal ?? 0);

    if (absorbs && open) {
      open.poster = picture;
      open.posterUrl = pictureRaster(picture);
      open.markable = picture;
      continue;
    }

    // Растр, которому не к чему пристать, — сам себе результат. Так историческая строка threed без
    // модели остаётся видимой, а не пропадает из списка потому, что не подошла под пару.
    out.push({
      run,
      model: null,
      poster: picture,
      modelUrl: '',
      posterUrl: pictureRaster(picture),
      markable: picture,
    });
  }

  return out;
}

/**
 * СКОЛЬКО РЕЗУЛЬТАТОВ 3D В ПЛОСКОМ СПИСКЕ КАРТИНОК.
 *
 * ⚠ ЭТО НЕ ВТОРОЙ СПОСОБ СЧИТАТЬ, А ВТОРАЯ ДВЕРЬ В ПЕРВЫЙ. Правило свода здесь не повторено ни
 * строкой: функция собирает пары и зовёт `threedResults`. Она существует потому, что часть
 * экранов держит картинки БЕЗ прогонов рядом (счётчик рода в полосе видов — такой), а родство
 * пары записано на самой строке (`run_id`), и прогон для свода не нужен.
 */
export function countThreedResults(pictures: common_DesignPicture[]): number {
  return threedResults(
    pictures.map((picture) => ({ picture, run: { id: picture.runId ?? 0 } as common_DesignRun })),
  ).length;
}

/** Адрес растра для маленького кадра: миниатюра, потом сжатый, потом полный. */
function pictureRaster(picture: common_DesignPicture): string {
  const media = picture.media?.media;
  return media?.thumbnail?.mediaUrl || media?.compressed?.mediaUrl || media?.fullSize?.mediaUrl || '';
}
