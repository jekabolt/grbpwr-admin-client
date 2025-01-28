import { Grid, Theme, useMediaQuery } from '@mui/material';
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
    media,
    url,
    selectedFiles,
    selectedFileUrl,
    croppedImage,
    filterByType,
    sortByDate,
    isLoading,
    loading,
    fetchFiles,
    setMedia,
    setUrl,
    handleMediaUpload,
    sortedAndFilteredMedia,
    setFilterByType,
    setSortByDate,
    setSelectedFileUrl,
    setSelectedFiles,
    setCroppedImage,
  } = useMediaSelector();
  const [isCropperOpen, setIsCropperOpen] = useState<boolean>(false);
  const isMobile = useMediaQuery((theme: Theme) => theme.breakpoints.down('sm'));

  useEffect(() => {
    fetchFiles(50, 0);
  }, [fetchFiles]);

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
    <Grid container justifyContent='center'>
      <Grid item xs={12}>
        <Grid container alignItems='center'>
          <Grid item xs={12} sm={4}>
            <ByUrl url={url} setUrl={setUrl} isLoading={isLoading} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <DragDrop
              loading={loading}
              selectedFiles={selectedFiles}
              setSelectedFiles={setSelectedFiles}
              selectedFileUrl={selectedFileUrl}
              setSelectedFileUrl={setSelectedFileUrl}
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <FilterMedias
              filterByType={filterByType}
              setFilterByType={setFilterByType}
              sortByDate={sortByDate}
              setSortByDate={setSortByDate}
            />
          </Grid>
        </Grid>
      </Grid>
      <Grid item xs={6}>
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
      <Grid item xs={12}>
        <MediaList
          media={media}
          allowMultiple={allowMultiple}
          selectedMedia={selectedMedia}
          enableModal={enableModal}
          croppedImage={croppedImage}
          aspectRatio={aspectRatio}
          hideVideos={hideVideos}
          isDeleteAccepted={isDeleteAccepted}
          setCroppedImage={setCroppedImage}
          select={select}
          setMedia={setMedia}
          handleUploadMedia={handleMediaUpload}
          sortedAndFilteredMedia={sortedAndFilteredMedia}
        />
      </Grid>
    </Grid>
  );
};
