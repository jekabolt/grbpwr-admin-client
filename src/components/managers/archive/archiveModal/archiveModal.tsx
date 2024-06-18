import { Button, Dialog, Grid, TextField } from '@mui/material';
import { isValidURL } from 'features/utilitty/isValidUrl';
import { FC } from 'react';
import styles from 'styles/creatArchiveItemModal.scss';
import { ArchiveModalInterface } from '../interfaces/interfaces';

export const ArchiveModal: FC<ArchiveModalInterface> = ({
  id,
  open,
  media,
  title,
  url,
  close,
  setTitle,
  addNewItem,
  setUrl,
}) => {
  const handleDescriptionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;
    if (value.length > 256) {
      value = value.substring(0, 256);
    }
    setTitle(value);
  };

  return (
    <Dialog open={open} onClose={close} fullWidth scroll='paper' maxWidth='md'>
      <Grid container spacing={3} padding={6} alignItems='flex-start' className={styles.container}>
        <Grid item xs={6}>
          <Grid container spacing={2} justifyContent='center'>
            <Grid item xs={12} className={styles.media_item_add}>
              {media ? <img src={media} /> : ''}
            </Grid>
            <Grid item xs={12} justifySelf='center'>
              <TextField
                value={url}
                error={!!url && !isValidURL(url)}
                helperText={url && !isValidURL(url) ? 'the entered url is invalid' : ''}
                onChange={(e) => setUrl(e.target.value)}
                label='url'
                fullWidth
                size='small'
                style={{ textTransform: 'uppercase' }}
              />
            </Grid>
          </Grid>
        </Grid>
        <Grid item xs={6}>
          <TextField
            value={title}
            onChange={handleDescriptionChange}
            label='description'
            variant='outlined'
            multiline
            fullWidth
            style={{ textTransform: 'uppercase' }}
          />
        </Grid>
        <Grid item className={styles.add_btn}>
          <Button onClick={() => addNewItem(id)}>add item</Button>
        </Grid>
      </Grid>
    </Dialog>
  );
};
