import { Button, Grid, TextField } from '@mui/material';
import { addMediaByID } from 'api/admin';
import { FC, useState } from 'react';
import { ThumbnailProps } from '../../interfaces-type/thumbnailInterface';

export const ByUrl: FC<ThumbnailProps> = ({ id }) => {
  const [imageUrl, setImageUrl] = useState<string>('');

  const handleUpload = async () => {
    if (imageUrl.trim() === '') {
      alert('Please enter an image URL.');
      return;
    }
    try {
      const compressedUrl = imageUrl.replace(/-og\.jpg$/, '-compressed.jpg');
      await addMediaByID({
        productId: Number(id),
        fullSize: imageUrl,
        thumbnail: imageUrl,
        compressed: compressedUrl,
      });
      setImageUrl('');
    } catch (error) {
      console.error('Error uploading image:', error);
    }
  };

  return (
    <Grid container spacing={2}>
      <Grid item>
        <TextField
          size='small'
          label='upload media by url'
          name='media'
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
        />
      </Grid>
      <Grid item>
        <Button variant='contained' onClick={handleUpload}>
          upload
        </Button>
      </Grid>
    </Grid>
  );
};
