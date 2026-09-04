import {
  common_TechCardGarmentZone,
  common_TechCardMachineType,
  common_TechCardOperationType,
} from 'api/proto-http/admin';
import { useMemo } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { DataTable, EmptyCell } from 'ui/components/data-table';
import Input from 'ui/components/input';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';
import Textarea from 'ui/components/text-area';
import { newClientRequestId } from './design/use-design-band';
import { machineTypeLabelWithStitch, stitchTypeNumber } from './equipment-options';
import { operationHeading, seamClassLabel } from './operation-options';
import { TechCardFormData } from './schema';
import { useOperationWorkCatalog } from './useOperationWorkCatalog';

// C-7 · THE CALLOUT TABLE — «# / CALLOUT / FEATURE / DETAILS / STITCH» (owner's snapshot).
//
// THIS IS THE SECOND FACE OF THE CARD'S CALLOUTS, NOT A NEW TABLE. `callouts[]` already exists: it is
// drawn on the sketch (STUDIO / ARTIFACTS), printed on the seamstress sheet, and referenced by
// operations (`calloutNumber`) and cut pieces. Every column here is either one of its stored fields
// or a join to something that already names the callout:
//   #        — `number` (0 = not minted yet; the server numbers it on save)
//   callout  — `part`: what the note points at. Edited here and on ARTIFACTS — one field, two
//              surfaces. `parts[0]` is kept in step, because piece↔callout links go by name.
//   feature  — DERIVED: the heading of every operation pinned to this callout, exactly as the
//              operations rail words it. Nothing is stored; the link is the step's own pin select.
//   details  — `description` + `dimensions`, the two prose fields the callout already carries.
//   stitch   — DERIVED: the ISO 4915 number of each pinned step's machine (`stitchTypeNumber`, the
//              same derivation the printed sheet uses) and its ISO 4916 seam class.
// A hand-typed «feature» independent of the operations would be a NEW callout field; it is not
// invented here. The contract note for it is in the wave report.
//
// WHICH CALLOUTS. The seamstress-sheet predicate, verbatim from the tech pack: a callout pinned to a
// technical sketch, or pinned to nothing. Moodboard notes are numbered on their own board and are
// not construction.
//
// WRITES GO THROUGH `setValue` ON A PATH, never through a field array: `callouts` has ONE
// `useFieldArray` in the tree (the studio's), and in this RHF a second one over the same name would
// silently drop the first one's rows (rhf-fieldarray-mutations-dont-broadcast). ARTIFACTS writes
// the same way.

type FormCallout = NonNullable<TechCardFormData['callouts']>[number];
type FormOperation = NonNullable<TechCardFormData['operations']>[number];

/** The operations pinned to a callout number; 0 pins nothing (0 is «no pin», never «callout #0»). */
function pinnedOps(ops: FormOperation[], number: number): FormOperation[] {
  if (!number) return [];
  return ops.filter((o) => (o.calloutNumber ?? 0) === number);
}

