import { adminService } from 'api/api';
import type {
  common_ProductionRunLay,
  common_ProductionRunLaySection,
  googletype_Decimal,
} from 'api/proto-http/admin';
import {
  exportFileName,
  markerToView,
} from 'components/managers/tech-card/components/nesting/marker-io';
import { renderLayoutDxf, type LayHeader } from 'lib/nesting/render/dxf';

// ПЛОТТЕРНЫЙ ФАЙЛ ОДНОЙ СЕКЦИИ НАСТИЛА (Ф4.7, проводка).
//
// ФАЙЛ ВЫПУСКАЕТСЯ НА СЕКЦИЮ, А НЕ НА НАСТИЛ, и это не деталь реализации. Настил из трёх секций —
// это три РАЗНЫЕ раскладки, которые режут по очереди, каждую своим проходом ножа. Один файл «на
// настил» пришлось бы либо склеить из трёх (такой геометрии не существует), либо молча выбрать
// одну из трёх — и раскройщик получил бы файл, режущий не то, что он настелил.
//
// ЧЕРТЕЖА В ЭТОМ ФАЙЛЕ НЕТ, И ЭТО СКАЗАНО В ЕГО ИМЕНИ. Блоб раскладки хранит внешние контуры и
// размещения; линия шва, надсечки и свёрла — производные от выкроек, в блоб не пишутся и
// восстанавливаются пересборкой по сегодняшним DXF (Ф3.5). На странице прогона выкроек нет и взять
// их неоткуда, значит пересобрать нечем. Выход тот же, что принят решением Р4 в Ф3: контурный DXF
// остаётся рабочим плоттерным файлом — резаку нужна линия кроя, а линия шва нужна швейному цеху, —
// но файл обязан НАЗВАТЬ себя, потому что на диске он ничем не отличается от полного. Отсюда
// сегмент «contour only» в имени, ровно как у второй кнопки модалки.
//
// ШАПКА — ТО, РАДИ ЧЕГО ВСЁ ЭТО. Распечатанный лист без неё неотличим от такого же листа соседней
// партии, а раскроить не тот настил стоит рулона.

/** Что печатается в шапке, помимо самой раскладки. Собирается вызывающим — он знает экран. */
export type LayPlotterContext = {
  runId: number;
  /** Колорвей словом, как его читают: «BLACK», а не идентификатор. */
  colorway: string;
  /** Размер словом по его id — состав раскладки хранит идентификаторы, а лист читает человек. */
  sizeLabel: (sizeId: number) => string;
  /** Сезон и артикул стиля — те же части имени файла, что у карточного экспорта. */
  season?: string;
  styleNumber?: string;
};

const dec = (d?: googletype_Decimal): number | undefined => {
  const v = Number(d?.value ?? '');
  return Number.isFinite(v) && v > 0 ? v : undefined;
};

/**
 * Шапка листа. Состав берётся из СНИМКА КОЛИЧЕСТВ настила, а не из состава раскладки: лист
 * описывает, что стелют ЗДЕСЬ И СЕЙЧАС, а раскладка могла быть снята под другой заказ и пережить
 * его. Размер печатается словом — идентификатор на листе не значит ничего.
 */
export function layPlotterHeader(
  lay: common_ProductionRunLay,
  section: common_ProductionRunLaySection,
  ctx: LayPlotterContext,
  nowISO: string,
): LayHeader {
  return {
    runId: ctx.runId,
    layName: lay.name || undefined,
    colorway: ctx.colorway,
    articleCode: lay.materialName || undefined,
    materialName: lay.bomItemName || undefined,
    // СЛОИ ЭТОЙ СЕКЦИИ, а не всего настила: режут секцию, и число слоёв под ножом — её.
    plies: section.plies ?? undefined,
    composition: (lay.qtySnapshot ?? []).map((q) => ({
      size: ctx.sizeLabel(q.sizeId ?? 0),
      qty: q.qty ?? undefined,
    })),
    lengthCm: dec(section.markerLengthCm) ?? dec(lay.clothLengthCm),
    dateISO: nowISO,
  };
}

export type LayPlotterResult = { ok: true; dxf: string; filename: string } | { ok: false; reason: string };

/**
 * Строит плоттерный файл секции. Возвращает результат, а не бросает и не скачивает: скачивание —
 * дело компонента, а отказ обязан доехать до экрана словами.
 */
export async function buildLaySectionPlotterFile(
  lay: common_ProductionRunLay,
  section: common_ProductionRunLaySection,
  ctx: LayPlotterContext,
  nowISO: string,
): Promise<LayPlotterResult> {
  const markerId = section.markerId ?? 0;
  if (!markerId) return { ok: false, reason: 'the section has no marker' };

  let marker;
  try {
    // Блоб едет ТОЛЬКО этим RPC: список настилов несёт сводки маркеров, а не геометрию.
    const res = await adminService.GetTechCardMarker({ id: markerId });
    marker = res.marker;
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "the marker didn't load" };
  }
  if (!marker) return { ok: false, reason: 'marker not found' };

  const view = markerToView(marker);
  // ВЫРОЖДЕННЫЙ БЛОБ — ОТКАЗ, А НЕ ПУСТОЙ ФАЙЛ. Без деталей или без размещений DXF получился бы
  // одной рамкой полосы, и плоттер послушно прорезал бы её по всей длине рулона.
  if (view.pieces.length === 0 || view.result.placements.length === 0) {
    return { ok: false, reason: "the marker has no saved geometry — there's nothing to issue" };
  }

  const dxf = renderLayoutDxf(view.result, view.pieces, view.widthCm, {
    header: layPlotterHeader(lay, section, ctx, nowISO),
  });
  const filename = exportFileName(
    [
      ctx.season,
      ctx.styleNumber,
      ctx.colorway,
      lay.bomItemName,
      marker.summary?.name,
      // Признак в ИМЕНИ, а не только в подсказке: файл переживает вкладку, из которой скачан.
      'contour only',
    ],
    'dxf',
    ctx.runId,
  );
  return { ok: true, dxf, filename };
}
