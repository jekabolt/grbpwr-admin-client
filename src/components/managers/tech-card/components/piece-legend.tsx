import { Accordion } from 'ui/components/accordion';
import { GroupLabel } from 'ui/components/group-label';
import { Row } from 'ui/components/row';
import Text from 'ui/components/text';
import { pieceBaseCodes, pieceModifiers } from './piece-codes';

// Collapsible glossary of the pattern-piece abbreviation system, so codes written on the
// flat and referenced in operations read the same to everyone. Static reference (the
// modifiers are universal; the base codes are the brand's standard set). Shown on both the
// PIECES tab (beside the table you type codes into) and the CONSTRUCTION tab (beside the
// operations that reference them) — the same component, so the vocabulary cannot drift.
export function PieceLegend() {
  return (
    <Accordion
      title={
        <Text size='control' variant='uppercase' tracking='label' component='span'>
          обозначения деталей
        </Text>
      }
      meta={
        <Text size='micro' variant='label' component='span'>
          {pieceBaseCodes.length} кодов
        </Text>
      }
    >
      <div className='grid gap-x-2.5 sm:grid-cols-2'>
        {pieceBaseCodes.map((p) => (
          <Row
            key={p.code}
            label={<span className='font-bold'>{p.code}</span>}
            value={
              <Text size='micro' variant='label' component='span'>
                {p.name}
              </Text>
            }
          />
        ))}
      </div>

      <GroupLabel>модификаторы</GroupLabel>
      {pieceModifiers.map((m) => (
        <Row
          key={m.mod}
          label={<span className='font-bold'>{m.mod}</span>}
          value={
            <Text size='micro' variant='label' component='span'>
              {m.name}
            </Text>
          }
        />
      ))}

      <Text size='micro' variant='label' className='mt-1.5'>
        {'коды комбинируются: FP_R_1 · PCK_f · BP_L<M>'}
      </Text>
    </Accordion>
  );
}
