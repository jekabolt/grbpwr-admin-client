// ЗАГЛУШКА картинок квиза раскладки. Настоящий набор (изометрия по мокапу) строит соседняя ветка
// feat/marker-quiz-pics и при слиянии заменяет этот файл целиком: экспорты и их типы здесь ровно
// те, что в спеке, а рисунок — плоская схема, чтобы шагам было что показать.
import { useState } from 'react';
import Input from 'ui/components/input';

export type FabricColours = { face: string; back: string };
export type PicInput = {
  value: number;
  onChange: (v: number) => void;
  unit: string;
  label: string;
};

// Нейтральная ткань, когда у колорвея нет цвета (RGB, не hex: hex-литералы запрещены линтом).
const NEUTRAL: [number, number, number] = [154, 154, 150];
const WHITE: [number, number, number] = [255, 255, 255];
const INK = 'var(--color-textColor)';
const RULE = 'var(--color-borderColor)';
const BAD = 'var(--color-error)';

const rgb = (c: number[]) => `rgb(${c.map((v) => Math.round(v)).join(' ')})`;
const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);

export function fabricColours(hex: string | null | undefined): FabricColours {
  const h = (hex ?? '').trim().replace(/^#?/, '#');
  const ok = /^#[0-9a-f]{6}$/i.test(h);
  const face = ok ? [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) : NEUTRAL;
  return { face: ok ? h : rgb(face), back: rgb(mix(face, WHITE, 0.55)) };
}

function Frame({ w, h, children }: { w: number; h: number; children: React.ReactNode }) {
  return (
    <svg
      viewBox={`-4 -4 ${w + 8} ${h + 8}`}
      className='mx-auto block h-auto max-h-80 w-full max-w-xl'
      aria-hidden
    >
      {children}
    </svg>
  );
}

function NumIn({ input }: { input: PicInput }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label className='inline-flex items-center gap-1'>
      <span className='text-micro uppercase tracking-label text-labelColor'>{input.label}</span>
      <Input
        inputMode='decimal'
        aria-label={input.label}
        className='w-16 text-right tabular-nums'
        value={draft ?? String(input.value)}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          setDraft(e.target.value);
          const n = Number(e.target.value.replace(',', '.'));
          if (e.target.value.trim() !== '' && Number.isFinite(n)) input.onChange(n);
        }}
        onBlur={() => setDraft(null)}
      />
      <span className='text-labelColor'>{input.unit}</span>
    </label>
  );
}

function Inputs({ items }: { items: Array<PicInput | undefined> }) {
  const list = items.filter((x): x is PicInput => !!x);
  if (list.length === 0) return null;
  return (
    <div className='mt-2 flex flex-wrap justify-center gap-3'>
      {list.map((i) => (
        <NumIn key={i.label} input={i} />
      ))}
    </div>
  );
}

function Caption({ children }: { children: React.ReactNode }) {
  return (
    <p className='mt-1 text-center text-micro uppercase tracking-label text-labelColor tabular-nums'>
      {children}
    </p>
  );
}

const sheets = (n: number, x: number, y: number, w: number, fabric: FabricColours) =>
  Array.from({ length: Math.min(n, 12) }, (_, i) => (
    <rect
      key={i}
      x={x}
      y={y - i * 3}
      width={w}
      height={3}
      fill={i % 2 ? fabric.back : fabric.face}
      stroke={INK}
      strokeWidth={0.5}
      vectorEffect='non-scaling-stroke'
    />
  ));

export function SpreadChoicePicture(p: { kind: 'single' | 'table'; fabric: FabricColours }) {
  return (
    <Frame w={220} h={70}>
      <rect x={0} y={50} width={220} height={8} fill='none' stroke={INK} />
      {sheets(p.kind === 'single' ? 1 : 8, 20, 47, 180, p.fabric)}
    </Frame>
  );
}

