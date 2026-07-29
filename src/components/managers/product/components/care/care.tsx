import { useWatch } from 'react-hook-form';
import Text from 'ui/components/text';
import { ReadOnlyField } from '../read-only-field';
import { CareSymbol } from './care-card';
import { careCodes } from './care-codes';

/**
 * A colourway's care instructions, READ-ONLY.
 *
 * Care is a STYLE fact: it is authored on the tech card (via `CarePicker`) and every colourway of
 * the style shows the same value. So this is a display, not an editor — the `editMode` branch that
 * used to live here rendered a raw "MWN,DNB,…" text input beside a picker, and nothing ever passed
 * `editMode` true. Editing here would have been a lie about ownership even if something had.
 *
 * Symbols, not codes: the code is what prints on the tag, but the symbol is what a person reads.
 * Both are shown, because a code with no picture is unreadable and a picture with no code cannot be
 * checked against a spec.
 */
export function Care() {
  const careValue =
    (useWatch({ name: 'product.productBodyInsert.careInstructions' }) as string) || '';
  const codes = careCodes(careValue);

  return (
    <ReadOnlyField label='care instructions'>
      {codes.length === 0 ? (
        <Text size='micro' variant='label'>
          —
        </Text>
      ) : (
        <div className='flex flex-wrap items-start gap-1.5'>
          {codes.map((code) => (
            <CareSymbol key={code} code={code} />
          ))}
        </div>
      )}
    </ReadOnlyField>
  );
}
