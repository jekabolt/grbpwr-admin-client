import type { GetDesignBandResponse, common_DesignPicture } from 'api/proto-http/admin';
import { CalloutBox } from 'ui/components/callout-box';

import { usePickMode } from './pick-mode';
import { isComposite } from './split-modal';
import { isPictureHidden, type HideGuard } from './visibility';

/**
 * ЧТО ОСТАЛОСЬ ОТ ЛЕНТЫ: читающие хелперы и одна сноска отказа. Два сноса, оба — решением
 * владельца, и второй доел то, что оставил первый.
 *
 * ПЕРВЫЙ (R-18): «нам в принципе не нужна колонка UPLOADS». Пять функций полки разошлись: дверь
 * ручной загрузки → слот «+ reference» входа и «+ add …» пустых слотов верстака; витрина
 * принесённого → строки входа и плиты верстака; дверь сплита → угловые кнопки split; учёт пачек
 * снесён. Пятая — отвечать режиму выбора за пачечные картинки — переехала в лоток «brought by
 * hand», который рисовался только при взведённом выборе.
 *
 * ВТОРОЙ (S-13): «BROUGHT BY HAND вкладка не нужна в принципе в ней нет смысла» — лоток снесён
 * целиком. ЧТО ОН УНОСИТ С СОБОЙ, ПОИМЁННО: лоток был единственной поверхностью, где ПАЧЕЧНУЮ
 * картинку (ручную загрузку или кроп сплита) можно было пометить в слот кликом из полосы. Теперь
 * режиму выбора отвечают ТОЛЬКО плитки истории прогонов; принесённое руками и кропы входят в слот
 * через его собственную медиа-дверь («+ add» — библиотека / ⌘V / бросок; файл, уже живущий на
 * карточке, встаёт без перезагрузки), а занятый слот сначала освобождают unmark'ом. Жест R-11
 * «кроп → В ЗАНЯТЫЙ слот одним кликом» умер вместе с лотком — это цена решения, и она названа
 * здесь, а не съедена молча.
 *
 * ПОЧЕМУ СНОСКА ОСТАЛАСЬ И ВЫРОСЛА. Дверь «or mark a picture from the band» живёт в чужом
 * `bench-slot.tsx`, и её список кандидатов (`pickableFlats`) по-прежнему считает прогоны И пачки.
 * Значит дверь может взвести выбор над экраном, где отвечать некому — пачечным кандидатам
 * поверхности больше нет. Молчащий экран при взведённом режиме неотличим от сломанного (Г12),
 * поэтому сноска говорит всегда, когда истории нечем ответить, и называет живую дверь словами.
 *
 * ПОЧЕМУ ЭКСПОРТ ВСЁ ЕЩЁ ЗОВЁТСЯ `PickTray`: его монтирует `studio-tab.tsx` (чужой файл), и
 * переименовать экспорт можно только вместе с ним. Имя — след снесённого органа, не сам орган.
 *
 * Читающие хелперы (`bandPictures`, `isPickablePicture`, `buildHideGuard`) остаются здесь: их
 * читают история прогонов и панель прогона, и перевозить их значило бы дёргать чужие файлы ради
 * переезда без смысла.
 */

/* ────────────────────────────── reading the band ────────────────────────────── */

/** Every picture the band shipped, runs and batches alike, hidden ones included. */
export function bandPictures(band: GetDesignBandResponse): common_DesignPicture[] {
  const out: common_DesignPicture[] = [];
  (band.runs ?? []).forEach((run) => out.push(...(run.pictures ?? [])));
  (band.batches ?? []).forEach((batch) => out.push(...(batch.pictures ?? [])));
  return out;
}

/**
 * May this picture be dropped into a bench slot?
 *
 * TWO rules, and only one of them belongs to `visibility.ts`. A hidden picture is unreachable from
 * every picker — that is the frozen module's rule. A COMPOSITE is a second, unrelated refusal: it
 * holds several views at once, a slot holds one, and the contract says it «is not clickable into a
 * slot and must be split first». Folding compositeness into the visibility module would put a
 * second, non-visibility register into the one file that exists to keep invisibility singular.
 */
export function isPickablePicture(picture: common_DesignPicture): boolean {
  return !isPictureHidden(picture) && !isComposite(picture);
}

