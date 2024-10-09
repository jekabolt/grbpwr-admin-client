import { Button, Grid, MenuItem, TextField } from '@mui/material';
import { common_HeroFullInsert, common_HeroType } from 'api/proto-http/admin';
import { Field, FieldArrayRenderProps, useFormikContext } from 'formik';
import { FC, useState } from 'react';
import { emptyHeroForm, heroTypes } from './mapHeroFunction';

interface SelectHeroType {
  arrayHelpers: FieldArrayRenderProps;
  unshiftEntity: (newEntity: any, arrayHelpers: any) => void;
}

export const SelectHeroType: FC<SelectHeroType> = ({ arrayHelpers, unshiftEntity }) => {
  const { values } = useFormikContext<common_HeroFullInsert>();
  const [entityType, setEntityType] = useState<string>('');

  const handleAddEntity = () => {
    const newEntity = { ...emptyHeroForm.entities?.[0] };
    newEntity.type = entityType as common_HeroType;

    if (entityType === 'HERO_TYPE_MAIN_ADD') {
      const existingMainIndex = values.entities?.findIndex(
        (entity) => entity.type === 'HERO_TYPE_MAIN_ADD',
      );
      if (existingMainIndex !== undefined && existingMainIndex !== -1) {
        arrayHelpers.remove(existingMainIndex);
      }
      unshiftEntity(newEntity, arrayHelpers);
    } else {
      unshiftEntity(newEntity, arrayHelpers);
    }
  };
  return (
    <Grid container justifyContent='center' style={{ marginTop: '20px' }}>
      <Field
        name='entityType'
        as={TextField}
        select
        label='Select Entity Type'
        fullWidth
        value={entityType}
        onChange={(e: any) => setEntityType(e.target.value)}
      >
        {heroTypes.map((type) => (
          <MenuItem key={type.value} value={type.value}>
            {type.label}
          </MenuItem>
        ))}
      </Field>

      <Button onClick={handleAddEntity} style={{ marginTop: '20px' }}>
        Add Entity
      </Button>
    </Grid>
  );
};
