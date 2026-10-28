// THE STEP'S WORDS IN THE PICKER HEADER — the same composed heading the rows and the rail show
// («join / seam · armhole»), never the work token itself. Pieces are left off: the canvas shows
// them, and the header holds 1–3 words.

import type {
  common_TechCardGarmentZone,
  common_TechCardMachineType,
  common_TechCardOperationType,
} from 'api/proto-http/admin';
import { operationHeading } from '../operation-options';
import type { WorkCatalog } from '../operation-work';

export type StepWordsOp = {
  operationType?: string;
  machineType?: string;
  zone?: string;
  seamClass?: string;
  topstitchMode?: string;
  work?: string;
};

export function stepWords(op: StepWordsOp | undefined, catalog: WorkCatalog | undefined): string {
  if (!op) return '';
  const words = operationHeading({
    operationType: op.operationType as common_TechCardOperationType | undefined,
    machineType: op.machineType as common_TechCardMachineType | undefined,
    zone: op.zone as common_TechCardGarmentZone | undefined,
    seamClass: op.seamClass,
    topstitchMode: op.topstitchMode,
    work: op.work,
    workCatalog: catalog,
    pieceNames: [],
  });
  return words === 'step' ? '' : words;
}
