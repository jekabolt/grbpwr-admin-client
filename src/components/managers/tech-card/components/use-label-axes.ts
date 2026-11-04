import type { common_TechCard } from 'api/proto-http/admin';
import { useSizeOrdering } from 'components/managers/model/components/use-size-systems';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useMemo } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { cardLabelAxes } from './card-label-axes';
import type { TechCardFormData } from './schema';
import type { LabelAxes } from './sewn-label-model';

/** The card's colours and sizes for the artwork tiles: sizes live in the form, colours on the card. */
export function useLabelAxes(techCard?: common_TechCard): LabelAxes {
  const { control } = useFormContext<TechCardFormData>();
  const { dictionary } = useDictionary();
  const sizeIds = useWatch({ control, name: 'sizeIds' }) as number[] | undefined;
  const orderSizes = useSizeOrdering();

  return useMemo(
    () => cardLabelAxes(techCard, dictionary, orderSizes, sizeIds),
    [dictionary, orderSizes, sizeIds, techCard],
  );
}
