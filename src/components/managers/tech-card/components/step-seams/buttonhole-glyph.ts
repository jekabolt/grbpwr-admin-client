import type { PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';

export type ButtonholeOperation = {
  operationType?: string;
  machineType?: string;
  work?: string;
  cutLengthMm?: string | number | { value?: string };
  buttonholeOrientation?: string;
  placementCount?: number;
  fastening?: {
    cutLengthMm?: string | number | { value?: string };
    buttonholeOrientation?: string;
  };
  placementLayout?: { count?: number };
};

export type ButtonholePictureGlyph = {
  id: string;
  piece: string;
  point: Pt2;
  direction: Pt2;
  lengthMm: number;
  markBox: { w: number; h: number; cx: number; cy: number };
};

const decimal = (value: string | number | { value?: string } | undefined): number | null => {
  const raw = typeof value === 'object' && value ? value.value : value;
  const parsed = Number(String(raw ?? '').replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

export const buttonholeLengthMm = (op: ButtonholeOperation | undefined): number =>
  decimal(op?.cutLengthMm) ?? decimal(op?.fastening?.cutLengthMm) ?? 12;

export const buttonholeOrientation = (op: ButtonholeOperation | undefined): string =>
  op?.buttonholeOrientation ?? op?.fastening?.buttonholeOrientation ?? '';

export const isButtonholeOperation = (op: ButtonholeOperation | undefined): boolean =>
  [op?.operationType, op?.machineType, op?.work].some((value) =>
    String(value ?? '')
      .toUpperCase()
      .includes('BUTTONHOLE'),
  );

/** Principal axis of a piece contour. Its sign is stable, though callers only read it as a line. */
export function pieceLongAxis(ring: readonly Pt2[]): Pt2 {
  if (ring.length < 2) return [0, 1];
  const centre = ring.reduce<Pt2>(
    ([x, y], point) => [x + point[0] / ring.length, y + point[1] / ring.length],
    [0, 0],
  );
  let xx = 0;
  let xy = 0;
  let yy = 0;
  for (const [x, y] of ring) {
    const dx = x - centre[0];
    const dy = y - centre[1];
    xx += dx * dx;
    xy += dx * dy;
    yy += dy * dy;
  }
  const angle = Math.atan2(2 * xy, xx - yy) / 2;
  let axis: Pt2 = [Math.cos(angle), Math.sin(angle)];
  const dominant = Math.abs(axis[0]) >= Math.abs(axis[1]) ? axis[0] : axis[1];
  if (dominant < 0) axis = [-axis[0], -axis[1]];
  return axis;
}

/** VERTICAL follows the host's long axis; HORIZONTAL and an unset value cross it. */
export function buttonholeDirection(ring: readonly Pt2[], orientation: string | undefined): Pt2 {
  const axis = pieceLongAxis(ring);
  return String(orientation ?? '')
    .toUpperCase()
    .includes('VERTICAL')
    ? axis
    : [axis[1], -axis[0]];
}

const placementCount = (op: ButtonholeOperation): number =>
  Math.max(0, op.placementCount ?? op.placementLayout?.count ?? 0);

/** Exact classified buttonholes for the most likely closure host in this operation's picture. */
export function buttonholePictureGlyphs(
  op: ButtonholeOperation | undefined,
  pieceKeys: readonly string[],
  geoms: ReadonlyMap<string, PieceGeom>,
): ButtonholePictureGlyph[] {
  if (!op || !isButtonholeOperation(op)) return [];
  const candidates = pieceKeys.flatMap((key) => {
    const geom = geoms.get(key);
    const marks = (geom?.marks ?? []).filter((mark) => mark.kind === 'buttonhole');
    if (!geom || !marks.length) return [];
    const closureHost = /PLCK|PLACKET|P_[LR]|FRONT/i.test(`${geom.pieceKey} ${geom.name}`);
    return [{ key, geom, marks, score: marks.length * 10 + (closureHost ? 200 : 0) }];
  });
  const selected = candidates.sort((left, right) => right.score - left.score)[0];
  if (!selected) return [];
  const count = placementCount(op);
  const direction = buttonholeDirection(selected.geom.rs, buttonholeOrientation(op));
  return selected.marks.slice(0, count || selected.marks.length).map((mark) => ({
    id: mark.id,
    piece: selected.key,
    point: [mark.bbox.cx, mark.bbox.cy],
    direction,
    lengthMm: buttonholeLengthMm(op),
    markBox: mark.bbox,
  }));
}
