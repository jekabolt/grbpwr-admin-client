import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { Button, HeaderNote, Section, ViewSwitch, type ViewSwitchOption } from 'ui';
import { shownStep, useActiveStep, useActiveStepStore } from './active-step';
import { StepView } from './step-view';
import { useMapModel } from './use-map-model';
import { DollDoor } from '../assembly-doll/doll-column';
import { openDoll } from '../assembly-doll/doll-store';

export type MapView = 'step' | 'sketch';

const CORE_VIEWS = [
  { value: 'step', label: 'step' },
] as const satisfies readonly ViewSwitchOption<MapView>[];

const SKETCH_VIEW = {
  value: 'sketch',
  label: 'sketch',
} as const satisfies ViewSwitchOption<MapView>;

// Выбор вида — ПРЕЗЕНТАЦИЯ, а не данные карточки: localStorage на карточку, форма не грязнеет.
const viewKey = (id: string | undefined) => `plm.techcard.assembly-map.view.${id ?? 'new'}`;
function readView(id: string | undefined, hasSketch: boolean): MapView {
  try {
    const v = localStorage.getItem(viewKey(id));
    if (v === 'sketch' && hasSketch) return v;
    return 'step';
  } catch {
    return 'step';
  }
}

// `action` — орган в шапке блока: шеврон, сворачивающий колонку карты (construction-tab).
export function AssemblyMap({
  sketch,
  hasSketch,
  action,
}: {
  sketch: ReactNode;
  hasSketch: boolean;
  action?: ReactNode;
}) {
  const { id } = useParams<{ id: string }>();
  const [view, setView] = useState<MapView>(() => readView(id, hasSketch));
  useEffect(() => {
    try {
      localStorage.setItem(viewKey(id), view);
    } catch {
      /* private mode: the choice lives for the session */
    }
  }, [id, view]);
  useEffect(() => {
    if (view === 'sketch' && !hasSketch) setView('step');
  }, [hasSketch, view]);
  const model = useMapModel();
  const snap = useActiveStep();
  const store = useActiveStepStore();
  const shownView = view === 'sketch' && !hasSketch ? 'step' : view;

  const count = model.ops.length;
  const index = shownStep(snap, count, model.firstMachine);
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.defaultPrevented || shownView === 'sketch' || count === 0) return;
    const t = e.target as HTMLElement;
    if (t.closest('a, button, input, textarea, select, [role="radiogroup"]')) return;
    const step = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const from = snap.open ?? index ?? -1;
    store?.pick(Math.max(0, Math.min(count - 1, from + step)));
  };
  const views: readonly ViewSwitchOption<MapView>[] = hasSketch
    ? [...CORE_VIEWS, SKETCH_VIEW]
    : CORE_VIEWS;

  // The doll mounts beside the map, not inside it: its dialog is portalled, but React events still
  // bubble to the map's arrow-key handler, which would walk the steps under the open doll.
  return (
    <>
      <div
        data-assembly-map={shownView}
        tabIndex={0}
        onKeyDown={onKeyDown}
        aria-label='assembly map'
        className='focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-textColor'
      >
        <Section
          title='assembly map'
          action={
            <>
              {model.unsewnPieceCount > 0 && (
                <HeaderNote tone='warn'>! {model.unsewnPieceCount}</HeaderNote>
              )}
              <ViewSwitch<MapView>
                quiet
                label='assembly map view'
                value={shownView}
                onChange={setView}
                options={views}
              />
              <Button type='button' variant='underline' size='xs' onClick={openDoll}>
                3d
              </Button>
              {action}
            </>
          }
        >
          {shownView === 'step' ? (
            index != null ? (
              <StepView model={model} index={index} />
            ) : null
          ) : (
            sketch
          )}
        </Section>
      </div>
      <DollDoor />
    </>
  );
}
