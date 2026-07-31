import { common_MediaFull } from 'api/proto-http/admin';
import { isVideo } from 'lib/features/filterContentType';
import { CopyToClipboard } from 'ui/components/copyToClipboard';
import { GroupLabel } from 'ui/components/group-label';
import { Row } from 'ui/components/row';

const MEDIA_TYPES = ['fullSize', 'compressed', 'thumbnail'] as const;

// Rendered inside the PreviewMedia dialog, which is already the surface — so this
// stays a rule (GroupLabel + Row), not a second bordered box.
export function MediaInfo({ media }: { media: common_MediaFull }) {
  return (
    <div className='flex flex-wrap items-start justify-center gap-x-8 gap-y-4 w-full'>
      {MEDIA_TYPES.map((t) => {
        const info = media.media?.[t];
        const url = info?.mediaUrl;
        const dimensions = `${info?.width || 'N/A'}px x ${info?.height || 'N/A'}px`;
        const mediaType = url ? (isVideo(url) ? 'video' : 'image') : 'N/A';

        if (!url) return null;

        return (
          <div key={t} className='min-w-48'>
            <GroupLabel flush>{t}</GroupLabel>
            <Row label='type' value={mediaType} />
            <Row label='url' value={<CopyToClipboard text={url} cutText={true} />} />
            <Row label='size' value={dimensions} />
          </div>
        );
      })}
    </div>
  );
}
