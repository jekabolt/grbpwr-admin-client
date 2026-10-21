// One A4 sheet of the tech pack. On screen it is the paper with the @page margin boxes
// (print/page-furniture.tsx) drawn in; in print the sheet IS the page body: the browser's own
// margin boxes print the running head and the counter, so the drawn copies hide.
import type { ReactNode } from 'react';

import type { common_TechCard } from 'api/proto-http/admin';
import type { PrintOrient } from 'components/managers/print/scope';

/** What every section page gets from the document: the card, the paper, the running head, «NN». */
export type TechpackPageProps = {
  techCard: common_TechCard;
  orient: PrintOrient;
  docline: string;
  n: string;
};

/** The body box inside the @page margins (14 mm top / bottom, 12 mm sides), screen px. */
export const BODY_PX = {
  land: { w: 1123 - 90, h: 794 - 106 },
  port: { w: 794 - 90, h: 1123 - 106 },
} as const;

export const TECHPACK_SHEET_CSS = String.raw`
.tp-doc { display: flex; flex-direction: column; align-items: center; gap: 24px; }
.tp-sheet { position: relative; flex: none; overflow: hidden; background: var(--color-bgColor); color: var(--color-textColor); border: 1px solid var(--color-borderColor); }
.tp-sheet[data-orient=land] { width: 1123px; height: 794px; }
.tp-sheet[data-orient=port] { width: 794px; height: 1123px; }
.tp-body { position: absolute; left: 45px; right: 45px; top: 53px; bottom: 53px; display: flex; flex-direction: column; min-height: 0; }
.tp-docline, .tp-count { position: absolute; font-size: 7pt; letter-spacing: .06em; color: var(--color-labelColor); white-space: nowrap; }
.tp-docline { top: 22px; left: 45px; right: 45px; text-align: center; text-transform: uppercase; overflow: hidden; }
.tp-count { bottom: 22px; right: 45px; width: 8ch; text-align: right; overflow: visible; }
.tp-sheet .truncate { overflow: visible !important; text-overflow: clip !important; white-space: normal !important; }
.tp-sheet td, .tp-sheet th, .tp-sheet figcaption { overflow-wrap: break-word; word-break: normal; }
/* cut pieces share one scale, so their ink must not: 1px outline, .5px inner lines at any size */
.tp-piece svg > polygon[fill] { fill: var(--color-bgColor); stroke: var(--color-textColor); stroke-width: 1px; vector-effect: non-scaling-stroke; }
.tp-piece svg g > :is(polygon, polyline) { stroke-width: .5px; vector-effect: non-scaling-stroke; }
@media print {
  .tp-doc { gap: 0; display: block; }
  .tp-sheet { border: 0 !important; break-after: page; }
  .tp-sheet:last-child { break-after: auto; }
  .tp-sheet[data-orient=land] { width: 273mm !important; height: 181.8mm !important; }
  .tp-sheet[data-orient=port] { width: 186mm !important; height: 268.8mm !important; }
  .tp-body { inset: 0; }
  .tp-docline, .tp-count { display: none; }
}
`;

export function TechpackSheet({
  orient,
  docline,
  children,
}: {
  orient: PrintOrient;
  docline: string;
  children: ReactNode;
}) {
  return (
    <div className='tp-sheet' data-orient={orient}>
      <div className='tp-docline'>{docline}</div>
      <div className='tp-body'>{children}</div>
      <div className='tp-count' data-page-count='' />
    </div>
  );
}
