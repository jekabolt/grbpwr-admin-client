import { Box, Grid, TextField, Typography } from '@mui/material';
import { common_HeroFullInsert } from 'api/proto-http/admin';
import { SingleMediaViewAndSelect } from 'components/common/singleMediaViewAndSelect';
import { isValidUrlForHero } from 'features/utilitty/isValidUrl';
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
  return (
    <>
      <Grid item xs={12} md={10}>
        <Typography variant='h4' textTransform='uppercase'>
          single add
        </Typography>
      </Grid>
      <Grid item xs={12} md={10}>
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
              (entity.singleAdd?.exploreLink && errors.entities) ||
              (entity.singleAdd?.exploreLink && !isValidUrlForHero(entity.singleAdd?.exploreLink))
            }
            helperText={
              entity.singleAdd?.exploreLink && !isValidUrlForHero(entity.singleAdd?.exploreLink)
                ? "The URL field will display an error message until a valid URL is provided. However, users are still able to save the link, even if it's not valid."
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
    </>
  );
};
