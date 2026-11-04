import type { common_Dictionary, common_TechCard } from 'api/proto-http/admin';
import { formatSizeName } from 'components/managers/product/utility/sizes';
import type { LabelAxes } from './sewn-label-model';
import { wireInt } from './wire-int';

/** A card's artwork axes: sizes in the order `orderSizes` gives, colours by the card's own names. */
export function cardLabelAxes(
  techCard: common_TechCard | undefined,
  dictionary: common_Dictionary | null | undefined,
  orderSizes: (ids: number[]) => number[],
  sizeIds?: readonly number[],
): LabelAxes {
  const dictSizes = dictionary?.sizes ?? [];
  const enId = (dictionary?.languages ?? []).find((l) => l.code === 'en')?.id;
  const ids = (sizeIds ?? techCard?.techCard?.sizeIds ?? []).map((raw) => wireInt(raw));
  return {
    sizes: orderSizes(ids).map((id) => {
      const name = dictSizes.find((s) => wireInt(s.id) === id)?.name ?? '';
      return { id, label: (formatSizeName(name) || name || `#${id}`).toUpperCase() };
    }),
    colorways: (techCard?.colorways ?? [])
      .filter((c) => wireInt(c.colorwayId) > 0)
      .map((c) => {
        const id = wireInt(c.colorwayId);
        const i18n = enId != null ? c.nameI18n?.[String(enId)] : '';
        return { id, name: (i18n || c.devName || c.colorCode || c.baseSku || `#${id}`).trim() };
      }),
  };
}
