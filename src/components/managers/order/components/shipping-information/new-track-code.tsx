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
      className={cn('w-full border border-textColor', {
        hidden: isPrinting,
      })}
    >
      <div className='flex items-end gap-2'>
        <Input
          name='trackingNumber'
          placeholder='tracking number'
          className='placeholder:uppercase border border-b border-transparent h-9'
          value={trackingNumber}
          onChange={handleTrackingNumberChange}
        />
        <Button onClick={saveTrackingNumber} variant='main' size='lg'>
          +
        </Button>
      </div>
    </div>
  );
}
