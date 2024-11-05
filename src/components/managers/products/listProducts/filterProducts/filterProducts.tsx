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
import { colors } from 'constants/colors';
import { findInDictionary } from 'features/utilitty/findInDictionary';
import { Field, FieldProps, Form, Formik } from 'formik';
import { FC, useEffect, useState } from 'react';
import {
  genderOptions,
  orderFactors,
  sortFactors,
} from '../../genericProductComponent/utility/dictionaryConst';

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
      if (keys[1] === 'categoryIds') {
        updatedFilter.filterConditions = {
          ...filter.filterConditions,
          categoryIds: Array.isArray(value) ? value : [value],
        } as common_FilterConditions;
      } else if (keys[1] === 'sizesIds' && value.includes('')) {
        updatedFilter.filterConditions = {
          ...filter.filterConditions,
          sizesIds: [],
        } as common_FilterConditions;
      } else {
        updatedFilter.filterConditions = {
          ...filter.filterConditions,
          [keys[1]]: value,
        } as common_FilterConditions;
      }
    } else {
      updatedFilter[fieldName as keyof GetProductsPagedRequest] = value;
    }

    onFilterChange(updatedFilter);
  };

  return (
    <div style={{ marginTop: '2%' }}>
      <Formik initialValues={filter} onSubmit={() => {}}>
        {({ setFieldValue }) => (
          <Form>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <Grid container spacing={2}>
                  <Grid item xs={12} md={3}>
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
                            {sortFactors.map((s) => (
                              <MenuItem key={s.id} value={s.id}>
                                {s.name?.toUpperCase()}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      )}
                    </Field>
                  </Grid>
                  <Grid item xs={12} md={3}>
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
                            {orderFactors.map((order) => (
                              <MenuItem key={order.id} value={order.id}>
                                {order.name?.toUpperCase()}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      )}
                    </Field>
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <Field name='filterConditions.categoryIds'>
                      {({ field }: FieldProps) => (
                        <FormControl fullWidth>
                          <InputLabel>CATEGORY</InputLabel>
                          <Select
                            {...field}
                            onChange={(e) =>
                              handleFieldChange(
                                setFieldValue,
                                field.name,
                                e.target.value.includes('') ? [] : (e.target.value as number[]),
                              )
                            }
                            value={field.value || []}
                            label='CATEGORY'
                            multiple
                          >
                            <MenuItem value=''>ANY</MenuItem>
                            {dictionary?.categories?.map((category) => (
                              <MenuItem key={category.id} value={category.id}>
                                {findInDictionary(dictionary, category.id, 'category')}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      )}
                    </Field>
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <Field name='filterConditions.sizesIds'>
                      {({ field }: FieldProps) => (
                        <FormControl fullWidth>
                          <InputLabel>SIZES</InputLabel>
                          <Select
                            {...field}
                            onChange={(e) =>
                              handleFieldChange(
                                setFieldValue,
                                field.name,
                                e.target.value.includes('') ? [] : (e.target.value as number[]),
                              )
                            }
                            value={field.value || []}
                            label='SIZES'
                            multiple
                          >
                            <MenuItem value=''>ANY</MenuItem>
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
              <Grid item xs={12}>
                <Grid container spacing={2}>
                  <Grid item xs={12} md={2}>
                    <TextField
                      label='FROM'
                      type='number'
                      onChange={(e) => {
                        if (/^\d*$/.test(e.target.value)) {
                          handleFieldChange(setFieldValue, 'filterConditions.from', e.target.value);
                        }
                      }}
                      value={filter.filterConditions?.from}
                      inputProps={{ min: 0 }}
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12} md={2}>
                    <TextField
                      label='TO'
                      type='number'
                      onChange={(e) => {
                        if (/^\d*$/.test(e.target.value)) {
                          handleFieldChange(setFieldValue, 'filterConditions.to', e.target.value);
                        }
                      }}
                      value={filter.filterConditions?.to}
                      inputProps={{ min: 0 }}
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <Field name='filterConditions.color'>
                      {({ field }: FieldProps) => (
                        <FormControl fullWidth>
                          <InputLabel>COLOR</InputLabel>
                          <Select
                            {...field}
                            onChange={(e) =>
                              handleFieldChange(setFieldValue, field.name, e.target.value)
                            }
                            value={field.value}
                            label='COLOR'
                          >
                            <MenuItem value=''>ANY</MenuItem>
                            {colors.map((color, id) => (
                              <MenuItem
                                key={id}
                                value={color.name.toLowerCase().replace(/\s/g, '_')}
                              >
                                {color.name.toLowerCase().replace(/\s/g, '_')}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      )}
                    </Field>
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <Field name='filterConditions.gender'>
                      {({ field }: FieldProps) => (
                        <FormControl fullWidth>
                          <InputLabel>GENDER</InputLabel>
                          <Select
                            {...field}
                            onChange={(e) =>
                              handleFieldChange(setFieldValue, field.name, e.target.value)
                            }
                            value={field.value}
                            label='GENDER'
                          >
                            <MenuItem value=''>ANY</MenuItem>
                            {genderOptions.map((gender) => (
                              <MenuItem key={gender.id} value={gender.id}>
                                {gender.name?.toUpperCase()}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      )}
                    </Field>
                  </Grid>
                  <Grid item xs={12} md={2}>
                    <TextField
                      label='TAG'
                      type='string'
                      value={filter.filterConditions?.byTag}
                      onChange={(e) =>
                        handleFieldChange(setFieldValue, 'filterConditions.byTag', e.target.value)
                      }
                      fullWidth
                    />
                  </Grid>
                </Grid>
              </Grid>
              <Grid item xs={12}>
                <Grid container spacing={2} display='flex' flexWrap='nowrap'>
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
    </div>
  );
};
