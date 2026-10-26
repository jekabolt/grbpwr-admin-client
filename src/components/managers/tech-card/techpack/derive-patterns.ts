import type {
  common_TechCard,
  common_TechCardMarker,
  common_TechCardMarkerSummary,
  common_TechCardSizePattern,
} from 'api/proto-http/admin';
import {
  bindingScopes,
  bomPurposeLabel,
  fabricScopes,
  isRollGoodsSection,
  scopeKeyOfBinding,
  type BindingScopes,
  type RollGoodsLine,
} from 'components/managers/tech-card/components/bom-purpose';
import { markerToView } from 'components/managers/tech-card/components/nesting/marker-io';
import { wireFabricPurpose } from 'components/managers/tech-card/components/pattern-size-index';
import { renderLayoutSvg } from 'lib/nesting/render/svg';
import {
  alphaKey,
  alphaLabel,
  bomRefs,
  decimalNumber,
  materialForPiece,
  materialRole,
  rollGoods as isRollGoods,
} from './derive-shared';
import type { Gap, GapSink } from './gaps';

export type TechpackPatternGroup = {
  key: string;
  code: string;
  label: string;
  sheetCount: number;
  pieceCount?: number;
  version?: number;
  sizes: string;
  qrValue?: string;
  qrGap?: Gap;
};

export type TechpackMarkerRow = {
  key: string;
  id?: number;
  label: string;
  /** The BOM letter of the fabric («A»), when the marker is bound to a BOM roll-goods line. */
  code?: string;
  fabric: string;
  widthCm?: number;
  pieceCount?: number;
  netM2?: number;
  markerM?: number;
  utilizationPct?: number;
  perGarment: string[];
  qrValue?: string;
  layoutSvg?: string;
  missing?: 'marker' | 'layout' | 'link';
  gap?: Gap;
};

export type PatternsMarkerModel = {
  patterns: TechpackPatternGroup[];
  markers: TechpackMarkerRow[];
  missing: string[];
  emptyGap?: Gap;
};

type PatternInput = {
  techCard: common_TechCard;
  markerLayouts?: readonly common_TechCardMarker[];
  patternViewerToken?: string;
  patternOrigin?: string;
  markerOrigin?: string;
  sizeNames?: Readonly<Record<number, string>>;
  /** Net cut area per garment by BOM line, from the DXF pieces: the row a marker does not cover. */
  netM2ByLine?: Readonly<Record<string, number>>;
  /** Fetch/render detail layouts only on pages that actually print the SVG previews. */
  includeLayouts?: boolean;
};

type PatternScope = ReturnType<typeof fabricScopes>[number];

const trimOrigin = (origin: string | undefined): string => (origin ?? '').trim().replace(/\/$/, '');

