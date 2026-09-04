import { type DesignUploadItem } from 'api/proto-http/admin';

/**
 * uploadItem — ОДНА строка загрузки, собранная В ОДНОМ МЕСТЕ.
 *
 * Литерал `DesignUploadItem` стоял в семи файлах, и каждое поле, добавленное к контракту, приходило
 * в дерево семью одинаковыми правками: так было с `compositeViews` и `displayOnly` (круг 18), и так
 * будет со следующим. Генератор объявляет поля сообщения ОБЯЗАТЕЛЬНЫМИ, поэтому забытое поле — это
 * не тихая деградация, а красный `tsc`; но чинить его в семи местах и означает семь мест, где на
 * восьмом поле кто-то ошибётся.
 *
 * Умолчания — НЕ «пусто на всякий случай», а значения, каждое из которых что-то утверждает:
 *   ghostView: ''    — «сторону не заявляю» (её либо решит сервер, либо она приедет целью);
 *   kind: ''         — «род наследуется» (так делает кадр разреза: род берётся у родителя);
 *   colorwayId: 0    — «колорвея нет по существу», а не «ещё не проставлен» (сервер отвечает
 *                      `colorway_forbidden` там, где колорвей неуместен);
 *   compositeViews: [] — «это не мультивью, резать нечего»;
 *   displayOnly: false — «кадр рабочий»: он встаёт в слот и уезжает в платный вызов. `true` —
 *                      это дверь «только для показа», и ставить его умолчанием значило бы молча
 *                      выключить каждую загрузку из промпта.
 */
export function uploadItem(v: {
  mediaId: number;
  ghostView?: string;
  kind?: string;
  colorwayId?: number;
  compositeViews?: string[];
  displayOnly?: boolean;
}): DesignUploadItem {
  return {
    mediaId: v.mediaId,
    ghostView: v.ghostView ?? '',
    kind: v.kind ?? '',
    colorwayId: v.colorwayId ?? 0,
    compositeViews: v.compositeViews ?? [],
    displayOnly: v.displayOnly ?? false,
  };
}
