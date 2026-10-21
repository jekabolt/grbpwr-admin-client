// THE TECH PACK (v6.1): ten sections on A4 sheets, in the order the workshop reads them.
//   00 cover · 01 materials · 02 cut pieces · 03 colourways · 04 patterns & marker · 05 labels ·
//   06 assembly · 07 step by step · 08 measurements · 09 QC
// Every page takes the same props (card, paper orientation, running head, section number) and
// renders its own `.tp-sheet`s (sheet.tsx). This file owns what spans pages:
//   - the one @page (PageFurniture) and the sheet CSS
//   - the page counter on screen («3 / 18»; print uses the @page counter)
//   - `[data-toc-page="NN"]` → the sheet a section starts on (a section starts on the sheet whose
//     header reads «NN …»), for the cover's contents
//   - `[data-xref="op"]` → «→ p.N», the step-by-step sheet that draws that join
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { common_TechCard } from 'api/proto-http/admin';
import { furnitureLine, PageFurniture } from 'components/managers/print/page-furniture';
import type { PrintOrient } from 'components/managers/print/scope';
import type { PrintDep } from 'components/managers/print/use-print-ready';
import { formatSizeName } from 'components/managers/product/utility/sizes';
import { useDictionary } from 'lib/providers/dictionary-provider';

import { deriveAssembly, type AssemblyModel } from './derive-assembly';
import { AssemblyPage } from './pages/assembly';
import { ColourwaysPage } from './pages/colourways';
import { CoverPage } from './pages/cover';
import { LabelsPage } from './pages/labels';
import { MaterialsPage } from './pages/materials';
import { MeasurementsPage } from './pages/measurements';
import { PatternsPage } from './pages/patterns';
import { PiecesPage } from './pages/pieces';
import { QcPage } from './pages/qc';
import { StepByStepPage } from './pages/step-by-step';
import { TECHPACK_SHEET_CSS } from './sheet';
import { useAssemblyGeometry } from './use-assembly-geometry';

const SECTION_START = /^(\d\d)\s/;

function text(el: Element, value: string) {
  if (el.textContent !== value) el.textContent = value;
}

/** Page numbers, contents and cross references, read from the laid-out sheets. */
function fillPageRefs(root: HTMLElement) {
  const sheets = Array.from(root.querySelectorAll<HTMLElement>('.tp-sheet'));
  const total = sheets.length;
  const starts = new Map<string, number>();
  sheets.forEach((sheet, i) => {
    const count = sheet.querySelector('.tp-count');
    if (count) text(count, `${i + 1} / ${total}`);
    const head = sheet.querySelector('h3')?.textContent?.trim() ?? '';
    const m = SECTION_START.exec(head);
    if (m && !starts.has(m[1])) starts.set(m[1], i + 1);
  });
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('[data-toc-page]'))) {
    const p = starts.get(el.dataset.tocPage ?? '');
    text(el, p ? String(p) : '');
  }
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('[data-xref]'))) {
    const op = el.dataset.xref ?? '';
    const at = sheets.findIndex((s) => s.querySelector(`[data-card~="${CSS.escape(op)}"]`));
    text(el, at >= 0 ? `→ p.${at + 1}` : '');
  }
}

export function TechpackDocument({
  techCard,
  orient,
  revision,
  onDataStatus,
}: {
  techCard: common_TechCard;
  orient: PrintOrient;
  /** «rev.N» of a printed release snapshot; the live card prints its lock version. */
  revision?: string;
  onDataStatus?: (deps: PrintDep[]) => void;
}) {
  const ins = techCard.techCard;
  const { dictionary } = useDictionary();
  const sampleSize = (dictionary?.sizes ?? []).find(
    (s) => s.id != null && s.id === ins?.baseSampleSizeId,
  )?.name;
  const docline = furnitureLine(
    'tech pack',
    ins?.collection,
    ins?.name,
    sampleSize ? formatSizeName(sampleSize) : '',
    revision ?? (techCard.lockVersion != null ? `rev ${techCard.lockVersion}` : ''),
    ins?.status,
  );

  const geometry = useAssemblyGeometry(techCard);
  const model = useMemo<AssemblyModel | null>(() => {
    if (geometry.dep.status === 'pending') return null;
    try {
      return deriveAssembly({ techCard, pieces: geometry.pieces, grainDeg: geometry.grainDeg });
    } catch {
      // a pattern the engine cannot read still prints the operations, without drawings
      return deriveAssembly({ techCard, pieces: new Map(), grainDeg: new Map() });
    }
  }, [techCard, geometry.dep.status, geometry.pieces, geometry.grainDeg]);

  const [laidOut, setLaidOut] = useState(false);
  const { label: geoLabel, status: geoStatus } = geometry.dep;
  const layoutStatus = model && laidOut ? 'ok' : 'pending';
  useEffect(() => {
    onDataStatus?.([
      { label: geoLabel, status: geoStatus },
      { label: 'assembly layout', status: layoutStatus },
    ]);
  }, [geoLabel, geoStatus, layoutStatus, onDataStatus]);

  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    fillPageRefs(el);
    let frame = 0;
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => fillPageRefs(el));
    });
    observer.observe(el, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  const page = { techCard, orient, docline };
  return (
    <>
      <PageFurniture line={docline} orient={orient} />
      <style>{TECHPACK_SHEET_CSS}</style>
      <div ref={root} className='tp-doc'>
        <CoverPage {...page} n='00' />
        <MaterialsPage {...page} n='01' />
        <PiecesPage {...page} n='02' />
        <ColourwaysPage {...page} n='03' />
        <PatternsPage {...page} n='04' />
        <LabelsPage {...page} n='05' />
        <AssemblyPage {...page} n='06' model={model} onLaidOut={setLaidOut} />
        <StepByStepPage {...page} n='07' model={model} />
        <MeasurementsPage {...page} n='08' />
        <QcPage {...page} n='09' />
      </div>
    </>
  );
}
