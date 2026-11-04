import { PatternQR } from 'components/managers/tech-card/patterns/pattern-qr';
import { Sheet, TD, TH } from '../sheet';
import type { ArtworkTile, LabelFact } from './label-facts';

const QR_PX = 84;

const dash = (value: string | number | null) => value || '—';

/** The artwork files of a paper: point a camera at the tile to get the file. */
export function ArtworkQr({ title, tiles }: { title: string; tiles: readonly ArtworkTile[] }) {
  if (!tiles.length) return null;
  return (
    <div data-artwork-qr=''>
      <div className='mb-2 mt-3 break-after-avoid border-b border-textColor pb-0.5 text-micro font-bold uppercase tracking-label'>
        {title}
      </div>
      <div className='grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-3'>
        {tiles.map((tile) => (
          <figure key={tile.key} className='m-0 flex break-inside-avoid flex-col gap-1 text-nano'>
            {tile.url ? (
              <div data-artwork-qr-cell={tile.key} style={{ width: QR_PX, height: QR_PX }}>
                <PatternQR value={tile.url} size={QR_PX} />
              </div>
            ) : (
              <div
                data-artwork-no-file={tile.key}
                className='flex items-center justify-center border border-dashed border-error text-center uppercase text-textColor'
                style={{ width: QR_PX, height: QR_PX }}
              >
                no file
              </div>
            )}
            <figcaption translate='no'>{tile.caption}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

/** The run pack's labels: every label of the card, the numbers its pins carry, this run's artwork. */
export function RunLabelsSheet({
  rows,
  qrTitle,
  tiles,
}: {
  rows: readonly LabelFact[];
  qrTitle: string;
  tiles: readonly ArtworkTile[];
}) {
  if (!rows.length) return null;
  return (
    <Sheet title='labels'>
      <table className='w-full border-collapse text-micro' data-run-labels=''>
        <thead>
          <tr>
            <th className={TH}>#</th>
            <th className={TH}>label</th>
            <th className={TH}>placement</th>
            <th className={TH}>attachment</th>
            <th className={TH}>folding</th>
            <th className={TH}>size</th>
            <th className={TH}>material</th>
            <th className={`${TH} text-right`}>qty</th>
            <th className={TH}>note</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className='break-inside-avoid'>
              <td className={TD}>{row.number}</td>
              <td className={`${TD} font-semibold`}>{row.item}</td>
              <td className={TD}>{dash(row.placement)}</td>
              <td className={TD}>{dash(row.attachment)}</td>
              <td className={TD}>{dash(row.folding)}</td>
              <td className={TD}>{dash(row.size)}</td>
              <td className={TD}>{dash(row.material)}</td>
              <td className={`${TD} text-right`}>{dash(row.quantity)}</td>
              <td className={`${TD} whitespace-pre-wrap`}>{dash(row.note)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ArtworkQr title={qrTitle} tiles={tiles} />
    </Sheet>
  );
}
