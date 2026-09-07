import { useMemo, type JSX } from 'react';
import {
  AnnotationSurface,
  type ShapePoint,
  type SurfaceCallout,
} from 'ui/components/annotation/surface';
import { Button } from 'ui/components/button';
import { GroupLabel } from 'ui/components/group-label';
import Input from 'ui/components/input';
import Text from 'ui/components/text';

import { Counter, GROUP_GAP, Reason } from '../core';
import { mediaThumb } from '../render/model';
import type { PlaygroundDraft } from './drafts';
import {
  AREA_TEXT_MAX,
  REGIONS_PER_ITEM_MAX,
  areaLetter,
  type PlaygroundItem,
  type PlaygroundRegion,
} from './model';

/**
 * ═══ MARKING AN AREA — ONE TOOL, AND IT IS NOT A MASK ═════════════════════════════════════════
 *
 * ⚠ THE SENTENCE UNDER THE FRAME IS THE FEATURE, not a disclaimer. The image route has NO mask
 * field: what an area actually becomes is (a) a close CROP of it, attached as a further numbered
 * picture, (b) an OUTLINE drawn on a copy of the picture, and (c) the words beside the letter. A
 * person who believes they have painted a protected region will read the result as a broken model;
 * a person who has been told «hint, not boundary» reads it as what it is. So the line stands under
 * the frame, always, and the inventory repeats it.
 *
 * ONE TOOL, AND IT IS THE PRODUCT'S OWN. `AnnotationSurface` with `tool='polygon'` — the same
 * gesture and the same primitive that the sketch sheet, the moodboard and the fitting draw with
 * (`ui/components/annotation`), which is why nothing here re-implements a rubber band, a snap
 * radius or a key map. Its registry (`kinds.ts`) spells the grammar: clicks are vertices, the shape
 * closes on the first point, 3..20 of them.
 *
 * ⚠ THE RECTANGLE IS NOT A SECOND TOOL, and the prototype's «drag a rectangle» is not implemented
 * as a drag: the surface has no rect grammar, and adding one to `kinds.ts` would put a new
 * STORAGE kind on a contract shared by four screens (the sketch, the moodboard, the fitting, the
 * task attachment) for the sake of one. A box is four clicks, and four clicks are what the line
 * under the frame promises.
 *
 * ESC AND ENTER ARE THE SURFACE'S OWN, and that is why no key is matched here. The surface's ladder
 * (armed handle → selection → unfinished gesture → tool) already owns them, and it compares
 * `e.code` where it compares letters at all (`⌘Z`) — the trap this codebase has paid for twice
 * (`cyrillic-layout-kills-e-key`). A second key listener on this screen would fight it.
 */

const HINT_TOOL =
  'one tool: click the corners of the area · close it on the first point · esc clears it';
const HINT_NOT_A_MASK =
  'the model is shown a crop of the area and told these words. it is not a mask.';

/** The plate the letter sits on — the centre of the polygon, in the frame's own fractions. */
function centroid(points: readonly ShapePoint[]): ShapePoint {
  if (!points.length) return { x: 0.5, y: 0.5 };
  const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}

