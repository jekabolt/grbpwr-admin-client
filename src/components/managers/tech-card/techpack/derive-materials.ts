import type { common_TechCard } from 'api/proto-http/admin';
import { wireInt } from 'components/managers/tech-card/components/wire-int';
import { formatCompositionCell } from 'components/managers/materials/components/material-code';
import {
  alphaKey,
  bomRefs,
  clean,
  decimal,
  enumLabel,
  materialColour,
  materialForPiece,
  materialRole,
  rollGoods,
  technicalMedia,
} from './derive-shared';

const THREAD = 'TECH_CARD_BOM_SECTION_THREAD';
const INTERLINING = 'TECH_CARD_BOM_SECTION_INTERLINING';
const TRIM_SECTIONS = new Set([
  'TECH_CARD_BOM_SECTION_HARDWARE',
  'TECH_CARD_BOM_SECTION_TRIM',
  'TECH_CARD_BOM_SECTION_DECORATION',
  'TECH_CARD_BOM_SECTION_OTHER',
]);

const pct = (value: number | null): number => {
  if (value == null) return 50;
  return Math.max(0, Math.min(100, Math.abs(value) <= 1 ? value * 100 : value));
};

export type Spot = {
  key: string;
  pin: string;
  where: string;
  operationNumbers: number[];
  source: string;
  qty: number | null;
  x: number;
  y: number;
  hasPosition: boolean;
  onFront: boolean;
};

export type MaterialsModel = ReturnType<typeof deriveMaterials>;

export function deriveMaterials(techCard: common_TechCard) {
  const card = techCard.techCard;
  const refs = bomRefs(techCard);
  const primary = techCard.colorways?.[0];
  const pieces = card?.pieces ?? [];
  const operations = card?.operations ?? [];
  const callouts = card?.callouts ?? [];
  const front = technicalMedia(techCard, 'TECH_CARD_MEDIA_KIND_FRONT');
  const fabrics = refs.filter(rollGoods).map((ref, index) => {
    const marker = (techCard.markers ?? []).find(
      (item) =>
        clean(item.bomLineKey) === clean(ref.item.lineKey) &&
        (!wireInt(item.colorwayId) || wireInt(item.colorwayId) === wireInt(primary?.colorwayId)),
    );
    const assignedPieces = pieces.filter(
      (piece, pieceIndex) => materialForPiece(refs, primary, piece, pieceIndex)?.key === ref.key,
    );
    const colour = materialColour(ref, primary);
    const markerLength = decimal(marker?.consumptionPerUnitCm) ?? decimal(marker?.usedLengthCm);
    return {
      key: alphaKey(index),
      refKey: ref.key,
      name: clean(ref.item.name),
      role: materialRole(ref),
      colour: colour.name,
      swatch: colour.swatch,
      composition: formatCompositionCell(ref.item.composition),
      widthCm: decimal(ref.item.effectiveFabricWidthCm) ?? decimal(ref.item.fabricWidth),
      weightGsm: decimal(ref.item.fabricWeightGsm),
      pieceCount: assignedPieces.length,
      consumptionM: markerLength == null ? null : markerLength / 100,
      efficiencyPct: decimal(marker?.efficiencyPct),
      unitPrice: decimal(ref.item.unitPrice),
      currency: clean(ref.item.currency),
      unit: clean(ref.item.unit),
    };
  });

  const thread = refs
    .filter((ref) => ref.item.section === THREAD)
    .map((ref) => {
      const linkedOperations = operations.filter((operation) =>
        (operation.bomLineKeys ?? []).includes(clean(ref.item.lineKey)),
      );
      const colour = materialColour(ref, primary);
      return {
        key: ref.key,
        name: clean(ref.item.name),
        colour: colour.name,
        swatch: colour.swatch,
        composition: formatCompositionCell(ref.item.composition),
        supplier: clean(ref.item.supplier),
        operationNumbers: linkedOperations
          .map((operation) => operation.operationNumber)
          .filter((number): number is number => number != null),
      };
    });

  const hardware = refs
    .filter((ref) => TRIM_SECTIONS.has(ref.item.section ?? ''))
    .map((ref) => {
      const linkedOperations = operations.filter((operation) =>
        (operation.bomLineKeys ?? []).includes(clean(ref.item.lineKey)),
      );
      // one row per place: ops that put this line on the same pin and zone share it
      const spots: Spot[] = [];
      for (const operation of linkedOperations) {
        const callout = callouts.find((item) => item.number === operation.calloutNumber);
        const pin = operation.calloutNumber == null ? '' : String(operation.calloutNumber);
        const where = enumLabel(operation.zone) || clean(callout?.part);
        const quantity = decimal(
          operation.bomQuantities?.find((item) => clean(item.lineKey) === clean(ref.item.lineKey))
            ?.qtyPerGarment,
        );
        const same = spots.find((spot) => spot.pin === pin && spot.where === where);
        if (same) {
          if (operation.operationNumber != null)
            same.operationNumbers.push(operation.operationNumber);
          if (quantity != null) same.qty = (same.qty ?? 0) + quantity;
          continue;
        }
        const x = decimal(callout?.posX);
        const y = decimal(callout?.posY);
        spots.push({
          key: `${operation.operationNumber ?? spots.length}-${ref.key}`,
          pin,
          where,
          operationNumbers: operation.operationNumber == null ? [] : [operation.operationNumber],
          source: 'op link',
          qty: quantity,
          x: pct(x),
          y: pct(y),
          hasPosition: x != null && y != null,
          onFront:
            !wireInt(callout?.mediaId) || !front?.id || wireInt(callout?.mediaId) === front.id,
        });
      }
      const lineQty = decimal(ref.item.qtyPerGarment);
      // a line placed in one spot puts all of its quantity there
      if (spots.length === 1 && spots[0].qty == null) spots[0].qty = lineQty;
      const spotQty = spots.reduce((sum, spot) => sum + (spot.qty ?? 0), 0);
      return {
        key: ref.key,
        name: clean(ref.item.name),
        detail: clean(ref.item.composition) || clean(ref.item.spec),
        kind: enumLabel(ref.item.kind) || enumLabel(ref.item.section),
        spots,
        qty: lineQty ?? (spotQty || null),
      };
    });

  const fused = pieces
    .filter((piece) => piece.fused)
    .map((piece) => clean(piece.name))
    .filter(Boolean);
  const hasInterlining = refs.some((ref) => ref.item.section === INTERLINING);
  const buttonTotal = hardware
    .filter((item) => item.kind.includes('button') || /button/i.test(item.name))
    .reduce((sum, item) => sum + (item.qty ?? 0), 0);

  return {
    front,
    fabrics,
    thread,
    hardware,
    pins: hardware.flatMap((item) =>
      item.spots
        .filter((spot) => spot.onFront && spot.hasPosition)
        .map((spot) => ({ label: spot.pin, x: spot.x, y: spot.y, missingQty: spot.qty == null })),
    ),
    buttonTotal,
    bomCount: refs.length,
    missingInterlining: fused.length && !hasInterlining ? fused : [],
  };
}
