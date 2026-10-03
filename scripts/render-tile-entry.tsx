// СТЕНД ПЛИТКИ РЕНДЕРА (лейн L, 20-TILE-SPEC §4 «Lane L»). Монтирует НАСТОЯЩИЙ `RenderTile` с
// подставными дверями хозяина (`RenderDoors`): правила целей считает не плитка, а хозяин, и здесь
// они заданы явно, чтобы проверялась именно раскладка органов плитки и то, что каждый зовёт.
//   · `free`    — свободная плита, два столбца + `+ colourway…` + `delete…` (меню группами);
//   · `single`  — один столбец: строки без имени колорвея;
//   · `held`    — стоит во `front` ROSSO: флаг `in front`, ✕ снимает, меню нет;
//   · `sheet`   — склеенный лист двух видов, не резан: угол `split`, меню нет;
//   · `deck`    — разрезанный лист: ряд колоды `expand ▸` под кадром;
//   · `refused` — встать некуда: меню погашено, причина в подсказке.
// Вызовы — в `#state`. Прогоняется `scripts/render-tile-probe.mjs`.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  common_DesignPicture,
  common_DesignRun,
  GetDesignBandResponse,
} from 'api/proto-http/admin';
import { useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { PictureGalleryProvider } from 'components/managers/tech-card/components/design/picture-tile';
import {
  RenderTile,
  type RenderDoors,
} from 'components/managers/tech-card/components/design/render/render-tile';
import type { BenchSide } from 'components/managers/tech-card/components/design/render/model';

const PIC =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><rect width='300' height='300' fill='#ddd'/></svg>",
  );
const media = (id: number) =>
  ({ id, media: { full: { mediaUrl: PIC, width: 300, height: 300 } } }) as never;
const pic = (id: number, extra: Partial<common_DesignPicture> = {}): common_DesignPicture =>
  ({
    id,
    ordinal: id,
    colorwayId: 1,
    kind: 'render',
    ghostView: 'front',
    media: media(id),
    ...extra,
  }) as common_DesignPicture;

const free = pic(11);
const single = pic(12, { colorwayId: 2 });
const held = pic(13);
const sheet = pic(14, { compositeViews: ['front', 'back'] });
const deckSheet = pic(15, { compositeViews: ['front', 'back'] });
const refused = pic(16, { colorwayId: 9 });
const band = {
  bench: [{ pictureId: 13, viewKey: 'front', kind: 'render', colorwayId: 1 }],
} as GetDesignBandResponse;
const side = (view: 'front' | 'back', slotRev: number): BenchSide => ({
  view,
  slot: null,
  picture: null,
  slotRev,
});

type Call = unknown[];

function Harness() {
  const [calls, setCalls] = useState<Call[]>([]);
  const log = (...c: unknown[]) => setCalls((p) => [...p, c]);
  const names: Record<number, string> = { 0: 'sample', 1: 'ROSSO', 2: 'OLIVE', 9: 'GONE' };
  const doors = {
    band,
    techCardId: 1,
    disabled: false,
    writesOff: false,
    adopts: true,
    onCreateColorway: () => log('create'),
    marking: null,
    membersOf: new Map([[15, [pic(151, { derivation: 'crop' } as never)]]]),
    openDeck: null,
    colourwayName: (id: number) => names[id] ?? `#${id}`,
    destinationsOf: (own: number) =>
      own === 9
        ? { ids: [], refusal: 'GONE was deleted from the card' }
        : { ids: [own], refusal: null },
    createsColourwayFor: (p: common_DesignPicture) => p.id === 11,
    markRefusal: (p: common_DesignPicture) =>
      p.id === 16 ? 'GONE was deleted from the card' : null,
    markBranches: (p: common_DesignPicture) =>
      p.id === 11
        ? [
            {
              id: 1,
              label: 'ROSSO',
              leaves: [
                { value: 'front', label: 'front', note: 'replaces #4' },
                { value: 'back', label: 'back' },
              ],
            },
            { id: 2, label: 'OLIVE', leaves: [{ value: 'front', label: 'front' }] },
          ]
        : [{ id: 2, label: 'OLIVE', leaves: [{ value: 'back', label: 'back' }] }],
    markInto: (p: common_DesignPicture, target: number, view: string) =>
      log('mark', p.id, target, view),
    unmarkHeld: (p: common_DesignPicture, colorwayId: number, s: BenchSide) =>
      log('unmark', p.id, colorwayId, s.view, s.slotRev),
    heldAway: () => null,
    heldAt: (p: common_DesignPicture) =>
      p.id === 13 ? { colorwayId: 1, side: side('front', 3), where: 'ROSSO · front' } : null,
    piecesOf: () => [],
    piecesCut: (id: number) => (id === 15 ? 1 : 0),
    applyRefusalFor: () => null,
    horizonOf: () => null,
    notes: [],
    noteBase: 'n',
    noteIdOf: () => undefined,
  } as unknown as RenderDoors;
  const tile = (p: common_DesignPicture, probe: string, extra: { onDelete?: () => void } = {}) => (
    <div data-probe={probe} style={{ width: 180 }}>
      <RenderTile
        doors={doors}
        picture={p}
        run={{ id: 7, rrev: 1 } as common_DesignRun}
        src={PIC}
        aspect='4/5'
        onDeck={() => log('deck', p.id)}
        onEdit={() => log('edit', p.id)}
        onSplit={() => log('split', p.id)}
        split={{ views: p.compositeViews ?? [], splitInto: 0 }}
        {...extra}
      />
    </div>
  );
  const row = (children: ReactNode) => (
    <div style={{ display: 'flex', gap: 24, padding: '200px 40px 40px', alignItems: 'flex-start' }}>
      {children}
    </div>
  );
  return (
    <PictureGalleryProvider>
      {row(
        <>
          {tile(free, 'free', { onDelete: () => log('delete', 11) })}
          {tile(single, 'single')}
          {tile(held, 'held')}
          {tile(sheet, 'sheet')}
          {tile(deckSheet, 'deck')}
          {tile(refused, 'refused')}
        </>,
      )}
      <pre id='state' style={{ position: 'fixed', left: -9999, top: 0 }}>
        {JSON.stringify(calls)}
      </pre>
    </PictureGalleryProvider>
  );
}

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById('root') as HTMLElement).render(
  <QueryClientProvider client={qc}>
    <Harness />
  </QueryClientProvider>,
);
