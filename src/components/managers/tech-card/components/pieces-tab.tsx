import { common_MediaFull, common_TechCard } from 'api/proto-http/admin';
import { useMemo, useState } from 'react';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { Canvas, Pin } from 'ui/components/canvas';
import { DataTable } from 'ui/components/data-table';
import Input from 'ui/components/input';
import { Pill } from 'ui/components/pill';
import GenericPopover from 'ui/components/popover';
import { SectionHeader } from 'ui/components/section-header';
import Text from 'ui/components/text';
import { ulid } from 'utils/ulid';
import { grainlineArrow, grainlineOptions, pieceCodeOptions } from './piece-codes';
import { normalizePieceName } from './piece-picker';
import { TechCardFormData } from './schema';
import { useCrossHighlight } from './useCrossHighlight';

// Cut-piece detail = one pattern part (деталь кроя). The fabric map's cells reference BOM lines from
// the body-fabric sections; fusing draws from interlining.
const FABRIC_SECTIONS = [
  'TECH_CARD_BOM_SECTION_FABRIC',
  'TECH_CARD_BOM_SECTION_LINING',
  'TECH_CARD_BOM_SECTION_INTERLINING',
  'TECH_CARD_BOM_SECTION_INSULATION',
];
const FUSING_SECTIONS = ['TECH_CARD_BOM_SECTION_INTERLINING'];

type FormPiece = NonNullable<TechCardFormData['pieces']>[number];
type FormMaterial = NonNullable<FormPiece['materials']>[number];
type FormCallout = {
  number?: number;
  mediaId?: number;
  part?: string;
  posX?: string;
  posY?: string;
};

const colorwayLabel = (c: { colorwayId?: number; colorCode?: string; baseSku?: string }) =>
  c.colorCode?.trim() || c.baseSku?.trim() || `#${c.colorwayId ?? 0}`;

