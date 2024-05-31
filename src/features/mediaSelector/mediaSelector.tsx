import { Box, Grid } from '@mui/material';
import { MediaSelectorInterface } from 'features/interfaces/mediaSelectorInterfaces';
import { checkIsHttpHttpsMediaLink } from 'features/utilitty/checkIsHttpHttpsLink';
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
  const isValid = checkIsHttpHttpsMediaLink(url);

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
    <Grid container spacing={2} justifyContent='center'>
      <Grid item xs={11} className={styles.filter_upload_boxes}>
        <Box component='div' className={styles.filter_upload_media_container}>
          <ByUrl url={url} setUrl={setUrl} isLoading={isLoading} />
          <DragDrop
            loading={loading}
            selectedFiles={selectedFiles}
            setSelectedFiles={setSelectedFiles}
            selectedFileUrl={selectedFileUrl}
            setSelectedFileUrl={setSelectedFileUrl}
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
