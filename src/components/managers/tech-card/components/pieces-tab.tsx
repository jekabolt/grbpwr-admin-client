import { common_TechCard } from 'api/proto-http/admin';
import { useMemo } from 'react';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { ulid } from 'utils/ulid';
import { BomLineSelect } from './bom-line-picker';
import { pieceCodeOptions } from './piece-codes';
import { normalizePieceName } from './piece-picker';
import { TechCardFormData } from './schema';

const cell =
  'w-full border border-textInactiveColor bg-bgColor px-2 py-1 text-textBaseSize aria-[invalid=true]:border-error';
const th =
  'border border-textInactiveColor bg-textInactiveColor/20 px-2 py-1 text-left text-textBaseSize uppercase';
const td = 'border border-textInactiveColor px-1 py-1 align-top';

// Cut-piece detail = one pattern part (деталь кроя). The fabric map's cells reference BOM lines from
// the body-fabric sections; fusing draws from interlining.
const FABRIC_SECTIONS = [
  'TECH_CARD_BOM_SECTION_FABRIC',
  'TECH_CARD_BOM_SECTION_LINING',
  'TECH_CARD_BOM_SECTION_INTERLINING',
  'TECH_CARD_BOM_SECTION_INSULATION',
];
const FUSING_SECTIONS = ['TECH_CARD_BOM_SECTION_INTERLINING'];
const grainlineOptions = ['lengthwise', 'crosswise', 'bias'];

type FormPiece = NonNullable<TechCardFormData['pieces']>[number];
type FormMaterial = NonNullable<FormPiece['materials']>[number];

