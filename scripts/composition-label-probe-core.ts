// Точка входа пробы составника: ядро печати — ТОЛЬКО то, что было и до переделки (эта же точка
// собирается из блобов базового коммита, чтобы сравнить байты «до / после»).
export { adaptCareLabels } from '../src/components/managers/tech-card/care-labels/adapter';
export {
  buildPrintJob,
  compositionsOf,
  planAll,
} from '../src/components/managers/tech-card/care-labels/print-job';
export {
  filePdf,
  planPrint,
  sideSvg,
} from '../src/components/managers/tech-card/care-labels/pages';
export { collectReadiness } from '../src/components/managers/tech-card/care-labels/readiness';
export { shaperFromBytes } from '../src/components/managers/tech-card/care-labels/text-outline';
