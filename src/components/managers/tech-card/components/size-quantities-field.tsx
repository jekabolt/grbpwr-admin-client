import {
  useSizeNames,
  useSizeOrdering,
} from 'components/managers/model/components/use-size-systems';
import { formatSizeName } from 'components/managers/product/utility/sizes';
import { useMemo } from 'react';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { Chip, ChipRow } from 'ui/components/chip';
import { DataTable, EmptyCell, TotalRow } from 'ui/components/data-table';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';
import InputField from 'ui/form/fields/input-field';
import { TechCardFormData } from './schema';

// Production size run — order quantity per size (cutter / manager). sizeId is restricted to the
// card's size range (cross-validated server-side: size_quantities[].size_id ∈ size_ids), so the
// size is not something you pick: a row exists for a size or it does not. Sizes without a row are
// offered as dashed chips underneath, which makes "which sizes have no quantity yet" readable
// instead of something you reconstruct from a dropdown.
export function SizeQuantitiesField() {
  const { control } = useFormContext<TechCardFormData>();
  const { fields, append, remove } = useFieldArray({ control, name: 'sizeQuantities' });
  const sizeIds = (useWatch({ control, name: 'sizeIds' }) ?? []) as number[];
  // `fields` is a structural snapshot — it does not re-render on value edits, so the live
  // quantities (and therefore the total) have to be watched separately.
  const values = (useWatch({ control, name: 'sizeQuantities' }) ?? []) as Array<{
    sizeId?: number;
    orderQty?: number;
  }>;

  const sizeById = useSizeNames();
  const orderSizes = useSizeOrdering();

  const inRange = useMemo(() => new Set(sizeIds), [sizeIds]);

  // Render in grade order, not insertion order, while keeping each row's real field-array index.
  const rows = useMemo(() => {
    const order = new Map(orderSizes(sizeIds).map((id, i) => [id, i] as const));
    return fields
      .map((f, index) => ({ key: f.id, index, sizeId: values[index]?.sizeId ?? 0 }))
      .sort(
        (a, b) =>
          (order.get(a.sizeId) ?? Number.MAX_SAFE_INTEGER) -
            (order.get(b.sizeId) ?? Number.MAX_SAFE_INTEGER) || a.index - b.index,
      );
  }, [fields, values, sizeIds, orderSizes]);

  const covered = new Set(values.map((v) => v.sizeId ?? 0));
  const missing = orderSizes(sizeIds.filter((id) => !covered.has(id)));
  const total = values.reduce((n, v) => n + (v.orderQty ?? 0), 0);

  if (sizeIds.length === 0) {
    return (
      <Text size='micro' variant='label'>
        pick sizes above to set the order quantity per size
      </Text>
    );
  }

  return (
    <div className='space-y-2'>
      {rows.length > 0 && (
        <DataTable>
          <thead>
            <tr>
              <th>size</th>
              <th>order qty</th>
              <th aria-label='remove' />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ key, index, sizeId }) => {
              const orphan = sizeId > 0 && !inRange.has(sizeId);
              return (
                <tr key={key}>
                  <td>
                    <span className='flex flex-wrap items-center gap-1.5'>
                      <Text size='control' component='span' className='uppercase'>
                        {sizeId ? formatSizeName(sizeById.get(sizeId) ?? `#${sizeId}`) : ''}
                      </Text>
                      {!sizeId && <EmptyCell>no size</EmptyCell>}
                      {orphan && <Pill tone='warn'>not in range</Pill>}
                    </span>
                  </td>
                  <td className='w-24'>
                    <InputField
                      name={`sizeQuantities.${index}.orderQty`}
                      type='number'
                      valueAsNumber
                      label='order qty'
                      srLabel
                      className='text-right'
                    />
                  </td>
                  <td className='w-8'>
                    <Button
                      type='button'
                      variant='secondary'
                      size='xs'
                      aria-label='remove size qty'
                      onClick={() => remove(index)}
                    >
                      ✕
                    </Button>
                  </td>
                </tr>
              );
            })}
            <TotalRow>
              <td>
                {rows.length} {rows.length === 1 ? 'size' : 'sizes'}
              </td>
              <td>{total || <EmptyCell />}</td>
              <td />
            </TotalRow>
          </tbody>
        </DataTable>
      )}

      {missing.length > 0 && (
        <ChipRow>
          <Text size='micro' variant='label' component='span'>
            no qty yet:
          </Text>
          {missing.map((id) => (
            <Chip
              key={id}
              dashed
              onClick={() => append({ sizeId: id, orderQty: 0 })}
              title={`set an order quantity for ${formatSizeName(sizeById.get(id) ?? `#${id}`)}`}
            >
              + {formatSizeName(sizeById.get(id) ?? `#${id}`)}
            </Chip>
          ))}
        </ChipRow>
      )}

      {rows.length === 0 && missing.length === 0 && (
        <Text size='micro' variant='label'>
          no size run set
        </Text>
      )}
    </div>
  );
}
