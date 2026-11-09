import { POM_CHART_NAME } from './chart-points';
import { GARMENT_SCHEMATIC } from './schematic';
import { SIZE_CHART_ICONS, type SizeChartIcon } from './size-chart-icons';
import type { PomCode } from './types';

/** A line in the icon's own coordinates. */
export type IconLineSegment = { x: number; y: number; x2: number; y2: number };

type Point = { x: number; y: number };

const POM_BY_CHART_NAME = new Map<string, PomCode>(
  Object.entries(POM_CHART_NAME).map(([pom, name]) => [name, pom as PomCode]),
);
POM_BY_CHART_NAME.set('hips', 'hip');

const BOTTOM_LENGTH_NAMES = new Set(['height', 'length', 'outseam']);
const BODY_ACROSS: ReadonlySet<PomCode> = new Set(['chest', 'waist', 'hem', 'across-shoulder']);
const LEG_ACROSS: ReadonlySet<PomCode> = new Set(['thigh', 'knee', 'leg-opening']);

function pomOf(icon: SizeChartIcon, name: string): PomCode | undefined {
  const key = name.trim().toLowerCase();
  if (icon.family === 'bottoms' && BOTTOM_LENGTH_NAMES.has(key)) return 'outseam';
  return POM_BY_CHART_NAME.get(key);
}

function iconSegments(icon: SizeChartIcon): Map<PomCode, IconLineSegment> {
  const segments = new Map<PomCode, IconLineSegment>();
  for (const line of icon.lines) {
    const pom = pomOf(icon, line.name);
    if (!pom || segments.has(pom)) continue;
    segments.set(
      pom,
      line.type === 'horizontal'
        ? { x: line.xStart, y: line.y, x2: line.xEnd, y2: line.y }
        : {
            x: line.x,
            y: line.yStart,
            x2: line.view === 'diagonal' ? line.xEnd ?? line.x : line.x,
            y2: line.yEnd,
          },
    );
  }
  return segments;
}

const unitOf = (point: Point): Point => {
  const length = Math.hypot(point.x, point.y) || 1;
  return { x: point.x / length, y: point.y / length };
};

/**
 * Where a chart row the icon did not draw goes on that icon. The approved flat schematic
 * (`GARMENT_SCHEMATIC`) is fitted onto the icon's own lines: body heights follow its length line,
 * body widths take the full width of its chest (or waist) line, so every across line is level and
 * the same width; sleeve lines stand square to the sleeve. `null` when the icon gives no frame.
 */
export function placeIconLine(iconKey: string, chartName: string): IconLineSegment | null {
  const icon = SIZE_CHART_ICONS[iconKey];
  if (!icon) return null;
  const pom = pomOf(icon, chartName);
  if (!pom) return null;
  const own = iconSegments(icon);
  if (own.has(pom)) return own.get(pom) ?? null;
  return icon.family === 'bottoms' ? placeBottom(own, pom) : placeTop(own, pom);
}

function placeBottom(own: Map<PomCode, IconLineSegment>, pom: PomCode): IconLineSegment | null {
  const schematic = GARMENT_SCHEMATIC.bottom.lines[pom];
  const waist = own.get('waist');
  const length = own.get('outseam');
  if (!schematic || !waist || !length) return null;
  const top = Math.min(length.y, length.y2);
  const bottom = Math.max(length.y, length.y2);
  const y = (value: number) => top + ((value - 108) / (655 - 108)) * (bottom - top);
  const x = (value: number) => waist.x + ((value - 118) / (376 - 118)) * (waist.x2 - waist.x);

  if (pom === 'hip') {
    const level = y(schematic.y1);
    return { x: waist.x, y: level, x2: waist.x2, y2: level };
  }
  if (LEG_ACROSS.has(pom)) {
    // One leg, level, between the icon's own thigh and leg-opening widths when it has them.
    const level = y(schematic.y1);
    const thigh = own.get('thigh');
    const opening = own.get('leg-opening');
    if (thigh && opening) {
      const t = (level - thigh.y) / (opening.y - thigh.y || 1);
      const start = thigh.x + (opening.x - thigh.x) * t;
      const end = thigh.x2 + (opening.x2 - thigh.x2) * t;
      return { x: start, y: level, x2: end, y2: level };
    }
    return { x: x(schematic.x1), y: level, x2: x(schematic.x2), y2: level };
  }
  if (pom === 'front-rise' || pom === 'back-rise' || pom === 'outseam') {
    const at = x(schematic.x1);
    return { x: at, y: y(schematic.y1), x2: at, y2: y(schematic.y2) };
  }
  return { x: x(schematic.x1), y: y(schematic.y1), x2: x(schematic.x2), y2: y(schematic.y2) };
}