const patternExt = (pattern: common_TechCardSizePattern): string => {
  const source = pattern.filename || pattern.url || '';
  return source.split(/[?#]/)[0].split('.').pop()?.toLowerCase() ?? '';
};

/** `links` — the card's whole link set over its whole partition: a link resolves against the card. */
function scopePieceCount(
  techCard: common_TechCard,
  scope: PatternScope,
  links: BindingScopes,
): number | undefined {
  const tc = techCard.techCard;
  const keys = new Set(
    (tc?.pieceDxfAliases?.items ?? [])
      .filter(
        (alias) => scopeKeyOfBinding(alias.fabricPurpose, alias.bomLineKey, links) === scope.key,
      )
      .map((alias) => alias.pieceLineKey?.trim())
      .filter((key): key is string => !!key),
  );
  if (keys.size === 0) return undefined;
  const pieces = new Map((tc?.pieces ?? []).map((piece) => [piece.lineKey?.trim(), piece]));
  let count = 0;
  for (const key of keys) count += Math.max(1, pieces.get(key)?.piecesPerGarment ?? 1);
  return count || undefined;
}

function groupSizeLine(
  sheets: readonly common_TechCardSizePattern[],
  sizeIds: readonly number[],
  sizeNames: Readonly<Record<number, string>>,
): string {
  const named = new Set<number>();
  let graded = false;
  let sizeless = false;
  for (const sheet of sheets) {
    if (sheet.sizeId) named.add(sheet.sizeId);
    else if (patternExt(sheet) === 'dxf') graded = true;
    else sizeless = true;
  }
  const ordered = [
    ...sizeIds.filter((id) => named.has(id)),
    ...[...named].filter((id) => !sizeIds.includes(id)),
  ];
  return [
    ...ordered.map((id) => sizeNames[id] || `#${id}`),
    graded ? 'graded' : '',
    sizeless ? 'sizeless' : '',
  ]
    .filter(Boolean)
    .join(', ');
}

function markerNetM2(marker: common_TechCardMarker): number | undefined {
  const summary = marker.summary;
  const composition = summary?.composition ?? [];
  const totalUnits = composition.reduce((sum, row) => sum + (row.quantity ?? 0), 0);
  const weightedArea = composition.reduce((sum, row) => {
    const area = decimalNumber(row.areaPerGarmentCm2);
    return sum + (area == null ? 0 : area * (row.quantity ?? 0));
  }, 0);
  if (weightedArea > 0 && totalUnits > 0) return weightedArea / totalUnits / 10_000;

  const layout = marker.layout;
  if (!layout?.pieces?.length) return undefined;
  const quantities = new Map(
    (layout.composition ?? []).map((row) => [row.sizeId ?? 0, row.quantity ?? 0]),
  );
  const units = [...quantities.values()].reduce((sum, quantity) => sum + quantity, 0);
  const allUnits = units || summary?.totalUnits || summary?.sets || 1;
  const area = layout.pieces.reduce((sum, piece) => {
    const garmentCount = piece.sizeId ? quantities.get(piece.sizeId) ?? 0 : allUnits;
    return sum + (piece.areaCm2 ?? 0) * Math.max(1, piece.quantity ?? 1) * garmentCount;
  }, 0);
  return area > 0 ? area / allUnits / 10_000 : undefined;
}

function markerPerGarment(
  summary: common_TechCardMarkerSummary,
  sizeNames: Readonly<Record<number, string>>,
): string[] {
  const scalar = decimalNumber(summary.consumptionPerUnitCm);
  if (scalar != null) return [(scalar / 100).toFixed(2)];
  return (summary.composition ?? []).flatMap((row) => {
    const value = decimalNumber(row.consumptionPerUnitCm);
    if (value == null || !row.sizeId) return [];
    return [`${sizeNames[row.sizeId] || `#${row.sizeId}`} ${(value / 100).toFixed(2)}`];
  });
}

function markerLayoutSvg(marker: common_TechCardMarker): string | undefined {
  if (!marker.layout) return undefined;
  try {
    const view = markerToView(marker);
    if (!view.widthCm || view.pieces.length === 0 || view.result.placements.length === 0) {
      return undefined;
    }
    return renderLayoutSvg(view.result, view.pieces, view.widthCm, view.targetCm, 0.05);
  } catch {
    return undefined;
  }
}

export function derivePatternsMarkerPage(input: PatternInput, sink?: GapSink): PatternsMarkerModel {
  const { techCard } = input;
  const tc = techCard.techCard;
  const sizeNames = input.sizeNames ?? {};
  const patternOrigin = trimOrigin(input.patternOrigin);
  const markerOrigin = trimOrigin(input.markerOrigin);
  const add = (
    code: string,
    label: string,
    field: string,
    refs: string[] = [],
    bomLine?: string,
  ): Gap => {
    const gap: Gap = {
      code,
      refs: [...refs, bomLine ? `bom:${bomLine}` : '', `field:${field}`].filter(Boolean),
      label,
      section: '04',
      target: { tab: 'patterns', bomLine, field },
    };
    return sink?.add(gap) ?? gap;
  };
  const patternSheets = (tc?.patterns ?? []).filter((pattern) => pattern.url?.trim());
  const rollGoods: RollGoodsLine[] = (tc?.bomItems ?? [])
    .filter((item) => isRollGoodsSection(item.section) && item.lineKey)
    .map((item) => ({
      lineKey: item.lineKey!,
      purpose: item.purpose ?? '',
      name: item.name ?? '',
      section: item.section ?? '',
    }));
  const scopes = fabricScopes(rollGoods);
  const sheetSet = bindingScopes(scopes, tc?.patterns ?? []);
  const links = bindingScopes(scopes, tc?.pieceDxfAliases?.items ?? []);
  const sheetsByScope = new Map<string, common_TechCardSizePattern[]>();
  for (const sheet of patternSheets) {
    const key = scopeKeyOfBinding(sheet.fabricPurpose, sheet.bomLineKey, sheetSet);
    sheetsByScope.set(key, [...(sheetsByScope.get(key) ?? []), sheet]);
  }

  const patterns: TechpackPatternGroup[] = [];
  const addPattern = (scope: PatternScope | undefined, sheets: common_TechCardSizePattern[]) => {
    if (sheets.length === 0) return;
    const index = patterns.length;
    const wireKey = scope
      ? scope.byPurpose
        ? wireFabricPurpose(scope.key)
        : scope.key
      : '_unbound';
    const label = scope
      ? scope.byPurpose
        ? bomPurposeLabel(scope.key)
        : scope.lines[0]?.name?.trim() || 'BOM line'
      : 'unbound';
    const versionStamp = sheets.reduce((sum, sheet) => sum + (sheet.version ?? 0), 0);
    const maxVersion = sheets.reduce((max, sheet) => Math.max(max, sheet.version ?? 0), 0);
    const qrValue =
      input.patternViewerToken && patternOrigin
        ? `${patternOrigin}/p/${input.patternViewerToken}?g=${encodeURIComponent(wireKey)}&v=${versionStamp}&n=${sheets.length}`
        : undefined;
    patterns.push({
      key: wireKey,
      code: alphaLabel(index),
      label,
      sheetCount: sheets.length,
      pieceCount: scope ? scopePieceCount(techCard, scope, links) : undefined,
      version: maxVersion || undefined,
      sizes: groupSizeLine(sheets, tc?.sizeIds ?? [], sizeNames),
      qrValue,
      qrGap: !qrValue
        ? add('pdf_pattern_qr_missing', 'qr', 'pattern qr', [`field:pattern ${wireKey}`])
        : undefined,
    });
  };
  for (const scope of scopes) addPattern(scope, sheetsByScope.get(scope.key) ?? []);
  addPattern(undefined, sheetsByScope.get('') ?? []);

  const layoutsById = new Map<number, common_TechCardMarker>();
  for (const marker of input.markerLayouts ?? []) {
    const id = marker.summary?.id;
    if (id) layoutsById.set(id, marker);
  }
  // fabrics as the BOM letters them (A main, B pocketing): every one gets a consumption row
  const refs = bomRefs(techCard);
  const fabrics = refs.filter(isRollGoods).map((ref, index) => ({ ref, code: alphaKey(index) }));
  const fabricOf = (lineKey?: string) =>
    lineKey ? fabrics.find((fabric) => fabric.ref.key === lineKey.trim()) : undefined;
  const markers: TechpackMarkerRow[] = (techCard.markers ?? []).map((summary, index) => {
    const id = summary.id || undefined;
    const layout = id ? layoutsById.get(id) : undefined;
    const usedLengthCm = decimalNumber(summary.usedLengthCm);
    const fabric = fabricOf(summary.bomLineKey);
    const missing =
      !id || !techCard.id || !markerOrigin
        ? 'link'
        : input.includeLayouts && !layout
          ? 'layout'
          : undefined;
    return {
      key: id ? String(id) : `marker-${index}`,
      id,
      label: summary.name?.trim() || (id ? `marker ${id}` : 'marker'),
      code: fabric?.code,
      fabric: fabric ? materialRole(fabric.ref) : summary.bomItemName?.trim() || 'unbound',
      widthCm: decimalNumber(summary.fabricWidthCm),
      pieceCount: summary.totalCount || undefined,
      netM2:
        (layout ? markerNetM2(layout) : undefined) ??
        (fabric ? input.netM2ByLine?.[fabric.ref.key] : undefined),
      markerM: usedLengthCm == null ? undefined : usedLengthCm / 100,
      utilizationPct: decimalNumber(summary.efficiencyPct),
      perGarment: markerPerGarment(summary, sizeNames),
      qrValue:
        id && techCard.id && markerOrigin
          ? `${markerOrigin}/tech-cards/${techCard.id}/markers/${id}/view`
          : undefined,
      layoutSvg: input.includeLayouts && layout ? markerLayoutSvg(layout) : undefined,
      missing,
      gap: missing
        ? add(
            `pdf_marker_${missing}_missing`,
            missing,
            missing,
            [`field:marker ${id ?? index + 1}`],
            summary.bomLineKey,
          )
        : undefined,
    };
  });

  const primary = techCard.colorways?.[0];
  const pieces = tc?.pieces ?? [];
  for (const fabric of fabrics) {
    if ((techCard.markers ?? []).some((marker) => fabricOf(marker.bomLineKey) === fabric)) continue;
    const cut = pieces.filter(
      (piece, index) => materialForPiece(refs, primary, piece, index)?.key === fabric.ref.key,
    );
    const gap = add('pdf_marker_missing', 'marker', 'marker', [], fabric.ref.key);
    markers.push({
      key: `missing-${fabric.ref.key}`,
      label: `${fabric.code} ${materialRole(fabric.ref)}`,
      code: fabric.code,
      fabric: materialRole(fabric.ref),
      widthCm: decimalNumber(fabric.ref.item.fabricWidth),
      pieceCount:
        cut.reduce((sum, piece) => sum + Math.max(1, piece.piecesPerGarment ?? 1), 0) || undefined,
      netM2: input.netM2ByLine?.[fabric.ref.key],
      perGarment: [],
      missing: 'marker',
      gap,
    });
  }

  const missing = [
    ...(patternSheets.length === 0 ? ['patterns'] : []),
    ...(patternSheets.length > 0 && patterns.some((pattern) => !pattern.qrValue)
      ? ['pattern qr']
      : []),
    ...(markers.some((marker) => marker.missing === 'marker') ? ['marker'] : []),
    ...(markers.some((marker) => marker.missing === 'layout') ? ['layout'] : []),
  ];
  return {
    patterns,
    markers,
    missing,
    emptyGap:
      patternSheets.length === 0 ? add('pdf_patterns_missing', 'pattern', 'patterns') : undefined,
  };
}
