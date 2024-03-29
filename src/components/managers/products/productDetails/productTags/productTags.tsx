import CloseIcon from '@mui/icons-material/Close';
import { Box, Button, Grid, IconButton, TextField, Typography } from '@mui/material';
import { deleteTag, updateTag } from 'api/updateProductsById';
import { FC, useState } from 'react';
import styles from 'styles/product-details.scss';
import { ProductIdProps } from '../utility/interfaces';

export const ProductTags: FC<ProductIdProps> = ({ product, id, fetchProduct }) => {
  const [tag, setTag] = useState('');

  const deleteTagFromList = async (removeTag: string | undefined) => {
    const response = await deleteTag({ productId: Number(id), tag: removeTag });
    if (response) {
      fetchProduct();
    }
  };

  const addNewTag = async () => {
    const response = await updateTag({ productId: Number(id), tag: tag });
    if (response) {
      fetchProduct();
    }
  };
  return (
    <Grid container spacing={2}>
      <Grid item>
        <Box display='flex' alignItems='center' gap='15px'>
          <Typography variant='h6' className={styles.title}>
            tags
          </Typography>
          <Box display='flex' alignItems='center' gap='5px'>
            <TextField
              type='text'
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              placeholder='upload new tag'
              size='small'
            />
            <Button sx={{ backgroundColor: '#000' }} variant='contained' onClick={addNewTag}>
              upload
            </Button>
          </Box>
        </Box>
      </Grid>
      <Grid item>
        <Grid container spacing={3}>
          {product?.tags?.map((tag) => (
            <Grid item xs={6}>
              <Box className={styles.tag}>
                <Typography variant='body1'>{tag.productTagInsert?.tag}</Typography>
                <IconButton
                  onClick={() => deleteTagFromList(tag.productTagInsert?.tag)}
                  className={styles.btn}
                >
                  <CloseIcon />
                </IconButton>
              </Box>
            </Grid>
          ))}
        </Grid>
      </Grid>
    </Grid>
  );
};
