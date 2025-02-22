import { Button } from 'components/ui/components/button';
import { FC, useState } from 'react';
import { MediaSelectorModal } from './components/mediaSelectorModal';
import { MediaSelectorLayoutProps } from './interfaces/mediaSelectorInterfaces';

export const MediaSelectorLayout: FC<MediaSelectorLayoutProps> = ({
  label,
  allowMultiple,
  aspectRatio,
  hideVideos,
  isDeleteAccepted,
  className,
  saveSelectedMedia,
}) => {
  const [mediaSelectorVisibility, setMediaSelectorVisibility] = useState(false);

  const handleMediaSelectorVisibility = () => {
    setMediaSelectorVisibility(!mediaSelectorVisibility);
  };
  return (
    <div className={className}>
      <Button size='lg' onClick={handleMediaSelectorVisibility}>
        {label}
      </Button>
      {mediaSelectorVisibility && (
        <MediaSelectorModal
          aspectRatio={aspectRatio}
          hideVideos={hideVideos}
          allowMultiple={allowMultiple}
          isDeleteAccepted={isDeleteAccepted}
          saveSelectedMedia={saveSelectedMedia}
          closeMediaSelector={handleMediaSelectorVisibility}
        />
      )}
    </div>
  );
};
