// Stand of tech pack page 05 with sewn-in labels: the REAL LabelsPage under the real sheet CSS and the
// real @page. The runner (tech-pack-sewn-labels-probe.mjs) feeds fixture cards and prints to PDF.
import type { common_TechCard } from 'api/proto-http/admin';
import { createRoot, type Root } from 'react-dom/client';

import { PageFurniture } from 'components/managers/print/page-furniture';
import type { PrintOrient } from 'components/managers/print/scope';
import { LabelsPage } from 'components/managers/tech-card/techpack/pages/labels';
import { TECHPACK_SHEET_CSS } from 'components/managers/tech-card/techpack/sheet';

type Mount = {
  card: common_TechCard;
  orient: PrintOrient;
  sizeNames: Record<number, string>;
};

declare global {
  interface Window {
    __sewn: { mount: (m: Mount) => void };
  }
}

let root: Root | null = null;
window.__sewn = {
  mount({ card, orient, sizeNames }) {
    root?.unmount();
    root = createRoot(document.getElementById('root')!);
    root.render(
      <>
        <PageFurniture line='probe' orient={orient} />
        <style>{TECHPACK_SHEET_CSS}</style>
        <div className='tp-doc'>
          <LabelsPage
            techCard={card}
            orient={orient}
            docline='probe'
            n='05'
            sizeNames={sizeNames}
          />
        </div>
      </>,
    );
  },
};
