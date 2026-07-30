import { common_Fitting, common_MediaFull } from 'api/proto-http/admin';
import {
  formatFittingDate,
  statusLabel,
  verdictLabel,
} from 'components/managers/fittings/components/utils';
import { useTechCardFittings } from 'components/managers/tech-cards/components/useTechCardQuery';
import { ROUTES } from 'constants/routes';
import { isVideo } from 'lib/features/filterContentType';
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { Chip, ChipRow } from 'ui/components/chip';
import { MediaViewer, mediaFullToViewerItem, useMediaViewer } from 'ui/components/media-viewer';
import { Pill } from 'ui/components/pill';
import { Placeholder } from 'ui/components/placeholder';
import { SectionHeader } from 'ui/components/section-header';
import Text from 'ui/components/text';
import { Toolbar } from 'ui/components/toolbar';

// green = signed off · red = rejected · blue = mid-flight, another round is coming · grey = unset.
const verdictTone = (v?: string): 'ok' | 'warn' | 'attention' | 'mut' => {
  if (v === 'FITTING_VERDICT_APPROVED') return 'ok';
  if (v === 'FITTING_VERDICT_REJECTED') return 'warn';
  if (v === 'FITTING_VERDICT_NEEDS_REWORK' || v === 'FITTING_VERDICT_PENDING') return 'attention';
  return 'mut';
};

// ~44×58 — the reference's contact-sheet thumb. Set in px rather than a utility so the ratio is
// stated once and both the photo and its striped stand-in share it exactly.
const THUMB = { width: 44, height: 58 } as const;

const thumbUrl = (m: common_MediaFull) =>
  m.media?.thumbnail?.mediaUrl ||
  m.media?.compressed?.mediaUrl ||
  m.media?.fullSize?.mediaUrl ||
  '';

