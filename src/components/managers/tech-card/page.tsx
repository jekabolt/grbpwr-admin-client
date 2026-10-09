import { RelatedTasks } from 'components/managers/tasks/components/related-tasks';
import { useTechCard } from 'components/managers/tech-cards/components/useTechCardQuery';
import { ROUTES } from 'constants/routes';
import { useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { TechCardForm } from './components';
import { TechCardStagingProvider } from './components/useTechCardStaging';

// A fresh key per blank «new card» mount: walking from a created card back to /add-tech-card must
// start a new form, not keep the one that created it.
let newCardSeq = 0;

export function TechCard() {
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;
  const numId = id ? parseInt(id, 10) : undefined;
  const { data, isLoading } = useTechCard(numId);

  /* ═══ A CARD CREATED ON THIS PAGE KEEPS ITS FORM (onboarding S4, amendment A3) ═════════════════
     The router keeps this element mounted from /add-tech-card to /tech-cards/:id (both routes render
     <TechCard/>, measured on react-router 7), so the only thing that would throw the operator's
     form away when a new card gets its id is this page's key. The form says «the id I am about to
     open is the one I just created» (`onCreated`) — in memory, on this mount, never in history
     state: a reload (F5) mounts cold, keys by id and goes through the loading / not-found gates like
     any other card. The gates need no exception: the form puts the card it just read into the cache
     before it opens the address, so the page has its data on the first render there. The hand-off is
     spent the moment the address leaves that id. */
  const handoff = useRef<string | null>(null);
  const mount = useRef<{ id: string | undefined; key: string }>({
    id,
    key: id ?? `new-${++newCardSeq}`,
  });
  if (mount.current.id !== id) {
    const continued = mount.current.id === undefined && !!id && handoff.current === id;
    if (!continued) handoff.current = null;
    mount.current = { id, key: continued ? mount.current.key : id ?? `new-${++newCardSeq}` };
  }

  if (isEditMode && isLoading) {
    return (
      <div className='flex justify-center py-20'>
        <Text variant='inactive' className='animate-pulse'>
          loading tech card…
        </Text>
      </div>
    );
  }

  // `!data` only: a REFETCH that fails keeps the card it had (TanStack keeps `data`, sets `isError`), and
  // taking the editor away then — mid-save, under the operator's unsaved work — is not «not found».
  if (isEditMode && !data) {
    return (
      <div className='flex flex-col items-center gap-4 py-20'>
        <Text variant='inactive' className='uppercase'>
          tech card not found
        </Text>
        <Button asChild variant='main' size='lg' className='uppercase'>
          <Link to={ROUTES.techCards}>← back to tech cards</Link>
        </Button>
      </div>
    );
  }

  return (
    // Staging is scoped to THIS card (phase 19): sub-panels hand their mutation to the header's one
    // save instead of firing it themselves. Keyed by route id so navigating between two cards starts
    // clean — two cards must never share a staging queue. A card created here keeps its key (above).
    <TechCardStagingProvider key={mount.current.key}>
      <div className='flex flex-col gap-6'>
        <TechCardForm
          isEditMode={isEditMode}
          id={id}
          techCard={data}
          onCreated={(created) => {
            handoff.current = String(created);
          }}
        />
        {numId ? <RelatedTasks techCardId={numId} /> : null}
      </div>
    </TechCardStagingProvider>
  );
}
