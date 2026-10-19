import { useState } from 'react';
import { Arrow, Avatar, AvatarPicker, Canvas, GrbpwrMark, Media, Pin, RatioGlyph } from 'ui';
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

export const mediaDemos: KitDemo[] = [
  { names: ['Media'], Demo: MediaDemo },
  { names: ['Canvas', 'Pin'], Demo: CanvasDemo },
  { names: ['Avatar', 'AvatarPicker'], Demo: AvatarDemo },
  { names: ['RatioGlyph'], Demo: RatioGlyphDemo },
  { names: ['Arrow', 'GrbpwrMark'], Demo: IconsDemo },
];
