import { Button, Dialog, Grid, TextField } from '@mui/material';
import { FC } from 'react';
import styles from 'styles/creatArchiveItemModal.scss';
import { ArchiveModalInterface } from '../interfaces/interfaces';

export const ArchiveModal: FC<ArchiveModalInterface> = ({
  open,
  close,
  media,
  title,
  setTitle,
  addNewItem,
  url,
  setUrl,
  id,
}) => {
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
                onChange={(e) => setUrl(e.target.value)}
                label='URL IS OPT'
                fullWidth
                size='small'
              />
            </Grid>
          </Grid>
        </Grid>
        <Grid item xs={6}>
          <TextField
            value={title}
            onChange={(e) => setTitle(e.target.value.substring(0, 255))}
            label='DESCRIPTION IS OPT'
            variant='outlined'
            multiline
            fullWidth
          />
        </Grid>
        <Grid item className={styles.add_btn}>
          <Button onClick={() => addNewItem(id)}>add item</Button>
        </Grid>
      </Grid>
    </Dialog>
  );
};
