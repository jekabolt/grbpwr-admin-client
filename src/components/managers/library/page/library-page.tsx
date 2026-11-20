import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { FileCardModal } from 'components/managers/files/components/file-card-modal';
import { isProjectTopic, useFileTopics } from 'components/managers/files/hooks/useFiles';
import FilesPage from 'components/managers/files/page';
import {
  MediaViewer,
  mediaFullListToViewerItems,
  useMediaViewer,
} from 'components/shared/media-viewer/media-viewer';
import { ROUTES, SECTION } from 'constants/routes';
import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Text } from 'ui';
import type { LibraryItem, LibraryRef } from '../api/types';
import { LibraryBrowser } from '../browser/library-browser';

/**
 * `/files`: the one library. Photos, videos and documents in one grid with folders and server
 * filters. A picture opens the viewer; a document opens its card at `/files/:id`. A project
 * (`?project=`) is still the files section's own board, so it renders that page unchanged.
 */
export default function LibraryPage() {
  const [params] = useSearchParams();
  if (params.get('project')) return <FilesPage />;
  return <Library />;
}

function Library() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { id } = useParams<{ id: string }>();
  const { canRead, canWrite } = usePermissions();
  const readable = canRead(SECTION.files) || canRead(SECTION.media);
  const [selected, setSelected] = useState<LibraryRef[]>([]);
  const [items, setItems] = useState<LibraryItem[]>([]);
  const viewer = useMediaViewer();
  const media = useMemo(() => items.flatMap((i) => (i.media ? [i.media] : [])), [items]);
  const viewerItems = useMemo(() => mediaFullListToViewerItems(media), [media]);
  const allTopics = useFileTopics(false, !!id).data?.topics ?? [];
  const topics = allTopics.filter((t) => !isProjectTopic(t));
  const projects = allTopics.filter(isProjectTopic);

  const onSelectionChange = useCallback((refs: LibraryRef[]) => setSelected(refs), []);
  const onOpen = (item: LibraryItem) => {
    if (item.media) {
      const at = viewerItems.findIndex((v) => v.meta?.id === item.media?.id);
      if (at >= 0) viewer.openAt(at);
      return;
    }
    if (item.ref?.id) {
      navigate({ pathname: `${ROUTES.files}/${item.ref.id}`, search: params.toString() });
    }
  };
  const closeCard = () =>
    navigate({ pathname: ROUTES.files, search: params.toString() }, { replace: true });

  if (!readable) return <Text variant='label'>no access</Text>;

  return (
    <>
      <LibraryBrowser
        mode='page'
        accept='any'
        multiple
        filterInUrl
        selected={selected}
        onSelectionChange={onSelectionChange}
        onOpen={onOpen}
        onItemsChange={setItems}
      />
      <MediaViewer
        items={viewerItems}
        index={viewer.index}
        open={viewer.open}
        onOpenChange={viewer.onOpenChange}
        onIndexChange={viewer.onIndexChange}
      />
      {id && (
        <FileCardModal
          id={Number(id)}
          topics={topics}
          projects={projects}
          writable={canWrite(SECTION.files)}
          onClose={closeCard}
        />
      )}
    </>
  );
}
