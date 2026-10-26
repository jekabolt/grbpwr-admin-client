import type {
  common_TechCardInsert,
  common_TechCardOperation,
  common_TechCardOperationFastening,
} from 'api/proto-http/admin';
import type { OpIconCard, OpIconInput } from './op-icon';

/** Fields the next proto bump adds to the operation; read only through `pending` below. */
type OpWithIconFields = common_TechCardOperation & {
  seamKind?: string;
  workVariant?: string;
  fastening?: common_TechCardOperationFastening & { buttonHoles?: number };
};

// typed after proto bump
const pending = (o: common_TechCardOperation) => o as OpWithIconFields;

const SEAM_CLASS_UNSET = 'TECH_CARD_SEAM_CLASS_UNKNOWN';

/** The operation as the icon registry reads it; values are the API strings verbatim. */
export function opIconInputOf(o: common_TechCardOperation): OpIconInput {
  const next = pending(o);
  return {
    work: o.work,
    workVariant: next.workVariant,
    seamKind: next.seamKind,
    seamClass: o.seamClass,
    // unset seam class = inherited from the card, never stored on the step
    seamClassExplicit: !!o.seamClass && o.seamClass !== SEAM_CLASS_UNSET,
    bindingStyle: o.stitching?.bindingStyle,
    machineType: o.machineType,
    verb: o.operationType,
    pressAction: o.press?.action,
    pressToward: o.press?.toward,
    pressEquipment: o.pressEquipment,
    pressCloth: o.pressCloth,
    topstitchMode: o.topstitch?.mode,
    topstitchRows: o.topstitch?.rows,
    needleCount: o.stitching?.needleCount,
    attachPattern: o.fastening?.attachPattern,
    buttonHoles: next.fastening?.buttonHoles,
    attachMethod: o.hardware?.attachMethod,
    zipperApplication: o.fastening?.zipperApplication,
    buttonholeStyle: o.fastening?.buttonholeStyle,
    trimAction: o.trim?.action,
    printMethod: o.printMethod,
  };
}

/** The card-level icon context: the construction's default seam class. */
export function opIconCardOf(card: common_TechCardInsert | undefined): OpIconCard {
  return { defaultSeamClass: card?.construction?.defaultSeamClass };
}
