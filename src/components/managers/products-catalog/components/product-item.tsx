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
import { Tile } from 'ui/components/tiles';
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

  const handleToggleSelect = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (product.id != null) onToggleSelect?.(product.id);
  };

  return (
    // Same card as the tech-cards list: the Tile primitive carries the border, the fill and the
    // bold name; state pills ride on the thumbnail; every control sits OUTSIDE the Tile, which is
    // itself a <button>. Media keeps its native 4/5 catalogue ratio rather than the tech card's
    // 3/4 â the tiles match in construction, not in crop.
    <div className='relative'>
      <Tile
        media={
          <div className='relative'>
            <div
              className={cn(
                'transition-opacity duration-200 motion-reduce:transition-none',
                mediaTreatment,
              )}
            >
              <Media
                src={thumbnail || ''}
                alt=''
                type={isVideo(thumbnail) ? 'video' : 'image'}
                controls={isVideo(thumbnail)}
              />
            </div>
            <span className='absolute top-1 left-1 z-10'>
              <CatalogStateBadge status={product.status} />
            </span>
            <span className='absolute right-1 bottom-1 z-10 flex flex-wrap items-center justify-end gap-1'>
              <CatalogCommerceTags product={product} />
            </span>
          </div>
        }
        name={description}
        selected={selected}
        onClick={() => handleProductClick(product.id)}
        className='h-full w-full'
      />

      {/* Selection checkbox â explicit affordance, never the card click. */}
      {selectionMode && (
        <button
          type='button'
          aria-pressed={selected}
          aria-label={selected ? 'deselect product' : 'select product'}
          onClick={handleToggleSelect}
          className='absolute top-1 right-1 z-40 cursor-pointer'
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
        <div className='absolute top-1 right-1 z-30'>
          <Button
            type='button'
            size='xs'
            variant='secondary'
            aria-label='archive product'
            className={cn('bg-bgColor', {
              '!bg-textColor !text-bgColor': confirmDelete === product.id,
            })}
            onClick={(e: React.MouseEvent) => handleDeleteItem(product.id, e)}
          >
            {confirmDelete === product.id ? <CheckIcon /> : '[x]'}
          </Button>
        </div>
      )}

      {/* #60: an archived colourway is read-only, but can be restored (→ hidden) from here. */}
      {!selectionMode && canEdit && isArchived && (
        <div className='absolute top-1 right-1 z-30'>
          <Button
            type='button'
            size='xs'
            variant='main'
            disabled={restoring}
            onClick={(e: React.MouseEvent) => handleRestore(product.id, e)}
          >
            {restoring ? 'restoring…' : 'restore'}
          </Button>
        </div>
      )}
    </div>
  );
}
