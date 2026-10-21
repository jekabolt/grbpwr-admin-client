// THE TECH PACK (v6.1): ten sections on A4 sheets, in the order the workshop reads them.
//   00 cover · 01 materials · 02 cut pieces · 03 colourways · 04 patterns & marker · 05 labels ·
//   06 assembly · 07 step by step · 08 measurements · 09 QC
// Every page takes the same props (card, paper orientation, running head, section number) plus
// the data only it reads (geometry, size chart, markers) and renders its own `.tp-sheet`s
// (sheet.tsx). This file owns what spans pages:
//   - the one @page (PageFurniture) and the sheet CSS
//   - colourways and patterns sharing one sheet while both fit on it
//   - the page counter on screen («3 / 18»; print uses the @page counter)
//   - `[data-toc-page="NN"]` → the sheet a section starts on (a section starts on the sheet whose
//     header reads «NN …»), for the cover's contents
//   - `[data-xref="op"]` → «→ p.N», the step-by-step sheet that draws that join
//   - `[data-missing-summary]` → «! N · p3 p9», every red mark after the cover, for the cover
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { common_TechCard } from 'api/proto-http/admin';
import { furnitureLine, PageFurniture } from 'components/managers/print/page-furniture';
import type { PrintOrient } from 'components/managers/print/scope';
import { depStatus, type PrintDep } from 'components/managers/print/use-print-ready';
import { formatSizeName } from 'components/managers/product/utility/sizes';
import { useDictionary } from 'lib/providers/dictionary-provider';

import { deriveAssembly, type AssemblyModel } from './derive-assembly';
import { deriveLabels } from './derive-labels';
import { deriveMeasurementsPage } from './derive-measurements';
import { derivePieces } from './derive-pieces';
import type { QcSeamDelta } from './derive-qc';
import { AssemblyPage } from './pages/assembly';
import { ColourwaysContent, ColourwaysPage } from './pages/colourways';
import { CoverPage, type TechpackTocItem } from './pages/cover';
import { LabelsPage } from './pages/labels';
import { MaterialsPage } from './pages/materials';
import { MeasurementsPage } from './pages/measurements';
import { PatternsMarkerContent, PatternsMarkerPage } from './pages/patterns-marker';
import { PiecesPage } from './pages/pieces';
import { QcSignoffPage } from './pages/qc-signoff';
import { StepByStepPage } from './pages/step-by-step';
import { TECHPACK_SHEET_CSS, TechpackSheet } from './sheet';
import { useAssemblyGeometry } from './use-assembly-geometry';
import { useTechpackMarkerLayouts, useTechpackMeasurements } from './use-l3-data';

const SECTION_START = /^(\d\d)\s/;

const TOC: TechpackTocItem[] = [
  { n: '01', title: 'Materials & trims' },
  { n: '02', title: 'Cut pieces × material' },
  { n: '03', title: 'Colourways' },
  { n: '04', title: 'Patterns & marker' },
  { n: '05', title: 'Labels' },
  { n: '06', title: 'Assembly' },
  { n: '07', title: 'Step by step' },
  { n: '08', title: 'Measurements' },
  { n: '09', title: 'QC & sign-off' },
];

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
    // a sheet can open two short sections (colourways + patterns)
    for (const h of Array.from(sheet.querySelectorAll('h3'))) {
      const m = SECTION_START.exec(h.textContent?.trim() ?? '');
      if (m && !starts.has(m[1])) starts.set(m[1], i + 1);
    }
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
  // `data-missing="N"` counts N gaps (a table header summing its rows), a bare one counts one
  let marks = 0;
  const pages: number[] = [];
  sheets.forEach((sheet, i) => {
    if (i === 0) return;
    let here = 0;
    for (const el of Array.from(sheet.querySelectorAll<HTMLElement>('[data-missing]'))) {
      const weight = Number(el.dataset.missing);
      here += Number.isFinite(weight) && weight > 0 ? weight : 1;
    }
    if (here) {
      marks += here;
      pages.push(i + 1);
    }
  });
  const summary = marks ? `! ${marks} · ${pages.map((p) => `p${p}`).join(' ')}` : '';
  for (const el of Array.from(root.querySelectorAll('[data-missing-summary]'))) text(el, summary);
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('[data-missing-row]'))) {
    if (el.hidden !== !marks) el.hidden = !marks;
  }
}

/** The shared colourways + patterns sheet no longer fits: its body scrolls past the paper. */
function sharedSheetOverflows(root: HTMLElement): boolean {
  const body = root.querySelector('[data-shared-sheet]')?.closest<HTMLElement>('.tp-body');
  return !!body && body.scrollHeight > body.clientHeight + 1;
}

