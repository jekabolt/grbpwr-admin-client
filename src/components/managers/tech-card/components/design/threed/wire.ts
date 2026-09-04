import type { DesignUploadItem, common_DesignPicture, GetDesignBandResponse } from 'api/proto-http/admin';

/**
 * ═══ ДВА ПОЛЯ КРУГА 18 — `display_only` И `composite_views` — И ИХ ЧИТАТЕЛИ, В ОДНОМ МЕСТЕ ══════
 *
 * Сервер круга 18 на бете (`45a3cf2`, зеркало `bec6ff9`) несёт:
 *   · `DesignUploadItem.display_only` / `DesignPicture.display_only` — кадр только для показа
 *     (D-24): виден в артефактах и на листе, НИКОГДА не уезжает в платный вызов — сервер
 *     отказывает ему в слоте, в роли референса, в разрезе «для промпта» и у денежной двери
 *     (`display_only`, `display_only_input`);
 *   · `DesignUploadItem.composite_views` — загрузка объявляет себя МУЛЬТИВЬЮ, назвав ≥2 видов
 *     (D-26): снимок 3D с четырёх сторон регистрируется листом, который потом режут.
 *
 * Сгенерированные типы уже несут оба поля (перегенерированы владельцем посреди этой волны — до
 * того здесь стояло пересечение типов, замещавшее их). Файл остался ради ЧИТАТЕЛЕЙ: вопрос «этот
 * кадр только для показа» и вопрос «знает ли ЭТОТ бинарь про поле» задаются с двух экранов (лист
 * и окно модели), и второе написание любого из них разошлось бы с первым молча.
 */

/** The item `RegisterDesignUpload` takes — one spelling for every door of this wave that files a picture. */
export type WireUploadItem = DesignUploadItem;

/** The picture is filed for display only: shown on the sheet and in ARTIFACTS, never sent to a prompt. */
export function pictureIsDisplayOnly(picture?: common_DesignPicture | null): boolean {
  return picture?.displayOnly === true;
}

/**
 * DOES THE SERVER THAT ANSWERED STATE `display_only` AT ALL — the same three-way question
 * `serverStatesSelected` asks about the mark. `EmitUnpopulated` makes a server that has the field
 * send it on EVERY picture (as `false` when unset), so:
 *   · `true`  — a picture on the band carries a boolean: the door may be offered;
 *   · `false` — pictures exist and none carries it: a binary older than the field, and a file sent
 *               through the door would be filed as an ORDINARY upload, i.e. eligible for prompts,
 *               which is the exact opposite of what the door promises — draw it inert with reason;
 *   · `null`  — no picture to read: nobody has been asked, and refusing would lock the door on
 *               every empty card of a current server.
 */
export function serverStatesDisplayOnly(band: GetDesignBandResponse): boolean | null {
  let seen = false;
  const pools = [
    ...(band.runs ?? []).map((r) => r.pictures ?? []),
    ...(band.batches ?? []).map((b) => b.pictures ?? []),
    (band.outputs ?? []).map((o) => o.picture).filter((p): p is common_DesignPicture => !!p),
    (band.bench ?? []).map((s) => s?.picture).filter((p): p is common_DesignPicture => !!p),
  ];
  for (const pictures of pools) {
    for (const picture of pictures) {
      seen = true;
      if (typeof picture.displayOnly === 'boolean') return true;
    }
  }
  return seen ? false : null;
}

export const DISPLAY_ONLY_NOT_STATED =
  'this server does not state `display_only` on its pictures — a binary older than the field. ' +
  'A file sent through this door would be filed as an ordinary upload, eligible for prompts, ' +
  'which is the opposite of what the door promises';
