import type { common_TechCard } from 'api/proto-http/admin';
import { skuToSeasonLabel } from 'components/managers/tech-card/components/season-util';
import { approvalStateLabel, stageLabel } from 'components/managers/tech-cards/components/utils';
import {
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

export type CoverDeriveOptions = {
  sampleSizeName?: string;
  revisionLabel?: string;
};

export type CoverModel = ReturnType<typeof deriveCover>;

export function deriveCover(techCard: common_TechCard, options: CoverDeriveOptions = {}) {
  const card = techCard.techCard;
  const refs = bomRefs(techCard);
  const fabrics = refs.filter(rollGoods);
  const pieces = card?.pieces ?? [];
  const operations = card?.operations ?? [];
  const colorways = techCard.colorways ?? [];
  const primary = colorways[0];
  const stage = stageLabel(card?.stage);
  const approval = approvalStateLabel(card?.approvalState);
  const status =
    clean(card?.status) || (approval === '—' ? '' : approval) || (stage === '—' ? '' : stage);
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
  const requiredMissing = [
    !clean(card?.name) && 'name',
    !clean(card?.styleNumber) && 'style',
    !status && 'status',
    !options.sampleSizeName && !card?.baseSampleSizeId && 'sample size',
    !technicalMedia(techCard, 'TECH_CARD_MEDIA_KIND_FRONT') && 'front flat',
    !technicalMedia(techCard, 'TECH_CARD_MEDIA_KIND_BACK') && 'back flat',
    !fabrics.length && 'fabrics',
    !pieces.length && 'pieces',
    !operations.length && 'operations',
    !colorways.length && 'colourways',
  ].filter((value): value is string => Boolean(value));

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
    colorways: colorways.map(colorwayName),
    requiredMissing,
  };
}
