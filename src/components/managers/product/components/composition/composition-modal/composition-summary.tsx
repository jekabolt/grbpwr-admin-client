import { cn } from 'lib/utility';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';

interface CompositionSummaryProps {
  selectedPart: string;
  totalPercentage: number;
  currentPartItemsCount: number;
  onAutoAdjust: () => void;
}

export function CompositionSummary({
  selectedPart,
  totalPercentage,
  currentPartItemsCount,
  onAutoAdjust,
}: CompositionSummaryProps) {
  const isInvalid = totalPercentage > 100 || (currentPartItemsCount > 0 && totalPercentage !== 100);
  const isComplete = totalPercentage === 100;
  const isPartial = totalPercentage > 0 && totalPercentage < 100;

  return (
    <div className='flex justify-between items-center'>
      <div className='flex items-center gap-4'>
        <Text
          className={cn('uppercase', {
            'text-red-500': isInvalid,
            'text-green-500': isComplete,
            'text-yellow-500': isPartial,
          })}
        >
          {selectedPart}: {totalPercentage}%
        </Text>
        {currentPartItemsCount > 0 && totalPercentage !== 100 && (
          <>
            <Text variant='uppercase' className='text-red-500'>
              must equal 100%
            </Text>
            <Button className='uppercase' onClick={onAutoAdjust}>
              auto-adjust to 100%
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
