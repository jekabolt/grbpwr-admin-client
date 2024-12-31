import { Button } from '@mui/material';
import { FeatureArchiveProps } from '../interface/interface';
import { ArchivePicker } from './archive-picker';

export function FeaturedArchive({
  archive,
  index,
  currentEntityIndex,
  open,
  onClose,
  handleSaveArchiveSelection,
  handleOpenArchiveSelection,
}: FeatureArchiveProps) {
  return (
    <div>
      <span>{archive[index]?.[0].archive?.id}</span>
      <Button onClick={() => handleOpenArchiveSelection(index)}>add archive</Button>
      <div>
        <ArchivePicker
          open={open && currentEntityIndex === index}
          onClose={onClose}
          onSave={(selectedArchive) => handleSaveArchiveSelection(selectedArchive, index)}
          selectedArchiveId={archive[index]?.[0].archive?.id ?? 0}
        />
      </div>
    </div>
  );
}
