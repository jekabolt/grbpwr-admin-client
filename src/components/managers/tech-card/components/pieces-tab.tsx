import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { pieceCodeOptions } from './piece-codes';
import { TechCardFormData } from './schema';

const cell = 'w-full border border-textInactiveColor bg-bgColor px-2 py-1 text-textBaseSize';
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
const SECTION_SHORT: Record<string, string> = {
  TECH_CARD_BOM_SECTION_FABRIC: 'fabric',
  TECH_CARD_BOM_SECTION_LINING: 'lining',
  TECH_CARD_BOM_SECTION_INTERLINING: 'interlining',
  TECH_CARD_BOM_SECTION_INSULATION: 'insulation',
};
const grainlineOptions = ['lengthwise', 'crosswise', 'bias'];

type FormPiece = NonNullable<TechCardFormData['pieces']>[number];
type FormMaterial = NonNullable<FormPiece['materials']>[number];

// Cut-piece details (детали кроя) + the piece × colourway fabric map (NF-05). Pieces are positional:
// removing one renumbers usages.pieceIndex here; BOM/colourway removals renumber the map cells from
// the BOM / colourways tabs (nf05-01). The map stores a sparse materials list keyed by colorwayIndex.
export function PiecesTab() {
  const { control, getValues, setValue } = useFormContext<TechCardFormData>();
  const { fields, append, remove } = useFieldArray({ control, name: 'pieces' });
  const pieces = (useWatch({ control, name: 'pieces' }) ?? []) as FormPiece[];
  const colorways = (useWatch({ control, name: 'colorways' }) ?? []) as Array<{
    code?: string;
    name?: string;
  }>;
  const bomItems = (useWatch({ control, name: 'bomItems' }) ?? []) as Array<{
    name?: string;
    section?: string;
  }>;

  const bomLabel = (gi: number) => {
    const b = bomItems[gi];
    if (!b) return `#${gi + 1}`;
    const section = b.section ? ` · ${SECTION_SHORT[b.section] ?? ''}` : '';
    return `${b.name?.trim() || `#${gi + 1}`}${section}`;
  };
  const optionsForSections = (sections: string[]) => [
    { value: -1, label: '— none —' },
    ...bomItems
      .map((b, gi) => ({ b, gi }))
      .filter(({ b }) => sections.includes(b.section ?? ''))
      .map(({ gi }) => ({ value: gi, label: bomLabel(gi) })),
  ];
  const fabricOptions = optionsForSections(FABRIC_SECTIONS);
  const fusingOptions = optionsForSections(FUSING_SECTIONS);
  // Keep the currently-mapped article selectable even if its BOM section was later changed out of
  // the filtered set, so editing a section never silently blanks a cell's stored choice.
  const withCurrent = (options: { value: number; label: string }[], current: number) =>
    current < 0 || options.some((o) => o.value === current)
      ? options
      : [...options, { value: current, label: bomLabel(current) }];

  // Fabric-map cell read/write. materials is sparse — a colourway with no entry is unmapped.
  const cellFor = (pi: number, ci: number) =>
    (pieces[pi]?.materials ?? []).find((m) => (m.colorwayIndex ?? 0) === ci);
  const setCell = (pi: number, ci: number, patch: Partial<FormMaterial>) => {
    const materials = (getValues(`pieces.${pi}.materials`) ?? []) as FormMaterial[];
    const at = materials.findIndex((m) => (m.colorwayIndex ?? 0) === ci);
    const nextEntry: FormMaterial =
      at >= 0
        ? { ...materials[at], ...patch }
        : { colorwayIndex: ci, bomItemIndex: -1, fusingBomItemIndex: -1, note: '', ...patch };
    const next =
      at >= 0 ? materials.map((m, i) => (i === at ? nextEntry : m)) : [...materials, nextEntry];
    setValue(`pieces.${pi}.materials`, next, { shouldDirty: true });
  };

  // Removing a piece shifts every usage's pieceIndex — renumber so a "norm per piece" never points
  // at the wrong detail (nf05-01).
  const removePiece = (pi: number) => {
    const cws = (getValues('colorways') ?? []) as TechCardFormData['colorways'];
    (cws ?? []).forEach((c, ci) => {
      (c.usages ?? []).forEach((u, ui) => {
        const idx = u.pieceIndex ?? -1;
        if (idx === pi) {
          setValue(`colorways.${ci}.usages.${ui}.pieceIndex`, -1, { shouldDirty: true });
        } else if (idx > pi) {
          setValue(`colorways.${ci}.usages.${ui}.pieceIndex`, idx - 1, { shouldDirty: true });
        }
      });
    });
    remove(pi);
  };

  const addPiece = () =>
    append({
      name: '',
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
                          list='piece-code-suggestions'
                          value={p.name ?? ''}
                          onChange={(e) =>
                            setValue(`pieces.${pi}.name`, e.target.value, { shouldDirty: true })
                          }
                          placeholder='FP front piece'
                        />
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
                  {colorways.map((c, ci) => (
                    <th key={ci} className={th}>
                      {c.code?.trim() || c.name?.trim() || `#${ci + 1}`}
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
                      {colorways.map((_, ci) => {
                        const c = cellFor(pi, ci);
                        const fabricVal = c?.bomItemIndex ?? -1;
                        const fusingVal = c?.fusingBomItemIndex ?? -1;
                        const missingFusing = !!p.fused && fusingVal < 0;
                        return (
                          <td key={ci} className={td}>
                            <div className='flex flex-col gap-1'>
                              <select
                                className={cell}
                                value={fabricVal}
                                onChange={(e) =>
                                  setCell(pi, ci, { bomItemIndex: Number(e.target.value) })
                                }
                              >
                                {withCurrent(fabricOptions, fabricVal).map((o) => (
                                  <option key={o.value} value={o.value}>
                                    {o.label}
                                  </option>
                                ))}
                              </select>
                              {p.fused && (
                                <div className='flex items-center gap-1'>
                                  <select
                                    className={cell}
                                    value={fusingVal}
                                    onChange={(e) =>
                                      setCell(pi, ci, {
                                        fusingBomItemIndex: Number(e.target.value),
                                      })
                                    }
                                  >
                                    {withCurrent(fusingOptions, fusingVal).map((o) => (
                                      <option key={o.value} value={o.value}>
                                        {o.value === -1 ? '— fusing —' : o.label}
                                      </option>
                                    ))}
                                  </select>
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
