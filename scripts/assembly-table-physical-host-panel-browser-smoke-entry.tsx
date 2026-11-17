import { createRoot } from 'react-dom/client';

import { CadWorkbenchPhysicalHostPanelV1 } from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/cad-workbench-physical-host-panel-v1';

function Stand() {
  return (
    <main
      className='flex h-[720px] min-h-0 w-[520px] flex-col overflow-hidden border border-borderColor bg-bgColor'
      data-physical-host-layout-smoke=''
    >
      <div className='min-h-0 flex-1 bg-pageBg p-4' data-physical-host-mannequin-viewport=''>
        Mannequin viewport
      </div>
      <CadWorkbenchPhysicalHostPanelV1>
        <section className='flex min-h-[900px] flex-col gap-3' data-authoring-open=''>
          <h1>Observed cloth authoring</h1>
          <button type='button'>Load current placement</button>
          <div className='flex-1'>Physical placement, pins, rollback and strain controls</div>
          <button type='button' data-physical-host-bottom-action=''>
            Save physical placement
          </button>
        </section>
      </CadWorkbenchPhysicalHostPanelV1>
    </main>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Physical-host panel smoke root is missing.');
createRoot(root).render(<Stand />);
