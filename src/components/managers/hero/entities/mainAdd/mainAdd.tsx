import { Box, Grid2 as Grid, TextField, Typography } from '@mui/material';
import { common_HeroFullInsert } from 'api/proto-http/admin';
import { SingleMediaViewAndSelect } from 'components/common/singleMediaViewAndSelect';
import { isValidUrlForHero } from 'features/utilitty/isValidUrl';
import { ErrorMessage, Field, useFormikContext } from 'formik';
import { FC } from 'react';
import styles from 'styles/hero.scss';
import { HeroMediaEntityInterface } from '../interface/interface';

export const MainAdd: FC<HeroMediaEntityInterface> = ({ index, entity, link, saveMedia }) => {
  const { errors } = useFormikContext<common_HeroFullInsert>();
  const errorEntities = (errors?.entities || []) as any[];
  return (
    <>
      <Grid size={{ xs: 12 }}>
        <Typography variant='h4' textTransform='uppercase'>
          main
        </Typography>
      </Grid>
      <Grid size={{ xs: 12 }}>
        <SingleMediaViewAndSelect
          link={link}
          aspectRatio={['4:5', '5:4', '1:1', '16:9', '9:16']}
          isDeleteAccepted={false}
          saveSelectedMedia={(selectedMedia) => saveMedia && saveMedia(selectedMedia, index)}
        />
        {`${errors}.entities.${index}.mainAdd..singleAdd.mediaId` && (
          <ErrorMessage
            className={styles.error}
            name={`entities.${index}.mainAdd.singleAdd.mediaId`}
            component='div'
          />
        )}
        <Box component='div' className={styles.fields}>
          <Field
            as={TextField}
            name={`entities.${index}.mainAdd.singleAdd.exploreLink`}
            label='EXPLORE LINK'
            error={
              Boolean(errorEntities?.[index]?.mainAdd?.singleAdd?.exploreLink) ||
              (entity?.mainAdd?.singleAdd?.exploreLink &&
                !isValidUrlForHero(entity.mainAdd?.singleAdd?.exploreLink))
            }
            helperText={
              errorEntities?.[index]?.mainAdd?.singleAdd?.exploreLink
                ? errorEntities[index].mainAdd.singleAdd.exploreLink
                : entity?.mainAdd?.singleAdd?.exploreLink &&
                    !isValidUrlForHero(entity.mainAdd?.singleAdd?.exploreLink)
                  ? 'URL is not from the allowed domain but will be saved with a warning'
                  : ''
            }
            fullWidth
          />

          <Field
            as={TextField}
            name={`entities.${index}.mainAdd.singleAdd.exploreText`}
            label='EXPLORE TEXT'
            fullwidth
          />
        </Box>
      </Grid>
    </>
  );
};
