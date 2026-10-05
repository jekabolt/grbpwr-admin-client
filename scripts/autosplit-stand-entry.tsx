// СТЕНД АВТО-СПЛИТА НА ВЕРСТАКЕ (T26; generation/inline-split.tsx `auto`, split-modal.tsx детектор).
// Настоящий `LatestGeneration` FLAT над поддельной полосой, два листа беты (base64 из пробы):
//   · `auto`  (карточка 1) — run-70, 4 вида: детектор уверен → рез уходит сам, полоса «перечитывается»
//     с четырьмя кусками (квадрат на белом, как режет T25 на бэке);
//   · `unsure` (карточка 2) — run-57 (две вещи), спрошено 3 вида: не уверен → рамки только засеяны.
// `SplitDesignPicture` отвечает через `window.__split` (заглушка в пробе), остальные вызовы — {}.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { GetDesignBandResponse, common_DesignPicture } from 'api/proto-http/admin';
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DesignCapabilityProvider } from 'components/managers/tech-card/components/design/capability';
import { PictureGalleryProvider } from 'components/managers/tech-card/components/design/picture-tile';
import { LatestGeneration } from 'components/managers/tech-card/components/design/generation/latest-generation';

type W = Window & {
  __sheets: Record<string, { url: string; w: number; h: number }>;
  __split: (body: {
    pictureId: number;
    frames: {
      x: { value: string };
      y: { value: string };
      w: { value: string };
      h: { value: string };
      viewKey: string;
    }[];
  }) => Promise<unknown>;
  __bands: Record<number, (b: GetDesignBandResponse) => void>;
};
const win = window as unknown as W;

const media = (id: number, url: string, w: number, h: number) => ({
  id,
  thumbnail: { mediaUrl: url },
  fullSize: { mediaUrl: url },
  media: { fullSize: { mediaUrl: url, width: w, height: h }, thumbnail: { mediaUrl: url } },
});
const pic = (id: number, runId: number, extra: Partial<common_DesignPicture>) =>
  ({ id, runId, kind: 'flat', ...extra }) as common_DesignPicture;

// run-70 lays front, side, back, side left → right
const VIEWS4 = ['front', 'side_l', 'back', 'side_r'];
const SLOTS = ['front', 'back', 'side_l', 'side_r'];
const VIEWS3 = ['front', 'back', 'side_l'];
const bench = SLOTS.map((viewKey, i) => ({
  id: i + 1,
  viewKey,
  kind: 'flat',
  pictureId: 0,
  slotRev: 1,
}));
const bandOf = (run: unknown) => ({ bench, runs: [run] }) as unknown as GetDesignBandResponse;

function runOf(
  id: number,
  sheetId: number,
  key: string,
  views: string[],
  pieces: common_DesignPicture[] = [],
) {
  const s = win.__sheets[key];
  const sheet = pic(sheetId, id, { media: media(sheetId + 100, s.url, s.w, s.h) as never });
  return {
    id,
    kind: 'flat',
    status: 'done',
    params: { layout: 'one', views },
    pictures: [sheet, ...pieces],
  };
}

/** The server's cut as T25 makes it: the frame, square, centred on white with an 8 % margin. */
async function squarePiece(url: string, f: { x: number; y: number; w: number; h: number }) {
  const img = new Image();
  img.src = url;
  await img.decode();
  const sx = f.x * img.naturalWidth;
  const sy = f.y * img.naturalHeight;
  const sw = f.w * img.naturalWidth;
  const sh = f.h * img.naturalHeight;
  const side = Math.round(Math.max(sw, sh) / 0.84);
  const c = document.createElement('canvas');
  c.width = side;
  c.height = side;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, side, side);
  ctx.drawImage(img, sx, sy, sw, sh, (side - sw) / 2, (side - sh) / 2, sw, sh);
  return { url: c.toDataURL('image/png'), side };
}

win.__bands = {};
win.__split = async (body) => {
  const card = body.pictureId === 31 ? 1 : 2;
  const key = card === 1 ? 'run-70' : 'run-57';
  const views = card === 1 ? VIEWS4 : VIEWS3;
  const runId = card === 1 ? 7 : 8;
  const src = win.__sheets[key].url;
  const pieces: common_DesignPicture[] = [];
  for (const [i, fr] of body.frames.entries()) {
    const f = { x: +fr.x.value, y: +fr.y.value, w: +fr.w.value, h: +fr.h.value };
    const p = await squarePiece(src, f);
    pieces.push(
      pic(body.pictureId + 10 + i, runId, {
        derivation: 'crop',
        derivedFrom: body.pictureId,
        ghostView: fr.viewKey,
        media: media(500 + i, p.url, p.side, p.side) as never,
      }),
    );
  }
  await new Promise((r) => setTimeout(r, 1500));
  // the band re-read after the write
  setTimeout(
    () => win.__bands[card]?.(bandOf(runOf(runId, body.pictureId, key, views, pieces))),
    300,
  );
  return { pictures: pieces };
};

function Card({
  card,
  runId,
  sheetId,
  sheet,
  views,
}: {
  card: number;
  runId: number;
  sheetId: number;
  sheet: string;
  views: string[];
}) {
  const [band, setBand] = useState(() => bandOf(runOf(runId, sheetId, sheet, views)));
  useEffect(() => {
    win.__bands[card] = setBand;
  }, [card]);
  return <LatestGeneration band={band} techCardId={card} />;
}

function Harness() {
  return (
    <DesignCapabilityProvider value>
      <PictureGalleryProvider>
        <div style={{ width: 1100, padding: 32 }}>
          <div data-probe='auto'>
            <Card card={1} runId={7} sheetId={31} sheet='run-70' views={VIEWS4} />
          </div>
          <div data-probe='unsure' style={{ marginTop: 32 }}>
            <Card card={2} runId={8} sheetId={41} sheet='run-57' views={VIEWS3} />
          </div>
        </div>
      </PictureGalleryProvider>
    </DesignCapabilityProvider>
  );
}

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById('root') as HTMLElement).render(
  <QueryClientProvider client={qc}>
    <Harness />
  </QueryClientProvider>,
);
