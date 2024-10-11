import AddIcon from '@mui/icons-material/Add';
import { Button, Grid, MenuItem, TextField } from '@mui/material';
import { common_HeroFullInsert, common_HeroType } from 'api/proto-http/admin';
import { Field, FieldArrayRenderProps, useFormikContext } from 'formik';
import { FC, useState } from 'react';
import { emptyHeroForm, heroTypes } from './utility/mapHeroFunction';
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
    <Grid container gap={2} alignItems='center' justifyContent='end' marginTop={3} marginBottom={6}>
      <Grid item>
        <Field
          name='entityType'
          as={TextField}
          select
          label='Select Entity Type'
          size='small'
          sx={{ width: '250px' }}
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
              <MenuItem sx={{ textTransform: 'uppercase' }} key={type.value} value={type.value}>
                {type.label.toUpperCase()}
              </MenuItem>
            ))}
        </Field>
      </Grid>

      <Grid item>
        <Button
          variant='contained'
          size='large'
          onClick={handleAddEntity}
          disabled={isEntityIncomplete}
        >
          <AddIcon />
        </Button>
      </Grid>
    </Grid>
  );
};
