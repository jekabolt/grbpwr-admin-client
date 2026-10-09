// СТЕНД ВАРПА АРТВОРКА (T27, R34/R35). Настоящий AnnotationSurface с одной зоной artwork, выбранной
// сразу (ручки видны); гоняется scripts/artwork-warp-probe.mjs. `window.__ZOOM` — кадр с зумом.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AnnotationSurface, type SurfaceCallout } from 'ui/components/annotation/surface';

const PIC =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400'><rect width='400' height='400' fill='#fff'/></svg>",
  );
// Прозрачный фон, красный квадрат с белой полосой и чёрным уголком у TL: видно и варп, и альфу.
const ART =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><rect x='10' y='10' width='180' height='180' fill='#7a1f24'/><rect x='10' y='90' width='180' height='20' fill='#fff'/><rect x='10' y='10' width='40' height='40' fill='#000'/></svg>",
  );

function Bench() {
  const [sel, setSel] = useState<string | null>('a1');
  const [c, setC] = useState<SurfaceCallout>({
    key: 'a1',
    kind: 'polygon',
    number: 1,
    points: (window as unknown as { __PTS?: SurfaceCallout['points'] }).__PTS ?? [
      { x: 0.3, y: 0.3 },
      { x: 0.7, y: 0.3 },
      { x: 0.7, y: 0.7 },
      { x: 0.3, y: 0.7 },
    ],
    label: { x: 0.5, y: 0.15 },
    text: '',
    dashed: true,
    filled: false,
    spec: { t: 'artwork', sub: 'print', url: ART },
  });
  return (
    <div style={{ width: 400, padding: 20 }} data-bench='sheet'>
      <AnnotationSurface
        src={PIC}
        zoom={!!(window as unknown as { __ZOOM?: boolean }).__ZOOM}
        callouts={[c]}
        selectedKey={sel}
        onSelect={(k) => setSel(k)}
        onEditPoints={(_k, points) => setC((p) => ({ ...p, points }))}
        onMoveLabel={(_k, label) => setC((p) => ({ ...p, label }))}
        onRemove={() => {}}
        onAdd={() => {}}
      />
      <div data-bench='pts'>{JSON.stringify(c.points)}</div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Bench />);
