import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import {
  Checkbox,
  Collapse,
  FormControl,
  FormControlLabel,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  TextField,
} from '@mui/material';
import { GetProductsPagedRequest } from 'api/proto-http/admin';
import { colors } from 'constants/colors';
import { Field, FieldProps, Form, Formik } from 'formik';
import { findInDictionary } from 'lib/features/findInDictionary';
import { useProductStore } from 'lib/stores/product/store';
import { useDictionaryStore } from 'lib/stores/store';
import { FC, useState } from 'react';
import {
  genderOptions,
  orderFactors,
  sortFactors,
} from '../../genericProductComponent/utility/dictionaryConst';

interface FilterProps {
  // filter: GetProductsPagedRequest;
  onFilterChange: (values: GetProductsPagedRequest) => void;
}

export const Filter: FC<FilterProps> = ({ onFilterChange }) => {
  const { filter, updateFilter } = useProductStore();
  const { dictionary } = useDictionaryStore();
  const [isOpen, setIsOpen] = useState(true);

  const handleFieldChange = (setFieldValue: Function, fieldName: string, value: any) => {
    setFieldValue(fieldName, value);

    let updatedFilter = {};
    if (fieldName.includes('filterConditions')) {
      const keys = fieldName.split('.');
      if (keys[1] === 'categoryIds') {
        updatedFilter = {
          filterConditions: {
            categoryIds: Array.isArray(value) ? value : [value],
          },
        };
      } else if (keys[1] === 'sizesIds' && value.includes('')) {
        updatedFilter = {
          filterConditions: {
            sizesIds: [],
          },
        };
      } else {
        updatedFilter = {
          filterConditions: {
            [keys[1]]: value,
          },
        };
      }
    } else {
      updatedFilter = {
        [fieldName]: value,
      };
    }

    updateFilter(updatedFilter);
    onFilterChange({ ...filter, ...updatedFilter });
  };

  return (
    <div style={{ marginTop: '2%' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem' }}>
        <IconButton onClick={() => setIsOpen(!isOpen)} size='small'>
          {isOpen ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
        </IconButton>
        <span style={{ marginLeft: '8px' }}>Filters</span>
      </div>

      <Collapse in={isOpen}>
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
                            handleFieldChange(
                              setFieldValue,
                              'filterConditions.from',
                              e.target.value,
                            );
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
      </Collapse>
    </div>
  );
};
