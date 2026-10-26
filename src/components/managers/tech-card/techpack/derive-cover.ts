import type { common_TechCard } from 'api/proto-http/admin';
import { skuToSeasonLabel } from 'components/managers/tech-card/components/season-util';
import { approvalStateLabel, stageLabel } from 'components/managers/tech-cards/components/utils';
import {
  bomColourwayName,
  bomRefs,
  clean,
  colorwayName,
  decimal,
  enumLabel,
  materialColour,
  materialForPiece,
  materialRole,
  rollGoods,
  technicalMedia,
} from './derive-shared';
import type { Gap, GapSink } from './gaps';

export type CoverDeriveOptions = {
  sampleSizeName?: string;
  revisionLabel?: string;
};

export type CoverModel = ReturnType<typeof deriveCover>;

/** The one status word the document prints: the card status, else its approval, else its stage. */
export function cardStatus(techCard: common_TechCard): string {
  const card = techCard.techCard;
  const stage = stageLabel(card?.stage);
  const approval = approvalStateLabel(card?.approvalState);
  return clean(card?.status) || (approval === '—' ? '' : approval) || (stage === '—' ? '' : stage);
}

export function deriveCover(
  techCard: common_TechCard,
  options: CoverDeriveOptions = {},
  sink?: GapSink,
) {
  const card = techCard.techCard;
  const refs = bomRefs(techCard);
  const fabrics = refs.filter(rollGoods);
  const pieces = card?.pieces ?? [];
  const operations = card?.operations ?? [];
  const colorways = techCard.colorways ?? [];
  const primary = colorways[0];
  // a card without colourways still prints one: its BOM colours (pages/colourways.tsx)
  const bomColourway = colorways.length ? '' : bomColourwayName(techCard);
  const stage = stageLabel(card?.stage);
  const status = cardStatus(techCard);
  const panelCount = pieces.reduce((sum, piece) => sum + (piece.piecesPerGarment ?? 0), 0);
  const assemblies = new Set(
    operations.map((operation) => clean(operation.outputUnitKey)).filter(Boolean),
  );
  const buttons = refs.filter(
    (ref) => ref.item.kind === 'TECH_CARD_BOM_KIND_BUTTON' || /button/i.test(clean(ref.item.name)),
  );
  const buttonFacts = buttons.map((ref) => {
    const operationQty = operations
      .flatMap((operation) => operation.bomQuantities ?? [])
      .filter((qty) => clean(qty.lineKey) === clean(ref.item.lineKey))
      .map((qty) => decimal(qty.qtyPerGarment))
      .filter((qty): qty is number => qty != null)
      .reduce((sum, qty) => sum + qty, 0);
    return {
      name: clean(ref.item.name) || 'button',
      qty: decimal(ref.item.qtyPerGarment) ?? (operationQty || null),
      spec: clean(ref.item.spec),
    };
  });
  const add = (code: string, label: string, field: string): Gap => {
    const gap: Gap = {
      code,
      refs: [`field:${field}`],
      label,
      section: '00',
      target: { tab: 'cover', field },
    };
    return sink?.add(gap) ?? gap;
  };
  const gaps = {
    status: !status ? add('pdf_status_missing', 'status', 'status') : undefined,
    sampleSize: !(clean(options.sampleSizeName) || card?.baseSampleSizeId)
      ? add('pdf_sample_size_missing', 'sample size', 'sample size')
      : undefined,
    pieces: !pieces.length ? add('pdf_pieces_missing', 'pieces', 'pieces') : undefined,
    operations: !operations.length
      ? add('pdf_operations_missing', 'operations', 'operations')
      : undefined,
    fabrics: !fabrics.length ? add('pdf_fabrics_missing', 'fabrics', 'fabrics') : undefined,
    buttonQty:
      buttons.length && !buttonFacts.some((button) => button.qty)
        ? add('pdf_button_qty_missing', 'qty', 'button qty')
        : undefined,
    colourways:
      !colorways.length && !bomColourway
        ? add('pdf_colourways_missing', 'colourways', 'colourways')
        : undefined,
    name: !clean(card?.name) ? add('pdf_name_missing', 'name', 'name') : undefined,
    front: !technicalMedia(techCard, 'TECH_CARD_MEDIA_KIND_FRONT')
      ? add('pdf_front_flat_missing', 'front flat', 'front flat')
      : undefined,
    back: !technicalMedia(techCard, 'TECH_CARD_MEDIA_KIND_BACK')
      ? add('pdf_back_flat_missing', 'back flat', 'back flat')
      : undefined,
  };

  return {
    brand: clean(card?.brand) || 'GRBPWR',
    name: clean(card?.name),
    styleNumber: clean(card?.styleNumber),
    collection: clean(card?.collection),
    season: skuToSeasonLabel(card?.skuSeason),
    gender: enumLabel(card?.targetGender),
    stage: stage === '—' ? '' : stage,
    approval: status,
    sampleSize:
      clean(options.sampleSizeName) || (card?.baseSampleSizeId ? `#${card.baseSampleSizeId}` : ''),
    revision: clean(options.revisionLabel),
    front: technicalMedia(techCard, 'TECH_CARD_MEDIA_KIND_FRONT'),
    back: technicalMedia(techCard, 'TECH_CARD_MEDIA_KIND_BACK'),
    panelCount,
    pieceCount: pieces.length,
    operations: operations.length,
    assemblies: assemblies.size,
    fabrics: fabrics.map((ref) => ({
      role: materialRole(ref),
      name: clean(ref.item.name),
      colour: materialColour(ref, primary).name,
      pieces: pieces.filter(
        (piece, index) => materialForPiece(refs, primary, piece, index)?.key === ref.key,
      ).length,
    })),
    buttons: buttonFacts,
    buttonTotal: buttonFacts.reduce((sum, button) => sum + (button.qty ?? 0), 0),
    colorways: colorways.length ? colorways.map(colorwayName) : bomColourway ? [bomColourway] : [],
    gaps,
  };
}
