// import { Box, Grid, TextField, Typography } from '@mui/material';
// import { common_HeroFullInsert } from 'api/proto-http/admin';
// import { SingleMediaViewAndSelect } from 'components/common/singleMediaViewAndSelect';
// import { isValidUrlForHero } from 'features/utilitty/isValidUrl';
// import { ErrorMessage, Field, useFormikContext } from 'formik';
// import { FC } from 'react';

// interface MainAddProps {
//   entity: any;
//   index: number;
// }

// export const MainAdd: FC<MainAddProps> = ({ entity, index }) => {
//   const { errors, setFieldValue } = useFormikContext<common_HeroFullInsert>();
//   return (
//     <>
//       <Grid item xs={12} md={10}>
//         <Typography variant='h4' textTransform='uppercase'>
//           main
//         </Typography>
//       </Grid>
//       <Grid item xs={12} md={10}>
//         <SingleMediaViewAndSelect
//           link={main}
//           aspectRatio={['4:5', '5:4', '1:1', '16:9', '9:16']}
//           saveSelectedMedia={(selectedMedia) => saveMainMedia(selectedMedia, setFieldValue, index)}
//         />
//         {`${errors}.entities.${index}.mainAdd..singleAdd.mediaId` && (
//           <ErrorMessage
//             className={styles.error}
//             name={`entities.${index}.mainAdd.singleAdd.mediaId`}
//             component='div'
//           />
//         )}
//         <Box component='div' className={styles.fields}>
//           <Field
//             as={TextField}
//             name={`entities.${index}.mainAdd.singleAdd.exploreLink`}
//             label='EXPLORE LINK'
//             error={
//               (entity.mainAdd?.singleAdd?.exploreLink && errors.entities) ||
//               (entity.mainAdd?.singleAdd?.exploreLink &&
//                 !isValidUrlForHero(entity.mainAdd?.singleAdd?.exploreLink))
//             }
//             helperText={
//               entity.mainAdd?.singleAdd?.exploreLink && errors.entities
//                 ? 'This field is required'
//                 : entity.mainAdd?.singleAdd?.exploreLink &&
//                     !isValidUrlForHero(entity.mainAdd?.singleAdd?.exploreLink)
//                   ? 'Please enter a valid URL'
//                   : ''
//             }
//             fullWidth
//           />

//           <Field
//             as={TextField}
//             name={`entities.${index}.mainAdd.singleAdd.exploreText`}
//             label='EXPLORE TEXT'
//             fullwidth
//           />
//         </Box>
//       </Grid>
//     </>
//   );
// };
