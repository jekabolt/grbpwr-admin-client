import { Grid, Theme, useMediaQuery } from '@mui/material';
import { MediaSelectorInterface } from 'features/interfaces/mediaSelectorInterfaces';
import useMediaSelector from 'features/utilitty/useMediaSelector';
import { FC, useEffect, useState } from 'react';
import 'react-advanced-cropper/dist/style.css';
import { ByUrl } from './byUrl';
import { DragDrop } from './dragDrop';
import { FilterMedias } from './filterMedias';
import { MediaList } from './listMedia';
import { PreviewMediaForUpload } from './previewMediaForUpload';

export const MediaSelector: FC<MediaSelectorInterface> = ({
  allowMultiple,
  selectedMedia,
  enableModal,
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
    <Grid container justifyContent='center' spacing={2} padding='2%'>
      <Grid item xs={12}>
        <Grid container alignItems='center' spacing={2} justifyContent='center' marginTop='1%'>
          <Grid item xs={8} sm={4}>
            <ByUrl url={url} setUrl={setUrl} isLoading={isLoading} />
          </Grid>
          <Grid item xs={8} sm={4}>
            <DragDrop
              loading={loading}
              selectedFiles={selectedFiles}
              setSelectedFiles={setSelectedFiles}
              selectedFileUrl={selectedFileUrl}
              setSelectedFileUrl={setSelectedFileUrl}
            />
          </Grid>
          <Grid item xs={8} sm={4}>
            <FilterMedias
              filterByType={filterByType}
              setFilterByType={setFilterByType}
              sortByDate={sortByDate}
              setSortByDate={setSortByDate}
            />
          </Grid>
        </Grid>
      </Grid>
      <Grid item>
        <PreviewMediaForUpload
          croppedImage={croppedImage}
          isCropperOpen={isCropperOpen}
          setIsCropperOpen={setIsCropperOpen}
          b64Media={selectedFileUrl || url}
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
