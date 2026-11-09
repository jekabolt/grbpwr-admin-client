import type {
  common_AdminColorwayRef,
  common_TechCard,
  common_TechCardBomItem,
  common_TechCardColorwayUsage,
  common_TechCardMediaFull,
  common_TechCardPiece,
} from 'api/proto-http/admin';
import {
  derivePieceLayerRole,
  pieceLayerRoleLabel,
} from 'components/managers/tech-card/components/piece-layer-role';
import { wireInt } from 'components/managers/tech-card/components/wire-int';
import { englishT, type PdfT } from './i18n';

export type ResolvedTechMedia = {
  id: number;
  url: string;
  width?: number;
  height?: number;
  caption: string;
};

export type BomRef = { item: common_TechCardBomItem; index: number; key: string };

export const clean = (value?: string | null): string => (value ?? '').trim();

export function decimal(value?: { value?: string } | null): number | null {
  const raw = clean(value?.value);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * A proto enum as a lower-case word: `prefix` strips a known prefix, otherwise the part after the
 * enum's family marker (`_PURPOSE_`, `_KIND_`, …). Unset and `*_UNKNOWN` print nothing.
 */
export function enumLabel(value?: string, prefix?: string): string {
  let label = clean(value);
  if (!label || label.endsWith('_UNKNOWN')) return '';
  if (prefix && label.startsWith(prefix)) label = label.slice(prefix.length);
  else {
    for (const marker of [
      '_SECTION_',
      '_KIND_',
      '_PURPOSE_',
      '_ZONE_',
      '_TYPE_',
      '_ENUM_',
      '_STATE_',
    ]) {
      const index = label.indexOf(marker);
      if (index >= 0) {
        label = label.slice(index + marker.length);
        break;
      }
    }
  }
  return label.replaceAll('_', ' ').toLowerCase();
}

export function alphaKey(index: number): string {
  return String.fromCharCode(65 + (index % 26));
}

export function colorwayName(
  colorway: common_AdminColorwayRef,
  index: number,
  t: PdfT = englishT,
): string {
  return (
    clean(colorway.devName) ||
    clean(colorway.colorCode) ||
    clean(colorway.baseSku) ||
    t('colourways.number', { number: index + 1 })
  );
}

export function colorwayHex(colorway?: common_AdminColorwayRef): string {
  return clean(colorway?.colours?.[0]?.hex) || clean(colorway?.devHex);
}

export function colorwayColour(colorway?: common_AdminColorwayRef): string {
  const main = colorway?.colours?.[0];
  return (
    clean(main?.label) || clean(main?.pantone) || clean(colorway?.pantone) || colorwayHex(colorway)
  );
}

/**
 * The colourway a card without colourways prints: its BOM colours, named after the main fabric's
 * colour. Empty when no BOM line has a colour either.
 */
export function bomColourwayName(card: common_TechCard): string {
  const refs = bomRefs(card);
  const coloured = (list: BomRef[]) => list.find((ref) => clean(ref.item.color));
  return clean((coloured(refs.filter(rollGoods)) ?? coloured(refs))?.item.color);
}

export function mediaFromResolved(item?: common_TechCardMediaFull): ResolvedTechMedia | null {
  const full = item?.media?.media?.fullSize;
  const compressed = item?.media?.media?.compressed;
  const thumbnail = item?.media?.media?.thumbnail;
  const info = full?.mediaUrl ? full : compressed?.mediaUrl ? compressed : thumbnail;
  const url = clean(info?.mediaUrl);
  if (!item || !url) return null;
  return {
    id: wireInt(item.media?.id),
    url,
    width: info?.width,
    height: info?.height,
    caption: clean(item.caption),
  };
}

export function technicalMedia(
  card: common_TechCard,
  kind: common_TechCardMediaFull['kind'],
): ResolvedTechMedia | null {
  return mediaFromResolved(card.resolvedTechnicalMedia?.find((item) => item.kind === kind));
}

export function bomRefs(card: common_TechCard): BomRef[] {
  return (card.techCard?.bomItems ?? []).map((item, index) => ({
    item,
    index,
    key: clean(item.lineKey) || `bom-${wireInt(item.id) || index + 1}`,
  }));
}

export function resolveBomRef(
  refs: BomRef[],
  source: { bomLineKey?: string; bomItemId?: number; bomItemIndex?: number },
): BomRef | null {
  const lineKey = clean(source.bomLineKey);
  if (lineKey) {
    const byKey = refs.find((ref) => clean(ref.item.lineKey) === lineKey);
    if (byKey) return byKey;
  }
  const id = wireInt(source.bomItemId);
  if (id) {
    const byId = refs.find((ref) => wireInt(ref.item.id) === id);
    if (byId) return byId;
  }
  return source.bomItemIndex != null ? refs[source.bomItemIndex] ?? null : null;
}

export function rollGoods(ref: BomRef): boolean {
  return derivePieceLayerRole(ref.item.section, ref.item.purpose).rollGoods;
}

export function materialRole(ref: BomRef): string {
  const derived = derivePieceLayerRole(ref.item.section, ref.item.purpose);
  return pieceLayerRoleLabel(derived) || enumLabel(ref.item.section) || 'material';
}

export function pieceKey(piece: common_TechCardPiece, index: number): string {
  return clean(piece.lineKey) || `piece-${index + 1}`;
}

export function usageForPiece(
  colorway: common_AdminColorwayRef | undefined,
  piece: common_TechCardPiece,
  pieceIndex: number,
): common_TechCardColorwayUsage | null {
  const key = clean(piece.lineKey);
  return (
    (colorway?.usages ?? []).find((usage) =>
      key ? clean(usage.pieceLineKey) === key : usage.pieceIndex === pieceIndex,
    ) ?? null
  );
}

export function materialForPiece(
  refs: BomRef[],
  colorway: common_AdminColorwayRef | undefined,
  piece: common_TechCardPiece,
  pieceIndex: number,
  techCard?: common_TechCard,
): BomRef | null {
  const pieceLineKey = clean(piece.lineKey);
  const candidates = (colorway?.usages ?? [])
    .filter((usage) =>
      pieceLineKey ? clean(usage.pieceLineKey) === pieceLineKey : usage.pieceIndex === pieceIndex,
    )
    .map((usage) => resolveBomRef(refs, usage))
    .filter((ref): ref is BomRef => Boolean(ref));
  if (candidates.length) {
    const rank: Record<string, number> = {
      TECH_CARD_BOM_PURPOSE_MAIN: 0,
      TECH_CARD_BOM_PURPOSE_CONTRAST: 1,
      TECH_CARD_BOM_PURPOSE_BINDING: 1,
      TECH_CARD_BOM_PURPOSE_LINING: 2,
      TECH_CARD_BOM_PURPOSE_POCKETING: 3,
      TECH_CARD_BOM_PURPOSE_MESH: 4,
      TECH_CARD_BOM_PURPOSE_OTHER: 5,
      TECH_CARD_BOM_PURPOSE_INTERFACING: 7,
      TECH_CARD_BOM_PURPOSE_INSULATION: 8,
    };
    return candidates.sort((a, b) => {
      const aRole = derivePieceLayerRole(a.item.section, a.item.purpose);
      const bRole = derivePieceLayerRole(b.item.section, b.item.purpose);
      return (rank[aRole.role ?? ''] ?? 6) - (rank[bRole.role ?? ''] ?? 6);
    })[0];
  }

  const legacy = (piece.materials ?? []).find(
    (material) => wireInt(material.colorwayId) === wireInt(colorway?.colorwayId),
  );
  const legacyRef = legacy ? resolveBomRef(refs, legacy) : null;
  if (legacyRef) return legacyRef;

  const uniqueRef = (candidates: Array<BomRef | null>): BomRef | null => {
    const unique = new Map(
      candidates.filter((ref): ref is BomRef => Boolean(ref)).map((ref) => [ref.key, ref]),
    );
    return unique.size === 1 ? [...unique.values()][0] : null;
  };
  const refForBinding = (binding: {
    bomLineKey?: string;
    fabricPurpose?: string;
  }): BomRef | null => {
    const byLine = resolveBomRef(refs, binding);
    if (byLine) return byLine;
    const purpose = clean(binding.fabricPurpose);
    if (!purpose) return null;
    return uniqueRef(
      refs.filter((ref) => rollGoods(ref) && clean(ref.item.purpose) === purpose).map((ref) => ref),
    );
  };
  const insert = techCard?.techCard;
  if (!insert) return null;

  // A stored area scope names the cloth whose DXF supplied this exact piece. It is the strongest
  // fallback because the binding is piece-specific, unlike a card-wide pattern row.
  const areaScope = (techCard.pieceAreaScopes ?? []).find((scope) =>
    (scope.areas ?? []).some((area) => clean(area.pieceLineKey) === pieceLineKey),
  );
  if (areaScope) {
    const scopeKey = clean(areaScope.scopeKey);
    const direct = refForBinding({ bomLineKey: scopeKey, fabricPurpose: scopeKey });
    if (direct) return direct;
    const fromScopePattern = uniqueRef(
      (insert.patterns ?? [])
        .filter(
          (pattern) =>
            clean(pattern.bomLineKey) === scopeKey || clean(pattern.fabricPurpose) === scopeKey,
        )
        .map(refForBinding),
    );
    if (fromScopePattern) return fromScopePattern;
  }

  // A block-to-piece row carries the same DXF scope as the sheet it came from. Older cards often
  // have this link but no colourway recipe on the piece.
  const aliases = (insert.pieceDxfAliases?.items ?? []).filter(
    (alias) => clean(alias.pieceLineKey) === pieceLineKey,
  );
  const aliasRef = uniqueRef(aliases.map(refForBinding));
  if (aliasRef) return aliasRef;

  // Finally, a card with one bound pattern material has one honest answer for every piece in that
  // DXF. Multiple pattern materials remain unresolved unless one of the piece-specific bindings
  // above disambiguates them.
  return uniqueRef((insert.patterns ?? []).map(refForBinding));
}

export function usageForBom(
  colorway: common_AdminColorwayRef | undefined,
  ref: BomRef,
): common_TechCardColorwayUsage | null {
  return (
    (colorway?.usages ?? []).find((usage) => {
      if (clean(usage.pieceLineKey) || usage.pieceIndex != null) return false;
      const lineKey = clean(usage.bomLineKey);
      if (lineKey) return lineKey === clean(ref.item.lineKey);
      const id = wireInt(usage.bomItemId);
      if (id) return id === wireInt(ref.item.id);
      return usage.bomItemIndex === ref.index;
    }) ?? null
  );
}

export function materialColour(
  ref: BomRef,
  colorway?: common_AdminColorwayRef,
): { name: string; swatch: string } {
  const usage = usageForBom(colorway, ref);
  return {
    name:
      clean(usage?.color) ||
      clean(usage?.pantone) ||
      clean(ref.item.color) ||
      colorwayColour(colorway),
    swatch: colorwayHex(colorway),
  };
}

export function formatNumber(value: number | null, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return '';
  return value.toFixed(digits).replace(/\.0+$/, '');
}

type DecimalLike = { value?: string } | null | undefined;

export function decimalText(value: DecimalLike): string {
  return value?.value?.trim() ?? '';
}

export function decimalNumber(value: DecimalLike): number | undefined {
  // an unset decimal is absent, not zero
  const text = decimalText(value);
  const parsed = text ? Number(text) : NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function shortDate(value: string | undefined): string {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toISOString().slice(0, 10);
}

export function alphaLabel(index: number): string {
  let current = index;
  let out = '';
  do {
    out = String.fromCharCode(65 + (current % 26)) + out;
    current = Math.floor(current / 26) - 1;
  } while (current >= 0);
  return out;
}
