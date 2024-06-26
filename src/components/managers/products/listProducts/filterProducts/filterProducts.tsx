import {
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
import {
  GetProductsPagedRequest,
  common_Dictionary,
  common_FilterConditions,
} from 'api/proto-http/admin';
import { findInDictionary } from 'features/utilitty/findInDictionary';
import { removePossibilityToUseSigns } from 'features/utilitty/removePossibilityToEnterSigns';
import { Field, FieldProps, Form, Formik } from 'formik';
import { FC, useEffect, useState } from 'react';

interface FilterProps {
  filter: GetProductsPagedRequest;
  onFilterChange: (values: GetProductsPagedRequest) => void;
}

export const Filter: FC<FilterProps> = ({ filter, onFilterChange }) => {
  const [dictionary, setDictionary] = useState<common_Dictionary>();

  useEffect(() => {
    const fetchDictionary = async () => {
      const response = await getDictionary({});
      setDictionary(response.dictionary);
    };
    fetchDictionary();
  }, []);

  const handleFieldChange = (setFieldValue: Function, fieldName: string, value: any) => {
    setFieldValue(fieldName, value);
    const updatedFilter = { ...filter };

    if (fieldName.includes('filterConditions')) {
      const keys = fieldName.split('.');
      updatedFilter.filterConditions = {
        ...filter.filterConditions,
        [keys[1]]: value,
      } as common_FilterConditions;
    } else {
      updatedFilter[fieldName as keyof GetProductsPagedRequest] = value;
    }

    onFilterChange(updatedFilter);
  };

  return (
    <Formik initialValues={filter} onSubmit={() => {}}>
      {({ setFieldValue }) => (
        <Form>
          <Grid container spacing={2}>
            <Grid item xs={6}>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6} md={3}>
                  <Field name='sortFactors'>
                    {({ field }: FieldProps) => (
                      <FormControl fullWidth>
                        <InputLabel id='sortFactors-label'>SORT FACTORS</InputLabel>
                        <Select
                          labelId='sortFactors-label'
                          {...field}
                          onChange={(e) =>
                            handleFieldChange(setFieldValue, field.name, [e.target.value])
                          }
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
                    {({ field }: FieldProps) => (
                      <FormControl fullWidth>
                        <InputLabel id='orderFactor-label'>ORDER</InputLabel>
                        <Select
                          {...field}
                          onChange={(e) =>
                            handleFieldChange(setFieldValue, field.name, e.target.value)
                          }
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
                    {({ field }: FieldProps) => (
                      <FormControl fullWidth>
                        <InputLabel>CATEGORY</InputLabel>
                        <Select
                          {...field}
                          onChange={(e) =>
                            handleFieldChange(setFieldValue, field.name, e.target.value)
                          }
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
                    {({ field }: FieldProps) => (
                      <FormControl fullWidth>
                        <InputLabel>SIZES</InputLabel>
                        <Select
                          {...field}
                          onChange={(e) =>
                            handleFieldChange(setFieldValue, field.name, e.target.value as number[])
                          }
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
                    onChange={(e) =>
                      handleFieldChange(setFieldValue, 'filterConditions.from', e.target.value)
                    }
                    value={filter.filterConditions?.from}
                    inputProps={{ min: 0 }}
                    onKeyDown={removePossibilityToUseSigns}
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <TextField
                    label='TO'
                    type='number'
                    onChange={(e) =>
                      handleFieldChange(setFieldValue, 'filterConditions.to', e.target.value)
                    }
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
                    onChange={(e) =>
                      handleFieldChange(setFieldValue, 'filterConditions.color', e.target.value)
                    }
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <TextField
                    label='TAG'
                    type='string'
                    value={filter.filterConditions?.byTag}
                    onChange={(e) =>
                      handleFieldChange(setFieldValue, 'filterConditions.byTag', e.target.value)
                    }
                  />
                </Grid>
              </Grid>
            </Grid>
            <Grid item xs={12} justifyContent='space-between'>
              <Grid container spacing={2}>
                <Grid item>
                  <Field name='filterConditions.onSale'>
                    {({ field }: FieldProps) => (
                      <FormControlLabel
                        label='SALE'
                        control={
                          <Checkbox
                            {...field}
                            checked={field.value || false}
                            onChange={(e) =>
                              handleFieldChange(setFieldValue, field.name, e.target.checked)
                            }
                          />
                        }
                      />
                    )}
                  </Field>
                </Grid>
                <Grid item>
                  <Field name='filterConditions.preorder'>
                    {({ field }: FieldProps) => (
                      <FormControlLabel
                        label='PREORDER'
                        control={
                          <Checkbox
                            {...field}
                            checked={field.value || false}
                            onChange={(e) =>
                              handleFieldChange(setFieldValue, field.name, e.target.checked)
                            }
                          />
                        }
                      />
                    )}
                  </Field>
                </Grid>
                <Grid item>
                  <Field name='showHidden'>
                    {({ field }: FieldProps) => (
                      <FormControlLabel
                        label='HIDDEN'
                        control={
                          <Checkbox
                            {...field}
                            checked={field.value || false}
                            onChange={(e) =>
                              handleFieldChange(setFieldValue, field.name, e.target.checked)
                            }
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
