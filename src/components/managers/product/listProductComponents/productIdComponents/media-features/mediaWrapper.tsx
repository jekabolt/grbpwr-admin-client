import { Grid } from '@mui/material';
import { addMediaByID } from 'api/admin';
import { updateThumbnail } from 'api/byID';
import { FC, useEffect, useState } from 'react';
import useMedia from '../utility/customHook';
import { MediaWrapperProps } from '../utility/interfaces';
import { MediaList } from './mediaList/mediaList';
import { Thumbnail } from './thumbnail/thumbnail';

export const MediaWrapper: FC<MediaWrapperProps> = ({ product, setProduct, id, fetchProduct }) => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedMediaProduct, setSelectedMediaProduct] = useState<string[]>([]);
  const [mediaNumber, setMediaNumber] = useState<number[]>([]);
  const [url, setUrl] = useState<string>('');
  const { media, reload, isLoading, hasMore, fetchFiles, setMedia } = useMedia();

  const selectMedia = (imageUrl: string | number | undefined) => {
    if (typeof imageUrl === 'string') {
      if (selectedMediaProduct?.includes(imageUrl)) {
        setSelectedMediaProduct((prevSelectedImage) =>
          prevSelectedImage?.filter((image) => image !== imageUrl),
        );
      } else {
        setSelectedMediaProduct([...(selectedMediaProduct || []), imageUrl]);
      }
    } else if (typeof imageUrl === 'number') {
      if (mediaNumber.includes(imageUrl)) {
        setMediaNumber((prevMediaNumber) =>
          prevMediaNumber.filter((imageIndex) => imageIndex !== imageUrl),
        );
      } else {
        setMediaNumber([...mediaNumber, imageUrl]);
      }
    }
  };

  const handleAddMedia = async () => {
    if (selectedMediaProduct.length === 0) {
      console.warn('No images selected.');
      return;
    }

    for (const imageUrl of selectedMediaProduct) {
      const compressedUrl = imageUrl.replace(/-og\.jpg$/, '-compressed.jpg');
      const response = await addMediaByID({
        productId: Number(id),
        fullSize: imageUrl,
        thumbnail: imageUrl,
        compressed: compressedUrl,
      });
    }
    fetchProduct();
  };

  const updateNewMedia = async () => {
    const compressedUrl = url.replace(/-og\.jpg$/, '-compressed.jpg');
    await addMediaByID({
      productId: Number(id),
      fullSize: url,
      thumbnail: url,
      compressed: compressedUrl,
    });
    fetchProduct();
  };

  const updateNewThumbnail = async () => {
    await updateThumbnail({
      productId: Number(id),
      thumbnail: url,
    });
    if (product && product.product && product.product.productInsert) {
      const updatedProductInsert = {
        ...product.product.productInsert,
        thumbnail: url,
      };
      const updatedProduct = {
        ...product.product,
        productInsert: updatedProductInsert,
      };

      setProduct?.({ ...product, product: updatedProduct });
    }
  };

  const selectThumbnail = (imageUrl: string | null) => {
    setSelectedImage((prevSelectedImage) => (prevSelectedImage === imageUrl ? null : imageUrl));
  };

  const handleThumbnail = async () => {
    if (!product?.product) {
      return;
    }

    if (!selectedImage) {
      return;
    }

    await updateThumbnail({
      productId: Number(id),
      thumbnail: selectedImage,
    });

    if (product && product.product && product.product.productInsert) {
      const updatedProductInsert = {
        ...product.product.productInsert,
        thumbnail: selectedImage,
      };
      const updatedProduct = {
        ...product.product,
        productInsert: updatedProductInsert,
      };

      setProduct?.({ ...product, product: updatedProduct });
    }
  };

  useEffect(() => {
    const handleScroll = () => {
      if (
        window.innerHeight + window.scrollY + 300 >= document.documentElement.offsetHeight &&
        !isLoading &&
        hasMore
      ) {
        fetchFiles(5, media.length);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isLoading, hasMore, media.length, fetchFiles]);

  useEffect(() => {
    fetchFiles(5, 0);
  }, [fetchFiles]);

  return (
    <Grid container spacing={4} direction='column'>
      <Grid item xs={4}>
        <Thumbnail
          product={product}
          reload={reload}
          media={media}
          setMedia={setMedia}
          select={selectThumbnail}
          handleImage={handleThumbnail}
          selectedThumbnail={selectedImage}
          url={url}
          setUrl={setUrl}
          updateNewMediaByUrl={updateNewThumbnail}
        />
      </Grid>
      <Grid item xs={8}>
        <MediaList
          product={product}
          setProduct={setProduct}
          fetchProduct={fetchProduct}
          reload={reload}
          media={media}
          setMedia={setMedia}
          select={selectMedia}
          handleImage={handleAddMedia}
          selectedMedia={selectedMediaProduct}
          url={url}
          setUrl={setUrl}
          updateNewMediaByUrl={updateNewMedia}
        />
      </Grid>
    </Grid>
  );
};
