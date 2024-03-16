import { Button, Grid } from '@mui/material';
import { FC, useEffect, useRef } from 'react';
import styles from 'styles/product-id-media.scss';
import { ProductIdMediaProps } from '../../../utility/interfaces';
import { ThumbnailMediaPicker } from './thumbnailMediaPicker/thumbnailMediaPicker';
import { UploadThumbnailByUrl } from './uploadByUrl-uploadByDragDrop/uploadThumbByUrlDragDrop';

export const ThumbnailSelector: FC<ProductIdMediaProps> = ({
  product,
  setProduct,
  id,
  reload,
  media,
  setMedia,
  closeThumbnailPicker,
}) => {
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        closeThumbnailPicker?.();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [wrapperRef, closeThumbnailPicker]);

  return (
    <div className={styles.thumbnail_picker_editor_overlay}>
      <Grid container spacing={2} className={styles.thumbnail_picker} ref={wrapperRef}>
        <Grid item xs={6}>
          <UploadThumbnailByUrl product={product} setProduct={setProduct} id={id} reload={reload} />
        </Grid>
        <Grid item xs={6}>
          <ThumbnailMediaPicker
            media={media}
            product={product}
            setProduct={setProduct}
            id={id}
            setMedia={setMedia}
          />
        </Grid>
        <Button
          sx={{ backgroundColor: 'black' }}
          variant='contained'
          size='small'
          className={styles.close_thumbnail_picker}
          onClick={closeThumbnailPicker}
        >
          x
        </Button>
      </Grid>
    </div>
  );
};
