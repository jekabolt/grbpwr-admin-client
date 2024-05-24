import { Box, Grid } from '@mui/material';
import { MediaSelectorInterface } from 'features/interfaces/mediaSelectorInterfaces';
import useMediaSelector from 'features/utilitty/useMediaSelector';
import { FC, useEffect, useState } from 'react';
import 'react-advanced-cropper/dist/style.css';
import styles from 'styles/media-selector.scss';
import { ByUrl } from './byUrl';
import { MediaCropper } from './cropper';
import { DragDrop } from './dragDrop';
import { FilterMedias } from './filterMedias';
import { MediaList } from './listMedia';

export const MediaSelector: FC<MediaSelectorInterface> = ({
  allowMultiple,
  selectedMedia,
  select,
}) => {
  const {
    fetchFiles,
    media,
    reload,
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
  } = useMediaSelector();
  const [selectedFileUrl, setSelectedFileUrl] = useState<string | null>(null);

  useEffect(() => {
    fetchFiles(50, 0);
  }, [fetchFiles]);

  return (
    <Grid container spacing={2} justifyContent='center'>
      <Grid item xs={11} className={styles.filter_upload_boxes}>
        <Box component='div' className={styles.filter_upload_media_container}>
          <ByUrl url={url} setUrl={setUrl} updateContentLink={updateLink} isLoading={isLoading} />
          <DragDrop
            reload={reload}
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

      <Grid item xs={12}>
        <MediaList
          setMedia={setMedia}
          media={media}
          allowMultiple={allowMultiple}
          select={select}
          selectedMedia={selectedMedia}
          sortedAndFilteredMedia={sortedAndFilteredMedia}
        />
      </Grid>
    </Grid>
  );
};
