import Text from 'ui/components/text';
import { Section, SectionStack } from 'ui/components/section';
import { ArtifactsPanel } from './artifacts-panel';
import { BandFeed } from './band-feed';
import { Bench } from './bench';
import { ConceptSection } from './concept-section';
import { KindsStrip } from './kinds-strip';
import { DesignCapabilityProvider } from './capability';
import { MixWarn } from './mixwarn';
import { MoodBoard } from './mood-board';
import { PickModeProvider, usePickMode } from './pick-mode';
import { ReferencesSection } from './references-section';
import { SheetBar } from './sheet-bar';
import { UploadsShelf } from './uploads-shelf';
import { useDesignBand } from './use-design-band';

/**
 * THE STUDIO — the composed DESIGN band, and the only place that knows the order of its organs.
 *
 * The organs themselves are written independently against frozen signatures; this file is where
 * they meet. It holds no state of its own beyond the two providers, on purpose: anything it stored
 * would become a fifth place to look for the truth about a card.
 *
 * ONE READ FEEDS ALL OF THEM. `useDesignBand` is called here, once, and the band object is passed
 * down. Organs that called it separately would each get their own cache entry and the bench could
 * disagree with the feed about which instant of the card is on screen.
 */

/**
 * The pick banner. It belongs to neither the bench (which asks) nor the feed (which answers), so it
 * lives with the composer that owns both. It promises Esc in words, and `PickModeProvider` makes
 * that true with a document-level listener — the promise and its keeper are deliberately close.
 */
function PickBanner() {
  const { target, cancel } = usePickMode();
  if (!target) return null;
  return (
    <div className='sticky top-0 z-40 flex items-center justify-between gap-4 bg-textColor px-4 py-2'>
      <Text variant='selected' size='control'>
        choosing for {target.label} — click a picture in the band below
      </Text>
      <button type='button' className='uppercase underline' onClick={cancel}>
        esc to cancel
      </button>
    </div>
  );
}

export function StudioTab({
  techCardId,
  disabled,
  constructionAspects,
}: {
  techCardId?: number;
  disabled?: boolean;
  /**
   * The aspects editor, handed in from the page rather than imported here.
   *
   * It needs the whole loaded card, which this composer does not have and should not fetch a second
   * time. It travels as a node because the alternative was worse: `concept & construction
   * description` used to be one block on HEADER, and leaving the aspects behind there would have
   * split one printed section across two tabs — concept and notes in the studio, the aspects a rail
   * entry away, printing between them.
   */
  constructionAspects?: React.ReactNode;
}) {
  const { band, isLoading, serverSpeaks, error } = useDesignBand(techCardId);

  // A card that has not been created yet has no band and cannot have one: every write below is
  // keyed by tech_card_id. Saying so is more useful than rendering seven empty organs.
  if (!techCardId) {
    return (
      <SectionStack>
        <Section title='studio' question='— what this style looks like, before it is frozen'>
          <Text variant='inactive' size='control'>
            Save this tech card first. The studio hangs off the card, so there is nothing to hang it
            on yet.
          </Text>
        </Section>
      </SectionStack>
    );
  }

  if (isLoading) {
    return (
      <SectionStack>
        <Section title='studio'>
          <Text variant='inactive' size='control'>
            loading…
          </Text>
        </Section>
      </SectionStack>
    );
  }

  const readOnly = !!disabled;

  // WHAT SURVIVES A SERVER THAT DOES NOT SPEAK THE BAND.
  //
  // The moodboard, the kinds strip and the description are fields of the tech card form: they save
  // through the ordinary UpdateTechCard and touch not one design RPC. Hiding them behind the band
  // read — which is what an early return here would do — would mean that on a contour whose binary
  // predates the band, the studio is empty AND the old moodboard tab is folded away, i.e. the human
  // loses a screen that works. The band's own organs degrade; these three do not.
  const bandless = !serverSpeaks;

  return (
    <DesignCapabilityProvider value={!bandless}>
      <PickModeProvider>
        <PickBanner />
        <SectionStack>
          {/* The order is the prototype's own (`50-brief.js:724`): the idea, then what the card is
              being turned into, then the material, then the bench, then the pool it draws from, and
              the description last — because the description is written from what is above it. */}
          <MoodBoard techCardId={techCardId} disabled={readOnly} />
          <KindsStrip band={band} />
          {bandless ? (
            <Section title='bench' question='— the flats this style is drawn from'>
              <Text variant='inactive' size='control'>
                {error
                  ? `The bench could not be read: ${error.message}`
                  : 'This server does not serve the design band yet, so the bench, the uploads and ' +
                    'the reference roles are not available here. The moodboard and the description ' +
                    'above save normally.'}
              </Text>
            </Section>
          ) : (
            <>
              <ReferencesSection techCardId={techCardId} band={band} disabled={readOnly} />
              <Bench techCardId={techCardId} band={band} disabled={readOnly} />
              <MixWarn band={band} />
              <SheetBar band={band} />
              <UploadsShelf techCardId={techCardId} band={band} disabled={readOnly} />
              <BandFeed techCardId={techCardId} band={band} disabled={readOnly} />
            </>
          )}
          <ConceptSection disabled={readOnly} />
          {constructionAspects}
        </SectionStack>
      </PickModeProvider>
    </DesignCapabilityProvider>
  );
}

/**
 * ARTIFACTS is a second root over the SAME band read, not a second band. It is kept in this file so
 * that the two tabs cannot drift into calling different reads — the failure that would produce is a
 * sheet that disagrees with the bench it was minted from, under one signature.
 */
export function ArtifactsTab({ techCardId, disabled }: { techCardId?: number; disabled?: boolean }) {
  const { band, isLoading, serverSpeaks, error } = useDesignBand(techCardId);

  if (!techCardId) {
    return (
      <SectionStack>
        <Section title='artifacts' question='— the sheet the factory prints, and every version of it'>
          <Text variant='inactive' size='control'>
            Save this tech card first — a sheet is minted from a card that exists.
          </Text>
        </Section>
      </SectionStack>
    );
  }

  if (isLoading) {
    return (
      <SectionStack>
        <Section title='artifacts'>
          <Text variant='inactive' size='control'>
            loading…
          </Text>
        </Section>
      </SectionStack>
    );
  }

  // Same rule as the studio: the LIVE DOCUMENT — the card's plates and their callouts — is form
  // data and needs no design RPC at all. Only the version strip, the journal and the mint do. So the
  // panel is mounted either way and is told, once, whether the band answered; refusing to mount it
  // would take the callout editor away from every card on a contour without the band.
  return (
    <DesignCapabilityProvider value={serverSpeaks}>
      <ArtifactsPanel techCardId={techCardId} band={band} disabled={!!disabled} />
    </DesignCapabilityProvider>
  );
}
