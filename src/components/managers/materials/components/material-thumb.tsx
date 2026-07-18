import { common_Material, common_MediaFull } from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import Media from 'ui/components/media';
import Text from 'ui/components/text';

// Catalog image (#39): resolves the display URL for a single MediaFull the same way everywhere —
// thumbnail first (cropped/optimized), full-size as a fallback for an item that has none.
export const mediaThumbUrl = (m?: common_MediaFull): string | undefined =>
  m?.media?.thumbnail?.mediaUrl || m?.media?.fullSize?.mediaUrl || undefined;

export const materialImageUrl = (m?: common_Material): string | undefined =>
  mediaThumbUrl(m?.image);

// A small square swatch used wherever a material is listed (catalog cards, stock rows, the BOM
// material picker). Falls back to a plain placeholder box so a material with no photo yet reads
// as "no image" instead of a broken <img> or an empty gap.
export function MaterialThumb({
  material,
  size = 'md',
  className,
}: {
  material?: common_Material;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const url = materialImageUrl(material);
  const dim = size === 'sm' ? 'h-8 w-8' : 'h-12 w-12';
  return (
    <div
      className={cn(
        dim,
        'shrink-0 overflow-hidden border border-textInactiveColor bg-bgColor',
        className,
      )}
    >
      {url ? (
        <Media src={url} alt={material?.name || 'material'} aspectRatio='1/1' fit='cover' />
      ) : (
        <div className='flex h-full w-full items-center justify-center'>
          <Text variant='inactive' size='small'>
            —
          </Text>
        </div>
      )}
    </div>
  );
}
