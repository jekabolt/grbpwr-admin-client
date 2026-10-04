import type { GetDesignBandResponse } from 'api/proto-http/admin';
import { useMemo, type JSX } from 'react';
import { Button } from 'ui/components/button';
import { GroupLabel } from 'ui/components/group-label';
import Text from 'ui/components/text';

import { GROUP_GAP } from '../core';
import { assetLabel, assetThumb } from '../assets/model';
import type { ClothSlot } from '../pattern/slot-fabrics';
import { PictureTile } from '../picture-tile';
import { boundClothsOf } from './drafts';

/**
 * V5 · FABRIC RENDER's recipe is the colourway's pack from MATERIALS: one read-only 72px tile per
 * bound cloth (slot order), cap = its slot name, and one door back to MATERIALS.
 */
export function MaterialsPack({
  band,
  colorwayId,
  colorwayLabel,
  slots,
  onEdit,
}: {
  band: GetDesignBandResponse;
  colorwayId: number;
  colorwayLabel: string;
  slots?: readonly ClothSlot[];
  onEdit?: () => void;
}): JSX.Element {
  const cloths = useMemo(() => {
    const byId = new Map((band.assets ?? []).map((a) => [a.id ?? 0, a]));
    return boundClothsOf(band, colorwayId, slots).flatMap((c) => {
      const asset = byId.get(c.assetId);
      return asset ? [{ ...c, asset }] : [];
    });
  }, [band, colorwayId, slots]);

  const door = onEdit ? (
    <Button
      variant='underline'
      size='xs'
      className='text-labelColor hover:text-textColor'
      onClick={onEdit}
      data-materials-door=''
    >
      {cloths.length > 0 ? 'edit in materials ›' : 'materials ›'}
    </Button>
  ) : undefined;

  return (
    <div data-materials-pack={cloths.length}>
      <GroupLabel flush className={GROUP_GAP} action={cloths.length > 0 ? door : undefined}>
        materials
      </GroupLabel>
      {cloths.length === 0 ? (
        <div className='flex flex-wrap items-center gap-2'>
          <Text size='micro' variant='label' component='span' className='normal-case'>
            no cloth marked for {colorwayLabel || 'this colourway'}
          </Text>
          {door}
        </div>
      ) : (
        <div className='flex flex-wrap items-start gap-2'>
          {cloths.map((c) => (
            <div key={c.assetId} className='flex w-[72px] shrink-0 flex-col gap-1'>
              <PictureTile
                url={assetThumb(c.asset)}
                alt={assetLabel(c.asset)}
                aspect='1/1'
                fit='cover'
                className='w-full'
              />
              <Text
                size='micro'
                variant='label'
                tracking='label'
                component='span'
                className='w-full truncate uppercase'
                title={[c.slotNames.join(', '), (c.asset.note ?? '').trim()]
                  .filter(Boolean)
                  .join(' · ')}
              >
                {c.slotNames.join(', ')}
              </Text>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
