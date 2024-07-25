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
import { FC, useEffect, useState } from 'react';
import { common_HeroItemInsert, common_Product } from '../../../api/proto-http/admin'; // common_HeroInsert
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

  const [products, setProducts] = useState<common_Product[]>([]);

  const [saveSuccess, setSaveSuccess] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleOpenProductSelection = () => setIsModalOpen(true);
  const handleCloseModal = () => setIsModalOpen(false);

  useEffect(() => {
    const fetchHero = async () => {
      const response = await getHero({});
      setMainContentLink(response.hero?.main?.media?.media?.thumbnail?.mediaUrl);
      setMainContentLinkId(response.hero?.main?.media?.id);
      setMainExploreLink(response.hero?.main?.exploreLink);
      setMainExploreText(response.hero?.main?.exploreText);

      if (response.hero?.ads) {
        if (response.hero.ads[0]) {
          setFirstAdContentLink(response.hero.ads[0].media?.media?.thumbnail?.mediaUrl);
          setFirstAdContentLinkId(response.hero.ads[0].media?.id);
          setFirstAdExploreLink(response.hero?.ads[0].exploreLink);
          setFirstAdExploreText(response.hero?.ads[0].exploreText);
        }
        if (response.hero.ads[1]) {
          setSecondAdContentLink(response.hero.ads[1].media?.media?.thumbnail?.mediaUrl);
          setSecondAdContentLinkId(response.hero.ads[1].media?.id);
          setSecondAdExploreLink(response.hero?.ads[1].exploreLink);
          setSecondAdExploreText(response.hero?.ads[1].exploreText);
        }
      }

      setProducts(response.hero?.productsFeatured ? response.hero?.productsFeatured : []);
    };
    fetchHero();
  }, []);

  useEffect(() => {
    // Function to validate all links
    const validateAllLinks = () => {
      // Assuming you have state setters like setMainExploreLinkError for validation states
      setMainExploreLinkError(mainContentLink ? !isValidUrl(mainExploreLink) : false);
      setFirstAdExploreLinkError(firstAdContentLink ? !isValidUrl(firstAdExploreLink) : false);
      setSecondAdExploreLinkError(secondAdContentLink ? !isValidUrl(secondAdExploreLink) : false);
    };

    validateAllLinks();
  }, [mainContentLink, firstAdContentLink, secondAdContentLink]);

  const hasError = mainExploreLinkError || firstAdExploreLinkError || secondAdExploreLinkError;

  const saveMainContentLink = (mediaLink: common_MediaFull[]) => {
    if (mediaLink[0]) {
      setMainContentLink(mediaLink[0].media?.thumbnail?.mediaUrl);
      setMainContentLinkId(mediaLink[0].id);
    }
    setMainContentLink(undefined);
    setMainContentLinkId(undefined);
  };

  const saveFirstAdContentLink = (mediaLink: common_MediaFull[]) => {
    if (mediaLink[0]) {
      setFirstAdContentLink(mediaLink[0].media?.thumbnail?.mediaUrl);
      setFirstAdContentLinkId(mediaLink[0].id);
      return;
    }
    setFirstAdContentLink(undefined);
    setFirstAdContentLinkId(undefined);
  };

  const saveSecondAdContentLink = (mediaLink: common_MediaFull[]) => {
    if (mediaLink[0]) {
      setSecondAdContentLink(mediaLink[0].media?.thumbnail?.mediaUrl);
      setSecondAdContentLinkId(mediaLink[0].id);
      return;
    }
    setSecondAdContentLink(undefined);
    setSecondAdContentLinkId(undefined);
  };

  const handleProductsReorder = (newProductsOrder: common_Product[]) => {
    setProducts(newProductsOrder);
  };

  const removeFirstAd = () => {
    setFirstAdContentLink(secondAdContentLink);
    setFirstAdContentLinkId(secondAdContentLinkId);
    setFirstAdExploreLink(secondAdExploreLink);
    setFirstAdExploreText(secondAdExploreText);
    setSecondAdContentLink(undefined);
    setSecondAdContentLinkId(undefined);
    setSecondAdExploreLink(undefined);
    setSecondAdExploreText(undefined);
  };

  const removeSecondAd = () => {
    setSecondAdContentLink(undefined);
    setSecondAdContentLinkId(undefined);
    setSecondAdExploreLink(undefined);
    setSecondAdExploreText(undefined);
  };

  const updateHero = async () => {
    const ads: common_HeroItemInsert[] = [];
    if (firstAdContentLink !== undefined) {
      ads.push({
        mediaId: firstAdContentLinkId,
        exploreLink: firstAdExploreLink,
        exploreText: firstAdExploreText,
      });
    }
    if (secondAdContentLink !== undefined) {
      ads.push({
        mediaId: secondAdContentLinkId,
        exploreLink: secondAdExploreLink,
        exploreText: secondAdExploreText,
      });
    }
    const response = await addHero({
      main: {
        mediaId: mainContentLinkId,
        exploreLink: mainExploreLink,
        exploreText: mainExploreText,
      },
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

  const isValidUrl = (url: string | undefined) => {
    if (url === undefined) {
      return false;
    }
    const pattern = new RegExp('https?://(?:[w-]+.)?grbpwr.com(?:/[^s]*)?'); // fragment locator
    return !!pattern.test(url);
  };

  const handleSaveClick = () => {
    if (mainExploreLinkError || firstAdExploreLinkError || secondAdExploreLinkError) {
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
              <Typography variant='h4'>Main</Typography>
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
                  <IconButton onClick={removeFirstAd}>
                    <DeleteIcon color='secondary' />
                  </IconButton>
                )}
              </Box>
              <SingleMediaViewAndSelect
                link={firstAdContentLink}
                aspectRatio={['4:5']}
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
          <Grid container justifyContent='center' spacing={2}>
            <Grid item xs={12}>
              <Box display='flex' alignItems='center' gap='15px'>
                <Typography variant='h4'>Second Ad</Typography>
                {secondAdContentLink && (
                  <IconButton onClick={removeSecondAd}>
                    <DeleteIcon color='secondary' />
                  </IconButton>
                )}
              </Box>
              <SingleMediaViewAndSelect
                link={secondAdContentLink}
                aspectRatio={['4:5']}
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
          {'There are errors. Are you sure you want to save?'}
        </DialogTitle>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>No</Button>
          <Button onClick={handleConfirmSave} autoFocus>
            Yes
          </Button>
        </DialogActions>
      </Dialog>
    </Layout>
  );
};
