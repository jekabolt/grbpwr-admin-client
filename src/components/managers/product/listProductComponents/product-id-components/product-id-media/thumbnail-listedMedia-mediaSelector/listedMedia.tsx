import { deleteMediaById } from 'api/byID';
import { common_ProductFull } from 'api/proto-http/admin';
import { FC } from 'react';
import { ThumbnailProps } from '../../interfaces/thumbnailInterface';

export const ListedMedia: FC<ThumbnailProps> = ({ product, setProduct }) => {
  const handleDeleteMedia = async (id: number | undefined) => {
    await deleteMediaById({ productMediaId: id });
    const updatedMedia = product?.media?.filter((media) => media.id !== id);
    if (product) {
      const updatedProduct = {
        ...product,
        media: updatedMedia,
      } as common_ProductFull;
      setProduct(updatedProduct);
    }
  };

  return (
    <ul>
      {product?.media?.map((media) => (
        <li key={media.id}>
          <img src={media.productMediaInsert?.fullSize} alt='media' />
          <button type='button' onClick={() => handleDeleteMedia(media.id)}>
            x
          </button>
        </li>
      ))}
    </ul>
  );
};
