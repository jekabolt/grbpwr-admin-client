import CloseIcon from '@mui/icons-material/Close';
import {
  Box,
  Button,
  Grid,
  IconButton,
  List,
  ListItem,
  TextField,
  Typography,
} from '@mui/material';
import { deleteTag, updateTag } from 'api/byID';
import { FC, useState } from 'react';
import styles from 'styles/product-details.scss';
import { ProductIdProps } from '../../utility/interfaces';

export const Tag: FC<ProductIdProps> = ({ product, id, fetchProduct }) => {
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
    <Grid container spacing={2} alignItems='flex-start' justifyContent='flex-start'>
      <Grid item>
        <Typography variant='h6' className={styles.title}>
          tags
        </Typography>
      </Grid>
      <Grid item xs={6}>
        <List
          className={styles.tags_list}
          sx={{
            maxWidth: 560,
            maxHeight: 50,
          }}
        >
          {product?.tags?.map((tag) => (
            <ListItem className={styles.list_item}>
              <Typography variant='body1'>{tag.productTagInsert?.tag}</Typography>
              <IconButton
                onClick={() => deleteTagFromList(tag.productTagInsert?.tag)}
                className={styles.btn}
              >
                <CloseIcon />
              </IconButton>
            </ListItem>
          ))}
        </List>
      </Grid>
      <Grid item xs={6}>
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
      </Grid>
    </Grid>
  );
};