// A fitting is mostly photographs — lead with them and let the verdict ride on top. The whole card
// is a link to the fitting page (an overlay anchor under the content); the photos sit above it and
// open the MediaViewer in place, so looking at a photo never costs a navigation.
function FittingCard({ fitting }: { fitting: common_Fitting }) {
  const insert = fitting.fitting;
  const requests = insert?.changeRequests ?? [];
  const open = requests.filter((cr) => !cr.resolved).length;
  const photos = fitting.media ?? [];
  const viewer = useMediaViewer();
  // Mapped 1:1 (not filtered) so a thumb's position and the viewer's index can never drift apart.
  const items = useMemo(() => photos.map(mediaFullToViewerItem), [photos]);

  const round = insert?.roundNumber ?? 0;
  const title = `${formatFittingDate(insert?.fittingDate)} · ${
    round > 0 ? `round #${round}` : `fitting #${fitting.id ?? '—'}`
  }`;

  return (
    <div className='relative flex flex-col gap-1.5 border border-borderColor p-2 transition-colors hover:border-textColor'>
      <div className='flex flex-wrap items-center gap-1.5'>
        <Text size='micro' component='span' className='font-bold uppercase'>
          {title}
        </Text>
        <Pill tone={verdictTone(insert?.verdict)}>{verdictLabel(insert?.verdict)}</Pill>
        {/* `done` is the assumed state — only a fitting that hasn't happened (or was called off)
            changes how the verdict below it should be read. */}
        {insert?.status && insert.status !== 'FITTING_STATUS_DONE' && (
          <Pill tone='mut'>{statusLabel(insert.status)}</Pill>
        )}
        <div className='ml-auto'>
          {open > 0 ? (
            <Pill tone='warn'>{open} open</Pill>
          ) : requests.length > 0 ? (
            <Pill tone='ok'>resolved</Pill>
          ) : null}
        </div>
      </div>

      {/* z-10 lifts the photo buttons above the card-wide link overlay below. */}
      <div className='relative z-10 flex flex-wrap gap-1'>
        {photos.length === 0 ? (
          // Never an empty card: an honest striped slot says "no photos were taken", which an
          // empty box would read as a loading bug.
          <Placeholder label='no photos' className='w-full' style={{ height: THUMB.height }} />
        ) : (
          photos.map((m, i) => {
            const url = thumbUrl(m);
            return (
              <button
                key={m.id ?? i}
                type='button'
                aria-label={`view photo ${i + 1} of ${title}`}
                onClick={() => viewer.openAt(i)}
                style={{ ...THUMB }}
                className='shrink-0 cursor-zoom-in overflow-hidden border border-borderColor focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor'
              >
                {isVideo(url) ? (
                  <video src={url} muted className='size-full object-cover' />
                ) : (
                  <img src={url} alt='' className='size-full object-cover' />
                )}
              </button>
            );
          })
        )}
      </div>

      {/* Last in the DOM and unpositioned-content-covering: clicking anywhere the photos don't
          occupy opens the fitting. */}
      <Link to={`/fittings/${fitting.id}`} className='absolute inset-0'>
        <span className='sr-only'>open {title}</span>
      </Link>

      <MediaViewer items={items} {...viewer} />
    </div>
  );
}

// Fittings anchored to this tech card. Edit-mode only (needs a saved id). The link lives
// on the fitting (FittingInsert.tech_card_id); "add fitting" deep-links to the fitting
// editor pre-linked to this style. POM actuals can reference a specific fitting from here.
//
// The spine's "(N unresolved changes)" counter deep-links here with ?fits=unresolved (R-8): the
// list then shows only fittings that still carry open FittingChangeRequests — the step-4 fix work
// list. A toggle flips between all and unresolved.
export function TechCardFittings({ techCardId }: { techCardId: number }) {
  const { data: fittings, isLoading } = useTechCardFittings(techCardId);
  const [params, setParams] = useSearchParams();
  const unresolvedOnly = params.get('fits') === 'unresolved';

  const openCount = (f: common_Fitting) =>
    (f.fitting?.changeRequests ?? []).filter((cr) => !cr.resolved).length;

  const list = fittings ?? [];
  const totalUnresolved = list.reduce((n, f) => n + openCount(f), 0);
  const shown = unresolvedOnly ? list.filter((f) => openCount(f) > 0) : list;

  const setFilter = (on: boolean) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (on) p.set('fits', 'unresolved');
        else p.delete('fits');
        return p;
      },
      { replace: true },
    );

  return (
    <div className='flex flex-col border border-borderColor bg-bgColor p-3'>
      <SectionHeader
        title='fittings on this style'
        question='— each has a verdict, photos and change requests that may still be unresolved'
        action={
          <Button asChild variant='main' size='sm'>
            <Link to={`${ROUTES.addFitting}?techCardId=${techCardId}`}>+ add fitting</Link>
          </Button>
        }
      />

      {/* Keep the toggle visible while the unresolved filter is ACTIVE even at zero —
          resolving the last change request otherwise stranded the user on an empty
          filtered list with no visible way to clear ?fits=unresolved. */}
      {(unresolvedOnly || totalUnresolved > 0) && (
        <Toolbar className='mb-1.5'>
          <ChipRow>
            <Chip
              selected={!unresolvedOnly}
              pressed={!unresolvedOnly}
              onClick={() => setFilter(false)}
            >
              all
            </Chip>
            <Chip
              selected={unresolvedOnly}
              pressed={unresolvedOnly}
              onClick={() => setFilter(true)}
            >
              unresolved {totalUnresolved}
            </Chip>
          </ChipRow>
        </Toolbar>
      )}

      {isLoading ? (
        <Text size='micro' variant='label'>
          loading fittings…
        </Text>
      ) : !shown.length ? (
        <Text size='micro' variant='label'>
          {unresolvedOnly
            ? 'no fittings with unresolved changes'
            : 'no fittings for this tech card yet'}
        </Text>
      ) : (
        <div className='grid grid-cols-1 gap-2.5 sm:grid-cols-2'>
          {shown.map((f) => (
            <FittingCard key={f.id} fitting={f} />
          ))}
        </div>
      )}
    </div>
  );
}
