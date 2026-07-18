import { formatSizeName } from 'components/managers/product/utility/sizes';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useMemo } from 'react';
import Text from 'ui/components/text';

// A fitting tries on ONE sample, and that sample already carries its own sizeId — the old
// multi-size picker here let the user record a second, independent set of sizes that could
// (and did) disagree with the sample actually tried on. This is now a read-only echo of the
// linked sample's size, resolved from the dictionary; there is nothing left to pick.
export function SampleSizeInfo({
  sampleId,
  sampleSizeId,
}: {
  sampleId: number;
  sampleSizeId: number;
}) {
  const { dictionary } = useDictionary();

  const sizeName = useMemo(() => {
    if (!sampleSizeId) return undefined;
    const raw = dictionary?.sizes?.find((s) => s.id === sampleSizeId)?.name;
    return formatSizeName(raw ?? `#${sampleSizeId}`);
  }, [dictionary?.sizes, sampleSizeId]);

  return (
    <div className='space-y-1'>
      <Text variant='uppercase' size='small'>
        size
      </Text>
      <div className='border-b border-textInactiveColor py-1.5'>
        {!sampleId ? (
          <Text variant='inactive' size='small'>
            pick a sample to see its size
          </Text>
        ) : sampleSizeId ? (
          <Text>{sizeName}</Text>
        ) : (
          <Text variant='inactive' size='small'>
            this sample has no size set
          </Text>
        )}
      </div>
    </div>
  );
}
