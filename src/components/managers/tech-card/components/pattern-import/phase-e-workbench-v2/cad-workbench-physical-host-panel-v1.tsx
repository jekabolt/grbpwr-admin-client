import type { ReactNode } from 'react';

/** Positions the compact physical controls over the mannequin without consuming viewport height. */
export function CadWorkbenchPhysicalHostPanelV1({ children }: { children: ReactNode }) {
  return (
    <div
      className='pointer-events-none absolute inset-0 z-20 overflow-hidden'
      data-cad-physical-host-viewport-layer=''
    >
      {children}
    </div>
  );
}
