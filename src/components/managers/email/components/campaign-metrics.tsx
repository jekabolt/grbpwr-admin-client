import Text from 'ui/components/text';

/**
 * Ф4 STUB — per-campaign metrics (opens / clicks / bounces / unsubscribes). The
 * metrics pipeline + dashboard land in Ф4; this placeholder resolves the card slot.
 */
export function CampaignMetrics() {
  return (
    <div className='space-y-1 border border-dashed border-textInactiveColor p-3'>
      <Text variant='uppercase' size='small'>
        metrics
      </Text>
      <Text variant='label' size='small'>
        opens / clicks / bounces land in Ф4.
      </Text>
    </div>
  );
}
