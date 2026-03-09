import { cn } from 'lib/utility';
import Input from 'ui/components/input';
import Text from 'ui/components/text';

interface MaterialRowProps {
  materialKey: string;
  materialCode: string;
  isSelected: boolean;
  percentage: number;
  onToggle: () => void;
  onPercentageChange: (value: string) => void;
}

export function MaterialRow({
  materialKey,
  materialCode,
  isSelected,
  percentage,
  onToggle,
  onPercentageChange,
}: MaterialRowProps) {
  return (
    <div
      role='button'
      tabIndex={0}
      className={cn(
        'border border-text w-full h-16 flex gap-4 p-4 items-center flex-nowrap justify-between hover:cursor-pointer',
        { 'border-2 border-green-500': isSelected },
      )}
      onClick={onToggle}
      onKeyDown={(e) => e.key === 'Enter' && onToggle()}
    >
      <div className='flex items-center gap-2 flex-nowrap'>
        <Text className='whitespace-nowrap'>{materialKey.toUpperCase()}</Text>
        <Text variant='inactive'>({materialCode})</Text>
      </div>
      {isSelected && (
        <div
          className='flex items-center'
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <Input
            name={materialKey}
            type='number'
            value={percentage}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              onPercentageChange(e.target.value)
            }
            className='w-10 border-none'
          />
          <span>%</span>
        </div>
      )}
    </div>
  );
}
