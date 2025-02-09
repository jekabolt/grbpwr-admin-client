import { Grid2 as Grid } from '@mui/material';
import { MediaSelectorInterface } from 'components/common/interfaces/mediaSelectorInterfaces';
import useMediaSelector from 'features/utilitty/useMediaSelector';
import { FC, useEffect, useState } from 'react';
import 'react-advanced-cropper/dist/style.css';
import { PreviewMediaForUpload } from '../../cropper/previewMediaForUpload';
import { ByUrl } from './byUrl';
import { DragDrop } from './dragDrop';
import { FilterMedias } from './filterMedias';
import { MediaList } from './listMedia';

export const MediaSelector: FC<MediaSelectorInterface> = ({
  allowMultiple,
  selectedMedia,
  enableModal,
  aspectRatio,
  hideVideos,
  isDeleteAccepted,
  select,
}) => {
  const {
    url,
    selectedFiles,
    selectedFileUrl,
    croppedImage,
    loading,
    setUrl,
    handleMediaUpload,
    setSelectedFileUrl,
    setSelectedFiles,
    setCroppedImage,
  } = useMediaSelector();
  const [isCropperOpen, setIsCropperOpen] = useState<boolean>(false);

  useEffect(() => {
    if (url) {
      setSelectedFiles([]);
      setSelectedFileUrl('');
      setCroppedImage('');
    }
  }, [url]);

  useEffect(() => {
    if (selectedFiles.length > 0) {
      setUrl('');
    }
  }, [selectedFiles, selectedFileUrl]);

  const clearDragDropSelector = () => {
    setCroppedImage('');
    setSelectedFiles([]);
    setSelectedFileUrl('');
    setUrl('');
  };

  return (
    <Grid container justifyContent='center' spacing={2}>
      <Grid size={{ xs: 12 }}>
        <Grid container alignItems='center' spacing={2}>
          <Grid size={{ xs: 12, sm: 4 }}>
            <ByUrl url={url} setUrl={setUrl} />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <DragDrop
              loading={loading}
              selectedFiles={selectedFiles}
              setSelectedFiles={setSelectedFiles}
              selectedFileUrl={selectedFileUrl}
              setSelectedFileUrl={setSelectedFileUrl}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <FilterMedias />
          </Grid>
        </Grid>
      </Grid>
      <Grid size={{ xs: 6 }}>
        <PreviewMediaForUpload
          croppedImage={croppedImage}
          isCropperOpen={isCropperOpen}
          b64Media={selectedFileUrl || url}
          isMediaSelector={true}
          setIsCropperOpen={setIsCropperOpen}
          clear={clearDragDropSelector}
          setCroppedImage={setCroppedImage}
          handleUploadMedia={handleMediaUpload}
        />
      </Grid>
      <Grid size={{ xs: 12 }}>
        <MediaList
          allowMultiple={allowMultiple}
          selectedMedia={selectedMedia}
          enableModal={enableModal}
          croppedImage={croppedImage}
          aspectRatio={aspectRatio}
          hideVideos={hideVideos}
          isDeleteAccepted={isDeleteAccepted}
          setCroppedImage={setCroppedImage}
          select={select}
          handleUploadMedia={handleMediaUpload}
        />
      </Grid>
    </Grid>
  );
};
