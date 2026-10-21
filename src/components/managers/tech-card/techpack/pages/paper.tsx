import { type ReactNode } from 'react';
import type { PrintOrient } from 'components/managers/print/scope';

export function Paper({
  orient,
  docline,
  children,
}: {
  orient: PrintOrient;
  docline: string;
  children: ReactNode;
}) {
  return (
    <div className='tp-sheet' data-orient={orient}>
      <div className='tp-docline'>{docline}</div>
      <div className='tp-body'>{children}</div>
      <div className='tp-count' data-page-count='' />
    </div>
  );
}
