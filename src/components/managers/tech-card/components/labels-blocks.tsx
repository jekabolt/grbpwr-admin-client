import {
  type common_AdminColorwayRef,
  type common_TechCard,
  type common_TechCardMediaFull,
} from 'api/proto-http/admin';
import { useState, type JSX } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { AddDoor, Chip, ChipRow, GroupLabel, Section, InputField, Text } from 'ui';
import { upsertGarmentLabel } from './form-writers';
import { type FormGarmentLabel } from './labels-schema';
import type { TechCardFormData } from './schema';
import { PackagingShelf } from './packaging-shelf';
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

/**
 * PACKAGING — the carton facts (kept: shipping reads the gross weight and the box dimensions, F3),
 * then the packaging items, same grammar as labels (R-09). The deprecated polybag / bag sticker /
 * inserts text fields are not shown; the form still round-trips what it read.
 */
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
  return (
    <Section title='packaging'>
      <div id='packaging-spec'>
        <PackagingShelf
          techCardId={techCardId}
          colorwayRefs={colorwayRefs}
          resolvedMedia={resolvedMedia}
          canEdit={canEdit}
        />
      </div>
      <div className='pt-6'>
        <GroupLabel flush>carton</GroupLabel>
        <div className='mt-3 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3'>
          <InputField
            name='packaging.unitsPerBox'
            type='number'
            valueAsNumber
            keyboardRestriction={/[0-9]/}
            label='units per box'
          />
          <InputField
            name='packaging.boxDimensions'
            label='box L×W×H'
            placeholder='e.g. 60×40×30'
          />
          <InputField name='packaging.boxMarking' label='box marking' placeholder='style + qty' />
          <div className='sm:col-span-2 lg:col-span-3'>
            <InputField name='packaging.notes' label='carton note' />
          </div>
        </div>
      </div>
    </Section>
  );
}