export function TablePicture(p: {
  lengthCm: number;
  widthCm: number;
  maxStackCm?: number | null;
  length?: PicInput;
  width?: PicInput;
}) {
  const L = Math.max(p.lengthCm, 20);
  const W = Math.max(p.widthCm, 20);
  return (
    <div>
      <Frame w={L} h={W}>
        <rect x={0} y={0} width={L} height={W} fill='none' stroke={INK} />
      </Frame>
      <Caption>
        {p.lengthCm} × {p.widthCm} cm
        {p.maxStackCm != null ? ` · stack ≤ ${p.maxStackCm} cm` : ''}
      </Caption>
      <Inputs items={[p.length, p.width]} />
    </div>
  );
}

export function KnifePicture(p: { maxStackCm: PicInput; fabric: FabricColours }) {
  return (
    <div>
      <Frame w={200} h={80}>
        <rect x={0} y={70} width={200} height={6} fill='none' stroke={INK} />
        {sheets(8, 30, 67, 140, p.fabric)}
        <line x1={150} y1={10} x2={150} y2={70} stroke={INK} strokeWidth={2} />
      </Frame>
      <Inputs items={[p.maxStackCm]} />
    </div>
  );
}

export function GarmentPile(p: { colour: string; qty: number }) {
  const n = Math.min(p.qty, 6);
  return (
    <svg viewBox='0 0 40 40' className='h-10 w-10' aria-hidden>
      {Array.from({ length: Math.max(n, 1) }, (_, i) => (
        <rect
          key={i}
          x={6}
          y={26 - i * 3}
          width={28}
          height={10}
          fill={n === 0 ? 'none' : p.colour}
          stroke={RULE}
        />
      ))}
    </svg>
  );
}

export function LayersPicture(p: {
  tableLengthCm: number;
  tableWidthCm: number;
  clothWidthCm: number;
  layCm: number;
  endLossCm: number;
  plies: number;
  plySizes: string[];
  faceToFace: boolean;
  fabric: FabricColours;
  stackCm: number;
  stackOk: boolean;
}) {
  return (
    <div>
      <Frame w={220} h={70}>
        <rect x={0} y={60} width={220} height={6} fill='none' stroke={INK} />
        {sheets(
          p.plies,
          10,
          57,
          Math.min(200, (200 * p.layCm) / Math.max(p.tableLengthCm, 1)),
          p.fabric,
        )}
      </Frame>
      <Caption>
        {p.plySizes.join(' ') || '—'} · {Math.round(p.stackCm * 10) / 10} cm
        {p.stackOk ? '' : ' !'}
      </Caption>
    </div>
  );
}

export function EndsPicture(p: { endLoss: PicInput; fabric: FabricColours }) {
  return (
    <div>
      <Frame w={220} h={40}>
        <rect x={20} y={10} width={180} height={20} fill={p.fabric.face} stroke={INK} />
        <rect x={20} y={10} width={10} height={20} fill='none' stroke={BAD} />
        <rect x={190} y={10} width={10} height={20} fill='none' stroke={BAD} />
      </Frame>
      <Inputs items={[p.endLoss]} />
    </div>
  );
}

export function LayOnTablePicture(p: {
  mode: 'single' | 'table';
  tableLengthCm: number;
  tableWidthCm: number;
  clothWidthCm: number;
  markerLengthCm: number;
  endLossCm: number;
  plies: number;
  plySizes: string[];
  faceToFace: boolean;
  fabric: FabricColours;
  fits: boolean;
}) {
  const lay = p.markerLengthCm + 2 * p.endLossCm;
  const L = p.mode === 'table' ? Math.max(p.tableLengthCm, 1) : Math.max(lay, 1);
  const w = Math.min(240, (200 * lay) / L);
  return (
    <div>
      <Frame w={240} h={70}>
        {p.mode === 'table' && (
          <rect x={0} y={60} width={200} height={6} fill='none' stroke={INK} />
        )}
        {sheets(p.mode === 'table' ? p.plies : 1, 0, 57, w, p.fabric)}
        {!p.fits && <line x1={200} y1={20} x2={200} y2={66} stroke={BAD} strokeWidth={2} />}
      </Frame>
      <Caption>≈ {Math.round(lay) / 100} m</Caption>
    </div>
  );
}
