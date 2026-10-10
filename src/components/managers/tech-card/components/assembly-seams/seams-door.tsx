// THE SEAMS DOOR — one block under the ASSEMBLY MAP (03-SEAMS-DESIGN §5.1, Need B): how many of the
// pattern's seams the technologist has decided, and the door into the fullscreen review.
//
// It also HYDRATES the seam decisions store from the card read (`TechCard.seams`): the provider of
// the seam graph above it reads that store (Need A), so the map, the pictograms and the doll get the
// confirmed seams whether or not the review is ever opened. Without a seam graph (no DXF, no
// steps yet) the map is a sketch and this door draws nothing.

import type { common_TechCard } from 'api/proto-http/admin';
import type { TechCardSeamWire } from 'lib/seams';
import { useEffect, useMemo, useState } from 'react';
import { useWatch } from 'react-hook-form';
import { Chip } from 'ui/components/chip';
import { Progress } from 'ui/components/progress';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';
import type { TechCardFormData } from '../schema';
import type { PieceShapeMap } from '../use-piece-shapes';
import { progressWords } from './review-model';
import { hydrateSeams, resetSeams, useSeamsStore } from './seams-store';
import { SeamsReview } from './seams-review';
import { useSeamReview } from './use-seam-decisions';

/** The size the contours were read on: the one most pieces were found at (findPiece's median). */
function sizeOf(shapes: PieceShapeMap | undefined): string {
  const n = new Map<string, number>();
  for (const f of shapes?.values() ?? []) if (f?.size) n.set(f.size, (n.get(f.size) ?? 0) + 1);
  let best = '';
  let most = 0;
  for (const [s, c] of n) if (c > most) [best, most] = [s, c];
  return best;
}

export function SeamsDoor({
  techCard,
  frozen,
  shapes,
}: {
  techCard: common_TechCard | undefined;
  frozen: boolean;
  shapes?: PieceShapeMap;
}) {
  const cardId = techCard?.id;
  const wire = techCard?.seams as TechCardSeamWire[] | undefined;
  useEffect(() => hydrateSeams(cardId ?? null, wire), [cardId, wire]);
  useEffect(() => () => resetSeams(), []);

  const styleNumber = (useWatch<TechCardFormData>({ name: 'styleNumber' }) ?? '') as string;
  const name = (useWatch<TechCardFormData>({ name: 'name' }) ?? '') as string;
  const size = useMemo(() => sizeOf(shapes), [shapes]);
  const unreadable = useSeamsStore((s) => s.unreadable);
  const { graph, review } = useSeamReview();
  const [open, setOpen] = useState(false);

  if (!graph || !review) return null;
  const pct = review.total > 0 ? (review.decided / review.total) * 100 : 0;
  return (
    <>
      <Section
        title='seams'
        question='— decided on this card'
        action={
          <Chip
            quiet
            onClick={() => setOpen(true)}
            title={
              frozen
                ? 'read the decisions — the card is released, nothing can be changed'
                : 'accept, reject or connect seams on the pieces laid flat'
            }
            data-seams-door='review'
          >
            review
          </Chip>
        }
        className='space-y-1.5'
      >
        <Progress value={pct} />
        <Text
          size='micro'
          variant='label'
          component='p'
          className='tabular-nums'
          data-seams-door-progress=''
        >
          {progressWords(review)}
          {unreadable > 0 ? ` · ${unreadable} unreadable` : ''}
        </Text>
      </Section>
      {open && (
        <SeamsReview
          open={open}
          onClose={() => setOpen(false)}
          cardId={cardId}
          frozen={frozen}
          title={styleNumber.trim() || name.trim() || 'this card'}
          size={size}
        />
      )}
    </>
  );
}