// The marker diagram beside the table (13.1). Grainline and mirroring are GEOMETRY — a picture
// verifies them faster than a column of words — so the callout number each piece already carries is
// drawn where the sketch says it lives. Pins are positioned against the image's own box (not a
// fixed-aspect frame) because callout posX/posY are fractions OF THE IMAGE: letterboxing a
// 4:3 sketch inside a 3:4 frame would slide every pin off the part it names.
function PieceDiagram({
  techCard,
  pinnedNumbers,
  labelForPin,
  activePin,
  onActivePinChange,
}: {
  techCard?: common_TechCard;
  pinnedNumbers: Set<number>;
  labelForPin: (n: number) => string;
  activePin: number | null;
  onActivePinChange: (n: number | null) => void;
}) {
  const { control } = useFormContext<TechCardFormData>();
  const callouts = (useWatch({ control, name: 'callouts' }) ?? []) as FormCallout[];

  const mediaById = useMemo(() => {
    const m = new Map<number, common_MediaFull>();
    for (const rm of techCard?.resolvedTechnicalMedia ?? []) {
      if (rm.media?.id != null) m.set(rm.media.id, rm.media);
    }
    return m;
  }, [techCard?.resolvedTechnicalMedia]);

  const urlFor = (mediaId: number) => {
    const f = mediaById.get(mediaId);
    return f?.media?.fullSize?.mediaUrl || f?.media?.thumbnail?.mediaUrl || '';
  };

  // Only callouts a piece actually points at are drawn — an unreferenced pin belongs to the sketch
  // tab, not to the cut list. The view shown is whichever technical sketch hosts the most of them.
  const drawable = callouts.filter((c) => {
    const n = c.number ?? 0;
    if (n <= 0 || !pinnedNumbers.has(n)) return false;
    if (!urlFor(c.mediaId ?? 0)) return false;
    return !Number.isNaN(parseFloat(c.posX ?? '')) && !Number.isNaN(parseFloat(c.posY ?? ''));
  });

  const bestMediaId = useMemo(() => {
    const counts = new Map<number, number>();
    for (const c of drawable) {
      const id = c.mediaId ?? 0;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    let best = 0;
    let bestN = 0;
    for (const [id, n] of counts) if (n > bestN) [best, bestN] = [id, n];
    return best;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawable.map((c) => `${c.mediaId}:${c.number}`).join(',')]);

  const shown = drawable.filter((c) => (c.mediaId ?? 0) === bestMediaId);
  const url = bestMediaId ? urlFor(bestMediaId) : '';

  if (!url || shown.length === 0) {
    return (
      <div className='flex flex-col gap-1'>
        <Canvas aspect='3/4' className='flex items-center justify-center'>
          <Text
            size='micro'
            variant='label'
            component='span'
            className='px-2 text-center uppercase'
          >
            нет выносок
          </Text>
        </Canvas>
        <Text size='micro' variant='label'>
          проставьте callout # у детали и расставьте выноски на вкладке sketch
        </Text>
      </div>
    );
  }

  return (
    <div className='flex flex-col gap-1'>
      <div className='relative w-full border border-borderColor'>
        <img src={url} alt='piece diagram' draggable={false} className='block w-full select-none' />
        {shown.map((c) => {
          const n = c.number as number;
          return (
            <Pin
              key={`${c.mediaId}-${n}`}
              x={parseFloat(c.posX ?? '0') * 100}
              y={parseFloat(c.posY ?? '0') * 100}
              label={n}
              title={labelForPin(n)}
              highlighted={activePin === n}
              onMouseEnter={() => onActivePinChange(n)}
              onMouseLeave={() => onActivePinChange(null)}
            />
          );
        })}
      </div>
      <Text size='micro' variant='label'>
        наведите на строку — её пин подсветится
      </Text>
    </div>
  );
}

// A colourway column's «copy from ▾»: fills this colourway's whole fabric map from another one.

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

  // Row ↔ pin cross-highlight, the same hook the construction tab drives its sketch with.
  const pin = useCrossHighlight<number>();

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

  // Column copy: per ROW setValue on `pieces.N.materials`, never a whole-array setValue — replacing
  // the array root desyncs useFieldArray's keys and re-mounts every input mid-edit.
  const copyColumn = (fromId: number, toId: number) => {
    if (fromId === toId) return;
    const all = (getValues('pieces') ?? []) as FormPiece[];
    all.forEach((p, pi) => {
      const materials = (p.materials ?? []) as FormMaterial[];
      const src = materials.find((m) => (m.colorwayIndex ?? 0) === fromId);
      const at = materials.findIndex((m) => (m.colorwayIndex ?? 0) === toId);
      const patch = {
        bomLineKey: src?.bomLineKey ?? '',
        fusingBomLineKey: src?.fusingBomLineKey ?? '',
      };
      const nextEntry: FormMaterial =
        at >= 0 ? { ...materials[at], ...patch } : { colorwayIndex: toId, note: '', ...patch };
      const next =
        at >= 0 ? materials.map((m, i) => (i === at ? nextEntry : m)) : [...materials, nextEntry];
      setValue(`pieces.${pi}.materials`, next, { shouldDirty: true });
    });
  };

  // Usage.pieceIndex renumbering on piece removal now belongs to the colourway recipe (server-owned,
  // edited via UpdateColorwayRecipe) — the RHF `colorways` array is always empty, so the old
  // form-state renumbering loop was dead. Just drop the piece row here.
  // Release the piece's referrers before dropping it, the same contract the BOM's removeArticle
  // keeps. An operation still naming a deleted piece fails the save server-side
  // (operations[N].piece_line_key: no cut-piece "…" in this style) and rolls the whole transaction
  // back — on a key the operator cannot see, from a row they did not touch.
  const removePiece = (pi: number) => {
    const removedKey = (getValues(`pieces.${pi}.lineKey`) as string) || '';
    if (removedKey) {
      const operations = (getValues('operations') ?? []) as TechCardFormData['operations'];
      (operations ?? []).forEach((o, oi) => {
        const keys = (o.pieceLineKeys ?? []).filter(Boolean);
        if (keys.includes(removedKey)) {
          setValue(
            `operations.${oi}.pieceLineKeys`,
            keys.filter((k) => k !== removedKey),
            { shouldDirty: true },
          );
        }
      });
    }
    remove(pi);
  };

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

  // `detached` is OUTPUT-ONLY (S8 orphan control): the store raises it when a piece's
  // callout_number stops resolving to a callout on the card — the sketch callout it was pinned to
  // was deleted. The piece survives on purpose rather than being dropped, which is exactly why it
  // has to be VISIBLE here: until now it only appeared on the printed tech pack, so the one screen
  // that can re-pin it was the one screen that never mentioned it. Keyed by lineKey, off the SAVED
  // card — a row added since the last save has no server verdict yet and simply carries none.
  const detachedKeys = useMemo(() => {
    const set = new Set<string>();
    for (const p of techCard?.techCard?.pieces ?? []) {
      const key = p.lineKey?.trim();
      if (key && p.detached) set.add(key);
    }
    return set;
  }, [techCard?.techCard?.pieces]);

  // Which callout numbers the pieces reference, and what to call each pin in its tooltip.
  const pinnedNumbers = useMemo(
    () => new Set(pieces.map((p) => p.calloutNumber || 0).filter((n) => n > 0)),
    [pieces],
  );
  const labelForPin = (n: number) =>
    pieces
      .filter((p) => (p.calloutNumber || 0) === n)
      .map((p) => p.name?.trim() || 'без названия')
      .join(' · ') || `#${n}`;

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
    <div className='flex flex-col gap-3.5'>
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

      {/* CUT PIECES — table + mini diagram */}
      <section className='border border-borderColor bg-bgColor p-4'>
        <SectionHeader
          title='детали кроя'
          question='— code, name, per garment, mirrored, grainline, fused, callout number'
          action={
            <Button
              type='button'
              variant='main'
              size='sm'
              data-field='pieces.add'
              onClick={addPiece}
            >
              + piece
            </Button>
          }
        />
        {fields.length === 0 ? (
          <Text size='micro' variant='label'>
            no pieces yet — add the pattern parts that get cut (front, back, collar…)
          </Text>
        ) : (
          // minmax(0,1fr) — not 1fr — so the wide 8-column table can shrink and scroll inside its
          // own overflow-x-auto instead of forcing the track wide and shoving the diagram column.
          <div className='grid gap-2.5 lg:grid-cols-[minmax(0,1fr)_160px]'>
            <DataTable className='min-w-[760px] [&_td]:!align-middle [&_td]:!text-left [&_th]:!text-left'>
              {/* Fixed column widths so every row lines up; the code/name column flexes, the rest are
                  sized to their control. Alignment is forced left/middle (the DataTable default right-
                  aligns, which fought the left-aligned inputs and read crooked). */}
              <colgroup>
                <col />
                <col className='w-[52px]' />
                <col className='w-[92px]' />
                <col className='w-[150px]' />
                <col className='w-[56px]' />
                <col className='w-[180px]' />
                <col className='w-[40px]' />
              </colgroup>
              <thead>
                <tr>
                  <th>code / name</th>
                  <th>×</th>
                  <th>mirror</th>
                  <th>grain</th>
                  <th>fused</th>
                  <th>note</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {fields.map((f, pi) => {
                  const p = pieces[pi] ?? {};
                  const callout = p.calloutNumber || 0;
                  const arrow = grainlineArrow(p.grainline);
                  return (
                    <tr
                      key={f.id}
                      {...pin.bind(callout > 0 ? callout : null)}
                      className={pin.isActive(callout) ? 'bg-bgZebra' : undefined}
                    >
                      <td>
                        <Input
                          className='w-full'
                          data-field={`pieces.${pi}.name`}
                          aria-invalid={duplicateRows.has(pi)}
                          list='piece-code-suggestions'
                          value={p.name ?? ''}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            setValue(`pieces.${pi}.name`, e.target.value, { shouldDirty: true })
                          }
                          placeholder='FP front piece'
                        />
                        {duplicateRows.has(pi) && (
                          <Text size='micro' variant='error'>
                            такая деталь уже есть — имя должно быть уникальным
                          </Text>
                        )}
                        {detachedKeys.has((p.lineKey ?? '').trim()) && (
                          <div className='mt-0.5'>
                            <Pill
                              tone='attention'
                              title='выноска, на которую ссылалась деталь, удалена со скетча — проставьте callout # заново на вкладке sketch'
                            >
                              откреплена от выноски
                            </Pill>
                          </div>
                        )}
                      </td>
                      <td>
                        <Input
                          className='w-full'
                          type='number'
                          min='1'
                          value={p.piecesPerGarment ?? 1}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            setValue(`pieces.${pi}.piecesPerGarment`, Number(e.target.value) || 1, {
                              shouldDirty: true,
                            })
                          }
                        />
                      </td>
                      <td>
                        {/* the resulting multiplier is shown inline so the cut list is predictable */}
                        <div className='flex items-center gap-1'>
                          <input
                            type='checkbox'
                            aria-label='mirrored pair'
                            checked={!!p.mirrored}
                            onChange={(e) =>
                              setValue(`pieces.${pi}.mirrored`, e.target.checked, {
                                shouldDirty: true,
                              })
                            }
                          />
                          <Text size='micro' variant='label' component='span'>
                            {p.mirrored ? `×${(p.piecesPerGarment ?? 1) * 2}` : ''}
                          </Text>
                        </div>
                      </td>
                      <td>
                        <div className='flex items-center gap-1'>
                          <Input
                            className='w-full'
                            list='grainline-suggestions'
                            value={p.grainline ?? ''}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                              setValue(`pieces.${pi}.grainline`, e.target.value, {
                                shouldDirty: true,
                              })
                            }
                            placeholder='lengthwise'
                          />
                          <span aria-hidden className='shrink-0'>
                            {arrow}
                          </span>
                        </div>
                      </td>
                      <td>
                        <input
                          type='checkbox'
                          aria-label='fused'
                          checked={!!p.fused}
                          onChange={(e) =>
                            setValue(`pieces.${pi}.fused`, e.target.checked, {
                              shouldDirty: true,
                            })
                          }
                        />
                      </td>
                      <td>
                        <Input
                          className='w-full'
                          value={p.note ?? ''}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            setValue(`pieces.${pi}.note`, e.target.value, { shouldDirty: true })
                          }
                        />
                      </td>
                      <td>
                        <Button
                          type='button'
                          variant='secondary'
                          size='xs'
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
            </DataTable>

            <PieceDiagram
              techCard={techCard}
              pinnedNumbers={pinnedNumbers}
              labelForPin={labelForPin}
              activePin={pin.active}
              onActivePinChange={pin.setActive}
            />
          </div>
        )}
      </section>
    </div>
  );
}
