// Точка входа пробы «назад к сетке» (C-05, G-01): НАСТОЯЩИЕ писатели адреса под настоящим
// BrowserRouter — `useWorkflowAddress` (экран PLAYGROUND), `useStepAddress` (ячейки рельса) и
// `useLegacyStepRewrite` (старый `?step=aside`), ровно те, что зовёт `studio-tab.tsx`. Экран здесь —
// кнопки и строка адреса: проба меряет, КАК движется история браузера, а не то, как нарисована
// сетка (это держит playground-registry-probe).
import { legacyStep } from 'components/managers/tech-card/components/design/core/chain';
import {
  useLegacyStepRewrite,
  useStepAddress,
  useWorkflowAddress,
} from 'components/managers/tech-card/components/design/playground/address';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, useSearchParams } from 'react-router-dom';

function Harness() {
  const { asked, setWf, openFromGrid, backToGrid } = useWorkflowAddress();
  const goStep = useStepAddress();
  const [params, setParams] = useSearchParams();
  const step = params.get('step');
  const legacy = legacyStep(step);
  useLegacyStepRewrite(legacy);
  return (
    <div>
      <output id='wf'>{asked || 'grid'}</output>
      <output id='step'>{legacy ? legacy.step : step}</output>
      <button id='open' onClick={() => openFromGrid('change_color')}>
        open from the grid
      </button>
      <button id='back' onClick={backToGrid}>
        |→
      </button>
      <button id='recall' onClick={() => setWf('create_edit')}>
        recall
      </button>
      {/* The rail: a real step change, and a press on the cell already open. */}
      <button id='rail-flat' onClick={() => goStep('flat')}>
        flat
      </button>
      <button id='rail-playground' onClick={() => goStep('playground')}>
        playground
      </button>
      {/* Another writer of the address that replaces (a colourway deep link). */}
      <button
        id='other'
        onClick={() =>
          setParams(
            (prev) => {
              const p = new URLSearchParams(prev);
              p.set('colorway', '7');
              return p;
            },
            { replace: true },
          )
        }
      >
        other writer
      </button>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <Harness />
  </BrowserRouter>,
);
