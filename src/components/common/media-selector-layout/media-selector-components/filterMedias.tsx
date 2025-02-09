import { FormControl, Grid, InputLabel, MenuItem, Select } from '@mui/material';
import { useMediaSelectorStore } from 'lib/stores/store';
import { FC } from 'react';

export const FilterMedias: FC = ({}) => {
  const { type, order, setType, setOrder } = useMediaSelectorStore();
  return (
    <Grid container justifyContent='center' spacing={2}>
      <Grid item xs={12} sm={6}>
        <FormControl size='small' fullWidth>
          <InputLabel shrink>TYPE</InputLabel>
          <Select value={type} displayEmpty onChange={(e) => setType(e.target.value)} label='TYPE'>
            <MenuItem value=''>ALL</MenuItem>
            <MenuItem value='image'>IMAGE</MenuItem>
            <MenuItem value='video'>VIDEO</MenuItem>
          </Select>
        </FormControl>
      </Grid>
      <Grid item xs={12} sm={6}>
        <FormControl size='small' fullWidth>
          <InputLabel>ORDER</InputLabel>
          <Select value={order} onChange={(e) => setOrder(e.target.value)} label='ORDER'>
            <MenuItem value='desc'>DESCENDING</MenuItem>
            <MenuItem value='asc'>ASCENDING</MenuItem>
          </Select>
        </FormControl>
      </Grid>
    </Grid>
  );
};
