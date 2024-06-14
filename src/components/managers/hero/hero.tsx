import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogTitle,
  Grid,
  Snackbar,
  TextField,
} from '@mui/material';
import { addHero, getHero } from 'api/hero';
import { common_MediaFull } from 'api/proto-http/frontend';
import { ProductPickerModal } from 'components/common/productPickerModal';
import { Layout } from 'components/login/layout';
import { FC, useEffect, useState } from 'react';
import styles from 'styles/hero.scss';
import { common_HeroItemInsert, common_Product } from '../../../api/proto-http/admin'; // common_HeroInsert
import { SingleMediaViewAndSelect } from '../../common/singleMediaViewAndSelect';
import { HeroProductTable } from './heroProductsTable';

export const Hero: FC = () => {
  const [mainContentLink, setMainContentLink] = useState<string | undefined>('');
  const [mainExploreLink, setMainExploreLink] = useState<string | undefined>('');
  const [mainExploreLinkError, setMainExploreLinkError] = useState<boolean>(false);
  const [mainExploreText, setMainExploreText] = useState<string | undefined>('');
  const [firstAdContentLink, setFirstAdContentLink] = useState<string | undefined>('');
  const [firstAdExploreLink, setFirstAdExploreLink] = useState<string | undefined>('');
  const [firstAdExploreLinkError, setFirstAdExploreLinkError] = useState<boolean>(false);
  const [firstAdExploreText, setFirstAdExploreText] = useState<string | undefined>('');
  const [secondAdContentLink, setSecondAdContentLink] = useState<string | undefined>('');
  const [secondAdExploreLink, setSecondAdExploreLink] = useState<string | undefined>('');
  const [secondAdExploreLinkError, setSecondAdExploreLinkError] = useState<boolean>(false);
  const [secondAdExploreText, setSecondAdExploreText] = useState<string | undefined>('');

  const [products, setProducts] = useState<common_Product[]>([]);

  const [saveSuccess, setSaveSuccess] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    const fetchHero = async () => {
      const response = await getHero({});
      setMainExploreLink(response.hero?.main?.exploreLink);
      setMainExploreText(response.hero?.main?.exploreText);

      if (response.hero?.ads) {
        if (response.hero.ads[0]) {
          setFirstAdExploreLink(response.hero?.ads[0].exploreLink);
          setFirstAdExploreText(response.hero?.ads[0].exploreText);
        }
        if (response.hero.ads[1]) {
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
      return;
    }
    setMainContentLink(undefined);
  };

  const saveFirstAdContentLink = (mediaLink: common_MediaFull[]) => {
    if (mediaLink[0]) {
      setFirstAdContentLink(mediaLink[0].media?.thumbnail?.mediaUrl);
      return;
    }
    setFirstAdContentLink(undefined);
  };

  const saveSecondAdContentLink = (mediaLink: common_MediaFull[]) => {
    if (mediaLink[0]) {
      setSecondAdContentLink(mediaLink[0].media?.thumbnail?.mediaUrl);
      return;
    }
    setSecondAdContentLink(undefined);
  };

  const handleProductsReorder = (newProductsOrder: common_Product[]) => {
    setProducts(newProductsOrder);
  };

  const removeFirstAd = () => {
    setFirstAdContentLink(secondAdContentLink);
    setFirstAdExploreLink(secondAdExploreLink);
    setFirstAdExploreText(secondAdExploreText);
    setSecondAdContentLink(undefined);
    setSecondAdExploreLink(undefined);
    setSecondAdExploreText(undefined);
  };

  const removeSecondAd = () => {
    setSecondAdContentLink(undefined);
    setSecondAdExploreLink(undefined);
    setSecondAdExploreText(undefined);
  };

  const updateHero = async () => {
    const ads: common_HeroItemInsert[] = [];
    if (firstAdContentLink !== undefined) {
      ads.push({
        mediaId: 1,
        exploreLink: firstAdExploreLink,
        exploreText: firstAdExploreText,
      });
    }
    if (secondAdContentLink !== undefined) {
      ads.push({
        mediaId: 1,
        exploreLink: secondAdExploreLink,
        exploreText: secondAdExploreText,
      });
    }
    const response = await addHero({
      main: {
        mediaId: 2,
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

  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleOpenProductSelection = () => setIsModalOpen(true);
  const handleCloseModal = () => setIsModalOpen(false);

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
    if (hasError) {
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
      <div className={styles.hero}>
        <Grid container spacing={2} direction='column'>
          <Grid item xs={6}>
            <h2>Main</h2>
          </Grid>
          <Grid item xs={6}>
            <SingleMediaViewAndSelect
              link={mainContentLink}
              saveSelectedMedia={saveMainContentLink}
            />
          </Grid>
          <Grid item xs={6}>
            <TextField
              error={mainExploreLinkError}
              helperText={mainExploreLinkError ? 'Not valid url.' : ''}
              size='small'
              label='Main explore link'
              value={mainExploreLink || ''}
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
          <Grid item xs={6}>
            <TextField
              size='small'
              label='Main explore text'
              value={mainExploreText || ''}
              onChange={(e) => setMainExploreText(e.target.value)}
            />
          </Grid>
          <Grid item xs={6}>
            <h2>First ad</h2>
          </Grid>
          <Grid item xs={6}>
            {firstAdContentLink && (
              <Button variant='contained' onClick={removeFirstAd}>
                Remove
              </Button>
            )}
          </Grid>
          <Grid item xs={6}>
            <SingleMediaViewAndSelect
              link={firstAdContentLink}
              saveSelectedMedia={saveFirstAdContentLink}
            />
          </Grid>
          <Grid item xs={6}>
            <TextField
              error={firstAdExploreLinkError}
              helperText={firstAdExploreLinkError ? 'Not valid url.' : ''}
              size='small'
              label='First ad explore link'
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
          <Grid item xs={6}>
            <TextField
              size='small'
              label='First ad explore text'
              value={firstAdExploreText || ''}
              onChange={(e) => setFirstAdExploreText(e.target.value)}
            />
          </Grid>
          <Grid item xs={6}>
            <h2>Second ad</h2>
          </Grid>
          <Grid item xs={6}>
            {secondAdContentLink && (
              <Button variant='contained' onClick={removeSecondAd}>
                Remove
              </Button>
            )}
          </Grid>
          <Grid item xs={6}>
            <SingleMediaViewAndSelect
              link={secondAdContentLink}
              saveSelectedMedia={saveSecondAdContentLink}
            />
          </Grid>
          <Grid item xs={6}>
            <TextField
              error={secondAdExploreLinkError}
              helperText={secondAdExploreLinkError ? 'Not valid url.' : ''}
              size='small'
              label='Second ad explore link'
              value={secondAdExploreLink || ''}
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
          </Grid>
          <Grid item xs={6}>
            <TextField
              size='small'
              label='Second ad explore text'
              value={secondAdExploreText || ''}
              onChange={(e) => setSecondAdExploreText(e.target.value)}
            />
          </Grid>
          <Grid item xs={6} sx={{ mt: 4 }}>
            <HeroProductTable
              products={products}
              onReorder={handleProductsReorder}
            ></HeroProductTable>
          </Grid>
          <Grid item xs={6}>
            <Button variant='contained' onClick={handleOpenProductSelection}>
              Add Products
            </Button>
          </Grid>
          <ProductPickerModal
            open={isModalOpen}
            onClose={handleCloseModal}
            onSave={handleSaveNewSelection}
            selectedProductIds={products.map((x) => x.id!)}
          />
          <Grid item xs={6} sx={{ mt: 4, textAlign: 'center' }}>
            <Button variant='contained' onClick={handleSaveClick}>
              Save
            </Button>
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
          <Snackbar
            open={saveSuccess}
            onClose={() => setSaveSuccess(false)}
            autoHideDuration={2000}
            anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
          >
            <Alert severity='success'>Save successful</Alert>
          </Snackbar>
        </Grid>
      </div>
    </Layout>
  );
};
