import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TechCardSnapshotListItem } from 'api/proto-http/admin';
import { SaveStatusChip } from 'components/managers/tech-card/components/save-status-chip';
import { techCardKeys } from 'components/managers/tech-cards/components/useTechCardQuery';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button, Pill, Text } from 'ui';
import '../src/global.css';

const at = (day: number, time: string) => `2026-10-${day}T${time}:00+02:00`;
const row = (
  snapshotId: number,
  day: number,
  time: string,
  authorLabel: string,
  changes: string[],
  pinned = false,
): TechCardSnapshotListItem => ({
  snapshotId,
  lockVersion: snapshotId,
  reason: 'autosave',
  createdAt: at(day, time),
  authorLabel,
  changes,
  pinned,
});

let versions: TechCardSnapshotListItem[] = [
  row(108, 24, '14:27', 'anna', ['bom', 'sizes']),
  row(107, 24, '14:16', 'jeka', ['season']),
  row(106, 24, '14:07', 'jeka', ['name']),
  row(105, 23, '18:41', 'anna', ['sizes']),
  row(104, 23, '17:53', 'jeka', ['bom', 'shell fabric']),
  row(103, 23, '15:18', 'anna', ['note']),
  row(102, 23, '10:05', 'jeka', ['samples']),
  row(101, 22, '16:44', 'anna', ['release'], true),
  row(100, 22, '14:02', 'jeka', ['construction note']),
  row(99, 22, '13:36', 'anna', ['sizes']),
  row(98, 22, '09:12', 'jeka', ['opened']),
];

const firstPage = () => versions.slice(0, 8);
const secondPage = () => versions.slice(8);
const restoreCalls: number[] = [];

declare global {
  interface Window {
    __versionProbe: {
      restoreCalls: number[];
      listCalls: number[];
    };
  }
}

window.__versionProbe = { restoreCalls, listCalls: [] };
window.fetch = async (input) => {
  const url = new URL(
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
  );
  if (/\/api\/admin\/tech-card\/42\/snapshots$/.test(url.pathname)) {
    const before = Number(url.searchParams.get('beforeSnapshotId') ?? 0);
    window.__versionProbe.listCalls.push(before);
    return new Response(
      JSON.stringify({
        items: before ? secondPage() : firstPage(),
        nextBeforeSnapshotId: before || secondPage().length === 0 ? 0 : 101,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
  return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
};

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, gcTime: 0, refetchOnWindowFocus: false } },
});

function Stand() {
  const [current, setCurrent] = useState({
    createdAt: at(24, '14:32'),
    authorLabel: 'jeka@grbpwr.com',
  });

  const restore = async (snapshotId: number) => {
    restoreCalls.push(snapshotId);
    await new Promise((resolve) => setTimeout(resolve, 80));
    versions = [
      {
        snapshotId: 109,
        lockVersion: 109,
        reason: `restore:${snapshotId}`,
        createdAt: at(24, '14:36'),
        authorLabel: 'jeka',
        changes: [],
        pinned: false,
      },
      ...versions,
    ];
    setCurrent({ createdAt: at(24, '14:36'), authorLabel: 'jeka@grbpwr.com' });
    await queryClient.invalidateQueries({ queryKey: techCardKeys.detail(42) });
  };

  return (
    <main className='min-h-screen bg-pageBg px-2.5 py-8 text-textColor md:px-8'>
      <div className='mx-auto max-w-[1180px] border border-borderColor bg-bgColor'>
        <div className='flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-borderColor px-2.5 py-2'>
          <Button variant='underline' size='xs'>
            tech cards
          </Button>
          <div className='min-w-0'>
            <Text variant='uppercase' className='truncate font-bold'>
              aw26-014 · wool overshirt
            </Text>
            <Text size='micro' variant='label' className='truncate'>
              v109 · 24 oct 14:32
            </Text>
          </div>
          <div className='ml-auto flex items-center gap-3'>
            <div className='hidden items-center gap-2 sm:flex'>
              <Button variant='underline' size='xs'>
                undo · note
              </Button>
              <Button variant='underline' size='xs' disabled>
                redo
              </Button>
            </div>
            <SaveStatusChip
              status='saved'
              lastSavedAt={new Date(current.createdAt).getTime()}
              bodyDirty={false}
              staged={[]}
              techCardId={42}
              currentVersion={current}
              canRestore
              onRevealError={() => undefined}
              onConfirmSwitch={() => undefined}
              onOpenConflict={() => undefined}
              onRestore={restore}
            />
            <Button variant='secondary' size='sm'>
              pdf
            </Button>
          </div>
        </div>
        <div className='flex flex-wrap items-center gap-3 border-b border-borderColor px-2.5 py-2'>
          <Text size='micro' variant='uppercase' className='font-bold'>
            studio
          </Text>
          <Text size='micro' variant='label'>
            patterns · bom · assembly · sizes
          </Text>
          <Pill tone='mut' className='ml-auto'>
            draft
          </Pill>
        </div>
        <div className='grid gap-6 p-4 md:grid-cols-[180px_1fr]'>
          <div className='space-y-2'>
            {['studio', 'patterns', 'bom', 'sizes', 'labels'].map((label) => (
              <Text key={label} size='micro' variant={label === 'studio' ? 'uppercase' : 'label'}>
                {label}
              </Text>
            ))}
          </div>
          <div className='space-y-4'>
            <div className='h-24 border border-borderColor bg-pageBg' />
            <div className='h-32 border border-borderColor bg-pageBg' />
          </div>
        </div>
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <Stand />
  </QueryClientProvider>,
);
