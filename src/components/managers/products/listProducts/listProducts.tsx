import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import { ROUTES } from 'constants/routes';
import { isVideo } from 'lib/features/filterContentType';
import { useProductStore } from 'lib/stores/product/store';
import { useSnackBarStore } from 'lib/stores/store';
import { FC, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Media from 'ui/components/media';
import Text from 'ui/components/text';

export const ListProducts: FC = () => {
  const { showMessage } = useSnackBarStore();
  const { products, deleteProduct } = useProductStore();
  const navigate = useNavigate();
  const [confirmDeleteProductId, setConfirmDeleteProductId] = useState<number | undefined>(
    undefined,
  );

  async function handleDeleteProduct(id: number | undefined, e: React.MouseEvent) {
    e.stopPropagation();
    if (confirmDeleteProductId === id) {
      const { success } = await deleteProduct(id);
      if (success) {
        showMessage('PRODUCT WAS SUCCESSFULLY DELETED', 'success');
        setConfirmDeleteProductId(undefined);
      }
    } else {
      setConfirmDeleteProductId(id);
    }
  }

  const handleProductClick = (id: number | undefined) => {
    navigate(`${ROUTES.product}/${id}`, { replace: true });
  };

  const handleCopyProductClick = (id: number | undefined) => {
    navigate(`${ROUTES.copyProduct}/${id}`);
  };

  return (
    <div className='grid grid-cols-2 lg:grid-cols-4 gap-2 items-start'>
      {products?.map((product) => (
        <div className='space-y-1' key={product.id} onClick={() => handleProductClick(product.id)}>
          <div className='relative w-full h-full group'>
            <Media
              src={product.productDisplay?.thumbnail?.media?.thumbnail?.mediaUrl || ''}
              alt='prod item'
              type={
                isVideo(product.productDisplay?.thumbnail?.media?.thumbnail?.mediaUrl)
                  ? 'video'
                  : 'image'
              }
              controls={isVideo(product.productDisplay?.thumbnail?.media?.thumbnail?.mediaUrl)}
            />
            <Button
              className='absolute top-0 right-0 hidden group-hover:block'
              onClick={(e: React.MouseEvent) => handleDeleteProduct(product.id, e)}
            >
              {confirmDeleteProductId === product.id ? <CheckIcon /> : <CloseIcon />}
            </Button>
            <Button
              className='absolute bottom-0 left-0'
              size='lg'
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                handleCopyProductClick(product.id);
              }}
            >
              copy
            </Button>
          </div>
          <Text
            variant='underLineWithColor'
            size='small'
          >{`[${product.id}] ${product.productDisplay?.productBody?.brand} ${product.productDisplay?.productBody?.name}`}</Text>
        </div>
      ))}
    </div>
  );
};
