import { CheckIcon } from '@radix-ui/react-icons';
import { adminService } from 'api/api';
import { common_Colorway } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { ROUTES, SECTION } from 'constants/routes';
import { isVideo } from 'lib/features/filterContentType';
import { useSnackBarStore } from 'lib/stores/store';
import { cn } from 'lib/utility';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Media from 'ui/components/media';
import { Overlay } from 'ui/components/overlay';
import Text from 'ui/components/text';
import { StatusBadge } from 'components/managers/product/components/lifecycle-controls';

export function ProductItem({
  product,
  refresh,
}: {
  product: common_Colorway;
  refresh: (id: number | undefined) => void;
}) {
  const thumbnail = product.display?.thumbnail?.media?.thumbnail?.mediaUrl;
  // R6: dim/badge anything not live on the storefront (draft/hidden/archived), driven by the stored
  // lifecycle status rather than the vestigial `hidden` flag.
  const isActive = product.status === 'COLORWAY_LIFECYCLE_STATUS_ACTIVE';
  const description = `[${product.id}] ${product.display?.merchandising?.brand} ${product.display?.translations?.[0]?.name}`;
  const { showMessage } = useSnackBarStore();
  const [confirmDelete, setConfirmDelete] = useState<number | undefined>(undefined);
  const navigate = useNavigate();
  const canEdit = usePermissions().canWrite(SECTION.products);

  async function handleDeleteItem(id: number | undefined, e: React.MouseEvent) {
    e.stopPropagation();
    if (confirmDelete === id) {
      try {
        // R6: archive-not-delete. Terminal transition guarded by the colourway's optimistic lock.
        await adminService.ArchiveColorwayByID({
          colorwayId: id,
          expectedVersion: product.lockVersion ?? 0,
        });
        showMessage('PRODUCT WAS SUCCESSFULLY ARCHIVED', 'success');
        setConfirmDelete(undefined);
        refresh(id);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to archive product';
        showMessage(msg, 'error');
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
    <div className='space-y-1 cursor-pointer' onClick={() => handleProductClick(product.id)}>
      <div className='relative w-full h-full group'>
        <Media
          src={thumbnail || ''}
          alt='prod item'
          type={isVideo(thumbnail) ? 'video' : 'image'}
          controls={isVideo(thumbnail)}
        />
        {!isActive && (
          <span className='absolute top-1 left-1 z-30'>
            <StatusBadge status={product.status} />
          </span>
        )}
        {canEdit && (
          <Button
            onClick={(e: React.MouseEvent) => handleDeleteItem(product.id, e)}
            className={cn(
              'absolute top-1 right-1 z-30 border border-textInactiveColor bg-bgColor px-1 leading-none block md:hidden md:group-hover:block',
              { '!block !bg-textColor !text-bgColor': confirmDelete === product.id },
            )}
          >
            {confirmDelete === product.id ? <CheckIcon /> : '[x]'}
          </Button>
        )}
        {canEdit && (
          <Button
            size='lg'
            className='absolute bottom-0 left-0 z-30'
            variant='main'
            onClick={(e: React.MouseEvent) => handleCopyProduct(product.id, e)}
          >
            copy
          </Button>
        )}
        {!isActive && <Overlay cover='container' />}
      </div>
      <Text className='w-full break-words' variant='underLineWithColor'>
        {description}
      </Text>
    </div>
  );
}
