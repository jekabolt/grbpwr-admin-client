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
import type { Gap, GapSink } from './gaps';
import { englishT, own, type PdfT } from './i18n';

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
  gaps?: { pin?: Gap; placement?: Gap; operation?: Gap; qty?: Gap };
};

export type MaterialsModel = ReturnType<typeof deriveMaterials>;

export function deriveMaterials(techCard: common_TechCard, sink?: GapSink, t: PdfT = englishT) {
  const card = techCard.techCard;
  const refs = bomRefs(techCard);
  const primary = techCard.colorways?.[0];
  const pieces = card?.pieces ?? [];
  const operations = card?.operations ?? [];
  const callouts = card?.callouts ?? [];
  const front = technicalMedia(techCard, 'TECH_CARD_MEDIA_KIND_FRONT');
  const add = (
    code: string,
    label: string,
    field: string,
    bomLine?: string,
    extraRefs: string[] = [],
  ): Gap => {
    const gap: Gap = {
      code,
      refs: [bomLine ? `bom:${bomLine}` : '', `field:${field}`, ...extraRefs].filter(Boolean),
      label,
      section: '01',
      target: { tab: 'materials', bomLine, field },
    };
    return sink?.add(gap) ?? gap;
  };
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
    const name = clean(ref.item.name);
    const widthCm = decimal(ref.item.effectiveFabricWidthCm) ?? decimal(ref.item.fabricWidth);
    const pieceCount = assignedPieces.length;
    const consumptionM = markerLength == null ? null : markerLength / 100;
    return {
      key: alphaKey(index),
      refKey: ref.key,
      name,
      role: t('common.generated', { text: materialRole(ref) }),
      colour: colour.name,
      swatch: colour.swatch,
      composition: formatCompositionCell(ref.item.composition),
      widthCm,
      weightGsm: decimal(ref.item.fabricWeightGsm),
      pieceCount,
      consumptionM,
      efficiencyPct: decimal(marker?.efficiencyPct),
      unitPrice: decimal(ref.item.unitPrice),
      currency: clean(ref.item.currency),
      unit: clean(ref.item.unit),
      gaps: {
        material:
          !name && !colour.name
            ? add('pdf_material_missing', t('gaps.material'), 'material', ref.key)
            : undefined,
        width:
          widthCm == null ? add('pdf_width_missing', t('gaps.width'), 'width', ref.key) : undefined,
        pieces: !pieceCount
          ? add('pdf_material_pieces_missing', t('gaps.pieces'), 'pieces', ref.key)
          : undefined,
        marker:
          consumptionM == null
            ? add('pdf_marker_missing', t('gaps.marker'), 'marker', ref.key)
            : undefined,
      },
    };
  });

  const thread = refs
    .filter((ref) => ref.item.section === THREAD)
    .map((ref) => {
      const linkedOperations = operations.filter((operation) =>
        (operation.bomLineKeys ?? []).includes(clean(ref.item.lineKey)),
      );
      const colour = materialColour(ref, primary);
      const name = clean(ref.item.name);
      return {
        key: ref.key,
        name,
        colour: colour.name,
        swatch: colour.swatch,
        composition: formatCompositionCell(ref.item.composition),
        supplier: clean(ref.item.supplier),
        operationNumbers: linkedOperations
          .map((operation) => operation.operationNumber)
          .filter((number): number is number => number != null),
        articleGap: !name
          ? add('pdf_thread_article_missing', t('gaps.article'), 'article', ref.key)
          : undefined,
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
        const where = operation.zone
          ? t('common.generated', { text: enumLabel(operation.zone) })
          : own(clean(callout?.part));
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
          source: t('materials.operationLink'),
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
      for (const spot of spots) {
        const opRef = spot.operationNumbers[0] ? [`op:${spot.operationNumbers[0]}`] : [];
        spot.gaps = {
          pin: !spot.pin
            ? add('pdf_trim_pin_missing', t('gaps.pin'), 'pin', ref.key, opRef)
            : undefined,
          placement: !spot.where
            ? add('pdf_trim_placement_missing', t('gaps.placement'), 'placement', ref.key, opRef)
            : undefined,
          operation: !spot.operationNumbers.length
            ? add('pdf_trim_operation_missing', t('gaps.operation'), 'operation', ref.key)
            : undefined,
          qty:
            spot.qty == null
              ? add('pdf_trim_qty_missing', t('gaps.quantity'), 'qty', ref.key, opRef)
              : undefined,
        };
      }
      const spotQty = spots.reduce((sum, spot) => sum + (spot.qty ?? 0), 0);
      const qty = lineQty ?? (spotQty || null);
      const empty = spots.length === 0;
      return {
        key: ref.key,
        name: clean(ref.item.name),
        detail: clean(ref.item.composition) || clean(ref.item.spec),
        kind: t('common.generated', {
          text: enumLabel(ref.item.kind) || enumLabel(ref.item.section),
        }),
        spots,
        qty,
        emptyGaps: empty
          ? {
              pin: add('pdf_trim_pin_missing', t('gaps.pin'), 'pin', ref.key),
              placement: add(
                'pdf_trim_placement_missing',
                t('gaps.placement'),
                'placement',
                ref.key,
              ),
              operation: add(
                'pdf_trim_operation_missing',
                t('gaps.operation'),
                'operation',
                ref.key,
              ),
              qty:
                qty == null
                  ? add('pdf_trim_qty_missing', t('gaps.quantity'), 'qty', ref.key)
                  : undefined,
            }
          : undefined,
        qtyGap:
          qty == null
            ? add('pdf_trim_qty_missing', t('gaps.quantity'), 'qty total', ref.key)
            : undefined,
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
    gaps: {
      front: !front ? add('pdf_front_flat_missing', t('gaps.frontFlat'), 'front flat') : undefined,
      fabrics: !fabrics.length
        ? add('pdf_fabrics_missing', t('gaps.fabrics'), 'fabrics')
        : undefined,
      interlining:
        fused.length && !hasInterlining
          ? add('pdf_interlining_missing', t('gaps.interlining'), 'interlining')
          : undefined,
    },
  };
}
