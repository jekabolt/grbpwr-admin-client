import Text from 'ui/components/text';

/**
 * Ф4 STUB — A/B testing panel. The ABConfig shape (enabled / dimension / test_pct
 * / decision window / winner variant) and multi-variant subject+body authoring
 * arrive in Ф4. Rendered disabled so the slot resolves in the envelope now.
 */
export function ABPanel() {
  return (
    <div className='space-y-1 border border-dashed border-textInactiveColor p-3'>
      <Text variant='uppercase' size='small'>
        A/B testing
      </Text>
      <Text variant='label' size='small'>
        variant + winner selection (ABConfig) is deferred to Ф4.
      </Text>
    </div>
  );
}
