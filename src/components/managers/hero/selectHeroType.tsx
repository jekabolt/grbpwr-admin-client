import AddIcon from '@mui/icons-material/Add';
import { Button, Grid, MenuItem, TextField } from '@mui/material';
import { common_HeroFullInsert, common_HeroType } from 'api/proto-http/admin';
import { Field, FieldArrayRenderProps, useFormikContext } from 'formik';
import { FC, useEffect, useState } from 'react';
import styles from 'styles/hero.scss';
import { emptyHeroForm, heroTypes } from './utility/mapHeroFunction';
import { validationForSelectHeroType } from './utility/validationForSelectHeroType';

interface SelectHeroType {
  arrayHelpers: FieldArrayRenderProps;
  entityRefs: React.MutableRefObject<{ [key: number]: HTMLDivElement | null }>;
}

export const SelectHeroType: FC<SelectHeroType> = ({ arrayHelpers, entityRefs }) => {
  const { values } = useFormikContext<common_HeroFullInsert>();
  const [entityType, setEntityType] = useState<string>('');
  const isOtherEntitiesExist = values.entities?.some((entity) => entity.type !== 'HERO_TYPE_MAIN');
  const [addedEntityIndex, setAddedEntityIndex] = useState<number | null>(null);

  const isMainAddExists = values.entities?.some((entity) => entity.type === 'HERO_TYPE_MAIN');

  const isEntityIncomplete = values.entities?.some((entity) => {
    const validateEntity = validationForSelectHeroType[entity.type as common_HeroType];
    return validateEntity ? validateEntity(entity) : false;
  });
  const handleAddEntity = () => {
    if (entityType === 'HERO_TYPE_MAIN_ADD' && isMainAddExists) {
      return;
    }
    const newEntity = { ...emptyHeroForm.entities?.[0] };
    newEntity.type = entityType as common_HeroType;
    arrayHelpers.push(newEntity);
    setAddedEntityIndex(values.entities ? values.entities.length : 0);
  };

  useEffect(() => {
    if (addedEntityIndex !== null && entityRefs.current[addedEntityIndex]) {
      entityRefs.current[addedEntityIndex]?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [values.entities?.length, addedEntityIndex, entityRefs]);

  return (
    <Grid container className={styles.select} gap={2}>
      <Grid item>
        <Field
          name='entityType'
          as={TextField}
          select
          label='SELECT ENTITY TYPE'
          size='small'
          sx={{ width: '250px' }}
          value={entityType}
          onChange={(e: any) => setEntityType(e.target.value)}
        >
          {heroTypes
            .filter((type) => {
              if (type.value === 'HERO_TYPE_MAIN' && isOtherEntitiesExist) {
                return false;
              }
              if (type.value === 'HERO_TYPE_MAIN' && isMainAddExists) {
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
          disabled={!entityType || isEntityIncomplete}
        >
          <AddIcon />
        </Button>
      </Grid>
    </Grid>
  );
};
