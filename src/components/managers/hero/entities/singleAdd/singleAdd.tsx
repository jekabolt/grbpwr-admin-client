import { Box, Grid2 as Grid, TextField, Typography } from '@mui/material';
import { common_HeroFullInsert } from 'api/proto-http/admin';
import { SingleMediaViewAndSelect } from 'components/common/media-selector-layout/media-selector-components/singleMediaViewAndSelect';
import { isValidURL, isValidUrlForHero } from 'features/utilitty/isValidUrl';
import { ErrorMessage, Field, useFormikContext } from 'formik';
import { FC } from 'react';
import styles from 'styles/hero.scss';
import { HeroMediaEntityInterface } from '../interface/interface';

export const SingleAdd: FC<HeroMediaEntityInterface> = ({
  index,
  entity,
  singleLink,
  saveMedia,
}) => {
  const { errors } = useFormikContext<common_HeroFullInsert>();
  const errorEntities = (errors?.entities || []) as any[];

  return (
    <Grid container>
      <Grid size={{ xs: 12 }}>
        <Typography variant='h4' textTransform='uppercase'>
          single add
        </Typography>
      </Grid>
      <Grid size={{ xs: 12 }}>
        <SingleMediaViewAndSelect
          link={singleLink?.[index]}
          aspectRatio={['16:9']}
          isDeleteAccepted={false}
          saveSelectedMedia={(selectedMedia) => saveMedia && saveMedia(selectedMedia, index)}
        />
        {`${errors}.entities.${index}.singleAdd.mediaId` && (
          <ErrorMessage
            className={styles.error}
            name={`entities.${index}.singleAdd.mediaId`}
            component='div'
          />
        )}
        <Box component='div' className={styles.fields}>
          <Field
            as={TextField}
            name={`entities.${index}.singleAdd.exploreLink`}
            label='EXPLORE LINK'
            error={
              (entity?.singleAdd?.exploreLink &&
                !isValidUrlForHero(entity.singleAdd?.exploreLink)) ||
              (entity?.singleAdd?.exploreLink && !isValidURL(entity.singleAdd?.exploreLink))
            }
            helperText={
              entity?.singleAdd?.exploreLink && !isValidURL(entity.singleAdd?.exploreLink)
                ? 'Invalid URL format'
                : entity?.singleAdd?.exploreLink &&
                    !isValidUrlForHero(entity.singleAdd?.exploreLink)
                  ? 'URL is not from the allowed domain but will be saved with a warning'
                  : ''
            }
            fullwidth
          />
          <Field
            as={TextField}
            name={`entities.${index}.singleAdd.exploreText`}
            label='EXPLORE TEXT'
            fullwidth
          />
        </Box>
      </Grid>
    </Grid>
  );
};
