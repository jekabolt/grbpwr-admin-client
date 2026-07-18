import { Button } from 'ui/components/button';
import Checkbox from 'ui/components/checkbox';
import Text from 'ui/components/text';

interface Props {
  selectionMode: boolean;
  onEnter: () => void;
  onExit: () => void;
  selectedCount: number;
  totalOnPage: number;
  allOnPageSelected: boolean;
  onSelectAll: () => void;
}

// Slim utility row above the grid. Out of selection mode it is just the "select" entry point; in
// selection mode it exposes select-all-on-page and a live count.
export function SelectionToolbar({
  selectionMode,
  onEnter,
  onExit,
  selectedCount,
  totalOnPage,
  allOnPageSelected,
  onSelectAll,
}: Props) {
  if (!selectionMode) {
    return (
      <div className='flex items-center justify-end border-b border-textInactiveColor pb-3'>
        <Button variant='secondary' size='lg' className='uppercase' onClick={onEnter}>
          select
        </Button>
      </div>
    );
  }

  return (
    <div className='flex flex-wrap items-center justify-between gap-3 border-b border-textColor pb-3'>
      <div className='flex flex-wrap items-center gap-4'>
        <div className='flex items-center gap-2'>
          <Checkbox
            name='catalog-select-all'
            className='h-4 w-4'
            checked={allOnPageSelected}
            onChange={() => onSelectAll()}
          />
          <button type='button' onClick={onSelectAll} className='cursor-pointer'>
            <Text variant='uppercase' size='small'>
              {allOnPageSelected ? 'clear page' : `select all (${totalOnPage})`}
            </Text>
          </button>
        </div>
        <Text variant='label' size='small'>
          {selectedCount} selected
        </Text>
      </div>
      <Button variant='secondary' size='lg' className='uppercase' onClick={onExit}>
        done
      </Button>
    </div>
  );
}
