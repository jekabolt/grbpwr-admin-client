import {
  Button,
  Checkbox,
  FormControl,
  FormControlLabel,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  TextField,
} from '@mui/material';
import { getDictionary } from 'api/admin';
import { GetProductsPagedRequest, common_Dictionary } from 'api/proto-http/admin';
import { findInDictionary } from 'features/utilitty/findInDictionary';
import { removePossibilityToUseSigns } from 'features/utilitty/removePossibilityToEnterSigns';
import { Field, FieldProps, Form, Formik } from 'formik';
import { FC, useEffect, useState } from 'react';

interface FilterProps {
  filter: GetProductsPagedRequest;
  onSubmit: (values: GetProductsPagedRequest) => void;
}

export const Filter: FC<FilterProps> = ({ filter, onSubmit }) => {
  const [dictionary, setDictionary] = useState<common_Dictionary>();

  useEffect(() => {
    const fetchDictionary = async () => {
      const response = await getDictionary({});
      setDictionary(response.dictionary);
    };
    fetchDictionary();
  }, []);

  return (
    <Formik
      initialValues={filter}
      onSubmit={(values, { setSubmitting }) => {
        onSubmit(values);
        setSubmitting(false);
      }}
    >
      {({ handleSubmit, setFieldValue }) => (
        <Form onSubmit={handleSubmit}>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <Grid container justifyContent='flex-end'>
                <Grid item>
                  <Button variant='contained' type='submit'>
                    Apply Filters
                  </Button>
                </Grid>
              </Grid>
            </Grid>
            <Grid item xs={6}>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6} md={3}>
                  <Field name='sortFactors'>
                    {({ field, form }: FieldProps) => (
                      <FormControl fullWidth>
                        <InputLabel id='sortFactors-label'>SORT FACTORS</InputLabel>
                        <Select
                          labelId='sortFactors-label'
                          {...field}
                          onChange={(e) => {
                            form.setFieldValue(field.name, [e.target.value]);
                          }}
                          value={field.value || ''}
                          label='SORT FACTORS'
                        >
                          {dictionary?.sortFactors?.map((s) => (
                            <MenuItem key={s.id} value={s.id}>
                              {findInDictionary(dictionary, s.id, 'sortFactors')}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    )}
                  </Field>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Field name='orderFactor'>
                    {({ field, form }: FieldProps) => (
                      <FormControl fullWidth>
                        <InputLabel id='orderFactor-label'>ORDER</InputLabel>
                        <Select
                          {...field}
                          onChange={(event) => {
                            form.setFieldValue(field.name, event.target.value);
                          }}
                          value={field.value || ''}
                          label='ORDER'
                        >
                          {dictionary?.orderFactors?.map((s) => (
                            <MenuItem key={s.id} value={s.id}>
                              {s.name}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    )}
                  </Field>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Field name='filterConditions.categoryId'>
                    {({ field, form }: FieldProps) => (
                      <FormControl fullWidth>
                        <InputLabel>CATEGORY</InputLabel>
                        <Select
                          {...field}
                          onChange={(event) => {
                            form.setFieldValue(field.name, event.target.value);
                          }}
                          value={field.value}
                          label='CATEGORY'
                        >
                          {dictionary?.categories?.map((s) => (
                            <MenuItem key={s.id} value={s.id}>
                              {findInDictionary(dictionary, s.id, 'category')}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    )}
                  </Field>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Field name='filterConditions.sizesIds'>
                    {({ field, form }: FieldProps) => (
                      <FormControl fullWidth>
                        <InputLabel>SIZES</InputLabel>
                        <Select
                          {...field}
                          onChange={(event) => {
                            const selectedSizes = event.target.value as number[];
                            form.setFieldValue(field.name, selectedSizes);
                          }}
                          value={field.value || []}
                          label='SIZES'
                          multiple
                        >
                          {dictionary?.sizes?.map((s) => (
                            <MenuItem key={s.id} value={s.id}>
                              {findInDictionary(dictionary, s.id, 'size')}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    )}
                  </Field>
                </Grid>
              </Grid>
            </Grid>
            <Grid item xs={6}>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6} md={3}>
                  <TextField
                    label='FROM'
                    type='number'
                    onChange={(e) => setFieldValue('filterConditions.from', e.target.value)}
                    value={filter.filterConditions?.from}
                    inputProps={{ min: 0 }}
                    onKeyDown={removePossibilityToUseSigns}
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <TextField
                    label='TO'
                    type='number'
                    onChange={(e) => setFieldValue('filterConditions.to', e.target.value)}
                    value={filter.filterConditions?.to}
                    inputProps={{ min: 0 }}
                    onKeyDown={removePossibilityToUseSigns}
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <TextField
                    label='COLOR'
                    type='string'
                    value={filter.filterConditions?.color}
                    onChange={(e) => setFieldValue('filterConditions.color', e.target.value)}
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <TextField
                    label='TAG'
                    type='string'
                    value={filter.filterConditions?.byTag}
                    onChange={(e) => setFieldValue('filterConditions.byTag', e.target.value)}
                  />
                </Grid>
              </Grid>
            </Grid>

            <Grid item xs={12} justifyContent='space-between'>
              <Grid container spacing={2}>
                <Grid item>
                  <Field name='filterConditions.onSale'>
                    {({ form, field }: FieldProps) => (
                      <FormControlLabel
                        label='SALE'
                        control={
                          <Checkbox
                            {...field}
                            checked={field.value || false}
                            onChange={(e) => {
                              form.setFieldValue(field.name, e.target.checked);
                            }}
                          />
                        }
                      />
                    )}
                  </Field>
                </Grid>
                <Grid item>
                  <Field name='filterConditions.preorder'>
                    {({ form, field }: FieldProps) => (
                      <FormControlLabel
                        label='PREORDER'
                        control={
                          <Checkbox
                            {...field}
                            checked={field.value || false}
                            onChange={(e) => {
                              form.setFieldValue(field.name, e.target.checked);
                            }}
                          />
                        }
                      />
                    )}
                  </Field>
                </Grid>
                <Grid item>
                  <Field name='showHidden'>
                    {({ form, field }: FieldProps) => (
                      <FormControlLabel
                        label='HIDDEN'
                        control={
                          <Checkbox
                            {...field}
                            checked={field.value || false}
                            onChange={(e) => {
                              form.setFieldValue(field.name, e.target.checked);
                            }}
                          />
                        }
                      />
                    )}
                  </Field>
                </Grid>
              </Grid>
            </Grid>
          </Grid>
        </Form>
      )}
    </Formik>
  );
};
