import type { common_MediaFull, common_TechCard } from 'api/proto-http/admin';
import { packagingItemFacts } from 'components/managers/print/sheets/packaging-items';
import { wireInt } from 'components/managers/tech-card/components/wire-int';

import { clean, colorwayName, mediaFromResolved, type ResolvedTechMedia } from './derive-shared';
import type { Gap, GapSink } from './gaps';
import { englishT, type PdfT } from './i18n';

export type PackagingModel = ReturnType<typeof derivePackaging>;

function mediaFull(media?: common_MediaFull): ResolvedTechMedia | null {
  const full = media?.media?.fullSize;
  const compressed = media?.media?.compressed;
  const thumbnail = media?.media?.thumbnail;
  const value = full?.mediaUrl ? full : compressed?.mediaUrl ? compressed : thumbnail;
  const url = clean(value?.mediaUrl);
  if (!media || !url) return null;
  return {
    id: wireInt(media.id),
    url,
    width: value?.width,
    height: value?.height,
    caption: '',
  };
}

export function derivePackaging(techCard: common_TechCard, sink?: GapSink, t: PdfT = englishT) {
  const card = techCard.techCard;
  const colourways = new Map(
    (techCard.colorways ?? []).map((colourway, index) => [
      wireInt(colourway.colorwayId),
      colorwayName(colourway, index, t),
    ]),
  );
  const resolved = techCard.resolvedLabelMedia ?? [];
  const storedMockup = (id?: number) =>
    mediaFromResolved(resolved.find((media) => wireInt(media.media?.id) === wireInt(id)));
  const items = (card?.packagingItems ?? []).map((item, index) => {
    const facts = packagingItemFacts(item);
    return {
      ...facts,
      key: `${index}-${clean(item.key)}-${wireInt(item.materialId)}-${wireInt(item.auxTechCardId)}`,
      number: index + 1,
      picture: mediaFull(item.pickedThumbnail) ?? storedMockup(item.mediaIds?.[0]),
      allColours: facts.colorwayIds.length === 0,
      colours: facts.colorwayIds
        .map((id) => colourways.get(id))
        .filter((name): name is string => !!name),
    };
  });
  const missing: Gap | undefined = items.length
    ? undefined
    : sink?.add({
        code: 'pdf_packaging_missing',
        refs: ['field:packagingItems'],
        label: t('packaging.missing'),
        section: '05b',
        target: { tab: 'labels', field: 'packagingItems' },
      }) ?? {
        code: 'pdf_packaging_missing',
        refs: ['field:packagingItems'],
        label: t('packaging.missing'),
        section: '05b',
        target: { tab: 'labels', field: 'packagingItems' },
      };
  const packaging = card?.packaging;
  const packedMediaId = packaging?.packedMediaIds?.length
    ? wireInt(packaging.packedMediaIds[0])
    : wireInt(packaging?.packedMediaId);
  const packedPhoto = packedMediaId
    ? mediaFromResolved(
        techCard.resolvedLabelMedia?.find((media) => wireInt(media.media?.id) === packedMediaId),
      )
    : null;

  return {
    items,
    showColour: items.some((item) => !item.allColours),
    showSize: items.some((item) => item.size),
    showHow: items.some((item) => item.how),
    showNote: items.some((item) => item.note),
    missing,
    packed: {
      ships: clean(packaging?.foldingMethod),
      size: clean(packaging?.packedSize),
      netGrams: packaging?.weightNetGrams || 0,
      grossGrams: packaging?.weightGrossGrams || 0,
      photo: packedPhoto,
    },
    carton: {
      units: packaging?.unitsPerBox || 0,
      box: clean(packaging?.boxDimensions),
      marking: clean(packaging?.boxMarking),
      note: clean(packaging?.notes),
    },
  };
}
