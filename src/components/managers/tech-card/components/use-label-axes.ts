import type { common_TechCard } from 'api/proto-http/admin';
import { formatSizeName } from 'components/managers/product/utility/sizes';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useMemo } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import type { TechCardFormData } from './schema';
import type { LabelAxes } from './sewn-label-model';
import { wireInt } from './wire-int';

/** The card's colours and sizes for the artwork tiles: sizes live in the form, colours on the card. */
export function useLabelAxes(techCard?: common_TechCard): LabelAxes {
  const { control } = useFormContext<TechCardFormData>();
  const { dictionary } = useDictionary();
  const sizeIds = useWatch({ control, name: 'sizeIds' }) as number[] | undefined;

  return useMemo(() => {
    const dictSizes = dictionary?.sizes ?? [];
    const enId = (dictionary?.languages ?? []).find((l) => l.code === 'en')?.id;
    const ids = sizeIds ?? techCard?.techCard?.sizeIds ?? [];
    return {
      sizes: ids.map((raw) => {
        const id = wireInt(raw);
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
  }, [dictionary, sizeIds, techCard]);
}
