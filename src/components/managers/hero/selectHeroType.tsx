import { Button, Grid, MenuItem, TextField } from '@mui/material';
import { common_HeroFullInsert, common_HeroType } from 'api/proto-http/admin';
import { Field, FieldArrayRenderProps, useFormikContext } from 'formik';
import { FC, useState } from 'react';
import { emptyHeroForm, heroTypes } from './mapHeroFunction';
import { validationForSelectHeroType } from './utility/validationForSelectHeroType';

interface SelectHeroType {
  arrayHelpers: FieldArrayRenderProps;
  unshiftEntity: (newEntity: any, arrayHelpers: any, values: any) => void;
}

export const SelectHeroType: FC<SelectHeroType> = ({ arrayHelpers, unshiftEntity }) => {
  const { values } = useFormikContext<common_HeroFullInsert>();
  const [entityType, setEntityType] = useState<string>('');
  const isOtherEntitiesExist = values.entities?.some(
    (entity) => entity.type !== 'HERO_TYPE_MAIN_ADD',
  );
  const isMainAddExists = values.entities?.some((entity) => entity.type === 'HERO_TYPE_MAIN_ADD');

  const isEntityIncomplete = values.entities?.some((entity) => {
    const validateEntity = validationForSelectHeroType[entity.type as common_HeroType];
    return validateEntity ? validateEntity(entity) : false;
  });

  const handleAddEntity = () => {
    const newEntity = { ...emptyHeroForm.entities?.[0] };
    newEntity.type = entityType as common_HeroType;
    unshiftEntity(newEntity, arrayHelpers, values);
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
        {heroTypes

          .filter((type) => {
            if (type.value === 'HERO_TYPE_MAIN_ADD' && isOtherEntitiesExist) {
              return false;
            }

            if (type.value === 'HERO_TYPE_MAIN_ADD' && isMainAddExists) {
              return false;
            }

            return true;
          })
          .map((type) => (
            <MenuItem key={type.value} value={type.value}>
              {type.label}
            </MenuItem>
          ))}
      </Field>

      <Button onClick={handleAddEntity} disabled={isEntityIncomplete} style={{ marginTop: '20px' }}>
        Add Entity
      </Button>
    </Grid>
  );
};