export function ConstructionCalloutTable({ frozen }: { frozen: boolean }) {
  const { control, getValues, setValue } = useFormContext<TechCardFormData>();
  const callouts = (useWatch({ control, name: 'callouts' }) ?? []) as FormCallout[];
  const operations = (useWatch({ control, name: 'operations' }) ?? []) as FormOperation[];
  const technicalMedia = (useWatch({ control, name: 'technicalMedia' }) ?? []) as Array<{
    mediaId: number;
  }>;
  const { catalog: workCatalog } = useOperationWorkCatalog();

  const sketchMediaIds = useMemo(
    () => new Set(technicalMedia.map((m) => Number(m.mediaId) || 0)),
    [technicalMedia],
  );
  // Indexes into the form array — the write path needs the real index, not the filtered position.
  const rows = callouts
    .map((c, index) => ({ c, index }))
    .filter(({ c }) => {
      const mid = Number(c.mediaId) || 0;
      return mid === 0 || sketchMediaIds.has(mid);
    });

  const write = (index: number, field: 'part' | 'description' | 'dimensions', value: string) => {
    setValue(`callouts.${index}.${field}` as never, value as never, { shouldDirty: true });
    if (field === 'part') {
      // `part` echoes `parts[0]` — the pair is one link, said from the callout's side. Writing one
      // half and leaving the other would make the piece↔callout match depend on which surface last
      // touched the row.
      const parts = ((getValues(`callouts.${index}.parts` as never) as string[] | undefined) ?? []).slice();
      if (parts.length > 0 || value.trim()) {
        if (value.trim()) parts[0] = value;
        else parts.shift();
        setValue(`callouts.${index}.parts` as never, parts as never, { shouldDirty: true });
      }
    }
  };

  // «+ add callout row» — an UNPINNED callout: it is about the garment, not about a picture, and
  // the sheet prints it with the pinned ones. Pin it later from ARTIFACTS. Born exactly like the
  // sketch-born ones (zero number + client ref = «mint me»), and dropped on save if left empty (K-3).
  const addRow = () => {
    const cur = (getValues('callouts') ?? []) as FormCallout[];
    const born: FormCallout = {
      number: 0,
      part: '',
      parts: [],
      description: '',
      dimensions: '',
      mediaId: 0,
      posX: '',
      posY: '',
      kind: 'pin',
      points: [],
      color: '',
      dashed: false,
      filled: false,
      clientRef: newClientRequestId(),
    };
    setValue('callouts', [...cur, born] as never, { shouldDirty: true });
  };

  return (
    <Section
      title='callouts'
      question='— every numbered note on the sketch, with the step and the stitch behind it'
      action={
        !frozen ? (
          <Button type='button' variant='secondary' size='sm' data-c19-add-callout='' onClick={addRow}>
            + add callout row
          </Button>
        ) : undefined
      }
    >
      <div data-c19-callouts=''>
        {rows.length === 0 ? (
          <Text size='micro' variant='label' data-c19-callouts-empty=''>
            no callouts yet — draw them on the sketch from ARTIFACTS, or add a row here and pin it later
          </Text>
        ) : (
          <DataTable>
            <thead>
              <tr>
                <th className='w-8'>#</th>
                <th data-align='left'>callout</th>
                <th data-align='left'>feature</th>
                <th data-align='left'>details</th>
                <th data-align='left'>stitch</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ c, index }) => {
                const number = c.number || 0;
                const ops = pinnedOps(operations, number);
                const extraParts = (c.parts ?? []).slice(1).filter((p) => p.trim());
                return (
                  <tr key={c.clientRef || `n${number}` || index} data-c19-callout-row={index}>
                    <td className='align-top'>
                      {number > 0 ? (
                        <Text component='span' className='font-bold tabular-nums' data-c19-callout-number={number}>
                          {number}
                        </Text>
                      ) : (
                        <Text component='span' size='micro' variant='label' data-c19-callout-number='0'>
                          new
                        </Text>
                      )}
                    </td>
                    <td data-align='left' className='min-w-[160px]'>
                      <Input
                        name={`c19-callout-${index}-part`}
                        value={c.part ?? ''}
                        disabled={frozen}
                        placeholder='what it points at'
                        data-c19-callout-part={index}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          write(index, 'part', e.target.value)
                        }
                      />
                      {extraParts.length > 0 && (
                        <Text size='micro' variant='label' className='mt-0.5'>
                          + {extraParts.join(', ')}
                        </Text>
                      )}
                    </td>
                    <td data-align='left' className='min-w-[160px]' data-c19-callout-feature={index}>
                      {ops.length === 0 ? (
                        <EmptyCell />
                      ) : (
                        <div className='space-y-0.5'>
                          {ops.map((o, k) => (
                            <Text key={k} component='p'>
                              {operationHeading({
                                operationType: o.operationType as common_TechCardOperationType,
                                machineType: o.machineType as common_TechCardMachineType,
                                zone: o.zone as common_TechCardGarmentZone,
                                seamClass: o.seamClass,
                                pieceNames: [],
                                note: o.note,
                                work: o.work,
                                workCatalog,
                              })}
                            </Text>
                          ))}
                        </div>
                      )}
                    </td>
                    <td data-align='left' className='min-w-[220px]'>
                      <div className='space-y-1'>
                        <Textarea
                          name={`c19-callout-${index}-description`}
                          value={c.description ?? ''}
                          disabled={frozen}
                          rows={2}
                          autoGrow={false}
                          placeholder='what is done here'
                          data-c19-callout-description={index}
                          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                            write(index, 'description', e.target.value)
                          }
                        />
                        <Input
                          name={`c19-callout-${index}-dimensions`}
                          value={c.dimensions ?? ''}
                          disabled={frozen}
                          placeholder='dimensions'
                          data-c19-callout-dimensions={index}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            write(index, 'dimensions', e.target.value)
                          }
                        />
                      </div>
                    </td>
                    <td data-align='left' data-c19-callout-stitch={index}>
                      <StitchCards ops={ops} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        )}
        <Text size='micro' variant='label' className='mt-1.5'>
          feature and stitch come from the steps pinned to the callout on the operations rail; a
          row left with no text is dropped on save
        </Text>
      </div>
    </Section>
  );
}

// ISO 4915 stitch cards for the pinned steps. A step whose machine makes no stitch (a press, a
// hand step) has no card and is not invented one; a step whose overlock has not said its thread
// count has no number yet and says so, rather than guessing between 504 / 514 / 516.
function StitchCards({ ops }: { ops: FormOperation[] }) {
  if (ops.length === 0) return <EmptyCell />;
  const cards = ops
    .map((o) => ({
      iso: stitchTypeNumber(o.machineType, o.threadCount),
      machine: machineTypeLabelWithStitch(o.machineType, o.threadCount),
      seam: seamClassLabel(o.seamClass).split(' — ')[0] ?? '',
    }))
    .filter((c) => c.iso || c.machine);
  if (cards.length === 0) return <EmptyCell>no stitch</EmptyCell>;
  return (
    <div className='flex flex-wrap gap-1'>
      {cards.map((c, k) => (
        <span
          key={k}
          className='inline-flex min-w-[52px] flex-col border border-borderColor px-1.5 py-0.5'
          data-c19-stitch={c.iso || 'none'}
          title={c.machine}
        >
          <Text component='span' size='control' className='font-bold tabular-nums'>
            {c.iso || '—'}
          </Text>
          <Text component='span' size='nano' variant='label' className='uppercase'>
            {c.seam || c.machine.replace(/\s+\d[\d\s/]*$/, '')}
          </Text>
        </span>
      ))}
    </div>
  );
}
