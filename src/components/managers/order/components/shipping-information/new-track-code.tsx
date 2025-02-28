import { CheckIcon } from '@radix-ui/react-icons';
import { cn } from 'lib/utility';
import { Button } from 'ui/components/button';
import Input from 'ui/components/input';

interface Props {
  trackingNumber: string;
  isPrinting: boolean;
  handleTrackingNumberChange: (event: any) => void;
  saveTrackingNumber: () => void;
}

export function NewTrackCode({
  trackingNumber,
  isPrinting,
  handleTrackingNumberChange,
  saveTrackingNumber,
}: Props) {
  return (
    <div
      className={cn('w-full lg:w-1/4', {
        hidden: isPrinting,
      })}
    >
      <div className='flex items-center gap-2'>
        <Input
          name='trackingNumber'
          placeholder='tracking number'
          value={trackingNumber}
          onChange={handleTrackingNumberChange}
          className='h-10'
        />
        <Button onClick={saveTrackingNumber} size='lg'>
          <CheckIcon />
        </Button>
      </div>
    </div>
  );
}
