import type { common_TechCard } from 'api/proto-http/admin';
import {
  isAttachStep,
  qtyStepFromOperation,
  stepQtyOfLine,
} from 'components/managers/tech-card/components/button-qty';
import { wireInt } from 'components/managers/tech-card/components/wire-int';
import {
  bomLinesOfStep,
  cutStripsOfCard,
  stripQtyInStep,
} from 'components/managers/tech-card/components/cut-strips/strip-pieces';
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
import { bomKindText, materialRoleText } from './i18n/vocabulary';

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
  const cutStrips = cutStripsOfCard(techCard);
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
  // How an interlining line is used: one caption per distinct method of the pieces fused with it.
  // An empty piece choice means the card's sole interlining line.
  const interliningKeys = refs
    .filter((ref) => ref.item.section === INTERLINING)
    .map((ref) => clean(ref.item.lineKey));
  const fusingOf = (lineKey: string): string =>
    [
      ...new Set(
        pieces
          .filter((piece) => {
            if (!piece.fused) return false;
            const chosen = clean(piece.fusingBomLineKey);
            return chosen ? chosen === lineKey : interliningKeys.length === 1;
          })
          .map((piece) => {
            const mode = clean(piece.fusingMode);
            if (mode === 'TECH_CARD_PIECE_FUSING_MODE_FULL') return t('materials.fusingWhole');
            if (mode === 'TECH_CARD_PIECE_FUSING_MODE_ZONE') return t('materials.fusingZone');
            if (mode !== 'TECH_CARD_PIECE_FUSING_MODE_STRIP') return '';
            const width = decimal(piece.fusingWidthMm);
            // An empty width is the allowance mode: the strip is the piece's own seam allowance, which
            // can differ seam by seam (a wider hem), so no single number is printed.
            return width != null
              ? t('materials.fusingStrip', { mm: width })
              : t('materials.fusingAllowance');
          })
          .filter(Boolean),
      ),
    ].join(' · ');
  const fabrics = refs.filter(rollGoods).map((ref, index) => {
    const marker = (techCard.markers ?? []).find(
      (item) =>
        clean(item.bomLineKey) === clean(ref.item.lineKey) &&
        (!wireInt(item.colorwayId) || wireInt(item.colorwayId) === wireInt(primary?.colorwayId)),
    );
    const assignedPieces = pieces.filter(
      (piece, pieceIndex) =>
        materialForPiece(refs, primary, piece, pieceIndex, techCard)?.key === ref.key,
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
      role: materialRoleText(ref.item, materialRole(ref), t),
      fusing: ref.item.section === INTERLINING ? fusingOf(clean(ref.item.lineKey)) : '',
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

  const hasSpareKitBag = refs.some((ref) => ref.item.kind === 'TECH_CARD_BOM_KIND_SPARE_KIT_BAG');
  const hardware = refs
    .filter((ref) => TRIM_SECTIONS.has(ref.item.section ?? ''))
    .map((ref) => {
      const linkedOperations = operations.filter((operation) =>
        bomLinesOfStep(operation, cutStrips).includes(clean(ref.item.lineKey)),
      );
      // one row per place: ops that put this line on the same pin and zone share it
      const spots: Spot[] = [];
      for (const operation of linkedOperations) {
        const lineKey = clean(ref.item.lineKey);
        const quantity =
          stepQtyOfLine(qtyStepFromOperation(operation), lineKey) ??
          stripQtyInStep(operation, cutStrips, lineKey);
        if (quantity == null) continue;
        const callout = callouts.find((item) => item.number === operation.calloutNumber);
        const pin = operation.calloutNumber == null ? '' : String(operation.calloutNumber);
        const where = operation.zone
          ? t('common.generated', { text: enumLabel(operation.zone) })
          : own(clean(callout?.part));
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
      const qty = spots.length ? spotQty : lineQty;
      const spareQty = decimal(ref.item.spareQty);
      const spareBagGap =
        spareQty != null && spareQty > 0 && !hasSpareKitBag
          ? add('pdf_spare_bag_missing', t('gaps.spareBag'), 'spare kit bag', undefined, [
              `bom:${ref.key}`,
            ])
          : undefined;
      const attachFacts = linkedOperations
        .filter((operation) => isAttachStep(qtyStepFromOperation(operation)))
        .map((operation) => ({
          holes: operation.fastening?.buttonHoles ?? 0,
          pattern: clean(operation.fastening?.attachPattern),
        }));
      const firstAttach = attachFacts[0];
      const fasteningDetail =
        firstAttach &&
        firstAttach.holes > 0 &&
        firstAttach.pattern &&
        !firstAttach.pattern.endsWith('_UNKNOWN') &&
        attachFacts.every(
          (fact) => fact.holes === firstAttach.holes && fact.pattern === firstAttach.pattern,
        )
          ? `${t('materials.buttonHoles', { count: firstAttach.holes })} · ${t('common.generated', {
              text: enumLabel(firstAttach.pattern, 'TECH_CARD_BUTTON_ATTACH_PATTERN_'),
            })}`
          : '';
      const empty = spots.length === 0;
      return {
        key: ref.key,
        name: clean(ref.item.name),
        detail: [
          formatCompositionCell(ref.item.composition) || clean(ref.item.spec),
          fasteningDetail,
        ]
          .filter(Boolean)
          .join(' · '),
        kind: bomKindText(
          ref.item.kind,
          t('common.generated', {
            text: enumLabel(ref.item.kind) || enumLabel(ref.item.section),
          }),
          t,
        ),
        spots,
        qty,
        spareQty: spareQty != null && spareQty > 0 ? spareQty : null,
        toBuy: spareQty != null && spareQty > 0 && qty != null ? qty + spareQty : null,
        spareSource: hasSpareKitBag ? t('materials.spareKitBag') : '',
        spareBagGap,
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
