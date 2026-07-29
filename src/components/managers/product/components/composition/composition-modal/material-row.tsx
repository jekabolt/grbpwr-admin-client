import { Button } from 'ui/components/button';
import Input from 'ui/components/input';
import Text from 'ui/components/text';
import { fibreName } from './utils';

interface FibreRowProps {
  code: string;
  percent: number;
  onPercentChange: (value: string) => void;
  onRemove: () => void;
}

// One fibre of the selected garment part: name · code · percent · remove. Rows are keyed by CODE,
// so a fibre stays editable after the operator switches the browse category underneath it.
export function FibreRow({ code, percent, onPercentChange, onRemove }: FibreRowProps) {
  const name = fibreName(code);
  return (
    <div className='flex items-center gap-1.5 border-b border-hairline py-1'>
      <Text component='span' className='min-w-0 flex-1 truncate'>
        {name}
      </Text>
      <Text component='span' variant='label' size='micro' className='shrink-0'>
        {code}
      </Text>
      <div className='w-14 shrink-0'>
        <Input
          name={`fibre-${code}`}
          type='number'
          min={0}
          max={100}
          aria-label={`${name} percent`}
          value={percent}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onPercentChange(e.target.value)}
        />
      </div>
      <Text component='span' variant='label' size='micro' className='shrink-0'>
        %
      </Text>
      <Button
        type='button'
        size='xs'
        variant='secondary'
        className='shrink-0'
        aria-label={`remove ${name}`}
        onClick={onRemove}
      >
        ✕
      </Button>
    </div>
  );
}
