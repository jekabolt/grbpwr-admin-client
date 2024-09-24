import DeleteIcon from '@mui/icons-material/Delete';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogTitle,
  Grid,
  IconButton,
  Snackbar,
  TextField,
  Typography,
} from '@mui/material';
import { addHero, getHero } from 'api/hero';
import { common_MediaFull } from 'api/proto-http/frontend';
import { ProductPickerModal } from 'components/common/productPickerModal';
import { SingleMediaViewAndSelect } from 'components/common/singleMediaViewAndSelect';
import { Layout } from 'components/login/layout';
import { calculateAspectRatio } from 'features/utilitty/calculateAspectRatio';
import { isValidUrlForHero as isValidUrl } from 'features/utilitty/isValidUrl';
import { FC, useEffect, useState } from 'react';
import { common_HeroItemInsert, common_Product } from '../../../api/proto-http/admin';
import { HeroProductTable } from './heroProductsTable';

export const Hero: FC = () => {
  const [mainContentLink, setMainContentLink] = useState<string | undefined>('');
  const [mainContentLinkId, setMainContentLinkId] = useState<number | undefined>();
  const [mainExploreLink, setMainExploreLink] = useState<string | undefined>('');
  const [mainExploreLinkError, setMainExploreLinkError] = useState<boolean>(false);
  const [mainExploreText, setMainExploreText] = useState<string | undefined>('');

  const [firstAdContentLink, setFirstAdContentLink] = useState<string | undefined>('');
  const [firstAdContentLinkId, setFirstAdContentLinkId] = useState<number | undefined>();
  const [firstAdExploreLink, setFirstAdExploreLink] = useState<string | undefined>('');
  const [firstAdExploreLinkError, setFirstAdExploreLinkError] = useState<boolean>(false);
  const [firstAdExploreText, setFirstAdExploreText] = useState<string | undefined>('');

  const [secondAdContentLink, setSecondAdContentLink] = useState<string | undefined>('');
  const [secondAdContentLinkId, setSecondAdContentLinkId] = useState<number | undefined>();
  const [secondAdExploreLink, setSecondAdExploreLink] = useState<string | undefined>('');
  const [secondAdExploreLinkError, setSecondAdExploreLinkError] = useState<boolean>(false);
  const [secondAdExploreText, setSecondAdExploreText] = useState<string | undefined>('');

  const [allowedRatios, setAllowedRatios] = useState<string[]>(['4:5', '1:1']);
  const [firstAdAllowedRatios, setFirstAdAllowedRatios] = useState<string[]>([
    '16:9',
    '4:5',
    '1:1',
  ]);
  const [isSecondAdEmpty, setIsSecondAdEmpty] = useState(false);
  const [aspectRatioMismatch, setAspectRatioMismatch] = useState<boolean>(false);
  const [secondAdVisible, setSecondAdVisible] = useState<boolean>(true);
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState<boolean>(false);

  const [products, setProducts] = useState<common_Product[]>([]);

  const [saveSuccess, setSaveSuccess] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const handleOpenProductSelection = () => setIsModalOpen(true);
  const handleCloseModal = () => setIsModalOpen(false);

  useEffect(() => {
    const fetchHero = async () => {
      const response = await getHero({});
      if (response.hero?.ads) {
        const mainAd = response.hero.ads.find((ad) => ad.isMain);
        const otherAds = response.hero.ads.filter((ad) => !ad.isMain);
        const ratio = calculateAspectRatio(
          otherAds[0].media?.media?.thumbnail?.width || 0,
          otherAds[0].media?.media?.thumbnail?.height || 0,
        );

        if (mainAd) {
          setMainContentLink(mainAd.media?.media?.thumbnail?.mediaUrl);
          setMainContentLinkId(mainAd.media?.id);
          setMainExploreLink(mainAd.exploreLink);
          setMainExploreText(mainAd.exploreText);
        } else {
          setMainContentLink(undefined);
          setMainContentLinkId(undefined);
          setMainExploreLink(undefined);
          setMainExploreText(undefined);
        }

        if (otherAds[0]) {
          setFirstAdContentLink(otherAds[0].media?.media?.thumbnail?.mediaUrl);
          setFirstAdContentLinkId(otherAds[0].media?.id);
          setFirstAdExploreLink(otherAds[0].exploreLink);
          setFirstAdExploreText(otherAds[0].exploreText);
          if (ratio === '16:9') {
            setSecondAdVisible(false);
          } else if (ratio === '4:5') {
            setAllowedRatios(['4:5']);
          } else if (ratio === '1:1') {
            setAllowedRatios(['1:1']);
          } else {
            setSecondAdVisible(true);
            setAllowedRatios(['4:5', '1:1']);
          }
        } else {
          setFirstAdContentLink(undefined);
          setFirstAdContentLinkId(undefined);
          setFirstAdExploreLink(undefined);
          setFirstAdExploreText(undefined);
        }

        if (otherAds[1]) {
          setSecondAdContentLink(otherAds[1].media?.media?.thumbnail?.mediaUrl);
          setSecondAdContentLinkId(otherAds[1].media?.id);
          setSecondAdExploreLink(otherAds[1].exploreLink);
          setSecondAdExploreText(otherAds[1].exploreText);
        } else {
          setSecondAdContentLink(undefined);
          setSecondAdContentLinkId(undefined);
          setSecondAdExploreLink(undefined);
          setSecondAdExploreText(undefined);
        }

        if ((ratio === '4:5' || ratio === '1:1') && !secondAdContentLink) {
          setIsSecondAdEmpty(true);
        } else {
          setIsSecondAdEmpty(false);
        }
      }

      setProducts(response.hero?.productsFeatured ? response.hero?.productsFeatured : []);
    };

    fetchHero();
  }, []);

  useEffect(() => {
    const validateAllLinks = () => {
      setMainExploreLinkError(mainContentLink ? !isValidUrl(mainExploreLink) : false);
      setFirstAdExploreLinkError(firstAdContentLink ? !isValidUrl(firstAdExploreLink) : false);
      setSecondAdExploreLinkError(secondAdContentLink ? !isValidUrl(secondAdExploreLink) : false);
    };

    validateAllLinks();
  }, [mainContentLink, firstAdContentLink, secondAdContentLink]);

  const saveMainContentLink = (mediaLink: common_MediaFull[]) => {
    if (mediaLink[0]) {
      setMainContentLink(mediaLink[0].media?.thumbnail?.mediaUrl);
      setMainContentLinkId(mediaLink[0].id);
    } else {
      setMainContentLink(undefined);
      setMainContentLinkId(undefined);
    }
  };

  const saveFirstAdContentLink = (mediaLink: common_MediaFull[]) => {
    if (mediaLink[0]) {
      setFirstAdContentLink(mediaLink[0].media?.thumbnail?.mediaUrl);
      setFirstAdContentLinkId(mediaLink[0].id);
      const ratio = calculateAspectRatio(
        mediaLink[0].media?.thumbnail?.width!,
        mediaLink[0].media?.thumbnail?.height!,
      );
      if (ratio === '16:9') {
        setSecondAdVisible(false);
        setSecondAdContentLink(undefined);
        setIsSecondAdEmpty(false);
      } else if (ratio === '4:5' || ratio === '1:1') {
        setAllowedRatios([ratio]);
        setSecondAdVisible(true);
        if (!secondAdContentLink) {
          setIsSecondAdEmpty(true);
        }
      } else {
        setAllowedRatios(['4:5', '1:1']);
        setSecondAdVisible(true);
        setIsSecondAdEmpty(!secondAdContentLink);
      }
      return;
    }
    setFirstAdContentLink(undefined);
    setFirstAdContentLinkId(undefined);
  };

  const saveSecondAdContentLink = (mediaLink: common_MediaFull[]) => {
    if (mediaLink[0]) {
      setSecondAdContentLink(mediaLink[0].media?.thumbnail?.mediaUrl);
      setSecondAdContentLinkId(mediaLink[0].id);
      setIsSecondAdEmpty(false);
      const ratio = calculateAspectRatio(
        mediaLink[0].media?.thumbnail?.width!,
        mediaLink[0].media?.thumbnail?.height!,
      );
      if (ratio === '4:5' || ratio === '1:1') {
        setFirstAdAllowedRatios([ratio]);
      } else {
        setFirstAdAllowedRatios(['16:9', '4:5', '1:1']);
      }
      return;
    }
    setSecondAdContentLink(undefined);
    setSecondAdContentLinkId(undefined);
  };

  const handleProductsReorder = (newProductsOrder: common_Product[]) => {
    setProducts(newProductsOrder);
  };

  const removeMain = () => {
    setMainContentLink(undefined);
    setMainContentLinkId(undefined);
    setMainExploreLink(undefined);
    setMainExploreText(undefined);
  };

  const removeBothAds = () => {
    setFirstAdContentLink(undefined);
    setFirstAdContentLinkId(undefined);
    setFirstAdExploreLink(undefined);
    setFirstAdExploreText(undefined);
    setSecondAdContentLink(undefined);
    setSecondAdContentLinkId(undefined);
    setSecondAdExploreLink(undefined);
    setSecondAdExploreText(undefined);
    setAllowedRatios(['4:5', '1:1']);
    setFirstAdAllowedRatios(['16:9', '4:5', '1:1']);
    setDeleteConfirmationOpen(false);
    setSecondAdVisible(true);
  };

  const handleAdRemove = () => {
    setDeleteConfirmationOpen(true);
  };

  const updateHero = async () => {
    const ads: common_HeroItemInsert[] = [];

    if (mainContentLink) {
      ads.push({
        mediaId: mainContentLinkId,
        exploreLink: mainExploreLink,
        exploreText: mainExploreText,
        isMain: true,
      });
    }
    if (firstAdContentLink) {
      ads.push({
        mediaId: firstAdContentLinkId,
        exploreLink: firstAdExploreLink,
        exploreText: firstAdExploreText,
        isMain: false,
      });
    }
    if (secondAdContentLink) {
      ads.push({
        mediaId: secondAdContentLinkId,
        exploreLink: secondAdExploreLink,
        exploreText: secondAdExploreText,
        isMain: false,
      });
    }

    const response = await addHero({
      ads: ads.length > 0 ? ads : undefined,
      productIds: products.map((x) => x.id!),
    });

    if (response) {
      setSaveSuccess(true);
    }
  };

  const handleSaveNewSelection = (newSelection: common_Product[]) => {
    setProducts(newSelection);
  };

  const handleSaveClick = () => {
    if (isSecondAdEmpty) {
      setDialogOpen(true);
    } else if (mainExploreLinkError || firstAdExploreLinkError || secondAdExploreLinkError) {
      setDialogOpen(true);
    } else {
      updateHero();
    }
  };

  const handleConfirmSave = () => {
    setDialogOpen(false);
    updateHero();
  };

  return (
    <Layout>
      <Grid container spacing={2} justifyContent='center' padding='2%'>
        <Grid item xs={12} md={8}>
          <Grid container spacing={2} justifyContent='center'>
            <Grid item xs={12}>
              <Box display='flex' gap='15px' alignItems='center'>
                <Typography variant='h4'>Main</Typography>
                {mainContentLink && (
                  <IconButton onClick={removeMain}>
                    <DeleteIcon color='secondary' />
                  </IconButton>
                )}
              </Box>
              <SingleMediaViewAndSelect
                link={mainContentLink}
                aspectRatio={['4:5', '5:4', '1:1', '16:9', '9:16']}
                saveSelectedMedia={saveMainContentLink}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                error={mainExploreLinkError}
                helperText={mainExploreLinkError ? 'Not valid url.' : ''}
                size='small'
                label='Main explore link'
                value={mainExploreLink || ''}
                fullWidth
                onChange={(e) => {
                  const { value } = e.target;
                  setMainExploreLink(value);
                  if (!isValidUrl(value)) {
                    setMainExploreLinkError(true);
                  } else {
                    setMainExploreLinkError(false);
                  }
                }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                size='small'
                label='Main explore text'
                value={mainExploreText || ''}
                onChange={(e) => setMainExploreText(e.target.value)}
                fullWidth
              />
            </Grid>
          </Grid>
        </Grid>
        <Grid item xs={12} md={8}>
          <Grid container justifyContent='center' spacing={2}>
            <Grid item xs={12}>
              <Box display='flex' gap='15px' alignItems='center'>
                <Typography variant='h4'>First Ad</Typography>
                {firstAdContentLink && (
                  <IconButton onClick={handleAdRemove}>
                    <DeleteIcon color='secondary' />
                  </IconButton>
                )}
              </Box>
              <SingleMediaViewAndSelect
                link={firstAdContentLink}
                aspectRatio={firstAdAllowedRatios}
                saveSelectedMedia={saveFirstAdContentLink}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                error={firstAdExploreLinkError}
                helperText={firstAdExploreLinkError ? 'Not valid url.' : ''}
                size='small'
                label='First ad explore link'
                fullWidth
                value={firstAdExploreLink || ''}
                onChange={(e) => {
                  const { value } = e.target;
                  setFirstAdExploreLink(value);
                  if (!isValidUrl(value)) {
                    setFirstAdExploreLinkError(true);
                  } else {
                    setFirstAdExploreLinkError(false);
                  }
                }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                size='small'
                label='First ad explore text'
                value={firstAdExploreText || ''}
                fullWidth
                onChange={(e) => setFirstAdExploreText(e.target.value)}
              />
            </Grid>
          </Grid>
        </Grid>
        <Grid item xs={12} md={8}>
          {secondAdVisible && (
            <Grid container justifyContent='center' spacing={2}>
              <Grid item xs={12}>
                <Box display='flex' alignItems='center' gap='15px'>
                  <Typography variant='h4'>Second Ad</Typography>
                  {secondAdContentLink && (
                    <IconButton onClick={handleAdRemove}>
                      <DeleteIcon color='secondary' />
                    </IconButton>
                  )}
                </Box>
                <SingleMediaViewAndSelect
                  link={secondAdContentLink}
                  aspectRatio={allowedRatios}
                  saveSelectedMedia={saveSecondAdContentLink}
                />
              </Grid>
              <Grid item xs={12}>
                <Box display='flex' alignItems='center' gap='15px'>
                  <TextField
                    error={secondAdExploreLinkError}
                    helperText={secondAdExploreLinkError ? 'Not valid url.' : ''}
                    size='small'
                    label='Second ad explore link'
                    value={secondAdExploreLink || ''}
                    fullWidth
                    onChange={(e) => {
                      const { value } = e.target;
                      setSecondAdExploreLink(value);
                      if (!isValidUrl(value)) {
                        setSecondAdExploreLinkError(true);
                      } else {
                        setSecondAdExploreLinkError(false);
                      }
                    }}
                  />
                </Box>
              </Grid>
              <Grid item xs={12}>
                <TextField
                  size='small'
                  label='Second ad explore text'
                  value={secondAdExploreText || ''}
                  fullWidth
                  onChange={(e) => setSecondAdExploreText(e.target.value)}
                />
              </Grid>
            </Grid>
          )}
        </Grid>
        <Grid item xs={12} md={8}>
          <Grid container spacing={2} justifyContent='center'>
            <Grid item xs={12}>
              <HeroProductTable products={products} onReorder={handleProductsReorder} />
              <Button size='small' variant='contained' onClick={handleOpenProductSelection}>
                Add Products
              </Button>
            </Grid>
            <Grid item xs={2}>
              <Button variant='contained' onClick={handleSaveClick}>
                Save
              </Button>
            </Grid>
          </Grid>
        </Grid>

        <Grid item xs={12}>
          <ProductPickerModal
            open={isModalOpen}
            onClose={handleCloseModal}
            onSave={handleSaveNewSelection}
            selectedProductIds={products.map((x) => x.id!)}
          />
        </Grid>

        <Snackbar
          open={saveSuccess}
          onClose={() => setSaveSuccess(false)}
          autoHideDuration={2000}
          anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
          <Alert severity='success'>Save successful</Alert>
        </Snackbar>
      </Grid>
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        aria-labelledby='alert-dialog-title'
      >
        <DialogTitle id='alert-dialog-title'>
          {isSecondAdEmpty
            ? 'Both ads need to be filled'
            : 'There are errors. Are you sure you want to save?'}
        </DialogTitle>
        <DialogActions>
          {isSecondAdEmpty ? (
            <Button onClick={() => setDialogOpen(false)}>ok</Button>
          ) : (
            <>
              <Button onClick={() => setDialogOpen(false)}>No</Button>
              <Button onClick={handleConfirmSave} disabled={aspectRatioMismatch} autoFocus>
                Yes
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>
      <Dialog
        open={deleteConfirmationOpen}
        onClose={() => setDeleteConfirmationOpen(false)}
        aria-labelledby='delete-confirmation-dialog-title'
      >
        <DialogTitle id='delete-confirmation-dialog-title'>
          {'Deleting this ad will remove both ads. Are you sure you want to proceed?'}
        </DialogTitle>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmationOpen(false)}>Cancel</Button>
          <Button onClick={removeBothAds} color='secondary' autoFocus>
            Confirm
          </Button>
        </DialogActions>
      </Dialog>
    </Layout>
  );
};
