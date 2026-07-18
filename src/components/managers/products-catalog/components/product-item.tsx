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
import Text from 'ui/components/text';
import {
  CatalogCommerceTags,
  CatalogStateBadge,
  getCatalogStateMediaClass,
} from './state-treatment';

export function ProductItem({
  product,
  refresh,
  selectionMode = false,
  selected = false,
  onToggleSelect,
}: {
  product: common_Colorway;
  refresh: (id: number | undefined) => void;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: number) => void;
}) {
  const thumbnail = product.display?.thumbnail?.media?.thumbnail?.mediaUrl;
  // R6: state now reads off the stored lifecycle status. ACTIVE is left unstyled; every other status
  // gets a distinct badge + media treatment (see state-treatment.tsx) so hidden vs archived vs draft
  // are unmistakable on the grid.
  const isArchived = product.status === 'COLORWAY_LIFECYCLE_STATUS_ARCHIVED';
  const mediaTreatment = getCatalogStateMediaClass(product.status);
  const description = `[${product.id}] ${product.display?.merchandising?.brand} ${product.display?.translations?.[0]?.name}`;
  const { showMessage } = useSnackBarStore();
  const [confirmDelete, setConfirmDelete] = useState<number | undefined>(undefined);
  const [restoring, setRestoring] = useState(false);
  const navigate = useNavigate();
  const canEdit = usePermissions().canWrite(SECTION.products);

  async function handleRestore(id: number | undefined, e: React.MouseEvent) {
    e.stopPropagation();
    if (id == null || restoring) return;
    setRestoring(true);
    try {
      // #60: restore a retired colourway back into the manageable set. TransitionColorwayStatus →
      // HIDDEN un-archives it (kept off the storefront until it is explicitly unhidden/published).
      await adminService.TransitionColorwayStatus({
        colorwayId: id,
        expectedVersion: product.lockVersion ?? 0,
        target: 'COLORWAY_LIFECYCLE_STATUS_HIDDEN',
      });
      showMessage('PRODUCT RESTORED — NOW HIDDEN', 'success');
      refresh(id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to restore product';
      showMessage(msg, 'error');
    } finally {
      setRestoring(false);
    }
  }

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

  // Selection mode never hijacks the open-editor click: the card click still navigates, and selection
  // is driven only by the explicit checkbox affordance below.
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

  const handleToggleSelect = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (product.id != null) onToggleSelect?.(product.id);
  };

  return (
    <div className='space-y-1 cursor-pointer' onClick={() => handleProductClick(product.id)}>
      <div className='relative w-full h-full group'>
        <div
          className={cn(
            'transition-opacity duration-200 motion-reduce:transition-none',
            mediaTreatment,
          )}
        >
          <Media
            src={thumbnail || ''}
            alt='prod item'
            type={isVideo(thumbnail) ? 'video' : 'image'}
            controls={isVideo(thumbnail)}
          />
        </div>

        {/* Primary state marker — top-left. */}
        <span className='absolute top-1 left-1 z-30'>
          <CatalogStateBadge status={product.status} />
        </span>

        {/* Secondary commerce markers — bottom-right, subordinate to the state badge. */}
        <span className='absolute bottom-1 right-1 z-30 flex flex-wrap items-center justify-end gap-1'>
          <CatalogCommerceTags product={product} />
        </span>

        {/* Selection checkbox — top-right, only in selection mode (explicit affordance). */}
        {selectionMode && (
          <button
            type='button'
            aria-pressed={selected}
            aria-label={selected ? 'deselect product' : 'select product'}
            onClick={handleToggleSelect}
            className='absolute top-0 right-0 z-40 p-1.5 cursor-pointer'
          >
            <span
              className={cn(
                'flex h-5 w-5 items-center justify-center border border-textColor',
                selected ? 'bg-textColor text-bgColor' : 'bg-bgColor text-textColor',
              )}
            >
              {selected && <CheckIcon />}
            </span>
          </button>
        )}

        {/* Per-card actions are hidden in selection mode to avoid competing affordances. */}
        {!selectionMode && canEdit && !isArchived && (
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
        {!selectionMode && canEdit && !isArchived && (
          <Button
            size='lg'
            className='absolute bottom-0 left-0 z-30'
            variant='main'
            onClick={(e: React.MouseEvent) => handleCopyProduct(product.id, e)}
          >
            copy
          </Button>
        )}
        {/* #60: an archived colourway is read-only, but can be restored (→ hidden) from here. */}
        {!selectionMode && canEdit && isArchived && (
          <Button
            size='lg'
            className='absolute bottom-0 left-0 z-30'
            variant='main'
            disabled={restoring}
            onClick={(e: React.MouseEvent) => handleRestore(product.id, e)}
          >
            {restoring ? 'restoring…' : 'restore'}
          </Button>
        )}

        {/* Selected frame. */}
        {selected && (
          <div
            className='pointer-events-none absolute inset-0 z-30 border-2 border-textColor'
            aria-hidden
          />
        )}
      </div>
      <Text className='w-full break-words' variant='underLineWithColor'>
        {description}
      </Text>
    </div>
  );
}
