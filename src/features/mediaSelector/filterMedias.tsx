import { FormControl, Grid, InputLabel, MenuItem, Select } from '@mui/material';
import { FilterMediasInterface } from 'features/interfaces/mediaSelectorInterfaces';
import { FC } from 'react';

export const FilterMedias: FC<FilterMediasInterface> = ({
  filterByType,
  setFilterByType,
  sortByDate,
  setSortByDate,
}) => {
  return (
    <Grid container justifyContent='center' spacing={1}>
      <Grid item xs={12} sm={6}>
        <FormControl size='small'>
          <InputLabel shrink>TYPE</InputLabel>
          <Select
            value={filterByType}
            displayEmpty
            onChange={(e) => setFilterByType(e.target.value)}
            label='TYPE'
          >
            <MenuItem value=''>ALL</MenuItem>
            <MenuItem value='image'>IMAGE</MenuItem>
            <MenuItem value='video'>VIDEO</MenuItem>
          </Select>
        </FormControl>
      </Grid>
      <Grid item xs={12} sm={6}>
        <FormControl size='small'>
          <InputLabel>ORDER</InputLabel>
          <Select value={sortByDate} onChange={(e) => setSortByDate(e.target.value)} label='ORDER'>
            <MenuItem value='desc'>DESCENDING</MenuItem>
            <MenuItem value='asc'>ASCENDING</MenuItem>
          </Select>
        </FormControl>
      </Grid>
    </Grid>
  );
};
