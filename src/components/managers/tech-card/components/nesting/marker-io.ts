// Adapters between the nesting run (lib/nesting/types) and the persisted tech-card marker
// (common_TechCardMarker*). Main-thread-safe: imports only types.ts and generated API types,
// so it may live in the lazy nesting chunk AND be imported by costing/recipe code without
// dragging dxf-parser/clipper into the main bundle.
import type {
  common_TechCardMarker,
  common_TechCardMarkerLayout,
  common_TechCardMarkerSummary,
  googletype_Decimal,
} from 'api/proto-http/admin';
import type { NestConfig, NestResult, PieceDTO, RotationDeg, Unit } from 'lib/nesting/types';

// The BOM fabric line as the marker features need it — a projection of the card form's
// bomItems rows (strings exactly as the form holds them). `id` is the server PK: 0 means
// the row was added in the UI but the card was never saved — the backend cannot resolve
// its line_key yet, so a marker must not link to it.
export type MarkerBomLine = {
  id: number;
  lineKey: string;
  name: string;
  unit: string;
  fabricWidth: string;
  wastagePercent: string;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

// Newest-first comparator shared by every «latest marker» pick — one clock, one rule
// (whole-second RFC3339 strings compare fine lexicographically; localeCompare keeps
// same-second ties deterministic).
export function newerMarker(
  a: common_TechCardMarkerSummary,
  b: common_TechCardMarkerSummary,
): number {
  return String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? ''));
}