/**
 * The four preconditions of `HideDesignPicture`, gathered from the band that is already on screen.
 *
 * TWO OF THE FOUR ARE ADDRESSED BY MEDIA, NOT BY PICTURE. A frozen sheet plate carries
 * `media`, and a run's input snapshot carries `media_id` — neither carries a picture id, because
 * both froze a FILE rather than a row. So they are resolved the only way they can be: media id →
 * every picture standing on that media.
 *
 * AND THE VERSION HALF IS DELIBERATELY UNDER-APPROXIMATE. The band ships only the LATEST version in
 * full (`version_numbers` is a list of integers), so a plate frozen in v1 but absent from v3 is not
 * seen here and its picture will be offered a ✕ that the server then refuses with `in_version`.
 * That refusal names the same reason this guard would have named — which is exactly why the codes
 * in `visibility.ts` are the server's own strings and not a second vocabulary.
 */
export function buildHideGuard(band: GetDesignBandResponse): HideGuard {
  const pictures = bandPictures(band);

  const byMedia = new Map<number, number[]>();
  pictures.forEach((picture) => {
    const mediaId = picture.media?.id ?? 0;
    const pictureId = picture.id ?? 0;
    if (mediaId <= 0 || pictureId <= 0) return;
    const bucket = byMedia.get(mediaId);
    if (bucket) bucket.push(pictureId);
    else byMedia.set(mediaId, [pictureId]);
  });
  const picturesOfMedia = (mediaId?: number) =>
    mediaId && mediaId > 0 ? byMedia.get(mediaId) ?? [] : [];

  const slotPictureIds = new Set<number>();
  (band.bench ?? []).forEach((slot) => {
    const id = slot.pictureId ?? 0;
    if (id > 0) slotPictureIds.add(id);
  });

  const versionPlatePictureIds = new Set<number>();
  (band.latestVersion?.plates ?? []).forEach((plate) => {
    picturesOfMedia(plate.media?.id).forEach((id) => versionPlatePictureIds.add(id));
  });

  const liveRunInputPictureIds = new Set<number>();
  (band.runs ?? [])
    .filter((run) => run.status === 'pending' || run.status === 'running')
    .forEach((run) => {
      (run.inputs?.slots ?? []).forEach((slot) => {
        picturesOfMedia(slot.mediaId || slot.media?.id).forEach((id) =>
          liveRunInputPictureIds.add(id),
        );
      });
      (run.inputs?.refs ?? []).forEach((ref) => {
        picturesOfMedia(ref.mediaId || ref.media?.id).forEach((id) =>
          liveRunInputPictureIds.add(id),
        );
      });
    });

  const cropParentPictureIds = new Set<number>();
  pictures.forEach((picture) => {
    const parent = picture.derivedFrom ?? 0;
    if (parent > 0) cropParentPictureIds.add(parent);
  });

  return {
    slotPictureIds,
    versionPlatePictureIds,
    liveRunInputPictureIds,
    cropParentPictureIds,
  };
}

/* ────────────────────────────── the refusal, in words ────────────────────────────── */

/**
 * ОТКАЗ РЕЖИМА ВЫБОРА, СЛОВАМИ — всё, что осталось от лотка (S-13, см. шапку файла).
 *
 * Молчит ровно тогда, когда истории прогонов есть чем ответить: её плитки — единственная
 * отвечающая поверхность взведённого выбора. Во всех остальных случаях взведённый режим смотрит
 * на экран, где нечего нажать, и обязан объяснить это словами — иначе он неотличим от сломанного.
 * Дверь, взводящая режим, считает кандидатами и пачечные картинки (чужой `pickableFlats`), но
 * пачечным кандидатам после сноса лотка отвечать нечем — их путь в слот назван в тексте.
 */
export function PickTray({ band }: { band: GetDesignBandResponse }): JSX.Element | null {
  const pick = usePickMode();
  if (!pick.target) return null;

  const pictures = bandPictures(band);
  const runPictures = (band.runs ?? []).flatMap((run) => run.pictures ?? []);
  if (runPictures.some(isPickablePicture)) return null;

  // Всё, что осталось в истории, — скрытое или композиты: имена причин, по одной на счёт.
  const composites = runPictures.filter(isComposite).length;
  const hidden = runPictures.filter(isPictureHidden).length;
  const blocked = [
    composites ? `${composites} composite${composites === 1 ? '' : 's'}` : '',
    hidden ? `${hidden} hidden` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const why = !pictures.length
    ? 'there is not a single picture on this card yet — bring files in with «+ reference» in the input block, or straight onto an empty slot.'
    : `only run outputs are marked from the band, in the history above${
        blocked ? ` — and this card's are ${blocked}` : ', and this card has none'
      }. a picture added by hand — and any crop of a split — goes into a slot through the slot's own «+ add» door: the library, ⌘V or a dropped file; unmark frees a filled slot first.`;

  return (
    <CalloutBox tone='error'>
      <b>nothing here can go into {pick.target.label}.</b> {why} Esc cancels.
    </CalloutBox>
  );
}
