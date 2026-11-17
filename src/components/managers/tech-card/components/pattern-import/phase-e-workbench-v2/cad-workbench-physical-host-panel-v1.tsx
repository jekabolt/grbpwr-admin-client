import type { ReactNode } from 'react';

/** Keeps the physical authoring controls scrollable without collapsing the displayed mannequin. */
export function CadWorkbenchPhysicalHostPanelV1({ children }: { children: ReactNode }) {
  return (
    <div
      className='min-h-0 max-h-[50%] shrink-0 overflow-y-auto border-t border-borderColor p-2'
      data-cad-physical-host-panel=''
    >
      {children}
    </div>
  );
}
