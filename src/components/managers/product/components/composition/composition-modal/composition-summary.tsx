import { Button } from 'ui/components/button';
import { Pill } from 'ui/components/pill';

interface CompositionSummaryProps {
  totalPercentage: number;
  currentPartItemsCount: number;
  onAutoAdjust: () => void;
}

// The live total for the selected part. A part either has no fibres at all (legal — grey) or must
// sum to exactly 100 (green), and anything else is red AND blocks save in the modal footer, so the
// operator never has to hunt for why the dialog won't close.
export function CompositionSummary({
  totalPercentage,
  currentPartItemsCount,
  onAutoAdjust,
}: CompositionSummaryProps) {
  if (currentPartItemsCount === 0) return <Pill tone='mut'>not set</Pill>;
  const complete = totalPercentage === 100;
  return (
    <div className='flex items-center gap-1.5'>
      {!complete && (
        <Button type='button' size='xs' variant='secondary' onClick={onAutoAdjust}>
          auto 100
        </Button>
      )}
      <Pill tone={complete ? 'ok' : 'warn'}>{totalPercentage}%</Pill>
    </div>
  );
}
