import type { BoxMm } from 'lib/pattern-import/types';

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_VIEWPORT_V1 =
  'pattern-import-dxf-phase-e-cad-table-viewport/1' as const;

export type PatternImportDxfPhaseECadTableViewportRectV1 = Readonly<{
  left: number;
  top: number;
  width: number;
  height: number;
}>;

function extent(bounds: BoxMm) {
  return {
    width: Math.max(bounds.maxX - bounds.minX, 1e-6),
    height: Math.max(bounds.maxY - bounds.minY, 1e-6),
  };
}

function frozen(minX: number, minY: number, width: number, height: number): BoxMm {
  return Object.freeze({ minX, minY, maxX: minX + width, maxY: minY + height });
}

export function fitPatternImportDxfPhaseECadTableViewportAspectV1(
  bounds: BoxMm,
  aspect: number,
): BoxMm {
  const { width, height } = extent(bounds);
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : width / height;
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  if (width / height < safeAspect) {
    const nextWidth = height * safeAspect;
    return frozen(centerX - nextWidth / 2, bounds.minY, nextWidth, height);
  }
  const nextHeight = width / safeAspect;
  return frozen(bounds.minX, centerY - nextHeight / 2, width, nextHeight);
}

export function zoomPatternImportDxfPhaseECadTableViewportV1(
  current: BoxMm,
  fit: BoxMm,
  client: Readonly<{ x: number; y: number }>,
  rect: PatternImportDxfPhaseECadTableViewportRectV1,
  factor: number,
): BoxMm {
  const currentSize = extent(current);
  const fitSize = extent(fit);
  if (
    !Number.isFinite(factor) ||
    factor <= 0 ||
    !Number.isFinite(rect.width) ||
    !Number.isFinite(rect.height) ||
    rect.width <= 0 ||
    rect.height <= 0
  )
    return current;
  const ratioX = Math.min(1, Math.max(0, (client.x - rect.left) / rect.width));
  const ratioY = Math.min(1, Math.max(0, (client.y - rect.top) / rect.height));
  const anchorX = current.minX + currentSize.width * ratioX;
  const anchorY = current.minY + currentSize.height * ratioY;
  const minWidth = fitSize.width / 400;
  const maxWidth = fitSize.width * 8;
  const nextWidth = Math.min(maxWidth, Math.max(minWidth, currentSize.width * factor));
  const scale = nextWidth / currentSize.width;
  const nextHeight = currentSize.height * scale;
  return frozen(anchorX - nextWidth * ratioX, anchorY - nextHeight * ratioY, nextWidth, nextHeight);
}

export function panPatternImportDxfPhaseECadTableViewportV1(
  origin: BoxMm,
  deltaClient: Readonly<{ x: number; y: number }>,
  rect: PatternImportDxfPhaseECadTableViewportRectV1,
): BoxMm {
  const size = extent(origin);
  if (rect.width <= 0 || rect.height <= 0) return origin;
  const dx = (deltaClient.x / rect.width) * size.width;
  const dy = (deltaClient.y / rect.height) * size.height;
  return frozen(origin.minX - dx, origin.minY - dy, size.width, size.height);
}

export function patternImportDxfPhaseECadTableZoomPercentV1(current: BoxMm, fit: BoxMm): number {
  return Math.round((extent(fit).width / extent(current).width) * 100);
}

/**
 * Keeps a vertex handle readable without pinning it to one screen size. Around normal CAD zoom
 * the handle owns a real millimetre radius, so it grows and shrinks with the pattern. Only the
 * extreme zoom limits are clamped to avoid an invisible dot or a handle that covers the piece.
 */
export function resolvePatternImportDxfPhaseECadTableHandleRadiusV1(
  mmPerPixel: number,
  nominalRadiusMm = 4,
  minRadiusPx = 2,
  maxRadiusPx = 12,
): number {
  const safeUnit = Number.isFinite(mmPerPixel) && mmPerPixel > 0 ? mmPerPixel : 1;
  const safeNominal = Number.isFinite(nominalRadiusMm) ? Math.max(0, nominalRadiusMm) : 4;
  const safeMinPx = Number.isFinite(minRadiusPx) ? Math.max(0, minRadiusPx) : 2;
  const safeMaxPx = Number.isFinite(maxRadiusPx)
    ? Math.max(safeMinPx, maxRadiusPx)
    : Math.max(safeMinPx, 12);
  return Math.min(safeUnit * safeMaxPx, Math.max(safeUnit * safeMinPx, safeNominal));
}

export function resolvePatternImportDxfPhaseECadTableHandleHitRadiusV1(
  mmPerPixel: number,
  targetRadiusPx = 10,
): number {
  const safeUnit = Number.isFinite(mmPerPixel) && mmPerPixel > 0 ? mmPerPixel : 1;
  const safeTargetPx = Number.isFinite(targetRadiusPx) ? Math.max(1, targetRadiusPx) : 10;
  return safeUnit * safeTargetPx;
}
