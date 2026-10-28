import type { common_TechCard } from 'api/proto-http/admin';
import {
  effectiveLabelPart,
  LABEL_PART_NAME,
  type LabelPart,
} from 'components/managers/tech-card/care-labels/label-parts';
import { wireInt } from 'components/managers/tech-card/components/wire-int';
import { formatCompositionCell } from 'components/managers/materials/components/material-code';
import {
  bomColourwayName,
  bomRefs,
  clean,
  colorwayColour,
  colorwayName,
  decimal,
  mediaFromResolved,
  technicalMedia,
} from './derive-shared';
import type { Gap, GapSink } from './gaps';
import { englishT, type PdfT } from './i18n';

export type LabelsDeriveOptions = { sampleSizeName?: string };
export type LabelsModel = ReturnType<typeof deriveLabels>;

const partFromWire = (value?: string): LabelPart => {
  const part = clean(value).replace('TECH_CARD_BOM_LABEL_PART_', '') as LabelPart;
  return part && part in LABEL_PART_NAME ? part : 'SHELL';
};

export function deriveLabels(
  techCard: common_TechCard,
  options: LabelsDeriveOptions = {},
  sink?: GapSink,
  t: PdfT = englishT,
) {
  const card = techCard.techCard;
  const primary = techCard.colorways?.[0];
  const careOverride = card?.careLabel?.colorways?.find(
    (item) => wireInt(item.colorwayId) === wireInt(primary?.colorwayId),
  );
  const overrideFibers = careOverride?.fibers ?? [];
  const composition = overrideFibers.length
    ? [...new Set(overrideFibers.map((fiber) => partFromWire(fiber.part)))].map((part) => ({
        part: t('common.generated', { text: LABEL_PART_NAME[part] }),
        value: overrideFibers
          .filter((fiber) => partFromWire(fiber.part) === part)
          .map((fiber) =>
            [fiber.pct != null ? `${fiber.pct}%` : '', clean(fiber.fiberCode)]
              .filter(Boolean)
              .join(' '),
          )
          .filter(Boolean)
          .join(' · '),
      }))
    : bomRefs(techCard).flatMap((ref) => {
        const part = effectiveLabelPart(ref.item);
        const value = formatCompositionCell(ref.item.composition);
        return part === 'NOT_ON_LABEL' || !value
          ? []
          : [{ part: t('common.generated', { text: LABEL_PART_NAME[part] }), value }];
      });
  const fallbackComposition = composition.length
    ? composition
    : (techCard.compositionEntries ?? []).length
      ? [
          {
            part: t('labels.shell'),
            value: (techCard.compositionEntries ?? [])
              .map((entry) => {
                const percentage = decimal(entry.percent);
                return [
                  percentage == null ? '' : `${percentage}%`,
                  clean(entry.name) || clean(entry.fiberCode),
                ]
                  .filter(Boolean)
                  .join(' ');
              })
              .filter(Boolean)
              .join(' · '),
          },
        ]
      : [];
  const logoId = wireInt(card?.careLabel?.logoMediaId);
  const logo = logoId
    ? mediaFromResolved(
        techCard.resolvedLabelMedia?.find((item) => wireInt(item.media?.id) === logoId),
      )
    : null;
  const placementLabel =
    (card?.garmentLabels ?? []).find((label) =>
      /brand|main|identity|size/i.test(clean(label.key)),
    ) ?? card?.garmentLabels?.[0];
  const add = (code: string, label: string, field: string): Gap => {
    const gap: Gap = {
      code,
      refs: [`field:${field}`],
      label,
      section: '05',
      target: { tab: 'labels', field },
    };
    return sink?.add(gap) ?? gap;
  };
  const identityName = clean(card?.name);
  const identityColour =
    clean(careOverride?.colourName) ||
    (primary ? colorwayName(primary, 0, t) : bomColourwayName(techCard));
  const identitySize =
    clean(options.sampleSizeName) || (card?.baseSampleSizeId ? `#${card.baseSampleSizeId}` : '');
  const back = technicalMedia(techCard, 'TECH_CARD_MEDIA_KIND_BACK');
  const gaps = {
    name: !identityName ? add('pdf_name_missing', t('gaps.name'), 'name') : undefined,
    colour: !identityColour
      ? add('pdf_label_colour_missing', t('gaps.colour'), 'colour')
      : undefined,
    size: !identitySize ? add('pdf_sample_size_missing', t('gaps.size'), 'sample size') : undefined,
    composition: !fallbackComposition.length
      ? add('pdf_composition_missing', t('gaps.composition'), 'composition')
      : undefined,
    placement: !clean(placementLabel?.placement)
      ? add('pdf_label_placement_missing', t('gaps.placement'), 'placement')
      : undefined,
    back: !back ? add('pdf_back_flat_missing', t('gaps.backFlat'), 'back flat') : undefined,
  };

  return {
    identity: {
      name: identityName,
      colour: identityColour,
      colourFact: colorwayColour(primary),
      size: identitySize,
      brand: clean(card?.brand) || 'GRBPWR',
      logo,
    },
    composition: fallbackComposition,
    placement: {
      name: clean(placementLabel?.placement),
      attachment: clean(placementLabel?.attachment),
      folding: clean(placementLabel?.folding),
      size: clean(placementLabel?.size),
      qty: placementLabel?.qtyPerGarment ?? null,
    },
    back,
    gaps,
    missing: [
      !clean(card?.name) && 'name',
      !primary && !bomColourwayName(techCard) && 'colourway',
      !fallbackComposition.length && 'composition',
      !clean(placementLabel?.placement) && 'placement',
      !technicalMedia(techCard, 'TECH_CARD_MEDIA_KIND_BACK') && 'back flat',
    ].filter((value): value is string => Boolean(value)),
  };
}
