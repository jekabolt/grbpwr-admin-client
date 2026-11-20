import { useState } from 'react';
import {
  Arrow,
  Avatar,
  AvatarPicker,
  Canvas,
  DateScrubber,
  GrbpwrMark,
  Media,
  PersonName,
  Pin,
  RatioGlyph,
  scrubLabel,
  useMonthIndex,
  type ScrubMonth,
} from 'ui';
import { KitDemo, KitLines, KitMatrix } from './kit-entry';

// A file this app serves itself: no network beyond the page, so the screenshot stays stable.
const SAMPLE_SRC = '/favico.svg';

function MediaDemo() {
  return (
    <KitMatrix
      cols={['4/5 cover', '1/1 contain', '3/4 contain']}
      rows={[
        {
          label: 'image',
          cells: [
            <div className='w-24 border border-borderColor'>
              <Media src={SAMPLE_SRC} alt='mark' />
            </div>,
            <div className='w-24 border border-borderColor'>
              <Media src={SAMPLE_SRC} alt='mark' aspectRatio='1/1' fit='contain' />
            </div>,
            <div className='w-24 border border-borderColor'>
              <Media src={SAMPLE_SRC} alt='mark' aspectRatio='3/4' fit='contain' />
            </div>,
          ],
        },
      ]}
    />
  );
}

function CanvasDemo() {
  return (
    <KitMatrix
      cols={['3/4', '4/3']}
      rows={[
        {
          label: 'pins',
          cells: [
            <Canvas className='w-40'>
              <Pin x={30} y={25} label={1} />
              <Pin x={60} y={55} label={2} highlighted />
            </Canvas>,
            <Canvas aspect='4/3' className='w-52'>
              <Pin x={50} y={50} label={3} />
            </Canvas>,
          ],
        },
      ]}
    />
  );
}

// a grey head-and-shoulders square, drawn inline (no network in the kit)
const KIT_PHOTO = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" fill="gainsboro"/><path d="M12 5a4 4 0 1 1 0 8 4 4 0 0 1 0-8Zm-8 19c0-5 3.6-8 8-8s8 3 8 8Z" fill="gray"/></svg>',
)}`;

function AvatarDemo() {
  const [who, setWho] = useState<string | undefined>('anna kim');
  return (
    <KitLines
      lines={[
        {
          label: 'sizes',
          content: (
            <div className='flex items-center gap-2'>
              <Avatar name='anna kim' />
              <Avatar name='boris' size={28} />
              <Avatar name='li wei' size={40} />
              <Avatar />
            </div>
          ),
        },
        {
          label: 'photo',
          content: (
            <div className='flex items-center gap-2'>
              <Avatar name='mira lund' src={KIT_PHOTO} size={28} />
              <Avatar name='mira lund' src='/missing.png' size={28} />
            </div>
          ),
        },
        {
          label: 'person name',
          content: (
            <div className='flex flex-col gap-1'>
              <PersonName name='mira lund' username='mira.k' />
              <PersonName name='mira lund' username='mira.k' short />
              <PersonName username='teo' />
              <PersonName fallback='jekabolt' />
            </div>
          ),
        },
        {
          label: 'picker',
          content: (
            <AvatarPicker
              people={[
                { name: 'anna kim', count: 4 },
                { name: 'boris', count: 2 },
              ]}
              selected={who}
              onSelect={setWho}
            />
          ),
        },
      ]}
    />
  );
}

function RatioGlyphDemo() {
  const ratios = ['3:4', '4:3', '1:1', '16:9'];
  return (
    <KitMatrix
      cols={ratios}
      rows={[
        { label: '12', cells: ratios.map((r) => <RatioGlyph ratio={r} />) },
        { label: '24', cells: ratios.map((r) => <RatioGlyph ratio={r} size={24} />) },
      ]}
    />
  );
}

function IconsDemo() {
  return (
    <KitLines
      lines={[
        {
          label: 'Arrow',
          content: (
            <div className='flex items-center gap-2'>
              <Arrow />
              <Arrow className='rotate-180 text-labelColor' />
            </div>
          ),
        },
        {
          label: 'GrbpwrMark',
          content: (
            <div className='flex items-center gap-2'>
              <GrbpwrMark className='h-6 w-6' />
              <GrbpwrMark className='h-10 w-10' />
            </div>
          ),
        },
      ]}
    />
  );
}

// Fixed sample library, newest first; a quiet month in the middle shows the greyed sheet cell.
const SCRUB_MONTHS: ScrubMonth[] = [
  { year: 2026, month: 10, count: 14 },
  { year: 2026, month: 9, count: 31 },
  { year: 2026, month: 8, count: 0 },
  { year: 2026, month: 7, count: 9 },
  { year: 2026, month: 2, count: 40 },
  { year: 2025, month: 11, count: 12 },
  { year: 2025, month: 2, count: 22 },
];
const SCRUB_ROW = 24;

// The pill appears on a touch screen only; on a mouse the list keeps its native scrollbar.
function DateScrubberDemo() {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const index = useMonthIndex(SCRUB_MONTHS);
  const rows = SCRUB_MONTHS.flatMap((m) =>
    Array.from({ length: m.count }, (_, i) => `${scrubLabel(m.year, m.month)} · ${i + 1}`),
  );
  return (
    <div ref={setEl} className='h-40 overflow-y-auto border border-borderColor'>
      {rows.map((r) => (
        <div key={r} className='border-b border-hairline px-2.5 leading-6 tabular-nums'>
          {r}
        </div>
      ))}
      <DateScrubber
        scrollEl={el}
        months={SCRUB_MONTHS}
        labelAt={(top) => index.monthAt(Math.floor(top / (SCRUB_ROW + 1)))}
        offsetToScrollTop={(offset) => offset * (SCRUB_ROW + 1)}
      />
    </div>
  );
}

export const mediaDemos: KitDemo[] = [
  { names: ['Media'], Demo: MediaDemo },
  { names: ['Canvas', 'Pin'], Demo: CanvasDemo },
  { names: ['Avatar', 'AvatarPicker'], Demo: AvatarDemo },
  { names: ['RatioGlyph'], Demo: RatioGlyphDemo },
  { names: ['DateScrubber'], Demo: DateScrubberDemo, keywords: ['scrubber', 'date', 'month'] },
  { names: ['Arrow', 'GrbpwrMark'], Demo: IconsDemo },
];
