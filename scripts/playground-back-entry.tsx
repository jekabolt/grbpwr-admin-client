// Точка входа пробы «история браузера на PLAYGROUND» (C-05, G-01 r2): НАСТОЯЩИЕ писатели адреса
// под настоящим BrowserRouter в StrictMode — `useWorkflowAddress` (экран PLAYGROUND),
// `useStepAddress` (ячейки рельса) и `useLegacyStepRewrite` (старый `?step=aside`), ровно те, что
// зовут `studio.tsx` и `studio-tab.tsx`, плюс вкладка карточки так, как её пишет `navTo`
// (tech-card/components/index.tsx). Экран здесь — кнопки и строка адреса: проба меряет, КАК движется
// история браузера, а не то, как нарисована сетка (это держит playground-registry-probe).
import { legacyStep } from 'components/managers/tech-card/components/design/core/chain';
import {
  useLegacyStepRewrite,
  useStepAddress,
  useWorkflowAddress,
} from 'components/managers/tech-card/components/design/playground/address';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, useSearchParams } from 'react-router-dom';

function Harness() {
  const { asked, setWf } = useWorkflowAddress();
  const goStep = useStepAddress();
  const [params, setParams] = useSearchParams();
  const step = params.get('step');
  const legacy = legacyStep(step);
  useLegacyStepRewrite(legacy);
  return (
    <div>
      <output id='wf'>{asked || 'grid'}</output>
      <output id='step'>{legacy ? legacy.step : step}</output>
      <output id='tab'>{params.get('tab')}</output>
      {/* What the studio wires: a grid tile → setWf(key), |→ → setWf(null), a recall → setWf(key). */}
      <button id='open' onClick={() => setWf('change_color')}>
        open from the grid
      </button>
      <button id='back' onClick={() => setWf(null)}>
        |→
      </button>
      <button id='recall' onClick={() => setWf('create_edit')}>
        recall
      </button>
      {/* The rail: a real step change, a second one, and a press on the cell already open. */}
      <button id='rail-flat' onClick={() => goStep('flat')}>
        flat
      </button>
      <button id='rail-render' onClick={() => goStep('render')}>
        render
      </button>
      <button id='rail-playground' onClick={() => goStep('playground')}>
        playground
      </button>
      {/* A top-level card tab, written as `navTo` writes it: replace, other params kept. */}
      <button
        id='tab-artifacts'
        onClick={() =>
          setParams(
            (prev) => {
              const p = new URLSearchParams(prev);
              p.set('tab', 'artifacts');
              return p;
            },
            { replace: true },
          )
        }
      >
        artifacts
      </button>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Harness />
    </BrowserRouter>
  </StrictMode>,
);