// Cut-piece details (детали кроя) + the piece × colourway fabric map (NF-05). Pieces are positional.
// The map stores a sparse materials list keyed by the colourway id (pieceMaterial.colorwayIndex holds
// colorway_id on the wire, schema.ts); a colourway with no entry is unmapped.
export function PiecesTab({ techCard }: { techCard?: common_TechCard }) {
  const { control, getValues, setValue } = useFormContext<TechCardFormData>();
  const { fields, append, remove } = useFieldArray({ control, name: 'pieces' });
  const pieces = (useWatch({ control, name: 'pieces' }) ?? []) as FormPiece[];
  // NF-05 fix (M8): the fabric-map columns are the style's REAL colourways (techCard.colorways,
  // AdminColorwayRef[]) — the RHF `colorways` form array is permanently [] since colourways became
  // products. Reading form state here left the whole section un-populatable regardless of how many
  // colourways existed.
  const colorways = techCard?.colorways ?? [];
  const bomItems = (useWatch({ control, name: 'bomItems' }) ?? []) as Array<{
    name?: string;
    section?: string;
  }>;

  // Fabric-map cell read/write, keyed by the real colourway id (nf05-01: resolve to the id, never a
  // positional index — the cell must stay attached to the colourway that was picked, not whatever
  // sits at that array position). materials is sparse — a colourway with no entry is unmapped.
  const cellFor = (pi: number, colorwayId: number) =>
    (pieces[pi]?.materials ?? []).find((m) => (m.colorwayIndex ?? 0) === colorwayId);
  const setCell = (pi: number, colorwayId: number, patch: Partial<FormMaterial>) => {
    const materials = (getValues(`pieces.${pi}.materials`) ?? []) as FormMaterial[];
    const at = materials.findIndex((m) => (m.colorwayIndex ?? 0) === colorwayId);
    const nextEntry: FormMaterial =
      at >= 0
        ? { ...materials[at], ...patch }
        : { colorwayIndex: colorwayId, bomLineKey: '', fusingBomLineKey: '', note: '', ...patch };
    const next =
      at >= 0 ? materials.map((m, i) => (i === at ? nextEntry : m)) : [...materials, nextEntry];
    setValue(`pieces.${pi}.materials`, next, { shouldDirty: true });
  };

  // Usage.pieceIndex renumbering on piece removal now belongs to the colourway recipe (server-owned,
  // edited via UpdateColorwayRecipe) — the RHF `colorways` array is always empty, so the old
  // form-state renumbering loop was dead. Just drop the piece row here.
  const removePiece = (pi: number) => remove(pi);

  // Duplicate CODE / NAME rows, case-insensitively. A piece name is how a human addresses the part
  // in the operation picker, the recipe norm and the factory sheet, so two rows called «полочка»
  // make every one of those references ambiguous. Flagged here on the field (the server rejects the
  // save with the same rule, so catching it at the source beats a blocked save later).
  const duplicateRows = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of pieces) {
      const key = normalizePieceName(p.name ?? '');
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return new Set(
      pieces
        .map((p, i) => ((counts.get(normalizePieceName(p.name ?? '')) ?? 0) > 1 ? i : -1))
        .filter((i) => i >= 0),
    );
  }, [pieces]);

  // A new row is minted with its stable lineKey up front, NOT left for the save mapper: the
  // operation and recipe pickers can only offer a piece that already has one, so without it a part
  // added here stayed unlinkable until the card had been saved and reloaded.
  const addPiece = () =>
    append({
      name: '',
      lineKey: ulid(),
      piecesPerGarment: 1,
      mirrored: false,
      grainline: '',
      fused: false,
      calloutNumber: 0,
      note: '',
      materials: [],
    });

  return (
    <div className='flex flex-col gap-6'>
      <datalist id='piece-code-suggestions'>
        {pieceCodeOptions.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <datalist id='grainline-suggestions'>
        {grainlineOptions.map((g) => (
          <option key={g} value={g} />
        ))}
      </datalist>

      {/* PIECES table */}
      <section className='flex flex-col gap-2 border border-textInactiveColor p-4'>
        <div className='flex items-center justify-between'>
          <Text variant='uppercase' size='large'>
            pieces (детали кроя)
          </Text>
          <Button type='button' variant='main' size='lg' className='uppercase' onClick={addPiece}>
            + piece
          </Button>
        </div>
        {fields.length === 0 ? (
          <Text variant='inactive' size='small'>
            no pieces yet — add the pattern parts that get cut (front, back, collar…)
          </Text>
        ) : (
          <div className='overflow-x-auto'>
            <table className='w-full min-w-max border-collapse'>
              <thead>
                <tr>
                  <th className={th}>code / name</th>
                  <th className={th}>per garment</th>
                  <th className={th}>mirrored</th>
                  <th className={th}>grainline</th>
                  <th className={th}>fused</th>
                  <th className={th}>callout #</th>
                  <th className={th}>note</th>
                  <th className={th} />
                </tr>
              </thead>
              <tbody>
                {fields.map((f, pi) => {
                  const p = pieces[pi] ?? {};
                  return (
                    <tr key={f.id}>
                      <td className={td}>
                        <input
                          className={`${cell} w-40`}
                          data-field={`pieces.${pi}.name`}
                          aria-invalid={duplicateRows.has(pi)}
                          list='piece-code-suggestions'
                          value={p.name ?? ''}
                          onChange={(e) =>
                            setValue(`pieces.${pi}.name`, e.target.value, { shouldDirty: true })
                          }
                          placeholder='FP front piece'
                        />
                        {duplicateRows.has(pi) && (
                          <Text size='small' className='text-error'>
                            такая деталь уже есть — имя должно быть уникальным
                          </Text>
                        )}
                      </td>
                      <td className={td}>
                        <input
                          className={`${cell} w-20`}
                          type='number'
                          min='1'
                          value={p.piecesPerGarment ?? 1}
                          onChange={(e) =>
                            setValue(`pieces.${pi}.piecesPerGarment`, Number(e.target.value) || 1, {
                              shouldDirty: true,
                            })
                          }
                        />
                      </td>
                      <td className={`${td} text-center`}>
                        <input
                          type='checkbox'
                          checked={!!p.mirrored}
                          onChange={(e) =>
                            setValue(`pieces.${pi}.mirrored`, e.target.checked, {
                              shouldDirty: true,
                            })
                          }
                        />
                      </td>
                      <td className={td}>
                        <input
                          className={`${cell} w-28`}
                          list='grainline-suggestions'
                          value={p.grainline ?? ''}
                          onChange={(e) =>
                            setValue(`pieces.${pi}.grainline`, e.target.value, {
                              shouldDirty: true,
                            })
                          }
                          placeholder='lengthwise'
                        />
                      </td>
                      <td className={`${td} text-center`}>
                        <input
                          type='checkbox'
                          checked={!!p.fused}
                          onChange={(e) =>
                            setValue(`pieces.${pi}.fused`, e.target.checked, { shouldDirty: true })
                          }
                        />
                      </td>
                      <td className={td}>
                        <input
                          className={`${cell} w-16`}
                          type='number'
                          min='0'
                          value={p.calloutNumber || 0}
                          onChange={(e) =>
                            setValue(`pieces.${pi}.calloutNumber`, Number(e.target.value) || 0, {
                              shouldDirty: true,
                            })
                          }
                        />
                      </td>
                      <td className={td}>
                        <input
                          className={`${cell} w-48`}
                          value={p.note ?? ''}
                          onChange={(e) =>
                            setValue(`pieces.${pi}.note`, e.target.value, { shouldDirty: true })
                          }
                        />
                      </td>
                      <td className={`${td} text-center`}>
                        <Button
                          type='button'
                          variant='secondary'
                          aria-label='remove piece'
                          onClick={() => removePiece(pi)}
                        >
                          ✕
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* FABRIC MAP */}
      <section className='flex flex-col gap-2 border border-textInactiveColor p-4'>
        <Text variant='uppercase' size='large'>
          fabric map (piece × colourway)
        </Text>
        {fields.length === 0 ? (
          <Text variant='inactive' size='small'>
            add pieces above to map their fabrics
          </Text>
        ) : colorways.length === 0 ? (
          <Text variant='inactive' size='small'>
            add colourways (colorways tab) to map fabrics per colour
          </Text>
        ) : bomItems.length === 0 ? (
          <Text variant='inactive' size='small'>
            add fabric / lining articles (BOM tab) to pick from
          </Text>
        ) : (
          <div className='overflow-x-auto'>
            <table className='w-full min-w-max border-collapse'>
              <thead>
                <tr>
                  <th className={th}>piece</th>
                  {colorways.map((c) => (
                    <th key={c.colorwayId} className={th}>
                      {c.colorCode?.trim() || c.baseSku?.trim() || `#${c.colorwayId}`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fields.map((f, pi) => {
                  const p = pieces[pi] ?? {};
                  return (
                    <tr key={f.id}>
                      <td className={`${td} whitespace-nowrap`}>
                        <Text size='small'>{p.name?.trim() || `piece ${pi + 1}`}</Text>
                      </td>
                      {colorways.map((cw) => {
                        const cwId = cw.colorwayId ?? 0;
                        const c = cellFor(pi, cwId);
                        const fabricVal = c?.bomLineKey ?? '';
                        const fusingVal = c?.fusingBomLineKey ?? '';
                        const missingFusing = !!p.fused && !fusingVal;
                        return (
                          <td key={cwId} className={td}>
                            <div className='flex flex-col gap-1'>
                              <BomLineSelect
                                value={fabricVal}
                                onChange={(lk) => setCell(pi, cwId, { bomLineKey: lk })}
                                sections={FABRIC_SECTIONS}
                                noneLabel='— fabric —'
                              />
                              {p.fused && (
                                <div className='flex items-center gap-1'>
                                  <BomLineSelect
                                    value={fusingVal}
                                    onChange={(lk) => setCell(pi, cwId, { fusingBomLineKey: lk })}
                                    sections={FUSING_SECTIONS}
                                    noneLabel='— fusing —'
                                  />
                                  {missingFusing && (
                                    <span className='text-error' title='fused piece needs a fusing'>
                                      !
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
