import { CompositionStructure } from 'constants/garment-composition';
import { Button } from 'ui/components/button';
import { hasInvalidParts } from './utils';

interface CompositionModalActionsProps {
  localComposition: CompositionStructure;
  onClose: () => void;
}

export function CompositionModalActions({
  localComposition,
  onClose,
}: CompositionModalActionsProps) {
  const invalid = hasInvalidParts(localComposition);

  const handleSave = () => {
    if (invalid) {
      alert('All composition parts must total exactly 100%');
      return;
    }
    onClose();
  };

  return (
    <div className='flex justify-end gap-2'>
      <Button size='lg' variant='secondary' onClick={onClose}>
        Cancel
      </Button>
      <Button size='lg' variant='main' onClick={handleSave} disabled={invalid}>
        Save Composition
      </Button>
    </div>
  );
}
