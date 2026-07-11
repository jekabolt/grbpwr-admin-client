import { useState } from 'react';
import Text from 'ui/components/text';
import { pieceBaseCodes, pieceModifiers } from './piece-codes';

// Collapsible glossary of the pattern-piece abbreviation system, so codes written on the
// flat and referenced in operations read the same to everyone. Static reference (the
// modifiers are universal; the base codes are the brand's standard set).
export function PieceLegend() {
  const [open, setOpen] = useState(false);

  return (
    <div className='border border-textInactiveColor p-4'>
      <button
        type='button'
        onClick={() => setOpen((o) => !o)}
        className='flex w-full items-center justify-between'
        aria-expanded={open}
      >
        <Text variant='uppercase' size='large'>
          обозначения деталей
        </Text>
        <Text>{open ? '▴' : '▾'}</Text>
      </button>

      {open && (
        <div className='mt-4 space-y-3'>
          <div className='grid grid-cols-2 gap-x-4 gap-y-1'>
            {pieceBaseCodes.map((p) => (
              <div key={p.code} className='flex items-baseline gap-2 text-textBaseSize'>
                <span className='font-mono'>{p.code}</span>
                <span className='truncate text-textInactiveColor'>{p.name}</span>
              </div>
            ))}
          </div>

          <div className='space-y-1 border-t border-textInactiveColor pt-2'>
            {pieceModifiers.map((m) => (
              <div key={m.mod} className='flex items-baseline gap-2 text-textBaseSize'>
                <span className='font-mono'>{m.mod}</span>
                <span className='text-textInactiveColor'>{m.name}</span>
              </div>
            ))}
          </div>

          <Text variant='inactive' size='small'>
            {'коды комбинируются: FP_R_1 · PCK_f · BP_L<M>'}
          </Text>
        </div>
      )}
    </div>
  );
}
