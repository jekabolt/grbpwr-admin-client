import { adminService } from 'api/api';
import { useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Input from 'ui/components/input';
import Text from 'ui/components/text';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from 'ui/form';
import { fieldErrorSummary } from 'utils/field-errors';
import { parseSeasonToSku } from './season-util';
import { TechCardFormData } from './schema';

const GENERATED = 'STYLE_NUMBER_SOURCE_GENERATED';
const MANUAL = 'STYLE_NUMBER_SOURCE_MANUAL';

// Style Number (Q1): server-proposed via SuggestStyleNumber, with a strict manual override. Typing
// switches the source to MANUAL (persisted, passes the server validator). Server field-tagged
// errors show at the field. The source/format provenance is tracked but not surfaced inline — it
// cluttered the top field for a value the server ultimately authorises.
export function StyleNumberField({ isIdea }: { isIdea: boolean }) {
  const { control, setValue, clearErrors } = useFormContext<TechCardFormData>();
  const season = useWatch({ control, name: 'season' }) as string | undefined;
  const source = useWatch({ control, name: 'styleNumberSource' }) as string | undefined;
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState('');

  const sku = parseSeasonToSku(season);

  const suggest = async () => {
    if (!sku) return;
    setSuggesting(true);
    setSuggestError('');
    try {
      const res = await adminService.SuggestStyleNumber({ skuSeason: sku });
      const proposed = res.styleNumber?.trim();
      if (proposed) {
        setValue('styleNumber', proposed, { shouldDirty: true, shouldValidate: true });
        setValue('styleNumberSource', GENERATED, { shouldDirty: true });
        clearErrors('styleNumber');
      } else {
        setSuggestError('server returned no suggestion');
      }
    } catch (e) {
      setSuggestError(fieldErrorSummary(e, 'could not suggest a style number'));
    } finally {
      setSuggesting(false);
    }
  };

  return (
    <FormField
      control={control}
      name='styleNumber'
      render={({ field }) => (
        <FormItem>
          <FormLabel>{isIdea ? 'style number' : 'style number *'}</FormLabel>
          <div className='flex items-start gap-2'>
            <div className='flex-1'>
              <FormControl>
                <Input
                  {...field}
                  value={field.value ?? ''}
                  placeholder={isIdea ? 'optional — set before PROTO' : 'артикул'}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    field.onChange(e);
                    // any hand-edit is a manual override (Q1)
                    if (source !== MANUAL)
                      setValue('styleNumberSource', MANUAL, { shouldDirty: true });
                    clearErrors('styleNumber');
                  }}
                />
              </FormControl>
            </div>
            <Button
              type='button'
              variant='secondary'
              className='shrink-0 whitespace-nowrap uppercase'
              loading={suggesting}
              disabled={suggesting || !sku}
              title={sku ? 'propose a style number for this season' : 'pick a season first'}
              onClick={suggest}
            >
              suggest
            </Button>
          </div>

          {!sku && (
            <Text variant='inactive' size='small'>
              pick a season to enable suggest
            </Text>
          )}
          {suggestError && (
            <Text variant='inactive' size='small' className='text-error'>
              {suggestError}
            </Text>
          )}
          {/* server field-tagged errors (BadRequest.FieldViolation on style_number) land here */}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
