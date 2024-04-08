import ClearIcon from '@mui/icons-material/Clear';
import {
  Box,
  FormControl,
  Grid,
  IconButton,
  ImageList,
  ImageListItem,
  InputLabel,
  MenuItem,
  Select,
} from '@mui/material';
import { deleteFiles } from 'api/admin';
import { MediaSelectorMediaListProps } from 'features/interfaces/mediaSelectorInterfaces';
import { isVideo } from 'features/utilitty/filterContentType';
import { FC, useMemo, useState } from 'react';
import styles from 'styles/media-selector.scss';

export const MediaList: FC<MediaSelectorMediaListProps> = ({
  media,
  setMedia,
  allowMultiple,
  select,
  selectedMedia,
  height = 480,
}) => {
  const [filterByType, setFilterByType] = useState('');
  const [sortByDate, setSortByDate] = useState('desc');

  const sortedAndFilteredMedia = useMemo(() => {
    return media
      ?.filter((m) => {
        const matchesType =
          filterByType === '' ||
          (filterByType === 'video' && isVideo(m.media?.fullSize)) ||
          (filterByType === 'image' && !isVideo(m.media?.fullSize));

        return matchesType;
      })
      .sort((a, b) => {
        const dateA = new Date(a.createdAt || 0).getTime();
        const dateB = new Date(b.createdAt || 0).getTime();
        return sortByDate === 'asc' ? dateA - dateB : dateB - dateA;
      });
  }, [media, filterByType, sortByDate]);

  const handleDeleteFile = async (id: number | undefined) => {
    await deleteFiles({ id });
    setMedia((currentFiles) => currentFiles?.filter((file) => file.id !== id));
  };

  const handleSelect = (mediaUrl: string, allowMultiple: boolean, event: any) => {
    select?.(mediaUrl, allowMultiple);
    event.stopPropagation();
  };

  return (
    <Grid container spacing={2} justifyContent='center'>
      <Grid item xs={11}>
        <Box display='flex' gap='5px' justifyContent='flex-end'>
          <FormControl>
            <InputLabel shrink>TYPE</InputLabel>
            <Select
              value={filterByType}
              displayEmpty
              onChange={(e) => setFilterByType(e.target.value)}
              label='TYPE'
              size='small'
            >
              <MenuItem value=''>ALL</MenuItem>
              <MenuItem value='image'>IMAGE</MenuItem>
              <MenuItem value='video'>VIDEO</MenuItem>
            </Select>
          </FormControl>
          <FormControl>
            <InputLabel>ORDER</InputLabel>
            <Select
              value={sortByDate}
              onChange={(e) => setSortByDate(e.target.value)}
              label='ORDER'
              size='small'
            >
              <MenuItem value='desc'>DESCENDING</MenuItem>
              <MenuItem value='asc'>ASCENDING</MenuItem>
            </Select>
          </FormControl>
        </Box>
      </Grid>
      <Grid item xs={11}>
        {sortedAndFilteredMedia && (
          <ImageList
            variant='standard'
            sx={{
              width: '100%',
              height: height,
            }}
            cols={5}
            gap={8}
            rowHeight={200}
          >
            {sortedAndFilteredMedia.map((m) => (
              <ImageListItem
                onClick={(event) => handleSelect(m.media?.fullSize ?? '', allowMultiple, event)}
                className={styles.list_media_item}
                key={m.id}
              >
                <InputLabel htmlFor={`${m.id}`}>
                  {selectedMedia?.some((item) => item.url === (m.media?.fullSize ?? '')) ? (
                    <span className={styles.selected_flag}>selected</span>
                  ) : null}
                  {isVideo(m.media?.fullSize) ? (
                    <video
                      key={m.id}
                      src={m.media?.thumbnail}
                      className={`${selectedMedia?.some((item) => item.url === (m.media?.fullSize ?? '')) ? styles.selected_media : ''}`}
                      controls
                    />
                  ) : (
                    <img
                      key={m.id}
                      src={m.media?.thumbnail}
                      alt='media'
                      className={`${selectedMedia?.some((item) => item.url === (m.media?.fullSize ?? '')) ? styles.selected_media : ''}`}
                    />
                  )}
                </InputLabel>
                <IconButton
                  aria-label='delete'
                  size='small'
                  onClick={() => handleDeleteFile(m.id)}
                  className={styles.delete_btn}
                >
                  <ClearIcon />
                </IconButton>
              </ImageListItem>
            ))}
          </ImageList>
        )}
      </Grid>
    </Grid>
  );
};
