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
          piece codes
        </Text>
      }
      meta={
        <Text size='micro' variant='label' component='span'>
          {pieceBaseCodes.length} codes
        </Text>
      }
    >
      {/* TWO COLUMNS FROM `sm` UP, AND THE LAST VISUAL ROW ENDS IN AIR (O-48 review). `Row` rules
          itself by its next sibling, which in a two-up grid is its NEIGHBOUR ACROSS, not the row
          below: the last code went bare while the one beside it kept a half-width rule. The
          penultimate code sits in the last visual row exactly when it opens that row (an odd
          position), and then it drops its rule too; below `sm` the grid is one column and the
          plain rule holds. */}
      <div className='grid gap-x-2.5 sm:grid-cols-2'>
        {pieceBaseCodes.map((p) => (
          <Row
            key={p.code}
            className='sm:[&:nth-last-child(2):nth-child(odd)]:border-b-0'
            label={<span className='font-bold'>{p.code}</span>}
            value={
              <Text size='micro' variant='label' component='span'>
                {p.name}
              </Text>
            }
          />
        ))}
      </div>

      <GroupLabel>modifiers</GroupLabel>
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
        {'codes combine: FP_R_1 · PCK_F · SL_R_B_1_# · BP_L_M (size last)'}
      </Text>
    </Accordion>
  );
}