// Meaningful download name: SEASON-STYLE-размер-ткань-маркер.ext, empty segments omitted,
// path-hostile characters replaced. Cyrillic is kept as-is (владелец: не транслитерировать).
export function exportFileName(parts: Array<string | undefined>, ext: string): string {
  const clean = parts
    .map((p) => (p ?? '').trim().replace(/\.(dxf|pdf|svg)$/i, ''))
    .filter(Boolean)
    .map((p) => p.replace(/[\\/:*?"<>|#%\s]+/g, ' ').trim().replace(/\s+/g, '_'));
  return `${clean.join('-') || 'раскладка'}.${ext}`;
}

// google.type.Decimal encode/decode for marker figures (2 decimals is the storage scale).
export function dec(n: number): googletype_Decimal {
  return { value: String(r2(n)) };
}
export function decNum(d?: googletype_Decimal): number {
  const n = Number(d?.value ?? '');
  return Number.isFinite(n) ? n : 0;
}

// Fabric per ONE garment, cm — prefers the server-derived figure, falls back to the raw
// division so an optimistic row (not yet refetched) still shows a number.
export function consumptionCm(s: common_TechCardMarkerSummary): number {
  const derived = decNum(s.consumptionPerUnitCm);
  if (derived > 0) return derived;
  const sets = Math.max(1, s.sets ?? 1);
  return r2(decNum(s.usedLengthCm) / sets);
}

// Marker cm → the BOM line's unit. The unit is free text — convert ONLY what is
// unambiguous (design §3: не угадывать). null = the line's unit cannot take a layout.
export function toBomUnit(cm: number, unit?: string): { value: number; unit: string } | null {
  const u = (unit ?? '').trim().toLowerCase();
  // 3 decimals: tech_card_colorway_usage.consumption is DECIMAL(10,3) — r2 on metres
  // throws away a digit the column holds (4+ m lost per 1000 units).
  if (u === 'м' || u === 'm') return { value: r3(cm / 100), unit: u };
  if (u === 'см' || u === 'cm') return { value: r2(cm), unit: u };
  return null;
}

export function markersForLine(
  markers: common_TechCardMarkerSummary[] | undefined,
  lineKey: string,
): common_TechCardMarkerSummary[] {
  if (!lineKey) return [];
  return (markers ?? []).filter((m) => (m.bomLineKey ?? '') === lineKey);
}

// Newest marker per size for one BOM line — the per-size apply source.
export function latestPerSize(
  markers: common_TechCardMarkerSummary[],
): Map<number, common_TechCardMarkerSummary> {
  const bySize = new Map<number, common_TechCardMarkerSummary>();
  for (const m of markers) {
    const sid = m.sizeId ?? 0;
    if (!sid) continue;
    const prev = bySize.get(sid);
    if (!prev || newerMarker(m, prev) < 0) bySize.set(sid, m);
  }
  return bySize;
}

// ── run → layout ────────────────────────────────────────────────────────────────────────

export function buildMarkerLayout(args: {
  pieces: PieceDTO[];
  // per-set quantity per piece id (the modal's sel state, WITHOUT the sets multiplier).
  perSetQty: Map<number, number>;
  // uploaded-file url by source label, provenance only.
  urlBySource: Map<string, string>;
  result: NestResult;
  unit: Exclude<Unit, 'auto'>;
  config: Pick<NestConfig, 'targetLengthCm' | 'rdpEpsCm' | 'timeBudgetMs'>;
  tol: number;
  tolChain: number;
  // Parse-time warnings (failed fetches, unit overrides, dropped loops) — they describe
  // the data the marker was BUILT from, so they must survive into the blob (a marker that
  // silently omits «файл не скачался» reads as a clean complete norm).
  parseWarnings?: string[];
}): common_TechCardMarkerLayout {
  const { pieces, perSetQty, urlBySource, result, unit, config } = args;
  const used = new Set(result.placements.map((p) => p.pieceId));
  return {
    schemaVersion: 1,
    params: {
      unit,
      tolCm: args.tol,
      tolChainCm: args.tolChain,
      rdpEpsCm: config.rdpEpsCm,
      targetLengthCm: config.targetLengthCm ?? 0,
      timeBudgetS: Math.round(config.timeBudgetMs / 1000),
    },
    pieces: pieces
      .filter((p) => used.has(p.id))
      .map((p) => ({
        pieceId: p.id,
        name: p.name,
        source: p.source,
        sourceUrl: urlBySource.get(p.source) ?? '',
        quantity: Math.max(1, perSetQty.get(p.id) ?? 1),
        poly: p.poly.map((pt) => ({ xCm: r2(pt.x), yCm: r2(pt.y) })),
        bboxWCm: r2(p.bboxW),
        bboxHCm: r2(p.bboxH),
        areaCm2: r2(p.areaCm2),
      })),
    placements: result.placements.map((pl) => ({
      pieceId: pl.pieceId,
      instance: pl.instance,
      rotDeg: pl.rot,
      xCm: r2(pl.x),
      yCm: r2(pl.y),
    })),
    warnings: [...(args.parseWarnings ?? []), ...result.warnings],
  };
}

// ── stored marker → view model ──────────────────────────────────────────────────────────

const ROTS: RotationDeg[] = [0, 90, 180, 270];

export function markerToView(marker: common_TechCardMarker): {
  pieces: PieceDTO[];
  result: NestResult;
  widthCm: number;
  targetCm?: number;
} {
  // Generated types spell every key as required-but-undefined, so a bare {} does not
  // assign; the cast is safe because every property is `| undefined`.
  const s = (marker.summary ?? {}) as common_TechCardMarkerSummary;
  const l = (marker.layout ?? {}) as common_TechCardMarkerLayout;
  const pieces: PieceDTO[] = (l.pieces ?? []).map((p) => ({
    id: p.pieceId ?? 0,
    name: p.name || `деталь ${p.pieceId ?? 0}`,
    source: p.source || '',
    poly: (p.poly ?? []).map((pt) => ({ x: pt.xCm ?? 0, y: pt.yCm ?? 0 })),
    bboxW: p.bboxWCm ?? 0,
    bboxH: p.bboxHCm ?? 0,
    areaCm2: p.areaCm2 ?? 0,
  }));
  const result: NestResult = {
    placements: (l.placements ?? []).map((pl) => ({
      pieceId: pl.pieceId ?? 0,
      instance: pl.instance ?? 0,
      rot: (ROTS.includes((pl.rotDeg ?? 0) as RotationDeg) ? pl.rotDeg ?? 0 : 0) as RotationDeg,
      x: pl.xCm ?? 0,
      y: pl.yCm ?? 0,
    })),
    usedLengthCm: decNum(s.usedLengthCm),
    efficiency: decNum(s.efficiencyPct) / 100,
    placedCount: s.placedCount ?? (l.placements ?? []).length,
    totalCount: s.totalCount ?? (l.placements ?? []).length,
    generation: 0,
    elapsedMs: 0,
    warnings: l.warnings ?? [],
  };
  const target = l.params?.targetLengthCm ?? 0;
  return {
    pieces,
    result,
    widthCm: decNum(s.fabricWidthCm) || 140,
    targetCm: target > 0 ? target : undefined,
  };
}
