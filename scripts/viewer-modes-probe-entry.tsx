// Стенд «один просмотрщик» (viewer-unify): НАСТОЯЩИЙ `MediaViewer` с тремя снимками и дверью
// `onReplace`, и НАСТОЯЩЕЕ окно указаний вложений задачи (`useTaskMediaViewer` → AnnotationZoomDialog
// → тот же просмотрщик в режиме `callouts`). Сеть — заглушка пробы; снимки отдаёт маршрут Playwright.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

import { useTaskMediaViewer } from 'components/managers/tasks/components/task-media-viewer';
import type { TaskMediaAnnotations } from 'components/managers/tasks/api/types';
import { MediaViewer, type MediaViewerItem } from 'components/shared/media-viewer/media-viewer';
import { SnackBar } from 'components/shell/snackbar';

type ViewerProbe = {
  mountViewer: (opts: { slot: boolean }) => void;
  mountCallouts: () => void;
  /** Каждый вызов `onReplace`: начало data-url и src кадра. */
  replaces: () => { head: string; src: string }[];
};

declare global {
  interface Window {
    __viewer: ViewerProbe;
  }
}

const probe = {} as ViewerProbe;
window.__viewer = probe;
const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const replaces: { head: string; src: string }[] = [];
probe.replaces = () => replaces;

const items: MediaViewerItem[] = [1, 2, 3].map((n) => ({
  src: `https://cdn.example/${n}-full.png`,
  thumbnail: `https://cdn.example/${n}-thumb.png`,
  alt: `picture ${n}`,
  meta: {
    id: 100 + n,
    renditions: [
      { label: 'original', url: `https://cdn.example/${n}-full.png`, width: 800, height: 1000 },
    ],
  },
}));

function ViewerStand({ slot }: { slot: boolean }) {
  const [open, setOpen] = useState(true);
  const [index, setIndex] = useState(0);
  return (
    <MediaViewer
      items={items}
      index={index}
      open={open}
      onOpenChange={setOpen}
      onIndexChange={setIndex}
      onReplace={
        slot
          ? async (dataUrl, item) => {
              replaces.push({ head: dataUrl.slice(0, 22), src: item.src });
            }
          : undefined
      }
    />
  );
}

function CalloutsStand() {
  const [annotations, setAnnotations] = useState<TaskMediaAnnotations[]>([]);
  const viewer = useTaskMediaViewer({
    media: [
      {
        id: 7,
        fullSize: 'https://cdn.example/7-full.png',
        thumbnail: 'https://cdn.example/7-thumb.png',
      },
      {
        id: 8,
        fullSize: 'https://cdn.example/8-full.png',
        thumbnail: 'https://cdn.example/8-thumb.png',
      },
    ],
    annotations,
    onChange: setAnnotations,
    canWrite: true,
  });
  const [opened, setOpened] = useState(false);
  if (!opened) {
    queueMicrotask(() => {
      setOpened(true);
      viewer.openIndex(0);
    });
  }
  return <>{viewer.node}</>;
}

const root = createRoot(document.getElementById('root')!);
const mount = (node: React.ReactNode) =>
  root.render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        {node}
        <SnackBar />
      </MemoryRouter>
    </QueryClientProvider>,
  );
probe.mountViewer = ({ slot }) => mount(<ViewerStand key={String(slot)} slot={slot} />);
probe.mountCallouts = () => mount(<CalloutsStand />);
