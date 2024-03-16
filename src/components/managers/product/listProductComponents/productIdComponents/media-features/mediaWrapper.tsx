import { Grid } from '@mui/material';
import { getAllUploadedFiles } from 'api/admin';
import { common_Media } from 'api/proto-http/admin';
import { FC, useEffect, useState } from 'react';
import { ProductIdMediaProps } from '../utility/interfaces';
import { MediaList } from './mediaList/mediaList';
import { Thumbnail } from './thumbnail/thumbnail';

export const MediaWrapper: FC<ProductIdMediaProps> = ({ product, setProduct, id }) => {
  const [media, setMedia] = useState<common_Media[]>([]);
  const [offset, setOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    fetchUploadedFiles();
    const handleScroll = () => {
      if (
        window.innerHeight + window.scrollY + 300 >= document.documentElement.offsetHeight &&
        !isLoading &&
        hasMore
      ) {
        fetchUploadedFiles();
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isLoading, hasMore]);

  const reloadFiles = async () => {
    setIsLoading(true);
    setOffset(0);
    setHasMore(true);
    const response = await getAllUploadedFiles({
      limit: 10,
      offset: 0,
      orderFactor: 'ORDER_FACTOR_ASC',
    });
    const newFiles = response.list || [];
    setMedia(newFiles);
    setOffset(newFiles.length);
    setHasMore(newFiles.length > 0);
    setIsLoading(false);
  };

  const fetchUploadedFiles = async () => {
    if (isLoading || !hasMore) return;
    setIsLoading(true);
    const limit = 5;
    const response = await getAllUploadedFiles({
      limit: limit,
      offset: offset,
      orderFactor: 'ORDER_FACTOR_ASC',
    });
    const newMedias = response.list || [];
    const uniqueNewMedias = newMedias.filter((newMedia) =>
      media?.every((existingFile) => existingFile.media?.fullSize !== newMedia.media?.fullSize),
    );
    setMedia((prevMedia) => [...prevMedia, ...uniqueNewMedias]);
    setOffset((prevOffset) => prevOffset + uniqueNewMedias.length);
    setHasMore(uniqueNewMedias.length === limit);
    setIsLoading(false);
  };

  return (
    <Grid container spacing={4} direction='column'>
      <Grid item xs={4}>
        <Thumbnail
          product={product}
          setProduct={setProduct}
          id={id}
          reload={reloadFiles}
          media={media}
          setMedia={setMedia}
        />
      </Grid>
      <Grid item xs={8}>
        <MediaList product={product} />
      </Grid>
    </Grid>
  );
};