export function TechpackDocument({
  techCard,
  orient,
  revision,
  patternViewerToken,
  onDataStatus,
}: {
  techCard: common_TechCard;
  orient: PrintOrient;
  /** «rev.N» of a printed release snapshot; the live card prints its lock version. */
  revision?: string;
  /** The public pattern viewer token behind the pattern QR codes. */
  patternViewerToken?: string;
  onDataStatus?: (deps: PrintDep[]) => void;
}) {
  const ins = techCard.techCard;
  const { dictionary } = useDictionary();
  const sampleSize = (dictionary?.sizes ?? []).find(
    (s) => s.id != null && s.id === ins?.baseSampleSizeId,
  )?.name;
  const sampleSizeName = sampleSize ? formatSizeName(sampleSize) : '';
  const revisionLabel =
    revision ?? (techCard.lockVersion != null ? `rev ${techCard.lockVersion}` : '');
  const docline = furnitureLine(
    'tech pack',
    ins?.collection,
    ins?.name,
    sampleSizeName,
    revisionLabel,
    ins?.status,
  );

  const sizing = useTechpackMeasurements(techCard);
  const markers = useTechpackMarkerLayouts(techCard);
  const measurementRows = useMemo(
    () =>
      deriveMeasurementsPage({
        techCard,
        measurements: sizing.measurements,
        sizeChart: sizing.sizeChart,
        sizeNames: sizing.sizeNames,
      }).rows,
    [techCard, sizing.measurements, sizing.sizeChart, sizing.sizeNames],
  );

  const labelPlacement = useMemo(
    () => deriveLabels(techCard, { sampleSizeName }).placement.name,
    [techCard, sampleSizeName],
  );

  const geometry = useAssemblyGeometry(techCard);
  // the cut area the pieces page prints, for a fabric whose marker is not laid yet
  const netM2ByLine = useMemo(
    () =>
      Object.fromEntries(
        derivePieces(techCard, geometry.shapes)
          .groups.filter((group) => group.netAreaM2 > 0)
          .map((group) => [group.key, group.netAreaM2]),
      ),
    [techCard, geometry.shapes],
  );
  const model = useMemo<AssemblyModel | null>(() => {
    if (geometry.dep.status === 'pending') return null;
    try {
      return deriveAssembly({ techCard, pieces: geometry.pieces, grainDeg: geometry.grainDeg });
    } catch {
      // a pattern the engine cannot read still prints the operations, without drawings
      return deriveAssembly({ techCard, pieces: new Map(), grainDeg: new Map() });
    }
  }, [techCard, geometry.dep.status, geometry.pieces, geometry.grainDeg]);

  const seamDeltas = useMemo<QcSeamDelta[] | undefined>(() => {
    if (!model) return undefined;
    return Array.from(model.cards.values())
      .filter((card) => card.stop)
      .map((card) => ({ op: card.n, delta: card.metrics.find((m) => m.bad)?.delta ?? 0 }))
      .sort((a, b) => a.op - b.op);
  }, [model]);

  const [laidOut, setLaidOut] = useState(false);
  // one-way: once the two sections outgrow one sheet they stay on two
  const [split, setSplit] = useState(false);
  const { label: geoLabel, status: geoStatus } = geometry.dep;
  const layoutStatus = model && laidOut ? 'ok' : 'pending';
  const sizingStatus = depStatus(sizing.isLoading, sizing.isError);
  const markerStatus = depStatus(markers.isLoading, markers.isError);
  useEffect(() => {
    onDataStatus?.([
      { label: geoLabel, status: geoStatus },
      { label: 'assembly layout', status: layoutStatus },
      { label: 'size chart', status: sizingStatus },
      { label: 'marker layouts', status: markerStatus },
    ]);
  }, [geoLabel, geoStatus, layoutStatus, sizingStatus, markerStatus, onDataStatus]);

  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!split && root.current && sharedSheetOverflows(root.current)) setSplit(true);
  });
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    fillPageRefs(el);
    let frame = 0;
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (sharedSheetOverflows(el)) setSplit(true);
        fillPageRefs(el);
      });
    });
    observer.observe(el, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  const page = { techCard, orient, docline };
  const patterns = {
    techCard,
    orient,
    n: '04',
    markerLayouts: markers.markerLayouts,
    patternViewerToken,
    sizeNames: sizing.sizeNames,
    netM2ByLine,
  };
  return (
    <>
      <PageFurniture line={docline} orient={orient} />
      <style>{TECHPACK_SHEET_CSS}</style>
      <div ref={root} className='tp-doc'>
        <CoverPage
          {...page}
          n='00'
          toc={TOC}
          sampleSizeName={sampleSizeName}
          revisionLabel={revisionLabel}
        />
        <MaterialsPage {...page} n='01' />
        <PiecesPage {...page} n='02' geometry={geometry.shapes} />
        {split ? (
          <>
            <ColourwaysPage {...page} n='03' />
            <PatternsMarkerPage {...patterns} docline={docline} />
          </>
        ) : (
          <TechpackSheet orient={orient} docline={docline}>
            <div data-shared-sheet='' className='flex flex-col gap-6'>
              <ColourwaysContent techCard={techCard} n='03' />
              <PatternsMarkerContent {...patterns} layouts={false} />
            </div>
          </TechpackSheet>
        )}
        <LabelsPage {...page} n='05' sampleSizeName={sampleSizeName} />
        <AssemblyPage {...page} n='06' model={model} onLaidOut={setLaidOut} />
        <StepByStepPage {...page} n='07' model={model} />
        <MeasurementsPage
          {...page}
          n='08'
          measurements={sizing.measurements}
          sizeChart={sizing.sizeChart}
          sizeNames={sizing.sizeNames}
        />
        <QcSignoffPage
          {...page}
          n='09'
          measurementRows={measurementRows}
          sizeNames={sizing.sizeNames}
          seamDeltas={seamDeltas}
          labelPlacement={labelPlacement}
          revisionLabel={revisionLabel}
        />
      </div>
    </>
  );
}
