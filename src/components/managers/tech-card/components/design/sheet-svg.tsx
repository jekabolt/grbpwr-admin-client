import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { AnnotationDefs, CalloutShape } from 'ui/components/annotation/shapes';

/**
 * ═══ THE SHEET AS ONE SVG FILE — `download SVG` on ARTIFACTS ══════════════════════════════════
 *
 * THE SHAPES ON PAPER ARE DRAWN BY THE RENDERER THAT DRAWS THEM ON SCREEN, and that is the whole
 * design of this module. `CalloutShape` is the component the annotation surface uses; it is mounted
 * here into a DETACHED container and its markup is read back out. Re-implementing arrows, arcs,
 * dimension ticks and hatched polygons a second time «for export» is how a file that looks right in
 * the admin comes out of Illustrator with the arrowheads missing — and nothing would ever say so,
 * because the two renderers would be tested by two different pairs of eyes.
 *
 * THE PICTURES ARE LINKED, NOT EMBEDDED. `<image href="…">` carries the media URL, exactly as
 * `vector-modal` does for the raster underlay. Embedding the bytes would mean fetching every plate
 * through the media proxy (CORS), base64-ing megabytes into a string, and producing a file too
 * large to open — for a document whose purpose is to be handed to a vector editor that has network
 * access anyway. The trade is stated to the person pressing the button, not hidden.
 *
 * WHY A PROMISE AND A `setTimeout`. `createRoot().render()` is concurrent, so the markup is not
 * there when the call returns; `flushSync` forces it, and `flushSync` must not run inside React's
 * own batching — the export therefore hops out of the event handler first. Neither is a workaround:
 * both are the documented way to render React into a string in a browser bundle without pulling in
 * `react-dom/server`, which would add a second renderer to the app for one button.
 */

/** One plate of the exported sheet: a picture with a name and a known frame ratio. */
export type SheetSvgPlate = {
  name: string;
  /** The address the exported file links to. A plate with no URL is drawn as an empty frame. */
  url: string;
  /** Fractional callout geometry, already resolved onto this plate. */
  callouts: SheetSvgCallout[];
};

export type SheetSvgCallout = {
  number: number;
  kind: string;
  /** Anchors of the shape, fractions of the frame. Empty for a bare pin. */
  points: { x: number; y: number }[];
  /** Where the numbered marker sits, fractions of the frame. */
  label: { x: number; y: number };
  hasText: boolean;
  color?: string;
  dashed?: boolean;
  filled?: boolean;
};

/** Cell metrics, in user units of the produced document. The prototype's own (`sheetSvgExport`). */
const CELL_W = 260;
const CELL_H = 340;
const GAP = 20;
const TOP = 30;
const CAPTION_Y = TOP + CELL_H + 20;
const HEIGHT = CAPTION_Y + 30;

export function buildSheetSvg({
  title,
  plates,
}: {
  /** The one line of provenance the paper carries: style number, version, callout count. */
  title: string;
  plates: SheetSvgPlate[];
}): Promise<string> {
  const width = GAP + plates.length * (CELL_W + GAP);

  const element = (
    <svg
      xmlns='http://www.w3.org/2000/svg'
      viewBox={`0 0 ${Math.max(width, 320)} ${HEIGHT}`}
      width={Math.max(width, 320)}
      height={HEIGHT}
      fill='none'
      stroke='#000'
      // `CalloutShape` paints the default ink as `currentColor`; the document has to state it or
      // every un-coloured callout comes out black-on-black in one editor and invisible in another.
      style={{ color: '#000' }}
    >
      <defs>
        <AnnotationDefs />
      </defs>
      <text x={GAP} y={18} fontSize={11} fontFamily='monospace' fill='#000' stroke='none'>
        {title}
      </text>
      {plates.map((plate, i) => {
        const x = GAP + i * (CELL_W + GAP);
        const at = (p: { x: number; y: number }) => ({
          x: x + p.x * CELL_W,
          y: TOP + p.y * CELL_H,
        });
        return (
          <g key={`${plate.name}-${i}`}>
            <rect x={x} y={TOP} width={CELL_W} height={CELL_H} fill='#fff' stroke='#ccc' />
            {plate.url && (
              <image
                href={plate.url}
                x={x}
                y={TOP}
                width={CELL_W}
                height={CELL_H}
                preserveAspectRatio='xMidYMid meet'
              />
            )}
            {plate.callouts.map((callout) => {
              const label = at(callout.label);
              return (
                // `data-cal` per callout, as the prototype exports it: it is what lets a check
                // compare the number of shapes on paper with the composition it claims to be.
                <g key={callout.number} data-cal={callout.number}>
                  <CalloutShape
                    kind={callout.kind}
                    pts={callout.points.map(at)}
                    label={label}
                    color={callout.color}
                    dashed={callout.dashed}
                    filled={callout.filled}
                    halo={false}
                    strokeWidth={1.5}
                  />
                  <circle
                    cx={label.x}
                    cy={label.y}
                    r={9}
                    fill={callout.hasText ? '#000' : '#fff'}
                    stroke='#000'
                  />
                  <text
                    x={label.x}
                    y={label.y + 3}
                    textAnchor='middle'
                    fontSize={9}
                    fontFamily='monospace'
                    fill={callout.hasText ? '#fff' : '#000'}
                    stroke='none'
                  >
                    {callout.number || '·'}
                  </text>
                </g>
              );
            })}
            <text
              x={x + CELL_W / 2}
              y={CAPTION_Y}
              textAnchor='middle'
              fontSize={10}
              fontFamily='monospace'
              fill='#000'
              stroke='none'
            >
              {plate.name.toUpperCase()}
            </text>
          </g>
        );
      })}
    </svg>
  );

  return new Promise((resolve, reject) => {
    setTimeout(() => {
      const host = document.createElement('div');
      // OFF-SCREEN, NOT `display:none`. A hidden subtree still renders markup, and the container is
      // never attached to the layout at all — nothing here can reflow the page it was pressed from.
      const root = createRoot(host);
      try {
        flushSync(() => root.render(element));
        const markup = host.innerHTML;
        if (!markup.trim()) {
          reject(new Error('the sheet produced no markup'));
          return;
        }
        resolve(markup);
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      } finally {
        // `unmount` inside `flushSync` is what React asks for when the root is thrown away
        // synchronously; without it the root leaks and React logs a warning on the next export.
        flushSync(() => root.unmount());
      }
    }, 0);
  });
}

/** Hand the finished document to the browser. Same mechanism the vector round trip already uses. */
export function downloadSvg(filename: string, markup: string): void {
  const href = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }));
  const a = document.createElement('a');
  a.href = href;
  a.download = filename.replace(/[^\w.-]+/g, '-');
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked on the next tick, not immediately: Safari has not started the download when `click()`
  // returns, and a URL revoked under it produces a silent zero-byte file.
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}
