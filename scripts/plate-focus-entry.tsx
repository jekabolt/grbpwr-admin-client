// СТЕНД ПЛАШКИ ВЫБРАННОЙ ЗОНЫ НАНЕСЕНИЯ (T26, R33). Настоящий AnnotationSurface с одной выноской
// artwork; гоняется scripts/plate-focus-probe.mjs.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AnnotationSurface, type SurfaceCallout } from 'ui/components/annotation/surface';

const PIC =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400'><rect width='400' height='400' fill='#fff'/></svg>",
  );
const ART =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'><rect width='100' height='100' fill='#7a1f24'/></svg>",
  );

function Bench() {
  const [sel, setSel] = useState<string | null>(null);
  const [c, setC] = useState<SurfaceCallout>({
    key: 'a1',
    kind: 'polygon',
    number: 1,
    points: [
      { x: 0.2, y: 0.25 },
      { x: 0.75, y: 0.25 },
      { x: 0.75, y: 0.8 },
      { x: 0.2, y: 0.8 },
    ],
    label: { x: 0.47, y: 0.25 },
    text: '',
    dashed: true,
    filled: false,
    spec: { t: 'artwork', sub: 'print', url: ART },
  });
  return (
    <div style={{ width: 400, padding: 20 }} data-bench='sheet'>
      <AnnotationSurface
        src={PIC}
        callouts={[c]}
        selectedKey={sel}
        onSelect={(k) => setSel(k)}
        onEditPoints={(_k, points) => setC((p) => ({ ...p, points }))}
        onMoveLabel={(_k, label) => setC((p) => ({ ...p, label }))}
        onRemove={() => {}}
        onAdd={() => {}}
      />
      <div data-bench='sel'>{sel ?? ''}</div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Bench />);
