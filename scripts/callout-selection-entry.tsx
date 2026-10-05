// СТЕНД ВЫБОРА ВЫНОСКИ (T33, R43). Настоящий AnnotationSurface: деталь, артворк, лидер, разрез,
// пин, плашка — на штриховом флэте; выбор задаёт проба через `window.__select`.
import { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AnnotationSurface, type SurfaceCallout } from 'ui/components/annotation/surface';

const FLAT =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400'><rect width='400' height='400' fill='#fff'/>" +
      "<path d='M120 60 L280 60 L340 120 L310 150 L290 130 L290 360 L110 360 L110 130 L90 150 L60 120 Z' fill='none' stroke='#111' stroke-width='2'/>" +
      "<path d='M170 60 Q200 95 230 60' fill='none' stroke='#111' stroke-width='1.5'/>" +
      "<line x1='200' y1='95' x2='200' y2='360' stroke='#111' stroke-dasharray='4 3'/>" +
      "<circle cx='200' cy='130' r='4' fill='none' stroke='#111'/><circle cx='200' cy='180' r='4' fill='none' stroke='#111'/>" +
      '</svg>',
  );
const ART =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'><circle cx='50' cy='50' r='40' fill='#7a1f24'/></svg>",
  );

const START: SurfaceCallout[] = [
  {
    key: 'det',
    kind: 'polygon',
    number: 1,
    points: [
      { x: 0.47, y: 0.3 },
      { x: 0.53, y: 0.3 },
      { x: 0.53, y: 0.36 },
      { x: 0.47, y: 0.36 },
    ],
    label: { x: 0.5, y: 0.33 },
    text: 'placket',
    filled: false,
    spec: { t: 'detail', scale: 6 },
  },
  {
    key: 'art',
    kind: 'polygon',
    number: 2,
    points: [
      { x: 0.32, y: 0.55 },
      { x: 0.47, y: 0.55 },
      { x: 0.47, y: 0.7 },
      { x: 0.32, y: 0.7 },
    ],
    label: { x: 0.4, y: 0.55 },
    text: '',
    dashed: true,
    filled: false,
    spec: { t: 'artwork', sub: 'print', url: ART },
  },
  {
    key: 'lead',
    kind: 'label',
    number: 3,
    points: [{ x: 0.2, y: 0.33 }],
    label: { x: 0.12, y: 0.12 },
    text: 'sleeve hem',
  },
  {
    key: 'sec',
    kind: 'dim',
    number: 4,
    points: [
      { x: 0.55, y: 0.78 },
      { x: 0.75, y: 0.78 },
    ],
    label: { x: 0.8, y: 0.68 },
    letter: 'A',
    caps: 'arrow',
    text: '',
    spec: { t: 'section', layers: [{ name: 'shell' }, { name: 'interfacing' }] },
  },
  {
    key: 'pin',
    kind: 'pin',
    number: 5,
    points: [{ x: 0.62, y: 0.6 }],
    label: { x: 0.62, y: 0.6 },
    text: 'bartack',
  },
];

function Bench() {
  const [sel, setSel] = useState<string | null>(null);
  const [cs, setCs] = useState(START);
  const [tool, setTool] = useState<string | null>(null);
  const adds = useRef(0);
  const [hot, setHot] = useState<string | null>(null);
  const w = window as unknown as {
    __select: (k: string | null) => void;
    __set: (cs: SurfaceCallout[]) => void;
    __tool: (t: string | null) => void;
    __hot: (k: string | null) => void;
  };
  w.__tool = setTool;
  (window as unknown as { __cs: () => SurfaceCallout[] }).__cs = () => cs;
  (window as unknown as { __adds: () => number }).__adds = () => adds.current;
  w.__hot = setHot;
  w.__select = setSel;
  w.__set = setCs;
  return (
    <div style={{ width: 420, padding: 20, background: '#fff' }} data-bench='sheet'>
      <AnnotationSurface
        src={FLAT}
        callouts={cs}
        selectedKey={sel}
        tool={tool}
        hoveredKey={hot}
        legend
        onSelect={(k) => setSel(k)}
        onEditPoints={(k, points) =>
          setCs((p) => p.map((c) => (c.key === k ? { ...c, points } : c)))
        }
        onMoveLabel={(k, label) => setCs((p) => p.map((c) => (c.key === k ? { ...c, label } : c)))}
        onRemove={() => {}}
        onAdd={() => {
          adds.current += 1;
        }}
      />
      <div data-bench='sel'>{sel ?? ''}</div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Bench />);