function placeTop(own: Map<PomCode, IconLineSegment>, pom: PomCode): IconLineSegment | null {
  const schematic = GARMENT_SCHEMATIC.top.lines[pom];
  const across = own.get('chest') ?? own.get('hem') ?? own.get('waist');
  const length = own.get('length-hps');
  if (!schematic || !across || !length) return null;
  const left = Math.min(across.x, across.x2);
  const right = Math.max(across.x, across.x2);
  const width = right - left;
  const top = Math.min(length.y, length.y2);
  const bottom = Math.max(length.y, length.y2);
  const y = (value: number) => top + ((value - 126) / (520 - 126)) * (bottom - top);
  const x = (value: number) => left + ((value - 128) / (372 - 128)) * width;

  if (BODY_ACROSS.has(pom)) {
    const level =
      pom === 'across-shoulder' ? top - width * 0.06 : pom === 'hem' ? bottom : y(schematic.y1);
    return { x: left, y: level, x2: right, y2: level };
  }

  const sleeve = own.get('sleeve-length');
  if (sleeve && (pom === 'bicep' || pom === 'sleeve-opening')) {
    // The icon draws the sleeve as an offset dimension line; its garment edge starts at the body's
    // shoulder corner on the same side. Across lines stand square to it, centred on the sleeve.
    const toRight = sleeve.x2 >= sleeve.x;
    const shoulder = { x: toRight ? right : left, y: top + (bottom - top) * 0.05 };
    const along = unitOf({ x: sleeve.x2 - sleeve.x, y: sleeve.y2 - sleeve.y });
    const inward = toRight ? { x: -along.y, y: along.x } : { x: along.y, y: -along.x };
    const reach = Math.hypot(sleeve.x2 - sleeve.x, sleeve.y2 - sleeve.y);
    const t = pom === 'bicep' ? 0.4 : 0.97;
    const edge = { x: shoulder.x + along.x * reach * t, y: shoulder.y + along.y * reach * t };
    const inset = width * 0.02;
    // A sleeve that hangs along the body ends at the body's side seam: never draw across the body.
    const toSide = toRight
      ? (edge.x - right) / Math.max(-inward.x, 1e-6)
      : (left - edge.x) / Math.max(inward.x, 1e-6);
    const span = Math.max(
      width * 0.08,
      Math.min(width * (pom === 'bicep' ? 0.26 : 0.2), toSide - inset * 2),
    );
    return {
      x: edge.x + inward.x * inset,
      y: edge.y + inward.y * inset,
      x2: edge.x + inward.x * (inset + span),
      y2: edge.y + inward.y * (inset + span),
    };
  }

  if (schematic.x1 === schematic.x2) {
    const at = x(schematic.x1);
    return { x: at, y: y(schematic.y1), x2: at, y2: y(schematic.y2) };
  }
  if (schematic.y1 === schematic.y2) {
    const level = y(schematic.y1);
    return { x: x(schematic.x1), y: level, x2: x(schematic.x2), y2: level };
  }
  // Sleeves in the schematic sit on the left; mirror them to the side the icon draws its sleeve.
  const sleeveRight = (sleeve?.x2 ?? 0) > (sleeve?.x ?? 0);
  const mx = (value: number) => (sleeveRight ? 500 - value : value);
  return {
    x: x(mx(schematic.x1)),
    y: y(schematic.y1),
    x2: x(mx(schematic.x2)),
    y2: y(schematic.y2),
  };
}
