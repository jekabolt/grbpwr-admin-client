import {
  type common_AdminColorwayRef,
  type common_TechCard,
  type common_TechCardMediaFull,
} from 'api/proto-http/admin';
import { useState, type JSX } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { AddDoor, Chip, ChipRow, Section, Text } from 'ui';
import { upsertGarmentLabel } from './form-writers';
import { type FormGarmentLabel, type FormPackagingItem } from './labels-schema';
import type { TechCardFormData } from './schema';
import { PackagingShelf, packagingGaps } from './packaging-shelf';
import { isCompositionLabel } from './sewn-label-model';
import { bornLabelFacts, labelGaps, SewnLabelRow } from './sewn-label-row';
import { useLabelAxes } from './use-label-axes';
import { garmentLabelKindNames, garmentLabelKinds, kindLabel } from './tech-card-options';

/**
 * LABELS and PACKAGING — two blocks of the «labels & pkg» tab (02-DESIGN §2.1, §2.3–2.6; I-11).
 * Labels are rows of `SewnLabelRow`; packaging is the tile shelf of `PackagingShelf`.
 *
 * Every write goes through the keyed writers in `form-writers.ts` (live `getValues`, one row by
 * key, case-blind). The card passes `keepBare`: a row leaves only by its ✕.
 */

/** The next free key of a kind: `other` is the one kind a garment may carry many of. */
function freeKindKey(key: string, taken: string[]): string {
  const has = (k: string) => taken.some((t) => t.trim().toLowerCase() === k);
  if (!has(key)) return key;
  for (let n = 2; ; n += 1) if (!has(`${key} ${n}`)) return `${key} ${n}`;
}

/** LABELS — every label on the garment but the composition one, which has its own block. */
export function LabelsBlock({
  techCard,
  canEdit = true,
}: {
  techCard?: common_TechCard;
  canEdit?: boolean;
}): JSX.Element {
  const { control, getValues, setValue } = useFormContext<TechCardFormData>();
  const all = (useWatch({ control, name: 'garmentLabels' }) ?? []) as FormGarmentLabel[];
  const bomItems = (useWatch({ control, name: 'bomItems' }) ?? []) as NonNullable<
    TechCardFormData['bomItems']
  >;
  const axes = useLabelAxes(techCard);
  const [adding, setAdding] = useState(false);

  const rows = all.filter((r) => !isCompositionLabel(r.key));
  const keys = rows.map((r) => r.key ?? '');
  const free = garmentLabelKinds.filter(
    (k) => k.key === 'other' || !keys.some((t) => t.trim().toLowerCase() === k.key),
  );
  const issues = rows.reduce((n, r) => {
    const gap = labelGaps(r, axes, bomItems);
    return n + (gap.material ? 1 : 0) + (gap.location ? 1 : 0) + gap.files;
  }, 0);

  return (
    <Section
      title='labels'
      action={
        issues > 0 ? (
          <Text size='micro' variant='errorLabel' component='span'>
            ! {issues}
          </Text>
        ) : undefined
      }
    >
      <div data-labels-rows=''>
        {rows.map((r, i) => {
          const key = r.key ?? '';
          return (
            <SewnLabelRow
              key={key.toLowerCase() || i}
              labelKey={key}
              title={kindLabel(garmentLabelKindNames, key)}
              removable
              techCard={techCard}
              axes={axes}
              canEdit={canEdit}
              last={i === rows.length - 1}
            />
          );
        })}
        {!canEdit ? null : adding ? (
          <ChipRow className='pt-2'>
            {free.map((k) => (
              <Chip
                key={k.key}
                nonForm
                data-label-kind={k.key}
                onClick={() => {
                  const key = freeKindKey(k.key, keys);
                  upsertGarmentLabel(getValues, setValue, key, bornLabelFacts(key), {
                    keepBare: true,
                  });
                  setAdding(false);
                }}
              >
                {k.label}
              </Chip>
            ))}
          </ChipRow>
        ) : (
          <AddDoor onClick={() => setAdding(true)}>label</AddDoor>
        )}
      </div>
    </Section>
  );
}

/** PACKAGING — pack, the items in it and the shipping box; `! N` counts what is still missing. */
export function PackagingBlock({
  techCardId,
  colorwayRefs,
  resolvedMedia,
  canEdit = true,
}: {
  techCardId?: number;
  colorwayRefs?: readonly common_AdminColorwayRef[];
  resolvedMedia?: readonly common_TechCardMediaFull[];
  canEdit?: boolean;
}): JSX.Element {
  const { control } = useFormContext<TechCardFormData>();
  const items = (useWatch({ control, name: 'packagingItems' }) ?? []) as FormPackagingItem[];
  const folding = useWatch({ control, name: 'packaging.foldingMethod' }) ?? '';
  const units = Number(useWatch({ control, name: 'packaging.unitsPerBox' })) || 0;
  const gaps = packagingGaps(folding, items, units);
  return (
    <Section
      title='packaging'
      action={
        gaps > 0 ? (
          <Text size='micro' variant='errorLabel' component='span'>
            ! {gaps}
          </Text>
        ) : undefined
      }
    >
      <div id='packaging-spec'>
        <PackagingShelf
          techCardId={techCardId}
          colorwayRefs={colorwayRefs}
          resolvedMedia={resolvedMedia}
          canEdit={canEdit}
        />
      </div>
    </Section>
  );
}
