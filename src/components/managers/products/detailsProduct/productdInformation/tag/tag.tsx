import { Button, Grid, List, ListItem, TextField, Typography } from '@mui/material';
import { updateTag } from 'api/byID';
import { FC, useState } from 'react';
import { ProductIdProps } from '../../utility/interfaces';

export const Tag: FC<ProductIdProps> = ({ product, id, fetchProduct }) => {
  const [tag, setTag] = useState('');

  const addNewTag = async () => {
    await updateTag({ productId: Number(id), tag: tag });
  };
  return (
    <Grid container>
      <Grid item>
        <Typography variant='h4'>Tags</Typography>
      </Grid>
      <Grid item>
        <List
          sx={{
            width: '100%',
            maxWidth: 360,
            position: 'relative',
            overflow: 'auto',
            maxHeight: 100,
            border: '1px solid black',
          }}
        >
          {product?.tags?.map((tag) => <ListItem>{tag.productTagInsert?.tag}</ListItem>)}
        </List>
      </Grid>
      <Grid item>
        <TextField type='text' value={tag} onChange={(e) => setTag(e.target.value)} />
        <Button onClick={addNewTag}>upload</Button>
      </Grid>
    </Grid>
  );
};
