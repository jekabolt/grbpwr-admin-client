import { Box, Grid } from '@mui/material';
import { MediaSelectorInterface } from 'features/interfaces/mediaSelectorInterfaces';
import useMediaSelector from 'features/utilitty/useMediaSelector';
import { FC, useEffect, useState } from 'react';
import 'react-advanced-cropper/dist/style.css';
import styles from 'styles/media-selector.scss';
import { ByUrl } from './byUrl';
import { DragDrop } from './dragDrop';
import { FilterMedias } from './filterMedias';
import { MediaList } from './listMedia';
import { PreviewMediaForUpload } from './previewMediaForUpload';

export const MediaSelector: FC<MediaSelectorInterface> = ({
  allowMultiple,
  selectedMedia,
  select,
  enableModal,
}) => {
  const {
    fetchFiles,
    media,
    setMedia,
    url,
    setUrl,
    updateLink,
    sortedAndFilteredMedia,
    filterByType,
    setFilterByType,
    sortByDate,
    setSortByDate,
    isLoading,
    selectedFileUrl,
    setSelectedFileUrl,
    handleUpload,
    selectedFiles,
    setSelectedFiles,
    loading,
    croppedImage,
    setCroppedImage,
  } = useMediaSelector();
  const [isCropperOpen, setIsCropperOpen] = useState<boolean>(false);
  const [mime, setMime] = useState('');

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
  });

  const clearDragDropSelector = () => {
    setCroppedImage('');
    setSelectedFiles([]);
    setSelectedFileUrl('');
  };

  return (
    <Grid container spacing={2} justifyContent='center'>
      <Grid item xs={11} className={styles.filter_upload_boxes}>
        <Box component='div' className={styles.filter_upload_media_container}>
          <ByUrl url={url} setUrl={setUrl} updateContentLink={updateLink} isLoading={isLoading} />
          <DragDrop
            isCropperOpen={isCropperOpen}
            setIsCropperOpen={setIsCropperOpen}
            loading={loading}
            setCroppedImage={setCroppedImage}
            selectedFiles={selectedFiles}
            setSelectedFiles={setSelectedFiles}
            selectedFileUrl={selectedFileUrl}
            setSelectedFileUrl={setSelectedFileUrl}
            setMime={setMime}
          />
          <FilterMedias
            filterByType={filterByType}
            setFilterByType={setFilterByType}
            sortByDate={sortByDate}
            setSortByDate={setSortByDate}
          />
        </Box>
      </Grid>
      <Grid item>
        <PreviewMediaForUpload
          mime={mime}
          croppedImage={croppedImage}
          selectedFileUrl={selectedFileUrl}
          handleUpload={handleUpload}
          setIsCropperOpen={setIsCropperOpen}
          url={url}
          updateContentLink={updateLink}
          clear={clearDragDropSelector}
        />
      </Grid>
      <Grid item xs={12}>
        <MediaList
          setMedia={setMedia}
          media={media}
          allowMultiple={allowMultiple}
          select={select}
          selectedMedia={selectedMedia}
          sortedAndFilteredMedia={sortedAndFilteredMedia}
          enableModal={enableModal}
        />
      </Grid>
    </Grid>
  );
};
