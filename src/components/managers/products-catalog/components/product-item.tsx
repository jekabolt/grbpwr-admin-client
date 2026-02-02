import { CheckIcon, Cross1Icon } from '@radix-ui/react-icons';
import { adminService } from 'api/api';
import { common_Product } from 'api/proto-http/admin';
import { ROUTES } from 'constants/routes';
import { isVideo } from 'lib/features/filterContentType';
import { useSnackBarStore } from 'lib/stores/store';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Media from 'ui/components/media';
import { Overlay } from 'ui/components/overlay';
import Text from 'ui/components/text';

export function ProductItem({
  product,
  refresh,
}: {
  product: common_Product;
  refresh: (id: number | undefined) => void;
}) {
  const thumbnail = product.productDisplay?.thumbnail?.media?.thumbnail?.mediaUrl;
  const isHidden = product.productDisplay?.productBody?.productBodyInsert?.hidden;
  const description = `[${product.id}] ${product.productDisplay?.productBody?.productBodyInsert?.brand} ${product.productDisplay?.productBody?.translations?.[0]?.name}`;
  const { showMessage } = useSnackBarStore();
  const [confirmDelete, setConfirmDelete] = useState<number | undefined>(undefined);
  const navigate = useNavigate();

  async function handleDeleteItem(id: number | undefined, e: React.MouseEvent) {
    e.stopPropagation();
    if (confirmDelete === id) {
      const response = await adminService.DeleteProductByID({ id });
      if (response) {
        showMessage('PRODUCT WAS SUCCESSFULLY DELETED', 'success');
        setConfirmDelete(undefined);
        refresh(id);
      }
    } else {
      setConfirmDelete(id);
    }
  }

  const handleProductClick = (id: number | undefined) => {
    navigate(`${ROUTES.product}/${id}`, { replace: true });
  };

  const handleCopyProduct = (id: number | undefined, e: React.MouseEvent) => {
    e.stopPropagation();
    const confirmed = confirm('Are you sure you want to copy this product?');
    if (confirmed) {
      navigate(`${ROUTES.copyProduct}/${id}`);
    }
  };

  return (
    <div className='space-y-1' onClick={() => handleProductClick(product.id)}>
      <div className='relative w-full h-full group'>
        <Media
          src={thumbnail || ''}
          alt='prod item'
          type={isVideo(thumbnail) ? 'video' : 'image'}
          controls={isVideo(thumbnail)}
        />
        <Button
          onClick={(e: React.MouseEvent) => handleDeleteItem(product.id, e)}
          className='absolute top-0 right-0 p-1 md:group-hover:block md:hidden block'
        >
          {confirmDelete === product.id ? <CheckIcon /> : <Cross1Icon />}
        </Button>
        <Button
          size='lg'
          className='absolute bottom-0 left-0'
          onClick={(e: React.MouseEvent) => handleCopyProduct(product.id, e)}
        >
          copy
        </Button>
        {isHidden && <Overlay cover='container' />}
      </div>
      <Text className='w-full break-words' variant='underLineWithColor' size='small'>
        {description}
      </Text>
    </div>
  );
}
