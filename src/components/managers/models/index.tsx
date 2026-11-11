import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { ModelActionBar, ModelDim, ModelForm } from 'components/managers/model/components';
import { useModelPins, writePins } from 'components/managers/model/components/model-pins';
import { MeasurementUnitProvider } from 'components/managers/model/components/units';
import { ModelSession } from 'components/managers/model/page';
import { ROUTES, SECTION } from 'constants/routes';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { SkeletonBlocks, Text } from 'ui';
import {
  ALL,
  ModelPool,
  overlayOpen,
  PoolActive,
  PoolHead,
  PoolSearch,
} from './components/model-pool';
import { ModelTileOpen } from './components/model-tile-open';
import './models-pool.css';

/** The left area: from Lekalo's `--x0` to the panel. */
const LEFT = 'flex min-w-0 flex-1 flex-col pt-6 pr-8 pb-16 pl-[clamp(1.5rem,13vw,11.6875rem)]';
/** The panel: Lekalo's `--rp`, sticky on the right above the action bar; full width below 900px. */
const PANEL =
  'w-[min(32.9375rem,46vw)] shrink-0 self-start bg-bgColor px-block pb-16 motion-safe:animate-[models-open-r_1100ms_var(--ease-soft)_90ms_both] min-[56.25rem]:sticky min-[56.25rem]:top-26 min-[56.25rem]:max-h-[calc(100dvh-10rem)] min-[56.25rem]:origin-right min-[56.25rem]:overflow-y-auto max-[56.25rem]:w-full max-[56.25rem]:[--panel-sticky-offset:3.5rem] [overflow-anchor:none]';
/** While a card is open the left area gives way below 900px (Lekalo does the same). */
const LEFT_OPEN = `${LEFT} max-[56.25rem]:hidden`;

/**
 * `/models` — the pool; `/models/:id` — that card open (the active card on the left, the Model
 * Info panel on the right, the action bar at the bottom); `/add-model` — the new-model card open.
 * The route is the open card, so deep links, refresh and back keep working.
 *
 * LEAVING A DIRTY CARD IS HELD, NOT ASKED IN A MODAL. Back arrow, Esc, another card, the search
 * glass: the navigation waits in `pending` and the action bar asks «You have unsaved changes, what
 * to do?» — Save saves and goes on, Cancel discards and goes on.
 */
export function Models() {
  const { id } = useParams<{ id: string }>();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const canEdit = usePermissions().canWrite(SECTION.models);

  const parsed = id ? parseInt(id, 10) : NaN;
  const active: PoolActive =
    pathname === ROUTES.addModel ? 'new' : Number.isFinite(parsed) ? parsed : null;
  const activeKey = String(active);

  const [selected, setSelected] = useState<number | null>(
    typeof active === 'number' ? active : null,
  );
  const [gender, setGender] = useState(ALL);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const search: PoolSearch = { open: searchOpen, query, setOpen: setSearchOpen, setQuery };
  // Pinned values of the open model — the card shows them (local until the API has a field).
  const pins = useModelPins(activeKey);
  const dirty = useRef(false);
  const [pending, setPending] = useState<(() => void) | null>(null);

  useEffect(() => {
    if (typeof active === 'number') setSelected(active);
    setPending(null);
  }, [active]);

  const onDirtyChange = useCallback((d: boolean) => {
    dirty.current = d;
  }, []);

  // A dirty card holds the leave in `pending`; the action bar resolves it.
  const guard = useCallback((go: () => void) => {
    if (dirty.current) setPending(() => go);
    else go();
  }, []);

  const goTo = useCallback(
    (target: PoolActive) => {
      dirty.current = false;
      setPending(null);
      navigate(
        target === null ? ROUTES.models : target === 'new' ? ROUTES.addModel : `/models/${target}`,
        { replace: true },
      );
    },
    [navigate],
  );

  const open = useCallback(
    (target: number | 'new') => {
      if (target === active) return;
      guard(() => goTo(target));
    },
    [active, guard, goTo],
  );

  const back = useCallback(() => guard(() => goTo(null)), [guard, goTo]);

  const onCreated = useCallback(
    (newId: number | undefined) => {
      // The new model keeps the pins set while it was being created.
      if (newId) writePins(String(newId), pins.pinned);
      setSelected(newId ?? null);
      // A held leave goes on after the save; otherwise the new card becomes the open one
      // (no id back from AddModel: the pool without an open card).
      if (!pending) goTo(newId ?? null);
    },
    [goTo, pins.pinned, pending],
  );

  const onDeleted = useCallback(() => {
    setSelected(null);
    goTo(null);
  }, [goTo]);

  const onPoolDeleted = useCallback(
    (deletedId: number) => {
      if (selected === deletedId) setSelected(null);
    },
    [selected],
  );

  useEffect(() => {
    if (active === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const t = e.target;
      if (t instanceof HTMLElement && (t.isContentEditable || t.matches('input, textarea, select')))
        return;
      if (overlayOpen()) return;
      back();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [active, back]);

  const openTitle = active === 'new' ? 'New Model' : 'Model Info';
  // From an open card the glass goes back to the pool and opens the search there.
  const searchFromCard = () =>
    guard(() => {
      setSearchOpen(true);
      goTo(null);
    });
  const head = (
    <PoolHead title={openTitle} search={search} onSearch={searchFromCard} onBack={back} />
  );

  return (
    <MeasurementUnitProvider>
      <div className='models-screen flex min-h-[calc(100dvh-6.5rem)] items-stretch'>
        {active === null ? (
          <div className={LEFT}>
            <ModelPool
              selected={selected}
              canEdit={canEdit}
              gender={gender}
              onGenderChange={setGender}
              search={search}
              onSelect={setSelected}
              onOpen={open}
              onDeleted={onPoolDeleted}
            />
          </div>
        ) : (
          <ModelSession
            key={activeKey}
            id={active === 'new' ? undefined : active}
            pins={pins}
            onCreated={onCreated}
            onDeleted={onDeleted}
            onDirtyChange={onDirtyChange}
            fallback={(state) => (
              <>
                <div className={LEFT_OPEN}>{head}</div>
                <aside aria-label='model info' className={PANEL}>
                  {state === 'loading' ? (
                    <SkeletonBlocks count={4} className='py-4' />
                  ) : (
                    <Text className='py-4 text-placeholder'>model not found</Text>
                  )}
                </aside>
              </>
            )}
          >
            {(model) => (
              <>
                <ModelDim leaving={!!pending} className={LEFT_OPEN}>
                  {head}
                  <div className='mt-auto pt-6'>
                    <ModelTileOpen model={model} />
                  </div>
                </ModelDim>
                <aside aria-label='model info' className={PANEL}>
                  <ModelDim leaving={!!pending}>
                    <ModelForm />
                  </ModelDim>
                </aside>
                <ModelActionBar
                  leaving={!!pending}
                  onContinue={() => {
                    const go = pending;
                    dirty.current = false;
                    setPending(null);
                    go?.();
                  }}
                  onClose={() => goTo(null)}
                />
              </>
            )}
          </ModelSession>
        )}
      </div>
    </MeasurementUnitProvider>
  );
}
