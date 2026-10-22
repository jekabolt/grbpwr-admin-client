// A finished marker onto the remembered paper roll. This is a cut of the existing drawing, never
// a new nest: a wide roll receives the marker at its original width; a narrow roll receives
// overlapping lengthwise windows with matching registration crosses.
import type { DrawingLabel, DrawingStroke, PatternDrawing } from './drawing';
import {
  addRollFurniture,
  printableRollWidthMm,
  rollFurnitureMm,
  rollSheetLimitMm,
  rollWidthMm,
} from './roll-layout';
import type { RollPrintPlan, RollSpec } from './roll-print';

export const MARKER_STRIP_OVERLAP_MM = 20;

export function markerStripCount(markerFabricWidthMm: number, roll: RollSpec): number {
  if (!(Number.isFinite(markerFabricWidthMm) && markerFabricWidthMm > 0)) return 0;
  if (rollWidthMm(roll) + 1e-6 >= markerFabricWidthMm) return 1;
  const printable = printableRollWidthMm(roll);
  if (printable <= MARKER_STRIP_OVERLAP_MM)
    throw new Error(`printable roll width must exceed the ${MARKER_STRIP_OVERLAP_MM} mm overlap`);
  return Math.max(
    1,
    Math.ceil(
      (markerFabricWidthMm - MARKER_STRIP_OVERLAP_MM) / (printable - MARKER_STRIP_OVERLAP_MM),
    ),
  );
}

function cross(x: number, y: number): DrawingStroke[] {
  return [
    {
      kind: 'line',
      closed: false,
      pts: [
        [x - 5, y],
        [x + 5, y],
      ],
    },
    {
      kind: 'line',
      closed: false,
      pts: [
        [x, y - 5],
        [x, y + 5],
      ],
    },
  ];
}

function transformedMarker(
  marker: PatternDrawing,
  pageWidthMm: number,
  pageLengthMm: number,
  acrossStartMm: number,
  alongStartMm: number,
  acrossOffsetMm: number,
  strip: number,
  strips: number,
  chunkLengthMm: number,
  printableWidthMm: number,
  furnitureMm: number,
): PatternDrawing {
  // Marker frame: x = along fabric, y = across fabric. Roll page: x = across, y = along.
  const point = ([x, y]: [number, number]): [number, number] => [
    acrossOffsetMm + y - acrossStartMm,
    furnitureMm + x - alongStartMm,
  ];
  const strokes: DrawingStroke[] = marker.strokes.map((stroke) => ({
    ...stroke,
    pts: stroke.pts.map(point),
  }));
  const labels: DrawingLabel[] = marker.labels.map((label) => ({
    ...label,
    x: acrossOffsetMm + label.y - acrossStartMm,
    y: furnitureMm + label.x - alongStartMm,
    ...(label.sizeMm != null ? { angle: 90 - (label.angle ?? 0) } : {}),
  }));

  if (strips > 1) {
    const top = furnitureMm + 7;
    const bottom = furnitureMm + chunkLengthMm - 7;
    if (strip > 0) {
      const x = acrossOffsetMm + MARKER_STRIP_OVERLAP_MM / 2;
      strokes.push(...cross(x, top), ...cross(x, bottom));
    }
    if (strip < strips - 1) {
      const x = acrossOffsetMm + printableWidthMm - MARKER_STRIP_OVERLAP_MM / 2;
      strokes.push(...cross(x, top), ...cross(x, bottom));
    }
  }
  return {
    w: pageWidthMm,
    h: pageLengthMm,
    strokes,
    labels,
    title: strips > 1 ? `${marker.title} · strip ${strip + 1}/${strips}` : marker.title,
    warnings: [...marker.warnings],
  };
}

/** Split a marker across the remembered roll without moving or rotating any marker piece. */
export function planMarkerRollPrint(
  marker: PatternDrawing,
  markerFabricWidthCm: number,
  roll: RollSpec,
): RollPrintPlan & { strips: number } {
  const pageWidthMm = rollWidthMm(roll);
  const sheetLimitMm = rollSheetLimitMm(roll);
  const furnitureMm = rollFurnitureMm(roll);
  const contentLimitMm = sheetLimitMm - furnitureMm;
  const markerWidthMm = markerFabricWidthCm * 10;
  const strips = markerStripCount(markerWidthMm, roll);
  if (strips < 1) throw new Error('the marker has no fabric width');
  const narrow = strips > 1;
  const printableWidthMm = narrow ? printableRollWidthMm(roll) : markerWidthMm;
  const stripStepMm = printableWidthMm - (narrow ? MARKER_STRIP_OVERLAP_MM : 0);
  const acrossOffsetMm = narrow ? roll.edgeMm : (pageWidthMm - markerWidthMm) / 2;
  const chunks = Math.max(1, Math.ceil(marker.w / contentLimitMm));
  const bare: Array<{ drawing: PatternDrawing; lengthMm: number }> = [];

  for (let strip = 0; strip < strips; strip++) {
    const acrossStartMm = strip * stripStepMm;
    for (let chunk = 0; chunk < chunks; chunk++) {
      const alongStartMm = chunk * contentLimitMm;
      const chunkLengthMm = Math.min(contentLimitMm, Math.max(0, marker.w - alongStartMm));
      const lengthMm = furnitureMm + Math.max(1, chunkLengthMm);
      bare.push({
        drawing: transformedMarker(
          marker,
          pageWidthMm,
          lengthMm,
          acrossStartMm,
          alongStartMm,
          acrossOffsetMm,
          strip,
          strips,
          chunkLengthMm,
          printableWidthMm,
          furnitureMm,
        ),
        lengthMm,
      });
    }
  }

  const sheets = bare.map((sheet, index) => ({
    ...sheet,
    drawing: addRollFurniture(sheet.drawing, index + 1, bare.length, roll, sheet.drawing.title),
  }));
  const pieceCount = marker.strokes.filter((stroke) => stroke.kind === 'cut').length;
  const warnings = [...marker.warnings];
  if (narrow)
    warnings.push(
      `the ${markerFabricWidthCm} cm marker was split into ${strips} strips with ${MARKER_STRIP_OVERLAP_MM} mm overlap`,
    );
  return {
    sheets,
    strips,
    lengthMm: sheets.reduce((sum, sheet) => sum + sheet.lengthMm, 0),
    placed: pieceCount,
    total: pieceCount,
    tooWide: [],
    tooLong: [],
    markerLengthMm: sheets.reduce(
      (sum, sheet) => sum + Math.max(0, sheet.lengthMm - furnitureMm),
      0,
    ),
    warnings: [...new Set(warnings)],
  };
}
