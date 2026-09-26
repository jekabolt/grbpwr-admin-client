// Точка входа пробы «назад к сетке» (C-05): НАСТОЯЩИЙ `useWorkflowAddress` под настоящим
// BrowserRouter. Экран здесь — три кнопки и строка адреса: проба меряет, КАК движется история
// браузера, а не то, как нарисована сетка (это держит playground-registry-probe).
import { useWorkflowAddress } from 'components/managers/tech-card/components/design/playground/address';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, useSearchParams } from 'react-router-dom';

function Harness() {
  const { asked, setWf, openFromGrid, backToGrid } = useWorkflowAddress();
  const [, setParams] = useSearchParams();
  return (
    <div>
      <output id='wf'>{asked || 'grid'}</output>
      <button id='open' onClick={() => openFromGrid('change_color')}>
        open from the grid
      </button>
      <button id='back' onClick={backToGrid}>
        |→
      </button>
      <button id='recall' onClick={() => setWf('create_edit')}>
        recall
      </button>
      {/* Another writer of the address that replaces (the rail, a colourway deep link). */}
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