export function MarkMode({
  item,
  index,
  draft,
  onClose,
  disabled,
}: {
  /** The picture being marked. */
  item: PlaygroundItem;
  /** Its place on the table — `image 1` is items[0], on screen and in the prompt. */
  index: number;
  draft: PlaygroundDraft;
  onClose: () => void;
  disabled?: boolean;
}): JSX.Element {
  const mediaId = item.media.id ?? 0;
  const regions = item.regions;
  const full = regions.length >= REGIONS_PER_ITEM_MAX;

  const callouts = useMemo<SurfaceCallout[]>(
    () =>
      regions.map((region, i) => ({
        // THE KEY IS THE LETTER, NOT THE INDEX OF A LIST THAT SHRINKS: removing A must not make B
        // answer to A's key mid-gesture.
        key: `area-${i}`,
        kind: 'polygon',
        points: region.points,
        label: centroid(region.points),
        number: i + 1,
        /* THE PLATE ON THE FRAME CARRIES THE LETTER AND NOTHING ELSE. The words about the area
           are one line away, in the row that OWNS them and can be edited; printing them twice
           would put a second, unfixable copy over the picture — and over a small area the plate
           then covers what it points at. (The wire carries no text on the annotation at all —
           see `regionToWire`.) */
        text: areaLetter(i),
      })),
    [regions],
  );

  const addRegion = (points: ShapePoint[]) => {
    if (disabled || full) return;
    const next: PlaygroundRegion[] = [...regions, { points, text: '' }];
    draft.setRegions(mediaId, next);
  };

  const removeRegion = (key: string) => {
    if (disabled) return;
    const at = Number(key.replace('area-', ''));
    if (!Number.isInteger(at)) return;
    draft.setRegions(
      mediaId,
      regions.filter((_, i) => i !== at),
    );
  };

  return (
    <div
      id='design-playground-mark'
      data-pg-mark={mediaId}
      className='mt-4 flex flex-wrap items-start gap-6'
    >
      {/* ─── the picture, marked ────────────────────────────────────────────────────────────── */}
      <div className='min-w-0 flex-[3] basis-[340px]'>
        <AnnotationSurface
          src={mediaThumb(item.media)}
          alt={`image ${index + 1}`}
          callouts={callouts}
          tool={disabled || full ? null : 'polygon'}
          onAdd={(_kind, points) => addRegion(points)}
          onRemove={removeRegion}
          frozen={disabled}
          maxCallouts={REGIONS_PER_ITEM_MAX}
          halo
          preferNaturalAspect
          rowHeightPx={420}
          cornerSlot={
            <span className='bg-textColor px-1.5 py-0.5'>
              <Text size='nano' variant='uppercase' component='span' className='!text-bgColor'>
                image {index + 1}
              </Text>
            </span>
          }
        />
      </div>

      {/* ─── the areas of this picture, one line each ───────────────────────────────────────── */}
      <div className='min-w-0 flex-[2] basis-[280px]'>
        <GroupLabel
          flush
          className={GROUP_GAP}
          action={
            <span className='flex flex-wrap items-center gap-1.5'>
              <Counter n={regions.length} noun='area' total={REGIONS_PER_ITEM_MAX} />
              <Button variant='secondary' size='xs' onClick={onClose}>
                done
              </Button>
            </span>
          }
        >
          areas of image {index + 1}
        </GroupLabel>

        {regions.length === 0 ? (
          <Text size='micro' variant='label' component='p' className='normal-case'>
            no area is marked yet · {HINT_TOOL}
          </Text>
        ) : (
          <div className='space-y-2'>
            {regions.map((region, i) => (
              <div key={i} className='flex items-center gap-2' data-pg-area={areaLetter(i)}>
                <span className='shrink-0 bg-textColor px-1.5 py-0.5'>
                  <Text size='nano' variant='uppercase' component='span' className='!text-bgColor'>
                    {areaLetter(i)}
                  </Text>
                </span>
                <Input
                  name={`pg-area-${mediaId}-${i}`}
                  value={region.text}
                  disabled={disabled}
                  maxLength={AREA_TEXT_MAX}
                  placeholder='what about this area'
                  aria-label={`what about area ${areaLetter(i)} of image ${index + 1}`}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    draft.setRegionText(mediaId, i, e.target.value)
                  }
                  className='min-w-0 flex-1'
                />
                {!disabled && (
                  <Button
                    variant='secondary'
                    size='xs'
                    onClick={() => removeRegion(`area-${i}`)}
                    aria-label={`take area ${areaLetter(i)} off image ${index + 1}`}
                  >
                    ✕
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* TWO QUIET LINES, AND THE SECOND ONE IS THE POINT OF THE SCREEN — see the file header. */}
        <div className='mt-4 space-y-1'>
          <Text size='nano' variant='label' component='p' className='normal-case'>
            {HINT_TOOL}
          </Text>
          <Text size='nano' variant='label' component='p' className='normal-case'>
            {HINT_NOT_A_MASK}
          </Text>
        </div>

        {full && (
          <Reason className='mt-2'>
            {REGIONS_PER_ITEM_MAX} areas is the most one picture carries · take one off to mark
            another
          </Reason>
        )}
        {disabled && <Reason className='mt-2'>this card is read-only for you</Reason>}
      </div>
    </div>
  );
}
